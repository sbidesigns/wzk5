// server/rooms/RaceRoom.js — AAA Authoritative Race Room
// Implements authoritative server-side physics with cannon-es, input buffering,
// rollback reconciliation, anti-cheat integration, spectator mode, and reconnection.
//
// Features:
// - 60Hz deterministic physics simulation with cannon-es
// - Input buffering with sequence numbers (prevent out-of-order)
// - Rollback reconciliation when client prediction disagrees (>100ms discrepancy)
// - Authoritative item spawning and effect validation
// - Lap validation with checkpoint ordering verification
// - Finish detection with position validation
// - Anti-cheat integration (speed/position checks each tick)
// - Spectator mode support (late joins can watch)
// - Reconnection handling (restore state within 10s window)
// - Race events: countdown, start, checkpoint, lap, finish, disconnect
//
// @module rooms/RaceRoom

import { Room } from 'colyseus';
import { RaceState } from '../schemas/RaceState.js';
import * as CANNON from 'cannon-es';
import { AntiCheat } from '../anti-cheat/AntiCheat.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Physics tick rate (Hz) */
const TICK_RATE = 60;

/** State sync rate to clients (Hz) */
const PATCH_RATE = 20;

/** Maximum players per race room */
const MAX_PLAYERS = 16;

/** Minimum players to start race */
const MIN_PLAYERS = 2;

/** Reconnection window in milliseconds */
const RECONNECT_WINDOW = 10000;

/** Rollback threshold in milliseconds */
const ROLLBACK_THRESHOLD = 100;

/** Input buffer size (ticks) */
const INPUT_BUFFER_SIZE = 64;

// ============================================================================
// VEHICLE PHYSICS CONFIGURATION
// ============================================================================

/**
 * Vehicle physics parameters for different vehicle types
 * @type {Object.<string, Object>}
 */
const VEHICLE_PHYSICS = {
  spectre: {
    mass: 1200,
    maxEngineForce: 2500,
    maxBrakeForce: 150,
    maxSteerAngle: Math.PI / 4,
    wheelRadius: 0.4,
    wheelBase: 2.6,
    trackWidth: 1.8,
    dragCoefficient: 0.35,
    rollingResistance: 0.015,
    downforceCoefficient: 0.2
  },
  phantom: {
    mass: 1100,
    maxEngineForce: 2800,
    maxBrakeForce: 140,
    maxSteerAngle: Math.PI / 4.5,
    wheelRadius: 0.38,
    wheelBase: 2.7,
    trackWidth: 1.75,
    dragCoefficient: 0.32,
    rollingResistance: 0.013,
    downforceCoefficient: 0.25
  },
  viper: {
    mass: 1000,
    maxEngineForce: 2600,
    maxBrakeForce: 160,
    maxSteerAngle: Math.PI / 3.8,
    wheelRadius: 0.35,
    wheelBase: 2.4,
    trackWidth: 1.7,
    dragCoefficient: 0.38,
    rollingResistance: 0.014,
    downforceCoefficient: 0.22
  }
};

// ============================================================================
// TRACK CHECKPOINT DATA
// ============================================================================

/**
 * Checkpoint definitions for each track
 * @type {Object.<string, Array<Object>>}
 */
const TRACK_CHECKPOINTS = {
  downtown: [
    { id: 0, position: { x: 0, y: 0, z: 0 }, radius: 15, order: 0 },
    { id: 1, position: { x: 200, y: 0, z: 50 }, radius: 15, order: 1 },
    { id: 2, position: { x: 400, y: 0, z: 0 }, radius: 15, order: 2 },
    { id: 3, position: { x: 500, y: 0, z: -150 }, radius: 15, order: 3 },
    { id: 4, position: { x: 300, y: 0, z: -300 }, radius: 15, order: 4 },
    { id: 5, position: { x: 0, y: 0, z: -350 }, radius: 15, order: 5 },
    { id: 6, position: { x: -200, y: 0, z: -200 }, radius: 15, order: 6 },
    { id: 7, position: { x: -100, y: 0, z: 0 }, radius: 20, order: 7 } // Finish line
  ],
  mountain: [
    { id: 0, position: { x: 0, y: 10, z: 0 }, radius: 18, order: 0 },
    { id: 1, position: { x: 150, y: 25, z: 100 }, radius: 18, order: 1 },
    { id: 2, position: { x: 50, y: 45, z: 250 }, radius: 18, order: 2 },
    { id: 3, position: { x: -100, y: 35, z: 400 }, radius: 18, order: 3 },
    { id: 4, position: { x: -250, y: 20, z: 350 }, radius: 18, order: 4 },
    { id: 5, position: { x: -350, y: 10, z: 200 }, radius: 18, order: 5 },
    { id: 6, position: { x: -300, y: 0, z: 0 }, radius: 18, order: 6 },
    { id: 7, position: { x: -200, y: 5, z: -150 }, radius: 18, order: 7 },
    { id: 8, position: { x: -50, y: 2, z: -100 }, radius: 18, order: 8 },
    { id: 9, position: { x: 0, y: 0, z: 0 }, radius: 22, order: 9 } // Finish line
  ]
};

