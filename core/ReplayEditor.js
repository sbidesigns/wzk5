// core/ReplayEditor.js
// Advanced replay viewing and editing interface.
// Features timeline scrubbing, camera controls, annotation tools,
// export options, and analysis overlays.

import { EventBus } from './EventBus.js';
import * as THREE from 'three';

/**
 * Camera mode for replay playback
 * @enum {string}
 */
const ReplayCameraMode = {
  FREE: 'free',           // User-controlled orbit
  FOLLOW: 'follow',       // Follow specific player
  CINEMATIC: 'cinematic', // Pre-defined cinematic shots
  CUSTOM_PATH: 'custom'   // User-defined keyframe path
};

/**
 * Playback speed presets
 */
const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 2, 4];

/**
 * @typedef {Object} Annotation
 * @property {string} id - Unique identifier
 * @property {string} type - 'arrow', 'circle', 'text'
 * @property {Object} data - Annotation-specific data
 * @property {number} timestamp - When annotation appears
 * @property {number} duration - How long annotation shows (0 = permanent)
 */

/**
 * @typedef {Object} TimelineMarker
 * @property {string} id - Marker ID
 * @property {number} time - Timestamp in replay
 * @property {string} label - Display label
 * @property {string} color - Marker color
 * @property {string} type - 'highlight', 'incident', 'user'
 */

/**
 * @typedef {Object} CameraKeyframe
 * @property {number} time - Keyframe timestamp
 * @property {THREE.Vector3} position - Camera position
 * @property {THREE.Vector3} lookAt - Look-at target
 * @property {number} fov - Field of view
 * @property {string} easing - Interpolation easing function
 */

class ReplayEditor {
  constructor() {
    /** @type {Object|null} Current replay data */
    this._replayData = null;
    
    // Playback state
    this._playing = false;
    this._currentTime = 0;
    this._playbackSpeed = 1;
    this._loopStart = null; // A point for loop
    this._loopEnd = null;   // B point for loop
    this._looping = false;

    // Camera state
    this._cameraMode = ReplayCameraMode.FOLLOW;
    this._camera = null;
    this._followTarget = null;
    this._cameraKeyframes = [];
    this._fov = 75;
    
    // Free camera controls
    this._orbitAngles = { theta: 0, phi: Math.PI / 4 };
    this._orbitDistance = 20;

    // Cinematic shot definitions
    this._cinematicShots = [];
    this._currentCinematicShot = 0;

    // Annotations and markers
    this._annotations = [];
    this._timelineMarkers = [];

    // Analysis overlays
    this._showSpeedGraph = false;
    this._showPositionChart = false;
    this._showInputDisplay = false;
    this._showRacingLine = false;
    this._showTelemetry = false;

    // Analysis data cache
    this._speedData = [];
    this._positionData = [];
    this._inputData = [];

    // Export state
    this._exporting = false;
    this._mediaRecorder = null;
    this._recordedChunks = [];

    // Active state
    this._active = false;
    this._initialized = false;
  }

  /**
   * Initialize the replay editor
   * @param {THREE.Camera} camera - Camera to control during replay
   */
  init(camera) {
    if (!camera) {
      console.error('[ReplayEditor] Cannot initialize without camera');
      return false;
    }

    this._camera = camera;
    this._initialized = true;
    this._generateCinematicShots();
    console.log('[ReplayEditor] Initialized');
    EventBus.emit('replayEditor:initialized');
    return true;
  }

  /**
   * Load a replay for editing/viewing
   * @param {Object} replayData - Replay data from ReplaySystem
   */
  loadReplay(replayData) {
    if (!this._initialized) {
      console.error('[ReplayEditor] Not initialized');
      return false;
    }

    this._replayData = replayData;
    this._currentTime = 0;
    this._playing = false;
    this._annotations = [];
    this._timelineMarkers = [];
    this._cameraKeyframes = [];
    
    // Pre-process analysis data
    this._preprocessAnalysisData();

    // Auto-detect highlights as markers
    this._autoDetectHighlights();

    console.log(`[ReplayEditor] Loaded replay: ${replayData.duration?.toFixed(2)}s`);
    EventBus.emit('replayEditor:loaded', { duration: replayData.duration });
    return true;
  }

