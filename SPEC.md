# SPEC.md — mineflayer-mcp Robustness Loop

This file is the implementation contract for `mineflayer-mcp`. M1–M5 are
complete (see git history / prior `SPEC.md` for evidence). This spec defines
the **next phase**: an iterative stress-test loop that hardens the existing
implementation by generating novel test cases, running them against the live
Math deployment, documenting any bugs found, fixing them, and repeating.

`README.md` is the public face of the project; this file is for the agent
doing the work.

---

## Current focus — iterative robustness

**Run the loop until 500 iterations complete or a true blocker escalates.
Do not stop between iterations. Do not expand scope beyond what the
existing design commitments allow.**

Each iteration is atomic, numbered, and permanent. Each iteration's scenario
file is stored in `opencode/iterations/NNN.md` (gitignored — local context,
not committed code).

---

## The loop

For each iteration `N` in `001..500`:

### 1. Generate a novel test case

Design a scenario that stresses some aspect of the current codebase in a way
prior iterations haven't. The scenario must meet the **novelty threshold**
defined below (§ Novelty measurement).

The scenario must operate through the existing tool surface, resource
surface, or safety system — no probing internals directly. If the scenario
requires a capability the bot doesn't yet have, you may build that capability
within the design commitments and count its creation as part of this
iteration (see § Missing capabilities below).

Scenarios draw from categories such as:

- **Boundary values** — coordinates at world edge, inventory at capacity,
  chat at max length, distance at max reach, etc.
- **Concurrency** — P1 and P2 invoking the same tool simultaneously, P2
  observing while P1 acts, multi-bot coordination.
- **Error recovery** — bot recovers after RCON-triggered death, chunk
  unload mid-scan, disconnect/reconnect, invalid tool args.
- **Race conditions** — tool A fires while tool B in flight, event ordering,
  timing-dependent state.
- **Resource exhaustion** — chat buffer overflow, pathfinder timeout,
  long-running navigate, large entity lists.
- **Adversarial input** — malformed JSON, unicode in usernames, SQL-ish
  injection in chat, negative distances, out-of-range ints.
- **State consistency** — tool result vs. resource read vs. RCON oracle,
  inventory-after-place, health-during-flee.
- **Environmental** — night-time hostile density, rain affecting movement,
  dimension transitions, offline-mode quirks.

You are not limited to these categories; they're a starting palette.

### 2. Write the scenario to `opencode/iterations/NNN.md`

Use the template in § Iteration file template. Include the novelty rationale
before running anything.

### 3. Run the scenario

- Spin up P1 (and P2 if needed) locally — see `test/harness.md`.
- Use RCON to set up preconditions and verify ground truth.
- Record tool outputs, tester observations, and RCON confirmations.

### 4. Evaluate

- **If the test passes first try:** record evidence in the iteration file,
  mark `Result: PASS (no fix needed)`, move to iteration `N+1`.
- **If the test fails:** proceed to § 5.

### 5. Diagnose, fix, retry

- Add a new entry to `opencode/issues.md` (the cross-iteration bug ledger)
  describing the failure, its root cause, and the code change needed.
- Fix the code. Verify `assertCompleteness()` still passes.
- Re-run the iteration.
- Repeat until the test passes, up to **25 fix attempts**.
- After **5 fix attempts without progress**, re-evaluate the test case for
  validity. See § Test case re-evaluation.
- After **25 fix attempts**, the iteration is blocked. See § Blocking.

### 6. Record

- Iteration file finalised with `Result: PASS`, all fix attempts logged,
  cross-references to `issues.md` entries.
- Update `opencode/iterations/INDEX.md` with a one-line summary of the
  iteration.

### 7. Checkpoint every 50 iterations

After iteration `050`, `100`, `150`, ..., `500`:

- **Pause the main loop.**
- Re-run every prior iteration's scenario against the current code.
- For any that regress: document in `opencode/checkpoints/NNN.md`, fix the
  regression, append a "regressed at checkpoint N, re-fixed" note to the
  relevant iteration file.
- Checkpoint activity does NOT count as an iteration.
- Once the full regression pass is clean, resume the main loop at `N+1`.

---

## Novelty measurement

Each new iteration must achieve a novelty score `≥ 3` on the rubric below,
relative to all prior iterations. This is low enough to not block the early
iterations (where the design space is large) but high enough to prevent
trivial duplicates after iteration ~200.

