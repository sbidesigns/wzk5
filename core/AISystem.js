// core/AISystem.js - AAA-Quality AI Opponent System
// Complete racing AI with personality profiles, pathfinding, combat, rubber banding
// Architecture: Mario Kart × NFS Underground × Forza AI hybrid
// 
// Events emitted:
//   'ai:spawned'    - { opponents: [...] }
//   'ai:update'     - { positions: [...], behaviors: [...] }
//   'ai:overtake'   - { overtaker, victim, position }
//   'ai:itemUse'    - { aiId, item, target }
//   'ai:mistake'    - { aiId, type, severity }
//   'ai:finish'     - { aiId, position, totalTime }

import { EventBus } from './EventBus.js';
import { calculateRacingLine, findOvertakingZones, detectCorners, classifyCorner, projectToRacingLine } from '../barrel/ai/ai.pathfinder.js';
import { selectItem, selectTarget, shouldDefend, shouldDodge, coordinateWithTeam, calculateLeadTarget } from '../barrel/ai/ai.combat.js';

// ============================================================================
// AI PERSONALITY PROFILES - 6 distinct driving styles
// ============================================================================

/**
 * @typedef {Object} AIPersonality
 * @property {string} name - Display name
 * @property {number} riskTolerance - 0-1, how much risk to take
 * @property {number} aggressionLevel - 0-1, combat/aggressive behavior
 * @property {number} itemUsageProbability - 0-1, likelihood of using items
 * @property {number} driftPreference - 0-1, how much to drift for style/points
 * @property {number} mistakeMultiplier - multiplier on base mistake frequency
 * @property {number} rubberBandResponse - 0-1, how strongly rubber banding affects this type
 * @property {number} itemOffenseWeight - offensive item preference
 * @property {number} itemDefenseWeight - defensive item preference
 * @property {number} overtakingAggression - willingness to attempt overtakes
 * @property {string} description - Human-readable description
 */

/** @type {Object<string, AIPersonality>} */
export const AI_PERSONALITIES = {
  aggressor: {
    name: 'Aggressor',
    riskTolerance: 0.9,
    aggressionLevel: 0.85,
    itemUsageProbability: 0.85,
    driftPreference: 0.5,
    mistakeMultiplier: 1.8,
    rubberBandResponse: 0.7,
    itemOffenseWeight: 0.95,
    itemDefenseWeight: 0.2,
    overtakingAggression: 0.95,
    description: 'Uses items offensively, rams players, takes risky shortcuts'
  },
  defensive: {
    name: 'Defensive',
    riskTolerance: 0.15,
    aggressionLevel: 0.2,
    itemUsageProbability: 0.6,
    driftPreference: 0.25,
    mistakeMultiplier: 0.4,
    rubberBandResponse: 0.5,
    itemOffenseWeight: 0.1,
    itemDefenseWeight: 0.95,
    overtakingAggression: 0.25,
    description: 'Shields often, avoids combat, consistent racing line'
  },
  drifter: {
    name: 'Drifter',
    riskTolerance: 0.65,
    aggressionLevel: 0.4,
    itemUsageProbability: 0.5,
    driftPreference: 0.95,
    mistakeMultiplier: 1.2,
    rubberBandResponse: 0.6,
    itemOffenseWeight: 0.4,
    itemDefenseWeight: 0.4,
    overtakingAggression: 0.45,
    description: 'Maximizes drift points, takes wide corners for style'
  },
  balanced: {
    name: 'Balanced',
    riskTolerance: 0.5,
    aggressionLevel: 0.5,
    itemUsageProbability: 0.65,
    driftPreference: 0.5,
    mistakeMultiplier: 1.0,
    rubberBandResponse: 0.65,
    itemOffenseWeight: 0.5,
    itemDefenseWeight: 0.5,
    overtakingAggression: 0.55,
    description: 'Adapts to situation, moderate risk-taking'
  },
  sprinter: {
    name: 'Sprinter',
    riskTolerance: 0.75,
    aggressionLevel: 0.35,
    itemUsageProbability: 0.7,
    driftPreference: 0.15,
    mistakeMultiplier: 1.4,
    rubberBandResponse: 0.8,
    itemOffenseWeight: 0.3,
    itemDefenseWeight: 0.3,
    overtakingAggression: 0.7,
    description: 'Boosts on straights, poor cornering, high speed focus'
  },
  precision: {
    name: 'Precision',
    riskTolerance: 0.3,
    aggressionLevel: 0.25,
    itemUsageProbability: 0.75,
    driftPreference: 0.35,
    mistakeMultiplier: 0.15,
    rubberBandResponse: 0.4,
    itemOffenseWeight: 0.6,
    itemDefenseWeight: 0.7,
    overtakingAggression: 0.4,
    description: 'Perfect racing line, rarely makes mistakes, low tolerance'
  }
};

// ============================================================================
// DIFFICULTY CONFIGURATIONS - 4 levels from config
// ============================================================================

/**
 * @typedef {Object} DifficultyConfig
 * @property {string} name - Difficulty name
 * @property {number} reactionTime - Seconds before AI reacts (0.15-0.5)
 * @property {number} steeringPrecision - Error margin in steering (lower = better)
 * @property {number} brakeAccuracy - Timing accuracy for braking (0-1)
 * @property {number} accelerationAccuracy - Timing accuracy for acceleration (0-1)
 * @property {number} mistakeFrequency - Base frequency of mistakes (0-1)
 * @property {number} itemIntelligence - How smartly items are used (0-1)
 * @property {number} speedModifier - Overall speed adjustment (0.85-1.10)
 */

/** @type {Object<string, DifficultyConfig>} */
const DIFFICULTY_CONFIGS = {
  relaxed: {
    name: 'Relaxed',
    reactionTime: 0.45,
    steeringPrecision: 0.18,
    brakeAccuracy: 0.55,
    accelerationAccuracy: 0.6,
    mistakeFrequency: 0.22,
    itemIntelligence: 0.35,
    speedModifier: 0.88
  },
  normal: {
    name: 'Normal',
    reactionTime: 0.28,
    steeringPrecision: 0.10,
    brakeAccuracy: 0.72,
    accelerationAccuracy: 0.78,
    mistakeFrequency: 0.10,
    itemIntelligence: 0.62,
    speedModifier: 0.96
  },
  aggressive: {
    name: 'Aggressive',
    reactionTime: 0.18,
    steeringPrecision: 0.05,
    brakeAccuracy: 0.88,
    accelerationAccuracy: 0.92,
    mistakeFrequency: 0.05,
    itemIntelligence: 0.82,
    speedModifier: 1.02
  },
  brutal: {
    name: 'Brutal',
    reactionTime: 0.12,
    steeringPrecision: 0.02,
    brakeAccuracy: 0.96,
    accelerationAccuracy: 0.98,
    mistakeFrequency: 0.02,
    itemIntelligence: 0.95,
    speedModifier: 1.06
  }
};