  /**
   * Pre-calculate analysis data from replay frames
   * @private
   */
  _preprocessAnalysisData() {
    if (!this._replayData?.frames) return;

    const frameSize = 6; // time, throttle, brake, steer, drift, item
    const frameCount = Math.floor(this._replayData.frames.length / frameSize);
    
    this._speedData = [];
    this._positionData = []; // Would need position data in full implementation
    this._inputData = [];

    // Estimate speed from inputs (simplified)
    let estimatedSpeed = 0;
    let estimatedPosition = 0;

    for (let i = 0; i < frameCount; i++) {
      const offset = i * frameSize;
      const t = this._replayData.frames[offset];
      const throttle = this._replayData.frames[offset + 1];
      const brake = this._replayData.frames[offset + 2];
      const steer = this._replayData.frames[offset + 3];

      // Simple speed estimation
      const acceleration = throttle * 50 - brake * 80;
      estimatedSpeed = Math.max(0, Math.min(200, estimatedSpeed + acceleration * 0.016));
      
      // Position estimation (very simplified)
      estimatedPosition += estimatedSpeed * 0.016 * 0.27778; // Convert to meters

      this._speedData.push({ time: t, speed: estimatedSpeed });
      this._inputData.push({
        time: t,
        throttle,
        brake,
        steer,
        drift: this._replayData.frames[offset + 4],
        item: this._replayData.frames[offset + 5]
      });
    }
  }

  /**
   * Auto-detect highlight moments for timeline markers
   * @private
   */
  _autoDetectHighlights() {
    if (!this._speedData.length) return;

    // Detect significant speed changes (braking zones, accelerations)
    for (let i = 1; i < this._speedData.length; i++) {
      const speedDelta = Math.abs(this._speedData[i].speed - this._speedData[i-1].speed);
      
      if (speedDelta > 30) {
        this.addTimelineMarker({
          time: this._speedData[i].time,
          label: speedDelta > 0 ? 'Acceleration' : 'Braking',
          color: speedDelta > 0 ? '#00ff00' : '#ff6600',
          type: 'highlight'
        });
      }
    }

    // Mark start and end
    if (this._speedData.length > 0) {
      this.addTimelineMarker({
        time: 0,
        label: 'Start',
        color: '#00ff00',
        type: 'user'
      });
      
      const endTime = this._speedData[this._speedData.length - 1]?.time || 0;
      this.addTimelineMarker({
        time: endTime,
        label: 'Finish',
        color: '#ff0000',
        type: 'user'
      });
    }
  }

  /**
   * Start or pause playback
   */
  togglePlayback() {
    this._playing = !this._playing;
    EventBus.emit('replayEditor:playbackChanged', { playing: this._playing });
  }

  /**
   * Stop playback and reset to beginning
   */
  stopPlayback() {
    this._playing = false;
    this._currentTime = 0;
    EventBus.emit('replayEditor:playbackChanged', { playing: false, time: 0 });
  }

  /**
   * Set current playback time (scrub)
   * @param {number} time - Time in seconds
   */
  scrubTo(time) {
    if (!this._replayData) return;
    
    this._currentTime = Math.max(0, Math.min(time, this._replayData.duration || 0));
    this._updateCameraForTime(this._currentTime);
    EventBus.emit('replayEditor:scrubbed', { time: this._currentTime });
  }

  /**
   * Advance frame by frame
   * @param {number} direction - 1 forward, -1 backward
   */
  advanceFrame(direction = 1) {
    if (!this._replayData?.frames) return;
    
    const frameDuration = 1 / 60; // Assuming 60fps recording
    this.scrubTo(this._currentTime + (frameDuration * direction));
  }

  /**
   * Update editor state (call each frame when playing)
   * @param {number} deltaTime - Time since last update
   */
  update(deltaTime) {
    if (!this._active || !this._playing || !this._replayData) return;

    // Advance time based on playback speed
    const timeStep = deltaTime * this._playbackSpeed;
    this._currentTime += timeStep;

    // Handle looping
    if (this._looping && this._loopEnd !== null && this._currentTime >= this._loopEnd) {
      this._currentTime = this._loopStart || 0;
    } else if (this._currentTime >= (this._replayData.duration || 0)) {
      // End of replay
      if (this._looping && this._loopStart !== null) {
        this._currentTime = this._loopStart || 0;
      } else {
        this._playing = false;
        EventBus.emit('replayEditor:complete');
        return;
      }
    }

    // Update camera
    this._updateCameraForTime(this._currentTime);

    // Emit time update for UI
    EventBus.emit('replayEditor:timeUpdate', { 
      time: this._currentTime, 
      duration: this._replayData.duration 
    });
  }

