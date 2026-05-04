# testing/novelty.md — Deterministic Test Novelty Evaluation

This document defines the algorithm an AI agent uses to decide whether a
proposed test case is novel enough to run. It replaces subjective "does this
feel different?" scoring with a set of deterministic boolean checks against
a persistent coverage index. Two agents running the same evaluation against
the same index must produce the same score.

The system was developed after an initial test epoch produced 500 iterations
but only ~50 genuinely useful test cases. The rest were smoke tests in
disguise — passing a surface-uniqueness check (different coordinates, different
timestamp) while testing nothing the prior 50 hadn't already covered.

---

## Inputs

Every novelty evaluation operates on three inputs:

1. **The proposed test case**, fully specified as a JSON fingerprint (see
   § Fingerprint schema).
2. **The epoch's coverage index** (`COVERAGE.json`), which records every
   fingerprint run so far in the current epoch plus every fingerprint
   inherited as a regression baseline from prior epochs.
3. **The retention rules** (§ Test case retention rules in the epoch
   retrospective). These define the 6 categories a valid test must satisfy
   at least one of. Novelty evaluation happens after retention-category
   qualification, not before.

---

## Output

```json
{
  "accepted": true | false,
  "base_score": 0..10,
  "fix_bonus": 0 | 2,
  "final_score": 0..12,
  "threshold": 5,
  "rule_0_passed": true | false,
  "observation_only": true | false,
  "counts_toward_epic_progress": true | false,
  "rules_passed": ["rule_name_1", ...],
  "rules_failed": ["rule_name_2", ...],
  "reason_if_rejected": "<one of: atomic_scope_violation | duplicate_fingerprint | ...>"
}
```

If `rule_0_passed` is `false`, `base_score`, `fix_bonus`, and `final_score`
are all forced to `0`, and the 10 scoring rules are short-circuited.
`reason_if_rejected` will be `"atomic_scope_violation"`.

`observation_only` and `counts_toward_epic_progress` are computed from the
fingerprint's `tools` and `resources` arrays per § Observation-only rule.

---

## Fingerprint schema

Every test case is reduced to a JSON object with exactly these fields.
Fields that do not apply use `null`, not omission.

```json
{
  "actor": "P1",
  "observer": "P2",
  "actor_intent": "<one sentence: what the actor is attempting>",
  "observer_protocol": "<one sentence: what the observer must measure>",
  "tools": ["navigate_to", "get_position"],
  "resources": ["minecraft://position"],
  "rcon_commands": ["data get entity @a[name=BotName,limit=1] Pos"],
  "bot_count": 2,
  "concurrency": "sequential" | "concurrent" | "racing",
  "evidence_sources": ["tool", "resource", "rcon"],
  "failure_mode": null | "timeout" | "invalid_param" | "unknown_tool" |
                  "session_error" | "server_kick" | "entity_not_loaded" |
                  "chunks_not_loaded" | "path_stopped" | "goal_changed" |
                  "no_block" | "out_of_reach" | "spawn_protection" |
                  "death" | "disconnect_spam" | "malformed_json" |
                  "missing_session" | "empty_body" | "http_parse_error",
  "state_transition": null | "day_to_night" | "night_to_day" |
                      "clear_to_rain" | "rain_to_thunder" | "thunder_to_clear" |
                      "biome_change" | "dimension_change" |
                      "alive_to_dead" | "dead_to_alive" |
                      "health_decrease" | "health_increase" |
                      "gamemode_change" | "op_to_deop" | "deop_to_op" |
                      "session_init" | "session_reinit" | "session_close" |
                      "bot_join" | "bot_leave" |
                      "chat_buffer_cap" | "inventory_add" | "inventory_remove" |
                      "phase_transition",
  "minecraft_limit": null | "chat_256" | "reach_6" | "world_y_top" |
                     "world_y_bottom" | "chunk_radius" | "tick_rate" |
                     "max_entities" | "max_inventory_slots" |
                     "protocol_version" | "anti_spam" | "spawn_protection" |
                     "op_required" | "build_height",
  "input_shape": null | "empty_string" | "empty_array" | "wrong_type" |
                 "unknown_tool" | "extra_property" | "out_of_range" |
                 "missing_required" | "null_value" |
                 "extreme_finite" | "negative" | "zero" |
                 "unicode" | "sql_like" | "slash_command" | "emoji" |
                 "html_special" | "escape_sequence" | "malformed_json" |
                 "empty_body",
  "retention_category": "bug_found" | "cross_source_oracle" |
                        "concurrency_race" | "error_path" |
                        "minecraft_limit" | "state_transition"
}
```

