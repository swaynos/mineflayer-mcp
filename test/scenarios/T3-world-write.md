# T3 — World Write

**Tier:** 3 — World-write  
**Status:** Blocked on `place_block` tool (M3 in `SPEC.md`)  
**Tests:** `place_block` (invoker), `find_blocks` (tester + RCON confirm)

---

## Overview

P1 places a stone block at a known coordinate. P2 calls `find_blocks` targeting
that coordinate and asserts the block is present. RCON independently confirms
the block exists at the server level.

This is the canonical validation that world-write tools work end-to-end — the
action happens via mineflayer's native API (not chat commands), and two
independent observers confirm the result.

---

## Prerequisites

- `place_block` is present in `src/tools.js` and passes `assertCompleteness()`.
- `place_block` uses `bot.placeBlock()` internally — **not** `/setblock` via
  `chat`. Verify this in `src/tools.js` before running.
- P1's inventory contains at least one `minecraft:stone` block (ensured in
  Setup via RCON `/give`).
- Both MCP processes are running and healthy (see `harness.md` — Startup,
  all 5 steps including op).

---

## Setup

1. Choose a target coordinate on the surface, clear of obstructions, at
   least 10 blocks from spawn to avoid interfering with `ProductionBot`.
   Confirm the target block is currently air:
   ```
   /data get block <x> <y> <z>
   # → must be minecraft:air
   ```
   If not air, clear it:
   ```
   /setblock <x> <y> <z> minecraft:air
   ```

2. Give P1 stone to place:
   ```
   /give MathTest-P1 minecraft:stone 1
   ```

3. Teleport P2 to within observation range (~5 blocks) of the target:
   ```
   /tp MathTest-P2 <ox> <oy> <oz>
   ```

4. Clear hostile mobs:
   ```
   /kill @e[type=!player,distance=..32]
   /time set day
   /weather clear
   ```

---

## Invoker steps (P1)

Call via P1's MCP endpoint (`http://127.0.0.1:18080/mcp`):

1. Call `place_block` with the target coordinate expressed as a relative
   offset from P1's current position (or absolute, depending on the tool's
   schema — use whichever the tool implements).
   - Expected return: `{ "ok": true, "placed": "minecraft:stone", "position": { x, y, z } }`.

---

## Tester assertions (P2)

Call via P2's MCP endpoint (`http://127.0.0.1:18081/mcp`):

1. Call `find_blocks` with:
   - `blockTypes: ["minecraft:stone"]`
   - `maxDistance: 10`
   - `maxCount: 1`
2. Assert the response contains an entry where `position` matches the target
   coordinate exactly (or within 0.5 blocks — block positions are integers).

---

## RCON verification

```sh
ssh <MC_HOST> "docker exec Math rcon-cli \
  --host 127.0.0.1 --port 25575 \
  --password <MATH_RCON_PASSWORD> \
  'data get block <x> <y> <z>'"
```

Expected: `minecraft:stone`. This is the authoritative confirmation that the
block physically exists at the server level — not just in the client's view.

---

## Pass criteria

All three must be true:

1. P1's `place_block` returned a success result with position matching the
   target coordinate.
2. P2's `find_blocks` returned the stone block at the target coordinate.
3. RCON's `data get block` returned `minecraft:stone` at the target coordinate.

---

## Teardown

1. Remove the placed block to leave the world clean:
   ```
   /setblock <x> <y> <z> minecraft:air
   ```
2. Follow `harness.md` — Teardown (deop, stop bots, remove locks).

---

## Known limitations

- `place_block` does not exist yet. This scenario is a specification, not a
  runnable test.
- The bot must be within reach distance (~4 blocks) of the target to place.
  If the RCON teleport in Setup puts P1 too far from the target, navigate P1
  closer before calling `place_block`.
- `find_blocks` searches by block type, not exact position. If other stone
  blocks exist within `maxDistance`, they may appear in the results. Use a
  coordinate check on the returned positions to isolate the target.