// ============================================================================
// MISTAKE TYPES DEFINITION
// ============================================================================

/** @type {Object<string, {severity: number, duration: number, effect: string}>} */
const MISTAKE_TYPES = {
  oversteer: { severity: 0.6, duration: 400, effect: 'excessive rear slide, spin tendency' },
  understeer: { severity: 0.4, duration: 300, effect: 'front pushes wide, misses apex' },
  earlyBrake: { severity: 0.35, duration: 500, effect: 'brakes too soon, loses momentum' },
  lateBrake: { severity: 0.7, duration: 350, effect: 'brakes too late, runs wide' },
  wrongLine: { severity: 0.5, duration: 600, effect: 'takes suboptimal path through corner' }
};

// ============================================================================
// AI CONTROLLER CLASS - Individual AI vehicle controller
// ============================================================================

/**
 * @class AIController
 * Controls a single AI opponent's behavior, input generation, and state
 */
class AIController {
  /**
   * Create a new AI controller
   * @param {Object} config - Controller configuration
   * @param {string} config.id - Unique identifier
   * @param {Object} config.vehicle - Vehicle object reference
   * @param {AIPersonality} config.personality - Personality profile
   * @param {DifficultyConfig} config.difficulty - Difficulty settings
   * @param {Array} config.racingLine - Pre-computed racing line points
   * @param {Array} config.corners - Detected corners array
   * @param {Array} config.overtakingZones - Safe overtaking zones
   * @param {Object} config.rubberBand - Rubber banding settings
   */
  constructor(config) {
    /** @type {string} Unique identifier */
    this.id = config.id;
    
    /** @type {Object} Reference to vehicle object */
    this.vehicle = config.vehicle;
    
    /** @type {AIPersonality} Active personality profile */
    this.personality = config.personality;
    
    /** @type {DifficultyConfig} Active difficulty settings */
    this.difficulty = config.difficulty;
    
    /** @type {Array} Racing line waypoints */
    this.racingLine = config.racingLine || [];
    
    /** @type {Array} Detected corners */
    this.corners = config.corners || [];
    
    /** @type {Array} Overtaking zones */
    this.overtakingZones = config.overtakingZones || [];
    
    /** @type {Object} Rubber banding configuration */
    this.rubberBand = config.rubberBand || {};
    
    // ==========================================================================
    // STATE VARIABLES
    // ==========================================================================
    
    /** @type {number} Current index on racing line */
    this.currentWaypointIndex = 0;
    
    /** @type {number} Current lap count */
    this.lap = 0;
    
    /** @type {number} Next checkpoint index */
    this.nextCheckpoint = 0;
    
    /** @type {string|null} Currently held item */
    this.heldItem = null;
    
    /** @type {number} Item cooldown timer */
    this.itemCooldown = 0;
    
    /** @type {Object|null} Current target for offensive items */
    this.currentTarget = null;
    
    /** @type {number} Current race position (1-based) */
    this.position = 1;
    
    /** @type {number} Race progress (0-1 per lap, can exceed 1 for multi-lap) */
    this.progress = 0;
    
    /** @type {number} Distance behind/ahead of player (negative = behind) */
    this.distanceToPlayer = 0;
    
    /** @type {boolean} Whether rubber banding is currently active */
    this.rubberBanding = false;
    
    /** @type {number} Rubber banding activation time */
    this.rubberBandStartTime = 0;
    
    /** @type {number} Current rubber banding modifier (1.0 = no effect) */
    this.rubberBandModifier = 1.0;
    
    // Mistake system state
    /** @type {string|null} Active mistake type */
    this.activeMistake = null;
    /** @type {number} When current mistake ends */
    this.mistakeEndTime = 0;
    /** @type {number} Time of last mistake */
    this.lastMistakeTime = 0;
    /** @type {number} Consecutive mistake counter */
    this.consecutiveMistakes = 0;
    
    // Reaction delay system
    /** @type {Array<{time: number, action: Function}>} Queued actions */
    this.actionQueue = [];
    
    // Input state (what we output to vehicle)
    /** @type {Set<string>} Currently pressed actions */
    this._pressed = new Set(['throttle']);
    /** @type {Object} Axis values */
    this._axis = { steerLeft: 0, steerRight: 0 };
    
    // Behavior tracking for events
    /** @type {string} Current behavior mode */
    this.currentBehavior = 'racing';
    /** @type {Object} Last behavior change info */
    this.behaviorData = {};
  }

  /**
   * Get computed input state for vehicle
   * @returns {{_pressed: Set<string>, _axis: Object}} Input state
   */
  get input() {
    return {
      _pressed: new Set(this._pressed),
      _axis: { ...this._axis }
    };
  }

  /**
   * Update this AI controller for one frame
   * @param {number} dt - Delta time in seconds
   * @param {Object} trackState - Current track/race state
   * @param {Object} playerState - Player state for awareness
   * @returns {Object} Update result with any events
   */
  update(dt, trackState, playerState) {
    const events = [];
    
    if (!this.vehicle?.physicsBody) return { events };
    
    // Update timers
    this.itemCooldown = Math.max(0, this.itemCooldown - dt * 1000);
    
    // Process active mistake
    if (this.activeMistake && performance.now() > this.mistakeEndTime) {
      this.activeMistake = null;
    }
    
    // Process action queue (reaction delays)
    this._processActionQueue(dt);
    
    // Get current position
    const pos = this.vehicle.physicsBody.position;
    const currentPosition = { x: pos.x, y: pos.y, z: pos.z };
    
    // Project to racing line and update waypoint
    const projection = projectToRacingLine(this.racingLine, currentPosition);
    if (projection) {
      this.currentWaypointIndex = projection.index;
      this.progress = projection.progress + this.lap;
    }
    
    // Calculate distance to player
    if (playerState?.vehicle?.physicsBody) {
      const pp = playerState.vehicle.physicsBody.position;
      const dx = pp.x - pos.x;
      const dz = pp.z - pos.z;
      this.distanceToPlayer = Math.sqrt(dx * dx + dz * dz);
      
      // Determine relative position (ahead/behind based on progress)
      const playerProgress = playerState.progress || 0;
      this.distanceToPlayer = (playerProgress - this.progress) * 1000; // Scaled difference
    }
    
    // Update rubber banding
    this._updateRubberBanding(dt, playerState);
    
    // Main decision pipeline
    this._updatePathfinding(dt, trackState);
    this._updateCombatAI(dt, trackState, playerState, events);
    this._checkForMistake(dt, trackState, events);
    
    // Apply mistake effects to input
    if (this.activeMistake) {
      this._applyMistakeEffect();
    }
    
    // Apply rubber banding to throttle
    if (this.rubberBanding && Math.abs(this.rubberBandModifier - 1.0) > 0.01) {
      this._applyRubberBandEffect();
    }
    
    return { events };
  }