  /**
   * Update camera position for current time
   * @private
   * @param {number} time - Current replay time
   */
  _updateCameraForTime(time) {
    if (!this._camera) return;

    switch (this._cameraMode) {
      case ReplayCameraMode.FREE:
        this._updateFreeCamera();
        break;
        
      case ReplayCameraMode.FOLLOW:
        // Would follow the ghost vehicle at this time
        break;
        
      case ReplayCameraMode.CINEMATIC:
        this._updateCinematicCamera(time);
        break;
        
      case ReplayCameraMode.CUSTOM_PATH:
        this._updateCustomPathCamera(time);
        break;
    }

    // Update FOV
    if (this._camera.fov !== this._fov) {
      this._camera.fov = this._fov;
      this._camera.updateProjectionMatrix();
    }
  }

  /**
   * Update free orbit camera
   * @private
   */
  _updateFreeCamera() {
    const x = this._orbitDistance * Math.sin(this._orbitAngles.theta) * Math.cos(this._orbitAngles.phi);
    const y = this._orbitDistance * Math.sin(this._orbitAngles.phi);
    const z = this._orbitDistance * Math.cos(this._orbitAngles.theta) * Math.cos(this._orbitAngles.phi);

    this._camera.position.set(x, Math.max(y, 2), z);
    this._camera.lookAt(0, 0, 0);
  }

  /**
   * Update cinematic camera based on pre-defined shots
   * @private
   * @param {number} time - Current time
   */
  _updateCinematicCamera(time) {
    if (this._cinematicShots.length === 0) return;

    // Find current and next shot
    let currentShot = this._cinematicShots[this._currentCinematicShot];
    
    // Check if we should transition to next shot
    while (currentShot && time >= currentShot.endTime) {
      this._currentCinematicShot = (this._currentCinematicShot + 1) % this._cinematicShots.length;
      currentShot = this._cinematicShots[this._currentCinematicShot];
    }

    if (!currentShot) return;

    // Calculate interpolation within shot
    const shotProgress = (time - currentShot.startTime) / (currentShot.endTime - currentShot.startTime);
    const easedProgress = this._easeInOutQuad(Math.min(1, Math.max(0, shotProgress)));

    // Interpolate position
    if (currentShot.startPos && currentShot.endPos) {
      this._camera.position.lerpVectors(currentShot.startPos, currentShot.endPos, easedProgress);
    }

    // Interpolate look-at
    if (currentShot.lookAtStart && currentShot.lookAtEnd) {
      const lookAt = new THREE.Vector3().lerpVectors(currentShot.lookAtStart, currentShot.lookAtEnd, easedProgress);
      this._camera.lookAt(lookAt);
    }

    // Interpolate FOV
    if (currentShot.startFov !== undefined && currentShot.endFov !== undefined) {
      this._fov = currentShot.startFov + (currentShot.endFov - currentShot.startFov) * easedProgress;
    }
  }

  /**
   * Update custom keyframe path camera
   * @private
   * @param {number} time - Current time
   */
  _updateCustomPathCamera(time) {
    if (this._cameraKeyframes.length < 2) return;

    // Find surrounding keyframes
    let prevKf = this._cameraKeyframes[0];
    let nextKf = this._cameraKeyframes[this._cameraKeyframes.length - 1];

    for (let i = 0; i < this._cameraKeyframes.length - 1; i++) {
      if (time >= this._cameraKeyframes[i].time && time <= this._cameraKeyframes[i + 1].time) {
        prevKf = this._cameraKeyframes[i];
        nextKf = this._cameraKeyframes[i + 1];
        break;
      }
    }

    // Interpolate
    const duration = nextKf.time - prevKf.time;
    const progress = duration > 0 ? (time - prevKf.time) / duration : 0;
    const easedProgress = this._applyEasing(progress, nextKf.easing || 'linear');

    this._camera.position.lerpVectors(prevKf.position, nextKf.position, easedProgress);
    
    const lookAt = new THREE.Vector3().lerpVectors(prevKf.lookAt, nextKf.lookAt, easedProgress);
    this._camera.lookAt(lookAt);

    this._fov = prevKf.fov + (nextKf.fov - prevKf.fov) * easedProgress;
  }

