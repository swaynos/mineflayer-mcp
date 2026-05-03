// src/lock.js
// Single-instance guard via PID lockfile.

import { readFile, writeFile, unlink } from "node:fs/promises";
import { McpError, ErrorCodes } from "./errors.js";

/**
 * Acquire an exclusive lock at `path`. If another live process holds the lock,
 * throws McpError(-32000). A stale lock (PID not alive) is overwritten.
 *
 * @param {string} path
 * @returns {Promise<() => Promise<void>>} release function (idempotent best-effort)
 */
export async function acquireLock(path) {
  try {
    const raw = await readFile(path, "utf8");
    const pid = Number.parseInt(raw.trim(), 10);
    if (Number.isInteger(pid) && pid > 0) {
      let alive = false;
      try {
        process.kill(pid, 0);
        alive = true;
      } catch (err) {
        // ESRCH: no such process -> stale
        // EPERM: exists but we can't signal -> treat as alive to be safe
        alive = err && err.code === "EPERM";
      }
      if (alive) {
        throw new McpError(
          ErrorCodes.SERVER_STARTUP,
          `Another instance is running (lock=${path}, pid=${pid})`,
          { pid, lockPath: path }
        );
      }
    }
    // stale — fall through to overwrite
  } catch (err) {
    if (err instanceof McpError) throw err;
    if (err && err.code !== "ENOENT") {
      throw new McpError(
        ErrorCodes.SERVER_STARTUP,
        `Failed to read lockfile ${path}: ${err.message}`,
        { cause: err.message }
      );
    }
    // ENOENT — no prior lock, fresh acquisition
  }

  try {
    await writeFile(path, String(process.pid), { encoding: "utf8" });
  } catch (err) {
    throw new McpError(
      ErrorCodes.SERVER_STARTUP,
      `Failed to write lockfile ${path}: ${err.message}`,
      { cause: err.message }
    );
  }

  let released = false;
  return async function release() {
    if (released) return;
    released = true;
    try {
      await unlink(path);
    } catch {
      // best-effort
    }
  };
}
