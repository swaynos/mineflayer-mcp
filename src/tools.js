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
  {
    name: "read_recent_chat",
    description:
      "Return buffered chat messages received since a given timestamp. " +
      "Useful for observing what other players (or bots) have said in the world. " +
      "Returns an array of { timestamp, username, message, type }.",
    inputSchema: {
      type: "object",
      properties: {
        since: {
          type: "number",
          description: "Unix epoch milliseconds. Only messages received after this time are returned. Defaults to 0 (all buffered).",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 50,
          description: "Maximum number of messages to return. Defaults to 50.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_nearby_players",
    description:
      "List players currently visible near the bot. " +
      "Returns an array of { username, uuid, position, distance, ping, gamemode }.",
    inputSchema: {
      type: "object",
      properties: {
        maxDistance: {
          type: "integer",
          minimum: 1,
          maximum: 256,
          default: 64,
          description: "Maximum distance in blocks to search. Defaults to 64.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_biome",
    description:
      "Get the biome at the bot's current position. " +
      "Returns { biome, biomeId, position }.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "look_at",
    description:
      "Rotate the bot's head to face a specific coordinate (x, y, z). " +
      "Returns the resulting { yaw, pitch, target }.",
    inputSchema: {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        z: { type: "number" },
        force: {
          type: "boolean",
          default: false,
          description: "If true, snap instantly rather than interpolating.",
        },
      },
      required: ["x", "y", "z"],
      additionalProperties: false,
    },
  },
  {
    name: "look_at_player",
    description:
      "Rotate the bot's head to face a named player. " +
      "Returns the resulting { yaw, pitch, target }.",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string", description: "Exact in-game username of the player to look at." },
        atFeet: {
          type: "boolean",
          default: false,
          description: "If true, aim at the player's feet rather than eye level.",
        },
      },
      required: ["username"],
      additionalProperties: false,
    },
  },
  {
    name: "get_health",
    description:
      "Get the bot's current health, food level, and saturation. " +
      "Returns { health, food, saturation, alive }.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "list_nearby_entities",
    description:
      "List entities (mobs, items, projectiles) near the bot. " +
      "Returns an array of { id, type, displayName, username, position, distance, isHostile, health }.",
    inputSchema: {
      type: "object",
      properties: {
        maxDistance: {
          type: "integer",
          minimum: 1,
          maximum: 64,
          default: 16,
          description: "Maximum distance in blocks to search. Defaults to 16.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "navigate_to",
    description:
      "Navigate the bot to an absolute world coordinate using pathfinding. " +
      "Returns { reached, position, target }.",
    inputSchema: {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        z: { type: "number" },
        tolerance: { type: "number", minimum: 0, default: 1, description: "How close to get (blocks). Default 1." },
        timeoutMs: { type: "integer", minimum: 1000, maximum: 120000, default: 30000 },
      },
      required: ["x", "y", "z"],
      additionalProperties: false,
    },
  },
  {
    name: "navigate_relative",
    description:
      "Navigate the bot by a relative offset (dx, dy, dz) from its current position. " +
      "Returns { reached, position, target }.",
    inputSchema: {
      type: "object",
      properties: {
        dx: { type: "number" },
        dy: { type: "number" },
        dz: { type: "number" },
        tolerance: { type: "number", minimum: 0, default: 1 },
        timeoutMs: { type: "integer", minimum: 1000, maximum: 120000, default: 30000 },
      },
      required: ["dx", "dy", "dz"],
      additionalProperties: false,
    },
  },
  {
    name: "get_time_of_day",
    description:
      "Get the current in-game time of day. Returns { timeOfDay, age, phase, isDay }.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_weather",
    description:
      "Get the current in-game weather. Returns { weather, isRaining, thunderState }.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "place_block",
    description:
      "Place the currently held item as a block at a position relative to the bot's feet. " +
      "The bot must be holding a placeable block and must be within reach (~4 blocks). " +
      "Returns { ok, placed, position }.",
    inputSchema: {
      type: "object",
      properties: {
        dx: { type: "integer", description: "X offset from bot feet position." },
        dy: { type: "integer", description: "Y offset from bot feet position." },
        dz: { type: "integer", description: "Z offset from bot feet position." },
      },
      required: ["dx", "dy", "dz"],
      additionalProperties: false,
    },
  },
  {
    name: "dig_block",
    description:
      "Dig (break) a block at a position relative to the bot's feet. " +
      "Returns { ok, dug, position }.",
    inputSchema: {
      type: "object",
      properties: {
        dx: { type: "integer", description: "X offset from bot feet position." },
        dy: { type: "integer", description: "Y offset from bot feet position." },
        dz: { type: "integer", description: "Z offset from bot feet position." },
      },
      required: ["dx", "dy", "dz"],
      additionalProperties: false,
    },
  },
  {
    name: "use_item",
    description:
      "Activate (right-click use) the item currently in the bot's hand. " +
      "Returns { ok, hand, item }.",
    inputSchema: {
      type: "object",
      properties: {
        hand: { type: "string", enum: ["right", "left"], default: "right" },
      },
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
  read_recent_chat: z
    .object({
      since: z.number().min(0).default(0),
      limit: z.number().int().min(1).max(100).default(50),
    })
    .strict(),
  list_nearby_players: z
    .object({
      maxDistance: z.number().int().min(1).max(256).default(64),
    })
    .strict(),
  get_biome: z.object({}).strict(),
  look_at: z
    .object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
      force: z.boolean().default(false),
    })
    .strict(),
  look_at_player: z
    .object({
      username: z.string().min(1),
      atFeet: z.boolean().default(false),
    })
    .strict(),
  get_health: z.object({}).strict(),
  list_nearby_entities: z
    .object({
      maxDistance: z.number().int().min(1).max(64).default(16),
    })
    .strict(),
  navigate_to: z
    .object({
      x: z.number(),
      y: z.number(),
      z: z.number(),
      tolerance: z.number().min(0).default(1),
      timeoutMs: z.number().int().min(1000).max(120000).default(30000),
    })
    .strict(),
  navigate_relative: z
    .object({
      dx: z.number(),
      dy: z.number(),
      dz: z.number(),
      tolerance: z.number().min(0).default(1),
      timeoutMs: z.number().int().min(1000).max(120000).default(30000),
    })
    .strict(),
  get_time_of_day: z.object({}).strict(),
  get_weather: z.object({}).strict(),
  place_block: z
    .object({ dx: z.number().int(), dy: z.number().int(), dz: z.number().int() })
    .strict(),
  dig_block: z
    .object({ dx: z.number().int(), dy: z.number().int(), dz: z.number().int() })
    .strict(),
  use_item: z
    .object({ hand: z.enum(["right", "left"]).default("right") })
    .strict(),
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
    case "read_recent_chat": {
      const messages = bot.readRecentChat({ since: args.since, limit: args.limit });
      return {
        content: [{ type: "text", text: JSON.stringify({ count: messages.length, messages }) }],
      };
    }
    case "list_nearby_players": {
      const players = bot.listNearbyPlayers({ maxDistance: args.maxDistance });
      return {
        content: [{ type: "text", text: JSON.stringify({ count: players.length, players }) }],
      };
    }
    case "get_biome": {
      const biome = bot.getBiome();
      return {
        content: [{ type: "text", text: JSON.stringify(biome) }],
      };
    }
    case "look_at": {
      const result = await bot.lookAt({ x: args.x, y: args.y, z: args.z, force: args.force });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }
    case "look_at_player": {
      const result = await bot.lookAtPlayer({ username: args.username, atFeet: args.atFeet });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
      };
    }
    case "get_health": {
      const health = bot.getHealth();
      return {
        content: [{ type: "text", text: JSON.stringify(health) }],
      };
    }
    case "list_nearby_entities": {
      const entities = bot.listNearbyEntities({ maxDistance: args.maxDistance });
      return {
        content: [{ type: "text", text: JSON.stringify({ count: entities.length, entities }) }],
      };
    }
    case "navigate_to": {
      const result = await bot.navigateTo({
        x: args.x, y: args.y, z: args.z,
        tolerance: args.tolerance, timeoutMs: args.timeoutMs,
      });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    case "navigate_relative": {
      const result = await bot.navigateRelative({
        dx: args.dx, dy: args.dy, dz: args.dz,
        tolerance: args.tolerance, timeoutMs: args.timeoutMs,
      });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    case "get_time_of_day": {
      const time = bot.getTimeOfDay();
      return { content: [{ type: "text", text: JSON.stringify(time) }] };
    }
    case "get_weather": {
      const weather = bot.getWeather();
      return { content: [{ type: "text", text: JSON.stringify(weather) }] };
    }
    case "place_block": {
      const result = await bot.placeBlock({ dx: args.dx, dy: args.dy, dz: args.dz });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    case "dig_block": {
      const result = await bot.digBlock({ dx: args.dx, dy: args.dy, dz: args.dz });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    case "use_item": {
      const result = await bot.useItem({ hand: args.hand });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
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

const DISPATCHED = new Set([
  "chat", "get_position", "find_blocks", "inspect_inventory",
  "read_recent_chat", "list_nearby_players", "get_biome",
  "look_at", "look_at_player", "get_health", "list_nearby_entities",
  "navigate_to", "navigate_relative", "get_time_of_day", "get_weather",
  "place_block", "dig_block", "use_item",
]);

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
