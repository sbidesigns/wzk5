// assets/models/character-models.js
// Character Model Definitions — Procedural humanoid character generation
// Generates recognizable character meshes for each of the 9 playable characters

import * as THREE from 'three';

// ============================================================================
// SHARED GEOMETRY CACHE FOR CHARACTERS
// ============================================================================

const charGeometryCache = new Map();

function getCharCachedGeometry(key, factory) {
  if (!charGeometryCache.has(key)) {
    charGeometryCache.set(key, factory());
  }
  return charGeometryCache.get(key).clone();
}

function clearCharGeometryCache() {
  charGeometryCache.clear();
}

// ============================================================================
// CHARACTER MATERIAL FACTORIES — Neon underground racing theme
// ============================================================================

function createCharMaterial({ color = 0xffffff, metalness = 0.3, roughness = 0.6, emissive = 0x000000, emissiveIntensity = 0, transparent = false, opacity = 1 }) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    emissive,
    emissiveIntensity,
    transparent,
    opacity
  });
}

function createSkinMaterial(baseColor = 0xdb995a) {
  return createCharMaterial({ color: baseColor, metalness: 0, roughness: 0.7 });
}

function createNeonCharMaterial(color, intensity = 2) {
  return createCharMaterial({
    color: 0x111111,
    metalness: 0.8,
    roughness: 0.2,
    emissive: color,
    emissiveIntensity: intensity
  });
}

function createFabricMaterial(color, roughness = 0.75) {
  return createCharMaterial({ color, metalness: 0, roughness });
}

function createLeatherMaterial(color = 0x222222) {
  return createCharMaterial({ color, metalness: 0.2, roughness: 0.55 });
}

function createMetalCharMaterial(color = 0xaaaaaa) {
  return createCharMaterial({ color, metalness: 0.95, roughness: 0.15 });
}

function createGlassCharMaterial(tint = 0x88ccff) {
  return createCharMaterial({ 
    color: tint, 
    metalness: 0.2, 
    roughness: 0.05, 
    transparent: true, 
    opacity: 0.5 
  });
}

// ============================================================================
// BASE HUMANOID BUILDER — Shared skeleton structure
// ============================================================================

class HumanoidBuilder {
  constructor() {
    this.parts = new Map();
    this.group = new THREE.Group();
  }
  
  // Core body parts with standard proportions (height ~1.8 units)
  buildHead(position = { x: 0, y: 1.65, z: 0 }, scale = 1) {
    const geo = getCharCachedGeometry('humanoid_head', () =>
      new THREE.SphereGeometry(0.12 * scale, 16, 16)
    );
    const mesh = new THREE.Mesh(geo, createSkinMaterial());
    mesh.position.set(position.x, position.y, position.z);
    mesh.name = 'head';
    this.parts.set('head', mesh);
    this.group.add(mesh);
    return this;
  }
  
  buildTorso(position = { x: 0, y: 1.35, z: 0 }, scale = 1) {
    const geo = getCharCachedGeometry('humanoid_torso', () =>
      new THREE.CapsuleGeometry(0.18 * scale, 0.35 * scale, 6, 12)
    );
    const mesh = new THREE.Mesh(geo, createFabricMaterial(0x333333));
    mesh.position.set(position.x, position.y, position.z);
    mesh.name = 'torso';
    this.parts.set('torso', mesh);
    this.group.add(mesh);
    return this;
  }
  
  buildUpperArm(side = 'left', position = { x: -0.25, y: 1.45, z: 0 }, rotation = { x: 0, y: 0, z: 0 }) {
    const geo = getCharCachedGeometry('humanoid_upper_arm', () =>
      new THREE.CapsuleGeometry(0.05, 0.22, 4, 8)
    );
    const mesh = new THREE.Mesh(geo, createSkinMaterial());
    const xPos = side === 'left' ? -Math.abs(position.x) : Math.abs(position.x);
    mesh.position.set(xPos, position.y, position.z);
    mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    mesh.name = `upperArm_${side}`;
    this.parts.set(`upperArm_${side}`, mesh);
    this.group.add(mesh);
    return this;
  }
  
  buildLowerArm(side = 'left', position = { x: -0.32, y: 1.18, z: 0 }, rotation = { x: 0, y: 0, z: 0 }) {
    const geo = getCharCachedGeometry('humanoid_lower_arm', () =>
      new THREE.CapsuleGeometry(0.04, 0.2, 4, 8)
    );
    const mesh = new THREE.Mesh(geo, createSkinMaterial());
    const xPos = side === 'left' ? -Math.abs(position.x) : Math.abs(position.x);
    mesh.position.set(xPos, position.y, position.z);
    mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    mesh.name = `lowerArm_${side}`;
    this.parts.set(`lowerArm_${side}`, mesh);
    this.group.add(mesh);
    return this;
  }
  
  buildHand(side = 'left', position = { x: -0.36, y: 0.98, z: 0 }) {
    const geo = getCharCachedGeometry('humanoid_hand', () =>
      new THREE.SphereGeometry(0.05, 8, 8)
    );
    const mesh = new THREE.Mesh(geo, createSkinMaterial());
    const xPos = side === 'left' ? -Math.abs(position.x) : Math.abs(position.x);
    mesh.position.set(xPos, position.y, position.z);
    mesh.name = `hand_${side}`;
    this.parts.set(`hand_${side}`, mesh);
    this.group.add(mesh);
    return this;
  }
  
  buildUpperLeg(side = 'left', position = { x: -0.1, y: 0.95, z: 0 }, rotation = { x: 0, y: 0, z: 0 }) {
    const geo = getCharCachedGeometry('humanoid_upper_leg', () =>
      new THREE.CapsuleGeometry(0.075, 0.32, 4, 8)
    );
    const mesh = new THREE.Mesh(geo, createFabricMaterial(0x444444));
    const xPos = side === 'left' ? -Math.abs(position.x) : Math.abs(position.x);
    mesh.position.set(xPos, position.y, position.z);
    mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    mesh.name = `upperLeg_${side}`;
    this.parts.set(`upperLeg_${side}`, mesh);
    this.group.add(mesh);
    return this;
  }
  
  buildLowerLeg(side = 'left', position = { x: -0.1, y: 0.58, z: 0 }, rotation = { x: 0, y: 0, z: 0 }) {
    const geo = getCharCachedGeometry('humanoid_lower_leg', () =>
      new THREE.CapsuleGeometry(0.055, 0.3, 4, 8)
    );
    const mesh = new THREE.Mesh(geo, createFabricMaterial(0x444444));
    const xPos = side === 'left' ? -Math.abs(position.x) : Math.abs(position.x);
    mesh.position.set(xPos, position.y, position.z);
    mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    mesh.name = `lowerLeg_${side}`;
    this.parts.set(`lowerLeg_${side}`, mesh);
    this.group.add(mesh);
    return this;
  }
  
  buildFoot(side = 'left', position = { x: -0.1, y: 0.08, z: 0 }) {
    const geo = getCharCachedGeometry('humanoid_foot', () =>
      new THREE.BoxGeometry(0.09, 0.07, 0.16)
    );
    const mesh = new THREE.Mesh(geo, createFabricMaterial(0x222222));
    const xPos = side === 'left' ? -Math.abs(position.x) : Math.abs(position.x);
    mesh.position.set(xPos, position.y, position.z);
    mesh.name = `foot_${side}`;
    this.parts.set(`foot_${side}`, mesh);
    this.group.add(mesh);
    return this;
  }
  
  buildFullBody() {
    return this
      .buildHead()
      .buildTorso()
      .buildUpperArm('left')
      .buildUpperArm('right')
      .buildLowerArm('left')
      .buildLowerArm('right')
      .buildHand('left')
      .buildHand('right')
      .buildUpperLeg('left')
      .buildUpperLeg('right')
      .buildLowerLeg('left')
      .buildLowerLeg('right')
      .buildFoot('left')
      .buildFoot('right');
  }
  
  getPart(name) {
    return this.parts.get(name);
  }
  
  setMaterial(partName, material) {
    const part = this.parts.get(partName);
    if (part) part.material = material;
    return this;
  }
  
