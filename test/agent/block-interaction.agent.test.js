// test/agent/block-interaction.agent.test.js
// E5: Block-interaction disambiguation — dig vs use vs inventory(open).
//
// Assertion convention: TOOL NAME + ACTION (strict=true for inventory prompts).
// This entire epic exists to test whether the model picks the correct action
// within overlapping tools. "Break the chest" (dig) vs "open the chest"
// (inventory action=open) is the canonical ambiguity. For prompts where the
// expected tool is inventory, we assert action=open as well.
// For dig and use, we assert tool name only — the offset/target arguments
// are not the point of this epic.
//
// Pass threshold: ≥85% of 15 prompts select the correct first tool (and action
// where strict=true).

import test from "node:test";
import assert from "node:assert/strict";
import { skipIfNoAgentEnv, runCorpus, rconExec, AGENT_BOT_NAME } from "./_helpers.js";

const PROMPTS = [
  {
    // STRICT: inventory must be called with action=open, not dig
    prompt: "break the chest",
    expectedTool: "dig",
    strict: false, // "break" unambiguously maps to dig
    style: "smp",
    fixture: "chest in front",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 64 0 minecraft:chest");
    },
    teardown: async () => {
      await rconExec("setblock 1 64 0 minecraft:air");
    },
  },
  {
    // STRICT: inventory(action=open) vs dig
    prompt: "open the chest",
    expectedTool: "inventory",
    expectedAction: "open",
    strict: true,
    style: "tutorial",
    fixture: "chest in front",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 64 0 minecraft:chest");
    },
    teardown: async () => {
      await rconExec("setblock 1 64 0 minecraft:air");
    },
  },
  {
    prompt: "right click the bed",
    expectedTool: "use",
    strict: false,
    style: "hardcore",
    fixture: "night, next to bed",
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
    // "punch" sounds like attack but maps to dig (trees)
    prompt: "punch the tree",
    expectedTool: "dig",
    strict: false,
    style: "speedrun",
    fixture: "next to a tree",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 65 0 minecraft:oak_log");
    },
    teardown: async () => {
      await rconExec("setblock 1 65 0 minecraft:air");
    },
  },
  {
    prompt: "click the lever",
    expectedTool: "use",
    strict: false,
    style: "smp",
    fixture: "lever on wall",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 65 0 minecraft:stone");
      await rconExec("setblock 1 65 1 minecraft:lever[face=wall,facing=east]");
    },
    teardown: async () => {
      await rconExec("fill 1 65 0 1 65 1 minecraft:air");
    },
  },
  {
    // "smash" sounds aggressive but maps to dig
    prompt: "smash the glass",
    expectedTool: "dig",
    strict: false,
    style: "viewer",
    fixture: "glass block nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 64 0 minecraft:glass");
    },
    teardown: async () => {
      await rconExec("setblock 1 64 0 minecraft:air");
    },
  },
  {
    // STRICT: "look inside" maps to inventory(action=open), not observe
    prompt: "look inside the barrel",
    expectedTool: "inventory",
    expectedAction: "open",
    strict: true,
    style: "tutorial",
    fixture: "barrel nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 64 0 minecraft:barrel");
    },
    teardown: async () => {
      await rconExec("setblock 1 64 0 minecraft:air");
    },
  },
  {
    prompt: "ignite the tnt",
    expectedTool: "use",
    strict: false,
    style: "hardcore",
    fixture: "bot holds flint and steel, TNT nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 2 64 0 minecraft:tnt");
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:flint_and_steel 1`);
    },
    teardown: async () => {
      await rconExec("setblock 2 64 0 minecraft:air");
    },
  },
  {
    // "take down" means break, not open
    prompt: "take down the door",
    expectedTool: "dig",
    strict: false,
    style: "smp",
    fixture: "wooden door nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 64 0 minecraft:oak_door[facing=east,half=lower]");
      await rconExec("setblock 1 65 0 minecraft:oak_door[facing=east,half=upper]");
    },
    teardown: async () => {
      await rconExec("fill 1 64 0 1 65 0 minecraft:air");
    },
  },
  {
    // "hit" the button disambiguates to use (not attack)
    prompt: "hit the button",
    expectedTool: "use",
    strict: false,
    style: "speedrun",
    fixture: "stone button nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 65 0 minecraft:stone");
      await rconExec("setblock 2 65 0 minecraft:stone_button[face=wall,facing=west]");
    },
    teardown: async () => {
      await rconExec("fill 1 65 0 2 65 0 minecraft:air");
    },
  },
  {
    prompt: "sleep in the bed",
    expectedTool: "use",
    strict: false,
    style: "tutorial",
    fixture: "night, next to bed",
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
    prompt: "mine the furnace",
    expectedTool: "dig",
    strict: false,
    style: "hardcore",
    fixture: "furnace nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 64 0 minecraft:furnace");
    },
    teardown: async () => {
      await rconExec("setblock 1 64 0 minecraft:air");
    },
  },
  {
    // STRICT: "check" maps to inventory(action=open), not observe
    prompt: "check the hopper",
    expectedTool: "inventory",
    expectedAction: "open",
    strict: true,
    style: "smp",
    fixture: "hopper nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 64 0 minecraft:hopper");
    },
    teardown: async () => {
      await rconExec("setblock 1 64 0 minecraft:air");
    },
  },
  {
    prompt: "put the torch on the wall",
    expectedTool: "place",
    strict: false,
    style: "viewer",
    fixture: "bot holds torches",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:torch 16`);
    },
  },
  {
    prompt: "use the anvil",
    expectedTool: "use",
    strict: false,
    style: "speedrun",
    fixture: "anvil nearby",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 64 0 minecraft:anvil");
    },
    teardown: async () => {
      await rconExec("setblock 1 64 0 minecraft:air");
    },
  },
];

test("block-interaction: dig vs use vs inventory(open) disambiguation ≥85% first-tool accuracy", async (t) => {
  if (skipIfNoAgentEnv(t)) return;
  const result = await runCorpus(PROMPTS, { label: "block-interaction" });
  assert.ok(
    result.passed,
    `block-interaction corpus failed: ${result.reason}\n` +
    result.summary.failures.map(f => `  "${f.prompt}" → got ${f.actual}, expected ${f.expected}: ${f.reason}`).join("\n")
  );
}, { timeout: 600000 });
