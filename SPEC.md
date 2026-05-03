# SPEC.md — mineflayer-mcp Build Plan

This file is the implementation contract for `mineflayer-mcp`. It describes
what gets built, in what order, and how each piece is validated. `README.md`
is the public face of the project; this file is for the agent and contributors
doing the work.

---

## Current focus

**Finish M1.** Priority 1 (`read_recent_chat`) is complete. Priorities 2–6
remain. The agent MUST continue building through the entire M1 tool list
before advancing to M2. Each tool gets built, wired through
`assertCompleteness()`, smoke-tested end-to-end against the live Math
deployment with P1/P2, and documented before the next one begins.

**Do not stop early.** Do not pause for approval between M1 priorities 2
through 6 unless a tool cannot be built (blocked by upstream mineflayer, a
runtime error, or a breaking discovery about the Minecraft protocol). Report
progress; keep going.

**Do not expand scope.** Tools not in the M1 table below are out of scope
for M1, even if they seem small. If a tempting adjacent tool appears during
implementation, note it in `opencode/context/MathInstance/progress.md` under
a new "backlog" entry and keep going on the listed priority.

---

## Guiding principle

Every tool added to `mineflayer-mcp` must be validated by a scenario in
`test/scenarios/` before it is considered done. The test surface grows in
lockstep with the tool surface. See `test/README.md` for how testing works.

For each M1 tool (priorities 2–6), validation is a minimal end-to-end smoke
test following the T1 pattern: spin up P1 and/or P2 locally, call the tool,
cross-check against RCON where applicable, and record the result inline in
this build session. A full scenario file in `test/scenarios/` is NOT required
for every M1 tool — T1 / T2 / T3 remain the formal scenario files. Other M1
tools can be validated by ad-hoc smoke tests that establish the tool works
end-to-end. If a tool needs its own formal scenario, add one.

---

## Milestones

### M1 — Observation ✅ COMPLETE (2026-05-03)

**Goal:** An agent can observe the world reliably. No world-writes, no
movement, no looking-at yet.

**Tools to build (execute in order):**

| Priority | Tool | Status | Why |
|---|---|---|---|
| 1 | `read_recent_chat` | ✅ Done (2026-05-03) | Unblocks T1. Tester observes invoker's chat. |
| 2 | `list_nearby_players` | ✅ Done (2026-05-03) | Unblocks T2 later. Returns `{ username, position, distance, uuid }` for players within `maxDistance`. |
| 3 | `get_biome` | ✅ Done (2026-05-03) | Returns biome name at bot position. Live use surfaced this gap. |
| 4 | `look_at` / `look_at_player` | ✅ Done (2026-05-03) | Two tools: `look_at { x, y, z }` and `look_at_player { username }`. Uses `bot.lookAt(Vec3)`. |
| 5 | `get_health` / `get_food` | ✅ Done (2026-05-03) | One tool: `get_health` returning `{ health, food, saturation }`. Bot is dying silently to Husks; agent needs visibility. |
| 6 | `list_nearby_entities` | ✅ Done (2026-05-03) | Returns `{ type, name, position, distance, isHostile }` for entities within `maxDistance`. Precondition for mob-awareness. |

**M1 in-scope behaviors:**

- Observe world state: chat, players nearby, entities nearby, own health, biome.
- Passively orient the bot (`look_at` only rotates the head; no walking).
- Report results cleanly with `assertCompleteness()` still passing.

**M1 out-of-scope (explicitly deferred):**

- ❌ **Movement.** No `navigate_to`, `navigate_relative`, or any tool that
  causes the bot to walk. That is M2. The bot's body stays where it spawns.
- ❌ **World-write.** No `place_block`, `dig_block`, `use_item`. That is M3.
- ❌ **Safety behaviors.** No auto-respawn, fall protection, or mob-avoidance
  logic. That is M4. `get_health` in M1 only *reports* — it does not *react*.
- ❌ **Resource surface.** No `minecraft://*` resources. That is M5.

If during M1 the bot dies to a Husk and the world-state tools fail because
the bot is dead, **do not build safety behaviors to fix it**. Instead, use
RCON (`/kill @e[type=!player,distance=..32]`, `/tp`, `/effect give … resistance`)
to stabilize the test environment. Safety is M4's problem.

**M1 acceptance criteria (all must hold before M2 begins):**

1. All six M1 tools present in `src/tools.js`, pass `assertCompleteness()`.
2. Each M1 tool has been smoke-tested end-to-end against the Math deployment
   with evidence recorded (tool output + RCON confirmation where applicable).
3. No regressions on the four M0 tools (`chat`, `get_position`, `find_blocks`,
   `inspect_inventory`) or on T1.
4. `MathBridgeBot` on the Math deployment can, via OpenClaw, answer "what biome
   am I in?", "look at me" (head rotation only), "what's your health?", and
   "who else is nearby?" without hallucinating.
5. `progress.md` updated: each M1 tool marked done with a one-line evidence
   note.

---

### M2 — Movement ✅ COMPLETE (2026-05-03)

**Tools to build:**