  /**
   * Process delayed actions from reaction time queue
   * @param {number} dt - Delta time
   * @private
   */
  _processActionQueue(dt) {
    const now = performance.now();
    const readyActions = [];
    const remainingActions = [];
    
    for (const queued of this.actionQueue) {
      if (now >= queued.time) {
        readyActions.push(queued);
      } else {
        remainingActions.push(queued);
      }
    }
    
    this.actionQueue = remainingActions;
    
    for (const action of readyActions) {
      try {
        action.action();
      } catch (e) {
        console.warn(`[AIController:${this.id}] Action queue error:`, e);
      }
    }
  }

  /**
   * Queue an action with reaction delay
   * @param {Function} action - Action to execute
   * @param {number} [customDelay] - Optional custom delay override
   * @private
   */
  _queueAction(action, customDelay = null) {
    const delay = (customDelay ?? this.difficulty.reactionTime) * 1000;
    this.actionQueue.push({
      time: performance.now() + delay,
      action
    });
  }

  /**
   * Update pathfinding and steering
   * @param {number} dt - Delta time
   * @param {Object} trackState - Track state
   * @private
   */
  _updatePathfinding(dt, trackState) {
    if (this.racingLine.length === 0) return;
    
    const pos = this.vehicle.physicsBody.position;
    
    // Calculate look-ahead distance based on speed
    const speed = this._getSpeed();
    const baseLookahead = trackState.pathfinding?.waypointLookaheadBase || 12;
    const maxLookahead = trackState.pathfinding?.waypointLookaheadMax || 20;
    const lookAheadDistance = Math.min(
      maxLookahead,
      baseLookahead + (speed / 120) * 10 // Scale with speed
    );
    
    // Find target waypoint ahead
    const targetIndex = Math.min(
      this.racingLine.length - 1,
      Math.floor(this.currentWaypointIndex + lookAheadDistance)
    );
    
    const targetPoint = this.racingLine[targetIndex];
    if (!targetPoint) return;
    
    // Calculate steering toward target
    const dx = targetPoint.x - pos.x;
    const dz = targetPoint.z - pos.z;
    
    // Get vehicle forward direction
    const forward = this._getForwardVector();
    const forwardDx = forward.x;
    const forwardDz = forward.z;
    
    // Calculate desired direction
    const desiredLen = Math.sqrt(dx * dx + dz * dz);
    if (desiredLen < 0.001) return;
    
    const desiredX = dx / desiredLen;
    const desiredZ = dz / desiredLen;
    
    // Cross product for steering direction (Y component of cross in XZ plane)
    const cross = forwardDx * desiredZ - forwardDz * desiredX;
    
    // Apply steering with smoothing and difficulty-based error
    const smoothing = trackState.pathfinding?.steeringSmoothing || 0.08;
    const errorMargin = this.difficulty.steeringPrecision;
    const error = (Math.random() - 0.5) * errorMargin * 2;
    
    let steerTarget = cross + error;
    steerTarget = Math.max(-1, Math.min(1, steerTarget));
    
    // Smooth steering transition
    const currentSteer = this._axis.steerRight - this._axis.steerLeft;
    const smoothedSteer = currentSteer + (steerTarget - currentSteer) * smoothing;
    
    // Apply to axes
    if (smoothedSteer > 0.02) {
      this._axis.steerRight = Math.min(1, smoothedSteer);
      this._axis.steerLeft = 0;
    } else if (smoothedSteer < -0.02) {
      this._axis.steerLeft = Math.min(1, -smoothedSteer);
      this._axis.steerRight = 0;
    } else {
      this._axis.steerLeft = 0;
      this._axis.steerRight = 0;
    }
    
    // Corner-specific behavior (brake/accelerate)
    this._handleCornerBehavior(targetPoint, dt, trackState);
    
    // Drift decision
    this._decideDrift(cross, targetPoint);
    
    // Base throttle always on unless braking
    if (!this._pressed.has('brake')) {
      this._pressed.add('throttle');
    }
    
    this.currentBehavior = 'racing';
    this.behaviorData = { targetIndex, steerAmount: Math.abs(smoothedSteer), speed };
  }

  /**
   * Handle corner-specific driving behavior
   * @param {Object} targetPoint - Target racing line point
   * @param {number} dt - Delta time
   * @param {Object} trackState - Track state
   * @private
   */
  _handleCornerBehavior(targetPoint, dt, trackState) {
    if (!targetPoint) return;
    
    const curvature = Math.abs(targetPoint.curvature || 0);
    const isCorner = targetPoint.isCorner;
    const optimalSpeed = targetPoint.optimalSpeed || 80;
    const currentSpeed = this._getSpeed();
    
    const brakeThreshold = trackState.pathfinding?.cornerBrakeThreshold || 0.7;
    
    // Decide whether to brake for corner
    if (isCorner && curvature > 0.03) {
      // Need to slow down
      const speedRatio = currentSpeed / Math.max(optimalSpeed, 30);
      
      if (speedRatio > brakeThreshold) {
        // Brake timing accuracy based on difficulty
        const brakeAcc = this.difficulty.brakeAccuracy;
        
        // Personality affects braking (aggressors brake later)
        const personalityMod = 1 - (this.personality.riskTolerance - 0.5) * 0.3;
        const effectiveThreshold = brakeThreshold * personalityMod;
        
        if (speedRatio > effectiveThreshold || (this.activeMistake === 'earlyBrake' && speedRatio > 0.9)) {
          this._pressed.add('brake');
          
          // Sprinters are bad at corners - they brake more abruptly
          if (this.personality.name === 'Sprinter') {
            this._pressed.delete('throttle');
          }
        }
      }
    } else {
      // On straight or exiting corner - accelerate
      this._pressed.delete('brake');
      
      // Acceleration timing accuracy
      if (Math.random() < this.difficulty.accelerationAccuracy) {
        this._pressed.add('throttle');
      }
    }
  }

