// barrel/items/item.coin.js — Speed/collectible item
// Collect coins scattered on track. 10 coins = temporary mini-boost.
// Slight score bonus. Respawn after 15 seconds.

import * as THREE from 'three';

/**
 * Activate coin item - grants instant coin(s) with potential bonus effect
 * This is used when a player gets "coin" from an item box (instant grant)
 * Track coins are handled by the race scene's _setupCoins/_updateCoins
 * 
 * @param {object} ctx - Context object with engine, physics references
 * @param {object} params - Activation parameters
 * @param {object} params.vehicle - The vehicle collecting the coin
 */
export function activate(ctx, { vehicle, vehicleModule }) {
  const engine = ctx.engine;
  
  // Grant multiple coins when collected from item box (bonus)
  const coinsGranted = 3 + Math.floor(Math.random() * 3); // 3-5 coins
  
  // Update player's coin count (stored on vehicle or in match state)
  if (typeof vehicle._coinCount === 'undefined') {
    vehicle._coinCount = 0;
  }
  vehicle._coinCount += coinsGranted;
  
  // Check for bonus threshold (every 10 coins gives mini-boost)
  const bonusThreshold = 10;
  const previousMilestone = Math.floor((vehicle._coinCount - coinsGranted) / bonusThreshold);
  const currentMilestone = Math.floor(vehicle._coinCount / bonusThreshold);
  
  let bonusGranted = false;
  if (currentMilestone > previousMilestone) {
    // Bonus! Apply mini speed boost
    bonusGranted = true;
    
    // Apply small boost through vehicle module if available
    if (vehicleModule?.applyBoost) {
      vehicleModule.applyBoost(vehicle, 1.12, 1.5);
    } else if (vehicle.applyBoost) {
      vehicle.applyBoost(1.12, 1.5);
    } else {
      // Direct physics manipulation as fallback
      const CANNON = ctx.physics.getCANNON();
      const forward = new CANNON.Vec3(0, 0, 1);
      vehicle.physicsBody.quaternion.vmult(forward, forward);
      forward.scale(15, forward);
      vehicle.physicsBody.applyImpulse(forward, new CANNON.Vec3(0, 0.5, 0));
    }
    
    ctx.engine.bus.emit('coin:bonus', { 
      totalCoins: vehicle._coinCount, 
      milestone: currentMilestone 
    });
  }
  
  // Spawn collection particle effect
  const pos = vehicle.sceneObject.position;
  engine.particles.spawnBurst('spark', { x: pos.x, y: pos.y + 1, z: pos.z }, 6, {
    life: 0.4, 
    spread: 1, 
    startScale: 0.15, 
    endScale: 0.5, 
    startOpacity: 1.0,
    color: '#ffd700'
  });
  
  // Emit event
  ctx.engine.bus.emit('item:coin:collected', { 
    vehicleId: vehicle.entry?.id,
    coinsGranted,
    totalCoins: vehicle._coinCount,
    bonusGranted
  });
  
  console.log(`[Coin] Granted ${coinsGranted} coins (total: ${vehicle._coinCount})${bonusGranted ? ' + BONUS BOOST!' : ''}`);
}

/**
 * Create a coin mesh for track placement
 * Called by race scene during setup
 * @param {object} position - {x, y, z} world position
 * @returns {THREE.Mesh} The coin mesh
 */
export function createCoinMesh(position) {
  const coinGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.08, 16);
  const coinMaterial = new THREE.MeshStandardMaterial({
    color: '#ffd700',
    emissive: '#ffd700',
    emissiveIntensity: 0.6,
    metalness: 0.9,
    roughness: 0.15
  });
  
  const coin = new THREE.Mesh(coinGeometry, coinMaterial);
  coin.position.set(position.x, position.y || 0.5, position.z || 0);
  coin.rotation.x = Math.PI / 2; // Lay flat
  coin.userData = { type: 'coin', collected: false };
  
  return coin;
}

export default { activate, createCoinMesh };
