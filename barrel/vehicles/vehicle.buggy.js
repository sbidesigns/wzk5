// barrel/vehicles/vehicle.buggy.js - Open-wheel Buggy
// Low grip surfaces, off-road suspension travel 2x standard, exposed frame

import { BaseVehicle } from './vehicle.base.js';

class BuggyVehicle extends BaseVehicle {
  update(dt) {
    super.update(dt);
    
    // Buggy-specific: Dust particles when off-road or at speed
    if (this.speedKmh > 25 && Math.random() > 0.7) {
      this.ctx.engine.bus.emit('vehicle:dustCloud', {
        id: this.entry.id,
        position: this.physicsBody ? this.physicsBody.position : null
      });
    }
    
    // Buggy frame flex visual (subtle body twist on hard turns)
    if (Math.abs(this.bodyRoll) > 0.1 && this.sceneObject) {
      // Add slight chassis twist
      const twistAmount = this.bodyRoll * 0.2;
      // This would animate frame parts if we had a detailed model
    }
  }
}

export function spawn(entry, ctx, position) {
  const v = new BuggyVehicle(entry, ctx);
  v.spawn(position);
  return v;
}
export function update(vehicle, dt) { vehicle.update(dt); }
export function getSpeedKmh(vehicle) { return vehicle.getSpeedKmh(); }
export function applyBoost(vehicle, strength, duration) { vehicle.applyBoost(strength, duration); }
export function despawn(vehicle) { vehicle.despawn(); }
export default { spawn, update, getSpeedKmh, applyBoost, despawn };