  /**
   * Decide whether to initiate drift
   * @param {number} steerAmount - Current steering amount
   * @param {Object} targetPoint - Target point data
   * @private
   */
  _decideDrift(steerAmount, targetPoint) {
    const driftPref = this.personality.driftPreference;
    const absSteer = Math.abs(steerAmount);
    
    // Drift when turning sharply enough
    const shouldDrift = absSteer > 0.35 && (
      // Based on personality preference
      Math.random() < driftPref ||
      // Always drift for drifter personality in corners
      (this.personality.name === 'Drifter' && absSteer > 0.25 && targetPoint?.isCorner)
    );
    
    if (shouldDrift) {
      this._pressed.add('drift');
    } else {
      this._pressed.delete('drift');
    }
  }

  /**
   * Update combat AI decisions
   * @param {number} dt - Delta time
   * @param {Object} trackState - Track state
   * @param {Object} playerState - Player state
   * @param {Array} events - Event accumulator
   * @private
   */
  _updateCombatAI(dt, trackState, playerState, events) {
    if (!this.heldItem) return;
    
    // Build context for item decision
    const context = {
      position: { rank: this.position },
      heldItem: this.heldItem,
      personality: this.personality,
      difficulty: this.difficulty,
      threats: this._assessThreats(playerState),
      targets: this._identifyTargets(playerState),
      combatSkill: this.difficulty.itemIntelligence,
      itemCooldown: this.itemCooldown
    };
    
    // Decide whether to use item
    const itemDecision = selectItem(context);
    
    if (itemDecision.use) {
      if (itemDecision.needsTarget) {
        // Select target
        const targetContext = {
          ...context,
          targets: context.targets,
          myPosition: this.position
        };
        const target = selectTarget(targetContext);
        
        if (target) {
          this.currentTarget = target;
          this._queueAction(() => {
            this._useItemOnTarget(target);
            events.push({
              type: 'ai:itemUse',
              data: { aiId: this.id, item: this.heldItem, target: target.id }
            });
            EventBus.emit('ai:itemUse', { aiId: this.id, item: this.heldItem, target: target.id });
          });
        }
      } else {
        // Self-use item (boost, shield, trap)
        this._queueAction(() => {
          this._useItemSelf();
          events.push({
            type: 'ai:itemUse',
            data: { aiId: this.id, item: this.heldItem, target: null }
          });
          EventBus.emit('ai:itemUse', { aiId: this.id, item: this.heldItem, target: null });
        });
      }
    }
    
    // Check defense needs
    const defenseContext = {
      threats: context.threats,
      personality: this.personality,
      hasShield: this.heldItem === 'shield',
      incomingCount: context.threats.filter(t => t.isProjectile).length
    };
    
    const defenseDecision = shouldDefend(defenseContext);
    if (defenseDecision.shouldDefend && this.heldItem === 'shield') {
      this._queueAction(() => {
        this._useItemSelf();
        EventBus.emit('ai:itemUse', { aiId: this.id, item: 'shield', target: null, reason: defenseDecision.reason });
      }, this.difficulty.reactionTime * 0.5); // React faster to threats
    }
    
    // Check dodge need
    const dodgeContext = {
      threats: context.threats.filter(t => t.isProjectile),
      personality: this.personality,
      dodgeSkill: this.difficulty.itemIntelligence
    };
    
    const dodgeDecision = shouldDodge(dodgeContext);
    if (dodgeDecision.shouldDodge) {
      this._executeDodge(dodgeDecision.direction);
    }
  }

  /**
   * Assess current threats to this AI
   * @param {Object} playerState - Player state
   * @returns {Array} Array of threat objects
   * @private
   */
  _assessThreats(playerState) {
    const threats = [];
    
    // Check player as threat
    if (playerState?.vehicle && playerState.hasItem) {
      const myPos = this.vehicle.physicsBody.position;
      const theirPos = playerState.vehicle.physicsBody.position;
      const dx = theirPos.x - myPos.x;
      const dz = theirPos.z - myPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      if (dist < 50) { // Within threat range
        threats.push({
          id: 'player',
          distance: dist / 50, // Normalized
          isProjectile: false,
          position: playerState.position
        });
      }
    }
    
    return threats;
  }

  /**
   * Identify potential targets for offensive items
   * @param {Object} playerState - Player state
   * @returns {Array} Array of potential targets
   * @private
   */
  _identifyTargets(playerState) {
    const targets = [];
    
    if (playerState?.vehicle) {
      const myPos = this.vehicle.physicsBody.position;
      const theirPos = playerState.vehicle.physicsBody.position;
      const dx = theirPos.x - myPos.x;
      const dz = theirPos.z - myPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      // Only target if within range and we're behind them
      if (dist < 80 && this.position > (playerState.position || 1)) {
        targets.push({
          id: 'player',
          distance: dist / 80,
          position: playerState.position || 1,
          x: theirPos.x,
          z: theirPos.z,
          speed: playerState.speed || 0
        });
      }
    }
    
    return targets;
  }

  /**
   * Use held item on selected target
   * @param {Object} target - Target object
   * @private
   */
  _useItemOnTarget(target) {
    if (!this.heldItem) return;
    
    // Emit event for scene to handle actual item activation
    EventBus.emit('ai:item:use', {
      vehicleId: this.id,
      itemId: this.heldItem,
      targetVehicle: target.id === 'player' ? 'player' : null
    });
    
    this.heldItem = null;
    this.itemCooldown = 500; // Brief cooldown after use
    this.currentTarget = null;
  }

  /**
   * Use held item on self
   * @private
   */
  _useItemSelf() {
    if (!this.heldItem) return;
    
    EventBus.emit('ai:item:use', {
      vehicleId: this.id,
      itemId: this.heldItem,
      targetVehicle: null // Self-use
    });
    
    this.heldItem = null;
    this.itemCooldown = 500;
  }

  /**
   * Execute dodge maneuver
   * @param {string} direction - 'left' or 'right'
   * @private
   */
  _executeDodge(direction) {
    const dodgeStrength = 0.8;
    const dodgeDuration = 200; // ms
    
    if (direction === 'left') {
      this._axis.steerLeft = dodgeStrength;
      this._axis.steerRight = 0;
    } else {
      this._axis.steerRight = dodgeStrength;
      this._axis.steerLeft = 0;
    }
    
    // Reset after short duration
    setTimeout(() => {
      if (this._axis.steerLeft > 0.7 || this._axis.steerRight > 0.7) {
        this._axis.steerLeft = 0;
        this._axis.steerRight = 0;
      }
    }, dodgeDuration);
  }

