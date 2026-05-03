#!/usr/bin/env node
// src/http.js
// HTTP server entrypoint — serves MCP over streamable-http directly.
// Single long-lived Minecraft bot shared across all sessions.
// Each client session gets its own MCP Server instance + transport, all sharing the bot.

import http from "node:http";
import { parseArgs } from "node:util";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { Bot } from "./bot.js";
import { McpMinecraftServer } from "./server.js";
import { acquireLock } from "./lock.js";
import { McpError, ErrorCodes } from "./errors.js";
import { logger } from "./logger.js";

const USAGE = `
Usage:
  minecraft-mcp-http --host <host> --port <port> --username <name> \\
                     [--http-port <n>] [--http-path <p>] [--health-path <p>] \\
                     [--lock <path>] [--log-level <level>] [--version <mcver>] \\
                     [--stateful|--stateless]

Required:
  --host <host>         Minecraft server host
  --port <port>         Minecraft server port
  --username <name>     Bot username

Optional:
  --http-port <n>       HTTP port (default 8080)
  --http-path <p>       MCP endpoint (default /mcp)
  --health-path <p>     Health endpoint (default /healthz)
  --lock <path>         Lockfile (default /tmp/mathbridgebot.lock)
  --log-level <level>   debug|info|warn|error (default info)
  --version <mcver>     Pin MC version (default: auto)
  --stateful            Session mode (default true)
  --stateless           Stateless mode
`;

function die(code, msg) {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
  if (code !== 0) process.stderr.write(USAGE);
  process.exit(code);
}

function parseCli() {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        host: { type: "string" },
        port: { type: "string" },
        username: { type: "string" },
        "http-port": { type: "string", default: "8080" },
        "http-path": { type: "string", default: "/mcp" },
        "health-path": { type: "string", default: "/healthz" },
        lock: { type: "string", default: "/tmp/mathbridgebot.lock" },
        "log-level": { type: "string", default: "info" },
        version: { type: "string" },
        stateful: { type: "boolean", default: true },
        stateless: { type: "boolean", default: false },
        "safe-mode": { type: "boolean", default: true },
        help: { type: "boolean", short: "h" },
      },
      strict: true,
      allowPositionals: false,
    });
  } catch (err) {
    die(2, `argument parse error: ${err.message}`);
  }
  const v = parsed.values;
  if (v.help) die(0, USAGE);
  const missing = [];
  if (!v.host) missing.push("--host");
  if (!v.port) missing.push("--port");
  if (!v.username) missing.push("--username");
  if (missing.length) die(2, `missing required args: ${missing.join(", ")}`);

  const mcPort = Number.parseInt(v.port, 10);
  if (!Number.isInteger(mcPort) || mcPort <= 0 || mcPort > 65535) {
    die(2, `invalid --port value: ${v.port}`);
  }
  const httpPort = Number.parseInt(v["http-port"], 10);
  if (!Number.isInteger(httpPort) || httpPort <= 0 || httpPort > 65535) {
    die(2, `invalid --http-port value: ${v["http-port"]}`);
  }
  if (v["log-level"]) process.env.LOG_LEVEL = v["log-level"];

  return {
    mcHost: v.host,
    mcPort,
    username: v.username,
    httpPort,
    httpPath: v["http-path"],
    healthPath: v["health-path"],
    lockPath: v.lock,
    version: v.version || undefined,
    stateful: !!v.stateful && !v.stateless,
    safeMode: v["safe-mode"] !== false,
  };
}

async function readBody(req, limitBytes = 4 * 1024 * 1024) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > limitBytes) {
        reject(new Error(`request body too large (>${limitBytes} bytes)`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error(`invalid JSON body: ${err.message}`));
      }
    });
    req.on("error", (err) => reject(err));
  });
}

function writeJson(res, status, obj) {
  if (res.headersSent) {
    try { res.end(); } catch { /* ignore */ }
    return;
  }
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body).toString(),
  });
  res.end(body);
}

