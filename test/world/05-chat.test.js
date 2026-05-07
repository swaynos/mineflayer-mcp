// test/world/05-chat.test.js
// Verifies: chat tool sends a message visible in RCON console log.
// Uses observe(chat) as the oracle — the bot reads its own outgoing messages
// from its ring buffer (outgoing messages are pushed locally).
// Prerequisites: docker compose -f docker-compose.dev.yaml up -d

import test from "node:test";
import assert from "node:assert/strict";

import {
  connectStdioClient,
  sleep,
} from "./_helpers.js";

test("chat tool sends a message and observe(chat) reflects it", async () => {
  const { client, close } = await connectStdioClient();
  try {
    const marker = `ping-${Date.now()}`;

    const sendResult = await client.callTool({
      name: "chat",
      arguments: { message: marker },
    });
    assert.ok(!sendResult.isError, `chat returned error: ${sendResult.content[0].text}`);
    const sendPayload = JSON.parse(sendResult.content[0].text);
    assert.equal(sendPayload.ok, true);
    assert.equal(sendPayload.sent, marker);

    // Give the server's chat buffer a moment to register the outgoing message.
    await sleep(400);

    const observeResult = await client.callTool({
      name: "observe",
      arguments: { target: "chat", limit: 10 },
    });
    assert.ok(!observeResult.isError, `observe(chat) returned error`);
    const chatPayload = JSON.parse(observeResult.content[0].text);
    const found = chatPayload.messages.some(m => m.message === marker);
    assert.ok(found, `sent message "${marker}" not found in chat buffer: ${JSON.stringify(chatPayload.messages)}`);
  } finally {
    await close();
  }
}, { timeout: 40000 });
