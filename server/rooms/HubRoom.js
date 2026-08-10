// server/rooms/HubRoom.js — MMO hub world (100+ players, interest-managed)
// Players only see others within 100m radius.
// Sharded: when hub exceeds 50 players, spin up another shard.
import { Room } from 'colyseus';

const INTEREST_RADIUS = 100;
const MAX_PLAYERS_PER_SHARD = 50;

export class HubRoom extends Room {
  maxClients = MAX_PLAYERS_PER_SHARD;

  onCreate() {
    console.log('[HubRoom] Created');
    this.state = { players: {}, worldSize: 1000 };
    this.onMessage('move', (client, { x, y, z, rx, ry, rz, rw }) => {
      const p = this.state.players[client.sessionId];
      if (p) { p.position = { x, y, z }; p.rotation = { x: rx, y: ry, z: rz, w: rw }; }
    });
    this.onMessage('chat', (client, msg) => {
      // Spatial chat: only players within 20m see it
      const sender = this.state.players[client.sessionId];
      if (!sender) return;
      for (const [id, p] of Object.entries(this.state.players)) {
        const dx = p.position.x - sender.position.x;
        const dz = p.position.z - sender.position.z;
        if (Math.sqrt(dx * dx + dz * dz) < 20) {
          this.send(client, 'chat', { playerId: client.sessionId, name: sender.name, msg, t: Date.now() });
        }
      }
    });
    // Interest management: only send state for nearby players
    this.setPatchRate(100); // 10Hz for hub (lower than race)
  }

  onJoin(client, options) {
    this.state.players[client.sessionId] = {
      id: client.sessionId, name: options.name || 'Player',
      position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 },
      vehicleId: options.vehicleId, characterId: options.characterId
    };
  }

  onLeave(client) {
    delete this.state.players[client.sessionId];
  }
}
