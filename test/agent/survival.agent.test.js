// test/agent/survival.agent.test.js
// E8: Inferred survival response from world state.
//
// Assertion convention: TOOL NAME ONLY.
// These prompts test whether the model infers the correct survival action from
// a described world state without explicit instruction. "Im on 2 hearts and
// theres a creeper" should trigger move (flee), not attack. The exact arguments
// are not asserted here.
//
// Pass threshold: ≥85% of 15 prompts select the correct first tool.

import test from "node:test";
import assert from "node:assert/strict";
import { skipIfNoAgentEnv, runCorpus, rconExec, AGENT_BOT_NAME } from "./_helpers.js";

const PROMPTS = [
  {
    prompt: "im on 2 hearts and theres a creeper",
    expectedTool: "move",
    style: "hardcore",
    fixture: "creeper nearby, low health",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`effect give ${AGENT_BOT_NAME} minecraft:instant_damage 1 6 true`);
      await rconExec(`summon minecraft:creeper 4 64 0 {Tags:["e8_mob"],Fuse:32767}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e8_mob]`);
    },
  },
  {
    prompt: "RUN",
    expectedTool: "move",
    style: "speedrun",
    fixture: "hostile mobs nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:zombie 3 64 0 {Tags:["e8_mob"]}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e8_mob]`);
    },
  },
  {
    prompt: "creeper aw man",
    expectedTool: "move",
    style: "viewer",
    fixture: "creeper hissing",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:creeper 3 64 0 {Tags:["e8_mob"],Fuse:32767}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e8_mob]`);
    },
  },
  {
    prompt: "need food NOW",
    expectedTool: "use",
    style: "hardcore",
    fixture: "bot has food, very low hunger",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:cooked_beef 4`);
      await rconExec(`effect give ${AGENT_BOT_NAME} minecraft:hunger 5 10 true`);
    },
  },
  {
    prompt: "im literally burning to death",
    expectedTool: "use",
    style: "smp",
    fixture: "bot on fire, has water bucket",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:water_bucket 1`);
      await rconExec(`effect give ${AGENT_BOT_NAME} minecraft:fire_resistance 1 0 true`);
    },
  },
  {
    prompt: "ahhhh baby zombie",
    expectedTool: "attack",
    style: "tutorial",
    fixture: "baby zombie approaching",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:zombie 3 64 0 {Tags:["e8_mob"],IsBaby:1b}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e8_mob]`);
    },
  },
  {
    prompt: "shield shield shield",
    expectedTool: "use",
    style: "hardcore",
    fixture: "skeleton shooting, bot has shield",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:shield 1`);
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:skeleton 6 64 0 {Tags:["e8_mob"]}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e8_mob]`);
    },
  },
  {
    prompt: "we are going to die",
    expectedTool: "status",
    style: "smp",
    fixture: "surrounded by mobs",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:zombie 3 64 0 {Tags:["e8_mob"]}`);
      await rconExec(`summon minecraft:zombie -3 64 0 {Tags:["e8_mob"]}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e8_mob]`);
    },
  },
  {
    prompt: "block it off quick",
    expectedTool: "place",
    style: "speedrun",
    fixture: "mobs approaching, bot has cobblestone",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:cobblestone 32`);
    },
  },
  {
    prompt: "im poisoned help",
    expectedTool: "use",
    style: "tutorial",
    fixture: "bot poisoned, has milk bucket",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:milk_bucket 1`);
      await rconExec(`effect give ${AGENT_BOT_NAME} minecraft:poison 30 0`);
    },
  },
  {
    prompt: "its night time go go go",
    expectedTool: "use",
    style: "smp",
    fixture: "sun setting, near base",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 64 0 minecraft:red_bed[part=foot,facing=west]");
      await rconExec("setblock 2 64 0 minecraft:red_bed[part=head,facing=west]");
      await rconExec("time set night");
    },
    teardown: async () => {
      await rconExec("fill 1 64 0 2 64 0 minecraft:air");
      await rconExec("time set day");
    },
  },
  {
    // MLG water bucket — use tool with water bucket
    prompt: "fall damage fall damage",
    expectedTool: "use",
    style: "hardcore",
    fixture: "bot falling from height, has water bucket",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:water_bucket 1`);
    },
  },
  {
    prompt: "too many of them back up",
    expectedTool: "move",
    style: "speedrun",
    fixture: "5+ zombies nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      for (let i = 0; i < 5; i++) {
        await rconExec(`summon minecraft:zombie ${i + 2} 64 0 {Tags:["e8_mob"]}`);
      }
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e8_mob]`);
    },
  },
  {
    // Replaced E8-108 (duplicate fixture): underwater, out of air
    prompt: "im out of bubbles swim up!!",
    expectedTool: "move",
    style: "hardcore",
    fixture: "underwater, breath empty",
  },
  {
    prompt: "save me",
    expectedTool: "move",
    style: "viewer",
    fixture: "player being attacked nearby",
  },
];

test("survival: inferred survival response from world state ≥85% first-tool accuracy", async (t) => {
  if (skipIfNoAgentEnv(t)) return;
  const result = await runCorpus(PROMPTS, { label: "survival" });
  assert.ok(
    result.passed,
    `survival corpus failed: ${result.reason}\n` +
    result.summary.failures.map(f => `  "${f.prompt}" → got ${f.actual}, expected ${f.expected}: ${f.reason}`).join("\n")
  );
}, { timeout: 600000 });
