// assets/models/vehicle-models.js
// Vehicle Model Pipeline — Procedural GLTF-compatible vehicle mesh generator with PBR materials
// Generates detailed vehicle meshes that look like real cars for each of the 10 vehicles

import * as THREE from 'three';

// ============================================================================
// SHARED GEOMETRY CACHE — Reuse geometries across instances for performance
// ============================================================================

const geometryCache = new Map();

function getCachedGeometry(key, factory) {
  if (!geometryCache.has(key)) {
    geometryCache.set(key, factory());
  }
  return geometryCache.get(key).clone();
}

function clearGeometryCache() {
  geometryCache.clear();
}

// ============================================================================
// PBR MATERIAL FACTORY — Consistent neon underground art style
// ============================================================================

function createPBRMaterial({ color = 0x333333, metalness = 0.8, roughness = 0.3, emissive = 0x000000, emissiveIntensity = 0, transparent = false, opacity = 1, envMapIntensity = 1 }) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    emissive,
    emissiveIntensity,
    transparent,
    opacity,
    envMapIntensity
  });
}

function createNeonMaterial(color, intensity = 2) {
  return createPBRMaterial({
    color: 0x111111,
    metalness: 0.9,
    roughness: 0.1,
    emissive: color,
    emissiveIntensity: intensity
  });
}

function createGlassMaterial(tint = 0x88ccff) {
  return createPBRMaterial({
    color: tint,
    metalness: 0.1,
    roughness: 0.05,
    transparent: true,
    opacity: 0.4,
    envMapIntensity: 1.5
  });
}

function createTireMaterial() {
  return createPBRMaterial({
    color: 0x1a1a1a,
    metalness: 0.0,
    roughness: 0.9
  });
}

function createLightMaterial(color, intensity = 3) {
  return createPBRMaterial({
    color: 0xffffff,
    emissive: color,
    emissiveIntensity: intensity
  });
}

// ============================================================================
// VEHICLE DEFINITIONS
// ============================================================================

