// core/TournamentSimulator.js
// Physics-based race simulation for tournaments.
// Simulates complete races using actual vehicle physics parameters,
// character abilities, part modifiers, track characteristics, and AI personality.

import { EventBus } from './EventBus.js';

/**
 * @typedef {Object} VehicleStats
 * @property {number} topSpeed - Maximum speed in km/h
 * @property {number} acceleration - 0-1 acceleration rating
 * @property {number} handling - 0-1 cornering ability
 * @property {number} offroad - 0-1 off-road capability
 * @property {number} mass - Vehicle mass (affects collisions)
 */

/**
 * @typedef {Object} CharacterAbility
 * @property {number} perfectStartBonus - Time bonus on perfect start (seconds)
 * @property {number} driftMultiplier - Drift score multiplier
 * @property {number} massBonus - Mass modification factor
 * @property {number} boostDuration - Extra boost duration
 */

/**
 * @typedef {Object} PartModifier
 * @property {Object} statMods - Stat modifications from parts
 * @property {number} [statMods.topSpeed] - Speed modifier
 * @property {number} [statMods.acceleration] - Acceleration modifier
 * @property {number} [statMods.handling] - Handling modifier
 */

/**
 * @typedef {Object} TrackSector
 * @property {string} type - 'straight', 'corner', 'chicane', 'jump'
 * @property {number} length - Sector length in meters
 * @property {number} difficulty - 0-1 difficulty rating
 * @property {string} surface - 'asphalt', 'dirt', 'grass', 'ice'
 * @property {number} optimalSpeed - Optimal speed through sector
 */

/**
 * @typedef {Object} AIPersonality
 * @property {string} style - 'aggressive', 'balanced', 'defensive', 'drifter'
 * @property {number} skill - 0-1 driver skill level
 * @property {number} riskTaking - 0-1 willingness to take risks
 * @property {number} consistency - 0-1 consistency of performance
 */

/**
 * @typedef {Object} SimulationResult
 * @property {Array} results - Finishing order with times
 * @property {Array} highlights - Notable race events
 * @property {Object} statistics - Aggregate race statistics
 */

// Surface type modifiers affecting vehicle performance
const SURFACE_MODIFIERS = {
  asphalt: { speed: 1.0, grip: 1.0, wear: 1.0 },
  dirt: { speed: 0.85, grip: 0.7, wear: 1.5 },
  grass: { speed: 0.6, grip: 0.4, wear: 2.0 },
  ice: { speed: 0.9, grip: 0.3, wear: 0.8 },
  gravel: { speed: 0.8, grip: 0.65, wear: 1.8 }
};

// AI personality effects on racing behavior
const PERSONALITY_MODIFIERS = {
  aggressive: { overtakingBonus: 0.15, crashRisk: 0.12, itemAggression: 0.3 },
  balanced: { overtakingBonus: 0.0, crashRisk: 0.05, itemAggression: 0.1 },
  defensive: { overtakingBonus: -0.1, crashRisk: 0.02, itemAggression: 0.05 },
  drifter: { overtakingBonus: 0.05, crashRisk: 0.08, itemAggression: 0.15, driftBonus: 0.2 }
};

class TournamentSimulator {
  constructor() {
    this._trackCache = new Map();
    this._simulationHistory = [];
    /** @type {SimulationResult|null} */
    this._lastResult = null;
  }

  /**
   * Generate track sectors from track data
   * @param {Object} trackData - Track configuration
   * @returns {TrackSector[]} Array of track sectors
   */
  generateTrackSectors(trackData) {
    const cacheKey = trackData.id || 'unknown';
    if (this._trackCache.has(cacheKey)) {
      return this._trackCache.get(cacheKey);
    }

    const sectors = [];
    const totalLength = trackData.length || 2000;
    
    // Parse track features or generate procedural sectors
    const features = trackData.features || this._generateProceduralFeatures(totalLength);
    
    let currentPosition = 0;
    for (const feature of features) {
      sectors.push({
        type: feature.type,
        length: feature.length,
        difficulty: feature.difficulty || 0.5,
        surface: feature.surface || 'asphalt',
        optimalSpeed: feature.optimalSpeed || 150,
        startPosition: currentPosition,
        endPosition: currentPosition + feature.length
      });
      currentPosition += feature.length;
    }

    this._trackCache.set(cacheKey, sectors);
    console.log(`[TournamentSimulator] Generated ${sectors.length} sectors for track ${cacheKey}`);
    return sectors;
  }

