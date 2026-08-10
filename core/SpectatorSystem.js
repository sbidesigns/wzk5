// core/SpectatorSystem.js
// Race spectating functionality with multiple camera modes,
// auto-director logic, split-screen support, and broadcast delay.

import { EventBus } from './EventBus.js';
import * as THREE from 'three';

/**
 * Camera mode enumeration
 * @enum {string}
 */
const CameraMode = {
  FOLLOW_LEADER: 'follow_leader',
  FOLLOW_PLAYER: 'follow_player',
  BROADCAST: 'broadcast',       // Auto-director
  FREE_CAM: 'free_cam',         // User-controlled orbit
  PIP: 'picture_in_picture'     // Picture-in-picture overlay
};

/**
 * @typedef {Object} SpectatorPlayer
 * @property {string} id - Player unique identifier
 * @property {string} name - Display name
 * @property {number} position - Current race position (1-based)
 * @property {THREE.Object3D} vehicle - Vehicle object to follow
 * @property {boolean} isHuman - Whether this is a human player
 * @property {Object} telemetry - Speed, lap, etc.
 */

/**
 * @typedef {Object} BroadcastEvent
 * @property {string} type - Event type ('overtake', 'crash', 'close_racing')
 * @property {number} time - Game time when event occurred
 * @property {string[]} involved - Player IDs involved
 * @property {number} priority - Action priority (higher = more important)
 * @property {number} duration - How long this action is interesting
 */

class SpectatorSystem {
  constructor() {
    /** @type {CameraMode} */
    this._mode = CameraMode.BROADCAST;
    /** @type {SpectatorPlayer[]} */
    this._players = [];
    /** @type {number} */
    this._focusedPlayerIndex = 0;
    /** @type {THREE.Camera} */
    this._camera = null;
    /** @type {THREE.Object3D} */
    this._cameraTarget = null;
    
    // Free camera controls
    this._freeCameraPosition = new THREE.Vector3(0, 10, -20);
    this._freeCameraLookAt = new THREE.Vector3();
    this._orbitAngles = { theta: 0, phi: Math.PI / 4 };
    this._orbitDistance = 30;

    // Auto-director state
    this._currentSubject = null;
    this._subjectChangeTime = 0;
    this._actionQueue = [];
    this._lastCutTime = 0;
    this._minCutInterval = 3; // Minimum seconds between cuts

    // Picture-in-picture
    this._pipEnabled = false;
    this._pipTarget = null;
    this._pipCamera = null;

    // Split-screen spectator
    this._splitscreenMode = false;
    this._splitCameras = [];

    // Broadcast delay (for streaming)
    this._broadcastDelay = 0; // seconds
    this._delayedState = [];
    this._realtimeState = [];

    // HUD data
    this._rankings = [];
    this._eventLog = [];
    this._selectedPlayerInfo = null;

    // Active state
    this._active = false;
    this._initialized = false;
  }

  /**
   * Initialize the spectator system
   * @param {THREE.Camera} camera - Main camera to control
   */
  init(camera) {
    if (!camera) {
      console.error('[SpectatorSystem] Cannot initialize without camera');
      return false;
    }

    this._camera = camera;
    this._pipCamera = camera.clone();
    this._initialized = true;
    console.log('[SpectatorSystem] Initialized');
    EventBus.emit('spectator:initialized');
    return true;
  }

  /**
   * Start spectating a race
   * @param {Array} players - Array of player objects to spectate
   */
  startSpectating(players) {
    if (!this._initialized) {
      console.error('[SpectatorSystem] Not initialized');
      return;
    }

    this._players = players.map((p, idx) => ({
      id: p.id || `player-${idx}`,
      name: p.name || `Racer ${idx + 1}`,
      position: p.position || idx + 1,
      vehicle: p.vehicle || null,
      isHuman: p.isHuman || false,
      telemetry: {
        speed: 0,
        lap: 1,
        bestLap: Infinity,
        totalTime: 0
      }
    }));

    this._active = true;
    this._focusedPlayerIndex = 0;
    this._eventLog = [];
    this._actionQueue = [];

    // Sort by initial position
    this._updateRankings();

    // Set initial subject for broadcast mode
    if (this._mode === CameraMode.BROADCAST) {
      this._selectBroadcastSubject();
    }

    console.log(`[SpectatorSystem] Started spectating ${this._players.length} players`);
    EventBus.emit('spectator:started', { playerCount: this._players.length });
  }

