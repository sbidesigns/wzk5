// barrel/items/item.banana.js — Defensive trap item
// Dropped behind vehicle, causes spin-out on contact.
// Disappears after 20 seconds or when hit. Stackable (up to 3 on track).

import * as THREE from 'three';

/**
 * Activate banana peel item - drops a trap behind the vehicle
 * @param {object} ctx - Context object with engine, physics references
 * @param {object} params - Activation parameters
 * @param {object} params.vehicle - The vehicle dropping the banana
 * @param {object} params.raceScene - Reference to RaceScene for tracking active bananas
 * @param {Array} params.activeBananas - Array of active bananas on track
 */
export function activate(ctx, { vehicle, raceScene, activeBananas }) {
  const engine = ctx.engine;
  
  // Get vehicle position and orientation
  const vehiclePos = vehicle.sceneObject.position;
  const vehicleQuat = vehicle.physicsBody.quaternion;
  
  // Calculate position behind vehicle (drop point)
  // Get the backward direction from vehicle's quaternion
  const backward = new THREE.Vector3(0, 0, 3); // Behind vehicle
  backward.applyQuaternion(vehicleQuat);
  
  const dropPosition = {
    x: vehiclePos.x - backward.x,
    y: 0.3, // Slightly above ground
    z: vehiclePos.z - backward.z
  };
  
  // Check max bananas on track (stack limit: 3 per player)
  const maxBananas = 3;
  const playerBananas = (activeBananas || []).filter(b => b.ownerId === vehicle.entry?.id);
  
  if (playerBananas.length >= maxBananas) {
    // Remove oldest banana from this player
    const oldest = playerBananas[0];
    if (oldest && engine.renderer) {
      engine.renderer.removeObject(oldest.mesh);
      const idx = activeBananas.indexOf(oldest);
      if (idx > -1) activeBananas.splice(idx, 1);
    }
  }
  
  // Create banana mesh (peel shape approximation)
  const bananaGroup = new THREE.Group();
  
  // Main peel body (curved shape using multiple spheres merged visually)
  const peelGeometry = new THREE.SphereGeometry(0.35, 8, 8);
  peelGeometry.scale(1, 0.5, 1.5);
  
  const peelMaterial = new THREE.MeshStandardMaterial({
    color: '#ffe135', // Banana yellow
    roughness: 0.7,
    metalness: 0.1
  });
  
  const peel = new THREE.Mesh(peelGeometry, peelMaterial);
  peel.rotation.z = Math.PI / 6; // Tilt for realistic look
  bananaGroup.add(peel);
  
  // Darker tips for visual detail
  const tipGeometry = new THREE.SphereGeometry(0.15, 6, 6);
  const tipMaterial = new THREE.MeshStandardMaterial({
    color: '#8b7500', // Darker yellow/brown tips
    roughness: 0.8
  });
  
  const tip1 = new THREE.Mesh(tipGeometry, tipMaterial);
  tip1.position.set(-0.25, 0, 0.4);
  bananaGroup.add(tip1);
  
  const tip2 = new THREE.Mesh(tipGeometry, tipMaterial);
  tip2.position.set(0.25, 0, -0.4);
  bananaGroup.add(tip2);
  
  // Set position and random rotation for variety
  bananaGroup.position.set(dropPosition.x, dropPosition.y, dropPosition.z);
  bananaGroup.rotation.y = Math.random() * Math.PI * 2;
  
  // Add to scene
  if (engine.renderer) {
    engine.renderer.addObject(bananaGroup);
  }
  
  // Create banana data object for tracking
  const bananaData = {
    mesh: bananaGroup,
    position: dropPosition,
    baseY: dropPosition.y,
    ownerId: vehicle.entry?.id || 'unknown',
    expiresAt: performance.now() + 20000, // 20 second lifetime
    hit: false,
    createdAt: performance.now()
  };
  
  // Add to active bananas array (tracked by race scene)
  if (activeBananas && Array.isArray(activeBananas)) {
    activeBananas.push(bananaData);
  }
  
  // Also store reference on race scene if available
  if (raceScene && Array.isArray(raceScene._activeBananas)) {
    // Avoid duplicates if already added above
    if (!raceScene._activeBananas.includes(bananaData)) {
      raceScene._activeBananas.push(bananaData);
    }
  }
  
  // Emit event for audio/visual feedback
  ctx.engine.bus.emit('item:banana:dropped', { 
    ownerId: vehicle.entry?.id,
    position: dropPosition,
    activeCount: (activeBananas?.length || 0) + 1
  });
  
  console.log(`[Banana] Dropped by ${vehicle.entry?.id || 'player'} at (${dropPosition.x.toFixed(1)}, ${dropPosition.z.toFixed(1)})`);
}

export default { activate };
