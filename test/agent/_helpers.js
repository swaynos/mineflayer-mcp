// test/agent/_helpers.js
// Shared harness for the test/agent/ real-LLM suite.
// No node:test imports here — pure infrastructure code.
//
// Intentionally duplicates a narrow RCON subset from test/world/_helpers.js.
// Layer independence is more valuable than DRY across layers.

import net from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// ---------- env ----------

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv();

export const OPENAI_BASE_URL  = (process.env.OPENAI_BASE_URL || "https://api.openai.com").replace(/\/$/, "");
export const AGENT_MODEL      = process.env.AGENT_MODEL      || "gpt-4o-mini";
const AGENT_MCP_PORT          = Number(process.env.HTTP_PORT || 8080);
export const AGENT_BOT_NAME   = process.env.AGENT_BOT_NAME   || "agent-test-bot";

export const RCON_HOST        = process.env.RCON_HOST        || "127.0.0.1";
export const RCON_PORT        = Number(process.env.RCON_PORT  || 25575);
export const RCON_PASS        = process.env.RCON_PASSWORD     || "mineflayer-dev";

export const SOAK_TASKS       = Number(process.env.AGENT_SOAK_TASKS    || 20);
export const SOAK_PASS_PCT    = Number(process.env.AGENT_SOAK_PASS_PCT  || 30);
export const SOAK_P95_MS      = Number(process.env.AGENT_SOAK_P95_MS    || 30000);

function normalizeMcpUrl(base) {
  const trimmed = String(base || "").trim();
  if (!trimmed) return "";
  return trimmed.endsWith("/mcp") ? trimmed : `${trimmed.replace(/\/$/, "")}/mcp`;
}

function resolveNgrokMcpUrl() {
  const fromEnv = normalizeMcpUrl(process.env.NGROK_URL || "");
  if (fromEnv) return fromEnv;

  try {
    const local = execFileSync("python3", ["-c", "import json,urllib.request;print(json.load(urllib.request.urlopen('http://127.0.0.1:4040/api/tunnels')).get('tunnels',[{}])[0].get('public_url',''))"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const fromLocalApi = normalizeMcpUrl(local);
    if (fromLocalApi) return fromLocalApi;
  } catch {
    // ignore; fallback to CLI parsing below
  }

  try {
    const out = execFileSync("ngrok", ["api", "tunnels", "list"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const m = out.match(/https:\/\/[a-zA-Z0-9.-]+\.ngrok-free\.app/);
    return normalizeMcpUrl(m ? m[0] : "");
  } catch {
    return "";
  }
}

export const AGENT_MCP_URL = normalizeMcpUrl(process.env.AGENT_MCP_URL || "") || resolveNgrokMcpUrl();

// ---------- skip guard ----------

export function skipIfNoAgentEnv(t) {
  if (!process.env.OPENAI_API_KEY || !AGENT_MCP_URL) {
    t.skip("Set OPENAI_API_KEY and AGENT_MCP_URL (or run ngrok/NGROK_URL) to run agent tests");
    return true;
  }
  return false;
}

// ---------- RCON (narrow duplicate of world layer) ----------

const RCON_TYPE_AUTH     = 3;
const RCON_TYPE_EXEC     = 2;
const RCON_TYPE_RESPONSE = 0;

function rconPacket(id, type, body) {
  const payload = Buffer.from(body, "utf8");
  const buf = Buffer.allocUnsafe(4 + 4 + 4 + payload.length + 2);
  buf.writeInt32LE(4 + 4 + payload.length + 2, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  payload.copy(buf, 12);
  buf.writeUInt8(0, 12 + payload.length);
  buf.writeUInt8(0, 12 + payload.length + 1);
  return buf;
}

function readRconPackets(buf) {
  const packets = [];
  let offset = 0;
  while (offset + 4 <= buf.length) {
    const len = buf.readInt32LE(offset);
    if (offset + 4 + len > buf.length) break;
    const id   = buf.readInt32LE(offset + 4);
    const type = buf.readInt32LE(offset + 8);
    const body = buf.slice(offset + 12, offset + 4 + len - 2).toString("utf8");
    packets.push({ id, type, body });
    offset += 4 + len;
  }
  return { packets, remaining: buf.slice(offset) };
}

export async function rconExec(cmd) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let buf = Buffer.alloc(0);
    let authed = false;
    const AUTH_ID = 1;
    const EXEC_ID = 2;

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error(`rconExec timeout for: ${cmd}`));
    }, 5000);

    socket.connect(RCON_PORT, RCON_HOST, () => {
      socket.write(rconPacket(AUTH_ID, RCON_TYPE_AUTH, RCON_PASS));
    });

    socket.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const { packets, remaining } = readRconPackets(buf);
      buf = remaining;
      for (const pkt of packets) {
        if (!authed) {
          if (pkt.id === -1) {
            clearTimeout(timeout);
            socket.destroy();
            return reject(new Error("RCON authentication failed"));
          }
          authed = true;
          socket.write(rconPacket(EXEC_ID, RCON_TYPE_EXEC, cmd));
        } else if (pkt.type === RCON_TYPE_RESPONSE) {
          clearTimeout(timeout);
          socket.destroy();
          resolve(pkt.body);
        }
      }
    });

    socket.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`RCON socket error: ${err.message}`));
    });
  });
}

