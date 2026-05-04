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
    description: "Send a chat message in Minecraft as the bot.",
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
  {
    name: "craft_item",
    description:
      "Craft an item from materials in the bot's inventory. " +
      "Uses the bot's 2x2 inventory grid for simple recipes, or requires a crafting table " +
      "to be within reach for 3x3 recipes. " +
      "Returns { ok, crafted, count, consumed }.",
    inputSchema: {
      type: "object",
      properties: {
        itemName: {
          type: "string",
          description: "The item to craft, e.g. 'oak_planks', 'crafting_table', 'stick'.",
        },
        count: {
          type: "integer",
          minimum: 1,
          maximum: 64,
          default: 1,
          description: "Number of items to craft (crafting happens in batches per recipe yield).",
        },
      },
      required: ["itemName"],
      additionalProperties: false,
    },
  },
  {
    name: "attack_entity",
    description:
      "Attack (hit) an entity by its numeric entity ID. " +
      "The entity must be within reach (~4 blocks). " +
      "Returns { ok, entityId, damageDealt }.",
    inputSchema: {
      type: "object",
      properties: {
        entity_id: {
          type: "integer",
          description: "Numeric entity ID as reported by list_nearby_entities.",
        },
      },
      required: ["entity_id"],
      additionalProperties: false,
    },
  },
  {
    name: "activate_block",
    description:
      "Right-click (activate) a block at a position relative to the bot's feet. " +
      "Works on interactive blocks: doors, buttons, levers, chests, furnaces, etc. " +
      "Returns { ok, blockName, position }.",
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
    name: "equip_item",
    description:
      "Equip a specific named item from the bot's inventory to hand or armor slot. " +
      "Returns { ok, equipped, destination }.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Item name to equip, e.g. 'wooden_pickaxe', 'beef', 'diamond_chestplate'.",
        },
        destination: {
          type: "string",
          enum: ["hand", "off-hand", "head", "torso", "legs", "feet"],
          default: "hand",
          description: "Equip destination: 'hand' (default), 'off-hand', or armor slots.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "drop_item",
    description:
      "Drop a quantity of a named item from the bot's inventory on the ground. " +
      "Returns { ok, dropped, count }.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Item name to drop, e.g. 'beef', 'sand', 'wooden_pickaxe'.",
        },
        count: {
          type: "integer",
          minimum: 1,
          maximum: 64,
          default: 1,
          description: "Number of items to drop. Defaults to 1.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "open_container",
    description:
      "Open a container (chest, furnace, etc.) at a position relative to the bot's feet. " +
      "Returns { ok, blockName, position, contents } where contents is the container's item list.",
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
    name: "take_item",
    description:
      "Take items from the currently-open container into the bot's inventory. " +
      "Returns { ok, taken, count }.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the item to take from the container.",
        },
        count: {
          type: "integer",
          minimum: 1,
          maximum: 64,
          default: 1,
          description: "Number of items to take. Defaults to 1.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "deposit_item",
    description:
      "Deposit items from the bot's inventory into the currently-open container. " +
      "Returns { ok, deposited, count }.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the item to deposit into the container.",
        },
        count: {
          type: "integer",
          minimum: 1,
          maximum: 64,
          default: 1,
          description: "Number of items to deposit. Defaults to 1.",
        },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "close_container",
    description:
      "Close the currently-open container. " +
      "Returns { ok }.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "eat",
    description:
      "Consume the food item currently in the bot's hand (or find food in inventory and equip it). " +
      "Returns { ok, consumed, foodBefore, foodAfter }.",
    inputSchema: {
      type: "object",
      properties: {
        itemName: {
          type: "string",
          description: "Optional: name of food item to equip and eat. If omitted, eats whatever is in hand.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "sleep",
    description:
      "Attempt to sleep in the nearest bed. Only works at night or during thunderstorm. " +
      "Returns { ok, slept, wokeAt } or error.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "follow_player",
    description:
      "Follow a named player, staying within a given distance. " +
      "Runs until the leader stops for a set period or timeout. " +
      "Returns { ok, followed, duration }.",
    inputSchema: {
      type: "object",
      properties: {
        username: {
          type: "string",
          description: "Exact in-game username of the player to follow.",
        },
        distance: {
          type: "number",
          minimum: 1,
          maximum: 32,
          default: 2,
          description: "Target following distance in blocks. Defaults to 2.",
        },
        timeoutMs: {
          type: "integer",
          minimum: 1000,
          maximum: 120000,
          default: 30000,
          description: "Maximum follow duration in ms. Defaults to 30000.",
        },
      },
      required: ["username"],
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
  craft_item: z
    .object({
      itemName: z.string().min(1).max(64),
      count: z.number().int().min(1).max(64).default(1),
    })
    .strict(),
  attack_entity: z
    .object({
      entity_id: z.number().int(),
    })
    .strict(),
  activate_block: z
    .object({ dx: z.number().int(), dy: z.number().int(), dz: z.number().int() })
    .strict(),
  equip_item: z
    .object({
      name: z.string().min(1).max(64),
      destination: z.enum(["hand", "off-hand", "head", "torso", "legs", "feet"]).default("hand"),
    })
    .strict(),
  drop_item: z
    .object({
      name: z.string().min(1).max(64),
      count: z.number().int().min(1).max(64).default(1),
    })
    .strict(),
  open_container: z
    .object({ dx: z.number().int(), dy: z.number().int(), dz: z.number().int() })
    .strict(),
  take_item: z
    .object({
      name: z.string().min(1).max(64),
      count: z.number().int().min(1).max(64).default(1),
    })
    .strict(),
  deposit_item: z
    .object({
      name: z.string().min(1).max(64),
      count: z.number().int().min(1).max(64).default(1),
    })
    .strict(),
  close_container: z.object({}).strict(),
  eat: z
    .object({
      itemName: z.string().min(1).max(64).optional(),
    })
    .strict(),
  sleep: z.object({}).strict(),
  follow_player: z
    .object({
      username: z.string().min(1).max(64),
      distance: z.number().min(1).max(32).default(2),
      timeoutMs: z.number().int().min(1000).max(120000).default(30000),
    })
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
    case "craft_item": {
      const result = await bot.craftItem({ itemName: args.itemName, count: args.count });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    case "attack_entity": {
      const result = await bot.attackEntity({ entity_id: args.entity_id });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    case "activate_block": {
      const result = await bot.activateBlock({ dx: args.dx, dy: args.dy, dz: args.dz });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    case "equip_item": {
      const result = await bot.equipItem({ name: args.name, destination: args.destination });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    case "drop_item": {
      const result = await bot.dropItem({ name: args.name, count: args.count });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    case "open_container": {
      const result = await bot.openContainer({ dx: args.dx, dy: args.dy, dz: args.dz });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    case "take_item": {
      const result = await bot.takeItem({ name: args.name, count: args.count });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    case "deposit_item": {
      const result = await bot.depositItem({ name: args.name, count: args.count });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    case "close_container": {
      const result = await bot.closeContainer();
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    case "eat": {
      const result = await bot.eat({ itemName: args.itemName });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    case "sleep": {
      const result = await bot.sleep();
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }
    case "follow_player": {
      const result = await bot.followPlayer({
        username: args.username,
        distance: args.distance,
        timeoutMs: args.timeoutMs,
      });
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
  "place_block", "dig_block", "use_item", "craft_item", "attack_entity",
  "activate_block", "equip_item", "drop_item",
  "open_container", "take_item", "deposit_item", "close_container",
  "eat", "sleep", "follow_player",
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
