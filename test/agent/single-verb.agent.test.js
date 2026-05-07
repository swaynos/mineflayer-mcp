// test/agent/single-verb.agent.test.js
// E2: Direct single-action imperatives.
//
// Assertion convention: TOOL NAME ONLY.
// These prompts test whether the model routes colloquial/slang single-verb
// commands to the correct tool. The exact arguments (which entity, which
// offset, which message) are not asserted — E7 covers entity targeting in
// depth, and the action-argument level is covered by E5/E6.
//
// Pass threshold: ≥85% of 15 prompts select the correct first tool.

import test from "node:test";
import assert from "node:assert/strict";
import { skipIfNoAgentEnv, runCorpus, rconExec, AGENT_BOT_NAME } from "./_helpers.js";

const PROMPTS = [
  {
    prompt: "say hi in chat",
    expectedTool: "chat",
    style: "tutorial",
    fixture: "defaults",
  },
  {
    prompt: "mine that diamond ore",
    expectedTool: "dig",
    style: "smp",
    fixture: "diamond ore directly in front",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 0 64 1 minecraft:diamond_ore");
    },
    teardown: async () => {
      await rconExec("setblock 0 64 1 minecraft:air");
    },
  },
  {
    prompt: "place a torch on the wall",
    expectedTool: "place",
    style: "hardcore",
    fixture: "bot holds torches, next to wall",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:torch 16`);
      await rconExec("setblock 0 64 1 minecraft:stone");
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
    },
    teardown: async () => {
      await rconExec("setblock 0 64 1 minecraft:air");
    },
  },
  {
    prompt: "whack the pig",
    expectedTool: "attack",
    style: "speedrun",
    fixture: "pig 2 blocks away",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:pig 2 64 0 {Tags:["e2_pig"]}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e2_pig]`);
    },
  },
  {
    prompt: "come over here",
    expectedTool: "move",
    style: "smp",
    fixture: "player 10 blocks away",
  },
  {
    prompt: "type f in chat",
    expectedTool: "chat",
    style: "viewer",
    fixture: "defaults",
  },
  {
    prompt: "break the spawner",
    expectedTool: "dig",
    style: "hardcore",
    fixture: "spawner nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 64 0 minecraft:spawner");
    },
    teardown: async () => {
      await rconExec("setblock 1 64 0 minecraft:air");
    },
  },
  {
    prompt: "drop down",
    expectedTool: "move",
    style: "speedrun",
    fixture: "bot near a ledge",
  },
  {
    prompt: "sleep",
    expectedTool: "use",
    style: "tutorial",
    fixture: "bot next to bed at night",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 64 0 minecraft:red_bed[part=foot,facing=west]");
      await rconExec("setblock 2 64 0 minecraft:red_bed[part=head,facing=west]");
      await rconExec("time set night");
    },
    teardown: async () => {
      await rconExec("setblock 1 64 0 minecraft:air");
      await rconExec("setblock 2 64 0 minecraft:air");
      await rconExec("time set day");
    },
  },
  {
    prompt: "slap him",
    expectedTool: "attack",
    style: "smp",
    fixture: "entity nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:zombie 2 64 0 {Tags:["e2_zombie"]}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e2_zombie]`);
    },
  },
  {
    prompt: "put down a crafting table",
    expectedTool: "place",
    style: "tutorial",
    fixture: "bot has crafting table in inventory",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:crafting_table 1`);
    },
  },
  {
    prompt: "eat",
    expectedTool: "use",
    style: "hardcore",
    fixture: "bot has low hunger and food in hand",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:cooked_beef 4`);
      await rconExec(`effect give ${AGENT_BOT_NAME} minecraft:hunger 5 10 true`);
    },
  },
  {
    prompt: "look up",
    expectedTool: "move",
    style: "speedrun",
    fixture: "defaults",
  },
  {
    prompt: "dig straight down",
    expectedTool: "dig",
    style: "viewer",
    fixture: "defaults",
  },
  {
    prompt: "announce we found diamonds",
    expectedTool: "chat",
    style: "smp",
    fixture: "defaults",
  },
];

test("single-verb: direct action imperatives ≥85% first-tool accuracy", async (t) => {
  if (skipIfNoAgentEnv(t)) return;
  const result = await runCorpus(PROMPTS, { label: "single-verb" });
  assert.ok(
    result.passed,
    `single-verb corpus failed: ${result.reason}\n` +
    result.summary.failures.map(f => `  "${f.prompt}" → got ${f.actual}, expected ${f.expected}: ${f.reason}`).join("\n")
  );
}, { timeout: 600000 });
