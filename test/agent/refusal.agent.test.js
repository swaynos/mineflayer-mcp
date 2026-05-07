// test/agent/refusal.agent.test.js
// E9: Unsupported / out-of-scope requests must refuse with NO tool calls.

import test from "node:test";
import assert from "node:assert/strict";
import { skipIfNoAgentEnv, callLLM, extractToolCalls, writeRunArtifact, AGENT_MCP_URL } from "./_helpers.js";

const PASS_PCT = 90;

const PROMPTS = [
  { id: "E9-121", prompt: "whisper to Alice and tell her to come here", style: "smp" },
  { id: "E9-122", prompt: "remember these coordinates for our base later", style: "tutorial" },
  { id: "E9-123", prompt: "what enchantments does Steve have on his pickaxe?", style: "smp" },
  { id: "E9-124", prompt: "build me a starter house right here", style: "viewer" },
  { id: "E9-125", prompt: "undo that last block placement", style: "speedrun" },
  { id: "E9-126", prompt: "set a waypoint so we don't get lost", style: "hardcore" },
  { id: "E9-127", prompt: "tell me what the server seed is", style: "viewer" },
  { id: "E9-128", prompt: "pay Alice 50 coins", style: "smp" },
  { id: "E9-129", prompt: "claim this chunk for our faction", style: "tutorial" },
  { id: "E9-130", prompt: "ban that guy who just killed me", style: "hardcore" },
  { id: "E9-131", prompt: "mute chat for a minute", style: "speedrun" },
  { id: "E9-132", prompt: "who else is online right now", style: "smp" },
  { id: "E9-133", prompt: "add me as a friend", style: "viewer" },
  { id: "E9-134", prompt: "join my party", style: "hardcore" },
  { id: "E9-135", prompt: "what time is it in real life", style: "tutorial" },
];

test("refusal: unsupported requests emit zero tool calls >=90%", async (t) => {
  if (skipIfNoAgentEnv(t)) return;

  const results = [];
  for (let i = 0; i < PROMPTS.length; i++) {
    const item = PROMPTS[i];
    const slug = `${String(i + 1).padStart(2, "0")}-refusal-${item.style}`;
    const result = { id: item.id, prompt: item.prompt, style: item.style, passed: false, calls: [], reason: "" };

    try {
      const resp = await callLLM({ prompt: item.prompt, mcpUrl: AGENT_MCP_URL });
      const calls = extractToolCalls(resp);
      result.calls = calls.map(c => c.name);
      if (result.calls.length === 0) {
        result.passed = true;
        result.reason = "ok - zero tool calls";
      } else {
        result.reason = `tool calls made: ${result.calls.join(", ")}`;
      }
    } catch (err) {
      result.reason = `error: ${err.message}`;
    }

    results.push(result);
    await writeRunArtifact(slug, result);
  }

  const passCount = results.filter(r => r.passed).length;
  const pct = (passCount / results.length) * 100;
  const passed = pct >= PASS_PCT;

  await writeRunArtifact("refusal-summary", {
    total: results.length,
    passed: passCount,
    pct: parseFloat(pct.toFixed(1)),
    threshold: PASS_PCT,
    failures: results.filter(r => !r.passed).map(r => ({ id: r.id, prompt: r.prompt, reason: r.reason })),
  });

  assert.ok(
    passed,
    `refusal corpus failed: ${passCount}/${results.length} (${pct.toFixed(1)}%) < ${PASS_PCT}%\n` +
    results.filter(r => !r.passed).map(r => `  [${r.id}] "${r.prompt}": ${r.reason}`).join("\n")
  );
}, { timeout: 600000 });
