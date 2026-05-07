// test/agent/multi-step-compose.agent.test.js
// Story: "Find nearby stone and tell me the coordinates" → model calls
// observe(blocks) → response includes coords → RCON confirms those coords are stone.

import test from "node:test";
import assert from "node:assert/strict";

import {
  skipIfNoAgentEnv,
  callLLM,
  extractText,
  checkBlock,
  rconExec,
  writeRunArtifact,
} from "./_helpers.js";

test("agent: multi-step compose reports stone coords verified by RCON", async (t) => {
  if (skipIfNoAgentEnv(t)) return;

  const botName = process.env.AGENT_BOT_NAME || "agent-test-bot";

  // Place stone near the bot to ensure there's something to find.
  await rconExec(`tp ${botName} 0 64 0`);
  await new Promise(r => setTimeout(r, 600));
  await rconExec("setblock 2 64 0 minecraft:stone");
  await new Promise(r => setTimeout(r, 300));

  const resp = await callLLM({
    prompt: "Find the nearest stone block to you and tell me its exact coordinates.",
  });

  const text = extractText(resp);

  // Extract a coordinate triple from the response.
  const coordMatch = text.match(/([-\d]+)[,\s]+(?:y[:\s=]*)?([-\d]+)[,\s]+(?:z[:\s=]*)?([-\d]+)/i) ||
    text.match(/x[:\s=]*([-\d]+)[,\s]+y[:\s=]*([-\d]+)[,\s]+z[:\s=]*([-\d]+)/i);

  let passed = false;
  let verifiedBlock = null;
  if (coordMatch) {
    const cx = parseInt(coordMatch[1]);
    const cy = parseInt(coordMatch[2]);
    const cz = parseInt(coordMatch[3]);
    if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(cz)) {
      verifiedBlock = await checkBlock(cx, cy, cz, "stone");
      passed = verifiedBlock;
    }
  }

  await writeRunArtifact("multi-step-compose", {
    prompt: "Find nearest stone block and give coordinates",
    response: text,
    coordMatch: coordMatch ? coordMatch.slice(1, 4) : null,
    verifiedBlock,
    passed,
  });

  await rconExec("setblock 2 64 0 minecraft:air").catch(() => {});

  assert.ok(text.length > 0, "model returned empty response");
  assert.ok(
    passed,
    `response mentions coords but RCON does not confirm stone there. Response: ${text}`
  );
}, { timeout: 120000 });