  /**
   * Generate default cinematic shots
   * @private
   */
  _generateCinematicShots() {
    // These would be customized per track in a real implementation
    this._cinematicShots = [
      {
        name: 'Wide Start',
        startTime: 0,
        endTime: 3,
        startPos: new THREE.Vector3(0, 15, -30),
        endPos: new THREE.Vector3(5, 12, -25),
        lookAtStart: new THREE.Vector3(0, 0, 10),
        lookAtEnd: new THREE.Vector3(0, 0, 20),
        startFov: 90,
        endFov: 75
      },
      {
        name: 'Follow Cam',
        startTime: 3,
        endTime: 8,
        startPos: new THREE.Vector3(0, 5, -12),
        endPos: new THREE.Vector3(0, 4, -10),
        lookAtStart: new THREE.Vector3(0, 0, 5),
        lookAtEnd: new THREE.Vector3(0, 0, 15),
        startFov: 70,
        endFov: 70
      },
      {
        name: 'Overhead Pan',
        startTime: 8,
        endTime: 13,
        startPos: new THREE.Vector3(-20, 25, 0),
        endPos: new THREE.Vector3(20, 25, 0),
        lookAtStart: new THREE.Vector3(0, 0, 0),
        lookAtEnd: new THREE.Vector3(0, 0, 0),
        startFov: 60,
        endFov: 60
      }
    ];
  }

  // ==================== CAMERA CONTROLS ====================

  /**
   * Set camera mode
   * @param {ReplayCameraMode} mode - Desired camera mode
   */
  setCameraMode(mode) {
    if (!Object.values(ReplayCameraMode).includes(mode)) {
      console.warn(`[ReplayEditor] Invalid camera mode: ${mode}`);
      return;
    }
    this._cameraMode = mode;
    EventBus.emit('replayEditor:cameraModeChanged', { mode });
  }

  /**
   * Set follow target player index
   * @param {number|string} targetId - Player or vehicle to follow
   */
  setFollowTarget(targetId) {
    this._followTarget = targetId;
    EventBus.emit('replayEditor:followTargetChanged', { target: targetId });
  }

