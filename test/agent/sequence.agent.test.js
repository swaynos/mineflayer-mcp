// test/agent/sequence.agent.test.js
// E4: Explicit multi-step chains ("do X then Y", "check X and if Y then Z").
//
// Assertion convention: TOOL NAME ONLY.
// These prompts test whether the model correctly sequences tool calls and
// identifies the correct FIRST tool to invoke when given an explicit ordered
// or conditional instruction. Later tools in the chain are not asserted here —
// session-soak covers sustained multi-turn correctness.
//
// Pass threshold: ≥85% of 15 prompts select the correct first tool.

import test from "node:test";
import assert from "node:assert/strict";
import { skipIfNoAgentEnv, runCorpus, rconExec, AGENT_BOT_NAME } from "./_helpers.js";

const PROMPTS = [
  {
    // Replaced E4-046: explicit first tool is status() for a health+position check
    prompt: "2 hearts no food we need to get OUT of here",
    expectedTool: "status",
    style: "hardcore",
    fixture: "cave with mobs approaching",
    setup: async () => {
      await rconExec(`effect give ${AGENT_BOT_NAME} minecraft:instant_damage 1 6 true`);
    },
  },
  {
    prompt: "grab the sword and hit the zombie",
    expectedTool: "inventory",
    style: "hardcore",
    fixture: "sword in hotbar, zombie nearby",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:iron_sword 1`);
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:zombie 4 64 0 {Tags:["e4_zombie"]}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e4_zombie]`);
    },
  },
  {
    prompt: "eat a steak then follow me",
    expectedTool: "use",
    style: "smp",
    fixture: "bot is hungry, has steak",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:cooked_beef 2`);
      await rconExec(`effect give ${AGENT_BOT_NAME} minecraft:hunger 5 10 true`);
    },
  },
  {
    prompt: "mine 3 logs and craft a table",
    expectedTool: "dig",
    style: "speedrun",
    fixture: "tree directly in front",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 0 65 1 minecraft:oak_log");
      await rconExec("setblock 0 66 1 minecraft:oak_log");
      await rconExec("setblock 0 67 1 minecraft:oak_log");
    },
    teardown: async () => {
      await rconExec("fill 0 65 1 0 67 1 minecraft:air");
    },
  },
  {
    prompt: "drop the dirt then say done",
    expectedTool: "inventory",
    style: "viewer",
    fixture: "bot has dirt",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:dirt 32`);
    },
  },
  {
    prompt: "put the iron in the furnace and right click it with coal",
    expectedTool: "inventory",
    style: "tutorial",
    fixture: "furnace nearby, bot holds iron and coal",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 64 0 minecraft:furnace");
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:iron_ore 8`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:coal 8`);
    },
    teardown: async () => {
      await rconExec("setblock 1 64 0 minecraft:air");
    },
  },
  {
    prompt: "check your health and if it's low eat",
    expectedTool: "status",
    style: "hardcore",
    fixture: "bot has 5 hearts",
    setup: async () => {
      await rconExec(`effect give ${AGENT_BOT_NAME} minecraft:instant_damage 1 5 true`);
    },
  },
  {
    prompt: "look at me and sneak",
    expectedTool: "move",
    style: "smp",
    fixture: "player nearby",
  },
  {
    prompt: "open the chest, take the diamonds, close it",
    expectedTool: "inventory",
    style: "speedrun",
    fixture: "chest in front of bot",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 64 0 minecraft:chest{Items:[{id:\"minecraft:diamond\",Count:5,Slot:0}]}");
    },
    teardown: async () => {
      await rconExec("setblock 1 64 0 minecraft:air");
    },
  },
  {
    prompt: "kill the cow and cook the beef",
    expectedTool: "attack",
    style: "tutorial",
    fixture: "cow nearby, furnace nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:cow 3 64 0 {Tags:["e4_cow"]}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e4_cow]`);
    },
  },
  {
    prompt: "read chat then reply to him",
    expectedTool: "observe",
    style: "viewer",
    fixture: "another player asked a question",
  },
  {
    prompt: "equip shield and hold right click",
    expectedTool: "inventory",
    style: "hardcore",
    fixture: "shield in inventory",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:shield 1`);
    },
  },
  {
    prompt: "walk forward 5 blocks then dig straight down",
    expectedTool: "move",
    style: "smp",
    fixture: "defaults",
  },
  {
    prompt: "craft sticks then make ladders",
    expectedTool: "use",
    style: "speedrun",
    fixture: "bot has planks",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:oak_planks 16`);
    },
  },
  {
    prompt: "scan for diamonds then mine them",
    expectedTool: "observe",
    style: "tutorial",
    fixture: "in a cave",
  },
];

test("sequence: explicit multi-step chains ≥85% first-tool accuracy", async (t) => {
  if (skipIfNoAgentEnv(t)) return;
  const result = await runCorpus(PROMPTS, { label: "sequence" });
  assert.ok(
    result.passed,
    `sequence corpus failed: ${result.reason}\n` +
    result.summary.failures.map(f => `  "${f.prompt}" → got ${f.actual}, expected ${f.expected}: ${f.reason}`).join("\n")
  );
}, { timeout: 600000 });
