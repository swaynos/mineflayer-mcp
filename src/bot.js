// src/bot.js
// Mineflayer wrapper owning connection lifecycle and readiness gates.
// No auto-reconnect. Systemd (or the parent process) owns restart policy.

import mineflayer from "mineflayer";
import { McpError, ErrorCodes, normalizeError } from "./errors.js";
import { logger } from "./logger.js";

const INTENTIONAL_END_PATTERNS = [
  /logged in from another location/i,
  /duplicate_login/i,
];

function formatReason(reason) {
  if (reason == null) return "";
  if (typeof reason === "string") return reason;
  try {
    return JSON.stringify(reason);
  } catch {
    try { return String(reason); } catch { return "[unserializable]"; }
  }
}

export class Bot {
  constructor({ host, port, username, version }) {
    if (!host) throw new McpError(ErrorCodes.SERVER_STARTUP, "Bot: missing host");
    if (!port) throw new McpError(ErrorCodes.SERVER_STARTUP, "Bot: missing port");
    if (!username) throw new McpError(ErrorCodes.SERVER_STARTUP, "Bot: missing username");
    this._host = host;
    this._port = Number(port);
    this._username = username;
    this._version = version ?? false; // mineflayer auto-detects when falsy
    /** @type {import("mineflayer").Bot | null} */
    this._bot = null;
    this._spawned = false;
    this._disconnected = false;
    this._disconnectReason = null;
    this._endListeners = new Set();
    this._mcData = null;

    // Chat ring buffer — capped at 100 entries.
    // Each entry: { timestamp: number (ms), username: string|null, message: string, type: string }
    this._chatBuffer = [];
    this._chatBufferMax = 100;
  }

  isSpawned() {
    return this._spawned && !this._disconnected;
  }

  /**
   * Register a callback invoked once when the bot ends/kicks/errors out.
   * Receives `{ reason, intentional }`.
   */
  onEnd(cb) {
    if (typeof cb === "function") this._endListeners.add(cb);
    return () => this._endListeners.delete(cb);
  }

  _emitEnd(reason) {
    if (this._endListeners.size === 0) return;
    const reasonStr = formatReason(reason);
    const intentional = INTENTIONAL_END_PATTERNS.some((p) => p.test(reasonStr));
    for (const cb of Array.from(this._endListeners)) {
      try {
        cb({ reason: reasonStr || null, intentional });
      } catch (err) {
        logger.warn("bot.endListener.threw", { err: String(err) });
      }
    }
    this._endListeners.clear();
  }

