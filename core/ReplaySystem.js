// core/ReplaySystem.js
// Enhanced replay system for recording and playback.
// Records player inputs at 60Hz during race. Plays back as ghost vehicle.
// Replays are compact: array of input frames (throttle/brake/steer/drift/item + timestamp).
//
// Enhanced features:
// - Camera mode selection during playback
// - Variable playback speed control
// - Timeline scrubbing with checkpoint markers
// - Ghost comparison view support
// - Clip export with metadata
// - Auto-detection of highlights (overtakes, crashes, finishes)
// - Racing line analysis overlay data

import { EventBus } from './EventBus.js';

/**
 * Frame structure size in floats
 * @constant {number}
 */
const FRAME_SIZE = 6; // 6 floats per frame: time, throttle, brake, steer, drift, item

/**
 * Maximum number of frames (5 minutes at 60fps)
 * @constant {number}
 */
const MAX_FRAMES = 60 * 60 * 5;

/**
 * Available camera modes for replay playback
 * @enum {string}
 */
export const CameraMode = {
  FOLLOW: 'follow',           // Camera follows the replayed vehicle
  CINEMATIC: 'cinematic',     // Pre-defined cinematic camera angles
  FREE: 'free',               // User-controlled free camera
  COMPARISON: 'comparison',   // Side-by-side player vs ghost view
  TOP_DOWN: 'topdown',        // Top-down overview
  HOOD: 'hood'                // Hood/first-person view
};

/**
 * Available playback speeds
 * @enum {number}
 */
export const PlaybackSpeed = {
  QUARTER: 0.25,
  HALF: 0.5,
  NORMAL: 1,
  DOUBLE: 2,
  QUADRUPLE: 4
};

/**
 * Highlight event types detected in replays
 * @enum {string}
 */
export const HighlightType = {
  OVERTAKE: 'overtake',
  CRASH: 'crash',
  FINISH: 'finish',
  BEST_SPLIT: 'bestSplit',
  ITEM_USE: 'itemUse',
  NEAR_MISS: 'nearMiss'
};

/**
 * @typedef {Object} ReplayFrame
 * @property {number} time - Timestamp in seconds
 * @property {number} throttle - Throttle input (0-1)
 * @property {number} brake - Brake input (0-1)
 * @property {number} steer - Steering input (-1 to 1)
 * @property {boolean} drift - Whether drifting
 * @property {boolean} item - Whether item used
 */

/**
 * @typedef {Object} CheckpointMarker
 * @property {number} time - Time at checkpoint
 * @property {number} index - Checkpoint index
 * @property {string} label - Display label
 */

/**
 * @typedef {Object} HighlightEvent
 * @property {string} id - Unique identifier
 * @property {string} type - HighlightType value
 * @property {number} startTime - Event start time
 * @property {number} [endTime] - Event end time
 * @property {string} description - Human-readable description
 * @property {Object} [metadata] - Additional event-specific data
 */

/**
 * @typedef {Object} ClipMetadata
 * @property {string} id - Unique clip ID
 * @property {number} startTime - Clip start time
 * @property {number} endTime - Clip end time
 * @property {number} duration - Total duration
 * @property {Array<HighlightEvent>} highlights - Highlights within clip
 * @property {string} trackId - Track identifier
 * @property {number} lapTime - Final lap time if finished
 * @property {Date} created - Creation timestamp
 * @property {string} shareCode - Shareable code for this clip
 */

/**
 * @typedef {Object} RacingLinePoint
 * @property {number} x - X position
 * @property {number} z - Z position
 * @property {number} speed - Speed at this point
 * @property {number} time - Timestamp
 */

/**
 * Enhanced ReplaySystem class with full playback controls and analysis features
 */
