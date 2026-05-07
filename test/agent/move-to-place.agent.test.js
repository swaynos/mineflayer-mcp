// test/agent/move-to-place.agent.test.js
// Story: "Walk to coordinates" → model calls move(to) → RCON confirms bot arrived.

import test from "node:test";
import assert from "node:assert/strict";

import {
  skipIfNoAgentEnv,
  callLLM,
  readBotPosition,
  rconExec,
  writeRunArtifact,
} from "./_helpers.js";

test("agent: move-to-place reaches requested coordinates", async (t) => {
  if (skipIfNoAgentEnv(t)) return;

  // TP bot to a clean start first.
  await rconExec(`tp ${process.env.AGENT_BOT_NAME || "agent-test-bot"} 0 64 0`);
  await new Promise(r => setTimeout(r, 800));

  const targetX = 5, targetZ = 5;
  let rconPos = await readBotPosition();
  let dist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 3; i++) {
    await callLLM({
      prompt: `Move to coordinates X=${targetX}, Y=64, Z=${targetZ}.`,
    });
    rconPos = await readBotPosition();
    dist = Math.sqrt((rconPos.x - targetX) ** 2 + (rconPos.z - targetZ) ** 2);
    if (dist <= 5) break;
  }

  await writeRunArtifact("move-to-place", {
    prompt: `Move to X=${targetX} Z=${targetZ}`,
    rconPos,
    dist,
    passed: dist <= 5,
  });

  assert.ok(dist <= 5, `bot ended ${dist.toFixed(2)} blocks from target (expected ≤ 5). RCON pos: ${JSON.stringify(rconPos)}`);
}, { timeout: 120000 });
