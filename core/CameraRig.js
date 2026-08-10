// core/CameraRig.js
// Advanced camera system with Photo Mode support.
// Features multiple camera modes, post-processing filters,
// depth of field, exposure control, and high-resolution capture.

import { EventBus } from './EventBus.js';
import * as THREE from 'three';

/**
 * Camera mode enumeration
 * @enum {string}
 */
const CameraMode = {
  CHASE: 'CHASE',           // Third-person chase cam
  HOOD: 'HOOD',             // Hood/bonnet view
  COCKPIT: 'COCKPIT',       // Interior cockpit view
  ORBIT: 'ORBIT',           // Free orbit camera
  CINEMATIC: 'CINEMATIC',   // Cinematic auto-camera
  PHOTO: 'PHOTO'            // Photo Mode (frozen, full controls)
};

/**
 * Filter preset definitions for photo mode
 * @enum {Object}
 */
const FILTER_PRESETS = {
  none: {
    name: 'None',
    saturation: 1.0,
    contrast: 1.0,
    brightness: 1.0,
    vignette: 0,
    grain: 0,
    hueRotation: 0,
    colorTint: new THREE.Vector3(1, 1, 1),
    blur: 0,
    sharpen: 0
  },
  filmGrain: {
    name: 'Film Grain',
    saturation: 0.9,
    contrast: 1.1,
    brightness: 0.95,
    vignette: 0.4,
    grain: 0.15,
    hueRotation: 0,
    colorTint: new THREE.Vector3(1, 0.98, 0.95),
    blur: 0,
    sharpen: 0.1
  },
  vintage: {
    name: 'Vintage',
    saturation: 0.7,
    contrast: 0.9,
    brightness: 1.1,
    vignette: 0.6,
    grain: 0.08,
    hueRotation: 0.05,
    colorTint: new THREE.Vector3(1.1, 1.0, 0.85),
    blur: 0.15,
    sharpen: 0
  },
  highContrast: {
    name: 'High Contrast',
    saturation: 1.2,
    contrast: 1.4,
    brightness: 1.0,
    vignette: 0.3,
    grain: 0,
    hueRotation: 0,
    colorTint: new THREE.Vector3(1, 1, 1),
    blur: 0,
    sharpen: 0.3
  },
  noir: {
    name: 'Noir',
    saturation: 0,
    contrast: 1.5,
    brightness: 0.9,
    vignette: 0.7,
    grain: 0.12,
    hueRotation: 0,
    colorTint: new THREE.Vector3(1, 1, 1),
    blur: 0.2,
    sharpen: 0.15
  },
  vibrant: {
    name: 'Vibrant',
    saturation: 1.4,
    contrast: 1.15,
    brightness: 1.05,
    vignette: 0.15,
    grain: 0,
    hueRotation: 0,
    colorTint: new THREE.Vector3(1, 1, 1),
    blur: 0,
    sharpen: 0.2
  }
};

class CameraRig {
  constructor() {
    /** @type {THREE.PerspectiveCamera} */
    this._camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    
    /** @type {CameraMode} */
    this._mode = CameraMode.CHASE;
    
    // Target to follow
    this._target = null;
    this._targetOffset = new THREE.Vector3(0, 2, 0);
    
    // Chase camera settings
    this._chaseDistance = 12;
    this._chaseHeight = 4;
    this._chaseLookAhead = 8;
    this._smoothSpeed = 5;
    
    // Orbit camera (for photo mode / free cam)
    this._orbitAngles = { theta: 0, phi: Math.PI / 4 };
    this._orbitDistance = 20;
    this._orbitTarget = new THREE.Vector3();
    
    // Current position/rotation for smoothing
    this._currentPosition = new THREE.Vector3(0, 10, -20);
    this._currentLookAt = new THREE.Vector3(0, 0, 0);
    
    // Photo Mode state
    this._photoMode = false;
    this._dofStrength = 0;
    this._dofDistance = 10;
    this._dofRange = 5;
    this._exposure = 1.0;
    this._vignette = 0;
    this._filterPreset = 'none';
    this._customFilter = { ...FILTER_PRESETS.none };
    this._hideUI = true;
    this._freezeTime = true;
    
    // Post-processing uniforms for shaders
    this._postProcessUniforms = {
      tDiffuse: { value: null },
      uSaturation: { value: 1.0 },
      uContrast: { value: 1.0 },
      uBrightness: { value: 1.0 },
      uVignette: { value: 0 },
      uGrain: { value: 0 },
      uHueRotation: { value: 0 },
      uColorTint: { value: new THREE.Vector3(1, 1, 1) },
      uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      uTime: { value: 0 }
    };

    // FOV control
    this._baseFOV = 75;
    this._minFOV = 20;
    this._maxFOV = 120;

    // Shake effects
    this._shakeIntensity = 0;
    this._shakeDecay = 5;
    this._shakeOffset = new THREE.Vector3();

    // Initialized flag
    this._initialized = true;
  }