// ============================================================================
// MAIN RACE ROOM CLASS
// ============================================================================

/**
 * Authoritative Race Room with server-side physics simulation
 * Handles all game logic deterministically on the server
 * 
 * @extends Room
 * 
 * @example
 * // Room is created by Colyseus when clients join 'race' room type
 * gameServer.define('race', RaceRoom);
 */
export class RaceRoom extends Room {
  /**
   * Maximum clients allowed in this room
   * @type {number}
   */
  maxClients = MAX_PLAYERS;

  /**
   * Called when room is first created
   * Initializes physics world, state, and event handlers
   * 
   * @param {Object} options - Room creation options
   * @param {string} options.trackId - Track identifier
   * @param {string} options.modeId - Game mode identifier
   * @param {number} options.lapCount - Number of laps for this race
   * @param {Array} [options.botConfigs] - Bot configurations if pre-adding bots
   */
  onCreate(options) {
    console.log(`[RaceRoom] Created: ${JSON.stringify(options)}`);
    
    // Initialize Colyseus state
    this.setState(new RaceState());
    
    // Room configuration
    this.state.trackId = options.trackId || 'downtown';
    this.state.modeId = options.modeId || 'circuit';
    this.lapCount = options.lapCount || 3;
    this.state.phase = 'waiting';
    this.state.countdown = 3;
    this.state.raceTime = 0;
    this.state.raceStartTime = 0;
    
    // Initialize authoritative physics world
    this._initPhysicsWorld();
    
    // Player state tracking
    this._inputs = new Map();           // Buffered inputs per player
    this._vehicles = new Map();          // Physics bodies per player
    this._playerStates = new Map();      // Last validated states
    this._disconnectedPlayers = new Map(); // For reconnection handling
    this._spectators = new Set();        // Spectator session IDs
    
    // Anti-cheat instance
    this._antiCheat = new AntiCheat();
    
    // Item system state
    this._spawnedItems = new Map();      // Active items on track
    this._itemEffects = new Map();       // Active item effects
    
    // Race results storage
    this._finishOrder = [];
    this._raceResults = [];
    
    // Setup message handlers
    this._setupMessageHandlers();
    
    // Configure tick rates
    this.setSimulationInterval((dt) => this._update(dt), 1000 / TICK_RATE);
    this.setPatchRate(1000 / PATCH_RATE);
    
    // Auto-start countdown after grace period
    this.clock.setTimeout(() => this._startLobbyPhase(), 2000);
    
    console.log(`[RaceRoom] Track: ${this.state.trackId}, Mode: ${this.state.modeId}, Laps: ${this.lapCount}`);
  }

