// barrel/modes/mode.battleRoyale.js - Battle Royale Mode
// Shrinking arena forcefield, last vehicle operational wins
// Scavenging for items/boosts, zone damage

export function onMatchStart(ctx, matchState) {
  matchState.arenaSize = 500; // Initial arena radius in world units
  matchState.minArenaSize = 50; // Final arena size
  matchState.shrinkRate = 20; // Units per minute
  matchState.shrinkInterval = 30; // Seconds between shrinks
  matchState.currentZone = { x: 0, z: 0, radius: matchState.arenaSize };
  matchState.nextZone = null;
  matchState.zoneTimer = 0;
  matchState.phase = 1; // Current phase (1-5)
  matchState.alivePlayers = new Map(); // player -> alive status + position
  matchState.kills = new Map(); // player -> kill count
  matchState.damageOverTime = new Map(); // player -> accumulated zone damage
  
  // Initialize all players as alive
  if (ctx.playerVehicle) {
    matchState.alivePlayers.set('player', { 
      alive: true, 
      position: ctx.playerVehicle.getPosition(),
      health: 100,
      vehicle: ctx.playerVehicle
    });
  }
  
  if (ctx.aiVehicles) {
    ctx.aiVehicles.forEach((ai, idx) => {
      matchState.alivePlayers.set(`ai-${idx}`, {
        alive: true,
        position: ai.getPosition(),
        health: 100,
        vehicle: ai
      });
      matchState.kills.set(`ai-${idx}`, 0);
    });
  }
  
  // Start zone timer
  matchState.lastShrinkTime = performance.now();
  
  ctx.engine.bus.emit('mode:br:start', {
    initialZone: matchState.currentZone,
    playersAlive: matchState.alivePlayers.size
  });
}

export function update(ctx, matchState, dt) {
  const now = performance.now();
  
  // Update zone timer and shrink
  const timeSinceShrink = (now - matchState.lastShrinkTime) / 1000;
  
  if (timeSinceShrink >= matchState.shrinkInterval) {
    _shrinkZone(ctx, matchState);
    matchState.lastShrinkTime = now;
    matchState.phase++;
    
    ctx.engine.bus.emit('mode:br:zoneShrink', {
      phase: matchState.phase,
      newZone: matchState.currentZone,
      nextZone: matchState.nextZone
    });
  }
  
  // Apply zone damage to players outside safe zone
  _applyZoneDamage(ctx, matchState, dt);
  
  // Check win condition
  const aliveCount = [...matchState.alivePlayers.values()].filter(p => p.alive).length;
  
  if (aliveCount <= 1) {
    const winner = [...matchState.alivePlayers.entries()].find(([id, p]) => p.alive);
    if (winner) {
      ctx.engine.bus.emit('mode:br:winner', {
        playerId: winner[0],
        kills: matchState.kills.get(winner[0]) || 0,
        survivalTime: now
      });
    } else {
      // Everyone died simultaneously (draw or no winner)
      ctx.engine.bus.emit('mode:br:noWinner');
    }
  }
  
  // Update positions for display
  _updatePositions(ctx, matchState);
}

function _shrinkZone(ctx, matchState) {
  // Calculate new zone (shrinks toward center or random point)
  const shrinkAmount = matchState.shrinkRate * (matchState.shrinkInterval / 60);
  const newRadius = Math.max(matchState.minArenaSize, matchState.currentZone.radius - shrinkAmount);
  
  // Next zone preview (where it will shrink to next)
  const nextRadius = Math.max(matchState.minArenaSize, newRadius - shrinkAmount * 2);
  
  matchState.nextZone = {
    x: matchState.currentZone.x,
    z: matchState.currentZone.z,
    radius: nextRadius
  };
  
  matchState.currentZone.radius = newRadius;
  
  // Visual effect for zone boundary
  ctx.engine.bus.emit('mode:br:zoneUpdate', {
    currentZone: matchState.currentZone,
    nextZone: matchState.nextZone
  });
}