  getResult() {
    return this.group;
  }
}

// ============================================================================
// ANIMATION KEYFRAME DATA STRUCTURES
// ============================================================================

export class AnimationKeyframes {
  constructor(name, duration = 1.0) {
    this.name = name;
    this.duration = duration;
    this.tracks = new Map(); // partName -> [{ time, position?, rotation?, scale? }]
  }
  
  addTrack(partName, keyframes) {
    this.tracks.set(partName, keyframes);
    return this;
  }
  
  getTrack(partName) {
    return this.tracks.get(partName) || [];
  }
  
  getKeyframeAt(partName, time) {
    const track = this.getTrack(partName);
    if (!track.length) return null;
    
    // Find surrounding keyframes and interpolate
    for (let i = 0; i < track.length - 1; i++) {
      if (time >= track[i].time && time <= track[i + 1].time) {
        const t = (time - track[i].time) / (track[i + 1].time - track[i].time);
        return {
          position: track[i].position && track[i + 1].position ? {
            x: track[i].position.x + (track[i + 1].position.x - track[i].position.x) * t,
            y: track[i].position.y + (track[i + 1].position.y - track[i].position.y) * t,
            z: track[i].position.z + (track[i + 1].position.z - track[i].position.z) * t
          } : track[i].position,
          rotation: track[i].rotation && track[i + 1].rotation ? {
            x: track[i].rotation.x + (track[i + 1].rotation.x - track[i].rotation.x) * t,
            y: track[i].rotation.y + (track[i + 1].rotation.y - track[i].rotation.y) * t,
            z: track[i].rotation.z + (track[i + 1].rotation.z - track[i].rotation.z) * t
          } : track[i].rotation
        };
      }
    }
    
    return track[track.length - 1];
  }
}

