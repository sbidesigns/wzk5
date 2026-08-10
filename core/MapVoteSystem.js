// core/MapVoteSystem.js
// Map vote carousel in lobby. 3 maps offered, players + bots vote.
// Winning map loads for the race.

import { EventBus } from './EventBus.js';

class MapVoteSystem {
  constructor() {
    this._options = [];
    this._votes = new Map(); // playerId -> mapId
    this._active = false;
  }

  start(availableTracks, numOptions = 3) {
    // Pick 3 random tracks (or fewer if not enough)
    const shuffled = [...availableTracks].sort(() => Math.random() - 0.5);
    this._options = shuffled.slice(0, Math.min(numOptions, shuffled.length));
    this._votes = new Map();
    this._active = true;
    EventBus.emit('mapvote:start', { options: this._options });
  }

  vote(playerId, mapId) {
    if (!this._active) return;
    if (!this._options.find(o => o.id === mapId)) return;
    this._votes.set(playerId, mapId);
    EventBus.emit('mapvote:vote', { playerId, mapId, totalVotes: this._votes.size });
  }

  // Bots vote randomly, weighted by their "personality"
  botVote(botId) {
    if (!this._active || this._options.length === 0) return;
    const choice = this._options[Math.floor(Math.random() * this._options.length)];
    this.vote(botId, choice.id);
  }

  getResults() {
    const counts = new Map();
    for (const [playerId, mapId] of this._votes) {
      counts.set(mapId, (counts.get(mapId) || 0) + 1);
    }
    // Sort by vote count, then random for ties
    const sorted = [...counts.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return Math.random() - 0.5;
    });
    return {
      winner: sorted[0]?.[0] || this._options[0]?.id,
      results: sorted.map(([mapId, count]) => ({ mapId, count })),
      options: this._options
    };
  }

  end() {
    const results = this.getResults();
    this._active = false;
    EventBus.emit('mapvote:end', results);
    return results;
  }

  isActive() { return this._active; }
  getOptions() { return this._options; }
  getVotes() { return this._votes; }
}

export const mapVote = new MapVoteSystem();
export default mapVote;