export const VEHICLE_DEFINITIONS = {
  // ==========================================================================
  // 1. SPECTRE GT (Sports Car)
  // Sleek, low profile, neon underglow accents
  // ==========================================================================
  spectre: {
    id: 'spectre',
    name: 'Spectre GT',
    type: 'sports',
    description: 'Sleek sports car with neon underglow accents',
    
    getCustomMaterials() {
      return {
        body: createPBRMaterial({ color: 0x1a1a2e, metalness: 0.95, roughness: 0.15 }),
        bodyAccent: createPBRMaterial({ color: 0x00ff88, metalness: 0.8, roughness: 0.2 }),
        underglow: createNeonMaterial(0x00ff88, 2.5),
        window: createGlassMaterial(0x66ffff),
        headlight: createLightMaterial(0xffffff, 4),
        taillight: createLightMaterial(0xff0044, 3),
        tire: createTireMaterial(),
        chrome: createPBRMaterial({ color: 0xcccccc, metalness: 1.0, roughness: 0.05 }),
        exhaust: createPBRMaterial({ color: 0x222222, metalness: 0.7, roughness: 0.3 })
      };
    },
    
    generateBodyMesh() {
      const group = new THREE.Group();
      const mats = this.getCustomMaterials();
      
      // Main body — low wedge shape
      const bodyGeo = getCachedGeometry('spectre_body', () => 
        new THREE.BoxGeometry(2.0, 0.5, 4.2)
      );
      const body = new THREE.Mesh(bodyGeo, mats.body);
      body.position.y = 0.35;
      group.add(body);
      
      // Hood slope
      const hoodGeo = getCachedGeometry('spectre_hood', () => {
        const geo = new THREE.BufferGeometry();
        const vertices = new Float32Array([
          -0.9, 0.1, 1.5,   0.9, 0.1, 1.5,   0.9, 0.55, 0.3,  -0.9, 0.55, 0.3,
          -0.85, 0.1, 0.3,  0.85, 0.1, 0.3,  0.9, 0.5, -1.0, -0.9, 0.5, -1.0
        ]);
        const indices = [0,1,2, 0,2,3, 0,3,7, 0,7,4, 4,7,6, 4,6,5, 5,6,2, 5,2,1, 3,2,6, 3,6,7];
        geo.setIndex(indices);
        geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geo.computeVertexNormals();
        return geo;
      });
      const hood = new THREE.Mesh(hoodGeo, mats.body);
      group.add(hood);
      
      // Cabin
      const cabinGeo = getCachedGeometry('spectre_cabin', () => 
        new THREE.BoxGeometry(1.6, 0.45, 1.4)
      );
      const cabin = new THREE.Mesh(cabinGeo, mats.window);
      cabin.position.set(0, 0.75, -0.2);
      group.add(cabin);
      
      // Windshield
      const windshieldGeo = getCachedGeometry('spectre_windshield', () => {
        const geo = new THREE.BufferGeometry();
        const vertices = new Float32Array([
          -0.75, 0.52, 0.5, 0.75, 0.52, 0.5, 0.78, 0.92, -0.1, -0.78, 0.92, -0.1
        ]);
        const indices = [0,1,2, 0,2,3];
        geo.setIndex(indices);
        geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geo.computeVertexNormals();
        return geo;
      });
      const windshield = new THREE.Mesh(windshieldGeo, mats.window);
      group.add(windshield);
      
      // Side accent stripes
      const stripeGeo = getCachedGeometry('spectre_stripe', () =>
        new THREE.BoxGeometry(0.05, 0.08, 3.8)
      );
      [-0.85, 0.85].forEach(x => {
        const stripe = new THREE.Mesh(stripeGeo, mats.bodyAccent);
        stripe.position.set(x, 0.28, 0);
        group.add(stripe);
      });
      
      // Headlights
      const headlightGeo = getCachedGeometry('spectre_headlight', () =>
        new THREE.CylinderGeometry(0.12, 0.12, 0.05, 16)
      );
      [-0.6, 0.6].forEach(x => {
        const light = new THREE.Mesh(headlightGeo, mats.headlight);
        light.rotation.x = Math.PI / 2;
        light.position.set(x, 0.45, 2.12);
        group.add(light);
      });
      
      // Taillights
      const taillightGeo = getCachedGeometry('spectre_taillight', () =>
        new THREE.BoxGeometry(0.35, 0.1, 0.03)
      );
      [-0.7, 0.7].forEach(x => {
        const light = new THREE.Mesh(taillightGeo, mats.taillight);
        light.position.set(x, 0.5, -2.11);
        group.add(light);
      });
      
      // Neon underglow strips
      const underglowGeo = getCachedGeometry('spectre_underglow', () =>
        new THREE.BoxGeometry(1.9, 0.02, 4.0)
      );
      const underglow = new THREE.Mesh(underglowGeo, mats.underglow);
      underglow.position.y = 0.05;
      group.add(underglow);
      
      // Side underglow
      const sideGlowGeo = getCachedGeometry('spectre_sideglow', () =>
        new THREE.BoxGeometry(0.02, 0.02, 3.6)
      );
      [-0.96, 0.96].forEach(x => {
        const glow = new THREE.Mesh(sideGlowGeo, mats.underglow);
        glow.position.set(x, 0.08, 0);
        group.add(glow);
      });
      
      // Spoiler
      const spoilerWingGeo = getCachedGeometry('spectre_spoiler_wing', () =>
        new THREE.BoxGeometry(1.8, 0.04, 0.25)
      );
      const spoilerWing = new THREE.Mesh(spoilerWingGeo, mats.body);
      spoilerWing.position.set(0, 0.9, -1.9);
      group.add(spoilerWing);
      
      const spoilerStandGeo = getCachedGeometry('spectre_spoiler_stand', () =>
        new THREE.BoxGeometry(0.06, 0.35, 0.06)
      );
      [-0.7, 0.7].forEach(x => {
        const stand = new THREE.Mesh(spoilerStandGeo, mats.chrome);
        stand.position.set(x, 0.72, -1.9);
        group.add(stand);
      });
      
      // Exhaust pipes
      const exhaustGeo = getCachedGeometry('spectre_exhaust', () =>
        new THREE.CylinderGeometry(0.06, 0.08, 0.3, 12)
      );
      [-0.25, 0.25].forEach(x => {
        const pipe = new THREE.Mesh(exhaustGeo, mats.exhaust);
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set(x, 0.15, -2.15);
        group.add(pipe);
      });
      
      // Side mirrors
      const mirrorGeo = getCachedGeometry('spectre_mirror', () =>
        new THREE.BoxGeometry(0.1, 0.08, 0.06)
      );
      [-1.05, 1.05].forEach(x => {
        const mirror = new THREE.Mesh(mirrorGeo, mats.body);
        mirror.position.set(x, 0.65, 0.5);
        group.add(mirror);
      });
      
      group.name = 'SpectreGT';
      return group;
    },
    
    getWheelPositions() {
      return [
        new THREE.Vector3(-0.9, 0, 1.4),   // front left
        new THREE.Vector3(0.9, 0, 1.4),     // front right
        new THREE.Vector3(-0.9, 0, -1.3),   // rear left
        new THREE.Vector3(0.9, 0, -1.3)     // rear right
      ];
    },
    
    getCameraOffsets() {
      return {
        fpp: new THREE.Vector3(0, 0.65, 0.2),
        tpp: new THREE.Vector3(0, 2.5, -5),
        tppClose: new THREE.Vector3(0, 1.8, -3.5),
        hood: new THREE.Vector3(0, 0.85, 0.8)
      };
    },
    
    getDamageStates() {
      return [
        { level: 1, name: 'scratched', dents: [{ pos: [0.5, 0.4, 1], scale: 0.15 }], crackedWindows: false },
        { level: 2, name: 'damaged', dents: [{ pos: [0.3, 0.45, 0.8], scale: 0.25 }, { pos: [-0.6, 0.35, -0.5], scale: 0.2 }], crackedWindows: true },
        { level: 3, name: 'wrecked', dents: [{ pos: [0, 0.5, 0.5], scale: 0.4 }, { pos: [0.7, 0.4, -1], scale: 0.3 }, { pos: [-0.5, 0.35, 1.2], scale: 0.25 }], crackedWindows: true, missingParts: ['spoiler'] }
      ];
    }
  },

  // ==========================================================================
  // 2. TITAN MUSCLE (Muscle Car)
  // Wide body, aggressive stance, exposed engine
  // ==========================================================================
  titan: {
    id: 'titan',
    name: 'Titan Muscle',
    type: 'muscle',
    description: 'Wide body muscle car with exposed engine bay',
    
    getCustomMaterials() {
      return {
        body: createPBRMaterial({ color: 0x8b0000, metalness: 0.7, roughness: 0.4 }),
        bodyAccent: createPBRMaterial({ color: 0x222222, metalness: 0.3, roughness: 0.6 }),
        hood: createPBRMaterial({ color: 0x1a1a1a, metalness: 0.5, roughness: 0.5 }),
        window: createGlassMaterial(0x334455),
        headlight: createLightMaterial(0xffffcc, 3),
        taillight: createLightMaterial(0xff2200, 3),
        tire: createTireMaterial(),
        chrome: createPBRMaterial({ color: 0xdddddd, metalness: 1.0, roughness: 0.05 }),
        exhaust: createPBRMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.2 }),
        engine: createPBRMaterial({ color: 0x996633, metalness: 0.6, roughness: 0.4 })
      };
    },
    
    generateBodyMesh() {
      const group = new THREE.Group();
      const mats = this.getCustomMaterials();
      
      // Main body — wide and boxy
      const bodyGeo = getCachedGeometry('titan_body', () =>
        new THREE.BoxGeometry(2.2, 0.7, 4.5)
      );
      const body = new THREE.Mesh(bodyGeo, mats.body);
      body.position.y = 0.5;
      group.add(body);
      
      // Hood with power bulge
      const hoodGeo = getCachedGeometry('titan_hood', () => {
        const shape = new THREE.Shape();
        shape.moveTo(-1.0, -1.2);
        shape.lineTo(1.0, -1.2);
        shape.lineTo(1.0, 0.8);
        shape.quadraticCurveTo(0.3, 1.2, 0, 1.2);
        shape.quadraticCurveTo(-0.3, 1.2, -1.0, 0.8);
        shape.closePath();
        return new THREE.ExtrudeGeometry(shape, { depth: 1.8, bevelEnabled: false });
      });
      const hood = new THREE.Mesh(hoodGeo, mats.hood);
      hood.rotation.x = -Math.PI / 2;
      hood.position.set(0, 0.87, 0.5);
      group.add(hood);
      
      // Exposed engine through hood cutout
      const engineBlockGeo = getCachedGeometry('titan_engine', () =>
        new THREE.BoxGeometry(0.6, 0.25, 0.5)
      );
      const engineBlock = new THREE.Mesh(engineBlockGeo, mats.engine);
      engineBlock.position.set(0, 1.05, 1.0);
      group.add(engineBlock);
      
      // Air intake scoop
      const scoopGeo = getCachedGeometry('titan_scoop', () =>
        new THREE.BoxGeometry(0.3, 0.2, 0.6)
      );
      const scoop = new THREE.Mesh(scoopGeo, mats.hood);
      scoop.position.set(0, 1.18, 1.3);
      group.add(scoop);
      
      // Cabin
      const cabinGeo = getCachedGeometry('titan_cabin', () =>
        new THREE.BoxGeometry(1.8, 0.55, 1.5)
      );
      const cabin = new THREE.Mesh(cabinGeo, mats.window);
      cabin.position.set(0, 1.1, -0.5);
      group.add(cabin);
      
      // Wide fender flares
      const fenderGeo = getCachedGeometry('titan_fender', () =>
        new THREE.BoxGeometry(0.35, 0.5, 1.8)
      );
      [[-1.27, 0.55, 0.3], [1.27, 0.55, 0.3], [-1.27, 0.55, -1.0], [1.27, 0.55, -1.0]].forEach(([x, y, z]) => {
        const fender = new THREE.Mesh(fenderGeo, mats.bodyAccent);
        fender.position.set(x, y, z);
        group.add(fender);
      });
      
      // Dual round headlights
      const headlightGeo = getCachedGeometry('titan_headlight', () =>
        new THREE.CylinderGeometry(0.18, 0.18, 0.08, 20)
      );
      [-0.55, 0.55].forEach(x => {
        const light = new THREE.Mesh(headlightGeo, mats.headlight);
        light.rotation.x = Math.PI / 2;
        light.position.set(x, 0.65, 2.26);
        group.add(light);
      });
      
      // Triple round taillights per side
      const taillightGeo = getCachedGeometry('titan_taillight', () =>
        new THREE.CylinderGeometry(0.1, 0.1, 0.04, 16)
      );
      for (let i = -1; i <= 1; i++) {
        [-0.85, 0.85].forEach(x => {
          const light = new THREE.Mesh(taillightGeo, mats.taillight);
          light.rotation.x = -Math.PI / 2;
          light.position.set(x, 0.7 + i * 0.13, -2.26);
          group.add(light);
        });
      }
      
      // Chrome grille
      const grilleGeo = getCachedGeometry('titan_grille', () =>
        new THREE.BoxGeometry(1.2, 0.3, 0.05)
      );
      const grille = new THREE.Mesh(grilleGeo, mats.chrome);
      grille.position.set(0, 0.55, 2.26);
      group.add(grille);
      
      // Dual side exhausts
      const exhaustGeo = getCachedGeometry('titan_exhaust', () =>
        new THREE.CylinderGeometry(0.1, 0.12, 0.4, 12)
      );
      [-0.5, 0.5].forEach(x => {
        const pipe = new THREE.Mesh(exhaustGeo, mats.exhaust);
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set(x, 0.2, -2.3);
        group.add(pipe);
      });
      
      // Racing stripes
      const stripeGeo = getCachedGeometry('titan_stripe', () =>
        new THREE.BoxGeometry(0.25, 0.01, 4.3)
      );
      const stripe = new THREE.Mesh(stripeGeo, mats.bodyAccent);
      stripe.position.y = 0.86;
      group.add(stripe);
      
      group.name = 'TitanMuscle';
      return group;
    },
    
    getWheelPositions() {
      return [
        new THREE.Vector3(-1.1, 0, 1.5),
        new THREE.Vector3(1.1, 0, 1.5),
        new THREE.Vector3(-1.1, 0, -1.5),
        new THREE.Vector3(1.1, 0, -1.5)
      ];
    },
    
    getCameraOffsets() {
      return {
        fpp: new THREE.Vector3(0, 0.8, 0.3),
        tpp: new THREE.Vector3(0, 3, -6),
        tppClose: new THREE.Vector3(0, 2.2, -4),
        hood: new THREE.Vector3(0, 1.1, 1)
      };
    },
    
    getDamageStates() {
      return [
        { level: 1, name: 'scratched', dents: [{ pos: [0.8, 0.6, 1.2], scale: 0.2 }], hoodOpen: false },
        { level: 2, name: 'damaged', dents: [{ pos: [0.5, 0.7, 0.5], scale: 0.3 }, { pos: [-0.9, 0.5, -1], scale: 0.25 }], hoodOpen: true },
        { level: 3, name: 'wrecked', dents: [{ pos: [0, 0.65, 0.8], scale: 0.5 }, { pos: [1, 0.55, -1.5], scale: 0.35 }, { pos: [-0.7, 0.6, 1.5], scale: 0.3 }], hoodOpen: true, missingBumper: true }
      ];
    }
  },

  // ==========================================================================
  // 3. VIXEN DRIFT (Sports/Drift Car)
  // Angular, widebody kit, large spoiler
  // ==========================================================================
  vixen: {
    id: 'vixen',
    name: 'Vixen Drift',
    type: 'sports',
    description: 'Angular drift car with widebody kit and large wing',
    
    getCustomMaterials() {
      return {
        body: createPBRMaterial({ color: 0xff1493, metalness: 0.85, roughness: 0.2 }),
        bodyAccent: createPBRMaterial({ color: 0xffffff, metalness: 0.9, roughness: 0.1 }),
        widebody: createPBRMaterial({ color: 0x1a1a1a, metalness: 0.4, roughness: 0.6 }),
        window: createGlassMaterial(0xaaccff),
        headlight: createLightMaterial(0xffffff, 4),
        taillight: createLightMaterial(0xff0066, 3),
        tire: createTireMaterial(),
        carbonFiber: createPBRMaterial({ color: 0x222222, metalness: 0.3, roughness: 0.5 }),
        neonPink: createNeonMaterial(0xff0066, 2)
      };
    },
    
    generateBodyMesh() {
      const group = new THREE.Group();
      const mats = this.getCustomMaterials();
      
      // Main angular body
      const bodyGeo = getCachedGeometry('vixen_body', () => {
        const geo = new THREE.BufferGeometry();
        const v = new Float32Array([
          // Front section (angled)
          -0.85, 0.1, 1.8,  0.85, 0.1, 1.8,  1.0, 0.5, 0.5,  -1.0, 0.5, 0.5,
          // Mid section
          -1.0, 0.5, 0.5,  1.0, 0.5, 0.5,  1.1, 0.5, -1.0, -1.1, 0.5, -1.0,
          // Rear section (angled up)
          -1.1, 0.5, -1.0, 1.1, 0.5, -1.0,  0.95, 0.65, -2.0, -0.95, 0.65, -2.0,
          // Bottom
          -0.85, 0.1, 1.8,  0.85, 0.1, 1.8,  0.95, 0.1, -2.0, -0.95, 0.1, -2.0
        ]);
        const idx = [0,1,2, 0,2,3, 2,4,5, 2,5,1, 4,6,7, 4,7,5, 6,8,9, 6,9,7, 8,10,11, 8,11,9, 0,3,13, 0,13,12, 1,12,13, 12,10,13, 13,11,10];
        geo.setIndex(idx);
        geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
        geo.computeVertexNormals();
        return geo;
      });
      const body = new THREE.Mesh(bodyGeo, mats.body);
      body.position.y = 0.35;
      group.add(body);
      
      // Widebody fender flares
      const fenderGeo = getCachedGeometry('vixen_fender', () =>
        new THREE.BoxGeometry(0.4, 0.45, 2.0)
      );
      [[-1.35, 0.55, 0], [1.35, 0.55, 0]].forEach(([x, y, z]) => {
        const fender = new THREE.Mesh(fenderGeo, mats.widebody);
        fender.position.set(x, y, z);
        group.add(fender);
      });
      
      // Angular cabin
      const cabinGeo = getCachedGeometry('vixen_cabin', () => {
        const geo = new THREE.BufferGeometry();
        const v = new Float32Array([
          -0.85, 0.52, 0.4, 0.85, 0.52, 0.4, 0.9, 0.95, -0.5, -0.9, 0.95, -0.5,
          -0.85, 0.52, -0.8, 0.85, 0.52, -0.8
        ]);
        const idx = [0,1,2, 0,2,3, 3,2,5, 3,5,4, 4,5,1, 4,1,0, 0,4,3, 1,5,2];
        geo.setIndex(idx);
        geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
        geo.computeVertexNormals();
        return geo;
      });
      const cabin = new THREE.Mesh(cabinGeo, mats.window);
      cabin.position.y = 0.35;
      group.add(cabin);
      
      // Large GT wing
      const wingGeo = getCachedGeometry('vixen_wing', () =>
        new THREE.BoxGeometry(2.4, 0.06, 0.35)
      );
      const wing = new THREE.Mesh(wingGeo, mats.carbonFiber);
      wing.position.set(0, 1.15, -2.0);
      group.add(wing);
      
      // Wing endplates
      const endplateGeo = getCachedGeometry('vixen_endplate', () =>
        new THREE.BoxGeometry(0.04, 0.3, 0.35)
      );
      [-1.2, 1.2].forEach(x => {
        const plate = new THREE.Mesh(endplateGeo, mats.carbonFiber);
        plate.position.set(x, 1.02, -2.0);
        group.add(plate);
      });
      
      // Wing stands
      const standGeo = getCachedGeometry('vixen_stand', () =>
        new THREE.BoxGeometry(0.08, 0.5, 0.08)
      );
      [-0.6, 0.6].forEach(x => {
        const stand = new THREE.Mesh(standGeo, mats.bodyAccent);
        stand.position.set(x, 0.9, -1.8);
        group.add(stand);
      });
      
      // Aggressive front splitter
      const splitterGeo = getCachedGeometry('vixen_splitter', () =>
        new THREE.BoxGeometry(2.2, 0.04, 0.4)
      );
      const splitter = new THREE.Mesh(splitterGeo, mats.carbonFiber);
      splitter.position.set(0, 0.12, 2.0);
      group.add(splitter);
      
      // Rear diffuser
      const diffuserGeo = getCachedGeometry('vixen_diffuser', () =>
        new THREE.BoxGeometry(1.8, 0.15, 0.4)
      );
      const diffuser = new THREE.Mesh(diffuserGeo, mats.widebody);
      diffuser.position.set(0, 0.15, -2.15);
      group.add(diffuser);
      
      // Sharp headlights
      const headlightGeo = getCachedGeometry('vixen_headlight', () =>
        new THREE.BoxGeometry(0.4, 0.08, 0.04)
      );
      [-0.6, 0.6].forEach(x => {
        const light = new THREE.Mesh(headlightGeo, mats.headlight);
        light.position.set(x, 0.52, 1.82);
        group.add(light);
      });
      
      // Taillight bar
      const taillightBarGeo = getCachedGeometry('vixen_taillight_bar', () =>
        new THREE.BoxGeometry(1.6, 0.06, 0.04)
      );
      const taillightBar = new THREE.Mesh(taillightBarGeo, mats.taillight);
      taillightBar.position.set(0, 0.62, -2.02);
      group.add(taillightBar);
      
      // Neon pink accents on mirrors
      const mirrorGeo = getCachedGeometry('vixen_mirror', () =>
        new THREE.BoxGeometry(0.12, 0.08, 0.06)
      );
      [-1.42, 1.42].forEach(x => {
        const mirror = new THREE.Mesh(mirrorGeo, mats.neonPink);
        mirror.position.set(x, 0.68, 0.3);
        group.add(mirror);
      });
      
      group.name = 'VixenDrift';
      return group;
    },
    
    getWheelPositions() {
      return [
        new THREE.Vector3(-1.2, 0, 1.3),
        new THREE.Vector3(1.2, 0, 1.3),
        new THREE.Vector3(-1.2, 0, -1.4),
        new THREE.Vector3(1.2, 0, -1.4)
      ];
    },
    
    getCameraOffsets() {
      return {
        fpp: new THREE.Vector3(0, 0.65, 0.15),
        tpp: new THREE.Vector3(0, 2.8, -5.5),
        tppClose: new THREE.Vector3(0, 2, -3.8),
        hood: new THREE.Vector3(0, 0.9, 0.7)
      };
    },
    
    getDamageStates() {
      return [
        { level: 1, name: 'scratched', dents: [{ pos: [0.6, 0.5, 1], scale: 0.18 }], bumperDamage: false },
        { level: 2, name: 'damaged', dents: [{ pos: [0.4, 0.48, 0.6], scale: 0.28 }, { pos: [-1.1, 0.45, -0.8], scale: 0.22 }], bumperDamage: true },
        { level: 3, name: 'wrecked', dents: [{ pos: [0, 0.55, 0.7], scale: 0.42 }, { pos: [1.1, 0.48, -1.5], scale: 0.32 }, { pos: [-0.6, 0.5, 1.2], scale: 0.26 }], bumperDamage: true, missingSpoiler: true }
      ];
    }
  },

  // ==========================================================================
  // 4. PHANTOM CYCLE (Motorcycle)
  // Lean, two-wheel design, rider silhouette
  // ==========================================================================
  phantom: {
    id: 'phantom',
    name: 'Phantom Cycle',
    type: 'motorcycle',
    description: 'Lean sport motorcycle with rider silhouette',
    
    getCustomMaterials() {
      return {
        body: createPBRMaterial({ color: 0x2d2d2d, metalness: 0.9, roughness: 0.15 }),
        bodyAccent: createPBRMaterial({ color: 0x9400d3, metalness: 0.8, roughness: 0.2 }),
        chrome: createPBRMaterial({ color: 0xeeeeee, metalness: 1.0, roughness: 0.03 }),
        seat: createPBRMaterial({ color: 0x1a1a1a, metalness: 0.1, roughness: 0.8 }),
        headlight: createLightMaterial(0xffffff, 5),
        taillight: createLightMaterial(0xff0000, 3),
        tire: createTireMaterial(),
        neonPurple: createNeonMaterial(0x9400d3, 2.5),
        exhaust: createPBRMaterial({ color: 0x333333, metalness: 0.85, roughness: 0.15 })
      };
    },
    
    generateBodyMesh() {
      const group = new THREE.Group();
      const mats = this.getCustomMaterials();
      
      // Main frame
      const frameGeo = getCachedGeometry('phantom_frame', () => {
        const geo = new THREE.BufferGeometry();
        const v = new Float32Array([
          // Steering column area
          0, 0.9, 0.8,
          // Handlebar clamp
          -0.25, 1.1, 0.9, 0.25, 1.1, 0.9,
          // Tank area
          -0.35, 0.85, 0.2, 0.35, 0.85, 0.2,
          // Seat area
          -0.3, 0.75, -0.4, 0.3, 0.75, -0.4,
          // Rear subframe
          0, 0.7, -1.2,
          // Engine area bottom
          -0.25, 0.35, 0, 0.25, 0.35, 0,
          // Swingarm pivot
          0, 0.35, -0.6
        ]);
        // Create tube-like connections
        const idx = [
          0,2,3, 0,3,1,  // steering to handlebars
          0,4,5, 0,5,2,  // steering to tank
          4,6,7, 4,7,5,  // tank to seat
          6,8,7,         // seat to rear
          9,11,10,       // engine bottom
          4,9,10, 4,10,5, // tank to engine
          6,11,10, 6,10,7  // seat to swingarm
        ];
        geo.setIndex(idx);
        geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
        geo.computeVertexNormals();
        return geo;
      });
      const frame = new THREE.Mesh(frameGeo, mats.body);
      group.add(frame);
      
      // Fuel tank
      const tankGeo = getCachedGeometry('phantom_tank', () =>
        new THREE.CapsuleGeometry(0.22, 0.5, 8, 16)
      );
      const tank = new THREE.Mesh(tankGeo, mats.bodyAccent);
      tank.rotation.z = Math.PI / 2;
      tank.position.set(0, 0.9, 0.2);
      group.add(tank);
      
      // Seat
      const seatGeo = getCachedGeometry('phantom_seat', () =>
        new THREE.BoxGeometry(0.35, 0.15, 0.7)
      );
      const seat = new THREE.Mesh(seatGeo, mats.seat);
      seat.position.set(0, 0.82, -0.35);
      group.add(seat);
      
      // Rear cowl/tail
      const tailGeo = getCachedGeometry('phantom_tail', () =>
        new THREE.ConeGeometry(0.2, 0.5, 8)
      );
      const tail = new THREE.Mesh(tailGeo, mats.body);
      tail.rotation.x = -Math.PI / 2 + 0.3;
      tail.position.set(0, 0.78, -1.1);
      group.add(tail);
      
      // Headlight assembly
      const headlightGeo = getCachedGeometry('phantom_headlight', () =>
        new THREE.CircleGeometry(0.15, 24)
      );
      const headlight = new THREE.Mesh(headlightGeo, mats.headlight);
      headlight.position.set(0, 0.75, 1.1);
      group.add(headlight);
      
      // Taillight
      const taillightGeo = getCachedGeometry('phantom_taillight', () =>
        new THREE.BoxGeometry(0.12, 0.04, 0.03)
      );
      const taillight = new THREE.Mesh(taillightGeo, mats.taillight);
      taillight.position.set(0, 0.72, -1.45);
      group.add(taillight);
      
      // Exhaust pipe (single sided)
      const exhaustGeo = getCachedGeometry('phantom_exhaust', () =>
        new THREE.CylinderGeometry(0.06, 0.08, 0.8, 12)
      );
      const exhaust = new THREE.Mesh(exhaustGeo, mats.exhaust);
      exhaust.rotation.z = Math.PI / 2;
      exhaust.position.set(0.2, 0.3, -0.8);
      group.add(exhaust);
      
      // Handlebars
      const handlebarGeo = getCachedGeometry('phantom_handlebar', () =>
        new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8)
      );
      const handlebar = new THREE.Mesh(handlebarGeo, mats.chrome);
      handlebar.rotation.z = Math.PI / 2;
      handlebar.position.set(0, 1.12, 0.9);
      group.add(handlebar);
      
      // Windscreen
      const windscreenGeo = getCachedGeometry('phantom_windscreen', () =>
        new THREE.PlaneGeometry(0.25, 0.3)
      );
      const windscreen = new THREE.Mesh(windscreenGeo, mats.window || createGlassMaterial(0xaaddff));
      windscreen.position.set(0, 1.05, 0.75);
      windscreen.rotation.x = -0.2;
      group.add(windscreen);
      
      // Rider silhouette (simplified humanoid shape)
      const riderGroup = this._generateRiderSilhouette(mats);
      group.add(riderGroup);
      
      // Neon accent strip along frame
      const neonStripGeo = getCachedGeometry('phantom_neon_strip', () =>
        new THREE.BoxGeometry(0.02, 0.02, 1.5)
      );
      const neonStrip = new THREE.Mesh(neonStripGeo, mats.neonPurple);
      neonStrip.position.set(0.36, 0.6, -0.2);
      group.add(neonStrip);
      
      group.name = 'PhantomCycle';
      return group;
    },
    
    _generateRiderSilhouette(mats) {
      const rider = new THREE.Group();
      
      // Torso
      const torsoGeo = getCachedGeometry('rider_torso', () =>
        new THREE.CapsuleGeometry(0.18, 0.35, 4, 8)
      );
      const torso = new THREE.Mesh(torsoGeo, mats.bodyAccent);
      torso.position.set(0, 1.25, -0.2);
      torso.rotation.x = 0.3;
      rider.add(torso);
      
      // Helmet
      const helmetGeo = getCachedGeometry('rider_helmet', () =>
        new THREE.SphereGeometry(0.14, 12, 12)
      );
      const helmet = new THREE.Mesh(helmetGeo, mats.body);
      helmet.position.set(0, 1.52, 0.05);
      rider.add(helmet);
      
      // Visor
      const visorGeo = getCachedGeometry('rider_visor', () =>
        new THREE.SphereGeometry(0.1, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2)
      );
      const visor = new THREE.Mesh(visorGeo, createGlassMaterial(0xffaa00));
      visor.position.set(0, 1.54, 0.12);
      visor.rotation.x = -0.3;
      rider.add(visor);
      
      rider.name = 'Rider';
      return rider;
    },
    
    getWheelPositions() {
      return [
        new THREE.Vector3(0, 0, 1.1),    // front wheel
        new THREE.Vector3(0, 0, -1.1),   // rear wheel
        new THREE.Vector3(0, 0, 0),      // dummy (motorcycles have 2 wheels)
        new THREE.Vector3(0, 0, 0)       // dummy
      ];
    },
    
    getCameraOffsets() {
      return {
        fpp: new THREE.Vector3(0, 1.3, 0.2),
        tpp: new THREE.Vector3(0, 3, -5),
        tppClose: new THREE.Vector3(0, 2.2, -3.5),
        hood: new THREE.Vector3(0, 1.1, 0.5)
      };
    },
    
    getDamageStates() {
      return [
        { level: 1, name: 'scratched', dents: [{ pos: [0.2, 0.5, 0.3], scale: 0.12 }] },
        { level: 2, name: 'damaged', dents: [{ pos: [0.1, 0.6, 0], scale: 0.2 }, { pos: [-0.15, 0.4, -0.6], scale: 0.15 }], exhaustDamage: true },
        { level: 3, name: 'wrecked', dents: [{ pos: [0, 0.55, 0.2], scale: 0.3 }, { pos: [0.2, 0.45, -0.8], scale: 0.25 }], exhaustDamage: true, fairingDamaged: true }
      ];
    }
  },

  // ==========================================================================
  // 5. RAPTOR ATV
  // High clearance, open frame, rugged tires
  // ==========================================================================
  raptor: {
    id: 'raptor',
    name: 'Raptor ATV',
    type: 'atv',
    description: 'High clearance ATV with open frame design',
    
    getCustomMaterials() {
      return {
        frame: createPBRMaterial({ color: 0xff6600, metalness: 0.7, roughness: 0.4 }),
        frameAccent: createPBRMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.5 }),
        plastic: createPBRMaterial({ color: 0x333333, metalness: 0.1, roughness: 0.8 }),
        seat: createPBRMaterial({ color: 0x1a1a1a, metalness: 0.0, roughness: 0.9 }),
        headlight: createLightMaterial(0xffffcc, 3),
        taillight: createLightMaterial(0xff3300, 2.5),
        tire: createTireMaterial(),
        chrome: createPBRMaterial({ color: 0xaaaaaa, metalness: 0.95, roughness: 0.1 })
      };
    },
    
    generateBodyMesh() {
      const group = new THREE.Group();
      const mats = this.getCustomMaterials();
      
      // Main frame tubes (visible open structure)
      const frameTubeGeo = getCachedGeometry('raptor_frame_tube', () =>
        new THREE.CylinderGeometry(0.04, 0.04, 2.0, 8)
      );
      
      // Longitudinal frame rails
      [-0.6, 0.6].forEach(x => {
        const rail = new THREE.Mesh(frameTubeGeo, mats.frame);
        rail.rotation.z = Math.PI / 2;
        rail.position.set(x, 0.5, 0);
        group.add(rail);
      });
      
      // Cross members
      const crossGeo = getCachedGeometry('raptor_cross', () =>
        new THREE.CylinderGeometry(0.035, 0.035, 1.2, 8)
      );
      [1.2, 0.3, -0.6, -1.3].forEach(z => {
        const cross = new THREE.Mesh(crossGeo, mats.frame);
        cross.rotation.x = Math.PI / 2;
        cross.position.set(0, 0.5, z);
        group.add(cross);
      });
      
      // Front bumper/grille guard
      const guardGeo = getCachedGeometry('raptor_guard', () =>
        new THREE.BoxGeometry(1.0, 0.4, 0.08)
      );
      const guard = new THREE.Mesh(guardGeo, mats.frameAccent);
      guard.position.set(0, 0.55, 1.6);
      group.add(guard);
      
      // Guard bars
      const guardBarGeo = getCachedGeometry('raptor_guard_bar', () =>
        new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8)
      );
      [-0.5, 0.5].forEach(x => {
        const bar = new THREE.Mesh(guardBarGeo, mats.frame);
        bar.position.set(x, 0.75, 1.55);
        group.add(bar);
      });
      
      // Fenders (mud guards)
      const fenderGeo = getCachedGeometry('raptor_fender', () => {
        const shape = new THREE.Shape();
        shape.absarc(0, 0, 0.5, 0, Math.PI, false);
        return new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
      });
      
      [[0, 0.7, 1.1], [0, 0.7, -1.1]].forEach(([x, y, z]) => {
        const fender = new THREE.Mesh(fenderGeo, mats.plastic);
        fender.position.set(x, y, z);
        fender.rotation.x = z > 0 ? 0 : Math.PI;
        fender.rotation.z = Math.PI / 2;
        group.add(fender);
      });
      
      // ATV Seat (bench style)
      const seatGeo = getCachedGeometry('raptor_seat', () =>
        new THREE.BoxGeometry(0.5, 0.2, 0.9)
      );
      const seat = new THREE.Mesh(seatGeo, mats.seat);
      seat.position.set(0, 0.75, -0.1);
      group.add(seat);
      
      // Rear cargo rack
      const rackGeo = getCachedGeometry('raptor_rack', () =>
        new THREE.BoxGeometry(0.9, 0.04, 0.6)
      );
      const rack = new THREE.Mesh(rackGeo, mats.frame);
      rack.position.set(0, 0.95, -1.3);
      group.add(rack);
      
      // Rack supports
      const rackSupportGeo = getCachedGeometry('raptor_rack_support', () =>
        new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6)
      );
      [-0.4, 0.4].forEach(x => {
        const support = new THREE.Mesh(rackSupportGeo, mats.frame);
        support.position.set(x, 0.75, -1.3);
        group.add(support);
      });
      
      // Headlights
      const headlightGeo = getCachedGeometry('raptor_headlight', () =>
        new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12)
      );
      [-0.35, 0.35].forEach(x => {
        const light = new THREE.Mesh(headlightGeo, mats.headlight);
        light.rotation.x = Math.PI / 2;
        light.position.set(x, 0.6, 1.58);
        group.add(light);
      });
      
      // Taillights
      const taillightGeo = getCachedGeometry('raptor_taillight', () =>
        new THREE.BoxGeometry(0.15, 0.08, 0.03)
      );
      [-0.4, 0.4].forEach(x => {
        const light = new THREE.Mesh(taillightGeo, mats.taillight);
        light.position.set(x, 0.6, -1.53);
        group.add(light);
      });
      
      // Handlebars
      const handlebarGeo = getCachedGeometry('raptor_handlebar', () =>
        new THREE.CylinderGeometry(0.025, 0.025, 0.8, 8)
      );
      const handlebar = new THREE.Mesh(handlebarGeo, mats.chrome);
      handlebar.rotation.z = Math.PI / 2;
      handlebar.position.set(0, 1.0, 1.2);
      group.add(handlebar);
      
      group.name = 'RaptorATV';
      return group;
    },
    
    getWheelPositions() {
      return [
        new THREE.Vector3(-0.75, 0, 1.1),
        new THREE.Vector3(0.75, 0, 1.1),
        new THREE.Vector3(-0.75, 0, -1.1),
        new THREE.Vector3(0.75, 0, -1.1)
      ];
    },
    
    getCameraOffsets() {
      return {
        fpp: new THREE.Vector3(0, 1.1, 0.4),
        tpp: new THREE.Vector3(0, 3.5, -6),
        tppClose: new THREE.Vector3(0, 2.5, -4),
        hood: new THREE.Vector3(0, 1.2, 0.8)
      };
    },
    
    getDamageStates() {
      return [
        { level: 1, name: 'scratched', dents: [{ pos: [0.4, 0.5, 1], scale: 0.15 }] },
        { level: 2, name: 'damaged', dents: [{ pos: [0.3, 0.55, 0.6], scale: 0.22 }, { pos: [-0.5, 0.45, -0.8], scale: 0.18 }], bentFrame: false },
        { level: 3, name: 'wrecked', dents: [{ pos: [0, 0.5, 0.7], scale: 0.35 }, { pos: [0.6, 0.48, -1], scale: 0.28 }], bentFrame: true, missingRack: true }
      ];
    }
  },

  // ==========================================================================
  // 6. DUNE BUGGY
  // Exposed frame, roll cage, large rear tires
  // ==========================================================================
  buggy: {
    id: 'buggy',
    name: 'Dune Buggy',
    type: 'buggy',
    description: 'Off-road buggy with exposed frame and roll cage',
    
    getCustomMaterials() {
      return {
        frame: createPBRMaterial({ color: 0xffcc00, metalness: 0.6, roughness: 0.5 }),
        rollCage: createPBRMaterial({ color: 0xeeeeee, metalness: 0.9, roughness: 0.15 }),
        bodyPanel: createPBRMaterial({ color: 0x2266cc, metalness: 0.3, roughness: 0.6 }),
        seat: createPBRMaterial({ color: 0xcc3333, metalness: 0.0, roughness: 0.85 }),
        headlight: createLightMaterial(0xffffaa, 3),
        taillight: createLightMaterial(0xff0000, 2.5),
        tire: createTireMaterial()
      };
    },
    
    generateBodyMesh() {
      const group = new THREE.Group();
      const mats = this.getCustomMaterials();
      
      // Main chassis frame
      const chassisGeo = getCachedGeometry('buggy_chassis', () =>
        new THREE.BoxGeometry(1.6, 0.08, 3.8)
      );
      const chassis = new THREE.Mesh(chassisGeo, mats.frame);
      chassis.position.y = 0.25;
      group.add(chassis);
      
      // Roll cage main hoop
      const hoopGeo = getCachedGeometry('buggy_hoop', () => {
        const curve = new THREE.EllipseCurve(0, 0, 0.7, 0.9, 0, Math.PI, false, 0);
        const points = curve.getPoints(20);
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        // Make it 3D by adding depth
        const positions = geo.attributes.position.array;
        const newPositions = new Float32Array(positions.length * 2 * 3);
        for (let i = 0; i < positions.length; i += 3) {
          newPositions[i * 2] = positions[i];
          newPositions[i * 2 + 1] = positions[i + 1];
          newPositions[i * 2 + 2] = 0;
          newPositions[i * 2 + 3] = positions[i];
          newPositions[i * 2 + 4] = positions[i + 1];
          newPositions[i * 2 + 5] = 0.04;
        }
        geo.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
        geo.setIndex(Array.from({ length: points.length * 2 }, (_, i) => i));
        return geo;
      });
      
      // Simplified roll cage using boxes
      const cageRailGeo = getCachedGeometry('buggy_cage_rail', () =>
        new THREE.CylinderGeometry(0.035, 0.035, 1.4, 8)
      );
      
      // Main hoop (U-shape from above)
      const mainHoopGeo = getCachedGeometry('buggy_main_hoop', () => {
        const geo = new THREE.BufferGeometry();
        const v = new Float32Array([
          -0.65, 0.3, -0.8, 0.65, 0.3, -0.8,
          0.65, 1.3, -0.8, -0.65, 1.3, -0.8,
          -0.65, 0.3, -0.84, 0.65, 0.3, -0.84,
          0.65, 1.3, -0.84, -0.65, 1.3, -0.84
        ]);
        const idx = [0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7, 4,5,6, 4,6,7];
        geo.setIndex(idx);
        geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
        geo.computeVertexNormals();
        return geo;
      });
      const mainHoop = new THREE.Mesh(mainHoopGeo, mats.rollCage);
      group.add(mainHoop);
      
      // Roof brace
      const roofBraceGeo = getCachedGeometry('buggy_roof_brace', () =>
        new THREE.CylinderGeometry(0.03, 0.03, 1.3, 8)
      );
      const roofBrace = new THREE.Mesh(roofBraceGeo, mats.rollCage);
      roofBrace.rotation.z = Math.PI / 2;
      roofBrace.position.set(0, 1.28, -0.82);
      group.add(roofBrace);
      
      // Front cage legs
      const legGeo = getCachedGeometry('buggy_leg', () =>
        new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8)
      );
      [[-0.6, 0.65, 0.3], [0.6, 0.65, 0.3]].forEach(([x, y, z]) => {
        const leg = new THREE.Mesh(legGeo, mats.rollCage);
        leg.position.set(x, y, z);
        group.add(leg);
      });
      
      // Body panels (front hood)
      const hoodGeo = getCachedGeometry('buggy_hood', () =>
        new THREE.BoxGeometry(1.4, 0.15, 1.2)
      );
      const hood = new THREE.Mesh(hoodGeo, mats.bodyPanel);
      hood.position.set(0, 0.38, 1.0);
      hood.rotation.x = -0.15;
      group.add(hood);
      
      // Side panels
      const sidePanelGeo = getCachedGeometry('buggy_side_panel', () =>
        new THREE.BoxGeometry(0.04, 0.4, 1.8)
      );
      [-0.78, 0.78].forEach(x => {
        const panel = new THREE.Mesh(sidePanelGeo, mats.bodyPanel);
        panel.position.set(x, 0.5, -0.2);
        group.add(panel);
      });
      
      // Bucket seats (dual)
      const bucketSeatGeo = getCachedGeometry('buggy_bucket_seat', () => {
        const geo = new THREE.BufferGeometry();
        const v = new Float32Array([
          -0.25, 0, -0.3, 0.25, 0, -0.3, 0.28, 0.35, -0.15, -0.28, 0.35, -0.15,
          -0.25, 0, 0.25, 0.25, 0, 0.25, 0.28, 0.35, 0.35, -0.28, 0.35, 0.35
        ]);
        const idx = [0,1,2, 0,2,3, 4,5,6, 4,6,7, 0,4,7, 0,7,3, 1,5,6, 1,6,2];
        geo.setIndex(idx);
        geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
        geo.computeVertexNormals();
        return geo;
      });
      
      [-0.3, 0.3].forEach(x => {
        const seat = new THREE.Mesh(bucketSeatGeo, mats.seat);
        seat.position.set(x, 0.33, -0.3);
        group.add(seat);
      });
      
      // Front nose cone
      const noseGeo = getCachedGeometry('buggy_nose', () =>
        new THREE.ConeGeometry(0.5, 0.6, 4)
      );
      const nose = new THREE.Mesh(noseGeo, mats.bodyPanel);
      nose.rotation.x = -Math.PI / 2;
      nose.position.set(0, 0.35, 1.7);
      group.add(nose);
      
      // Headlights mounted on nose
      const headlightGeo = getCachedGeometry('buggy_headlight', () =>
        new THREE.CircleGeometry(0.12, 16)
      );
      [-0.3, 0.3].forEach(x => {
        const light = new THREE.Mesh(headlightGeo, mats.headlight);
        light.position.set(x, 0.4, 2.0);
        group.add(light);
      });
      
      // Rear taillights
      const taillightGeo = getCachedGeometry('buggy_taillight', () =>
        new THREE.BoxGeometry(0.2, 0.1, 0.04)
      );
      [-0.6, 0.6].forEach(x => {
        const light = new THREE.Mesh(taillightGeo, mats.taillight);
        light.position.set(x, 0.45, -1.9);
        group.add(light);
      });
      
      // Rear wing/spoiler
      const wingGeo = getCachedGeometry('buggy_wing', () =>
        new THREE.BoxGeometry(1.5, 0.04, 0.3)
      );
      const wing = new THREE.Mesh(wingGeo, mats.rollCage);
      wing.position.set(0, 1.1, -1.6);
      group.add(wing);
      
      group.name = 'DuneBuggy';
      return group;
    },
    
    getWheelPositions() {
      return [
        new THREE.Vector3(-0.8, 0, 1.3),
        new THREE.Vector3(0.8, 0, 1.3),
        new THREE.Vector3(-0.9, 0, -1.3),
        new THREE.Vector3(0.9, 0, -1.3)
      ];
    },
    
    getCameraOffsets() {
      return {
        fpp: new THREE.Vector3(0, 1.0, 0.3),
        tpp: new THREE.Vector3(0, 3.5, -6),
        tppClose: new THREE.Vector3(0, 2.5, -4),
        hood: new THREE.Vector3(0, 1.0, 1.0)
      };
    },
    
    getDamageStates() {
      return [
        { level: 1, name: 'scratched', dents: [{ pos: [0.4, 0.4, 1.2], scale: 0.18 }] },
        { level: 2, name: 'damaged', dents: [{ pos: [0.3, 0.45, 0.8], scale: 0.25 }, { pos: [-0.6, 0.4, -0.6], scale: 0.2 }], panelDamage: true },
        { level: 3, name: 'wrecked', dents: [{ pos: [0, 0.45, 0.9], scale: 0.38 }, { pos: [0.7, 0.42, -1.2], scale: 0.3 }], panelDamage: true, cageBent: true }
      ];
    }
  },

  // ==========================================================================
  // 7. SPRINTER (Foot Runner)
  // Humanoid running pose, athletic build
  // ==========================================================================
  sprinter: {
    id: 'sprinter',
    name: 'Sprinter',
    type: 'foot',
    description: 'Athletic runner in dynamic pose',
    
    getCustomMaterials() {
      return {
        skin: createPBRMaterial({ color: 0xdb995a, metalness: 0.0, roughness: 0.7 }),
        suitPrimary: createPBRMaterial({ color: 0x00aaff, metalness: 0.3, roughness: 0.5 }),
        suitSecondary: createPBRMaterial({ color: 0xffffff, metalness: 0.4, roughness: 0.4 }),
        shoes: createPBRMaterial({ color: 0x222222, metalness: 0.2, roughness: 0.6 }),
        hair: createPBRMaterial({ color: 0x2a1a0a, metalness: 0.1, roughness: 0.8 }),
        neonAccent: createNeonMaterial(0x00aaff, 1.5)
      };
    },
    
    generateBodyMesh() {
      const group = new THREE.Group();
      const mats = this.getCustomMaterials();
      
      // Torso (leaning forward in running pose)
      const torsoGeo = getCachedGeometry('sprinter_torso', () =>
        new THREE.CapsuleGeometry(0.2, 0.4, 6, 12)
      );
      const torso = new THREE.Mesh(torsoGeo, mats.suitPrimary);
      torso.position.set(0, 1.15, 0);
      torso.rotation.x = 0.4; // Leaning forward
      group.add(torso);
      
      // Chest number plate
      const plateGeo = getCachedGeometry('sprinter_plate', () =>
        new THREE.BoxGeometry(0.2, 0.15, 0.02)
      );
      const plate = new THREE.Mesh(plateGeo, mats.suitSecondary);
      plate.position.set(0, 1.22, 0.18);
      plate.rotation.x = 0.4;
      group.add(plate);
      
      // Head
      const headGeo = getCachedGeometry('sprinter_head', () =>
        new THREE.SphereGeometry(0.14, 16, 16)
      );
      const head = new THREE.Mesh(headGeo, mats.skin);
      head.position.set(0, 1.5, 0.05);
      group.add(head);
      
      // Hair (short athletic cut)
      const hairGeo = getCachedGeometry('sprinter_hair', () =>
        new THREE.SphereGeometry(0.15, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2)
      );
      const hair = new THREE.Mesh(hairGeo, mats.hair);
      hair.position.set(0, 1.54, 0.02);
      group.add(hair);
      
      // Neck
      const neckGeo = getCachedGeometry('sprinter_neck', () =>
        new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8)
      );
      const neck = new THREE.Mesh(neckGeo, mats.skin);
      neck.position.set(0, 1.38, 0.02);
      group.add(neck);
      
      // Upper arms
      const upperArmGeo = getCachedGeometry('sprinter_upper_arm', () =>
        new THREE.CapsuleGeometry(0.055, 0.25, 4, 8)
      );
      
      // Left arm (forward in running pose)
      const leftArm = new THREE.Mesh(upperArmGeo, mats.suitPrimary);
      leftArm.position.set(-0.28, 1.22, 0.12);
      leftArm.rotation.z = 0.8;
      leftArm.rotation.x = -0.3;
      group.add(leftArm);
      
      // Right arm (back in running pose)
      const rightArm = new THREE.Mesh(upperArmGeo, mats.suitPrimary);
      rightArm.position.set(0.28, 1.18, -0.08);
      rightArm.rotation.z = -0.7;
      rightArm.rotation.x = 0.2;
      group.add(rightArm);
      
      // Forearms
      const forearmGeo = getCachedGeometry('sprinter_forearm', () =>
        new THREE.CapsuleGeometry(0.045, 0.22, 4, 8)
      );
      
      const leftForearm = new THREE.Mesh(forearmGeo, mats.skin);
      leftForearm.position.set(-0.42, 1.12, 0.28);
      leftForearm.rotation.z = 1.2;
      group.add(leftForearm);
      
      const rightForearm = new THREE.Mesh(forearmGeo, mats.skin);
      rightForearm.position.set(0.46, 1.08, -0.18);
      rightForearm.rotation.z = -1.1;
      group.add(rightForearm);

      
      // Hands
      const handGeo = getCachedGeometry('sprinter_hand', () =>
        new THREE.SphereGeometry(0.055, 8, 8)
      );
      
      const leftHand = new THREE.Mesh(handGeo, mats.skin);
      leftHand.position.set(-0.52, 1.05, 0.38);
      group.add(leftHand);
      
      const rightHand = new THREE.Mesh(handGeo, mats.skin);
      rightHand.position.set(0.56, 1.0, -0.26);
      group.add(rightHand);
      
      // Pelvis/Hips
      const pelvisGeo = getCachedGeometry('sprinter_pelvis', () =>
        new THREE.CapsuleGeometry(0.14, 0.12, 4, 8)
      );
      const pelvis = new THREE.Mesh(pelvisGeo, mats.suitSecondary);
      pelvis.position.set(0, 0.9, -0.02);
      pelvis.rotation.x = 0.4;
      group.add(pelvis);
      
      // Upper legs
      const upperLegGeo = getCachedGeometry('sprinter_upper_leg', () =>
        new THREE.CapsuleGeometry(0.08, 0.35, 4, 8)
      );
      
      // Left leg (extended back)
      const leftLeg = new THREE.Mesh(upperLegGeo, mats.suitPrimary);
      leftLeg.position.set(-0.1, 0.58, -0.15);
      leftLeg.rotation.x = 0.6;
      group.add(leftLeg);
      
      // Right leg (forward, bent)
      const rightLeg = new THREE.Mesh(upperLegGeo, mats.suitPrimary);
      rightLeg.position.set(0.1, 0.6, 0.15);
      rightLeg.rotation.x = -0.4;
      group.add(rightLeg);
      
      // Lower legs/calves
      const calfGeo = getCachedGeometry('sprinter_calf', () =>
        new THREE.CapsuleGeometry(0.06, 0.32, 4, 8)
      );
      
      const leftCalf = new THREE.Mesh(calfGeo, mats.suitSecondary);
      leftCalf.position.set(-0.12, 0.22, -0.35);
      leftCalf.rotation.x = 0.3;
      group.add(leftCalf);
      
      const rightCalf = new THREE.Mesh(calfGeo, mats.suitSecondary);
      rightCalf.position.set(0.12, 0.28, 0.25);
      rightCalf.rotation.x = -0.1;
      group.add(rightCalf);
      
      // Feet/Shoes
      const shoeGeo = getCachedGeometry('sprinter_shoe', () =>
        new THREE.BoxGeometry(0.1, 0.08, 0.2)
      );
      
      const leftShoe = new THREE.Mesh(shoeGeo, mats.shoes);
      leftShoe.position.set(-0.12, 0.04, -0.5);
      leftShoe.rotation.x = 0.2;
      group.add(leftShoe);
      
      const rightShoe = new THREE.Mesh(shoeGeo, mats.shoes);
      rightShoe.position.set(0.14, 0.1, 0.42);
      rightShoe.rotation.x = -0.15;
      group.add(rightShoe);
      
      // Neon accent stripes on suit
      const stripeGeo = getCachedGeometry('sprinter_stripe', () =>
        new THREE.BoxGeometry(0.01, 0.25, 0.01)
      );
      const stripe = new THREE.Mesh(stripeGeo, mats.neonAccent);
      stripe.position.set(0.21, 1.18, 0.09);
      stripe.rotation.x = 0.4;
      group.add(stripe);
      
      group.name = 'Sprinter';
      return group;
    },
    
    getWheelPositions() {
      // Runners don't have wheels, return foot positions
      return [
        new THREE.Vector3(-0.12, 0, -0.5),   // left foot
        new THREE.Vector3(0.14, 0, 0.42),     // right foot
        new THREE.Vector3(0, 0, 0),           // dummy
        new THREE.Vector3(0, 0, 0)            // dummy
      ];
    },
    
    getCameraOffsets() {
      return {
        fpp: new THREE.Vector3(0, 1.5, 0.1),
        tpp: new THREE.Vector3(0, 2.8, -4),
        tppClose: new THREE.Vector3(0, 2, -2.5),
        hood: new THREE.Vector3(0, 1.7, 0.5)
      };
    },
    
    getDamageStates() {
      return [
        { level: 1, name: 'tired', visualEffect: 'slight_slow' },
        { level: 2, name: 'exhausted', visualEffect: 'heavy_breathing' },
        { level: 3, name: 'injured', visualEffect: 'limping' }
      ];
    }
  },

  // ==========================================================================
  // 8. BOLT EV (Electric Vehicle)
  // Streamlined, smooth surfaces, blue accent lighting
  // ==========================================================================
  bolt: {
    id: 'bolt',
    name: 'Bolt EV',
    type: 'electric',
    description: 'Streamlined electric vehicle with blue accent lighting',
    
    getCustomMaterials() {
      return {
        body: createPBRMaterial({ color: 0xe8e8e8, metalness: 0.85, roughness: 0.15 }),
        bodyAccent: createPBRMaterial({ color: 0x0066ff, metalness: 0.7, roughness: 0.25 }),
        glass: createGlassMaterial(0x99ddff),
        headlight: createLightMaterial(0xffffff, 5),
        taillight: createLightMaterial(0xff0000, 3),
        tire: createTireMaterial(),
        chrome: createPBRMaterial({ color: 0xdddddd, metalness: 1.0, roughness: 0.05 }),
        neonBlue: createNeonMaterial(0x0088ff, 2.5),
        trim: createPBRMaterial({ color: 0x333333, metalness: 0.9, roughness: 0.2 })
      };
    },
    
    generateBodyMesh() {
      const group = new THREE.Group();
      const mats = this.getCustomMaterials();
      
      // Streamlined teardrop body
      const bodyGeo = getCachedGeometry('bolt_body', () => {
        const geo = new THREE.BufferGeometry();
        const v = new Float32Array([
          // Nose (pointed)
          0, 0.35, 2.2,
          // Front shoulders
          -0.9, 0.45, 1.4, 0.9, 0.45, 1.4,
          // Midsection (widest)
          -1.05, 0.55, 0, 1.05, 0.55, 0,
          // Rear hips
          -0.95, 0.5, -1.2, 0.95, 0.5, -1.2,
          // Tail
          0, 0.45, -2.0,
          // Bottom edge
          0, 0.08, 2.0, -0.85, 0.08, 1.2, 0.85, 0.08, 1.2,
          -1.0, 0.08, 0, 1.0, 0.08, 0,
          -0.9, 0.08, -1.2, 0.9, 0.08, -1.2,
          0, 0.08, -1.9
        ]);
        const idx = [
          0,2,1, 0,1,8, 0,8,9, 0,9,2,
          1,2,4, 1,4,3, 1,3,10, 1,10,9,
          2,4,5, 2,5,3, 3,5,11, 3,11,10,
          4,5,6, 4,6,7, 5,7,12, 5,12,11,
          6,7,13, 6,13,12, 7,6,14, 7,14,13,
          8,9,10, 10,11,12, 12,13,14
        ];
        geo.setIndex(idx);
        geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
        geo.computeVertexNormals();
        return geo;
      });
      const body = new THREE.Mesh(bodyGeo, mats.body);
      group.add(body);
      
      // Smooth curved roof/cabin
      const cabinGeo = getCachedGeometry('bolt_cabin', () =>
        new THREE.SphereGeometry(0.7, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)
      );
      const cabin = new THREE.Mesh(cabinGeo, mats.glass);
      cabin.position.set(0, 0.85, -0.2);
      cabin.scale.set(0.8, 0.6, 1.1);
      group.add(cabin);
      
      // LED light bar front
      const frontLightBarGeo = getCachedGeometry('bolt_front_lightbar', () =>
        new THREE.BoxGeometry(1.6, 0.03, 0.02)
      );
      const frontLightBar = new THREE.Mesh(frontLightBarGeo, mats.headlight);
      frontLightBar.position.set(0, 0.52, 2.21);
      group.add(frontLightBar);
      
      // LED light bar rear (continuous)
      const rearLightBarGeo = getCachedGeometry('bolt_rear_lightbar', () =>
        new THREE.BoxGeometry(1.7, 0.04, 0.02)
      );
      const rearLightBar = new THREE.Mesh(rearLightBarGeo, mats.taillight);
      rearLightBar.position.set(0, 0.52, -2.01);
      group.add(rearLightBar);
      
      // Blue accent line along sides
      const accentLineGeo = getCachedGeometry('bolt_accent_line', () =>
        new THREE.BoxGeometry(0.015, 0.02, 3.6)
      );
      [-1.06, 1.06].forEach(x => {
        const line = new THREE.Mesh(accentLineGeo, mats.neonBlue);
        line.position.set(x, 0.32, 0);
        group.add(line);
      });
      
      // Closed grille (EV has no grille, smooth front)
      const grilleGeo = getCachedGeometry('bolt_grille', () =>
        new THREE.BoxGeometry(1.2, 0.2, 0.03)
      );
      const grille = new THREE.Mesh(grilleGeo, mats.trim);
      grille.position.set(0, 0.35, 2.21);
      group.add(grille);
      
      // Aerodynamic wheels covers (smooth discs)
      const wheelCoverGeo = getCachedGeometry('bolt_wheel_cover', () =>
        new THREE.CircleGeometry(0.32, 24)
      );
      
      // Will be positioned at wheel locations by the game
      // Store reference for later use
      group.userData.wheelCoverGeo = wheelCoverGeo;
      group.userData.wheelCoverMat = mats.bodyAccent;
      
      // Slim side mirrors
      const mirrorGeo = getCachedGeometry('bolt_mirror', () =>
        new THREE.BoxGeometry(0.06, 0.06, 0.12)
      );
      [-1.08, 1.08].forEach(x => {
        const mirror = new THREE.Mesh(mirrorGeo, mats.body);
        mirror.position.set(x, 0.65, 0.6);
        group.add(mirror);
      });
      
      // Door handles (flush, aerodynamic)
      const handleGeo = getCachedGeometry('bolt_handle', () =>
        new THREE.BoxGeometry(0.12, 0.025, 0.025)
      );
      [-0.5, 0.5].forEach(x => {
        const handle = new THREE.Mesh(handleGeo, mats.chrome);
        handle.position.set(x, 0.42, 0.1);
        group.add(handle);
      });
      
      // Subtle rear spoiler integrated into trunk
      const spoilerGeo = getCachedGeometry('bolt_spoiler', () =>
        new THREE.BoxGeometry(1.4, 0.025, 0.15)
      );
      const spoiler = new THREE.Mesh(spoilerGeo, mats.body);
      spoiler.position.set(0, 0.57, -1.95);
      group.add(spoiler);
      
      // Blue glow underneath (EV power indicator)
      const underGlowGeo = getCachedGeometry('bolt_underglow', () =>
        new THREE.BoxGeometry(1.8, 0.01, 3.8)
      );
      const underGlow = new THREE.Mesh(underGlowGeo, mats.neonBlue);
      underGlow.position.y = 0.04;
      group.add(underGlow);
      
      group.name = 'BoltEV';
      return group;
    },
    
    getWheelPositions() {
      return [
        new THREE.Vector3(-0.95, 0, 1.3),
        new THREE.Vector3(0.95, 0, 1.3),
        new THREE.Vector3(-0.95, 0, -1.2),
        new THREE.Vector3(0.95, 0, -1.2)
      ];
    },
    
    getCameraOffsets() {
      return {
        fpp: new THREE.Vector3(0, 0.7, 0.2),
        tpp: new THREE.Vector3(0, 2.8, -5.5),
        tppClose: new THREE.Vector3(0, 2, -3.8),
        hood: new THREE.Vector3(0, 0.95, 0.9)
      };
    },
    
    getDamageStates() {
      return [
        { level: 1, name: 'scratched', dents: [{ pos: [0.5, 0.4, 1.2], scale: 0.15 }] },
        { level: 2, name: 'damaged', dents: [{ pos: [0.4, 0.45, 0.7], scale: 0.24 }, { pos: [-0.8, 0.4, -0.8], scale: 0.18 }], lightBarCracked: false },
        { level: 3, name: 'wrecked', dents: [{ pos: [0, 0.48, 0.8], scale: 0.38 }, { pos: [0.9, 0.43, -1.1], scale: 0.28 }], lightBarCracked: true }
      ];
    }
  },

  // ==========================================================================
  // 9. MAMMOTH (Monster Truck)
  // Huge lifted body, oversized tires, chrome details
  // ==========================================================================
  mammoth: {
    id: 'mammoth',
    name: 'Mammoth',
    type: 'monster_truck',
    description: 'Massive monster truck with oversized tires and chrome details',
    
    getCustomMaterials() {
      return {
        body: createPBRMaterial({ color: 0xaa0000, metalness: 0.5, roughness: 0.5 }),
        bodyAccent: createPBRMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.4 }),
        chrome: createPBRMaterial({ color: 0xeeeeee, metalness: 1.0, roughness: 0.03 }),
        window: createGlassMaterial(0x334455),
        headlight: createLightMaterial(0xffffcc, 4),
        taillight: createLightMaterial(0xff0000, 3),
        tire: createTireMaterial(),
        undercarriage: createPBRMaterial({ color: 0x444444, metalness: 0.7, roughness: 0.4 }),
        skullDecal: createPBRMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.5 })
      };
    },
    
    generateBodyMesh() {
      const group = new THREE.Group();
      const mats = this.getCustomMaterials();
      
      // Massive lifted body
      const bodyGeo = getCachedGeometry('mammoth_body', () =>
        new THREE.BoxGeometry(2.4, 1.2, 4.2)
      );
      const body = new THREE.Mesh(bodyGeo, mats.body);
      body.position.y = 1.4;
      group.add(body);
      
      // Hood with massive scoop
      const hoodGeo = getCachedGeometry('mammoth_hood', () =>
        new THREE.BoxGeometry(2.2, 0.25, 1.5)
      );
      const hood = new THREE.Mesh(hoodGeo, mats.body);
      hood.position.set(0, 2.1, 1.2);
      group.add(hood);
      
      // Giant air scoop
      const scoopGeo = getCachedGeometry('mammoth_scoop', () =>
        new THREE.BoxGeometry(0.6, 0.5, 0.8)
      );
      const scoop = new THREE.Mesh(scoopGeo, mats.chrome);
      scoop.position.set(0, 2.5, 1.5);
      group.add(scoop);
      
      // Scoole intake
      const intakeGeo = getCachedGeometry('mammoth_intake', () =>
        new THREE.CylinderGeometry(0.2, 0.25, 0.15, 16)
      );
      const intake = new THREE.Mesh(intakeGeo, mats.bodyAccent);
      intake.position.set(0, 2.8, 1.5);
      group.add(intake);
      
      // Cabin
      const cabinGeo = getCachedGeometry('mammoth_cabin', () =>
        new THREE.BoxGeometry(2.0, 0.8, 1.6)
      );
      const cabin = new THREE.Mesh(cabinGeo, mats.window);
      cabin.position.set(0, 2.35, -0.3);
      group.add(cabin);
      
      // Massive front grille
      const grilleGeo = getCachedGeometry('mammoth_grille', () =>
        new THREE.BoxGeometry(1.8, 0.6, 0.1)
      );
      const grille = new THREE.Mesh(grilleGeo, mats.chrome);
      grille.position.set(0, 1.75, 2.15);
      group.add(grille);
      
      // Grille bars
      const grilleBarGeo = getCachedGeometry('mammoth_grille_bar', () =>
        new THREE.BoxGeometry(0.04, 0.55, 0.12)
      );
      for (let i = -4; i <= 4; i++) {
        const bar = new THREE.Mesh(grilleBarGeo, mats.bodyAccent);
        bar.position.set(i * 0.18, 1.75, 2.16);
        group.add(bar);
      }
      
      // Four round headlights
      const headlightGeo = getCachedGeometry('mammoth_headlight', () =>
        new THREE.CylinderGeometry(0.2, 0.2, 0.1, 20)
      );
      [[-0.6, 1.95, 2.22], [0.6, 1.95, 2.22], [-0.6, 1.55, 2.22], [0.6, 1.55, 2.22]].forEach(([x, y, z]) => {
        const light = new THREE.Mesh(headlightGeo, mats.headlight);
        light.rotation.x = Math.PI / 2;
        light.position.set(x, y, z);
        group.add(light);
      });
      
      // Oversized taillights
      const taillightGeo = getCachedGeometry('mammoth_taillight', () =>
        new THREE.BoxGeometry(0.5, 0.25, 0.06)
      );
      [-0.9, 0.9].forEach(x => {
        const light = new THREE.Mesh(taillightGeo, mats.taillight);
        light.position.set(x, 1.85, -2.13);
        group.add(light);
      });
      
      // Huge bumpers
      const frontBumperGeo = getCachedGeometry('mammoth_front_bumper', () =>
        new THREE.BoxGeometry(2.5, 0.4, 0.25)
      );
      const frontBumper = new THREE.Mesh(frontBumperGeo, mats.chrome);
      frontBumper.position.set(0, 1.15, 2.25);
      group.add(frontBumper);
      
      // Bumper push bar
      const pushBarGeo = getCachedGeometry('mammoth_push_bar', () =>
        new THREE.CylinderGeometry(0.06, 0.06, 2.2, 12)
      );
      const pushBar = new THREE.Mesh(pushBarGeo, mats.chrome);
      pushBar.rotation.z = Math.PI / 2;
      pushBar.position.set(0, 1.5, 2.35);
      group.add(pushBar);
      
      // Push bar verticals
      const pushVertGeo = getCachedGeometry('mammoth_push_vert', () =>
        new THREE.CylinderGeometry(0.05, 0.05, 0.5, 10)
      );
      [-0.9, 0.9].forEach(x => {
        const vert = new THREE.Mesh(pushVertGeo, mats.chrome);
        vert.position.set(x, 1.4, 2.35);
        group.add(vert);
      });
      
      // Rear bumper
      const rearBumperGeo = getCachedGeometry('mammoth_rear_bumper', () =>
        new THREE.BoxGeometry(2.5, 0.35, 0.2)
      );
      const rearBumper = new THREE.Mesh(rearBumperGeo, mats.chrome);
      rearBumper.position.set(0, 1.1, -2.2);
      group.add(rearBumper);
      
      // Massive exhaust stacks (smokestack style)
      const stackGeo = getCachedGeometry('mammoth_stack', () =>
        new THREE.CylinderGeometry(0.15, 0.18, 1.0, 16)
      );
      [-0.7, 0.7].forEach(x => {
        const stack = new THREE.Mesh(stackGeo, mats.chrome);
        stack.position.set(x, 2.6, -1.5);
        group.add(stack);
        
        // Stack top ring
        const ringGeo = getCachedGeometry('mammoth_stack_ring', () =>
          new THREE.TorusGeometry(0.17, 0.025, 8, 16)
        );
        const ring = new THREE.Mesh(ringGeo, mats.bodyAccent);
        ring.position.set(x, 3.12, -1.5);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
      });
      
      // Visible undercarriage/suspension components
      const chassisRailGeo = getCachedGeometry('mammoth_chassis_rail', () =>
        new THREE.BoxGeometry(0.2, 0.15, 3.5)
      );
      [-0.9, 0.9].forEach(x => {
        const rail = new THREE.Mesh(chassisRailGeo, mats.undercarriage);
        rail.position.set(x, 0.7, 0);
        group.add(rail);
      });
      
      // Skull decal on hood (simplified)
      const skullGeo = getCachedGeometry('mammoth_skull', () =>
        new THREE.CircleGeometry(0.35, 16)
      );
      const skull = new THREE.Mesh(skullGeo, mats.skullDecal);
      skull.position.set(0, 2.26, 0.7);
      skull.rotation.x = -Math.PI / 2;
      group.add(skull);
      
      // Monster truck name text area
      const namePlateGeo = getCachedGeometry('mammoth_name_plate', () =>
        new THREE.BoxGeometry(1.2, 0.2, 0.02)
      );
      const namePlate = new THREE.Mesh(namePlateGeo, mats.skullDecal);
      namePlate.position.set(0, 1.85, -2.12);
      group.add(namePlate);
      
      group.name = 'Mammoth';
      return group;
    },
    
    getWheelPositions() {
      // Much wider track and larger offset due to monster truck proportions
      return [
        new THREE.Vector3(-1.3, 0.5, 1.5),
        new THREE.Vector3(1.3, 0.5, 1.5),
        new THREE.Vector3(-1.3, 0.5, -1.5),
        new THREE.Vector3(1.3, 0.5, -1.5)
      ];
    },
    
    getCameraOffsets() {
      return {
        fpp: new THREE.Vector3(0, 2.2, 0.5),
        tpp: new THREE.Vector3(0, 5, -9),
        tppClose: new THREE.Vector3(0, 3.5, -6),
        hood: new THREE.Vector3(0, 2.6, 1.2)
      };
    },
    
    getDamageStates() {
      return [
        { level: 1, name: 'scratched', dents: [{ pos: [1, 1.5, 1.5], scale: 0.25 }] },
        { level: 2, name: 'damaged', dents: [{ pos: [0.8, 1.6, 1], scale: 0.4 }, { pos: [-1.1, 1.4, -1], scale: 0.35 }], bentPushBar: false },
        { level: 3, name: 'wrecked', dents: [{ pos: [0, 1.7, 1.2], scale: 0.6 }, { pos: [1.2, 1.5, -1.5], scale: 0.45 }], bentPushBar: true, missingStack: true }
      ];
    }
  },

  // ==========================================================================
  // 10. WRAITH (Secret/Bonus Vehicle)
  // Futuristic hover car, translucent body, holographic effects
  // ==========================================================================
  wraith: {
    id: 'wraith',
    name: 'Wraith',
    type: 'special',
    description: 'Futuristic hover vehicle with holographic effects',
    
    getCustomMaterials() {
      return {
        body: createPBRMaterial({ 
          color: 0x8844aa, 
          metalness: 0.9, 
          roughness: 0.1,
          transparent: true,
          opacity: 0.7
        }),
        bodyCore: createPBRMaterial({ 
          color: 0xdd88ff, 
          metalness: 0.95, 
          roughness: 0.05,
          emissive: 0xaa44ff,
          emissiveIntensity: 1
        }),
        glass: createGlassMaterial(0xccffff),
        hologram: createPBRMaterial({
          color: 0x00ffff,
          metalness: 0.5,
          roughness: 0.2,
          transparent: true,
          opacity: 0.5,
          emissive: 0x00ffff,
          emissiveIntensity: 2
        }),
        thruster: createLightMaterial(0x00ffff, 4),
        tire: createTireMaterial(), // Not used but required
        energyLine: createNeonMaterial(0x00ffff, 3)
      };
    },
    
    generateBodyMesh() {
      const group = new THREE.Group();
      const mats = this.getCustomMaterials();
      
      // Floating body shell (elongated teardrop)
      const bodyGeo = getCachedGeometry('wraith_body', () => {
        const geo = new THREE.LatheGeometry([
          new THREE.Vector2(0, 0),
          new THREE.Vector2(0.3, 0.1),
          new THREE.Vector2(0.9, 0.3),
          new THREE.Vector2(1.0, 0.8),
          new THREE.Vector2(0.85, 1.5),
          new THREE.Vector2(0.5, 2.0),
          new THREE.Vector2(0.2, 2.2),
          new THREE.Vector2(0, 2.25)
        ], 24);
        geo.scale(1, 0.4, 1);
        return geo;
      });
      const body = new THREE.Mesh(bodyGeo, mats.body);
      body.rotation.x = Math.PI / 2;
      body.scale.set(1, 1, 0.5);
      group.add(body);
      
      // Inner core glow
      const coreGeo = getCachedGeometry('wraith_core', () =>
        new THREE.SphereGeometry(0.5, 20, 20)
      );
      const core = new THREE.Mesh(coreGeo, mats.bodyCore);
      core.position.set(0, 0.55, 0);
      core.scale.set(1.5, 0.6, 0.8);
      group.add(core);
      
      // Cockpit canopy
      const canopyGeo = getCachedGeometry('wraith_canopy', () =>
        new THREE.SphereGeometry(0.5, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2)
      );
      const canopy = new THREE.Mesh(canopyGeo, mats.glass);
      canopy.position.set(0, 0.85, 0.2);
      canopy.scale.set(1.2, 0.7, 1.4);
      group.add(canopy);
      
      // Holographic ring elements
      const ringGeo = getCachedGeometry('wraith_ring', () =>
        new THREE.TorusGeometry(0.8, 0.03, 8, 32)
      );
      
      // Spinning rings around body
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(ringGeo, mats.hologram);
        ring.position.set(0, 0.4, -0.3 + i * 0.4);
        ring.rotation.x = Math.PI / 2;
        ring.userData.spinSpeed = (i + 1) * 0.5;
        group.add(ring);
      }
      
      // Energy lines along body
      const lineGeo = getCachedGeometry('wraith_line', () =>
        new THREE.BoxGeometry(0.02, 0.02, 2.2)
      );
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        const line = new THREE.Mesh(lineGeo, mats.energyLine);
        line.position.set(
          Math.cos(angle) * 0.9,
          0.35,
          Math.sin(angle) * 0.4
        );
        group.add(line);
      }
      
      // Hover thrusters (bottom)
      const thrusterGeo = getCachedGeometry('wraith_thruster', () =>
        new THREE.CylinderGeometry(0.15, 0.2, 0.2, 16)
      );
      
      const thrusterPositions = [
        [-0.5, 0.1, 0.6],
        [0.5, 0.1, 0.6],
        [-0.5, 0.1, -0.6],
        [0.5, 0.1, -0.6]
      ];
      
      thrusterPositions.forEach(([x, y, z]) => {
        const thruster = new THREE.Mesh(thrusterGeo, mats.thruster);
        thruster.position.set(x, y, z);
        group.add(thruster);
        
        // Thruster glow disc
        const glowDiscGeo = getCachedGeometry('wraith_glow_disc', () =>
          new THREE.CircleGeometry(0.18, 16)
        );
        const glowDisc = new THREE.Mesh(glowDiscGeo, mats.hologram);
        glowDisc.position.set(x, 0.01, z);
        glowDisc.rotation.x = -Math.PI / 2;
        group.add(glowDisc);
      });
      
      // Front directional light
      const frontLightGeo = getCachedGeometry('wraith_front_light', () =>
        new THREE.ConeGeometry(0.15, 0.3, 12)
      );
      const frontLight = new THREE.Mesh(frontLightGeo, mats.thruster);
      frontLight.rotation.x = -Math.PI / 2;
      frontLight.position.set(0, 0.5, 1.15);
      group.add(frontLight);
      
      // Rear stabilizer fins
      const finGeo = getCachedGeometry('wraith_fin', () => {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(0.3, 0.5);
        shape.lineTo(0, 0.8);
        shape.lineTo(-0.1, 0.5);
        shape.closePath();
        return new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
      });
      
      [-0.7, 0.7].forEach(x => {
        const fin = new THREE.Mesh(finGeo, mats.hologram);
        fin.position.set(x, 0.35, -1.0);
        fin.rotation.y = x > 0 ? -0.3 : 0.3;
        group.add(fin);
      });
      
      group.name = 'Wraith';
      group.userData.isHoverVehicle = true;
      return group;
    },
    
    getWheelPositions() {
      // Hover vehicle uses thrusters instead of wheels
      return [
        new THREE.Vector3(-0.5, 0, 0.6),
        new THREE.Vector3(0.5, 0, 0.6),
        new THREE.Vector3(-0.5, 0, -0.6),
        new THREE.Vector3(0.5, 0, -0.6)
      ];
    },
    
    getCameraOffsets() {
      return {
        fpp: new THREE.Vector3(0, 0.8, 0.2),
        tpp: new THREE.Vector3(0, 3, -5),
        tppClose: new THREE.Vector3(0, 2.2, -3.5),
        hood: new THREE.Vector3(0, 1.0, 0.8)
      };
    },
    
    getDamageStates() {
      return [
        { level: 1, name: 'flickering', effect: 'hologram_flicker' },
        { level: 2, name: 'unstable', effect: 'phase_in_out' },
        { level: 3, name: 'critical', effect: 'core_exposed' }
      ];
    }
  }
};