  /**
   * Generate procedural track features if not provided
   * @private
   */
  _generateProceduralFeatures(totalLength) {
    const features = [];
    let remaining = totalLength;
    
    // Start/finish straight (longer)
    const startStraight = Math.min(remaining * 0.15, 400);
    features.push({ type: 'straight', length: startStraight, difficulty: 0.2, optimalSpeed: 200 });
    remaining -= startStraight;

    while (remaining > 200) {
      const rand = Math.random();
      if (rand < 0.4) {
        // Straight section
        const len = 150 + Math.random() * 300;
        features.push({ type: 'straight', length: Math.min(len, remaining), difficulty: 0.2, optimalSpeed: 190 });
      } else if (rand < 0.7) {
        // Corner
        const len = 80 + Math.random() * 120;
        features.push({ type: 'corner', length: Math.min(len, remaining), difficulty: 0.6, optimalSpeed: 100 });
      } else if (rand < 0.85) {
        // Chicane
        const len = 60 + Math.random() * 60;
        features.push({ type: 'chicane', length: Math.min(len, remaining), difficulty: 0.8, optimalSpeed: 80 });
      } else {
        // Jump/elevation change
        const len = 50 + Math.random() * 50;
        features.push({ type: 'jump', length: Math.min(len, remaining), difficulty: 0.4, optimalSpeed: 140 });
      }
      remaining -= features[features.length - 1].length;
    }

    // Final straight to finish
    if (remaining > 0) {
      features.push({ type: 'straight', length: remaining, difficulty: 0.2, optimalSpeed: 200 });
    }

    return features;
  }

  /**
   * Calculate effective vehicle stats with all modifiers applied
   * @param {VehicleStats} baseStats - Base vehicle statistics
   * @param {CharacterAbility} ability - Character abilities
   * @param {PartModifier} parts - Equipped parts modifiers
   * @returns {VehicleStats} Modified effective stats
   */
  calculateEffectiveStats(baseStats, ability = {}, parts = {}) {
    const statMods = parts.statMods || {};
    
    return {
      topSpeed: (baseStats.topSpeed || 180) * (1 + (statMods.topSpeed || 0)),
      acceleration: Math.min(1, (baseStats.acceleration || 0.7) + (statMods.acceleration || 0)),
      handling: Math.min(1, (baseStats.handling || 0.7) + (statMods.handling || 0)),
      offroad: (baseStats.offroad || 0.5),
      mass: (baseStats.mass || 1000) * (1 + (ability.massBonus || 0))
    };
  }

  /**
   * Calculate theoretical time for a single sector
   * @private
   * @param {TrackSector} sector - The sector to calculate
   * @param {VehicleStats} effectiveStats - Effective vehicle stats
   * @param {AIPersonality} personality - AI driver personality
   * @returns {number} Time in seconds
   */
  _calculateSectorTime(sector, effectiveStats, personality) {
    const surfaceMod = SURFACE_MODIFIERS[sector.surface] || SURFACE_MODIFIERS.asphalt;
    const persMod = PERSONALITY_MODIFIERS[personality.style] || PERSONALITY_MODIFIERS.balanced;

    // Base time calculation
    const effectiveSpeed = effectiveStats.topSpeed * surfaceMod.speed;
    const baseTime = sector.length / (effectiveSpeed / 3.6); // Convert km/h to m/s

    // Handling modifier for corners/chicanes
    let handlingPenalty = 0;
    if (sector.type === 'corner' || sector.type === 'chicane') {
      const handlingFactor = effectiveStats.handling * surfaceMod.grip;
      handlingPenalty = baseTime * sector.difficulty * (1 - handlingFactor) * 0.5;
    }

    // Offroad penalty
    let offroadPenalty = 0;
    if (sector.surface !== 'asphalt') {
      offroadPenalty = baseTime * (1 - effectiveStats.offroad) * 0.3;
    }

    // Skill and consistency variance
    const skillVariance = (1 - personality.skill) * 0.15; // Less skilled = more variance
    const consistencyRoll = (Math.random() - 0.5) * 2 * (1 - personality.consistency) * 0.1;
    
    // Personality bonuses
    const driftTimeBonus = (persMod.driftBonus || 0) * (sector.type === 'corner' ? -0.02 : 0);

    const totalTime = baseTime + handlingPenalty + offroadPenalty;
    const modifiedTime = totalTime * (1 + skillVariance + consistencyRoll + driftTimeBonus);

    return Math.max(0.1, modifiedTime);
  }

