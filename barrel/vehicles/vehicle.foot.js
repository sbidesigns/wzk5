// barrel/vehicles/vehicle.foot.js - Foot-race Character
// On-foot racing with sprint, jump, slide mechanics
// Different hitbox and movement parameters than vehicles
// Items affect characters differently than vehicles

import { BaseVehicle } from './vehicle.base.js';

class FootCharacter extends BaseVehicle {
  constructor(entry, ctx) {
    super(entry, ctx);
    this.stamina = 100;       // 0-100 for sprinting
    this.slideActive = false;
    this.slideTimer = 0;
    this.slideDirection = null;
    this.isSprinting = false;
    this.jumpCooldown = 0;
    this.doubleJumpAvailable = false; // Power-up state
    this.grappleHookActive = false;   // Warzone-style grapple
    this.wallRunTimer = 0;           // Wall running
  }

  update(dt) {
    super.update(dt);
    
    const input = this.ctx.input;
    
    // Sprint mechanics (drains stamina)
    if (input.isPressed('sprint') && this.stamina > 0 && !this.slideActive) {
      this.isSprinting = true;
      this.stamina = Math.max(0, this.stamina - dt * 25); // Drain stamina
      
      // Sprint speed boost handled in _updateCharacter via sprintMultiplier
      this.vehicle.sprintMultiplier = 1.8;
      
      // Emit footstep sounds faster
      if (Math.random() > 0.7) {
        this.ctx.engine.bus.emit('character:footstep', {
          id: this.entry.id,
          sprint: true,
          surface: 'ground' // Would detect actual surface
        });
      }
    } else {
      this.isSprinting = false;
      this.vehicle.sprintMultiplier = 1.0;
      
      // Regenerate stamina when not sprinting
      this.stamina = Math.min(100, this.stamina + dt * 15);
    }
    
    // Slide mechanic (drift equivalent for characters)
    if (input.isPressed('drift') && this.vehicle.onGround && !this.slideActive) {
      this.slideActive = true;
      this.slideTimer = 0;
      
      // Get current movement direction for slide
      this.slideDirection = new THREE.Vector3();
      // ... would calculate from input
      
      this.ctx.engine.bus.emit('character:slideStart', { id: this.entry.id });
      
      // Reduce friction during slide
      if (this.physicsBody) {
        this.physicsBody.material.friction = 0.05;
      }
    }
    
    if (this.slideActive) {
      this.slideTimer += dt;
      
      // Slide has max duration based on skill
      if (this.slideTimer > 1.5 || !input.isPressed('drift')) {
        this.slideActive = false;
        this.slideTimer = 0;
        
        // Boost out of slide (like drift boost)
        if (this.slideTimer > 0.3) {
          this.applyBoost(0.8, 0.5);
          this.ctx.engine.bus.emit('character:slideBoost', { 
            id: this.entry.id, 
            duration: this.slideTimer 
          });
        }
        
        if (this.physicsBody) {
          this.physicsBody.material.friction = 0.6;
        }
        
        this.ctx.engine.bus.emit('character:slideEnd', { id: this.entry.id });
      }
    }
    
    // Jump cooldown
    if (this.jumpCooldown > 0) {
      this.jumpCooldown -= dt;
    }
    
    // Double jump check (power-up)
    if (this.doubleJumpAvailable && input.isPressed('jump') && !this.vehicle.onGround && this.jumpCooldown <= 0) {
      this.vehicle.velocity.y = this.vehicle.jumpForce * 0.8;
      this.doubleJumpAvailable = false;
      this.jumpCooldown = 0.3;
      this.ctx.engine.bus.emit('character:doubleJump', { id: this.entry.id });
      
      // Spawn effect
      this._spawnJumpEffect();
    }
    
    // Grapple hook (Warzone-style)
    if (input.isPressed('nitrous')) { // Reuse nitrous button for grapple
      if (!this.grappleHookActive) {
        this.grappleHookActive = true;
        this.ctx.engine.bus.emit('character:grappleStart', { id: this.entry.id });
      }
      // Grapple physics would go here - swing toward target point
    } else if (this.grappleHookActive) {
      this.grappleHookActive = false;
      this.ctx.engine.bus.emit('character:grappleEnd', { id: this.entry.id });
    }
    
    // Wall run detection
    if (!this.vehicle.onGround && this.wallRunTimer > 0) {
      this.wallRunTimer -= dt;
      if (this.wallRunTimer <= 0) {
        this.ctx.engine.bus.emit('character:wallRunEnd', { id: this.entry.id });
      }
    }
  }

  _spawnJumpEffect() {
    // Simple jump dust cloud
    const dustGeo = new THREE.SphereGeometry(0.2, 6, 6);
    const dustMat = new THREE.MeshBasicMaterial({
      color: '#c4a882',
      transparent: true,
      opacity: 0.5
    });
    const dust = new THREE.Mesh(dustGeo, dustMat);
    
    if (this.physicsBody) {
      dust.position.set(
        this.physicsBody.position.x,
        this.physicsBody.position.y,
        this.physicsBody.position.z
      );
    }
    
    dust.userData = { type: 'dust', life: 0.5 };
    this.ctx.renderer.addObject(dust);
    this.smokeParticles.push(dust); // Reuse particle system
  }

  // Character-specific item effects (different magnitudes than vehicles)
  applyBoost(strength = 1, durationSec = 0.8) {
    // Characters get shorter but more frequent boosts
    super.applyBoost(Math.min(1, strength), Math.min(0.5, durationSec));
    this.ctx.engine.bus.emit('character:speedBoost', { 
      id: this.entry.id, 
      strength: Math.min(1, strength) 
    });
  }

  // Collectible pickup (coins, power-ups)
  collectItem(itemType) {
    switch (itemType) {
      case 'stamina_refill':
        this.stamina = 100;
        break;
      case 'double_jump':
        this.doubleJumpAvailable = true;
        break;
      case 'shield':
        this.health = Math.min(100, this.health + 25);
        break;
      case 'magnet':
        // Attract nearby collectibles - emit event
        this.ctx.engine.bus.emit('character:magnetActivate', { id: this.entry.id });
        break;
      default:
        super.applyBoost(); // Generic speed boost
    }
    this.ctx.engine.bus.emit('character:itemCollected', { 
      id: this.entry.id, 
      itemType 
    });
  }

  // Override FPP position for character (eye height)
  getFPPPosition() {
    if (!this.physicsBody) return new THREE.Vector3();
    return new THREE.Vector3(
      this.physicsBody.position.x,
      this.physicsBody.position.y + 1.55, // Eye height
      this.physicsBody.position.z
    );
  }

  getStamina() { return this.stamina; }
  isSliding() { return this.slideActive; }
}

export function spawn(entry, ctx, position) {
  const v = new FootCharacter(entry, ctx);
  v.spawn(position);
  return v;
}
export function update(character, dt) { character.update(dt); }
export function getSpeedKmh(character) { return character.getSpeedKmh(); }
export function applyBoost(character, strength, duration) { character.applyBoost(strength, duration); }
export function despawn(character) { character.despawn(); }
export default { spawn, update, getSpeedKmh, applyBoost, despawn };
