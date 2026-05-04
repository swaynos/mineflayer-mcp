#!/usr/bin/env node
// src/index.js
// CLI entrypoint. Parses args, acquires single-instance lock, connects bot, serves MCP over stdio.

import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { Bot } from "./bot.js";
import { McpMinecraftServer } from "./server.js";
import { acquireLock } from "./lock.js";
import { McpError, ErrorCodes } from "./errors.js";
import { logger } from "./logger.js";

const USAGE = `
Usage:
  minecraft-mcp --host <host> --port <port> --username <name> \\
                [--lock <path>] [--log-level <level>] [--version <mcver>]

Required:
  --host <host>         Minecraft server host (e.g. localhost)
  --port <port>         Minecraft server port (e.g. 1234)
  --username <name>     Bot username (e.g. my-bot)

Optional:
  --lock <path>         Lockfile path (default /tmp/mathbridgebot.lock)
  --log-level <level>   debug|info|warn|error (default info)
  --version <mcver>     Force mineflayer Minecraft version (default: auto-detect)
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
        lock: { type: "string", default: "/tmp/mathbridgebot.lock" },
        "log-level": { type: "string", default: "info" },
        version: { type: "string" },
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

  const portNum = Number.parseInt(v.port, 10);
  if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) {
    die(2, `invalid --port value: ${v.port}`);
  }
  if (v["log-level"]) process.env.LOG_LEVEL = v["log-level"];

  return {
    host: v.host,
    port: portNum,
    username: v.username,
    lockPath: v.lock,
    version: v.version || undefined,
  };
}

async function main() {
  const opts = parseCli();
  logger.info("startup", {
    host: opts.host,
    port: opts.port,
    username: opts.username,
    lockPath: opts.lockPath,
    pid: process.pid,
  });

  let release;
  try {
    release = await acquireLock(opts.lockPath);
  } catch (err) {
    if (err instanceof McpError) {
      die(1, `startup failed: ${err.message}`);
    }
    die(1, `startup failed: ${err?.message ?? String(err)}`);
  }

  const shutdown = async (code, reason) => {
    logger.info("shutdown", { code, reason });
    try { bot?.disconnect?.(); } catch { /* ignore */ }
    try { await server?.close?.(); } catch { /* ignore */ }
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

  const bot = new Bot({ host: opts.host, port: opts.port, username: opts.username, version: opts.version });

  // If bot ends after spawn, exit so systemd can restart us cleanly.
  // Exit 0 on intentional duplicate-login kicks (to avoid restart loops chasing another instance).
  bot.onEnd(({ reason, intentional }) => {
    logger.warn("bot.lifecycleEnd", { reason: String(reason ?? ""), intentional });
    if (intentional) {
      shutdown(0, `bot ended intentionally: ${reason}`);
    } else {
      shutdown(1, `bot ended: ${reason}`);
    }
  });

  try {
    await bot.connect();
  } catch (err) {
    const msg = err instanceof McpError ? err.message : (err?.message ?? String(err));
    logger.error("bot.connectFailed", { err: msg });
    await release().catch(() => {});
    die(1, `bot connect failed: ${msg}`);
  }

  const server = new McpMinecraftServer(bot);
  const transport = new StdioServerTransport();
  try {
    await server.serve(transport);
  } catch (err) {
    logger.error("server.serveFailed", { err: String(err?.message ?? err) });
    await shutdown(1, "server.serveFailed");
  }
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err?.stack ?? err}\n`);
  process.exit(1);
});
