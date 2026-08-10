# WZK5 Multiplayer Server

Colyseus-based authoritative server for online races (8-16 players) and MMO hub world (100+ players, sharded).

## Architecture

- **LobbyRoom** — Pre-game lobby, matchmaking, chat
- **RaceRoom** — Authoritative physics at 60Hz, state patches at 20Hz, client-side prediction with server reconciliation
- **HubRoom** — MMO hub world, interest-managed (players only see others within 100m), spatial chat (20m radius)

## Setup

```bash
cd server
npm install
npm start
```

Server runs on `http://localhost:8080`.

## Deployment

### Railway
```bash
railway init
railway up
```

### Fly.io
```bash
fly launch
fly deploy
```

### Render
Connect repo, set start command to `cd server && npm install && npm start`.

## Redis (for MMO persistence)

HubRoom uses Redis for persistent player state (inventory, progression, position across sessions).

```bash
# Local Redis
docker run -p 6379:6379 redis

# Production: Upstash, Redis Cloud, or Railway Redis
```

Set `REDIS_URL` environment variable.

## Client Connection

In `network/NetworkManager.js`:
```js
const net = new NetworkManager({ serverUrl: 'ws://localhost:8080' });
await net.connect();
const room = await net.joinRoom('race', { trackId, modeId, vehicleId, characterId });
```

## Room Lifecycle

1. Client connects to lobby
2. Client requests matchmaking (sends prefs: mode, track, region)
3. Server finds or creates RaceRoom with available slots
4. Client joins room, sends 'ready' when loaded
5. All ready -> 3s countdown -> race starts
6. Clients send 'input' messages every frame (60Hz)
7. Server steps physics authoritatively, broadcasts state patches (20Hz)
8. Clients predict own vehicle, interpolate remote vehicles (200ms buffer)
9. Race ends -> results broadcast -> room disposes after 5s

## Bot Backfill

If RaceRoom doesn't fill within 10s grace period, server injects bots with:
- Simulated ping (30-80ms)
- Names from 60-name pool
- Difficulty scaled to average player MMR
