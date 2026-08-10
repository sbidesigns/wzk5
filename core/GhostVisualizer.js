// GhostVisualizer.js - 3D ghost car rendering for Time Trial mode
// Features: semi-transparent ghost mesh, smooth playback interpolation,
// floating name tags, comparison modes, color coding, time delta display

import * as THREE from 'three';
import { EventBus } from './EventBus.js';

// Ghost types with their visual properties
const GHOST_TYPES = {
  personalBest: {
    id: 'personalBest',
    name: 'Personal Best',
    color: 0x4488ff,      // Blue
    emissiveColor: 0x2244aa,
    opacity: 0.6,
    wireframe: false
  },
  worldRecord: {
    id: 'worldRecord',
    name: 'World Record',
    color: 0xffd700,      // Gold
    emissiveColor: 0xaa8800,
    opacity: 0.7,
    wireframe: false
  },
  friend: {
    id: 'friend',
    name: "Friend's Ghost",
    color: 0x44ff88,      // Green
    emissiveColor: 0x22aa44,
    opacity: 0.55,
    wireframe: false
  },
  dev: {
    id: 'dev',
    name: "Developer Ghost",
    color: 0xff44ff,     // Magenta
    emissiveColor: 0xaa22aa,
    opacity: 0.5,
    wireframe: true
  }
};

// Comparison mode options
const COMPARISON_MODES = {
  ghostOnly: { id: 'ghostOnly', name: 'Follow Ghost' },
  overlay: { id: 'overlay', name: 'Overlay (default)' },
  sideBySide: { id: 'sideBySide', name: 'Side by Side' }
};

class GhostVisualizer {
  constructor(options = {}) {
    // Configuration
    this._options = {
      defaultMode: options.defaultMode || 'overlay',
      showNameTag: options.showNameTag !== false,
      showTimeDelta: options.showTimeDelta !== false,
      fadeOnPass: options.fadeOnPass !== false,
      ...options
    };

    // Three.js objects
    this._scene = null;
    this._ghostMesh = null;
    this._nameTagSprite = null;
    this._timeDeltaSprite = null;

    // Playback state
    this._ghostData = null;        // Full replay data
    this._frames = null;           // Parsed frame array
    this._currentFrameIndex = 0;
    this._playbackTime = 0;
    this._isPlaying = false;
    this._loopPlayback = true;

    // Interpolation
    this._interpolatedPosition = new THREE.Vector3();
    this._interpolatedQuaternion = new THREE.Quaternion();
    this._lastFrameTime = 0;

    // Ghost type and appearance
    this._ghostType = null;        // GHOST_TYPES key
    this._comparisonMode = this._options.defaultMode;
    this._baseOpacity = 0.6;

    // Time delta tracking
    this._timeDelta = 0;           // Positive = ghost is ahead, negative = behind
    this._playerPassedGhost = false;

    // Callbacks
    this._onGhostFinished = null;

    // Reference to player vehicle for comparison
    this._playerVehicle = null;
  }

  /**
   * Initialize the visualizer with a Three.js scene
   * @param {THREE.Scene} scene - The race scene
   */
  init(scene) {
    this._scene = scene;
    
    // Create ghost mesh (placeholder geometry until we have actual vehicle model)
    this._createGhostMesh();
    
    // Create name tag sprite
    if (this._options.showNameTag) {
      this._createNameTag();
    }
    
    // Create time delta sprite
    if (this._options.showTimeDelta) {
      this._createTimeDeltaDisplay();
    }

    console.log('[GhostVisualizer] Initialized');
  }