class ReplaySystem {
  constructor() {
    // === CORE RECORDING STATE ===
    /** @private */ this._recording = false;
    /** @private */ this._frames = new Float32Array(MAX_FRAMES * FRAME_SIZE);
    /** @private */ this._frameCount = 0;
    /** @private */ this._startTime = 0;

    // === PLAYBACK STATE ===
    /** @type {Object|null} @private */ this._playback = null;
    /** @type {Object|null} @private */ this._ghostVehicle = null;
    /** @private */ this._isPlaying = false;
    /** @private */ this._playbackTime = 0;
    /** @private */ this._playbackSpeed = PlaybackSpeed.NORMAL;
    /** @private */ this._cameraMode = CameraMode.FOLLOW;
    /** @private */ this._loopPlayback = false;

    // === ENHANCED FEATURES ===
    /** @type {Array<CheckpointMarker>} @private */ this._checkpointMarkers = [];
    /** @type {Array<HighlightEvent>} @private */ this._highlights = [];
    /** @type {Array<RacingLinePoint>} @private */ this._racingLine = [];
    
    // Position data for racing line (recorded separately)
    /** @private */ this._positionFrames = [];
    /** @private */ this._recordPositions = false;

    // === GHOST COMPARISON ===
    /** @type {Object|null} @private */ this._comparisonGhost = null;
    /** @private */ this._showComparison = false;

    // === CALLBACKS ===
    /** @private */ this._onHighlightDetected = null;
    /** @private */ this._onPlaybackComplete = null;

    console.log('[ReplaySystem] Initialized with enhanced features');
  }

  // ==================== RECORDING METHODS ====================

  /**
   * Start recording a new replay
   * @param {Object} [options] - Recording options
   * @param {boolean} [options.recordPositions=false] - Also record position data for racing line
   */
  startRecording(options = {}) {
    this._recording = true;
    this._frameCount = 0;
    this._startTime = performance.now();
    this._positionFrames = [];
    this._recordPositions = options.recordPositions || false;
    this._highlights = [];
    this._racingLine = [];

    EventBus.emit('replay:recordingStarted');
  }

  /**
   * Record a single frame of input data
   * @param {Object} input - Input state object
   * @param {number} [input.throttle=0] - Throttle value
   * @param {number} [input.brake=0] - Brake value
   * @param {number} [input.steer=0] - Steering value
   * @param {boolean} [input.drift=false] - Drifting flag
   * @param {boolean} [input.item=false] - Item use flag
   * @param {Object} [position] - Optional position data for racing line
   */
  recordFrame(input, position = null) {
    if (!this._recording || this._frameCount >= MAX_FRAMES) return;

    const t = (performance.now() - this._startTime) / 1000;
    const offset = this._frameCount * FRAME_SIZE;

    // Store input frame
    this._frames[offset] = t;
    this._frames[offset + 1] = input.throttle || 0;
    this._frames[offset + 2] = input.brake || 0;
    this._frames[offset + 3] = input.steer || 0;
    this._frames[offset + 4] = input.drift ? 1 : 0;
    this._frames[offset + 5] = input.item ? 1 : 0;
    this._frameCount++;

    // Store position data if enabled
    if (this._recordPositions && position) {
      this._positionFrames.push({
        time: t,
        x: position.x ?? 0,
        y: position.y ?? 0,
        z: position.z ?? 0,
        speed: position.speed ?? 0
      });
      this._racingLine.push({
        x: position.x ?? 0,
        z: position.z ?? 0,
        speed: position.speed ?? 0,
        time: t
      });
    }
  }

  /**
   * Stop recording and return the recorded data
   * @returns {Object} The complete replay data
   */
  stopRecording() {
    this._recording = false;
    const data = this.getReplayData();
    
    // Auto-detect highlights after recording
    this._detectHighlights(data);
    
    EventBus.emit('replay:recordingStopped', { frameCount: this._frameCount });
    return data;
  }

  /**
   * Get the current replay data
   * @returns {Object} Replay data object
   */
  getReplayData() {
    return {
      frames: this._frames.slice(0, this._frameCount * FRAME_SIZE),
      frameCount: this._frameCount,
      duration: this._frames[(this._frameCount - 1) * FRAME_SIZE] || 0,
      timestamp: Date.now(),
      checkpoints: [...this._checkpointMarkers],
      highlights: [...this._highlights],
      racingLine: [...this._racingLine],
      positionFrames: [...this._positionFrames]
    };
  }

  // ==================== GHOST MANAGEMENT ====================

