# SPEC.md — mineflayer-mcp Implementation Contract

This file is the implementation contract for `mineflayer-mcp` and the
outward-facing description of what the project is building next.
`README.md` is the public face of the project (what the software does);
this file explains **how the software is being hardened and why the
process looks the way it does**.

---

## Where the project is, at a glance

The core `mineflayer-mcp` server is built and has been stress-tested
through two complete testing epochs. All five original milestones
(M1 observation, M2 movement, M3 world-write, M4 safety, M5 resources)
are complete and deployed to production. The current public surface is:

- **30 tools** (chat, navigation, observation, world-edit, crafting, combat,
  inventory management, survival, following)
- **6 MCP resources** (read-only views of bot state)
- **Runtime safety** (auto-respawn, fall protection, mob avoidance)

The 19th tool (`craft_item`) was added during Epoch 2 when the gameplay
loop for "P1 crafts a tool" required it. More capability gaps remain —
see `opencode/epoch_3_spec.md` for the next round of expected additions.

What remains is not "build more features." It is **prove that the
existing features actually support the gameplay they claim to support,
under realistic multi-agent usage, and fill capability gaps as real
gameplay loops expose them.** That proof is structured as a series of
**epochs** — long testing campaigns, each with a distinct theme,
distilled at the end into a keeper test suite and an honest list of
what broke and why.

---

## The epoch model (for observers of this repo)

An **epoch** is a bounded, autonomous testing campaign. The agent
drives it — generating test scenarios, running them against the live
Minecraft server, fixing any bugs found, and recording everything.
At the end of an epoch, the work is distilled into a permanent summary
in `opencode/epochs/epoch_NNN.md`.

### Epoch 1 — Subsystem robustness (COMPLETE)

- **Method:** 500 auto-generated iterations stressing the tool surface
  with random-ish inputs, race conditions, and boundary values.
- **Outcome:** **52 iterations** (of 500) retained as genuinely valuable
  test cases; the remainder were smoke tests in disguise.