  /**
   * Get the Three.js camera instance
   * @returns {THREE.PerspectiveCamera}
   */
  getCamera() {
    return this._camera;
  }

  /**
   * Set the target object to follow
   * @param {THREE.Object3D} target - Object to follow
   */
  setTarget(target) {
    this._target = target;
    if (target) {
      this._orbitTarget.copy(target.position);
    }
  }

  /**
   * Set camera mode
   * @param {CameraMode} mode - Desired camera mode
   */
  setMode(mode) {
    if (!Object.values(CameraMode).includes(mode)) {
      console.warn(`[CameraRig] Invalid mode: ${mode}`);
      return;
    }
    
    // Exit photo mode if switching away from it
    if (this._photoMode && mode !== CameraMode.PHOTO) {
      this.exitPhotoMode();
    }
    
    this._mode = mode;
    console.log(`[CameraRig] Mode set to ${mode}`);
    EventBus.emit('camera:modeChanged', { mode });
  }

  /**
   * Get current camera mode
   * @returns {CameraMode}
   */
  getMode() {
    return this._mode;
  }

  /**
   * Update camera position (call each frame)
   * @param {number} deltaTime - Time since last update in seconds
   * @param {number} elapsedTime - Total elapsed time
   */
  update(deltaTime, elapsedTime) {
    if (!this._initialized) return;

    // Update shake decay
    if (this._shakeIntensity > 0) {
      this._shakeIntensity -= deltaTime * this._shakeDecay;
      if (this._shakeIntensity < 0) this._shakeIntensity = 0;
      
      this._shakeOffset.set(
        (Math.random() - 0.5) * this._shakeIntensity,
        (Math.random() - 0.5) * this._shakeIntensity,
        (Math.random() - 0.5) * this._shakeIntensity
      );
    }

    // Skip follow updates in photo mode (unless user moves)
    if (this._photoMode && this._freezeTime) {
      this._updatePhotoModeCamera();
      return;
    }

    switch (this._mode) {
      case CameraMode.CHASE:
        this._updateChaseCamera(deltaTime);
        break;
      case CameraMode.HOOD:
        this._updateHoodCamera(deltaTime);
        break;
      case CameraMode.COCKPIT:
        this._updateCockpitCamera(deltaTime);
        break;
      case CameraMode.ORBIT:
        this._updateOrbitCamera(deltaTime);
        break;
      case CameraMode.CINEMATIC:
        this._updateCinematicCamera(deltaTime, elapsedTime);
        break;
      case CameraMode.PHOTO:
        this._updatePhotoModeCamera();
        break;
    }

    // Apply shake offset
    if (this._shakeIntensity > 0) {
      this._camera.position.add(this._shakeOffset);
    }

    // Update post-processing time uniform
    this._postProcessUniforms.uTime.value = elapsedTime;
  }

