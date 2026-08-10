// barrel/vehicles/vehicle.motorcycle.js - Motorcycle
// Two-wheel (rendered as 4 for physics stability), leaning steer model,
// highest acceleration, lowest protection, wheelie capability

import { BaseVehicle } from './vehicle.base.js';

class MotorcycleVehicle extends BaseVehicle {
  constructor(entry, ctx) {
    super(entry, ctx);
    this.wheelieActive = false;
    this.wheelieTimer = 0;
    this.stoppieActive = false;
  }

  update(dt) {
    super.update(dt);
    
    // Motorcycle-specific: Wheelie mechanic
    const input = this.ctx.input;
    const brake = input.getAxis('brake') || (input.isPressed('brake') ? 1 : 0);
    const throttle = input.getAxis('throttle') || (input.isPressed('throttle') ? 1 : 0);
    
    // Wheelie: high throttle + low speed + pull back
    if (throttle > 0.8 && this.speedKmh < 40 && input.isPressed('drift')) {
      if (!this.wheelieActive) {
        this.wheelieActive = true;
        this.ctx.engine.bus.emit('motorcycle:wheelieStart', { id: this.entry.id });
      }
      this.wheelieTimer += dt;
      
      // Apply pitch-up torque
      if (this.physicsBody) {
        this.physicsBody.angularVelocity.x -= dt * 3; // Pitch up
      }
      
      // Limit wheelie duration based on skill
      if (this.wheelieTimer > 5) {
        // Uncontrolled wheelie - about to loop!
        this.ctx.engine.bus.emit('motorcycle:wheelieLoopWarning', { id: this.entry.id });
      }
    } else if (this.wheelieActive) {
      this.wheelieActive = false;
      this.wheelieTimer = 0;
      this.ctx.engine.bus.emit('motorcycle:wheelieEnd', { 
        id: this.entry.id, 
        duration: this.wheelieTimer 
      });
    }
    
    // Stoppie: front brake at speed causes rear to lift
    if (brake > 0.7 && this.speedKmh > 30 && !this.stoppieActive) {
      this.stoppieActive = true;
      this.ctx.engine.bus.emit('motorcycle:stoppieStart', { id: this.entry.id });
      
      // Apply pitch-down torque that lifts rear
      if (this.physicsBody) {
        this.physicsBody.angularVelocity.x += dt * 2;
      }
    } else if (brake < 0.3 && this.stoppieActive) {
      this.stoppieActive = false;
      this.ctx.engine.bus.emit('motorcycle:stoppieEnd', { id: this.entry.id });
    }
    
    // Lean angle affects turn radius dramatically
    if (Math.abs(this.leanAngle) > 0.1) {
      this.ctx.engine.bus.emit('motorcycle:leanUpdate', {
        id: this.entry.id,
        angle: this.leanAngle * (180 / Math.PI)
      });
    }
    
    // Motorcycle is more vulnerable to damage (no enclosure)
    // Amplify collision damage by 1.5x
  }

  // Override FPP position for motorcycle (higher, more exposed feel)
  getFPPPosition() {
    if (!this.physicsBody) return new THREE.Vector3();
    return new THREE.Vector3(
      this.physicsBody.position.x,
      this.physicsBody.position.y + 1.3, // Higher than car cockpit
      this.physicsBody.position.z + 0.2
    );
  }
}

export function spawn(entry, ctx, position) {
  const v = new MotorcycleVehicle(entry, ctx);
  v.spawn(position);
  return v;
}
export function update(vehicle, dt) { vehicle.update(dt); }
export function getSpeedKmh(vehicle) { return vehicle.getSpeedKmh(); }
export function applyBoost(vehicle, strength, duration) { vehicle.applyBoost(strength, duration); }
export function despawn(vehicle) { vehicle.despawn(); }
export default { spawn, update, getSpeedKmh, applyBoost, despawn };