  /**
   * Simulate incidents during a race
   * @private
   * @param {Object} participant - Race participant
   * @param {AIPersonality} personality - AI personality
   * @param {number} currentTime - Current race time
   * @param {Array} highlights - Highlights array to append to
   * @returns {number} Time penalty from incidents
   */
  _simulateIncidents(participant, personality, currentTime, highlights) {
    const persMod = PERSONALITY_MODIFIERS[personality.style] || PERSONALITY_MODIFIERS.balanced;
    let totalPenalty = 0;

    // Crash probability based on aggression and risk-taking
    if (Math.random() < persMod.crashRisk * personality.riskTaking) {
      const crashSeverity = 0.5 + Math.random() * 2.0; // 0.5-2.5 second penalty
      totalPenalty += crashSeverity;
      highlights.push({
        type: 'crash',
        time: parseFloat(currentTime.toFixed(2)),
        victim: participant.id,
        cause: Math.random() < 0.5 ? 'wall' : 'vehicle',
        severity: parseFloat(crashSeverity.toFixed(2))
      });
      console.log(`[TournamentSimulator] Crash for ${participant.name}: ${crashSeverity.toFixed(2)}s penalty`);
    }

    // Spinout probability (lower than crash)
    if (Math.random() < persMod.crashRisk * 0.5 * personality.riskTaking) {
      const spinoutTime = 0.3 + Math.random() * 0.7;
      totalPenalty += spinoutTime;
      highlights.push({
        type: 'spinout',
        time: parseFloat(currentTime.toFixed(2)),
        victim: participant.id,
        duration: parseFloat(spinoutTime.toFixed(2))
      });
    }

    return totalPenalty;
  }

  /**
   * Simulate item usage interactions
   * @private
   * @param {Object} participant - Race participant
   * @param {AIPersonality} personality - AI personality
   * @param {Array} allParticipants - All race participants
   * @param {number} currentIndex - Current position index
   * @param {number} currentTime - Current race time
   * @param {Array} highlights - Highlights array to append to
   * @returns {{timeEffect: number, itemStats: Object}} Item effects
   */
  _simulateItems(participant, personality, allParticipants, currentIndex, currentTime, highlights) {
    const persMod = PERSONALITY_MODIFIERS[personality.style] || PERSONALITY_MODIFIERS.balanced;
    const itemStats = { boosts: 0, shields: 0, missiles: 0 };
    let timeEffect = 0;

    // Probability of getting an item this sector
    if (Math.random() < 0.25) {
      const itemRoll = Math.random();
      
      if (itemRoll < 0.4) {
        // Boost
        const boostTime = -(0.3 + Math.random() * 0.5); // Negative = time saved
        timeEffect += boostTime;
        itemStats.boosts++;
        highlights.push({
          type: 'item_use',
          time: parseFloat(currentTime.toFixed(2)),
          user: participant.id,
          item: 'boost',
          effect: parseFloat(boostTime.toFixed(2))
        });
      } else if (itemRoll < 0.6) {
        // Shield (defensive)
        itemStats.shields++;
        // Shield might block a future attack - simplified as small time save
        if (Math.random() < 0.3) {
          timeEffect -= 0.2; // Blocked attack
          highlights.push({
            type: 'item_use',
            time: parseFloat(currentTime.toFixed(2)),
            user: participant.id,
            item: 'shield_blocked'
          });
        }
      } else if (itemRoll < 0.85 && persMod.itemAggression > 0.1) {
        // Missile/attack (if aggressive enough)
        const targetIdx = Math.max(0, currentIndex - 1 - Math.floor(Math.random() * 2));
        if (targetIdx < allParticipants.length && targetIdx !== currentIndex) {
          const target = allParticipants[targetIdx];
          const hitChance = 0.4 + persMod.itemAggression;
          
          if (Math.random() < hitChance) {
            itemStats.missiles++;
            highlights.push({
              type: 'item_use',
              time: parseFloat(currentTime.toFixed(2)),
              user: participant.id,
              item: 'missile',
              target: target.id,
              hit: true
            });
          }
        }
      }
    }

    return { timeEffect, itemStats };
  }