  /**
   * Stop spectating and clean up
   */
  stopSpectating() {
    this._active = false;
    this._players = [];
    this._actionQueue = [];
    this._eventLog = [];
    console.log('[SpectatorSystem] Stopped spectating');
    EventBus.emit('spectator:stopped');
  }

  /**
   * Set camera mode
   * @param {CameraMode} mode - Desired camera mode
   */
  setMode(mode) {
    if (!Object.values(CameraMode).includes(mode)) {
      console.warn(`[SpectatorSystem] Invalid mode: ${mode}`);
      return;
    }
    
    this._mode = mode;
    console.log(`[SpectatorSystem] Mode set to ${mode}`);
    EventBus.emit('spectator:modeChanged', { mode });
  }

  /**
   * Get current camera mode
   * @returns {CameraMode}
   */
  getMode() {
    return this._mode;
  }

  /**
   * Cycle focus to next player
   * @param {number} direction - 1 for next, -1 for previous
   */
  cyclePlayer(direction = 1) {
    if (this._players.length === 0) return;

    // Prefer human players when cycling
    const humanIndices = this._players
      .map((p, i) => ({ index: i, isHuman: p.isHuman }))
      .filter(p => p.isHuman)
      .map(p => p.index);

    if (humanIndices.length > 0) {
      const currentIdx = humanIndices.indexOf(this._focusedPlayerIndex);
      let nextIdx;
      
      if (currentIdx === -1) {
        nextIdx = direction > 0 ? humanIndices[0] : humanIndices[humanIndices.length - 1];
      } else {
        nextIdx = (currentIdx + direction + humanIndices.length) % humanIndices.length;
      }
      
      this._focusedPlayerIndex = humanIndices[nextIdx];
    } else {
      this._focusedPlayerIndex = (this._focusedPlayerIndex + direction + this._players.length) % this._players.length;
    }

    this._updateCameraTarget();
    EventBus.emit('spectator:focusChanged', { 
      playerId: this._getFocusedPlayer()?.id,
      position: this._focusedPlayerIndex + 1
    });
  }

  /**
   * Focus on specific player by position (1-8)
   * @param {number} position - Race position to focus
   */
  focusOnPosition(position) {
    if (position < 1 || position > this._players.length) return;
    
    // Find player at this position
    const playerIdx = this._players.findIndex(p => p.position === position);
    if (playerIdx !== -1) {
      this._focusedPlayerIndex = playerIdx;
      this._updateCameraTarget();
      EventBus.emit('spectator:focusChanged', { 
        playerId: this._players[playerIdx].id,
        position
      });
    }
  }

  /**
   * Get currently focused player
   * @returns {SpectatorPlayer|null}
   */
  _getFocusedPlayer() {
    return this._players[this._focusedPlayerIndex] || null;
  }

  /**
   * Update camera target based on current mode
   * @private
   */
  _updateCameraTarget() {
    switch (this._mode) {
      case CameraMode.FOLLOW_LEADER:
        const leader = this._players.find(p => p.position === 1);
        this._cameraTarget = leader?.vehicle || null;
        break;
        
      case CameraMode.FOLLOW_PLAYER:
        this._cameraTarget = this._getFocusedPlayer()?.vehicle || null;
        break;
        
      case CameraMode.BROADCAST:
        // Target set by auto-director
        break;
        
      case CameraMode.FREE_CAM:
        // No target, user controls
        this._cameraTarget = null;
        break;
        
      case CameraMode.PIP:
        this._cameraTarget = this._getFocusedPlayer()?.vehicle || null;
        break;
    }
  }

