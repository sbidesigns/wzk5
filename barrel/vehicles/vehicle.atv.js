// barrel/vehicles/vehicle.atv.js - All-Terrain Vehicle
// 3-4 wheel config, high center of gravity (rollover risk), off-road suspension

import { BaseVehicle } from './vehicle.base.js';

class ATVVehicle extends BaseVehicle {
  update(dt) {
    super.update(dt);
    
    // ATV-specific: Rollover warning
    if (this.physicsBody) {
      const up = new this.ctx.physics.getCANNON().Vec3(0, 1, 0);
      const bodyUp = new this.ctx.physics.getCANNON().Vec3();
      this.physicsBody.quaternion.vmult(up, bodyUp);
      const tiltAngle = Math.acos(bodyUp.y) * (180 / Math.PI);
      
      if (tiltAngle > 30) {
        this.ctx.engine.bus.emit('vehicle:rolloverWarning', {
          id: this.entry.id,
          angle: tiltAngle,
          critical: tiltAngle > 45
        });
      }
      
      // ATV suspension bounce visual
      if (this.speedKmh > 20 && Math.random() > 0.9) {
        this.ctx.engine.bus.emit('vehicle:suspensionBounce', { id: this.entry.id });
      }
    }
  }
}

export function spawn(entry, ctx, position) {
  const v = new ATVVehicle(entry, ctx);
  v.spawn(position);
  return v;
}
export function update(vehicle, dt) { vehicle.update(dt); }
export function getSpeedKmh(vehicle) { return vehicle.getSpeedKmh(); }
export function applyBoost(vehicle, strength, duration) { vehicle.applyBoost(strength, duration); }
export function despawn(vehicle) { vehicle.despawn(); }
export default { spawn, update, getSpeedKmh, applyBoost, despawn };