  /**
   * Control free camera orbit
   * @param {number} deltaTheta - Horizontal rotation
   * @param {number} deltaPhi - Vertical rotation
   */
  orbitCamera(deltaTheta, deltaPhi) {
    this._orbitAngles.theta += deltaTheta;
    this._orbitAngles.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, this._orbitAngles.phi + deltaPhi));
  }

  /**
   * Zoom camera (adjust FOV or orbit distance)
   * @param {number} delta - Zoom amount
   */
  zoom(delta) {
    if (this._cameraMode === ReplayCameraMode.FREE) {
      this._orbitDistance = Math.max(5, Math.min(100, this._orbitDistance - delta));
    } else {
      this._fov = Math.max(30, Math.min(120, this._fov + delta));
    }
  }

  /**
   * Add camera keyframe at current time
   */
  addCameraKeyframe() {
    if (!this._camera) return;

    const keyframe = {
      time: this._currentTime,
      position: this._camera.position.clone(),
      lookAt: new THREE.Vector3(0, 0, 0), // Would get actual look-at target
      fov: this._fov,
      easing: 'smooth'
    };

    // Get camera's actual look-at direction
    const direction = new THREE.Vector3();
    this._camera.getWorldDirection(direction);
    keyframe.lookAt.copy(this._camera.position).add(direction.multiplyScalar(10));

    this._cameraKeyframes.push(keyframe);
    this._cameraKeyframes.sort((a, b) => a.time - b.time);

    console.log(`[ReplayEditor] Added camera keyframe at ${this._currentTime.toFixed(2)}s`);
    EventBus.emit('replayEditor:keyframeAdded', keyframe);
    return keyframe;
  }

  /**
   * Clear all camera keyframes
   */
  clearCameraKeyframes() {
    this._cameraKeyframes = [];
    console.log('[ReplayEditor] Cleared camera keyframes');
  }

  // ==================== PLAYBACK CONTROLS ====================

  /**
   * Set playback speed
   * @param {number} speed - Speed multiplier (from PLAYBACK_SPEEDS or custom)
   */
  setPlaybackSpeed(speed) {
    this._playbackSpeed = speed;
    EventBus.emit('replayEditor:speedChanged', { speed });
  }

  /**
   * Cycle through available speeds
   */
  cyclePlaybackSpeed() {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(this._playbackSpeed);
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    this.setPlaybackSpeed(PLAYBACK_SPEEDS[nextIndex]);
  }

  /**
   * Set loop A point (start of loop)
   */
  setLoopStart() {
    this._loopStart = this._currentTime;
    if (this._loopEnd === null || this._loopEnd < this._loopStart) {
      this._loopEnd = this._replayData?.duration || 0;
    }
    console.log(`[ReplayEditor] Loop start set at ${this._loopStart.toFixed(2)}s`);
    EventBus.emit('replayEditor:loopPointSet', { point: 'A', time: this._loopStart });
  }

  /**
   * Set loop B point (end of loop)
   */
  setLoopEnd() {
    this._loopEnd = this._currentTime;
    if (this._loopStart === null || this._loopStart > this._loopEnd) {
      this._loopStart = 0;
    }
    console.log(`[ReplayEditor] Loop end set at ${this._loopEnd.toFixed(2)}s`);
    EventBus.emit('replayEditor:loopPointSet', { point: 'B', time: this._loopEnd });
  }

  /**
   * Toggle loop mode
   * @param {boolean} [force] - Force state
   */
  toggleLoop(force) {
    this._looping = force !== undefined ? force : !this._looping;
    EventBus.emit('replayEditor:loopToggled', { enabled: this._looping });
  }

  // ==================== ANNOTATION TOOLS ====================

  /**
   * Add annotation to replay
   * @param {Object} options - Annotation options
   * @returns {Annotation} Created annotation
   */
  addAnnotation(options) {
    const annotation = {
      id: `annotation-${Date.now()}`,
      type: options.type || 'text',
      data: options.data || {},
      timestamp: options.timestamp ?? this._currentTime,
      duration: options.duration ?? 0
    };

    this._annotations.push(annotation);
    console.log(`[ReplayEditor] Added ${annotation.type} annotation at ${annotation.timestamp.toFixed(2)}s`);
    EventBus.emit('replayEditor:annotationAdded', annotation);
    return annotation;
  }

  /**
   * Remove annotation by ID
   * @param {string} id - Annotation ID
   */
  removeAnnotation(id) {
    this._annotations = this._annotations.filter(a => a.id !== id);
    EventBus.emit('replayEditor:annotationRemoved', { id });
  }

  /**
   * Get annotations visible at current time
   * @returns {Annotation[]}
   */
  getVisibleAnnotations() {
    return this._annotations.filter(a => {
      if (a.duration === 0) return true; // Permanent
      return this._currentTime >= a.timestamp && this._currentTime <= a.timestamp + a.duration;
    });
  }

  /**
   * Add timeline marker
   * @param {Object} options - Marker options
   * @returns {TimelineMarker}
   */
  addTimelineMarker(options) {
    const marker = {
      id: `marker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      time: options.time || this._currentTime,
      label: options.label || 'Marker',
      color: options.color || '#ffffff',
      type: options.type || 'user'
    };

    this._timelineMarkers.push(marker);
    this._timelineMarkers.sort((a, b) => a.time - b.time);
    
    EventBus.emit('replayEditor:markerAdded', marker);
    return marker;
  }

  /**
   * Remove timeline marker
   * @param {string} id - Marker ID
   */
  removeTimelineMarker(id) {
    this._timelineMarkers = this._timelineMarkers.filter(m => m.id !== id);
    EventBus.emit('replayEditor:markerRemoved', { id });
  }

  /**
   * Get all timeline markers
   * @returns {TimelineMarker[]}
   */
  getTimelineMarkers() {
    return this._timelineMarkers;
  }

  // ==================== ANALYSIS OVERLAYS ====================

  /**
   * Toggle speed graph overlay
   * @param {boolean} [force] - Force state
   */
  toggleSpeedGraph(force) {
    this._showSpeedGraph = force !== undefined ? force : !this._showSpeedGraph;
    EventBus.emit('replayEditor:overlayToggled', { overlay: 'speedGraph', visible: this._showSpeedGraph });
  }

  /**
   * Toggle position chart overlay
   * @param {boolean} [force] - Force state
   */
  togglePositionChart(force) {
    this._showPositionChart = force !== undefined ? force : !this._showPositionChart;
    EventBus.emit('replayEditor:overlayToggled', { overlay: 'positionChart', visible: this._showPositionChart });
  }

  /**
   * Toggle input display overlay
   * @param {boolean} [force] - Force state
   */
  toggleInputDisplay(force) {
    this._showInputDisplay = force !== undefined ? force : !this._showInputDisplay;
    EventBus.emit('replayEditor:overlayToggled', { overlay: 'inputDisplay', visible: this._showInputDisplay });
  }

  /**
   * Toggle racing line visualization
   * @param {boolean} [force] - Force state
   */
  toggleRacingLine(force) {
    this._showRacingLine = force !== undefined ? force : !this._showRacingLine;
    EventBus.emit('replayEditor:overlayToggled', { overlay: 'racingLine', visible: this._showRacingLine });
  }

  /**
   * Toggle telemetry overlay
   * @param {boolean} [force] - Force state
   */
  toggleTelemetry(force) {
    this._showTelemetry = force !== undefined ? force : !this._showTelemetry;
    EventBus.emit('replayEditor:overlayToggled', { overlay: 'telemetry', visible: this._showTelemetry });
  }

  /**
   * Get speed data for graph rendering
   * @returns {Array<{time: number, speed: number}>}
   */
  getSpeedData() {
    return this._speedData;
  }

  /**
   * Get input data for display
   * @returns {Array}
   */
  getInputData() {
    return this._inputData;
  }

  /**
   * Get input state at specific time
   * @param {number} time - Time to query
   * @returns {Object|null} Input state
   */
  getInputAtTime(time) {
    if (!this._inputData.length) return null;
    
    // Binary search for closest frame
    let lo = 0, hi = this._inputData.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this._inputData[mid].time < time) lo = mid + 1;
      else hi = mid;
    }
    
    return this._inputData[Math.max(0, lo - 1)];
  }

  // ==================== EXPORT FUNCTIONS ====================

  /**
   * Start video capture
   * @param {HTMLCanvasElement} canvas - Canvas to capture
   * @param {number} [fps=60] - Capture framerate
   */
  startVideoCapture(canvas, fps = 60) {
    if (!canvas) {
      console.error('[ReplayEditor] Cannot capture without canvas');
      return false;
    }

    try {
      const stream = canvas.captureStream(fps);
      this._mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 8000000
      });

      this._recordedChunks = [];
      
      this._mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this._recordedChunks.push(e.data);
        }
      };

      this._mediaRecorder.onstop = () => {
        this._exportVideoBlob();
      };

      this._mediaRecorder.start(100); // Collect data every 100ms
      this._exporting = true;
      
      console.log('[ReplayEditor] Video capture started');
      EventBus.emit('replayEditor:captureStarted');
      return true;
    } catch (e) {
      console.error('[ReplayEditor] Failed to start capture:', e);
      return false;
    }
  }

  /**
   * Stop video capture and trigger download
   */
  stopVideoCapture() {
    if (this._mediaRecorder && this._mediaRecorder.state !== 'inactive') {
      this._mediaRecorder.stop();
      this._exporting = false;
      console.log('[ReplayEditor] Video capture stopped');
    }
  }

  /**
   * Export captured video as blob/download
   * @private
   */
  _exportVideoBlob() {
    if (this._recordedChunks.length === 0) return;

    const blob = new Blob(this._recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    
    // Trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = `wzk5-replay-${Date.now()}.webm`;
    a.click();
    
    URL.revokeObjectURL(url);
    EventBus.emit('replayEditor:videoExported', { url });
  }

  /**
   * Generate share code for current replay section
   * @returns {string|null} Share code string
   */
  generateShareCode() {
    if (!this._replayData) return null;

    try {
      const shareData = {
        v: 2,
        t: this._replayData.trackId || 'unknown',
        d: Math.round((this._replayData.duration || 0) * 1000),
        s: Math.round(this._currentTime * 1000), // Start time for clip
        e: Math.round((this._replayData.duration || 0) * 1000), // End time
        m: this._timelineMarkers.map(m => ({ t: Math.round(m.time * 1000), l: m.label })),
        a: this._annotations.map(a => ({ t: Math.round(a.timestamp * 1000), d: a.data }))
      };

      const code = btoa(JSON.stringify(shareData)).replace(/=/g, '');
      console.log(`[ReplayEditor] Generated share code (${code.length} chars)`);
      return code;
    } catch (e) {
      console.error('[ReplayEditor] Failed to generate share code:', e);
      return null;
    }
  }

  /**
   * Extract highlight clip (auto-detect exciting moments)
   * @returns {{startTime: number, endTime: number, reason: string}|null}
   */
  extractHighlightClip() {
    if (!this._timelineMarkers.length) return null;

    // Find most eventful segment
    let bestStart = 0;
    let bestEnd = this._replayData?.duration || 0;
    let maxEventDensity = 0;

    // Sliding window approach (10 second windows)
    const windowSize = 10;
    const step = 1;
    
    for (let t = 0; t < (this._replayData?.duration || 0) - windowSize; t += step) {
      const eventsInWindow = this._timelineMarkers.filter(
        m => m.time >= t && m.time < t + windowSize
      ).length;
      
      // Weight highlights more than user markers
      const weightedScore = this._timelineMarkers
        .filter(m => m.time >= t && m.time < t + windowSize)
        .reduce((sum, m) => sum + (m.type === 'highlight' ? 2 : 1), 0);

      if (weightedScore > maxEventDensity) {
        maxEventDensity = weightedScore;
        bestStart = t;
        bestEnd = t + windowSize;
      }
    }

    if (maxEventDensity === 0) {
      // No highlights found, return middle third
      const dur = this._replayData?.duration || 0;
      bestStart = dur / 3;
      bestEnd = (dur * 2) / 3;
    }

    console.log(`[ReplayEditor] Extracted highlight: ${bestStart.toFixed(1)}s - ${bestEnd.toFixed(1)}s`);
    
    return {
      startTime: bestStart,
      endTime: bestEnd,
      reason: `Found ${maxEventDensity} events in window`
    };
  }

  // ==================== UTILITY ====================

  /**
   * Activate/deactivate editor
   * @param {boolean} active - Active state
   */
  setActive(active) {
    this._active = active;
    if (!active) {
      this._playing = false;
    }
    EventBus.emit('replayEditor:activeChanged', { active });
  }

  /**
   * Check if editor is active
   * @returns {boolean}
   */
  isActive() {
    return this._active;
  }

  /**
   * Check if currently playing
   * @returns {boolean}
   */
  isPlaying() {
    return this._playing;
  }

  /**
   * Get current playback time
   * @returns {number}
   */
  getCurrentTime() {
    return this._currentTime;
  }

  /**
   * Get replay duration
   * @returns {number}
   */
  getDuration() {
    return this._replayData?.duration || 0;
  }

  /**
   * Get current playback speed
   * @returns {number}
   */
  getPlaybackSpeed() {
    return this._playbackSpeed;
  }

  /**
   * Easing function for smooth interpolation
   * @private
   */
  _easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  /**
   * Apply named easing function
   * @private
   */
  _applyEasing(t, easing) {
    switch (easing) {
      case 'linear': return t;
      case 'easeIn': return t * t;
      case 'easeOut': return 1 - (1 - t) * (1 - t);
      case 'smooth': return this._easeInOutQuad(t);
      default: return this._easeInOutQuad(t);
    }
  }

  /**
   * Get available playback speeds
   * @returns {number[]}
   */
  static getPlaybackSpeeds() {
    return [...PLAYBACK_SPEEDS];
  }

  /**
   * Get available camera modes
   * @returns {string[]}
   */
  static getCameraModes() {
    return Object.values(ReplayCameraMode);
  }
}

export const replayEditor = new ReplayEditor();
export { ReplayCameraMode };
export default replayEditor;
