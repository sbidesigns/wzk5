// barrel/vehicles/vehicle.mammoth.js — Monster Truck
// Huge wheels, crushes opponents, high center of gravity
import { BaseVehicle } from './vehicle.base.js';

class MammothVehicle extends BaseVehicle {
  constructor(entry, ctx) {
    super(entry, ctx);
    this.canCrush = true;
    this.crushBonus = 2.0;
  }

  _handleCollision(e) {
    super._handleCollision(e);
    // Monster truck: deals extra collision damage
    if (e.body && this.canCrush) {
      const impactStrength = Math.abs(this.prevVelocityY);
      if (impactStrength > 5) {
        this.ctx.engine.bus.emit('vehicle:crush', {
          id: this.entry.id,
          target: e.body,
          damage: impactStrength * this.crushBonus
        });
      }
    }
  }
}

export function spawn(entry, ctx, position) {
  const v = new MammothVehicle(entry, ctx);
  v.spawn(position);
  return v;
}
export function update(vehicle, dt) { vehicle.update(dt); }
export function getSpeedKmh(vehicle) { return vehicle.getSpeedKmh(); }
export function applyBoost(vehicle, strength, duration) { vehicle.applyBoost(strength, duration); }
export function despawn(vehicle) { vehicle.despawn(); }
export default { spawn, update, getSpeedKmh, applyBoost, despawn };
