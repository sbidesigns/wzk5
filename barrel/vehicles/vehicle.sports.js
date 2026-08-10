// barrel/vehicles/vehicle.sports.js - Sports Car (Spectre GT)
// High speed, low mass, drift-specialized, good handling

import { BaseVehicle } from './vehicle.base.js';

class SpectreVehicle extends BaseVehicle {
  buildMesh() {
    const group = super.buildMesh(); // This now calls our enhanced procedural builder
    return group;
  }

  update(dt) {
    super.update(dt);
    
    // Spectre-specific: Enhanced underglow pulse with boost
    if (this.underglow) {
      const intensity = 0.3 + 
        (this.boostTimer > 0 ? 0.5 : 0) + 
        (this.driftActive ? 0.25 : 0);
      this.underglow.material.opacity = intensity + Math.sin(performance.now() * 0.008) * 0.08;
      
      // Color shift when boosting
      if (this.boostTimer > 0) {
        this.underglow.material.color.setHex(0x00e5ff); // Cyan boost
      } else {
        this.underglow.material.color.setHex(0xffd23f); // Gold normal
      }
    }
  }
}

// Module exports matching vehicle.schema.json requiredInterface
export function spawn(entry, ctx, position) {
  const v = new SpectreVehicle(entry, ctx);
  v.spawn(position);
  return v;
}
export function update(vehicle, dt) { vehicle.update(dt); }
export function getSpeedKmh(vehicle) { return vehicle.getSpeedKmh(); }
export function applyBoost(vehicle, strength, duration) { vehicle.applyBoost(strength, duration); }
export function despawn(vehicle) { vehicle.despawn(); }
export default { spawn, update, getSpeedKmh, applyBoost, despawn };
