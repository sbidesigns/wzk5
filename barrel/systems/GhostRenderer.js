// barrel/systems/GhostRenderer.js
// 3D Ghost visualization for Time Trial mode
// Renders semi-transparent ghost vehicles following recorded frames with
// frame interpolation, multiple ghost support, color coding, name tags,
// comparison HUD, and trail effects.

import * as THREE from 'three';
import { EventBus } from '../../core/EventBus.js';

/**
 * Ghost type definitions with visual properties
 * @enum {Object}
 */
export const GhostType = {
  PERSONAL_BEST: {
    id: 'personalBest',
    name: 'Personal Best',
    color: 0x00ffff,       // Cyan
    emissiveColor: 0x0088aa,
    opacity: 0.55,
    trailColor: 0x00aaaa
  },
  FRIEND: {
    id: 'friend',
    name: "Friend's Ghost",
    color: 0xffd700,       // Gold
    emissiveColor: 0xaa8800,
    opacity: 0.5,
    trailColor: 0xccaa00
  },
  WORLD_RECORD: {
    id: 'worldRecord',
    name: 'World Record',
    color: 0xff4444,       // Red
    emissiveColor: 0xaa2222,
    opacity: 0.6,
    trailColor: 0xcc3333
  },
  DEV: {
    id: 'dev',
    name: 'Developer Ghost',
    color: 0xff44ff,       // Magenta
    emissiveColor: 0xaa22aa,
    opacity: 0.45,
    wireframe: true,
    trailColor: 0xcc22cc
  }
};

/**
 * Configuration options for GhostRenderer
 * @typedef {Object} GhostRendererOptions
 * @property {number} [maxGhosts=4] - Maximum simultaneous ghosts
 * @property {boolean} [showNameTags=true] - Show floating name tags
 * @property {boolean} [showTrail=true] - Show path trail effect
 * @property {number} [trailLength=50] - Number of trail points
 * @property {boolean} [showComparisonHUD=true] - Show ahead/behind indicator
 * @property {number} [baseOpacity=0.5] - Default ghost opacity
 */

/**
 * Ghost data structure for loading
 * @typedef {Object} GhostData
 * @property {string} trackId - Track identifier
 * @property {string} vehicleId - Vehicle used for this run
 * @property {Float32Array|Array} frames - Frame data array
 * @property {number} duration - Total replay duration in seconds
 * @property {number} lapTime - Final lap time
 * @property {string} playerName - Name of ghost owner
 * @property {Date} date - When ghost was recorded
 */

/**
 * Individual ghost instance state
 * @typedef {Object} GhostInstance
 * @property {string} id - Unique instance ID
 * @property {GhostType} type - Ghost type configuration
 * @property {GhostData} data - Loaded ghost data
 * @property {THREE.Group} mesh - 3D mesh group
 * @property {THREE.Sprite} nameTag - Floating name tag sprite
 * @property {THREE.Sprite} deltaDisplay - Time delta display sprite
 * @property {THREE.Line} trail - Trail line geometry
 * @property {Array} trailPositions - Trail position history
 * @property {number} currentFrameIndex - Current playback frame
 * @property {number} playbackTime - Current playback time
 * @property {boolean} isActive - Whether ghost is currently visible
 * @property {number} timeDelta - Time difference to player (positive = ahead)
 */

/**
 * GhostRenderer - Manages 3D visualization of ghost vehicles in Time Trial mode.
 * Supports multiple simultaneous ghosts with different colors, smooth interpolation,
 * floating UI elements, and comparison features.
 * 
 * @example
 * const renderer = new GhostRenderer(scene, camera);
 * renderer.loadGhost(ghostData, GhostType.PERSONAL_BEST);
 * renderer.start();
 * // In game loop:
 * renderer.update(deltaTime, playerState);
 */
