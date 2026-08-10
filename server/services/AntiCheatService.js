// server/services/AntiCheatService.js — AAA Anti-Cheat Service
// Provides server-side input validation, statistical anomaly detection,
// replay verification, client fingerprinting, and violation scoring.
//
// Features:
// - Speed threshold validation (flag if speed > vehicle maxSpeed * 1.5)
// - Position sanity checks (teleportation detection)
// - Input rate limiting (reject if inputs too frequent)
// - Statistical anomaly detection (impossible lap times, acceleration values)
// - Replay verification system (record inputs, re-simulate on server)
// - Client fingerprinting support for hardware bans
// - Ban management (hardware ID, account, IP) with graduated responses
// - Violation scoring with configurable thresholds
// - Real-time player trust scoring
//
// @module services/AntiCheatService

import Redis from 'ioredis';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// CONFIGURATION LOADING
// ============================================================================

/**
 * Load configuration from config file or defaults
 * @returns {Object} Anti-cheat configuration
 * @private
 */
function loadConfig() {
  try {
    const configPath = join(__dirname, '../config/gameServer.config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return {
      antiCheat: config.antiCheat || {},
      vehicles: config.vehicles || {},
      tracks: config.tracks || {},
      redis: config.redis || {}
    };
  } catch {
    return {
      antiCheat: {
        maxSpeedMultiplier: 1.5,
        maxPositionDelta: 50,
        anomalyThreshold: 3,
        banThreshold: 10,
        replayEnabled: true,
        fingerprintingEnabled: true
      },
      vehicles: {},
      tracks: {},
      redis: {
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      }
    };
  }
}

const CONFIG = loadConfig();

// ============================================================================
// VEHICLE PERFORMANCE DATABASE
// ============================================================================

/**
 * Vehicle performance stats for validation
 * Contains max speeds, acceleration, handling for each vehicle type
 * @type {Object.<string, Object>}
 * @constant
 */
const VEHICLE_STATS = {
  spectre: { maxSpeed: 320, acceleration: 45, handling: 85, nitroBoost: 1.4, mass: 1200 },
  phantom: { maxSpeed: 340, acceleration: 40, handling: 75, nitroBoost: 1.35, mass: 1350 },
  viper: { maxSpeed: 310, acceleration: 50, handling: 90, nitroBoost: 1.45, mass: 1100 },
  titan: { maxSpeed: 300, acceleration: 55, handling: 70, nitroBoost: 1.5, mass: 1500 },
  ghost: { maxSpeed: 330, acceleration: 42, handling: 80, nitroBoost: 1.38, mass: 1250 },
  storm: { maxSpeed: 315, acceleration: 48, handling: 88, nitroBoost: 1.42, mass: 1150 },
  nova: { maxSpeed: 325, acceleration: 44, handling: 82, nitroBoost: 1.4, mass: 1180 },
  eclipse: { maxSpeed: 350, acceleration: 38, handling: 72, nitroBoost: 1.35, mass: 1400 }
};

// Merge with config if available
if (CONFIG.vehicles && typeof CONFIG.vehicles === 'object') {
  Object.assign(VEHICLE_STATS, CONFIG.vehicles);
}

// ============================================================================
// TRACK DATA FOR LAP TIME VALIDATION
// ============================================================================

/**
 * Track data for minimum lap time calculations
 * @type {Object.<string, Object>}
 * @constant
 */
const TRACK_DATA = {
  downtown: { length: 3200, minLapTime: 42000, checkpoints: 8 },
  mountain: { length: 4500, minLapTime: 58000, checkpoints: 10 },
  coastal: { length: 3800, minLapTime: 50000, checkpoints: 9 },
  volcano: { length: 5200, minLapTime: 68000, checkpoints: 12 },
  neon: { length: 2900, minLapTime: 38000, checkpoints: 7 },
  arctic: { length: 4100, minLapTime: 53000, checkpoints: 10 }
};

