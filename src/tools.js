// src/tools.js
// Consolidated 9-tool surface for nano-tier model compatibility.
// Dispatches to the underlying Bot methods in bot.js.
//
// Tool count: 9 (observe, move, chat, dig, place, attack, use, inventory, status)
// Token budget target: ≤8,000 tokens (estimated by JSON.stringify(TOOLS).length / 4)

import { z } from "zod";
import { McpError, ErrorCodes } from "./errors.js";

// ---------- JSON-Schema descriptors (returned by tools/list) ----------

export const TOOLS = Object.freeze([
  {
    name: "observe",
    description: "Read information about the world, the bot, or nearby entities.",
    inputSchema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          enum: ["position", "health", "world", "players", "entities", "blocks", "chat"],
          description: "What to observe. position=coords/yaw/pitch, health=hp/food/saturation, world=biome/time/weather, players=nearby players list, entities=nearby mobs/items, blocks=find nearby blocks by type, chat=recent chat messages.",
        },
        blockTypes: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 16,
          description: "Required for target=blocks. Block names e.g. ['oak_log','stone'].",
        },
        maxDistance: {
          type: "integer",
          minimum: 1,
          maximum: 256,
          description: "For players: max 256 (default 64). For entities/blocks: max 64 (default 16).",
        },
        maxCount: {
          type: "integer",
          minimum: 1,
          maximum: 32,
          description: "For target=blocks: max results (default 4).",
        },
        since: {
          type: "number",
          description: "For target=chat: Unix ms timestamp filter (default 0 = all buffered).",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "For target=chat: max messages (default 50).",
        },
      },
      required: ["target"],
      additionalProperties: false,
    },
  },
  {
    name: "move",
    description: "Navigate to a location, look at a target, or follow a player.",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["to", "relative", "look", "look_at_player", "follow"],
          description: "to=navigate to absolute coords, relative=navigate by offset, look=face coords, look_at_player=face named player, follow=follow named player.",
        },
        x: { type: "number", description: "Absolute X (mode=to or mode=look)." },
        y: { type: "number", description: "Absolute Y (mode=to or mode=look)." },
        z: { type: "number", description: "Absolute Z (mode=to or mode=look)." },
        dx: { type: "number", description: "X offset from current pos (mode=relative)." },
        dy: { type: "number", description: "Y offset from current pos (mode=relative)." },
        dz: { type: "number", description: "Z offset from current pos (mode=relative)." },
        username: { type: "string", description: "Player username (mode=follow or mode=look_at_player)." },
        tolerance: { type: "number", minimum: 0, description: "Distance tolerance in blocks (mode=to or mode=relative, default 1)." },
        timeoutMs: { type: "integer", minimum: 1000, maximum: 120000, description: "Timeout ms (mode=to, relative, follow; default 30000)." },
        force: { type: "boolean", description: "Snap instantly without interpolation (mode=look, default false)." },
        atFeet: { type: "boolean", description: "Look at feet instead of eye level (mode=look_at_player, default false)." },
        distance: { type: "number", minimum: 1, maximum: 32, description: "Follow distance in blocks (mode=follow, default 2)." },
      },
      required: ["mode"],
      additionalProperties: false,
    },
  },
  {
    name: "chat",
    description: "Send a message in the Minecraft chat.",
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
    name: "dig",
    description: "Break a block near the bot.",
    inputSchema: {
      type: "object",
      properties: {
        dx: { type: "integer", description: "X offset from bot feet." },
        dy: { type: "integer", description: "Y offset from bot feet." },
        dz: { type: "integer", description: "Z offset from bot feet." },
      },
      required: ["dx", "dy", "dz"],
      additionalProperties: false,
    },
  },
  {
    name: "place",
    description: "Place a block from inventory at a nearby position.",
    inputSchema: {
      type: "object",
      properties: {
        dx: { type: "integer", description: "X offset from bot feet." },
        dy: { type: "integer", description: "Y offset from bot feet." },
        dz: { type: "integer", description: "Z offset from bot feet." },
      },
      required: ["dx", "dy", "dz"],
      additionalProperties: false,
    },
  },
  {
    name: "attack",
    description: "Hit a nearby entity (mob or player).",
    inputSchema: {
      type: "object",
      properties: {
        entity_id: {
          type: "integer",
          description: "Numeric entity ID from observe target=entities.",
        },
      },
      required: ["entity_id"],
      additionalProperties: false,
    },
  },
  {
    name: "use",
    description: "Use an item, activate a block, eat food, sleep, or craft.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["item", "block", "eat", "sleep", "craft"],
          description: "item=use held item, block=right-click block at offset, eat=consume food, sleep=sleep in nearest bed, craft=craft item by name.",
        },
        dx: { type: "integer", description: "X offset from bot feet (action=block)." },
        dy: { type: "integer", description: "Y offset from bot feet (action=block)." },
        dz: { type: "integer", description: "Z offset from bot feet (action=block)." },
        hand: { type: "string", enum: ["right", "left"], description: "Hand to use (action=item, default right)." },
        itemName: { type: "string", description: "Food to eat (action=eat, optional) or item to craft (action=craft, required)." },
        count: { type: "integer", minimum: 1, maximum: 64, description: "Craft count (action=craft, default 1)." },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "inventory",
    description: "Inspect, equip, drop, or manage container contents.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["inspect", "equip", "drop", "open", "take", "deposit", "close"],
          description: "inspect=list items, equip=equip item to slot, drop=drop on ground, open=open container at offset, take=take from open container, deposit=put into open container, close=close container.",
        },
        name: { type: "string", description: "Item name (action=equip/drop/take/deposit)." },
        count: { type: "integer", minimum: 1, maximum: 64, description: "Quantity (action=drop/take/deposit, default 1)." },
        destination: {
          type: "string",
          enum: ["hand", "off-hand", "head", "torso", "legs", "feet"],
          description: "Equip destination (action=equip, default hand).",
        },
        dx: { type: "integer", description: "X offset from bot feet (action=open)." },
        dy: { type: "integer", description: "Y offset from bot feet (action=open)." },
        dz: { type: "integer", description: "Z offset from bot feet (action=open)." },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "status",
    description: "Quick self-check: position, health, and food in one call.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
]);

