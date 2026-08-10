// barrel/vehicles/vehicle.bolt.js — Electric Car
// Instant torque, no engine sound, regenerative braking
import { BaseVehicle } from './vehicle.base.js';

class BoltVehicle extends BaseVehicle {
  constructor(entry, ctx) {
    super(entry, ctx);
    this.regenBraking = true;
    this.batteryLevel = 100;
  }

  update(dt) {
    super.update(dt);
    // Electric: instant torque (no RPM ramp)
    // Battery drains with throttle, regens with brake
    const input = this.ctx.input;
    const throttle = input.isPressed('throttle') ? 1 : 0;
    const brake = input.isPressed('brake') ? 1 : 0;
    this.batteryLevel = Math.max(0, Math.min(100, this.batteryLevel - throttle * dt * 2 + brake * dt * 3));
    // Emit hum instead of engine sound
    if (this.speedKmh > 10 && Math.random() > 0.9) {
      this.ctx.engine.bus.emit('vehicle:electricHum', { id: this.entry.id, speed: this.speedKmh });
    }
  }
}

export function spawn(entry, ctx, position) {
  const v = new BoltVehicle(entry, ctx);
  v.spawn(position);
  return v;
}
export function update(vehicle, dt) { vehicle.update(dt); }
export function getSpeedKmh(vehicle) { return vehicle.getSpeedKmh(); }
export function applyBoost(vehicle, strength, duration) { vehicle.applyBoost(strength, duration); }
export function despawn(vehicle) { vehicle.despawn(); }
export default { spawn, update, getSpeedKmh, applyBoost, despawn };
