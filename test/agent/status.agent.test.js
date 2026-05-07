// test/agent/status.agent.test.js
// E1: Colloquial status/position/health reads.
//
// Assertion convention: TOOL NAME ONLY.
// These prompts test whether the model routes to the correct top-level tool
// (status vs observe vs inventory). The specific arguments are not asserted here —
// that is covered by E5/E6 where action disambiguation is the point.
//
// Pass threshold: ≥85% of 15 prompts select the correct first tool.

import test from "node:test";
import assert from "node:assert/strict";
import { skipIfNoAgentEnv, runCorpus, rconExec, AGENT_BOT_NAME } from "./_helpers.js";

// Fixtures that require non-default world state use setup/teardown.
// style values: smp | hardcore | tutorial | speedrun | viewer
const PROMPTS = [
  {
    prompt: "yo where u at",
    expectedTool: "status",
    style: "smp",
    fixture: "defaults",
  },
  {
    prompt: "how much hp u got left man",
    expectedTool: "status",
    style: "hardcore",
    fixture: "health=6",
    setup: async () => {
      await rconExec(`effect give ${AGENT_BOT_NAME} minecraft:instant_damage 1 10 true`);
    },
  },
  {
    prompt: "!coords",
    expectedTool: "status",
    style: "viewer",
    fixture: "defaults",
  },
  {
    prompt: "are you starving yet",
    expectedTool: "status",
    style: "smp",
    fixture: "hunger=4shanks",
    setup: async () => {
      await rconExec(`effect give ${AGENT_BOT_NAME} minecraft:hunger 5 10 true`);
    },
  },
  {
    prompt: "what are you holding right now",
    expectedTool: "inventory",
    style: "tutorial",
    fixture: "holds stone_pickaxe",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:stone_pickaxe 1`);
    },
  },
  {
    prompt: "quick f3 check",
    expectedTool: "status",
    style: "speedrun",
    fixture: "defaults",
  },
  {
    prompt: "whats our y level",
    expectedTool: "status",
    style: "hardcore",
    fixture: "underground y=11",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 11 0`);
    },
  },
  {
    prompt: "how many blocks in ur offhand",
    expectedTool: "inventory",
    style: "smp",
    fixture: "torches in offhand",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:torch 16`);
    },
  },
  {
    prompt: "do we have any food on us",
    expectedTool: "inventory",
    style: "tutorial",
    fixture: "defaults",
  },
  {
    prompt: "what biome is this",
    expectedTool: "observe",
    style: "speedrun",
    fixture: "defaults",
  },
  {
    prompt: "read me your stats",
    expectedTool: "status",
    style: "viewer",
    fixture: "defaults",
  },
  {
    prompt: "any armor durability left?",
    expectedTool: "inventory",
    style: "hardcore",
    fixture: "wearing damaged iron armor",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:iron_helmet{Damage:230} 1`);
    },
  },
  {
    prompt: "bro are u dead",
    expectedTool: "status",
    style: "smp",
    fixture: "alive but low health",
    setup: async () => {
      await rconExec(`effect give ${AGENT_BOT_NAME} minecraft:instant_damage 1 5 true`);
    },
  },
  {
    prompt: "gimme your exact coordinates",
    expectedTool: "status",
    style: "tutorial",
    fixture: "defaults",
  },
  {
    prompt: "status update rn",
    expectedTool: "status",
    style: "speedrun",
    fixture: "defaults",
  },
];

test("status: colloquial status/position/health reads ≥85% first-tool accuracy", async (t) => {
  if (skipIfNoAgentEnv(t)) return;
  const result = await runCorpus(PROMPTS, { label: "status" });
  assert.ok(
    result.passed,
    `status corpus failed: ${result.reason}\n` +
    result.summary.failures.map(f => `  "${f.prompt}" → got ${f.actual}, expected ${f.expected}: ${f.reason}`).join("\n")
  );
}, { timeout: 600000 });
