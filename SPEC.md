# SPEC.md

Active workstream: two-layer quality model implementation.

## Objective

Replace the previous three-layer test structure (unit/integration/stories)
with a two-layer model:

1. `test/world/` — deterministic live-world checks via real MCP client + real Minecraft.
2. `test/agent/` — real LLM behavior under load with RCON-verified world outcomes.

## Exit criteria

1. `test/world/` contains 8 test files covering health, transports, observe, chat, move, dig/place, inventory/status.
2. `test/agent/` contains 7 test files including session-soak with Option D failure budget.
3. `npm test` runs `test/world/` and passes against the Docker stack.
4. `npm run test:agent` runs `test/agent/` and skips cleanly without LLM env.
5. All `EPOCH5_*` references removed from the codebase.
6. `CONTRIBUTING.md`, `README.md`, `AGENTS.md` updated to reflect the two-layer model.
7. No `test/unit/`, `test/integration/`, `test/stories/` directories.

## Status

Complete. All exit criteria met.
