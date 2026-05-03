# T1 — Chat

**Tier:** 1 — Observation  
**Status:** Blocked on `read_recent_chat` tool (M1, priority 1 in `SPEC.md`)  
**Tests:** `chat` (invoker), `read_recent_chat` (tester)

---

## Overview

P1 sends a uniquely-nonce'd chat message into the world. P2 reads its recent
chat buffer and asserts the message appears. RCON confirms the line exists in
the server log.

This is the simplest possible end-to-end scenario — one bot writes, one bot
reads, the server confirms. It validates the full MCP call path for both the
write-side (`chat`) and the read-side (`read_recent_chat`) tools.

---

## Prerequisites

- Both `chat` and `read_recent_chat` tools are present in `src/tools.js` and
  pass `assertCompleteness()`.
- Both MCP processes are running and healthy (see `harness.md` — Startup
  steps 1–4; skip step 5, no op required for this scenario).

---

## Setup

1. Generate a unique nonce to avoid false positives from prior chat history:
   ```
   nonce = "T1-" + Date.now()   // e.g. "T1-1746387600000"
   ```
2. Via RCON, clear the world of hostile mobs near spawn to reduce log noise:
   ```
   /kill @e[type=!player,distance=..32]
   /time set day
   /weather clear
   ```

---

## Invoker steps (P1)

Call via P1's MCP endpoint (`http://127.0.0.1:18080/mcp`):

1. Call `chat` with `message = <nonce>`.
2. Expected return: `{ "ok": true, "sent": "<nonce>" }`.
3. Record the timestamp of the call (used as `since` in the tester step).

---

## Tester assertions (P2)

Call via P2's MCP endpoint (`http://127.0.0.1:18081/mcp`):

1. Call `read_recent_chat` with `since = <timestamp from invoker step>`.
2. Assert the response contains an entry where:
   - `username` is `MathTest-P1`, and
   - `message` is exactly `<nonce>`.
3. Assert the entry's timestamp is within 10 seconds of the invoker call.

---

## RCON verification

```sh
ssh callisto "docker logs Math --since=60s 2>&1 | grep '<MathTest-P1>'"
```

Expected output contains:
```
[HH:MM:SS] [Not Secure] <MathTest-P1> T1-<nonce>
```

The server log is the authoritative source. If this line is absent, the chat
tool did not actually send — regardless of what P1's tool return said.

---

## Pass criteria

All three must be true:

1. P1's `chat` call returned `{ "ok": true, "sent": "<nonce>" }`.
2. P2's `read_recent_chat` response included the nonce message from `MathTest-P1`.
3. RCON / docker logs confirmed the line in the server log.

If any one of the three fails, the scenario fails.

---

## Teardown

Follow `harness.md` — Teardown. No world state was modified; no cleanup of
blocks or entities required beyond stopping the bots and removing locks.

---

## Known limitations

- `read_recent_chat` does not exist yet. This scenario is a specification for
  the tool's expected interface, not a runnable test. Once the tool is built,
  run this scenario to validate it.
- P1 and P2 share the chat stream with `MathBridgeBot`. If `MathBridgeBot`
  or a human player sends a message between the invoker call and the tester
  read, those messages will appear in the buffer but should not affect the
  nonce assertion.
