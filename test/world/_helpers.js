// test/world/_helpers.js
// Shared harness for the test/world/ deterministic live-world suite.
// No node:test imports here — this is pure infrastructure code.
//
// Prerequisites (project-owned Docker stack):
//   docker compose -f docker-compose.dev.yaml up -d
// All RCON calls are unconditional — if the stack is not up, tests fail.

import net from "node:net";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// ---------- env defaults (mirrors docker-compose.dev.yaml) ----------

const MC_HOST     = process.env.MC_HOST       || "127.0.0.1";
const MC_PORT     = Number(process.env.MC_PORT || 25565);
const MC_VERSION  = process.env.MC_VERSION     || "1.21.1";
const RCON_HOST   = process.env.RCON_HOST      || "127.0.0.1";
const RCON_PORT   = Number(process.env.RCON_PORT || 25575);
const RCON_PASS   = process.env.RCON_PASSWORD  || "mineflayer-dev";
const BOT_USER    = process.env.MC_USERNAME    || "mineflayer-bot";

export { MC_HOST, MC_PORT, MC_VERSION, RCON_HOST, RCON_PORT, RCON_PASS, BOT_USER };

// ---------- RCON client ----------
// Minimal implementation of the RCON protocol (https://wiki.vg/RCON).
// Packet layout: int32-LE length | int32-LE id | int32-LE type | payload | 0x00 0x00

const RCON_TYPE_AUTH     = 3;
const RCON_TYPE_EXEC     = 2;
const RCON_TYPE_RESPONSE = 0;

function rconPacket(id, type, body) {
  const payload = Buffer.from(body, "utf8");
  const buf = Buffer.allocUnsafe(4 + 4 + 4 + payload.length + 2);
  buf.writeInt32LE(4 + 4 + payload.length + 2, 0);  // length field
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  payload.copy(buf, 12);
  buf.writeUInt8(0, 12 + payload.length);
  buf.writeUInt8(0, 12 + payload.length + 1);
  return buf;
}

function readRconPackets(buf) {
  const packets = [];
  let offset = 0;
  while (offset + 4 <= buf.length) {
    const len = buf.readInt32LE(offset);
    if (offset + 4 + len > buf.length) break;
    const id   = buf.readInt32LE(offset + 4);
    const type = buf.readInt32LE(offset + 8);
    const body = buf.slice(offset + 12, offset + 4 + len - 2).toString("utf8");
    packets.push({ id, type, body });
    offset += 4 + len;
  }
  return { packets, remaining: buf.slice(offset) };
}

export async function rconExec(cmd) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buf = Buffer.alloc(0);
    let authed = false;
    const AUTH_ID = 1;
    const EXEC_ID = 2;

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`rconExec timeout for: ${cmd}`));
    }, 5000);

    socket.connect(RCON_PORT, RCON_HOST, () => {
      socket.write(rconPacket(AUTH_ID, RCON_TYPE_AUTH, RCON_PASS));
    });

    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const { packets, remaining } = readRconPackets(buf);
      buf = remaining;
      for (const pkt of packets) {
        if (!authed) {
          if (pkt.id === -1) {
            clearTimeout(timeout);
            socket.destroy();
            return reject(new Error("RCON authentication failed"));
          }
          authed = true;
          socket.write(rconPacket(EXEC_ID, RCON_TYPE_EXEC, cmd));
        } else if (pkt.type === RCON_TYPE_RESPONSE) {
          clearTimeout(timeout);
          socket.destroy();
          resolve(pkt.body);
        }
      }
    });

    socket.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`RCON socket error: ${err.message}`));
    });
  });
}

// ---------- world helpers (thin RCON wrappers) ----------

export async function resetWorld(username = BOT_USER) {
  await rconExec(`clear ${username}`);
  await rconExec("time set day");
  await rconExec("weather clear");
}

export async function teleport(username, x, y, z) {
  await rconExec(`tp ${username} ${x} ${y} ${z}`);
}

export async function giveItem(username, item, count = 1) {
  const fqItem = item.includes(":") ? item : `minecraft:${item}`;
  await rconExec(`give ${username} ${fqItem} ${count}`);
}

export async function setBlock(x, y, z, type) {
  const fqType = type.includes(":") ? type : `minecraft:${type}`;
  await rconExec(`setblock ${x} ${y} ${z} ${fqType}`);
}

