// barrel/scenes/scene.race.js
// The 3D race scene. Wires together: track (barrel), mode (barrel), player vehicle (barrel),
// AI vehicles (barrel, reusing vehicle modules), HUD overlay, camera rig, item boxes, lap logic.
// Integrated with AAA-quality AISystem for intelligent opponent behavior.
// Features: Smart item distribution + MinimapSystem integration

import * as THREE from 'three';
import { AISystem } from '../core/AISystem.js';
import { getItemForPosition } from '../core/SmartItemDistribution.js';
import { MinimapSystem } from '../core/MinimapSystem.js';

class RaceScene {
  constructor() {
    this.id = 'race';
    this.type = '3d';
    this._built = null;
    this._player = null;
    this._ai = [];
    this._itemBoxes = [];
    this._checkpoints = [];
    this._currentCheckpoint = 0;
    this._hud = null;
    this._cameraRig = null;
    this._countdown = 3;
    this._countdownTimer = 0;
    this._raceStarted = false;
    this._matchState = {};
    this._unsubBus = [];
    this._aiSystem = null; // New AISystem integration
    this._minimapSystem = null; // MinimapSystem instance
    this._activeBananas = []; // Active banana peels on track
    this._activeCoins = []; // Active coins on track
    this._playerCoinCount = 0; // Player's collected coins
  }

