// test/agent/entity-targeting.agent.test.js
// E7: Entity ID extraction, follow, attack, look-at.
//
// Assertion convention: TOOL NAME ONLY.
// These prompts test whether the model selects the correct tool when an entity
// is the subject — attack vs move(follow) vs move(look_at_player) vs use.
// The specific entity_id or username argument is not asserted; correctness of
// entity resolution is implicitly validated by world outcomes in other tests.
//
// Pass threshold: ≥85% of 15 prompts select the correct first tool.

import test from "node:test";
import assert from "node:assert/strict";
import { skipIfNoAgentEnv, runCorpus, rconExec, AGENT_BOT_NAME } from "./_helpers.js";

const PROMPTS = [
  {
    prompt: "hit that zombie",
    expectedTool: "attack",
    style: "tutorial",
    fixture: "zombie nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:zombie 3 64 0 {Tags:["e7_mob"]}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e7_mob]`);
    },
  },
  {
    prompt: "follow Alice",
    expectedTool: "move",
    style: "smp",
    fixture: "player Alice visible",
  },
  {
    prompt: "look at the creeper",
    expectedTool: "move",
    style: "hardcore",
    fixture: "creeper nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:creeper 4 64 0 {Tags:["e7_mob"],Fuse:32767}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e7_mob]`);
    },
  },
  {
    prompt: "kill the skeleton",
    expectedTool: "attack",
    style: "speedrun",
    fixture: "skeleton nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:skeleton 3 64 0 {Tags:["e7_mob"]}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e7_mob]`);
    },
  },
  {
    prompt: "chase the pig",
    expectedTool: "move",
    style: "viewer",
    fixture: "pig nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:pig 5 64 0 {Tags:["e7_mob"]}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e7_mob]`);
    },
  },
  {
    // Bow use requires the "use" tool, not attack
    prompt: "shoot the phantom",
    expectedTool: "use",
    style: "hardcore",
    fixture: "bot holding bow, phantom overhead",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:bow 1`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:arrow 16`);
    },
  },
  {
    prompt: "stare down the enderman",
    expectedTool: "move",
    style: "smp",
    fixture: "enderman nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:enderman 5 64 0 {Tags:["e7_mob"]}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e7_mob]`);
    },
  },
  {
    prompt: "get away from the ghast",
    expectedTool: "move",
    style: "speedrun",
    fixture: "ghast nearby",
  },
  {
    prompt: "target the wither skeleton",
    expectedTool: "attack",
    style: "tutorial",
    fixture: "wither skeleton nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:wither_skeleton 3 64 0 {Tags:["e7_mob"]}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e7_mob]`);
    },
  },
  {
    prompt: "punch him",
    expectedTool: "attack",
    style: "smp",
    fixture: "entity nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:zombie 3 64 0 {Tags:["e7_mob"]}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e7_mob]`);
    },
  },
  {
    prompt: "stay close to me",
    expectedTool: "move",
    style: "hardcore",
    fixture: "player nearby",
  },
  {
    // "snipe" = bow use, not attack
    prompt: "snipe the creeper",
    expectedTool: "use",
    style: "viewer",
    fixture: "bot holding bow, creeper in range",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:bow 1`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:arrow 16`);
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:creeper 10 64 0 {Tags:["e7_mob"],Fuse:32767}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e7_mob]`);
    },
  },
  {
    // Trading with villager requires use tool
    prompt: "trade with the villager",
    expectedTool: "use",
    style: "tutorial",
    fixture: "villager nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:villager 3 64 0 {Tags:["e7_mob"]}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e7_mob]`);
    },
  },
  {
    // Leashing requires use tool with lead
    prompt: "leash the horse",
    expectedTool: "use",
    style: "smp",
    fixture: "bot holding lead, horse nearby",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:lead 1`);
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:horse 3 64 0 {Tags:["e7_mob"]}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e7_mob]`);
    },
  },
  {
    // "pet the dog" is a roleplay command — maps to use or graceful refusal
    prompt: "pet the dog",
    expectedTool: "use",
    style: "viewer",
    fixture: "tamed wolf nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:wolf 3 64 0 {Tags:["e7_mob"],Owner:"${AGENT_BOT_NAME}",Tame:1b}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e7_mob]`);
    },
  },
];

test("entity-targeting: attack vs move vs use on entities ≥85% first-tool accuracy", async (t) => {
  if (skipIfNoAgentEnv(t)) return;
  const result = await runCorpus(PROMPTS, { label: "entity-targeting" });
  assert.ok(
    result.passed,
    `entity-targeting corpus failed: ${result.reason}\n` +
    result.summary.failures.map(f => `  "${f.prompt}" → got ${f.actual}, expected ${f.expected}: ${f.reason}`).join("\n")
  );
}, { timeout: 600000 });
