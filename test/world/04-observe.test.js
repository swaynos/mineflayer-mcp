// test/world/04-observe.test.js
// Verifies observe tool: position matches RCON; blocks finds RCON-placed block;
// entities sees RCON-summoned entity.
// Prerequisites: docker compose -f docker-compose.dev.yaml up -d

import test from "node:test";
import assert from "node:assert/strict";

import {
  connectStdioClient,
  rconExec,
  readPosition,
  setBlock,
  assertBlock,
  assertAir,
  summonEntity,
  killTagged,
  resetWorld,
} from "./_helpers.js";

test("observe(position) matches RCON-read position within 2 blocks", async () => {
  const { client, close, username } = await connectStdioClient();
  try {
    const result = await client.callTool({ name: "observe", arguments: { target: "position" } });
    assert.ok(!result.isError, `observe returned error: ${result.content[0].text}`);
    const mcpPos = JSON.parse(result.content[0].text);

    const rconPos = await readPosition(username);
    assert.ok(Math.abs(mcpPos.x - rconPos.x) <= 2, `x mismatch: mcp=${mcpPos.x} rcon=${rconPos.x}`);
    assert.ok(Math.abs(mcpPos.z - rconPos.z) <= 2, `z mismatch: mcp=${mcpPos.z} rcon=${rconPos.z}`);
  } finally {
    await close();
  }
}, { timeout: 40000 });

test("observe(blocks) finds a block RCON just placed", async () => {
  const { client, close, username } = await connectStdioClient();
  try {
    await resetWorld(username);
    // Teleport bot to a known position so the test block is close.
    await rconExec(`tp ${username} 0 64 0`);
    // Wait for bot to arrive.
    await new Promise(r => setTimeout(r, 800));

    // Place a distinctive block right next to the bot.
    await setBlock(1, 64, 0, "minecraft:gold_block");
    // Wait for the chunk data to propagate to the bot.
    await new Promise(r => setTimeout(r, 1500));

    const result = await client.callTool({
      name: "observe",
      arguments: { target: "blocks", blockTypes: ["gold_block"], maxDistance: 16 },
    });
    assert.ok(!result.isError, `observe returned error: ${result.content[0].text}`);
    const payload = JSON.parse(result.content[0].text);
    assert.ok(payload.count > 0, "expected at least one gold_block near bot");
    // Verify via RCON that the block we expect is there.
    await assertBlock(1, 64, 0, "gold_block");
  } finally {
    await setBlock(1, 64, 0, "minecraft:air").catch(() => {});
    await close();
  }
}, { timeout: 50000 });

test("observe(entities) sees an RCON-summoned pig", async () => {
  const { client, close, username } = await connectStdioClient();
  try {
    await rconExec(`tp ${username} 0 64 0`);
    await new Promise(r => setTimeout(r, 800));
    await summonEntity("pig", 1, 64, 0, "observe_test_pig");

    const result = await client.callTool({
      name: "observe",
      arguments: { target: "entities", maxDistance: 16 },
    });
    assert.ok(!result.isError, `observe returned error: ${result.content[0].text}`);
    const payload = JSON.parse(result.content[0].text);
    const hasPig = payload.entities.some(e =>
      (typeof e.type === "string" && e.type.toLowerCase().includes("pig")) ||
      (typeof e.name === "string" && e.name.toLowerCase().includes("pig"))
    );
    assert.ok(hasPig, `no pig in entity list: ${JSON.stringify(payload.entities)}`);
  } finally {
    await killTagged("observe_test_pig").catch(() => {});
    await close();
  }
}, { timeout: 50000 });