- **Bugs found and fixed:** 2 real concurrency bugs in the pathfinder
  integration, 1 syntax regression caught by checkpoint, 1 upstream
  constraint documented (Minecraft's chat anti-spam).
- **Retrospective:** around iteration 150 the loop degenerated into
  repetitive "call tool, observe return shape" iterations. The original
  novelty rubric rewarded surface uniqueness rather than behavioral
  insight. See `testing/epoch-001-retrospective.md` for the public
  distillation.

### Epoch 2 — Natural gameplay via actor/observer (COMPLETE)

- **Method:** autonomous loop cycled over 8 gameplay epics drawn from
  what two casual Minecraft players actually do together. Each iteration
  used the actor/observer pattern: P1 performs a narrow gameplay action,
  P2 independently measures the result, RCON serves as oracle.
- **Outcome:** 152 iterations before the loop hung. **6 of 8 epics fully
  met their minimum-progress criteria** (≥15 accepted iterations, ≥1
  cross-source oracle, ≥1 failure-path, ≥30% failure-path ratio). The
  other 2 (Epic 7 exploration, Epic 8 P2-scores-P1) hit 15+ iterations
  but fell short of the 30% failure-path ratio.
- **Bugs found and resolved:**
  - Issue #005 — `dig_block` silently succeeded for out-of-reach blocks.
    Fix: reach-distance check before `bot.dig()`.
  - Issue #006 — cross-bot `find_blocks` has a 50–200ms chunk-cache
    staleness window after a remote dig. Documented as upstream/design.
  - Issue #007 — `craft_item` tool added as the 19th capability to
    satisfy Epic 6. Two fix iterations to support both 2×2 and 3×3 recipes.
- **Retrospective:** the Options A/B/C/D incentive stack (fix-bonus,
  30% failure ratio, observation-only exclusion, "why this might break"
  section) held the loop to substantive iterations — unlike Epoch 1 —
  but ~107 of 152 iteration files collapsed to "see COVERAGE.json"
  stubs, making the retrospective harder. Epoch 3 introduces Rule 11
  (iteration-file completeness gate) to prevent this.
  Full diagnosis in `opencode/epochs/epoch_002.md`.

### Epoch 3 — Interaction, resource flow, resilience (COMPLETE)

- **Method:** same autonomous actor/observer loop, 6 new epics addressing
  gaps from Epoch 2.
- **Outcome:** 100 iterations. All 6 epics met minimum criteria. **11 new
  tools added** (attack_entity, activate_block, equip_item, drop_item,
  open_container, take_item, deposit_item, close_container, eat, sleep,
  follow_player). Tool surface grew 19 → 30.
- **Bugs found:** 0 new issues filed. All 11 capability additions completed
  within their iterations with fix_bonus applied. No new behavioral bugs
  discovered — the existing codebase patterns (reach checks, error
  normalization, assertCompleteness gate) held cleanly.
- **Key strengthening:** Rule 11 (iteration file completeness gate) kept
  file quality high. Resume checkpoints every 10 iterations enabled clean
  termination. All failure-path ratios above 30%.
- **Full retrospective:** `opencode/epochs/epoch_003.md` (gitignored).

### Future epochs (tentative, unscoped)

- **Epoch 4 — PVP / redstone / Nether:** advanced-gameplay surface
  deferred from Epoch 2.
- **Epoch 5 — Multi-agent (>2 bots) coordination.**
- **Epoch 6 — Performance & throughput:** latency budgets, concurrent
  session scaling.

---

## Why this structure

The core insight from Epoch 1 was that **test quantity is not test
quality**. 500 iterations produced 52 useful tests. The rest were noise
that happened to pass a novelty check based on surface uniqueness.

Epoch 2 fixed most of that with thematic framing (gameplay epics),
actor/observer separation (asymmetric roles), Rule 0 (atomic scope
gate), the hard cap (forces honest exit), and the Options A/B/C/D
incentive stack (reward finding bugs, not passing tests).

Epoch 2 revealed a new failure mode: iteration files can still collapse
to stubs even when the novelty system accepts them. Epoch 3 closes that
hole with Rule 11 (iteration-file completeness gate). It also adds
procedural resume discipline so a hung loop is recoverable.

Each epoch produces a retrospective that informs the next. Failure
modes are surfaced and addressed; the methodology improves monotonically.

---

## Where to look

| If you want to know... | Read... |
|---|---|
| What the software does | `README.md` |
| What tools & resources exist | `README.md` § Current surface |
| The testing methodology | `testing/novelty.md` |
| The gameplay epics being tested | `testing/gameplay-epics.md` |
| What Epoch 1 tested and what broke | `testing/epoch-001-retrospective.md` |
| What Epoch 2 tested and what broke | `opencode/epochs/epoch_002.md` (gitignored) |
| What Epoch 3 will test | `opencode/epoch_3_spec.md` (gitignored) |
| The deployment of the production bot | `opencode/context/MathInstance/spec.md` (gitignored) |
| Every bug ever found by the testing loop | `opencode/issues.md` (gitignored) |
| How to run a scenario yourself | `test/README.md`, `test/harness.md` |

Per `.gitignore`, everything under `opencode/` is local context — it
is not committed to the repository. What IS committed is this spec,
the `README.md`, the source tree in `src/`, the formal scenarios
in `test/`, and the methodology documents in `testing/`. The
testing artifacts (iteration files, COVERAGE.json, issues ledger,
in-progress epoch specs) are deliberately kept separate so that the
repo remains focused on the software under test, not the evolving
testing methodology.

A sanitized Epoch 2 retrospective will be promoted to
`testing/epoch-002-retrospective.md` in a separate step, following
the same pattern as Epoch 1.

---

## The rest of this document

What follows is the **operational detail the agent needs** to run an
epoch correctly — iteration lifecycle, blocking policy, fix cycles,
file formats, and design commitments. It is written for the agent;
casual observers do not need to read past this point.

---

## Current focus — between epochs

**Epochs 1–3 are complete.** The tool surface is 30 tools with 6 MCP
resources, validated through 752 total iterations across 3 testing epochs
(500 + 152 + 100). The next epoch has not been scoped or started.

The project is at a natural checkpoint: the casual survival-gameplay loop
is fully covered (observe, move, build, mine, craft, interact with mobs
and blocks, manage inventory, eat, sleep, follow a player). What comes
next is either advanced gameplay (PVP, redstone, dimensions) or
operational maturity (CI, npm publish, multi-bot scaling). That decision
is pending human direction.

Each iteration is atomic, numbered, and permanent. Each iteration's
scenario file is stored in `opencode/iterations/NNN.md` (gitignored —
local context, not committed code). Per Rule 11, each scenario file
must contain all 7 required sections (frontmatter, fingerprint JSON,
Scenario, Regression value, Why this might break, Run log, Final
evidence) before the iteration counts toward epic progress.

Every 10th iteration, update `opencode/iterations/RESUME.md` with
the current epic, last completed iteration number, any in-flight
work, and the next intended action — so that a hung or interrupted
loop can be resumed cleanly.

---

## The loop

For each iteration `N` until exit conditions are met (see § Loop
termination):

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
  (d) a production-affecting change to the deployed bot instance. These are
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

The deployment-specific values (test-bot ports, usernames, lockfile paths,
RCON host/port, RCON password) live in `opencode/context/MathInstance/`
(gitignored) and `test/harness.md`. Use those as the source of truth; do
not hardcode them elsewhere.

General operational rules:

- The test environment is shared with a live production bot instance. Use
  RCON to isolate test state when possible (e.g.,
  `/kill @e[type=!player,distance=..32]`).
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

When an epoch is active, the loop stops the moment ONE of the following
becomes true (whichever comes first):

1. **Normal completion.** All epics in the current epoch have met their
   minimum-progress criteria (≥ 15 accepted iterations each, with
   ≥ 1 cross-source-oracle, ≥ 1 failure-path, and ≥ 30% failure-path
   ratio per epic) AND the bug-density gate has not been tripped in
   the most recent 20 iterations.
2. **Hard cap.** Iteration counter reaches **500**. The loop
   stops immediately regardless of remaining epic coverage.
3. **Escalation.** A true blocker is hit as defined in § Blocking.

On any exit, produce `opencode/epochs/epoch_NNN.md` applying
retention rules to distill the epoch's keepers. Copy
`opencode/iterations/COVERAGE.json` to
`opencode/epochs/epoch_NNN_coverage.json`. Then clear
`opencode/iterations/` and `opencode/checkpoints/` for the next epoch.

---

## Historical milestones (reference)

The initial tool surface (M1–M5) was built incrementally and all scenarios
T1/T2/T3 passed. See prior git history for that earlier `SPEC.md` if needed.
The current codebase has:

- 30 tools (`chat`, `get_position`, `find_blocks`, `inspect_inventory`,
  `read_recent_chat`, `list_nearby_players`, `get_biome`, `look_at`,
  `look_at_player`, `get_health`, `list_nearby_entities`, `navigate_to`,
  `navigate_relative`, `get_time_of_day`, `get_weather`, `place_block`,
  `dig_block`, `use_item`, `craft_item`, `attack_entity`, `activate_block`,
  `equip_item`, `drop_item`, `open_container`, `take_item`, `deposit_item`,
  `close_container`, `eat`, `sleep`, `follow_player`). `craft_item` was added
  during Epoch 2; the remaining 11 interaction/inventory/survival tools were
  added during Epoch 3.
- 6 resources (`minecraft://position|inventory|health|blocks/nearby|players/nearby|chat/recent`)
- M4 safety: auto-respawn, fall protection, mob flee, health tracking
  (toggle via `--safe-mode`)
- Issue-fix baseline: `dig_block` reach check (Issue #005),
  pathfinder drain/setGoal-null fix (Issues #001, #002),
  `craft_item` with nearby-crafting-table resolution (Issue #007).
- Deployed to a production host running the production bot on the
  public side of the bridge; connected to Discord via the gateway
  layer. See `opencode/context/MathInstance/spec.md` for deployment
  specifics.

The project is at the end of Epoch 3. All expected tools have been added.
The next epoch is unscoped and pending human direction.
