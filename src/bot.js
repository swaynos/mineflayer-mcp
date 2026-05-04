// src/bot.js
// Mineflayer wrapper owning connection lifecycle and readiness gates.
// No auto-reconnect. Systemd (or the parent process) owns restart policy.

import mineflayer from "mineflayer";
import pkg from "mineflayer-pathfinder";
const { pathfinder, Movements, goals } = pkg;
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
  constructor({ host, port, username, version, safeMode = true }) {
    if (!host) throw new McpError(ErrorCodes.SERVER_STARTUP, "Bot: missing host");
    if (!port) throw new McpError(ErrorCodes.SERVER_STARTUP, "Bot: missing port");
    if (!username) throw new McpError(ErrorCodes.SERVER_STARTUP, "Bot: missing username");
    this._host = host;
    this._port = Number(port);
    this._username = username;
    this._version = version ?? false;
    this._safeMode = Boolean(safeMode);
    /** @type {import("mineflayer").Bot | null} */
    this._bot = null;
    this._spawned = false;
    this._disconnected = false;
    this._disconnectReason = null;
    this._endListeners = new Set();
    this._mcData = null;

    // Chat ring buffer — capped at 100 entries.
    this._chatBuffer = [];
    this._chatBufferMax = 100;

    // Safety state
    this._safetyInterval = null;
    this._lastHealth = null;
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
    bot.loadPlugin(pathfinder);
    this._bot = bot;

    await new Promise((resolve, reject) => {
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

        // Chat buffer
        bot.on("message", (chatMsg, position) => {
          const str = chatMsg.toString();
          let username = null;
          let message = str;
          const m = str.match(/^<([^>]+)>\s(.+)$/);
          if (m) { username = m[1]; message = m[2]; }
          this._pushChatEntry({
            timestamp: Date.now(),
            username,
            message,
            type: position === "chat" ? "chat" : "system",
          });
        });

        // M4: Safety behaviors (only when safeMode is on).
        if (this._safeMode) {
          // Auto-respawn on death.
          bot.on("death", () => {
            logger.warn("bot.safety.death", { username: this._username });
            setTimeout(() => {
              try { bot.respawn(); } catch (e) {
                logger.warn("bot.safety.respawn.failed", { err: String(e?.message ?? e) });
              }
            }, 1000);
          });

          // Health tracking — log on change.
          bot.on("health", () => {
            const h = bot.health ?? null;
            if (h !== this._lastHealth) {
              logger.info("bot.safety.health", { health: h, food: bot.food ?? null });
              this._lastHealth = h;
            }
          });

          // Fall protection — jump if falling fast.
          this._safetyInterval = setInterval(() => {
            if (!this._spawned || this._disconnected || !bot.entity) return;
            const vy = bot.entity.velocity?.y ?? 0;
            if (vy < -0.5) {
              try { bot.setControlState("jump", true); } catch { /* ignore */ }
            } else {
              try { bot.setControlState("jump", false); } catch { /* ignore */ }
            }
          }, 250);

          // Mob avoidance — if health < 10, navigate away from nearest hostile.
          bot.on("health", () => {
            if (!this._spawned || this._disconnected) return;
            const h = bot.health ?? 20;
            if (h < 10 && this._movements && bot.pathfinder) {
              try {
                const hostile = Object.values(bot.entities ?? {})
                  .filter(e => e && e.id !== bot.entity?.id)
                  .map(e => {
                    const name = (e.name ?? "").toLowerCase();
                    const HOSTILE = ["zombie","skeleton","creeper","spider","husk","stray","drowned","phantom","pillager","ravager","vex","vindicator","evoker","warden","breeze"];
                    const pos = e.position;
                    if (!HOSTILE.some(h => name.includes(h)) || !pos) return null;
                    const dx = pos.x - bot.entity.position.x;
                    const dz = pos.z - bot.entity.position.z;
                    return { dist: Math.sqrt(dx*dx + dz*dz), pos };
                  })
                  .filter(Boolean)
                  .sort((a, b) => a.dist - b.dist)[0];

                if (hostile && hostile.dist < 8) {
                  const away = {
                    x: bot.entity.position.x - (hostile.pos.x - bot.entity.position.x) * 4,
                    y: bot.entity.position.y,
                    z: bot.entity.position.z - (hostile.pos.z - bot.entity.position.z) * 4,
                  };
                  const { GoalNear } = goals;
                  bot.pathfinder.goto(new GoalNear(away.x, away.y, away.z, 1)).catch(() => {});
                  logger.warn("bot.safety.flee", { from: hostile.pos, health: h });
                }
              } catch { /* ignore — safety never crashes the bot */ }
            }
          });

          logger.info("bot.safety.enabled", { username: this._username });
        }

        settleResolve();
      });
    });

    // Initialise pathfinder movements now that spawn has completed.
    // Movements requires the real mineflayer bot's registry — use bot directly
    // rather than constructing a separate minecraft-data instance.
    try {
      const movements = new Movements(bot);
      movements.allowSprinting = false;
      bot.pathfinder.setMovements(movements);
      this._movements = movements;
      logger.info("bot.pathfinder.ready", { version: bot.version });
    } catch (e) {
      logger.warn("bot.pathfinder.init.failed", { err: String(e?.message ?? e) });
      this._movements = null;
    }
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

  // ---------- M1-P2: list_nearby_players ----------

  listNearbyPlayers({ maxDistance = 64 } = {}) {
    this._assertSpawned();
    const bot = this._bot;
    const origin = bot.entity?.position;
    if (!origin) throw new McpError(ErrorCodes.INTERNAL, "Minecraft: bot position not available");
    const maxD = Math.max(1, Math.min(256, Number(maxDistance) || 64));
    const out = [];
    try {
      for (const [name, player] of Object.entries(bot.players ?? {})) {
        if (name === bot.username) continue; // exclude self
        const pos = player.entity?.position;
        if (!pos) continue; // player in tab-list but entity not loaded
        const dx = pos.x - origin.x;
        const dy = pos.y - origin.y;
        const dz = pos.z - origin.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (distance > maxD) continue;
        out.push({
          username: name,
          uuid: player.uuid ?? null,
          position: { x: pos.x, y: pos.y, z: pos.z },
          distance: Number(distance.toFixed(3)),
          ping: typeof player.ping === "number" ? player.ping : null,
          gamemode: typeof player.gamemode === "number" ? player.gamemode : null,
        });
      }
      out.sort((a, b) => a.distance - b.distance);
      return out;
    } catch (err) {
      const n = normalizeError(err, "Minecraft: list_nearby_players failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  // ---------- M1-P3: get_biome ----------

  getBiome() {
    this._assertSpawned();
    const bot = this._bot;
    try {
      const pos = bot.entity?.position;
      if (!pos) throw new McpError(ErrorCodes.INTERNAL, "Minecraft: bot position not available");
      const biomeId = bot.world?.getBiome?.(pos);
      let biomeName = null;
      if (typeof biomeId === "number") {
        // minecraft-data registry lookup
        const reg = bot.registry;
        const biome = reg?.biomes?.[biomeId] ?? null;
        biomeName = biome?.name ?? `biome_${biomeId}`;
      }
      return {
        biome: biomeName,
        biomeId: typeof biomeId === "number" ? biomeId : null,
        position: { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) },
      };
    } catch (err) {
      if (err instanceof McpError) throw err;
      const n = normalizeError(err, "Minecraft: get_biome failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  // ---------- M1-P4: look_at / look_at_player ----------

  async lookAt({ x, y, z, force = false } = {}) {
    this._assertSpawned();
    const bot = this._bot;
    try {
      const { Vec3 } = await import("vec3");
      const target = new Vec3(Number(x), Number(y), Number(z));
      await bot.lookAt(target, force);
      const yaw = bot.entity?.yaw ?? null;
      const pitch = bot.entity?.pitch ?? null;
      return { yaw, pitch, target: { x: Number(x), y: Number(y), z: Number(z) } };
    } catch (err) {
      if (err instanceof McpError) throw err;
      const n = normalizeError(err, "Minecraft: look_at failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  async lookAtPlayer({ username, atFeet = false } = {}) {
    this._assertSpawned();
    const bot = this._bot;
    const player = bot.players?.[username];
    if (!player) {
      throw new McpError(ErrorCodes.INVALID_PARAMS, `look_at_player: player "${username}" not found`);
    }
    const pos = player.entity?.position;
    if (!pos) {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        `look_at_player: player "${username}" entity not loaded (too far?)`
      );
    }
    // Aim at eye level (1.62 blocks above feet) unless atFeet is true.
    const targetY = atFeet ? pos.y : pos.y + 1.62;
    return this.lookAt({ x: pos.x, y: targetY, z: pos.z });
  }

  // ---------- M1-P5: get_health ----------

  getHealth() {
    this._assertSpawned();
    const bot = this._bot;
    try {
      return {
        health: typeof bot.health === "number" ? bot.health : null,
        food: typeof bot.food === "number" ? bot.food : null,
        saturation: typeof bot.foodSaturation === "number" ? bot.foodSaturation : null,
        alive: bot.health > 0,
      };
    } catch (err) {
      const n = normalizeError(err, "Minecraft: get_health failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  // ---------- M1-P6: list_nearby_entities ----------

  listNearbyEntities({ maxDistance = 16 } = {}) {
    this._assertSpawned();
    const bot = this._bot;
    const origin = bot.entity?.position;
    if (!origin) throw new McpError(ErrorCodes.INTERNAL, "Minecraft: bot position not available");
    const maxD = Math.max(1, Math.min(64, Number(maxDistance) || 16));

    // Hostile mob types for vanilla 1.21.x
    const HOSTILE = new Set([
      "zombie", "skeleton", "creeper", "spider", "cave_spider", "witch",
      "enderman", "blaze", "ghast", "slime", "magma_cube", "husk",
      "stray", "drowned", "phantom", "pillager", "ravager", "vex",
      "vindicator", "evoker", "shulker", "elder_guardian", "guardian",
      "wither_skeleton", "warden", "breeze",
    ]);

    try {
      const out = [];
      for (const entity of Object.values(bot.entities ?? {})) {
        if (!entity || entity.id === bot.entity?.id) continue; // skip self
        const pos = entity.position;
        if (!pos) continue;
        const dx = pos.x - origin.x;
        const dy = pos.y - origin.y;
        const dz = pos.z - origin.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (distance > maxD) continue;
        const type = entity.name ?? entity.type ?? "unknown";
        out.push({
          id: entity.id ?? null,
          type,
          displayName: entity.displayName ?? null,
          username: entity.username ?? null,
          position: { x: pos.x, y: pos.y, z: pos.z },
          distance: Number(distance.toFixed(3)),
          isHostile: HOSTILE.has(type.toLowerCase()),
          health: typeof entity.health === "number" ? entity.health : null,
        });
      }
      out.sort((a, b) => a.distance - b.distance);
      return out;
    } catch (err) {
      const n = normalizeError(err, "Minecraft: list_nearby_entities failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  // ---------- M2-P1: navigate_to ----------

  // Navigation lock — prevents concurrent navigate calls from corrupting pathfinder state.
  // mineflayer-pathfinder is single-path; concurrent calls cancel each other and leave
  // stale listeners that break subsequent navigations.
  _navLock = false;

  async navigateTo({ x, y, z, tolerance = 1, timeoutMs = 30000 } = {}) {
    this._assertSpawned();
    const bot = this._bot;
    if (!bot.pathfinder) {
      throw new McpError(ErrorCodes.INTERNAL, "navigate_to: pathfinder not loaded");
    }
    if (!this._movements) {
      throw new McpError(ErrorCodes.INTERNAL, "navigate_to: pathfinder movements not initialised");
    }
    const tx = Number(x), ty = Number(y), tz = Number(z);
    if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) {
      throw new McpError(ErrorCodes.INVALID_PARAMS, "navigate_to: x, y, z must be finite numbers");
    }
    // Stop any in-flight path before starting a new one, then drain the event loop.
    // This prevents concurrent navigation races (Issue #001, #002) from leaving stale
    // pathStopped listeners that reject the new goto immediately.
    //
    // Deep fix: bot.pathfinder.stop() sets stopPathing=true but does NOT call stop().
    // stop() is only called from resetPath() when stopPathing=true, which happens inside
    // setGoal(). So if stopPathing=true when goto() calls setGoal(), the internal stop()
    // fires and emits path_stop which is caught by the new goto's pathStopped listener.
    // To fix this, we call setGoal(null) after bot.pathfinder.stop() to trigger the full
    // cleanup cycle (stopPathing→stop()→path_stop→stopPathing=false) BEFORE goto starts.
    try { bot.pathfinder.stop(); } catch { /* ignore */ }
    try { bot.pathfinder.setGoal(null); } catch { /* ignore */ }
    // Now drain: the setGoal(null) above will have emitted path_stop synchronously.
    // We need at least one tick for any lingering listeners to clean up.
    await new Promise((r) => setTimeout(r, 50));
    try {
      const goal = new goals.GoalNear(tx, ty, tz, Math.max(0, Number(tolerance) || 1));
      // Enforce timeout — pathfinder has no native timeout.
      await Promise.race([
        bot.pathfinder.goto(goal),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`navigate_to: timed out after ${timeoutMs}ms`)), timeoutMs)
        ),
      ]);
      const pos = bot.entity.position;
      return {
        reached: true,
        position: {
          x: Number(pos.x.toFixed(3)),
          y: Number(pos.y.toFixed(3)),
          z: Number(pos.z.toFixed(3)),
        },
        target: { x: tx, y: ty, z: tz },
      };
    } catch (err) {
      // Stop pathfinder so the bot doesn't keep trying after timeout.
      try { bot.pathfinder.stop(); } catch { /* ignore */ }
      try { bot.pathfinder.setGoal(null); } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 50));
      if (err instanceof McpError) throw err;
      const n = normalizeError(err, "Minecraft: navigate_to failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  // ---------- M2-P2: navigate_relative ----------

  async navigateRelative({ dx, dy, dz, tolerance = 1, timeoutMs = 30000 } = {}) {
    this._assertSpawned();
    const pos = this._bot.entity?.position;
    if (!pos) throw new McpError(ErrorCodes.INTERNAL, "navigate_relative: bot position not available");
    return this.navigateTo({
      x: pos.x + Number(dx),
      y: pos.y + Number(dy),
      z: pos.z + Number(dz),
      tolerance,
      timeoutMs,
    });
  }

  // ---------- M2-P3: get_time_of_day / get_weather ----------

  getTimeOfDay() {
    this._assertSpawned();
    const bot = this._bot;
    try {
      const timeOfDay = bot.time?.timeOfDay ?? null;
      const age = bot.time?.age ?? null;
      // timeOfDay 0=sunrise, 6000=noon, 12000=sunset, 18000=midnight
      let phase = null;
      if (timeOfDay !== null) {
        if (timeOfDay < 1000) phase = "sunrise";
        else if (timeOfDay < 6000) phase = "morning";
        else if (timeOfDay < 8000) phase = "noon";
        else if (timeOfDay < 12000) phase = "afternoon";
        else if (timeOfDay < 13000) phase = "sunset";
        else if (timeOfDay < 18000) phase = "night";
        else if (timeOfDay < 22000) phase = "midnight";
        else phase = "late_night";
      }
      return { timeOfDay, age, phase, isDay: timeOfDay !== null ? timeOfDay < 12000 : null };
    } catch (err) {
      const n = normalizeError(err, "Minecraft: get_time_of_day failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  getWeather() {
    this._assertSpawned();
    const bot = this._bot;
    try {
      const isRaining = bot.isRaining ?? false;
      const thunderState = bot.thunderState ?? 0;
      let weather = "clear";
      if (thunderState > 0.5) weather = "thunder";
      else if (isRaining) weather = "rain";
      return { weather, isRaining, thunderState };
    } catch (err) {
      const n = normalizeError(err, "Minecraft: get_weather failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  // ---------- M3-P1: place_block ----------

  async placeBlock({ dx, dy, dz } = {}) {
    this._assertSpawned();
    const bot = this._bot;
    const origin = bot.entity?.position;
    if (!origin) throw new McpError(ErrorCodes.INTERNAL, "place_block: bot position not available");

    const { Vec3 } = await import("vec3");
    const targetPos = new Vec3(
      Math.floor(origin.x) + Number(dx),
      Math.floor(origin.y) + Number(dy),
      Math.floor(origin.z) + Number(dz)
    );

    // Auto-equip: find a placeable block item anywhere in inventory and equip it.
    // In creative mode, bot.inventory.items() may be stale — also check quickBarSlot.
    const inv = bot.inventory;
    let itemToPlace = null;

    // Prefer item already in hand if there is one.
    const inHand = inv?.slots?.[bot.quickBarSlot] ?? null;
    if (inHand && inHand.name !== "air") {
      itemToPlace = inHand;
    } else {
      for (const item of inv?.items() ?? []) {
        if (item && item.name !== "air") {
          itemToPlace = item;
          break;
        }
      }
    }
    if (!itemToPlace) {
      throw new McpError(ErrorCodes.INVALID_PARAMS, "place_block: inventory is empty");
    }
    try {
      await bot.equip(itemToPlace, "hand");
    } catch (err) {
      // equip can fail in creative mode — if there's already something in hand, proceed anyway.
      const stillInHand = inv?.slots?.[bot.quickBarSlot];
      if (!stillInHand) {
        const n = normalizeError(err, "place_block: equip failed");
        throw new McpError(n.code, n.message, n.data);
      }
      itemToPlace = stillInHand;
    }

    // Find a solid adjacent block to place against.
    const faceOffsets = [
      [0, -1, 0], [0, 1, 0],
      [1, 0, 0], [-1, 0, 0],
      [0, 0, 1], [0, 0, -1],
    ];
    let referenceBlock = null;
    let faceVec = null;
    for (const [fx, fy, fz] of faceOffsets) {
      const candidate = bot.blockAt(targetPos.offset(fx, fy, fz));
      if (candidate && candidate.name !== "air" && candidate.name !== "cave_air") {
        referenceBlock = candidate;
        faceVec = new Vec3(-fx, -fy, -fz);
        break;
      }
    }
    if (!referenceBlock) {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        `place_block: no solid adjacent block to place against at offset (${dx},${dy},${dz})`
      );
    }

    try {
      // Use _genericPlace directly to avoid the blockUpdate timeout in 1.21.1.
      // _genericPlace sends the placement packet; we then verify via blockAt.
      await bot._genericPlace(referenceBlock, faceVec, { forceLook: "force", swingArm: "right" });
      // Small wait for server to process.
      await new Promise((r) => setTimeout(r, 200));
      const actual = bot.blockAt(targetPos);
      if (actual && actual.name !== "air" && actual.name !== "cave_air") {
        return {
          ok: true,
          placed: actual.name,
          position: { x: targetPos.x, y: targetPos.y, z: targetPos.z },
        };
      }
      // Block didn't appear — server rejected placement.
      throw new McpError(
        ErrorCodes.INTERNAL,
        `place_block: server did not confirm placement at (${targetPos.x},${targetPos.y},${targetPos.z}) — ` +
        `block is "${actual?.name ?? "unknown"}". Check reach distance and that target position is air.`
      );
    } catch (err) {
      if (err instanceof McpError) throw err;
      const n = normalizeError(err, "Minecraft: place_block failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  // ---------- M3-P2: dig_block ----------

  async digBlock({ dx, dy, dz } = {}) {
    this._assertSpawned();
    const bot = this._bot;
    const origin = bot.entity?.position;
    if (!origin) throw new McpError(ErrorCodes.INTERNAL, "dig_block: bot position not available");

    const { Vec3 } = await import("vec3");
    const targetPos = new Vec3(
      Math.floor(origin.x) + Number(dx),
      Math.floor(origin.y) + Number(dy),
      Math.floor(origin.z) + Number(dz)
    );

    const block = bot.blockAt(targetPos);
    if (!block || block.name === "air" || block.name === "cave_air") {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        `dig_block: no block to dig at offset (${dx},${dy},${dz}) — found "${block?.name ?? "nothing"}"`
      );
    }

    // Reach distance check: mineflayer sends the packet client-side and resolves
    // via diggingCompleted without server confirmation. Offline-mode servers silently
    // reject out-of-range digs, so we must check reach before calling bot.dig().
    const eyeHeight = bot.entity.eyeHeight ?? 1.62;
    const eyePos = origin.offset(0, eyeHeight, 0);
    const blockCenter = targetPos.offset(0.5, 0.5, 0.5);
    const reachDistance = eyePos.distanceTo(blockCenter);
    if (reachDistance > 6) {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        `dig_block: block at offset (${dx},${dy},${dz}) is out of reach (${reachDistance.toFixed(1)} blocks away, max ~6)`
      );
    }

    try {
      await bot.dig(block);
      return { ok: true, dug: block.name, position: { x: targetPos.x, y: targetPos.y, z: targetPos.z } };
    } catch (err) {
      if (err instanceof McpError) throw err;
      const n = normalizeError(err, "Minecraft: dig_block failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  // ---------- M3-P3: use_item ----------

  async useItem({ hand = "right" } = {}) {
    this._assertSpawned();
    const bot = this._bot;
    const handName = hand === "left" ? "off-hand" : "hand";
    try {
      await bot.activateItem(hand === "left");
      const item = bot.inventory?.slots?.[bot.quickBarSlot] ?? null;
      return { ok: true, hand, item: item?.name ?? null };
    } catch (err) {
      if (err instanceof McpError) throw err;
      const n = normalizeError(err, `Minecraft: use_item (${handName}) failed`);
      throw new McpError(n.code, n.message, n.data);
    }
  }

  // ---------- M6: craft_item ----------

  async craftItem({ itemName, count = 1 } = {}) {
    this._assertSpawned();
    const bot = this._bot;

    // Look up the recipe by item name
    const mcData = bot.registry;
    const itemsByName = mcData?.itemsByName ?? {};
    const blocksByName = mcData?.blocksByName ?? {};

    // Try item first, then block (some craftable items are blocks)
    const targetItem = itemsByName[itemName] ?? blocksByName[itemName];
    if (!targetItem) {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        `craft_item: unknown item "${itemName}"`
      );
    }

    // Find all recipes for this item — first check without table (2x2), then with table
    // bot.recipesFor(id, null, count, craftingTable) returns recipes executable with given table
    // When craftingTable is null, 3x3 recipes are excluded.

    // First look for any nearby crafting table
    let craftingTable = null;
    const tableBlock = bot.findBlock({
      matching: (block) => block.name === "crafting_table",
      maxDistance: 4,
    });
    if (tableBlock) {
      craftingTable = tableBlock;
    }

    // Try to find a craftable recipe
    const allRecipes = bot.recipesFor(targetItem.id, null, 1, craftingTable);
    if (!allRecipes || allRecipes.length === 0) {
      // Also try without table to see if it's a materials issue
      const recipesNoTable = bot.recipesAll
        ? bot.recipesAll(targetItem.id, null, null)
        : bot.recipesFor(targetItem.id, null, 1, null);
      if (!recipesNoTable || recipesNoTable.length === 0) {
        throw new McpError(
          ErrorCodes.INVALID_PARAMS,
          `craft_item: no recipe found for "${itemName}" — the item cannot be crafted`
        );
      }
      // Recipe exists but cannot be crafted (insufficient materials or needs table)
      const needsTable = recipesNoTable.some(r => r.requiresTable);
      if (needsTable && !craftingTable) {
        throw new McpError(
          ErrorCodes.INVALID_PARAMS,
          `craft_item: recipe for "${itemName}" requires a crafting table within 4 blocks`
        );
      }
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        `craft_item: insufficient materials to craft "${itemName}"`
      );
    }

    // Prefer 2x2 (no crafting table) recipes, fall back to 3x3
    const recipe = allRecipes[0];
    const requiresTable = recipe.requiresTable ?? false;

    // craftingTable was already found above (if needed)

    // Record inventory before craft to compute consumed items
    const invBefore = {};
    for (const slot of bot.inventory.slots) {
      if (slot) {
        invBefore[slot.name] = (invBefore[slot.name] || 0) + slot.count;
      }
    }

    try {
      await bot.craft(recipe, count, craftingTable);

      // Record inventory after craft
      const invAfter = {};
      for (const slot of bot.inventory.slots) {
        if (slot) {
          invAfter[slot.name] = (invAfter[slot.name] || 0) + slot.count;
        }
      }

      // Compute what was consumed
      const consumed = {};
      for (const [name, beforeCount] of Object.entries(invBefore)) {
        const afterCount = invAfter[name] || 0;
        if (afterCount < beforeCount) {
          consumed[name] = beforeCount - afterCount;
        }
      }

      const craftedCount = (invAfter[itemName] || 0) - (invBefore[itemName] || 0);
      return {
        ok: true,
        crafted: itemName,
        count: craftedCount,
        consumed,
        requiresTable,
      };
    } catch (err) {
      if (err instanceof McpError) throw err;
      const n = normalizeError(err, `Minecraft: craft_item failed`);
      throw new McpError(n.code, n.message, n.data);
    }
  }

  // ---------- Epic 10: equip_item ----------

  async equipItem({ name, destination = "hand" } = {}) {
    this._assertSpawned();
    const bot = this._bot;

    // Find the item in inventory by name.
    const items = bot.inventory.items();
    const item = items.find((it) => it.name === name || it.displayName === name);
    if (!item) {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        `equip_item: item "${name}" not found in inventory`
      );
    }

    // Map destination to mineflayer's equip destination strings.
    const destMap = {
      "hand": "hand",
      "off-hand": "off-hand",
      "head": "head",
      "torso": "torso",
      "legs": "legs",
      "feet": "feet",
    };
    const dest = destMap[destination] ?? "hand";

    try {
      await bot.equip(item, dest);
      return {
        ok: true,
        equipped: item.name,
        destination: dest,
      };
    } catch (err) {
      if (err instanceof McpError) throw err;
      const n = normalizeError(err, "Minecraft: equip_item failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  // ---------- Epic 10: drop_item ----------

  async dropItem({ name, count = 1 } = {}) {    this._assertSpawned();
    const bot = this._bot;

    // Find the item in inventory by name.
    const items = bot.inventory.items();
    const item = items.find((it) => it.name === name || it.displayName === name);
    if (!item) {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        `drop_item: item "${name}" not found in inventory`
      );
    }

    // Validate count against available quantity.
    const dropCount = Math.max(1, Math.min(item.count, Number(count) || 1));
    if (dropCount > item.count) {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        `drop_item: cannot drop ${dropCount} of "${name}" — only ${item.count} in inventory`
      );
    }

    try {
      // bot.toss(itemType, metadata, count) drops exactly N items.
      await bot.toss(item.type, null, dropCount);
      // Wait for the item entity to appear.
      await new Promise((r) => setTimeout(r, 150));
      return {
        ok: true,
        dropped: item.name,
        count: dropCount,
      };
    } catch (err) {
      if (err instanceof McpError) throw err;
      const n = normalizeError(err, "Minecraft: drop_item failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  // ---------- Epic 10: open_container / take_item / deposit_item / close_container ----------

  // Container state: holds the open container window reference.
  _openContainer = null;

  async openContainer({ dx, dy, dz } = {}) {
    this._assertSpawned();
    const bot = this._bot;
    const origin = bot.entity?.position;
    if (!origin) throw new McpError(ErrorCodes.INTERNAL, "open_container: bot position not available");

    // Close any existing open container first.
    if (this._openContainer) {
      try { this._openContainer.close(); } catch { /* ignore */ }
      this._openContainer = null;
    }

    const { Vec3 } = await import("vec3");
    const targetPos = new Vec3(
      Math.floor(origin.x) + Number(dx),
      Math.floor(origin.y) + Number(dy),
      Math.floor(origin.z) + Number(dz)
    );

    const block = bot.blockAt(targetPos);
    if (!block || block.name === "air" || block.name === "cave_air") {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        `open_container: no block at offset (${dx},${dy},${dz}) — found "${block?.name ?? "nothing"}"`
      );
    }

    // Reach check.
    const eyeHeight = bot.entity.eyeHeight ?? 1.62;
    const eyePos = origin.offset(0, eyeHeight, 0);
    const blockCenter = targetPos.offset(0.5, 0.5, 0.5);
    const reachDistance = eyePos.distanceTo(blockCenter);
    if (reachDistance > 5) {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        `open_container: block at offset (${dx},${dy},${dz}) is out of reach (${reachDistance.toFixed(1)} blocks away, max 5)`
      );
    }

    try {
      // Use bot.openBlock directly to avoid the constructor name check in bot.openContainer().
      // bot.openContainer checks containerToOpen.constructor.name === 'Block' which can fail
      // when Block is imported from a different module context.
      const { Vec3 } = await import("vec3");
      const direction = new Vec3(0, 1, 0);
      const cursorPos = new Vec3(0.5, 0.5, 0.5);
      const chest = await bot.openBlock(block, direction, cursorPos);
      this._openContainer = chest;
      // Read container contents.
      const contents = chest.containerItems().map((item) => ({
        name: item.name ?? null,
        count: item.count ?? null,
        slot: item.slot ?? null,
        displayName: item.displayName ?? null,
      }));
      return {
        ok: true,
        blockName: block.name,
        position: { x: targetPos.x, y: targetPos.y, z: targetPos.z },
        contents,
      };
    } catch (err) {
      this._openContainer = null;
      if (err instanceof McpError) throw err;
      const n = normalizeError(err, "Minecraft: open_container failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  async takeItem({ name, count = 1 } = {}) {
    this._assertSpawned();
    if (!this._openContainer) {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        "take_item: no container is currently open — call open_container first"
      );
    }
    const chest = this._openContainer;
    const items = chest.containerItems();
    const item = items.find((it) => it.name === name || it.displayName === name);
    if (!item) {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        `take_item: item "${name}" not found in container`
      );
    }
    const takeCount = Math.max(1, Math.min(item.count, Number(count) || 1));
    try {
      await chest.withdraw(item.type, null, takeCount);
      return { ok: true, taken: item.name, count: takeCount };
    } catch (err) {
      if (err instanceof McpError) throw err;
      const n = normalizeError(err, "Minecraft: take_item failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  async depositItem({ name, count = 1 } = {}) {
    this._assertSpawned();
    if (!this._openContainer) {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        "deposit_item: no container is currently open — call open_container first"
      );
    }
    const bot = this._bot;
    const chest = this._openContainer;
    // Find item in bot's inventory.
    const items = bot.inventory.items();
    const item = items.find((it) => it.name === name || it.displayName === name);
    if (!item) {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        `deposit_item: item "${name}" not found in inventory`
      );
    }
    const depositCount = Math.max(1, Math.min(item.count, Number(count) || 1));
    try {
      await chest.deposit(item.type, null, depositCount);
      return { ok: true, deposited: item.name, count: depositCount };
    } catch (err) {
      if (err instanceof McpError) throw err;
      const n = normalizeError(err, "Minecraft: deposit_item failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  async closeContainer() {
    this._assertSpawned();
    if (!this._openContainer) {
      // Already closed — not an error.
      return { ok: true, closed: false };
    }
    try {
      this._openContainer.close();
      this._openContainer = null;
      return { ok: true, closed: true };
    } catch (err) {
      this._openContainer = null;
      if (err instanceof McpError) throw err;
      const n = normalizeError(err, "Minecraft: close_container failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  // ---------- Epic 11: eat ----------

  async eat({ itemName } = {}) {
    this._assertSpawned();
    const bot = this._bot;

    // If itemName specified, equip that food item first.
    if (itemName) {
      const items = bot.inventory.items();
      const food = items.find((it) => it.name === itemName || it.displayName === itemName);
      if (!food) {
        throw new McpError(
          ErrorCodes.INVALID_PARAMS,
          `eat: food item "${itemName}" not found in inventory`
        );
      }
      try {
        await bot.equip(food, "hand");
        await new Promise((r) => setTimeout(r, 100)); // Wait for inventory update
      } catch (err) {
        const n = normalizeError(err, "eat: equip failed");
        throw new McpError(n.code, n.message, n.data);
      }
    }

    // Check what's in hand — use the heldItem() API which is more reliable.
    const handItem = bot.heldItem ?? bot.inventory?.slots?.[bot.quickBarSlot] ?? null;
    if (!handItem || handItem.name === "air") {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        "eat: no food item in hand — equip a food item first or specify itemName"
      );
    }

    const foodBefore = typeof bot.food === "number" ? bot.food : null;

    try {
      await bot.consume();
      await new Promise((r) => setTimeout(r, 500));
      const foodAfter = typeof bot.food === "number" ? bot.food : null;
      return {
        ok: true,
        consumed: handItem.name,
        foodBefore,
        foodAfter,
      };
    } catch (err) {
      if (err instanceof McpError) throw err;
      const n = normalizeError(err, "Minecraft: eat failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  // ---------- Epic 11: sleep ----------

  async sleep() {    this._assertSpawned();
    const bot = this._bot;

    // Find nearest bed.
    const BED_BLOCKS = [
      "white_bed", "orange_bed", "magenta_bed", "light_blue_bed",
      "yellow_bed", "lime_bed", "pink_bed", "gray_bed", "light_gray_bed",
      "cyan_bed", "purple_bed", "blue_bed", "brown_bed", "green_bed",
      "red_bed", "black_bed",
    ];
    const ids = [];
    for (const bedName of BED_BLOCKS) {
      const block = bot.registry?.blocksByName?.[bedName];
      if (block && Number.isInteger(block.id)) ids.push(block.id);
    }
    const bedBlock = ids.length > 0 ? bot.findBlock({ matching: ids, maxDistance: 32 }) : null;
    if (!bedBlock) {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        "sleep: no bed found within 32 blocks"
      );
    }

    // Record time before sleep.
    const timeBefore = bot.time?.timeOfDay ?? null;

    try {
      await bot.sleep(bedBlock);
      await new Promise((r) => setTimeout(r, 2000));
      const wokeAt = bot.time?.timeOfDay ?? null;
      return { ok: true, slept: true, wokeAt };
    } catch (err) {
      if (err instanceof McpError) throw err;
      const n = normalizeError(err, "Minecraft: sleep failed");
      // Provide a readable error for common sleep failures.
      const msg = String(err?.message ?? n.message);
      if (msg.includes("daytime") || msg.includes("day") || msg.includes("not night")) {
        throw new McpError(ErrorCodes.INVALID_PARAMS, "sleep: cannot sleep — it is daytime");
      }
      if (msg.includes("hostile") || msg.includes("monster")) {
        throw new McpError(ErrorCodes.INVALID_PARAMS, "sleep: cannot sleep — hostile mobs nearby");
      }
      throw new McpError(n.code, n.message, n.data);
    }
  }

  // ---------- Epic 9: attack_entity ----------

  async attackEntity({ entity_id } = {}) {
    this._assertSpawned();
    const bot = this._bot;
    const origin = bot.entity?.position;
    if (!origin) throw new McpError(ErrorCodes.INTERNAL, "attack_entity: bot position not available");

    // Find the entity by numeric ID in the loaded entity map.
    const entity = bot.entities?.[entity_id];
    if (!entity || !entity.position) {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        `attack_entity: entity with id ${entity_id} not found (not loaded or does not exist)`
      );
    }

    // Reach distance check — attack range is ~4 blocks (creative: 5, survival: 3–4).
    // Use 4.5 blocks as the threshold to be consistent with vanilla survival.
    const dx = entity.position.x - origin.x;
    const dy = entity.position.y - origin.y;
    const dz = entity.position.z - origin.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > 4.5) {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        `attack_entity: entity ${entity_id} is out of reach (${dist.toFixed(1)} blocks away, max 4.5)`
      );
    }

    // Record health before attack (may be null for entities that don't track health).
    const healthBefore = typeof entity.health === "number" ? entity.health : null;

    try {
      await bot.attack(entity);
      // Small wait for server to process the damage packet.
      await new Promise((r) => setTimeout(r, 100));

      // Re-read entity health after attack (entity may have been updated in bot.entities).
      const entityAfter = bot.entities?.[entity_id];
      const healthAfter = entityAfter && typeof entityAfter.health === "number"
        ? entityAfter.health
        : null;

      const damageDealt =
        healthBefore !== null && healthAfter !== null
          ? Math.max(0, healthBefore - healthAfter)
          : null;

      return {
        ok: true,
        entityId: entity_id,
        damageDealt,
      };
    } catch (err) {
      if (err instanceof McpError) throw err;
      const n = normalizeError(err, "Minecraft: attack_entity failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  // ---------- Epic 9: activate_block ----------

  async activateBlock({ dx, dy, dz } = {}) {
    this._assertSpawned();
    const bot = this._bot;
    const origin = bot.entity?.position;
    if (!origin) throw new McpError(ErrorCodes.INTERNAL, "activate_block: bot position not available");

    const { Vec3 } = await import("vec3");
    const targetPos = new Vec3(
      Math.floor(origin.x) + Number(dx),
      Math.floor(origin.y) + Number(dy),
      Math.floor(origin.z) + Number(dz)
    );

    const block = bot.blockAt(targetPos);
    if (!block || block.name === "air" || block.name === "cave_air") {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        `activate_block: no block at offset (${dx},${dy},${dz}) — found "${block?.name ?? "nothing"}"`
      );
    }

    // Reach check: activation range is ~4 blocks from eye to block center.
    const eyeHeight = bot.entity.eyeHeight ?? 1.62;
    const eyePos = origin.offset(0, eyeHeight, 0);
    const blockCenter = targetPos.offset(0.5, 0.5, 0.5);
    const reachDistance = eyePos.distanceTo(blockCenter);
    if (reachDistance > 5) {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        `activate_block: block at offset (${dx},${dy},${dz}) is out of reach (${reachDistance.toFixed(1)} blocks away, max 5)`
      );
    }

    try {
      await bot.activateBlock(block);
      // Small wait for server to process.
      await new Promise((r) => setTimeout(r, 150));
      return {
        ok: true,
        blockName: block.name,
        position: { x: targetPos.x, y: targetPos.y, z: targetPos.z },
      };
    } catch (err) {
      if (err instanceof McpError) throw err;
      const n = normalizeError(err, "Minecraft: activate_block failed");
      throw new McpError(n.code, n.message, n.data);
    }
  }

  // ---------- Epic 12: follow_player ----------

  // Track whether a follow is in progress.
  _following = false;

  async followPlayer({ username, distance = 2, timeoutMs = 30000 } = {}) {
    this._assertSpawned();
    const bot = this._bot;

    if (this._following) {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        "follow_player: already following a player — call follow_player again to update target"
      );
    }

    // Check that the player exists.
    const player = bot.players?.[username];
    if (!player) {
      throw new McpError(
        ErrorCodes.INVALID_PARAMS,
        `follow_player: player "${username}" not found (not online or out of entity range)`
      );
    }

    this._following = true;
    const startTime = Date.now();

    try {
      // Ensure pathfinder is clean before starting.
      try { bot.pathfinder.stop(); } catch { /* ignore */ }
      try { bot.pathfinder.setGoal(null); } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 50));

      const followGoal = new goals.GoalFollow(player.entity, Math.max(1, Number(distance) || 2));
      // Set a dynamic GoalFollow — pathfinder will continuously re-path toward leader.
      bot.pathfinder.setMovements(this._movements);
      bot.pathfinder.setGoal(followGoal, true); // true = dynamic/continuous

      // Wait for timeout, then stop following.
      await new Promise((resolve) => setTimeout(resolve, timeoutMs));

      const duration = Date.now() - startTime;
      return { ok: true, followed: username, duration };
    } catch (err) {
      if (err instanceof McpError) throw err;
      const n = normalizeError(err, "Minecraft: follow_player failed");
      throw new McpError(n.code, n.message, n.data);
    } finally {
      this._following = false;
      // Stop pathfinder.
      try { bot.pathfinder.stop(); } catch { /* ignore */ }
      try { bot.pathfinder.setGoal(null); } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  disconnect() {
    this._disconnected = true;
    if (this._safetyInterval) {
      clearInterval(this._safetyInterval);
      this._safetyInterval = null;
    }
    if (this._bot) {
      try { this._bot.setControlState?.("jump", false); } catch { /* ignore */ }
      try { this._bot.quit?.("shutdown"); } catch { /* ignore */ }
      try { this._bot.end?.(); } catch { /* ignore */ }
    }
  }
}

export default Bot;
