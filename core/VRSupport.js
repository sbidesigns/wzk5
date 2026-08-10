// core/VRSupport.js
// Virtual Reality / Augmented Reality integration via WebXR.
// Features VR cockpit mode, AR tabletop, motion controller support,
// performance optimizations, and graceful fallbacks.

import { EventBus } from './EventBus.js';
import * as THREE from 'three';

/**
 * XR Mode enumeration
 * @enum {string}
 */
const XRMode = {
  NONE: 'none',
  VR: 'vr',           // Full immersive VR
  AR: 'ar',           // Augmented Reality (tabletop)
  STEREO: 'stereo'    // Stereo without VR (Cardboard-style)
};

/**
 * VR UI interaction method
 * @enum {string}
 */
const VRInteractionMethod = {
  GAZE: 'gaze',           // Look to select (timer-based)
  RAYCAST: 'raycast',     // Controller pointer raycast
  TOUCH: 'touch'          // AR touch input
};

/**
 * @typedef {Object} VRControllerState
 * @property {THREE.XRController} controller - Controller object
 * @property {THREE.Object3D} grip - Grip space for holding
 * @property {THREE.Object3D} targetRay - Ray space for pointing
 * @property {THREE.Line} rayLine - Visual ray indicator
 * @property {boolean} gripping - Currently gripping
 * @property {boolean} triggering - Trigger pressed
 * @property {number} triggerValue - Analog trigger value (0-1)
 */

class VRSupport {
  constructor() {
    /** @type {XRMode} */
    this._mode = XRMode.NONE;
    
    /** @type {XRSession|null} */
    this._session = null;
    
    /** @type {XRReferenceSpace|null} */
    this._referenceSpace = null;
    
    /** @type {WebGLRenderingContext|null} */
    this._gl = null;
    
    /** @type {THREE.WebGLRenderer|null} */
    this._renderer = null;
    
    // VR-specific rendering
    this._vrCamera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
    this._vrCamera.position.set(0, 1.6, 2); // Standing eye height
    
    // Controllers
    this._controllers = [];
    this._controllerStates = new Map();
    
    // Controller input bindings
    this._inputBindings = {
      accelerate: 'trigger-right',
      brake: 'grip-right',
      steerLeft: 'thumbstick-left-x-negative',
      steerRight: 'thumbstick-left-x-positive',
      menu: 'button-y'
    };

    // VR UI
    this._uiPanels = [];
    this._hudAttachment = null; // Wrist HUD
    this._interactionMethod = VRInteractionMethod.RAYCAST;
    this._gazeTimer = 0;
    this._gazeThreshold = 1.5; // Seconds to select via gaze
    
    // Performance tracking
    this._frameTimes = [];
    this._targetFrameTime = 1000 / 90; // 90fps target
    this._qualityLevel = 1.0; // Current quality scale
    this._autoQualityEnabled = true;

    // Optimization settings
    this._optimizations = {
      foveationEnabled: true,
      foveationLevel: 2, // 0-3 (low to high)
      asyncReprojection: true,
      singlePassStereo: true,
      reducedParticles: true,
      simplifiedShadows: true,
      shadowMapSize: 512
    };

    // AR-specific
    this._arTableScale = 0.01; // Scale factor for tabletop
    this._arTrackPosition = new THREE.Vector3();
    this._arTrackRotation = new THREE.Euler();

    // Feature detection
    this._xrSupported = false;
    this._vrSupported = false;
    this._arSupported = false;

    // Active state
    this._active = false;
    this._initialized = false;

    console.log('[VRSupport] Module loaded');
  }

