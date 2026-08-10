// barrel/modes/mode.drift.js - Drift Challenge Mode
// Score based on drift angle × duration × speed

export function onMatchStart(ctx, matchState) {
  matchState.duration = ctx.matchConfig?.duration || 90; // Seconds
  matchState.startTime = performance.now();
  matchState.endTime = matchState.startTime + (matchState.duration * 1000);
  
  // Scoring system
  matchState.playerScore = 0;
  matchState.aiScores = new Map(); // aiId -> score
  
  // Current drift state for scoring
  matchState.currentDrifts = new Map(); // vehicleId -> { angle, duration, startTime, maxAngle }
  
  // Drift combos
  matchState.comboCount = 0;
  matchState.comboMultiplier = 1;
  matchState.lastDriftEndTime = 0;
  
  // Zones with score multipliers
  matchState.zones = [
    { position: { x: 0, z: 0 }, radius: 30, multiplier: 2.0, name: 'center' },
    { position: { x: 40, z: 20 }, radius: 20, multiplier: 1.5, name: 'outer' },
    { position: { x: -40, z: -20 }, radius: 20, multiplier: 1.5, name: 'outer' }
  ];
  
  // High score tracking
  matchState.highScores = _loadHighScores(ctx);
  
  // Initialize AI scores
  if (ctx.aiVehicles) {
    ctx.aiVehicles.forEach((ai, idx) => {
      matchState.aiScores.set(`ai-${idx}`, 0);
    });
  }
  
  ctx.engine.bus.emit('mode:drift:start', {
    duration: matchState.duration,
    zones: matchState.zones,
    highScore: matchState.highScores[0]?.score || 0
  });
}

function _loadHighScores(ctx) {
  try {
    const saved = localStorage.getItem('wzk5_drift_highscores');
    return saved ? JSON.parse(saved) : [
      { player: 'Ghost', score: 50000, date: '2024-01-01' }
    ];
  } catch (e) {
    return [{ player: 'Ghost', score: 50000, date: '2024-01-01' }];
  }
}

export function onDriftStart(ctx, matchState, { vehicleId, position }) {
  matchState.currentDrifts.set(vehicleId, {
    angle: 0,
    duration: 0,
    startTime: performance.now(),
    maxAngle: 0,
    startPosition: position,
    totalScore: 0
  });
  
  ctx.engine.bus.emit('mode:drift:driftStart', { vehicleId });
}

export function onDriftUpdate(ctx, matchState, { vehicleId, angle, speed }) {
  const drift = matchState.currentDrifts.get(vehicleId);
  if (!drift) return;
  
  const now = performance.now();
  drift.duration = (now - drift.startTime) / 1000;
  drift.angle = Math.abs(angle); // In radians or degrees depending on input
  drift.maxAngle = Math.max(drift.maxAngle, Math.abs(angle));
  drift.speed = speed;
  
  // Calculate running score for this drift
  // Formula: angle × duration × speed × zone multiplier
  const zoneMult = _getZoneMultiplier(matchState, drift.startPosition || position);
  const currentScore = drift.angle * drift.duration * (speed / 50) * zoneMult * matchState.comboMultiplier;
  
  drift.totalScore = currentScore;
  
  // Emit score update for HUD
  if (Math.floor(now / 100) % 3 === 0) { // Throttle updates
    ctx.engine.bus.emit('mode:drift:scoreUpdate', {
      vehicleId,
      currentScore: Math.round(currentScore),
      angle: Math.round(drift.angle * 100) / 100,
      duration: Math.round(drift.duration * 10) / 10,
      combo: matchState.comboMultiplier
    });
  }
}

export function onDriftEnd(ctx, matchState, { vehicleId, charge }) {
  const drift = matchState.currentDrifts.get(vehicleId);
  if (!drift) return;
  
  // Final score for this drift
  const zoneMult = _getZoneMultiplier(matchState, drift.startPosition || {});
  const finalScore = drift.maxAngle * drift.duration * ((drift.speed || 50) / 50) * zoneMult * matchState.comboMultiplier;
  
  // Apply charge bonus (mini-turbo style)
  const chargeBonus = charge ? charge * 500 : 0;
  const totalDriftScore = finalScore + chargeBonus;
  
  // Add to total score
  if (vehicleId === 'player') {
    matchState.playerScore += totalDriftScore;
  } else {
    matchState.aiScores.set(vehicleId, (matchState.aiScores.get(vehicleId) || 0) + totalDriftScore);
  }
  
  // Combo system
  const now = performance.now();
  if (now - matchState.lastDriftEndTime < 2000) { // Within 2 seconds of last drift
    matchState.comboCount++;
    matchState.comboMultiplier = Math.min(5, 1 + matchState.comboCount * 0.5); // Max 5x
    
    if (matchState.comboCount >= 3) {
      ctx.engine.bus.emit('mode:drift:combo', {
        vehicleId,
        comboCount: matchState.comboCount,
        multiplier: matchState.comboMultiplier
      });
    }
  } else {
    matchState.comboCount = 0;
    matchState.comboMultiplier = 1;
  }
  
  matchState.lastDriftEndTime = now;
  
  // Clear current drift
  matchState.currentDrifts.delete(vehicleId);
  
  ctx.engine.bus.emit('mode:drift:driftEnd', {
    vehicleId,
    driftScore: Math.round(totalDriftScore),
    angle: Math.round(drift.maxAngle * 100) / 100,
    duration: Math.round(drift.duration * 10) / 10,
    chargeBonus: Math.round(chargeBonus),
    combo: matchState.comboMultiplier,
    totalScore: vehicleId === 'player' ? Math.round(matchState.playerScore) : null
  });
}

