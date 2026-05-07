# test/world/

Deterministic live-world checks. Real MCP client + real bot + real Minecraft. No LLM.

This layer answers: **Does the MCP server correctly operate Minecraft?**

## Prerequisites

The project-owned Docker stack must be running:

```sh
docker compose -f docker-compose.dev.yaml up -d
```

This starts a vanilla 1.21.1 server on `localhost:25565` and RCON on `localhost:25575`.
Both are required. Tests do not skip on missing infrastructure — they fail loudly.

## Running

```sh
npm test
```

Tests run sequentially (`--test-concurrency=1`) to avoid Minecraft server rate-limiting
on rapid bot connections. Total runtime is roughly 60–90 seconds.

## Environment

All defaults match the project Docker stack. Override via `.env` if needed:

| Variable | Default | Purpose |
|---|---|---|
| `MC_HOST` | `127.0.0.1` | Minecraft host |
| `MC_PORT` | `25565` | Minecraft port |
| `MC_VERSION` | `1.21.1` | Minecraft protocol version |
| `RCON_HOST` | `127.0.0.1` | RCON host |
| `RCON_PORT` | `25575` | RCON port |
| `RCON_PASSWORD` | `mineflayer-dev` | RCON password |

## Oracle

Every test that mutates the world verifies its outcome via **RCON**:

- `assertBlock(x, y, z, type)` — uses `execute if block` to confirm block type.
- `assertAir(x, y, z)` — confirms block is air.
- `readPosition(username)` — reads entity position via `data get entity`.
- `rconExec(cmd)` — raw RCON command for anything else.

A test that only checks the tool's return value (`{ ok: true }`) is not a passing test.
Every assertion in this layer touches RCON or a real MCP client response.

## Test index

| File | What it proves |
|---|---|
| `01-health.test.js` | RCON reachable; stdio tools/list = 9 tools; HTTP healthz + tools/list |
| `02-stdio.test.js` | Every byte on stdout is valid JSON-RPC 2.0 (stdout-safety invariant, enforced) |
| `03-http.test.js` | Tool call round-trips; one-bot invariant across two sessions; healthz survives |
| `04-observe.test.js` | position ≈ RCON; blocks finds RCON-placed block; entities sees RCON-summoned pig |
| `05-chat.test.js` | sent message appears in observe(chat) ring buffer |
| `06-move.test.js` | move(to) lands bot within 3 blocks of target (RCON-verified) |
| `07-dig-place.test.js` | dig → air (RCON); place → block at target (RCON) |
| `08-inventory-status.test.js` | inspect reflects RCON-given items; status agrees with RCON; equip in main hand (RCON) |

## Adding a new test

1. Create `NN-description.test.js` in this directory.
2. Import what you need from `./_helpers.js` — do not create a new helper file.
3. Set up world state via RCON at the start of the test.
4. Issue tool calls via a real MCP client (`connectStdioClient` or `connectHttpClient`).
5. Assert the outcome via RCON — not via the tool's return value alone.
6. Clean up world state in a `finally` block.
7. Give the test an explicit `{ timeout: Nms }` option; 60000ms is typical.
