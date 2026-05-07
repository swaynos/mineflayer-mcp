# test/agent/

Real LLM + real MCP + real Minecraft behavior checks.

This layer answers: **Can an LLM reliably use this server the way it is meant to be used?**

## Prerequisites

The project-owned Docker stack must be running:

```sh
docker compose -f docker-compose.dev.yaml up -d
```

The MCP HTTP server must be running and exposed at `AGENT_MCP_URL`:

```sh
node src/http.js --host localhost --port 25565 --username agent-test-bot --http-port 8080
```

Environment variables required (in `.env`):

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key for LLM calls |
| `AGENT_MCP_URL` | MCP HTTP endpoint the LLM will use (optional when ngrok auto-detect is available) |
| `RCON_HOST` | RCON host (default `127.0.0.1`) |
| `RCON_PORT` | RCON port (default `25575`) |
| `RCON_PASSWORD` | RCON password (default `mineflayer-dev`) |
| `AGENT_MODEL` | Model to use (default `gpt-4o-mini`) |
| `AGENT_BOT_NAME` | Username of the running bot (for RCON queries, default `agent-test-bot`) |

Optional ngrok variables:

| Variable | Purpose |
|---|---|
| `NGROK_URL` | Public ngrok URL without `/mcp` (e.g. `https://abc123.ngrok-free.app`) |
| `NGROK_AUTHTOKEN` | Token used by your local ngrok agent (set this in your shell or ngrok config) |

Optional soak configuration:

| Variable | Purpose | Default |
|---|---|---|
| `AGENT_SOAK_TASKS` | Number of sub-tasks in session-soak | `20` |
| `AGENT_SOAK_PASS_PCT` | Minimum pass percentage to pass soak (soft threshold) | `85` |
| `AGENT_SOAK_P95_MS` | p95 per-task latency ceiling in ms | `10000` |

## Running

```sh
npm run test:agent
```

Tests skip clearly when `OPENAI_API_KEY` is missing and neither `AGENT_MCP_URL` nor a detectable ngrok tunnel is available.

## Outcome assertions

Every test in this layer asserts **world-state change or bot-state change**, verified via RCON.
A returned `{ ok: true }` from a tool is not sufficient — the world must agree.

## Per-run artifacts

Each run writes JSON artifacts to `test/agent/.runs/<timestamp>/`.
This directory is gitignored. Artifacts are written for every sub-task whether it passed or failed,
so failures are always inspectable without re-running.

## Session-soak contract (Option D)

`session-soak.agent.test.js` runs `AGENT_SOAK_TASKS` sequential natural-language tasks
in a single MCP session. The test uses the following failure model:

### Hard-fail conditions (any one trips the test instantly)

1. **Bot disconnects mid-session.** RCON becomes unreachable or `/list` no longer shows the bot.
2. **Stdout corruption.** Any non-JSON-RPC line on the MCP server's stdout.
3. **Three consecutive sub-task failures.** Indicates server or model drift, not random LLM flake.
4. **p95 latency exceeded.** Median per-task round-trip exceeds `AGENT_SOAK_P95_MS`.

### Soft threshold

Outcome-verified success rate must be ≥ `AGENT_SOAK_PASS_PCT`% of all sub-tasks.
LLM behavior is probabilistic; a single flake should not block the build.
Two consecutive failures trigger a warning in the artifact but do not hard-fail alone.

### Do not weaken the budget to force green

If the soak budget must be lowered to pass, that is a signal to investigate the
failure pattern, not adjust the threshold. See `CONTRIBUTING.md`.