// ============================================================================
// WHEEL GENERATOR — Shared wheel mesh generator
// ============================================================================

export function generateWheelMesh(radius = 0.35, width = 0.2, vehicleType = 'sports') {
  const group = new THREE.Group();
  
  // Tire outer
  const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 24);
  const tireMat = createTireMaterial();
  const tire = new THREE.Mesh(tireGeo, tireMat);
  tire.rotation.x = Math.PI / 2;
  group.add(tire);
  
  // Tire tread detail (outer rim bumps)
  const treadGeo = new THREE.TorusGeometry(radius - 0.01, 0.015, 6, 36);
  const tread = new THREE.Mesh(treadGeo, tireMat);
  tread.rotation.y = Math.PI / 2;
  group.add(tread);
  
  // Rim based on vehicle type
  let rimDesign;
  
  switch (vehicleType) {
    case 'sports':
    case 'electric':
      // Multi-spoke alloy
      rimDesign = createAlloyRim(radius * 0.7, width + 0.02, 5);
      break;
    case 'muscle':
      // Classic chrome
      rimDesign = createClassicRim(radius * 0.65, width + 0.02);
      break;
    case 'monster_truck':
      // Heavy duty solid
      rimDesign = createSolidRim(radius * 0.6, width + 0.04);
      break;
    case 'atv':
    case 'buggy':
      // Off-road deep dish
      rimDesign = createDeepDishRim(radius * 0.55, width + 0.03);
      break;
    case 'motorcycle':
      // Motorcycle spoke
      rimDesign = createSpokeRim(radius * 0.7, width + 0.01, 6);
      break;
    default:
      rimDesign = createAlloyRim(radius * 0.7, width + 0.02, 5);
  }
  
  group.add(rimDesign);
  
  // Center cap
  const capGeo = new THREE.CylinderGeometry(radius * 0.15, radius * 0.15, width + 0.04, 16);
  const capMat = createPBRMaterial({ color: 0xcccccc, metalness: 1.0, roughness: 0.05 });
  const cap = new THREE.Mesh(capGeo, capMat);
  cap.rotation.x = Math.PI / 2;
  group.add(cap);
  
  group.name = 'Wheel';
  return group;
}

