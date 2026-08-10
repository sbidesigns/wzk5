// barrel/modes/mode.teamRelay.js - Team Relay Mode
// 2v2 or 3v3 tag mechanic, team-based racing

export function onMatchStart(ctx, matchState) {
  // Team configuration
  matchState.teams = [
    { id: 'red', name: 'Red Team', members: [], score: 0, color: '#ff4444' },
    { id: 'blue', name: 'Blue Team', members: [], score: 0, color: '#4444ff' }
  ];
  
  matchState.lapsToComplete = ctx.matchConfig?.laps || 2; // Fewer laps per racer in relay
  matchState.currentRacer = new Map(); // team -> current racer ID
  matchState.racerLaps = new Map(); // racerId -> laps completed
  matchState.tagZone = { position: null, radius: 5 }; // Where tagging happens
  matchState.relayOrder = new Map(); // team -> array of racer IDs in order
  
  // Assign players to teams
  const playerIds = ['player'];
  if (ctx.aiVehicles) {
    for (let i = 0; i < ctx.aiVehicles.length; i++) {
      playerIds.push(`ai-${i}`);
    }
  }
  
  // Split players between teams
  playerIds.forEach((id, idx) => {
    const teamIdx = idx % 2;
    matchState.teams[teamIdx].members.push(id);
    
    // Initialize lap counter
    matchState.racerLaps.set(id, 0);
    
    // Set initial racers
    if (!matchState.currentRacer.has(matchState.teams[teamIdx].id)) {
      matchState.currentRacer.set(matchState.teams[teamIdx].id, id);
      matchState.relayOrder.set(matchState.teams[teamIdx].id, [id]);
    } else {
      matchState.relayOrder.get(matchState.teams[teamIdx].id).push(id);
    }
  });
  
  // Set up tag zone at start/finish line area
  matchState.tagZone.position = { x: 0, y: 0, z: 0 }; // Would be actual track position
  
  ctx.engine.bus.emit('mode:relay:start', {
    teams: matchState.teams.map(t => ({ id: t.id, name: t.name, members: t.members.length })),
    currentRacers: Object.fromEntries(matchState.currentRacer)
  });
}

export function onLapComplete(ctx, matchState, { vehicleId }) {
  // Find which team this racer belongs to
  const team = matchState.teams.find(t => t.members.includes(vehicleId));
  if (!team) return;
  
  // Increment laps for this racer
  const currentLaps = (matchState.racerLaps.get(vehicleId) || 0) + 1;
  matchState.racerLaps.set(vehicleId, currentLaps);
  
  ctx.engine.bus.emit('mode:relay:rapCompleted', {
    vehicleId,
    team: team.id,
    lap: currentLaps,
    totalLaps: matchState.lapsToComplete
  });
  
  // Check if this racer completed their required laps
  if (currentLaps >= matchState.lapsToComplete) {
    // Racer finished their stint - need to tag next teammate
    _handleTagZone(ctx, matchState, vehicleId, team);
  }
}

function _handleTagZone(ctx, matchState, finishingRacerId, team) {
  // Find next racer in relay order who hasn't raced yet
  const order = matchState.relayOrder.get(team.id) || [];
  const nextRacerIndex = order.indexOf(finishingRacerId) + 1;
  
  if (nextRacerIndex >= order.length) {
    // Team has completed all racers!
    team.score += order.length * 1000; // Base completion bonus
    
    ctx.engine.bus.emit('mode:relay:teamFinished', {
      team: team.id,
      score: team.score,
      finalRacer: finishingRacerId
    });
    
    // Check if all teams finished
    const allTeamsFinished = matchState.teams.every(t => 
      (t.members.every(m => (matchState.racerLaps.get(m) || 0) >= matchState.lapsToComplete))
    );
    
    if (allTeamsFinished || matchState.teams.filter(t => 
      t.members.some(m => (matchState.racerLaps.get(m) || 0) >= matchState.lapsToComplete)
    ).length >= matchState.teams.length - 1) {
      // Determine winner
      _determineWinner(ctx, matchState);
    }
    
    return;
  }
  
  const nextRacerId = order[nextRacerIndex];
  
  // Switch to next racer
  matchState.currentRacer.set(team.id, nextRacerId);
  
  ctx.engine.bus.emit('mode:relay:tag', {
    fromRacer: finishingRacerId,
    toRacer: nextRacerId,
    team: team.id,
    teamProgress: _getTeamProgress(matchState, team)
  });
}

