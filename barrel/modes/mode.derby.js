// barrel/modes/mode.derby.js - Derby Arena Mode
// Destruction arena with health bars, last vehicle moving wins

export function onMatchStart(ctx, matchState) {
  matchState.arenaType = ctx.matchConfig?.arenaType || 'standard'; // standard, pit, elevated
  matchState.arenaSize = { width: 100, length: 150 }; // Arena dimensions
  matchState.hazards = []; // Spinning blades, pits, hammers
  matchState.powerups = []; // Health pickups, boost pads, shields
  
  // All vehicles start with full health
  matchState.vehicles = new Map(); // vehicleId -> { health, maxHealth, kills, damageDealt }
  
  // Initialize player
  if (ctx.playerVehicle) {
    matchState.vehicles.set('player', {
      vehicle: ctx.playerVehicle,
      health: 100,
      maxHealth: 100,
      kills: 0,
      damageDealt: 0,
      alive: true,
      position: ctx.playerVehicle.getPosition()
    });
  }
  
  // Initialize AI
  if (ctx.aiVehicles) {
    ctx.aiVehicles.forEach((ai, idx) => {
      matchState.vehicles.set(`ai-${idx}`, {
        vehicle: ai,
        health: 100,
        maxHealth: 100,
        kills: 0,
        damageDealt: 0,
        alive: true,
        position: ai.getPosition()
      });
    });
  }
  
  // Setup arena hazards based on type
  _setupHazards(ctx, matchState);
  
  // Setup powerup spawn points
  _setupPowerups(ctx, matchState);
  
  // Start powerup respawn timer
  matchState.powerupRespawnInterval = 10; // Seconds
  matchState.lastPowerupSpawn = performance.now();
  
  ctx.engine.bus.emit('mode:derby:start', {
    arenaType: matchState.arenaType,
    vehiclesAlive: matchState.vehicles.size,
    hazards: matchState.hazards.length
  });
}

function _setupHazards(ctx, matchState) {
  const arenaCenter = { x: 0, z: 0 };
  
  switch (matchState.arenaType) {
    case 'pit':
      // Central pit that damages vehicles
      matchState.hazards.push({
        type: 'pit',
        position: { x: 0, y: 0, z: 0 },
        radius: 20,
        damagePerSecond: 15
      });
      
      // Spinning blades at corners
      [[-40, -55], [40, -55], [-40, 55], [40, 55]].forEach(([x, z]) => {
        matchState.hazards.push({
          type: 'blade',
          position: { x, y: 5, z },
          radius: 8,
          damagePerSecond: 30,
          rotationSpeed: 2 // rad/s
        });
      });
      break;
      
    case 'elevated':
      // Raised platforms with gaps
      for (let i = -2; i <= 2; i++) {
        if (i === 0) continue; // Gap in center
        matchState.hazards.push({
          type: 'platform',
          position: { x: i * 25, y: 3, z: 0 },
          size: { width: 20, height: 1, depth: 60 }
        });
      }
      
      // Falling off = instant death
      matchState.hazards.push({
        type: 'void',
        position: { x: 0, y: -5, z: 0 },
        radius: 80,
        damagePerSecond: 999
      });
      break;
      
    default: // standard
      // Spinning hammers around edges
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const radius = 45;
        matchState.hazards.push({
          type: 'hammer',
          position: { 
            x: Math.cos(angle) * radius, 
            y: 8, 
            z: Math.sin(angle) * radius 
          },
          swingArc: Math.PI * 0.5,
          swingSpeed: 1.5,
          damage: 25
        });
      }
      
      // Spike strips along walls
      [[-48, 0], [48, 0], [0, -68], [0, 68]].forEach(([x, z]) => {
        matchState.hazards.push({
          type: 'spikes',
          position: { x, y: 0, z },
          size: { width: 4, depth: 30, height: 1 },
          damagePerSecond: 10
        });
      });
  }
  
  ctx.engine.bus.emit('mode:derby:hazardsSetup', { hazards: matchState.hazards });
}