  /**
   * Load ghost data from replay system or external source
   * @param {object} ghostData - Replay data object with frames array
   * @param {string} ghostType - Type of ghost (personalBest, worldRecord, friend)
   */
  loadGhost(ghostData, ghostType = 'personalBest') {
    if (!ghostData || !ghostData.frames) {
      console.warn('[GhostVisualizer] Invalid ghost data');
      return false;
    }

    this._ghostData = ghostData;
    this._ghostType = GHOST_TYPES[ghostType] || GHOST_TYPES.personalBest;
    
    // Parse frames based on format
    if (ghostData.frames instanceof Float32Array) {
      this._frames = this._parseFramesArray(ghostData.frames);
    } else if (Array.isArray(ghostData.frames)) {
      this._frames = ghostData.frames;
    } else {
      console.error('[GhostVisualizer] Unsupported frame format');
      return false;
    }

    // Reset playback state
    this._currentFrameIndex = 0;
    this._playbackTime = 0;
    this._isPlaying = false;
    this._playerPassedGhost = false;

    // Update ghost appearance
    this._updateGhostAppearance();

    // Update name tag
    if (this._nameTagSprite) {
      this._updateNameTagText(this._ghostType.name);
    }

    console.log(`[GhostVisualizer] Loaded ${this._ghostType.name} ghost: ${this._frames.length} frames, ${ghostData.duration?.toFixed(2)}s`);
    return true;
  }

  /**
   * Start ghost playback
   */
  start() {
    if (!this._frames || this._frames.length === 0) {
      console.warn('[GhostVisualizer] No ghost data loaded');
      return;
    }
    
    this._isPlaying = true;
    this._lastFrameTime = performance.now() / 1000;
    
    // Show ghost mesh
    if (this._ghostMesh) {
      this._ghostMesh.visible = true;
    }
    
    EventBus.emit('ghost:playbackStarted', { type: this._ghostType?.id });
  }

  /**
   * Stop ghost playback
   */
  stop() {
    this._isPlaying = false;
    
    if (this._ghostMesh) {
      this._ghostMesh.visible = false;
    }
    
    EventBus.emit('ghost:playbackStopped');
  }

  /**
   * Reset playback to beginning
   */
  reset() {
    this._currentFrameIndex = 0;
    this._playbackTime = 0;
    this._playerPassedGhost = false;
    this._timeDelta = 0;
    
    if (this._ghostMesh && this._frames?.length > 0) {
      const firstFrame = this._frames[0];
      if (firstFrame.position) {
        this._ghostMesh.position.set(
          firstFrame.position.x,
          firstFrame.position.y || 1,
          firstFrame.position.z || 0
        );
      }
    }
  }

  /**
   * Main update call - call every frame during race
   * @param {number} dt - Delta time in seconds
   * @param {object} playerState - Current player state for delta calculation
   */
  update(dt, playerState = null) {
    if (!this._isPlaying || !this._frames || this._frames.length === 0) return;

    // Advance playback time
    this._playbackTime += dt;

    // Find current frame and interpolate
    this._advanceFrame();

    // Update mesh position/rotation
    if (this._ghostMesh) {
      this._ghostMesh.position.copy(this._interpolatedPosition);
      this._ghostMesh.quaternion.copy(this._interpolatedQuaternion);
    }

    // Calculate time delta if player state provided
    if (playerState) {
      this._calculateTimeDelta(playerState);
    }

    // Update sprites (always face camera)
    this._updateSprites();

    // Handle fade when player passes ghost
    if (this._options.fadeOnPass) {
      this._updateFadeState(playerState);
    }

    // Check for playback completion
    if (this._currentFrameIndex >= this._frames.length - 1) {
      if (this._loopPlayback) {
        this.reset();
        this.start();
      } else {
        this.stop();
        this._onGhostFinished?.(this._ghostData);
        EventBus.emit('ghost:playbackComplete', { type: this._ghostType?.id });
      }
    }
  }

  /**
   * Set the player vehicle reference for position comparison
   * @param {object} vehicle - Player vehicle object with sceneObject
   */
  setPlayerVehicle(vehicle) {
    this._playerVehicle = vehicle;
  }

