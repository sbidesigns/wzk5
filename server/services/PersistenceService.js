// server/services/PersistenceService.js — Redis-backed player state persistence
// Used by HubRoom for MMO: hydrate on join, write-through on change, save on disconnect.

import Redis from 'ioredis';

export class PersistenceService {
  constructor(redisUrl) {
    this._redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
    this._prefix = 'wzk5:player:';
  }

  async hydrate(playerId) {
    const data = await this._redis.hgetall(this._prefix + playerId);
    if (Object.keys(data).length === 0) return null;
    return {
      id: playerId,
      name: data.name,
      level: parseInt(data.level || '1'),
      xp: parseInt(data.xp || '0'),
      credits: parseInt(data.credits || '0'),
      gold: parseInt(data.gold || '0'),
      vehicleId: data.vehicleId || 'spectre',
      characterId: data.characterId || 'ace',
      position: JSON.parse(data.position || '{"x":0,"y":0,"z":0}'),
      rotation: JSON.parse(data.rotation || '{"x":0,"y":0,"z":0,"w":1}'),
      equippedParts: JSON.parse(data.equippedParts || '{}'),
      unlocks: JSON.parse(data.unlocks || '{"vehicles":["spectre"],"characters":["ace"]}'),
      lastSeen: data.lastSeen,
      playTime: parseInt(data.playTime || '0')
    };
  }

  async save(playerId, data) {
    const key = this._prefix + playerId;
    const pipeline = this._redis.pipeline();
    pipeline.hset(key, {
      name: data.name || 'Player',
      level: data.level || 1,
      xp: data.xp || 0,
      credits: data.credits || 0,
      gold: data.gold || 0,
      vehicleId: data.vehicleId || 'spectre',
      characterId: data.characterId || 'ace',
      position: JSON.stringify(data.position || { x: 0, y: 0, z: 0 }),
      rotation: JSON.stringify(data.rotation || { x: 0, y: 0, z: 0, w: 1 }),
      equippedParts: JSON.stringify(data.equippedParts || {}),
      unlocks: JSON.stringify(data.unlocks || { vehicles: ['spectre'], characters: ['ace'] }),
      lastSeen: new Date().toISOString(),
      playTime: data.playTime || 0
    });
    pipeline.expire(key, 30 * 24 * 60 * 60);
    await pipeline.exec();
  }

  async writeThrough(playerId, field, value) {
    const key = this._prefix + playerId;
    const val = typeof value === 'object' ? JSON.stringify(value) : value;
    await this._redis.hset(key, field, val);
  }

  async getLeaderboard(trackId, modeId, count = 100) {
    const key = `wzk5:leaderboard:${trackId}:${modeId}`;
    return await this._redis.zrevrange(key, 0, count - 1, 'WITHSCORES');
  }

  async submitScore(trackId, modeId, playerId, score) {
    const key = `wzk5:leaderboard:${trackId}:${modeId}`;
    await this._redis.zadd(key, score, playerId);
  }

  async getFriendList(playerId) {
    return await this._redis.smembers(`wzk5:friends:${playerId}`);
  }

  async addFriend(playerId, friendId) {
    await this._redis.sadd(`wzk5:friends:${playerId}`, friendId);
    await this._redis.sadd(`wzk5:friends:${friendId}`, playerId);
  }

  async removeFriend(playerId, friendId) {
    await this._redis.srem(`wzk5:friends:${playerId}`, friendId);
    await this._redis.srem(`wzk5:friends:${friendId}`, playerId);
  }

  async getOnlinePlayers() {
    return await this._redis.smembers('wzk5:online');
  }

  async setOnline(playerId) {
    await this._redis.sadd('wzk5:online', playerId);
  }

  async setOffline(playerId) {
    await this._redis.srem('wzk5:online', playerId);
  }

  async getShardAssignment(playerId) {
    return await this._redis.get(`wzk5:shard:${playerId}`);
  }

  async setShardAssignment(playerId, shardId) {
    await this._redis.set(`wzk5:shard:${playerId}`, shardId);
  }

  disconnect() {
    this._redis.disconnect();
  }
}