/** Read the bot's position from RCON. */
export async function readBotPosition(username = AGENT_BOT_NAME) {
  const result = await rconExec(`data get entity @p[name=${username}] Pos`);
  const m = result.match(/\[([-\d.e]+)d,\s*([-\d.e]+)d,\s*([-\d.e]+)d\]/);
  if (!m) throw new Error(`readBotPosition: cannot parse RCON: ${result}`);
  return { x: parseFloat(m[1]), y: parseFloat(m[2]), z: parseFloat(m[3]) };
}

/** Check if the bot is still online. */
export async function botIsOnline(username = AGENT_BOT_NAME) {
  try {
    const list = await rconExec("list");
    return list.includes(username);
  } catch {
    return false;
  }
}

/** Check an inventory slot via RCON. */
export async function readMainHand(username = AGENT_BOT_NAME) {
  const result = await rconExec(`data get entity @p[name=${username}] SelectedItem`);
  const m = result.match(/id:"([^"]+)"/);
  return m ? m[1] : null;
}

/** Check block type via RCON (execute if block). */
export async function checkBlock(x, y, z, type) {
  const fqType = type.includes(":") ? type : `minecraft:${type}`;
  const result = await rconExec(`execute if block ${x} ${y} ${z} ${fqType}`);
  return result.includes("Test passed");
}

// ---------- LLM / MCP call ----------

/**
 * Send a natural-language prompt to the model with the MCP server wired as a tool.
 * Returns the full Responses API JSON.
 */
export async function callLLM({ prompt, mcpUrl = AGENT_MCP_URL, model = AGENT_MODEL }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  if (!mcpUrl) throw new Error("AGENT_MCP_URL not set");

  const resp = await fetch(`${OPENAI_BASE_URL}/v1/responses`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions: [
        "You are controlling a Minecraft bot through MCP tools.",
        "When the user asks for an in-world action, make exactly one best-first MCP tool call before replying.",
        "Tool routing defaults: chat/say/announce->chat; break/mine/dig->dig; place/put down->place; hit/attack/whack/slap->attack; move/come/follow/look->move; use/sleep/eat/craft/right-click->use; inventory/equip/drop/take/deposit/open chest->inventory; status/where/health/what nearby/find->observe or status.",
        "Choose the most direct action tool; avoid preliminary observe calls unless the request is explicitly about reading/searching/status.",
        "If wording is vague (e.g., 'him', 'over there', 'come here'), still make the best direct tool call instead of asking a question.",
        "If the request is impossible or out-of-scope, do not call any MCP tool; reply with a brief refusal.",
        "Out-of-scope examples that require zero tool calls: private/whisper DM, memory/remember later, undo, waypoint, server seed, economy/coins, faction/chunk claim, ban/mute/admin commands, online player list/tab list, friend/party systems, real-life clock time, building an entire house from scratch.",
      ].join(" "),
      input: prompt,
      tools: [{ type: "mcp", server_label: "minecraft", server_url: mcpUrl, require_approval: "never" }],
      max_output_tokens: 1024,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "(unreadable)");
    throw new Error(`LLM call failed (${resp.status}): ${body}`);
  }
  return await resp.json();
}

/** Extract plain text from a Responses API response. */
export function extractText(resp) {
  return (resp.output || [])
    .flatMap(item => item.content || [])
    .filter(part => part.type === "output_text")
    .map(part => part.text)
    .join("\n");
}

