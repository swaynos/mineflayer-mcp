# CONTRIBUTING.md

Contribution guidelines for this repository.

## Development model

Product code lives in `src/`. Validation code lives in `test/`. Two layers:

1. `test/world/` — deterministic live-world checks. Real MCP client, real bot, real Minecraft. No LLM.
2. `test/agent/` — real LLM driving real MCP against real Minecraft under load.

## Required agent workflow

1. Work from an explicit objective (`SPEC.md` when an active workstream exists).
2. Implement changes in `src/`.
3. Add or update tests in `test/` to cover behavior changes.
4. Run required verification (below).
5. Request peer review before declaring completion.

For agent-driven loops, `@autonomous` is the builder and `@peer-review` is the
required reviewer. Builder completion is blocked if peer review returns
blocking findings. Agent definitions and role contracts live in
`https://github.com/swaynos/cuddly-winner/tree/main/agents`.

## Required verification

### Step 0: start the project-owned infrastructure

```sh
docker compose -f docker-compose.dev.yaml up -d
```

The Docker stack is project-owned and required. Tests do not skip on missing infrastructure — they fail.

### Step 1: deterministic world checks (always required)

```sh
npm test
```

Runs `test/world/*.test.js` sequentially against a live bot and real Minecraft server.
Every test asserts a world-state or bot-state outcome via RCON.

**Required when touching:** MCP transport, bot lifecycle, tool dispatch, tool schemas, error handling, lock behavior, or any `src/` file.

### Step 2: agent behavior checks (required when touching user-facing surface)

```sh
npm run test:agent
```

Runs `test/agent/*.test.js` with a real LLM calling real MCP tools.
Requires `OPENAI_API_KEY` and `AGENT_MCP_URL` in `.env`.
Tests skip loudly when these are missing.

**Required when touching:** tool descriptions, tool schemas, resource definitions, prompts, or any change that affects what the model sees.

## Invariants

- `npm test` must pass before declaring completion.
- **Never claim success from `{ ok: true }`.** An assertion must prove world-state, bot-state, or MCP-client-visible change.
- No ghost tools. `assertCompleteness()` runs at import time in `src/tools.js`.
- Stdout is sacred. The MCP stdio transport must never emit non-JSON-RPC lines. This is actively enforced in `test/world/02-stdio.test.js`.
- No secrets in source control.
- No new top-level directories without explicit justification.

## Review expectations

- Do not weaken tests to force passing.
- Do not lower the session-soak budget (`AGENT_SOAK_PASS_PCT`) to make a test green — investigate the failure pattern instead.
- Peer review must assess: regression risk in tool dispatch, error shaping, transport safety, and bot lifecycle.