The agent must produce this fingerprint before running the test. The
fingerprint is recorded even if the test is rejected.

---

## Rule 0 (Gate) — Atomic iteration scope

Rule 0 is a pre-filter, not a scoring rule. If it fails, the score is
forced to 0 and the 10 scoring rules are not evaluated.

**The proposed iteration must describe one atomic gameplay action.** It must
satisfy ALL of:

1. `actor_intent` describes a single observable event that either succeeds
   or fails as a unit. The sentence must NOT contain a top-level sequence
   conjunction (`and then`, `, then`, `followed by`, `after which`, `next`,
   `once that completes`) joining more than two verbs.
2. The fingerprint's `tools` array contains at most 3 distinct actor-side
   tool names, with at most 2 of those mutating world state. Mutating tools:
   `chat`, `place_block`, `dig_block`, `use_item`, `navigate_to`,
   `navigate_relative`, `look_at`, `look_at_player`, plus any world-mutating
   tool added during the epoch.
3. `observer_protocol` describes measurements of a single event or a small
   event sequence (≤ 3 observations of the same underlying action).
4. The "Condition tested" regression-value sentence addresses exactly ONE
   condition. It must not contain `and` joining two independent clauses.

**Why this exists:** Epics are themes, not tasks. An iteration that covers
an entire epic end-to-end provides no isolation: when it regresses later,
you cannot tell which step broke.

---

## The 10 scoring rules

Each rule is a boolean. The base score is the count of rules that pass.
Minimum to accept: **score ≥ 5 out of 10**.

### Rule 1 — Fingerprint is structurally new

The fingerprint's `(tools, resources, rcon_commands, concurrency, failure_mode,
state_transition, input_shape)` 7-tuple must not exact-match any entry in
`COVERAGE.json`. Cosmetic fields (`bot_count`, `evidence_sources`) are
excluded from this check.

### Rule 2 — At least one dimension is net-new

At least one of these coverage cells must have `count == 0` in `COVERAGE.json`
before this iteration:

- `(tool, failure_mode)` for each tool in `tools`
- `(resource, failure_mode)` for each resource in `resources`
- `(tool, concurrency, bot_count)` for each tool
- `(tool, state_transition)` for each tool
- `(tool, input_shape)` for each tool
- `(tool, minecraft_limit)` for each tool

### Rule 3 — Evidence combination is new for this tool set

The combination of `evidence_sources` has never been used with this exact
sorted `(tools + resources)` list. A "combination" is a non-empty subset of
`{tool, resource, rcon, observation_from_other_bot, process_log, docker_log}`.

### Rule 4 — Failure mode is first-time for at least one tool

`failure_mode` must be non-null, AND at least one `(tool, failure_mode)` pair
in this test must not appear in `COVERAGE.json`.

### Rule 5 — State transition is first-time for this tool set

`state_transition` must be non-null, AND the combination
`(sorted(tools + resources), state_transition)` must not appear in
`COVERAGE.json`.

### Rule 6 — Concurrency dimension is exercised in a new way

`concurrency` must be `"concurrent"` or `"racing"`, AND the combination
`(sorted(tools), concurrency, bot_count)` must not appear in `COVERAGE.json`.

### Rule 7 — A Minecraft-layer limit is probed for the first time

`minecraft_limit` must be non-null, AND `(sorted(tools), minecraft_limit)`
must not appear in `COVERAGE.json`.

### Rule 8 — Input shape is first-time for at least one tool

`input_shape` must be non-null, AND at least one `(tool, input_shape)` pair
must not appear in `COVERAGE.json`.

### Rule 9 — Regression-value declaration is concrete and novel

The iteration file must include a `## Regression value` section with:

```
**Condition tested:** <sentence naming a specific code path, event ordering,
or state combination exercised by this test>
**What would break:** <sentence naming a specific observable failure that
would occur if this condition regressed>
```

Each sentence must include at least one noun from `{tool name, resource URI,
event name, state variable, code branch, mineflayer API, pathfinder state,
error code}` and a verb indicating change or observation. Neither sentence
may be a verbatim duplicate of any prior iteration's declaration.

### Rule 10 — Retention category evidence is present

The `retention_category` field must name one of the six categories, and the
fingerprint plus run log must contain the required evidence:

- `bug_found` — an `issues.md` entry number referenced in the frontmatter
- `cross_source_oracle` — `evidence_sources` contains ≥ 2 of `{tool, resource, rcon, observation_from_other_bot}`
- `concurrency_race` — `concurrency != "sequential"` or `bot_count >= 2`
- `error_path` — `failure_mode` is non-null and the run log shows the error triggered and caught
- `minecraft_limit` — `minecraft_limit` is non-null
- `state_transition` — `state_transition` is non-null

---

## Scoring formula

```
base_score = sum of rules 1–10 that pass
fix_bonus  = 2 if ≥1 code change was required before the scenario passed, else 0
final_score = base_score + fix_bonus
accepted   = (final_score >= 5)
```

**The fix bonus exists to incentivize finding real bugs.** An iteration that
passes on the first run scores its base score only. An iteration that
requires a code change to `src/` to pass earns +2 — making it count more
toward epic progress than a clean observation test. This directly rewards the
work of finding and fixing bugs over the easier work of confirming happy paths.

---

## Observation-only rule

An iteration is **observation-only** if the actor calls only tools from this
read-only set:

```
get_position, get_health, get_biome, get_time_of_day, get_weather,
list_nearby_players, list_nearby_entities, find_blocks,
read_recent_chat, inspect_inventory,
minecraft://position, minecraft://health, minecraft://inventory,
minecraft://blocks/nearby, minecraft://players/nearby, minecraft://chat/recent
```

Observation-only iterations:
- Are accepted if they pass Rule 0 and score ≥ 5.
- Are recorded in `COVERAGE.json` and the index.
- **Do not advance the epic's progress counter.**

Only iterations where the actor causes a world-state change or server event
advance the epic counter. This prevents an epic from being "completed" by
15 successive "does `get_position` still return a value?" tests.

---

## Option D — "Why this might break" is required

Every iteration file must include a `## Why this might break` section that
names a specific code path in `src/` and the observable failure it would
produce if that path had a bug. The agent must reason about the
implementation, not just the interface. If the agent cannot name a reason
the scenario might break, the iteration is considered low-value and does
not count toward epic progress.

```markdown
## Why this might break

`src/bot.js` `navigateTo()` drains the pathfinder event queue with a 50ms
delay after `stop()`. If that drain were removed, a back-to-back call would
catch the stale `pathStopped` event and return an error on a navigation that
should succeed.
```

---

## Coverage index schema

`COVERAGE.json` tracks all fingerprints and pre-computed indices so every
rule reduces to a lookup:

```json
{
  "epoch": 2,
  "baseline_from_epochs": [1],
  "iterations": [
    {
      "id": "001",
      "fingerprint": { "..." },
      "condition_tested": "...",
      "what_would_break": "...",
      "why_this_might_break": "...",
      "base_score": 7,
      "fix_bonus": 0,
      "final_score": 7,
      "fix_count": 0,
      "observation_only": false,
      "counts_toward_epic_progress": true,
      "rules_passed": ["rule_1", "rule_2", "..."]
    }
  ],
  "rejected": [
    {
      "id": "attempt_before_001",
      "reason": "atomic_scope_violation",
      "fingerprint_partial": { "..." }
    }
  ],
  "by_tool_failure_mode": { "navigate_to|timeout": 1 },
  "by_tool_state_transition": {},
  "by_tool_input_shape": {},
  "by_tool_concurrency_botcount": {},
  "by_tool_minecraft_limit": {},
  "by_evidence_sources_tools": {},
  "seven_tuple_fingerprints": [],
  "condition_tested_strings": [],
  "what_would_break_strings": [],
  "why_this_might_break_strings": [],
  "epic_progress": {
    "1": {
      "total_accepted": 15,
      "counts_toward_progress": 12,
      "oracle_count": 4,
      "failure_path_count": 5,
      "fix_required_count": 3,
      "failure_ratio": 0.42,
      "complete": true
    }
  }
}
```

