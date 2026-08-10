// barrel/modes/mode.timeTrial.js - Time Trial Mode
// Ghost replay of personal best + global leaderboard

export function onMatchStart(ctx, matchState) {
  matchState.startTime = performance.now();
  matchState.bestTime = null; // Personal best (from save)
  matchState.globalLeaderboard = []; // Would load from server
  matchState.currentLap = 0;
  matchState.lapTimes = [];
  matchState.checkpointTimes = []; // Split times
  matchState.isPersonalBest = false;
  
  // Load ghost data (previous best run)
  matchState.ghostData = _loadGhostData(ctx);
  matchState.ghostIndex = 0;
  matchState.ghostActive = matchState.ghostData && matchState.ghostData.frames.length > 0;
  
  // Checkpoints for this track
  matchState.totalCheckpoints = ctx.trackConfig?.checkpoints || 16;
  matchState.currentCheckpoint = -1;
  
  ctx.engine.bus.emit('mode:tt:start', {
    personalBest: matchState.bestTime,
    ghostAvailable: matchState.ghostActive,
    leaderboard: matchState.globalLeaderboard.slice(0, 10)
  });
}

function _loadGhostData(ctx) {
  // In production, would load from local storage or server
  // For now, return null (no ghost) or generate sample data
  
  try {
    const saved = localStorage.getItem(`wzk3_tt_ghost_${ctx.trackId}`);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Could not load ghost data:', e);
  }
  
  return null;
}

export function update(ctx, matchState, dt) {
  const now = performance.now();
  const elapsedTime = (now - matchState.startTime) / 1000;
  
  // Update ghost replay
  if (matchState.ghostActive && matchState.ghostData) {
    _updateGhost(ctx, matchState, elapsedTime);
  }
  
  // Compare with ghost/best time
  if (matchState.bestTime) {
    const delta = elapsedTime - _getGhostPosition(matchState, elapsedTime).time;
    
    // Emit time delta for HUD (+/- ahead/behind ghost)
    ctx.engine.bus.emit('mode:tt:timeDelta', { 
      delta,
      ahead: delta < 0 
    });
  }
}

function _updateGhost(ctx, matchState, currentTime) {
  const frames = matchState.ghostData.frames;
  
  // Find current frame based on time
  while (matchState.ghostIndex < frames.length - 1 && 
         frames[matchState.ghostIndex + 1].time <= currentTime) {
    matchState.ghostIndex++;
  }
  
  while (matchState.ghostIndex > 0 && 
         frames[matchState.ghostIndex].time > currentTime) {
    matchState.ghostIndex--;
  }
  
  const frame = frames[matchState.ghostIndex];
  
  if (frame) {
    ctx.engine.bus.emit('mode:tt:ghostUpdate', {
      position: frame.position,
      rotation: frame.rotation,
      speed: frame.speed
    });
  }
}

function _getGhostPosition(matchState, time) {
  if (!matchState.ghostData || !matchState.ghostData.frames.length) {
    return { position: null, rotation: null, speed: 0, time: 0 };
  }
  
  const frames = matchState.ghostData.frames;
  
  // Find surrounding frames and interpolate
  let before = null;
  let after = null;
  
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].time <= time) before = frames[i];
    if (frames[i].time > time && !after) after = frames[i];
  }
  
  if (!before) return frames[0];
  if (!after) return frames[frames.length - 1];
  
  // Interpolate
  const t = (time - before.time) / (after.time - before.time);
  
  return {
    position: {
      x: before.position.x + (after.position.x - before.position.x) * t,
      y: before.position.y + (after.position.y - before.position.y) * t,
      z: before.position.z + (after.position.z - before.position.z) * t
    },
    rotation: before.rotation, // Simplified - would slerp quaternions
    speed: before.speed + (after.speed - before.speed) * t,
    time: time
  };
}