  /**
   * Update rubber banding state
   * @param {number} dt - Delta time
   * @param {Object} playerState - Player state
   * @private
   */
  _updateRubberBanding(dt, playerState) {
    if (!this.rubberBand?.enabled) {
      this.rubberBandModifier = 1.0;
      this.rubberBanding = false;
      return;
    }
    
    const now = performance.now();
    
    // Check if far enough from player to activate rubber banding
    const distanceThreshold = 100; // Progress units
    const absDistance = Math.abs(this.distanceToPlayer);
    
    if (absDistance < distanceThreshold * 0.3) {
      // Close to player - deactivate
      this.rubberBanding = false;
      this.rubberBandModifier = 1.0;
      return;
    }
    
    // Check activation delay
    if (!this.rubberBanding) {
      this.rubberBandStartTime = now;
      this.rubberBanding = true;
      return; // Wait next frame to apply
    }
    
    const timeSinceActivation = now - this.rubberBandStartTime;
    const activationDelay = this.rubberBand.activationDelay || 5000;
    
    if (timeSinceActivation < activationDelay) {
      return; // Still in delay period
    }
    
    // Calculate rubber banding modifier
    const responseFactor = this.personality.rubberBandResponse;
    const maxBoost = this.rubberBand.maxBoost || 0.15;
    const maxSlowdown = this.rubberBand.maxSlowdown || 0.12;
    
    if (this.distanceToPlayer < -distanceThreshold) {
      // Far behind - catch up boost
      const intensity = Math.min(1, Math.abs(this.distanceToPlayer) / (distanceThreshold * 2));
      this.rubberBandModifier = 1 + maxBoost * intensity * responseFactor;
    } else if (this.distanceToPlayer > distanceThreshold) {
      // Far ahead - slowdown
      const intensity = Math.min(1, this.distanceToPlayer / (distanceThreshold * 2));
      this.rubberBandModifier = 1 - maxSlowdown * intensity * responseFactor;
    } else {
      this.rubberBandModifier = 1.0;
    }
  }

  /**
   * Apply rubber banding effect to throttle
   * @private
   */
  _applyRubberBandEffect() {
    if (this.rubberBandModifier > 1.0) {
      // Boost - ensure throttle is active (handled by natural throttle logic)
      // The speed modifier will be applied by game systems reading this value
    } else if (this.rubberBandModifier < 1.0) {
      // Slowdown - occasionally release throttle
      if (Math.random() > this.rubberBandModifier) {
        this._pressed.delete('throttle');
      }
    }
  }

  /**
   * Check if a mistake should occur
   * @param {number} dt - Delta time
   * @param {Object} trackState - Track state
   * @param {Array} events - Event accumulator
   * @private
   */
  _checkForMistake(dt, trackState, events) {
    // Don't make mistakes while already making one
    if (this.activeMistake) return;
    
    const now = performance.now();
    const config = trackState.mistakes || {};
    
    if (!config.enabled) return;
    
    // Check minimum interval
    const minInterval = config.minInterval || 2000;
    if (now - this.lastMistakeTime < minInterval) return;
    
    // Check consecutive limit
    const maxConsecutive = config.maxConsecutive || 2;
    if (this.consecutiveMistakes >= maxConsecutive) return;
    
    // Calculate mistake probability
    let baseFrequency = config.baseFrequency || 0.1;
    baseFrequency *= this.personality.mistakeMultiplier;
    baseFrequency *= this.difficulty.mistakeFrequency;
    
    // Stress factors increase mistakes
    let stressFactor = 1;
    if (this.position > 4) stressFactor *= 1.3; // Behind = stressed
    if (this._isNearHazard(trackState)) stressFactor *= 1.5;
    
    const finalProbability = baseFrequency * stressFactor * dt;
    
    if (Math.random() < finalProbability) {
      this._triggerMistake(events);
    }
  }

  /**
   * Trigger a mistake
   * @param {Array} events - Event accumulator
   * @private
   */
  _triggerMistake(events) {
    // Select mistake type (weighted random)
    const types = Object.keys(MISTAKE_TYPES);
    const weights = types.map(t => MISTAKE_TYPES[t].severity);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    
    let random = Math.random() * totalWeight;
    let selectedType = types[0];
    
    for (let i = 0; i < types.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        selectedType = types[i];
        break;
      }
    }
    
    const mistake = MISTAKE_TYPES[selectedType];
    
    // Activate mistake
    this.activeMistake = selectedType;
    this.mistakeEndTime = performance.now() + mistake.duration;
    this.lastMistakeTime = performance.now();
    this.consecutiveMistakes++;
    
    // Emit event
    const eventData = {
      aiId: this.id,
      type: selectedType,
      severity: mistake.severity
    };
    events.push({ type: 'ai:mistake', data: eventData });
    EventBus.emit('ai:mistake', eventData);
  }

  /**
   * Apply active mistake effect to input
   * @private
   */
  _applyMistakeEffect() {
    switch (this.activeMistake) {
      case 'oversteer':
        // Exaggerate steering
        this._axis.steerLeft *= 1.5;
        this._axis.steerRight *= 1.5;
        break;
        
      case 'understeer':
        // Reduce steering effectiveness
        this._axis.steerLeft *= 0.5;
        this._axis.steerRight *= 0.5;
        break;
        
      case 'earlyBrake':
        // Brake even when not needed
        this._pressed.add('brake');
        break;
        
      case 'lateBrake':
        // Don't brake when should
        this._pressed.delete('brake');
        // Add some random steering
        if (Math.random() > 0.5) {
          this._axis.steerLeft += 0.3;
        } else {
          this._axis.steerRight += 0.3;
        }
        break;
        
      case 'wrongLine':
        // Steer away from optimal
        const offset = (Math.random() - 0.5) * 0.6;
        if (offset > 0) {
          this._axis.steerRight += offset;
        } else {
          this._axis.steerLeft -= offset;
        }
        break;
    }
  }

  /**
   * Check if near a hazard zone
   * @param {Object} trackState - Track state
   * @returns {boolean}
   * @private
   */
  _isNearHazard(trackState) {
    // Simplified hazard detection - check if near corner exit
    const currentPoint = this.racingLine[this.currentWaypointIndex];
    if (!currentPoint) return false;
    
    // Near sharp corners is considered hazardous
    if (currentPoint.isCorner && Math.abs(currentPoint.curvature || 0) > 0.08) {
      return true;
    }
    
    return false;
  }

  /**
   * Give this AI an item
   * @param {string} itemId - Item identifier
   */
  giveItem(itemId) {
    this.heldItem = itemId;
    this.itemCooldown = 0;
  }

  /**
   * Get current speed in km/h equivalent
   * @returns {number} Speed value
   * @private
   */
  _getSpeed() {
    if (!this.vehicle?.physicsBody) return 0;
    
    const vel = this.vehicle.physicsBody.velocity;
    if (!vel) return 0;
    
    // Calculate speed from velocity (assuming Cannon.js or similar)
    const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z + (vel.y || 0) * (vel.y || 0));
    return speed * 3.6; // Convert m/s to km/h approximation
  }

  /**
   * Get vehicle forward vector
   * @returns {{x: number, z: number}} Forward direction
   * @private
   */
  _getForwardVector() {
    if (!this.vehicle?.physicsBody) return { x: 0, z: 1 };
    
    // Try to get forward from quaternion
    const quat = this.vehicle.physicsBody.quaternion;
    if (!quat) return { x: 0, z: 1 };
    
    // Default forward is +Z, rotate by quaternion
    // Simplified extraction for XZ plane
    const x = 2 * (quat.x * quat.z + quat.w * quat.y);
    const z = 1 - 2 * (quat.x * quat.x + quat.y * quat.y);
    
    return { x, z };
  }

  /**
   * Reset consecutive mistake counter (call when driving cleanly)
   */
  resetMistakeStreak() {
    if (performance.now() - this.lastMistakeTime > 3000) {
      this.consecutiveMistakes = 0;
    }
  }

  /**
   * Clean up this controller
   */
  destroy() {
    this.actionQueue = [];
    this._pressed.clear();
    this._axis = { steerLeft: 0, steerRight: 0 };
  }
}