  /**
   * Set comparison mode
   * @param {string} mode - One of COMPARISON_MODES keys
   */
  setComparisonMode(mode) {
    if (COMPARISON_MODES[mode]) {
      this._comparisonMode = mode;
      
      // Apply mode-specific changes
      switch (mode) {
        case 'ghostOnly':
          // Would follow ghost camera here
          break;
        case 'sideBySide':
          // Would setup split view here
          break;
        case 'overlay':
        default:
          // Default behavior
          break;
      }
      
      EventBus.emit('ghost:modeChanged', { mode });
    }
  }

  /**
   * Get current time delta
   * @returns {number} Time difference in seconds
   */
  getTimeDelta() {
    return this._timeDelta;
  }

  /**
   * Check if player has passed the ghost
   * @returns {boolean}
   */
  hasPlayerPassedGhost() {
    return this._playerPassedGhost;
  }

  /**
   * Set callback for ghost finish
   * @param {function} cb 
   */
  onFinish(cb) {
    this._onGhostFinished = cb;
  }

  /**
   * Clean up all resources
   */
  dispose() {
    this.stop();
    
    if (this._scene && this._ghostMesh) {
      this._scene.remove(this._ghostMesh);
    }
    
    if (this._nameTagSprite) {
      this._nameTagSprite.material.dispose();
      this._nameTagSprite.geometry.dispose();
    }
    
    if (this._timeDeltaSprite) {
      this._timeDeltaSprite.material.dispose();
      this._timeDeltaSprite.geometry.dispose();
    }

    if (this._ghostMesh) {
      this._ghostMesh.geometry.dispose();
      if (Array.isArray(this._ghostMesh.material)) {
        this._ghostMesh.material.forEach(m => m.dispose());
      } else {
        this._ghostMesh.material?.dispose();
      }
    }

    this._scene = null;
    this._ghostMesh = null;
    this._nameTagSprite = null;
    this._timeDeltaSprite = null;
    this._frames = null;
    this._ghostData = null;
  }

  // ==================== PRIVATE METHODS ====================

  _createGhostMesh() {
    // Create a simple car-shaped ghost mesh
    // In production, this would use the actual vehicle model with ghost material
    
    const group = new THREE.Group();

    // Body
    const bodyGeom = new THREE.BoxGeometry(1.8, 0.6, 3.2);
    const ghostMaterial = new THREE.MeshStandardMaterial({
      color: this._ghostType?.color || 0x4488ff,
      transparent: true,
      opacity: this._baseOpacity,
      emissive: this._ghostType?.emissiveColor || 0x2244aa,
      emissiveIntensity: 0.3,
      wireframe: this._ghostType?.wireframe || false,
      depthWrite: false
    });
    const body = new THREE.Mesh(bodyGeom, ghostMaterial);
    body.position.y = 0.5;
    group.add(body);

    // Cabin
    const cabinGeom = new THREE.BoxGeometry(1.4, 0.5, 1.6);
    const cabinMat = ghostMaterial.clone();
    cabinMat.opacity = this._baseOpacity * 0.8;
    const cabin = new THREE.Mesh(cabinGeom, cabinMat);
    cabin.position.y = 0.95;
    cabin.position.z = -0.2;
    group.add(cabin);

    // Wheels (simple cylinders)
    const wheelGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12);
    const wheelMat = new THREE.MeshBasicMaterial({
      color: 0x333333,
      transparent: true,
      opacity: this._baseOpacity * 0.7
    });
    
    const wheelPositions = [
      [-0.85, 0.35, 1.1], [0.85, 0.35, 1.1],
      [-0.85, 0.35, -1.1], [0.85, 0.35, -1.1]
    ];
    
    for (const pos of wheelPositions) {
      const wheel = new THREE.Mesh(wheelGeom, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(...pos);
      group.add(wheel);
    }

    // Initially hidden until data loaded
    group.visible = false;
    
    this._ghostMesh = group;
    this._scene.add(group);
  }

