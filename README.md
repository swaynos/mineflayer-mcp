# minecraft-mcp

Repo-owned MCP server for the **MathBridgeBot** Minecraft bot.

Wraps [`mineflayer`](https://github.com/PrismarineJS/mineflayer) and exposes a subset of bot
actions over the [Model Context Protocol](https://modelcontextprotocol.io/) (MCP), allowing
AI agents (via OpenClaw) to interact with a Minecraft server.

Replaces the abandoned `@gerred/mcpmc@0.0.10`, which advertised tools it did not dispatch.

---

## Architecture

```
Discord user / OpenClaw agent
   │
   ▼
OpenClaw gateway (nyx)
   │  MCP streamable-http
   ▼
src/http.js  ← production entrypoint, HTTP server on 127.0.0.1:8080
   │
   ▼
src/bot.js   ← single long-lived mineflayer bot (MathBridgeBot)
   │
   ▼
Minecraft server (callisto:1234, version 1.21.1)
```

One bot instance is shared across all concurrent MCP sessions. Each session gets its own
`McpMinecraftServer` instance and `StreamableHTTPServerTransport`.

`src/index.js` exposes the same server over stdio for local development and smoke testing.

---

## Tools (M0)

| Tool | Description |
|---|---|
| `chat` | Send a chat message in-world as MathBridgeBot |
| `get_position` | Read current bot coordinates, dimension, yaw, pitch |
| `find_blocks` | Locate nearby blocks by name within a configurable radius |
| `inspect_inventory` | List current inventory contents |

`assertCompleteness()` in `src/tools.js` runs at module load time and fails startup if any
advertised tool lacks a dispatch case, or any dispatch case has no schema. This is the
structural guard against the upstream bug this project exists to fix.

---

## Project Structure

```
src/
  index.js      CLI entrypoint — stdio MCP (local dev / smoke)
  http.js       HTTP entrypoint — streamable-http MCP (production)
  bot.js        Mineflayer wrapper: connect, spawn-gate, chunk-gate, operations
  tools.js      TOOLS array, Zod schemas, dispatch(), assertCompleteness()
  server.js     McpMinecraftServer class with normalized error handling
  errors.js     McpError class, normalizeError(), ErrorCodes
  logger.js     Structured JSON-line stderr logger
  lock.js       Single-instance PID lockfile
scripts/
  smoke.js      stdio-based end-to-end test
  deploy.sh     rsync + remote install + systemd restart (in repo root scripts/)
```

---

## Local Development

```sh
npm install

# Connect to Minecraft via stdio (local dev)
node src/index.js --host callisto --port 1234 --username MathBridgeBot-Local
```

All logs are emitted to **stderr** as JSON lines. Stdout carries only MCP JSON-RPC traffic.

### Smoke Test

```sh
npm run smoke
# or
MC_HOST=callisto MC_PORT=1234 MC_USER=MathBridgeBot-Smoke node scripts/smoke.js
```

Exercises all 4 tools end-to-end and writes the JSON-RPC exchange to `smoke.log`.

> **Note:** The smoke test connects under a different username (`MathBridgeBot-Smoke`) so it
> does not kick the production bot from the server.

> **Known issue:** The smoke test fails to connect from macOS due to a local network/module
> resolution difference with minecraft-protocol. It passes when run from `nyx` where the
> deployment target is. Use the deployed smoke path (`npm run smoke` after deploy) for validation.

---

## Deploy

```sh
# From the repo root:
bash scripts/deploy.sh
```

Or from within `minecraft-mcp/`:

```sh
npm run deploy
```

The deploy script:
1. rsyncs `minecraft-mcp/` to `nyx:/home/jpswaynos/minecraft-mcp/`
2. Runs `npm ci --omit=dev` on `nyx`
3. Rewrites `~/.config/systemd/user/mcpmc-bridge.service` to run `src/http.js`
4. Reloads systemd and restarts both the bridge and OpenClaw gateway
5. Verifies `/healthz` returns `ok`

---

## Production Entry Point (HTTP)

```sh
# Invoked by mcpmc-bridge.service on nyx:
node src/http.js \
  --host callisto --port 1234 --username MathBridgeBot \
  --http-port 8080 --http-path /mcp --health-path /healthz \
  --lock /tmp/mathbridgebot.lock --log-level info --stateful
```

Options:

| Flag | Default | Description |
|---|---|---|
| `--host` | *(required)* | Minecraft server hostname |
| `--port` | *(required)* | Minecraft server port |
| `--username` | *(required)* | Bot username |
| `--http-port` | `8080` | HTTP listening port |
| `--http-path` | `/mcp` | MCP endpoint path |
| `--health-path` | `/healthz` | Health check path (returns `ok`) |
| `--lock` | `/tmp/mathbridgebot.lock` | PID lockfile path |
| `--log-level` | `info` | `debug` / `info` / `warn` / `error` |
| `--version` | *(auto)* | Force a specific Minecraft version |
| `--stateful` / `--stateless` | stateful | Session mode |

---

## Environment

- **Node.js**: 22.x (`.nvmrc` pins this)
- **mineflayer**: `^4.37.0` — required for Minecraft 1.21.1 (protodef 1.19+); earlier versions
  produce `"Invalid move player packet"` on connect
- **@modelcontextprotocol/sdk**: `^1.0.0`
- **zod**: `^3.23.8`

---

## Key Design Decisions

**No auto-reconnect.** When the bot disconnects, the process exits (code 0 for intentional
kicks like duplicate-login, code 1 otherwise). Systemd owns restart policy via `Restart=always`.
This eliminates the reconnect-storm bug present in `@gerred/mcpmc`.

**No supergateway.** The production entry point (`src/http.js`) serves MCP streamable-http
directly via `StreamableHTTPServerTransport`. Using supergateway would spawn a fresh MCP child
per session, causing multiple bot processes to fight over the same Minecraft username.

**Stdout is sacred.** All logs go to stderr. Stdout carries only MCP JSON-RPC.

**`assertCompleteness()` is non-negotiable.** If you add a tool to `TOOLS` without adding a
`case` to the `dispatch()` switch (and vice versa), the process will refuse to start.

---

## M1 / Future Work

See the parent repo `spec.md` for the next milestone plan. Planned additions:

- `navigate_relative` — move bot in-world
- `dig_block_relative` — mine a block
- `place_block` — place a block from inventory
- Resource surface (`minecraft://position`, `minecraft://inventory`, etc.)
- Automatic bot health/safety (fall protection, mob avoidance)