function _applyZoneDamage(ctx, matchState, dt) {
  const damagePerSecond = 5 * matchState.phase; // Increases each phase
  
  matchState.alivePlayers.forEach((playerData, playerId) => {
    if (!playerData.alive || !playerData.position) return;
    
    // Calculate distance from zone center
    const dx = playerData.position.x - matchState.currentZone.x;
    const dz = playerData.position.z - matchState.currentZone.z;
    const distanceFromCenter = Math.sqrt(dx * dx + dz * dz);
    
    // If outside zone, apply damage
    if (distanceFromCenter > matchState.currentZone.radius) {
      const distanceOutside = distanceFromCenter - matchState.currentZone.radius;
      const damageMultiplier = 1 + (distanceOutside / 50); // More damage further out
      
      const damage = damagePerSecond * damageMultiplier * dt;
      
      if (playerData.vehicle) {
        playerData.vehicle.takeDamage(damage);
        
        // Check if killed by zone
        if (playerData.vehicle.health <= 0) {
          _killPlayer(ctx, matchState, playerId, 'zone');
        }
      }
      
      // Visual/audio feedback for zone damage
      if (Math.random() > 0.9) {
        ctx.engine.bus.emit('mode:br:zoneDamageTick', { playerId, damage });
      }
    }
  });
}

export function onPlayerDeath(ctx, matchState, { victimId, killerId, cause }) {
  _killPlayer(ctx, matchState, victimId, cause);
  
  if (killerId && killerId !== victimId) {
    // Award kill to killer
    matchState.kills.set(killerId, (matchState.kills.get(killerId) || 0) + 1);
    
    ctx.engine.bus.emit('mode:br:kill', {
      killer: killerId,
      victim: victimId,
      cause,
      killerKills: matchState.kills.get(killerId)
    });
  }
}

function _killPlayer(ctx, matchState, playerId, cause) {
  const playerData = matchState.alivePlayers.get(playerId);
  if (!playerData) return;
  
  playerData.alive = false;
  playerData.deathCause = cause;
  playerData.deathTime = performance.now();
  
  // Despawn vehicle
  if (playerData.vehicle) {
    playerData.vehicle.despawn();
  }
  
  ctx.engine.bus.emit('mode:br:playerEliminated', {
    playerId,
    cause,
    remaining: [...matchState.alivePlayers.values()].filter(p => p.alive).length,
    killerStats: Object.fromEntries([...matchState.kills.entries()].sort((a,b) => b[1] - a[1]))
  });
}

function _updatePositions(ctx, matchState) {
  // BR positions based on kills then survival time
  const rankings = [];
  
  matchState.alivePlayers.forEach((data, id) => {
    rankings.push({
      id,
      alive: data.alive,
      kills: matchState.kills.get(id) || 0,
      deathTime: data.deathTime || performance.now()
    });
  });
  
  // Sort: alive first, then by kills desc, then by survival time asc for dead
  rankings.sort((a, b) => {
    if (a.alive !== b.alive) return b.alive ? 1 : -1; // Alive first
    if (a.kills !== b.kills) return b.kills - a.kills; // Most kills first
    return a.deathTime - b.deathTime; // Longest survivor among dead
  });
  
  rankings.forEach((r, idx) => {
    r.position = idx + 1;
  });
  
  ctx.engine.bus.emit('mode:br:positionUpdate', { rankings });
}

export function onItemPickup(ctx, matchState, { playerId, item }) {
  // In BR mode, items are scavenged from around the map
  ctx.engine.bus.emit('mode:br:itemScavenged', { playerId, item });
}

export function getScoreboard(ctx, matchState) {
  return {
    zone: matchState.currentZone,
    nextZone: matchState.nextZone,
    phase: matchState.phase,
    playersAlive: [...matchState.alivePlayers.values()].filter(p => p.alive).length,
    totalPlayers: matchState.alivePlayers.size,
    kills: Object.fromEntries(matchState.kills),
    rankings: _getRankings(matchState)
  };
}

function _getRankings(matchState) {
  const rankings = [];
  
  matchState.alivePlayers.forEach((data, id) => {
    rankings.push({
      id,
      alive: data.alive,
      kills: matchState.kills.get(id) || 0
    });
  });
  
  rankings.sort((a, b) => {
    if (a.alive !== b.alive) return b.alive ? 1 : -1;
    return b.kills - a.kills;
  });
  
  return rankings.map((r, i) => ({ ...r, position: i + 1 }));
}

export function getZoneInfo(ctx, matchState) {
  return {
    current: matchState.currentZone,
    next: matchState.nextZone,
    phase: matchState.phase,
    timeToNextShrink: matchState.shrinkInterval - ((performance.now() - matchState.lastShrinkTime) / 1000),
    shrinkProgress: 1 - (matchState.currentZone.radius / matchState.arenaSize)
  };
}

export default { onMatchStart, update, onPlayerDeath, onItemPickup, getScoreboard, getZoneInfo };