export async function fill(x1, y1, z1, x2, y2, z2, type) {
  const fqType = type.includes(":") ? type : `minecraft:${type}`;
  await rconExec(`fill ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} ${fqType}`);
}

export async function readBlock(x, y, z) {
  // For non-block-entity blocks, use "execute if block" to test against common types.
  // Returns the matched type string or null.
  const candidates = [
    "minecraft:stone","minecraft:air","minecraft:dirt","minecraft:sand",
    "minecraft:gravel","minecraft:gold_block","minecraft:iron_block",
    "minecraft:grass_block","minecraft:oak_log","minecraft:oak_planks",
    "minecraft:cobblestone","minecraft:bedrock","minecraft:water","minecraft:lava",
    "minecraft:glass","minecraft:tnt","minecraft:chest","minecraft:crafting_table",
  ];
  for (const type of candidates) {
    const result = await rconExec(`execute if block ${x} ${y} ${z} ${type}`);
    if (result.includes("Test passed")) return type;
  }
  return null;
}

/** Assert a block at x,y,z matches a given type via RCON. Throws if not. */
export async function assertBlock(x, y, z, expectedType) {
  const fqType = expectedType.includes(":") ? expectedType : `minecraft:${expectedType}`;
  const result = await rconExec(`execute if block ${x} ${y} ${z} ${fqType}`);
  if (!result.includes("Test passed")) {
    throw new Error(`assertBlock failed: expected ${fqType} at ${x},${y},${z} — RCON said: ${result}`);
  }
}

/** Assert a block at x,y,z is air. */
export async function assertAir(x, y, z) {
  return assertBlock(x, y, z, "minecraft:air");
}

export async function readPosition(username = BOT_USER) {
  // /data get entity @p[name=username] Pos returns:
  // "has the following entity data: [Xd, Yd, Zd]"
  const result = await rconExec(`data get entity @p[name=${username}] Pos`);
  const m = result.match(/\[([-\d.e]+)d,\s*([-\d.e]+)d,\s*([-\d.e]+)d\]/);
  if (!m) throw new Error(`readPosition: could not parse RCON response: ${result}`);
  return { x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) };
}

export async function summonEntity(type, x, y, z, tag = "test_entity") {
  const fqType = type.includes(":") ? type : `minecraft:${type}`;
  await rconExec(`summon ${fqType} ${x} ${y} ${z} {Tags:["${tag}"]}`);
}

export async function killTagged(tag = "test_entity") {
  await rconExec(`kill @e[tag=${tag}]`);
}

// ---------- process helpers ----------

let _spawnSeq = 0;
function nextSeq() { return ++_spawnSeq; }
// Minecraft usernames are max 16 chars. Use a short prefix + truncated pid + seq.
function botUser(prefix, seq) {
  const pid = String(process.pid).slice(-4); // last 4 digits of pid
  const name = `${prefix}${pid}${seq}`;
  return name.slice(0, 16);
}

/** Spawn the stdio MCP server as a child process. */
export function spawnStdioServer({ host = MC_HOST, port = MC_PORT, version = MC_VERSION, username } = {}) {
  const seq = nextSeq();
  const user = username || botUser("mfS", seq);
  const lockPath = `/tmp/mf-mcp-test-${process.pid}-${seq}.lock`;
  const child = spawn(
    process.execPath,
    [
      "src/index.js",
      "--host", host,
      "--port", String(port),
      "--username", user,
      "--lock", lockPath,
      "--version", version,
      "--log-level", "debug",
    ],
    {
      cwd: new URL("../../", import.meta.url).pathname,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, LOG_LEVEL: "debug" },
    }
  );
  child.on("error", (err) => { throw err; });

  async function close() {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 400));
    if (!child.killed) child.kill("SIGKILL");
  }

  return { child, stdin: child.stdin, stdout: child.stdout, stderr: child.stderr, username: user, close };
}

/** Allocate a free TCP port. */
async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

