// test/agent/inventory.agent.test.js
// E6: Inventory action enum routing.
//
// Assertion convention: TOOL NAME + ACTION (strict=true throughout).
// This entire epic tests whether the model routes to the correct action within
// the inventory tool's 7-action enum:
//   inspect | equip | drop | open | take | deposit | close
// Getting the tool right is necessary but not sufficient here — the whole point
// is that the model picks the right action, not just "inventory".
//
// Pass threshold: ≥85% of 15 prompts select the correct tool AND action.

import test from "node:test";
import assert from "node:assert/strict";
import { skipIfNoAgentEnv, runCorpus, rconExec, AGENT_BOT_NAME } from "./_helpers.js";

const PROMPTS = [
  {
    prompt: "equip the iron sword",
    expectedTool: "inventory",
    expectedAction: "equip",
    strict: true,
    style: "hardcore",
    fixture: "iron sword in inventory",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:iron_sword 1`);
    },
  },
  {
    prompt: "drop all your cobblestone",
    expectedTool: "inventory",
    expectedAction: "drop",
    strict: true,
    style: "smp",
    fixture: "3 stacks of cobble",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:cobblestone 64`);
    },
  },
  {
    prompt: "put the diamonds in the chest",
    expectedTool: "inventory",
    expectedAction: "deposit",
    strict: true,
    style: "tutorial",
    fixture: "chest open, bot holds diamonds",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 64 0 minecraft:chest");
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:diamond 5`);
    },
    teardown: async () => {
      await rconExec("setblock 1 64 0 minecraft:air");
    },
  },
  {
    prompt: "throw out the rotten flesh",
    expectedTool: "inventory",
    expectedAction: "drop",
    strict: true,
    style: "speedrun",
    fixture: "bot holds rotten flesh",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:rotten_flesh 8`);
    },
  },
  {
    prompt: "put on your helmet",
    expectedTool: "inventory",
    expectedAction: "equip",
    strict: true,
    style: "viewer",
    fixture: "helmet in inventory",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:iron_helmet 1`);
    },
  },
  {
    prompt: "take everything from the chest",
    expectedTool: "inventory",
    expectedAction: "take",
    strict: true,
    style: "smp",
    fixture: "chest is open",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 64 0 minecraft:chest{Items:[{id:\"minecraft:dirt\",Count:32,Slot:0}]}");
    },
    teardown: async () => {
      await rconExec("setblock 1 64 0 minecraft:air");
    },
  },
  {
    prompt: "sort your hotbar",
    expectedTool: "inventory",
    expectedAction: "inspect",
    strict: true,
    style: "tutorial",
    fixture: "messy hotbar",
  },
  {
    // "give me the wood" → drop near player
    prompt: "give me the wood",
    expectedTool: "inventory",
    expectedAction: "drop",
    strict: true,
    style: "smp",
    fixture: "bot has wood, player nearby",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:oak_log 16`);
    },
  },
  {
    prompt: "hold the totem in your offhand",
    expectedTool: "inventory",
    expectedAction: "equip",
    strict: true,
    style: "hardcore",
    fixture: "totem in inventory",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:totem_of_undying 1`);
    },
  },
  {
    prompt: "dump your trash",
    expectedTool: "inventory",
    expectedAction: "drop",
    strict: true,
    style: "speedrun",
    fixture: "bot has dirt, seeds, string",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:dirt 32`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:wheat_seeds 16`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:string 8`);
    },
  },
  {
    // "grab" from open chest → take
    prompt: "grab the iron",
    expectedTool: "inventory",
    expectedAction: "take",
    strict: true,
    style: "tutorial",
    fixture: "chest open, contains iron",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 64 0 minecraft:chest{Items:[{id:\"minecraft:iron_ingot\",Count:16,Slot:0}]}");
    },
    teardown: async () => {
      await rconExec("setblock 1 64 0 minecraft:air");
    },
  },
  {
    prompt: "switch to your pick",
    expectedTool: "inventory",
    expectedAction: "equip",
    strict: true,
    style: "smp",
    fixture: "holding sword, pick in hotbar",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:iron_sword 1`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:iron_pickaxe 1`);
    },
  },
  {
    prompt: "store your valuables",
    expectedTool: "inventory",
    expectedAction: "deposit",
    strict: true,
    style: "hardcore",
    fixture: "chest open, bot has diamonds and gold",
    setup: async () => {
      await rconExec(`tp ${AGENT_BOT_NAME} 0 64 0`);
      await rconExec("setblock 1 64 0 minecraft:chest");
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:diamond 3`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:gold_ingot 8`);
    },
    teardown: async () => {
      await rconExec("setblock 1 64 0 minecraft:air");
    },
  },
  {
    prompt: "empty your inventory",
    expectedTool: "inventory",
    expectedAction: "drop",
    strict: true,
    style: "viewer",
    fixture: "bot has various items",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:dirt 16`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:stone 16`);
    },
  },
  {
    prompt: "put the water bucket in slot 1",
    expectedTool: "inventory",
    expectedAction: "equip",
    strict: true,
    style: "speedrun",
    fixture: "water bucket in inventory",
    setup: async () => {
      await rconExec(`clear ${AGENT_BOT_NAME}`);
      await rconExec(`give ${AGENT_BOT_NAME} minecraft:water_bucket 1`);
    },
  },
];

test("inventory: action enum routing ≥85% correct tool+action", async (t) => {
  if (skipIfNoAgentEnv(t)) return;
  const result = await runCorpus(PROMPTS, { label: "inventory" });
  assert.ok(
    result.passed,
    `inventory corpus failed: ${result.reason}\n` +
    result.summary.failures.map(f => `  "${f.prompt}" → got ${f.actual}, expected ${f.expected}: ${f.reason}`).join("\n")
  );
}, { timeout: 600000 });