  /**
   * Auto-director: select most interesting subject
   * @private
   */
  _selectBroadcastSubject() {
    const now = performance.now() / 1000;
    
    // Don't cut too frequently
    if (now - this._lastCutTime < this._minCutInterval && this._currentSubject) {
      return;
    }

    // Score each potential subject
    let bestSubject = null;
    let bestScore = -Infinity;

    // Check action queue first (highest priority)
    for (const action of this._actionQueue) {
      if (action.priority > bestScore) {
        bestScore = action.priority;
        bestSubject = action.involved[0]; // Focus on primary actor
      }
    }

    // If no active actions, check for close racing
    if (!bestSubject) {
      for (let i = 0; i < this._players.length - 1; i++) {
        const p1 = this._players[i];
        const p2 = this._players[i + 1];
        
        // Calculate gap (simplified - would use actual positions in real impl)
        const gap = Math.abs(p1.telemetry.totalTime - p2.telemetry.totalTime);
        
        if (gap < 1.0) { // Within 1 second
          const score = 10 - gap * 5; // Closer = higher score
          if (score > bestScore) {
            bestScore = score;
            bestSubject = p1.id;
          }
        }
      }
    }

    // Default to leader
    if (!bestSubject) {
      const leader = this._players.find(p => p.position === 1);
      bestSubject = leader?.id;
    }

    // Apply change
    if (bestSubject && bestSubject !== this._currentSubject) {
      this._currentSubject = bestSubject;
      this._subjectChangeTime = now;
      this._lastCutTime = now;
      
      const newTarget = this._players.find(p => p.id === bestSubject);
      this._cameraTarget = newTarget?.vehicle || null;
      
      EventBus.emit('spectator:broadcastCut', { targetId: bestSubject });
    }
  }

  /**
   * Add an event to the action queue for auto-director
   * @param {BroadcastEvent} event - Event to queue
   */
  addBroadcastEvent(event) {
    const broadcastEvent = {
      ...event,
      timestamp: performance.now() / 1000,
      priority: event.priority || this._calculateEventPriority(event.type)
    };

    this._actionQueue.push(broadcastEvent);
    this._eventLog.push(broadcastEvent);

    // Keep only recent events (last 60 seconds)
    const cutoff = (performance.now() / 1000) - 60;
    this._actionQueue = this._actionQueue.filter(e => e.timestamp >= cutoff);

    // Log significant events
    if (broadcastEvent.priority >= 50) {
      console.log(`[SpectatorSystem] High priority event: ${event.type}`, event.involved);
    }

    EventBus.emit('spectator:eventAdded', broadcastEvent);
  }

  /**
   * Calculate priority for auto-director
   * @private
   * @param {string} eventType - Type of event
   * @returns {number} Priority score
   */
  _calculateEventPriority(eventType) {
    const priorities = {
      overtake: 80,
      crash: 90,
      spinout: 70,
      finish: 100,
      item_use_missile: 75,
      item_use_boost: 30,
      item_use_shield: 20,
      close_racing: 50,
      great_drift: 45,
      perfect_start: 40
    };
    return priorities[eventType] || 25;
  }

  /**
   * Update spectator system (call each frame)
   * @param {number} deltaTime - Time since last update
   */
  update(deltaTime) {
    if (!this._active || !this._initialized) return;

    // Update rankings from player positions
    this._updateRankings();

    // Update selected player info
    this._selectedPlayerInfo = this._getFocusedPlayer();

    // Handle camera based on mode
    switch (this._mode) {
      case CameraMode.FOLLOW_LEADER:
      case CameraMode.FOLLOW_PLAYER:
        this._updateFollowCamera(deltaTime);
        break;
        
      case CameraMode.BROADCAST:
        this._selectBroadcastSubject();
        this._updateFollowCamera(deltaTime);
        // Check for replay-worthy moments
        this._checkReplayMoments();
        break;
        
      case CameraMode.FREE_CAM:
        this._updateFreeCamera(deltaTime);
        break;
        
      case CameraMode.PIP:
        this._updateFollowCamera(deltaTime);
        this._updatePiPCamera(deltaTime);
        break;
    }

    // Process broadcast delay
    if (this._broadcastDelay > 0) {
      this._processDelayBuffer(deltaTime);
    }
  }