  /**
   * Simulate overtaking attempts
   * @private
   * @param {Object} participant - Overtaking driver
   * @param {Object} target - Driver being overtaken
   * @param {number} speedDelta - Speed difference (positive = faster)
   * @param {AIPersonality} personality - AI personality
   * @param {number} currentTime - Race time
   * @param {number} sectorIndex - Current sector
   * @param {Array} highlights - Highlights array
   * @returns {boolean} Whether overtake was successful
   */
  _simulateOvertake(participant, target, speedDelta, personality, currentTime, sectorIndex, highlights) {
    const persMod = PERSONALITY_MODIFIERS[personality.style] || PERSONALITY_MODIFIERS.balanced;
    
    // Base success chance from speed delta
    let successChance = Math.min(0.9, 0.3 + speedDelta * 0.02);
    
    // Personality modifiers
    successChance += persMod.overtakingBonus;
    successChance += personality.riskTaking * 0.1;
    
    // Skill matters
    successChance *= (0.5 + personality.skill * 0.5);

    const success = Math.random() < successChance;
    
    highlights.push({
      type: 'overtake',
      time: parseFloat(currentTime.toFixed(2)),
      attacker: participant.id,
      defender: target.id,
      sector: sectorIndex,
      success
    });

    return success;
  }

  /**
   * Run complete race simulation
   * @param {Object} options - Simulation options
   * @param {Array} options.participants - Array of participants with configs
   * @param {Object} options.track - Track data
   * @param {number} options.laps - Number of laps
   * @param {string} options.mode - Race mode ('circuit', 'sprint', 'drift', 'derby')
   * @returns {SimulationResult} Complete simulation result
   */
  simulateRace(options) {
    const {
      participants = [],
      track = {},
      laps = 3,
      mode = 'circuit'
    } = options;

    console.log(`[TournamentSimulator] Starting ${mode} simulation: ${participants.length} racers, ${laps} laps`);

    const sectors = this.generateTrackSectors(track);
    const highlights = [];
    const statistics = {
      averageSpeed: { min: Infinity, max: 0, mean: 0 },
      overtakes: { total: 0, successful: 0 },
      incidents: { crashes: 0, spinouts: 0 },
      itemUsage: { boosts: 0, shields: 0, missiles: 0 }
    };

    // Initialize participant states
    const racerStates = participants.map((p, idx) => ({
      ...p,
      index: idx,
      totalTime: 0,
      lapTimes: [],
      currentPosition: idx + 1,
      positions: [idx + 1], // Position tracking per sector
      sectorTimes: [],
      effectiveStats: this.calculateEffectiveStats(p.vehicleStats || {}, p.characterAbility || {}, p.parts || {}),
      personality: p.personality || { style: 'balanced', skill: 0.5 + Math.random() * 0.5, riskTaking: 0.5, consistency: 0.7 }
    }));

    // Perfect start bonus calculation
    for (const racer of racerStates) {
      const startBonus = racer.characterAbility?.perfectStartBonus || 0;
      if (Math.random() < 0.3 + racer.personality.skill * 0.4) {
        racer.totalTime -= startBonus;
        if (startBonus > 0) {
          highlights.push({
            type: 'perfect_start',
            time: 0,
            player: racer.id,
            bonus: startBonus
          });
        }
      }
    }

    // Simulate each lap
    for (let lap = 0; lap < laps; lap++) {
      // Simulate each sector
      for (let sIdx = 0; sIdx < sectors.length; sIdx++) {
        const sector = sectors[sIdx];
        
        // Calculate sector times for each racer
        for (const racer of racerStates) {
          const sectorTime = this._calculateSectorTime(sector, racer.effectiveStats, racer.personality);
          
          // Add incident penalties
          const incidentPenalty = this._simulateIncidents(racer, racer.personality, racer.totalTime, highlights);
          
          // Simulate items
          const itemResult = this._simulateItems(
            racer, 
            racer.personality, 
            racerStates, 
            racerStates.indexOf(racer), 
            racer.totalTime,
            highlights
          );
          
          // Update statistics
          statistics.itemUsage.boosts += itemResult.itemStats.boosts;
          statistics.itemUsage.shields += itemResult.itemStats.shields;
          statistics.itemUsage.missiles += itemResult.itemStats.missiles;
          
          // Track incidents
          if (incidentPenalty > 0) {
            const lastHighlight = highlights[highlights.length - 1];
            if (lastHighlight?.type === 'crash') statistics.incidents.crashes++;
            if (lastHighlight?.type === 'spinout') statistics.incidents.spinouts++;
          }

          const totalSectorTime = sectorTime + incidentPenalty + itemResult.timeEffect;
          racer.sectorTimes.push(totalSectorTime);
          racer.totalTime += totalSectorTime;

          // Track speed for statistics
          const sectorAvgSpeed = sector.length / totalSectorTime * 3.6; // km/h
          statistics.averageSpeed.min = Math.min(statistics.averageSpeed.min, sectorAvgSpeed);
          statistics.averageSpeed.max = Math.max(statistics.averageSpeed.max, sectorAvgSpeed);
        }

        // Process overtaking (sort by current time)
        racerStates.sort((a, b) => a.totalTime - b.totalTime);
        
        // Check for position changes and simulate overtakes
        for (let i = 0; i < racerStates.length; i++) {
          const newPos = i + 1;
          const racer = racerStates[i];
          if (racer.positions[racer.positions.length - 1] !== newPos) {
            // Position changed - find who was overtaken
            const oldPos = racer.positions[racer.positions.length - 1];
            const overtaken = racerStates.find(r => 
              r.positions[r.positions.length - 1] === newPos && r !== racer
            );
            
            if (overtaken) {
              const speedDelta = racer.effectiveStats.topSpeed - overtaken.effectiveStats.topSpeed;
              const overtakeSuccess = this._simulateOvertake(
                racer, overtaken, speedDelta, racer.personality, 
                racer.totalTime, sIdx, highlights
              );
              
              statistics.overtakes.total++;
              if (overtakeSuccess) statistics.overtakes.successful++;
            }
          }
          racer.positions.push(newPos);
        }
      }

      // Record lap times
      for (const racer of racerStates) {
        const lapStart = lap === 0 ? 0 : 
          racer.sectorTimes.slice(0, lap * sectors.length).reduce((a, b) => a + b, 0);
        const lapEnd = racer.sectorTimes.slice(0, (lap + 1) * sectors.length).reduce((a, b) => a + b, 0);
        racer.lapTimes.push(lapEnd - lapStart);
      }
    }

    // Final sorting by total time
    racerStates.sort((a, b) => a.totalTime - b.totalTime);
    
    // Assign final positions
    const results = racerStates.map((racer, idx) => ({
      playerId: racer.id,
      playerName: racer.name,
      vehicleId: racer.vehicleId,
      totalTime: parseFloat(racer.totalTime.toFixed(3)),
      bestLap: parseFloat(Math.min(...racer.lapTimes).toFixed(3)),
      lapTimes: racer.lapTimes.map(t => parseFloat(t.toFixed(3))),
      positions: racer.positions,
      finalPosition: idx + 1
    }));

    // Calculate mean average speed
    statistics.averageSpeed.mean = (statistics.averageSpeed.min + statistics.averageSpeed.max) / 2;

    const result = {
      results,
      highlights,
      statistics,
      metadata: {
        track: track.id || 'unknown',
        mode,
        laps,
        participants: participants.length,
        simulatedAt: new Date().toISOString()
      }
    };

    this._lastResult = result;
    this._simulationHistory.push(result);
    
    console.log(`[TournamentSimulator] Simulation complete. Winner: ${results[0].playerName} (${results[0].totalTime}s)`);
    EventBus.emit('tournament:simulationComplete', result);
    
    return result;
  }