  _createNameTag() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.roundRect(0, 0, 256, 64, 8);
    ctx.fill();
    
    ctx.font = 'bold 24px system-ui';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GHOST', 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
      map: texture, 
      transparent: true,
      depthTest: false
    });
    
    this._nameTagSprite = new THREE.Sprite(material);
    this._nameTagSprite.scale.set(2, 0.5, 1);
    this._nameTagSprite.position.y = 2.5;
    
    if (this._ghostMesh) {
      this._ghostMesh.add(this._nameTagSprite);
    }
  }

  _createTimeDeltaDisplay() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
      map: texture, 
      transparent: true,
      depthTest: false
    });

    this._timeDeltaSprite = new THREE.Sprite(material);
    this._timeDeltaSprite.scale.set(1.2, 0.45, 1);
    this._timeDeltaSprite.position.y = 1.9;
    this._timeDeltaSprite.visible = false;

    if (this._ghostMesh) {
      this._ghostMesh.add(this._timeDeltaSprite);
    }

    // Store context for updates
    this._timeDeltaCanvas = canvas;
    this._timeDeltaCtx = ctx;
    this._timeDeltaTexture = texture;
  }

  _parseFramesArray(floatArray) {
    // Parse Float32Array into structured frames
    // Format: [time, throttle, brake, steer, drift, item, x, y, z, rotX, rotY, rotZ, rotW, ...]
    const FRAME_SIZE = 14; // Adjust based on actual replay format
    const frames = [];
    
    for (let i = 0; i < floatArray.length; i += FRAME_SIZE) {
      if (i + FRAME_SIZE <= floatArray.length) {
        frames.push({
          time: floatArray[i],
          input: {
            throttle: floatArray[i + 1],
            brake: floatArray[i + 2],
            steer: floatArray[i + 3],
            drift: floatArray[i + 4] > 0.5,
            item: floatArray[i + 5] > 0.5
          },
          position: {
            x: floatArray[i + 6],
            y: floatArray[i + 7],
            z: floatArray[i + 8]
          },
          rotation: {
            x: floatArray[i + 9],
            y: floatArray[i + 10],
            z: floatArray[i + 11],
            w: floatArray[i + 12]
          }
        });
      }
    }
    
    return frames;
  }

  _advanceFrame() {
    if (!this._frames || this._frames.length === 0) return;

    // Find surrounding frames for interpolation
    let prevFrame = this._frames[this._currentFrameIndex];
    let nextFrame = this._frames[Math.min(this._currentFrameIndex + 1, this._frames.length - 1)];

    // Advance index if we've passed the current frame
    while (this._currentFrameIndex < this._frames.length - 1 && 
           this._playbackTime >= this._frames[this._currentFrameIndex + 1].time) {
      this._currentFrameIndex++;
    }

    prevFrame = this._frames[this._currentFrameIndex];
    nextFrame = this._frames[Math.min(this._currentFrameIndex + 1, this._frames.length - 1)];

    // Calculate interpolation factor
    const timeRange = nextFrame.time - prevFrame.time;
    const t = timeRange > 0 ? (this._playbackTime - prevFrame.time) / timeRange : 0;

    // Interpolate position
    if (prevFrame.position && nextFrame.position) {
      this._interpolatedPosition.lerpVectors(
        new THREE.Vector3(prevFrame.position.x, prevFrame.position.y || 1, prevFrame.position.z || 0),
        new THREE.Vector3(nextFrame.position.x, nextFrame.position.y || 1, nextFrame.position.z || 0),
        t
      );
    }

    // Interpolate rotation (slerp)
    if (prevFrame.rotation && nextFrame.rotation) {
      const prevQuat = new THREE.Quaternion(prevFrame.rotation.x, prevFrame.rotation.y, prevFrame.rotation.z, prevFrame.rotation.w);
      const nextQuat = new THREE.Quaternion(nextFrame.rotation.x, nextFrame.rotation.y, nextFrame.rotation.z, nextFrame.rotation.w);
      this._interpolatedQuaternion.slerpQuaternions(prevQuat, nextQuat, t);
    }
  }

  _calculateTimeDelta(playerState) {
    if (!playerState || !this._frames || !this._ghostData?.duration) return;

    // Simple delta: compare current times
    // This is a simplified version - full implementation would use checkpoint-based comparison
    const ghostProgress = this._playbackTime / this._ghostData.duration;
    const playerProgress = playerState.raceTime / this._ghostData.duration;
    
    // Approximate time delta (positive = ghost ahead, negative = player ahead)
    this._timeDelta = (ghostProgress - playerProgress) * this._ghostData.duration;
    
    // Update time delta display
    if (this._timeDeltaSprite && Math.abs(this._timeDelta) > 0.1) {
      this._timeDeltaSprite.visible = true;
      this._updateTimeDeltaText();
    } else if (this._timeDeltaSprite) {
      this._timeDeltaSprite.visible = false;
    }
  }

  _updateFadeState(playerState) {
    if (!this._ghostMesh || !playerState || !this._playerVehicle) return;

    const ghostPos = this._interpolatedPosition;
    const playerPos = this._playerVehicle.sceneObject?.position;
    
    if (!playerPos) return;

    // Check if player has passed ghost (simplified: check Z progress)
    const ghostProgress = this._playbackTime;
    const playerProgress = playerState.raceTime || 0;
    
    const wasBehind = !this._playerPassedGhost;
    this._playerPassedGhost = playerProgress < ghostProgress - 0.5; // Player is significantly ahead
    
    // Fade ghost when passed
    if (this._playerPassedGhost) {
      const targetOpacity = 0.2;
      this._ghostMesh.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.opacity = THREE.MathUtils.lerp(child.material.opacity, targetOpacity, 0.05);
        }
      });
    } else {
      // Restore normal opacity
      this._ghostMesh.traverse((child) => {
        if (child.isMesh && child.material) {
          child.material.opacity = THREE.MathUtils.lerp(child.material.opacity, this._baseOpacity, 0.05);
        }
      });
    }
  }

  _updateSprites() {
    // Sprites automatically face camera in Three.js
    // Just ensure they're positioned correctly relative to ghost
  }

  _updateGhostAppearance() {
    if (!this._ghostMesh || !this._ghostType) return;

    this._baseOpacity = this._ghostType.opacity;

    this._ghostMesh.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.color.setHex(this._ghostType.color);
        child.material.emissive?.setHex(this._ghostType.emissiveColor);
        child.material.opacity = this._baseOpacity;
        child.material.wireframe = this._ghostType.wireframe;
      }
    });
  }

  _updateNameTagText(text) {
    if (!this._nameTagSprite) return;
    
    // Note: In production, would need to recreate canvas texture
    // For now, just log it
    console.log(`[GhostVisualizer] Name tag: ${text}`);
  }

  _updateTimeDeltaText() {
    if (!this._timeDeltaCtx || !this._timeDeltaTexture) return;

    const ctx = this._timeDeltaCtx;
    const canvas = this._timeDeltaCanvas;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = this._timeDelta > 0 ? 'rgba(255, 100, 100, 0.8)' : 'rgba(100, 255, 100, 0.8)';
    ctx.roundRect(0, 0, canvas.width, canvas.height, 6);
    ctx.fill();

    // Text
    ctx.font = 'bold 22px system-ui';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const sign = this._timeDelta > 0 ? '+' : '';
    ctx.fillText(`${sign}${this._timeDelta.toFixed(1)}s`, canvas.width / 2, canvas.height / 2);

    this._timeDeltaTexture.needsUpdate = true;
  }
}

// Export singleton and class
export const ghostVisualizer = new GhostVisualizer();
export default ghostVisualizer;
export { GHOST_TYPES, COMPARISON_MODES };
