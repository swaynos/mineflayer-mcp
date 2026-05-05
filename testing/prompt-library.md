# testing/prompt-library.md — Epoch 5 Prompt Corpus

This file is the canonical prompt library for Epoch 5 nano-tier validation.
Each prompt is a realistic, player-grade natural-language input derived from
Minecraft streamer research. Prompts are organised by epic and tagged by
source style.

See `SPEC.md § Epoch 5` for the full test plan.
See `testing/nano-judging.md` for the judge rubric applied to each prompt.

---

## Source styles

| Tag | Description | Example register |
|---|---|---|
| `speedrun` | Terse, task-oriented, imperative. "chop log grab dirt head south." | Speedrun commentary |
| `tutorial` | Explanatory, present-tense narration. "what I want to do here is..." | Let's-play tutorials |
| `smp` | Conversational, collaborative, uses pronouns and shared context. "can you grab that?" | SMP/coop streams |
| `hardcore` | Urgent, risk-aware, state-driven. "im on 2 hearts" | Hardcore/challenge runs |
| `viewer` | Short, informal, often broken, sometimes adversarial. "!dig", "go tree", "why u stop" | Viewer chat commands to stream bots |

---

## Fixture schema

Each prompt entry that requires non-default world state specifies a `fixture`
block. All fields are optional; omitted fields use defaults.

```
fixture:
  position: {x, y, z}           # where to teleport the bot (default: spawn)
  time: day | night | <ticks>   # server time (default: day)
  weather: clear | rain | thunder
  inventory: [{item, count}]    # clears inventory first, then gives these
  food: <1-20>                  # bot food level (set via attribute/effect)
  health: <1-20>                # bot health
  entities: [{type, dx, dy, dz}]  # entities to spawn near the bot
  blocks: [{type, dx, dy, dz}]    # blocks to place near the bot via RCON
```

> **Note on `Expected first tool` field:** this is a human-readable intent
> label for reviewer guidance only. It is not evaluated mechanically. Args
> shown (e.g. `target=position`) reflect intent, not literal schema values.
> The judge rubric in `testing/nano-judging.md` defines actual scoring.

---

## Epic 1 — Quick status reads

**Core question:** Does nano pick the right read-only tool for simple
state questions?

**Expected first tools:** `observe` (target=position/health/world/players/
entities/chat) or `status`. Zero or one tool call. No side effects.

**Pass signal:** correct tool, correct args, final answer references the
data returned.

---

### E1-001
**Prompt:** "yo where u at"
**Style:** smp
**Expected first tool:** status
**Notes:** Tests if the bot maps colloquial location queries to a status check.
**Fixture:** defaults

### E1-002
**Prompt:** "how much hp u got left man"
**Style:** hardcore
**Expected first tool:** status
**Notes:** Checks mapping of 'hp' to health status.
**Fixture:** health=6 (3 hearts)

### E1-003
**Prompt:** "!coords"
**Style:** viewer
**Expected first tool:** status
**Notes:** Tests bot's ability to parse common stream chat commands for location.
**Fixture:** defaults

### E1-004
**Prompt:** "are you starving yet"
**Style:** smp
**Expected first tool:** status
**Notes:** Evaluates if the agent understands hunger mechanics are queried via status.
**Fixture:** food=4 (2 shanks)

### E1-005
**Prompt:** "what are you holding right now"
**Style:** tutorial
**Expected first tool:** inventory(action=inspect)
**Notes:** Checks if bot maps "holding" to an inventory inspection.
**Fixture:** inventory=[{item=stone_pickaxe, count=1}]

### E1-006
**Prompt:** "quick f3 check"
**Style:** speedrun
**Expected first tool:** status
**Notes:** Tests understanding of Minecraft meta-language (F3 debug screen) for status.
**Fixture:** defaults

### E1-007
**Prompt:** "whats our y level"
**Style:** hardcore
**Expected first tool:** status
**Notes:** Determines if bot knows 'y level' requires a position read.
**Fixture:** position={x=0, y=11, z=0}

### E1-008
**Prompt:** "how many blocks in ur offhand"
**Style:** smp
**Expected first tool:** inventory(action=inspect)
**Notes:** Evaluates understanding of specific inventory slots.
**Fixture:** inventory=[{item=torch, count=16, slot=offhand}]

### E1-009
**Prompt:** "do we have any food on us"
**Style:** tutorial
**Expected first tool:** inventory(action=inspect)
**Notes:** Tests plural inclusive pronouns ("we/us") being mapped to the bot's self-inventory.
**Fixture:** defaults

### E1-010
**Prompt:** "what biome is this"
**Style:** speedrun
**Expected first tool:** observe(target=world)
**Notes:** Checks if bot knows biome data comes from a world observation rather than just coords.
**Fixture:** defaults

### E1-011
**Prompt:** "read me your stats"
**Style:** viewer
**Expected first tool:** status
**Notes:** Tests generic phrasing for a comprehensive status pull.
**Fixture:** defaults

### E1-012
**Prompt:** "any armor durability left?"
**Style:** hardcore
**Expected first tool:** inventory(action=inspect)
**Notes:** Checks if the bot maps durability queries to inventory inspection.
**Fixture:** inventory=[{item=iron_helmet, count=1}, {item=iron_chestplate, count=1}]

### E1-013
**Prompt:** "bro are u dead"
**Style:** smp
**Expected first tool:** status
**Notes:** Tests hyperbole/slang being mapped to a simple health check.
**Fixture:** health=4

### E1-014
**Prompt:** "gimme your exact coordinates"
**Style:** tutorial
**Expected first tool:** status
**Notes:** Tests formal request for location data.
**Fixture:** defaults

### E1-015
**Prompt:** "status update rn"
**Style:** speedrun
**Expected first tool:** status
**Notes:** Evaluates urgency ("rn") and direct command parsing.
**Fixture:** defaults

---

## Epic 2 — Single-verb actions

**Core question:** Does nano map a direct imperative to one correct tool call?

**Expected first tools:** `chat`, `move`, `dig`, `place`, `use`, `inventory`.
Exactly one tool call per prompt. Args match the prompt's explicit request.

**Pass signal:** correct tool selected, args well-formed, response confirms
the action.

---

### E2-016
**Prompt:** "say hi in chat"
**Style:** tutorial
**Expected first tool:** chat
**Notes:** Tests simple mapping of verbal instruction to the chat tool.
**Fixture:** defaults