  /**
   * Update third-person chase camera
   * @private
   */
  _updateChaseCamera(deltaTime) {
    if (!this._target) return;

    const targetPos = new THREE.Vector3();
    this._target.getWorldPosition(targetPos);

    // Calculate ideal camera position behind and above target
    const idealOffset = new THREE.Vector3(
      0,
      this._chaseHeight,
      -this._chaseDistance
    );

    // Apply target's rotation
    if (this._target.quaternion) {
      idealOffset.applyQuaternion(this._target.quaternion);
    }

    const idealPos = targetPos.clone().add(idealOffset).add(this._targetOffset);
    
    // Smooth interpolation
    const smoothFactor = Math.min(1, deltaTime * this._smoothSpeed);
    this._currentPosition.lerp(idealPos, smoothFactor);
    
    // Look ahead of target
    const lookAhead = new THREE.Vector3(0, 0, this._chaseLookAhead);
    if (this._target.quaternion) {
      lookAhead.applyQuaternion(this._target.quaternion);
    }
    const lookAtPos = targetPos.clone().add(lookAhead).add(this._targetOffset);
    this._currentLookAt.lerp(lookAtPos, smoothFactor);

    // Apply to camera
    this._camera.position.copy(this._currentPosition);
    this._camera.lookAt(this._currentLookAt);
  }

  /**
   * Update hood/bonnet camera
   * @private
   */
  _updateHoodCamera(deltaTime) {
    if (!this._target) return;

    const targetPos = new THREE.Vector3();
    this._target.getWorldPosition(targetPos);

    // Position at hood height, slightly forward
    const offset = new THREE.Vector3(0, 1.2, 1);
    if (this._target.quaternion) {
      offset.applyQuaternion(this._target.quaternion);
    }

    this._camera.position.copy(targetPos).add(offset);
    
    // Look forward along vehicle direction
    const lookDir = new THREE.Vector3(0, 0.5, 10);
    if (this._target.quaternion) {
      lookDir.applyQuaternion(this._target.quaternion);
    }
    this._camera.lookAt(targetPos.clone().add(lookDir));
  }

  /**
   * Update interior cockpit camera
   * @private
   */
  _updateCockpitCamera(deltaTime) {
    if (!this._target) return;

    const targetPos = new THREE.Vector3();
    this._target.getWorldPosition(targetPos);

    // Position inside cockpit
    const offset = new THREE.Vector3(0, 1.5, -0.5);
    if (this._target.quaternion) {
      offset.applyQuaternion(this._target.quaternion);
    }

    this._camera.position.copy(targetPos).add(offset);
    
    // Look through windshield
    const lookDir = new THREE.Vector3(0, 0.8, 5);
    if (this._target.quaternion) {
      lookDir.applyQuaternion(this._target.quaternion);
    }
    this._camera.lookAt(targetPos.clone().add(lookDir));
  }

  /**
   * Update free orbit camera
   * @private
   */
  _updateOrbitCamera(deltaTime) {
    const x = this._orbitDistance * Math.sin(this._orbitAngles.theta) * Math.cos(this._orbitAngles.phi);
    const y = this._orbitDistance * Math.sin(this._orbitAngles.phi);
    const z = this._orbitDistance * Math.cos(this._orbitAngles.theta) * Math.cos(this._orbitAngles.phi);

    this._camera.position.set(
      this._orbitTarget.x + x,
      Math.max(y, 2), // Keep above ground
      this._orbitTarget.z + z
    );
    this._camera.lookAt(this._orbitTarget);
  }

  /**
   * Update cinematic auto-camera
   * @private
   */
  _updateCinematicCamera(deltaTime, elapsedTime) {
    if (!this._target) return;

    const targetPos = new THREE.Vector3();
    this._target.getWorldPosition(targetPos);

    // Dynamic cinematic movement based on speed/time
    const speed = this._getTargetSpeed?.() || 50;
    const normalizedSpeed = Math.min(speed / 200, 1);
    
    // Vary distance based on speed
    const baseDistance = 15 + normalizedSpeed * 10;
    
    // Slow orbit around target
    const orbitSpeed = 0.1;
    this._orbitAngles.theta += deltaTime * orbitSpeed;
    
    // Vary height sinusoidally
    const heightVar = Math.sin(elapsedTime * 0.3) * 3;
    
    const x = baseDistance * Math.sin(this._orbitAngles.theta) * Math.cos(this._orbitAngles.phi);
    const y = baseDistance * Math.sin(this._orbitAngles.phi) + 5 + heightVar;
    const z = baseDistance * Math.cos(this._orbitAngles.theta) * Math.cos(this._orbitAngles.phi);

    const smoothFactor = Math.min(1, deltaTime * 2);
    const idealPos = new THREE.Vector3(
      targetPos.x + x,
      Math.max(y, 3),
      targetPos.z + z
    );
    
    this._currentPosition.lerp(idealPos, smoothFactor);
    this._camera.position.copy(this._currentPosition);
    
    // Look at target with slight lead
    const lookAtPos = targetPos.clone().add(new THREE.Vector3(0, 2, 0));
    this._currentLookAt.lerp(lookAtPos, smoothFactor);
    this._camera.lookAt(this._currentLookAt);
  }