  /**
   * Save replay as personal best ghost for a specific track
   * @param {string} trackId - Track identifier
   * @param {string} vehicleId - Vehicle used
   * @param {Object} replayData - Replay data to save
   */
  saveGhost(trackId, vehicleId, replayData) {
    const save = window.__engine?.save;
    if (!save) {
      console.warn('[ReplaySystem] No save system available');
      return;
    }

    const ghostData = {
      trackId,
      vehicleId,
      replay: replayData,
      lapTime: replayData.duration,
      savedAt: Date.now()
    };

    save.set(`stats.ghosts.${trackId}`, ghostData);
    EventBus.emit('replay:ghostSaved', { trackId, vehicleId, lapTime: replayData.duration });
  }

  /**
   * Load saved ghost data for a track
   * @param {string} trackId - Track identifier
   * @returns {Object|null} Ghost data or null if not found
   */
  loadGhost(trackId) {
    return window.__engine?.save?.get(`stats.ghosts.${trackId}`) || null;
  }

  // ==================== SHARE CODES ====================

  /**
   * Generate a shareable code from replay data
   * @param {Object} replayData - The replay data to encode
   * @returns {string} Base64 encoded share code
   */
  generateShareCode(replayData) {
    const compact = {
      v: 2,  // Version 2 includes highlights
      d: Math.round((replayData.duration || 0) * 1000),
      f: Array.from(replayData.frames || []).map(v => Math.round(v * 1000) / 1000),
      h: (replayData.highlights || []).map(h => ({
        t: h.type,
        s: Math.round(h.startTime * 1000),
        e: h.endTime ? Math.round(h.endTime * 1000) : undefined
      }))
    };

    return btoa(JSON.stringify(compact)).replace(/=/g, '');
  }

  /**
   * Parse a share code back into replay data
   * @param {string} code - The share code to decode
   * @returns {Object|null} Parsed replay data or null if invalid
   */
  parseShareCode(code) {
    try {
      const data = JSON.parse(atob(code));
      
      // Support both v1 and v2 formats
      if (data.v && data.v > 2) {
        console.warn('[ReplaySystem] Unknown share code version:', data.v);
        return null;
      }

      const result = {
        frames: new Float32Array(data.f),
        frameCount: data.f.length / FRAME_SIZE,
        duration: data.d / 1000,
        timestamp: Date.now(),
        highlights: []
      };

      // Parse highlights from v2+
      if (data.h && Array.isArray(data.h)) {
        result.highlights = data.h.map((h, i) => ({
          id: `highlight_${i}`,
          type: h.type || HighlightType.ITEM_USE,
          startTime: h.s / 1000,
          endTime: h.e ? h.e / 1000 : undefined,
          description: this._getHighlightDescription(h.type)
        }));
      }

      return result;
    } catch (e) {
      console.error('[ReplaySystem] Invalid share code:', e);
      return null;
    }
  }

  // ==================== PLAYBACK CONTROL ====================

  /**
   * Set the playback speed
   * @param {number} speed - One of PlaybackSpeed values (0.25, 0.5, 1, 2, 4)
   */
  setPlaybackSpeed(speed) {
    const validSpeeds = Object.values(PlaybackSpeed);
    if (!validSpeeds.includes(speed)) {
      console.warn(`[ReplaySystem] Invalid speed: ${speed}. Use one of:`, validSpeeds);
      return;
    }

    this._playbackSpeed = speed;
    EventBus.emit('replay:speedChanged', { speed });
  }

  /**
   * Get current playback speed
   * @returns {number} Current playback speed multiplier
   */
  getPlaybackSpeed() {
    return this._playbackSpeed;
  }

  /**
   * Set the camera mode for playback
   * @param {string} mode - One of CameraMode values
   */
  setCameraMode(mode) {
    const validModes = Object.values(CameraMode);
    if (!validModes.includes(mode)) {
      console.warn(`[ReplaySystem] Invalid camera mode: ${mode}. Use one of:`, validModes);
      return;
    }

    this._cameraMode = mode;
    EventBus.emit('replay:cameraModeChanged', { mode });
  }

  /**
   * Get current camera mode
   * @returns {string} Current camera mode
   */
  getCameraMode() {
    return this._cameraMode;
  }

