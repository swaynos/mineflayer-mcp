# testing/gameplay-epics.md — Epoch 2 Gameplay Test Epics

This document defines the eight gameplay epics for epoch 2 of the
`mineflayer-mcp` robustness testing campaign. Each epic frames a natural
Minecraft gameplay scenario around the **actor/observer pattern** used
throughout this test suite.

---

## The actor/observer pattern

Every iteration in this epoch assigns fixed roles to the two test bots:

- **Actor (P1):** Executes a gameplay intent — moves, chats, digs, builds,
  crafts. P1 is the subject of the test.
- **Observer (P2):** Does not participate in the gameplay. P2's sole job is
  to watch, measure, and independently verify what P1 did.
- **RCON oracle:** A third-party ground-truth check, independent of both bots.

**A test passes only when all three agree.** Actor reports success, observer
confirms the expected world-state change, RCON verifies the server-side
reality. Any two-out-of-three disagreement is a bug worth filing.

### Rules

1. Actor tool calls are causal — if P1 doesn't issue the call, the behavior
   under test doesn't happen.
2. Observer tool calls are read-only — P2 never mutates the world.
3. RCON is the oracle, not the observer. Both the actor's return value and
   the observer's independent reading are validated against it.
4. Roles may swap between iterations (P2 becomes actor in a later iteration)
   but are fixed within a single iteration.

---

## ⚠️ One iteration ≠ one epic

Epics are **themes**, not tasks. Each epic is satisfied only when many small,
focused iterations exercise it from different angles — different starting
conditions, different tolerances, different failure modes, different block
types, different observation strategies.

An iteration that attempts the entire gameplay loop end-to-end is a
**failed iteration design**, even if it runs to green. It provides no
isolation: when it regresses later, you cannot tell which step broke.

Good iteration shape:
- **Narrow actor intent.** One observable action. "P1 digs a single log."
  Not "P1 chops a tree, collects drops, and crafts planks."
- **Narrow observer protocol.** One measurement per iteration.
- **One failure mode if any.** Test one error path at a time.
- **Single novel dimension.** Each iteration introduces exactly one new cell
  in the coverage matrix.

See `testing/novelty.md` § Rule 0 — any iteration that bundles too much
is auto-rejected with score 0.

---

## Expected capability gaps — status

These tools were identified as missing before the Epoch 2/3 testing campaigns.
All high-priority gaps have been filled as of Epoch 3.

| Capability | Epics | Priority | Status |
|---|---|---|---|
| `craft_item` | 6 | High | ✅ Added (Epoch 2) |
| `attack_entity` | 5 | High | ✅ Added (Epoch 3) |
| `equip_item` by name | 2, 4, 5, 6 | High | ✅ Added (Epoch 3) |
| `eat` | 5 | High | ✅ Added (Epoch 3) |
| `open_container` + `take_item` / `deposit_item` | 6 | Medium | ✅ Added (Epoch 3) |
| `drop_item` | 2, 8 | Medium | ✅ Added (Epoch 3) |
| `activate_block` (doors, buttons, levers) | 3 | Medium | ✅ Added (Epoch 3) |
| `follow_player` | 1, 7 | Medium | ✅ Added (Epoch 3) |
| `close_container` | 6 | Medium | ✅ Added (Epoch 3) |
| `sleep` (in bed) | 4 | Low | ✅ Added (Epoch 3) |
| `fish` | 5 | Low | Not yet added |

---

## Epic 1 — "Where are you?"

**Actor intent:** P1 broadcasts its current position in chat, then walks to a
new location and broadcasts again.

**Observer protocol:** P2 reads its chat buffer, extracts coordinates from each
broadcast, and independently queries `list_nearby_players` on an interval; those
readings must converge toward the actor's broadcast positions.

**Why it tests the MCP:** This is the simplest social signal in multiplayer
Minecraft. If one bot cannot tell the other where it is via chat and have that
signal independently corroborated by world observation, no cooperative play
is possible. It exercises `chat` and `get_position` on the actor side,
`read_recent_chat` and `list_nearby_players` on the observer side.

**Example iterations:**
1. P1 chats its current position and stays still. P2 reads the chat and calls
   `list_nearby_players`. Both values match within ±1 block; RCON confirms.
2. P1 chats position, navigates 20 blocks, chats again. P2 sees two distinct
   positions in chat history; `list_nearby_players` snapshots match each
   broadcast position at the corresponding time.
