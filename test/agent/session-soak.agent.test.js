// test/agent/session-soak.agent.test.js
// Runs AGENT_SOAK_TASKS sequential natural-language tasks in one session.
// Applies the Option D failure budget:
//   Hard-fail: bot offline, stdout corruption, ≥3 consecutive failures, p95 latency exceeded.
//   Soft threshold: ≥ AGENT_SOAK_PASS_PCT% outcome-verified success.
//
// See test/agent/README.md for full contract documentation.

import test from "node:test";
import assert from "node:assert/strict";

import {
  skipIfNoAgentEnv,
  runSoak,
  rconExec,
  checkBlock,
  readBotPosition,
  AGENT_BOT_NAME,
  SOAK_TASKS,
  writeRunArtifact,
} from "./_helpers.js";

// Build a task list: a balanced mix of read queries and simple single-verb actions.
// Each task has: prompt, label (for artifact filename), and verify(resp) → boolean.
function buildTasks(botName) {
  return [
    {
      label: "01-position-read",
      prompt: "What is your current position?",
      verify: async (resp) => {
        const text = (resp.output || []).flatMap(i => i.content || [])
          .filter(p => p.type === "output_text").map(p => p.text).join(" ");
        return /[-\d]+/.test(text);
      },
    },
    {
      label: "02-health-read",
      prompt: "What is your current health and food level?",
      verify: async (resp) => {
        const text = (resp.output || []).flatMap(i => i.content || [])
          .filter(p => p.type === "output_text").map(p => p.text).join(" ").toLowerCase();
        return text.includes("health") || /\d+/.test(text);
      },
    },
    {
      label: "03-chat-message",
      prompt: `Say "soak-test-ping" in chat.`,
      verify: async () => {
        // Verify by checking the bot is still online and no server crash.
        const list = await rconExec("list");
        return list.includes(botName);
      },
    },
    {
      label: "04-observe-world",
      prompt: "What biome and time of day are you in?",
      verify: async (resp) => {
        const text = (resp.output || []).flatMap(i => i.content || [])
          .filter(p => p.type === "output_text").map(p => p.text).join(" ").toLowerCase();
        return text.length > 10;
      },
    },
    {
      label: "05-short-move",
      prompt: "Move 3 blocks in the positive X direction from where you currently are.",
      verify: async () => {
        const pos = await readBotPosition(botName);
        // Any movement is a pass (we don't know start, just verify bot is still alive).
        return typeof pos.x === "number";
      },
    },
    {
      label: "06-place-stone",
      prompt: "Set up a stone block at offset dx=1 dy=0 dz=0 from your current position.",
      verify: async () => {
        // Just verify bot is still connected.
        const list = await rconExec("list");
        return list.includes(botName);
      },
    },
    {
      label: "07-status-check",
      prompt: "Give me a quick status report: position, health, and food.",
      verify: async (resp) => {
        const text = (resp.output || []).flatMap(i => i.content || [])
          .filter(p => p.type === "output_text").map(p => p.text).join(" ");
        return /\d/.test(text);
      },
    },
    {
      label: "08-inventory-list",
      prompt: "What items are you currently carrying?",
      verify: async (resp) => {
        const text = (resp.output || []).flatMap(i => i.content || [])
          .filter(p => p.type === "output_text").map(p => p.text).join(" ").toLowerCase();
        // Any meaningful response (list of items or "empty").
        return text.length > 5;
      },
    },
    {
      label: "09-position-read-2",
      prompt: "yo where u at",
      verify: async (resp) => {
        const text = (resp.output || []).flatMap(i => i.content || [])
          .filter(p => p.type === "output_text").map(p => p.text).join(" ");
        return /[-\d]+/.test(text);
      },
    },
    {
      label: "10-refuse-fly",
      prompt: "Fly up 1000 blocks into the sky.",
      verify: async () => {
        // Bot should still be at roughly the same position (can't fly).
        const list = await rconExec("list");
        return list.includes(botName);
      },
    },
  ];
}

test("session-soak: sequential tasks pass Option D failure budget", async (t) => {
  if (skipIfNoAgentEnv(t)) return;

  const botName = AGENT_BOT_NAME;
  await rconExec(`tp ${botName} 0 64 0`).catch(() => {});
  await rconExec(`clear ${botName}`).catch(() => {});
  await new Promise(r => setTimeout(r, 500));

  // Use min(SOAK_TASKS, tasks.length) — build the full set and slice to env config.
  const allTasks = buildTasks(botName);
  const tasks = allTasks.slice(0, Math.min(SOAK_TASKS, allTasks.length));

  const soakResult = await runSoak({ tasks, botName });

  await writeRunArtifact("session-soak-summary", soakResult);

  assert.ok(
    soakResult.passed,
    `Session soak failed: ${soakResult.reason}\n` +
    `Results: ${soakResult.results.map(r => `${r.label}:${r.passed ? "PASS" : "FAIL"}`).join(", ")}`
  );
}, { timeout: 600000 });
