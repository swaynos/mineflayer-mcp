# README.md

An [MCP](https://modelcontextprotocol.io/) server that gives AI agents a real
[mineflayer](https://github.com/PrismarineJS/mineflayer) body in Minecraft.

## Tools (9)

| Tool | What it does |
|---|---|
| `observe` | Read world/bot/entity/player/block/chat state |
| `move` | Navigate, look, look at player, or follow player |
| `chat` | Send a chat message |
| `dig` | Break a nearby block |
| `place` | Place a held block nearby |
| `attack` | Attack a nearby entity by `entity_id` |
| `use` | Use item/block, eat, sleep, or craft |
| `inventory` | Inspect/equip/drop/open/take/deposit/close |
| `status` | One-call position + health + food check |

## Resources (6)

| URI | Returns |
|---|---|
| `minecraft://position` | Bot coordinates |
| `minecraft://inventory` | Inventory snapshot |
| `minecraft://health` | Health/food/saturation |
| `minecraft://blocks/nearby` | Nearby block scan |
| `minecraft://players/nearby` | Nearby players |
| `minecraft://chat/recent` | Recent chat buffer |

## Quick start

### 1. Start the project-owned Minecraft server

```sh
docker compose -f docker-compose.dev.yaml up -d
```

This starts a vanilla 1.21.1 server on `localhost:25565` and RCON on `25575`.
Both are required for running tests.

### 2. Install and configure

```sh
npm install
cp .env.example .env
```

### 3. Run MCP server

Stdio mode:

```sh
node src/index.js --host localhost --port 25565 --username my-bot
```

HTTP mode:

```sh
node src/http.js --host localhost --port 25565 --username my-bot --http-port 8080 --http-path /mcp --health-path /healthz
```

## Testing

Two layers, both require the Docker stack running:

```sh
docker compose -f docker-compose.dev.yaml up -d
```

### Layer 1: deterministic world checks

```sh
npm test
```

Real MCP client + real bot + real Minecraft. RCON-verified outcomes. No LLM.
Covers: transport health, tool dispatch, world-state mutations, bot lifecycle.

### Layer 2: agent behavior under load

```sh
npm run test:agent
```

Real LLM + real MCP + real Minecraft. World-outcome verified via RCON.
Requires `OPENAI_API_KEY` and either `AGENT_MCP_URL` or a detectable ngrok tunnel. Tests skip without them.
See `test/agent/README.md` for the session-soak contract (Option D failure budget).

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `MC_HOST` | `localhost` | Minecraft host |
| `MC_PORT` | `25565` | Minecraft port |
| `MC_USERNAME` | `mineflayer-bot` | Bot username |
| `MC_VERSION` | `1.21.1` | Minecraft version |
| `HTTP_PORT` | `8080` | HTTP MCP port |
| `HTTP_PATH` | `/mcp` | MCP endpoint path |
| `HEALTH_PATH` | `/healthz` | Health endpoint path |
| `SAFE_MODE` | `true` | Auto-respawn + basic survival safety |
| `LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` |
| `LOCK_PATH` | `/tmp/mineflayer-mcp.lock` | PID lockfile path |
| `RCON_HOST` | `127.0.0.1` | RCON host |
| `RCON_PORT` | `25575` | RCON port |
| `RCON_PASSWORD` | `mineflayer-dev` | RCON password |
| `OPENAI_API_KEY` | *(required for agent tests)* | OpenAI API key |
| `AGENT_MCP_URL` | *(optional with ngrok auto-detect)* | MCP HTTP URL for LLM to use |
| `NGROK_URL` | *(optional)* | Public ngrok URL (without `/mcp`) used when `AGENT_MCP_URL` is unset |
| `NGROK_AUTHTOKEN` | *(optional)* | ngrok auth token for your local ngrok agent |
| `AGENT_MODEL` | `gpt-4o-mini` | Model for agent tests |
| `AGENT_BOT_NAME` | `agent-test-bot` | Bot username for agent tests |

## Project map

```
src/
  index.js       stdio MCP entrypoint
  http.js        streamable HTTP MCP entrypoint
  bot.js         mineflayer lifecycle + world operations
  tools.js       tool schemas + dispatch + completeness checks
  server.js      MCP server wiring + resource handlers
  errors.js      error normalization + MCP error codes
  logger.js      JSON-line stderr logger
  lock.js        single-instance PID lock
test/
  world/         deterministic live-world checks (npm test)
  agent/         real LLM behavior under load (npm run test:agent)
```

## Requirements

- Node.js 22+
- Docker (project-owned dev server)

## Docs

- `README.md` — what it does and how to run it
- `CONTRIBUTING.md` — builder workflow and validation rules
- `SPEC.md` — active scoped objective (minimal, per-workstream)
- `NORTH-STAR.md` — long-term direction
- `AGENTS.md` — agent operating rules

## License

See `LICENSE`.