function _setupPowerups(ctx, matchState) {
  // Define spawn points for powerups
  matchState.powerupSpawnPoints = [
    { type: 'health', position: { x: -30, y: 1, z: 0 }, respawnTime: 15 },
    { type: 'health', position: { x: 30, y: 1, z: 0 }, respawnTime: 15 },
    { type: 'boost', position: { x: 0, y: 1, z: -35 }, respawnTime: 10 },
    { type: 'boost', position: { x: 0, y: 1, z: 35 }, respawnTime: 10 },
    { type: 'shield', position: { x: -20, y: 1, z: -20 }, respawnTime: 20 },
    { type: 'shield', position: { x: 20, y: 1, z: 20 }, respawnTime: 20 },
    { type: 'nitrous', position: { x: 0, y: 1, z: 0 }, respawnTime: 25 } // Center is rare
  ];
  
  // Initialize active powerups from spawn points
  matchState.activePowerups = matchState.powerupSpawnPoints.map(p => ({
    ...p,
    active: true,
    spawnedAt: performance.now()
  }));
}

export function update(ctx, matchState, dt) {
  const now = performance.now();
  
  // Update hazard effects
  _updateHazards(ctx, matchState, dt);
  
  // Spawn/respawn powerups
  if (now - matchState.lastPowerupSpawn >= matchState.powerupRespawnInterval * 1000) {
    _respawnPowerups(ctx, matchState);
    matchState.lastPowerupSpawn = now;
  }
  
  // Check powerup collisions
  _checkPowerupCollisions(ctx, matchState);
  
  // Check win condition
  const aliveVehicles = [...matchState.vehicles.entries()].filter(([, data]) => data.alive);
  
  if (aliveVehicles.length <= 1) {
    const winner = aliveVehicles[0];
    if (winner) {
      ctx.engine.bus.emit('mode:derby:winner', {
        playerId: winner[0],
        kills: winner[1].kills,
        damageDealt: winner[1].damageDealt,
        survivalTime: now
      });
    } else {
      ctx.engine.bus.emit('mode:derby:draw');
    }
  }
  
  // Update standings
  _updateStandings(ctx, matchState);
}

function _updateHazards(ctx, matchState, dt) {
  matchState.vehicles.forEach((data, vehicleId) => {
    if (!data.alive || !data.position) return;
    
    // Check each hazard
    matchState.hazards.forEach(hazard => {
      const dx = data.position.x - hazard.position.x;
      const dz = data.position.z - hazard.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      if (distance < (hazard.radius || 10)) {
        // Vehicle is in hazard zone
        let damage = 0;
        
        switch (hazard.type) {
          case 'pit':
          case 'spikes':
          case 'void':
          case 'blade':
            damage = (hazard.damagePerSecond || 10) * dt;
            break;
            
          case 'hammer':
            // Hammer swings - check timing
            const swingPhase = (now / 1000) % (Math.PI * 2 / hazard.swingSpeed);
            const hammerAngle = Math.sin(swingPhase) * hazard.swingArc;
            const angleToHammer = Math.atan2(dz, dx);
            
            if (Math.abs(angleToHammer - hammerAngle) < 0.3) {
              damage = hazard.damage || 25;
              ctx.engine.bus.emit('mode:derby:hammerHit', { vehicleId, hazard });
            }
            break;
            
          case 'platform':
            // Check if fallen off platform
            if (data.position.y < hazard.position.y - 2) {
              damage = 999; // Instant death from falling
            }
            break;
        }
        
        if (damage > 0 && data.vehicle) {
          data.vehicle.takeDamage(damage);
          
          if (data.vehicle.health <= 0) {
            _destroyVehicle(ctx, matchState, vehicleId, hazard.type);
          }
          
          ctx.engine.bus.emit('mode:derby:hazardDamage', {
            vehicleId,
            hazardType: hazard.type,
            damage
          });
        }
      }
    });
  });
}

function _respawnPowerups(ctx, matchState) {
  matchState.activePowerups.forEach((powerup, idx) => {
    if (!powerup.active) {
      // Respawn this powerup
      const timeSinceDeath = (performance.now() - (powerup.despawnedAt || 0)) / 1000;
      
      if (timeSinceDeath >= powerup.respawnTime) {
        matchState.activePowerups[idx].active = true;
        matchState.activePowerups[idx].spawnedAt = performance.now();
        
        ctx.engine.bus.emit('mode:derby:powerupSpawned', { powerup });
      }
    }
  });
}

function _checkPowerupCollisions(ctx, matchState) {
  matchState.vehicles.forEach((data, vehicleId) => {
    if (!data.alive || !data.position) return;
    
    matchState.activePowerups.forEach((powerup, idx) => {
      if (!powerup.active) return;
      
      const dx = data.position.x - powerup.position.x;
      const dz = data.position.z - powerup.position.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      if (distance < 3) // Pickup range
      {
        // Apply powerup effect
        _applyPowerup(ctx, matchState, vehicleId, powerup.type);
        
        // Despawn powerup
        matchState.activePowerups[idx].active = false;
        matchState.activePowerups[idx].despawnedAt = performance.now();
        
        ctx.engine.bus.emit('mode:derby:powerupCollected', {
          vehicleId,
          powerupType: powerup.type
        });
      }
    });
  });
}

