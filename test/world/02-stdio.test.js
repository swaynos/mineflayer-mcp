// test/world/02-stdio.test.js
// Verifies stdout-safety invariant: every byte on stdout from the stdio MCP server
// is valid JSON-RPC 2.0. Any non-JSON or non-JSON-RPC line is a test failure.
// Prerequisites: docker compose -f docker-compose.dev.yaml up -d

import test from "node:test";
import assert from "node:assert/strict";
import { createInterface } from "node:readline";

import {
  spawnStdioServer,
  waitForOutput,
  sleep,
} from "./_helpers.js";

test("stdio stdout contains only valid JSON-RPC 2.0 lines", async () => {
  const srv = spawnStdioServer();

  // Collect stdout lines while the server is running.
  const stdoutLines = [];
  const rl = createInterface({ input: srv.stdout, crlfDelay: Infinity });
  rl.on("line", (line) => { if (line.trim()) stdoutLines.push(line); });

  // Wait for bot + MCP server to be ready.
  await waitForOutput(srv.stderr, "mcp.server.connected");

  // Simulate a real MCP client interaction by writing a raw tools/list request.
  // The server will respond on stdout.
  const initRequest = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "0.0.1" },
    },
  });
  const listRequest = JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });

  srv.stdin.write(initRequest + "\n");
  await sleep(300);
  srv.stdin.write(listRequest + "\n");
  await sleep(500);

  await srv.close();
  rl.close();

  // Assert every collected stdout line is JSON-RPC 2.0.
  assert.ok(stdoutLines.length > 0, "expected at least one stdout line from server");
  for (const line of stdoutLines) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      assert.fail(`stdout-safety violation: non-JSON line on stdout: ${JSON.stringify(line)}`);
    }
    assert.equal(
      parsed.jsonrpc,
      "2.0",
      `stdout-safety violation: line is JSON but not JSON-RPC 2.0: ${line}`
    );
  }
}, { timeout: 40000 });