3. P1 chats a deliberately wrong position. P2's observation disagrees with
   chat; iteration passes if the observer correctly flags the discrepancy.
4. P1 navigates continuously and broadcasts position three times. P2 verifies
   each broadcast matches the bot's actual position at the broadcast moment
   (±2 blocks for timing drift).
5. P1 broadcasts its biome name. P2's own `get_biome` returns a different value
   (different biomes); P2 verifies the mismatch.

**What would break naturally:**
- Chat messages dropping under back-to-back sends.
- `list_nearby_players` returning stale position lagging behind real movement.
- Chat ordering not matching physical movement ordering.

---

## Epic 2 — "P1 chops a tree"

**Actor intent:** P1 finds a tree, navigates to it, digs the log(s). At the
end, P1's inventory contains the harvested logs.

**Observer protocol:** P2 stands in view of the tree at the start. After P1
reports completion, P2 calls `find_blocks` and must see the tree's block
positions replaced by air. P2 uses `list_nearby_entities` to detect item-drop
entities during the dig.

**Why it tests the MCP:** Tree-chopping is the universal first Minecraft task.
It composes `find_blocks` → `navigate_to` → `dig_block` on the actor side.
On the observer side, it tests that world-state changes (block removed) are
visible to a different bot, and that item drops appear as observable entities.

**Example iterations:**
1. P1 digs a single log. `dig_block` returns ok; `inspect_inventory` shows
   the log. P2's `find_blocks` before the dig finds the log; after, does not.
   RCON confirms air at the block's position.
2. P1 chops a 4-log column from bottom to top, re-navigating each step.
   Inventory ends with 4 logs. P2 observes the column disappearing one block
   at a time if it polls during the operation.
3. P1 attempts to dig a log it cannot reach. `dig_block` returns an error.
   P2's pre/post `find_blocks` shows no change — the observer confirms nothing
   happened.
4. P1 digs a log that falls into water. The dig succeeds but the drop is not
   in inventory afterward. P2's `list_nearby_entities` may show an item entity
   drifting away. This iteration documents the pickup gap.
5. P1 chops two trees in a row. Observer records two distinct removal events.

**What would break naturally:**
- `find_blocks` returning positions P1 cannot actually reach.
- Dig succeeding but the drop never getting picked up.
- Observer's `find_blocks` returning stale data.

---

## Epic 3 — "P1 builds a cube, P2 measures it"

**Actor intent:** Starting from a known origin, P1 places blocks to construct
a 3×3×3 hollow cube (26 blocks: 8 corners + 12 edges + 6 face-centers), in
a deterministic order.

**Observer protocol:** P2 knows the origin and the plan. After P1 declares
completion via chat, P2 calls `find_blocks` targeting the block type used.
P2 must find all 26 positions filled; RCON confirms each coordinate.

**Why it tests the MCP:** A cube is pure world-write discipline. It stresses
`place_block` 26 times against a spatial plan and exposes off-by-one bugs,
face-selection bugs, and drift between the actor's reported success and the
actual world state.

**Example iterations:**
1. P1 builds the full cube. `place_block` returns ok 26 times. P2's
   `find_blocks` finds all 26 positions. RCON confirms.
2. P1 builds partially, chats progress, then resumes. P2 verifies the partial
   state matches the declared step count.
3. P1 attempts to place a block where another already exists. Actor gets an
   error. Observer confirms no new block was added.
4. P1 builds at a negative-coordinate origin (where `Math.floor` behaves
   differently than for positive coords). Observer confirms the cube is in the
   right place.
5. P1 builds the cube then digs one block. P2's `find_blocks` shows 26 → 25,
   with the missing position matching the dug one.

**What would break naturally:**
- `place_block` floor arithmetic producing an off-by-one for negative coords.
- Face-selection choosing the wrong adjacent block when multiple adjacencies
  exist.
- Observer seeing a stale snapshot mid-build.

---

## Epic 4 — "P1 goes mining"

**Actor intent:** P1 digs downward (or into a hillside) creating a traversable
shaft, then returns to the surface. At minimum P1 digs 5 blocks deep and
returns.

**Observer protocol:** P2 stays at the surface near the dig entrance. P2
records P1's Y-coordinate via `list_nearby_players` on an interval, verifying
that (a) Y decreases during descent, (b) Y increases during return, (c) P1
reappears at roughly the surface Y at the end.

