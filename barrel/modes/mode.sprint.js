// barrel/modes/mode.sprint.js - Sprint Race Mode
// Single lap, point-to-point, no laps, pure speed

export function onMatchStart(ctx, matchState) {
  matchState.startPoint = ctx.trackConfig?.startPoint || { x: 0, y: 0, z: 50 };
  matchState.endPoint = ctx.trackConfig?.endPoint || { x: 0, y: 0, z: -200 };
  matchState.totalDistance = _calculateDistance(matchState.startPoint, matchState.endPoint);
  
  matchState.startTime = performance.now();
  matchState.playerProgress = 0; // 0-100 percentage
  matchState.aiProgress = new Map(); // aiId -> progress
  
  // Initialize AI progress tracking
  if (ctx.aiVehicles) {
    ctx.aiVehicles.forEach((ai, idx) => {
      matchState.aiProgress.set(`ai-${idx}`, 0);
    });
  }
  
  // Checkpoints for progress measurement (optional in sprint)
  matchState.checkpointCount = ctx.trackConfig?.checkpoints || 4;
  matchState.playerCheckpoints = 0;
  matchState.aiCheckpoints = new Map();
  
  // Time bonus/penalty zones
  matchState.timeZones = [
    { position: { x: 0, z: 25 }, radius: 15, effect: 'boost', multiplier: 1.2 },
    { position: { x: 20, z: -50 }, radius: 12, effect: 'slow', multiplier: 0.8 },
    { position: { x: -20, z: -100 }, radius: 10, effect: 'boost', multiplier: 1.15 }
  ];
  
  ctx.engine.bus.emit('mode:sprint:start', {
    startPoint: matchState.startPoint,
    endPoint: matchState.endPoint,
    totalDistance: Math.round(matchState.totalDistance),
    timeZones: matchState.timeZones.length
  });
}

function _calculateDistance(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function update(ctx, matchState, dt) {
  const now = performance.now();
  const elapsedTime = (now - matchState.startTime) / 1000;
  
  // Update player progress
  if (ctx.playerVehicle && ctx.playerVehicle.getPosition()) {
    const playerPos = ctx.playerVehicle.getPosition();
    const distanceToStart = _calculateDistance(playerPos, matchState.startPoint);
    matchState.playerProgress = Math.min(100, (distanceToStart / matchState.totalDistance) * 100);
    
    // Check time zone effects
    _checkTimeZones(ctx, matchState, 'player', playerPos);
  }
  
  // Update AI progress
  if (ctx.aiVehicles) {
    ctx.aiVehicles.forEach((ai, idx) => {
      if (ai.getPosition()) {
        const aiPos = ai.getPosition();
        const distanceToStart = _calculateDistance(aiPos, matchState.startPoint);
        matchState.aiProgress.set(`ai-${idx}`, Math.min(100, (distanceToStart / matchState.totalDistance) * 100));
        
        _checkTimeZones(ctx, matchState, `ai-${idx}`, aiPos);
      }
    });
  }
  
  // Check if anyone finished (reached end point or 100%+ progress)
  if (matchState.playerProgress >= 100) {
    _finishRacer(ctx, matchState, 'player', elapsedTime);
  }
  
  matchState.aiProgress.forEach((progress, aiId) => {
    if (progress >= 100 && !matchState.finished?.includes(aiId)) {
      _finishRacer(ctx, matchState, aiId, elapsedTime);
    }
  });
  
  // Emit progress update for HUD
  ctx.engine.bus.emit('mode:sprint:progressUpdate', {
    playerProgress: matchState.playerProgress,
    positions: _getPositions(matchState),
    elapsedTime
  });
}

function _checkTimeZones(ctx, matchState, racerId, position) {
  let activeZone = null;
  
  matchState.timeZones.forEach(zone => {
    const dx = position.x - zone.position.x;
    const dz = position.z - zone.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance < zone.radius) {
      activeZone = zone;
      
      // Apply effect
      if (zone.effect === 'boost') {
        ctx.engine.bus.emit('mode:sprint:speedBoost', { racerId, multiplier: zone.multiplier });
      } else if (zone.effect === 'slow') {
        ctx.engine.bus.emit('mode:sprint:speedSlow', { racerId, multiplier: zone.multiplier });
      }
    }
  });
  
  if (activeZone) {
    ctx.engine.bus.emit('mode:sprint:inZone', { racerId, zoneType: activeZone.effect });
  }
}

function _finishRacer(ctx, matchState, racerId, finishTime) {
  if (!matchState.finished) matchState.finished = [];
  if (matchState.finished.includes(racerId)) return; // Already finished
  
  matchState.finished.push({
    id: racerId,
    time: finishTime,
    position: matchState.finished.length + 1
  });
  
  ctx.engine.bus.emit('mode:sprint:finished', {
    racerId,
    position: matchState.finished.length,
    time: finishTime,
    isPlayer: racerId === 'player'
  });
  
  // Check if race is over (all racers finished or player finished and AI results don't matter)
  if (racerId === 'player' || matchState.finished.length >= (matchState.aiProgress.size + 1)) {
    ctx.engine.bus.emit('mode:sprint:raceEnd', {
      results: matchState.finished.sort((a, b) => a.time - b.time)
    });
  }
}

export function onCheckpoint(ctx, matchState, { vehicleId }) {
  if (vehicleId === 'player') {
    matchState.playerCheckpoints++;
  } else {
    matchState.aiCheckpoints.set(vehicleId, (matchState.aiCheckpoints.get(vehicleId) || 0) + 1);
  }
  
  ctx.engine.bus.emit('mode:sprint:checkpoint', {
    vehicleId,
    checkpoint: vehicleId === 'player' ? matchState.playerCheckpoints : matchState.aiCheckpoints.get(vehicleId),
    total: matchState.checkpointCount
  });
}

function _getPositions(matchState) {
  const positions = { player: matchState.playerProgress };
  
  matchState.aiProgress.forEach((progress, id) => {
    positions[id] = progress;
  });
  
  // Sort by progress descending to get positions
  return Object.entries(positions)
    .sort((a, b) => b[1] - a[1])
    .reduce((acc, [id, prog], idx) => ({ ...acc, [id]: idx + 1 }), {});
}

export function getScoreboard(ctx, matchState) {
  return {
    elapsed: (performance.now() - matchState.startTime) / 1000,
    distanceRemaining: Math.max(0, 100 - matchState.playerProgress),
    playerPosition: _getPlayerPosition(matchState),
    checkpoints: {
      player: matchState.playerCheckpoints,
      total: matchState.checkpointCount
    },
    finished: matchState.finished || [],
    timeZones: matchState.timeZones.map(z => ({
      ...z,
      position: `${Math.round(z.position.x)}, ${Math.round(z.position.z)}`
    }))
  };
}

function _getPlayerPosition(matchState) {
  let position = 1;
  
  if (matchState.playerProgress < 100) {
    // Count how many AI are ahead
    matchState.aiProgress.forEach(progress => {
      if (progress > matchState.playerProgress) position++;
    });
  }
  
  return position;
}

export default { onMatchStart, update, onCheckpoint, getScoreboard };