  /**
   * Run bracket-style tournament with proper seeding
   * @param {Array} participants - Tournament participants
   * @param {Object} track - Track data
   * @param {Object} options - Tournament options
   * @returns {Object} Complete tournament results
   */
  simulateBracket(participants, track, options = {}) {
    const {
      laps = 3,
      mode = 'circuit',
      playersPerRace = 4,
      bracketType = 'single_elimination'
    } = options;

    console.log(`[TournamentSimulator] Starting bracket tournament with ${participants.length} players`);
    
    // Seed participants (by skill rating if available)
    const seeded = [...participants].sort((a, b) => {
      const skillA = a.personality?.skill || 0.5;
      const skillB = b.personality?.skill || 0.5;
      return skillB - skillA; // Higher skill first
    });

    const bracketRounds = [];
    let currentRound = seeded;
    let roundNumber = 1;

    while (currentRound.length > 1) {
      const roundResults = [];
      const nextRound = [];

      // Group into races
      for (let i = 0; i < currentRound.length; i += playersPerRace) {
        const raceGroup = currentRound.slice(i, i + playersPerRace);
        
        // Simulate race
        const raceResult = this.simulateRace({
          participants: raceGroup,
          track,
          laps,
          mode
        });

        // Advance top finishers (typically top half)
        const advancers = Math.ceil(playersPerRace / 2);
        const qualifiers = raceResult.results.slice(0, advancers);
        
        roundResults.push({
          round: roundNumber,
          match: Math.floor(i / playersPerRace) + 1,
          participants: raceGroup.map(p => p.id),
          results: raceResult.results,
          qualifiers: qualifiers.map(q => q.playerId)
        });

        qualifiers.forEach(q => {
          const original = currentRound.find(p => p.id === q.playerId);
          if (original) nextRound.push(original);
        });
      }

      bracketRounds.push({
        round: roundNumber,
        matches: roundResults
      });

      currentRound = nextRound;
      roundNumber++;
    }

    const tournamentResult = {
      winner: currentRound[0],
      rounds: bracketRounds,
      totalParticipants: participants.length,
      completedAt: new Date().toISOString()
    };

    EventBus.emit('tournament:bracketComplete', tournamentResult);
    return tournamentResult;
  }

