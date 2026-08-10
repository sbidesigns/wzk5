// barrel/modes/mode.circuit.js - Enhanced Circuit Race
// Multi-lap race with position-based scoring (15/12/10/8/6/4/3/2/1)

export function onMatchStart(ctx, matchState) {
  matchState.laps = ctx.matchConfig?.laps || 3;
  matchState.playerLaps = 0;
  matchState.aiLaps = new Map();
  matchState.finished = [];
  matchState.startTime = performance.now();
  matchState.positions = new Map(); // Real-time position tracking
  matchState.bestLapTimes = new Map(); // Personal best per racer
  matchState.currentLapTimes = new Map(); // Current lap time tracking
  matchState.sectorTimes = []; // Split times per sector (for display)
  matchState.checkpointStreaks = new Map(); // Consecutive checkpoint hits for bonus
  
  // Initialize AI lap counters
  if (ctx.aiVehicles) {
    ctx.aiVehicles.forEach((ai, idx) => {
      matchState.aiLaps.set(`ai-${idx}`, 0);
      matchState.currentLapTimes.set(`ai-${idx}`, performance.now());
    });
  }
  
  matchState.currentLapTimes.set('player', performance.now());
  
  ctx.engine.bus.emit('mode:circuit:start', { laps: matchState.laps });
}

export function onLapComplete(ctx, matchState, { vehicleId }) {
  const now = performance.now();
  const lapTimeStart = matchState.currentLapTimes.get(vehicleId) || matchState.startTime;
  const lapTime = (now - lapTimeStart) / 1000;
  
  // Record best lap time
  const prevBest = matchState.bestLapTimes.get(vehicleId);
  if (!prevBest || lapTime < prevBest) {
    matchState.bestLapTimes.set(vehicleId, lapTime);
    ctx.engine.bus.emit('mode:circuit:newBestLap', { vehicleId, lapTime });
  }
  
  // Reset current lap timer
  matchState.currentLapTimes.set(vehicleId, now);
  
  if (vehicleId === 'player') {
    matchState.playerLaps++;
    
    // Checkpoint streak bonus
    const streak = matchState.checkpointStreaks.get('player') || 0;
    if (streak >= 5) {
      ctx.engine.bus.emit('mode:circuit:streakBonus', { 
        vehicleId, 
        streak,
        bonusXP: streak * 50 
      });
    }
    matchState.checkpointStreaks.set('player', 0); // Reset streak on lap
    
    ctx.engine.bus.emit('mode:circuit:lap', { 
      vehicle: 'player', 
      lap: matchState.playerLaps, 
      total: matchState.laps,
      lapTime,
      bestTime: matchState.bestLapTimes.get('player')
    });
    
    if (matchState.playerLaps >= matchState.laps) {
      _finishRacer(ctx, matchState, 'player', now);
    }
  } else {
    const cur = (matchState.aiLaps.get(vehicleId) || 0) + 1;
    matchState.aiLaps.set(vehicleId, cur);
    
    if (cur >= matchState.laps) {
      _finishRacer(ctx, matchState, vehicleId, now);
    }
  }
  
  _updatePositions(ctx, matchState);
}

function _finishRacer(ctx, matchState, vehicleId, finishTime) {
  const totalTime = (finishTime - matchState.startTime) / 1000;
  matchState.finished.push({ id: vehicleId, time: totalTime, position: matchState.finished.length + 1 });
  
  ctx.engine.bus.emit('mode:circuit:finished', { 
    vehicle: vehicleId, 
    position: matchState.finished.length,
    time: totalTime
  });
  
  // Check if player finished
  if (vehicleId === 'player') {
    ctx.engine.bus.emit('mode:circuit:raceEnd', { results: matchState.finished });
  } else if (matchState.finished.filter(f => f.id === 'player').length === 0) {
    // Player hasn't finished yet but others have - show position updates
    _updatePositions(ctx, matchState);
  }
}

function _updatePositions(ctx, matchState) {
  // Calculate positions based on progress (laps * 10000 + checkpoints)
  const scores = new Map();
  
  // Player score
  scores.set('player', matchState.playerLaps * 10000 + (matchState.playerCheckpoints || 0));
  
  // AI scores
  matchState.aiLaps.forEach((laps, aiId) => {
    scores.set(aiId, laps * 10000 + (matchState[`ai_${aiId}_checkpoints`] || 0));
  });
  
  // Sort by score descending to get positions
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  
  sorted.forEach(([id], idx) => {
    matchState.positions.set(id, idx + 1);
  });
  
  ctx.engine.bus.emit('mode:circuit:positionUpdate', {
    positions: Object.fromEntries(matchState.positions)
  });
}

export function onCheckpoint(ctx, matchState, { vehicleId, checkpointIndex }) {
  // Track which checkpoint each vehicle is at
  if (vehicleId === 'player') {
    matchState.playerCheckpoints = checkpointIndex;
    
    // Increment streak
    const prevCp = matchState.lastPlayerCheckpoint || -1;
    if (checkpointIndex === prevCp + 1 || (prevCp >= matchState.totalCheckpoints - 1 && checkpointIndex === 0)) {
      matchState.checkpointStreaks.set('player', (matchState.checkpointStreaks.get('player') || 0) + 1);
    }
    matchState.lastPlayerCheckpoint = checkpointIndex;
  } else {
    matchState[`ai_${vehicleId}_checkpoints`] = checkpointIndex;
  }
  
  // Sector time recording (every 4th checkpoint or so)
  if (checkpointIndex % 4 === 0) {
    const sectorTime = (performance.now() - (matchState.lastSectorTime || matchState.startTime)) / 1000;
    matchState.sectorTimes.push({ vehicleId, checkpointIndex, sectorTime });
    matchState.lastSectorTime = performance.now();
    
    ctx.engine.bus.emit('mode:circuit:sectorTime', { vehicleId, checkpointIndex, sectorTime });
  }
  
  _updatePositions(ctx, matchState);
}

export function onItemUsed(ctx, matchState, { vehicleId, itemId }) {
  ctx.engine.bus.emit('mode:circuit:item', { vehicle: vehicleId, item: itemId });
}

export function getScoreboard(ctx, matchState) {
  return {
    finished: matchState.finished,
    positions: Object.fromEntries(matchState.positions),
    bestLaps: Object.fromEntries(matchState.bestLapTimes),
    currentStandings: _getCurrentStandings(matchState)
  };
}

function _getCurrentStandings(matchState) {
  const standings = [];
  
  // Player standing
  standings.push({
    id: 'player',
    position: matchState.positions.get('player') || '-',
    laps: matchState.playerLaps,
    bestLap: matchState.bestLapTimes.get('player')
  });
  
  // AI standings
  matchState.aiLaps.forEach((laps, aiId) => {
    standings.push({
      id: aiId,
      position: matchState.positions.get(aiId) || '-',
      laps: laps,
      bestLap: matchState.bestLapTimes.get(aiId)
    });
  });
  
  return standings.sort((a, b) => a.position - b.position);
}

export function getPlayerProgress(ctx, matchState) {
  return {
    lap: matchState.playerLaps + 1,
    totalLaps: matchState.laps,
    position: matchState.positions.get('player') || '-',
    currentTime: (performance.now() - (matchState.currentLapTimes.get('player') || matchState.startTime)) / 1000,
    bestLap: matchState.bestLapTimes.get('player'),
    checkpoint: matchState.playerCheckpoints || 0,
    totalCheckpoints: matchState.totalCheckpoints || 16
  };
}

export default { onMatchStart, onLapComplete, onCheckpoint, onItemUsed, getScoreboard, getPlayerProgress };
