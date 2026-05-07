// test/world/03-http.test.js
// Verifies HTTP transport: /healthz, tools/list, one tool call, session persistence.
// Prerequisites: docker compose -f docker-compose.dev.yaml up -d

import test from "node:test";
import assert from "node:assert/strict";

import {
  spawnHttpServer,
  connectHttpClient,
  waitForOutput,
} from "./_helpers.js";

test("HTTP: /healthz healthy, tools/list correct, tool call succeeds, session persists", async () => {
  const srv = await spawnHttpServer();
  let conn1, conn2;
  try {
    await waitForOutput(srv.child.stderr, "http.listening");

    // 1. /healthz
    const res = await fetch(`${srv.baseUrl}/healthz`);
    assert.equal(res.status, 200);
    assert.equal((await res.text()).trim(), "ok");

    // 2. tools/list via SDK client
    conn1 = await connectHttpClient(srv.baseUrl);
    const { tools } = await conn1.client.listTools();
    assert.equal(tools.length, 9);

    // 3. One real tool call — status — returns position+health.
    const result = await conn1.client.callTool({ name: "status", arguments: {} });
    assert.ok(!result.isError, "status tool returned error");
    const payload = JSON.parse(result.content[0].text);
    assert.equal(typeof payload.position.x, "number");
    assert.equal(typeof payload.health, "number");

    // 4. /healthz still healthy after tool call.
    const res2 = await fetch(`${srv.baseUrl}/healthz`);
    assert.equal(res2.status, 200);

    // 5. Second independent session shares the same bot (one-bot invariant).
    conn2 = await connectHttpClient(srv.baseUrl);
    const result2 = await conn2.client.callTool({ name: "status", arguments: {} });
    const payload2 = JSON.parse(result2.content[0].text);
    // Both sessions should see the same position (same bot).
    assert.ok(
      Math.abs(payload.position.x - payload2.position.x) < 1,
      "second session returned different bot position — one-bot invariant broken"
    );
  } finally {
    try { await conn1?.transport?.close?.(); } catch { /* ignore */ }
    try { await conn2?.transport?.close?.(); } catch { /* ignore */ }
    await srv.close();
  }
}, { timeout: 60000 });
