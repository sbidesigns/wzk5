// server/anti-cheat/AntiCheat.js — AAA Anti-Cheat System
// Provides server-side input validation, statistical anomaly detection,
// replay verification, client fingerprinting, and violation scoring.
//
// Features:
// - Server-side input validation (speed thresholds, position sanity checks)
// - Statistical anomaly detection (impossible lap times based on vehicle stats)
// - Replay verification system (record inputs, replay on server)
// - Client fingerprinting collection for hardware bans
// - Violation scoring system with graduated responses (warn/kick/ban)
// - Hardware ban support via fingerprint hashing
//
// @module anti-cheat/AntiCheat

import Redis from 'ioredis';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Load configuration
 * @private
 */
function loadConfig() {
  try {
    const configPath = join(__dirname, '../config/gameServer.config.json');
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

const CONFIG = loadConfig();

/**
 * Vehicle performance database for anomaly detection
 * Contains max speeds, acceleration values for each vehicle
 * @type {Object.<string, Object>}
 * @constant
 */
const VEHICLE_STATS = {
  spectre: { maxSpeed: 320, acceleration: 45, handling: 85, nitroBoost: 1.4 },
  phantom: { maxSpeed: 340, acceleration: 40, handling: 75, nitroBoost: 1.35 },
  viper: { maxSpeed: 310, acceleration: 50, handling: 90, nitroBoost: 1.45 },
  titan: { maxSpeed: 300, acceleration: 55, handling: 70, nitroBoost: 1.5 },
  ghost: { maxSpeed: 330, acceleration: 42, handling: 80, nitroBoost: 1.38 },
  storm: { maxSpeed: 315, acceleration: 48, handling: 88, nitroBoost: 1.42 },
  nova: { maxSpeed: 325, acceleration: 44, handling: 82, nitroBoost: 1.4 },
  eclipse: { maxSpeed: 350, acceleration: 38, handling: 72, nitroBoost: 1.32 }
};

/**
 * Track data for lap time validation
 * Contains minimum possible lap times based on track length and max speed
 * @type {Object.<string, Object>}
 * @constant
 */
const TRACK_DATA = {
  downtown: { length: 3200, minLapTime: 42000, checkpoints: 8, name: 'Downtown Dash' },
  mountain: { length: 4500, minLapTime: 58000, checkpoints: 10, name: 'Mountain Pass' },
  coastal: { length: 3800, minLapTime: 50000, checkpoints: 9, name: 'Coastal Highway' },
  volcano: { length: 5200, minLapTime: 68000, checkpoints: 12, name: 'Volcano Trail' },
  neon: { length: 2900, minLapTime: 38000, checkpoints: 7, name: 'Neon City' },
  arctic: { length: 4100, minLapTime: 53000, checkpoints: 10, name: 'Arctic Circle' }
};

// ============================================================================
// VIOLATION LEVELS AND THRESHOLDS
// ============================================================================

/**
 * Violation severity levels
 * @enum {string}
 */
export const ViolationLevel = {
  NONE: 'none',
  LOW: 'low',       // Suspicious but possibly legit (minor desync)
  MEDIUM: 'medium', // Likely cheating (speed hack indicators)
  HIGH: 'high',     // Almost certainly cheating (impossible movements)
  CRITICAL: 'critical' // Definite cheating (teleportation, etc.)
};

/**
 * Action types for violations
 * @enum {string}
 */
export const ViolationAction = {
  NONE: 'none',
  WARN: 'warn',         // Log warning, notify admins
  KICK: 'kick',         // Remove from current session
  TEMP_BAN: 'temp_ban', // Temporary ban (24h)
  PERM_BAN: 'perm_ban'  // Permanent ban
};

/**
 * Thresholds for violation actions
 * @type {Object.<ViolationAction, number>}
 */
const ACTION_THRESHOLDS = {
  [ViolationAction.NONE]: 0,
  [ViolationAction.WARN]: 3,
  [ViolationAction.KICK]: parseInt(CONFIG.antiCheat?.anomalyThreshold || 5),
  [ViolationAction.TEMP_BAN]: parseInt(CONFIG.antiCheat?.banThreshold || 10),
  [ViolationAction.PERM_BAN]: 20
};

// ============================================================================
// MAIN ANTI-CHEAT CLASS
// ============================================================================

/**
 * Main Anti-Cheat System class
 * Manages all cheat detection, violation scoring, and enforcement
 * 
 * @extends EventEmitter
 * 
 * @fires AntiCheat#violationDetected - When a violation is detected
 * @fires AntiCheat#playerWarned - When player receives warning
 * @fires AntiCheat#playerKicked - When player is kicked
 * @fires AntiCheat#playerBanned - When player is banned
 * 
 * @example
 * const antiCheat = new AntiCheat(redisClient);
 * antiCheat.on('violationDetected', (v) => console.log('Violation:', v));
 * 
 * // Validate input every tick
 * const result = await antiCheat.validateInput(playerId, input, state);
 */
export class AntiCheat extends EventEmitter {
  /**
   * Create AntiCheat instance
   * @param {string|Redis} [redisUrl] - Redis connection URL or instance
   * @param {Object} [options] - Configuration overrides
   */
  constructor(redisUrl, options = {}) {
    super();
    
    this._redis = typeof redisUrl === 'string' ? new Redis(redisUrl) : redisUrl;
    
    // Configuration
    const acConfig = CONFIG.antiCheat || {};
    this.maxSpeedMultiplier = options.maxSpeedMultiplier || acConfig.maxSpeedMultiplier || 1.5;
    this.maxPositionDelta = options.maxPositionDelta || acConfig.maxPositionDelta || 50;
    this.anomalyThreshold = options.anomalyThreshold || acConfig.anomalyThreshold || 3;
    this.banThreshold = options.banThreshold || acConfig.banThreshold || 10;
    
    // In-memory violation tracking (for active sessions)
    this._violations = new Map(); // playerId -> violations array
    
    // Replay buffers (circular buffers per player)
    this._replayBuffers = new Map();
    
    console.log('[AntiCheat] Initialized');
  }

  // ==========================================================================
  // INPUT VALIDATION
  // ==========================================================================

  /**
   * Validate player input against game rules and physics constraints
   * Called every server tick to verify client-sent inputs are plausible
   * 
   * @param {string} playerId - Player identifier
   * @param {Object} input - Client input to validate
   * @param {number} input.sequence - Input sequence number
   * @param {Object} input.position - Reported position {x, y, z}
   * @param {Object} input.velocity - Reported velocity {x, y, z}
   * @param {number} input.speedKmh - Reported speed in km/h
   * @param {Object} state - Current authoritative game state
   * @returns {Promise<ValidationResult>} Validation result
   * 
   * @example
   * const result = await antiCheat.validateInput(playerId, {
   *   sequence: 142,
   *   position: { x: 100, y: 5, z: 200 },
   *   velocity: { x: 10, y: 0, z: 15 },
   *   speedKmh: 250
   * }, currentState);
   */
  async validateInput(playerId, input, state) {
    const result = {
      valid: true,
      violations: [],
      correctedInput: { ...input }
    };

    try {
      // Get player's last known state for comparison
      const lastState = await this._getLastState(playerId);
      
      // 1. Speed validation
      const speedResult = this._validateSpeed(input, state);
      if (!speedResult.valid) {
        result.violations.push(speedResult);
        result.valid = false;
      }

      // 2. Position sanity check
      if (lastState) {
        const positionResult = this._validatePosition(input, lastState);
        if (!positionResult.valid) {
          result.violations.push(positionResult);
          result.valid = false;
          
          // Correct position to interpolated value if discrepancy is severe
          if (positionResult.severity === ViolationLevel.HIGH || 
              positionResult.severity === ViolationLevel.CRITICAL) {
            result.correctedInput.position = positionResult.correctedPosition;
          }
        }
      }

      // 3. Sequence number check (detect out-of-order/duplicate packets)
      const sequenceResult = this._validateSequence(input, lastState);
      if (!sequenceResult.valid) {
        result.violations.push(sequenceResult);
        // Don't invalidate for sequence issues alone, just log
      }

      // 4. Boundary/world check
      const boundaryResult = this._validateBoundaries(input, state);
      if (!boundaryResult.valid) {
        result.violations.push(boundaryResult);
        result.valid = false;
      }

      // Process any violations found
      if (result.violations.length > 0) {
        await this._processViolations(playerId, result.violations);
      }

      // Update stored state for next comparison
      await this._updateLastState(playerId, input);

      return result;
    } catch (error) {
      console.error('[AntiCheat] Input validation error:', error.message);
      result.valid = true; // Allow on error to avoid false positives
      return result;
    }
  }

  /**
   * Validate reported speed against vehicle capabilities
   * @private
   */
  _validateSpeed(input, state) {
    const vehicleId = state?.vehicleId || 'spectre';
    const stats = VEHICLE_STATS[vehicleId] || VEHICLE_STATS.spectre;
    
    // Calculate maximum allowed speed (base + nitro buffer)
    let maxAllowedSpeed = stats.maxSpeed * this.maxSpeedMultiplier;
    
    // Check if nitro is active (allow higher speed)
    if (input.nitroActive) {
      maxAllowedSpeed *= stats.nitroBoost;
    }

    const reportedSpeed = input.speedKmh || 0;
    
    if (reportedSpeed > maxAllowedSpeed) {
      const excessPercent = ((reportedSpeed - maxAllowedSpeed) / maxAllowedSpeed * 100).toFixed(1);
      
      return {
        valid: false,
        type: 'SPEED_ANOMALY',
        severity: excessPercent > 50 ? ViolationLevel.CRITICAL : 
                  excessPercent > 25 ? ViolationLevel.HIGH :
                  excessPercent > 10 ? ViolationLevel.MEDIUM : ViolationLevel.LOW,
        message: `Speed ${reportedSpeed} km/h exceeds max ${maxAllowedSpeed.toFixed(0)} km/h (+${excessPercent}%)`,
        value: reportedSpeed,
        expectedMax: maxAllowedScored
      };
    }

    return { valid: true };
  }

  /**
   * Validate position change is physically possible
   * Uses delta from last known position and time elapsed
   * @private
   */
  _validatePosition(input, lastState) {
    const dt = (input.timestamp || Date.now()) - (lastState.timestamp || Date.now());
    const timeSeconds = Math.max(dt, 16) / 1000; // Minimum one tick (16ms at 60Hz)

    const dx = (input.position?.x || 0) - (lastState.position?.x || 0);
    const dy = (input.position?.y || 0) - (lastState.position?.y || 0);
    const dz = (input.position?.z || 0) - (lastState.position?.z || 0);
    
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    // Maximum distance based on max speed and time
    const maxDistance = (VEHICLE_STATS.spectre.maxSpeed / 3.6) * timeSeconds * this.maxSpeedMultiplier;
    
    if (distance > maxDistance) {
      const severity = distance > maxDistance * 3 ? ViolationLevel.CRITICAL :
                       distance > maxDistance * 2 ? ViolationLevel.HIGH :
                       distance > maxDistance * 1.5 ? ViolationLevel.MEDIUM : ViolationLevel.LOW;

      // Calculate interpolated/corrected position
      const ratio = maxDistance / distance;
      const correctedPosition = {
        x: (lastState.position?.x || 0) + dx * ratio,
        y: (lastState.position?.y || 0) + dy * ratio,
        z: (lastState.position?.z || 0) + dz * ratio
      };

      return {
        valid: false,
        type: 'POSITION_ANOMALY',
        severity,
        message: `Moved ${distance.toFixed(2)}m in ${timeSeconds.toFixed(3)}s (max: ${maxDistance.toFixed(2)}m)`,
        value: distance,
        expectedMax: maxDistance,
        correctedPosition
      };
    }

    return { valid: true };
  }

  /**
   * Validate input sequence numbers
   * Detects duplicate or out-of-order inputs
   * @private
   */
  _validateSequence(input, lastState) {
    const currentSeq = input.sequence || 0;
    const lastSeq = lastState?.sequence || 0;

    // Check for duplicate
    if (currentSeq <= lastSeq && lastSeq > 0) {
      return {
        valid: false,
        type: 'DUPLICATE_SEQUENCE',
        severity: ViolationLevel.LOW,
        message: `Duplicate/out-of-order sequence: ${currentSeq} <= ${lastSeq}`,
        value: currentSeq,
        expectedMin: lastSeq + 1
      };
    }

    // Check for large jumps (packet loss simulation attempt)
    if (currentSeq - lastSeq > 10 && lastSeq > 0) {
      return {
        valid: false,
        type: 'SEQUENCE_JUMP',
        severity: ViolationLevel.LOW,
        message: `Large sequence jump: ${lastSeq} -> ${currentSeq}`,
        value: currentSeq - lastSeq
      };
    }

    return { valid: true };
  }

  /**
   * Validate position is within world boundaries
   * @private
   */
  _validateBoundaries(input, state) {
    const pos = input.position || {};
    const trackId = state?.trackId || 'downtown';
    
    // Basic world bounds (would be more specific per track in production)
    const bounds = {
      minX: -5000, maxX: 5000,
      minY: -100, maxY: 1000,
      minZ: -5000, maxZ: 5000
    };

    if (pos.x < bounds.minX || pos.x > bounds.maxX ||
        pos.y < bounds.minY || pos.y > bounds.maxY ||
        pos.z < bounds.minZ || pos.z > bounds.maxZ) {
      return {
        valid: false,
        type: 'BOUNDARY_VIOLATION',
        severity: ViolationLevel.CRITICAL,
        message: `Position outside world bounds: (${pos.x}, ${pos.y}, ${pos.z})`,
        value: pos
      };
    }

    return { valid: true };
  }

  // ==========================================================================
  // STATISTICAL ANOMALY DETECTION
  // ==========================================================================

  /**
   * Detect statistical anomalies in race performance
   * Compares actual performance against theoretical limits
   * 
   * @param {string} playerId - Player identifier
   * @param {Object} raceData - Race performance data
   * @param {string} raceData.trackId - Track identifier
   * @param {string} raceData.vehicleId - Vehicle used
   * @param {number} raceData.lapTime - Lap time in milliseconds
   * @param {number} raceData.totalTime - Total race time
   * @param {Array} raceData.checkpointTimes - Times at each checkpoint
   * @param {number} raceData.lapsCompleted - Number of laps finished
   * @returns {Promise<Object>} Anomaly detection result
   * 
   * @example
   * const anomalies = await antiCheat.detectAnomaly(playerId, {
   *   trackId: 'downtown',
   *   vehicleId: 'spectre',
   *   lapTime: 38000, // Suspiciously fast!
   *   checkpointTimes: [5000, 12000, 18000, ...],
   *   totalTime: 76000,
   *   lapsCompleted: 2
   * });
   */
  async detectAnomaly(playerId, raceData) {
    const anomalies = [];
    
    try {
      const track = TRACK_DATA[raceData.trackId];
      const vehicle = VEHICLE_STATS[raceData.vehicleId] || VEHICLE_STATS.spectre;

      if (!track) {
        console.warn(`[AntiCheat] Unknown track: ${raceData.trackId}`);
        return { suspicious: false, anomalies: [] };
      }

      // 1. Lap time validation
      if (raceData.lapTime) {
        const minPossibleLap = track.minLapTime * 0.95; // 5% tolerance for perfect run
        
        if (raceData.lapTime < minPossibleLap) {
          anomalies.push({
            type: 'IMPOSSIBLE_LAP_TIME',
            severity: ViolationLevel.CRITICAL,
            message: `Lap time ${raceData.lapTime}ms below minimum possible ${minPossibleLap}ms`,
            value: raceData.lapTime,
            expectedMin: minPossibleLap
          });
        }
      }

      // 2. Checkpoint timing analysis
      if (raceData.checkpointTimes && raceData.checkpointTimes.length > 0) {
        const checkpointAnomalies = this._analyzeCheckpointTimes(
          raceData.checkpointTimes,
          track,
          vehicle
        );
        anomalies.push(...checkpointAnomalies);
      }

      // 3. Average speed analysis
      if (raceData.totalTime && raceData.lapsCompleted > 0) {
        const totalDistance = track.length * raceData.lapsCompleted;
        const avgSpeed = (totalDistance / raceData.totalTime) * 3600; // m/s to km/h
        
        if (avgSpeed > vehicle.maxSpeed * 1.1) { // 10% tolerance
          anomalies.push({
            type: 'SUSPICIOUS_AVERAGE_SPEED',
            severity: ViolationLevel.HIGH,
            message: `Average speed ${avgSpeed.toFixed(1)} km/h exceeds vehicle max ${vehicle.maxSpeed} km/h`,
            value: avgSpeed,
            expectedMax: vehicle.maxSpeed
          });
        }
      }

      // 4. Consistency analysis (compare with historical data)
      const historicalAnomaly = await this._analyzeHistoricalConsistency(
        playerId,
        raceData
      );
      if (historicalAnomaly) {
        anomalies.push(historicalAnomaly);
      }

      // Process detected anomalies
      if (anomalies.length > 0) {
        await this._processViolations(playerId, anomalies);
      }

      return {
        suspicious: anomalies.some(a => 
          a.severity === ViolationLevel.HIGH || 
          a.severity === ViolationLevel.CRITICAL
        ),
        anomalies,
        score: this._calculateAnomalyScore(anomalies)
      };
    } catch (error) {
      console.error('[AntiCheat] Anomaly detection error:', error.message);
      return { suspicious: false, anomalies: [], error: error.message };
    }
  }

  /**
   * Analyze checkpoint times for impossible splits
   * @private
   */
  _analyzeCheckpointTimes(checkpointTimes, track, vehicle) {
    const anomalies = [];
    const numCheckpoints = track.checkpoints;
    
    if (checkpointTimes.length !== numCheckpoints) {
      anomalies.push({
        type: 'CHECKPOINT_COUNT_MISMATCH',
        severity: ViolationLevel.MEDIUM,
        message: `Expected ${numCheckpoints} checkpoints, got ${checkpointTimes.length}`
      });
      return anomalies;
    }

    // Calculate split times
    let prevTime = 0;
    for (let i = 0; i < checkpointTimes.length; i++) {
      const splitTime = checkpointTimes[i] - prevTime;
      prevTime = checkpointTimes[i];

      // Estimate minimum split time (rough calculation)
      const segmentRatio = 1 / numCheckpoints;
      const minSplitTime = track.minLapTime * segmentRatio * 0.9; // 10% tolerance

      if (splitTime < minSplitTime && splitTime > 0) {
        anomalies.push({
          type: 'IMPOSSIBLE_SPLIT_TIME',
          severity: ViolationLevel.HIGH,
          message: `Checkpoint ${i + 1} split ${splitTime}ms below minimum ${minSplitTime}ms`,
          checkpointIndex: i,
          value: splitTime,
          expectedMin: minSplitTime
        });
      }
    }

    return anomalies;
  }

  /**
   * Compare performance against historical data
   * Significant deviations may indicate cheating
   * @private
   */
  async _analyzeHistoricalConsistency(playerId, raceData) {
    try {
      const historicalKey = `wzk5:anticheat:history:${playerId}`;
      const history = await this._redis.get(historicalKey);

      if (!history) {
        // No history yet, store this as baseline
        await this._redis.setex(
          historicalKey,
          7 * 24 * 60 * 60, // 7 days
          JSON.stringify({
            bestLapTime: raceData.lapTime,
            avgLapTime: raceData.lapTime,
            racesCount: 1,
            lastRace: Date.now()
          })
        );
        return null;
      }

      const hist = JSON.parse(history);
      
      // Check for dramatic improvement (possible new cheat)
      if (hist.racesCount >= 5 && raceData.lapTime) {
        const improvementFactor = hist.avgLapTime / raceData.lapTime;
        
        if (improvementFactor > 1.3) { // 30%+ improvement is suspicious
          return {
            type: 'SUSPICIOUS_IMPROVEMENT',
            severity: ViolationLevel.MEDIUM,
            message: `${(improvementFactor * 100 - 100).toFixed(0)}% improvement over historical average`,
            value: raceData.lapTime,
            historicalAvg: hist.avgLapTime,
            racesCompared: hist.racesCount
          };
        }
      }

      // Update history
      const newAvg = (hist.avgLapTime * hist.racesCount + (raceData.lapTime || hist.avgLapTime)) / (hist.racesCount + 1);
      await this._redis.setex(
        historicalKey,
        7 * 24 * 60 * 60,
        JSON.stringify({
          bestLapTime: Math.min(hist.bestLapTime, raceData.lapTime || Infinity),
          avgLapTime: newAvg,
          racesCount: hist.racesCount + 1,
          lastRace: Date.now()
        })
      );

      return null;
    } catch (error) {
      console.error('[AntiCheat] Historical analysis error:', error.message);
      return null;
    }
  }

  // ==========================================================================
  // REPLAY SYSTEM
  // ==========================================================================

  /**
   * Record input for replay verification
   * Stores inputs in circular buffer for post-race verification
   * 
   * @param {string} playerId - Player identifier
   * @param {Object} input - Input to record
   * @returns {void}
   */
  recordReplay(playerId, input) {
    if (!this._replayBuffers.has(playerId)) {
      this._replayBuffers.set(playerId, {
        inputs: [],
        maxSize: 3600, // 60 seconds at 60Hz
        startTime: Date.now()
      });
    }

    const buffer = this._replayBuffers.get(playerId);
    buffer.inputs.push({
      ...input,
      timestamp: Date.now()
    });

    // Maintain circular buffer size
    while (buffer.inputs.length > buffer.maxSize) {
      buffer.inputs.shift();
    }
  }

  /**
   * Get recorded replay data for a player
   * 
   * @param {string} playerId - Player identifier
   * @returns {Object|null} Replay data or null if no recording exists
   */
  getReplay(playerId) {
    return this._replayBuffers.get(playerId) || null;
  }

  /**
   * Verify replay by re-simulating on server
   * Compares replay results with original submitted results
   * 
   * @param {string} playerId - Player identifier
   * @param {Object} originalResults - Originally submitted results
   * @param {Function} simulateFn - Physics simulation function
   * @returns {Promise<Object>} Verification result
   */
  async verifyReplay(playerId, originalResults, simulateFn) {
    const replay = this._replayBuffers.get(playerId);
    
    if (!replay || replay.inputs.length === 0) {
      return {
        verified: false,
        reason: 'No replay data available'
      };
    }

    try {
      // Run simulation with recorded inputs
      const simulatedResults = await simulateFn(replay.inputs);
      
      // Compare results
      const discrepancies = this._compareResults(originalResults, simulatedResults);
      
      const verificationResult = {
        verified: discrepancies.length === 0,
        discrepancies,
        inputCount: replay.inputs.length,
        duration: Date.now() - replay.startTime
      };

      // If major discrepancies found, flag as potential cheat
      if (!verificationResult.verified) {
        const violations = discrepancies.map(d => ({
          type: 'REPLAY_DISCREPANCY',
          severity: d.severity > 0.2 ? ViolationLevel.HIGH : ViolationLevel.MEDIUM,
          message: `${d.metric} differs by ${(d.difference * 100).toFixed(1)}%`,
          metric: d.metric,
          original: d.original,
          simulated: d.simulated
        }));

        await this._processViolations(playerId, violations);
      }

      // Clean up replay buffer after verification
      this._replayBuffers.delete(playerId);

      return verificationResult;
    } catch (error) {
      console.error('[AntiCheat] Replay verification error:', error.message);
      return { verified: false, reason: error.message };
    }
  }

  /**
   * Compare original and simulated results
   * @private
   */
  _compareResults(original, simulated) {
    const discrepancies = [];
    const tolerance = 0.05; // 5% tolerance for floating point differences

    const metrics = ['finishTime', 'totalDistance', 'avgSpeed', 'lapTimes'];
    
    for (const metric of metrics) {
      if (original[metric] && simulated[metric]) {
        const diff = Math.abs(original[metric] - simulated[metric]) / original[metric];
        if (diff > tolerance) {
          discrepancies.push({
            metric,
            original: original[metric],
            simulated: simulated[metric],
            difference: diff,
            severity: diff
          });
        }
      }
    }

    return discrepancies;
  }

  // ==========================================================================
  // CLIENT FINGERPRINTING
  // ==========================================================================

  /**
   * Collect and store client fingerprint for hardware identification
   * Used for hardware banning when account bans are insufficient
   * 
   * @param {string} playerId - Player identifier
   * @param {Object} fingerprint - Client fingerprint data
   * @param {string} [fingerprint.hardwareId] - Hardware ID hash
   * @param {string} [fingerprint.machineGuid] - Machine GUID
   * @param {string} [fingerprint.macAddressHash] - MAC address hash
   * @param {string} [fingerprint.cpuId] - CPU identifier hash
   * @param {Object} [fingerprint.systemInfo] - System information
   * @returns {Promise<string>} Generated fingerprint hash
   */
  async collectFingerprint(playerId, fingerprint) {
    try {
      // Create combined fingerprint hash
      const fingerprintData = [
        fingerprint.hardwareId,
        fingerprint.machineGuid,
        fingerprint.macAddressHash,
        fingerprint.cpuId,
        JSON.stringify(fingerprint.systemInfo || {})
      ].filter(Boolean).join('|');

      const hash = crypto.createHash('sha256')
        .update(fingerprintData)
        .digest('hex');

      // Store fingerprint mapping
      await this._redis.hset(`wzk5:fingerprint:${hash}`, {
        playerId,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        systemInfo: JSON.stringify(fingerprint.systemInfo || {})
      });

      // Index player -> fingerprint
      await this._redis.set(`wzk5:playerfp:${playerId}`, hash);

      // Set expiry (30 days)
      await this._redis.expire(`wzk5:fingerprint:${hash}`, 30 * 24 * 60 * 60);
      await this._redis.expire(`wzk5:playerfp:${playerId}`, 30 * 24 * 60 * 60);

      console.log(`[AntiCheat] Fingerprint collected for ${playerId}: ${hash.substring(0, 16)}...`);
      return hash;
    } catch (error) {
      console.error('[AntiCheat] Fingerprint collection error:', error.message);
      return null;
    }
  }

  /**
   * Check if a fingerprint is banned
   * 
   * @param {string} fingerprintHash - Fingerprint hash to check
   * @returns {Promise<Object|null>} Ban info or null if not banned
   */
  async checkFingerprintBan(fingerprintHash) {
    const banData = await this._redis.get(`wzk5:ban:hw:${fingerprintHash}`);
    
    if (banData) {
      return JSON.parse(banData);
    }

    return null;
  }

  // ==========================================================================
  // VIOLATION SCORING & ENFORCEMENT
  // ==========================================================================

  /**
   * Score and process detected violations
   * Tracks violations per player and takes action when thresholds exceeded
   * 
   * @param {string} playerId - Player identifier
   * @param {Array<Object>} violations - Detected violations
   * @returns {Promise<Object>} Processing result with action taken
   */
  async _processViolations(playerId, violations) {
    // Initialize violation tracking if needed
    if (!this._violations.has(playerId)) {
      this._violations.set(playerId, []);
    }

    const playerViolations = this._violations.get(playerId);
    
    // Add new violations
    for (const violation of violations) {
      playerViolations.push({
        ...violation,
        timestamp: Date.now()
      });
    }

    // Keep only recent violations (last hour)
    const oneHourAgo = Date.now() - 3600000;
    const recentViolations = playerViolations.filter(v => v.timestamp > oneHourAgo);
    this._violations.set(playerId, recentViolations);

    // Calculate weighted score
    const score = this._calculateViolationScore(recentViolations);

    // Persist to Redis
    await this._redis.setex(
      `wzk5:anticheat:violations:${playerId}`,
      3600, // 1 hour expiry
      JSON.stringify({ score, count: recentViolations.length, violations: recentViolations.slice(-20) })
    );

    // Determine action
    const action = this._determineAction(score);
    
    // Emit event
    this.emit('violationDetected', {
      playerId,
      violations,
      score,
      action,
      timestamp: Date.now()
    });

    // Take action
    let result = { action: ViolationAction.NONE, score };
    
    switch (action) {
      case ViolationAction.WARN:
        console.warn(`[AntiCheat] WARNING: Player ${playerId} (score: ${score})`);
        this.emit('playerWarned', { playerId, score, violations: recentViolations });
        break;

      case ViolationAction.KICK:
        console.error(`[AntiCheat] KICKING: Player ${playerId} (score: ${score})`);
        this.emit('playerKicked', { playerId, score, reason: 'Suspicious activity detected' });
        result.action = ViolationAction.KICK;
        break;

      case ViolationAction.TEMP_BAN:
        console.error(`[AntiCheat] TEMP BAN: Player ${playerId} (score: ${score})`);
        await this._banPlayer(playerId, 24 * 60 * 60); // 24 hours
        this.emit('playerBanned', { playerId, duration: '24h', score });
        result.action = ViolationAction.TEMP_BAN;
        break;

      case ViolationAction.PERM_BAN:
        console.error(`[AntiCheat] PERM BAN: Player ${playerId} (score: ${score})`);
        await this._banPlayer(playerId, -1); // Permanent
        // Also hardware ban
        const fpHash = await this._redis.get(`wzk5:playerfp:${playerId}`);
        if (fpHash) {
          await this._hardwareBan(fpHash, playerId);
        }
        this.emit('playerBanned', { playerId, duration: 'permanent', score });
        result.action = ViolationAction.PERM_BAN;
        break;
    }

    return result;
  }

  /**
   * Calculate weighted violation score
   * Higher severity violations contribute more
   * @private
   */
  _calculateViolationScore(violations) {
    const weights = {
      [ViolationLevel.LOW]: 1,
      [ViolationLevel.MEDIUM]: 2,
      [ViolationLevel.HIGH]: 5,
      [ViolationLevel.CRITICAL]: 10
    };

    return violations.reduce((sum, v) => sum + (weights[v.severity] || 1), 0);
  }

  /**
   * Calculate anomaly score from anomaly array
   * @private
   */
  _calculateAnomalyScore(anomalies) {
    return this._calculateViolationScore(anomalies);
  }

  /**
   * Determine action based on violation score
   * @private
   */
  _determineAction(score) {
    if (score >= ACTION_THRESHOLDS[ViolationAction.PERM_BAN]) return ViolationAction.PERM_BAN;
    if (score >= ACTION_THRESHOLDS[ViolationAction.TEMP_BAN]) return ViolationAction.TEMP_BAN;
    if (score >= ACTION_THRESHOLDS[ViolationAction.KICK]) return ViolationAction.KICK;
    if (score >= ACTION_THRESHOLDS[ViolationAction.WARN]) return ViolationAction.WARN;
    return ViolationAction.NONE;
  }

  /**
   * Ban a player
   * @private
   */
  async _banPlayer(playerId, duration) {
    const banData = {
      playerId,
      bannedAt: new Date().toISOString(),
      duration,
      expiresAt: duration > 0 
        ? new Date(Date.now() + duration * 1000).toISOString() 
        : null,
      reason: 'Automated anti-cheat detection'
    };

    // Store ban
    await this._redis.set(`wzk5:ban:account:${playerId}`, JSON.stringify(banData));
    
    if (duration > 0) {
      await this._redis.expire(`wzk5:ban:account:${playerId}`, duration);
    }

    // Mark account as banned
    await this._redis.hset(`wzk5:account:${playerId}`, {
      isBanned: 'true',
      banReason: banData.reason
    });
  }

  /**
   * Hardware ban a fingerprint
   * @private
   */
  async _hardwareBan(fingerprintHash, sourcePlayerId) {
    const banData = {
      sourcePlayerId,
      bannedAt: new Date().toISOString(),
      reason: 'Hardware ban from anti-cheat system'
    };

    await this._redis.set(`wzk5:ban:hw:${fingerprintHash}`, JSON.stringify(banData));
  }

  /**
   * Check if a player is currently banned
   * 
   * @param {string} playerId - Player identifier
   * @returns {Promise<Object|null>} Ban information or null if not banned
   */
  async checkBan(playerId) {
    // Check account ban
    const accountBan = await this._redis.get(`wzk5:ban:account:${playerId}`);
    if (accountBan) {
      return JSON.parse(accountBan);
    }

    // Check hardware ban via fingerprint
    const fpHash = await this._redis.get(`wzk5:playerfp:${playerId}`);
    if (fpHash) {
      const hwBan = await this.checkFingerprintBan(fpHash);
      if (hwBan) return hwBan;
    }

    return null;
  }

  /**
   * Get current violation status for a player
   * 
   * @param {string} playerId - Player identifier
   * @returns {Promise<Object>} Current violation status
   */
  async getViolationStatus(playerId) {
    const memViolations = this._violations.get(playerId) || [];
    const storedViolations = await this._redis.get(`wzk5:anticheat:violations:${playerId}`);
    
    const violations = storedViolations 
      ? JSON.parse(storedViolations).violations 
      : memViolations;

    return {
      playerId,
      currentScore: this._calculateViolationScore(violations),
      violationCount: violations.length,
      recentViolations: violations.slice(-10),
      actionThresholds: ACTION_THRESHOLDS
    };
  }

  // ==========================================================================
  // STATE MANAGEMENT (PRIVATE)
  // ==========================================================================

  /**
   * Get last known state for a player
   * @private
   */
  async _getLastState(playerId) {
    const data = await this._redis.get(`wzk5:anticheat:laststate:${playerId}`);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Update last known state for a player
   * @private
   */
  async _updateLastState(playerId, input) {
    await this._redis.setex(
      `wzk5:anticheat:laststate:${playerId}`,
      300, // 5 minutes
      JSON.stringify({
        position: input.position,
        velocity: input.velocity,
        speedKmh: input.speedKmh,
        sequence: input.sequence,
        timestamp: input.timestamp || Date.now()
      })
    );
  }

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  /**
   * Shutdown anti-cheat system gracefully
   */
  shutdown() {
    this._violations.clear();
    this._replayBuffers.clear();
    console.log('[AntiCheat] Shut down');
  }
}

// ============================================================================
// EXPORTS SUMMARY
// ============================================================================

/**
 * @namespace AntiCheat
 * @description Complete anti-cheat protection system
 * 
 * Classes:
 * - AntiCheat - Main anti-cheat orchestrator
 * 
 * Enums:
 * - ViolationLevel - Severity levels (NONE, LOW, MEDIUM, HIGH, CRITICAL)
 * - ViolationAction - Actions (NONE, WARN, KICK, TEMP_BAN, PERM_BAN)
 * 
 * Methods:
 * - validateInput(playerId, input, state) - Real-time input validation
 * - detectAnomaly(playerId, raceData) - Post-race statistical analysis
 * - recordReplay(playerId, input) - Record input for replay
 * - getReplay(playerId) - Get recorded replay
 * - verifyReplay(playerId, results, simFn) - Server-side replay verification
 * - collectFingerprint(playerId, fp) - Collect hardware fingerprint
 * - checkFingerprintBan(hash) - Check hardware ban
 * - checkBan(playerId) - Check if player is banned
 * - getViolationStatus(playerId) - Get violation details
 */

export default AntiCheat;