function createAlloyRim(radius, width, spokeCount) {
  const group = new THREE.Group();
  const mat = createPBRMaterial({ color: 0x888888, metalness: 0.95, roughness: 0.15 });
  
  // Outer rim ring
  const ringGeo = new THREE.TorusGeometry(radius, width / 3, 8, 32);
  const ring = new THREE.Mesh(ringGeo, mat);
  group.add(ring);
  
  // Spokes
  const spokeGeo = new THREE.BoxGeometry(radius * 0.9, width / 4, 0.02);
  for (let i = 0; i < spokeCount; i++) {
    const spoke = new THREE.Mesh(spokeGeo, mat);
    spoke.rotation.z = (i / spokeCount) * Math.PI * 2;
    spoke.position.z = 0.01;
    group.add(spoke);
  }
  
  return group;
}

function createClassicRim(radius, width) {
  const group = new THREE.Group();
  const mat = createPBRMaterial({ color: 0xdddddd, metalness: 1.0, roughness: 0.03 });
  
  // Chrome dish
  const dishGeo = new THREE.CylinderGeometry(radius * 0.9, radius, width / 2, 24);
  const dish = new THREE.Mesh(dishGeo, mat);
  dish.rotation.x = Math.PI / 2;
  group.add(dish);
  
  // Center holes pattern (simulated with circles)
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const holeGeo = new THREE.CylinderGeometry(radius * 0.2, radius * 0.2, 0.02, 12);
    const holeMat = createPBRMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.5 });
    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.position.set(Math.cos(angle) * radius * 0.5, Math.sin(angle) * radius * 0.5, 0);
    hole.rotation.x = Math.PI / 2;
    group.add(hole);
  }
  
  return group;
}