**Why it tests the MCP:** Mining is sustained world-write in a confined space
where the pathfinder re-solves across a surface the actor is actively modifying.
It stresses dig-then-move chains, vertical navigation, and the interaction
between the safety loop (mobs spawn in darkness) and the actor's intent.

**Example iterations:**
1. P1 digs a 5-block staircase down and walks back up. P2's Y-tracking shows
   the full descent/ascent profile. RCON confirms P1's deepest point.
2. P1 digs straight down. If fall protection triggers, P2 records the health
   dip. If death occurs, P2 observes the respawn via `list_nearby_players`.
3. P1 mines at night. The safety loop fires flee events. P2 watches
   `list_nearby_entities` for hostiles near P1's last-known Y; documents the
   interaction between mining intent and safety interruption.
4. P1 digs 20 blocks deep over a sustained session. P2 samples position every
   10 seconds; the trace must be monotonically decreasing-then-increasing.
5. P1 digs in a lit area. Observer notes whether flee events are absent.

**What would break naturally:**
- `dig_block` at dy=-1 working once, then failing because the bot's feet are
  now in the hole it created.
- Pathfinder choosing a diagonal path through air instead of stopping at a
  safe ledge.
- Safety flee causing the bot to lose track of the shaft and wander underground.

---

## Epic 5 — "P1 tries to farm food"

**Actor intent:** P1 attempts a food-gathering loop. This is deliberately
open-ended — the goal is to discover exactly where the gameplay loop breaks
down and add the minimum capability required.

**Observer protocol:** P2 tracks P1's food level over time via P1's
self-reported `get_health` broadcasts and independent `list_nearby_players`
position tracking. P2 records which events occurred: found animal, planted
seeds, ate food, food stat changed.

**Why it tests the MCP:** Farming forces the question of which Minecraft verbs
the MCP actually supports (attack a mob, consume food, plant seeds on tilled
earth). Every discovered gap is a tool that likely needs to exist.

**Example iterations:**
1. P1 finds an animal via `list_nearby_entities`, navigates to it, calls
   `use_item`. Observer verifies via RCON whether the animal's state changed.
   Expected: nothing happens — documents the need for `attack_entity`.
2. P1 has food in inventory and food < 20. Calls `use_item`. Observer polls
   `get_health` for a food increase. Expected: no change — documents the gap
   in `use_item` food semantics.
3. P1 uses a hoe to till soil then `place_block` with seeds. Observer
   verifies `find_blocks` for the resulting crop block.
4. P1 has a fishing rod and calls `use_item` near water. Observer watches
   `list_nearby_entities` for a bobber. Documents the `fish` gap.
5. P1 digs oak leaves (which may drop apples). Observer tracks any item
   entities. Documents the drop-chance gap.

**What would break naturally:**
- `use_item` being a no-op against living entities.
- Food stat not updating because item consumption doesn't trigger.
- Missing tools making the loop entirely un-testable.

---

## Epic 6 — "P1 tries to craft a tool"

**Actor intent:** P1 transforms raw materials into a usable tool. The current
tool surface has no `craft_item`, so this epic's iterations are
explicitly capability-building.

**Observer protocol:** P2 records P1's inventory state before and after each
attempted craft. The assertion: raw materials decrease, crafted item appears,
counts match the recipe.

**Why it tests the MCP:** Crafting is the clearest gap in the current surface.
Without it, no tool progression, no storage, no deeper gameplay loop. This epic
adds `craft_item` and validates it end-to-end.

**Example iterations:**
1. P1 has 4 oak logs. Call `craft_item("oak_planks")` — tool does not exist
   yet. Iteration adds it. Observer verifies: 4 logs → 16 planks.
2. P1 has 4 planks. Craft a crafting table (2×2 recipe, no table required).
   Observer: 4 planks → 1 crafting table.
3. P1 places a crafting table. P1 attempts a 3×3 recipe (stone pickaxe).
   Observer verifies the inventory transition and that the table is
   not consumed.
4. P1 crafts with insufficient materials. Actor gets an error. Observer
   confirms inventory unchanged.
5. P1 crafts with a nonexistent recipe name. Actor gets a specific error code.
   Observer confirms inventory unchanged.