function _applyPowerup(ctx, matchState, vehicleId, powerupType) {
  const data = matchState.vehicles.get(vehicleId);
  if (!data || !data.vehicle) return;
  
  switch (powerupType) {
    case 'health':
      data.vehicle.repair(30);
      break;
    case 'boost':
      data.vehicle.applyBoost(1.2, 3);
      break;
    case 'shield':
      // Temporary invincibility would go here
      data.vehicle.health = Math.min(data.maxHealth, data.health + 50);
      break;
    case 'nitrous':
      data.vehicle.refuelNitrous(50);
      break;
  }
}

export function onCollision(ctx, matchState, { attackerId, defenderId, impactStrength }) {
  const attackerData = matchState.vehicles.get(attackerId);
  const defenderData = matchState.vehicles.get(defenderId);
  
  if (!attackerData || !defenderData) return;
  
  // Calculate damage based on impact strength and relative velocity
  const baseDamage = impactStrength * 2;
  
  // Apply damage to defender
  if (defenderData.vehicle) {
    defenderData.vehicle.takeDamage(baseDamage);
    
    if (defenderData.vehicle.health <= 0) {
      _destroyVehicle(ctx, matchState, defenderId, 'collision');
      
      // Award kill to attacker
      attackerData.kills++;
      ctx.engine.bus.emit('mode:derby:kill', {
        killer: attackerId,
        victim: defenderId,
        cause: 'collision'
      });
    }
  }
  
  // Track damage dealt for scoring
  attackerData.damageDealt += baseDamage;
}

function _destroyVehicle(ctx, matchState, vehicleId, cause) {
  const data = matchState.vehicles.get(vehicleId);
  if (!data) return;
  
  data.alive = false;
  data.deathCause = cause;
  data.deathTime = performance.now();
  
  // Despawn after delay for visual effect
  setTimeout(() => {
    if (data.vehicle) {
      data.vehicle.despawn();
    }
  }, 2000);
  
  ctx.engine.bus.emit('mode:derby:vehicleDestroyed', {
    vehicleId,
    cause,
    kills: data.kills,
    remaining: [...matchState.vehicles.values()].filter(v => v.alive).length
  });
}

function _updateStandings(ctx, matchState) {
  const standings = [];
  
  matchState.vehicles.forEach((data, id) => {
    standings.push({
      id,
      alive: data.alive,
      health: data.vehicle ? data.vehicle.health : 0,
      kills: data.kills,
      damageDealt: data.damageDealt,
      survivalTime: data.deathTime ? (data.deathTime - matchState.startTime) : (performance.now() - matchState.startTime)
    });
  });
  
  // Sort by: alive first, then by kills desc, then by health desc
  standings.sort((a, b) => {
    if (a.alive !== b.alive) return b.alive ? 1 : -1;
    if (a.kills !== b.kills) return b.kills - a.kills;
    return b.health - a.health;
  });
  
  standings.forEach((s, i) => s.position = i + 1);
  
  ctx.engine.bus.emit('mode:derby:standingsUpdate', { standings });
}

export function getScoreboard(ctx, matchState) {
  const standings = [];
  
  matchState.vehicles.forEach((data, id) => {
    standings.push({
      id,
      alive: data.alive,
      health: data.vehicle ? Math.round(data.vehicle.health) : 0,
      maxHealth: data.maxHealth,
      kills: data.kills,
      damageDealt: Math.round(data.damageDealt),
      deathCause: data.deathCause || null
    });
  });
  
  standings.sort((a, b) => {
    if (a.alive !== b.alive) return b.alive ? 1 : -1;
    if (a.kills !== b.kills) return b.kills - a.kills;
    return b.health - a.health;
  });
  
  standings.forEach((s, i) => s.rank = i + 1);
  
  return {
    standings,
    hazards: matchState.hazards.map(h => ({
      type: h.type,
      position: h.position,
      active: true
    })),
    powerups: matchState.activePowerups.filter(p => p.active).map(p => ({
      type: p.type,
      position: p.position
    }))
  };
}

export default { onMatchStart, update, onCollision, getScoreboard };