// ============================================================================
// MAIN AISYSTEM CLASS
// ============================================================================

/**
 * @class AISystem
 * Main AI opponent management system
 * Handles spawning, updating, and coordinating all AI opponents
 * 
 * @example
 * const aiSystem = new AISystem({ bus: EventBus, config: gameConfig.ai });
 * aiSystem.initialize(aiVehicles, trackData, 'normal');
 * // In game loop:
 * aiSystem.update(dt);
 * // Cleanup:
 * aiSystem.destroy();
 */
export class AISystem {
  /**
   * Create a new AISystem instance
   * @param {Object} config - System configuration
   * @param {Object} config.bus - EventBus instance for emitting events
   * @param {Object} [config.ai] - AI configuration from game.config.json
   * @param {boolean} [config.debug=false] - Enable debug logging
   */
  constructor(config = {}) {
    /** @type {EventBus} Event bus for communication */
    this.bus = config.bus || EventBus;
    
    /** @type {Object} AI configuration */
    this.config = config.ai || {};
    
    /** @type {boolean} Debug mode flag */
    this.debug = config.debug || this.config.debug || false;
    
    // ==========================================================================
    // SYSTEM STATE
    // ==========================================================================
    
    /** @type {boolean} Whether system has been initialized */
    this.initialized = false;
    
    /** @type {Map<string, AIController>} Active AI controllers keyed by ID */
    this.controllers = new Map();
    
    /** @type {Array} Racing line waypoints */
    this.racingLine = [];
    
    /** @type {Array} Detected corners */
    this.corners = [];
    
    /** @type {Array} Overtaking zones */
    this.overtakingZones = [];
    
    /** @type {string} Active difficulty level */
    this.difficulty = 'normal';
    
    /** @type {DifficultyConfig} Active difficulty config */
    this.difficultyConfig = DIFFICULTY_CONFIGS.normal;
    
    /** @type {Object} Player state cache */
    this.playerState = {
      position: 1,
      progress: 0,
      hasItem: false,
      speed: 0,
      vehicle: null
    };
    
    /** @type {Object} Track state cache */
    this.trackState = {};
    
    /** @type {number} Race start time */
    this.raceStartTime = 0;
    
    /** @type {Array<string>} Available personality pool */
    this.personalityPool = Object.keys(AI_PERSONALITIES);
    
    // Custom event handlers
    /** @type {Map<string, Set<Function>>} */
    this._eventHandlers = new Map();
    
    if (this.debug) {
      console.log('[AISystem] Initialized with config:', this.config);
    }
  }

  /**
   * Initialize the AI system with vehicles and track data
   * @param {Array<Object>} aiVehicles - Array of {id, vehicle, module} objects
   * @param {Object} trackData - Track data containing curve, width, checkpoints
   * @param {string} [difficulty='normal'] - Difficulty level
   * @returns {boolean} Success status
   */
  initialize(aiVehicles, trackData, difficulty = 'normal') {
    if (this.initialized) {
      console.warn('[AISystem] Already initialized, call destroy() first');
      return false;
    }
    
    if (!aiVehicles || aiVehicles.length === 0) {
      console.warn('[AISystem] No AI vehicles provided');
      return false;
    }
    
    // Set difficulty
    this.setDifficulty(difficulty);
    
    // Compute racing line
    if (trackData.curve) {
      const trackWidth = trackData.width || 12;
      this.racingLine = calculateRacingLine(trackData.curve, trackWidth);
      this.corners = detectCorners(trackData.curve);
      this.overtakingZones = findOvertakingZones(this.racingLine, this.corners);
      
      if (this.debug) {
        console.log(`[AISystem] Computed racing line: ${this.racingLine.length} points, ` +
                   `${this.corners.length} corners, ${this.overtakingZones.length} overtaking zones`);
      }
    }
    
    // Build track state
    this.trackState = {
      checkpoints: trackData.checkpoints || [],
      pathfinding: this.config.pathfinding || {},
      combat: this.config.combat || {},
      mistakes: this.config.mistakes || {},
      width: trackData.width || 12
    };
    
    // Spawn AI controllers for each vehicle
    const opponents = [];
    
    for (let i = 0; i < aiVehicles.length; i++) {
      const aiVehicle = aiVehicles[i];
      const personality = this._assignPersonality(i);
      
      const controller = new AIController({
        id: aiVehicle.id,
        vehicle: aiVehicle.vehicle,
        personality: personality,
        difficulty: this.difficultyConfig,
        racingLine: this.racingLine,
        corners: this.corners,
        overtakingZones: this.overtakingZones,
        rubberBand: this.config.rubberBand
      });
      
      // Stagger starting positions slightly along racing line
      if (this.racingLine.length > 0) {
        const startIndex = Math.floor((i + 1) / (aiVehicles.length + 1) * this.racingLine.length * 0.05);
        controller.currentWaypointIndex = startIndex;
      }
      
      this.controllers.set(aiVehicle.id, controller);
      opponents.push({
        id: aiVehicle.id,
        personality: personality.name,
        vehicle: aiVehicle.vehicle
      });
    }
    
    this.initialized = true;
    this.raceStartTime = performance.now();
    
    // Emit spawn event
    const eventData = { opponents };
    this.bus.emit('ai:spawned', eventData);
    this._emit('onSpawned', eventData);
    
    if (this.debug) {
      console.log(`[AISystem] Spawned ${opponents.length} opponents at ${difficulty} difficulty`);
    }
    
    return true;
  }