function createSolidRim(radius, width) {
  const mat = createPBRMaterial({ color: 0x666666, metalness: 0.8, roughness: 0.3 });
  const geo = new THREE.CylinderGeometry(radius, radius, width, 20);
  return new THREE.Mesh(geo, mat);
}

function createDeepDishRim(radius, width) {
  const group = new THREE.Group();
  const mat = createPBRMaterial({ color: 0x888888, metalness: 0.85, roughness: 0.2 });
  
  // Deep inner dish
  const dishGeo = new THREE.CylinderGeometry(radius * 0.7, radius, width * 0.8, 20);
  const dish = new THREE.Mesh(dishGeo, mat);
  dish.rotation.x = Math.PI / 2;
  group.add(dish);
  
  // Simple 4-hole pattern
  const holeGeo = new THREE.CylinderGeometry(radius * 0.15, radius * 0.15, 0.02, 10);
  const holeMat = createPBRMaterial({ color: 0x333333, metalness: 0.4, roughness: 0.6 });
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.position.set(Math.cos(angle) * radius * 0.4, Math.sin(angle) * radius * 0.4, 0);
    hole.rotation.x = Math.PI / 2;
    group.add(hole);
  }
  
  return group;
}

function createSpokeRim(radius, width, spokeCount) {
  const group = new THREE.Group();
  const mat = createPBRMaterial({ color: 0xbbbbbb, metalness: 0.95, roughness: 0.1 });
  
  // Thin spokes
  const spokeGeo = new THREE.CylinderGeometry(0.008, 0.008, radius * 0.9, 6);
  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2;
    const spoke = new THREE.Mesh(spokeGeo, mat);
    spoke.rotation.z = angle - Math.PI / 2;
    spoke.position.set(
      Math.cos(angle) * radius * 0.45,
      Math.sin(angle) * radius * 0.45,
      0
    );
    group.add(spoke);
  }
  
  // Outer rim
  const rimGeo = new THREE.TorusGeometry(radius, 0.015, 6, 24);
  const rim = new THREE.Mesh(rimGeo, mat);
  group.add(rim);
  
  return group;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function getVehicleDefinition(vehicleId) {
  return VEHICLE_DEFINITIONS[vehicleId] || null;
}

