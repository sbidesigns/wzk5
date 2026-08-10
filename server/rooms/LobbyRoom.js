// server/rooms/LobbyRoom.js — Pre-game lobby with matchmaking + bot backfill
import { Room } from 'colyseus';

export class LobbyRoom extends Room {
  maxClients = 100;

  onCreate() {
    console.log('[LobbyRoom] Created');
    this.state = { players: {}, matchmakingQueues: {} };
    this.onMessage('matchmake', (client, prefs) => this._addToQueue(client, prefs));
    this.onMessage('cancelMatchmake', (client) => this._removeFromQueue(client.sessionId));
    this.onMessage('chat', (client, msg) => this.broadcast('chat', { playerId: client.sessionId, name: this.state.players[client.sessionId]?.name, msg, t: Date.now() }));
  }

  onJoin(client, options) {
    this.state.players[client.sessionId] = { id: client.sessionId, name: options.name || 'Player', level: options.level || 1, ready: false };
    this.broadcast('playerJoined', { player: this.state.players[client.sessionId] });
  }

  onLeave(client) {
    const p = this.state.players[client.sessionId];
    delete this.state.players[client.sessionId];
    this._removeFromQueue(client.sessionId);
    this.broadcast('playerLeft', { id: client.sessionId });
  }

  _addToQueue(client, prefs) {
    // Matchmaking: find or create race room with matching prefs
    // For now, broadcast matchFound with a room ID
    this.send(client, 'matchFound', { roomId: `race-${Date.now()}`, prefs });
  }

  _removeFromQueue(sessionId) {
    // Remove from all queues
  }
}