/** Extract MCP tool calls made by the model. */
export function extractToolCalls(resp) {
  const calls = [];
  for (const item of resp.output || []) {
    for (const part of item.content || []) {
      if (part.type === "mcp_tool_call" || part.type === "tool_use") {
        calls.push({ name: part.name || part.tool_name, input: part.input || part.arguments });
      }
    }
    // Also check item-level tool_calls (different shape in some API versions)
    if (item.type === "tool_use" || item.type === "mcp_tool_call") {
      calls.push({ name: item.name, input: item.input });
    }
    // Responses API MCP shape (2024/2025): top-level output item type "mcp_call"
    if (item.type === "mcp_call") {
      let parsed = item.arguments;
      if (typeof parsed === "string") {
        try { parsed = JSON.parse(parsed); } catch { /* keep raw */ }
      }
      calls.push({ name: item.name, input: parsed });
    }
  }
  return calls;
}

// ---------- run artifact writer ----------

const RUNS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  ".runs"
);

let _runTs = null;
function runTimestamp() {
  if (!_runTs) _runTs = new Date().toISOString().replace(/[:.]/g, "-");
  return _runTs;
}

export async function writeRunArtifact(name, payload) {
  const dir = path.join(RUNS_DIR, runTimestamp());
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, `${name}.json`),
      JSON.stringify(payload, null, 2),
      "utf8"
    );
  } catch {
    // best-effort — never fail a test because artifact writing failed
  }
}

// ---------- soak runner (Option D) ----------

/**
 * Run `tasks.length` sequential LLM tasks through the MCP server.
 * Applies the Option D failure budget:
 *   Hard-fail: bot offline, ≥3 consecutive failures, p95 latency exceeded.
 *   Soft threshold: ≥ passPct% success rate.
 *
 * @param {Object} opts
 * @param {Array<{prompt: string, verify: () => Promise<boolean>, label: string}>} opts.tasks
 * @param {string} [opts.mcpUrl]
 * @param {number} [opts.passPct]
 * @param {number} [opts.p95MsCeiling]
 * @param {string} [opts.botName]
 * @returns {Promise<{passed: boolean, reason: string, results: Array}>}
 */
export async function runSoak({
  tasks,
  mcpUrl = AGENT_MCP_URL,
  passPct = SOAK_PASS_PCT,
  p95MsCeiling = SOAK_P95_MS,
  botName = AGENT_BOT_NAME,
} = {}) {
  const results = [];
  let consecutiveFails = 0;

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const start = Date.now();
    let taskResult = { label: task.label, passed: false, latencyMs: 0, reason: "" };

    // Hard-fail: bot online check before each task.
    const online = await botIsOnline(botName);
    if (!online) {
      taskResult.reason = "hard-fail: bot offline";
      results.push(taskResult);
      await writeRunArtifact(`${String(i + 1).padStart(2, "0")}-${task.label}`, taskResult);
      return {
        passed: false,
        reason: `hard-fail: bot went offline at task ${i + 1} (${task.label})`,
        results,
      };
    }

    let resp;
    try {
      resp = await callLLM({ prompt: task.prompt, mcpUrl });
      const latencyMs = Date.now() - start;
      taskResult.latencyMs = latencyMs;
      taskResult.response = extractText(resp);
      taskResult.toolCalls = extractToolCalls(resp);

      // Outcome verification.
      const passed = await task.verify(resp);
      taskResult.passed = passed;
      taskResult.reason = passed ? "ok" : "outcome verification failed";
    } catch (err) {
      taskResult.latencyMs = Date.now() - start;
      taskResult.passed = false;
      taskResult.reason = `error: ${err.message}`;
    }

    results.push(taskResult);
    await writeRunArtifact(`${String(i + 1).padStart(2, "0")}-${task.label}`, taskResult);

    if (taskResult.passed) {
      consecutiveFails = 0;
    } else {
      consecutiveFails++;
      // Hard-fail: 3 consecutive failures.
      if (consecutiveFails >= 3) {
        return {
          passed: false,
          reason: `hard-fail: 3 consecutive task failures ending at task ${i + 1} (${task.label})`,
          results,
        };
      }
    }
  }

  // p95 latency check.
  const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b);
  const p95Index = Math.floor(latencies.length * 0.95);
  const p95Ms = latencies[p95Index] ?? 0;
  if (p95Ms > p95MsCeiling) {
    return {
      passed: false,
      reason: `hard-fail: p95 latency ${p95Ms}ms exceeds ceiling ${p95MsCeiling}ms`,
      results,
    };
  }

  // Soft threshold.
  const passCount = results.filter(r => r.passed).length;
  const pct = (passCount / results.length) * 100;
  if (pct < passPct) {
    return {
      passed: false,
      reason: `soft-threshold: ${passCount}/${results.length} tasks passed (${pct.toFixed(1)}% < ${passPct}%)`,
      results,
    };
  }

  return {
    passed: true,
    reason: `${passCount}/${results.length} tasks passed (${pct.toFixed(1)}%), p95=${p95Ms}ms`,
    results,
  };
}