  /**
   * Get simulation result for specific race mode
   * @param {string} mode - Race mode
   * @param {Object} baseOptions - Base simulation options
   * @returns {SimulationResult} Mode-specific result
   */
  simulateByMode(mode, baseOptions) {
    switch (mode) {
      case 'circuit':
        return this.simulateRace({ ...baseOptions, laps: baseOptions.laps || 3 });
      
      case 'sprint':
        // Shorter race, fewer laps
        return this.simulateRace({ ...baseOptions, laps: 1 });
      
      case 'drift':
        // Score-based rather than time-based
        return this._simulateDriftMode(baseOptions);
      
      case 'derby':
        // Damage/destruction based
        return this._simulateDerbyMode(baseOptions);
      
      case 'timeTrial':
        // Single lap, no items or interaction
        return this.simulateRace({ ...baseOptions, laps: 1, mode: 'timeTrial' });
      
      default:
        return this.simulateRace(baseOptions);
    }
  }

  /**
   * Simulate drift scoring mode
   * @private
   */
  _simulateDriftMode(options) {
    const { participants = [], track = {} } = options;
    const sectors = this.generateTrackSectors(track);
    const highlights = [];
    
    const results = participants.map(p => {
      const stats = this.calculateEffectiveStats(p.vehicleStats || {}, p.characterAbility || {}, p.parts || {});
      const personality = p.personality || { style: 'drifter', skill: 0.5 };
      const persMod = PERSONALITY_MODIFIERS[personality.style] || {};
      
      let totalScore = 0;
      const driftScores = [];
      
      // Find corner sectors for drifting
      const corners = sectors.filter(s => s.type === 'corner' || s.type === 'chicane');
      
      for (const corner of corners) {
        // Base drift score from handling
        const baseScore = 100 * stats.handling * corner.difficulty;
        
        // Drift multiplier from character ability
        const driftMult = (p.characterAbility?.driftMultiplier || 1) + (persMod.driftBonus || 0);
        
        // Variance from skill
        const skillVar = 0.7 + personality.skill * 0.6; // 0.7-1.3 range
        
        // Random angle/speed factors
        const execution = 0.8 + Math.random() * 0.4; // Execution quality
        
        const cornerScore = baseScore * driftMult * skillVar * execution;
        totalScore += cornerScore;
        driftScores.push(Math.round(cornerScore));
        
        if (cornerScore > 150) {
          highlights.push({
            type: 'great_drift',
            player: p.id,
            score: Math.round(cornerScore)
          });
        }
      }

      return {
        playerId: p.id,
        playerName: p.name,
        vehicleId: p.vehicleId,
        totalScore: Math.round(totalScore),
        driftScores,
        bestDrift: Math.max(...driftScores)
      };
    });

    // Sort by score descending
    results.sort((a, b) => b.totalScore - a.totalScore);
    results.forEach((r, i) => r.finalPosition = i + 1);

    return {
      results,
      highlights,
      statistics: { totalDriftPoints: results.reduce((a, b) => a + b.totalScore, 0) },
      metadata: { mode: 'drift', track: track.id }
    };
  }

