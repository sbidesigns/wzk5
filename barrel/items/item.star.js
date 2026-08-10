// barrel/items/item.star.js — Power-up item
// 8 seconds of invincibility. Speed boost ×1.5.
// Knock aside any vehicle touched. Visual effect (glowing, particles).

import * as THREE from 'three';

// Duration of star power in milliseconds
const STAR_DURATION_MS = 8000;
const SPEED_MULTIPLIER = 1.5;

/**
 * Activate star power-up - grants temporary invincibility and speed boost
 * @param {object} ctx - Context object with engine, physics references
 * @param {object} params - Activation parameters
 * @param {object} params.vehicle - The vehicle getting star power
 * @param {object} [params.vehicleModule] - Vehicle module for boost application
 */
export function activate(ctx, { vehicle, vehicleModule }) {
  const engine = ctx.engine;
  const now = performance.now();
  
  // Set star power expiration time
  vehicle._starUntil = now + STAR_DURATION_MS;
  vehicle._hasStarPower = true;
  
  // Store original material colors for restoration later
  if (!vehicle._originalMaterials) {
    vehicle._originalMaterials = [];
    if (vehicle.sceneObject) {
      vehicle.sceneObject.traverse(child => {
        if (child.isMesh && child.material) {
          vehicle._originalMaterials.push({
            mesh: child,
            color: child.material.color?.getHex(),
            emissive: child.material.emissive?.getHex(),
            emissiveIntensity: child.material.emissiveIntensity
          });
        }
      });
    }
  }
  
  // Apply visual effects - glowing rainbow effect
  _applyStarVisuals(vehicle, engine);
  
  // Apply speed boost
  if (vehicleModule?.applyBoost) {
    vehicleModule.applyBoost(vehicle, SPEED_MULTIPLIER, STAR_DURATION_MS / 1000);
  } else if (vehicle.applyBoost) {
    vehicle.applyBoost(SPEED_MULTIPLIER, STAR_DURATION_MS / 1000);
  }
  
  // Start particle trail effect
  _startStarTrail(vehicle, engine);
  
  // Schedule end of star power
  if (vehicle._starTimeout) {
    clearTimeout(vehicle._starTimeout);
  }
  vehicle._starTimeout = setTimeout(() => {
    _removeStarPower(vehicle, engine);
  }, STAR_DURATION_MS);
  
  // Emit event
  ctx.engine.bus.emit('item:star:activated', { 
    vehicleId: vehicle.entry?.id,
    durationMs: STAR_DURATION_MS,
    speedMultiplier: SPEED_MULTIPLIER
  });
  
  console.log(`[Star] Power activated for ${vehicle.entry?.id || 'player'} (${STAR_DURATION_MS / 1000}s)`);
}

/**
 * Apply star power visual effects to vehicle
 * @private
 */
function _applyStarVisuals(vehicle, engine) {
  if (!vehicle.sceneObject) return;
  
  // Rainbow gradient colors for cycling effect
  const starColors = [0xff0000, 0xff8800, 0xffff00, 0x00ff00, 0x0088ff, 0x8800ff];
  
  vehicle.sceneObject.traverse(child => {
    if (child.isMesh && child.material) {
      // Make material emissive with bright glow
      if (child.material.emissive) {
        child.material.emissive.setHex(starColors[Math.floor(Math.random() * starColors.length)]);
        child.material.emissiveIntensity = 1.5;
      }
      if (child.material.color) {
        child.material.color.lerpColors(
          new THREE.Color('#ffffff'),
          new THREE.Color(starColors[Math.floor(Math.random() * starColors.length)]),
          0.3
        );
      }
    }
  });
  
  // Add point light around vehicle for glow effect
  if (!vehicle._starLight) {
    const starLight = new THREE.PointLight(0xffffaa, 2, 15);
    starLight.name = 'star-glow-light';
    if (vehicle.sceneObject) {
      vehicle.sceneObject.add(starLight);
    }
    vehicle._starLight = starLight;
  }
}

/**
 * Start star power particle trail
 * @private
 */
