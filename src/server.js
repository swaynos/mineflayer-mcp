// src/server.js
// MCP Server wrapper. Registers ListTools, CallTool, ListResources, and ReadResource
// handlers with strict error normalization so no plain-object throws ever leave this layer.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { TOOLS, dispatch, assertCompleteness } from "./tools.js";
import { McpError, ErrorCodes, normalizeError } from "./errors.js";
import { logger } from "./logger.js";

// Re-run the structural guard at server construction (tools.js also runs it at import).
assertCompleteness();

// ---------- Resource definitions ----------

const RESOURCES = Object.freeze([
  {
    name: "position",
    uri: "minecraft://position",
    mimeType: "application/json",
    description: "Bot current coordinates, dimension, yaw, and pitch.",
  },
  {
    name: "inventory",
    uri: "minecraft://inventory",
    mimeType: "application/json",
    description: "Bot current inventory contents.",
  },
  {
    name: "health",
    uri: "minecraft://health",
    mimeType: "application/json",
    description: "Bot current health, food level, and saturation.",
  },
  {
    name: "blocks/nearby",
    uri: "minecraft://blocks/nearby",
    mimeType: "application/json",
    description: "Nearby block scan (stone, dirt, sand within 16 blocks).",
  },
  {
    name: "players/nearby",
    uri: "minecraft://players/nearby",
    mimeType: "application/json",
    description: "Players visible near the bot.",
  },
  {
    name: "chat/recent",
    uri: "minecraft://chat/recent",
    mimeType: "application/json",
    description: "Recent buffered chat messages (last 50).",
  },
]);

export class McpMinecraftServer {
  /**
   * @param {import("./bot.js").Bot} bot
   */
  constructor(bot) {
    if (!bot) throw new McpError(ErrorCodes.SERVER_STARTUP, "McpMinecraftServer: bot is required");
    this._bot = bot;
    this._server = new Server(
      {
        name: "minecraft-mcp",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );
    this._registerHandlers();
  }

  _registerHandlers() {
    const server = this._server;
    const bot = this._bot;

    // ---------- Tools ----------

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug("mcp.tools.list");
      return { tools: TOOLS };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const name = request?.params?.name;
      const args = request?.params?.arguments ?? {};
      logger.info("mcp.tools.call", { name });

      try {
        const result = await dispatch(name, args, bot);
        return result;
      } catch (err) {
        const norm = normalizeError(err, `tool:${name}`);
        logger.warn("mcp.tools.call.error", {
          name,
          code: norm.code,
          message: norm.message,
        });
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: {
                  code: norm.code,
                  message: norm.message,
                  ...(norm.data !== undefined ? { data: norm.data } : {}),
                },
              }),
            },
          ],
        };
      }
    });

    // ---------- Resources ----------

    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      logger.debug("mcp.resources.list");
      return { resources: RESOURCES };
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request?.params?.uri;
      logger.info("mcp.resources.read", { uri });

      try {
        let data;
        switch (uri) {
          case "minecraft://position":
            data = await bot.getPosition();
            break;
          case "minecraft://inventory": {
            const items = await bot.inspectInventory();
            data = { count: items.length, items };
            break;
          }
          case "minecraft://health":
            data = bot.getHealth();
            break;
          case "minecraft://blocks/nearby": {
            const blocks = await bot.findBlocks({
              blockTypes: ["stone", "dirt", "sand", "grass_block", "oak_log", "oak_planks"],
              maxDistance: 16,
              maxCount: 16,
            });
            data = { count: blocks.length, blocks };
            break;
          }
          case "minecraft://players/nearby": {
            const players = bot.listNearbyPlayers({ maxDistance: 64 });
            data = { count: players.length, players };
            break;
          }
          case "minecraft://chat/recent": {
            const messages = bot.readRecentChat({ since: 0, limit: 50 });
            data = { count: messages.length, messages };
            break;
          }
          default:
            throw new McpError(ErrorCodes.METHOD_NOT_FOUND, `Unknown resource URI: ${uri}`);
        }

        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(data),
            },
          ],
        };
      } catch (err) {
        const norm = normalizeError(err, `resource:${uri}`);
        logger.warn("mcp.resources.read.error", { uri, code: norm.code, message: norm.message });
        throw err; // Resources throw rather than returning isError content.
      }
    });
  }

  async serve(transport) {
    logger.info("mcp.server.connecting");
    await this._server.connect(transport);
    logger.info("mcp.server.connected");
  }

  async close() {
    try {
      await this._server.close?.();
    } catch (err) {
      logger.warn("mcp.server.close.failed", { err: String(err?.message ?? err) });
    }
  }
}

export default McpMinecraftServer;
