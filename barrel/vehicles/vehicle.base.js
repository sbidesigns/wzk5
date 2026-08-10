// barrel/vehicles/vehicle.base.js — PRODUCTION MERGED VERSION
// Combines:
//   - wzk-prod's 3-layer mixing model (kart/NFSU/COD) with HandlingProfile blend weights
//   - wzk4's multi-type support (CAR, ATV, BUGGY, MOTORCYCLE, FOOT)
//   - wzk4's GLTF loading with procedural fallback
//   - wzk4's damage/health system, nitrous, FPP camera points
//   - wzk4's per-type mesh builders (car, ATV, buggy, motorcycle, character)

import * as THREE from 'three';

// ===== VEHICLE TYPES =====
export const VEHICLE_TYPES = {
  CAR:        { wheels: 4, chassisShape: 'box',     hasDoors: true },
  ATV:        { wheels: 4, chassisShape: 'box',     hasDoors: false, highCG: true, offroadSuspension: true },
  BUGGY:      { wheels: 4, chassisShape: 'open',    hasDoors: false, offroadSuspension: true },
  MOTORCYCLE: { wheels: 4, chassisShape: 'leaner',  hasDoors: false, leanSteer: true },
  FOOT:       { wheels: 0, chassisShape: 'capsule', isCharacter: true }
};

// ===== DEFAULT HANDLING PROFILE (the 3-layer mixing matrix) =====
const DEFAULT_HANDLING_PROFILE = {
  blend: { kart: 0.5, nfsu: 0.4, cod: 0.1 },
  // Layer 1: Mario Kart
  hopImpulse: 8.0, hopCooldown: 0.3,
  driftChargeRate: 65,
  driftChargeTiers: [0, 35, 70, 100],
  boostDuration: [0.4, 0.8, 1.6],
  boostMultiplier: [1.15, 1.3, 1.6],
  driftGripMultiplier: 0.35,
  driftSpeedThreshold: 25,
  // Layer 2: NFS Underground
  slipAnglePeak: 0.18,
  lateralGripFloor: 0.35,
  burnoutTorqueBoost: 1.4,
  burnoutHeatRate: 0.8,
  burnoutHeatDecay: 0.5,
  burnoutHeatThreshold: 0.3,
  burnoutSpeedThreshold: 15,
  tractionRecoveryRate: 2.0,
  baseWheelFriction: 1.8,
  // Layer 3: COD ATV
  weightTransfer: 0.6,
  airPitchLerp: 2.5,
  airRollLerp: 1.8,
  landingSquash: 0.4,
  ragdollThreshold: 14,
  airControlAuthority: 0.3,
  // Shared
  enginePower: 1800,
  maxSteer: 0.55,
  speedSensitiveSteer: 0.3,
  topSpeedKmh: 200,
  suspensionStiffness: 30,
  suspensionDamping: 4.5,
  bodyRollFactor: 0.35,
  chassisMass: 600,
  nitrousCapacity: 100,
  health: 100
};

export class BaseVehicle {
  constructor(entry, ctx) {
    this.entry = entry;
    this.profile = { ...DEFAULT_HANDLING_PROFILE, ...(entry.tuning || {}) };
    this.profile.blend = { ...DEFAULT_HANDLING_PROFILE.blend, ...(entry.tuning?.blend || {}) };
    // Apply character perk modifiers (multipliers on base values)
    const perk = entry.tuning?._charPerk;
    if (perk) {
      for (const [key, mult] of Object.entries(perk)) {
        if (typeof mult === 'number' && typeof this.profile[key] === 'number') {
          this.profile[key] *= mult;
        }
      }
    }
    this.tuning = this.profile; // alias for wzk4 compat
    this.cosmetic = entry.cosmetic || {};
    this.ctx = ctx;
    this.vehicleType = VEHICLE_TYPES[entry.vehicleType] || VEHICLE_TYPES.CAR;

    this.physicsBody = null;
    this.vehicle = null;
    this.sceneObject = null;
    this.wheelMeshes = [];

    // State
    this.speedKmh = 0;
    this.boostTimer = 0;
    this.boostStrength = 0;

    // Layer 1 (Mario Kart)
    this.driftActive = false;
    this.driftTimer = 0;
    this.miniTurboCharge = 0;
    this.hopTimer = 0;
    this.hopVisualOffset = 0;

    // Layer 2 (NFS Underground)
    this.burnoutActive = false;
    this.burnoutHeat = 0;
    this.currentSlipAngle = 0;
    this.lateralGripMod = 1.0;

    // Layer 3 (COD ATV)
    this.bodyRoll = 0;
    this.bodyPitch = 0;
    this.airborne = false;
    this.airTime = 0;
    this.landingSquashVisual = 0;
    this.ragdollActive = false;
    this.prevVelocityY = 0;
    this.leanAngle = 0;

    // Enhanced state (from wzk4)
    this.isGrounded = true;
    this.nitrousAmount = entry.tuning?.nitrousCapacity || 100;
    this.health = entry.tuning?.health || 100;
    this.damageZones = {};

    // GLTF model state
    this.gltfModel = null;
    this.usingFallbackMesh = false;

    // FPP camera
    this.fppCameraTarget = new THREE.Vector3();
    this.tppCameraOffset = new THREE.Vector3(0, 4, -8);
    this.tppLookOffset = new THREE.Vector3(0, 1.5, 4);

    // Audio
    this.engineRPM = 0;
    this.skidIntensity = 0;

    // Particles
    this.smokeParticles = [];
    this.sparkParticles = [];

    // Character-specific (for FOOT type)
    this.stamina = 100;
    this.slideActive = false;
    this.slideTimer = 0;
    this.isSprinting = false;
    this.jumpCooldown = 0;
    this.doubleJumpAvailable = false;
  }