function _getZoneMultiplier(matchState, position) {
  let mult = 1.0;
  
  matchState.zones.forEach(zone => {
    if (!position) return;
    
    const dx = position.x - zone.position.x;
    const dz = position.z - zone.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance < zone.radius) {
      mult = Math.max(mult, zone.multiplier);
      
      // Check if in center of zone (bonus)
      if (distance < zone.radius * 0.5) {
        mult *= 1.2; // Inner zone bonus
      }
    }
  });
  
  return mult;
}

export function update(ctx, matchState, dt) {
  const now = performance.now();
  const timeRemaining = Math.max(0, (matchState.endTime - now) / 1000);
  
  // Check if time's up
  if (timeRemaining <= 0 && !matchState.finished) {
    _endRound(ctx, matchState);
    return;
  }
  
  // Update active drifts (for those still drifting)
  matchState.currentDrifts.forEach((drift, id) => {
    if (drift && now - drift.startTime > 10) {
      // Auto-end very long drifts (probably stuck)
      onDriftEnd(ctx, matchState, { vehicleId: id, charge: 0 });
    }
  });
  
  // Emit time update
  if (Math.floor(timeRemaining) !== matchState.lastEmittedSecond) {
    matchState.lastEmittedSecond = Math.floor(timeRemaining);
    
    ctx.engine.bus.emit('mode:drift:timeUpdate', {
      timeRemaining: Math.ceil(timeRemaining),
      playerScore: Math.round(matchState.playerScore),
      positions: _getPositions(matchState)
    });
  }
}

function _endRound(ctx, matchState) {
  matchState.finished = true;
  
  // Calculate final standings
  const standings = [];
  
  standings.push({
    id: 'player',
    score: matchState.playerScore,
    isPlayer: true
  });
  
  matchState.aiScores.forEach((score, id) => {
    standings.push({ id, score, isPlayer: false });
  });
  
  // Sort by score descending
  standings.sort((a, b) => b.score - a.score);
  standings.forEach((s, i) => s.position = i + 1);
  
  // Check for high score
  const playerStanding = standings.find(s => s.isPlayer);
  
  if (playerStanding) {
    const isNewRecord = _checkHighScore(ctx, matchState.playerScore);
    
    if (isNewRecord) {
      ctx.engine.bus.emit('mode:drift:newHighScore', {
        score: matchState.playerScore,
        previousBest: matchState.highScores[0]?.score
      });
    }
  }
  
  ctx.engine.bus.emit('mode:drift:end', {
    standings,
    playerScore: matchState.playerScore,
    playerPosition: playerStanding?.position,
    highScores: matchState.highScores.slice(0, 10)
  });
}

function _checkHighScore(ctx, score) {
  const threshold = matchState.highScores.length < 10 ? 0 : matchState.highScores[matchState.highScores.length - 1].score;
  
  if (score > threshold) {
    // Add to high scores
    matchState.highScores.push({
      player: 'Player',
      score: Math.round(score),
      date: new Date().toISOString()
    });
    
    // Sort and keep top 100
    matchState.highScores.sort((a, b) => b.score - a.score);
    matchState.highScores = matchState.highScores.slice(0, 100);
    
    // Save
    try {
      localStorage.setItem('wzk5_drift_highscores', JSON.stringify(matchState.highScores));
    } catch (e) {
      console.warn('Could not save high scores:', e);
    }
    
    return true;
  }
  
  return false;
}

function _getPositions(matchState) {
  const positions = { player: matchState.playerScore };
  
  matchState.aiScores.forEach((score, id) => {
    positions[id] = score;
  });
  
  return Object.entries(positions)
    .sort((a, b) => b[1] - a[1])
    .reduce((acc, [id, score], idx) => ({ ...acc, [id]: idx + 1 }), {});
}

export function getScoreboard(ctx, matchState) {
  const timeRemaining = Math.max(0, (matchState.endTime - performance.now()) / 1000);
  
  return {
    timeRemaining: Math.ceil(timeRemaining),
    isFinished: matchState.finished || false,
    playerScore: Math.round(matchState.playerScore),
    positions: _getPositions(matchState),
    currentDrifts: Object.fromEntries(
      [...matchState.currentDrifts.entries()].map(([id, d]) => [
        id, { angle: d.angle, duration: d.duration, score: d.totalScore }
      ])
    ),
    combo: matchState.comboMultiplier,
    highScores: matchState.highScores.slice(0, 5).map(h => ({
      ...h,
      score: Math.round(h.score)
    }))
  };
}

export default { onMatchStart, onDriftStart, onDriftUpdate, onDriftEnd, update, getScoreboard };