  /**
   * Main update loop - call once per frame
   * @param {number} dt - Delta time in seconds
   * @returns {Object} Update summary with all events
   */
  update(dt) {
    if (!this.initialized) {
      return { events: [], positions: [], behaviors: [] };
    }
    
    const allEvents = [];
    const positions = [];
    const behaviors = [];
    const previousPositions = new Map();
    
    // Store previous positions for overtake detection
    for (const [id, controller] of this.controllers) {
      previousPositions.set(id, controller.position);
    }
    
    // Update each controller
    for (const [id, controller] of this.controllers) {
      const result = controller.update(dt, this.trackState, this.playerState);
      
      // Collect events
      allEvents.push(...result.events);
      
      // Collect state
      positions.push({
        id,
        position: controller.position,
        progress: controller.progress,
        lap: controller.lap,
        x: controller.vehicle?.physicsBody?.position?.x || 0,
        z: controller.vehicle?.physicsBody?.position?.z || 0
      });
      
      behaviors.push({
        id,
        behavior: controller.currentBehavior,
        data: controller.behaviorData
      });
      
      // Reset mistake streak if driving well
      controller.resetMistakeStreak();
    }
    
    // Sort positions
    this._recalculatePositions();
    
    // Check for overtakes
    this._detectOvertakes(previousPositions, allEvents);
    
    // Emit update event
    const updateData = { positions, behaviors };
    this.bus.emit('ai:update', updateData);
    
    return {
      events: allEvents,
      positions,
      behaviors
    };
  }

  /**
   * Recalculate race positions based on progress
   * @private
   */
  _recalculatePositions() {
    const entries = Array.from(this.controllers.entries())
      .map(([id, ctrl]) => ({ id, progress: ctrl.progress, lap: ctrl.lap }))
      .sort((a, b) => {
        // Sort by lap first, then progress within lap
        if (b.lap !== a.lap) return b.lap - a.lap;
        return b.progress - a.progress;
      });
    
    // Assign positions
    for (let i = 0; i < entries.length; i++) {
      const controller = this.controllers.get(entries[i].id);
      if (controller) {
        controller.position = i + 1;
      }
    }
  }

  /**
   * Detect overtakes that occurred this frame
   * @param {Map} previousPositions - Previous frame positions
   * @param {Array} events - Event accumulator
   * @private
   */
  _detectOvertakes(previousPositions, events) {
    for (const [id, controller] of this.controllers) {
      const prevPos = previousPositions.get(id) || controller.position;
      
      if (controller.position < prevPos) {
        // This AI improved position (overtook someone)
        const overtakeData = {
          overtaker: id,
          victim: this._findOvertakenVictim(id, prevPos, controller.position),
          position: controller.position
        };
        
        events.push({ type: 'ai:overtake', data: overtakeData });
        this.bus.emit('ai:overtake', overtakeData);
        this._emit('onOvertake', overtakeData);
      }
    }
  }

  /**
   * Find who was overtaken given position change
   * @param {string} overtakerId - Who did the overtaking
   * @param {number} oldPos - Previous position
   * @param {number} newPos - New position
   * @returns {string|null} Victim ID or null
   * @private
   */
  _findOvertakenVictim(overtakerId, oldPos, newPos) {
    // Find someone who moved from newPos to oldPos range
    for (const [id, controller] of this.controllers) {
      if (id === overtakerId) continue;
      if (controller.position >= oldPos && controller.position <= newPos) {
        return id;
      }
    }
    
    // Check if player was overtaken
    if (this.playerState.position >= newPos && this.playerState.position < oldPos) {
      return 'player';
    }
    
    return null;
  }

  /**
   * Spawn additional opponents mid-race
   * @param {number} count - Number of opponents to spawn
   * @param {Object} trackData - Track data
   * @param {Object} vehicleModule - Vehicle module to use
   * @returns {Array<Object>} Spawned opponent data
   */
  spawnOpponents(count, trackData, vehicleModule) {
    if (!this.initialized) {
      console.warn('[AISystem] Cannot spawn opponents before initialization');
      return [];
    }
    
    const spawned = [];
    const startIdx = this.controllers.size;
    
    for (let i = 0; i < count; i++) {
      const id = `ai-dynamic-${startIdx + i}`;
      const personality = this._assignPersonity(startIdx + i);
      
      // Note: Actual vehicle creation would be handled by caller
      // This creates the controller which will be linked to a vehicle
      const controller = new AIController({
        id,
        vehicle: null, // Will be set by caller
        personality,
        difficulty: this.difficultyConfig,
        racingLine: this.racingLine,
        corners: this.corners,
        overtakingZones: this.overtakingZones,
        rubberBand: this.config.rubberBand
      });
      
      // Start at back of pack
      controller.position = this.controllers.size + 1;
      controller.progress = this.playerState.progress - 0.05;
      
      this.controllers.set(id, controller);
      spawned.push({ id, personality: personality.name, controller });
    }
    
    if (spawned.length > 0) {
      this.bus.emit('ai:spawned', { opponents: spawned });
    }
    
    return spawned;
  }

  /**
   * Update cached player state for AI awareness
   * @param {Object} state - Player state object
   */
  updatePlayerState(state) {
    Object.assign(this.playerState, state);
  }

  /**
   * Give an item to a specific AI
   * @param {string} aiId - AI identifier
   * @param {string} itemId - Item to give
   */
  giveItem(aiId, itemId) {
    const controller = this.controllers.get(aiId);
    if (controller) {
      controller.giveItem(itemId);
    }
  }

  /**
   * Get controller for specific AI
   * @param {string} aiId - AI identifier
   * @returns {AIController|undefined} Controller or undefined
   */
  getAIController(aiId) {
    return this.controllers.get(aiId);
  }

  /**
   * Get all current positions
   * @returns {Array<{id: string, position: number, progress: number}>}
   */
  getPositions() {
    const positions = [];
    for (const [id, controller] of this.controllers) {
      positions.push({
        id,
        position: controller.position,
        progress: controller.progress,
        lap: controller.lap
      });
    }
    return positions.sort((a, b) => a.position - b.position);
  }