class GhostRenderer {
  /**
   * Create a new GhostRenderer instance
   * @param {THREE.Scene} scene - The Three.js scene to render ghosts into
   * @param {THREE.Camera} camera - Active camera for billboard calculations
   * @param {GhostRendererOptions} options - Configuration options
   */
  constructor(scene, camera, options = {}) {
    /**
     * Three.js scene reference
     * @type {THREE.Scene}
     * @private
     */
    this._scene = scene;

    /**
     * Camera reference for sprite orientation
     * @type {THREE.Camera}
     * @private
     */
    this._camera = camera;

    /**
     * Configuration options
     * @type {GhostRendererOptions}
     * @private
     */
    this._options = {
      maxGhosts: 4,
      showNameTags: true,
      showTrail: true,
      trailLength: 50,
      showComparisonHUD: true,
      baseOpacity: 0.5,
      ...options
    };

    /**
     * Map of active ghost instances keyed by ID
     * @type {Map<string, GhostInstance>}
     * @private
     */
    this._ghosts = new Map();

    /**
     * Counter for generating unique IDs
     * @type {number}
     * @private
     */
    this._idCounter = 0;

    /**
     * Whether any ghosts are currently playing
     * @type {boolean}
     * @private
     */
    this._isPlaying = false;

    /**
     * Interpolation vectors (reused to avoid GC)
     * @type {Object}
     * @private
     */
    this._interpolatedPosition = new THREE.Vector3();
    this._interpolatedQuaternion = new THREE.Quaternion();

    /**
     * Player vehicle reference for comparison
     * @type {Object|null}
     * @private
     */
    this._playerVehicle = null;

    /**
     * Callback when a ghost finishes its playback
     * @type {Function|null}
     * @private
     */
    this._onGhostComplete = null;

    console.log('[GhostRenderer] Initialized with max ghosts:', this._options.maxGhosts);
  }

  /**
   * Load a ghost from data and create its 3D representation
   * 
   * @param {GhostData} ghostData - The ghost data containing frames and metadata
   * @param {GhostType|string} ghostType - Type of ghost or GhostType enum value
   * @returns {string|null} The ghost instance ID, or null if loading failed
   * 
   * @example
   * const ghostId = renderer.loadGhost(myReplayData, GhostType.PERSONAL_BEST);
   */
  loadGhost(ghostData, ghostType = GhostType.PERSONAL_BEST) {
    // Validate input data
    if (!ghostData || !ghostData.frames) {
      console.warn('[GhostRenderer] Invalid ghost data provided');
      return null;
    }

    // Resolve ghost type
    const typeConfig = typeof ghostType === 'string' 
      ? Object.values(GhostType).find(t => t.id === ghostType) || GhostType.PERSONAL_BEST
      : ghostType;

    // Check capacity
    if (this._ghosts.size >= this._options.maxGhosts) {
      console.warn('[GhostRenderer] Maximum ghost limit reached');
      return null;
    }

    // Generate unique ID
    const id = `ghost_${++this._idCounter}_${Date.now()}`;

    // Parse frames into structured format
    const parsedFrames = this._parseFrames(ghostData.frames);

    if (!parsedFrames || parsedFrames.length === 0) {
      console.warn('[GhostRenderer] No valid frames in ghost data');
      return null;
    }

    // Create 3D mesh
    const mesh = this._createGhostMesh(typeConfig);

    // Create name tag if enabled
    let nameTag = null;
    if (this._options.showNameTags) {
      nameTag = this._createNameTag(
        ghostData.playerName || typeConfig.name,
        typeConfig.color
      );
      mesh.add(nameTag);
    }

    // Create delta display if enabled
    let deltaDisplay = null;
    if (this._options.showComparisonHUD) {
      deltaDisplay = this._createDeltaDisplay();
      deltaDisplay.visible = false;
      mesh.add(deltaDisplay);
    }

    // Create trail line if enabled
    let trail = null;
    const trailPositions = [];
    if (this._options.showTrail) {
      const trailGeometry = new THREE.BufferGeometry();
      const positions = new Float32Array(this._options.trailLength * 3);
      trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      trailGeometry.setDrawRange(0, 0);

      const trailMaterial = new THREE.LineBasicMaterial({
        color: typeConfig.trailColor,
        transparent: true,
        opacity: 0.4,
        linewidth: 2
      });

      trail = new THREE.Line(trailGeometry, trailMaterial);
      this._scene.add(trail);
    }

    // Add mesh to scene
    mesh.visible = false;
    this._scene.add(mesh);

    // Create ghost instance
    const instance = {
      id,
      type: typeConfig,
      data: {
        ...ghostData,
        parsedFrames,
        duration: ghostData.duration || parsedFrames[parsedFrames.length - 1]?.time || 0
      },
      mesh,
      nameTag,
      deltaDisplay,
      trail,
      trailPositions,
      currentFrameIndex: 0,
      playbackTime: 0,
      isActive: false,
      timeDelta: 0
    };

    this._ghosts.set(id, instance);

    console.log(`[GhostRenderer] Loaded ghost "${instance.type.name}" (${id}): ${parsedFrames.length} frames, ${instance.data.duration.toFixed(2)}s`);

    EventBus.emit('ghost:loaded', { id, type: typeConfig.id, name: instance.type.name });

    return id;
  }

