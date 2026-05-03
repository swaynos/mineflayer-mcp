// src/logger.js
// Structured stderr logger. Stdout is reserved for MCP JSON-RPC traffic.
// All logs emit as one JSON object per line to process.stderr.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function currentLevel() {
  const raw = (process.env.LOG_LEVEL || "info").toLowerCase();
  return LEVELS[raw] ?? LEVELS.info;
}

export function log(level, msg, fields) {
  const threshold = currentLevel();
  const lvl = LEVELS[level] ?? LEVELS.info;
  if (lvl < threshold) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(fields && typeof fields === "object" ? fields : {}),
  };
  let line;
  try {
    line = JSON.stringify(entry);
  } catch {
    line = JSON.stringify({ ts: entry.ts, level, msg, note: "unserializable fields" });
  }
  try {
    process.stderr.write(line + "\n");
  } catch {
    // best effort; never throw from logger
  }
}

export const logger = {
  debug: (msg, fields) => log("debug", msg, fields),
  info: (msg, fields) => log("info", msg, fields),
  warn: (msg, fields) => log("warn", msg, fields),
  error: (msg, fields) => log("error", msg, fields),
};

export default logger;