  async connect() {
    if (this._bot) {
      throw new McpError(ErrorCodes.SERVER_STARTUP, "Bot already initialized");
    }
    logger.info("bot.connecting", {
      host: this._host,
      port: this._port,
      username: this._username,
    });

    const bot = mineflayer.createBot({
      host: this._host,
      port: this._port,
      username: this._username,
      version: this._version,
      auth: "offline",
      checkTimeoutInterval: 30_000,
      hideErrors: false,
    });
    this._bot = bot;

    return await new Promise((resolve, reject) => {
      let settled = false;
      const settleResolve = () => {
        if (settled) return;
        settled = true;
        // Detach pre-spawn listeners (error/end) — keep long-lived ones installed below.
        bot.removeListener("error", onEarlyError);
        bot.removeListener("end", onEarlyEnd);
        bot.removeListener("kicked", onEarlyKick);
        resolve();
      };
      const settleReject = (err) => {
        if (settled) return;
        settled = true;
        bot.removeListener("error", onEarlyError);
        bot.removeListener("end", onEarlyEnd);
        bot.removeListener("kicked", onEarlyKick);
        try { bot.end(); } catch { /* ignore */ }
        this._bot = null;
        reject(err);
      };

      const onEarlyError = (err) => {
        logger.error("bot.error.preSpawn", { err: String(err?.message ?? err) });
        settleReject(
          new McpError(
            ErrorCodes.SERVER_STARTUP,
            `Failed to connect to Minecraft ${this._host}:${this._port}: ${err?.message ?? String(err)}`,
            { cause: String(err?.message ?? err) }
          )
        );
      };
      const onEarlyEnd = (reason) => {
        logger.error("bot.end.preSpawn", { reason: String(reason ?? "") });
        settleReject(
          new McpError(
            ErrorCodes.SERVER_STARTUP,
            `Minecraft session ended before spawn (reason=${reason ?? "unknown"})`,
            { reason: reason ?? null }
          )
        );
      };
      const onEarlyKick = (reason) => {
        logger.error("bot.kicked.preSpawn", { reason: String(reason ?? "") });
        settleReject(
          new McpError(
            ErrorCodes.SERVER_STARTUP,
            `Minecraft server kicked the bot before spawn (reason=${reason ?? "unknown"})`,
            { reason: reason ?? null }
          )
        );
      };

      bot.once("error", onEarlyError);
      bot.once("end", onEarlyEnd);
      bot.once("kicked", onEarlyKick);

      bot.once("spawn", () => {
        this._spawned = true;
        try {
          // minecraft-data is available via require; lazy-load per version
          const mcDataModule = bot.registry || null;
          this._mcData = mcDataModule;
        } catch {
          this._mcData = null;
        }
        const pos = bot.entity?.position;
        logger.info("bot.spawned", {
          x: pos?.x,
          y: pos?.y,
          z: pos?.z,
          dim: bot.game?.dimension ?? null,
          version: bot.version,
        });

        // Install post-spawn long-lived listeners.
        bot.on("error", (err) => {
          logger.error("bot.error", { err: String(err?.message ?? err) });
        });
        bot.on("kicked", (reason) => {
          this._disconnected = true;
          this._disconnectReason = formatReason(reason);
          logger.warn("bot.kicked", { reason: this._disconnectReason });
          this._emitEnd(this._disconnectReason);
        });
        bot.on("end", (reason) => {
          this._disconnected = true;
          this._disconnectReason = this._disconnectReason ?? formatReason(reason);
          logger.warn("bot.ended", { reason: this._disconnectReason });
          this._emitEnd(this._disconnectReason);
        });

        // Chat buffer — capture all incoming messages via the `message` event.
        // On vanilla 1.21.1, `message` fires for all chat/system text;
        // `chat` and `messageStr` do NOT fire reliably on this version.
        bot.on("message", (chatMsg, position) => {
          const str = chatMsg.toString();
          let username = null;
          let message = str;
          // Parse vanilla chat format: "<username> text"
          const m = str.match(/^<([^>]+)>\s(.+)$/);
          if (m) {
            username = m[1];
            message = m[2];
          }
          this._pushChatEntry({
            timestamp: Date.now(),
            username,
            message,
            type: position === "chat" ? "chat" : "system",
          });
        });

        settleResolve();
      });
    });
  }

  _assertSpawned() {
    if (!this._bot || this._disconnected) {
      throw new McpError(
        ErrorCodes.BOT_NOT_READY,
        `Bot not spawned yet (connected=${!!this._bot && !this._disconnected}, spawned=${this._spawned})`,
        { disconnectReason: this._disconnectReason }
      );
    }
    if (!this._spawned) {
      throw new McpError(
        ErrorCodes.BOT_NOT_READY,
        `Bot not spawned yet (connected=${!!this._bot}, spawned=false)`
      );
    }
  }

