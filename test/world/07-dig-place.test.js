// test/world/07-dig-place.test.js
// Verifies: dig turns a known block to air (RCON-verified).
//           place turns air into the expected block (RCON-verified, with RCON-given item).
// Prerequisites: docker compose -f docker-compose.dev.yaml up -d

import test from "node:test";
import assert from "node:assert/strict";

import {
  connectStdioClient,
  rconExec,
  setBlock,
  assertBlock,
  assertAir,
  giveItem,
  resetWorld,
  sleep,
} from "./_helpers.js";

test("dig removes a known block (RCON-verified)", async () => {
  const { client, close, username } = await connectStdioClient();
  try {
    await resetWorld(username);
    // Use z=50 area. Build a small platform so the bot can stand and dig forward.
    // Use /fill to set blocks atomically and fast.
    await rconExec("fill 10 64 50 12 64 52 minecraft:stone");
    await rconExec("fill 10 65 50 12 67 52 minecraft:air");
    await sleep(200);

    // Target block: 11,65,52 — place stone there.
    await setBlock(11, 65, 52, "minecraft:stone");
    await sleep(200);

    // TP bot to stand on platform facing +Z.
    await rconExec(`tp ${username} 11 65 50 0 0`);
    await sleep(600);

    // Confirm setup.
    await assertBlock(11, 65, 52, "stone");

    // Dig dz=2 (two blocks in front).
    const result = await client.callTool({
      name: "dig",
      arguments: { dx: 0, dy: 0, dz: 2 },
    });
    assert.ok(!result.isError, `dig returned error: ${result.content[0].text}`);
    await sleep(600);

    // Confirm block is now air.
    await assertAir(11, 65, 52);
  } finally {
    await rconExec("fill 10 64 50 12 67 52 minecraft:air").catch(() => {});
    await close();
  }
}, { timeout: 60000 });

test("place puts a held block at target position (RCON-verified)", async () => {
  const { client, close, username } = await connectStdioClient();
  try {
    await resetWorld(username);
    // Build a clean 3×3 stone platform at y=64, clear y=65–67 above it.
    await rconExec("fill 48 64 48 52 64 52 minecraft:stone");
    await rconExec("fill 48 65 48 52 67 52 minecraft:air");
    await sleep(200);

    // Place a reference surface at 50,64,53 and clear the target 50,65,53.
    await setBlock(50, 64, 53, "minecraft:stone");
    await setBlock(50, 65, 53, "minecraft:air");
    await sleep(200);

    // TP bot to stand on platform.
    await rconExec(`tp ${username} 50 65 50 0 0`);
    await sleep(800);

    // Give the bot dirt and equip it.
    await giveItem(username, "dirt", 4);
    await sleep(300);

    const equipResult = await client.callTool({
      name: "inventory",
      arguments: { action: "equip", name: "dirt", destination: "hand" },
    });
    assert.ok(!equipResult.isError, `equip returned error: ${equipResult.content[0].text}`);

    // Place at dz=3 (bot at 50,65,50 → target 50,65,53).
    const placeResult = await client.callTool({
      name: "place",
      arguments: { dx: 0, dy: 0, dz: 3 },
    });
    assert.ok(!placeResult.isError, `place returned error: ${placeResult.content[0].text}`);
    await sleep(600);

    // Confirm block appeared at 50,65,53 via RCON.
    await assertBlock(50, 65, 53, "dirt");
  } finally {
    await rconExec("fill 48 64 48 52 67 53 minecraft:air").catch(() => {});
    await close();
  }
}, { timeout: 60000 });