  async mount(payload = {}) {
    const engine = window.__engine;
    const { mode: modeId, vehicle: vehicleId, character: characterId, track: trackId } = payload;
    if (!modeId || !vehicleId || !trackId) {
      console.error('[scene.race] missing required payload', payload);
      return;
    }

    engine.renderer.show();

    // Resolve barrel components
    const trackEntry = engine.resolver.resolve('tracks', trackId);
    const modeEntry  = engine.resolver.resolve('modes',  modeId);
    const vehEntry   = engine.resolver.resolve('vehicles', vehicleId);
    if (!trackEntry || !modeEntry || !vehEntry) {
      console.error('[scene.race] could not resolve barrel components', { trackEntry, modeEntry, vehEntry });
      return;
    }

    // Build track
    this._built = trackEntry.module.build(engine, trackEntry.entry);
    this._checkpoints = trackEntry.module.getCheckpoints(this._built);

    // Create physics ground plane so vehicles don't fall through
    this._groundBody = engine.physics.createGround(2000);

    // Spawn player vehicle
    const startPos = trackEntry.module.getStartPosition(this._built);
    const playerStart = [startPos.x, 1, startPos.z];
    // Apply character perk to vehicle entry (modifies a copy, not the manifest)
    const charEntry = characterId ? engine.resolver.resolve('characters', characterId) : null;
    // Apply equipped parts via GarageSystem
    const baseTuning = { ...vehEntry.entry.tuning };
    const partsModifiedTuning = engine.garage
      ? engine.garage.applyPartsToProfile(vehicleId, baseTuning)
      : baseTuning;
    // Apply paint
    const paintColor = engine.garage?.getPaint?.(vehicleId);
    const cosmetic = paintColor
      ? { ...vehEntry.entry.cosmetic, bodyColor: paintColor }
      : vehEntry.entry.cosmetic;
    const vehEntryWithPerk = charEntry?.entry?.passivePerk?.handlingMods
      ? { ...vehEntry.entry, tuning: { ...partsModifiedTuning, _charPerk: charEntry.entry.passivePerk.handlingMods }, cosmetic }
      : { ...vehEntry.entry, tuning: partsModifiedTuning, cosmetic };
    this._player = vehEntry.module.spawn(vehEntryWithPerk, { engine, physics: engine.physics, renderer: engine.renderer, input: engine.input }, playerStart);
    // Store character perk for vehicle to apply
    if (this._player && charEntry?.entry?.passivePerk?.handlingMods) {
      this._player._charPerk = charEntry.entry.passivePerk.handlingMods;
    }

    // Spawn AI opponents using new AISystem integration
    const allVehicles = engine.resolver.listWithModules('vehicles');
    const numOpponents = Math.min(3, engine.config?.ai?.maxOpponents || 11);
    
    for (let i = 0; i < numOpponents; i++) {
      const aiVehEntry = allVehicles[(i + 1) % allVehicles.length]; // skip player's vehicle
      const offset = (i + 1) * 3;
      const side = (i % 2 === 0 ? 1 : -1) * 2;
      const aiStart = [startPos.x + side, 1, startPos.z - offset];
      // Create a placeholder input - will be replaced by AISystem's intelligent input
      const aiInput = this._makeAIInput(engine, i);
      const aiVehicle = aiVehEntry.module.spawn(aiVehEntry.entry, { engine, physics: engine.physics, renderer: engine.renderer, input: aiInput }, aiStart);
      this._ai.push({ vehicle: aiVehicle, module: aiVehEntry.module, nextCheckpoint: 0, lap: 0, id: `ai-${i}`, input: aiInput });
    }
    
    // Initialize the new AISystem with track data and AI vehicles
    this._initializeAISystem(engine, trackEntry);

    // Camera rig (third-person chase)
    this._setupCamera();

    // HUD overlay
    this._setupHUD();

    // Initialize minimap system
    this._initializeMinimap(engine, trackEntry);

    // Item boxes
    this._setupItemBoxes();
    
    // Setup coin spawns on track
    this._setupCoins(engine);

    // Start mode
    modeEntry.module.onMatchStart({ engine, matchConfig: modeEntry.entry.matchConfig }, this._matchState);

    // Countdown
    this._countdown = 3;
    this._countdownTimer = 0;
    this._raceStarted = false;

    // Subscribe to events
    this._unsubBus.push(engine.bus.on('vehicle:driftStart', ({ id }) => {
      if (id !== this._player?.entry?.id) return;
      const pos = this._player.physicsBody.position;
      engine.particles.spawnBurst('smoke', { x: pos.x, y: 0.2, z: pos.z }, 3, { life: 0.8, spread: 1, upward: 0.5, startScale: 0.3, endScale: 1.5, startOpacity: 0.4 });
    }));
    this._unsubBus.push(engine.bus.on('vehicle:burnout', ({ id }) => {
      if (id !== this._player?.entry?.id) return;
      const pos = this._player.physicsBody.position;
      engine.particles.spawnBurst('smoke', { x: pos.x, y: 0.2, z: pos.z - 1.5 }, 5, { life: 1.2, spread: 2, upward: 1, startScale: 0.4, endScale: 2.5, startOpacity: 0.6 });
    }));
    this._unsubBus.push(engine.bus.on('vehicle:miniTurbo', ({ id, charge, tier }) => {
      if (id !== this._player?.entry?.id) return;
      const pos = this._player.physicsBody.position;
      engine.particles.spawnBurst('boost', { x: pos.x, y: 0.5, z: pos.z - 1.5 }, 8, { life: 0.6, spread: 1, upward: 0.3, startScale: 0.3, endScale: 1.5, startOpacity: 0.9 });
    }));
    this._unsubBus.push(engine.bus.on('vehicle:burnoutLaunch', ({ id, heat }) => {
      if (id !== this._player?.entry?.id) return;
      const pos = this._player.physicsBody.position;
      engine.particles.spawnBurst('fire', { x: pos.x, y: 0.3, z: pos.z - 1.5 }, 12, { life: 0.5, spread: 1.5, upward: 1.5, startScale: 0.3, endScale: 1.2, startOpacity: 1.0 });
    }));
    this._unsubBus.push(engine.bus.on('vehicle:collide', ({ vehicle, impactStrength }) => {
      if (vehicle !== this._player) return;
      const pos = this._player.physicsBody.position;
      if (impactStrength > 15) {
        engine.particles.spawnBurst('spark', { x: pos.x, y: 0.8, z: pos.z }, 10, { life: 0.4, spread: 3, upward: 2, startScale: 0.1, endScale: 0.4, startOpacity: 1.0 });
      }
    }));
    this._unsubBus.push(engine.bus.on('vehicle:landing', ({ id, impact }) => {
      if (id !== this._player?.entry?.id) return;
      const pos = this._player.physicsBody.position;
      engine.particles.spawnBurst('dust', { x: pos.x, y: 0.1, z: pos.z }, 8, { life: 1.0, spread: 2, upward: 0.5, startScale: 0.4, endScale: 2.0, startOpacity: 0.6 });
    }));
    this._unsubBus.push(engine.bus.on('item:used', ({ vehicleId, itemId }) => {
      const itemEntry = engine.resolver.resolve('items', itemId);
      if (!itemEntry) return;
      
      // Handle special items that need extra context
      let targetVehicle = this._ai[Math.floor(Math.random() * this._ai.length)]?.vehicle || null;
      
      // Activate the item with full context
      itemEntry.module.activate({ engine, physics: engine.physics }, {
        vehicle: this._player,
        vehicleModule: vehEntry.module,
        targetVehicle,
        raceScene: this, // Pass reference for items that need scene access
        activeBananas: this._activeBananas,
        activeCoins: this._activeCoins
      });
    }));
    this._unsubBus.push(engine.bus.on('input:action:pause', () => {
      engine.bus.emit('ui:showPause');
    }));
  }

  _setupCamera() {
    const engine = window.__engine;
    this._cameraOffset = new THREE.Vector3(0, 4, -8);
    this._cameraLookOffset = new THREE.Vector3(0, 1.5, 4);
    engine.renderer.getCamera().position.copy(this._player.sceneObject.position).add(this._cameraOffset);
  }