  /**
   * Update photo mode camera (full user control)
   * @private
   */
  _updatePhotoModeCamera() {
    // In photo mode, camera is fully controlled by user input methods
    // Just ensure we're looking at the right place
    if (this._target && !this._freezeTime) {
      this._updateOrbitCamera(0.016); // Direct update, no smoothing
    } else {
      // Even when frozen, allow orbit around last known point
      const x = this._orbitDistance * Math.sin(this._orbitAngles.theta) * Math.cos(this._orbitAngles.phi);
      const y = this._orbitDistance * Math.sin(this._orbitAngles.phi);
      const z = this._orbitDistance * Math.cos(this._orbitAngles.theta) * Math.cos(this._orbitAngles.phi);

      this._camera.position.set(
        this._orbitTarget.x + x,
        Math.max(y, 1),
        this._orbitTarget.z + z
      );
      this._camera.lookAt(this._orbitTarget);
    }
  }

  // ==================== PHOTO MODE ====================

  /**
   * Enter Photo Mode
   * Enables advanced camera controls, post-processing options, and freezes action
   */
  enterPhotoMode() {
    if (this._photoMode) return;

    this._photoMode = true;
    this._dofStrength = 0;
    this._exposure = 1.0;
    this._vignette = 0;
    this._filterPreset = 'none';
    this._hideUI = true;
    this._freezeTime = true;
    
    // Store current orbit target
    if (this._target) {
      this._target.getWorldPosition(this._orbitTarget);
    }

    // Switch to orbit-style control
    this._prevMode = this._mode;
    this._mode = CameraMode.PHOTO;

    console.log('[CameraRig] Entered Photo Mode');
    EventBus.emit('camera:photoModeEntered');
    
    // Emit event to hide HUD
    if (this._hideUI) {
      EventBus.emit('ui:setVisibility', { visible: false });
    }
    
    // Emit event to freeze game
    if (this._freezeTime) {
      EventBus.emit('game:setPaused', { paused: true });
    }
  }

  /**
   * Exit Photo Mode
   * Restores normal camera operation
   */
  exitPhotoMode() {
    if (!this._photoMode) return;

    this._photoMode = false;
    this._mode = this._prevMode || CameraMode.CHASE;
    
    // Reset post-processing
    this._applyFilter('none');

    console.log('[CameraRig] Exited Photo Mode');
    EventBus.emit('camera:photoModeExited');
    
    // Restore UI
    EventBus.emit('ui:setVisibility', { visible: true });
    
    // Unfreeze game
    EventBus.emit('game:setPaused', { paused: false });
  }

  /**
   * Check if currently in photo mode
   * @returns {boolean}
   */
  isPhotoMode() {
    return this._photoMode;
  }

  /**
   * Set depth of field strength
   * @param {number} strength - DOF strength (0-1)
   */
  setDOF(strength) {
    this._dofStrength = Math.max(0, Math.min(1, strength));
    EventBus.emit('camera:dofChanged', { strength: this._dofStrength });
  }

  /**
   * Set DOF focal distance
   * @param {number} distance - Focal distance in world units
   */
  setDOFDistance(distance) {
    this._dofDistance = Math.max(0.1, distance);
  }

  /**
   * Set DOF focal range
   * @param {number} range - Range of focus in world units
   */
  setDOFRange(range) {
    this._dofRange = Math.max(0.1, range);
  }

