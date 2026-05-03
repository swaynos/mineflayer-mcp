// src/errors.js
// Custom McpError and normalizeError helper. Only source of truth for error shaping.
// No handler may throw raw to the MCP layer.

import { ZodError } from "zod";

export const ErrorCodes = Object.freeze({
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
  SERVER_STARTUP: -32000,
  BOT_NOT_READY: -32001,
  CHUNKS_NOT_LOADED: -32002,
});

export class McpError extends Error {
  constructor(code, message, data) {
    super(message);
    this.name = "McpError";
    this.code = code;
    if (data !== undefined) this.data = data;
  }

  toJSON() {
    const out = { code: this.code, message: this.message };
    if (this.data !== undefined) out.data = this.data;
    return out;
  }
}

/**
 * Normalize anything that was thrown into a JSON-RPC-shaped error object.
 * The outer MCP layer converts this into `{ content, isError: true }`.
 *
 * @param {unknown} err
 * @param {string} [context] human-readable operation context
 * @returns {{ code: number, message: string, data?: unknown }}
 */
export function normalizeError(err, context) {
  // 1. McpError — trust it as-is.
  if (err instanceof McpError) {
    return {
      code: err.code,
      message: err.message,
      ...(err.data !== undefined ? { data: err.data } : {}),
    };
  }

  // 2. ZodError — invalid params.
  if (err instanceof ZodError) {
    return {
      code: ErrorCodes.INVALID_PARAMS,
      message: "Invalid params",
      data: {
        errors: err.errors.map((e) => ({
          path: e.path,
          message: e.message,
          code: e.code,
        })),
      },
    };
  }

  // 3. Error — wrap with context.
  if (err instanceof Error) {
    const base = context ? `${context}: ${err.message}` : err.message;
    return {
      code: ErrorCodes.INTERNAL,
      message: base,
      data: { stack: err.stack, name: err.name },
    };
  }

  // 4. Plain object with `message`.
  if (err && typeof err === "object" && typeof err.message === "string") {
    const code = typeof err.code === "number" ? err.code : ErrorCodes.INTERNAL;
    const msg = context ? `${context}: ${err.message}` : err.message;
    return { code, message: msg, data: err };
  }

  // 5. String.
  if (typeof err === "string" && err.length > 0) {
    return {
      code: ErrorCodes.INTERNAL,
      message: context ? `${context}: ${err}` : err,
    };
  }

  // 6. Fallback — never return "[object Object]".
  let stringified;
  try {
    stringified = typeof err === "object" ? JSON.stringify(err) : String(err);
  } catch {
    stringified = "";
  }
  if (!stringified || stringified === "[object Object]" || stringified === "{}") {
    stringified = "Unknown error";
  }
  return {
    code: ErrorCodes.INTERNAL,
    message: context ? `${context}: ${stringified}` : stringified,
  };
}
