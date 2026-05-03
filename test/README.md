# Test Surface — mineflayer-mcp

## There is no test runner

OpenCode is the test harness.

Each file in `scenarios/` is a spec the agent reads and executes directly —
spinning up two bot instances, issuing MCP tool calls, querying RCON as the
oracle, and reporting pass or fail. The scenario files are the tests. The
agent is the runner.

This is intentional. The goal of this project is to validate that an AI agent
can use `mineflayer-mcp` to interact meaningfully with a Minecraft world. The
most honest way to test that is to have an AI agent do it — not to simulate
it with deterministic code.

---

## The invoker / tester pattern

Every scenario uses two bot instances:

- **P1 (Invoker):** performs the action under test via MCP tool calls.
- **P2 (Tester):** connects to the same world independently and observes
  whether the action's effects are visible.
- **RCON (Oracle):** the authoritative ground truth. P2's observation is
  cross-checked against RCON to confirm the result is real, not hallucinated.

Roles can swap between scenarios. The pattern is reusable across any tool
being tested — if an action happens in the world, another bot should be able
to see it, and RCON should be able to confirm it.

---

## Why this works as a testing methodology

A traditional test runner asserts against return values. That's necessary but
not sufficient for an MCP server — what matters is whether the *world* changed,
not just whether the tool returned `{ ok: true }`.

The invoker/tester/RCON triple gives three independent layers of evidence:

1. **Invoker's tool return** — did the MCP call succeed without error?
2. **Tester's observation** — did a second, independent bot see the effect?
3. **RCON confirmation** — does the server's own state match both?

All three must agree for a scenario to pass.

---

## How to run a scenario

Before running any scenario, read `harness.md`. It covers:
- How to start and stop P1 and P2.
- How to connect to RCON.
- What to do if a bot fails to connect.
- Teardown procedure (always run, even on failure).

Then open the scenario file and execute it section by section.

---

## Files

| File | Purpose |
|---|---|
| `harness.md` | Reusable startup, teardown, and RCON instructions for every run |
| `scenarios/T1-chat.md` | Tier 1: invoker sends chat; tester observes it |
| `scenarios/T2-presence.md` | Tier 2: invoker navigates; tester sees invoker nearby |
| `scenarios/T3-world-write.md` | Tier 3: invoker places a block; tester and RCON confirm it |

---

## Scenario file structure

Every scenario file follows this template:

```
## Overview
## Prerequisites
## Setup
## Invoker steps (P1)
## Tester assertions (P2)
## RCON verification
## Pass criteria
## Teardown
## Known limitations
```

This structure is required. It ensures scenarios are consistent, auditable,
and executable by any agent reading them cold.
