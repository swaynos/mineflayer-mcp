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

The current `src/` implements a **minimum viable** MCP server sufficient to
prove the architecture end-to-end:

| Tool | Status |
|---|---|
| `chat` | Works |
| `get_position` | Works |
| `find_blocks` | Works |
| `inspect_inventory` | Works |

Key properties already in place:

- `assertCompleteness()` in `src/tools.js` — fails startup if advertised tools ≠ dispatched tools.
- `normalizeError()` in `src/errors.js` — never returns `[object Object]`.
- Spawn-gate and chunk-load-gate in `src/bot.js` before any world query.
- No auto-reconnect; process exits, systemd owns restart.
- Single-instance PID lockfile (`src/lock.js`).
- Shared singleton bot across concurrent MCP sessions (`src/http.js`).

---

## What is missing

To become high quality, this project needs (roughly in priority order):

**Tool surface**
- Movement: `navigate_to`, `navigate_relative`, `look_at`, `look_at_player`.
- World edit: `dig_block`, `place_block`, `use_item`.
- Observation: `get_biome`, `list_nearby_entities`, `list_nearby_players`,
  `get_time_of_day`, `get_weather`, `get_health`, `get_food`.
- Chat: `read_recent_chat` — returns buffered chat lines since a given timestamp.
  **Required for the two-instance test harness (Tier 1 scenario).**
- Inventory actions: `equip_item`, `drop_item`, `craft_item`, `open_container`.

**Resource surface**
- `minecraft://position`, `minecraft://inventory`, `minecraft://blocks/nearby`,
  `minecraft://players/nearby`, `minecraft://biome`, `minecraft://health`.
- Read-only observable state, separate from side-effectful tools.

**Bot quality**
- Fall protection, mob avoidance, auto-respawn (toggleable via `--safe-mode`).
- Pathfinder integration (`mineflayer-pathfinder`) for reliable movement.
- Chunk-aware scanning that doesn't silently return empty because chunks aren't loaded.

**Agent-trust hardening**
- Every tool returns structured evidence of effect (not just a success flag).
- Tools that can fail partially (e.g., `navigate_to` giving up) return progress.
- Clear distinction between "tool ran and nothing happened" vs. "tool couldn't run."
- No chat-as-command paths — all world edits go through mineflayer APIs, never
  through sending `/fill` or `/setblock` as chat.

**Operational**
**Testing**
- Two-instance test harness: two local `mineflayer-mcp` processes (`MathTest-P1`
  on `:18080`, `MathTest-P2` on `:18081`) connect to the same world simultaneously.
  One acts as the **invoker** (performs the action), the other as the **tester**
  (independently observes the result). RCON is the authoritative oracle.
  - Tier 1: `chat` invoker / `read_recent_chat` tester. Unblocked once
    `read_recent_chat` exists.
  - Tier 2: `navigate_to` invoker / `list_nearby_players` tester.
  - Tier 3: `place_block` invoker / `find_blocks` tester + RCON confirm.
- CI test suite that runs against a throwaway Minecraft container.
- Versioned tool schemas with a compatibility policy.
- Published npm package (`mineflayer-mcp`) with documented public API.
- Stdio smoke test that works cross-platform (current one fails on macOS).
- Configurable via env vars, not just CLI flags.

**Docs**
- Tool-by-tool reference with examples.
- Agent-authoring guide: how to design prompts that use these tools well.
- Deployment recipes for stdio, streamable-http, and behind a gateway.

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
  smoke.js      stdio end-to-end test (currently macOS-broken)
```

---

## Local Development

```sh
npm install

# stdio MCP against any Minecraft server
node src/index.js --host <host> --port <port> --username <name>
```

All logs go to **stderr** as JSON lines. Stdout carries only MCP JSON-RPC.

### Smoke test

```sh
npm run smoke
```

Exercises the current tool set end-to-end and writes the exchange to `smoke.log`.

> Known issue: fails on macOS due to a minecraft-protocol handshake
> discrepancy. Passes on Linux. Tracked as one of the first items to fix.

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