  /**
   * Scrub to a specific time in the replay
   * @param {number} time - Target time in seconds
   * @returns {ReplayFrame|null} Frame at the specified time
   */
  scrubToTime(time) {
    if (time < 0) time = 0;
    
    const maxTime = this.getDuration();
    if (time > maxTime) time = maxTime;

    this._playbackTime = time;
    
    const frame = this.getFrameAtTime(time);
    EventBus.emit('replay:scrubbed', { time, frame });
    
    return frame;
  }

  /**
   * Get the total duration of the recorded replay
   * @returns {number} Duration in seconds
   */
  getDuration() {
    return this._frames[(this._frameCount - 1) * FRAME_SIZE] || 0;
  }

  /**
   * Get current playback time
   * @returns {number} Current time in seconds
   */
  getCurrentTime() {
    return this._playbackTime;
  }

  /**
   * Get playback progress as 0-1 value
   * @returns {number} Progress (0 to 1)
   */
  getProgress() {
    const duration = this.getDuration();
    return duration > 0 ? this._playbackTime / duration : 0;
  }

  /**
   * Start or resume playback
   */
  play() {
    this._isPlaying = true;
    EventBus.emit('replay:play');
  }

  /**
   * Pause playback
   */
  pause() {
    this._isPlaying = false;
    EventBus.emit('replay:pause');
  }

  /**
   * Toggle play/pause state
   * @returns {boolean} New playing state
   */
  togglePlayPause() {
    if (this._isPlaying) {
      this.pause();
    } else {
      this.play();
    }
    return this._isPlaying;
  }

  /**
   * Check if currently playing
   * @returns {boolean} Playing state
   */
  isPlaying() {
    return this._isPlaying;
  }

  /**
   * Stop playback and reset to beginning
   */
  stopPlayback() {
    this._isPlaying = false;
    this._playbackTime = 0;
    EventBus.emit('replay:stopped');
  }

  /**
   * Enable or disable loop playback
   * @param {boolean} loop - Whether to loop
   */
  setLoop(loop) {
    this._loopPlayback = loop;
    EventBus.emit('replay:loopChanged', { loop });
  }

  // ==================== HIGHLIGHT DETECTION ====================

  /**
   * Get all detected highlight events
   * @returns {Array<HighlightEvent>} Array of highlights
   */
  getHighlights() {
    return [...this._highlights];
  }

  /**
   * Get highlights within a time range
   * @param {number} startTime - Range start
   * @param {number} endTime - Range end
   * @returns {Array<HighlightEvent>} Filtered highlights
   */
  getHighlightsInRange(startTime, endTime) {
    return this._highlights.filter(h => 
      h.startTime >= startTime && h.startTime <= endTime
    );
  }

  /**
   * Manually add a highlight event
   * @param {string} type - HighlightType value
   * @param {number} startTime - Event start time
   * @param {Object} [options] - Additional options
   * @param {number} [options.endTime] - Event end time
   * @param {string} [options.description] - Custom description
   * @param {Object} [options.metadata] - Additional metadata
   * @returns {string} The highlight ID
   */
  addHighlight(type, startTime, options = {}) {
    const highlight = {
      id: options.id || `hl_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      type,
      startTime,
      endTime: options.endTime,
      description: options.description || this._getHighlightDescription(type),
      metadata: options.metadata || {}
    };

    this._highlights.push(highlight);
    this._highlights.sort((a, b) => a.startTime - b.startTime);

    EventBus.emit('replay:highlightAdded', highlight);
    this._onHighlightDetected?.(highlight);

    return highlight.id;
  }

  /**
   * Remove a highlight by ID
   * @param {string} highlightId - ID to remove
   * @returns {boolean} True if found and removed
   */
  removeHighlight(highlightId) {
    const index = this._highlights.findIndex(h => h.id === highlightId);
    if (index >= 0) {
      const removed = this._highlights.splice(index, 1)[0];
      EventBus.emit('replay:highlightRemoved', { id: highlightId });
      return true;
    }
    return false;
  }

  /**
   * Clear all highlights
   */
  clearHighlights() {
    this._highlights = [];
    EventBus.emit('replay:highlightsCleared');
  }

  /**
   * Set callback for when highlights are detected
   * @param {Function} callback - Called with highlight event
   */
  onHighlightDetected(callback) {
    this._onHighlightDetected = callback;
  }

  // ==================== CLIP EXPORT ====================

  /**
   * Export a clip segment with full metadata
   * @param {number} startTime - Clip start time
   * @param {number} endTime - Clip end time
   * @param {Object} [options] - Export options
   * @returns {ClipMetadata} Complete clip metadata
   */
  exportClip(startTime, endTime, options = {}) {
    const duration = endTime - startTime;
    
    if (duration <= 0) {
      throw new Error('[ReplaySystem] End time must be greater than start time');
    }

    // Get highlights within clip range
    const clipHighlights = this.getHighlightsInRange(startTime, endTime);

    const clip = {
      id: options.id || `clip_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      startTime,
      endTime,
      duration,
      highlights: clipHighlights,
      trackId: options.trackId || 'unknown',
      lapTime: options.lapTime || null,
      created: new Date(),
      shareCode: null,
      metadata: {
        cameraMode: this._cameraMode,
        playbackSpeed: this._playbackSpeed,
        ...options.metadata
      }
    };

    // Generate share code for the clip
    const clipReplayData = {
      ...this.getReplayData(),
      duration,
      // Would slice frames to range in production
    };
    clip.shareCode = this.generateShareCode(clipReplayData);

    EventBus.emit('replay:clipExported', clip);
    
    return clip;
  }

