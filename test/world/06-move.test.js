// test/world/06-move.test.js
// Verifies: move(to=…) changes bot position, confirmed via RCON.
// Uses a short hop to avoid pathing complexity.
// Prerequisites: docker compose -f docker-compose.dev.yaml up -d

import test from "node:test";
import assert from "node:assert/strict";

import {
  connectStdioClient,
  rconExec,
  readPosition,
  resetWorld,
  sleep,
} from "./_helpers.js";

test("move(to) reaches target position within 3 blocks (RCON-verified)", async () => {
  const { client, close, username } = await connectStdioClient();
  try {
    await resetWorld(username);
    await rconExec("fill -2 63 -2 8 63 2 minecraft:stone");
    await rconExec("fill -2 64 -2 8 70 2 minecraft:air");
    // Teleport bot to a known flat start position.
    await rconExec(`tp ${username} 0 64 0`);
    await sleep(800);

    // Target: 5 blocks away on flat ground.
    const targetX = 5, targetY = 64, targetZ = 0;
    const result = await client.callTool({
      name: "move",
      arguments: { mode: "to", x: targetX, y: targetY, z: targetZ, tolerance: 2, timeoutMs: 30000 },
    });
    assert.ok(!result.isError, `move returned error: ${result.content[0].text}`);

    // Verify via RCON.
    const pos = await readPosition(username);
    const dist = Math.sqrt(
      (pos.x - targetX) ** 2 + (pos.z - targetZ) ** 2
    );
    assert.ok(dist <= 3, `bot ended up ${dist.toFixed(2)} blocks from target (expected ≤ 3)`);
  } finally {
    await close();
  }
}, { timeout: 60000 });