export function onLapComplete(ctx, matchState, { vehicleId }) {
  const now = performance.now();
  const lapTime = (now - (matchState.lastLapStartTime || matchState.startTime)) / 1000;
  
  matchState.lapTimes.push(lapTime);
  matchState.currentLap++;
  matchState.lastLapStartTime = now;
  
  // Record checkpoint splits for this lap
  matchState.checkpointTimes.push({
    lap: matchState.currentLap,
    splits: [...(matchState.currentLapSplits || [])]
  });
  matchState.currentLapSplits = [];
  
  // Check if new best lap
  if (!matchState.bestTime || lapTime < matchState.bestTime) {
    matchState.bestTime = lapTime;
    matchState.isPersonalBest = true;
    
    ctx.engine.bus.emit('mode:tt:newBestLap', {
      lapTime,
      lapNumber: matchState.currentLap,
      previousBest: matchState.lapTimes.length > 1 ? matchState.lapTimes[matchState.lapTimes.length - 2] : null
    });
    
    // Save ghost data for this lap
    _saveGhostData(ctx, matchState);
  } else {
    matchState.isPersonalBest = false;
  }
  
  ctx.engine.bus.emit('mode:tt:lapComplete', {
    lapNumber: matchState.currentLap,
    lapTime,
    bestTime: matchState.bestTime,
    isPersonalBest: matchState.isPersonalBest
  });
}

function _saveGhostData(ctx, matchState) {
  // In production, would record positions throughout the lap
  // For now, save metadata
  const ghostData = {
    trackId: ctx.trackId,
    date: new Date().toISOString(),
    totalTime: matchState.bestTime,
    laps: matchState.lapTimes,
    checkpoints: matchState.checkpointTimes,
    frames: [] // Would be populated during race
  };
  
  try {
    localStorage.setItem(`wzk3_tt_ghost_${ctx.trackId}`, JSON.stringify(ghostData));
  } catch (e) {
    console.warn('Could not save ghost data:', e);
  }
}

export function onCheckpoint(ctx, matchState, { vehicleId, checkpointIndex }) {
  const now = performance.now();
  const splitTime = (now - (matchState.lastLapStartTime || matchState.startTime)) / 1000;
  
  if (!matchState.currentLapSplits) {
    matchState.currentLapSplits = [];
  }
  
  matchState.currentLapSplits[checkpointIndex] = splitTime;
  matchState.currentCheckpoint = checkpointIndex;
  
  // Compare split with best run
  ctx.engine.bus.emit('mode:tt:checkpoint', {
    checkpoint: checkpointIndex,
    splitTime,
    totalCheckpoints: matchState.totalCheckpoints
  });
}

export function onFinish(ctx, matchState) {
  const totalTime = (performance.now() - matchState.startTime) / 1000;
  
  // Final results
  const results = {
    totalTime,
    bestLap: matchState.bestTime,
    laps: matchState.currentLap,
    lapTimes: matchState.lapTimes,
    isNewRecord: false,
    rank: null
  };
  
  // Check against leaderboard
  const leaderboardEntry = {
    playerId: 'player',
    time: totalTime,
    date: new Date().toISOString(),
    trackId: ctx.trackId
  };
  
  // Add to local leaderboard
  matchState.globalLeaderboard.push(leaderboardEntry);
  matchState.globalLeaderboard.sort((a, b) => a.time - b.time);
  matchState.globalLeaderboard = matchState.globalLeaderboard.slice(0, 100); // Keep top 100
  
  // Check if new record
  if (matchState.globalLeaderboard[0]?.playerId === 'player') {
    results.isNewRecord = true;
    results.rank = 1;
  } else {
    const rank = matchState.globalLeaderboard.findIndex(e => e.playerId === 'player');
    results.rank = rank >= 0 ? rank + 1 : null;
  }
  
  ctx.engine.bus.emit('mode:tt:finish', results);
  
  // Save to server (in production)
  _submitToLeaderboard(ctx, leaderboardEntry);
  
  return results;
}

async function _submitToLeaderboard(ctx, entry) {
  // Would POST to server
  console.log('Submitting to leaderboard:', entry);
}

export function getScoreboard(ctx, matchState) {
  return {
    currentTime: (performance.now() - matchState.startTime) / 1000,
    bestTime: matchState.bestTime,
    currentLap: matchState.currentLap,
    lapTimes: matchState.lapTimes,
    ghostActive: matchState.ghostActive,
    leaderboard: matchState.globalLeaderboard.slice(0, 10),
    isPersonalBest: matchState.isPersonalBest
  };
}

export function getGhostData(ctx, matchState) {
  return {
    active: matchState.ghostActive,
    currentPosition: _getGhostPosition(
      matchState, 
      (performance.now() - matchState.startTime) / 1000
    ),
    bestRun: matchState.ghostData
  };
}

export default { onMatchStart, update, onLapComplete, onCheckpoint, onFinish, getScoreboard, getGhostData };