  /**
   * Set difficulty level
   * @param {string} level - Difficulty level name
   * @returns {boolean} Success status
   */
  setDifficulty(level) {
    const config = DIFFICULTY_CONFIGS[level];
    if (!config) {
      console.warn(`[AISystem] Unknown difficulty: ${level}`);
      return false;
    }
    
    this.difficulty = level;
    this.difficultyConfig = config;
    
    // Update existing controllers
    for (const controller of this.controllers.values()) {
      controller.difficulty = config;
    }
    
    if (this.debug) {
      console.log(`[AISystem] Difficulty set to ${level}`);
    }
    
    return true;
  }

  /**
   * Assign personality to AI index
   * @param {number} index - AI index for variety
   * @returns {AIPersonality} Assigned personality
   * @private
   */
  _assignPersonality(index) {
    // Check configured personalities
    const configuredPersonalities = this.config.personalities || ['balanced'];
    
    if (configuredPersonalities.length === 1 && configuredPersonalities[0] === 'balanced') {
      // Default: vary personalities for interesting races
      const types = Object.keys(AI_PERSONALITIES);
      const type = types[index % types.length];
      return { ...AI_PERSONALITIES[type] };
    }
    
    // Use configured personalities (cycle through)
    const typeName = configuredPersonalities[index % configuredPersonalities.length];
    const personality = AI_PERSONALITIES[typeName];
    
    if (personality) {
      return { ...personality };
    }
    
    // Fallback to balanced
    return { ...AI_PERSONALITIES.balanced };
  }

  /**
   * Register event listener for AISystem-specific events
   * @param {string} event - Event name (onSpawned, onOvertake, onMistake, onFinish)
   * @param {Function} handler - Event handler
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, new Set());
    }
    this._eventHandlers.get(event).add(handler);
    
    return () => {
      const handlers = this._eventHandlers.get(event);
      if (handlers) {
        handlers.delete(handler);
      }
    };
  }

  /**
   * Emit internal event
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @private
   */
  _emit(event, data) {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (e) {
          console.error(`[AISystem] Handler error for ${event}:`, e);
        }
      }
    }
  }

  /**
   * Notify that an AI has finished the race
   * @param {string} aiId - AI identifier
   * @param {number} position - Final position
   * @param {number} totalTime - Total race time in ms
   */
  notifyFinish(aiId, position, totalTime) {
    const controller = this.controllers.get(aiId);
    if (controller) {
      controller.finished = true;
      controller.finalPosition = position;
      controller.totalTime = totalTime;
    }
    
    const finishData = { aiId, position, totalTime };
    this.bus.emit('ai:finish', finishData);
    this._emit('onFinish', finishData);
  }

  /**
   * Update checkpoint progression for an AI
   * @param {string} aiId - AI identifier
   * @param {number} checkpoint - New checkpoint index
   */
  updateCheckpoint(aiId, checkpoint) {
    const controller = this.controllers.get(aiId);
    if (controller) {
      // Detect lap completion
      if (checkpoint === 0 && controller.nextCheckpoint !== 0) {
        controller.lap++;
      }
      controller.nextCheckpoint = checkpoint;
    }
  }

  /**
   * Despawn all AI and clean up
   */
  despawn() {
    for (const controller of this.controllers.values()) {
      controller.destroy();
    }
    this.controllers.clear();
    this.initialized = false;
    
    if (this.debug) {
      console.log('[AISystem] All opponents despawned');
    }
  }

  /**
   * Full cleanup and destruction of the system
   */
  destroy() {
    this.despawn();
    
    this.racingLine = [];
    this.corners = [];
    this.overtakingZones = [];
    this._eventHandlers.clear();
    this.playerState = {
      position: 1,
      progress: 0,
      hasItem: false,
      speed: 0,
      vehicle: null
    };
    
    if (this.debug) {
      console.log('[AISystem] System destroyed');
    }
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Get statistics about current AI state
   * @returns {Object} Statistics object
   */
  getStats() {
    const controllers = Array.from(this.controllers.values());
    
    return {
      totalOpponents: controllers.length,
      averagePosition: controllers.reduce((sum, c) => sum + c.position, 0) / Math.max(1, controllers.length),
      personalitiesInUse: [...new Set(controllers.map(c => c.personality.name))],
      activeMistakes: controllers.filter(c => c.activeMistake).length,
      rubberBandingActive: controllers.filter(c => c.rubberBanding).length,
      holdingItems: controllers.filter(c => c.heldItem).length,
      difficulty: this.difficulty
    };
  }

  /**
   * Force a mistake on a specific AI (for testing/debugging)
   * @param {string} aiId - AI identifier
   * @param {string} [mistakeType] - Specific mistake type or random
   */
  forceMistake(aiId, mistakeType) {
    const controller = this.controllers.get(aiId);
    if (!controller) return;
    
    const types = Object.keys(MISTAKE_TYPES);
    const type = mistakeType || types[Math.floor(Math.random() * types.length)];
    const mistake = MISTAKE_TYPES[type];
    
    if (mistake) {
      controller.activeMistake = type;
      controller.mistakeEndTime = performance.now() + mistake.duration;
      
      this.bus.emit('ai:mistake', { aiId, type, severity: mistake.severity, forced: true });
    }
  }

  /**
   * Get debug information for all controllers
   * @returns {Array} Debug data array
   */
  getDebugInfo() {
    const info = [];
    
    for (const [id, controller] of this.controllers) {
      info.push({
        id,
        personality: controller.personality.name,
        position: controller.position,
        lap: controller.lap,
        progress: controller.progress.toFixed(3),
        waypointIndex: controller.currentWaypointIndex,
        heldItem: controller.heldItem || 'none',
        activeMistake: controller.activeMistake || 'none',
        rubberBandModifier: controller.rubberBandModifier.toFixed(2),
        behavior: controller.currentBehavior
      });
    }
    
    return info;
  }
}

// ============================================================================
// DEFAULT EXPORT & CONVENIENCE EXPORTS
// ============================================================================

export default AISystem;

/**
 * Create a pre-configured AISystem instance
 * @param {Object} config - Configuration options
 * @returns {AISystem} Configured system instance
 */
export function createAISystem(config = {}) {
  return new AISystem(config);
}

/**
 * Get available difficulty levels
 * @returns {string[]} Difficulty names
 */
export function getDifficultyLevels() {
  return Object.keys(DIFFICULTY_CONFIGS);
}

/**
 * Get available personality types
 * @returns {string[]} Personality names
 */
export function getPersonalityTypes() {
  return Object.keys(AI_PERSONALITIES);
}

/**
 * Get personality display name
 * @param {string} type - Personality type key
 * @returns {string} Display name
 */
export function getPersonalityName(type) {
  return AI_PERSONALITIES[type]?.name || type;
}
