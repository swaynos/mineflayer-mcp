// test/world/01-health.test.js
// Verifies: RCON reachable; HTTP /healthz responds; MCP tools/list returns 9 tools
// via both stdio and HTTP transports.
// Prerequisites: docker compose -f docker-compose.dev.yaml up -d

import test from "node:test";
import assert from "node:assert/strict";

import {
  spawnHttpServer,
  connectStdioClient,
  connectHttpClient,
  waitForOutput,
  rconExec,
} from "./_helpers.js";

const EXPECTED_TOOLS = ["attack","chat","dig","inventory","move","observe","place","status","use"];

test("rcon is reachable and server responds to /list", async () => {
  const response = await rconExec("list");
  assert.ok(typeof response === "string", "RCON returned a string response");
  assert.match(response, /players online/i);
});

test("stdio transport: bot spawns and tools/list returns all 9 tools", async () => {
  const { client, close } = await connectStdioClient();
  try {
    const { tools } = await client.listTools();
    assert.equal(tools.length, 9, `expected 9 tools, got ${tools.length}`);
    const names = tools.map(t => t.name).sort();
    assert.deepEqual(names, EXPECTED_TOOLS);
  } finally {
    await close();
  }
}, { timeout: 40000 });

test("HTTP transport: /healthz returns 200 and tools/list returns all 9 tools", async () => {
  const srv = await spawnHttpServer();
  let conn;
  try {
    await waitForOutput(srv.child.stderr, "http.listening");
    const res = await fetch(`${srv.baseUrl}/healthz`);
    assert.equal(res.status, 200);
    assert.equal((await res.text()).trim(), "ok");

    conn = await connectHttpClient(srv.baseUrl);
    const { tools } = await conn.client.listTools();
    assert.equal(tools.length, 9);
    const names = tools.map(t => t.name).sort();
    assert.deepEqual(names, EXPECTED_TOOLS);
  } finally {
    try { await conn?.transport?.close?.(); } catch { /* ignore */ }
    await srv.close();
  }
}, { timeout: 40000 });