function _startStarTrail(vehicle, engine) {
  // Particle spawn interval for trail
  if (vehicle._starTrailInterval) {
    clearInterval(vehicle._starTrailInterval);
  }
  
  const colors = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#ff00ff'];
  let colorIndex = 0;
  
  vehicle._starTrailInterval = setInterval(() => {
    if (!vehicle._hasStarPower || !vehicle.sceneObject) {
      clearInterval(vehicle._starTrailInterval);
      return;
    }
    
    const pos = vehicle.sceneObject.position;
    const color = colors[colorIndex % colors.length];
    colorIndex++;
    
    // Spawn sparkle particles
    engine.particles.spawnBurst('spark', { 
      x: pos.x + (Math.random() - 0.5) * 2, 
      y: pos.y + 0.5, 
      z: pos.z + (Math.random() - 0.5) * 2 
    }, 3, {
      life: 0.5,
      spread: 0.5,
      startScale: 0.2,
      endScale: 0.6,
      startOpacity: 1.0,
      color: color
    });
  }, 100); // Every 100ms while active
}

/**
 * Remove star power effects and restore normal state
 * @private
 */
function _removeStarPower(vehicle, engine) {
  vehicle._hasStarPower = false;
  vehicle._starUntil = 0;
  
  // Clear particle interval
  if (vehicle._starTrailInterval) {
    clearInterval(vehicle._starTrailInterval);
    vehicle._starTrailInterval = null;
  }
  
  // Remove glow light
  if (vehicle._starLight) {
    if (vehicle.sceneObject) {
      vehicle.sceneObject.remove(vehicle._starLight);
    }
    if (vehicle._starLight.dispose) vehicle._starLight.dispose();
    vehicle._starLight = null;
  }
  
  // Restore original materials
  if (vehicle._originalMaterials && vehicle.sceneObject) {
    for (const orig of vehicle._originalMaterials) {
      if (orig.mesh && orig.mesh.material) {
        if (orig.mesh.material.color && orig.color !== undefined) {
          orig.mesh.material.color.setHex(orig.color);
        }
        if (orig.mesh.material.emissive && orig.emissive !== undefined) {
          orig.mesh.material.emissive.setHex(orig.emissive);
          orig.mesh.material.emissiveIntensity = orig.emissiveIntensity || 0;
        }
      }
    }
    vehicle._originalMaterials = [];
  }
  
  // Burst effect when ending
  if (engine && vehicle.sceneObject) {
    const pos = vehicle.sceneObject.position;
    engine.particles.spawnBurst('spark', { x: pos.x, y: pos.y + 1, z: pos.z }, 20, {
      life: 0.8,
      spread: 3,
      startScale: 0.3,
      endScale: 1.2,
      startOpacity: 1.0,
      color: '#ffff00'
    });
  }
  
  // Emit event
  if (engine) {
    engine.bus.emit('item:star:expired', { vehicleId: vehicle.entry?.id });
  }
  
  console.log(`[Star] Power expired for ${vehicle.entry?.id || 'player'}`);
}

/**
 * Check if vehicle has active star power (for collision handling)
 * @param {object} vehicle - Vehicle to check
 * @returns {boolean} True if star power is active
 */
export function hasStarPower(vehicle) {
  return vehicle._hasStarPower && performance.now() < (vehicle._starUntil || 0);
}

/**
 * Handle collision between star-powered vehicle and another vehicle
 * Knocks aside the other vehicle
 * @param {object} ctx - Context
 * @param {object} starVehicle - Vehicle with star power
 * @param {object} targetVehicle - Vehicle being hit
 */
export function handleStarCollision(ctx, starVehicle, targetVehicle) {
  if (!hasStarPower(starVehicle)) return false;
  
  // Calculate knockback direction (from star vehicle toward target)
  const starPos = starVehicle.sceneObject.position;
  const targetPos = targetVehicle.sceneObject.position;
  
  const dx = targetPos.x - starPos.x;
  const dz = targetPos.z - starPos.z;
  const dist = Math.sqrt(dx * dx + dz * dz) || 1;
  
  // Normalize and apply strong impulse
  const knockbackForce = 50;
  const CANNON = ctx.physics.getCANNON();
  const impulse = new CANNON.Vec3(
    (dx / dist) * knockbackForce,
    15, // Upward component
    (dz / dist) * knockbackForce
  );
  
  targetVehicle.physicsBody.applyImpulse(impulse, new CANNON.Vec3(0, 0.5, 0));
  
  // Visual feedback
  ctx.engine.particles.spawnBurst(targetPos, 12, {
    life: 0.6,
    spread: 2,
    upward: 1.5,
    startScale: 0.3,
    endScale: 1.5,
    startOpacity: 1.0,
    color: '#ffff00'
  });
  
  ctx.engine.bus.emit('item:star:knockback', {
    starVehicleId: starVehicle.entry?.id,
    targetVehicleId: targetVehicle.entry?.id
  });
  
  return true;
}

export default { activate, hasStarPower, handleStarCollision };