// Pre-built animation templates
export function getIdleAnimationTemplate() {
  const anim = new AnimationKeyframes('idle', 2.0);
  
  // Subtle breathing motion on torso
  anim.addTrack('torso', [
    { time: 0, position: { x: 0, y: 1.35, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
    { time: 1.0, position: { x: 0, y: 1.37, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
    { time: 2.0, position: { x: 0, y: 1.35, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
  ]);
  
  // Head slight bob
  anim.addTrack('head', [
    { time: 0, position: { x: 0, y: 1.65, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
    { time: 1.0, position: { x: 0, y: 1.67, z: 0 }, rotation: { x: 0.02, y: 0, z: 0 } },
    { time: 2.0, position: { x: 0, y: 1.65, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
  ]);
  
  // Arms relaxed swing
  ['left', 'right'].forEach((side, idx) => {
    const sign = side === 'left' ? -1 : 1;
    anim.addTrack(`upperArm_${side}`, [
      { time: 0, rotation: { x: 0.05 * sign, y: 0, z: 0.02 * sign } },
      { time: 1.0, rotation: { x: -0.03 * sign, y: 0, z: -0.02 * sign } },
      { time: 2.0, rotation: { x: 0.05 * sign, y: 0, z: 0.02 * sign } }
    ]);
  });
  
  return anim;
}

export function getRunAnimationTemplate(speed = 'normal') {
  const durations = { slow: 1.2, normal: 0.8, fast: 0.5 };
  const anim = new AnimationKeyframes('run', durations[speed] || 0.8);
  const intensity = speed === 'fast' ? 1.5 : speed === 'slow' ? 0.7 : 1;
  
  // Torso lean forward
  anim.addTrack('torso', [
    { time: 0, position: { x: 0, y: 1.33, z: 0 }, rotation: { x: 0.15 * intensity, y: 0, z: 0 } },
    { time: 0.5, position: { x: 0, y: 1.31, z: 0 }, rotation: { x: 0.18 * intensity, y: 0, z: 0 } },
    { time: durations[speed] || 0.8, position: { x: 0, y: 1.33, z: 0 }, rotation: { x: 0.15 * intensity, y: 0, z: 0 } }
  ]);
  
  // Head stable
  anim.addTrack('head', [
    { time: 0, position: { x: 0, y: 1.64, z: 0.02 }, rotation: { x: -0.1 * intensity, y: 0, z: 0 } },
    { time: (durations[speed] || 0.8) / 2, position: { x: 0, y: 1.66, z: 0.02 }, rotation: { x: -0.08 * intensity, y: 0, z: 0 } },
    { time: durations[speed] || 0.8, position: { x: 0, y: 1.64, z: 0.02 }, rotation: { x: -0.1 * intensity, y: 0, z: 0 } }
  ]);
  
  // Arm swing (opposite to legs)
  ['left', 'right'].forEach((side) => {
    const sign = side === 'left' ? 1 : -1;
    anim.addTrack(`upperArm_${side}`, [
      { time: 0, rotation: { x: 0.6 * sign * intensity, y: 0, z: 0.1 * sign } },
      { time: (durations[speed] || 0.8) / 2, rotation: { x: -0.6 * sign * intensity, y: 0, z: -0.1 * sign } },
      { time: durations[speed] || 0.8, rotation: { x: 0.6 * sign * intensity, y: 0, z: 0.1 * sign } }
    ]);
    
    anim.addTrack(`lowerArm_${side}`, [
      { time: 0, rotation: { x: 0.8 * sign * intensity, y: 0, z: 0 } },
      { time: (durations[speed] || 0.8) / 2, rotation: { x: -0.4 * sign * intensity, y: 0, z: 0 } },
      { time: durations[speed] || 0.8, rotation: { x: 0.8 * sign * intensity, y: 0, z: 0 } }
    ]);
  });
  
  // Leg pump
  ['left', 'right'].forEach((side, idx) => {
    const sign = side === 'left' ? 1 : -1;
    const offset = idx * ((durations[speed] || 0.8) / 2);
    
    anim.addTrack(`upperLeg_${side}`, [
      { time: 0, rotation: { x: 0.7 * sign * intensity, y: 0, z: 0 } },
      { time: (durations[speed] || 0.8) / 2, rotation: { x: -0.5 * sign * intensity, y: 0, z: 0 } },
      { time: durations[speed] || 0.8, rotation: { x: 0.7 * sign * intensity, y: 0, z: 0 } }
    ]);
    
    anim.addTrack(`lowerLeg_${side}`, [
      { time: 0, rotation: { x: 0.2 * sign * intensity, y: 0, z: 0 } },
      { time: (durations[speed] || 0.8) / 2, rotation: { x: 0.8 * sign * intensity, y: 0, z: 0 } },
      { time: durations[speed] || 0.8, rotation: { x: 0.2 * sign * intensity, y: 0, z: 0 } }
    ]);
  });
  
  // Body bounce
  anim.addTrack('torso', [
    { time: 0, position: { x: 0, y: 1.33, z: 0 } },
    { time: (durations[speed] || 0.8) / 4, position: { x: 0, y: 1.30, z: 0 } },
    { time: (durations[speed] || 0.8) / 2, position: { x: 0, y: 1.33, z: 0 } },
    { time: (durations[speed] || 0.8) * 3/4, position: { x: 0, y: 1.30, z: 0 } },
    { time: durations[speed] || 0.8, position: { x: 0, y: 1.33, z: 0 } }
  ]);
  
  return anim;
}

export function getCelebrateAnimationTemplate(style = 'victory') {
  const anim = new AnimationKeyframes('celebrate', style === 'epic' ? 3.0 : 2.0);
  
  switch (style) {
    case 'victory':
      // Arms raised in V shape
      anim.addTrack('upperArm_left', [
        { time: 0, rotation: { x: -2.2, y: 0, z: -0.3 } },
        { time: 0.3, rotation: { x: -2.4, y: 0.2, z: -0.4 } },
        { time: 0.6, rotation: { x: -2.2, y: 0, z: -0.3 } },
        { time: 2.0, rotation: { x: -2.2, y: 0, z: -0.3 } }
      ]);
      anim.addTrack('upperArm_right', [
        { time: 0, rotation: { x: -2.2, y: 0, z: 0.3 } },
        { time: 0.3, rotation: { x: -2.4, y: -0.2, z: 0.4 } },
        { time: 0.6, rotation: { x: -2.2, y: 0, z: 0.3 } },
        { time: 2.0, rotation: { x: -2.2, y: 0, z: 0.3 } }
      ]);
      // Jump bounce
      anim.addTrack('torso', [
        { time: 0, position: { x: 0, y: 1.35, z: 0 } },
        { time: 0.2, position: { x: 0, y: 1.55, z: 0 } },
        { time: 0.4, position: { x: 0, y: 1.35, z: 0 } },
        { time: 0.6, position: { x: 0, y: 1.50, z: 0 } },
        { time: 0.8, position: { x: 0, y: 1.35, z: 0 } },
        { time: 2.0, position: { x: 0, y: 1.35, z: 0 } }
      ]);
      break;
      
    case 'fist_pump':
      // Single arm fist pump
      anim.addTrack('upperArm_right', [
        { time: 0, rotation: { x: -1.5, y: 0, z: 0.5 } },
        { time: 0.25, rotation: { x: -1.8, y: 0, z: 0.6 } },
        { time: 0.5, rotation: { x: -1.5, y: 0, z: 0.5 } },
        { time: 0.75, rotation: { x: -1.8, y: 0, z: 0.6 } },
        { time: 1.0, rotation: { x: -1.5, y: 0, z: 0.5 } },
        { time: 2.0, rotation: { x: -1.5, y: 0, z: 0.5 } }
      ]);
      break;
      
    case 'spin':
      // Full body spin
      anim.addTrack('torso', [
        { time: 0, rotation: { x: 0, y: 0, z: 0 } },
        { time: 0.5, rotation: { x: 0, y: Math.PI, z: 0 } },
        { time: 1.0, rotation: { x: 0, y: Math.PI * 2, z: 0 } },
        { time: 2.0, rotation: { x: 0, y: Math.PI * 2, z: 0 } }
      ]);
      break;
      
    case 'epic':
      // Epic celebration with multiple moves
      anim.addTrack('upperArm_left', [
        { time: 0, rotation: { x: 0, y: 0, z: 0 } },
        { time: 0.5, rotation: { x: -2.5, y: 0, z: -0.3 } },
        { time: 1.0, rotation: { x: -2.5, y: 0.5, z: -0.5 } },
        { time: 1.5, rotation: { x: -1.0, y: 0, z: -0.8 } },
        { time: 2.0, rotation: { x: -2.5, y: 0, z: -0.3 } },
        { time: 3.0, rotation: { x: -2.5, y: 0, z: -0.3 } }
      ]);
      anim.addTrack('upperArm_right', [
        { time: 0, rotation: { x: 0, y: 0, z: 0 } },
        { time: 0.5, rotation: { x: -2.5, y: 0, z: 0.3 } },
        { time: 1.0, rotation: { x: -2.5, y: -0.5, z: 0.5 } },
        { time: 1.5, rotation: { x: -1.0, y: 0, z: 0.8 } },
        { time: 2.0, rotation: { x: -2.5, y: 0, z: 0.3 } },
        { time: 3.0, rotation: { x: -2.5, y: 0, z: 0.3 } }
      ]);
      // Multiple jumps
      anim.addTrack('torso', [
        { time: 0, position: { x: 0, y: 1.35, z: 0 } },
        { time: 0.3, position: { x: 0, y: 1.60, z: 0 } },
        { time: 0.6, position: { x: 0, y: 1.35, z: 0 } },
        { time: 1.2, position: { x: 0, y: 1.58, z: 0 } },
        { time: 1.5, position: { x: 0, y: 1.35, z: 0 } },
        { time: 2.1, position: { x: 0, y: 1.60, z: 0 } },
        { time: 2.4, position: { x: 0, y: 1.35, z: 0 } },
        { time: 3.0, position: { x: 0, y: 1.35, z: 0 } }
      ]);
      break;
  }
  
  return anim;
}

// ============================================================================
// CHARACTER DEFINITIONS
// ============================================================================

export const CHARACTER_DEFINITIONS = {
  // ==========================================================================
  // ACE ROURKE — The Pro Racer
  // Racer suit, sleek helmet, clean professional look
  // ==========================================================================
  ace: {
    id: 'ace',
    name: 'Ace Rourke',
    title: 'The Pro Racer',
    description: 'Veteran champion with ice-cold precision',
    
    generateCharacterMesh() {
      const builder = new HumanoidBuilder();
      builder.buildFullBody();
      
      // Custom materials for Ace's racer suit
      const suitPrimary = createFabricMaterial(0xeeeeee); // White base
      const suitAccent = createFabricMaterial(0x0066ff);  // Blue accents
      const helmetMat = createMetalCharMaterial(0xcccccc);
      
      // Apply suit materials
      builder.setMaterial('torso', suitPrimary);
      builder.setMaterial('upperLeg_left', suitPrimary);
      builder.setMaterial('upperLeg_right', suitPrimary);
      builder.setMaterial('lowerLeg_left', suitAccent);
      builder.setMaterial('lowerLeg_right', suitAccent);
      
      // Racing helmet (replaces default head appearance)
      const helmetGeo = getCharCachedGeometry('ace_helmet', () =>
        new THREE.SphereGeometry(0.14, 20, 20)
      );
      const helmet = new THREE.Mesh(helmetGeo, helmetMat);
      helmet.position.set(0, 1.67, 0);
      helmet.name = 'helmet';
      builder.group.add(helmet);
      
      // Visor
      const visorGeo = getCharCachedGeometry('ace_visor', () =>
        new THREE.SphereGeometry(0.09, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2)
      );
      const visor = new THREE.Mesh(visorGeo, createGlassCharMaterial(0x00aaff));
      visor.position.set(0, 1.69, 0.08);
      visor.rotation.x = -0.2;
      visor.name = 'visor';
      builder.group.add(visor);
      
      // Racing stripes on suit
      const stripeGeo = getCharCachedGeometry('ace_stripe', () =>
        new THREE.BoxGeometry(0.02, 0.35, 0.01)
      );
      const stripe = new THREE.Mesh(stripeGeo, suitAccent);
      stripe.position.set(0.17, 1.37, 0.09);
      builder.group.add(stripe);
      
      // Number plate on chest
      const numberGeo = getCharCachedGeometry('ace_number', () =>
        new THREE.BoxGeometry(0.12, 0.08, 0.01)
      );
      const numberPlate = new THREE.Mesh(numberGeo, suitAccent);
      numberPlate.position.set(0, 1.42, 0.1);
      builder.group.add(numberPlate);
      
      // Racing gloves
      const gloveGeo = getCharCachedGeometry('ace_glove', () =>
        new THREE.SphereGeometry(0.055, 10, 10)
      );
      const gloveMat = createFabricMaterial(0x0066ff);
      [-0.36, 0.36].forEach(x => {
        const glove = new THREE.Mesh(gloveGeo, gloveMat);
        glove.position.set(x, 0.98, 0);
        builder.group.add(glove);
      });
      
      // Racing boots
      const bootGeo = getCharCachedGeometry('ace_boot', () =>
        new THREE.BoxGeometry(0.09, 0.12, 0.18)
      );
      const bootMat = createFabricMaterial(0x0066ff);
      [-0.1, 0.1].forEach(x => {
        const boot = new THREE.Mesh(bootGeo, bootMat);
        boot.position.set(x, 0.06, 0);
        builder.group.add(boot);
      });
      
      builder.group.name = 'AceRourke';
      return builder.group;
    },
    
    getIdleAnimation() { return getIdleAnimationTemplate(); },
    getRunAnimation() { return getRunAnimationTemplate('fast'); },
    getCelebrateAnimation() { return getCelebrateAnimationTemplate('victory'); }
  },

  // ==========================================================================
  // NOVA KADE — The Trickster
  // Trickster outfit, neon accents, playful design
  // ==========================================================================
  nova: {
    id: 'nova',
    name: 'Nova Kade',
    title: 'The Trickster',
    description: 'Unpredictable wildcard who thrives on chaos',
    
    generateCharacterMesh() {
      const builder = new HumanoidBuilder();
      builder.buildFullBody();
      
      // Trickster outfit - dark with neon pink/cyan accents
      const suitMain = createFabricMaterial(0x1a1a2e);     // Dark base
      const neonPink = createNeonCharMaterial(0xff0066, 2); // Neon pink
      const neonCyan = createNeonCharMaterial(0x00ffff, 2); // Neon cyan
      
      // Apply main suit
      builder.setMaterial('torso', suitMain);
      builder.setMaterial('upperLeg_left', suitMain);
      builder.setMaterial('upperLeg_right', suitMain);
      builder.setMaterial('lowerLeg_left', suitMain);
      builder.setMaterial('lowerLeg_right', suitMain);
      
      // Asymmetric jacket design
      const jacketGeo = getCharCachedGeometry('nova_jacket', () =>
        new THREE.BoxGeometry(0.42, 0.42, 0.15)
      );
      const jacket = new THREE.Mesh(jacketGeo, suitMain);
      jacket.position.set(0, 1.38, 0.02);
      builder.group.add(jacket);
      
      // Neon trim on jacket
      const trimGeo = getCharCachedGeometry('nova_trim', () =>
        new THREE.BoxGeometry(0.44, 0.02, 0.16)
      );
      const trim = new THREE.Mesh(trimGeo, neonPink);
      trim.position.set(0, 1.58, 0.03);
      builder.group.add(trim);
      
      // Asymmetric sleeve (one long, one short)
      const longSleeveGeo = getCharCachedGeometry('nova_long_sleeve', () =>
        new THREE.CapsuleGeometry(0.055, 0.22, 4, 8)
      );
      const longSleeve = new THREE.Mesh(longSleeveGeo, neonCyan);
      longSleeve.position.set(-0.28, 1.28, 0);
      longSleeve.name = 'customLeftArm';
      builder.group.add(longSleeve);
      
      // Wild hair
      const hairGeo = getCharCachedGeometry('nova_hair', () => {
        const geo = new THREE.BufferGeometry();
        const v = new Float32Array([
          0, 0.18, 0,   0.1, 0.12, 0.05,  0.08, 0.06, 0.08,
          -0.08, 0.08, 0.08, -0.1, 0.02, 0.05, 0, 0.14, -0.05,
          0.06, 0.04, -0.08, -0.05, 0, -0.08
        ]);
        const idx = [0,1,2, 0,2,4, 0,4,3, 0,3,1, 1,3,4, 2,1,4, 5,6,7, 5,7,8, 5,8,6, 6,8,7];
        geo.setIndex(idx);
        geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
        geo.computeVertexNormals();
        return geo;
      });
      const hair = new THREE.Mesh(hairGeo, createNeonCharMaterial(0xff0066, 1.5));
      hair.position.set(0, 1.68, 0);
      builder.group.add(hair);
      
      // Goggles (pushed up on forehead)
      const goggleGeo = getCharCachedGeometry('nova_goggle', () =>
        new THREE.TorusGeometry(0.08, 0.02, 8, 16, Math.PI)
      );
      const goggleFrame = new THREE.Mesh(goggleGeo, createMetalCharMaterial(0xff0066));
      goggleFrame.position.set(0, 1.78, 0.02);
      goggleFrame.rotation.x = Math.PI / 2;
      builder.group.add(goggleFrame);
      
      // Goggle lens
      const lensGeo = getCharCachedGeometry('nova_lens', () =>
        new THREE.SphereGeometry(0.06, 12, 12)
      );
      const lens = new THREE.Mesh(lensGeo, createGlassCharMaterial(0xff00ff));
      lens.position.set(0, 1.77, 0.06);
      lens.scale.set(1, 0.6, 0.5);
      builder.group.add(lens);
      
      // Sneakers with neon soles
      const sneakerGeo = getCharCachedGeometry('nova_sneaker', () =>
        new THREE.BoxGeometry(0.1, 0.08, 0.17)
      );
      const sneakerMat = createFabricMaterial(0x333333);
      const soleMat = createNeonCharMaterial(0x00ffff, 1.5);
      
      [-0.1, 0.1].forEach(x => {
        const sneaker = new THREE.Mesh(sneakerGeo, sneakerMat);
        sneaker.position.set(x, 0.05, 0);
        builder.group.add(sneaker);
        
        const sole = new THREE.Mesh(
          getCharCachedGeometry('nova_sole', () => new THREE.BoxGeometry(0.1, 0.02, 0.18)),
          soleMat
        );
        sole.position.set(x, 0.01, 0);
        builder.group.add(sole);
      });
      
      builder.group.name = 'NovaKade';
      return builder.group;
    },
    
    getIdleAnimation() { 
      const anim = getIdleAnimationTemplate();
      // Add a playful sway
      anim.addTrack('torso', [
        { time: 0, rotation: { x: 0, y: 0, z: 0.05 } },
        { time: 1.0, rotation: { x: 0, y: 0, z: -0.05 } },
        { time: 2.0, rotation: { x: 0, y: 0, z: 0.05 } }
      ]);
      return anim;
    },
    getRunAnimation() { return getRunAnimationTemplate('normal'); },
    getCelebrateAnimation() { return getCelebrateAnimationTemplate('spin'); }
  },

  // ==========================================================================
  // BRICK STONE — The Bruiser
  // Heavy armor, large build, intimidating presence
  // ==========================================================================
  brick: {
    id: 'brick',
    name: 'Brick Stone',
    title: 'The Bruiser',
    description: 'Heavy hitter who dominates through raw power',
    
    generateCharacterMesh() {
      const builder = new HumanoidBuilder();
      
      // Build larger than normal (scale factor 1.2)
      const scale = 1.2;
      builder
        .buildHead({ y: 1.65 * scale }, scale)
        .buildTorso({ y: 1.35 * scale }, scale)
        .buildUpperArm('left', { x: -0.3 * scale, y: 1.48 * scale }, {}, scale)
        .buildUpperArm('right', { x: 0.3 * scale, y: 1.48 * scale }, {}, scale)
        .buildLowerArm('left', { x: -0.38 * scale, y: 1.18 * scale }, {}, scale)
        .buildLowerArm('right', { x: 0.38 * scale, y: 1.18 * scale }, {}, scale)
        .buildHand('left', { x: -0.42 * scale, y: 0.95 * scale })
        .buildHand('right', { x: 0.42 * scale, y: 0.95 * scale })
        .buildUpperLeg('left', { x: -0.12 * scale, y: 0.98 * scale }, {}, scale)
        .buildUpperLeg('right', { x: 0.12 * scale, y: 0.98 * scale }, {}, scale)
        .buildLowerLeg('left', { x: -0.12 * scale, y: 0.6 * scale }, {}, scale)
        .buildLowerLeg('right', { x: 0.12 * scale, y: 0.6 * scale }, {}, scale)
        .buildFoot('left', { x: -0.12 * scale, y: 0.08 * scale })
        .buildFoot('right', { x: 0.12 * scale, y: 0.08 * scale });
      
      // Heavy armor materials
      const armorMain = createMetalCharMaterial(0x555555);   // Dark steel
      const armorAccent = createMetalCharMaterial(0xaa3300); // Rust/orange accent
      const paddingMat = createFabricMaterial(0x331100);     // Dark padding
      
      // Apply armor to torso
      builder.setMaterial('torso', armorMain);
      builder.setMaterial('upperArm_left', armorMain);
      builder.setMaterial('upperArm_right', armorMain);
      builder.setMaterial('upperLeg_left', armorMain);
      builder.setMaterial('upperLeg_right', armorMain);
      
      // Chest plate detail
      const chestPlateGeo = getCharCachedGeometry('brick_chest', () =>
        new THREE.BoxGeometry(0.38 * scale, 0.3 * scale, 0.08)
      );
      const chestPlate = new THREE.Mesh(chestPlateGeo, armorAccent);
      chestPlate.position.set(0, 1.42 * scale, 0.08);
      builder.group.add(chestPlate);
      
      // Shoulder pads (massive)
      const shoulderGeo = getCharCachedGeometry('brick_shoulder', () =>
        new THREE.BoxGeometry(0.18 * scale, 0.1 * scale, 0.14 * scale)
      );
      [-0.32 * scale, 0.32 * scale].forEach(x => {
        const shoulder = new THREE.Mesh(shoulderGeo, armorAccent);
        shoulder.position.set(x, 1.54 * scale, 0);
        builder.group.add(shoulder);
      });
      
      // Heavy boots
      const bootGeo = getCharCachedGeometry('brick_boot', () =>
        new THREE.BoxGeometry(0.14 * scale, 0.15 * scale, 0.22 * scale)
      );
      const bootMat = createMetalCharMaterial(0x444444);
      [-0.12 * scale, 0.12 * scale].forEach(x => {
        const boot = new THREE.Mesh(bootGeo, bootMat);
        boot.position.set(x, 0.04 * scale, 0.02);
        builder.group.add(boot);
      });
      
      // Helmet (full coverage)
      const helmetGeo = getCharCachedGeometry('brick_helmet', () =>
        new THREE.SphereGeometry(0.15 * scale, 16, 16, 0, Math.PI * 2, 0, Math.PI * 1.2)
      );
      const helmet = new THREE.Mesh(helmetGeo, armorMain);
      helmet.position.set(0, 1.70 * scale, -0.02);
      builder.group.add(helmet);
      
      // Helmet visor slit
      const visorSlitGeo = getCharCachedGeometry('brick_visor', () =>
        new THREE.BoxGeometry(0.18 * scale, 0.04 * scale, 0.04)
      );
      const visorSlit = new THREE.Mesh(visorSlitGeo, createGlassCharMaterial(0xff4400));
      visorSlit.position.set(0, 1.72 * scale, 0.1);
      builder.group.add(visorSlit);
      
      // Scars/details on face visible area
      const scarGeo = getCharCachedGeometry('brick_scar', () =>
        new THREE.BoxGeometry(0.04, 0.01, 0.005)
      );
      const scarMat = createFabricMaterial(0x886666);
      const scar = new THREE.Mesh(scarGeo, scarMat);
      scar.position.set(0.04, 1.64 * scale, 0.12);
      scar.rotation.z = 0.3;
      builder.group.add(scar);
      
      builder.group.scale.setScalar(1);
      builder.group.name = 'BrickStone';
      return builder.group;
    },
    
    getIdleAnimation() { 
      const anim = getIdleAnimationTemplate();
      // Heavy breathing - more pronounced
      anim.addTrack('torso', [
        { time: 0, position: { x: 0, y: 1.62, z: 0 } },
        { time: 0.8, position: { x: 0, y: 1.66, z: 0 } },
        { time: 1.6, position: { x: 0, y: 1.62, z: 0 } },
        { time: 2.0, position: { x: 0, y: 1.62, z: 0 } }
      ]);
      return anim;
    },
    getRunAnimation() { return getRunAnimationTemplate('slow'); },
    getCelebrateAnimation() { return getCelebrateAnimationTemplate('fist_pump'); }
  },

  // ==========================================================================
  // VEX MARLOWE — The Tech Genius
  // Booster tech suit, holographic elements, futuristic
  // ==========================================================================
  vex: {
    id: 'vex',
    name: 'Vex Marlowe',
    title: 'Tech Genius',
    description: 'Brilliant inventor with experimental tech',
    
    generateCharacterMesh() {
      const builder = new HumanoidBuilder();
      builder.buildFullBody();
      
      // Tech suit materials
      const suitBase = createFabricMaterial(0x0a0a1a);       // Near black
      const circuitGlow = createNeonCharMaterial(0x00ff88, 2); // Green circuit glow
      const metalParts = createMetalCharMaterial(0x4466aa);    // Blue-tinted metal
      
      // Apply base suit
      builder.setMaterial('torso', suitBase);
      builder.setMaterial('upperLeg_left', suitBase);
      builder.setMaterial('upperLeg_right', suitBase);
      builder.setMaterial('lowerLeg_left', suitBase);
      builder.setMaterial('lowerLeg_right', suitBase);
      builder.setMaterial('upperArm_left', suitBase);
      builder.setMaterial('upperArm_right', suitBase);
      
      // Circuit pattern lines on torso
      const circuitGeo = getCharCachedGeometry('vex_circuit', () =>
        new THREE.BoxGeometry(0.3, 0.01, 0.01)
      );
      for (let i = 0; i < 4; i++) {
        const circuit = new THREE.Mesh(circuitGeo, circuitGlow);
        circuit.position.set(-0.05 + i * 0.05, 1.28 + i * 0.06, 0.11);
        circuit.rotation.y = i * 0.3;
        builder.group.add(circuit);
      }
      
      // Holographic collar piece
      const collarGeo = getCharCachedGeometry('vex_collar', () =>
        new THREE.TorusGeometry(0.12, 0.02, 8, 16, Math.PI)
      );
      const collar = new THREE.Mesh(collarGeo, circuitGlow);
      collar.position.set(0, 1.56, 0.02);
      collar.rotation.y = Math.PI / 2;
      builder.group.add(collar);
      
      // Tech goggles (worn over eyes)
      const techGoggleGeo = getCharCachedGeometry('vex_tech_goggle', () =>
        new THREE.BoxGeometry(0.2, 0.06, 0.06)
      );
      const techGoggle = new THREE.Mesh(techGoggleGeo, metalParts);
      techGoggle.position.set(0, 1.67, 0.1);
      builder.group.add(techGoggle);
      
      // Goggle lens (glowing)
      const techLensGeo = getCharCachedGeometry('vex_tech_lens', () =>
        new THREE.PlaneGeometry(0.07, 0.04)
      );
      const techLensL = new THREE.Mesh(techLensGeo, circuitGlow);
      techLensL.position.set(-0.05, 1.67, 0.13);
      builder.group.add(techLensL);
      
      const techLensR = new THREE.Mesh(techLensGeo, circuitGlow);
      techLensR.position.set(0.05, 1.67, 0.13);
      builder.group.add(techLensR);
      
      // Backpack/device unit
      const backpackGeo = getCharCachedGeometry('vex_backpack', () =>
        new THREE.BoxGeometry(0.25, 0.3, 0.12)
      );
      const backpack = new THREE.Mesh(backpackGeo, metalParts);
      backpack.position.set(0, 1.4, -0.15);
      builder.group.add(backpack);
      
      // Backpack glowing core
      const coreGeo = getCharCachedGeometry('vex_core', () =>
        new THREE.CircleGeometry(0.06, 16)
      );
      const core = new THREE.Mesh(coreGeo, circuitGlow);
      core.position.set(0, 1.42, -0.21);
      builder.group.add(core);
      
      // Cable/tube from backpack to arm
      const cableGeo = getCharCachedGeometry('vex_cable', () =>
        new THREE.CylinderGeometry(0.015, 0.015, 0.5, 8)
      );
      const cable = new THREE.Mesh(cableGeo, suitBase);
      cable.position.set(-0.2, 1.35, 0);
      cable.rotation.z = 0.5;
      builder.group.add(cable);
      
      // Tech gloves with glowing fingertips
      const gloveGeo = getCharCachedGeometry('vex_glove', () =>
        new THREE.SphereGeometry(0.055, 10, 10)
      );
      const gloveMat = createFabricMaterial(0x1a1a3a);
      [-0.36, 0.36].forEach(x => {
        const glove = new THREE.Mesh(gloveGeo, gloveMat);
        glove.position.set(x, 0.98, 0);
        builder.group.add(glove);
      });
      
      // High-tech shoes
      const shoeGeo = getCharCachedGeometry('vex_shoe', () =>
        new THREE.BoxGeometry(0.09, 0.06, 0.16)
      );
      const shoeMat = metalParts;
      [-0.1, 0.1].forEach(x => {
        const shoe = new THREE.Mesh(shoeGeo, shoeMat);
        shoe.position.set(x, 0.05, 0);
        builder.group.add(shoe);
        
        // Glowing sole strip
        const soleGlow = new THREE.Mesh(
          getCharCachedGeometry('vex_sole_glow', () => new THREE.BoxGeometry(0.07, 0.01, 0.14)),
          circuitGlow
        );
        soleGlow.position.set(x, 0.02, 0);
        builder.group.add(soleGlow);
      });
      
      builder.group.name = 'VexMarlowe';
      return builder.group;
    },
    
    getIdleAnimation() { 
      const anim = getIdleAnimationTemplate();
      // Subtle hover effect when idle
      anim.addTrack('torso', [
        { time: 0, position: { x: 0, y: 1.35, z: 0 } },
        { time: 1.0, position: { x: 0, y: 1.37, z: 0 } },
        { time: 2.0, position: { x: 0, y: 1.35, z: 0 } }
      ]);
      return anim;
    },
    getRunAnimation() { return getRunAnimationTemplate('normal'); },
    getCelebrateAnimation() { return getCelebrateAnimationTemplate('victory'); }
  },

  // ==========================================================================
  // JETT REYES — The Flyer
  // Wingsuit aesthetic, lightweight gear, aerial specialist
  // ==========================================================================
  jett: {
    id: 'jett',
    name: 'Jett Reyes',
    title: 'The Flyer',
    description: 'Daredevil who takes risks others won\'t',
    
    generateCharacterMesh() {
      const builder = new HumanoidBuilder();
      builder.buildFullBody();
      
      // Wingsuit/flying gear materials
      const wingsuitMain = createFabricMaterial(0xdd4400);   // Orange primary
      const wingsuitAccent = createFabricMaterial(0x222222); // Black accents
      const harnessMat = createLeatherMaterial(0x2a2a2a);    // Leather harness
      
      // Apply wingsuit
      builder.setMaterial('torso', wingsuitMain);
      builder.setMaterial('upperArm_left', wingsuitMain);
      builder.setMaterial('upperArm_right', wingsuitMain);
      builder.setMaterial('lowerLeg_left', wingsuitAccent);
      builder.setMaterial('lowerLeg_right', wingsuitAccent);
      builder.setMaterial('upperLeg_left', wingsuitAccent);
      builder.setMaterial('upperLeg_right', wingsuitAccent);
      
      // Wing membrane between arms and torso (simplified as flat panels)
      const wingGeo = getCharCachedGeometry('jett_wing', () =>
        new THREE.PlaneGeometry(0.6, 0.5)
      );
      const wingMat = createFabricMaterial(0xff6600, 0.5);
      wingMat.transparent = true;
      wingMat.opacity = 0.7;
      wingMat.side = THREE.DoubleSide;
      
      const leftWing = new THREE.Mesh(wingGeo, wingMat);
      leftWing.position.set(-0.45, 1.3, -0.05);
      leftWing.rotation.y = 0.3;
      leftWing.rotation.z = 0.2;
      builder.group.add(leftWing);
      
      const rightWing = new THREE.Mesh(wingGeo, wingMat);
      rightWing.position.set(0.45, 1.3, -0.05);
      rightWing.rotation.y = -0.3;
      rightWing.rotation.z = -0.2;
      builder.group.add(rightWing);
      
      // Harness straps across chest
      const strapGeo = getCharCachedGeometry('jett_strap', () =>
        new THREE.BoxGeometry(0.35, 0.025, 0.01)
      );
      [1.45, 1.38, 1.31].forEach(y => {
        const strap = new THREE.Mesh(strapGeo, harnessMat);
        strap.position.set(0, y, 0.11);
        builder.group.add(strap);
      });
      
      // Helmet with visor
      const helmetGeo = getCharCachedGeometry('jett_helmet', () =>
        new THREE.SphereGeometry(0.13, 16, 16)
      );
      const helmet = new THREE.Mesh(helmetGeo, wingsuitAccent);
      helmet.position.set(0, 1.67, 0);
      builder.group.add(helmet);
      
      // Large tinted visor
      const jettVisorGeo = getCharCachedGeometry('jett_visor', () =>
        new THREE.SphereGeometry(0.1, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2.2)
      );
      const jettVisor = new THREE.Mesh(jettVisorGeo, createGlassCharMaterial(0xff6600));
      jettVisor.position.set(0, 1.68, 0.07);
      jettVisor.rotation.x = -0.25;
      builder.group.add(jettVisor);
      
      // Goggles on helmet
      const jettGoggleStrapGeo = getCharCachedGeometry('jett_goggle_strap', () =>
        new THREE.TorusGeometry(0.135, 0.015, 6, 16, Math.PI * 2)
      );
      const goggleStrap = new THREE.Mesh(jettGoggleStrapGeoGeo, harnessMat);
      goggleStrap.position.set(0, 1.69, 0);
      goggleStrap.rotation.x = Math.PI / 2;
      builder.group.add(goggleStrap);
      
      // Lightweight boots
      const bootGeo = getCharCachedGeometry('jett_boot', () =>
        new THREE.BoxGeometry(0.08, 0.1, 0.17)
      );
      const bootMat = wingsuitAccent;
      [-0.1, 0.1].forEach(x => {
        const boot = new THREE.Mesh(bootGeo, bootMat);
        boot.position.set(x, 0.05, 0);
        builder.group.add(boot);
      });
      
      builder.group.name = 'JettReyes';
      return builder.group;
    },
    
    getIdleAnimation() { 
      const anim = getIdleAnimationTemplate();
      // Ready stance - slightly crouched
      anim.addTrack('torso', [
        { time: 0, position: { x: 0, y: 1.33, z: 0 }, rotation: { x: 0.05, y: 0, z: 0 } },
        { time: 2.0, position: { x: 0, y: 1.33, z: 0 }, rotation: { x: 0.05, y: 0, z: 0 } }
      ]);
      return anim;
    },
    getRunAnimation() { return getRunAnimationTemplate('fast'); },
    getCelebrateAnimation() { return getCelebrateAnimationTemplate('epic'); }
  },

  // ==========================================================================
  // ROGUE VANCE — The Rebel
  // Burnout leather jacket, rebel aesthetic, vintage style
  // ==========================================================================
  rogue: {
    id: 'rogue',
    name: 'Rogue Vance',
    title: 'The Rebel',
    description: 'Rules are suggestions, not requirements',
    
    generateCharacterMesh() {
      const builder = new HumanoidBuilder();
      builder.buildFullBody();
      
      // Rebel/biker materials
      const leatherJacket = createLeatherMaterial(0x1a1a1a);  // Black leather
      const shirtInner = createFabricMaterial(0xcccccc);      // White tee
      const jeansMat = createFabricMaterial(0x2244aa);         // Blue jeans
      const chromeDetail = createMetalCharMaterial(0xaaaaaa);  // Chrome accents
      
      // Apply base clothing
      builder.setMaterial('torso', leatherJacket);
      builder.setMaterial('upperLeg_left', jeansMat);
      builder.setMaterial('upperLeg_right', jeansMat);
      builder.setMaterial('lowerLeg_left', jeansMat);
      builder.setMaterial('lowerLeg_right', jeansMat);
      
      // Oversized leather jacket
      const jacketGeo = getCharCachedGeometry('rogue_jacket', () =>
        new THREE.BoxGeometry(0.48, 0.48, 0.18)
      );
      const jacket = new THREE.Mesh(jacketGeo, leatherJacket);
      jacket.position.set(0, 1.36, 0.02);
      builder.group.add(jacket);
      
      // Jacket collar (upturned)
      const collarGeo = getCharCachedGeometry('rogue_collar', () =>
        new THREE.BoxGeometry(0.2, 0.12, 0.06)
      );
      [-0.08, 0.08].forEach(x => {
        const collar = new THREE.Mesh(collarGeo, leatherJacket);
        collar.position.set(x, 1.6, 0.06);
        collar.rotation.z = x > 0 ? 0.3 : -0.3;
        builder.group.add(collar);
      });
      
      // Shirt visible at opening
      const shirtGeo = getCharCachedGeometry('rogue_shirt', () =>
        new THREE.PlaneGeometry(0.12, 0.15)
      );
      const shirt = new THREE.Mesh(shirtGeo, shirtInner);
      shirt.position.set(0, 1.38, 0.12);
      builder.group.add(shirt);
      
      // Zipper
      const zipperGeo = getCharCachedGeometry('rogue_zipper', () =>
        new THREE.BoxGeometry(0.015, 0.35, 0.01)
      );
      const zipper = new THREE.Mesh(zipperGeo, chromeDetail);
      zipper.position.set(0, 1.34, 0.12);
      builder.group.add(zipper);
      
      // Messy hair
      const hairGeo = getCharCachedGeometry('rogue_hair', () => {
        const geo = new THREE.BufferGeometry();
        const v = new Float32Array([
          -0.08, 0.1, 0.05, 0, 0.15, 0.02, 0.08, 0.1, 0.05,
          -0.06, 0.12, -0.03, 0.06, 0.12, -0.03, 0, 0.18, 0
        ]);
        const idx = [0,1,4, 1,2,4, 2,3,4, 0,3,4, 0,1,5, 1,2,5, 2,3,5, 0,3,5];
        geo.setIndex(idx);
        geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
        geo.computeVertexNormals();
        return geo;
      });
      const hair = new THREE.Mesh(hairGeo, createFabricMaterial(0x2a1a0a));
      hair.position.set(0, 1.68, 0);
      builder.group.add(hair);
      
      // Sunglasses
      const glassesGeo = getCharCachedGeometry('rogue_glasses', () =>
        new THREE.BoxGeometry(0.16, 0.04, 0.02)
      );
      const glassesFrame = new THREE.Mesh(glassesGeo, chromeDetail);
      glassesFrame.position.set(0, 1.68, 0.12);
      builder.group.add(glassesFrame);
      
      const lensGeo = getCharCachedGeometry('rogue_lens', () =>
        new THREE.PlaneGeometry(0.055, 0.035)
      );
      const lensMat = createGlassCharMaterial(0x111111);
      [-0.03, 0.03].forEach(x => {
        const lens = new THREE.Mesh(lensGeo, lensMat);
        lens.position.set(x, 1.68, 0.13);
        builder.group.add(lens);
      });
      
      // Fingerless gloves
      const fingerlessGeo = getCharCachedGeometry('rogue_fingerless', () =>
        new THREE.CylinderGeometry(0.05, 0.05, 0.06, 10)
      );
      const gloveMat = leatherJacket;
      [-0.36, 0.36].forEach(x => {
        const glove = new THREE.Mesh(fingerlessGeo, gloveMat);
        glove.position.set(x, 0.97, 0);
        glove.rotation.x = Math.PI / 2;
        builder.group.add(glove);
      });
      
      // Combat boots
      const combatBootGeo = getCharCachedGeometry('rogue_combat_boot', () =>
        new THREE.BoxGeometry(0.1, 0.14, 0.19)
      );
      const combatBootMat = createLeatherMaterial(0x221111);
      [-0.1, 0.1].forEach(x => {
        const boot = new THREE.Mesh(combatBootGeo, combatBootMat);
        boot.position.set(x, 0.04, 0);
        builder.group.add(boot);
      });
      
      builder.group.name = 'RogueVance';
      return builder.group;
    },
    
    getIdleAnimation() { 
      const anim = getIdleAnimationTemplate();
      // Relaxed lean
      anim.addTrack('torso', [
        { time: 0, rotation: { x: 0, y: 0, z: -0.03 } },
        { time: 2.0, rotation: { x: 0, y: 0, z: -0.03 } }
      ]);
      // Hands in pockets pose hint
      anim.addTrack('upperArm_left', [
        { time: 0, rotation: { x: 0.2, y: 0, z: 0.1 } },
        { time: 2.0, rotation: { x: 0.2, y: 0, z: 0.1 } }
      ]);
      return anim;
    },
    getRunAnimation() { return getRunAnimationTemplate('normal'); },
    getCelebrateAnimation() { return getCelebrateAnimationTemplate('fist_pump'); }
  },

  // ==========================================================================
  // ECHO SATO — The Collector
  // Hooded outfit, mysterious, artifact hunter vibe
  // ==========================================================================
  echo: {
    id: 'echo',
    name: 'Echo Sato',
    title: 'The Collector',
    description: 'Silent observer who gathers secrets',
    
    generateCharacterMesh() {
      const builder = new HumanoidBuilder();
      builder.buildFullBody();
      
      // Hooded outfit materials
      const hoodMain = createFabricMaterial(0x2a2a3a);       // Dark grey-purple
      const hoodInner = createFabricMaterial(0x4a3060);       // Purple inner
      const trimGold = createMetalCharMaterial(0xaa8833);      // Gold trim
      const cloakMat = createFabricMaterial(0x1a1a2a, 0.85);  // Cloak fabric
      
      // Cloak body (covers most of torso)
      const cloakGeo = getCharCachedGeometry('echo_cloak', () =>
        new THREE.ConeGeometry(0.35, 0.7, 8, 1, true)
      );
      const cloak = new THREE.Mesh(cloakGeo, cloakMat);
      cloak.position.set(0, 1.2, 0.05);
      cloak.rotation.x = Math.PI;
      builder.group.add(cloak);
      
      // Hood
      const hoodGeo = getCharCachedGeometry('echo_hood', () =>
        new THREE.SphereGeometry(0.18, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.7)
      );
      const hood = new THREE.Mesh(hoodGeo, hoodMain);
      hood.position.set(0, 1.72, 0);
      hood.scale.set(1, 1.3, 0.9);
      builder.group.add(hood);
      
      // Hood shadow (face mostly hidden)
      const shadowGeo = getCharCachedGeometry('echo_shadow', () =>
        new THREE.SphereGeometry(0.12, 12, 12)
      );
      const shadow = new THREE.Mesh(shadowGeo, createFabricMaterial(0x000000));
      shadow.position.set(0, 1.66, 0.08);
      builder.group.add(shadow);
      
      // Only eyes visible - glowing faintly
      const eyeGeo = getCharCachedGeometry('echo_eye', () =>
        new THREE.SphereGeometry(0.015, 8, 8)
      );
      const eyeMat = createNeonCharMaterial(0xaaffff, 1.5);
      [-0.04, 0.04].forEach(x => {
        const eye = new THREE.Mesh(eyeGeo, eyeMat);
        eye.position.set(x, 1.66, 0.14);
        builder.group.add(eye);
      });
      
      // Gold trim on hood edge
      const trimGeo = getCharCachedGeometry('echo_trim', () =>
        new THREE.TorusGeometry(0.17, 0.012, 6, 24, Math.PI * 0.8)
      );
      const trim = new THREE.Mesh(trimGeo, trimGold);
      trim.position.set(0, 1.62, 0.04);
      trim.rotation.x = Math.PI / 2 + 0.3;
      trim.rotation.z = Math.PI;
      builder.group.add(trim);
      
      // Long sleeves (cloak sleeves)
      const sleeveGeo = getCharCachedGeometry('echo_sleeve', () =>
        new THREE.CapsuleGeometry(0.06, 0.28, 4, 8)
      );
      const sleeveMat = hoodMain;
      
      const leftSleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
      leftSleeve.position.set(-0.3, 1.2, 0.05);
      leftSleeve.rotation.z = 0.3;
      builder.group.add(leftSleeve);
      
      const rightSleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
      rightSleeve.position.set(0.3, 1.2, 0.05);
      rightSleeve.rotation.z = -0.3;
      builder.group.add(rightSleeve);
      
      // Loose pants under cloak
      builder.setMaterial('upperLeg_left', hoodInner);
      builder.setMaterial('upperLeg_right', hoodInner);
      builder.setMaterial('lowerLeg_left', hoodMain);
      builder.setMaterial('lowerLeg_right', hoodMain);
      
      // Tabi-style shoes (split toe)
      const tabiGeo = getCharCachedGeometry('echo_tabi', () =>
        new THREE.BoxGeometry(0.09, 0.06, 0.15)
      );
      const tabiMat = hoodMain;
      [-0.1, 0.1].forEach(x => {
        const tabi = new THREE.Mesh(tabiGeo, tabiMat);
        tabi.position.set(x, 0.05, 0);
        builder.group.add(tabi);
      });
      
      // Artifact pendant
      const pendantChainGeo = getCharCachedGeometry('echo_chain', () =>
        new THREE.TorusGeometry(0.04, 0.008, 6, 12, Math.PI * 1.5)
      );
      const chain = new THREE.Mesh(pendantChainGeo, trimGold);
      chain.position.set(0, 1.52, 0.12);
      builder.group.add(chain);
      
      const pendantGeo = getCharCachedGeometry('echo_pendant', () =>
        new THREE.OctahedronGeometry(0.035)
      );
      const pendant = new THREE.Mesh(pendantGeo, createNeonCharMaterial(0xaaffff, 2));
      pendant.position.set(0, 1.46, 0.14);
      builder.group.add(pendant);
      
      builder.group.name = 'EchoSato';
      return builder.group;
    },
    
    getIdleAnimation() { 
      const anim = getIdleAnimationTemplate();
      // Mysterious stillness - barely moving
      anim.addTrack('torso', [
        { time: 0, position: { x: 0, y: 1.35, z: 0 } },
        { time: 2.0, position: { x: 0, y: 1.355, z: 0 } },
        { time: 4.0, position: { x: 0, y: 1.35, z: 0 } }
      ]);
      anim.duration = 4.0; // Slower breathing
      return anim;
    },
    getRunAnimation() { return getRunAnimationTemplate('normal'); },
    getCelebrateAnimation() { return getCelebrateAnimationTemplate('victory'); }
  },

  // ==========================================================================
  // ZERO KAINE — The Speedster
  // Sleek speed suit, aerodynamic, minimal design
  // ==========================================================================
  zero: {
    id: 'zero',
    name: 'Zero Kaine',
    title: 'The Speedster',
    description: 'Faster than light, faster than thought',
    
    generateCharacterMesh() {
      const builder = new HumanoidBuilder();
      builder.buildFullBody();
      
      // Speed suit materials
      const speedSuit = createFabricMaterial(0x111118, 0.4); // Ultra dark, smooth
      speedSuit.roughness = 0.25;
      const neonBlue = createNeonCharMaterial(0x0088ff, 2.5); // Bright blue
      const chromeWhite = createMetalCharMaterial(0xeeeeee);   // Chrome white
      
      // Apply sleek speed suit
      builder.setMaterial('torso', speedSuit);
      builder.setMaterial('upperArm_left', speedSuit);
      builder.setMaterial('upperArm_right', speedSuit);
      builder.setMaterial('lowerArm_left', speedSuit);
      builder.setMaterial('lowerArm_right', speedSuit);
      builder.setMaterial('upperLeg_left', speedSuit);
      builder.setMaterial('upperLeg_right', speedSuit);
      builder.setMaterial('lowerLeg_left', speedSuit);
      builder.setMaterial('lowerLeg_right', speedSuit);
      
      // Aerodynamic streamlines on suit
      const streamlineGeo = getCharCachedGeometry('zero_streamline', () =>
        new THREE.BoxGeometry(0.01, 0.4, 0.01)
      );
      [-0.12, 0.12].forEach(x => {
        const line = new THREE.Mesh(streamlineGeo, neonBlue);
        line.position.set(x, 1.35, 0.11);
        builder.group.add(line);
      });
      
      // Horizontal chest line
      const chestLineGeo = getCharCachedGeometry('zero_chest_line', () =>
        new THREE.BoxGeometry(0.28, 0.01, 0.01)
      );
      const chestLine = new THREE.Mesh(chestLineGeo, neonBlue);
      chestLine.position.set(0, 1.45, 0.11);
      builder.group.add(chestLine);
      
      // Sleek aero helmet
      const aeroHelmetGeo = getCharCachedGeometry('zero_helmet', () => {
        const geo = new THREE.SphereGeometry(0.13, 20, 20);
        geo.scale(1, 0.85, 1.1);
        return geo;
      });
      const aeroHelmet = new THREE.Mesh(aeroHelmetGeo, speedSuit);
      aeroHelmet.position.set(0, 1.68, -0.02);
      builder.group.add(aeroHelmet);
      
      // Full-face visor
      const fullVisorGeo = getCharCachedGeometry('zero_full_visor', () =>
        new THREE.SphereGeometry(0.11, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2)
      );
      const fullVisor = new THREE.Mesh(fullVisorGeo, createGlassCharMaterial(0x0088ff));
      fullVisor.position.set(0, 1.67, 0.08);
      fullVisor.rotation.x = -0.15;
      fullVisor.scale.set(1, 0.8, 0.7);
      builder.group.add(fullVisor);
      
      // Visor HUD elements (glowing dots)
      const hudDotGeo = getCharCachedGeometry('zero_hud_dot', () =>
        new THREE.CircleGeometry(0.008, 8)
      );
      for (let i = 0; i < 5; i++) {
        const dot = new THREE.Mesh(hudDotGeo, neonBlue);
        dot.position.set(-0.04 + i * 0.02, 1.64, 0.15);
        builder.group.add(dot);
      }
      
      // Streamlined gloves
      const aeroGloveGeo = getCharCachedGeometry('zero_aero_glove', () =>
        new THREE.SphereGeometry(0.05, 12, 12)
      );
      const aeroGloveMat = speedSuit;
      [-0.36, 0.36].forEach(x => {
        const glove = new THREE.Mesh(aeroGloveGeo, aeroGloveMat);
        glove.position.set(x, 0.98, 0);
        glove.scale.set(1, 0.8, 1.2);
        builder.group.add(glove);
      });
      
      // Aerodynamic blade-like shoes
      const bladeShoeGeo = getCharCachedGeometry('zero_blade_shoe', () => {
        const shape = new THREE.Shape();
        shape.moveTo(-0.05, 0);
        shape.lineTo(0.05, 0);
        shape.lineTo(0.04, 0.18);
        shape.lineTo(0, 0.2);
        shape.lineTo(-0.04, 0.18);
        shape.closePath();
        return new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false });
      });
      const bladeShoeMat = speedSuit;
      [-0.1, 0.1].forEach(x => {
        const shoe = new THREE.Mesh(bladeShoeGeo, bladeShoeMat);
        shoe.position.set(x, -0.08, -0.04);
        shoe.rotation.x = -Math.PI / 2;
        builder.group.add(shoe);
        
        // Blue glow trail point on heel
        const trailPoint = new THREE.Mesh(
          getCharCachedGeometry('zero_trail_point', () => new THREE.CircleGeometry(0.025, 12)),
          neonBlue
        );
        trailPoint.position.set(x, 0.01, -0.12);
        builder.group.add(trailPoint);
      });
      
      // Number "0" on chest (minimal)
      const zeroNumGeo = getCharCachedGeometry('zero_num', () =>
        new THREE.RingGeometry(0.04, 0.055, 16)
      );
      const zeroNum = new THREE.Mesh(zeroNumGeo, chromeWhite);
      zeroNum.position.set(0, 1.45, 0.115);
      builder.group.add(zeroNum);
      
      builder.group.name = 'ZeroKaine';
      return builder.group;
    },
    
    getIdleAnimation() { 
      const anim = getIdleAnimationTemplate();
      // Coiled ready position
      anim.addTrack('torso', [
        { time: 0, position: { x: 0, y: 1.34, z: 0 }, rotation: { x: 0.08, y: 0, z: 0 } },
        { time: 2.0, position: { x: 0, y: 1.34, z: 0 }, rotation: { x: 0.08, y: 0, z: 0 } }
      ]);
      return anim;
    },
    getRunAnimation() { return getRunAnimationTemplate('fast'); },
    getCelebrateAnimation() { return getCelebrateAnimationTemplate('epic'); }
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function getCharacterDefinition(characterId) {
  return CHARACTER_DEFINITIONS[characterId] || null;
}

export function getAllCharacterDefinitions() {
  return Object.values(CHARACTER_DEFINITIONS);
}

export function getCharacterIds() {
  return Object.keys(CHARACTER_DEFINITIONS);
}

export function createCharacterMesh(characterId) {
  const def = CHARACTER_DEFINITIONS[characterId];
  if (!def) {
    console.warn(`Unknown character ID: ${characterId}`);
    return null;
  }
  return def.generateCharacterMesh();
}

// Export for cleanup
export { clearCharGeometryCache };