### Novelty rubric

Score each new scenario on five dimensions (0 or 1 per dimension):

| Dimension | Earns 1 point if the scenario... |
|---|---|
| **Tool combination** | ...exercises a combination of tools/resources no prior iteration has exercised together |
| **Category** | ...falls in a category (boundary / concurrency / error-recovery / race / resource / adversarial / state / environmental / other) with fewer than 10 prior iterations |
| **Input shape** | ...uses argument shapes (ranges, types, special values) no prior iteration has used |
| **Failure mode** | ...stresses a failure mode (timeout, invalid state, ordering, exhaustion) no prior iteration has stressed |
| **Evidence layer** | ...cross-checks evidence in a way prior iterations haven't (e.g., tool+resource consistency, P1+P2+RCON+logfile, etc.) |

**Minimum total: 3.** If the proposed scenario scores < 3, discard it and
generate a different one.

The novelty score is declared in the iteration's frontmatter. Reviewers can
spot-check by scanning `opencode/iterations/INDEX.md`.

### Novelty index

`opencode/iterations/INDEX.md` is a running log. Every iteration appends one
row:

```
| NNN | YYYY-MM-DD | category | tools/resources used | novelty score | one-line summary |
```

The agent consults this file before generating each new iteration's scenario.

---

## Test case re-evaluation (before escalating)

After **5 fix attempts without the test passing**, stop and re-read the test
case. Ask:

- Does this scenario assume something Minecraft doesn't actually support?
  (World height limits, reach distance ≤ 6 blocks, inventory size = 36, chat
  char limit = 256, etc.)
- Does it assume behavior mineflayer doesn't expose?
- Does it assume server permissions the test bots don't have?
- Is the precondition actually achievable via RCON in this world?

**If the test case is invalid**, rewrite it with tighter assumptions,
document the re-evaluation in the iteration file under a `## Re-evaluation`
section, and resume fixing. The re-evaluation itself counts as novelty —
the iteration now also tests Minecraft's actual limits.

**If the test case is valid** but stuck, continue fixing up to the 25-attempt
ceiling.

---

## Missing capabilities

If an iteration requires a tool or resource that doesn't yet exist:

- You may add it, provided the addition respects the six design commitments
  (see § Design commitments).
- The new tool must go through all four touch points: `TOOLS`, `SCHEMAS`,
  `DISPATCHED`, `dispatch()` case. `assertCompleteness()` must pass.
- The addition is part of the iteration's "fix" — document it in the
  iteration file, not as a separate feature milestone.
- Adding a capability does NOT require human approval unless it involves:
  (a) a new dependency, (b) a breaking schema change to an existing tool,
  (c) an architectural change to how bot/server/http.js interact, or
  (d) a production-affecting change to `MathBridgeBot` on `nyx`. These are
  escalations — see § Blocking.

---

## Blocking / escalation policy

**Avoid escalations at all costs.** True blocking is not expected.

An iteration is blocked (escalate) only if ALL of the following are true:

- 25 fix attempts exhausted, OR a fix would require one of the escalation
  cases listed in § Missing capabilities.
- Re-evaluation (after the 5-attempt threshold) did not produce a valid
  rewrite.
- The Math server or RCON has become unreachable AND cannot be recovered by
  the agent via RCON restart / container inspection / redeploy.

On true blocking:

- Write a final entry to `opencode/issues.md` with full diagnosis and
  proposed remediation.
- Mark the iteration `Result: BLOCKED` with the reason.
- Stop the loop.
- Wait for human input. Do not begin iteration `N+1` unilaterally.

**Not blocking** (keep going):

- The test case was invalid and had to be rewritten. Not blocked — that's
  successful re-evaluation.
- A fix required adding a new tool. Not blocked — that's successful
  capability expansion.
- A fix required RCON-level setup of world state (mob clearing, teleport,
  gamemode change). Not blocked — that's fixture setup.

---

## Iteration file template

Every file in `opencode/iterations/NNN.md` uses this template:

