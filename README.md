# mineflayer-mcp

An [MCP](https://modelcontextprotocol.io/) server that exposes a
[mineflayer](https://github.com/PrismarineJS/mineflayer) bot to AI agents.

> **Project status: barebones.**
> The current implementation works for a narrow set of tools against a specific
> deployment, but it is not yet a general-purpose, high-quality MCP server. The
> goal of this repo is to build one.

---

## Goal

Produce a **high-quality, general-purpose mineflayer-mcp server** that AI agents
can use to observe and act in any Minecraft world, with:

- A complete, honest tool surface (no ghost tools, no silent fallthroughs).
- A resource surface for observable world state.
- Robust error handling that never loses information to serialization.
- Safe defaults for bot lifecycle (spawn/chunk-load gates, no reconnect storms).
- Single-instance discipline (no duplicate-login kicks).
- Equally viable as a local stdio server and as a deployed streamable-http service.
- Documented, tested, and pluggable into any MCP-capable agent runtime.

This repo exists because the previous state-of-the-art (`@gerred/mcpmc@0.0.10`)
advertised ten tools but dispatched only four, destroyed error codes via
`String(error)`, and abandoned the project after one day of commits.

---

## What works today

All milestones M1–M5 complete, three iterative testing epochs passed, and a
nano-tier consolidation refactor complete. The current `src/` exposes **9
consolidated tools** that cover the full casual survival-gameplay loop
(observe, move, build, mine, craft, interact, eat, sleep, follow) with a
token footprint of ~1,600 tokens — well under the 8k budget for `gpt-5-nano`
compatibility. See `SPEC.md` and `test/` for the full test methodology.

### Tools (9)

| Tool | Description |
|---|---|
| `observe` | Read information about the world, the bot, or nearby entities. Use `target` param: position, health, world, players, entities, blocks, chat. |
| `move` | Navigate to a location, look at a target, or follow a player. Use `mode` param: to, relative, look, look_at_player, follow. |
| `chat` | Send a message in the Minecraft chat. |
| `dig` | Break a block near the bot. |
| `place` | Place a block from inventory at a nearby position. |
| `attack` | Hit a nearby entity (mob or player). |
| `use` | Use an item, activate a block, eat food, sleep, or craft. Use `action` param: item, block, eat, sleep, craft. |
| `inventory` | Inspect, equip, drop, or manage container contents. Use `action` param: inspect, equip, drop, open, take, deposit, close. |
| `status` | Quick self-check: position, health, and food in one call. |

### Resources (6)

| URI | Content |
|---|---|
| `minecraft://position` | Bot coordinates |
| `minecraft://inventory` | Current inventory |
| `minecraft://health` | Health, food, saturation |
| `minecraft://blocks/nearby` | Nearby block scan |
| `minecraft://players/nearby` | Nearby player list |
| `minecraft://chat/recent` | Recent chat buffer |

### Scenarios passed

| Scenario | What it proves |
|---|---|
| T1 — Chat | P1 sends; P2 observes via `read_recent_chat`; RCON confirms |
| T2 — Presence | P1 navigates; P2 sees P1 in `list_nearby_players`; RCON confirms coords |
| T3 — World-write | P1 places stone; P2 finds it via `find_blocks`; RCON confirms |

### Bot safety (M4)

With `--safe-mode` (default on):
- Auto-respawn on death (`bot.on("death")` → `bot.respawn()`)
- Fall protection (velocity-based jump)
- Mob avoidance at health < 10 (pathfind away from nearest hostile)
- Real-time health logging

Validated: bot survived 5 minutes in a Husk-populated world, 1 death, auto-respawned.

Key properties:

- `assertCompleteness()` — fails startup if advertised tools ≠ dispatched tools.
- `normalizeError()` — never returns `[object Object]`.
- Spawn-gate and chunk-load-gate before world queries.
- No auto-reconnect; process exits, systemd owns restart.
- Single-instance PID lockfile.
- Shared singleton bot across concurrent MCP sessions.

---

## What is missing

The core tool and resource surface covers the full casual survival-gameplay
loop (observe, move, build, mine, craft, interact, eat, sleep, follow). What
remains is operational maturity and advanced gameplay.

**Testing & CI**
- CI test suite running against a throwaway Minecraft container.
- Fix macOS smoke-test bug (minecraft-protocol handshake) for local dev.
- Versioned tool schemas with a compatibility policy.

**Advanced gameplay (future epochs)**
- PVP combat mechanics.
- Redstone interaction beyond simple levers/buttons.
- Nether/End dimension support.
- Multi-bot (>2) coordination.
- Performance benchmarking and latency budgets.

**Publishing**
- Published npm package (`mineflayer-mcp`) with documented public API.
- Configurable via env vars in addition to CLI flags.

**Docs**
- Tool-by-tool reference with examples.
- Agent-authoring guide: how to design prompts that use these tools well.
- Deployment recipes for stdio, streamable-http, and behind a gateway.

**Tool additions (future)**
- Inventory actions: `equip_item`, `drop_item`, `craft_item`, `open_container`.
- Extended observation: `list_nearby_items`, `get_block_info`.
- Extended movement: `stop_navigation`, `follow_player`.

---

## Project Structure

```
src/
  index.js      CLI entrypoint — stdio MCP
  http.js       HTTP entrypoint — streamable-http MCP
  bot.js        Mineflayer wrapper: connect, spawn-gate, chunk-gate, operations
  tools.js      TOOLS array, Zod schemas, dispatch(), assertCompleteness()
  server.js     McpMinecraftServer with normalized error handling
  errors.js     McpError, normalizeError(), ErrorCodes
  logger.js     JSON-line stderr logger
  lock.js       Single-instance PID lockfile
scripts/
  smoke.js      stdio end-to-end test
test/
  README.md     Testing methodology — the agent IS the test harness
  harness.md    Reusable startup/teardown for two-bot scenarios
  scenarios/    Formal T1/T2/T3 scenario specs
testing/
  novelty.md              Deterministic novelty scoring — 10-rule system
  gameplay-epics.md       8 gameplay epics driving epoch 2 testing
  epoch-001-retrospective.md  Honest post-mortem of the first 500 iterations
```

---

## Quick Start

### 1. Start a Minecraft server

The quickest path is the included Docker Compose file:

```sh
docker compose -f docker-compose.dev.yaml up -d
```

This starts a vanilla 1.21.1 server on `localhost:25565` with RCON
enabled on port 25575 (password: `mineflayer-dev`). Wait until
`docker logs mineflayer-mcp-dev` shows `Done (`.

### 2. Configure

Copy the example environment file:

```sh
cp .env.example .env
```

The defaults connect to `localhost:25565` — no changes needed if you're
using the Docker Compose setup above. For a remote server, edit `.env`:

```sh
MC_HOST=my-server.example.com
MC_PORT=25565
MC_USERNAME=my-bot
RCON_HOST=my-server.example.com
RCON_PORT=25575
RCON_PASSWORD=secret
```

### 3. Run

```sh
npm install

# stdio MCP (local dev / testing)
node src/index.js --host localhost --port 25565 --username my-bot

# HTTP MCP (production / gateway integration)
node src/http.js --host localhost --port 25565 --username my-bot \
  --http-port 8080 --http-path /mcp --health-path /healthz
```

### 4. Smoke test

```sh
npm run smoke
```

The smoke test reads `.env` if it exists, or falls back to
`localhost:25565`.

---

## Environment Variables

All configuration can be provided via `.env` (gitignored) or as
environment variables. CLI flags take precedence over env vars.

| Variable | Default | Description |
|---|---|---|
| `MC_HOST` | `localhost` | Minecraft server hostname |
| `MC_PORT` | `25565` | Minecraft server port |
| `MC_USERNAME` | `mineflayer-bot` | Bot username |
| `HTTP_PORT` | `8080` | HTTP MCP server port |
| `HTTP_PATH` | `/mcp` | MCP endpoint path |
| `HEALTH_PATH` | `/healthz` | Health check endpoint |
| `RCON_HOST` | *(optional)* | RCON hostname (for test harness) |
| `RCON_PORT` | *(optional)* | RCON port |
| `RCON_PASSWORD` | *(optional)* | RCON password |
| `SAFE_MODE` | `true` | Enable bot safety (auto-respawn, flee, fall protection) |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |
| `LOCK_PATH` | `/tmp/mineflayer-mcp.lock` | PID lockfile path |

See `.env.example` for the full template with comments.

---

## Local Development

All logs go to **stderr** as JSON lines. Stdout carries only MCP JSON-RPC.

> Known issue: the stdio smoke test fails on macOS due to a
> minecraft-protocol handshake discrepancy. Passes on Linux.

---

## HTTP Entrypoint

```sh
node src/http.js \
  --host <host> --port <port> --username <name> \
  --http-port 8080 --http-path /mcp --health-path /healthz \
  --lock /tmp/<name>.lock --log-level info --stateful
```

| Flag | Default | Description |
|---|---|---|
| `--host` | *(required)* | Minecraft server hostname |
| `--port` | *(required)* | Minecraft server port |
| `--username` | *(required)* | Bot username |
| `--http-port` | `8080` | HTTP listening port |
| `--http-path` | `/mcp` | MCP endpoint path |
| `--health-path` | `/healthz` | Returns `ok` |
| `--lock` | `/tmp/<name>.lock` | PID lockfile path |
| `--log-level` | `info` | `debug` / `info` / `warn` / `error` |
| `--stateful` / `--stateless` | stateful | Session mode |

---

## Requirements

- **Node.js** 22.x (see `.nvmrc`).
- **mineflayer** `^4.37.0` — required for 1.21.1+ (protodef 1.19).
- **@modelcontextprotocol/sdk** `^1.0.0`.
- **zod** `^3.23.8`.

---

## Design Commitments

These hold regardless of tool-surface growth:

1. **No ghost tools.** `assertCompleteness()` is non-negotiable — the process
   refuses to start if advertised tools and dispatched tools disagree.
2. **Errors carry codes.** `normalizeError()` handles every throw shape and
   never produces `[object Object]`.
3. **Stdout is sacred.** MCP JSON-RPC only; logs go to stderr.
4. **One bot, many sessions.** The HTTP entrypoint shares a single long-lived
   mineflayer bot across concurrent MCP sessions — never spawn-per-session.
5. **Lifecycle discipline.** No in-process auto-reconnect; exit and let the
   supervisor restart. Prevents login-kick storms.
6. **Tools do; resources observe.** Side effects go in tools, observable state
   goes in resources.

---

## Contributing

The roadmap is "What is missing" above. Pick any item, open a branch, and keep
the six design commitments intact.

---

## License

See `LICENSE`.