  /**
   * Set exposure value
   * @param {number} value - Exposure (0.1-3.0)
   */
  setExposure(value) {
    this._exposure = Math.max(0.1, Math.min(3.0, value));
    this._postProcessUniforms.uBrightness.value = this._exposure;
    EventBus.emit('camera:exposureChanged', { value: this._exposure });
  }

  /**
   * Set vignette strength
   * @param {number} strength - Vignette (0-1)
   */
  setVignette(strength) {
    this._vignette = Math.max(0, Math.min(1, strength));
    this._postProcessUniforms.uVignette.value = this._vignette;
    EventBus.emit('camera:vignetteChanged', { strength: this._vignette });
  }

  /**
   * Set filter preset
   * @param {string} preset - Filter preset name
   */
  setFilter(preset) {
    if (!FILTER_PRESETS[preset]) {
      console.warn(`[CameraRig] Unknown filter preset: ${preset}`);
      return;
    }
    
    this._filterPreset = preset;
    this._applyFilter(preset);
    EventBus.emit('camera:filterChanged', { preset });
  }

  /**
   * Apply filter preset values to post-processing uniforms
   * @private
   * @param {string} preset - Preset name
   */
  _applyFilter(preset) {
    const filter = FILTER_PRESETS[preset];
    if (!filter) return;

    this._customFilter = { ...filter };
    this._postProcessUniforms.uSaturation.value = filter.saturation;
    this._postProcessUniforms.uContrast.value = filter.contrast;
    this._postProcessUniforms.uBrightness.value = filter.brightness * this._exposure;
    this._postProcessUniforms.uVignette.value = Math.max(filter.vignette, this._vignette);
    this._postProcessUniforms.uGrain.value = filter.grain;
    this._postProcessUniforms.uHueRotation.value = filter.hueRotation;
    this._postProcessUniforms.uColorTint.value.copy(filter.colorTint);
  }

  /**
   * Toggle UI visibility in photo mode
   * @param {boolean} hide - Whether to hide UI
   */
  setHideUI(hide) {
    this._hideUI = hide;
    EventBus.emit('ui:setVisibility', { visible: !hide });
  }

  /**
   * Toggle time freeze in photo mode
   * @param {boolean} freeze - Whether to freeze time
   */
  setFreezeTime(freeze) {
    this._freezeTime = freeze;
    EventBus.emit('game:setPaused', { paused: freeze });
  }

  /**
   * Capture high-resolution photo
   * @param {HTMLCanvasElement} canvas - The rendering canvas
   * @param {THREE.WebGLRenderer} renderer - The WebGL renderer
   * @param {number} [resolutionMultiplier=4] - Resolution scale factor
   * @returns {Promise<string>} Data URL of captured image
   */
  async capturePhoto(canvas, renderer, resolutionMultiplier = 4) {
    if (!canvas || !renderer) {
      console.error('[CameraRig] Cannot capture without canvas/renderer');
      return null;
    }

    try {
      const originalWidth = canvas.width;
      const originalHeight = canvas.height;
      
      // Set high resolution
      const newWidth = originalWidth * resolutionMultiplier;
      const newHeight = originalHeight * resolutionMultiplier;
      
      renderer.setSize(newWidth, newHeight, false);
      this._camera.aspect = newWidth / newHeight;
      this._camera.updateProjectionMatrix();
      
      // Render at high resolution
      // Note: Scene would need to be passed or stored
      renderer.render(renderer.scene || null, this._camera);
      
      // Capture
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      
      // Restore original size
      renderer.setSize(originalWidth, originalHeight, false);
      this._camera.aspect = originalWidth / originalHeight;
      this._camera.updateProjectionMatrix();
      
      console.log(`[CameraRig] Captured photo at ${newWidth}x${newHeight}`);
      EventBus.emit('camera:photoCaptured', { 
        dataUrl, 
        width: newWidth, 
        height: newHeight 
      });

      // Trigger download
      this._downloadImage(dataUrl, `wzk5-photo-${Date.now()}.png`);
      
      return dataUrl;
    } catch (e) {
      console.error('[CameraRig] Failed to capture photo:', e);
      return null;
    }
  }

