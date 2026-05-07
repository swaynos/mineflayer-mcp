// test/world/08-inventory-status.test.js
// Verifies: inventory(inspect) reflects RCON-given items; status position/health
// match RCON; inventory(equip) puts item in main hand (RCON-verified).
// Prerequisites: docker compose -f docker-compose.dev.yaml up -d

import test from "node:test";
import assert from "node:assert/strict";

import {
  connectStdioClient,
  rconExec,
  readPosition,
  giveItem,
  resetWorld,
  sleep,
} from "./_helpers.js";

test("inventory(inspect) reflects RCON-given item", async () => {
  const { client, close, username } = await connectStdioClient();
  try {
    await resetWorld(username);
    await giveItem(username, "iron_sword", 1);
    await sleep(400);

    const result = await client.callTool({
      name: "inventory",
      arguments: { action: "inspect" },
    });
    assert.ok(!result.isError, `inventory(inspect) returned error: ${result.content[0].text}`);
    const payload = JSON.parse(result.content[0].text);
    const hasSword = payload.items.some(i => i.name?.includes("iron_sword") || i.type?.includes("iron_sword"));
    assert.ok(hasSword, `iron_sword not found in inventory: ${JSON.stringify(payload.items)}`);
  } finally {
    await close();
  }
}, { timeout: 40000 });

test("status position and health agree with RCON", async () => {
  const { client, close, username } = await connectStdioClient();
  try {
    // Teleport to a known position.
    await rconExec(`tp ${username} 10 64 -10`);
    await sleep(800);

    const result = await client.callTool({ name: "status", arguments: {} });
    assert.ok(!result.isError, `status returned error: ${result.content[0].text}`);
    const payload = JSON.parse(result.content[0].text);

    // Position check vs RCON.
    const rconPos = await readPosition(username);
    assert.ok(Math.abs(payload.position.x - rconPos.x) <= 2, `x mismatch: mcp=${payload.position.x} rcon=${rconPos.x}`);
    assert.ok(Math.abs(payload.position.z - rconPos.z) <= 2, `z mismatch: mcp=${payload.position.z} rcon=${rconPos.z}`);

    // Health sanity.
    assert.ok(payload.health >= 0 && payload.health <= 20, `health out of range: ${payload.health}`);
    assert.ok(payload.food >= 0 && payload.food <= 20, `food out of range: ${payload.food}`);
  } finally {
    await close();
  }
}, { timeout: 40000 });

test("inventory(equip) puts item in main hand", async () => {
  const { client, close, username } = await connectStdioClient();
  try {
    await resetWorld(username);
    await giveItem(username, "golden_sword", 1);
    await sleep(400);

    const result = await client.callTool({
      name: "inventory",
      arguments: { action: "equip", name: "golden_sword", destination: "hand" },
    });
    assert.ok(!result.isError, `equip returned error: ${result.content[0].text}`);
    await sleep(300);

    // Verify via RCON: /data get entity @p[name=…] SelectedItem
    const rconResult = await rconExec(`data get entity @p[name=${username}] SelectedItem`);
    assert.ok(
      rconResult.includes("golden_sword"),
      `golden_sword not in main hand per RCON: ${rconResult}`
    );
  } finally {
    await close();
  }
}, { timeout: 40000 });
