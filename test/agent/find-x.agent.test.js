// test/agent/find-x.agent.test.js
// E3: Implicit multi-step ("find X", "we need X", "is it safe").
//
// Assertion convention: TOOL NAME ONLY.
// These prompts test whether the model chains observation → reasoning → answer
// without explicit instruction. The model must pick the right starting tool
// (observe, inventory, use) before reasoning about the rest of the chain.
// The exact arguments within the tool call are not asserted here.
//
// Pass threshold: ≥85% of 15 prompts select the correct first tool.

import test from "node:test";
import assert from "node:assert/strict";
import { skipIfNoAgentEnv, runCorpus, rconExec, AGENT_BOT_NAME } from "./_helpers.js";

const PROMPTS = [
  {
    prompt: "find me a village",
    expectedTool: "observe",
    style: "speedrun",
    fixture: "defaults",
  },
  {
    prompt: "is it safe to go out?",
    expectedTool: "observe",
    style: "hardcore",
    fixture: "night time, inside base",
    setup: async () => {
      await rconExec("time set midnight");
    },
    teardown: async () => {
      await rconExec("time set day");
    },
  },
  {
    prompt: "we need more wood",
    expectedTool: "observe",
    style: "tutorial",
    fixture: "forest nearby",
  },
  {
    prompt: "any creepers around?",
    expectedTool: "observe",
    style: "smp",
    fixture: "defaults",
  },
  {
    prompt: "lets make a base here",
    expectedTool: "inventory",
    style: "tutorial",
    fixture: "defaults",
  },
  {
    prompt: "get some food",
    expectedTool: "observe",
    style: "hardcore",
    fixture: "pigs nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:pig 5 64 0 {Tags:["e3_pig"]}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e3_pig]`);
    },
  },
  {
    prompt: "where is the portal",
    expectedTool: "observe",
    style: "speedrun",
    fixture: "defaults",
  },
  {
    prompt: "clear the area",
    expectedTool: "observe",
    style: "smp",
    fixture: "zombies nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec(`summon minecraft:zombie 4 64 0 {Tags:["e3_zombie"]}`);
    },
    teardown: async () => {
      await rconExec(`kill @e[tag=e3_zombie]`);
    },
  },
  {
    prompt: "do we have enough obsidian",
    expectedTool: "inventory",
    style: "tutorial",
    fixture: "defaults",
  },
  {
    prompt: "go to my death coords",
    expectedTool: "observe",
    style: "hardcore",
    fixture: "defaults",
  },
  {
    prompt: "hide",
    expectedTool: "observe",
    style: "smp",
    fixture: "daylight, open field",
  },
  {
    prompt: "can u make a sword",
    expectedTool: "inventory",
    style: "viewer",
    fixture: "defaults",
  },
  {
    prompt: "secure the perimeter",
    expectedTool: "observe",
    style: "hardcore",
    fixture: "defaults",
  },
  {
    // Replaced E3-044: "whats the safest way down this ravine"
    prompt: "whats the safest way down this ravine",
    expectedTool: "observe",
    style: "hardcore",
    fixture: "standing on ravine edge",
  },
  {
    // Replaced E3-045: "find the stronghold" (original expected use(ender_eye) but
    // the consolidated surface uses use(action=item); observe is the safer first step
    // since the bot needs to know where it is before throwing)
    prompt: "find the stronghold",
    expectedTool: "use",
    style: "speedrun",
    fixture: "bot has ender eyes",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:ender_eye 4`);
    },
  },
];

test("find-x: implicit multi-step observation chains ≥85% first-tool accuracy", async (t) => {
  if (skipIfNoAgentEnv(t)) return;
  const result = await runCorpus(PROMPTS, { label: "find-x" });
  assert.ok(
    result.passed,
    `find-x corpus failed: ${result.reason}\n` +
    result.summary.failures.map(f => `  "${f.prompt}" → got ${f.actual}, expected ${f.expected}: ${f.reason}`).join("\n")
  );
}, { timeout: 600000 });