  /**
   * Simulate derby destruction mode
   * @private
   */
  _simulateDerbyMode(options) {
    const { participants = [], track = {} } = options;
    const highlights = [];
    
    const results = participants.map(p => {
      const stats = this.calculateEffectiveStats(p.vehicleStats || {}, p.characterAbility || {}, p.parts || {});
      const personality = p.personality || { style: 'aggressive', skill: 0.5, riskTaking: 0.7 };
      const persMod = PERSONALITY_MODIFIERS[personality.style] || {};
      
      // Durability from mass
      let durability = stats.mass / 500; // Base durability
      
      // Damage dealt based on aggression and mass
      const damageOutput = (stats.mass / 1000) * (1 + persMod.crashRisk) * personality.riskTaking;
      
      // Survival time based on durability and defense
      let survivalTime = durability * (30 + Math.random() * 60); // 30-90 seconds base
      
      // Incidents reduce survival
      const incidents = Math.floor(personality.riskTaking * 5);
      survivalTime -= incidents * (2 + Math.random() * 5);
      
      // Track damage given/taken
      const damageDealt = damageOutput * survivalTime * (0.5 + Math.random());
      const damageTaken = (1000 - durability * 200) * (1 + incidents * 0.2);

      return {
        playerId: p.id,
        playerName: p.name,
        vehicleId: p.vehicleId,
        survivalTime: Math.max(0, survivalTime),
        damageDealt: Math.round(damageDealt),
        damageTaken: Math.round(damageTaken),
        eliminations: Math.floor(damageDealt / 200),
        eliminated: survivalTime <= 0
      };
    });

    // Sort by survival time, then damage dealt
    results.sort((a, b) => {
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      if (b.survivalTime !== a.survivalTime) return b.survivalTime - a.survivalTime;
      return b.damageDealt - a.damageDealt;
    });
    
    results.forEach((r, i) => r.finalPosition = i + 1);

    // Generate derby highlights
    results.filter(r => r.eliminations > 0).forEach(r => {
      highlights.push({
        type: 'elimination',
        player: r.id,
        victims: r.eliminations
      });
    });

    return {
      results,
      highlights,
      statistics: {
        totalEliminations: results.reduce((a, b) => a + b.eliminations, 0),
        longestSurvival: Math.max(...results.map(r => r.survivalTime))
      },
      metadata: { mode: 'derby', track: track.id }
    };
  }

  /**
   * Get the last simulation result
   * @returns {SimulationResult|null}
   */
  getLastResult() {
    return this._lastResult;
  }

  /**
   * Get simulation history
   * @returns {SimulationResult[]}
   */
  getHistory() {
    return this._simulationHistory;
  }

  /**
   * Clear cached data
   */
  clearCache() {
    this._trackCache.clear();
    this._simulationHistory = [];
    this._lastResult = null;
    console.log('[TournamentSimulator] Cache cleared');
  }
}

export const tournamentSimulator = new TournamentSimulator();
export default tournamentSimulator;