  /**
   * Export best moments as a highlight reel
   * @param {number} [maxDuration=30] - Maximum total duration
   * @returns {ClipMetadata} Best moments clip
   */
  exportBestMoments(maxDuration = 30) {
    if (this._highlights.length === 0) {
      // If no highlights, export last 30 seconds or full replay
      const duration = Math.min(this.getDuration(), maxDuration);
      const startTime = Math.max(0, this.getDuration() - duration);
      return this.exportClip(startTime, this.getDuration());
    }

    // Sort by importance and pack into maxDuration
    const sortedHighlights = [...this._highlights]
      .sort((a, b) => this._getHighlightWeight(b.type) - this._getHighlightWeight(a.type));

    let currentTime = 0;
    const segments = [];

    for (const hl of sortedHighlights) {
      const hlDuration = (hl.endTime || hl.startTime + 3) - hl.startTime;
      if (currentTime + hlDuration <= maxDuration) {
        segments.push({ start: hl.startTime, end: hl.endTime || hl.startTime + 3 });
        currentTime += hlDuration;
      }
    }

    if (segments.length === 0) {
      return this.exportClip(0, Math.min(maxDuration, this.getDuration()));
    }

    // Merge segments that overlap or are close
    const merged = this._mergeSegments(segments, 2); // 2 second gap tolerance

    return this.exportClip(merged[0].start, merged[merged.length - 1].end, {
      id: 'best_moments'
    });
  }

  // ==================== CHECKPOINT MARKERS ====================

  /**
   * Add a checkpoint marker at the current time
   * @param {number} index - Checkpoint index
   * @param {string} [label] - Display label
   */
  addCheckpointMarker(index, label) {
    const marker = {
      time: (performance.now() - this._startTime) / 1000,
      index,
      label: label || `Checkpoint ${index + 1}`
    };

    this._checkpointMarkers.push(marker);
    this._checkpointMarkers.sort((a, b) => a.time - b.time);

    EventBus.emit('replay:checkpointMarked', marker);
  }

  /**
   * Get all checkpoint markers
   * @returns {Array<CheckpointMarker>}
   */
  getCheckpointMarkers() {
    return [...this._checkpointMarkers];
  }

  /**
   * Get timeline data for UI rendering
   * @returns {Object} Timeline interface data
   */
  getTimelineData() {
    return {
      duration: this.getDuration(),
      currentTime: this._playbackTime,
      progress: this.getProgress(),
      isPlaying: this._isPlaying,
      speed: this._playbackSpeed,
      cameraMode: this._cameraMode,
      checkpoints: this._checkpointMarkers.map(m => ({
        time: m.time,
        position: this.getDuration() > 0 ? m.time / this.getDuration() : 0,
        label: m.label
      })),
      highlights: this._highlights.map(h => ({
        id: h.id,
        type: h.type,
        time: h.startTime,
        position: this.getDuration() > 0 ? h.startTime / this.getDuration() : 0,
        description: h.description
      }))
    };
  }