---

## Evaluation procedure (summary)

1. Generate the fingerprint including actor/observer fields.
2. Write the iteration file — fingerprint, regression-value sentences, and
   `## Why this might break` section.
3. **Run Rule 0 first.** If it fails, record rejection in `COVERAGE.json`
   under `rejected[]` and stop. Do not run the test.
4. Determine `observation_only` from the tools/resources list.
5. Run the 10 scoring rules. Sum booleans → `base_score`.
6. If `base_score < 5`, revise once or discard.
7. Execute the scenario. Actor runs, observer measures, RCON confirms.
8. If it passes first run: `fix_bonus = 0`, `final_score = base_score`.
9. If it fails: file in `issues.md`, fix `src/`, re-run up to 25 attempts.
   After 5 stuck attempts, re-evaluate whether the test case is valid.
   When it finally passes: `fix_bonus = 2`, `final_score = base_score + 2`.
10. Update `COVERAGE.json`. Teardown bots.

---

## Residual subjectivity

Three places where the system cannot be fully deterministic, and their
mitigations:

- **Fingerprint authorship.** The agent chooses what to put in `tools`,
  `failure_mode`, etc. Post-run, actual tool calls can be compared to the
  declared fingerprint; mismatches are a structural violation caught at
  checkpoints.
- **Paraphrase duplicates in Rule 9.** Verbatim detection is exact;
  paraphrases are not caught. Mitigation: a paraphrase-gaming test still
  needs to pass 4+ other rules, which requires real coverage-index progress.
- **Category claim in Rule 10.** The agent chooses the category, but must
  provide evidence that is structurally checked.

---

## Worked example

Proposed test: P1 and P2 simultaneously call `navigate_to` to the same
coordinate; verify both complete and RCON confirms both positions.

Fingerprint:

```json
{
  "actor": "P1", "observer": "P2",
  "actor_intent": "P1 calls navigate_to while P2 also calls navigate_to concurrently",
  "observer_protocol": "P2 verifies its own arrival position via get_position and RCON",
  "tools": ["navigate_to"],
  "resources": [],
  "rcon_commands": ["data get entity @a[name=TestBot-P1,limit=1] Pos",
                    "data get entity @a[name=TestBot-P2,limit=1] Pos"],
  "bot_count": 2,
  "concurrency": "racing",
  "evidence_sources": ["tool", "rcon"],
  "failure_mode": "goal_changed",
  "state_transition": null,
  "minecraft_limit": null,
  "input_shape": null,
  "retention_category": "concurrency_race"
}
```

Why this might break:

> `src/bot.js` `navigateTo()` calls `bot.pathfinder.setGoal(null)` before
> each `goto()` to reset `stopPathing`. If two concurrent callers race through
> this reset, one may call `setGoal(null)` while the other's `goto` is
> registering its listener, causing the second nav to receive a stale
> `pathStopped` event and fail immediately.

Scoring (fresh index):

- Rule 1: new 7-tuple ✓
- Rule 2: `(navigate_to, goal_changed)` untouched ✓
- Rule 3: `(navigate_to, {tool, rcon})` new ✓
- Rule 4: `navigate_to|goal_changed` new ✓
- Rule 5: `state_transition` is null ✗
- Rule 6: `racing + bot_count=2` for `navigate_to` new ✓
- Rule 7: `minecraft_limit` is null ✗
- Rule 8: `input_shape` is null ✗
- Rule 9: both sentences present, novel ✓
- Rule 10: `concurrency_race` with `bot_count=2` ✓

Base score: **7/10**. No fix needed on first run. Final score: **7**.
Accepted.