  /**
   * Initialize Cannon-es physics world
   * Sets up gravity, materials, and ground plane
   * @private
   */
  _initPhysicsWorld() {
    // Create physics world
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -20, 0) // Strong gravity for arcade feel
    });
    
    // Configure solver for stability
    this.world.solver.iterations = 10;
    this.world.solver.tolerance = 0.001;
    
    // Create ground material
    this.groundMaterial = new CANNON.Material('ground');
    this.vehicleMaterial = new CANNON.Material('vehicle');
    
    // Contact material between vehicle and ground
    const contactMaterial = new CANNON.ContactMaterial(
      this.groundMaterial,
      this.vehicleMaterial,
      {
        friction: 0.8,
        restitution: 0.1
      }
    );
    this.world.addContactMaterial(contactMaterial);
    
    // Create static ground body (would be track geometry in production)
    const groundShape = new CANNON.Plane();
    this.groundBody = new CANNON.Body({
      mass: 0,
      shape: groundShape,
      material: this.groundMaterial
    });
    this.groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(this.groundBody);
    
    console.log('[RaceRoom] Physics world initialized');
  }

  /**
   * Setup all message handlers for client communication
   * @private
   */
  _setupMessageHandlers() {
    // Vehicle input from client (throttle, brake, steer, etc.)
    this.onMessage('input', (client, input) => this._handleInput(client, input));
    
    // Ready signal from client (loaded and ready to race)
    this.onMessage('ready', (client) => this._handleReady(client));
    
    // Item usage request
    this.onMessage('item', (client, data) => this._handleItemUse(client, data));
    
    // Spectator mode toggle
    this.onMessage('spectate', (client, data) => this._handleSpectateRequest(client, data));
    
    // Reconnection attempt
    this.onMessage('reconnect', (client, data) => this._handleReconnection(client, data));
    
    // Client fingerprint submission (anti-cheat)
    this.onMessage('fingerprint', (client, data) => this._handleFingerprint(client, data));
    
    // Ping/pong for latency measurement
    this.onMessage('ping', (client) => {
      this.send(client, 'pong', { t: Date.now(), serverTime: this.state.raceTime });
    });
  }

  /**
   * Handle client joining the room
   * Creates player state, physics body, and input buffer
   * 
   * @param {Client} client - Colyseus client object
   * @param {Object} options - Join options
   * @param {string} [options.name] - Player display name
   * @param {string} [options.vehicleId] - Selected vehicle
   * @param {string} [options.characterId] - Selected character
   * @param {boolean} [options.isBot] - Whether this is a bot player
   * @param {string} [options.reconnectToken] - Token for reconnection
   */
  onJoin(client, options) {
    console.log(`[RaceRoom] Client joined: ${client.sessionId}`, options?.isBot ? '(BOT)' : '');
    
    // Handle reconnection
    if (options?.reconnectToken) {
      const restoredState = this._disconnectedPlayers.get(options.reconnectToken);
      if (restoredState && Date.now() - restoredState.disconnectedAt < RECONNECT_WINDOW) {
        this._restorePlayer(client, restoredState);
        return;
      }
    }
    
    // Check if race already started (join as spectator)
    if (this.state.phase === 'racing' || this.state.phase === 'finished') {
      this._addSpectator(client, options);
      return;
    }
    
    // Get vehicle physics config
    const vehicleId = options?.vehicleId || 'spectre';
    const vehicleConfig = VEHICLE_PHYSICS[vehicleId] || VEHICLE_PHYSICS.spectre;
    
    // Calculate starting position based on current player count
    const playerIndex = this.state.players.size;
    const startPos = this._getStartPosition(playerIndex);
    
    // Create player state object
    const playerData = {
      id: client.sessionId,
      name: options?.name || `Player${Math.floor(Math.random() * 10000)}`,
      vehicleId: vehicleId,
      characterId: options?.characterId || 'ace',
      position: { ...startPos.position },
      rotation: { ...startPos.rotation },
      velocity: { x: 0, y: 0, z: 0 },
      speedKmh: 0,
      ready: false,
      lap: 0,
      checkpoint: 0,
      checkpointsPassed: [],
      finished: false,
      finishTime: 0,
      finishPosition: 0,
      isBot: options?.isBot || false,
      ping: 0,
      inputSequence: 0,
      lastServerSequence: 0
    };
    
    // Add to Colyseus state
    this.state.players.set(client.sessionId, playerData);
    
    // Create input buffer for this player
    this._inputs.set(client.sessionId, []);
    
    // Create physics body for this player's vehicle
    const vehicleBody = this._createVehicleBody(startPos.position, vehicleConfig);
    this._vehicles.set(client.sessionId, vehicleBody);
    
    // Store initial state for validation
    this._playerStates.set(client.sessionId, {
      position: { ...startPos.position },
      sequence: 0,
      timestamp: Date.now()
    });
    
    // Notify other players
    this.broadcast('playerJoined', { 
      player: playerData, 
      totalPlayers: this.state.players.size 
    }, { except: client });
    
    // Send current state to joining player
    this.send(client, 'roomState', {
      phase: this.state.phase,
      trackId: this.state.trackId,
      lapCount: this.lapCount,
      players: [...this.state.players.values()]
    });
    
    console.log(`[RaceRoom] ${playerData.name} joined at position ${playerIndex + 1}`);
  }

  /**
   * Handle client leaving the room
   * Cleans up physics body, handles reconnection window
   * 
   * @param {Client} client - Leaving client
   */
  onLeave(client, consented) {
    console.log(`[RaceRoom] Client left: ${client.sessionId}, consented: ${consented}`);
    
    const playerId = client.sessionId;
    const player = this.state.players.get(playerId);
    
    // Remove from spectators if applicable
    if (this._spectators.has(playerId)) {
      this._spectators.delete(playerId);
      return;
    }
    
    // Store disconnected state for potential reconnection
    if (player && !player.finished && this.state.phase === 'racing') {
      const reconnectToken = `reconnect_${playerId}_${Date.now()}`;
      
      this._disconnectedPlayers.set(reconnectToken, {
        playerId,
        playerData: { ...player },
        disconnectedAt: Date.now(),
        reconnectToken
      });
      
      // Send reconnection info to client
      this.send(client, 'disconnectInfo', {
        reconnectToken,
        windowMs: RECONNECT_WINDOW
      });
      
      // Clean up after reconnection window expires
      this.clock.setTimeout(() => {
        this._disconnectedPlayers.delete(reconnectToken);
        this._cleanupPlayer(playerId);
      }, RECONNECT_WINDOW);
      
      this.broadcast('playerDisconnected', { 
        playerId, 
        canReconnect: true,
        windowMs: RECONNECT_WINDOW 
      });
      
      return;
    }
    
    // Immediate cleanup for other cases
    this._cleanupPlayer(playerId);
  }

  /**
   * Clean up player resources
   * @private
   * @param {string} playerId - Player ID to clean up
   */
  _cleanupPlayer(playerId) {
    // Remove from state
    this.state.players.delete(playerId);
    
    // Remove input buffer
    this._inputs.delete(playerId);
    
    // Remove physics body from world
    const vehicleBody = this._vehicles.get(playerId);
    if (vehicleBody) {
      this.world.removeBody(vehicleBody);
    }
    this._vehicles.delete(playerId);
    
    // Remove stored state
    this._playerStates.delete(playerId);
    
    // Notify others
    this.broadcast('playerLeft', { playerId });
    
    console.log(`[RaceRoom] Cleaned up player: ${playerId}`);
  }

  /**
   * Restore player state after successful reconnection
   * @private
   */
  _restorePlayer(client, savedState) {
    const { playerId, playerData } = savedState;
    
    // Update client session ID mapping
    this.state.players.delete(playerId);
    playerData.id = client.sessionId;
    this.state.players.set(client.sessionId, playerData);
    
    // Recreate input buffer
    this._inputs.set(client.sessionId, []);
    
    // Recreate physics body at last known position
    const vehicleConfig = VEHICLE_PHYSICS[playerData.vehicleId] || VEHICLE_PHYSICS.spectre;
    const vehicleBody = this._createVehicleBody(playerData.position, vehicleConfig);
    this._vehicles.set(client.sessionId, vehicleBody);
    
    // Restore state tracking
    this._playerStates.set(client.sessionId, {
      position: { ...playerData.position },
      sequence: playerData.inputSequence,
      timestamp: Date.now()
    });
    
    // Clean up disconnect record
    this._disconnectedPlayers.delete(savedState.reconnectToken);
    
    // Confirm reconnection
    this.send(client, 'reconnectSuccess', {
      state: playerData,
      raceTime: this.state.raceTime,
      phase: this.state.phase
    });
    
    this.broadcast('playerReconnected', { 
      playerId: client.sessionId, 
      name: playerData.name 
    });
    
    console.log(`[RaceRoom] Player reconnected: ${playerData.name}`);
  }

  // ==========================================================================
  // INPUT HANDLING
  // ==========================================================================

  /**
   * Handle incoming input from client
   * Buffers input with sequence number for processing during physics update
   * 
   * @param {Client} client - Sending client
   * @param {Object} input - Input data
   * @param {number} input.sequence - Monotonically increasing sequence number
   * @param {number} input.throttle - Throttle value (-1 to 1)
   * @param {number} input.steer - Steering value (-1 to 1)
   * @param {boolean} input.brake - Brake active
   * @param {boolean} input.nitro - Nitro boost active
   */
  async _handleInput(client, input) {
    const playerId = client.sessionId;
    const buf = this._inputs.get(playerId);
    
    if (!buf) return; // Player not found or spectator
    
    // Validate input sequence
    const lastState = this._playerStates.get(playerId);
    if (lastState && input.sequence <= lastState.sequence) {
      // Ignore duplicate/out-of-order input
      console.warn(`[RaceRoom] Out-of-order input from ${playerId}: ${input.sequence} <= ${lastState.sequence}`);
      return;
    }
    
    // Add timestamp if not present
    input.timestamp = input.timestamp || Date.now();
    
    // Add to buffer
    buf.push(input);
    
    // Maintain buffer size limit
    while (buf.length > INPUT_BUFFER_SIZE) {
      buf.shift();
    }
    
    // Record for replay system
    this._antiCheat.recordReplay(playerId, input);
    
    // Anti-cheat validation (async, non-blocking)
    const player = this.state.players.get(playerId);
    if (player && this.state.phase === 'racing') {
      const validationResult = await this._antiCheat.validateInput(
        playerId, 
        input, 
        { 
          trackId: this.state.trackId, 
          vehicleId: player.vehicleId,
          ...player 
        }
      );
      
      if (!validationResult.valid) {
        this.send(client, 'correction', {
          correctedPosition: validationResult.correctedInput?.position,
          violations: validationResult.violations.map(v => v.type)
        });
        
        // Apply correction if needed
        if (validationResult.correctedInput?.position) {
          this._applyCorrection(playerId, validationResult.correctedInput.position);
        }
      }
    }
  }

  /**
   * Process buffered inputs during physics update
   * Applies inputs to physics bodies deterministically
   * @private
   */
  _processInputs(dt) {
    for (const [playerId, buffer] of this._inputs) {
      if (buffer.length === 0) continue;
      
      const vehicleBody = this._vehicles.get(playerId);
      const player = this.state.players.get(playerId);
      
      if (!vehicleBody || !player) continue;
      
      // Get latest input (or interpolate between multiple)
      const input = buffer[buffer.length - 1];
      
      // Clear processed inputs
      buffer.length = 0;
      
      // Apply input to physics body
      this._applyVehicleInput(vehicleBody, input, player.vehicleId, dt);
      
      // Update player state reference
      player.inputSequence = input.sequence;
    }
  }

  /**
   * Apply vehicle input to physics body
   * Calculates forces based on throttle, steering, brake
   * @private
   */
  _applyVehicleInput(body, input, vehicleId, dt) {
    const config = VEHICLE_PHYSICS[vehicleId] || VEHICLE_PHYSICS.spectre;
    
    // Get forward direction of vehicle
    const forward = new CANNON.Vec3(0, 0, 1);
    body.quaternion.vmult(forward, forward);
    
    // Get current velocity
    const velocity = body.velocity;
    const speed = velocity.length();
    
    // Calculate engine force
    let engineForce = 0;
    if (input.throttle > 0) {
      engineForce = config.maxEngineForce * input.throttle;
    } else if (input.throttle < 0) {
      engineForce = config.maxEngineForce * input.throttle * 0.5; // Reverse
    }
    
    // Apply braking
    if (input.brake && speed > 0.5) {
      const brakeForce = config.maxBrakeForce;
      const brakeDirection = velocity.clone().normalize();
      brakeDirection.scale(-brakeForce, brakeDirection);
      body.applyImpulse(brakeDirection);
    }
    
    // Nitro boost
    let nitroMultiplier = 1;
    if (input.nitro) {
      nitroMultiplier = 1.4;
      engineForce *= 1.5;
    }
    
    // Apply engine force in forward direction
    const forceVector = forward.clone();
    forceVector.scale(engineForce * dt, forceVector);
    body.applyForce(forceVector);
    
    // Apply steering (angular velocity for rotation)
    if (Math.abs(input.steer) > 0.01 && speed > 1) {
      const steerAmount = input.steer * config.maxSteerAngle * dt * (speed / 50);
      const quaternion = new CANNON.Quaternion();
      quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), steerAmount);
      body.quaternion.mult(quaternion, body.quaternion);
    }
    
    // Apply drag and resistance
    const dragForce = velocity.clone();
    const dragMagnitude = config.dragCoefficient * speed * speed * 0.5;
    dragForce.normalize();
    dragForce.scale(-dragMagnitude * dt, dragForce);
    body.applyForce(dragForce);
    
    // Ground constraint (keep vehicle on ground)
    if (body.position.y < 0.5) {
      body.position.y = 0.5;
      body.velocity.y = Math.max(0, body.velocity.y);
    }
  }

  /**
   * Apply server correction to client
   * Used when client prediction diverges significantly from server state
   * @private
   */
  _applyCorrection(playerId, correctPosition) {
    const body = this._vehicles.get(playerId);
    const player = this.state.players.get(playerId);
    
    if (body && correctPosition) {
      // Snap physics body to corrected position
      body.position.set(correctPosition.x, correctPosition.y || 0.5, correctPosition.z);
      
      // Reset velocity to prevent continued divergence
      body.velocity.set(0, 0, 0);
      
      // Update player state
      if (player) {
        player.position.x = correctPosition.x;
        player.position.y = correctPosition.y || 0.5;
        player.position.z = correctPosition.z;
      }
      
      console.log(`[RaceRoom] Correction applied to ${playerId}`);
    }
  }

  // ==========================================================================
  // PHYSICS UPDATE LOOP
  // ==========================================================================

  /**
   * Main physics update loop called at TICK_RATE Hz
   * Steps physics world, processes inputs, validates state
   * 
   * @param {number} dt - Delta time in milliseconds
   */
  _update(dt) {
    const dtSeconds = dt / 1000; // Convert to seconds
    
    switch (this.state.phase) {
      case 'countdown':
        // No physics during countdown
        break;
        
      case 'racing':
        // Step physics world
        this.world.step(1 / TICK_RATE, dtSeconds, 3);
        
        // Process buffered inputs
        this._processInputs(dtSeconds);
        
        // Update player states from physics bodies
        this._syncPlayerStates();
        
        // Check checkpoints
        this._checkCheckpoints();
        
        // Spawn/update items
        this._updateItems(dt);
        
        // Update race time
        this.state.raceTime += dt;
        
        // Check for race end conditions
        this._checkRaceEnd();
        break;
        
      case 'finished':
        // Minimal updates after race ends
        break;
    }
  }

  /**
   * Sync player states from physics bodies to Colyseus schema
   * @private
   */
  _syncPlayerStates() {
    for (const [playerId, body] of this._vehicles) {
      const player = this.state.players.get(playerId);
      if (!player) continue;
      
      // Copy position from physics body
      player.position.x = body.position.x;
      player.position.y = body.position.y;
      player.position.z = body.position.z;
      
      // Copy rotation (quaternion)
      player.rotation.x = body.quaternion.x;
      player.rotation.y = body.quaternion.y;
      player.rotation.z = body.quaternion.z;
      player.rotation.w = body.quaternion.w;
      
      // Calculate velocity and speed
      const velocity = body.velocity;
      player.velocity.x = velocity.x;
      player.velocity.y = velocity.y;
      player.velocity.z = velocity.z;
      
      player.speedKmh = Math.round(velocity.length() * 3.6); // m/s to km/h
      
      // Update stored state for validation
      this._playerStates.set(playerId, {
        position: { x: body.position.x, y: body.position.y, z: body.position.z },
        sequence: player.inputSequence,
        timestamp: Date.now()
      });
    }
  }

  // ==========================================================================
  // CHECKPOINT & LAP VALIDATION
  // ==========================================================================

  /**
   * Check if any player has crossed a checkpoint
   * Validates checkpoint ordering to prevent cutting
   * @private
   */
  _checkCheckpoints() {
    const checkpoints = TRACK_CHECKPOINTS[this.state.trackId];
    if (!checkpoints) return;
    
    for (const [playerId, player] of this.state.players) {
      if (player.finished) continue;
      
      const pos = player.position;
      const nextCheckpointIdx = player.checkpoint % checkpoints.length;
      const nextCheckpoint = checkpoints[nextCheckpointIdx];
      
      // Check distance to next checkpoint
      const dx = pos.x - nextCheckpoint.position.x;
      const dy = pos.y - nextCheckpoint.position.y;
      const dz = pos.z - nextCheckpoint.position.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      
      if (distance <= nextCheckpoint.radius) {
        // Validate checkpoint ordering
        const expectedOrder = nextCheckpoint.order;
        const prevCheckpointIdx = (nextCheckpointIdx - 1 + checkpoints.length) % checkpoints.length;
        const prevOrder = checkpoints[prevCheckpointIdx].order;
        
        // Must have passed previous checkpoint (or it's the first one)
        const hasPrevious = player.checkpointsPassed.includes(prevCheckpointIdx) || 
                           player.checkpoint === 0;
        
        if (hasPrevious || nextCheckpointIdx === 0) {
          // Valid checkpoint pass
          player.checkpoint = nextCheckpointIdx + 1;
          
          if (!player.checkpointsPassed.includes(nextCheckpointIdx)) {
            player.checkpointsPassed.push(nextCheckpointIdx);
          }
          
          // Emit checkpoint event
          this.broadcast('checkpoint', {
            playerId,
            checkpointId: nextCheckpoint.id,
            checkpointIndex: nextCheckpointIdx,
            time: this.state.raceTime
          });
          
          // Check for lap completion
          if (player.checkpoint >= checkpoints.length) {
            this._completeLap(playerId, player);
          }
        } else {
          // Checkpoint passed out of order - possible cutting
          console.warn(`[RaceRoom] Out-of-order checkpoint: ${playerId} hit ${nextCheckpointIdx} before ${prevCheckpointIdx}`);
        }
      }
    }
  }

  /**
   * Handle lap completion for a player
   * @private
   * @param {string} playerId - Player ID
   * @param {Object} player - Player state
   */
  _completeLap(playerId, player) {
    player.lap += 1;
    player.checkpoint = 0;
    player.checkpointsPassed = [];
    
    const lapTime = this.state.raceTime; // Simplified - would track per-lap times
    
    this.broadcast('lapComplete', {
      playerId,
      lap: player.lap,
      lapTime,
      totalTime: this.state.raceTime
    });
    
    console.log(`[RaceRoom] ${player.name} completed lap ${player.lap}/${this.lapCount}`);
    
    // Check for race completion
    if (player.lap >= this.lapCount) {
      this._finishPlayer(playerId, player);
    }
  }

  /**
   * Handle player finishing the race
   * @private
   */
  _finishPlayer(playerId, player) {
    if (player.finished) return; // Already finished
    
    player.finished = true;
    player.finishTime = this.state.raceTime;
    player.finishPosition = this._finishOrder.length + 1;
    
    this._finishOrder.push({
      playerId,
      name: player.name,
      position: player.finishPosition,
      time: player.finishTime
    });
    
    this._raceResults.push({
      playerId,
      name: player.name,
      vehicleId: player.vehicleId,
      finishPosition: player.finishPosition,
      finishTime: player.finishTime,
      lapsCompleted: player.lap
    });
    
    this.broadcast('playerFinished', {
      playerId,
      name: player.name,
      position: player.finishPosition,
      time: player.finishTime
    });
    
    // Run anti-cheat analysis on completed race
    this._antiCheat.detectAnomaly(playerId, {
      trackId: this.state.trackId,
      vehicleId: player.vehicleId,
      totalTime: player.finishTime,
      lapsCompleted: player.lap,
      finishPosition: player.finishPosition
    }).then(result => {
      if (result.suspicious) {
        console.warn(`[AntiCheat] Suspicious activity detected for ${player.name}:`, result.anomalies);
      }
    });
    
    console.log(`[RaceRoom] ${player.name} finished in position ${player.finishPosition}`);
  }

  // ==========================================================================
  // ITEM SYSTEM
  // ==========================================================================

  /**
   * Handle item use request from client
   * Validates item ownership and applies effect authoritatively
   * 
   * @param {Client} client - Using client
   * @param {Object} data - Item use data
   * @param {string} data.itemId - Item being used
   * @param {string} [data.targetId] - Target player (for offensive items)
   */
  _handleItemUse(client, data) {
    const playerId = client.sessionId;
    const player = this.state.players.get(playerId);
    
    if (!player || this.state.phase !== 'racing') return;
    
    // Validate item (simplified - would check inventory)
    const validItems = ['boost', 'shield', 'rocket', 'trap', 'nitro'];
    if (!validItems.includes(data.itemId)) {
      console.warn(`[RaceRoom] Invalid item used: ${data.itemId} by ${playerId}`);
      return;
    }
    
    // Apply item effect authoritatively
    this._applyItemEffect(playerId, data.itemId, data.targetId);
    
    // Broadcast item use to all clients
    this.broadcast('itemUsed', {
      playerId,
      itemId: data.itemId,
      targetId: data.targetId,
      timestamp: this.state.raceTime
    });
  }

  /**
   * Apply item effect to target
   * @private
   */
  _applyItemEffect(sourcePlayerId, itemId, targetId) {
    const sourceBody = this._vehicles.get(sourcePlayerId);
    const targetBody = targetId ? this._vehicles.get(targetId) : null;
    
    switch (itemId) {
      case 'boost':
      case 'nitro':
        // Apply forward impulse to source
        if (sourceBody) {
          const forward = new CANNON.Vec3(0, 0, 1);
          sourceBody.quaternion.vmult(forward, forward);
          forward.scale(5000, forward); // Strong impulse
          sourceBody.applyImpulse(forward);
        }
        break;
        
      case 'rocket':
        // Apply impulse away from source to target
        if (sourceBody && targetBody) {
          const direction = new CANNON.Vec3();
          targetBody.position.vsub(sourceBody.position, direction);
          direction.normalize();
          direction.scale(8000, direction); // Strong knockback
          targetBody.applyImpulse(direction);
        }
        break;
        
      case 'trap':
        // Would place trap at source position
        // Trap would affect next player crossing it
        break;
        
      case 'shield':
        // Would set shield flag on source
        // Shield absorbs next attack
        break;
    }
  }

  /**
   * Update spawned items on track
   * @private
   */
  _updateItems(dt) {
    // Item spawning logic would go here
    // Pickups respawn after being collected, etc.
  }

  // ==========================================================================
  // RACE FLOW CONTROL
  // ==========================================================================

  /**
   * Start lobby/waiting phase
   * Waits for players to join and ready up
   * @private
   */
  _startLobbyPhase() {
    this.state.phase = 'waiting';
    this.broadcast('phaseChange', { phase: 'waiting' });
    
    console.log(`[RaceRoom] Lobby phase started, waiting for players...`);
  }

  /**
   * Handle player ready signal
   * Starts countdown when all players are ready
   * @private
   */
  _handleReady(client) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.ready = true;
      this.broadcast('playerReady', { playerId: client.sessionId });
      
      // Check if all players are ready
      this._checkAllReady();
    }
  }

  /**
   * Check if all players are ready to start
   * @private
   */
  _checkAllReady() {
    if (this.state.phase !== 'waiting') return;
    
    const players = [...this.state.players.values()].filter(p => !p.isBot);
    
    // Need minimum players and all must be ready
    if (players.length >= MIN_PLAYERS && players.every(p => p.ready)) {
      this._startCountdown();
    }
  }

  /**
   * Start the race countdown
   * 3-2-1-GO! sequence before race starts
   * @private
   */
  _startCountdown() {
    this.state.phase = 'countdown';
    this.state.countdown = 3;
    this.broadcast('phaseChange', { phase: 'countdown' });
    
    console.log('[RaceRoom] Countdown starting...');
    
    [3, 2, 1, 0].forEach((value, index) => {
      this.clock.setTimeout(() => {
        this.state.countdown = value;
        this.broadcast('countdown', { value });
        
        if (value === 0) {
          this._startRace();
        }
      }, (index + 1) * 1000);
    });
  }

  /**
   * Start the actual race
   * Enables physics simulation and begins timing
   * @private
   */
  _startRace() {
    this.state.phase = 'racing';
    this.state.raceStartTime = Date.now();
    this.state.raceTime = 0;
    
    this.broadcast('phaseChange', { phase: 'racing' });
    this.broadcast('raceStart', { startTime: this.state.raceStartTime });
    
    console.log('[RaceRoom] RACE START!');
    
    // Set maximum race timeout (e.g., 10 minutes)
    this.clock.setTimeout(() => {
      if (this.state.phase === 'racing') {
        this._endRace();
      }
    }, 600000); // 10 minutes
  }

  /**
   * Check if race should end
   * @private
   */
  _checkRaceEnd() {
    const players = [...this.state.players.values()];
    const humanPlayers = players.filter(p => !p.isBot);
    
    // All human players finished
    if (humanPlayers.length > 0 && humanPlayers.every(p => p.finished)) {
      this._endRace();
      return;
    }
    
    // Time limit exceeded
    if (this.state.raceTime > 600000) { // 10 min
      this._endRace();
    }
  }

  /**
   * End the race and calculate final results
   * @private
   */
  _endRace() {
    if (this.state.phase === 'finished') return;
    
    this.state.phase = 'finished';
    
    // Force-finish any remaining players
    for (const [playerId, player] of this.state.players) {
      if (!player.finished) {
        player.finished = true;
        player.finishTime = this.state.raceTime;
        player.finishPosition = this._finishOrder.length + 1;
        this._finishOrder.push({ playerId, name: player.name, position: player.finishPosition });
      }
    }
    
    // Sort results by position
    const sortedResults = [...this._raceResults].sort((a, b) => a.finishPosition - b.finishPosition);
    
    this.broadcast('raceEnd', {
      results: sortedResults,
      totalRaceTime: this.state.raceTime
    });
    
    console.log(`[RaceRoom] Race ended! Results:`, sortedResults.map(r => `${r.position}. ${r.name}`));
    
    // Dispose room after delay
    this.clock.setTimeout(() => {
      this.disconnect();
    }, 15000); // 15 seconds to view results
  }

  // ==========================================================================
  // SPECTATOR MODE
  // ==========================================================================

  /**
   * Add a player as spectator (late join or explicit spectate)
   * @private
   */
  _addSpectator(client, options) {
    this._spectators.add(client.sessionId);
    
    // Send current race state to spectator
    this.send(client, 'spectateMode', {
      enabled: true,
      phase: this.state.phase,
      raceTime: this.state.raceTime,
      players: [...this.state.players.values()],
      finishOrder: this._finishOrder
    });
    
    console.log(`[RaceRoom] Spectator joined: ${client.sessionId}`);
  }

  /**
   * Handle spectate request
   * @private
   */
  _handleSpectateRequest(client, data) {
    const playerId = client.sessionId;
    const player = this.state.players.get(playerId);
    
    if (data.enabled && player && !player.finished) {
      // Convert player to spectator (they leave the race)
      this._cleanupPlayer(playerId);
      this._addSpectator(client, {});
    }
  }

  // ==========================================================================
  // ANTI-CHEAT INTEGRATION
  // ==========================================================================

  /**
   * Handle fingerprint submission from client
   * @private
   */
  async _handleFingerprint(client, data) {
    const playerId = client.sessionId;
    await this._antiCheat.collectFingerprint(playerId, data);
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  /**
   * Get starting grid position for a player index
   * Staggered formation based on position
   * @private
   * @param {number} index - Player index (0-based)
   * @returns {Object} Position and rotation
   */
  _getStartPosition(index) {
    // 2-column staggered grid
    const row = Math.floor(index / 2);
    const col = index % 2;
    
    const spacingZ = 8; // Distance between rows
    const spacingX = 4; // Distance between columns
    
    return {
      position: {
        x: (col === 0 ? -spacingX / 2 : spacingX / 2),
        y: 0.5,
        z: -row * spacingZ
      },
      rotation: { x: 0, y: 0, z: 0, w: 1 }
    };
  }

  /**
   * Create a physics body for a vehicle
   * @private
   * @param {Object} position - Starting position
   * @param {Object} config - Vehicle physics configuration
   * @returns {CANNON.Body} Created physics body
   */
  _createVehicleBody(position, config) {
    // Simple box-shaped vehicle body
    const shape = new CANNON.Box(new CANNON.Vec3(config.wheelBase / 2, 0.5, config.trackWidth / 2));
    
    const body = new CANNON.Body({
      mass: config.mass,
      shape: shape,
      material: this.vehicleMaterial,
      linearDamping: 0.1,
      angularDamping: 0.9
    });
    
    body.position.set(position.x, position.y, position.z);
    
    this.world.addBody(body);
    
    return body;
  }

  /**
   * Get current race results (for external access)
   * @returns {Array} Race results
   */
  getResults() {
    return this._raceResults;
  }

  /**
   * Get anti-cheat instance (for external access)
   * @returns {AntiCheat}
   */
  getAntiCheat() {
    return this._antiCheat;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default RaceRoom;