// ---------- Zod schemas for argument validation ----------

export const SCHEMAS = Object.freeze({
  observe: z
    .object({
      target: z.enum(["position", "health", "world", "players", "entities", "blocks", "chat"]),
      blockTypes: z.array(z.string().min(1)).min(1).max(16).optional(),
      maxDistance: z.number().int().min(1).max(256).optional(),
      maxCount: z.number().int().min(1).max(32).optional(),
      since: z.number().min(0).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    })
    .strict(),

  move: z
    .object({
      mode: z.enum(["to", "relative", "look", "look_at_player", "follow"]),
      x: z.number().optional(),
      y: z.number().optional(),
      z: z.number().optional(),
      dx: z.number().optional(),
      dy: z.number().optional(),
      dz: z.number().optional(),
      username: z.string().min(1).optional(),
      tolerance: z.number().min(0).optional(),
      timeoutMs: z.number().int().min(1000).max(120000).optional(),
      force: z.boolean().optional(),
      atFeet: z.boolean().optional(),
      distance: z.number().min(1).max(32).optional(),
    })
    .strict(),

  chat: z.object({ message: z.string().min(1).max(256) }).strict(),

  dig: z
    .object({ dx: z.number().int(), dy: z.number().int(), dz: z.number().int() })
    .strict(),

  place: z
    .object({ dx: z.number().int(), dy: z.number().int(), dz: z.number().int() })
    .strict(),

  attack: z
    .object({ entity_id: z.number().int() })
    .strict(),

  use: z
    .object({
      action: z.enum(["item", "block", "eat", "sleep", "craft"]),
      dx: z.number().int().optional(),
      dy: z.number().int().optional(),
      dz: z.number().int().optional(),
      hand: z.enum(["right", "left"]).optional(),
      itemName: z.string().min(1).max(64).optional(),
      count: z.number().int().min(1).max(64).optional(),
    })
    .strict(),

  inventory: z
    .object({
      action: z.enum(["inspect", "equip", "drop", "open", "take", "deposit", "close"]),
      name: z.string().min(1).max(64).optional(),
      count: z.number().int().min(1).max(64).optional(),
      destination: z.enum(["hand", "off-hand", "head", "torso", "legs", "feet"]).optional(),
      dx: z.number().int().optional(),
      dy: z.number().int().optional(),
      dz: z.number().int().optional(),
    })
    .strict(),

  status: z.object({}).strict(),
});

// ---------- Dispatch ----------

/**
 * Dispatch a tool call against the given Bot.
 * Returns an MCP-style content envelope.
 * Throws McpError on any error — the server layer converts to JSON-RPC error.
 */