  // ============================================================
  // SPAWN — creates physics body, vehicle controller, visual mesh
  // ============================================================
  spawn(position = [0, 1, 0]) {
    const C = this.ctx.physics.getCANNON();
    const world = this.ctx.physics.getWorld();
    const p = this.profile;

    // Create physics body based on vehicle type
    this._createPhysicsBody(C, world, position);

    // Create RaycastVehicle or character controller
    if (this.vehicleType.wheels > 0) {
      this._createRaycastVehicle(C, world);
    } else {
      this._createCharacterController(C, world);
    }

    // Build visual mesh (sync — fallback first, GLTF loads async)
    this.sceneObject = this._buildMesh();

    // Sync visual to physics immediately
    if (this.sceneObject && this.physicsBody) {
      this.sceneObject.position.copy(this.physicsBody.position);
      this.sceneObject.quaternion.copy(this.physicsBody.quaternion);
      this.ctx.renderer.addObject(this.sceneObject);
    }

    // Try GLTF load async (swaps into sceneObject when ready)
    if (this.cosmetic.modelUrl) {
      this._loadGLTFAsync();
    }

    // Collision events
    this._setupCollisionEvents();

    this.ctx.engine.bus.emit('vehicle:spawned', {
      id: this.entry.id,
      type: this.entry.vehicleType,
      position
    });
    return this;
  }

  // ============================================================
  // PHYSICS BODY CREATION (multi-type)
  // ============================================================
  _createPhysicsBody(C, world, position) {
    const p = this.profile;
    const mass = p.chassisMass;

    let shape;
    switch (this.vehicleType.chassisShape) {
      case 'capsule':
        shape = new C.Capsule(0.4, 1.2);
        break;
      case 'leaner':
        shape = new C.Box(new C.Vec3(0.5, 0.8, 2.0));
        break;
      case 'open':
        shape = new C.Box(new C.Vec3(1.2, 0.5, 2.2));
        break;
      default:
        shape = new C.Box(new C.Vec3(0.9, 0.4, 1.9));
    }

    this.physicsBody = new C.Body({
      mass,
      position: new C.Vec3(...position),
      material: world.defaultMaterial,
      fixedRotation: this.vehicleType.wheels === 0
    });
    this.physicsBody.addShape(shape);
    this.physicsBody.angularDamping = this.vehicleType.highCG ? 0.6 : 0.4;

    if (this.vehicleType.highCG || this.vehicleType.leanSteer) {
      this.physicsBody.angularVelocityFactor = new C.Vec3(1, 0.3, 1);
    }

    this.ctx.physics.addBody(this.physicsBody);
  }

