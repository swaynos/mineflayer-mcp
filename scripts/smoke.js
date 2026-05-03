#!/usr/bin/env node
// scripts/smoke.js
// Local smoke test: spawn our MCP server as a child and exercise all 4 tools.
// Prints PASS/FAIL per step and appends JSON-RPC exchanges to smoke.log.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const LOG_PATH = path.join(REPO_ROOT, "smoke.log");

const MC_HOST = process.env.MC_HOST || "callisto";
const MC_PORT = process.env.MC_PORT || "1234";
const MC_USER = process.env.MC_USER || "MathBridgeBot-Smoke";
const LOCK = process.env.MC_LOCK || "/tmp/mathbridgebot-smoke.lock";

const results = [];
let exitCode = 0;

function pass(step, info) {
  console.log(`PASS  ${step}${info ? `  ${info}` : ""}`);
  results.push({ step, status: "PASS", info: info ?? null });
}
function fail(step, info) {
  console.log(`FAIL  ${step}${info ? `  ${info}` : ""}`);
  results.push({ step, status: "FAIL", info: info ?? null });
  exitCode = 1;
}

async function logExchange(entry) {
  try {
    await appendFile(LOG_PATH, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // best-effort
  }
}

function parseToolText(result) {
  // Our server always returns { content: [{ type: "text", text: "<json>" }] }
  // or { isError: true, content: [{ type: "text", text: '{"error":...}' }] }
  const first = result?.content?.[0];
  if (!first || first.type !== "text") return { parsed: null, text: null };
  let parsed;
  try { parsed = JSON.parse(first.text); } catch { parsed = null; }
  return { parsed, text: first.text };
}

async function main() {
  await writeFile(LOG_PATH, `# smoke.log — ${new Date().toISOString()}\n`, "utf8");
  await logExchange({
    ts: new Date().toISOString(),
    event: "start",
    host: MC_HOST,
    port: MC_PORT,
    user: MC_USER,
    lock: LOCK,
  });

  const serverScript = path.join(REPO_ROOT, "src", "index.js");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      serverScript,
      "--host", MC_HOST,
      "--port", String(MC_PORT),
      "--username", MC_USER,
      "--lock", LOCK,
      "--log-level", "info",
    ],
    env: { ...process.env },
    stderr: "pipe",
  });

  // Pipe child stderr to our stderr so we see mineflayer logs.
  if (transport.stderr) {
    transport.stderr.on("data", (buf) => {
      process.stderr.write(buf);
    });
  }

  const client = new Client(
    { name: "minecraft-mcp-smoke", version: "0.1.0" },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);
    await logExchange({ ts: new Date().toISOString(), event: "connected" });
    pass("connect");
  } catch (err) {
    await logExchange({ ts: new Date().toISOString(), event: "connect.error", err: String(err?.message ?? err) });
    fail("connect", String(err?.message ?? err));
    process.exit(1);
  }

  // tools/list
  try {
    const listed = await client.listTools();
    await logExchange({ ts: new Date().toISOString(), event: "tools/list", result: listed });
    const names = (listed?.tools ?? []).map((t) => t.name).sort();
    const expected = ["chat", "find_blocks", "get_position", "inspect_inventory"];
    if (JSON.stringify(names) === JSON.stringify(expected)) {
      pass("tools/list", `got ${names.join(",")}`);
    } else {
      fail("tools/list", `got ${JSON.stringify(names)} expected ${JSON.stringify(expected)}`);
    }
  } catch (err) {
    await logExchange({ ts: new Date().toISOString(), event: "tools/list.error", err: String(err?.message ?? err) });
    fail("tools/list", String(err?.message ?? err));
  }

  // tools/call chat
  const token = `SMOKE_TEST_${Date.now()}`;
  try {
    const res = await client.callTool({ name: "chat", arguments: { message: token } });
    await logExchange({ ts: new Date().toISOString(), event: "tools/call.chat", result: res });
    if (res.isError) {
      fail("tools/call chat", `server returned error: ${parseToolText(res).text}`);
    } else {
      pass("tools/call chat", `token=${token}`);
    }
  } catch (err) {
    await logExchange({ ts: new Date().toISOString(), event: "tools/call.chat.error", err: String(err?.message ?? err) });
    fail("tools/call chat", String(err?.message ?? err));
  }

  // tools/call get_position
  try {
    const res = await client.callTool({ name: "get_position", arguments: {} });
    await logExchange({ ts: new Date().toISOString(), event: "tools/call.get_position", result: res });
    const { parsed, text } = parseToolText(res);
    if (res.isError) {
      fail("tools/call get_position", `server returned error: ${text}`);
    } else if (parsed && Number.isFinite(parsed.x) && Number.isFinite(parsed.y) && Number.isFinite(parsed.z)) {
      pass("tools/call get_position", `x=${parsed.x} y=${parsed.y} z=${parsed.z}`);
    } else {
      fail("tools/call get_position", `unexpected shape: ${text}`);
    }
  } catch (err) {
    await logExchange({ ts: new Date().toISOString(), event: "tools/call.get_position.error", err: String(err?.message ?? err) });
    fail("tools/call get_position", String(err?.message ?? err));
  }

  // tools/call find_blocks
  try {
    const res = await client.callTool({
      name: "find_blocks",
      arguments: { blockTypes: ["stone", "dirt", "grass_block"], maxDistance: 16, maxCount: 3 },
    });
    await logExchange({ ts: new Date().toISOString(), event: "tools/call.find_blocks", result: res });
    const { parsed, text } = parseToolText(res);
    if (res.isError) {
      fail("tools/call find_blocks", `server returned error: ${text}`);
    } else if (parsed && Array.isArray(parsed.blocks)) {
      pass("tools/call find_blocks", `count=${parsed.count}`);
    } else {
      fail("tools/call find_blocks", `unexpected shape: ${text}`);
    }
  } catch (err) {
    await logExchange({ ts: new Date().toISOString(), event: "tools/call.find_blocks.error", err: String(err?.message ?? err) });
    fail("tools/call find_blocks", String(err?.message ?? err));
  }

  // tools/call inspect_inventory
  try {
    const res = await client.callTool({ name: "inspect_inventory", arguments: {} });
    await logExchange({ ts: new Date().toISOString(), event: "tools/call.inspect_inventory", result: res });
    const { parsed, text } = parseToolText(res);
    if (res.isError) {
      fail("tools/call inspect_inventory", `server returned error: ${text}`);
    } else if (parsed && Array.isArray(parsed.items)) {
      pass("tools/call inspect_inventory", `count=${parsed.count}`);
    } else {
      fail("tools/call inspect_inventory", `unexpected shape: ${text}`);
    }
  } catch (err) {
    await logExchange({ ts: new Date().toISOString(), event: "tools/call.inspect_inventory.error", err: String(err?.message ?? err) });
    fail("tools/call inspect_inventory", String(err?.message ?? err));
  }

  try { await client.close(); } catch { /* ignore */ }
  try { await transport.close(); } catch { /* ignore */ }
  await logExchange({ ts: new Date().toISOString(), event: "done", results });

  console.log("");
  console.log(`Summary: ${results.filter(r => r.status === "PASS").length}/${results.length} passed`);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(`smoke fatal: ${err?.stack ?? err}`);
  process.exit(1);
});