/** Spawn the HTTP MCP server as a child process. */
export async function spawnHttpServer({
  host = MC_HOST,
  port = MC_PORT,
  version = MC_VERSION,
  username,
  httpPort,
} = {}) {
  const seq = nextSeq();
  const user = username || botUser("mfH", seq);
  const lockPath = `/tmp/mf-mcp-test-${process.pid}-${seq}.lock`;
  const actualHttpPort = httpPort || await freePort();
  const child = spawn(
    process.execPath,
    [
      "src/http.js",
      "--host", host,
      "--port", String(port),
      "--username", user,
      "--http-port", String(actualHttpPort),
      "--http-path", "/mcp",
      "--health-path", "/healthz",
      "--lock", lockPath,
      "--version", version,
      "--log-level", "debug",
    ],
    {
      cwd: new URL("../../", import.meta.url).pathname,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, LOG_LEVEL: "debug" },
    }
  );
  child.on("error", (err) => { throw err; });

  async function close() {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 400));
    if (!child.killed) child.kill("SIGKILL");
  }

  const baseUrl = `http://127.0.0.1:${actualHttpPort}`;
  return { child, baseUrl, httpPort: actualHttpPort, username: user, close };
}

/**
 * Wait for a string to appear on a readable stream (stderr from our servers).
 * Resolves when the pattern is seen, rejects on timeout.
 */
export async function waitForOutput(readable, pattern, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: readable, crlfDelay: Infinity });
    const lines = [];
    const timer = setTimeout(() => {
      rl.close();
      reject(new Error(`waitForOutput: "${pattern}" not seen within ${timeoutMs}ms. Lines: ${lines.slice(-10).join(" | ")}`));
    }, timeoutMs);

    rl.on("line", (line) => {
      lines.push(line);
      if (line.includes(pattern)) {
        clearTimeout(timer);
        rl.close();
        resolve(line);
      }
    });
  });
}

/**
 * Connect an MCP SDK Client to the stdio MCP server.
 * Retries up to 3 times if the Minecraft server rate-limits the connection.
 * Returns { client, transport, username, close() }.
 */
export async function connectStdioClient({ host = MC_HOST, port = MC_PORT, version = MC_VERSION, username } = {}) {
  const seq = nextSeq();
  const user = username || botUser("mfC", seq);
  const lockPath = `/tmp/mf-mcp-test-${process.pid}-${seq}.lock`;
  const cwd = new URL("../../", import.meta.url).pathname;

  const MAX_ATTEMPTS = 4;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      // Exponential backoff: 1s, 2s, 4s
      await sleep(1000 * (attempt - 1));
    }
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        "src/index.js",
        "--host", host,
        "--port", String(port),
        "--username", user,
        "--lock", lockPath,
        "--version", version,
        "--log-level", "info",
      ],
      cwd,
      env: { ...process.env },
      stderr: "pipe",
    });

    const client = new Client({ name: "test-client", version: "0.0.1" });
    try {
      await client.connect(transport);
      async function close() {
        try { await transport.close(); } catch { /* ignore */ }
      }
      return { client, transport, username: user, close };
    } catch (err) {
      try { await transport.close(); } catch { /* ignore */ }
      lastErr = err;
      // Retry only on connection-closed (server rate-limit / kick at pre-spawn)
      if (!err.message?.includes("Connection closed") && !err.message?.includes("ECONNREFUSED")) {
        break;
      }
    }
  }
  throw lastErr;
}

/** Connect an MCP SDK Client to a running HTTP MCP server. */
export async function connectHttpClient(baseUrl) {
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
  const client = new Client({ name: "test-client", version: "0.0.1" });
  await client.connect(transport);
  return { client, transport };
}

/**
 * Assert that every line written to stdout by the server is valid JSON-RPC.
 * Collects all stdout lines from the child and asserts each parses as JSON.
 * Call after close() to inspect the full output.
 */
export function collectStdout(child) {
  const lines = [];
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  rl.on("line", (line) => { if (line.trim()) lines.push(line); });
  return {
    lines,
    assertAllJsonRpc() {
      for (const line of lines) {
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch {
          throw new Error(`stdout-safety violation: non-JSON line on stdout: ${line}`);
        }
        if (!parsed || typeof parsed !== "object" || parsed.jsonrpc !== "2.0") {
          throw new Error(`stdout-safety violation: line is JSON but not JSON-RPC 2.0: ${line}`);
        }
      }
    },
  };
}

/** Pause for ms milliseconds. */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