  /**
   * Update follow camera smoothly
   * @private
   */
  _updateFollowCamera(deltaTime) {
    if (!this._cameraTarget || !this._camera) return;

    const targetPos = new THREE.Vector3();
    this._cameraTarget.getWorldPosition(targetPos);

    // Smooth camera follow
    const idealOffset = new THREE.Vector3(0, 5, -12);
    idealOffset.applyQuaternion(this._cameraTarget.quaternion);
    
    const idealPos = targetPos.clone().add(idealOffset);
    this._camera.position.lerp(idealPos, Math.min(1, deltaTime * 5));
    
    const lookAtTarget = targetPos.clone().add(new THREE.Vector3(0, 2, 0));
    this._camera.lookAt(lookAtTarget);
  }

  /**
   * Update free/orbit camera
   * @private
   */
  _updateFreeCamera(deltaTime) {
    if (!this._camera) return;

    // Calculate position from orbit angles
    const x = this._orbitDistance * Math.sin(this._orbitAngles.theta) * Math.cos(this._orbitAngles.phi);
    const y = this._orbitDistance * Math.sin(this._orbitAngles.phi);
    const z = this._orbitDistance * Math.cos(this._orbitAngles.theta) * Math.cos(this._orbitAngles.phi);

    this._camera.position.set(x, Math.max(y, 2), z);
    this._camera.lookAt(this._freeCameraLookAt);
  }

  /**
   * Update picture-in-picture camera
   * @private
   */
  _updatePiPCamera(deltaTime) {
    if (!this._pipEnabled || !this._pipCamera || !this._pipTarget) return;

    const targetPos = new THREE.Vector3();
    this._pipTarget.getWorldPosition(targetPos);

    const offset = new THREE.Vector3(0, 8, -15);
    offset.applyQuaternion(this._pipTarget.quaternion);
    
    this._pipCamera.position.copy(targetPos).add(offset);
    this._pipCamera.lookAt(targetPos);
  }

  /**
   * Check for moments worthy of slow-mo replay
   * @private
   */
  _checkReplayMoments() {
    const recentEvents = this._actionQueue.filter(e => 
      e.priority >= 70 && (performance.now() / 1000) - e.timestamp < 2
    );

    for (const event of recentEvents) {
      if (!event.replayTriggered) {
        event.replayTriggered = true;
        EventBus.emit('spectator:replayMoment', {
          event,
          suggestedSlowmo: event.type === 'crash' || event.type === 'overtake'
        });
      }
    }
  }

  /**
   * Process broadcast delay buffer
   * @private
   */
  _processDelayBuffer(deltaTime) {
    // Add current state to realtime buffer
    // After delay period, move to delayed (visible) state
    // Simplified implementation
  }

  /**
   * Update internal rankings array
   * @private
   */
  _updateRankings() {
    this._rankings = [...this._players]
      .sort((a, b) => a.position - b.position)
      .map(p => ({
        id: p.id,
        name: p.name,
        position: p.position,
        speed: p.telemetry.speed,
        lap: p.telemetry.lap,
        totalTime: p.telemetry.totalTime,
        isHuman: p.isHuman
      }));
  }

  /**
   * Enable/disable picture-in-picture
   * @param {boolean} enabled - Whether PiP should be active
   * @param {string|null} targetPlayerId - Player to show in PiP window
   */
  setPiP(enabled, targetPlayerId = null) {
    this._pipEnabled = enabled;
    
    if (targetPlayerId) {
      const player = this._players.find(p => p.id === targetPlayerId);
      this._pipTarget = player?.vehicle || null;
    }

    EventBus.emit('spectator:pipToggled', { enabled, target: targetPlayerId });
  }

  /**
   * Enable splitscreen spectator mode
   * @param {boolean} enabled - Whether splitscreen is active
   * @param {string[]} targetPlayers - Players to show (max 2-4)
   */
  setSplitscreen(enabled, targetPlayers = []) {
    this._splitscreenMode = enabled;
    
    if (enabled && targetPlayers.length > 0) {
      this._splitCameras = targetPlayers.slice(0, 4).map(id => {
        const player = this._players.find(p => p.id === id);
        return {
          playerId: id,
          camera: this._camera.clone(),
          target: player?.vehicle || null
        };
      });
    }

    EventBus.emit('spectator:splitscreenToggled', { enabled, targets: targetPlayers });
  }