| Priority | Tool | Why |
|---|---|---|
| 1 | `navigate_to` | Absolute position navigation via `mineflayer-pathfinder`. |
| 2 | `navigate_relative` | Relative offset movement. |
| 3 | `get_time_of_day` / `get_weather` | Context for navigation decisions. |

**M2 out-of-scope:**

- ❌ World-write (M3).
- ❌ Safety / auto-respawn (M4).
- ❌ Resource surface (M5).
- ❌ Combat or path-interruption-on-threat (M4).

**M2 acceptance criteria:**

1. T2 (presence) scenario passes: P1 navigates to a known coordinate; P2
   observes P1 in `list_nearby_players` at the correct position; RCON confirms.
2. Bot can navigate back to a known safe location on command.
3. No regressions on M1 tools or T1.

---

### M3 — World-write ✅ COMPLETE (2026-05-03)

**Tools to build:**

| Priority | Tool | Why |
|---|---|---|
| 1 | `place_block` | Place a block from inventory at a relative offset. |
| 2 | `dig_block` | Dig a block at a relative offset. Returns block name dug. |
| 3 | `use_item` | Use held item (open doors, activate switches, etc.). |

**M3 out-of-scope:**

- ❌ Safety / auto-respawn (M4).
- ❌ Resource surface (M5).
- ❌ Any path that sends `/commands` through `chat`. This is a design
  commitment violation and must never be implemented.

**M3 acceptance criteria:**

1. T3 (world-write) scenario passes: P1 places a stone block; P2's
   `find_blocks` and RCON both confirm it at the correct position.
2. World edits use `bot.placeBlock()` / `bot.dig()` exclusively — no chat
   path.
3. No regressions on M1/M2 tools or T1/T2.

---

### M4 — Bot safety ✅ COMPLETE (2026-05-03)

**Behaviors to implement (in `src/bot.js`):**

| Behavior | Mechanism |
|---|---|
| Auto-respawn | `bot.on("death")` → `bot.respawn()` |
| Fall protection | `bot.entity.velocity.y < -5` → `bot.setControlState("jump", true)` |
| Mob avoidance | health < 10 → navigate away from nearest hostile entity |
| Health reporting | `bot.on("health")` → update internal state visible to `get_health` |

**Toggleable** via `--safe-mode` flag (default: on).

**M4 out-of-scope:**

- ❌ Combat. Safety is *avoidance*, not *fighting back*.
- ❌ Resource surface (M5).

**M4 acceptance criteria:**

1. Bot survives 5 minutes in the Math world (which has active Husks) without
   dying or requiring manual intervention.
2. `get_health` returns accurate values during and after combat exposure.
3. Safe-mode behaviors can be disabled via `--safe-mode=false` without
   breaking other tools.

---

### M5 — Resource surface ✅ COMPLETE (2026-05-03)

**Resources to implement:**

| URI | Content |
|---|---|
| `minecraft://position` | Bot coordinates, dimension, yaw, pitch |
| `minecraft://inventory` | Current inventory |
| `minecraft://health` | Health, food, saturation |
| `minecraft://blocks/nearby` | Nearby block scan |
| `minecraft://players/nearby` | Nearby player list |
| `minecraft://chat/recent` | Recent chat buffer |

**M5 out-of-scope:**

- ❌ Any new tool logic. Resources MUST reuse the existing `Bot` methods
  (`getPosition`, `inspectInventory`, `readRecentChat`, etc.) — do not
  duplicate behavior.

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

## Build rhythm for M1 (priorities 2–6)

For each tool:

1. Read the relevant `src/bot.js` and `src/tools.js` sections.
2. Add the underlying `Bot` method (if needed).
3. Add the tool to `TOOLS`, `SCHEMAS`, `DISPATCHED`, and the `dispatch()`
   switch — all four touch points.
4. Confirm `assertCompleteness()` passes by running:
   `node -e "import('./src/tools.js').then(m => m.assertCompleteness())"`.
5. Start P1 (and P2 if needed) locally against `callisto:1234`, call the
   tool via a curl/MCP probe, and record the result.
6. Cross-check with RCON where applicable (e.g., for `list_nearby_players`,
   RCON `list` should match the tool's output).
7. Tear down test bots, remove lockfiles.
8. Update `progress.md` marking the tool done with a one-line evidence note.
9. Move immediately to the next priority.

Deploying new tools to the production `MathBridgeBot` on `nyx` is NOT
required between M1 priorities — it can be batched at the end of M1 or done
opportunistically if helpful. The smoke tests run against local P1/P2
instances, which is enough to prove the tool works.

---

## Test surface

See `test/README.md` for the full testing methodology.

| Scenario | File | Unblocked by | Status |
|---|---|---|---|
| T1 — Chat | `test/scenarios/T1-chat.md` | `read_recent_chat` (M1) | ✅ **PASS** (2026-05-03) |
| T2 — Presence | `test/scenarios/T2-presence.md` | `navigate_to`, `list_nearby_players` (M2) | ✅ **PASS** (2026-05-03) |
| T3 — World-write | `test/scenarios/T3-world-write.md` | `place_block` (M3) | ✅ **PASS** (2026-05-03) |