### E2-017
**Prompt:** "mine that diamond ore"
**Style:** smp
**Expected first tool:** dig
**Notes:** Evaluates basic block breaking command. Requires bot to have already located the ore.
**Fixture:** blocks=[{type=diamond_ore, dx=0, dy=0, dz=1}]

### E2-018
**Prompt:** "place a torch on the wall"
**Style:** hardcore
**Expected first tool:** place
**Notes:** Tests block placement tool activation.
**Fixture:** inventory=[{item=torch, count=8}], blocks=[{type=stone, dx=1, dy=0, dz=0}]

### E2-019
**Prompt:** "whack the pig"
**Style:** speedrun
**Expected first tool:** attack
**Notes:** Checks mapping of slang ("whack") to the attack tool. entity_id must come from prior observe.
**Fixture:** entities=[{type=pig, dx=2, dy=0, dz=0}]

### E2-020
**Prompt:** "come over here"
**Style:** smp
**Expected first tool:** move(mode=follow) or move(mode=to)
**Notes:** Tests relative movement instruction directed at another player.
**Fixture:** entities=[{type=player, dx=10, dy=0, dz=0}]

### E2-021
**Prompt:** "type f in chat"
**Style:** viewer
**Expected first tool:** chat
**Notes:** Tests execution of stream culture memes via chat.
**Fixture:** defaults

### E2-022
**Prompt:** "break the spawner"
**Style:** hardcore
**Expected first tool:** dig
**Notes:** Tests prioritization of high-value block digging.
**Fixture:** blocks=[{type=spawner, dx=1, dy=0, dz=0}]

### E2-023
**Prompt:** "drop down"
**Style:** speedrun
**Expected first tool:** move(mode=relative)
**Notes:** Evaluates directional movement commands mapping to a relative offset.
**Fixture:** position={x=0, y=80, z=0}

### E2-024
**Prompt:** "sleep"
**Style:** tutorial
**Expected first tool:** use(action=sleep)
**Notes:** Tests single-word verb mapping to a specific action.
**Fixture:** time=night, blocks=[{type=red_bed, dx=1, dy=0, dz=0}]

### E2-025
**Prompt:** "slap him"
**Style:** smp
**Expected first tool:** attack
**Notes:** Tests informal aggression mapping to attack tool.
**Fixture:** entities=[{type=player, dx=2, dy=0, dz=0}]

### E2-026
**Prompt:** "put down a crafting table"
**Style:** tutorial
**Expected first tool:** place
**Notes:** Tests "put down" as a synonym for place.
**Fixture:** inventory=[{item=crafting_table, count=1}]

### E2-027
**Prompt:** "eat"
**Style:** hardcore
**Expected first tool:** use(action=eat)
**Notes:** Tests urgent, single-word command mapping.
**Fixture:** food=4, inventory=[{item=bread, count=3}]

### E2-028
**Prompt:** "look up"
**Style:** speedrun
**Expected first tool:** move(mode=look)
**Notes:** Tests camera rotation commands mapping to move mode=look.
**Fixture:** defaults

### E2-029
**Prompt:** "dig straight down"
**Style:** viewer
**Expected first tool:** dig (dy=-1)
**Notes:** Tests a famous Minecraft taboo to see if it correctly maps to relative offset digging.
**Fixture:** defaults

### E2-030
**Prompt:** "announce we found diamonds"
**Style:** smp
**Expected first tool:** chat
**Notes:** Tests "announce" as a synonym for chat.
**Fixture:** defaults

---

## Epic 3 — Implicit multi-step ("find X")

**Core question:** Does nano chain observation → reasoning → final answer
without explicit instruction to call multiple tools?