  /**
   * Initialize and check for WebXR support
   * @param {THREE.WebGLRenderer} renderer - Three.js renderer
   * @returns {Promise<Object>} Support status
   */
  async init(renderer) {
    if (!navigator.xr) {
      console.warn('[VRSupport] WebXR not available in this browser');
      return { supported: false, reason: 'NO_WEBXR' };
    }

    this._renderer = renderer;
    this._gl = renderer.getContext();

    try {
      // Check for VR support
      this._vrSupported = await navigator.xr.isSessionSupported('immersive-vr');
      
      // Check for AR support
      this._arSupported = await navigator.xr.isSessionSupported('immersive-ar');
      
      this._xrSupported = this._vrSupported || this._arSupported;
      this._initialized = true;

      console.log(`[VRSupport] Support check complete:
        VR: ${this._vrSupported}
        AR: ${this._arSupported}
        Overall: ${this._xrSupported}`);

      EventBus.emit('vr:supportChecked', {
        vr: this._vrSupported,
        ar: this._arSupported
      });

      return {
        supported: this._xrSupported,
        vr: this._vrSupported,
        ar: this._arSupported
      };
    } catch (e) {
      console.error('[VRSupport] Error checking support:', e);
      return { supported: false, error: e.message };
    }
  }

  /**
   * Enter VR mode
   * @returns {Promise<boolean>} Success status
   */
  async enterVR() {
    if (!this._initialized || !this._vrSupported) {
      console.error('[VRSupport] VR not supported or not initialized');
      return false;
    }

    if (this._session) {
      console.warn('[VRSupport] Already in a session');
      return false;
    }

    try {
      const session = await navigator.xr.requestSession('immersive-vr', {
        requiredFeatures: ['local-floor'],
        optionalFeatures: ['hand-tracking', 'dom-overlay'],
        domOverlay: { root: document.getElementById('vr-overlay') }
      });

      await this._setupSession(session, XRMode.VR);
      return true;
    } catch (e) {
      console.error('[VRSupport] Failed to enter VR:', e);
      EventBus.emit('vr:error', { error: e.message });
      return false;
    }
  }

  /**
   * Enter AR mode (tabletop)
   * @returns {Promise<boolean>} Success status
   */
  async enterAR() {
    if (!this._initialized || !this._arSupported) {
      console.error('[VRSupport] AR not supported or not initialized');
      return false;
    }

    if (this._session) {
      console.warn('[VRSupport] Already in a session');
      return false;
    }

    try {
      const session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['dom-overlay', 'light-estimation'],
        domOverlay: { root: document.getElementById('ar-overlay') }
      });