  // ==================== GHOST COMPARISON ====================

  /**
   * Set up ghost comparison mode
   * @param {Object} ghostData - Ghost replay data to compare against
   */
  setComparisonGhost(ghostData) {
    this._comparisonGhost = ghostData;
    this._showComparison = true;
    EventBus.emit('replay:comparisonEnabled', { ghostData });
  }

  /**
   * Clear ghost comparison
   */
  clearComparisonGhost() {
    this._comparisonGhost = null;
    this._showComparison = false;
    EventBus.emit('replay:comparisonDisabled');
  }

  /**
   * Toggle ghost comparison visibility
   * @param {boolean} show - Show comparison
   */
  showComparison(show) {
    this._showComparison = show;
    EventBus.emit('replay:comparisonToggled', { show });
  }

  /**
   * Get comparison state
   * @returns {{ active: boolean, ghost: Object|null }}
   */
  getComparisonState() {
    return {
      active: this._showComparison,
      ghost: this._comparisonGhost
    };
  }

  // ==================== RACING LINE ANALYSIS ====================

  /**
   * Get racing line data for visualization overlay
   * @returns {Array<RacingLinePoint>}
   */
  getRacingLine() {
    return [...this._racingLine];
  }

  /**
   * Get racing line analysis statistics
   * @returns {Object} Analysis data
   */
  getRacingLineAnalysis() {
    if (this._racingLine.length < 2) {
      return { avgSpeed: 0, maxSpeed: 0, minSpeed: 0, totalDistance: 0 };
    }

    let totalSpeed = 0;
    let maxSpeed = 0;
    let minSpeed = Infinity;
    let totalDistance = 0;

    for (let i = 0; i < this._racingLine.length; i++) {
      const point = this._racingLine[i];
      const speed = point.speed || 0;
      
      totalSpeed += speed;
      maxSpeed = Math.max(maxSpeed, speed);
      minSpeed = Math.min(minSpeed, speed);

      // Calculate distance to next point
      if (i < this._racingLine.length - 1) {
        const next = this._racingLine[i + 1];
        const dx = next.x - point.x;
        const dz = next.z - point.z;
        totalDistance += Math.sqrt(dx * dx + dz * dz);
      }
    }

    const count = this._racingLine.length;
    return {
      avgSpeed: totalSpeed / count,
      maxSpeed,
      minSpeed: minSpeed === Infinity ? 0 : minSpeed,
      totalDistance,
      pointCount: count
    };
  }

  // ==================== LEGACY COMPATIBILITY ====================