// ---------- corpus runner ----------

/**
 * Run a corpus of prompts through the LLM and assert first-tool accuracy.
 *
 * Assertion convention (set per-file via the `strict` flag on each prompt):
 *   strict: false (default) — assert tool NAME only (e.g. "status", "observe").
 *   strict: true            — assert tool name AND the action/target argument
 *                             (e.g. inventory must be called with action=inspect).
 *                             Used in E5 and E6 where the whole point is routing
 *                             to the correct action within a multi-action tool.
 *
 * @param {Array<{
 *   prompt: string,
 *   expectedTool: string,
 *   expectedAction?: string,
 *   strict?: boolean,
 *   style: string,
 *   fixture: string,
 *   setup?: () => Promise<void>,
 *   teardown?: () => Promise<void>,
 * }>} prompts
 * @param {Object} opts
 * @param {string}  [opts.label]       Label for artifact files (e.g. "status")
 * @param {number}  [opts.passPct=85]  Minimum pass percentage
 * @param {string}  [opts.mcpUrl]
 * @returns {Promise<{passed: boolean, reason: string, results: Array}>}
 */
export async function runCorpus(prompts, {
  label = "corpus",
  passPct = SOAK_PASS_PCT,
  mcpUrl = AGENT_MCP_URL,
} = {}) {
  const results = [];

  for (let i = 0; i < prompts.length; i++) {
    const item = prompts[i];
    const slug = `${String(i + 1).padStart(2, "0")}-${label}-${item.style}`;
    const result = {
      prompt: item.prompt,
      expectedTool: item.expectedTool,
      expectedAction: item.expectedAction ?? null,
      strict: item.strict ?? false,
      style: item.style,
      fixture: item.fixture,
      passed: false,
      actualTool: null,
      actualAction: null,
      reason: "",
      latencyMs: 0,
    };

    if (item.setup) {
      try { await item.setup(); } catch (err) {
        result.reason = `setup failed: ${err.message}`;
        results.push(result);
        await writeRunArtifact(slug, result);
        continue;
      }
    }

    const start = Date.now();
    try {
      const resp = await callLLM({ prompt: item.prompt, mcpUrl });
      result.latencyMs = Date.now() - start;
      const calls = extractToolCalls(resp);
      const first = calls[0];
      result.actualTool = first?.name ?? null;
      result.actualAction = first?.input?.action ?? first?.input?.target ?? null;

      if (!first) {
        result.reason = "no tool call made";
      } else if (result.actualTool !== item.expectedTool) {
        result.reason = `wrong tool: got "${result.actualTool}", expected "${item.expectedTool}"`;
      } else if (item.strict && item.expectedAction && result.actualAction !== item.expectedAction) {
        result.reason = `wrong action: got "${result.actualAction}", expected "${item.expectedAction}"`;
      } else {
        result.passed = true;
        result.reason = "ok";
      }
    } catch (err) {
      result.latencyMs = Date.now() - start;
      result.reason = `error: ${err.message}`;
    }

    if (item.teardown) {
      try { await item.teardown(); } catch { /* best-effort */ }
    }

    results.push(result);
    await writeRunArtifact(slug, result);
  }

  const passCount = results.filter(r => r.passed).length;
  const pct = (passCount / results.length) * 100;
  const passed = pct >= passPct;

  const summary = {
    label,
    total: results.length,
    passed: passCount,
    failed: results.length - passCount,
    pct: parseFloat(pct.toFixed(1)),
    threshold: passPct,
    byStyle: {},
    failures: results.filter(r => !r.passed).map(r => ({
      prompt: r.prompt,
      expected: r.strict ? `${r.expectedTool}(action=${r.expectedAction})` : r.expectedTool,
      actual: r.actualTool,
      reason: r.reason,
    })),
  };

  for (const r of results) {
    if (!summary.byStyle[r.style]) summary.byStyle[r.style] = { total: 0, passed: 0 };
    summary.byStyle[r.style].total++;
    if (r.passed) summary.byStyle[r.style].passed++;
  }

  await writeRunArtifact(`${label}-summary`, summary);

  return {
    passed,
    reason: passed
      ? `${passCount}/${results.length} (${pct.toFixed(1)}%) ≥ ${passPct}% threshold`
      : `${passCount}/${results.length} (${pct.toFixed(1)}%) < ${passPct}% threshold`,
    summary,
    results,
  };
}