export function getAllVehicleDefinitions() {
  return Object.values(VEHICLE_DEFINITIONS);
}

export function getVehicleIds() {
  return Object.keys(VEHICLE_DEFINITIONS);
}

export function createVehicleMesh(vehicleId) {
  const def = VEHICLE_DEFINITIONS[vehicleId];
  if (!def) {
    console.warn(`Unknown vehicle ID: ${vehicleId}`);
    return null;
  }
  return def.generateBodyMesh();
}

export function createVehicleWithWheels(vehicleId) {
  const def = VEHICLE_DEFINITIONS[vehicleId];
  if (!def) return null;
  
  const bodyGroup = def.generateBodyMesh();
  const wheelPositions = def.getWheelPositions();
  const wheelRadius = vehicleId === 'mammoth' ? 0.7 : 
                      vehicleId === 'raptor' || vehicleId === 'buggy' ? 0.4 :
                      vehicleId === 'phantom' ? 0.3 : 0.35;
  
  wheelPositions.forEach((pos, i) => {
    if (pos.x !== 0 || pos.z !== 0) { // Skip dummy positions
      const wheel = generateWheelMesh(wheelRadius, 0.2, def.type);
      wheel.position.copy(pos);
      wheel.name = `wheel_${i}`;
      bodyGroup.add(wheel);
    }
  });
  
  return bodyGroup;
}

// Export for cleanup
export { clearGeometryCache };