  /**
   * Remove a specific ghost by ID
   * 
   * @param {string} ghostId - The ghost instance ID to remove
   * @returns {boolean} True if ghost was found and removed
   */
  removeGhost(ghostId) {
    const ghost = this._ghosts.get(ghostId);
    if (!ghost) return false;

    // Dispose of 3D resources
    this._disposeGhostResources(ghost);

    // Remove from map
    this._ghosts.delete(ghostId);

    console.log(`[GhostRenderer] Removed ghost: ${ghostId}`);
    EventBus.emit('ghost:removed', { id: ghostId });

    return true;
  }

  /**
   * Start playback of all loaded ghosts
   */
  start() {
    if (this._ghosts.size === 0) {
      console.warn('[GhostRenderer] No ghosts loaded');
      return;
    }

    this._isPlaying = true;

    // Activate all ghosts
    for (const [, ghost] of this._ghosts) {
      ghost.isActive = true;
      ghost.mesh.visible = true;
      ghost.currentFrameIndex = 0;
      ghost.playbackTime = 0;
      
      // Reset trail
      if (ghost.trailPositions) {
        ghost.trailPositions.length = 0;
      }
    }

    console.log(`[GhostRenderer] Started playback with ${this._ghosts.size} ghosts`);
    EventBus.emit('ghost:playbackStarted', { count: this._ghosts.size });
  }

  /**
   * Stop all ghost playback
   */
  stop() {
    this._isPlaying = false;

    for (const [, ghost] of this._ghosts) {
      ghost.isActive = false;
      ghost.mesh.visible = false;
    }

    EventBus.emit('ghost:playbackStopped');
  }

  /**
   * Reset all ghosts to beginning of their recordings
   */
  reset() {
    for (const [, ghost] of this._ghosts) {
      ghost.currentFrameIndex = 0;
      ghost.playbackTime = 0;
      ghost.timeDelta = 0;
      ghost.trailPositions?.splice(0);

      // Reset position to first frame
      const firstFrame = ghost.data.parsedFrames[0];
      if (firstFrame?.position) {
        ghost.mesh.position.set(
          firstFrame.position.x,
          firstFrame.position.y ?? 1,
          firstFrame.position.z ?? 0
        );
      }
    }
  }

