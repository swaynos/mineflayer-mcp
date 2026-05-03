# SPEC.md — mineflayer-mcp Build Plan

This file is the implementation contract for `mineflayer-mcp`. It describes
what gets built, in what order, and how each piece is validated. `README.md`
is the public face of the project; this file is for the agent and contributors
doing the work.

---

## Guiding principle

Every tool added to `mineflayer-mcp` must be validated by a scenario in
`test/scenarios/` before it is considered done. The test surface grows in
lockstep with the tool surface. See `test/README.md` for how testing works.

---

## Milestones

### M1 — Observation (current)

**Goal:** An agent can observe the world reliably. No world-writes yet.

**Tools to build:**

| Priority | Tool | Why |
|---|---|---|
| 1 | `read_recent_chat` | Unblocks T1 (first scenario). Tester observes invoker's chat. |
| 2 | `list_nearby_players` | Unblocks T2. Tester observes invoker's presence and position. |
| 3 | `get_biome` | Surfaced in live use — agent couldn't answer "what biome am I in?" |
| 4 | `look_at` / `look_at_player` | Surfaced in live use — agent computed yaw/pitch but had no tool to apply it. |
| 5 | `get_health` / `get_food` | Bot is being killed by mobs silently; agent needs visibility. |
| 6 | `list_nearby_entities` | Required before mob-avoidance or safety behaviors are possible. |

**M1 acceptance criteria:**

1. All M1 tools pass their scenario in `test/scenarios/`.
2. `assertCompleteness()` passes at startup with the expanded tool surface.
3. No regressions on the four existing M0 tools.
4. `MathBridgeBot` on the Math deployment can answer "what biome am I in?",
   "look at me", and report its own health without hallucinating.

---

### M2 — Movement

**Goal:** An agent can navigate the world.

**Tools to build:**

| Priority | Tool | Why |
|---|---|---|
| 1 | `navigate_to` | Absolute position navigation via `mineflayer-pathfinder`. |
| 2 | `navigate_relative` | Relative offset movement. |
| 3 | `get_time_of_day` / `get_weather` | Context for navigation decisions. |

**M2 acceptance criteria:**

1. T2 (presence) scenario passes: P1 navigates to a known coordinate; P2
   observes P1 in `list_nearby_players` at the correct position; RCON confirms.
2. Bot can navigate back to a known safe location on command.
3. No regressions on M1 tools.

---

### M3 — World-write

**Goal:** An agent can modify the world using mineflayer-native APIs — never
via chat commands. No `/fill`, no `/setblock` through `chat`.

**Tools to build:**

| Priority | Tool | Why |
|---|---|---|
| 1 | `place_block` | Place a block from inventory at a relative offset. |
| 2 | `dig_block` | Dig a block at a relative offset. Returns block name dug. |
| 3 | `use_item` | Use held item (open doors, activate switches, etc.). |

**M3 acceptance criteria:**

1. T3 (world-write) scenario passes: P1 places a stone block; P2's
   `find_blocks` and RCON both confirm it at the correct position.
2. World edits use `bot.placeBlock()` / `bot.dig()` exclusively — no chat
   path.
3. No regressions on M1/M2 tools.

---

### M4 — Bot safety

**Goal:** The bot survives hostile environments without manual intervention.

**Behaviors to implement (in `src/bot.js`):**

| Behavior | Mechanism |
|---|---|
| Auto-respawn | `bot.on("death")` → `bot.respawn()` |
| Fall protection | `bot.entity.velocity.y < -5` → `bot.setControlState("jump", true)` |
| Mob avoidance | health < 10 → navigate away from nearest hostile entity |
| Health reporting | `bot.on("health")` → update internal state visible to `get_health` |

**Toggleable** via `--safe-mode` flag (default: on).

**M4 acceptance criteria:**

1. Bot survives 5 minutes in the Math world (which has active Husks) without
   dying or requiring manual intervention.
2. `get_health` returns accurate values during and after combat exposure.
3. Safe-mode behaviors can be disabled via `--safe-mode=false` without
   breaking other tools.

---

### M5 — Resource surface

**Goal:** Observable world state is available as MCP resources, not just tools.
Resources are read-only; tools are side-effectful.

**Resources to implement:**

| URI | Content |
|---|---|
| `minecraft://position` | Bot coordinates, dimension, yaw, pitch |
| `minecraft://inventory` | Current inventory |
| `minecraft://health` | Health, food, saturation |
| `minecraft://blocks/nearby` | Nearby block scan |
| `minecraft://players/nearby` | Nearby player list |
| `minecraft://chat/recent` | Recent chat buffer |

**M5 acceptance criteria:**

1. `ListResources` returns all six URIs.
2. Each `ReadResource` call returns the same data as its corresponding tool.
3. Resources are documented in `README.md`.

---

## Design commitments (non-negotiable at all milestones)

1. **No ghost tools.** `assertCompleteness()` must pass at every milestone.
2. **No chat-as-command.** World edits use mineflayer APIs exclusively.
3. **Errors carry codes.** `normalizeError()` handles all throw shapes.
4. **Stdout is sacred.** Logs go to stderr only.
5. **One bot, many sessions.** HTTP entrypoint never spawns per-session.
6. **Tools do; resources observe.**

---

## Test surface

See `test/README.md` for the full testing methodology.

| Scenario | File | Unblocked by | Status |
|---|---|---|---|
| T1 — Chat | `test/scenarios/T1-chat.md` | `read_recent_chat` (M1) | Blocked |
| T2 — Presence | `test/scenarios/T2-presence.md` | `navigate_to`, `list_nearby_players` (M2) | Blocked |
| T3 — World-write | `test/scenarios/T3-world-write.md` | `place_block` (M3) | Blocked |
