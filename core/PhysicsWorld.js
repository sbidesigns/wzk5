// core/PhysicsWorld.js
// IMMUTABLE CORE — wraps cannon-es. Fixed-step simulation, gravity from config.
// Vehicles are NOT defined here; they're barrel-loaded. This file is just the world.

import { EventBus } from './EventBus.js';
// cannon-es is ESM-only at 0.20.0 — import it directly. The importmap in index.html
// maps the bare specifier 'cannon-es' to the pinned CDN URL.
import * as CANNON from 'cannon-es';

export class PhysicsWorld {
  constructor() {
    this._world = null;
    this._CANNON = CANNON;
    this._stepRate = 60;
    this._accumulator = 0;
    this._fixedDt = 1 / 60;
    this._maxSubSteps = 4;
    this._bodies = new Set();
  }

  async init(config) {
    this._stepRate = config.stepRate || 60;
    this._fixedDt = 1 / this._stepRate;
    this._maxSubSteps = config.maxSubSteps || 4;

    const C = this._CANNON;
    this._world = new C.World();
    this._world.gravity.set(...(config.gravity || [0, -9.82, 0]));
    this._world.broadphase = new C.SAPBroadphase(this._world);
    this._world.defaultMaterial = new C.Material('default');
    const friction = config.defaultMaterial?.friction ?? 0.4;
    const restitution = config.defaultMaterial?.restitution ?? 0.1;
    const contactMaterial = new C.ContactMaterial(this._world.defaultMaterial, this._world.defaultMaterial, {
      friction, restitution
    });
    this._world.addContactMaterial(contactMaterial);
    this._world.defaultContactMaterial = contactMaterial;
    return this;
  }

  step(dt) {
    this._accumulator += dt;
    let steps = 0;
    while (this._accumulator >= this._fixedDt && steps < this._maxSubSteps) {
      this._world.step(this._fixedDt);
      this._accumulator -= this._fixedDt;
      steps++;
    }
    if (steps === this._maxSubSteps) this._accumulator = 0; // give up catching up
    EventBus.emit('physics:stepped', { steps, dt });
  }

  addBody(body) {
    this._world.addBody(body);
    this._bodies.add(body);
    return body;
  }

  removeBody(body) {
    this._world.removeBody(body);
    this._bodies.delete(body);
  }

  createGround(size = 1000) {
    const C = this._CANNON;
    const ground = new C.Body({
      mass: 0,
      shape: new C.Plane(),
      material: this._world.defaultMaterial
    });
    ground.quaternion.setFromAxisAngle(new C.Vec3(1, 0, 0), -Math.PI / 2);
    this.addBody(ground);
    return ground;
  }

  createBox(size = [1, 1, 1], position = [0, 0, 0], mass = 0) {
    const C = this._CANNON;
    const halfExtents = new C.Vec3(size[0] / 2, size[1] / 2, size[2] / 2);
    const body = new C.Body({
      mass,
      shape: new C.Box(halfExtents),
      position: new C.Vec3(...position),
      material: this._world.defaultMaterial
    });
    this.addBody(body);
    return body;
  }

  getCANNON() { return this._CANNON; }
  getWorld() { return this._world; }
}

export const physicsWorld = new PhysicsWorld();
