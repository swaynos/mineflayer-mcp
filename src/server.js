// src/server.js
// MCP Server wrapper. Registers ListTools and CallTool handlers with strict error
// normalization so no plain-object throws ever leave this layer.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { TOOLS, dispatch, assertCompleteness } from "./tools.js";
import { McpError, ErrorCodes, normalizeError } from "./errors.js";
import { logger } from "./logger.js";

// Re-run the structural guard at server construction (tools.js also runs it at import).
assertCompleteness();

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
        },
      }
    );
    this._registerHandlers();
  }

  _registerHandlers() {
    const server = this._server;
    const bot = this._bot;

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
        // MCP tool-call errors are returned as content with isError=true rather than
        // as JSON-RPC errors so the model sees the message text. But for protocol-level
        // issues (unknown tool, invalid params) we also want the proper code.
        // We attach structured data so OpenClaw can surface both.
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