function _getTeamProgress(matchState, team) {
  let totalLaps = 0;
  let completedStints = 0;
  
  team.members.forEach(memberId => {
    const laps = matchState.racerLaps.get(memberId) || 0;
    totalLaps += laps;
    if (laps >= matchState.lapsToComplete) completedStints++;
  });
  
  return { totalLaps, completedStints, members: team.members.length };
}

function _determineWinner(ctx, matchState) {
  // Calculate final scores
  matchState.teams.forEach(team => {
    let teamScore = 0;
    
    team.members.forEach(memberId => {
      const laps = matchState.racerLaps.get(memberId) || 0;
      teamScore += laps * 100; // Points per lap
      
      // Bonus for completing full stint
      if (laps >= matchState.lapsToComplete) {
        teamScore += 200; // Completion bonus
      }
    });
    
    // Position bonus (first team to finish gets extra)
    // This is simplified - would track finish order properly
    team.score = teamScore;
  });
  
  // Sort teams by score
  matchState.teams.sort((a, b) => b.score - a.score);
  
  const winner = matchState.teams[0];
  
  ctx.engine.bus.emit('mode:relay:winner', {
    winningTeam: winner.id,
    teamName: winner.name,
    score: winner.score,
    standings: matchState.teams.map(t => ({
      team: t.id,
      name: t.name,
      score: t.score,
      progress: _getTeamProgress(matchState, t)
    }))
  });
}

export function onTagAttempt(ctx, matchState, { chaserId, targetId }) {
  // When a racer tries to tag another (interference or wrong target)
  const chaserTeam = matchState.teams.find(t => t.members.includes(chaserId));
  const targetTeam = matchState.teams.find(t => t.members.includes(targetId));
  
  if (!chaserTeam || !targetTeam || chaserTeam.id === targetTeam.id) {
    // Can't tag own teammate (or invalid)
    return;
  }
  
  // Check if target is current racer for their team
  if (matchState.currentRacer.get(targetTeam.id) === targetId) {
    // Valid tag! Target is out, must tag next teammate
    ctx.engine.bus.emit('mode:relay:successfulTag', {
      chaser: chaserId,
      target: targetId,
      targetTeam: targetTeam.id
    });
    
    // Force tag
    _handleTagZone(ctx, matchState, targetId, targetTeam);
  }
}

export function getScoreboard(ctx, matchState) {
  return {
    teams: matchState.teams.map(t => ({
      ...t,
      progress: _getTeamProgress(matchState, t),
      currentRacer: matchState.currentRacer.get(t.id),
      racerLaps: Object.fromEntries(
        t.members.map(m => [m, matchState.racerLaps.get(m) || 0])
      )
    })),
    currentRacers: Object.fromEntries(matchState.currentRacer)
  };
}

export function getPlayerTeamInfo(ctx, matchState, playerId) {
  const team = matchState.teams.find(t => t.members.includes(playerId));
  if (!team) return null;
  
  return {
    teamId: team.id,
    teamName: team.name,
    teamColor: team.color,
    teammates: team.members.filter(m => m !== playerId),
    isCurrentRacer: matchState.currentRacer.get(team.id) === playerId,
    myLaps: matchState.racerLaps.get(playerId) || 0,
    lapsNeeded: matchState.lapsToComplete
  };
}

export default { onMatchStart, onLapComplete, onTagAttempt, getScoreboard, getPlayerTeamInfo };
