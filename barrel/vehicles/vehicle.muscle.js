// barrel/vehicles/vehicle.muscle.js - Muscle Car (Titan)
// High torque, heavy, can push other vehicles, poor fuel economy

import { BaseVehicle } from './vehicle.base.js';

class TitanVehicle extends BaseVehicle {
  update(dt) {
    super.update(dt);
    
    // Titan-specific: Engine rumble effect (emit audio event more frequently)
    if (this.speedKmh > 30 && Math.random() > 0.95) {
      this.ctx.engine.bus.emit('vehicle:engineRumble', { 
        id: this.entry.id,
        intensity: this.engineLoad 
      });
    }
    
    // Heavy vehicle collision bonus - when hitting lighter vehicles, they get displaced more
    // This is handled in physics via mass, but we add visual feedback
  }
}

export function spawn(entry, ctx, position) {
  const v = new TitanVehicle(entry, ctx);
  v.spawn(position);
  return v;
}
export function update(vehicle, dt) { vehicle.update(dt); }
export function getSpeedKmh(vehicle) { return vehicle.getSpeedKmh(); }
export function applyBoost(vehicle, strength, duration) { vehicle.applyBoost(strength, duration); }
export function despawn(vehicle) { vehicle.despawn(); }
export default { spawn, update, getSpeedKmh, applyBoost, despawn };
