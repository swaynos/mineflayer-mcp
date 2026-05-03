# T2 — Presence

**Tier:** 2 — Movement  
**Status:** Blocked on `navigate_to` and `list_nearby_players` tools (M2 in `SPEC.md`)  
**Tests:** `navigate_to` (invoker), `get_position` (invoker), `list_nearby_players` (tester)

---

## Overview

P1 navigates to a known coordinate. P2 calls `list_nearby_players` from its
current position and asserts P1 appears in the list at the expected coordinates.
RCON confirms P1's actual server-side position.

This validates movement (P1 went somewhere) and spatial observation (P2 can
see P1 from a distance) — two capabilities that are required before any
collaborative in-world behavior is possible.

---

## Prerequisites

- `navigate_to`, `get_position`, and `list_nearby_players` are present in
  `src/tools.js` and pass `assertCompleteness()`.
- `mineflayer-pathfinder` is installed and wired into `src/bot.js`.
- Both MCP processes are running and healthy (see `harness.md` — Startup
  steps 1–4; skip step 5, no op required for this scenario).

---

## Setup

1. Choose a target coordinate reachable from spawn with no obstructions.
   Use RCON to confirm the target block is air or passable:
   ```
   /data get block <x> <y> <z>
   ```
   Suggested default: position noted in `m0-connectivity-test.log` spawn
   area — adjust Y to surface level.

2. Teleport P2 to a known observation position ~20 blocks from the target,
   so `list_nearby_players` has a clear view:
   ```
   /tp MathTest-P2 <ox> <oy> <oz>
   ```

3. Clear hostile mobs:
   ```
   /kill @e[type=!player,distance=..32]
   /time set day
   /weather clear
   ```

---

## Invoker steps (P1)

Call via P1's MCP endpoint (`http://127.0.0.1:18080/mcp`):

1. Call `navigate_to` with `{ x, y, z }` = target coordinate.
   - Expected return: `{ "reached": true, "position": { x, y, z } }` (or
     similar — match against the actual schema when the tool is built).
   - Allow up to 30 seconds for pathfinding to complete.
2. Call `get_position` immediately after arrival.
   - Record the returned `{ x, y, z }` as P1's confirmed position.
   - Assert it is within 2 blocks of the target coordinate.

---

## Tester assertions (P2)

Call via P2's MCP endpoint (`http://127.0.0.1:18081/mcp`):

1. Call `list_nearby_players` with `maxDistance = 64`.
2. Assert the response contains an entry where:
   - `username` is `MathTest-P1`, and
   - `position` is within 3 blocks of the target coordinate.

---

## RCON verification

```sh
ssh callisto "docker exec Math rcon-cli \
  --host 127.0.0.1 --port 25575 \
  --password <MATH_RCON_PASSWORD> \
  'data get entity @a[name=MathTest-P1,limit=1] Pos'"
```

Expected: coordinates within 2 blocks of the target. This is the authoritative
server-side position — it must agree with both P1's `get_position` return and
P2's `list_nearby_players` observation.

---

## Pass criteria

All four must be true:

1. P1's `navigate_to` returned a success result.
2. P1's `get_position` is within 2 blocks of the target coordinate.
3. P2's `list_nearby_players` includes `MathTest-P1` within 3 blocks of target.
4. RCON's `data get entity` position agrees with P1's `get_position` to within
   2 blocks.

---

## Teardown

Follow `harness.md` — Teardown. No blocks were placed; no world-state cleanup
required beyond stopping bots and removing locks.

---

## Known limitations

- `navigate_to` and `list_nearby_players` do not exist yet. This scenario
  is a specification, not a runnable test.
- Pathfinding may fail if the target coordinate is obstructed or in an
  unloaded chunk. If `navigate_to` returns a failure, note the reason and
  treat it as a harness setup issue, not a tool bug.
- Position tolerance (2–3 blocks) accounts for mineflayer's pathfinding
  landing precision.