      await this._setupSession(session, XRMode.AR);
      return true;
    } catch (e) {
      console.error('[VRSupport] Failed to enter AR:', e);
      EventBus.emit('vr:error', { error: e.message });
      return false;
    }
  }

  /**
   * Set up common session handling
   * @private
   * @param {XRSession} session - The XR session
   * @param {XRMode} mode - VR or AR mode
   */
  async _setupSession(session, mode) {
    this._session = session;
    this._mode = mode;
    this._active = true;

    // Set up renderer for XR
    await this._renderer.xr.setSession(session);
    this._renderer.xr.enabled = true;

    // Get reference space
    this._referenceSpace = await session.requestReferenceSpace('local-floor');

    // Set up controllers
    this._setupControllers();

    // Apply VR optimizations
    this._applyOptimizations(mode);

    // Create VR UI elements
    this._createVRUI();

    // Session event handlers
    session.addEventListener('end', () => this._onSessionEnd());
    session.addEventListener('selectstart', (e) => this._onSelectStart(e));
    session.addEventListener('selectend', (e) => this._onSelectEnd(e));
    session.addEventListener('squeezestart', (e) => this._onSqueezeStart(e));
    session.addEventListener('squeezeend', (e) => this._onSqueezeEnd(e));

    console.log(`[VRSupport] Entered ${mode.toUpperCase()} mode`);
    EventBus.emit('vr:sessionStarted', { mode });

    // Start render loop
    this._renderer.setAnimationLoop((time, frame) => this._onXRFrame(time, frame));
  }

  /**
   * Set up motion controller tracking
   * @private
   */
  _setupControllers() {
    this._controllers = [];
    this._controllerStates.clear();

    // Select both possible controllers
    for (let i = 0; i < 2; i++) {
      const controller = this._renderer.xr.getController(i);
      
      // Create visual ray for pointing
      const rayGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1)
      ]);
      const rayMaterial = new THREE.LineBasicMaterial({ 
        color: i === 0 ? 0x00ff00 : 0xff0000,
        transparent: true,
        opacity: 0.7
      });
      const rayLine = new THREE.Line(rayGeometry, rayMaterial);
      rayLine.scale.z = 10; // 10 meter ray
      controller.add(rayLine);

      // Add controller tip indicator
      const tipGeometry = new THREE.SphereGeometry(0.01, 8, 8);
      const tipMaterial = new THREE.MeshBasicMaterial({ color: i === 0 ? 0x00ff00 : 0xff0000 });
      const tip = new THREE.Mesh(tipGeometry, tipMaterial);
      tip.position.z = -0.02;
      controller.add(tip);

      this._controllers.push(controller);
      
      this._controllerStates.set(i, {
        controller,
        grip: this._renderer.xr.getControllerGrip(i),
        targetRay: controller,
        rayLine,
        gripping: false,
        triggering: false,
        triggerValue: 0,
        thumbstick: { x: 0, y: 0 },
        position: new THREE.Vector3(),
        quaternion: new THREE.Quaternion()
      });

      // Emit event for scene to add controller
      EventBus.emit('vr:controllerAdded', { index: i, controller });
    }
  }

  /**
   * Apply rendering optimizations for VR/AR
   * @private
   * @param {XRMode} mode - Current mode
   */
  _applyOptimizations(mode) {
    if (!this._renderer) return;

    const opts = this._optimizations;

    // Enable foveated rendering if available
    if (opts.foveationEnabled && this._session?.updateRenderState) {
      try {
        // Fixed foveation (sharper center)
        this._session.updateRenderState({
          baseLayer: this._renderer.xr.getSession().renderState.baseLayer,
          foveation: opts.foveationLevel / 3 // Normalize to 0-1
        });
      } catch (e) {
        console.warn('[VRSupport] Foveation not supported:', e.message);
      }
    }

    // Reduce shadow map size
    if (opts.simplifiedShadows && this._renderer.shadowMap) {
      this._renderer.shadowMap.type = THREE.BasicShadowMap;
    }

    // Adjust pixel ratio for performance
    if (mode === XRMode.VR) {
      this._renderer.setPixelRatio(1); // Always 1:1 in VR
    }

    console.log(`[VRSupport] Applied ${mode} optimizations`);
  }

  /**
   * Create VR UI elements (curved panels, wrist HUD)
   * @private
   */
  _createVRUI() {
    // Wrist-watch style HUD attached to left controller
    const hudGroup = new THREE.Group();
    
    // Simple panel geometry
    const panelGeom = new THREE.PlaneGeometry(0.15, 0.1);
    const panelMat = new THREE.MeshBasicMaterial({ 
      color: 0x111111, 
      transparent: true, 
      opacity: 0.8,
      side: THREE.DoubleSide
    });
    const panel = new THREE.Mesh(panelGeom, panelMat);
    panel.position.set(-0.05, 0, 0);
    panel.rotation.y = Math.PI / 4;
    hudGroup.add(panel);

    this._hudAttachment = hudGroup;
    
    // Would add text/speed display here with canvas texture

    EventBus.emit('vr:uiCreated', { hud: hudGroup });
  }

  /**
   * Main XR frame callback
   * @private
   * @param {number} time - Timestamp
   * @param {XRFrame} frame - XR frame data
   */
  _onXRFrame(time, frame) {
    if (!this._session || !this._active) return;

    const now = performance.now();
    
    // Track frame time for quality adjustment
    if (this._frameTimes.length > 60) {
      this._frameTimes.shift();
    }
    this._frameTimes.push(now);

    // Auto-adjust quality based on framerate
    if (this._autoQualityEnabled && this._frameTimes.length >= 30) {
      this._adjustQuality();
    }

    // Get pose for each eye
    const pose = frame.getViewerPose(this._referenceSpace);
    if (!pose) return;

    // Update controller states
    this._updateControllers(frame);

    // Update VR UI positions
    this._updateVRUI();

    // Handle gaze selection
    if (this._interactionMethod === VRInteractionMethod.GAZE) {
      this._updateGazeSelection(frame);
    }

    // Process raycasting for UI interaction
    this._processRaycastInteraction();

    // Emit frame event with input state
    EventBus.emit('vr:frame', {
      time,
      pose,
      controllers: this._getControllerInput(),
      mode: this._mode
    });
  }

  /**
   * Update controller states from XR frame
   * @private
   * @param {XRFrame} frame - Current frame
   */
  _updateControllers(frame) {
    for (const [index, state] of this._controllerStates) {
      // Get controller pose
      const space = state.targetRay.space;
      const pose = frame.getPose(space, this._referenceSpace);
      
      if (pose) {
        state.position.fromArray(pose.transform.position);
        state.quaternion.fromArray(pose.transform.orientation);
        
        // Update controller object
        state.controller.position.copy(state.position);
        state.controller.quaternion.copy(state.quaternion);
      }

      // Get gamepad input
      const gamepad = state.controller.gamepad;
      if (gamepad) {
        state.triggering = gamepad.buttons[0]?.pressed || false;
        state.triggerValue = gamepad.buttons[0]?.value || 0;
        state.gripping = gamepad.buttons[1]?.pressed || false;
        
        // Thumbstick
        if (gamepad.axes.length >= 2) {
          state.thumbstick.x = gamepad.axes[0];
          state.thumbstick.y = gamepad.axes[1];
        }
      }
    }
  }

  /**
   * Update VR UI element positions
   * @private
   */
  _updateVRUI() {
    if (!this._hudAttachment) return;

    // Attach wrist HUD to left controller
    const leftController = this._controllerStates.get(0);
    if (leftController) {
      this._hudAttachment.position.copy(leftController.position);
      this._hudAttachment.quaternion.copy(leftController.quaternion);
      // Offset to wrist position
      this._hudAttachment.translateX(-0.08);
      this._hudAttachment.translateZ(0.03);
    }
  }

  /**
   * Update gaze-based selection timer
   * @private
   * @param {XRFrame} frame - Current frame
   */
  _updateGazeSelection(frame) {
    // Get center of view direction
    const pose = frame.getViewerPose(this._referenceSpace);
    if (!pose?.views?.length) return;

    const view = pose.views[0]; // Use first eye as reference
    const ray = new THREE.XRRay(
      new DOMPoint(view.transform.position),
      { x: 0, y: 0, z: -1 } // Forward direction
    );

    // Check intersection with interactive objects
    // This would use the scene's raycaster
    const intersected = this._raycastForGaze(ray);

    if (intersected) {
      if (this._currentGazeTarget === intersected) {
        this._gazeTimer += 1 / 90; // Approximate frame time
        
        if (this._gazeTimer >= this._gazeThreshold) {
          this._onGazeSelect(intersected);
          this._gazeTimer = 0;
        }
      } else {
        this._currentGazeTarget = intersected;
        this._gazeTimer = 0;
      }
    } else {
      this._currentGazeTarget = null;
      this._gazeTimer = 0;
    }
  }

  /**
   * Perform raycast for gaze targeting
   * @private
   * @param {XRRay} ray - Gaze ray
   * @returns {Object|null} Intersected object
   */
  _raycastForGaze(ray) {
    // Placeholder - would integrate with scene's raycaster
    // Returns mock result for structure
    return null;
  }

  /**
   * Process controller raycast interactions
   * @private
   */
  _processRaycastInteraction() {
    for (const [index, state] of this._controllerStates) {
      if (!state.triggering) continue;

      // Cast ray from controller
      const origin = state.position;
      const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(state.quaternion);
      
      // Check for intersections with UI elements
      // Would emit events for UI system to handle
    }
  }

  /**
   * Auto-adjust quality based on frame timing
   * @private
   */
  _adjustQuality() {
    if (this._frameTimes.length < 30) return;

    const recentFrames = this._frameTimes.slice(-30);
    let totalDelta = 0;
    
    for (let i = 1; i < recentFrames.length; i++) {
      totalDelta += recentFrames[i] - recentFrames[i - 1];
    }
    
    const avgFrameTime = Math.abs(totalDelta / (recentFrames.length - 1));
    const fps = 1000 / avgFrameTime;

    // Adjust quality if below target
    if (fps < 75 && this._qualityLevel > 0.5) {
      this._qualityLevel -= 0.1;
      this._applyQualityLevel();
      console.log(`[VRSupport] Reduced quality to ${this._qualityLevel.toFixed(1)} (${fps.toFixed(0)}fps)`);
    } else if (fps > 88 && this._qualityLevel < 1.0) {
      this._qualityLevel += 0.05;
      this._applyQualityLevel();
    }
  }

  /**
   * Apply current quality level settings
   * @private
   */
  _applyQualityLevel() {
    // Would adjust particle counts, shadow resolution, etc.
    EventBus.emit('vr:qualityChanged', { level: this._qualityLevel });
  }

  /**
   * Get aggregated controller input for game logic
   * @private
   * @returns {Object} Combined input state
   */
  _getControllerInput() {
    const left = this._controllerStates.get(0);
    const right = this._controllerStates.get(1);

    return {
      // Steering from either thumbstick or wheel emulation
      steering: (left?.thumbstick.x || 0) + this._getSteeringFromRotation(),
      
      // Acceleration from triggers or buttons
      accelerate: right?.triggering || right?.triggerValue > 0.1 || false,
      brake: left?.gripping || false,
      
      // Raw values for fine control
      throttleAmount: right?.triggerValue || 0,
      brakeAmount: left?.triggerValue || 0,

      // Positions for spatial audio/UI
      leftPosition: left?.position?.toArray(),
      rightPosition: right?.position?.toArray()
    };
  }

  /**
   * Calculate steering from controller rotation (wheel emulation)
   * @private
   * @returns {number} Steering value (-1 to 1)
   */
  _getSteeringFromRotation() {
    // When using two controllers like a steering wheel
    const left = this._controllerStates.get(0);
    const right = this._controllerStates.get(1);

    if (!left?.gripping || !right?.gripping) return 0;

    // Calculate angle between controllers
    const leftPos = left.position;
    const rightPos = right.position;
    
    const dx = rightPos.x - leftPos.x;
    const dz = rightPos.z - leftPos.z;
    
    // Return normalized angle
    return Math.atan2(dx, dz) / Math.PI;
  }

  // ==================== EVENT HANDLERS ====================

  /**
   * Handle session end
   * @private
   */
  _onSessionEnd() {
    console.log(`[VRSupport] ${this._mode.toUpperCase()} session ended`);
    
    this._mode = XRMode.NONE;
    this._active = false;
    this._session = null;
    
    // Stop XR render loop
    this._renderer.setAnimationLoop(null);
    this._renderer.xr.enabled = false;

    // Clean up controllers
    this._controllers = [];
    this._controllerStates.clear();

    EventBus.emit('vr:sessionEnded');
  }

  /**
   * Handle select/trigger press
   * @private
   */
  _onSelectStart(event) {
    const controllerIndex = this._controllers.indexOf(event.inputSource.targetRaySpace);
    EventBus.emit('vr:selectStart', { controller: controllerIndex });
  }

  /**
   * Handle select/trigger release
   * @private
   */
  _onSelectEnd(event) {
    const controllerIndex = this._controllers.indexOf(event.inputSource.targetRaySpace);
    EventBus.emit('vr:selectEnd', { controller: controllerIndex });
  }

  /**
   * Handle squeeze/grip press
   * @private
   */
  _onSqueezeStart(event) {
    const controllerIndex = this._controllers.indexOf(event.inputSource.targetRaySpace);
    const state = this._controllerStates.get(controllerIndex);
    if (state) state.gripping = true;
    EventBus.emit('vr:squeezeStart', { controller: controllerIndex });
  }

  /**
   * Handle squeeze/grip release
   * @private
   */
  _onSqueezeEnd(event) {
    const controllerIndex = this._controllers.indexOf(event.inputSource.targetRaySpace);
    const state = this._controllerStates.get(controllerIndex);
    if (state) state.gripping = false;
    EventBus.emit('vr:squeezeEnd', { controller: controllerIndex });
  }

  /**
   * Handle gaze selection completion
   * @private
   * @param {Object} target - Selected object
   */
  _onGazeSelect(target) {
    EventBus.emit('vr:gazeSelect', { target });
  }

  // ==================== PUBLIC API ====================

  /**
   * Exit current XR session
   */
  async exitXR() {
    if (this._session) {
      await this._session.end();
    }
  }

  /**
   * Get current XR mode
   * @returns {XRMode}
   */
  getMode() {
    return this._mode;
  }

  /**
   * Check if currently in an XR session
   * @returns {boolean}
   */
  isActive() {
    return this._active;
  }

  /**
   * Check VR support
   * @returns {boolean}
   */
  isVRSupported() {
    return this._vrSupported;
  }

  /**
   * Check AR support
   * @returns {boolean}
   */
  isARSupported() {
    return this._arSupported;
  }

  /**
   * Enable stereo fallback mode (for Cardboard-style viewing)
   * @returns {boolean} Success
   */
  enableStereoMode() {
    if (this._active) {
      console.warn('[VRSupport] Cannot enable stereo while in XR session');
      return false;
    }

    this._mode = XRMode.STEREO;
    this._active = true;
    
    console.log('[VRSupport] Stereo mode enabled');
    EventBus.emit('vr:stereoModeEnabled');
    return true;
  }

  /**
   * Disable stereo mode
   */
  disableStereoMode() {
    this._mode = XRMode.NONE;
    this._active = false;
    EventBus.emit('vr:stereoModeDisabled');
  }

  /**
   * Set interaction method for VR UI
   * @param {VRInteractionMethod} method - Desired method
   */
  setInteractionMethod(method) {
    if (!Object.values(VRInteractionMethod).includes(method)) return;
    this._interactionMethod = method;
    EventBus.emit('vr:interactionMethodChanged', { method });
  }

  /**
   * Set AR tabletop scale
   * @param {number} scale - Scale factor
   */
  setARTableScale(scale) {
    this._arTableScale = Math.max(0.001, Math.min(0.1, scale));
  }

  /**
   * Set auto-quality adjustment
   * @param {boolean} enabled - Whether to auto-adjust
   */
  setAutoQuality(enabled) {
    this._autoQualityEnabled = enabled;
  }

  /**
   * Manually set quality level
   * @param {number} level - Quality (0-1)
   */
  setQualityLevel(level) {
    this._qualityLevel = Math.max(0.1, Math.min(1, level));
    this._applyQualityLevel();
  }

  /**
   * Get current quality level
   * @returns {number}
   */
  getQualityLevel() {
    return this._qualityLevel;
  }

  /**
   * Get VR camera for rendering
   * @returns {THREE.PerspectiveCamera}
   */
  getVRCamera() {
    return this._vrCamera;
  }

  /**
   * Get optimization settings
   * @returns {Object}
   */
  getOptimizations() {
    return { ...this._optimizations };
  }

  /**
   * Update optimization setting
   * @param {string} key - Setting name
   * @param {*} value - New value
   */
  setOptimization(key, value) {
    if (key in this._optimizations) {
      this._optimizations[key] = value;
      console.log(`[VRSupport] Optimization ${key} set to ${value}`);
    }
  }

  /**
   * Get all available modes
   * @returns {string[]}
   */
  static getModes() {
    return Object.values(XRMode);
  }

  /**
   * Get all interaction methods
   * @returns {string[]}
   */
  static getInteractionMethods() {
    return Object.values(VRInteractionMethod);
  }
}

export const vrSupport = new VRSupport();
export { XRMode, VRInteractionMethod };
export default vrSupport;