  /**
   * Set broadcast delay for streaming
   * @param {number} delaySeconds - Delay in seconds (0, 15, 30, 60)
   */
  setBroadcastDelay(delaySeconds) {
    const validDelays = [0, 15, 30, 60];
    if (!validDelays.includes(delaySeconds)) {
      console.warn(`[SpectatorSystem] Invalid delay: ${delaySeconds}. Use ${validDelays.join(', ')}`);
      return;
    }

    this._broadcastDelay = delaySeconds;
    console.log(`[SpectatorSystem] Broadcast delay set to ${delaySeconds}s`);
    EventBus.emit('spectator:delayChanged', { delay: delaySeconds });
  }

  /**
   * Get current broadcast delay
   * @returns {number}
   */
  getBroadcastDelay() {
    return this._broadcastDelay;
  }

  /**
   * Control free camera orbit
   * @param {number} deltaTheta - Horizontal rotation delta
   * @param {number} deltaPhi - Vertical rotation delta
   */
  orbitCamera(deltaTheta, deltaPhi) {
    this._orbitAngles.theta += deltaTheta;
    this._orbitAngles.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, this._orbitAngles.phi + deltaPhi));
  }

  /**
   * Zoom free camera
   * @param {number} delta - Zoom amount (positive = zoom out)
   */
  zoomCamera(delta) {
    this._orbitDistance = Math.max(10, Math.min(100, this._orbitDistance + delta));
  }

  /**
   * Set free camera look-at point
   * @param {THREE.Vector3} point - Point to look at
   */
  setFreeCameraLookAt(point) {
    this._freeCameraLookAt.copy(point);
  }

  /**
   * Get current HUD data for rendering
   * @returns {Object} HUD data
   */
  getHUDData() {
    return {
      rankings: this._rankings,
      selectedPlayer: this._selectedPlayerInfo ? {
        id: this._selectedPlayerInfo.id,
        name: this._selectedPlayerInfo.name,
        position: this._selectedPlayerInfo.position,
        vehicle: this._selectedPlayerInfo.vehicleId || 'Unknown',
        speed: this._selectedPlayerInfo.telemetry?.speed || 0,
        lap: this._selectedPlayerInfo.telemetry?.lap || 1,
        bestLap: this._selectedPlayerInfo.telemetry?.bestLap || 0,
        totalTime: this._selectedPlayerInfo.telemetry?.totalTime || 0
      } : null,
      timeGapToLeader: this._calculateTimeGap(),
      eventLog: this._eventLog.slice(-20), // Last 20 events
      mode: this._mode,
      broadcastDelay: this._broadcastDelay
    };
  }

  /**
   * Calculate time gap to leader for focused player
   * @private
   * @returns {string} Formatted time gap
   */
  _calculateTimeGap() {
    if (!this._selectedPlayerInfo || this._selectedPlayerInfo.position === 1) {
      return 'LEADER';
    }

    const leader = this._players.find(p => p.position === 1);
    if (!leader) return '--.--';

    const gap = this._selectedPlayerInfo.telemetry.totalTime - leader.telemetry.totalTime;
    return gap >= 0 ? `+${gap.toFixed(2)}` : gap.toFixed(2);
  }

  /**
   * Get PiP render data
   * @returns {Object|null}
   */
  getPiPData() {
    if (!this._pipEnabled) return null;
    
    return {
      camera: this._pipCamera,
      target: this._pipTarget
    };
  }

  /**
   * Get splitscreen viewports
   * @returns {Array}
   */
  getSplitscreenViewports() {
    if (!this._splitscreenMode) return [];
    return this._splitCameras;
  }

  /**
   * Check if spectator is active
   * @returns {boolean}
   */
  isActive() {
    return this._active;
  }

  /**
   * Get all available camera modes
   * @returns {CameraMode[]}
   */
  static getModes() {
    return Object.values(CameraMode);
  }
}

export const spectator = new SpectatorSystem();
export { CameraMode };
export default spectator;
