# Test Harness

Reusable instructions for every scenario run. Read this before executing any
file in `scenarios/`. The harness is the same regardless of which scenario is
being run — only the scenario steps change.

---

## Configuration

All values below come from
`opencode/context/MathInstance/secrets.env` (gitignored).

| Value | Variable | Description |
|---|---|---|
| Minecraft host | — | `callisto` |
| Minecraft port | — | `1234` |
| RCON host | `MATH_RCON_HOST` | `callisto` |
| RCON port | `MATH_RCON_PORT` | `25576` |
| RCON password | `MATH_RCON_PASSWORD` | See `secrets.env` |
| P1 username | — | `MathTest-P1` |
| P2 username | — | `MathTest-P2` |
| P1 MCP endpoint | — | `http://127.0.0.1:18080/mcp` |
| P2 MCP endpoint | — | `http://127.0.0.1:18081/mcp` |
| P1 lockfile | — | `/tmp/mathtest-p1.lock` |
| P2 lockfile | — | `/tmp/mathtest-p2.lock` |

---

## Startup

### 1. Clear any stale locks

```sh
rm -f /tmp/mathtest-p1.lock /tmp/mathtest-p2.lock
```

### 2. Start P1

```sh
node src/http.js \
  --host callisto --port 1234 \
  --username MathTest-P1 \
  --http-port 18080 --http-path /mcp --health-path /healthz \
  --lock /tmp/mathtest-p1.lock \
  --log-level debug
```

Wait until the health endpoint responds before proceeding:

```sh
curl -sf http://127.0.0.1:18080/healthz   # → ok
```

### 3. Start P2

```sh
node src/http.js \
  --host callisto --port 1234 \
  --username MathTest-P2 \
  --http-port 18081 --http-path /mcp --health-path /healthz \
  --lock /tmp/mathtest-p2.lock \
  --log-level debug
```

Wait until healthy:

```sh
curl -sf http://127.0.0.1:18081/healthz   # → ok
```

### 4. Verify both bots are in the world

```sh
ssh callisto "docker exec Math rcon-cli \
  --host 127.0.0.1 --port 25575 \
  --password <MATH_RCON_PASSWORD> \
  'list'"
# → There are 3 of a max of 20 players online: MathBridgeBot, MathTest-P1, MathTest-P2
```

All three should appear. If a test bot is missing, check its process logs
before proceeding.

### 5. Op the test bots

```sh
ssh callisto "docker exec Math rcon-cli \
  --host 127.0.0.1 --port 25575 \
  --password <MATH_RCON_PASSWORD> \
  '/op MathTest-P1'"

ssh callisto "docker exec Math rcon-cli \
  --host 127.0.0.1 --port 25575 \
  --password <MATH_RCON_PASSWORD> \
  '/op MathTest-P2'"
```

Only required for scenarios that involve world-write actions (T3+). Skip for
T1 and T2.

---

## Teardown

Always run teardown, even if the scenario fails.

### 1. Deop the test bots

```sh
ssh callisto "docker exec Math rcon-cli \
  --host 127.0.0.1 --port 25575 \
  --password <MATH_RCON_PASSWORD> \
  '/deop MathTest-P1'"

ssh callisto "docker exec Math rcon-cli \
  --host 127.0.0.1 --port 25575 \
  --password <MATH_RCON_PASSWORD> \
  '/deop MathTest-P2'"
```

### 2. Stop P1 and P2

Send SIGTERM to each process (or Ctrl-C if running in foreground). The
processes exit cleanly; mineflayer disconnects gracefully.

### 3. Remove locks

```sh
rm -f /tmp/mathtest-p1.lock /tmp/mathtest-p2.lock
```

### 4. Confirm bots left the world

```sh
ssh callisto "docker logs Math --since=30s 2>&1 | grep -E 'MathTest'"
# → MathTest-P1 left the game
# → MathTest-P2 left the game
```

---

## RCON reference

All RCON commands are run via:

```sh
ssh callisto "docker exec Math rcon-cli \
  --host 127.0.0.1 --port 25575 \
  --password <MATH_RCON_PASSWORD> \
  '<command>'"
```

Common commands used across scenarios:

| Purpose | Command |
|---|---|
| List online players | `list` |
| Get entity position | `data get entity @a[name=MathTest-P1,limit=1] Pos` |
| Clear a region | `/fill x1 y1 z1 x2 y2 z2 minecraft:air` |
| Place a block | `/setblock x y z minecraft:stone` |
| Teleport a bot | `/tp MathTest-P1 x y z` |
| Kill nearby mobs | `/kill @e[type=!player,distance=..20]` |
| Set time to day | `/time set day` |
| Clear weather | `/weather clear` |

---

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| Health endpoint never returns `ok` | Bot failed to connect to `callisto:1234` | Check `callisto` is reachable; check for macOS smoke-test bug (D-1) |
| Only 2 players in `list` | One test bot didn't connect | Check that bot's stderr for error; clear lock and retry |
| RCON auth fails | Password rotated (happens on container recreate) | Re-read `secrets.env`; check `callisto:~/Documents/minecraft/Math/.rcon-cli.env` |
| `MathBridgeBot` kicked | Duplicate-login (another production process started) | Check `nyx` systemd; this harness should not affect `MathBridgeBot` |

---

## Chat noise

P1 and P2 share the world with `MathBridgeBot`. Their public chat is visible
to the Discord bridge and will appear in `#bot-minecraft`.

- Use RCON (`/tell`) for harness-internal coordination — it does not flow
  through the public chat stream.
- Prefix any test chat that must go through the public channel with `[TEST]`.
- Schedule test runs outside active Discord use where possible.