  async chat(message) {
    if (typeof message !== "string" || message.length === 0) {
      throw new McpError(ErrorCodes.INVALID_PARAMS, "chat: message must be a non-empty string");
    }
    if (!this._bot || this._disconnected) {
      throw new McpError(
        ErrorCodes.BOT_NOT_READY,
        `Bot not connected (disconnected=${this._disconnected})`,
        { disconnectReason: this._disconnectReason }
      );
    }
    try {
      this._bot.chat(message);
      // Buffer outgoing messages too — mineflayer only fires chat/messageStr for
      // incoming server messages, so we push outgoing ones manually.
      this._pushChatEntry({
        timestamp: Date.now(),
        username: this._username,
        message,
        type: "outgoing",
      });
      return { sent: message };
    } catch (err) {
      const n = normalizeError(err, "Minecraft: chat failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  async getPosition() {
    this._assertSpawned();
    const bot = this._bot;
    try {
      const pos = bot.entity?.position;
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) {
        throw new McpError(
          ErrorCodes.INTERNAL,
          "Minecraft: getPosition failed: bot.entity.position not ready"
        );
      }
      return {
        x: pos.x,
        y: pos.y,
        z: pos.z,
        dimension: bot.game?.dimension ?? null,
        yaw: typeof bot.entity.yaw === "number" ? bot.entity.yaw : null,
        pitch: typeof bot.entity.pitch === "number" ? bot.entity.pitch : null,
      };
    } catch (err) {
      if (err instanceof McpError) throw err;
      const n = normalizeError(err, "Minecraft: getPosition failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  async _waitForChunksAround(maxMs = 2000) {
    const bot = this._bot;
    const pos = bot.entity?.position;
    if (!pos) return false;
    const baseChunkX = Math.floor(pos.x / 16);
    const baseChunkZ = Math.floor(pos.z / 16);
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      let allLoaded = true;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          try {
            const col = bot.world?.getColumn?.((baseChunkX + dx), (baseChunkZ + dz));
            if (!col) {
              allLoaded = false;
            }
          } catch {
            allLoaded = false;
          }
        }
      }
      if (allLoaded) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  }

  _resolveBlockIds(names) {
    const bot = this._bot;
    const reg = bot.registry;
    if (!reg || !reg.blocksByName) return { ids: [], unresolved: names.slice() };
    const ids = [];
    const unresolved = [];
    for (const raw of names) {
      const name = String(raw).replace(/^minecraft:/, "");
      const block = reg.blocksByName[name];
      if (block && Number.isInteger(block.id)) {
        ids.push(block.id);
      } else {
        unresolved.push(raw);
      }
    }
    return { ids, unresolved };
  }

  async findBlocks({ blockTypes, maxDistance = 16, maxCount = 4 }) {
    this._assertSpawned();
    const bot = this._bot;
    if (!Array.isArray(blockTypes) || blockTypes.length === 0) {
      throw new McpError(ErrorCodes.INVALID_PARAMS, "find_blocks: blockTypes must be a non-empty array");
    }

    const loaded = await this._waitForChunksAround(2000);
    if (!loaded) {
      logger.warn("bot.findBlocks.chunksNotLoaded", { returning: "empty" });
      return [];
    }

    const { ids, unresolved } = this._resolveBlockIds(blockTypes);
    if (ids.length === 0) {
      logger.warn("bot.findBlocks.noKnownBlockTypes", { blockTypes, unresolved });
      return [];
    }

    try {
      const positions = bot.findBlocks({
        matching: ids,
        maxDistance: Math.max(1, Math.min(64, Number(maxDistance) || 16)),
        count: Math.max(1, Math.min(32, Number(maxCount) || 4)),
      });
      const origin = bot.entity.position;
      const out = [];
      for (const p of positions) {
        let name = null;
        try {
          const block = bot.blockAt(p);
          name = block?.name ?? null;
        } catch {
          name = null;
        }
        const dx = p.x - origin.x;
        const dy = p.y - origin.y;
        const dz = p.z - origin.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        out.push({
          name,
          position: { x: p.x, y: p.y, z: p.z },
          distance: Number(distance.toFixed(3)),
        });
      }
      return out;
    } catch (err) {
      const n = normalizeError(err, "Minecraft: find_blocks failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  async inspectInventory() {
    this._assertSpawned();
    const bot = this._bot;
    try {
      const inv = bot.inventory;
      if (!inv || !Array.isArray(inv.slots)) return [];
      const out = [];
      for (let i = 0; i < inv.slots.length; i++) {
        const item = inv.slots[i];
        if (!item) continue;
        out.push({
          name: item.name ?? null,
          count: typeof item.count === "number" ? item.count : null,
          slot: i,
          displayName: item.displayName ?? null,
        });
      }
      return out;
    } catch (err) {
      const n = normalizeError(err, "Minecraft: inspect_inventory failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  _pushChatEntry(entry) {
    this._chatBuffer.push(entry);
    // Keep the ring buffer capped.
    if (this._chatBuffer.length > this._chatBufferMax) {
      this._chatBuffer.shift();
    }
  }

  /**
   * Return buffered chat entries since `sinceMs` (epoch ms), up to `limit`.
   *
   * @param {{ since?: number, limit?: number }} opts
   * @returns {Array<{ timestamp: number, username: string|null, message: string, type: string }>}
   */
  readRecentChat({ since = 0, limit = 50 } = {}) {
    this._assertSpawned();
    const sinceMs = Number(since) || 0;
    const limitN = Math.max(1, Math.min(100, Number(limit) || 50));
    const filtered = this._chatBuffer.filter((e) => e.timestamp > sinceMs);
    return filtered.slice(-limitN);
  }

  disconnect() {
    this._disconnected = true;
    if (this._bot) {
      try {
        this._bot.quit?.("shutdown");
      } catch { /* ignore */ }
      try {
        this._bot.end?.();
      } catch { /* ignore */ }
    }
  }
}

export default Bot;