**Expected behaviour:** ≥1 tool call; the final message synthesises the
result into a useful answer (e.g. "The nearest oak log is 14 blocks to
your north at X=12, Y=64, Z=30.").

**Pass signal:** tool called with appropriate args; result correctly
interpreted in final message.

---

### E3-031
**Prompt:** "find me a village"
**Style:** speedrun
**Expected first tool:** observe(target=blocks)
**Notes:** Tests if the bot attempts to scan for village-associated blocks. Note: full village detection is beyond the tool surface; a graceful "I can look for nearby structures but can't locate a village directly" is also acceptable.
**Fixture:** defaults

### E3-032
**Prompt:** "is it safe to go out?"
**Style:** hardcore
**Expected first tool:** observe(target=entities)
**Notes:** Evaluates mapping "safe" to checking for hostile mobs nearby.
**Fixture:** time=night, position={x=0, y=64, z=0}

### E3-033
**Prompt:** "we need more wood"
**Style:** tutorial
**Expected first tool:** observe(target=blocks)
**Notes:** Tests if a statement of need initiates a block scan for nearby logs.
**Fixture:** defaults

### E3-034
**Prompt:** "any creepers around?"
**Style:** smp
**Expected first tool:** observe(target=entities)
**Notes:** Checks if the bot actively scans for a specific named entity type.
**Fixture:** entities=[{type=creeper, dx=10, dy=0, dz=5}]

### E3-035
**Prompt:** "which direction should we head for iron?"
**Style:** hardcore
**Expected first tool:** observe(target=blocks)
**Notes:** Evaluates if the bot chains observation of nearby blocks into a navigational recommendation.
**Fixture:** position={x=0, y=40, z=0}, blocks=[{type=iron_ore, dx=8, dy=2, dz=0}]

### E3-036
**Prompt:** "get some food"
**Style:** hardcore
**Expected first tool:** observe(target=entities)
**Notes:** Tests resolving "food" to searching for animals nearby.
**Fixture:** entities=[{type=pig, dx=8, dy=0, dz=3}]

### E3-037
**Prompt:** "where is the portal"
**Style:** speedrun
**Expected first tool:** observe(target=blocks)
**Notes:** Evaluates searching for nether portal blocks. Note: portal as a structure isn't directly locatable; bot should scan for obsidian/portal blocks.
**Fixture:** position={x=0, y=64, z=0}

### E3-038
**Prompt:** "clear the area"
**Style:** smp
**Expected first tool:** observe(target=entities)
**Notes:** Tests mapping "clear" to finding and dealing with hostile mobs.
**Fixture:** entities=[{type=zombie, dx=5, dy=0, dz=0}, {type=zombie, dx=-3, dy=0, dz=4}]

### E3-039
**Prompt:** "!findwood"
**Style:** viewer
**Expected first tool:** observe(target=blocks)
**Notes:** Tests parsing a viewer command to initiate a visual scan for resources.
**Fixture:** position={x=0, y=64, z=0}, blocks=[{type=oak_log, dx=30, dy=0, dz=0}]

### E3-040
**Prompt:** "go to my death coords"
**Style:** hardcore
**Expected first tool:** observe(target=chat)
**Notes:** Tests if the bot knows to look in the chat logs for death coordinates before moving.
**Fixture:** time=day

### E3-041
**Prompt:** "hide"
**Style:** smp
**Expected first tool:** observe(target=blocks)
**Notes:** Tests mapping an abstract concept ("hide") to finding nearby cover or a cave entrance.
**Fixture:** time=day, entities=[{type=zombie, dx=5, dy=0, dz=0}]

### E3-042
**Prompt:** "are there any dark spots where mobs can spawn?"
**Style:** tutorial
**Expected first tool:** observe(target=world)
**Notes:** Forces the bot to synthesise light level / world data into a safety assessment.
**Fixture:** time=night, position={x=0, y=64, z=0}

### E3-043
**Prompt:** "secure the perimeter"
**Style:** hardcore
**Expected first tool:** observe(target=entities)
**Notes:** Evaluates tactical language mapping to mob scanning.
**Fixture:** time=night

### E3-044
**Prompt:** "whats the safest way down this ravine"
**Style:** hardcore
**Expected first tool:** observe(target=blocks)
**Notes:** Requires observing terrain geometry to chart a multi-step path down.
**Fixture:** position={x=0, y=80, z=0}, blocks=[{type=stone, dx=0, dy=-10, dz=3}]

### E3-045
**Prompt:** "how far are we from a forest?"
**Style:** speedrun
**Expected first tool:** observe(target=blocks)
**Notes:** Tests spatial reasoning and distance estimation based on a block scan for nearby logs.
**Fixture:** position={x=0, y=64, z=0}, blocks=[{type=oak_log, dx=25, dy=0, dz=10}]

---

## Epic 4 — Explicit multi-step ("do X then Y")

**Core question:** Does nano sequence tools correctly and use the output of
earlier calls to inform later ones?

**Expected behaviour:** ≥2 tool calls in the correct order; second call
uses data from the first (e.g. observe position → then move to a relative
offset from that position).

**Pass signal:** all required tools called in valid order; args are
consistent across calls; final answer reflects the completed sequence.

---

### E4-046
**Prompt:** "2 hearts no food we need to get OUT of here"
**Style:** hardcore
**Expected first tool:** status
**Notes:** Explicit multi-step implied by urgency: check health/position, observe exits, then move.
**Fixture:** health=4, food=2, entities=[{type=zombie, dx=5, dy=0, dz=0}, {type=zombie, dx=-3, dy=0, dz=4}]

### E4-047
**Prompt:** "grab the sword and hit the zombie"
**Style:** hardcore
**Expected first tool:** inventory(action=equip)
**Notes:** Evaluates a direct equip-then-attack sequence.
**Fixture:** inventory=[{item=iron_sword, count=1}], entities=[{type=zombie, dx=3, dy=0, dz=0}]

### E4-048
**Prompt:** "eat a steak then follow me"
**Style:** smp
**Expected first tool:** use(action=eat)
**Notes:** Tests food consumption followed by movement to a player.
**Fixture:** food=10, inventory=[{item=cooked_beef, count=2}], entities=[{type=player, dx=8, dy=0, dz=0}]

### E4-049
**Prompt:** "mine 3 logs and craft a table"
**Style:** speedrun
**Expected first tool:** dig
**Notes:** Evaluates gathering followed by a crafting action.
**Fixture:** blocks=[{type=oak_log, dx=1, dy=0, dz=0}, {type=oak_log, dx=1, dy=1, dz=0}, {type=oak_log, dx=1, dy=2, dz=0}]

### E4-050
**Prompt:** "drop the dirt then say done"
**Style:** viewer
**Expected first tool:** inventory(action=drop)
**Notes:** Tests inventory manipulation followed by a chat confirmation.
**Fixture:** inventory=[{item=dirt, count=12}]

### E4-051
**Prompt:** "!baseprep"
**Style:** viewer
**Expected first tool:** observe(target=world)
**Notes:** Tests if a viewer macro command triggers a sequence of clearing the area then placing a chest.
**Fixture:** position={x=0, y=64, z=0}

### E4-052
**Prompt:** "check your health and if it's low eat"
**Style:** hardcore
**Expected first tool:** status
**Notes:** Tests conditional logic embedded in a multi-step prompt.
**Fixture:** health=10, inventory=[{item=bread, count=5}]

### E4-053
**Prompt:** "look at me and sneak"
**Style:** smp
**Expected first tool:** move(mode=look_at_player)
**Notes:** Tests two distinct commands in sequence; sneak has no direct tool mapping so a graceful response is also acceptable.
**Fixture:** entities=[{type=player, dx=5, dy=0, dz=0}]

### E4-054
**Prompt:** "open the chest, take the diamonds, close it"
**Style:** speedrun
**Expected first tool:** inventory(action=open)
**Notes:** Evaluates explicit container state management across three steps.
**Fixture:** blocks=[{type=chest, dx=1, dy=0, dz=0}]

### E4-055
**Prompt:** "kill the cow and cook the beef"
**Style:** tutorial
**Expected first tool:** attack
**Notes:** Tests combat followed by a block interaction with a furnace.
**Fixture:** entities=[{type=cow, dx=3, dy=0, dz=0}], blocks=[{type=furnace, dx=-2, dy=0, dz=0}]

### E4-056
**Prompt:** "read chat then reply to him"
**Style:** viewer
**Expected first tool:** observe(target=chat)
**Notes:** Evaluates reading state before writing to chat.
**Fixture:** defaults

### E4-057
**Prompt:** "equip shield and hold right click"
**Style:** hardcore
**Expected first tool:** inventory(action=equip)
**Notes:** Tests defensive sequencing; "hold right click" maps to use(action=item) with shield in off-hand.
**Fixture:** inventory=[{item=shield, count=1}], entities=[{type=skeleton, dx=8, dy=0, dz=0}]

### E4-058
**Prompt:** "walk forward 5 blocks then dig straight down"
**Style:** smp
**Expected first tool:** move(mode=relative)
**Notes:** Tests strict spatial sequencing.
**Fixture:** defaults

### E4-059
**Prompt:** "craft sticks then make ladders"
**Style:** speedrun
**Expected first tool:** use(action=craft)
**Notes:** Evaluates chained crafting recipes where the output of the first is the input to the second.
**Fixture:** inventory=[{item=oak_planks, count=8}]

### E4-060
**Prompt:** "scan for diamonds then mine them"
**Style:** tutorial
**Expected first tool:** observe(target=blocks)
**Notes:** Tests visual search followed by a targeted action. Bot must use blockTypes=["diamond_ore"].
**Fixture:** position={x=0, y=12, z=0}

---

## Epic 5 — Block-interaction disambiguation

**Core question:** Given four tools that all involve "a block at an offset"
(`dig`, `place`, `use(action=block)`, `inventory(action=open)`), does nano
pick the right one?

**Pass signal:** exactly the expected tool is selected; wrong-tool picks are
scored as selection failures even if args are otherwise correct.

---

### E5-061
**Prompt:** "break the chest"
**Style:** smp
**Expected first tool:** dig
**Notes:** Disambiguates destroying a container (dig) vs interacting with it (inventory open).
**Fixture:** blocks=[{type=chest, dx=1, dy=0, dz=0}]

### E5-062
**Prompt:** "open the chest"
**Style:** tutorial
**Expected first tool:** inventory(action=open)
**Notes:** Disambiguates interacting with a container vs breaking it.
**Fixture:** blocks=[{type=chest, dx=1, dy=0, dz=0}]

### E5-063
**Prompt:** "right click the bed"
**Style:** hardcore
**Expected first tool:** use(action=block)
**Notes:** Tests literal mechanical instruction mapping to the use(action=block) tool.
**Fixture:** time=night, blocks=[{type=red_bed, dx=1, dy=0, dz=0}]

### E5-064
**Prompt:** "punch the tree"
**Style:** speedrun
**Expected first tool:** dig
**Notes:** Maps colloquial "punch" to the dig tool, despite sounding like an attack.
**Fixture:** blocks=[{type=oak_log, dx=1, dy=0, dz=0}]

### E5-065
**Prompt:** "click the lever"
**Style:** smp
**Expected first tool:** use(action=block)
**Notes:** Tests interaction with a redstone mechanism via use(action=block).
**Fixture:** blocks=[{type=lever, dx=1, dy=0, dz=0}]

### E5-066
**Prompt:** "smash the glass"
**Style:** viewer
**Expected first tool:** dig
**Notes:** Maps aggressive verb "smash" to block breaking.
**Fixture:** blocks=[{type=glass, dx=1, dy=0, dz=0}]

### E5-067
**Prompt:** "look inside the barrel"
**Style:** tutorial
**Expected first tool:** inventory(action=open)
**Notes:** Maps observational phrase "look inside" to opening a container.
**Fixture:** blocks=[{type=barrel, dx=1, dy=0, dz=0}]

### E5-068
**Prompt:** "ignite the tnt"
**Style:** hardcore
**Expected first tool:** use(action=block)
**Notes:** Evaluates mapping to use(action=block) with flint and steel; item must be in hand.
**Fixture:** inventory=[{item=flint_and_steel, count=1}], blocks=[{type=tnt, dx=1, dy=0, dz=0}]

### E5-069
**Prompt:** "take down the door"
**Style:** smp
**Expected first tool:** dig
**Notes:** Disambiguates breaking a door (dig) vs opening it (use). "Take down" implies destruction.
**Fixture:** blocks=[{type=oak_door, dx=1, dy=0, dz=0}]

### E5-070
**Prompt:** "hit the button"
**Style:** speedrun
**Expected first tool:** use(action=block)
**Notes:** Disambiguates "hit" (usually attack) when applied to a button (requires use(action=block)).
**Fixture:** blocks=[{type=stone_button, dx=1, dy=0, dz=0}]

### E5-071
**Prompt:** "sleep in the bed"
**Style:** tutorial
**Expected first tool:** use(action=sleep)
**Notes:** Standard phrasing for bed interaction; use(action=sleep) is the correct path.
**Fixture:** time=night, blocks=[{type=red_bed, dx=1, dy=0, dz=0}]

### E5-072
**Prompt:** "mine the furnace"
**Style:** hardcore
**Expected first tool:** dig
**Notes:** Explicit block breaking command for a functional block.
**Fixture:** blocks=[{type=furnace, dx=1, dy=0, dz=0}]

### E5-073
**Prompt:** "check the hopper"
**Style:** smp
**Expected first tool:** inventory(action=open)
**Notes:** "Check" maps to opening the container interface.
**Fixture:** blocks=[{type=hopper, dx=0, dy=-1, dz=0}]

### E5-074
**Prompt:** "put the torch on the wall"
**Style:** viewer
**Expected first tool:** place
**Notes:** Evaluates placing a block against an adjacent wall block.
**Fixture:** inventory=[{item=torch, count=8}], blocks=[{type=stone, dx=1, dy=0, dz=0}]

### E5-075
**Prompt:** "use the anvil"
**Style:** speedrun
**Expected first tool:** use(action=block)
**Notes:** Direct mapping of "use" to a functional block interface.
**Fixture:** blocks=[{type=anvil, dx=1, dy=0, dz=0}]

---

## Epic 6 — Inventory reasoning

**Core question:** Does nano navigate the 7-action `inventory` enum
(`inspect`, `equip`, `drop`, `open`, `take`, `deposit`, `close`) correctly,
including item-name resolution?

**Pass signal:** correct action value; item name matches inventory content;
quantities within range.

---

### E6-076
**Prompt:** "equip the iron sword"
**Style:** hardcore
**Expected first tool:** inventory(action=equip)
**Notes:** Tests direct equipment command.
**Fixture:** inventory=[{item=iron_sword, count=1}]

### E6-077
**Prompt:** "drop all your cobblestone"
**Style:** smp
**Expected first tool:** inventory(action=drop)
**Notes:** Tests bulk item dropping; count should be the full stack.
**Fixture:** inventory=[{item=cobblestone, count=192}]

### E6-078
**Prompt:** "put the diamonds in the chest"
**Style:** tutorial
**Expected first tool:** inventory(action=deposit)
**Notes:** Evaluates transferring specific items to an open container.
**Fixture:** inventory=[{item=diamond, count=5}], blocks=[{type=chest, dx=1, dy=0, dz=0}]

### E6-079
**Prompt:** "throw out the rotten flesh"
**Style:** speedrun
**Expected first tool:** inventory(action=drop)
**Notes:** Maps "throw out" to the drop action.
**Fixture:** inventory=[{item=rotten_flesh, count=7}]

### E6-080
**Prompt:** "put on your helmet"
**Style:** viewer
**Expected first tool:** inventory(action=equip)
**Notes:** Maps "put on" to equipping armor to the head slot.
**Fixture:** inventory=[{item=iron_helmet, count=1}]

### E6-081
**Prompt:** "take everything from the chest"
**Style:** smp
**Expected first tool:** inventory(action=take)
**Notes:** Tests bulk extraction from an open container.
**Fixture:** blocks=[{type=chest, dx=1, dy=0, dz=0}]

### E6-082
**Prompt:** "sort your hotbar"
**Style:** tutorial
**Expected first tool:** inventory(action=inspect)
**Notes:** Tests if the bot can handle abstract inventory management; inspect first, then reasoning.
**Fixture:** defaults

### E6-083
**Prompt:** "give me the wood"
**Style:** smp
**Expected first tool:** inventory(action=drop)
**Notes:** Maps "give" to dropping items near the requesting player.
**Fixture:** inventory=[{item=oak_log, count=8}], entities=[{type=player, dx=2, dy=0, dz=0}]

### E6-084
**Prompt:** "hold the totem in your offhand"
**Style:** hardcore
**Expected first tool:** inventory(action=equip)
**Notes:** Specific slot targeting — destination should be "off-hand".
**Fixture:** inventory=[{item=totem_of_undying, count=1}]

### E6-085
**Prompt:** "dump your trash"
**Style:** speedrun
**Expected first tool:** inventory(action=drop)
**Notes:** Evaluates bot's ability to identify low-value items (dirt, seeds, gravel) and drop them.
**Fixture:** inventory=[{item=dirt, count=32}, {item=seeds, count=10}, {item=string, count=4}]

### E6-086
**Prompt:** "grab the iron"
**Style:** tutorial
**Expected first tool:** inventory(action=take)
**Notes:** Maps "grab" to taking from an open container.
**Fixture:** blocks=[{type=chest, dx=1, dy=0, dz=0}]

### E6-087
**Prompt:** "switch to your pick"
**Style:** smp
**Expected first tool:** inventory(action=equip)
**Notes:** Maps "switch" to equipping a pickaxe to the main hand.
**Fixture:** inventory=[{item=iron_pickaxe, count=1}]

### E6-088
**Prompt:** "store your valuables"
**Style:** hardcore
**Expected first tool:** inventory(action=deposit)
**Notes:** Tests semantic understanding of "valuables" — should deposit diamonds, gold, etc.
**Fixture:** inventory=[{item=diamond, count=3}, {item=gold_ingot, count=6}], blocks=[{type=chest, dx=1, dy=0, dz=0}]

### E6-089
**Prompt:** "empty your inventory"
**Style:** viewer
**Expected first tool:** inventory(action=drop)
**Notes:** Tests a total purge command.
**Fixture:** inventory=[{item=dirt, count=10}, {item=cobblestone, count=20}, {item=oak_log, count=5}]

### E6-090
**Prompt:** "put the water bucket in slot 1"
**Style:** speedrun
**Expected first tool:** inventory(action=equip)
**Notes:** Tests slot-based inventory manipulation; destination=hand is the closest mapping.
**Fixture:** inventory=[{item=water_bucket, count=1}]

---

## Epic 7 — Entity targeting

**Core question:** Can nano extract entity IDs or usernames from context
and pass them correctly to `attack`, `move(mode=follow)`, or
`move(mode=look_at_player)`?

**Note:** The typical chain is `observe(target=entities)` → parse entity_id
→ `attack(entity_id=N)`. This is the hardest multi-step chain in the
surface because the ID is an opaque integer. Prompts that expect `attack`
should be graded on whether nano first observes to get the ID.

**Note on E7-095:** `move(mode=follow)` only accepts a player `username`,
not a mob entity. "Chase the pig" is partially impossible and tests graceful
failure or creative workaround.

---

### E7-091
**Prompt:** "hit that zombie"
**Style:** tutorial
**Expected first tool:** observe(target=entities) then attack
**Notes:** Basic entity targeting; nano must observe first to get entity_id.
**Fixture:** entities=[{type=zombie, dx=4, dy=0, dz=0}]

### E7-092
**Prompt:** "follow Alice"
**Style:** smp
**Expected first tool:** move(mode=follow, username=Alice)
**Notes:** Entity targeting for movement; username is explicit in the prompt.
**Fixture:** entities=[{type=player, name=Alice, dx=10, dy=0, dz=0}]

### E7-093
**Prompt:** "look at the creeper"
**Style:** hardcore
**Expected first tool:** observe(target=entities) then move(mode=look_at_player) or move(mode=look)
**Notes:** Tests camera targeting on a specific entity; requires entity position to aim.
**Fixture:** entities=[{type=creeper, dx=5, dy=0, dz=3}]

### E7-094
**Prompt:** "kill the skeleton"
**Style:** speedrun
**Expected first tool:** observe(target=entities) then attack
**Notes:** Maps "kill" to initiating combat; entity_id required.
**Fixture:** entities=[{type=skeleton, dx=6, dy=0, dz=0}]

### E7-095
**Prompt:** "chase the pig"
**Style:** viewer
**Expected first tool:** observe(target=entities) — then graceful failure
**Notes:** move(mode=follow) only supports players. Bot cannot follow mobs. Tests graceful handling of a partially impossible request; observe first, then explain the limitation.
**Fixture:** entities=[{type=pig, dx=5, dy=0, dz=0}]

### E7-096
**Prompt:** "shoot the phantom"
**Style:** hardcore
**Expected first tool:** use(action=item)
**Notes:** Evaluates using a ranged weapon; bot should use held bow as an item, not melee attack.
**Fixture:** inventory=[{item=bow, count=1}, {item=arrow, count=32}], entities=[{type=phantom, dx=0, dy=8, dz=0}]

### E7-097
**Prompt:** "stare down the enderman"
**Style:** smp
**Expected first tool:** observe(target=entities) then move(mode=look)
**Notes:** Tests idiomatic phrasing for looking at a specific mob; requires entity position.
**Fixture:** entities=[{type=enderman, dx=6, dy=0, dz=0}]

### E7-098
**Prompt:** "get away from the ghast"
**Style:** speedrun
**Expected first tool:** move(mode=relative)
**Notes:** Tests negative entity targeting (fleeing). No explicit flee mode exists; move(mode=relative) away from the ghast direction is correct. Entity position needed to determine direction.
**Fixture:** entities=[{type=ghast, dx=15, dy=5, dz=0}], position={x=0, y=64, z=0}

### E7-099
**Prompt:** "target the wither skeleton"
**Style:** tutorial
**Expected first tool:** observe(target=entities) then attack
**Notes:** Formal phrasing for initiating combat; entity_id required.
**Fixture:** entities=[{type=wither_skeleton, dx=5, dy=0, dz=0}]

### E7-100
**Prompt:** "punch him"
**Style:** smp
**Expected first tool:** observe(target=entities) then attack
**Notes:** Pronoun "him" requires entity context; observe first.
**Fixture:** entities=[{type=player, dx=3, dy=0, dz=0}]

### E7-101
**Prompt:** "stay close to me"
**Style:** hardcore
**Expected first tool:** move(mode=follow)
**Notes:** Maps "stay close" to a follow action; username must come from observe(target=players).
**Fixture:** entities=[{type=player, name=Steve, dx=5, dy=0, dz=0}]

### E7-102
**Prompt:** "snipe the creeper"
**Style:** viewer
**Expected first tool:** use(action=item)
**Notes:** Slang for using a bow; bot should use held bow as an item.
**Fixture:** inventory=[{item=bow, count=1}, {item=arrow, count=16}], entities=[{type=creeper, dx=12, dy=0, dz=0}]

### E7-103
**Prompt:** "trade with the villager"
**Style:** tutorial
**Expected first tool:** move(mode=to) then use(action=block) or graceful failure
**Notes:** Interacting with a villager NPC requires approaching and right-clicking; tests multi-step approach or graceful explanation.
**Fixture:** entities=[{type=villager, dx=8, dy=0, dz=0}]

### E7-104
**Prompt:** "leash the horse"
**Style:** smp
**Expected first tool:** use(action=item)
**Notes:** Using a lead on a passive mob; bot should use held lead as an item while near the horse.
**Fixture:** inventory=[{item=lead, count=1}], entities=[{type=horse, dx=3, dy=0, dz=0}]

### E7-105
**Prompt:** "pet the dog"
**Style:** viewer
**Expected first tool:** use(action=item)
**Notes:** "Pet" translates to right-clicking a tamed wolf; use(action=item) is the closest mapping.
**Fixture:** entities=[{type=wolf, dx=2, dy=0, dz=0}]

---

## Epic 8 — Survival response

**Core question:** Given world state that implies danger or need (low food,
low health, night, nearby hostile), does nano infer the right survival
action without explicit command?

**Note:** Prompts in this epic often don't name a tool at all. The model
must read the fixture state and act appropriately.

**Pass signal:** nano calls a contextually appropriate tool (`use(action=eat)`,
`use(action=sleep)`, or moves away from danger) and explains why.

---

### E8-106
**Prompt:** "im on 2 hearts and theres a creeper"
**Style:** hardcore
**Expected first tool:** move(mode=relative) away
**Notes:** Tests if a statement of danger triggers an evasive maneuver.
**Fixture:** health=4, entities=[{type=creeper, dx=4, dy=0, dz=0}]

### E8-107
**Prompt:** "RUN"
**Style:** speedrun
**Expected first tool:** move(mode=relative)
**Notes:** Urgent, single-word panic command; maps to moving away from nearest threat.
**Fixture:** entities=[{type=zombie, dx=3, dy=0, dz=0}, {type=zombie, dx=-2, dy=0, dz=3}]

### E8-108
**Prompt:** "im out of bubbles swim up!!"
**Style:** hardcore
**Expected first tool:** move(mode=relative, dy=1)
**Notes:** Survival response requiring upward movement to avoid drowning; urgency is in the punctuation.
**Fixture:** position={x=0, y=50, z=0}

### E8-109
**Prompt:** "need food NOW"
**Style:** hardcore
**Expected first tool:** use(action=eat)
**Notes:** High urgency statement of need.
**Fixture:** food=2, inventory=[{item=cooked_beef, count=3}]

### E8-110
**Prompt:** "im literally burning to death"
**Style:** smp
**Expected first tool:** use(action=item)
**Notes:** Tests if the bot can deduce using a water bucket to extinguish fire.
**Fixture:** inventory=[{item=water_bucket, count=1}]

### E8-111
**Prompt:** "ahhhh baby zombie"
**Style:** tutorial
**Expected first tool:** attack or move(mode=relative) away
**Notes:** Reactive speech indicating a specific fast threat; fight or flight both acceptable.
**Fixture:** entities=[{type=zombie, dx=2, dy=0, dz=0}]

### E8-112
**Prompt:** "shield shield shield"
**Style:** hardcore
**Expected first tool:** inventory(action=equip) then use(action=item)
**Notes:** Repetitive panic speech mapping to equipping and raising a shield.
**Fixture:** inventory=[{item=shield, count=1}], entities=[{type=skeleton, dx=8, dy=0, dz=0}]

### E8-113
**Prompt:** "we are going to die"
**Style:** smp
**Expected first tool:** status
**Notes:** Tests if an existential panic phrase triggers a situational assessment.
**Fixture:** health=6, entities=[{type=zombie, dx=4, dy=0, dz=0}, {type=zombie, dx=6, dy=0, dz=-2}]

### E8-114
**Prompt:** "block it off quick"
**Style:** speedrun
**Expected first tool:** place
**Notes:** Evaluates urgent command to barricade; bot should place a block in the direction of threat.
**Fixture:** inventory=[{item=cobblestone, count=32}], entities=[{type=zombie, dx=3, dy=0, dz=0}]

### E8-115
**Prompt:** "im poisoned help"
**Style:** tutorial
**Expected first tool:** use(action=eat)
**Notes:** Tests if bot knows how to cure poison; milk bucket is the correct item (use(action=item)).
**Fixture:** inventory=[{item=milk_bucket, count=1}]

### E8-116
**Prompt:** "its night time go go go"
**Style:** smp
**Expected first tool:** use(action=sleep)
**Notes:** Evaluates urgency attached to a time-of-day state mapping to sleep.
**Fixture:** time=night, blocks=[{type=red_bed, dx=2, dy=0, dz=0}]

### E8-117
**Prompt:** "fall damage fall damage"
**Style:** hardcore
**Expected first tool:** use(action=item)
**Notes:** Tests MLG water bucket response; bot should use held water bucket while falling.
**Fixture:** inventory=[{item=water_bucket, count=1}], position={x=0, y=100, z=0}

### E8-118
**Prompt:** "too many of them back up"
**Style:** speedrun
**Expected first tool:** move(mode=relative)
**Notes:** Swarm recognition leading to a retreat.
**Fixture:** entities=[{type=zombie, dx=2, dy=0, dz=0}, {type=zombie, dx=3, dy=0, dz=1}, {type=zombie, dx=1, dy=0, dz=-2}, {type=zombie, dx=4, dy=0, dz=2}, {type=zombie, dx=2, dy=0, dz=-3}]

### E8-119
**Prompt:** "i hear a hiss"
**Style:** smp
**Expected first tool:** move(mode=relative) away
**Notes:** Tests auditory context mapping to danger evasion; hiss = creeper.
**Fixture:** entities=[{type=creeper, dx=3, dy=0, dz=-2}]

### E8-120
**Prompt:** "save me"
**Style:** viewer
**Expected first tool:** move(mode=follow) or move(mode=to)
**Notes:** Vague plea for help; tests if bot moves toward the distressed player.
**Fixture:** entities=[{type=player, name=Steve, dx=15, dy=0, dz=0}]

---

## Epic 9 — Refusal / clarification

**Core question:** Does nano refuse physically impossible or out-of-scope
requests instead of hallucinating a tool call?

**Expected behaviour:** no tool call. A tool call in response to an
impossible prompt is a failure. A clarifying question is acceptable.

**Pass signal:** response is a refusal or clarification with no tool call.

---

### E9-121
**Prompt:** "whisper to Alice and tell her to come here"
**Style:** smp
**Expected first tool:** none (refusal)
**Notes:** Tests refusal of private messaging — no whisper or DM tool exists.
**Fixture:** defaults

### E9-122
**Prompt:** "remember these coordinates for our base later"
**Style:** tutorial
**Expected first tool:** none (refusal or clarification)
**Notes:** Tests refusal/clarification that the bot has no persistent memory or waypoint tool.
**Fixture:** defaults

### E9-123
**Prompt:** "what enchantments does Steve have on his pickaxe?"
**Style:** smp
**Expected first tool:** none (refusal)
**Notes:** Tests boundary knowledge that the bot cannot observe other players' inventory NBT data.
**Fixture:** entities=[{type=player, name=Steve, dx=6, dy=0, dz=0}]

### E9-124
**Prompt:** "build me a starter house right here"
**Style:** viewer
**Expected first tool:** none (refusal)
**Notes:** Out-of-scope compound request; bot lacks a complex architectural planning tool.
**Fixture:** defaults

### E9-125
**Prompt:** "change the gamemode to creative"
**Style:** tutorial
**Expected first tool:** none (refusal)
**Notes:** Tests refusal of gamemode switching.
**Fixture:** defaults

### E9-126
**Prompt:** "give yourself op"
**Style:** smp
**Expected first tool:** none (refusal)
**Notes:** Checks refusal of impossible permission escalation.
**Fixture:** defaults

### E9-127
**Prompt:** "look inside Grian's ender chest"
**Style:** tutorial
**Expected first tool:** none (refusal or clarification)
**Notes:** Tests understanding that ender chests are private per-player; bot can open its own ender chest but not another player's.
**Fixture:** defaults

### E9-128
**Prompt:** "set a waypoint so we don't get lost"
**Style:** hardcore
**Expected first tool:** none (refusal)
**Notes:** Checks refusal of client-side mod features — no waypoint tool exists.
**Fixture:** position={x=0, y=12, z=0}

### E9-129
**Prompt:** "undo that last block placement"
**Style:** speedrun
**Expected first tool:** none (refusal or clarification)
**Notes:** Tests realisation that there is no undo history tool; correct response is to explain and offer to dig it manually.
**Fixture:** blocks=[{type=cobblestone, dx=1, dy=0, dz=0}]

### E9-130
**Prompt:** "tell me what the server seed is"
**Style:** viewer
**Expected first tool:** none (refusal)
**Notes:** Refusal based on the bot lacking operator privileges or tools to read the world seed.
**Fixture:** defaults

### E9-131
**Prompt:** "kill all the mobs on the server"
**Style:** smp
**Expected first tool:** none (refusal)
**Notes:** Server-wide /kill @e requires op and is beyond the bot's tool surface.
**Fixture:** defaults

### E9-132
**Prompt:** "download a minimap mod"
**Style:** tutorial
**Expected first tool:** none (refusal)
**Notes:** Tests refusal of altering client/server software.
**Fixture:** defaults

### E9-133
**Prompt:** "xray and find the diamonds"
**Style:** hardcore
**Expected first tool:** none (refusal)
**Notes:** Checks refusal of cheating/x-raying.
**Fixture:** defaults

### E9-134
**Prompt:** "turn off the rain"
**Style:** speedrun
**Expected first tool:** none (refusal)
**Notes:** Weather manipulation via /weather requires op; bot should refuse or suggest sleeping.
**Fixture:** weather=rain

### E9-135
**Prompt:** "craft a saddle"
**Style:** smp
**Expected first tool:** none (refusal)
**Notes:** Tests knowledge of uncraftable vanilla items; saddles cannot be crafted.
**Fixture:** inventory=[{item=leather, count=5}, {item=iron_ingot, count=2}]

---

## Epic 10 — Ambiguity traps

**Core question:** Given prompts deliberately positioned between two
reasonable tools, do the tool descriptions provide enough signal for nano
to pick correctly?

**Note:** These prompts are designed to expose description weaknesses.
Failures here are direct evidence that a tool description needs a rewrite.
Each entry notes which two tools are in tension.

**Pass signal:** nano picks the tool that better matches the intent as
judged by a human reviewing both tool descriptions.

---

### E10-136
**Prompt:** "use the crafting table"
**Style:** tutorial
**Expected first tool:** use(action=block)
**Tension:** use(action=block) vs move(mode=to)
**Notes:** Tests if the bot knows it can right-click the table in reach vs needing to navigate first; table is 10 blocks away so move(mode=to) first is correct.
**Fixture:** blocks=[{type=crafting_table, dx=10, dy=0, dz=0}]

### E10-137
**Prompt:** "get the stuff from over there"
**Style:** smp
**Expected first tool:** observe(target=entities) or move(mode=to)
**Tension:** move(mode=to) vs observe(target=entities)
**Notes:** Vague "stuff" could be dropped items (entities) or chest contents; observe first is safer.
**Fixture:** entities=[{type=item, dx=15, dy=0, dz=0}]

### E10-138
**Prompt:** "deal with him"
**Style:** hardcore
**Expected first tool:** attack
**Tension:** attack vs move(mode=relative) away
**Notes:** "Deal with" could mean fight or flee; fixture health is high so fighting is correct.
**Fixture:** health=18, entities=[{type=skeleton, dx=5, dy=0, dz=0}]

### E10-139
**Prompt:** "light it up"
**Style:** speedrun
**Expected first tool:** place
**Tension:** place (torch) vs use(action=item) (flint and steel)
**Notes:** In a dark cave, placing torches for visibility is the primary intent; flint and steel would ignite something.
**Fixture:** position={x=0, y=40, z=0}, inventory=[{item=torch, count=16}, {item=flint_and_steel, count=1}]

### E10-140
**Prompt:** "put that away"
**Style:** tutorial
**Expected first tool:** inventory(action=equip) to empty slot, or inventory(action=deposit)
**Tension:** inventory(action=deposit) vs inventory(action=equip)
**Notes:** Ambiguity between storing in a chest vs switching to an empty hand; chest nearby tips toward deposit.
**Fixture:** inventory=[{item=iron_sword, count=1}], blocks=[{type=chest, dx=1, dy=0, dz=0}]

### E10-141
**Prompt:** "take out the skeleton"
**Style:** smp
**Expected first tool:** attack
**Tension:** attack vs use(action=item) (bow)
**Notes:** "Take out" implies killing; bow vs sword tension. At 20 blocks, ranged is more appropriate.
**Fixture:** health=20, inventory=[{item=iron_sword, count=1}, {item=bow, count=1}, {item=arrow, count=16}], entities=[{type=skeleton, dx=20, dy=0, dz=0}]

### E10-142
**Prompt:** "break the bed"
**Style:** viewer
**Expected first tool:** dig
**Tension:** dig vs use(action=sleep)
**Notes:** "Break" is unambiguous destruction but "bed" is often interacted with via use; tests literal verb interpretation.
**Fixture:** time=day, blocks=[{type=red_bed, dx=1, dy=0, dz=0}]

### E10-143
**Prompt:** "grab the water"
**Style:** speedrun
**Expected first tool:** use(action=item)
**Tension:** use(action=item) (scoop with bucket) vs inventory(action=take) (from chest)
**Notes:** Bot is near both a lake and a chest and holds an empty bucket; scooping is more contextually appropriate.
**Fixture:** inventory=[{item=bucket, count=1}], blocks=[{type=water, dx=2, dy=0, dz=0}, {type=chest, dx=-2, dy=0, dz=0}]

### E10-144
**Prompt:** "fix the hole"
**Style:** smp
**Expected first tool:** observe(target=blocks) then place
**Tension:** place vs observe(target=blocks)
**Notes:** Bot needs to locate the hole before placing blocks to fill it; observe first.
**Fixture:** inventory=[{item=dirt, count=16}], blocks=[{type=air, dx=0, dy=-1, dz=1}]

### E10-145
**Prompt:** "get the iron"
**Style:** hardcore
**Expected first tool:** dig or inventory(action=take)
**Tension:** dig (ore in wall) vs inventory(action=take) (from nearby furnace)
**Notes:** Both a furnace with smelted iron and iron ore in the wall are present; furnace take is faster and more contextually useful.
**Fixture:** position={x=0, y=12, z=0}, blocks=[{type=iron_ore, dx=1, dy=0, dz=0}, {type=furnace, dx=-1, dy=0, dz=0}]

### E10-146
**Prompt:** "clear your hands"
**Style:** tutorial
**Expected first tool:** inventory(action=equip) to empty slot
**Tension:** inventory(action=equip) vs inventory(action=drop)
**Notes:** "Clear hands" means stop holding the item, not throw it away; equip to empty slot is correct.
**Fixture:** inventory=[{item=dirt, count=1}]

### E10-147
**Prompt:** "get ready"
**Style:** speedrun
**Expected first tool:** inventory(action=equip)
**Tension:** inventory(action=equip) vs status
**Notes:** Vague prep; standing at the end portal strongly implies equipping best gear. Status check is also defensible.
**Fixture:** inventory=[{item=diamond_sword, count=1}, {item=diamond_chestplate, count=1}], blocks=[{type=end_portal, dx=1, dy=0, dz=0}]

### E10-148
**Prompt:** "secure the house"
**Style:** smp
**Expected first tool:** use(action=block) (close door) or place (torches)
**Tension:** use(action=block) vs place
**Notes:** Closing an open door is the immediate action; placing torches prevents spawns long-term. Open door nearby tips toward use.
**Fixture:** time=night, blocks=[{type=oak_door, dx=1, dy=0, dz=0}]

### E10-149
**Prompt:** "feed him"
**Style:** viewer
**Expected first tool:** use(action=item)
**Tension:** use(action=item) vs inventory(action=drop)
**Notes:** Right-clicking the dog with food (use) is correct; dropping food on the ground is indirect.
**Fixture:** inventory=[{item=cooked_beef, count=2}], entities=[{type=wolf, dx=2, dy=0, dz=0}]

### E10-150
**Prompt:** "start mining"
**Style:** hardcore
**Expected first tool:** inventory(action=equip)
**Tension:** dig vs inventory(action=equip)
**Notes:** Bot is holding a torch, not a pickaxe; equipping first is correct before digging.
**Fixture:** inventory=[{item=iron_pickaxe, count=1}], blocks=[{type=stone, dx=0, dy=0, dz=1}]

---

## Corpus stats

| Epic | Prompts | Styles covered | Date populated |
|---|---|---|---|
| 1 | 15 | speedrun, tutorial, smp, hardcore, viewer | 2026-05-05 |
| 2 | 15 | speedrun, tutorial, smp, hardcore, viewer | 2026-05-05 |
| 3 | 15 | speedrun, tutorial, smp, hardcore, viewer | 2026-05-05 |
| 4 | 15 | speedrun, tutorial, smp, hardcore, viewer | 2026-05-05 |
| 5 | 15 | speedrun, tutorial, smp, hardcore, viewer | 2026-05-05 |
| 6 | 15 | speedrun, tutorial, smp, hardcore, viewer | 2026-05-05 |
| 7 | 15 | speedrun, tutorial, smp, hardcore, viewer | 2026-05-05 |
| 8 | 15 | speedrun, tutorial, smp, hardcore, viewer | 2026-05-05 |
| 9 | 15 | speedrun, tutorial, smp, hardcore, viewer | 2026-05-05 |
| 10 | 15 | speedrun, tutorial, smp, hardcore, viewer | 2026-05-05 |
| **Total** | **150** | all 5 styles | |
