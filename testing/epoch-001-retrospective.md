# Epoch 001 — Foundational Test Suite

**Source:** iterations 001–500 of the initial robustness loop (500 iterations run, 52 kept).
**Date distilled:** 2026-05-03
**Criterion for inclusion:** Tests something non-trivial. If a broken implementation would still pass the test, it was cut. If the test is "method foo() returns a value with the expected shape," it was cut — that belongs in unit tests, not system tests.

## What this epoch accomplished

- Discovered and fixed **2 real concurrency bugs** in `src/bot.js` pathfinder integration (Issues #001, #002).
- Documented **1 upstream operational constraint** — Minecraft's built-in chat anti-spam disconnects the bot after ~100 rapid messages (Issue #003).
- Caught **1 syntax-regression** at the checkpoint boundary (Issue #004 — duplicate try-block).
- Established cross-source evidence pattern (tool + resource + RCON oracle) as the baseline for all state-consistency testing.
- Validated the invoker/tester/oracle harness concept against 18 tools and 6 resources.

## What this epoch did NOT accomplish

The initial 500-iteration loop collapsed into repetitive smoke tests around iteration ~170. Approximately 450 of the 500 iterations were essentially restatements of "this tool returns a value of the expected shape." These are unit-test-grade assertions, not system-level validations. They found zero new bugs over 400 iterations — the signal-to-noise floor. The novelty rubric (score ≥ 3/5) was too permissive; uniqueness of surface (different coordinate, different timestamp) was enough to score 3, even when the behavior under test was identical to prior runs. See § Lessons for epoch 002 below.

---

## The 52 test cases (by category)

### 1. State consistency — cross-source oracle agreement (9 tests)

These verify that for any observable state, the MCP tool, the MCP resource, and the RCON oracle all agree. They're the most important tests in this suite because they catch drift between how the bot reports state and what the server actually believes.

| # | Name | What it proves |
|---|---|---|
| 001 | get_position triple-consistency | Tool return == resource return == RCON `data get entity … Pos` (within tolerance for timing drift). |
| 002 | get_health triple-consistency | Float-precision consistency across the three sources for health/food/saturation. |
| 003 | Time & weather RCON propagation | RCON `/time set` and `/weather` visible via `get_time_of_day` / `get_weather` within ~2 server ticks. |
| 004 | find_blocks vs RCON-placed | `find_blocks` locates blocks just placed via RCON `setblock`; resource agrees. |
| 005 | P1+P2 proximity + cross-bot biome | P1 sees P2 in `list_nearby_players` after RCON teleport; P2 reports its own biome; all match RCON. |
| 006 | inspect_inventory triple-source | Tool, resource, and RCON inventory NBT agree; documents mineflayer's hotbar slot-index offset of 36. |
| 065 | Real-time position during nav | `get_position` returns live position mid-`navigate_to`, visibly advancing. |
| 073 | Join/leave as system messages | P2 connect/disconnect events captured in P1's buffer with `type=system`, `username=null`. |
| 098 | list_nearby_entities ordering | Entities are sorted by ascending distance — invariant. |

### 2. Adversarial input & validation (8 tests)

Stress the schema layer and HTTP layer with inputs that should never reach the bot.

| # | Name | What it proves |
|---|---|---|
| 012 | 6-case Zod validation sweep | Empty string, empty array, wrong type, unknown tool, extra property, out-of-range → correct error codes (-32601 unknown tool; -32602 invalid params). |
| 030 | Adversarial chat content | Unicode, SQL-like strings, and `/command` chat — slash commands require server op permission to execute. |
| 031 | Block-name resolution | `find_blocks` with nonexistent block name returns empty; mixed valid+invalid returns only valid; `minecraft:` prefix is stripped correctly. |
| 063 | Extreme finite coords | `navigate_to(x=1e308)` returns `reached=true` (upstream empty-path resolution); `look_at(y=1e300)` returns valid pitch. Documented upstream behavior. |
| 066 | HTTP body malformation | Invalid JSON body and empty body produce proper JSON-RPC error envelopes, not unhandled exceptions. |
| 067 | Session enforcement | `tools/list` without a session ID returns `-32000`. |
| 017 | look_at_player error paths | Unknown username and entity-not-loaded yield descriptive errors, not crashes. |
| 032 | look_at world-edge coordinates | `±30M`, `y=0`, `y=320` all return valid yaw/pitch — no overflow. |

### 3. Concurrency & race conditions (7 tests)

Multiple bots or multiple simultaneous calls on the same bot. This is where the real bugs lived.

| # | Name | What it proves |
|---|---|---|
| 009 | navigate_to back-to-back after timeout | **[Issue #001 fix]** 50ms drain after `pathfinder.stop()` prevents stale `pathStopped` event from killing the next call. |
| 016 | P1+P2 5-concurrent mixed calls | Sessions are isolated — no interference on P1 when P2 is active. |
| 026 | Concurrent navigate_to race + recovery | **[Issue #002 fix]** Two near-simultaneous `navigate_to` calls leave pathfinder in a stuck state; requires `setGoal(null)` + drain BEFORE every `goto()` to reset `stopPathing`. Recovery navigation now works after any race. |
| 028 | In-flight observation | P1 navigating while P2 calls `list_nearby_players` — P2's call is non-blocking, sees P1's live position. |
| 034 | P1+P2 independent pathfinders | Both bots navigate to different targets simultaneously without interference. |
| 042 | 10-concurrent chat from both bots | 5 messages from each bot fired at once — all delivered, no buffer corruption, cross-bot observability preserved. |
| 052 | Non-blocking entity listing during nav | `list_nearby_entities` returns during active navigation; both succeed. |

### 4. Error recovery & lifecycle (6 tests)

Paths the bot takes when things go wrong, and recovery guarantees.

| # | Name | What it proves |
|---|---|---|
| 025 | dig-air and place-floating errors | `dig_block` on an air target and `place_block` with no adjacent reference both return descriptive errors; over-reach dig succeeds in offline-mode (server is permissive). |
| 033 | place_block with empty inventory | Clean error path, no crash. |
| 036 | safeMode auto-respawn | RCON `/kill` triggers `bot.on("death")` → `bot.respawn()` → bot returns at spawn with full health, ready to navigate. |
| 038 | Unreachable target timeout | Large-offset navigation hits `timeoutMs` cleanly. |
| 044 | Session lifecycle | Re-initializing an existing session returns `-32600`; a fresh session is created; multi-session isolation holds. |
| 080 | Navigate y=-64 below floor | Unreachable Y returns timeout, not crash. |

### 5. Boundary values at actual Minecraft limits (11 tests)

Not "off-by-one on a Zod range." Tests where Minecraft or mineflayer itself has a real limit that the code must respect.

| # | Name | What it proves |
|---|---|---|
| 015 | chat maxLength 256/257 + use_item both hands | 256-char chat accepted, 257 rejected; both hand values trigger distinct packets. |
| 018 | find_blocks maxCount cap | maxCount=32 caps at 32; maxCount=33 rejected; documents mineflayer's "count first, then filter by distance" behavior. |
| 019 | Navigate edge cases | Already-at-target returns immediately; tolerance=0 requires exact arrival; negative relative offsets work. |
| 020 | read_recent_chat limits + ring buffer | limit=0 rejected, limit=100 returns up to 100, limit=101 rejected; buffer is truly capped at 100. |
| 021 | 8 time-phase transitions | All 8 day-cycle phase boundaries trigger the expected `phase` string; ~2-tick RCON propagation quantified. |
| 022 | Weather state cycling | rain→thunder→clear cycles; `thunderState` float transitions captured. |
| 023 | list_nearby_players distance boundary | 1/50/256/257 distances; a third bot discovered at >100 blocks. |
| 024 | list_nearby_entities distance + hostile mix | 10/64 distances; creeper and sheep correctly classified. |
| 027 | Multi-biome transitions | Desert(14) → warm_ocean(57); chunk lag on rapid teleport observed. |
| 035 | Dynamic health damage/heal | RCON damage 5 → health resource updates; `instant_health` effect restores. |
| 039 | Extreme Y terrain | y=1 block not in client cache from y=70 — chunk reach limit documented; y=318 teleport falls to terrain. |

### 6. World-write cycle (4 tests)

Full tool-chains that modify the world and verify the result across sources.

| # | Name | What it proves |
|---|---|---|
| 013 | place_block + inventory consumption | Block placed, inventory decremented; spawn-protection region discovered (placements near spawn fail). |
| 014 | dig_block drops to inventory | RCON-placed dirt dug; drop appears in inventory. |
| 037 | Hostile classification completeness | cave_spider, enderman, pig, witch — each correctly flagged `isHostile` by the known-hostile set. |
| 060 | place→dig cycle | Stone placed → stone dug without silk-touch → cobblestone in inventory; full state round-trip. |

### 7. P1+P2 cross-bot observability (7 tests)

The heart of the invoker/tester pattern. If these ever regress, the entire testing methodology fails.

| # | Name | What it proves |
|---|---|---|
| 007 | look_at + look_at_player | Bot head rotation, yaw verification via `get_position`, eye-level targeting (`atFeet=false` offset = 1.62). |
| 008 | Chat observability P1→P2 | P1's outgoing chat appears in P2's buffer with `type=chat` and `username=MathTest-P1`. |
| 010 | navigate_relative arithmetic | Offset math confirmed against RCON oracle post-navigation. |
| 011 | Passive + hostile in same scan | RCON-summoned cow and zombie both visible; `isHostile` split correctly. |
| 029 | read_recent_chat `since` precision | Messages before and after a timestamp; `since` filter cleanly separates them. |
| 051 | Navigate with hostile nearby | Zombie summoned near destination; navigation completes; health intact. |
| 047 | Ring-buffer overflow discovery | **[Issue #003]** Sending >100 messages triggers Minecraft's `disconnect.spam` kick. Ring buffer cap itself is code-verified (no runtime probe possible without self-kicking). |

---

## Test case retention rules (going forward)

A test case is kept if and only if it satisfies at least ONE of:

1. **Found a bug** (issue filed in `issues.md`).
2. **Cross-source oracle** — compares ≥ 2 independent sources of truth (tool + resource + RCON + direct observation, etc.) for the same state.
3. **Concurrency / race** — involves ≥ 2 simultaneous calls or ≥ 2 bots.
4. **Error path exercise** — triggers a specific error code in a specific code branch (not "schema rejects out-of-range," since that proves the schema exists, not that the code is correct).
5. **Minecraft-layer limit** — verifies behavior at a limit imposed by Minecraft or mineflayer (chat 256 chars, reach ~6 blocks, protocol version, chunk-cache radius, build limits, etc.).
6. **State-transition** — verifies correct behavior across a state change (death→respawn, time phase boundary, weather cycle, session init/reinit, gamemode switch).

A test case is rejected if:

- It's a "does this getter return a shaped value" check. That's a unit test, not a system test.
- It's "a fresh random value in a schema-accepted range produced output." The range is tested once; varying inputs within it adds nothing.
- It's a rerun of a prior test with cosmetic differences (different coords, different nonce, different timestamp).
- It's a "smoke test" of the tool surface. The tool surface is either complete (`assertCompleteness()`) or broken — no middle ground worth sampling.

---

## Lessons for epoch 002

The next epoch's spec must address the three structural failures of the first loop:

1. **Novelty rubric was a surface-check, not an insight-check.** Fix: require every new scenario to declare "what condition does this put the code in that no prior test has put it in?" in one sentence, and require a second sentence answering "what would break if the underlying behavior regressed?" If either sentence is vague or duplicative, the test case is rejected before it runs.
2. **No bug-density guard.** If N consecutive iterations find nothing new, the loop should escalate the difficulty tier or pause for human review. 400 consecutive findings-free iterations was the loudest possible signal that something was wrong, and the loop ignored it entirely.
3. **No coverage matrix.** The agent couldn't see at a glance which (tool × failure-mode × evidence-layer) combinations were still unexplored, so it drifted to the cheapest ones. Next epoch needs an explicit coverage grid, updated after each iteration, used as the generation input.

The 52 tests above become the **regression baseline** for epoch 002. Before any new test is attempted, all 52 must still pass.

---

## Stats

| Metric | Value |
|---|---|
| Total iterations run | 500 |
| Iterations retained as test cases | 52 (10.4%) |
| Bugs discovered and fixed | 2 concurrency bugs (Issues #001, #002), 1 syntax regression (Issue #004) |
| Upstream constraints documented | 1 (chat anti-spam, Issue #003) |
| Regression checkpoints completed | 10 (at every 50 iterations) |
| Open issues at epoch close | 0 |
| Tools exercised | All 18 |
| Resources exercised | All 6 |
| Design commitments violated | 0 |

## File cross-references

- Retained iteration files have been consolidated into this epoch summary; individual iteration files from the first run are being cleared to make room for epoch 002.
- Issues remain in `opencode/issues.md` as permanent record.
- Epoch 002 will start fresh in `opencode/iterations/` with a revised spec that closes the three methodological gaps above.
