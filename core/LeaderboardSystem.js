// core/LeaderboardSystem.js
// Global + friends leaderboards per track + per mode.
// Backend: Redis sorted sets (when server available). Client-side: local storage fallback.

import { EventBus } from './EventBus.js';

class LeaderboardSystem {
  constructor() {
    this._save = null;
    this._friends = [];
  }

  init(saveSystem) {
    this._save = saveSystem;
    if (!this._save.get('leaderboards')) {
      this._save.set('leaderboards', {}); // trackId:modeId -> [{ name, score, time, timestamp }]
    }
    if (!this._save.get('friends')) {
      this._save.set('friends', []);
    }
    this._friends = this._save.get('friends') || [];
  }

  submitScore(trackId, modeId, entry) {
    const key = `leaderboards.${trackId}:${modeId}`;
    const board = this._save.get(key) || [];
    board.push({ ...entry, timestamp: Date.now() });
    // Sort by score (descending for points, ascending for time)
    const mode = window.__engine?.resolver?.resolve('modes', modeId);
    const isTimeBased = mode?.entry?.matchConfig?.laps > 0 || modeId === 'time-trial' || modeId === 'sprint';
    board.sort((a, b) => isTimeBased ? (a.time || 0) - (b.time || 0) : (b.score || 0) - (a.score || 0));
    // Keep top 100
    const trimmed = board.slice(0, 100);
    this._save.set(key, trimmed);
    EventBus.emit('leaderboard:scoreSubmitted', { trackId, modeId, entry, position: trimmed.findIndex(e => e.timestamp === entry.timestamp) + 1 });
    return trimmed.findIndex(e => e.timestamp === entry.timestamp) + 1;
  }

  getLeaderboard(trackId, modeId) {
    return this._save?.get(`leaderboards.${trackId}:${modeId}`) || [];
  }

  getPersonalBest(trackId, modeId) {
    const board = this.getLeaderboard(trackId, modeId);
    return board.find(e => e.isPlayer) || null;
  }

  getTopEntries(trackId, modeId, count = 10) {
    return this.getLeaderboard(trackId, modeId).slice(0, count);
  }

  addFriend(friendId, friendName) {
    this._save.update('friends', f => {
      if (f.find(x => x.id === friendId)) return f;
      return [...f, { id: friendId, name: friendName, addedAt: Date.now() }];
    });
    this._friends = this._save.get('friends');
  }

  removeFriend(friendId) {
    this._save.update('friends', f => f.filter(x => x.id !== friendId));
    this._friends = this._save.get('friends');
  }

  getFriends() { return this._friends; }

  getFriendsLeaderboard(trackId, modeId) {
    const board = this.getLeaderboard(trackId, modeId);
    const friendIds = new Set(this._friends.map(f => f.id));
    return board.filter(e => friendIds.has(e.playerId) || e.isPlayer);
  }
}

export const leaderboard = new LeaderboardSystem();
export default leaderboard;