async function main() {
  const opts = parseCli();
  logger.info("http.startup", {
    mcHost: opts.mcHost,
    mcPort: opts.mcPort,
    username: opts.username,
    httpPort: opts.httpPort,
    httpPath: opts.httpPath,
    healthPath: opts.healthPath,
    lockPath: opts.lockPath,
    stateful: opts.stateful,
    safeMode: opts.safeMode,
    pid: process.pid,
  });

  let release;
  try {
    release = await acquireLock(opts.lockPath);
  } catch (err) {
    const msg = err instanceof McpError ? err.message : (err?.message ?? String(err));
    die(1, `startup failed: ${msg}`);
  }

  /** @type {Map<string, { transport: StreamableHTTPServerTransport, server: McpMinecraftServer }>} */
  const sessions = new Map();
  // For stateless mode we lazy-create a single transport/server on first request.
  let statelessPair = null;
  let bot;
  let httpServer;

  const shutdown = async (code, reason) => {
    logger.info("http.shutdown", { code, reason });
    for (const { transport, server } of sessions.values()) {
      try { await transport.close?.(); } catch { /* ignore */ }
      try { await server.close?.(); } catch { /* ignore */ }
    }
    sessions.clear();
    if (statelessPair) {
      try { await statelessPair.transport.close?.(); } catch { /* ignore */ }
      try { await statelessPair.server.close?.(); } catch { /* ignore */ }
      statelessPair = null;
    }
    try { bot?.disconnect?.(); } catch { /* ignore */ }
    try { await new Promise((r) => httpServer?.close?.(() => r()) ?? r()); } catch { /* ignore */ }
    try { await release?.(); } catch { /* ignore */ }
    process.exit(code);
  };

  process.on("SIGINT", () => shutdown(0, "SIGINT"));
  process.on("SIGTERM", () => shutdown(0, "SIGTERM"));
  process.on("uncaughtException", (err) => {
    logger.error("uncaughtException", { err: String(err?.stack ?? err) });
    shutdown(1, "uncaughtException");
  });
  process.on("unhandledRejection", (reason) => {
    logger.error("unhandledRejection", { reason: String(reason) });
  });

  bot = new Bot({
    host: opts.mcHost,
    port: opts.mcPort,
    username: opts.username,
    version: opts.version,
    safeMode: opts.safeMode,
  });

  bot.onEnd(({ reason, intentional }) => {
    logger.warn("bot.lifecycleEnd", { reason: String(reason ?? ""), intentional });
    shutdown(intentional ? 0 : 1, `bot ended: ${reason}`);
  });

  try {
    await bot.connect();
  } catch (err) {
    const msg = err instanceof McpError ? err.message : (err?.message ?? String(err));
    logger.error("bot.connectFailed", { err: msg });
    await release().catch(() => {});
    die(1, `bot connect failed: ${msg}`);
  }

  async function createSession() {
    // Forward-referenced pair; populated once transport is constructed.
    const pair = {};
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: opts.stateful ? () => randomUUID() : undefined,
      onsessioninitialized: opts.stateful
        ? (sid) => {
            sessions.set(sid, pair);
            logger.info("http.session.initialized", { sid });
          }
        : undefined,
      onsessionclosed: opts.stateful
        ? (sid) => {
            logger.info("http.session.closed", { sid });
            sessions.delete(sid);
            try { pair.server?.close?.(); } catch { /* ignore */ }
          }
        : undefined,
    });
    const server = new McpMinecraftServer(bot);
    await server.serve(transport);
    pair.transport = transport;
    pair.server = server;
    return pair;
  }

  httpServer = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === opts.healthPath) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }

    if (!req.url || !req.url.startsWith(opts.httpPath)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
      return;
    }

    try {
      let body;
      if (req.method === "POST") {
        body = await readBody(req);
      }

      let pair;
      if (!opts.stateful) {
        // Stateless: one shared transport, create on demand.
        if (!statelessPair) statelessPair = await createSession();
        pair = statelessPair;
      } else {
        const sid = req.headers["mcp-session-id"];
        const sessionId = Array.isArray(sid) ? sid[0] : sid;

        if (sessionId && sessions.has(sessionId)) {
          pair = sessions.get(sessionId);
        } else if (!sessionId && body && isInitializeRequest(body)) {
          pair = await createSession();
          // Session registration happens inside onsessioninitialized callback
          // (set in createSession, called during handleRequest).
        } else {
          writeJson(res, 400, {
            jsonrpc: "2.0",
            error: { code: -32000, message: "Bad Request: No valid session ID provided" },
            id: null,
          });
          return;
        }
      }

      await pair.transport.handleRequest(req, res, body);
    } catch (err) {
      logger.error("http.handleRequest.error", {
        err: String(err?.message ?? err),
        method: req.method,
        url: req.url,
      });
      if (!res.headersSent) {
        writeJson(res, 500, {
          jsonrpc: "2.0",
          error: { code: -32603, message: String(err?.message ?? err) },
          id: null,
        });
      } else {
        try { res.end(); } catch { /* ignore */ }
      }
    }
  });

  httpServer.on("error", (err) => {
    logger.error("http.serverError", { err: String(err?.message ?? err) });
    shutdown(1, "http.serverError");
  });

  httpServer.listen(opts.httpPort, "127.0.0.1", () => {
    logger.info("http.listening", {
      port: opts.httpPort,
      mcp: opts.httpPath,
      health: opts.healthPath,
      stateful: opts.stateful,
    });
  });
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err?.stack ?? err}\n`);
  process.exit(1);
});