  /**
   * Trigger image download
   * @private
   * @param {string} dataUrl - Image data URL
   * @param {string} filename - Download filename
   */
  _downloadImage(dataUrl, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.click();
  }

  /**
   * Get current filter preset name
   * @returns {string}
   */
  getFilterPreset() {
    return this._filterPreset;
  }

  /**
   * Get all available filter presets
   * @returns {Object}
   */
  static getFilterPresets() {
    return FILTER_PRESETS;
  }

  /**
   * Get post-processing uniforms for shader
   * @returns {Object}
   */
  getPostProcessUniforms() {
    return this._postProcessUniforms;
  }

  // ==================== CAMERA CONTROLS ====================

  /**
   * Control orbit camera rotation
   * @param {number} deltaTheta - Horizontal rotation (radians)
   * @param {number} deltaPhi - Vertical rotation (radians)
   */
  orbitCamera(deltaTheta, deltaPhi) {
    this._orbitAngles.theta += deltaTheta;
    // Clamp phi to prevent flipping
    this._orbitAngles.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, this._orbitAngles.phi + deltaPhi));
  }

  /**
   * Zoom orbit camera
   * @param {number} delta - Zoom amount (positive = zoom out)
   */
  zoomCamera(delta) {
    this._orbitDistance = Math.max(2, Math.min(100, this._orbitDistance + delta));
  }

  /**
   * Set orbit target position
   * @param {THREE.Vector3} target - New orbit center
   */
  setOrbitTarget(target) {
    this._orbitTarget.copy(target);
  }

  /**
   * Set camera field of view
   * @param {number} fov - Field of view in degrees
   */
  setFOV(fov) {
    this._fov = Math.max(this._minFOV, Math.min(this._maxFOV, fov));
    this._camera.fov = this._fov;
    this._camera.updateProjectionMatrix();
    EventBus.emit('camera:fovChanged', { fov: this._fov });
  }

  /**
   * Get current FOV
   * @returns {number}
   */
  getFOV() {
    return this._camera.fov;
  }

  /**
   * Adjust FOV (zoom)
   * @param {number} delta - FOV change amount
   */
  adjustFOV(delta) {
    this.setFOV(this._camera.fov - delta);
  }

  // ==================== EFFECTS ====================

  /**
   * Add camera shake effect
   * @param {number} intensity - Shake intensity
   * @param {number} [decay=5] - How fast shake decays
   */
  addShake(intensity, decay = 5) {
    this._shakeIntensity = intensity;
    this._shakeDecay = decay;
  }

  /**
   * Immediately stop all shake
   */
  stopShake() {
    this._shakeIntensity = 0;
    this._shakeOffset.set(0, 0, 0);
  }

  /**
   * Set chase camera distance
   * @param {number} distance - Distance behind target
   */
  setChaseDistance(distance) {
    this._chaseDistance = Math.max(3, Math.min(50, distance));
  }

  /**
   * Set chase camera height
   * @param {number} height - Height above target
   */
  setChaseHeight(height) {
    this._chaseHeight = Math.max(0, Math.min(30, height));
  }

  /**
   * Handle window resize
   * @param {number} width - New width
   * @param {number} height - New height
   */
  onResize(width, height) {
    this._camera.aspect = width / height;
    this._camera.updateProjectionMatrix();
    this._postProcessUniforms.uResolution.value.set(width, height);
  }

  /**
   * Get available camera modes
   * @returns {string[]}
   */
  static getModes() {
    return Object.values(CameraMode);
  }

  /**
   * Get current camera state info (for HUD display)
   * @returns {Object}
   */
  getStateInfo() {
    return {
      mode: this._mode,
      fov: this._camera.fov,
      photoMode: this._photoMode,
      dofStrength: this._dofStrength,
      exposure: this._exposure,
      filter: this._filterPreset,
      position: this._camera.position.toArray(),
      target: this._orbitTarget.toArray()
    };
  }
}

export const cameraRig = new CameraRig();
export { CameraMode, FILTER_PRESETS };
export default cameraRig;
