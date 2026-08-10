// barrel/modes/mode.elimination.js - Elimination Mode
// Last place eliminated every 45 seconds, survive to win

export function onMatchStart(ctx, matchState) {
  matchState.eliminationInterval = 45; // Seconds between eliminations
  matchState.nextEliminationTime = performance.now() + (matchState.eliminationInterval * 1000);
  matchState.eliminatedPlayers = [];
  matchState.survivingPlayers = new Map(); // playerId -> data
  matchState.round = 1;
  matchState.totalRounds = 0; // Calculated based on player count
  
  // Initialize surviving players
  if (ctx.playerVehicle) {
    matchState.survivingPlayers.set('player', {
      vehicle: ctx.playerVehicle,
      position: ctx.playerVehicle.getPosition(),
      distanceTraveled: 0,
      lastPosition: ctx.playerVehicle.getPosition()
    });
  }
  
  if (ctx.aiVehicles) {
    ctx.aiVehicles.forEach((ai, idx) => {
      matchState.survivingPlayers.set(`ai-${idx}`, {
        vehicle: ai,
        position: ai.getPosition(),
        distanceTraveled: 0,
        lastPosition: ai.getPosition()
      });
    });
  }
  
  matchState.totalRounds = matchState.survivingPlayers.size - 1; // All but one eliminated
  
  ctx.engine.bus.emit('mode:elimination:start', {
    interval: matchState.eliminationInterval,
    playersAlive: matchState.survivingPlayers.size,
    totalRounds: matchState.totalRounds
  });
}

export function update(ctx, matchState, dt) {
  const now = performance.now();
  
  // Update player distances traveled (for tiebreaking)
  _updateDistances(ctx, matchState);
  
  // Check if it's time to eliminate someone
  if (now >= matchState.nextEliminationTime) {
    const lastPlace = _findLastPlace(matchState);
    
    if (lastPlace) {
      _eliminatePlayer(ctx, matchState, lastPlace);
      
      matchState.round++;
      matchState.nextEliminationTime = now + (matchState.eliminationInterval * 1000);
      
      ctx.engine.bus.emit('mode:elimination:elimination', {
        round: matchState.round,
        eliminated: lastPlace,
        remaining: [...matchState.survivingPlayers.keys()],
        nextElimIn: matchState.eliminationInterval
      });
    }
    
    // Check win condition
    if (matchState.survivingPlayers.size <= 1) {
      const winner = [...matchState.survivingPlayers.keys()][0];
      ctx.engine.bus.emit('mode:elimination:winner', { 
        winner,
        roundsSurvived: matchState.round 
      });
    }
  }
  
  // Update countdown display
  const timeToNext = Math.max(0, (matchState.nextEliminationTime - now) / 1000);
  
  if (timeToNext <= 10 && timeToNext > 9.5) {
    // Warning sound/visual at 10 seconds
    ctx.engine.bus.emit('mode:elimination:warning', { secondsRemaining: Math.ceil(timeToNext) });
  }
}

function _updateDistances(ctx, matchState) {
  matchState.survivingPlayers.forEach((data, id) => {
    if (!data.vehicle || !data.vehicle.getPosition) return;
    
    const currentPos = data.vehicle.getPosition();
    if (data.lastPosition && currentPos) {
      const dx = currentPos.x - data.lastPosition.x;
      const dz = currentPos.z - data.lastPosition.z;
      data.distanceTraveled += Math.sqrt(dx * dx + dz * dz);
    }
    data.lastPosition = currentPos;
    data.position = currentPos;
  });
}

function _findLastPlace(matchState) {
  let lastPlaceId = null;
  let worstDistance = Infinity;
  let worstProgress = Infinity; // Checkpoints passed
  
  // Find player furthest behind (least progress)
  matchState.survivingPlayers.forEach((data, id) => {
    if (!data.position) return;
    
    // In elimination, "last" means least forward progress along track
    // This would use checkpoint system in full implementation
    const progress = data.distanceTraveled || 0;
    
    if (progress < worstDistance) {
      worstDistance = progress;
      lastPlaceId = id;
    }
  });
  
  return lastPlaceId;
}

function _eliminatePlayer(ctx, matchState, playerId) {
  const playerData = matchState.survivingPlayers.get(playerId);
  if (!playerData) return;
  
  // Mark as eliminated
  matchState.eliminatedPlayers.push({
    id: playerId,
    round: matchState.round,
    distance: playerData.distanceTraveled,
    position: playerData.position
  });
  
  // Remove from survivors
  matchState.survivingPlayers.delete(playerId);
  
  // Despawn or mark vehicle as eliminated
  if (playerData.vehicle) {
    // Could show elimination effect before despawning
    ctx.engine.bus.emit('mode:elimination:vehicleOut', { 
      playerId, 
      vehicle: playerData.vehicle 
    });
    
    // Optional: delay actual despawn for visual effect
    setTimeout(() => {
      playerData.vehicle.despawn();
    }, 2000);
  }
}

export function onPlayerDestroyed(ctx, matchState, { playerId }) {
  // If a player crashes out, they're also eliminated
  if (matchState.survivingPlayers.has(playerId)) {
    _eliminatePlayer(ctx, matchState, playerId);
    ctx.engine.bus.emit('mode:elimination:crashOut', { playerId });
  }
}

export function getScoreboard(ctx, matchState) {
  return {
    round: matchState.round,
    totalRounds: matchState.totalRounds,
    timeToNextElim: Math.max(0, (matchState.nextEliminationTime - performance.now()) / 1000),
    surviving: Object.fromEntries(
      [...matchState.survivingPlayers.entries()].map(([id, data]) => [
        id, { distance: data.distanceTraveled, position: data.position }
      ])
    ),
    eliminated: matchState.eliminatedPlayers.map(e => ({
      id: e.id,
      round: e.round,
      distance: e.distance
    }))
  };
}

export function getSurvivorCount(ctx, matchState) {
  return matchState.survivingPlayers.size;
}

export default { onMatchStart, update, onPlayerDestroyed, getScoreboard, getSurvivorCount };