  _createRaycastVehicle(C, world) {
    const p = this.profile;
    this.vehicle = new C.RaycastVehicle({
      chassisBody: this.physicsBody,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2
    });

    const wheelOptions = {
      radius: this.tuning.wheelRadius || 0.4,
      directionLocal: new C.Vec3(0, -1, 0),
      suspensionStiffness: p.suspensionStiffness,
      suspensionRestLength: this.vehicleType.offroadSuspension ? 0.45 : 0.35,
      frictionSlip: p.baseWheelFriction,
      dampingRelaxation: p.suspensionDamping,
      dampingCompression: 3.5,
      maxSuspensionForce: 1e5,
      rollInfluence: this.vehicleType.highCG ? 0.4 : 0.0,
      axleLocal: new C.Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new C.Vec3(),
      maxSuspensionTravel: this.vehicleType.offroadSuspension ? 0.6 : 0.4,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true
    };

    const wheelPositions = this._getWheelPositions();
    wheelPositions.forEach(pos => {
      wheelOptions.chassisConnectionPointLocal.set(...pos);
      this.vehicle.addWheel({ ...wheelOptions });
    });

    this.vehicle.addToWorld(world);
    for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
      this.vehicle.setBrake(0, i);
    }
  }

  _getWheelPositions() {
    const w = this.vehicleType.chassisShape === 'open' ? 1.0 : 0.85;
    const l = this.vehicleType.chassisShape === 'open' ? 1.5 : 1.4;
    return [
      [-w, -0.1, l], [w, -0.1, l],
      [-w, -0.1, -l], [w, -0.1, -l]
    ];
  }

  _createCharacterController(C, world) {
    this.vehicle = {
      type: 'character',
      velocity: new C.Vec3(0, 0, 0),
      onGround: true,
      jumpForce: this.tuning.jumpForce || 8,
      moveSpeed: this.tuning.moveSpeed || 6,
      sprintMultiplier: 1.0
    };
  }

  // ============================================================
  // VISUAL MESH BUILDING (multi-type with quality fallbacks)
  // ============================================================
  /** Public buildMesh — subclasses can override and call super.buildMesh() */
  buildMesh() { return this._buildMesh(); }

  _buildMesh() {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: this.cosmetic.bodyColor || '#ff4d2e',
      metalness: 0.7, roughness: 0.35,
      emissive: this.cosmetic.bodyColor || '#ff4d2e', emissiveIntensity: 0.05
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: this.cosmetic.accentColor || '#ffd23f',
      metalness: 0.5, roughness: 0.4,
      emissive: this.cosmetic.accentColor || '#ffd23f', emissiveIntensity: 0.15
    });
    const wheelMat = new THREE.MeshStandardMaterial({
      color: this.cosmetic.wheelColor || '#0a0a0a', metalness: 0.8, roughness: 0.25
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: '#88ccff', metalness: 0.9, roughness: 0.1,
      transparent: true, opacity: 0.6
    });

    if (this.vehicleType.isCharacter) {
      this._buildCharacterMesh(group, bodyMat, accentMat);
    } else if (this.vehicleType.leanSteer) {
      this._buildMotorcycleMesh(group, bodyMat, accentMat, wheelMat);
    } else if (this.vehicleType.chassisShape === 'open') {
      this._buildBuggyMesh(group, bodyMat, accentMat, wheelMat);
    } else if (this.vehicleType.highCG) {
      this._buildATVMesh(group, bodyMat, accentMat, wheelMat);
    } else {
      this._buildCarMesh(group, bodyMat, accentMat, wheelMat, glassMat);
    }

    this.usingFallbackMesh = true;
    return group;
  }

  _buildCarMesh(group, bodyMat, accentMat, wheelMat, glassMat) {
    const lower = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 3.8), bodyMat);
    lower.position.y = 0.3; lower.castShadow = true; group.add(lower);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.8), glassMat);
    cabin.position.set(0, 0.75, -0.2); group.add(cabin);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 1.2), bodyMat);
    hood.position.set(0, 0.55, 1.3); hood.rotation.x = -0.1; group.add(hood);

    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.4), accentMat);
    spoiler.position.set(0, 0.85, -1.8); group.add(spoiler);
    [[-0.8, 0.65, -1.8], [0.8, 0.65, -1.8]].forEach(pos => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.4), accentMat);
      post.position.set(...pos); group.add(post);
    });

    const headMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4d6', emissiveIntensity: 1.5 });
    const tailMat = new THREE.MeshStandardMaterial({ color: '#ff0033', emissive: '#ff0033', emissiveIntensity: 1.2 });
    [[-0.55, 0.35, 1.92], [0.55, 0.35, 1.92]].forEach(pos => {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, 0.05), headMat);
      l.position.set(...pos); group.add(l);
    });
    [[-0.55, 0.4, -1.92], [0.55, 0.4, -1.92]].forEach(pos => {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.05), tailMat);
      l.position.set(...pos); group.add(l);
    });

    this._addWheels(group, wheelMat, [
      { x: -0.9, y: 0.4, z: 1.4 }, { x: 0.9, y: 0.4, z: 1.4 },
      { x: -0.9, y: 0.4, z: -1.4 }, { x: 0.9, y: 0.4, z: -1.4 }
    ]);

    // Underglow
    const glowMat = new THREE.MeshBasicMaterial({
      color: this.cosmetic.accentColor || '#ffd23f',
      transparent: true, opacity: 0.35,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4.2), glowMat);
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.05;
    group.add(glow);
    this.underglow = glow;
  }

  _buildATVMesh(group, bodyMat, accentMat, wheelMat) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 2.6), bodyMat);
    frame.position.y = 0.5; frame.castShadow = true; group.add(frame);

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.6), accentMat);
    seat.position.set(0, 0.9, -0.2); group.add(seat);

    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2), wheelMat);
    bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.2, 1.0); group.add(bar);

    this._addWheels(group, wheelMat, [
      { x: -0.75, y: 0.5, z: 1.1, r: 0.45 },
      { x: 0.75, y: 0.5, z: 1.1, r: 0.45 },
      { x: -0.7, y: 0.5, z: -1.2, r: 0.5 },
      { x: 0.7, y: 0.5, z: -1.2, r: 0.5 }
    ], true);
  }

  _buildBuggyMesh(group, bodyMat, accentMat, wheelMat) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.4, 3.0), bodyMat);
    frame.position.y = 0.5; frame.castShadow = true; group.add(frame);

    const cageMat = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.9, roughness: 0.2 });
    const frontHoop = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.05, 8, 16, Math.PI), cageMat);
    frontHoop.rotation.x = Math.PI / 2; frontHoop.rotation.z = Math.PI / 2;
    frontHoop.position.set(0, 1.0, 1.0); group.add(frontHoop);
    const rearHoop = frontHoop.clone(); rearHoop.position.set(0, 1.0, -1.0); group.add(rearHoop);

    [[-0.8, 0.8, 0], [0.8, 0.8, 0]].forEach(pos => {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4), cageMat);
      bar.rotation.z = Math.PI / 2; bar.position.set(...pos); group.add(bar);
    });

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.5), accentMat);
    seat.position.set(0, 0.75, 0); group.add(seat);

    const steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 8, 16), wheelMat);
    steeringWheel.position.set(0, 1.0, 0.8); steeringWheel.rotation.y = Math.PI / 2; group.add(steeringWheel);

    this._addWheels(group, wheelMat, [
      { x: -1.0, y: 0.4, z: 1.5, r: 0.5 }, { x: 1.0, y: 0.4, z: 1.5, r: 0.5 },
      { x: -1.0, y: 0.4, z: -1.5, r: 0.5 }, { x: 1.0, y: 0.4, z: -1.5, r: 0.5 }
    ]);
  }

  _buildMotorcycleMesh(group, bodyMat, accentMat, wheelMat) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 2.2), bodyMat);
    frame.position.y = 0.6; frame.castShadow = true; group.add(frame);

    const tank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.8), accentMat);
    tank.position.set(0, 0.95, 0.2); group.add(tank);

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.15, 0.9), bodyMat);
    seat.position.set(0, 0.85, -0.4); group.add(seat);

    const fenderR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.05, 0.4), accentMat);
    fenderR.position.set(0, 0.5, -1.2); group.add(fenderR);
    const fenderF = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.35), accentMat);
    fenderF.position.set(0, 0.5, 1.1); group.add(fenderF);

    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9), wheelMat);
    bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.25, 0.95); group.add(bar);

    const headlight = new THREE.Mesh(
      new THREE.CircleGeometry(0.12, 16),
      new THREE.MeshStandardMaterial({ emissive: '#ffffff', emissiveIntensity: 2 })
    );
    headlight.position.set(0, 0.85, 1.12); group.add(headlight);

    this._addWheels(group, wheelMat, [
      { x: -0.45, y: 0.4, z: 1.15, r: 0.35 }, { x: 0.45, y: 0.4, z: 1.15, r: 0.35 },
      { x: -0.5, y: 0.4, z: -1.15, r: 0.4 }, { x: 0.5, y: 0.4, z: -1.15, r: 0.4 }
    ]);

    [[-0.25, 0.3, -1.15], [0.25, 0.3, -1.15]].forEach(pos => {
      const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.4), wheelMat);
      exhaust.rotation.x = Math.PI / 2; exhaust.position.set(...pos); group.add(exhaust);
    });
  }

  _buildCharacterMesh(group, bodyMat, accentMat) {
    // Anatomically-correct humanoid (not a stick figure)
    // Torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.7, 8), bodyMat);
    torso.position.y = 1.0; torso.castShadow = true; group.add(torso);

    // Head
    const skinMat = new THREE.MeshStandardMaterial({
      color: this.cosmetic.skinTone || '#e0b090', roughness: 0.8
    });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), skinMat);
    head.position.y = 1.55; head.castShadow = true; group.add(head);

    // Helmet or hair
    if (this.cosmetic.hasHelmet) {
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), accentMat);
      helmet.position.y = 1.58; helmet.scale.set(1, 1.2, 1); group.add(helmet);
    } else {
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), accentMat);
      hair.position.y = 1.62; hair.scale.set(1, 0.8, 1); group.add(hair);
    }

    // Eyes
    const eyeMat = new THREE.MeshStandardMaterial({ color: '#1a1a2e', roughness: 0.5 });
    [[-0.07, 1.57, 0.18], [0.07, 1.57, 0.18]].forEach(pos => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), eyeMat);
      eye.position.set(...pos); group.add(eye);
    });

    // Arms (upper + lower with shoulder joint)
    [[-0.4, 1.0, 0], [0.4, 1.0, 0]].forEach(pos => {
      const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.2, 4, 8), bodyMat);
      upperArm.position.set(pos[0], pos[1] + 0.1, pos[2]); group.add(upperArm);
      const lowerArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.15, 4, 8), bodyMat);
      lowerArm.position.set(pos[0], pos[1] - 0.15, pos[2]); group.add(lowerArm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), skinMat);
      hand.position.set(pos[0], pos[1] - 0.3, pos[2]); group.add(hand);
    });

    // Legs (upper + lower with hip joint)
    [[-0.15, 0.5, 0], [0.15, 0.5, 0]].forEach(pos => {
      const upperLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.2, 4, 8), bodyMat);
      upperLeg.position.set(pos[0], pos[1] + 0.05, pos[2]); group.add(upperLeg);
      const lowerLeg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.15, 4, 8), bodyMat);
      lowerLeg.position.set(pos[0], pos[1] - 0.2, pos[2]); group.add(lowerLeg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.06, 0.3), skinMat);
      foot.position.set(pos[0], pos[1] - 0.37, pos[2] + 0.05); group.add(foot);
    });

    // Backpack
    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.15), accentMat);
    backpack.position.set(0, 1.05, -0.2); group.add(backpack);
  }

  _addWheels(group, wheelMat, positions, large = false) {
    positions.forEach((pos) => {
      const radius = pos.r || 0.4;
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, large ? 0.35 : 0.3, large ? 12 : 16),
        wheelMat
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(pos.x, pos.y, pos.z);
      wheel.castShadow = true;
      group.add(wheel);
      this.wheelMeshes.push(wheel);

      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, large ? 0.36 : 0.31, 8),
        new THREE.MeshStandardMaterial({ color: '#888888', metalness: 0.9, roughness: 0.2 })
      );
      rim.rotation.z = Math.PI / 2;
      rim.position.set(pos.x, pos.y, pos.z);
      group.add(rim);
    });
  }

  // ============================================================
  // GLTF ASYNC LOADING (swaps fallback when ready)
  // ============================================================
  async _loadGLTFAsync() {
    try {
      if (!this.ctx.assets?.loadGLTF) return;
      const gltf = await this.ctx.assets.loadGLTF(this.cosmetic.modelUrl);
      this.gltfModel = gltf.scene;
      this.gltfModel.scale.set(
        this.cosmetic.modelScale || 1,
        this.cosmetic.modelScale || 1,
        this.cosmetic.modelScale || 1
      );
      // Swap into sceneObject (preserve parent transform)
      if (this.sceneObject) {
        // Clear fallback children
        while (this.sceneObject.children.length > 0) {
          this.sceneObject.remove(this.sceneObject.children[0]);
        }
        this.sceneObject.add(this.gltfModel);
        this.usingFallbackMesh = false;
        console.log(`[Vehicle] GLTF loaded for ${this.entry.id}`);
      }
    } catch (err) {
      console.warn(`[Vehicle] GLTF load failed for ${this.entry.id}, keeping fallback:`, err.message);
    }
  }

  // ============================================================
  // COLLISION EVENTS (damage system)
  // ============================================================
  _setupCollisionEvents() {
    if (!this.physicsBody) return;
    this.physicsBody.addEventListener('collide', (e) => {
      const impactStrength = Math.abs(e.contact?.getImpactVelocityAlongNormal?.() || 0);

      this.ctx.engine.bus.emit('vehicle:collide', {
        vehicle: this, other: e.body, impactStrength
      });

      // Apply damage on hard impacts
      if (impactStrength > 10) {
        this.health -= impactStrength * 0.5;
        if (this.health <= 0) {
          this.ctx.engine.bus.emit('vehicle:destroyed', { vehicle: this });
        }
      }

      // Camera shake
      if (impactStrength > 20) {
        this.ctx.engine.bus.emit('camera:shake', { intensity: impactStrength * 0.02 });
      }

      this._handleCollision(e);
    });
  }

  _handleCollision(e) {
    const p = this.profile;
    const impactSpeed = Math.abs(this.prevVelocityY);
    if (impactSpeed > p.ragdollThreshold && !this.ragdollActive) {
      this.ragdollActive = true;
      this.ctx.engine.bus.emit('vehicle:ragdoll', { id: this.entry.id, impact: impactSpeed });
    }
  }

  // ============================================================
  // 3-LAYER MIXING UPDATE
  // ============================================================
  update(dt) {
    if (!this.physicsBody || !this.vehicle) return;
    const input = this.ctx.input;

    // Character vs vehicle update
    if (this.vehicleType.isCharacter) {
      this._updateCharacter(dt, input);
    } else {
      this._updateVehicleLayers(dt, input);
    }

    // Sync visual
    this._syncVisual(dt);

    // Update particles
    this._updateParticles(dt);

    // Update audio state
    this._updateAudioState();

    // Underglow pulse
    if (this.underglow && !this.vehicleType.isCharacter) {
      const intensity = 0.3 + (this.boostTimer > 0 ? 0.4 : 0) + (this.driftActive ? 0.2 : 0);
      this.underglow.material.opacity = intensity + Math.sin(performance.now() * 0.005) * 0.05;
    }
  }

  _updateVehicleLayers(dt, input) {
    const p = this.profile;

    // Read input
    const throttle = input.getAxis('throttle') || (input.isPressed('throttle') ? 1 : 0);
    const brake = input.getAxis('brake') || (input.isPressed('brake') ? 1 : 0);
    const steerInput = (input.isPressed('steerLeft') ? -1 : 0) + (input.isPressed('steerRight') ? 1 : 0)
                    + (input.getAxis('steerLeft') ? -input.getAxis('steerLeft') : 0)
                    + (input.getAxis('steerRight') ? input.getAxis('steerRight') : 0);
    const steer = Math.max(-1, Math.min(1, steerInput));
    const driftHeld = input.isPressed('drift') || input.isPressed('burnout');
    const nitrousHeld = input.isPressed('nitrous');

    // Compute speed
    const v = this.physicsBody.velocity;
    this.speedKmh = Math.sqrt(v.x * v.x + v.z * v.z) * 3.6;
    this.prevVelocityY = v.y;

    // Nitrous
    if (nitrousHeld && this.nitrousAmount > 0) {
      this.nitrousAmount = Math.max(0, this.nitrousAmount - dt * 30);
      this.boostTimer = Math.max(this.boostTimer, 0.3);
    }

    // Airborne detection
    this._updateAirborneState(dt);

    // LAYER 1: Mario Kart (hop + drift + mini-turbo)
    this._updateKartLayer(dt, { throttle, brake, steer, driftHeld });

    // LAYER 2: NFS Underground (slip + burnout + launch) — only when grounded
    if (!this.airborne) {
      this._updateNFSULayer(dt, { throttle, brake, steer, driftHeld });
    }

    // LAYER 3: COD ATV (weight transfer + airborne + landing)
    this._updateCODLayer(dt, { throttle, brake, steer });

    // Boost timer
    if (this.boostTimer > 0) {
      this.boostTimer -= dt;
      const tier = Math.min(2, Math.floor(this.boostStrength * 2));
      const mult = p.boostMultiplier[tier] || 1.3;
      const boostForce = p.enginePower * mult;
      this.vehicle.applyEngineForce(boostForce, 2);
      this.vehicle.applyEngineForce(boostForce, 3);
    }
  }

  // Layer 1: Mario Kart
  _updateKartLayer(dt, { throttle, brake, steer, driftHeld }) {
    const p = this.profile;
    const blend = p.blend.kart;

    // Hop
    if (driftHeld && this.hopTimer <= 0 && this.speedKmh > 10 && !this.airborne) {
      this.hopTimer = p.hopCooldown;
      const C = this.ctx.physics.getCANNON();
      this.physicsBody.applyImpulse(
        new C.Vec3(0, p.hopImpulse * blend, 0),
        new C.Vec3(0, 0, 0)
      );
      this.hopVisualOffset = 0.3 * blend;
      this.ctx.engine.bus.emit('vehicle:hop', { id: this.entry.id });
    }
    if (this.hopTimer > 0) this.hopTimer -= dt;
    this.hopVisualOffset *= 0.85;

    // Drift
    const canDrift = driftHeld && Math.abs(steer) > 0.3 && this.speedKmh > p.driftSpeedThreshold && !this.airborne;
    if (canDrift) {
      if (!this.driftActive) {
        this.driftActive = true; this.driftTimer = 0;
        this.ctx.engine.bus.emit('vehicle:driftStart', { id: this.entry.id });
      }
      this.driftTimer += dt;
      const driftGrip = p.baseWheelFriction * p.driftGripMultiplier * (1 - blend * 0.3);
      this.vehicle.wheelInfos[2].frictionSlip = driftGrip;
      this.vehicle.wheelInfos[3].frictionSlip = driftGrip;
      this.miniTurboCharge = Math.min(100, this.miniTurboCharge + p.driftChargeRate * blend * dt);
    } else {
      if (this.driftActive) {
        this.driftActive = false;
        if (this.miniTurboCharge > p.driftChargeTiers[1]) {
          let tier = 0;
          for (let i = p.driftChargeTiers.length - 1; i >= 0; i--) {
            if (this.miniTurboCharge >= p.driftChargeTiers[i]) { tier = i; break; }
          }
          const dur = p.boostDuration[Math.min(tier, p.boostDuration.length - 1)];
          const mult = p.boostMultiplier[Math.min(tier, p.boostMultiplier.length - 1)];
          this.applyBoost(mult, dur);
          this.ctx.engine.bus.emit('vehicle:miniTurbo', { id: this.entry.id, charge: this.miniTurboCharge, tier });
        }
        this.miniTurboCharge = 0;
        this.ctx.engine.bus.emit('vehicle:driftEnd', { id: this.entry.id });
      }
      this.vehicle.wheelInfos[2].frictionSlip = p.baseWheelFriction;
      this.vehicle.wheelInfos[3].frictionSlip = p.baseWheelFriction;
    }
  }

  // Layer 2: NFS Underground
  _updateNFSULayer(dt, { throttle, brake, steer, driftHeld }) {
    const p = this.profile;
    const blend = p.blend.nfsu;
    const C = this.ctx.physics.getCANNON();

    // Slip angle
    const vel = this.physicsBody.velocity;
    const forward = new C.Vec3(0, 0, 1);
    this.physicsBody.quaternion.vmult(forward, forward);
    const right = new C.Vec3(1, 0, 0);
    this.physicsBody.quaternion.vmult(right, right);
    const fwdSpeed = vel.dot(forward);
    const latSpeed = vel.dot(right);
    this.currentSlipAngle = Math.atan2(Math.abs(latSpeed), Math.max(0.1, Math.abs(fwdSpeed)));

    // Pacejka-lite grip
    const slipRatio = Math.min(1, this.currentSlipAngle / p.slipAnglePeak);
    const targetGripMod = 1.0 - (1.0 - p.lateralGripFloor) * Math.pow(slipRatio, 2);
    const recovery = p.tractionRecoveryRate * blend * dt;
    if (targetGripMod < this.lateralGripMod) {
      this.lateralGripMod = Math.max(targetGripMod, this.lateralGripMod - recovery * 2);
    } else {
      this.lateralGripMod = Math.min(targetGripMod, this.lateralGripMod + recovery);
    }
    const slipFriction = p.baseWheelFriction * (1 - blend * (1 - this.lateralGripMod));
    if (!this.driftActive) {
      for (let i = 0; i < 4; i++) {
        this.vehicle.wheelInfos[i].frictionSlip = slipFriction;
      }
    }

    // Burnout
    if (throttle > 0.5 && brake > 0.5 && this.speedKmh < p.burnoutSpeedThreshold) {
      if (!this.burnoutActive) {
        this.burnoutActive = true;
        this.ctx.engine.bus.emit('vehicle:burnout', { id: this.entry.id });
      }
      const burnForce = p.enginePower * p.burnoutTorqueBoost * blend;
      this.vehicle.applyEngineForce(burnForce, 2);
      this.vehicle.applyEngineForce(burnForce, 3);
      this.vehicle.setBrake(0.1, 0); this.vehicle.setBrake(0.1, 1);
      this.vehicle.setBrake(0.9, 2); this.vehicle.setBrake(0.9, 3);
      this.burnoutHeat = Math.min(1, this.burnoutHeat + p.burnoutHeatRate * dt);
    } else {
      if (this.burnoutActive) {
        this.burnoutActive = false;
        if (this.burnoutHeat > p.burnoutHeatThreshold) {
          this.applyBoost(1 + this.burnoutHeat * 0.5, this.burnoutHeat * 1.2);
          this.ctx.engine.bus.emit('vehicle:burnoutLaunch', { id: this.entry.id, heat: this.burnoutHeat });
        }
        this.ctx.engine.bus.emit('vehicle:burnoutEnd', { id: this.entry.id });
      }
      this.burnoutHeat = Math.max(0, this.burnoutHeat - p.burnoutHeatDecay * dt);

      // Normal throttle/brake
      if (throttle > 0.05) {
        const power = p.enginePower * throttle;
        this.vehicle.applyEngineForce(power, 2);
        this.vehicle.applyEngineForce(power, 3);
        for (let i = 0; i < 4; i++) this.vehicle.setBrake(0, i);
      } else if (brake > 0.05) {
        this.vehicle.applyEngineForce(0, 2); this.vehicle.applyEngineForce(0, 3);
        const bf = 20 * brake;
        for (let i = 0; i < 4; i++) this.vehicle.setBrake(bf, i);
      } else {
        this.vehicle.applyEngineForce(0, 2); this.vehicle.applyEngineForce(0, 3);
        this.vehicle.setBrake(2, 0); this.vehicle.setBrake(2, 1);
        this.vehicle.setBrake(0, 2); this.vehicle.setBrake(0, 3);
      }
    }

    // Steering
    const speedFactor = Math.max(p.speedSensitiveSteer, 1 - this.speedKmh / p.topSpeedKmh);
    const steerAngle = p.maxSteer * steer * speedFactor;
    this.vehicle.setSteeringValue(steerAngle, 0);
    this.vehicle.setSteeringValue(steerAngle, 1);
    this._currentSteerAngle = steerAngle;

    // Motorcycle lean
    if (this.vehicleType.leanSteer) {
      const targetLean = -steer * (this.tuning.leanFactor || 1.5) * Math.min(1, this.speedKmh / 60);
      this.leanAngle += (targetLean - this.leanAngle) * Math.min(1, dt * 8);
    }
  }

  // Layer 3: COD ATV
  _updateCODLayer(dt, { throttle, brake, steer }) {
    const p = this.profile;
    const blend = p.blend.cod;
    const C = this.ctx.physics.getCANNON();

    if (!this.airborne) {
      // Weight transfer
      const speedFactor = Math.min(1, this.speedKmh / 80);
      const targetRoll = -steer * p.weightTransfer * blend * speedFactor;
      this.bodyRoll += (targetRoll - this.bodyRoll) * Math.min(1, dt * 6);

      const targetPitch = (brake * 0.3 - throttle * 0.15) * blend * speedFactor;
      this.bodyPitch += (targetPitch - this.bodyPitch) * Math.min(1, dt * 5);

      // Roll torque for loose feel
      if (Math.abs(steer) > 0.3 && this.speedKmh > 30) {
        const rollTorque = -steer * p.weightTransfer * blend * 50;
        this.physicsBody.applyTorque(new C.Vec3(0, 0, rollTorque));
      }
    } else {
      // Airborne
      this.airTime += dt;
      const pitchTarget = -brake * p.airPitchLerp * blend;
      this.bodyPitch += (pitchTarget - this.bodyPitch) * Math.min(1, dt * p.airPitchLerp);
      const rollTarget = steer * p.airRollLerp * blend;
      this.bodyRoll += (rollTarget - this.bodyRoll) * Math.min(1, dt * p.airRollLerp);

      if (blend > 0.05) {
        const authority = p.airControlAuthority * blend;
        const angVel = this.physicsBody.angularVelocity;
        angVel.x += pitchTarget * authority * dt * 2;
        angVel.z += rollTarget * authority * dt * 2;
      }
    }

    // Landing squash
    if (this.landingSquashVisual > 0) {
      this.landingSquashVisual *= 0.85;
      if (this.landingSquashVisual < 0.01) this.landingSquashVisual = 0;
    }
  }

  _updateAirborneState(dt) {
    let grounded = false;
    if (this.vehicle.wheelInfos) {
      for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
        if (this.vehicle.wheelInfos[i].isInContact) { grounded = true; break; }
      }
    } else {
      grounded = this.vehicle.onGround;
    }
    this.isGrounded = grounded;

    const wasAirborne = this.airborne;
    this.airborne = !grounded;

    if (wasAirborne && !this.airborne) {
      const impactSpeed = Math.abs(this.prevVelocityY);
      const p = this.profile;
      if (impactSpeed > 5) {
        this.landingSquashVisual = Math.min(1, impactSpeed / 20) * p.landingSquash * p.blend.cod;
        this.ctx.engine.bus.emit('vehicle:landing', { id: this.entry.id, impact: impactSpeed });
      }
      if (impactSpeed > p.ragdollThreshold) {
        this.ragdollActive = true;
        this.ctx.engine.bus.emit('vehicle:ragdoll', { id: this.entry.id, impact: impactSpeed });
        const C = this.ctx.physics.getCANNON();
        this.physicsBody.applyTorque(new C.Vec3(
          (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100
        ));
      }
      this.airTime = 0;
    } else if (!wasAirborne && this.airborne) {
      this.airTime = 0;
    }
  }

  // Character update (for FOOT type)
  _updateCharacter(dt, input) {
    const v = this.physicsBody.velocity;
    this.speedKmh = Math.sqrt(v.x * v.x + v.z * v.z) * 3.6;

    // Sprint
    if (input.isPressed('throttle') && this.stamina > 0) {
      this.isSprinting = true;
      this.stamina = Math.max(0, this.stamina - dt * 25);
      this.vehicle.sprintMultiplier = this.tuning.sprintMultiplier || 1.8;
    } else {
      this.isSprinting = false;
      this.vehicle.sprintMultiplier = 1.0;
      this.stamina = Math.min(100, this.stamina + dt * 15);
    }

    // Jump
    if (input.isPressed('drift') && this.vehicle.onGround && this.jumpCooldown <= 0) {
      v.y = this.vehicle.jumpForce;
      this.vehicle.onGround = false;
      this.jumpCooldown = 0.5;
      this.ctx.engine.bus.emit('character:jump', { id: this.entry.id });
    }
    if (this.jumpCooldown > 0) this.jumpCooldown -= dt;

    // Movement
    const moveSpeed = this.vehicle.moveSpeed * this.vehicle.sprintMultiplier;
    const steer = (input.isPressed('steerLeft') ? -1 : 0) + (input.isPressed('steerRight') ? 1 : 0);
    const forward = input.isPressed('throttle') ? 1 : (input.isPressed('brake') ? -1 : 0);

    // Simple character movement
    if (forward !== 0) {
      v.x = forward * moveSpeed * Math.sin(this._characterYaw || 0);
      v.z = forward * moveSpeed * Math.cos(this._characterYaw || 0);
    }
    if (steer !== 0) {
      this._characterYaw = (this._characterYaw || 0) + steer * dt * 3;
    }
  }

  // ============================================================
  // VISUAL SYNC
  // ============================================================
  _syncVisual(dt) {
    if (!this.sceneObject || !this.physicsBody) return;
    const p = this.profile;

    this.sceneObject.position.copy(this.physicsBody.position);
    this.sceneObject.position.y += this.hopVisualOffset;
    this.sceneObject.quaternion.copy(this.physicsBody.quaternion);

    // Body roll + pitch (Layer 3)
    this.sceneObject.rotateZ(this.bodyRoll);
    this.sceneObject.rotateX(this.bodyPitch);

    // Motorcycle lean
    if (this.vehicleType.leanSteer) {
      this.sceneObject.rotateZ(this.leanAngle);
    }

    // Landing squash
    if (this.landingSquashVisual > 0) {
      const squash = 1 - this.landingSquashVisual * 0.2;
      this.sceneObject.scale.y = squash;
      this.sceneObject.scale.x = 1 + this.landingSquashVisual * 0.1;
      this.sceneObject.scale.z = 1 + this.landingSquashVisual * 0.1;
    } else {
      this.sceneObject.scale.set(1, 1, 1);
    }

    // Wheels
    const steerAngle = this._currentSteerAngle || 0;
    for (let i = 0; i < this.wheelMeshes.length; i++) {
      const wheel = this.wheelMeshes[i];
      if (!wheel) continue;
      if (i < 2) wheel.rotation.y = steerAngle;
      wheel.rotation.x -= this.speedKmh * dt * 0.05;
    }

    // Update FPP camera target
    this.fppCameraTarget.set(
      this.physicsBody.position.x,
      this.physicsBody.position.y + (this.tuning.cockpitHeight || 0.6),
      this.physicsBody.position.z
    );
  }

  _updateParticles(dt) {
    // Smoke particles decay
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      if (p.userData) {
        p.userData.life -= dt;
        if (p.userData.life <= 0) {
          this.ctx.renderer.removeObject(p);
          this.smokeParticles.splice(i, 1);
        } else {
          p.scale.multiplyScalar(1 + dt * 2);
          if (p.material) p.material.opacity = Math.max(0, (p.material.opacity || 0.5) - dt * 0.5);
        }
      }
    }
  }

  _updateAudioState() {
    // Engine RPM normalized 0-1
    const speedRatio = Math.min(1, this.speedKmh / (this.profile.topSpeedKmh || 200));
    this.engineRPM = speedRatio * 0.8 + (this.boostTimer > 0 ? 0.2 : 0);
    // Skid intensity
    this.skidIntensity = this.driftActive ? 0.8 : (this.burnoutActive ? 1.0 : 0);
  }

  // ============================================================
  // PUBLIC API
  // ============================================================
  applyBoost(multiplier = 1.3, durationSec = 0.8) {
    this.boostTimer = Math.max(this.boostTimer, durationSec);
    this.boostStrength = multiplier / 1.6;
  }

  getSpeedKmh() { return this.speedKmh; }

  getFPPPosition() {
    if (!this.physicsBody) return new THREE.Vector3();
    return new THREE.Vector3(
      this.physicsBody.position.x,
      this.physicsBody.position.y + (this.tuning.cockpitHeight || 0.6),
      this.physicsBody.position.z
    );
  }

  getDebugState() {
    return {
      speed: Math.round(this.speedKmh),
      drift: this.driftActive,
      driftCharge: Math.round(this.miniTurboCharge),
      burnout: this.burnoutActive,
      burnoutHeat: Math.round(this.burnoutHeat * 100) / 100,
      slipAngle: Math.round(this.currentSlipAngle * 1000) / 1000,
      lateralGrip: Math.round(this.lateralGripMod * 100) / 100,
      airborne: this.airborne,
      airTime: Math.round(this.airTime * 100) / 100,
      bodyRoll: Math.round(this.bodyRoll * 100) / 100,
      bodyPitch: Math.round(this.bodyPitch * 100) / 100,
      landingSquash: Math.round(this.landingSquashVisual * 100) / 100,
      ragdoll: this.ragdollActive,
      boost: this.boostTimer > 0,
      nitrous: Math.round(this.nitrousAmount),
      health: Math.round(this.health),
      usingFallback: this.usingFallbackMesh,
      vehicleType: this.entry.vehicleType || 'CAR'
    };
  }

  despawn() {
    const world = this.ctx.physics.getWorld();
    if (this.vehicle?.removeFromWorld) this.vehicle.removeFromWorld(world);
    this.ctx.physics.removeBody(this.physicsBody);
    if (this.sceneObject) this.ctx.renderer.removeObject(this.sceneObject);
    this.ctx.engine.bus.emit('vehicle:despawned', { id: this.entry.id });
  }
}

export default BaseVehicle;
