// test/agent/ambiguity.agent.test.js
// E10: Ambiguity traps — prompts where two reasonable tools overlap.
//
// Assertion convention: TOOL NAME ONLY.
// Each prompt has a documented tension between two plausible tools. The
// expected tool is the correct one given the fixture context. We assert
// tool name only — the description layer is what should resolve the ambiguity,
// and we are testing whether it does.
//
// The tension for each prompt is documented inline so failures are
// immediately diagnosable as description-layer weaknesses.
//
// Pass threshold: ≥85% of 15 prompts resolve to the correct tool.

import test from "node:test";
import assert from "node:assert/strict";
import { skipIfNoAgentEnv, runCorpus, rconExec, AGENT_BOT_NAME } from "./_helpers.js";

const PROMPTS = [
  {
    // Tension: use(block) vs move(to) — bot must approach before using
    prompt: "use the crafting table",
    expectedTool: "move",
    style: "tutorial",
    fixture: "crafting table is 10 blocks away",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 0 64 10 minecraft:crafting_table");
    },
    teardown: async () => {
      await rconExec("setblock 0 64 10 minecraft:air");
    },
  },
  {
    // Tension: move(to) vs observe(world) — "stuff" needs observation before movement
    prompt: "get the stuff from over there",
    expectedTool: "observe",
    style: "smp",
    fixture: "dropped items visible 15 blocks away",
  },
  {
    // Tension: attack(entity) vs move(away) — health context determines fight vs flee
    prompt: "deal with him",
    expectedTool: "attack",
    style: "hardcore",
    fixture: "skeleton shooting at bot",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:skeleton 5 64 0 {Tags:["e10_mob"]}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e10_mob]`);
    },
  },
  {
    // Tension: place(torch) vs use(flint_and_steel) — cave context resolves to torch
    prompt: "light it up",
    expectedTool: "place",
    style: "speedrun",
    fixture: "dark cave, bot holds torches and flint & steel",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:torch 16`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:flint_and_steel 1`);
    },
  },
  {
    // Tension: inventory(deposit) vs inventory(equip) — near an open chest, "put away" = deposit
    prompt: "put that away",
    expectedTool: "inventory",
    style: "tutorial",
    fixture: "holding sword, standing near open chest",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 64 0 minecraft:chest");
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:iron_sword 1`);
    },
    teardown: async () => {
      await rconExec("setblock 1 64 0 minecraft:air");
    },
  },
  {
    // Tension: attack(skeleton) vs use(bow) — "take out" at 20 blocks means ranged
    prompt: "take out the skeleton",
    expectedTool: "attack",
    style: "smp",
    fixture: "skeleton 20 blocks away, bot has sword and bow",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:skeleton 20 64 0 {Tags:["e10_mob"]}`);
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:iron_sword 1`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:bow 1`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:arrow 16`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e10_mob]`);
    },
  },
  {
    // Tension: dig(bed) vs use(bed) — "break" unambiguously resolves to dig
    prompt: "break the bed",
    expectedTool: "dig",
    style: "viewer",
    fixture: "bot next to a bed",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 64 0 minecraft:red_bed[part=foot,facing=west]");
      await rconExec("setblock 2 64 0 minecraft:red_bed[part=head,facing=west]");
    },
    teardown: async () => {
      await rconExec("fill 1 64 0 2 64 0 minecraft:air");
    },
  },
  {
    // Tension: use(water_bucket) vs inventory(take) — near lake + holding empty bucket = scoop
    prompt: "grab the water",
    expectedTool: "use",
    style: "speedrun",
    fixture: "near lake, holding empty bucket",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:bucket 1`);
    },
  },
  {
    // Tension: place(dirt) vs observe(blocks) — creeper just exploded, fill the hole
    prompt: "fix the hole",
    expectedTool: "place",
    style: "smp",
    fixture: "creeper just exploded, bot has dirt",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:dirt 32`);
    },
  },
  {
    // Tension: dig(iron_ore) vs inventory(take) — cave + furnace present; ore = dig first
    prompt: "get the iron",
    expectedTool: "dig",
    style: "hardcore",
    fixture: "cave with iron ore and a furnace",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 64 0 minecraft:iron_ore");
      await rconExec("setblock -1 64 0 minecraft:furnace");
    },
    teardown: async () => {
      await rconExec("setblock 1 64 0 minecraft:air");
      await rconExec("setblock -1 64 0 minecraft:air");
    },
  },
  {
    // Tension: inventory(equip) vs inventory(drop) — "clear your hands" = switch slot, not drop
    prompt: "clear your hands",
    expectedTool: "inventory",
    style: "tutorial",
    fixture: "bot holding dirt",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:dirt 1`);
    },
  },
  {
    // Tension: inventory(equip) vs status() — "get ready" at end portal = equip weapon
    prompt: "get ready",
    expectedTool: "inventory",
    style: "speedrun",
    fixture: "standing in front of end portal",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:iron_sword 1`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:cooked_beef 4`);
    },
  },
  {
    // Tension: use(door) vs place(torch) — "secure" = close door first
    prompt: "secure the house",
    expectedTool: "use",
    style: "smp",
    fixture: "inside dark house with open door",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 64 0 minecraft:oak_door[facing=east,half=lower,open=true]");
      await rconExec("setblock 1 65 0 minecraft:oak_door[facing=east,half=upper,open=true]");
    },
    teardown: async () => {
      await rconExec("fill 1 64 0 1 65 0 minecraft:air");
    },
  },
  {
    // Tension: use(wolf) vs inventory(drop) — "feed him" with both a player and dog present
    prompt: "feed him",
    expectedTool: "use",
    style: "viewer",
    fixture: "player and tamed dog nearby, bot holds meat",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:cooked_beef 4`);
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:wolf 3 64 0 {Tags:["e10_mob"],Owner:"${AGENT_BOT_NAME}",Tame:1b}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e10_mob]`);
    },
  },
  {
    // Tension: dig(stone) vs inventory(equip) — "start mining" holding torch = equip pick first
    prompt: "start mining",
    expectedTool: "inventory",
    style: "hardcore",
    fixture: "holding torch, facing stone wall, pick in inventory",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:torch 8`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:iron_pickaxe 1`);
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 0 64 1 minecraft:stone");
    },
    teardown: async () => {
      await rconExec("setblock 0 64 1 minecraft:air");
    },
  },
];

test("ambiguity: overlapping tool semantics ≥85% resolved correctly", async (t) => {
  if (skipIfNoAgentEnv(t)) return;
  const result = await runCorpus(PROMPTS, { label: "ambiguity" });
  assert.ok(
    result.passed,
    `ambiguity corpus failed: ${result.reason}\n` +
    result.summary.failures.map(f => `  "${f.prompt}" → got ${f.actual}, expected ${f.expected}: ${f.reason}`).join("\n")
  );
}, { timeout: 600000 });