```markdown
# Iteration NNN: <one-line title>

**Date:** YYYY-MM-DD
**Result:** PASS | BLOCKED
**Category:** boundary | concurrency | error-recovery | race | resource-exhaustion | adversarial | state | environmental | other
**Novelty score:** N/5
**Novelty rationale:** <what this tests that prior iterations haven't>
**Fix attempts:** N
**Issues filed:** #NNN, #NNN
**Tools/resources exercised:** <list>

## Scenario

<preconditions, steps, pass criteria — enough detail that this could be
re-run by a different agent reading cold>

## Run log

<what happened when the test was first run — tool outputs, RCON responses,
 any errors>

## Re-evaluation (if triggered)

<after 5 fix attempts stuck: what was revisited, what assumption was wrong,
 how the scenario was rewritten>

## Fix(es) applied

<each fix attempt: what was changed, why, and the result of re-running>

## Final evidence

<tool outputs / RCON confirmations / tester observations proving the
 scenario now passes>
```

---

## Issues ledger — `opencode/issues.md`

A flat, append-only file. Every bug discovered across all iterations gets an
entry. Format:

```markdown
## Issue #NNN — <short title>

**Discovered in:** iteration NNN
**Category:** <code area / subsystem>
**Status:** OPEN | RESOLVED (iter NNN) | REGRESSED (checkpoint NN) | UPSTREAM

### Symptom
<what was observed>

### Root cause
<what the code was actually doing vs. what was intended>

### Fix
<what was changed; include file paths and a short diff description>

### Regression test
<which iteration(s) now cover this bug to prevent recurrence>
```

`issues.md` is the single source of truth for "what has this project ever
gotten wrong?". Reading it top-to-bottom is the fastest way to understand
the real-world reliability of the codebase.

---

## Checkpoint file template

Every file in `opencode/checkpoints/NNN.md` uses this template:

```markdown
# Checkpoint NNN (after iteration NNN)

**Date:** YYYY-MM-DD
**Iterations re-run:** 1..NNN
**Regressions found:** count

## Regressions

### Iteration NNN regressed

<what broke, why, what was re-fixed>

## Clean after re-fix

<confirmation that a subsequent full regression pass is green before
 resuming the main loop>
```

---

## Harness reminders

- P1 on `127.0.0.1:18080`, P2 on `127.0.0.1:18081`. Usernames `MathTest-P1`,
  `MathTest-P2`. Lockfiles at `/tmp/mathtest-p[12].lock`.
- RCON at `callisto:25576`, password in `opencode/context/MathInstance/secrets.env`.
- Math server is shared with live `MathBridgeBot` — use RCON to isolate test
  state when possible (e.g., `/kill @e[type=!player,distance=..32]`).
- After each iteration, tear down test bots cleanly (kill processes, remove
  lockfiles) to avoid leaving stale connections.
- Use RCON generously for setup/teardown. It's the agent's ground truth and
  its fixture control plane.

---

## Design commitments (non-negotiable)

These hold across every iteration, every fix, every capability addition:

1. **No ghost tools.** `assertCompleteness()` must pass at every point.
2. **No chat-as-command.** World edits use mineflayer APIs exclusively.
3. **Errors carry codes.** `normalizeError()` handles all throw shapes.
4. **Stdout is sacred.** Logs go to stderr only.
5. **One bot, many sessions.** HTTP entrypoint never spawns per-session.
6. **Tools do; resources observe.**

Violating any of these is automatic grounds for re-doing the fix.

---

## Loop termination

The loop stops when:

1. Iteration `500` completes successfully. (Normal completion.)
2. A true blocker is hit as defined in § Blocking. (Escalation.)

On normal completion, write a final summary to `opencode/iterations/SUMMARY.md`
covering: total iterations, issues discovered, issues resolved, open issues,
regressions caught at checkpoints, and categories stressed.

---

## Historical milestones (reference)

The initial tool surface (M1–M5) was built incrementally and all scenarios
T1/T2/T3 passed. See prior git history for that earlier `SPEC.md` if needed.
The current codebase has:

- 18 tools (`chat`, `get_position`, `find_blocks`, `inspect_inventory`,
  `read_recent_chat`, `list_nearby_players`, `get_biome`, `look_at`,
  `look_at_player`, `get_health`, `list_nearby_entities`, `navigate_to`,
  `navigate_relative`, `get_time_of_day`, `get_weather`, `place_block`,
  `dig_block`, `use_item`)
- 6 resources (`minecraft://position|inventory|health|blocks/nearby|players/nearby|chat/recent`)
- M4 safety: auto-respawn, fall protection, mob flee, health tracking
  (toggle via `--safe-mode`)
- Deployed to `nyx` as `mcpmc-bridge.service`, connected to Discord via
  OpenClaw

The robustness loop starts from this baseline.