export async function dispatch(name, rawArgs, bot) {
  const schema = SCHEMAS[name];
  if (!schema) {
    throw new McpError(ErrorCodes.METHOD_NOT_FOUND, `Unknown tool: ${name}`);
  }
  if (!DISPATCHED.has(name)) {
    throw new McpError(
      ErrorCodes.METHOD_NOT_FOUND,
      `Tool ${name} advertised but not dispatched (internal bug)`
    );
  }

  // Zod parse — let ZodError propagate for server normalization.
  const args = schema.parse(rawArgs ?? {});

  switch (name) {
    // ── observe ──────────────────────────────────────────────────────────
    case "observe": {
      switch (args.target) {
        case "position": {
          const pos = await bot.getPosition();
          return { content: [{ type: "text", text: JSON.stringify(pos) }] };
        }
        case "health": {
          const health = bot.getHealth();
          return { content: [{ type: "text", text: JSON.stringify(health) }] };
        }
        case "world": {
          const biome = bot.getBiome();
          const time = bot.getTimeOfDay();
          const weather = bot.getWeather();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ biome, time, weather }),
              },
            ],
          };
        }
        case "players": {
          const maxDist = args.maxDistance ?? 64;
          const players = bot.listNearbyPlayers({ maxDistance: maxDist });
          return {
            content: [
              { type: "text", text: JSON.stringify({ count: players.length, players }) },
            ],
          };
        }
        case "entities": {
          const maxDist = args.maxDistance ?? 16;
          const entities = bot.listNearbyEntities({ maxDistance: maxDist });
          return {
            content: [
              { type: "text", text: JSON.stringify({ count: entities.length, entities }) },
            ],
          };
        }
        case "blocks": {
          if (!args.blockTypes || args.blockTypes.length === 0) {
            throw new McpError(
              ErrorCodes.INVALID_PARAMS,
              "observe target=blocks requires blockTypes array"
            );
          }
          const blocks = await bot.findBlocks({
            blockTypes: args.blockTypes,
            maxDistance: args.maxDistance ?? 16,
            maxCount: args.maxCount ?? 4,
          });
          return {
            content: [
              { type: "text", text: JSON.stringify({ count: blocks.length, blocks }) },
            ],
          };
        }
        case "chat": {
          const messages = bot.readRecentChat({
            since: args.since ?? 0,
            limit: args.limit ?? 50,
          });
          return {
            content: [
              { type: "text", text: JSON.stringify({ count: messages.length, messages }) },
            ],
          };
        }
        default:
          throw new McpError(ErrorCodes.INVALID_PARAMS, `Unknown observe target: ${args.target}`);
      }
    }

    // ── move ──────────────────────────────────────────────────────────────
    case "move": {
      switch (args.mode) {
        case "to": {
          if (args.x === undefined || args.y === undefined || args.z === undefined) {
            throw new McpError(
              ErrorCodes.INVALID_PARAMS,
              "move mode=to requires x, y, z"
            );
          }
          const result = await bot.navigateTo({
            x: args.x,
            y: args.y,
            z: args.z,
            tolerance: args.tolerance ?? 1,
            timeoutMs: args.timeoutMs ?? 30000,
          });
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "relative": {
          if (args.dx === undefined || args.dy === undefined || args.dz === undefined) {
            throw new McpError(
              ErrorCodes.INVALID_PARAMS,
              "move mode=relative requires dx, dy, dz"
            );
          }
          const result = await bot.navigateRelative({
            dx: args.dx,
            dy: args.dy,
            dz: args.dz,
            tolerance: args.tolerance ?? 1,
            timeoutMs: args.timeoutMs ?? 30000,
          });
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "look": {
          if (args.x === undefined || args.y === undefined || args.z === undefined) {
            throw new McpError(
              ErrorCodes.INVALID_PARAMS,
              "move mode=look requires x, y, z"
            );
          }
          const result = await bot.lookAt({
            x: args.x,
            y: args.y,
            z: args.z,
            force: args.force ?? false,
          });
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "look_at_player": {
          if (!args.username) {
            throw new McpError(
              ErrorCodes.INVALID_PARAMS,
              "move mode=look_at_player requires username"
            );
          }
          const result = await bot.lookAtPlayer({
            username: args.username,
            atFeet: args.atFeet ?? false,
          });
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "follow": {
          if (!args.username) {
            throw new McpError(
              ErrorCodes.INVALID_PARAMS,
              "move mode=follow requires username"
            );
          }
          const result = await bot.followPlayer({
            username: args.username,
            distance: args.distance ?? 2,
            timeoutMs: args.timeoutMs ?? 30000,
          });
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        default:
          throw new McpError(ErrorCodes.INVALID_PARAMS, `Unknown move mode: ${args.mode}`);
      }
    }

    // ── chat ──────────────────────────────────────────────────────────────
    case "chat": {
      const result = await bot.chat(args.message);
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true, sent: result.sent }) }],
      };
    }

    // ── dig ───────────────────────────────────────────────────────────────
    case "dig": {
      const result = await bot.digBlock({ dx: args.dx, dy: args.dy, dz: args.dz });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    // ── place ─────────────────────────────────────────────────────────────
    case "place": {
      const result = await bot.placeBlock({ dx: args.dx, dy: args.dy, dz: args.dz });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    // ── attack ────────────────────────────────────────────────────────────
    case "attack": {
      const result = await bot.attackEntity({ entity_id: args.entity_id });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    }

    // ── use ───────────────────────────────────────────────────────────────
    case "use": {
      switch (args.action) {
        case "item": {
          const result = await bot.useItem({ hand: args.hand ?? "right" });
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "block": {
          if (args.dx === undefined || args.dy === undefined || args.dz === undefined) {
            throw new McpError(
              ErrorCodes.INVALID_PARAMS,
              "use action=block requires dx, dy, dz"
            );
          }
          const result = await bot.activateBlock({ dx: args.dx, dy: args.dy, dz: args.dz });
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
        case "craft": {
          if (!args.itemName) {
            throw new McpError(
              ErrorCodes.INVALID_PARAMS,
              "use action=craft requires itemName"
            );
          }
          const result = await bot.craftItem({
            itemName: args.itemName,
            count: args.count ?? 1,
          });
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        default:
          throw new McpError(ErrorCodes.INVALID_PARAMS, `Unknown use action: ${args.action}`);
      }
    }

    // ── inventory ─────────────────────────────────────────────────────────
    case "inventory": {
      switch (args.action) {
        case "inspect": {
          const inv = await bot.inspectInventory();
          return {
            content: [
              { type: "text", text: JSON.stringify({ count: inv.length, items: inv }) },
            ],
          };
        }
        case "equip": {
          if (!args.name) {
            throw new McpError(ErrorCodes.INVALID_PARAMS, "inventory action=equip requires name");
          }
          const result = await bot.equipItem({
            name: args.name,
            destination: args.destination ?? "hand",
          });
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "drop": {
          if (!args.name) {
            throw new McpError(ErrorCodes.INVALID_PARAMS, "inventory action=drop requires name");
          }
          const result = await bot.dropItem({
            name: args.name,
            count: args.count ?? 1,
          });
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "open": {
          if (args.dx === undefined || args.dy === undefined || args.dz === undefined) {
            throw new McpError(
              ErrorCodes.INVALID_PARAMS,
              "inventory action=open requires dx, dy, dz"
            );
          }
          const result = await bot.openContainer({ dx: args.dx, dy: args.dy, dz: args.dz });
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "take": {
          if (!args.name) {
            throw new McpError(ErrorCodes.INVALID_PARAMS, "inventory action=take requires name");
          }
          const result = await bot.takeItem({
            name: args.name,
            count: args.count ?? 1,
          });
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "deposit": {
          if (!args.name) {
            throw new McpError(
              ErrorCodes.INVALID_PARAMS,
              "inventory action=deposit requires name"
            );
          }
          const result = await bot.depositItem({
            name: args.name,
            count: args.count ?? 1,
          });
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "close": {
          const result = await bot.closeContainer();
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        default:
          throw new McpError(ErrorCodes.INVALID_PARAMS, `Unknown inventory action: ${args.action}`);
      }
    }

    // ── status ────────────────────────────────────────────────────────────
    case "status": {
      const pos = await bot.getPosition();
      const health = bot.getHealth();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              position: { x: pos.x, y: pos.y, z: pos.z, dimension: pos.dimension },
              health: health.health,
              food: health.food,
              saturation: health.saturation,
              alive: health.alive,
            }),
          },
        ],
      };
    }

    default:
      throw new McpError(ErrorCodes.METHOD_NOT_FOUND, `Unknown tool: ${name}`);
  }
}

// ---------- Structural completeness guard ----------
// Same contract: every advertised tool must have a dispatch case and schema.

const DISPATCHED = new Set([
  "observe", "move", "chat", "dig", "place", "attack", "use", "inventory", "status",
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