**What would break naturally:**
- Recipe resolution brittleness across mineflayer versions.
- Inventory slot indices shifting during craft, corrupting subsequent calls.
- Crafting-table proximity requirement undocumented.

---

## Epic 7 — "P1 explores; P2 tracks"

**Actor intent:** P1 sets out from spawn, navigates 100+ blocks in a direction,
broadcasting position and biome along the way. Eventually P1 returns to spawn.

**Observer protocol:** P2 stays at spawn. P2 records P1's broadcast positions
and biomes. When P1 exceeds player-entity range (~32 blocks), P1 disappears
from P2's `list_nearby_players`; P2 must correctly distinguish "out of range"
from "offline." When P1 returns, P2 sees reappearance.

**Why it tests the MCP:** Exploration is a sustained-navigation workload. It
exercises the pathfinder across changing terrain, chunk-loading behavior at
the client, and the observer's ability to handle the actor going out of
direct-observation range.

**Example iterations:**
1. P1 navigates 100 blocks in one direction, broadcasting at 25, 50, 75, 100.
   P2 verifies P1 leaves proximity range at some point.
2. P1 crosses a biome boundary. Actor broadcasts the biome change; observer
   cross-checks that the new biome ID differs from the previous one.
3. P1 navigates far out, then returns. Observer verifies P1 reappears in
   `list_nearby_players` on return.
4. P1 navigates through water. Actor reports arrival; observer verifies via
   RCON after P1 reappears in range.
5. P1 navigates at night. Safety-flee events may fire; observer records P1's
   last-known position and reconnects observation when P1 returns to range.

**What would break naturally:**
- Pathfinder timing out on long navigation (default 30s).
- Observer treating P1 as offline when P1 is just out of entity range.
- Chunks not loaded at the far destination causing empty `find_blocks` results.

---

## Epic 8 — "P1 performs an action, P2 scores it"

**Actor intent:** P1 performs one precisely-defined action (race to a
coordinate, place blocks in a pattern, chop N trees in T time).

**Observer protocol:** P2 is the judge. P2 measures P1's performance against a
declared success criterion: did P1 arrive in time, did the pattern match, did
the count meet the threshold.

**Why it tests the MCP:** This is the integration check. If the MCP lets one
agent perform a measurable action and another agent independently score it, then
the interface can support any player-invented activity — because all activities
reduce to "an action and an outcome." If this fails, something in the
observation pipeline is unreliable.

**Example iterations:**
1. **Race.** P1 navigates to a declared target. P2 uses P1's start/arrive chat
   broadcasts to time the run. Observer confirms arrival via `list_nearby_players`.
2. **Block-pattern art.** P1 places blocks to spell a letter. P2 calls
   `find_blocks` and compares positions to a declared pattern; score = matches
   / total expected.
3. **Chop count.** P1 chops as many trees as possible in 60s. P2 counts via
   a pre-scan of trees and a post-scan of the actor's inventory.
4. **Precision landing.** P1 navigates with `tolerance=0.5`. Observer measures
   final position distance to the target.
5. **Stealth.** P1 navigates past P2 without triggering P2's
   `list_nearby_players` at a specified `maxDistance`. Observer records whether
   P1 entered the detection zone.

**What would break naturally:**
- Observer's measurement timing drifting from the actor's actual action.
- Position observations being noisier than the tolerance being measured.
- Pattern matching failing because `find_blocks` and `place_block` use
  different coordinate frames.

---

## Epic execution order

1. Epic 1 — "Where are you?" — simplest social loop; validates the
   actor/observer pattern itself.
2. Epic 2 — "P1 chops a tree" — the universal first task; find→go→act→inventory.
3. Epic 3 — "P1 builds a cube, P2 measures it" — compositional world-write.
4. Epic 7 — "P1 explores; P2 tracks" — sustained navigation, chunk-range.
5. Epic 4 — "P1 goes mining" — digging chains and safety interaction.
6. Epic 5 — "P1 tries to farm food" — first wave of missing-tool discovery.
7. Epic 6 — "P1 tries to craft a tool" — explicit capability-building.
8. Epic 8 — "P1 performs an action, P2 scores it" — integration check.

---

## Scope

In scope: vanilla overworld, survival mode, single-player-equivalent interaction
via MCP.

Out of scope for this epoch: PVP, redstone, enchanting, nether/end, performance
benchmarking, Discord/gateway integration.
