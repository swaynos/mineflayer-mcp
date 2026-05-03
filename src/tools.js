// src/tools.js
// Tool schemas and dispatcher. Every advertised tool in TOOLS MUST have a case in dispatch().
// assertCompleteness() runs at module load to enforce this structurally — the single guard
// against the upstream mcpmc bug (advertised tool with no dispatch case).

import { z } from "zod";
import { McpError, ErrorCodes } from "./errors.js";

// ---------- JSON-Schema descriptors (returned by tools/list) ----------

export const TOOLS = Object.freeze([
  {
    name: "chat",
    description: "Send a chat message in Minecraft as the MathBridgeBot.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", minLength: 1, maxLength: 256 },
      },
      required: ["message"],
      additionalProperties: false,
    },
  },
  {
    name: "get_position",
    description: "Get the bot's current position (x,y,z), dimension, yaw, and pitch.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "find_blocks",
    description:
      "Find nearby blocks of given types around the bot. Returns an array of { name, position, distance }.",
    inputSchema: {
      type: "object",
      properties: {
        blockTypes: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 16,
          description: "Block names like 'stone' or 'minecraft:oak_log'.",
        },
        maxDistance: { type: "integer", minimum: 1, maximum: 64, default: 16 },
        maxCount: { type: "integer", minimum: 1, maximum: 32, default: 4 },
      },
      required: ["blockTypes"],
      additionalProperties: false,
    },
  },
  {
    name: "inspect_inventory",
    description: "List the bot's current inventory as an array of { name, count, slot }.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
]);

// ---------- Zod schemas for argument validation ----------

export const SCHEMAS = Object.freeze({
  chat: z.object({ message: z.string().min(1).max(256) }).strict(),
  get_position: z.object({}).strict(),
  find_blocks: z
    .object({
      blockTypes: z.array(z.string().min(1)).min(1).max(16),
      maxDistance: z.number().int().min(1).max(64).default(16),
      maxCount: z.number().int().min(1).max(32).default(4),
    })
    .strict(),
  inspect_inventory: z.object({}).strict(),
});

// ---------- Dispatch ----------

/**
 * Dispatch a tool call against the given Bot. Returns an MCP-style content envelope.
 * Throws McpError on any error — the server.js layer converts to JSON-RPC error.
 */
export async function dispatch(name, rawArgs, bot) {
  const schema = SCHEMAS[name];
  if (!schema) {
    throw new McpError(ErrorCodes.METHOD_NOT_FOUND, `Unknown tool: ${name}`);
  }
  if (!DISPATCHED.has(name)) {
    // Defense in depth: should be impossible given assertCompleteness.
    throw new McpError(
      ErrorCodes.METHOD_NOT_FOUND,
      `Tool ${name} advertised but not dispatched (internal bug)`
    );
  }

  // Zod parse — let ZodError propagate for server.js normalization.
  const args = schema.parse(rawArgs ?? {});

  switch (name) {
    case "chat": {
      const result = await bot.chat(args.message);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ok: true, sent: result.sent }),
          },
        ],
      };
    }
    case "get_position": {
      const pos = await bot.getPosition();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(pos),
          },
        ],
      };
    }
    case "find_blocks": {
      const blocks = await bot.findBlocks(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: blocks.length, blocks }),
          },
        ],
      };
    }
    case "inspect_inventory": {
      const inv = await bot.inspectInventory();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ count: inv.length, items: inv }),
          },
        ],
      };
    }
    default:
      // Unreachable given assertCompleteness — still return a proper McpError rather than
      // a raw throw (the upstream mcpmc bug).
      throw new McpError(ErrorCodes.METHOD_NOT_FOUND, `Unknown tool: ${name}`);
  }
}

// ---------- Structural completeness guard ----------
// The SINGLE guard against the mcpmc bug this project exists to replace.
// If tools are advertised without dispatch cases (or vice versa), we fail at import time.

const DISPATCHED = new Set(["chat", "get_position", "find_blocks", "inspect_inventory"]);

export function assertCompleteness() {
  const advertised = new Set(TOOLS.map((t) => t.name));
  const missing = [];
  const extraDispatched = [];
  const missingSchemas = [];

  for (const name of advertised) {
    if (!DISPATCHED.has(name)) missing.push(name);
    if (!SCHEMAS[name]) missingSchemas.push(name);
  }
  for (const name of DISPATCHED) {
    if (!advertised.has(name)) extraDispatched.push(name);
  }

  if (missing.length || extraDispatched.length || missingSchemas.length) {
    const details = {
      advertisedWithoutDispatch: missing,
      dispatchedWithoutAdvertise: extraDispatched,
      advertisedWithoutSchema: missingSchemas,
    };
    throw new Error(
      `tools.js completeness check FAILED: ${JSON.stringify(details)}`
    );
  }
  return true;
}

// Run at import time.
assertCompleteness();
