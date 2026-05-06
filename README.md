# mineflayer-mcp

An [MCP](https://modelcontextprotocol.io/) server that gives AI agents a real
[mineflayer](https://github.com/PrismarineJS/mineflayer) body in Minecraft.

Built for people who care about reliability, not demos: honest tool wiring,
structured errors, safe bot lifecycle, and reproducible local testing.

## Why this is worth your time

- **Agent-ready surface:** 9 consolidated tools + 6 resources for real survival gameplay loops.
- **No fake capabilities:** startup fails if advertised tools and dispatched tools diverge.
- **Production-minded behavior:** one shared bot, single-instance lock, stdout-safe MCP transport.
- **Local-first workflow:** Docker dev server + smoke tests + evaluation harness out of the box.
- **Built for iteration:** clear `SPEC.md` contract and documented contributor/agent workflow.

## What problem this solves

Many Minecraft agent projects break in predictable ways: advertised tools are
not actually wired, errors collapse into unreadable blobs, reconnect logic
thrashes servers, and logs corrupt MCP transport.

`mineflayer-mcp` is designed to eliminate those failure modes:

- Complete, honest tool surface (`assertCompleteness()` hard-fails mismatch).
- Structured errors with preserved codes (`normalizeError()`).
- Bot lifecycle gates before world reads (spawn/chunk safety).
- Single-instance discipline (PID lock, no duplicate-login thrash).
- One long-lived bot shared across MCP sessions for HTTP mode.
- Works as local stdio MCP and streamable HTTP MCP.

## Current surface

The server currently exposes 9 consolidated tools and 6 read-only resources.
The 9-tool surface is intentionally compact for nano-tier model compatibility.

If you only read one thing before trying it: run the quick start, call
`status`, then `observe` and `move`. You get immediate proof that the MCP loop,
bot lifecycle, and world-state reads are all live.

### Tools (9)

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

### Resources (6)

| URI | Returns |
|---|---|
| `minecraft://position` | Bot coordinates |
| `minecraft://inventory` | Inventory snapshot |
| `minecraft://health` | Health/food/saturation |
| `minecraft://blocks/nearby` | Nearby block scan |
| `minecraft://players/nearby` | Nearby players |
| `minecraft://chat/recent` | Recent chat buffer |

## Quick start (local, recommended)

### 1) Start the local Minecraft server

```sh
docker compose -f docker-compose.dev.yaml up -d
```

This starts a vanilla server on `localhost:25565` and RCON on `25575`.

### 2) Install dependencies and configure env

```sh
npm install
cp .env.example .env
```

Defaults are already set for local Docker. Edit `.env` only if you need a
different host, username, or API settings.

### 3) Run MCP server

Stdio mode (best for local agent tooling):

```sh
node src/index.js --host localhost --port 25565 --username my-bot
```

HTTP mode (best for gateway/service integration):

```sh
node src/http.js --host localhost --port 25565 --username my-bot --http-port 8080 --http-path /mcp --health-path /healthz
```

### 4) Verify with smoke test

```sh
npm run smoke
```

## Configuration

Use `.env` (gitignored) or environment variables. CLI flags override env vars.

| Variable | Default | Purpose |
|---|---|---|
| `MC_HOST` | `localhost` | Minecraft host |
| `MC_PORT` | `25565` | Minecraft port |
| `MC_USERNAME` | `mineflayer-bot` | Bot username |
| `HTTP_PORT` | `8080` | HTTP MCP port |
| `HTTP_PATH` | `/mcp` | MCP endpoint path |
| `HEALTH_PATH` | `/healthz` | Health endpoint path |
| `SAFE_MODE` | `true` | Auto-respawn + basic survival safety |
| `LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` |
| `LOCK_PATH` | `/tmp/mineflayer-mcp.lock` | PID lockfile path |
| `RCON_HOST` | *(optional)* | RCON host (tests/fixtures) |
| `RCON_PORT` | *(optional)* | RCON port |
| `RCON_PASSWORD` | *(optional)* | RCON password |

For evaluation scripts, see `.env.example` for `EPOCH5_MCP_URL` and OpenAI
judge settings.

## Project map

```text
src/
  index.js      stdio MCP entrypoint
  http.js       streamable HTTP MCP entrypoint
  bot.js        mineflayer lifecycle + world operations
  tools.js      tool schemas + dispatch + completeness checks
  server.js     MCP server wiring + resource handlers
  errors.js     error normalization + MCP error codes
  logger.js     JSON-line stderr logger
  lock.js       single-instance PID lock
scripts/
  smoke.js      end-to-end smoke test
  epoch5-*.js   eval/fixture/judge/report pipeline
test/
  harness.md    local two-bot scenario harness
  epoch5.test.js
testing/
  prompt-library.md
  nano-judging.md
  gameplay-epics-v2.md
```

## Quality and testing

- Smoke test (`npm run smoke`) validates end-to-end MCP + bot wiring.
- Epoch 5 scripts support prompt-corpus evaluation against `gpt-5-nano`.
- `test/epoch5.test.js` validates corpus/judging/reporting pipeline logic.
- Workflow and review expectations are defined in `CONTRIBUTING.md`.

## Docs and process

- `README.md`: what the software does and how to run it.
- `SPEC.md`: current implementation/testing contract.
- `NORTH-STAR.md`: long-term direction.
- `CONTRIBUTING.md`: shared builder workflow for humans and agents.
- `AGENTS.md`: operational rules for AI agents in this repository.

## Requirements

- Node.js 22+
- Docker (for local Minecraft dev server)

## Contributing

Contributions are welcome. Start with `CONTRIBUTING.md`, then align active work
to `SPEC.md`.

## TL;DR

If you want a serious starting point for Minecraft-capable agents, this repo is
optimized for correctness, observability, and repeatable local development.

## License

See `LICENSE`.
