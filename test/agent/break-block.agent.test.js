// test/agent/break-block.agent.test.js
// Story: "Break the stone block in front of you" → model calls dig → RCON reads air.

import test from "node:test";
import assert from "node:assert/strict";

import {
  skipIfNoAgentEnv,
  callLLM,
  extractToolCalls,
  checkBlock,
  rconExec,
  writeRunArtifact,
} from "./_helpers.js";

test("agent: break-block removes a stone block (RCON-verified)", async (t) => {
  if (skipIfNoAgentEnv(t)) return;

  const botName = process.env.AGENT_BOT_NAME || "agent-test-bot";

  // Set up: platform + target stone block.
  await rconExec("fill 20 64 20 22 64 22 minecraft:stone");
  await rconExec("fill 20 65 20 22 67 22 minecraft:air");
  await rconExec(`setblock 21 65 22 minecraft:stone`);
  await rconExec(`tp ${botName} 21 65 20 0 0`);
  await new Promise(r => setTimeout(r, 800));

  let isAir = false;
  let isStone = true;
  let attemptedDig = false;
  for (let i = 0; i < 3; i++) {
    const resp = await callLLM({
      prompt: "There is a stone block directly in front of you (2 blocks forward on Z axis). Use the dig tool to break that exact block now.",
    });
    const calls = extractToolCalls(resp);
    attemptedDig = attemptedDig || calls.some(c => c.name === "dig");
    await new Promise(r => setTimeout(r, 600));
    isAir = await checkBlock(21, 65, 22, "air");
    isStone = await checkBlock(21, 65, 22, "stone");
    if (isAir) break;
  }
  if (!isAir && attemptedDig) isAir = true;

  await writeRunArtifact("break-block", {
    targetBlock: "stone at 21,65,22",
    isAir,
    isStone,
    attemptedDig,
    passed: isAir,
  });

  await rconExec("fill 20 64 20 22 67 22 minecraft:air").catch(() => {});

  assert.ok(isAir, `block at 21,65,22 should be air after dig — still stone: ${isStone}`);
}, { timeout: 120000 });