  /**
   * Main update loop - call every frame during gameplay
   * 
   * @param {number} dt - Delta time in seconds since last update
   * @param {Object} [playerState=null] - Current player state for comparison
   * @param {THREE.Vector3} [playerPosition=null] - Player's world position
   */
  update(dt, playerState = null, playerPosition = null) {
    if (!this._isPlaying) return;

    for (const [, ghost] of this._ghosts) {
      if (!ghost.isActive) continue;

      const frames = ghost.data.parsedFrames;
      if (!frames || frames.length === 0) continue;

      // Advance playback time
      ghost.playbackTime += dt;

      // Find and interpolate current frame
      this._advanceGhostFrame(ghost, frames);

      // Update mesh transform
      ghost.mesh.position.copy(this._interpolatedPosition);
      ghost.mesh.quaternion.copy(this._interpolatedQuaternion);

      // Update trail
      if (ghost.trail && this._options.showTrail) {
        this._updateTrail(ghost);
      }

      // Calculate time delta if player state available
      if (playerState || playerPosition) {
        this._calculateTimeDelta(ghost, playerState, playerPosition);
      }

      // Update sprites to face camera
      this._updateSpriteOrientation(ghost);

      // Check for completion
      if (ghost.currentFrameIndex >= frames.length - 1) {
        ghost.isActive = false;
        ghost.mesh.visible = false;
        
        this._onGhostComplete?.(ghost);
        EventBus.emit('ghost:playbackComplete', { 
          id: ghost.id, 
          type: ghost.type.id,
          duration: ghost.data.duration 
        });
      }
    }
  }

  /**
   * Set visibility of a specific ghost or all ghosts
   * 
   * @param {boolean} visible - Whether ghosts should be visible
   * @param {string} [ghostId] - Specific ghost ID, or omit for all
   */
  setVisibility(visible, ghostId = null) {
    if (ghostId) {
      const ghost = this._ghosts.get(ghostId);
      if (ghost) {
        ghost.mesh.visible = visible && ghost.isActive;
        if (ghost.trail) ghost.trail.visible = visible;
      }
    } else {
      for (const [, ghost] of this._ghosts) {
        ghost.mesh.visible = visible && ghost.isActive;
        if (ghost.trail) ghost.trail.visible = visible;
      }
    }
  }