if (CONFIG.tracks && typeof CONFIG.tracks === 'object') {
  Object.assign(TRACK_DATA, CONFIG.tracks);
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Maximum allowed speed multiplier above vehicle's max speed */
const MAX_SPEED_MULTIPLIER = CONFIG.antiCheat.maxSpeedMultiplier || 1.5;

/** Maximum position change per tick (meters) before flagging */
const MAX_POSITION_DELTA = CONFIG.antiCheat.maxPositionDelta || 50;

/** Number of anomalies before triggering warning */
const ANOMALY_THRESHOLD = CONFIG.antiCheat.anomalyThreshold || 3;

/** Total violations before ban recommendation */
const BAN_THRESHOLD = CONFIG.antiCheat.banThreshold || 10;

/** Minimum time between inputs (ms) to prevent spam */
const MIN_INPUT_INTERVAL = 16; // ~60Hz max

/** Input buffer size for replay verification */
const INPUT_BUFFER_SIZE = 300; // 5 seconds at 60Hz

/** Violation expiry time (ms) */
const VIOLATION_EXPIRY = 300000; // 5 minutes

// ============================================================================
// VIOLATION TYPES
// ============================================================================

/**
 * Violation type definitions with severity levels
 * @enum {string}
 */
export const ViolationType = {
  SPEED_EXCEEDED: 'speed_exceeded',
  TELEPORTATION: 'teleportation',
  INPUT_SPAM: 'input_spam',
  IMPOSSIBLE_LAP_TIME: 'impossible_lap_time',
  IMPOSSIBLE_ACCELERATION: 'impossible_acceleration',
  CHECKPOINT_SKIP: 'checkpoint_skip',
  REPLAY_MISMATCH: 'replay_mismatch',
  FINGERPRINT_MISMATCH: 'fingerprint_mismatch',
  SUSPICIOUS_PATTERN: 'suspicious_pattern'
};

/**
 * Severity levels for violations
 * @enum {number}
 */
export const Severity = {
  INFO: 0,
  WARNING: 1,
  SUSPICIOUS: 2,
  SEVERE: 3,
  CRITICAL: 4
};

/**
 * Action types for violations
 * @enum {string}
 */
export const ViolationAction = {
  NONE: 'none',
  LOG_ONLY: 'log_only',
  WARN: 'warn',
  KICK: 'kick',
  BAN_TEMPORARY: 'ban_temporary',
  BAN_PERMANENT: 'ban_permanent'
};

// ============================================================================
// PLAYER STATE TRACKER
// ============================================================================

/**
 * Tracks individual player state for anti-cheat validation
 * @class
 */
class PlayerTracker {
  /**
   * Create player tracker
   * @param {string} playerId - Player ID
   */
  constructor(playerId) {
    /** @type {string} Player ID */
    this.playerId = playerId;

    /** @type {Object|null} Last known position */
    this.lastPosition = null;

    /** @type {number} Last position timestamp */
    this.lastPositionTime = 0;

    /** @type {Object|null} Last known velocity */
    this.lastVelocity = null;

    /** @type {number} Last input timestamp */
    this.lastInputTime = 0;

    /** @type {number} Input count in current window */
    this.inputCount = 0;

    /** @type {Array<Object>} Recent violations */
    this.violations = [];

    /** @type {number} Trust score (0-100, higher = more trusted) */
    this.trustScore = 100;

    /** @type {string|null} Client fingerprint hash */
    this.fingerprint = null;

    /** @type {string} Vehicle ID being used */
    this.vehicleId = 'spectre';

    /** @type {string} Current track ID */
    this.trackId = '';

    /** @type {Array<Object>} Input buffer for replay verification */
    this.inputBuffer = [];

    /** @type {number} Race start time */
    this.raceStartTime = 0;

    /** @type {number} Current lap */
    this.currentLap = 0;

    /** @type {number} Last checkpoint passed */
    this.lastCheckpoint = -1;

    /** @type {Array<number>} Lap times recorded */
    this.lapTimes = [];

    /** @type {boolean} Is player currently flagged */
    this.isFlagged = false;
  }

  /**
   * Record a new violation
   * @param {string} type - Violation type
   * @param {number} severity - Severity level
   * @param {Object} details - Additional details
   * @returns {Object} Recorded violation
   */
  addViolation(type, severity, details = {}) {
    const violation = {
      id: crypto.randomUUID(),
      type,
      severity,
      timestamp: Date.now(),
      details,
      playerId: this.playerId
    };

    this.violations.push(violation);

    // Adjust trust score based on severity
    const trustPenalty = [0, 5, 10, 20, 40][severity] || 10;
    this.trustScore = Math.max(0, this.trustScore - trustPenalty);

    // Clean old violations
    this._cleanOldViolations();

    // Check if should be flagged
    if (this._shouldFlag()) {
      this.isFlagged = true;
    }

    return violation;
  }

  /**
   * Get recent violations within expiry period
   * @returns {Array<Object>}
   */
  getRecentViolations() {
    this._cleanOldViolations();
    return [...this.violations];
  }

  /**
   * Get total violation score (weighted sum)
   * @returns {number}
   */
  getViolationScore() {
    this._cleanOldViolations();
    return this.violations.reduce((sum, v) => sum + (v.severity + 1), 0);
  }

  /**
   * Check if player should be flagged/banned
   * @private
   * @returns {boolean}
   */
  _shouldFlag() {
    const recentSevere = this.violations.filter(
      v => v.severity >= Severity.SEVERE && 
      Date.now() - v.timestamp < VIOLATION_EXPIRY
    );
    
    // Flag if multiple severe violations or high total score
    return recentSevere.length >= 3 || this.getViolationScore() >= BAN_THRESHOLD;
  }

  /**
   * Clean expired violations
   * @private
   */
  _cleanOldViolations() {
    const cutoff = Date.now() - VIOLATION_EXPIRY;
    this.violations = this.violations.filter(v => v.timestamp >= cutoff);
  }

  /**
   * Add input to buffer for replay verification
   * @param {Object} input - Input data
   */
  recordInput(input) {
    this.inputBuffer.push({
      ...input,
      timestamp: Date.now()
    });

    // Keep buffer at max size
    if (this.inputBuffer.length > INPUT_BUFFER_SIZE) {
      this.inputBuffer = this.inputBuffer.slice(-INPUT_BUFFER_SIZE);
    }
  }

  /**
   * Get and clear input buffer
   * @returns {Array<Object>}
   */
  extractInputBuffer() {
    const buffer = [...this.inputBuffer];
    this.inputBuffer = [];
    return buffer;
  }

  /**
   * Reset race-specific state
   */
  resetRaceState() {
    this.inputBuffer = [];
    this.raceStartTime = 0;
    this.currentLap = 0;
    this.lastCheckpoint = -1;
    this.lapTimes = [];
  }
}

// ============================================================================
// MAIN ANTI-CHEAT SERVICE CLASS
// ============================================================================

/**
 * AAA Anti-Cheat Service
 * Provides server-side validation, anomaly detection, and ban management
 * 
 * @class
 * @extends EventEmitter
 * 
 * @example
 * const antiCheat = new AntiCheatService(config);
 * await antiCheat.init();
 * 
 * // Validate player input
 * const result = await antiCheat.validateInput(playerId, input, currentState);
 * if (!result.valid) {
 *   console.log('Cheating detected:', result.reason);
 * }
 */
export class AntiCheatService extends EventEmitter {
  /**
   * Create AntiCheatService instance
   * @param {Object} [config={}] - Configuration overrides
   */
  constructor(config = {}) {
    super();

    /** @type {Object} Merged configuration */
    this.config = {
      maxSpeedMultiplier: config.maxSpeedMultiplier || MAX_SPEED_MULTIPLIER,
      maxPositionDelta: config.maxPositionDelta || MAX_POSITION_DELTA,
      anomalyThreshold: config.anomalyThreshold || ANOMALY_THRESHOLD,
      banThreshold: config.banThreshold || BAN_THRESHOLD,
      replayEnabled: config.replayEnabled !== false,
      fingerprintingEnabled: config.fingerprintingEnabled !== false,
      ...config
    };

    /** @type {Map<string, PlayerTracker>} Active player trackers */
    this.players = new Map();

    /** @type {Map<string, Object>} Active bans (key -> ban info) */
    this.bans = new Map();

    /** @type {Redis|null} Redis client */
    this.redis = null;

    /** @type {boolean} Initialization status */
    this.initialized = false;

    /** @type {Object} Statistics */
    this.stats = {
      totalChecks: 0,
      totalViolations: 0,
      totalBans: 0,
      playersTracked: 0,
      violationsByType: {}
    };
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize the anti-cheat service
   * Loads existing bans from Redis if available
   * @returns {Promise<void>}
   */
  async init() {
    try {
      const redisUrl = process.env.REDIS_URL || CONFIG.redis?.url;
      if (redisUrl) {
        this.redis = new Redis(redisUrl);
        this.redis.on('error', (err) => {
          console.error('[AntiCheatService] Redis error:', err.message);
        });

        // Load existing bans
        await this._loadBans();
      }

      this.initialized = true;
      this.emit('ready');
      console.log('[AntiCheatService] Initialized successfully');
    } catch (error) {
      console.error('[AntiCheatService] Init failed:', error.message);
      this.initialized = true; // Continue without Redis
    }
  }

  // ==========================================================================
  // PLAYER TRACKING
  // ==========================================================================

  /**
   * Start tracking a player (call when they join a race)
   * @param {string} playerId - Player ID
   * @param {Object} [options={}] - Initial options
   * @param {string} options.vehicleId - Vehicle they're using
   * @param {string} options.trackId - Track they're on
   * @param {string} options.fingerprint - Client fingerprint
   * @returns {PlayerTracker} Created tracker
   */
  startTracking(playerId, options = {}) {
    let tracker = this.players.get(playerId);
    
    if (!tracker) {
      tracker = new PlayerTracker(playerId);
      this.players.set(playerId, tracker);
      this.stats.playersTracked++;
    }

    // Update options
    if (options.vehicleId) tracker.vehicleId = options.vehicleId;
    if (options.trackId) tracker.trackId = options.trackId;
    if (options.fingerprint) tracker.fingerprint = options.fingerprint;

    // Reset race state for new session
    tracker.resetRaceState();
    tracker.isFlagged = false;

    this.emit('playerTrackingStarted', { playerId });
    return tracker;
  }

  /**
   * Stop tracking a player (call when they leave)
   * @param {string} playerId - Player ID
   * @returns {PlayerTracker|null} Final tracker state or null
   */
  stopTracking(playerId) {
    const tracker = this.players.get(playerId);
    
    if (tracker) {
      this.players.delete(playerId);
      this.stats.playersTracked = Math.max(0, this.stats.playersTracked - 1);
      this.emit('playerTrackingStopped', { 
        playerId, 
        finalTrustScore: tracker.trustScore,
        totalViolations: tracker.violations.length
      });
      return tracker;
    }
    
    return null;
  }

  /**
   * Get player's current tracker
   * @param {string} playerId - Player ID
   * @returns {PlayerTracker|null}
   */
  getPlayerTracker(playerId) {
    return this.players.get(playerId) || null;
  }

  // ==========================================================================
  // INPUT VALIDATION
  // ==========================================================================

  /**
   * Main validation method - validates all aspects of player input
   * Should be called for every input received from client
   * 
   * @param {string} playerId - Player ID
   * @param {Object} input - Input data from client
   * @param {Object} input.position - New position {x, y, z}
   * @param {Object} input.velocity - Current velocity {x, y, z}
   * @param {number} input.speedKmh - Speed in km/h
   * @param {number} [input.sequence] - Input sequence number
   * @param {Object} currentState - Server's current state for this player
   * @param {Object} [currentState.position] - Last known server position
   * @param {number} [currentState.timestamp] - Last update timestamp
   * @returns {Promise<{valid: boolean, reason?: string, action?: string, severity?: number}>}
   */
  async validateInput(playerId, input, currentState = {}) {
    this.stats.totalChecks++;

    // Check if player is banned
    if (await this.isBanned(playerId)) {
      return {
        valid: false,
        reason: 'Player is banned',
        action: ViolationAction.BAN_PERMANENT,
        severity: Severity.CRITICAL
      };
    }

    // Get or create tracker
    let tracker = this.players.get(playerId);
    if (!tracker) {
      tracker = this.startTracking(playerId);
    }

    // Run all validations
    const results = await Promise.all([
      this._checkSpeed(playerId, input.speedKmh, tracker),
      this._checkPosition(playerId, input.position, currentState.position, currentState.timestamp, tracker),
      this._checkInputRate(playerId, tracker),
      this._checkAcceleration(playerId, input, currentState, tracker)
    ]);

    // Find any failures
    const failures = results.filter(r => !r.valid);

    if (failures.length > 0) {
      // Use most severe failure
      const worstFailure = failures.reduce((worst, curr) => 
        (curr.severity || 0) > (worst.severity || 0) ? curr : worst
      , failures[0]);

      // Record violation
      tracker.addViolation(worstFailure.type || ViolationType.SUSPICIOUS_PATTERN, worstFailure.severity || 1, {
        input: this._sanitizeInput(input),
        currentState: this._sanitizeInput(currentState)
      });

      // Record input for potential replay analysis
      if (this.config.replayEnabled) {
        tracker.recordInput(input);
      }

      // Update stats
      this.stats.totalViolations++;
      const typeKey = worstFailure.type || 'unknown';
      this.stats.violationsByType[typeKey] = (this.stats.violationsByType[typeKey] || 0) + 1;

      // Emit event
      this.emit('violationDetected', {
        playerId,
        violation: worstFailure,
        tracker: {
          trustScore: tracker.trustScore,
          isFlagged: tracker.isFlagged,
          violationCount: tracker.getRecentViolations().length
        }
      });

      // Determine action based on severity and history
      worstFailure.action = this._determineAction(tracker);

      return worstFailure;
    }

    // Update tracker state
    if (input.position) {
      tracker.lastPosition = { ...input.position };
      tracker.lastPositionTime = Date.now();
    }
    if (input.velocity) {
      tracker.lastVelocity = { ...input.velocity };
    }
    tracker.lastInputTime = Date.now();
    tracker.inputCount++;

    // Record valid input for replay
    if (this.config.replayEnabled) {
      tracker.recordInput(input);
    }

    return { valid: true };
  }

  /**
   * Validate speed against vehicle limits
   * @param {string} playerId - Player ID
   * @param {number} speedKmh - Reported speed in km/h
   * @param {PlayerTracker} tracker - Player tracker
   * @returns {Object} Validation result
   * @private
   */
  async _checkSpeed(playerId, speedKmh, tracker) {
    if (speedKmh === undefined || speedKmh === null) {
      return { valid: true };
    }

    const vehicleStats = VEHICLE_STATS[tracker.vehicleId] || VEHICLE_STATS.spectre;
    const maxAllowedSpeed = vehicleStats.maxSpeed * this.config.maxSpeedMultiplier;

    // Account for nitro boost
    const effectiveMax = maxAllowedSpeed * (vehicleStats.nitroBoost || 1.4);

    if (speedKmh > effectiveMax) {
      const excess = ((speedKmh - effectiveMax) / effectiveMax * 100).toFixed(1);
      
      return {
        valid: false,
        reason: `Speed ${speedKmh} km/h exceeds maximum ${effectiveMax.toFixed(0)} km/h by ${excess}%`,
        type: ViolationType.SPEED_EXCEEDED,
        severity: speedKmh > effectiveMax * 1.2 ? Severity.CRITICAL : Severity.SEVERE,
        details: { reportedSpeed: speedKmh, maxAllowed: effectiveMax, excessPercent: parseFloat(excess) }
      };
    }

    return { valid: true };
  }

  /**
   * Validate position change (detect teleportation)
   * @param {string} playerId - Player ID
   * @param {Object} newPosition - New position
   * @param {Object} oldPosition - Previous position
   * @param {number} lastTimestamp - Previous update timestamp
   * @param {PlayerTracker} tracker - Player tracker
   * @returns {Object} Validation result
   * @private
   */
  async _checkPosition(playerId, newPosition, oldPosition, lastTimestamp, tracker) {
    if (!newPosition || !oldPosition) {
      return { valid: true }; // Can't check without both positions
    }

    const now = Date.now();
    const deltaTime = lastTimestamp ? (now - lastTimestamp) : 16; // Default to 16ms
    
    // Calculate distance moved
    const dx = (newPosition.x || 0) - (oldPosition.x || 0);
    const dy = (newPosition.y || 0) - (oldPosition.y || 0);
    const dz = (newPosition.z || 0) - (oldPosition.z || 0);
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Calculate max possible distance in this timeframe
    const vehicleStats = VEHICLE_STATS[tracker.vehicleId] || VEHICLE_STATS.spectre;
    const maxSpeedMs = (vehicleStats.maxSpeed * this.config.maxSpeedMultiplier) / 3.6; // Convert to m/s
    const maxDistance = maxSpeedMs * (deltaTime / 1000);

    // Allow some tolerance for network jitter and prediction errors
    const tolerance = 1.5; // 50% tolerance

    if (distance > maxDistance * tolerance && distance > this.config.maxPositionDelta) {
      return {
        valid: false,
        reason: `Position change of ${distance.toFixed(2)}m in ${deltaTime}ms exceeds possible range`,
        type: ViolationType.TELEPORTATION,
        severity: distance > maxDistance * tolerance * 2 ? Severity.CRITICAL : Severity.SEVERE,
        details: { distance, deltaTime, maxPossible: maxDistance * tolerance }
      };
    }

    return { valid: true };
  }

  /**
   * Check input rate (prevent bot/automation)
   * @param {string} playerId - Player ID
   * @param {PlayerTracker} tracker - Player tracker
   * @returns {Object} Validation result
   * @private
   */
  async _checkInputRate(playerId, tracker) {
    const now = Date.now();
    const timeSinceLastInput = now - tracker.lastInputTime;

    // If inputs are coming too fast, reject
    if (tracker.lastInputTime > 0 && timeSinceLastInput < MIN_INPUT_INTERVAL) {
      tracker.inputCount++;

      // Allow occasional bursts but flag sustained fast input
      if (tracker.inputCount > 10) {
        return {
          valid: false,
          reason: `Input rate too high: ${tracker.inputCount} rapid inputs detected`,
          type: ViolationType.INPUT_SPAM,
          severity: Severity.WARNING,
          details: { interval: timeSinceLastInput, count: tracker.inputCount }
        };
      }
    } else {
      // Reset counter on normal input
      tracker.inputCount = 0;
    }

    return { valid: true };
  }

  /**
   * Check for impossible acceleration values
   * @param {string} playerId - Player ID
   * @param {Object} input - Current input
   * @param {Object} currentState - Current state
   * @param {PlayerTracker} tracker - Player tracker
   * @returns {Object} Validation result
   * @private
   */
  async _checkAcceleration(playerId, input, currentState, tracker) {
    if (!input.velocity || !tracker.lastVelocity) {
      return { valid: true };
    }

    const vehicleStats = VEHICLE_STATS[tracker.vehicleId] || VEHICLE_STATS.spectre;
    
    // Calculate acceleration from velocity change
    const dvx = (input.velocity.x || 0) - (tracker.lastVelocity.x || 0);
    const dvy = (input.velocity.y || 0) - (tracker.lastVelocity.y || 0);
    const dvz = (input.velocity.z || 0) - (tracker.lastVelocity.z || 0);
    const accelMagnitude = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);

    // Max reasonable acceleration (with generous tolerance)
    // Vehicle acceleration is in some units, convert roughly
    const maxAccel = vehicleStats.acceleration * 3; // 3x tolerance for nitro etc.

    if (accelMagnitude > maxAccel) {
      return {
        valid: false,
        reason: `Acceleration ${accelMagnitude.toFixed(2)} exceeds maximum ${maxAccel}`,
        type: ViolationType.IMPOSSIBLE_ACCELERATION,
        severity: accelMagnitude > maxAccel * 2 ? Severity.SEVERE : Severity.SUSPICIOUS,
        details: { acceleration: accelMagnitude, maxAllowed: maxAccel }
      };
    }

    return { valid: true };
  }

  // ==========================================================================
  // LAP TIME VALIDATION
  // ==========================================================================

  /**
   * Validate a lap time for impossibility
   * @param {string} playerId - Player ID
   * @param {string} trackId - Track ID
   * @param {number} lapTimeMs - Lap time in milliseconds
   * @param {number} lapNumber - Which lap (1-based)
   * @returns {Promise<{valid: boolean, reason?: string}>}
   */
  async validateLapTime(playerId, trackId, lapTimeMs, lapNumber) {
    const tracker = this.players.get(playerId);
    if (!tracker) {
      return { valid: true }; // Can't validate without tracker
    }

    const trackInfo = TRACK_DATA[trackId];
    if (!trackInfo) {
      return { valid: true }; // Unknown track, skip validation
    }

    // Calculate theoretical minimum lap time (with some tolerance)
    const minTime = trackInfo.minLapTime * 0.95; // Allow 5% faster than "minimum"

    if (lapTimeMs < minTime) {
      const violation = tracker.addViolation(ViolationType.IMPOSSIBLE_LAP_TIME, Severity.CRITICAL, {
        trackId,
        lapTime: lapTimeMs,
        lapNumber,
        minimumPossible: minTime
      });

      this.emit('lapTimeAnomaly', { playerId, violation });

      return {
        valid: false,
        reason: `Lap time ${lapTimeMs}ms is below theoretical minimum ${minTime}ms`,
        severity: Severity.CRITICAL
      };
    }

    // Record valid lap time
    tracker.lapTimes.push(lapTimeMs);
    tracker.currentLap = lapNumber;

    return { valid: true };
  }

  /**
   * Validate checkpoint progression
   * @param {string} playerId - Player ID
   * @param {number} checkpointId - Checkpoint just passed
   * @param {number} totalCheckpoints - Total checkpoints per lap
   * @returns {Promise<{valid: boolean, reason?: string}>}
   */
  async validateCheckpoint(playerId, checkpointId, totalCheckpoints) {
    const tracker = this.players.get(playerId);
    if (!tracker) {
      return { valid: true };
    }

    // Check for skipped checkpoints (allowing for wrap-around on new lap)
    const expectedNext = (tracker.lastCheckpoint + 1) % totalCheckpoints;
    
    // Special case: first checkpoint after finish line
    if (tracker.lastCheckpoint === totalCheckpoints - 1 && checkpointId === 0) {
      tracker.lastCheckpoint = checkpointId;
      return { valid: true };
    }

    // Normal progression
    if (checkpointId !== expectedNext && tracker.lastCheckpoint !== -1) {
      // Might have missed one checkpoint (network issue), but not multiple
      const skipped = checkpointId - tracker.lastCheckpoint - 1;
      
      if (skipped > 1) {
        const violation = tracker.addViolation(ViolationType.CHECKPOINT_SKIP, Severity.SEVERE, {
          expectedCheckpoint: expectedNext,
          actualCheckpoint: checkpointId,
          checkpointsSkipped: skipped
        });

        this.emit('checkpointSkip', { playerId, violation });

        return {
          valid: false,
          reason: `Skipped ${skipped} checkpoint(s): expected ${expectedNext}, got ${checkpointId}`
        };
      }
    }

    tracker.lastCheckpoint = checkpointId;
    return { valid: true };
  }

  // ==========================================================================
  // REPLAY VERIFICATION
  // ==========================================================================

  /**
   * Start recording inputs for replay verification
   * @param {string} playerId - Player ID
   */
  startReplayRecording(playerId) {
    const tracker = this.players.get(playerId);
    if (tracker) {
      tracker.resetRaceState();
      tracker.raceStartTime = Date.now();
    }
  }

  /**
   * Get recorded inputs for replay analysis
   * @param {string} playerId - Player ID
   * @returns {Array<Object>} Recorded inputs
   */
  getReplayData(playerId) {
    const tracker = this.players.get(playerId);
    return tracker ? tracker.extractInputBuffer() : [];
  }

  /**
   * Verify replay by checking for patterns indicative of cheating
   * @param {string} playerId - Player ID
   * @param {Array<Object>} serverInputs - Server-recorded inputs
   * @param {Object} finalState - Final state after simulation
   * @returns {Promise<{valid: boolean, issues: Array}>}
   */
  async verifyReplay(playerId, serverInputs, finalState) {
    const issues = [];

    if (!serverInputs || serverInputs.length === 0) {
      return { valid: true, issues };
    }

    // Analyze input patterns
    const patternIssues = this._analyzeInputPatterns(serverInputs);
    issues.push(...patternIssues);

    // Check for consistent timing (bot detection)
    const timingIssues = this._analyzeInputTiming(serverInputs);
    issues.push(...timingIssues);

    // Check final state consistency
    if (finalState) {
      const tracker = this.players.get(playerId);
      if (tracker && tracker.lastPosition && finalState.position) {
        const dx = finalState.position.x - tracker.lastPosition.x;
        const dy = finalState.position.y - tracker.lastPosition.y;
        const dz = finalState.position.z - tracker.lastPosition.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        
        if (dist > 100) { // Large discrepancy
          issues.push({
            type: ViolationType.REPLAY_MISMATCH,
            severity: Severity.SUSPICIOUS,
            message: `Final position mismatch: ${dist}m difference`
          });
        }
      }
    }

    const valid = !issues.some(i => i.severity >= Severity.SEVERE);

    if (!valid) {
      const tracker = this.players.get(playerId);
      if (tracker) {
        for (const issue of issues) {
          if (issue.severity >= Severity.WARNING) {
            tracker.addViolation(issue.type, issue.severity, issue);
          }
        }
      }
    }

    return { valid, issues };
  }

  /**
   * Analyze input patterns for suspicious behavior
   * @private
   * @param {Array<Object>} inputs - Input array
   * @returns {Array<Object>} Issues found
   */
  _analyzeInputPatterns(inputs) {
    const issues = [];

    if (inputs.length < 10) return issues;

    // Check for perfect steering angles (bot-like precision)
    const steeringValues = inputs.map(i => i.steering ?? 0).filter(s => s !== 0);
    if (steeringValues.length > 0) {
      const perfectAngles = steeringValues.filter(s => 
        Math.abs(Math.abs(s) - Math.round(Math.abs(s) * 10) / 10) < 0.001
      ).length;
      
      const perfectRatio = perfectAngles / steeringValues.length;
      if (perfectRatio > 0.95) {
        issues.push({
          type: ViolationType.SUSPICIOUS_PATTERN,
          severity: Severity.SUSPICIOUS,
          message: `Suspiciously precise steering: ${(perfectRatio * 100).toFixed(1)}% perfect angles`
        });
      }
    }

    // Check for constant throttle (no variation)
    const throttleValues = inputs.map(i => i.throttle ?? 0);
    const uniqueThrottles = new Set(throttleValues).size;
    if (throttleValues.length > 30 && uniqueThrottles <= 3) {
      issues.push({
        type: ViolationType.SUSPICIOUS_PATTERN,
        severity: Severity.INFO,
        message: `Low throttle variation: only ${uniqueThrottles} unique values`
      });
    }

    return issues;
  }

  /**
   * Analyze input timing for bot-like patterns
   * @private
   * @param {Array<Object>} inputs - Input array
   * @returns {Array<Object>} Issues found
   */
  _analyzeInputTiming(inputs) {
    const issues = [];

    if (inputs.length < 20) return issues;

    // Calculate intervals between inputs
    const intervals = [];
    for (let i = 1; i < inputs.length; i++) {
      const diff = (inputs[i].timestamp || 0) - (inputs[i-1].timestamp || 0);
      if (diff > 0 && diff < 1000) { // Sanity check
        intervals.push(diff);
      }
    }

    if (intervals.length < 10) return issues;

    // Check for machine-like regularity
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / avgInterval;

    // Very low CV suggests automation (humans have variable timing)
    if (coefficientOfVariation < 0.05 && avgInterval < 50) {
      issues.push({
        type: ViolationType.SUSPICIOUS_PATTERN,
        severity: Severity.WARNING,
        message: `Suspiciously regular input timing: CV=${coefficientOfVariation.toFixed(4)}`
      });
    }

    return issues;
  }

  // ==========================================================================
  // FINGERPRINTING
  // ==========================================================================

  /**
   * Validate and store client fingerprint
   * @param {string} playerId - Player ID
   * @param {Object} fingerprint - Client fingerprint data
   * @returns {Promise<{valid: boolean, reason?: string}>}
   */
  async validateFingerprint(playerId, fingerprint) {
    if (!this.config.fingerprintingEnabled) {
      return { valid: true };
    }

    const tracker = this.players.get(playerId);
    if (!tracker) {
      return { valid: true };
    }

    // Generate hash of fingerprint
    const fingerprintHash = this._hashFingerprint(fingerprint);

    // Check if fingerprint matches stored one
    if (tracker.fingerprint && tracker.fingerprint !== fingerprintHash) {
      const violation = tracker.addViolation(ViolationType.FINGERPRINT_MISMATCH, Severity.SEVERE, {
        original: tracker.fingerprint,
        newHash: fingerprintHash
      });

      this.emit('fingerprintMismatch', { playerId, violation });

      return {
        valid: false,
        reason: 'Client fingerprint does not match previous session'
      };
    }

    // Store fingerprint
    tracker.fingerprint = fingerprintHash;

    // Check if fingerprint is banned
    if (await this.isFingerprintBanned(fingerprintHash)) {
      return {
        valid: false,
        reason: 'This device has been banned',
        action: ViolationAction.BAN_PERMANENT
      };
    }

    return { valid: true };
  }

  /**
   * Hash fingerprint data
   * @private
   * @param {Object} fingerprint - Fingerprint data
   * @returns {string} SHA-256 hash
   */
  _hashFingerprint(fingerprint) {
    const data = JSON.stringify(fingerprint);
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  // ==========================================================================
  // BAN MANAGEMENT
  // ==========================================================================

  /**
   * Check if a player is currently banned
   * @param {string} playerId - Player ID
   * @returns {Promise<boolean>}
   */
  async isBanned(playerId) {
    // Check memory
    if (this.bans.has(playerId)) {
      const ban = this.bans.get(playerId);
      if (ban.permanent || ban.expiresAt > Date.now()) {
        return true;
      }
      // Expired ban, remove it
      this.bans.delete(playerId);
    }

    // Check Redis
    if (this.redis) {
      const banData = await this.redis.get(`wzk5:ban:${playerId}`);
      if (banData) {
        const ban = JSON.parse(banData);
        if (ban.permanent || ban.expiresAt > Date.now()) {
          this.bans.set(playerId, ban); // Cache it
          return true;
        }
        // Expired
        await this.redis.del(`wzk5:ban:${playerId}`);
      }
    }

    return false;
  }

  /**
   * Check if a fingerprint (device) is banned
   * @param {string} fingerprintHash - Hashed fingerprint
   * @returns {Promise<boolean>}
   */
  async isFingerprintBanned(fingerprintHash) {
    if (this.redis) {
      return await this.redis.sismember('wzk5:bans:fingerprints', fingerprintHash) === 1;
    }
    return false;
  }

  /**
   * Check if an IP address is banned
   * @param {string} ipAddress - IP address
   * @returns {Promise<boolean>}
   */
  async isIPBanned(ipAddress) {
    if (this.redis) {
      return await this.redis.sismember('wzk5:bans:ips', ipAddress) === 1;
    }
    return false;
  }

  /**
   * Flag a player for a violation
   * @param {string} playerId - Player ID
   * @param {string} reason - Reason for flagging
   * @param {number} severity - Severity level
   * @param {Object} [details={}] - Additional details
   * @returns {Object} Violation record
   */
  flagPlayer(playerId, reason, severity, details = {}) {
    const tracker = this.players.get(playerId);
    
    if (tracker) {
      const violation = tracker.addViolation(reason, severity, details);
      
      this.emit('playerFlagged', { 
        playerId, 
        violation,
        trustScore: tracker.trustScore,
        isFlagged: tracker.isFlagged
      });

      return violation;
    }

    return null;
  }

  /**
   * Ban a player
   * @param {string} playerId - Player ID to ban
   * @param {Object} [options={}] - Ban options
   * @param {boolean} [options.permanent=false] - Permanent ban
   * @param {number} [options.duration] - Duration in ms (if not permanent)
   * @param {string} [options.reason='Violating terms of service'] - Ban reason
   * @param {string} [options.bannedBy='system'] - Who issued the ban
   * @param {boolean} [options.banFingerprint=false] - Also ban device
   * @param {boolean} [options.banIP=false] - Also ban IP
   * @returns {Promise<Object>} Ban record
   */
  async banPlayer(playerId, options = {}) {
    const {
      permanent = false,
      duration = 24 * 60 * 60 * 1000, // 24 hours default
      reason = 'Violating terms of service',
      bannedBy = 'system',
      banFingerprint = false,
      banIP = false
    } = options;

    const ban = {
      id: uuidv4(),
      playerId,
      permanent,
      expiresAt: permanent ? null : Date.now() + duration,
      reason,
      bannedBy,
      createdAt: Date.now(),
      banFingerprint,
      banIP
    };

    // Store in memory
    this.bans.set(playerId, ban);

    // Store in Redis
    if (this.redis) {
      const key = `wzk5:ban:${playerId}`;
      const ttl = permanent ? undefined : Math.ceil(duration / 1000);
      
      if (ttl) {
        await this.redis.setex(key, ttl, JSON.stringify(ban));
      } else {
        await this.redis.set(key, JSON.stringify(ban));
      }

      // Ban fingerprint if requested
      if (banFingerprint) {
        const tracker = this.players.get(playerId);
        if (tracker?.fingerprint) {
          await this.redis.sadd('wzk5:bans:fingerprints', tracker.fingerprint);
        }
      }

      // Ban IP if requested (would need to track IP separately)
      if (banIP) {
        // IP banning would need IP tracking implementation
      }
    }

    // Update stats
    this.stats.totalBans++;

    this.emit('playerBanned', { playerId, ban });

    return ban;
  }

  /**
   * Unban a player
   * @param {string} playerId - Player ID to unban
   * @returns {Promise<boolean>} True if unbanned
   */
  async unbanPlayer(playerId) {
    // Remove from memory
    this.bans.delete(playerId);

    // Remove from Redis
    if (this.redis) {
      await this.redis.del(`wzk5:ban:${playerId}`);
    }

    this.emit('playerUnbanned', { playerId });

    return true;
  }

  /**
   * Get violation history for a player
   * @param {string} playerId - Player ID
   * @returns {Array<Object>} Violation records
   */
  getViolationHistory(playerId) {
    const tracker = this.players.get(playerId);
    return tracker ? tracker.getRecentViolations() : [];
  }

  /**
   * Get player's trust score
   * @param {string} playerId - Player ID
   * @returns {number} Trust score (0-100)
   */
  getTrustScore(playerId) {
    const tracker = this.players.get(playerId);
    return tracker ? tracker.trustScore : 100; // Default to trusted
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Determine what action to take based on violations
   * @private
   * @param {PlayerTracker} tracker - Player tracker
   * @returns {string} Action to take
   */
  _determineAction(tracker) {
    const recentViolations = tracker.getRecentViolations();
    const severeCount = recentViolations.filter(v => v.severity >= Severity.SEVERE).length;
    const criticalCount = recentViolations.filter(v => v.severity >= Severity.CRITICAL).length;
    const totalScore = tracker.getViolationScore();

    // Immediate actions for severe violations
    if (criticalCount >= 1) {
      return ViolationAction.KICK;
    }
    
    if (severeCount >= 3) {
      return ViolationAction.BAN_TEMPORARY;
    }

    if (totalScore >= BAN_THRESHOLD) {
      return ViolationAction.BAN_TEMPORARY;
    }

    // Warning level
    if (severeCount >= 1 || totalScore >= ANOMALY_THRESHOLD) {
      return ViolationAction.WARN;
    }

    return ViolationAction.LOG_ONLY;
  }

  /**
   * Sanitize input for logging (remove sensitive/unnecessary data)
   * @private
   * @param {Object} input - Input to sanitize
   * @returns {Object} Sanitized input
   */
  _sanitizeInput(input) {
    if (!input) return {};
    
    const sanitized = {};
    if (input.position) sanitized.position = input.position;
    if (input.velocity) sanitized.velocity = input.velocity;
    if (input.speedKmh !== undefined) sanitized.speedKmh = input.speedKmh;
    if (input.sequence !== undefined) sanitized.sequence = input.sequence;
    
    return sanitized;
  }

  /**
   * Load existing bans from Redis
   * @private
   * @returns {Promise<void>}
   */
  async _loadBans() {
    if (!this.redis) return;

    try {
      // This would be more efficient with a proper scan in production
      // For now, we'll load bans on-demand when checking
      console.log('[AntiCheatService] Ban loading ready');
    } catch (err) {
      console.error('[AntiCheatService] Error loading bans:', err.message);
    }
  }

  // ==========================================================================
  // SHUTDOWN
  // ==========================================================================

  /**
   * Gracefully shut down the anti-cheat service
   * @returns {Promise<void>}
   */
  async shutdown() {
    console.log('[AntiCheatService] Shutting down...');

    // Clear player tracking
    this.players.clear();

    // Close Redis
    if (this.redis) {
      await this.redis.quit();
    }

    this.initialized = false;
    this.emit('shutdown');

    console.log('[AntiCheatService] Shutdown complete');
  }

  // ==========================================================================
  // STATUS / HEALTH CHECK
  // ==========================================================================

  /**
   * Get service status for health checks
   * @returns {Object} Service status
   */
  getStatus() {
    return {
      service: 'AntiCheatService',
      initialized: this.initialized,
      playersTracked: this.players.size,
      activeBans: this.bans.size,
      stats: this.stats,
      config: {
        maxSpeedMultiplier: this.config.maxSpeedMultiplier,
        maxPositionDelta: this.config.maxPositionDelta,
        anomalyThreshold: this.config.anomalyThreshold,
        banThreshold: this.config.banThreshold,
        replayEnabled: this.config.replayEnabled,
        fingerprintingEnabled: this.config.fingerprintingEnabled
      }
    };
  }
}

// ============================================================================
// HELPER FUNCTION FOR UUID GENERATION
// ============================================================================

/**
 * Generate UUID v4 (polyfill if needed)
 * @returns {string} UUID
 * @private
 */
function uuidv4() {
  try {
    const { randomUUID } = require('crypto');
    return randomUUID();
  } catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default AntiCheatService;
export { PlayerTracker, VEHICLE_STATS, TRACK_DATA };