  _setupHUD() {
    const hud = document.createElement('div');
    hud.id = 'race-hud';
    hud.innerHTML = `
      <div class="hud-corner hud-tl">
        <div class="hud-label">LAP</div>
        <div class="hud-value" id="hud-lap">1 / 3</div>
      </div>
      <div class="hud-corner hud-tr">
        <div class="hud-label">POSITION</div>
        <div class="hud-value" id="hud-pos">1/4</div>
      </div>
      <div class="hud-corner hud-bl">
        <div class="hud-label">ITEM</div>
        <div class="hud-value" id="hud-item">—</div>
      </div>
      <div class="hud-speed">
        <div class="hud-speed-num" id="hud-speed">0</div>
        <div class="hud-speed-unit">KM/H</div>
      </div>
      <div class="hud-minimap" id="hud-minimap"></div>
      <div class="hud-countdown" id="hud-countdown" style="display:none"></div>
      <div class="hud-controls-hint">
        WASD drive · SPACE drift/burnout · E item · ESC pause
      </div>
    `;
    document.body.appendChild(hud);
    this._hud = hud;
  }

  _setupItemBoxes() {
    const engine = window.__engine;
    const allItems = engine.resolver.list('items');
    if (allItems.length === 0) return;
    // Place 6 item boxes around the track
    for (let i = 0; i < 6; i++) {
      const t = (i + 0.5) / 6;
      const p = this._built.curve.getPoint(t);
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.2, 1.2),
        new THREE.MeshStandardMaterial({
          color: '#00e5ff', emissive: '#00e5ff', emissiveIntensity: 1.0,
          transparent: true, opacity: 0.7
        })
      );
      box.position.set(p.x, 1, p.z);
      box.userData = { type: 'item-box', cooldownUntil: 0 };
      engine.renderer.addObject(box);
      this._itemBoxes.push(box);
    }
  }

  /**
   * Initialize the MinimapSystem with track data and UI container
   */
  _initializeMinimap(engine, trackEntry) {
    try {
      const minimapContainer = document.getElementById('hud-minimap');
      if (!minimapContainer) {
        console.warn('[RaceScene] No minimap container found in HUD');
        return;
      }
      
      // Create minimap system
      this._minimapSystem = new MinimapSystem(minimapContainer, {
        curve: this._built.curve,
        bounds: this._built.bounds || null
      });
      
      // Calculate track bounds from curve
      const curve = this._built.curve;
      const trackBounds = this._calculateTrackBounds(curve);
      
      // Get checkpoint positions
      const checkpointPositions = this._checkpoints.map(cp => ({ x: cp.x, z: cp.z }));
      
      // Item box positions for minimap display
      const itemBoxPositions = this._getItemBoxPositionsForMinimap();
      
      // Initialize minimap
      this._minimapSystem.initialize(trackBounds, checkpointPositions);
      this._minimapSystem.setItemBoxPositions(itemBoxPositions);
      this._minimapSystem.setMode('fixed'); // Default to fixed-north mode
      
      console.log('[RaceScene] MinimapSystem initialized');
    } catch (e) {
      console.error('[RaceScene] Failed to initialize MinimapSystem:', e);
      this._minimapSystem = null;
    }
  }
  
  /**
   * Calculate track bounds from spline curve
   */
  _calculateTrackBounds(curve) {
    if (!curve) return { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
    
    const segments = 100;
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    for (let i = 0; i <= segments; i++) {
      const point = curve.getPoint(i / segments);
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minZ = Math.min(minZ, point.z);
      maxZ = Math.max(maxZ, point.z);
    }
    
    // Add padding
    const padX = (maxX - minX) * 0.15;
    const padZ = (maxZ - minZ) * 0.15;
    
    return { minX: minX - padX, maxX: maxX + padX, minZ: minZ - padZ, maxZ: maxZ + padZ };
  }
  
  /**
   * Get item box positions formatted for minimap
   */
  _getItemBoxPositionsForMinimap() {
    // Will be populated after _setupItemBoxes runs
    return [];
  }
  
  /**
   * Setup coin pickups scattered on the track
   */
  _setupCoins(engine) {
    const curve = this._built.curve;
    if (!curve) return;
    
    // Spawn coins along the track at various positions
    const coinCount = 20;
    this._activeCoins = [];
    
    for (let i = 0; i < coinCount; i++) {
      const t = ((i * 0.7 + Math.random() * 0.5) % 1); // Spread coins around track
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      
      // Random offset from center of track
      const sideOffset = (Math.random() - 0.5) * 6;
      
      const coinPos = {
        x: p.x + side.x * sideOffset,
        y: 0.5,
        z: p.z + side.z * sideOffset
      };
      
      // Create coin mesh
      const coinMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16),
        new THREE.MeshStandardMaterial({
          color: '#ffd700',
          emissive: '#ffd700',
          emissiveIntensity: 0.5,
          metalness: 0.8,
          roughness: 0.2
        })
      );
      coinMesh.position.set(coinPos.x, coinPos.y, coinPos.z);
      coinMesh.rotation.x = Math.PI / 2;
      coinMesh.userData = { type: 'coin', collected: false, respawnTime: 0 };
      
      engine.renderer.addObject(coinMesh);
      
      this._activeCoins.push({
        mesh: coinMesh,
        position: coinPos,
        collected: false,
        respawnTime: 0
      });
    }
  }
  
  /**
   * Update coin collection and respawning
   */
  _updateCoins(dt, engine) {
    const now = performance.now();
    const playerPos = this._player.sceneObject.position;
    
    for (const coin of this._activeCoins) {
      // Check respawn
      if (coin.collected && now >= coin.respawnTime) {
        coin.collected = false;
        coin.mesh.visible = true;
        coin.mesh.userData.collected = false;
      }
      
      if (coin.collected) continue;
      
      // Rotate coin animation
      coin.mesh.rotation.y += dt * 3;
      
      // Check collection
      const dx = coin.position.x - playerPos.x;
      const dz = coin.position.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      if (dist < 1.5) {
        // Collect coin!
        coin.collected = true;
        coin.mesh.visible = false;
        coin.mesh.userData.collected = true;
        coin.respawnTime = now + 15000; // Respawn after 15 seconds
        
        this._playerCoinCount++;
        engine.bus.emit('coin:collected', { count: this._playerCoinCount, total: 10 });
        
        // Mini-boost every 10 coins
        if (this._playerCoinCount % 10 === 0) {
          vehEntry.module.applyBoost(this._player, 1.08, 1.0); // Small boost
          engine.bus.emit('coin:bonus', { count: this._playerCoinCount });
        }
        
        // Particle effect
        engine.particles.spawnBurst('spark', coin.position, 5, {
          life: 0.3, spread: 0.8, startScale: 0.1, endScale: 0.4, startOpacity: 1.0
        });
      }
    }
  }
  
  /**
   * Update active bananas on track
   */
  _updateBananas(dt, engine) {
    const now = performance.now();
    const playerPos = this._player.sceneObject.position;
    
    // Remove expired bananas
    this._activeBananas = this._activeBananas.filter(banana => {
      if (now > banana.expiresAt) {
        engine.renderer.removeObject(banana.mesh);
        return false;
      }
      return true;
    });
    
    // Check collision with player
    if (!this._player._shieldUntil || performance.now() > this._player._shieldUntil) {
      for (const banana of this._activeBananas) {
        const dx = banana.position.x - playerPos.x;
        const dz = banana.position.z - playerPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        
        if (dist < 1.8) {
          // Hit banana! Spin out!
          this._triggerSpinout(engine, banana);
          
          // Remove banana
          engine.renderer.removeObject(banana.mesh);
          banana.hit = true;
          engine.bus.emit('banana:hit', { vehicle: 'player' });
        }
      }
      
      // Filter out hit bananas
      this._activeBananas = this._activeBananas.filter(b => !b.hit);
    }
    
    // Animate bananas (slight bobbing)
    for (const banana of this._activeBananas) {
      banana.mesh.rotation.y += dt * 1.5;
      banana.mesh.position.y = banana.baseY + Math.sin(now * 0.003) * 0.1;
    }
  }
  
  /**
   * Trigger spinout effect on player
   */
  _triggerSpinout(engine, sourceBanana) {
    const body = this._player.physicsBody;
    
    // Apply spin impulse
    const spinImpulse = new (engine.physics.getCANNON().Vec3)(0, 8, 0);
    body.angularVelocity.vadd(spinImpulse, body.angularVelocity);
    
    // Apply random directional impulse
    const randomDir = new (engine.physics.getCANNON().Vec3)(
      (Math.random() - 0.5) * 15,
      2,
      (Math.random() - 0.5) * 15
    );
    body.applyImpulse(randomDir, new (engine.physics.getCANNON().Vec3)(0, 0.5, 0));
    
    // Disable controls briefly
    this._player._spinoutUntil = performance.now() + 1200;
    
    // Visual feedback
    engine.particles.spawnBurst('smoke', this._player.sceneObject.position, 8, {
      life: 0.6, spread: 1.5, upward: 0.5, startScale: 0.3, endScale: 1.5, startOpacity: 0.7
    });
  }
  
  /**
   * Calculate current race position (1st, 2nd, etc.)
   */
  _calculatePlayerPosition() {
    const playerScore = (this._matchState.playerLaps || 0) * 1000 + this._currentCheckpoint * 10;
    let position = 1;
    
    for (const ai of this._ai) {
      const aiScore = ai.lap * 1000 + ai.nextCheckpoint * 10;
      if (aiScore > playerScore) position++;
    }
    
    return position;
  }

  _makeAIInput(engine, idx) {
    // Fake input object with throttled controls aimed at next checkpoint
    const ai = {
      _pressed: new Set(['throttle']),
      _axis: { steerLeft: 0, steerRight: 0 },
      isPressed: (a) => ai._pressed.has(a),
      getAxis: (a) => ai._axis[a] || 0,
      wasJustPressed: () => false,
      wasJustReleased: () => false,
      setAction: (a, v) => { if (v) ai._pressed.add(a); else ai._pressed.delete(a); },
      setAxis: (a, v) => { ai._axis[a] = v; },
      endFrame: () => {},
      pollGamepadForUI: () => {},
      _aiIdx: idx
    };
    return ai;
  }

  update(dt) {
    if (!this._player || !this._player.sceneObject) return;
    // Debug hook for verification scripts
    if (typeof window !== 'undefined') window.__playerVehicle = this._player;
    const engine = window.__engine;

    // Countdown
    if (!this._raceStarted) {
      this._countdownTimer += dt;
      const cdEl = document.getElementById('hud-countdown');
      if (cdEl) {
        cdEl.style.display = 'flex';
        const remaining = 3 - Math.floor(this._countdownTimer);
        if (remaining > 0) {
          cdEl.textContent = remaining;
          cdEl.style.fontSize = `${120 + Math.sin(this._countdownTimer * 6) * 10}px`;
          cdEl.style.color = 'var(--accent-primary)';
        } else if (this._countdownTimer < 4) {
          cdEl.textContent = 'GO!';
          cdEl.style.color = 'var(--success)';
        }
      }
      if (this._countdownTimer >= 4) {
        this._raceStarted = true;
        if (cdEl) cdEl.style.display = 'none';
      }
      // During countdown: freeze the player vehicle (don't call update).
      // AI is also frozen for fairness.
      // Camera still tracks the player.
      const cam = engine.renderer.getCamera();
      const targetPos = tmpVec1.copy(this._player.sceneObject.position);
      const desiredCamPos = tmpVec2.copy(targetPos).add(this._cameraOffset);
      cam.position.lerp(desiredCamPos, Math.min(1, dt * 6));
      const lookTarget = tmpVec3.copy(targetPos).add(this._cameraLookOffset);
      cam.lookAt(lookTarget);
      return;
    }

    // Update player
    this._player.update(dt);

    // Update AI using new AISystem (if available) or legacy method as fallback
    if (this._aiSystem && this._aiSystem.initialized) {
      // Update player state for AI awareness
      this._updatePlayerStateForAI();
      
      // Run main AI system update
      this._aiSystem.update(dt);
      
      // Apply AI inputs and update each AI vehicle
      for (const aiObj of this._ai) {
        const controller = this._aiSystem.getAIController(aiObj.id);
        if (controller) {
          // Sync AISystem input to vehicle input
          this._syncAIInput(aiObj, controller);
        }
        aiObj.module.update(aiObj.vehicle, dt);
        
        // Check AI item box pickups
        this._checkAIItemBoxes(aiObj);
      }
    } else {
      // Fallback to legacy AI update
      for (const aiObj of this._ai) {
        this._updateAILegacy(aiObj, dt);
        aiObj.module.update(aiObj.vehicle, dt);
      }
    }

    // Camera chase
    const cam = engine.renderer.getCamera();
    const targetPos = tmpVec1.copy(this._player.sceneObject.position);
    const desiredCamPos = tmpVec2.copy(targetPos).add(this._cameraOffset);
    cam.position.lerp(desiredCamPos, Math.min(1, dt * 6));
    const lookTarget = tmpVec3.copy(targetPos).add(this._cameraLookOffset);
    cam.lookAt(lookTarget);

    // Checkpoint progression for player
    if (this._raceStarted) {
      this._checkPlayerCheckpoint();
      // Item box pickups
      this._checkItemBoxes();
    }

    // Update HUD
    this._updateHUD();
    
    // Update minimap
    this._updateMinimap(dt);
    
    // Update coins
    this._updateCoins(dt, engine);
    
    // Update bananas
    this._updateBananas(dt, engine);
  }

  /**
   * Legacy AI update function (fallback when AISystem is not available)
   * @deprecated Use AISystem instead
   */
  _updateAILegacy(aiObj, dt) {
    const ai = aiObj.vehicle.ctx.input;
    const nextCp = this._checkpoints[aiObj.nextCheckpoint];
    if (!nextCp) return;
    const aiPos = aiObj.vehicle.physicsBody.position;
    const dx = nextCp.x - aiPos.x;
    const dz = nextCp.z - aiPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 8) {
      aiObj.nextCheckpoint = (aiObj.nextCheckpoint + 1) % this._checkpoints.length;
      if (aiObj.nextCheckpoint === 0) aiObj.lap++;
    }
    // Steer toward checkpoint
    const forward = new (aiObj.vehicle.ctx.physics.getCANNON().Vec3)(0, 0, 1);
    aiObj.vehicle.physicsBody.quaternion.vmult(forward, forward);
    const desired = new (aiObj.vehicle.ctx.physics.getCANNON().Vec3)(dx, 0, dz); desired.normalize();
    const cross = forward.cross(desired);
    const steer = Math.max(-1, Math.min(1, cross.y * 2));
    ai._axis.steerLeft = steer < 0 ? -steer : 0;
    ai._axis.steerRight = steer > 0 ? steer : 0;
    ai._pressed.add('throttle');
    // Random drift
    if (Math.abs(steer) > 0.5 && Math.random() > 0.7) ai._pressed.add('drift');
    else ai._pressed.delete('drift');
  }

  // ==========================================================================
  // NEW AISYSTEM INTEGRATION METHODS
  // ==========================================================================

  /**
   * Initialize the AISystem with current race data
   */
  _initializeAISystem(engine, trackEntry) {
    try {
      // Prepare AI vehicle data for AISystem
      const aiVehicles = this._ai.map(ai => ({
        id: ai.id,
        vehicle: ai.vehicle,
        module: ai.module
      }));

      // Prepare track data
      const trackData = {
        curve: this._built.curve,
        width: trackEntry.entry.spline?.width || 12,
        checkpoints: this._checkpoints,
        startPos: this._built.startPos
      };

      // Get difficulty from config
      const difficulty = engine.config?.ai?.defaultDifficulty || 'normal';

      // Create and initialize AISystem
      this._aiSystem = new AISystem({ bus: engine.bus, config: engine.config?.ai });
      this._aiSystem.initialize(aiVehicles, trackData, difficulty);

      // Set up event listeners for AI actions
      this._setupAIEventListeners(engine);

      console.log(`[RaceScene] AISystem initialized with ${aiVehicles.length} opponents at ${difficulty} difficulty`);
    } catch (e) {
      console.error('[RaceScene] Failed to initialize AISystem:', e);
      this._aiSystem = null; // Will fall back to legacy AI
    }
  }

  /**
   * Set up event listeners for AI system events
   */
  _setupAIEventListeners(engine) {
    if (!this._aiSystem) return;

    // Listen for AI item usage events
    this._unsubBus.push(engine.bus.on('ai:item:use', ({ vehicleId, itemId, targetVehicle }) => {
      const itemEntry = engine.resolver.resolve('items', itemId);
      if (!itemEntry) return;
      
      // Find the AI vehicle that used the item
      const aiObj = this._ai.find(a => a.id === vehicleId);
      if (!aiObj) return;
      
      // Activate the item effect
      itemEntry.module.activate(
        { engine, physics: engine.physics },
        { vehicle: aiObj.vehicle, vehicleModule: aiObj.module, targetVehicle }
      );
      
      console.log(`[RaceScene] AI ${vehicleId} used ${itemId}`);
    }));

    // Listen for AI overtake events (for future HUD/announcer integration)
    this._aiSystem.on('onOvertake', (data) => {
      engine.bus.emit('ai:overtake', data);
    });

    // Listen for AI mistake events (for potential visual feedback)
    this._aiSystem.on('onMistake', (data) => {
      engine.bus.emit('ai:mistake', data);
    });
  }

  /**
   * Sync AISystem controller input to the vehicle's input object
   */
  _syncAIInput(aiObj, controller) {
    const vehicleInput = aiObj.input; // The original input object we created
    const aiInput = controller.input; // The AISystem's computed input

    // Copy state from AISystem input to vehicle input
    vehicleInput._pressed.clear();
    for (const action of aiInput._pressed) {
      vehicleInput._pressed.add(action);
    }
    
    vehicleInput._axis.steerLeft = aiInput._axis.steerLeft || 0;
    vehicleInput._axis.steerRight = aiInput._axis.steerRight || 0;

    // Sync checkpoint/lap state back from controller
    aiObj.nextCheckpoint = controller.nextCheckpoint;
    aiObj.lap = controller.lap;
  }

  /**
   * Update player state information for AI decision-making
   */
  _updatePlayerStateForAI() {
    if (!this._aiSystem || !this._player) return;

    // Calculate player progress
    const totalCheckpoints = this._checkpoints.length || 16;
    const playerLaps = this._matchState.playerLaps || 0;
    const playerProgress = (playerLaps * totalCheckpoints + this._currentCheckpoint) / (totalCheckpoints * 3);

    // Calculate player position (simplified)
    let playerPosition = 1;
    const playerScore = playerLaps * 100 + this._currentCheckpoint;
    for (const ai of this._ai) {
      const aiScore = ai.lap * 100 + ai.nextCheckpoint;
      if (aiScore > playerScore) playerPosition++;
    }

    // Update AISystem with player state
    this._aiSystem.updatePlayerState({
      position: playerPosition,
      progress: playerProgress,
      hasItem: !!this._player._heldItem,
      speed: this._player.getSpeedKmh?.() || 0,
      vehicle: this._player
    });
  }

  /**
   * Check item box pickups for AI vehicles
   */
  _checkAIItemBoxes(aiObj) {
    if (!this._itemBoxes || !aiObj.vehicle?.physicsBody) return;
    
    const aiPos = aiObj.vehicle.physicsBody.position;
    const engine = window.__engine;
    
    for (const box of this._itemBoxes) {
      if (performance.now() < box.userData.cooldownUntil) continue;
      if (!box.visible) continue;
      
      const dx = box.position.x - aiPos.x;
      const dz = box.position.z - aiPos.z;
      
      if (Math.abs(dx) < 1.5 && Math.abs(dz) < 1.5) {
        // AI picked up an item
        box.userData.cooldownUntil = performance.now() + 5000;
        box.visible = false;
        setTimeout(() => { box.visible = true; }, 5000);
        
        // Grant random item to AI through AISystem
        const items = engine.resolver.list('items');
        if (items.length > 0 && this._aiSystem) {
          const item = items[Math.floor(Math.random() * items.length)];
          this._aiSystem.giveItem(aiObj.id, item.id);
        }
      }
    }
  }

  _checkPlayerCheckpoint() {
    const playerPos = this._player.sceneObject.position;
    const cp = this._checkpoints[this._currentCheckpoint];
    if (!cp) return;
    const dx = cp.x - playerPos.x;
    const dz = cp.z - playerPos.z;
    if (Math.sqrt(dx * dx + dz * dz) < 10) {
      this._currentCheckpoint = (this._currentCheckpoint + 1) % this._checkpoints.length;
      if (this._currentCheckpoint === 0) {
        // Lap complete
        const engine = window.__engine;
        const modeEntry = engine.resolver.resolve('modes', engine.state.get('race.payload').mode);
        if (modeEntry) modeEntry.module.onLapComplete({ engine, matchConfig: modeEntry.entry.matchConfig }, this._matchState, { vehicleId: 'player' });
      }
    }
  }

  _checkItemBoxes() {
    const playerPos = this._player.sceneObject.position;
    const engine = window.__engine;
    
    for (const box of this._itemBoxes) {
      if (performance.now() < box.userData.cooldownUntil) continue;
      const dx = box.position.x - playerPos.x;
      const dz = box.position.z - playerPos.z;
      if (Math.abs(dx) < 1.5 && Math.abs(dz) < 1.5) {
        box.userData.cooldownUntil = performance.now() + 5000;
        box.visible = false;
        
        // Use SMART ITEM DISTRIBUTION based on race position
        const currentPosition = this._calculatePlayerPosition();
        const totalRacers = this._ai.length + 1;
        const modeId = window.__engine?.state?.get('race.payload')?.mode || 'circuit';
        const currentLap = this._matchState.playerLaps || 0;
        const totalLaps = this._matchState.laps || 3;
        
        // Get weighted random item based on position
        const selectedItem = getItemForPosition(currentPosition, null, {
          mode: modeId,
          lap: currentLap,
          isLastLap: currentLap >= totalLaps - 1
        });
        
        // Verify item exists before granting
        const itemEntry = engine.resolver.resolve('items', selectedItem);
        if (itemEntry) {
          this._player._heldItem = selectedItem;
          engine.bus.emit('item:granted', { 
            itemId: selectedItem, 
            position: currentPosition,
            distribution: 'smart'
          });
        } else {
          // Fallback to random if smart selection fails
          const items = engine.resolver.list('items');
          if (items.length > 0) {
            const fallbackItem = items[Math.floor(Math.random() * items.length)];
            this._player._heldItem = fallbackItem.id;
          }
        }
        
        setTimeout(() => { box.visible = true; }, 5000);
      }
    }
  }
  
  /**
   * Update minimap with current game state
   */
  _updateMinimap(dt) {
    if (!this._minimapSystem) return;
    
    // Update local player position
    const playerPos = this._player.sceneObject.position;
    const rotation = this._player.physicsBody.quaternion.getYaw?.() || 0;
    
    // Try to get yaw from quaternion
    let yaw = 0;
    if (this._player.physicsBody.quaternion) {
      const q = this._player.physicsBody.quaternion;
      // Extract yaw from quaternion (simplified)
      yaw = -Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
    }
    
    this._minimapSystem.updateLocalPlayer(
      { x: playerPos.x, z: playerPos.z },
      yaw
    );
    
    // Build player positions array including AI
    const allPlayers = [
      {
        id: 'local',
        position: { x: playerPos.x, z: playerPos.z },
        rotation: yaw,
        name: 'You',
        positionInRace: this._calculatePlayerPosition(),
        isLocal: true
      }
    ];
    
    // Add AI players
    for (let i = 0; i < this._ai.length; i++) {
      const ai = this._ai[i];
      if (ai.vehicle?.physicsBody) {
        const aiPos = ai.vehicle.physicsBody.position;
        const aiScore = ai.lap * 1000 + ai.nextCheckpoint * 10;
        allPlayers.push({
          id: ai.id,
          position: { x: aiPos.x, z: aiPos.z },
          name: `AI ${i + 1}`,
          positionInRace: this._getAIPosition(ai),
          isLocal: false
        });
      }
    }
    
    this._minimapSystem.updatePlayerPositions(allPlayers);
    
    // Show current checkpoint
    this._minimapSystem.showCheckpoint(this._currentCheckpoint);
    
    // Update leaderboard
    const leaderboard = this._buildLeaderboard();
    this._minimapSystem.setLeaderboard(leaderboard);
    
    // Render frame
    this._minimapSystem.update(dt);
  }
  
  /**
   * Get AI's race position
   */
  _getAIPosition(aiObj) {
    const playerScore = (this._matchState.playerLaps || 0) * 1000 + this._currentCheckpoint * 10;
    const aiScore = aiObj.lap * 1000 + aiObj.nextCheckpoint * 10;
    
    let pos = 1;
    if (aiScore > playerScore) pos++;
    
    for (const other of this._ai) {
      if (other === aiObj) continue;
      const otherScore = other.lap * 1000 + other.nextCheckpoint * 10;
      if (otherScore > aiScore) pos++;
    }
    
    return pos;
  }
  
  /**
   * Build leaderboard data array
   */
  _buildLeaderboard() {
    const entries = [];
    const playerPos = this._calculatePlayerPosition();
    
    // Add player entry
    entries.push({
      position: playerPos,
      name: 'You',
      gap: '',
      isLocal: true
    });
    
    // Add AI entries
    for (let i = 0; i < this._ai.length; i++) {
      const ai = this._ai[i];
      entries.push({
        position: this._getAIPosition(ai),
        name: `Racer ${i + 1}`,
        gap: '',
        isLocal: false
      });
    }
    
    return entries;
  }

  _updateHUD() {
    const engine = window.__engine;
    const speedEl = document.getElementById('hud-speed');
    if (speedEl) speedEl.textContent = Math.round(this._player.getSpeedKmh());
    const lapEl = document.getElementById('hud-lap');
    if (lapEl) {
      const total = this._matchState.laps || 3;
      const current = Math.min(total, (this._matchState.playerLaps || 0) + 1);
      lapEl.textContent = `${current} / ${total}`;
    }
    const itemEl = document.getElementById('hud-item');
    if (itemEl) itemEl.textContent = this._player._heldItem ? this._player._heldItem.toUpperCase() : '—';
    const posEl = document.getElementById('hud-pos');
    if (posEl) {
      // Simple position calc by lap + checkpoint progress
      const playerScore = (this._matchState.playerLaps || 0) * 100 + this._currentCheckpoint;
      let pos = 1;
      for (const ai of this._ai) {
        const aiScore = ai.lap * 100 + ai.nextCheckpoint;
        if (aiScore > playerScore) pos++;
      }
      posEl.textContent = `${pos}/${this._ai.length + 1}`;
    }
  }

  async unmount() {
    const engine = window.__engine;
    for (const unsub of this._unsubBus) unsub();
    this._unsubBus = [];

    if (this._player) { this._player.despawn(); this._player = null; }
    for (const ai of this._ai) ai.vehicle.despawn();
    this._ai = [];
    if (this._groundBody) { engine.physics.removeBody(this._groundBody); this._groundBody = null; }
    if (this._built?.group) engine.renderer.removeObject(this._built.group);
    if (this._hud) { this._hud.remove(); this._hud = null; }
    for (const box of this._itemBoxes) engine.renderer.removeObject(box);
    this._itemBoxes = [];
    
    // Cleanup minimap
    if (this._minimapSystem) {
      this._minimapSystem.dispose();
      this._minimapSystem = null;
    }
    
    // Cleanup bananas
    for (const banana of this._activeBananas) {
      engine.renderer.removeObject(banana.mesh);
    }
    this._activeBananas = [];
    
    // Cleanup coins
    for (const coin of this._activeCoins) {
      engine.renderer.removeObject(coin.mesh);
    }
    this._activeCoins = [];

    // Cleanup AISystem
    if (this._aiSystem) {
      this._aiSystem.destroy();
      this._aiSystem = null;
    }

    engine.renderer.hide();
  }
}

const tmpVec1 = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const tmpVec3 = new THREE.Vector3();

const instance = new RaceScene();
export function mount(payload) { return instance.mount(payload); }
export function unmount() { return instance.unmount(); }
export function update(dt) { instance.update(dt); }
export default { mount, unmount, update, id: 'race', type: '3d' };
