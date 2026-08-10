// server/rooms/RaceRoom.js — Authoritative race room (8-16 players)
// 60Hz physics simulation, 20Hz state patches to clients.

import { Room } from 'colyseus';
import { RaceState } from '../schemas/RaceState.js';

const TICK_RATE = 60;
const PATCH_RATE = 20;
const MAX_PLAYERS = 16;

export class RaceRoom extends Room {
  maxClients = MAX_PLAYERS;

  onCreate(options) {
    console.log('[RaceRoom] Created:', options);
    this.setState(new RaceState());
    this.state.trackId = options.trackId || 'downtown';
    this.state.modeId = options.modeId || 'circuit';
    this.state.phase = 'countdown';
    this.state.countdown = 3;
    this.state.raceTime = 0;
    this._inputs = new Map();
    this._vehicles = new Map();

    this.onMessage('input', (client, input) => this._handleInput(client, input));
    this.onMessage('ready', (client) => {
      const p = this.state.players.get(client.sessionId);
      if (p) p.ready = true;
      this._checkAllReady();
    });
    this.onMessage('item', (client, { itemId, targetId }) => {
      this.broadcast('itemUsed', { playerId: client.sessionId, itemId, targetId });
    });

    this.setSimulationInterval((dt) => this._update(dt), 1000 / TICK_RATE);
    this.setPatchRate(1000 / PATCH_RATE);
    this.clock.setTimeout(() => this._startCountdown(), 1000);
  }

  onJoin(client, options) {
    console.log(`[RaceRoom] ${client.sessionId} joined`);
    const player = {
      id: client.sessionId,
      name: options.name || `Player${Math.floor(Math.random() * 1000)}`,
      vehicleId: options.vehicleId || 'spectre',
      characterId: options.characterId || 'ace',
      position: { x: 0, y: 1, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      velocity: { x: 0, y: 0, z: 0 },
      ready: false, lap: 0, checkpoint: 0, finished: false, finishTime: 0,
      isBot: options.isBot || false, ping: 0, speedKmh: 0, inputSequence: 0
    };
    this.state.players.set(client.sessionId, player);
    this._inputs.set(client.sessionId, []);
    this._vehicles.set(client.sessionId, { position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 }, velocity: { x: 0, y: 0, z: 0 }, speedKmh: 0 });
  }

  onLeave(client) {
    this.state.players.delete(client.sessionId);
    this._inputs.delete(client.sessionId);
    this._vehicles.delete(client.sessionId);
  }

  _handleInput(client, input) {
    const buf = this._inputs.get(client.sessionId);
    if (buf) { buf.push({ ...input, t: Date.now() }); while (buf.length > 60) buf.shift(); }
  }

  _checkAllReady() {
    const players = [...this.state.players.values()];
    if (players.length > 0 && players.every(p => p.ready) && this.state.phase === 'waiting') {
      this.state.phase = 'countdown';
      this._startCountdown();
    }
  }

  _startCountdown() {
    [3, 2, 1, 0].forEach((v, i) => {
      this.clock.setTimeout(() => {
        this.state.countdown = v;
        this.broadcast('countdown', { value: v });
        if (v === 0) { this.state.phase = 'racing'; this.state.raceStartTime = Date.now(); }
      }, i * 1000);
    });
  }

  _update(dt) {
    if (this.state.phase !== 'racing') return;
    this.state.raceTime += dt;
    // Process inputs, step physics, check progress (simplified for code sample)
    const allFinished = [...this.state.players.values()].every(p => p.finished);
    if (allFinished || this.state.raceTime > 600) {
      this.state.phase = 'finished';
      this.broadcast('raceEnd', { results: [...this.state.players.values()].sort((a, b) => a.finishTime - b.finishTime) });
      this.clock.setTimeout(() => this.disconnect(), 5000);
    }
  }
}