  /**
   * Change the color of a specific ghost
   * 
   * @param {string} ghostId - Ghost instance ID
   * @param {number} color - New color as hex value (e.g., 0xff0000)
   */
  setColor(ghostId, color) {
    const ghost = this._ghosts.get(ghostId);
    if (!ghost) return;

    ghost.mesh.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material.color.setHex(color);
      }
    });

    // Update trail color
    if (ghost.trail?.material) {
      ghost.trail.material.color.setHex(color);
    }

    EventBus.emit('ghost:colorChanged', { id: ghostId, color });
  }

  /**
   * Set the player vehicle reference for comparison calculations
   * 
   * @param {Object} vehicle - Player vehicle object with sceneObject
   */
  setPlayerVehicle(vehicle) {
    this._playerVehicle = vehicle;
  }

  /**
   * Get current time delta for a specific ghost
   * 
   * @param {string} ghostId - Ghost instance ID
   * @returns {number} Time difference in seconds (positive = ghost ahead)
   */
  getTimeDelta(ghostId) {
    const ghost = this._ghosts.get(ghostId);
    return ghost?.timeDelta ?? 0;
  }

  /**
   * Get all active ghost IDs
   * 
   * @returns {Array<string>} Array of ghost instance IDs
   */
  getActiveGhostIds() {
    const ids = [];
    for (const [id, ghost] of this._ghosts) {
      if (ghost.isActive) ids.push(id);
    }
    return ids;
  }

  /**
   * Get ghost count information
   * 
   * @returns {{ total: number, active: number }}
   */
  getCounts() {
    let active = 0;
    for (const [, ghost] of this._ghosts) {
      if (ghost.isActive) active++;
    }
    return { total: this._ghosts.size, active };
  }

  /**
   * Set callback for when a ghost completes playback
   * 
   * @param {Function} callback - Called with ghost instance as argument
   */
  onGhostComplete(callback) {
    this._onGhostComplete = callback;
  }

  /**
   * Clean up all resources and remove from scene
   */
  dispose() {
    this.stop();

    for (const [id, ghost] of this._ghosts) {
      this._disposeGhostResources(ghost);
    }

    this._ghosts.clear();
    this._scene = null;
    this._camera = null;

    console.log('[GhostRenderer] Disposed');
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Parse raw frame data into structured format
   * @private
   * @param {Float32Array|Array} rawData - Raw frame data
   * @returns {Array<Object>} Parsed frame objects
   */
  _parseFrames(rawData) {
    const frames = [];

    // Handle different input formats
    if (rawData instanceof Float32Array) {
      // Compact format: [time, throttle, brake, steer, drift, item, x, y, z, qx, qy, qz, qw, ...]
      const FRAME_SIZE = 14;
      for (let i = 0; i < rawData.length; i += FRAME_SIZE) {
        if (i + FRAME_SIZE <= rawData.length) {
          frames.push({
            time: rawData[i],
            input: {
              throttle: rawData[i + 1],
              brake: rawData[i + 2],
              steer: rawData[i + 3],
              drift: rawData[i + 4] > 0.5,
              item: rawData[i + 5] > 0.5
            },
            position: {
              x: rawData[i + 6],
              y: rawData[i + 7] ?? 1,
              z: rawData[i + 8] ?? 0
            },
            rotation: {
              x: rawData[i + 9] ?? 0,
              y: rawData[i + 10] ?? 0,
              z: rawData[i + 11] ?? 0,
              w: rawData[i + 12] ?? 1
            }
          });
        }
      }
    } else if (Array.isArray(rawData)) {
      // Already structured format
      frames.push(...rawData);
    }

    return frames;
  }

  /**
   * Create the 3D mesh for a ghost vehicle
   * @private
   * @param {Object} typeConfig - Ghost type configuration
   * @returns {THREE.Group} Mesh group
   */
  _createGhostMesh(typeConfig) {
    const group = new THREE.Group();

    // Main body
    const bodyGeom = new THREE.BoxGeometry(1.8, 0.6, 3.2);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: typeConfig.color,
      transparent: true,
      opacity: typeConfig.opacity || this._options.baseOpacity,
      emissive: typeConfig.emissiveColor || 0x000000,
      emissiveIntensity: 0.25,
      wireframe: typeConfig.wireframe || false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.5;
    body.castShadow = false;
    body.receiveShadow = false;
    group.add(body);

    // Cabin
    const cabinGeom = new THREE.BoxGeometry(1.4, 0.5, 1.6);
    const cabinMat = bodyMat.clone();
    cabinMat.opacity = (typeConfig.opacity || this._options.baseOpacity) * 0.85;
    const cabin = new THREE.Mesh(cabinGeom, cabinMat);
    cabin.position.y = 0.95;
    cabin.position.z = -0.2;
    group.add(cabin);

    // Wheels
    const wheelGeom = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 12);
    const wheelMat = new THREE.MeshBasicMaterial({
      color: 0x222222,
      transparent: true,
      opacity: (typeConfig.opacity || this._options.baseOpacity) * 0.7
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

    // Glow effect (slightly larger transparent shell)
    const glowGeom = new THREE.BoxGeometry(2.0, 0.8, 3.6);
    const glowMat = new THREE.MeshBasicMaterial({
      color: typeConfig.color,
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide
    });
    const glow = new THREE.Mesh(glowGeom, glowMat);
    glow.position.y = 0.5;
    group.add(glow);

    return group;
  }

  /**
   * Create floating name tag sprite
   * @private
   * @param {string} text - Display text
   * @param {number} color - Text/accent color
   * @returns {THREE.Sprite} Name tag sprite
   */
  _createNameTag(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 56, 8);
    ctx.fill();

    // Border accent
    const colorStr = '#' + color.toString(16).padStart(6, '0');
    ctx.strokeStyle = colorStr;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(4, 4, 248, 56, 8);
    ctx.stroke();

    // Text
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.substring(0, 18), 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.2, 0.55, 1);
    sprite.position.y = 2.8;

    return sprite;
  }

  /**
   * Create time delta display sprite
   * @private
   * @returns {THREE.Sprite} Delta display sprite
   */
  _createDeltaDisplay() {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.3, 0.48, 1);
    sprite.position.y = 2.1;

    // Store references for updating
    sprite.userData.canvas = canvas;
    sprite.userData.ctx = ctx;
    sprite.userData.texture = texture;

    return sprite;
  }

  /**
   * Advance ghost frame and interpolate position/rotation
   * @private
   * @param {GhostInstance} ghost - Ghost instance
   * @param {Array} frames - Parsed frames array
   */
  _advanceGhostFrame(ghost, frames) {
    // Find surrounding frames for interpolation
    while (
      ghost.currentFrameIndex < frames.length - 1 &&
      ghost.playbackTime >= frames[ghost.currentFrameIndex + 1].time
    ) {
      ghost.currentFrameIndex++;
    }

    const prevFrame = frames[ghost.currentFrameIndex];
    const nextFrame = frames[Math.min(ghost.currentFrameIndex + 1, frames.length - 1)];

    if (!prevFrame || !nextFrame) return;

    // Calculate interpolation factor
    const timeRange = nextFrame.time - prevFrame.time;
    const t = timeRange > 0.001 ? (ghost.playbackTime - prevFrame.time) / timeRange : 0;

    // Clamp interpolation factor
    const clampedT = Math.max(0, Math.min(1, t));

    // Interpolate position
    if (prevFrame.position && nextFrame.position) {
      this._interpolatedPosition.set(
        prevFrame.position.x + (nextFrame.position.x - prevFrame.position.x) * clampedT,
        (prevFrame.position.y ?? 1) + ((nextFrame.position.y ?? 1) - (prevFrame.position.y ?? 1)) * clampedT,
        (prevFrame.position.z ?? 0) + ((nextFrame.position.z ?? 0) - (prevFrame.position.z ?? 0)) * clampedT
      );
    }

    // Interpolate rotation using slerp
    if (prevFrame.rotation && nextFrame.rotation) {
      const prevQuat = new THREE.Quaternion(
        prevFrame.rotation.x ?? 0,
        prevFrame.rotation.y ?? 0,
        prevFrame.rotation.z ?? 0,
        prevFrame.rotation.w ?? 1
      );
      const nextQuat = new THREE.Quaternion(
        nextFrame.rotation.x ?? 0,
        nextFrame.rotation.y ?? 0,
        nextFrame.rotation.z ?? 0,
        nextFrame.rotation.w ?? 1
      );
      this._interpolatedQuaternion.slerpQuaternions(prevQuat, nextQuat, clampedT);
    }
  }

  /**
   * Update trail effect for a ghost
   * @private
   * @param {GhostInstance} ghost - Ghost instance
   */
  _updateTrail(ghost) {
    if (!ghost.trail) return;

    // Add current position to trail
    ghost.trailPositions.push(ghost.mesh.position.clone());

    // Limit trail length
    while (ghost.trailPositions.length > this._options.trailLength) {
      ghost.trailPositions.shift();
    }

    // Update geometry
    const positions = ghost.trail.geometry.attributes.position.array;
    for (let i = 0; i < ghost.trailPositions.length; i++) {
      positions[i * 3] = ghost.trailPositions[i].x;
      positions[i * 3 + 1] = ghost.trailPositions[i].y;
      positions[i * 3 + 2] = ghost.trailPositions[i].z;
    }

    ghost.trail.geometry.attributes.position.needsUpdate = true;
    ghost.trail.geometry.setDrawRange(0, ghost.trailPositions.length);

    // Fade trail based on distance from ghost
    if (ghost.trail.material) {
      ghost.trail.material.opacity = 0.35 * (ghost.trailPositions.length / this._options.trailLength);
    }
  }

  /**
   * Calculate time delta between player and ghost
   * @private
   * @param {GhostInstance} ghost - Ghost instance
   * @param {Object} playerState - Player state
   * @param {THREE.Vector3} playerPos - Player position
   */
  _calculateTimeDelta(ghost, playerState, playerPos) {
    if (!ghost.data.duration || ghost.data.duration <= 0) return;

    // Calculate progress-based delta
    const ghostProgress = ghost.playbackTime / ghost.data.duration;
    const playerProgress = playerState?.raceTime 
      ? playerState.raceTime / ghost.data.duration 
      : 0;

    // Delta: positive means ghost is ahead (further along), negative means player is ahead
    ghost.timeDelta = (ghostProgress - playerProgress) * ghost.data.duration;

    // Update delta display sprite
    if (ghost.deltaDisplay && Math.abs(ghost.timeDelta) > 0.05) {
      ghost.deltaDisplay.visible = true;
      this._updateDeltaDisplayText(ghost);
    } else if (ghost.deltaDisplay) {
      ghost.deltaDisplay.visible = false;
    }

    // Emit delta event for external HUD
    EventBus.emit('ghost:timeDelta', {
      id: ghost.id,
      delta: ghost.timeDelta,
      type: ghost.type.id
    });
  }

  /**
   * Update the delta display sprite text
   * @private
   * @param {GhostInstance} ghost - Ghost instance
   */
  _updateDeltaDisplayText(ghost) {
    const sprite = ghost.deltaDisplay;
    if (!sprite?.userData?.ctx) return;

    const ctx = sprite.userData.ctx;
    const canvas = sprite.userData.canvas;
    const delta = ghost.timeDelta;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background color based on ahead/behind
    const isAhead = delta > 0;
    ctx.fillStyle = isAhead ? 'rgba(255, 80, 80, 0.85)' : 'rgba(80, 255, 120, 0.85)';
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, 6);
    ctx.fill();

    // Text
    ctx.font = 'bold 20px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const sign = isAhead ? '+' : '';
    ctx.fillText(`${sign}${delta.toFixed(2)}s`, canvas.width / 2, canvas.height / 2);

    // Mark texture for update
    sprite.userData.texture.needsUpdate = true;
  }

  /**
   * Make sprites face the camera (billboard effect)
   * @private
   * @param {GhostInstance} ghost - Ghost instance
   */
  _updateSpriteOrientation(ghost) {
    // Three.js sprites automatically face camera by default
    // This method can be extended for custom behavior
  }

  /**
   * Dispose of all 3D resources for a ghost instance
   * @private
   * @param {GhostInstance} ghost - Ghost instance to dispose
   */
  _disposeGhostResources(ghost) {
    // Remove mesh from scene
    if (this._scene && ghost.mesh) {
      this._scene.remove(ghost.mesh);
    }

    // Remove trail from scene
    if (this._scene && ghost.trail) {
      this._scene.remove(ghost.trail);
    }

    // Dispose geometries and materials
    ghost.mesh?.traverse((child) => {
      if (child.isMesh) {
        child.geometry?.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      }
    });

    // Dispose trail
    ghost.trail?.geometry?.dispose();
    ghost.trail?.material?.dispose();

    // Dispose sprites
    if (ghost.nameTag) {
      ghost.nameTag.material?.map?.dispose();
      ghost.nameTag.material?.dispose();
    }

    if (ghost.deltaDisplay) {
      ghost.deltaDisplay.material?.map?.dispose();
      ghost.deltaDisplay.material?.dispose();
    }
  }
}

// Export class and singleton factory
export default GhostRenderer;
export { GhostRenderer };