  /**
   * Get frame at specific time (legacy method)
   * @param {number} t - Time in seconds
   * @returns {ReplayFrame|null} Frame data
   */
  getFrameAtTime(t) {
    if (this._frameCount === 0) return null;

    // Binary search for frame at time t
    let lo = 0, hi = this._frameCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this._frames[mid * FRAME_SIZE] < t) lo = mid + 1;
      else hi = mid;
    }

    const offset = lo * FRAME_SIZE;
    return {
      time: this._frames[offset],
      throttle: this._frames[offset + 1],
      brake: this._frames[offset + 2],
      steer: this._frames[offset + 3],
      drift: this._frames[offset + 4] > 0.5,
      item: this._frames[offset + 5] > 0.5
    };
  }

  /**
   * Check if currently recording (legacy method)
   * @returns {boolean}
   */
  isRecording() {
    return this._recording;
  }

  /**
   * Get total frame count (legacy method)
   * @returns {number}
   */
  getFrameCount() {
    return this._frameCount;
  }

  /**
   * Set callback for playback completion
   * @param {Function} callback
   */
  onPlaybackComplete(callback) {
    this._onPlaybackComplete = callback;
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Auto-detect highlights from replay data
   * @private
   * @param {Object} replayData - The replay data to analyze
   */
  _detectHighlights(replayData) {
    if (!replayData.frames || replayData.frameCount < 10) return;

    const frames = replayData.frames;
    const frameCount = replayData.frameCount;

    // Detect potential crash (sudden speed drop while braking hard)
    for (let i = 5; i < frameCount; i++) {
      const currBrake = frames[i * FRAME_SIZE + 2];
      const prevSpeed = this._estimateSpeed(frames, i - 5);
      const currSpeed = this._estimateSpeed(frames, i);

      // Sudden stop with heavy braking might be a crash
      if (currBrake > 0.8 && prevSpeed > 0.5 && currSpeed < 0.1) {
        this.addHighlight(HighlightType.CRASH, frames[i * FRAME_SIZE], {
          description: 'Potential collision'
        });
      }
    }

    // Mark finish line crossing (last 5% of replay)
    if (replayData.duration > 5) {
      const finishTime = replayData.duration * 0.95;
      this.addHighlight(HighlightType.FINISH, finishTime, {
        endTime: replayData.duration,
        description: 'Finish line approach'
      });
    }

    // Detect item usage events
    for (let i = 0; i < frameCount; i++) {
      if (frames[i * FRAME_SIZE + 5] > 0.5) { // Item used
        const time = frames[i * FRAME_SIZE];
        // Avoid duplicates
        if (!this._highlights.some(h => 
          h.type === HighlightType.ITEM_USE && 
          Math.abs(h.startTime - time) < 0.3
        )) {
          this.addHighlight(HighlightType.ITEM_USE, time);
        }
      }
    }
  }

  /**
   * Estimate speed from frame data (simplified)
   * @private
   * @param {Float32Array} frames - Frame array
   * @param {number} index - Frame index
   * @returns {number} Estimated speed (0-1)
   */
  _estimateSpeed(frames, index) {
    if (index < 0 || index * FRAME_SIZE + 1 >= frames.length) return 0;
    const throttle = frames[index * FRAME_SIZE + 1];
    const brake = frames[index * FRAME_SIZE + 2];
    return Math.max(0, throttle - brake * 0.8);
  }

  /**
   * Get human-readable description for highlight type
   * @private
   * @param {string} type - Highlight type
   * @returns {string} Description
   */
  _getHighlightDescription(type) {
    const descriptions = {
      [HighlightType.OVERTAKE]: 'Overtake maneuver',
      [HighlightType.CRASH]: 'Collision detected',
      [HighlightType.FINISH]: 'Finishing the race',
      [HighlightType.BEST_SPLIT]: 'Best sector time',
      [HighlightType.ITEM_USE]: 'Item used',
      [HighlightType.NEAR_MISS]: 'Near miss!'
    };
    return descriptions[type] || 'Event';
  }

  /**
   * Get importance weight for highlight type (for sorting)
   * @private
   * @param {string} type - Highlight type
   * @returns {number} Weight value
   */
  _getHighlightWeight(type) {
    const weights = {
      [HighlightType.OVERTAKE]: 5,
      [HighlightType.CRASH]: 4,
      [HighlightType.FINISH]: 5,
      [HighlightType.BEST_SPLIT]: 3,
      [HighlightType.ITEM_USE]: 2,
      [HighlightType.NEAR_MISS]: 4
    };
    return weights[type] || 1;
  }

  /**
   * Merge overlapping or close segments
   * @private
   * @param {Array} segments - Array of {start, end}
   * @param {number} gapTolerance - Max gap to merge
   * @returns {Array} Merged segments
   */
  _mergeSegments(segments, gapTolerance) {
    if (segments.length === 0) return [];

    const sorted = [...segments].sort((a, b) => a.start - b.start);
    const merged = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const last = merged[merged.length - 1];
      const curr = sorted[i];

      if (curr.start - last.end <= gapTolerance) {
        last.end = Math.max(last.end, curr.end);
      } else {
        merged.push(curr);
      }
    }

    return merged;
  }
}

// Create singleton instance
export const replay = new ReplaySystem();

// Export convenience functions for functional usage
export function setPlaybackSpeed(speed) {
  return replay.setPlaybackSpeed(speed);
}

export function setCameraMode(mode) {
  return replay.setCameraMode(mode);
}

export function scrubToTime(time) {
  return replay.scrubToTime(time);
}

export function getHighlights() {
  return replay.getHighlights();
}

export function exportClip(startTime, endTime, options) {
  return replay.exportClip(startTime, endTime, options);
}

export default replay;
