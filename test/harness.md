# Test Harness

Reusable instructions for every scenario run. Read this before executing any
file in `scenarios/`.

---

## Configuration

All values come from local `.env` (gitignored).

| Value | Variable | Description |
|---|---|---|
| Minecraft host | `MC_HOST` | usually `localhost` |
| Minecraft port | `MC_PORT` | usually `25565` |
| RCON host | `RCON_HOST` | usually `localhost` |
| RCON port | `RCON_PORT` | usually `25575` |
| RCON password | `RCON_PASSWORD` | local dev secret |
| P1 username | — | `MathTest-P1` |
| P2 username | — | `MathTest-P2` |
| P1 MCP endpoint | — | `http://127.0.0.1:18080/mcp` |
| P2 MCP endpoint | — | `http://127.0.0.1:18081/mcp` |
| P1 lockfile | — | `/tmp/mathtest-p1.lock` |
| P2 lockfile | — | `/tmp/mathtest-p2.lock` |

---

## Startup

### 1. Start local Minecraft server

```sh
docker compose -f docker-compose.dev.yaml up -d
```

Wait until logs show `Done (`:

```sh
docker logs mineflayer-mcp-dev --since=2m
```

### 2. Clear stale locks

```sh
rm -f /tmp/mathtest-p1.lock /tmp/mathtest-p2.lock
```

### 3. Start P1

```sh
node src/http.js \
  --host localhost --port 25565 \
  --username MathTest-P1 \
  --http-port 18080 --http-path /mcp --health-path /healthz \
  --lock /tmp/mathtest-p1.lock \
  --log-level debug
```

Health check:

```sh
curl -sf http://127.0.0.1:18080/healthz
```

### 4. Start P2

```sh
node src/http.js \
  --host localhost --port 25565 \
  --username MathTest-P2 \
  --http-port 18081 --http-path /mcp --health-path /healthz \
  --lock /tmp/mathtest-p2.lock \
  --log-level debug
```

Health check:

```sh
curl -sf http://127.0.0.1:18081/healthz
```

### 5. Verify both bots are in world

```sh
docker exec mineflayer-mcp-dev rcon-cli \
  --host 127.0.0.1 --port 25575 \
  --password "$RCON_PASSWORD" \
  "list"
```

### 6. Op test bots (only for world-write scenarios)

```sh
docker exec mineflayer-mcp-dev rcon-cli --host 127.0.0.1 --port 25575 --password "$RCON_PASSWORD" "/op MathTest-P1"
docker exec mineflayer-mcp-dev rcon-cli --host 127.0.0.1 --port 25575 --password "$RCON_PASSWORD" "/op MathTest-P2"
```

---

## Teardown

Always run teardown even on failures.

### 1. Deop test bots

```sh
docker exec mineflayer-mcp-dev rcon-cli --host 127.0.0.1 --port 25575 --password "$RCON_PASSWORD" "/deop MathTest-P1"
docker exec mineflayer-mcp-dev rcon-cli --host 127.0.0.1 --port 25575 --password "$RCON_PASSWORD" "/deop MathTest-P2"
```

### 2. Stop P1 and P2

Send SIGTERM or Ctrl-C where they are running.

### 3. Remove locks

```sh
rm -f /tmp/mathtest-p1.lock /tmp/mathtest-p2.lock
```

### 4. Stop local Minecraft server (optional)

```sh
docker compose -f docker-compose.dev.yaml down
```

---

## RCON reference

Template:

```sh
docker exec mineflayer-mcp-dev rcon-cli \
  --host 127.0.0.1 --port 25575 \
  --password "$RCON_PASSWORD" \
  "<command>"
```

Common commands:

| Purpose | Command |
|---|---|
| List players | `list` |
| Get entity position | `data get entity @a[name=MathTest-P1,limit=1] Pos` |
| Clear a region | `/fill x1 y1 z1 x2 y2 z2 minecraft:air` |
| Place a block | `/setblock x y z minecraft:stone` |
| Teleport bot | `/tp MathTest-P1 x y z` |
| Kill nearby mobs | `/kill @e[type=!player,distance=..20]` |
| Set day | `/time set day` |
| Clear weather | `/weather clear` |

---

## Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| Health endpoint not `ok` | Bot failed to connect | Check local server is up; inspect bot stderr |
| Only one test bot in `list` | One bot failed or lock conflict | Stop failed bot, clear lock, restart |
| RCON auth fails | Wrong password in `.env` | Update `RCON_PASSWORD`, retry |
| Frequent disconnects | Local resource contention | Increase Docker memory; close heavy workloads |
