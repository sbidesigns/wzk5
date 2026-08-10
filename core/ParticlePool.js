// core/ParticlePool.js
// Pre-allocated particle pool. No `new` in update loop.
// Sprites are recycled via active flag. Supports smoke, sparks, dust, boost trails.

import * as THREE from 'three';

const PARTICLE_TEXTURES = {
  smoke:  () => makeCircleTexture('#888888', 0.6),
  spark:  () => makeCircleTexture('#ffaa00', 1.0),
  dust:   () => makeCircleTexture('#c4a882', 0.5),
  boost:  () => makeCircleTexture('#00e5ff', 0.9),
  fire:   () => makeCircleTexture('#ff4400', 1.0),
  blood:  () => makeCircleTexture('#cc0000', 0.8)
};

function makeCircleTexture(color, opacity) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color);
  grad.addColorStop(0.5, color + '80');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

class ParticlePool {
  constructor(size = 200) {
    this.size = size;
    this.particles = [];
    this._textures = {};
    this._materials = {};
    this._scene = null;
    this._initialized = false;
  }

  init(scene) {
    if (this._initialized) return;
    this._scene = scene;
    // Pre-create textures and materials per type
    for (const type of Object.keys(PARTICLE_TEXTURES)) {
      this._textures[type] = PARTICLE_TEXTURES[type]();
      this._materials[type] = new THREE.SpriteMaterial({
        map: this._textures[type],
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: type === 'spark' || type === 'boost' || type === 'fire'
          ? THREE.AdditiveBlending
          : THREE.NormalBlending
      });
    }
    // Pre-allocate particles
    for (let i = 0; i < this.size; i++) {
      const sprite = new THREE.Sprite(this._materials.smoke.clone());
      sprite.visible = false;
      sprite.userData = { active: false, type: null, life: 0, maxLife: 0, velocity: new THREE.Vector3(), startScale: 1, endScale: 1, startOpacity: 0.8, endOpacity: 0 };
      scene.add(sprite);
      this.particles.push(sprite);
    }
    this._initialized = true;
  }

  spawn(type, position, options = {}) {
    if (!this._initialized) return null;
    const p = this.particles.find(p => !p.userData.active);
    if (!p) return null; // pool exhausted
    const mat = this._materials[type] || this._materials.smoke;
    p.material.map = mat.map;
    p.material.blending = mat.blending;
    p.material.opacity = options.startOpacity ?? 0.8;
    p.userData.active = true;
    p.userData.type = type;
    p.userData.life = 0;
    p.userData.maxLife = options.life ?? 1.0;
    p.userData.velocity.copy(options.velocity || new THREE.Vector3(0, 0.5, 0));
    p.userData.startScale = options.startScale ?? 0.5;
    p.userData.endScale = options.endScale ?? 2.0;
    p.userData.startOpacity = options.startOpacity ?? 0.8;
    p.userData.endOpacity = options.endOpacity ?? 0;
    p.position.copy(position);
    p.scale.setScalar(p.userData.startScale);
    p.visible = true;
    return p;
  }

  spawnBurst(type, position, count, options = {}) {
    for (let i = 0; i < count; i++) {
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * (options.spread || 4),
        Math.random() * (options.upward || 2),
        (Math.random() - 0.5) * (options.spread || 4)
      );
      this.spawn(type, position, { ...options, velocity: vel });
    }
  }

  update(dt) {
    if (!this._initialized) return;
    for (const p of this.particles) {
      if (!p.userData.active) continue;
      p.userData.life += dt;
      const t = p.userData.life / p.userData.maxLife;
      if (t >= 1) {
        p.userData.active = false;
        p.visible = false;
        continue;
      }
      // Position update
      p.position.addScaledVector(p.userData.velocity, dt);
      // Gravity for non-boost types
      if (p.userData.type !== 'boost' && p.userData.type !== 'fire') {
        p.userData.velocity.y -= 2.0 * dt;
      }
      // Scale lerp
      const scale = p.userData.startScale + (p.userData.endScale - p.userData.startScale) * t;
      p.scale.setScalar(scale);
      // Opacity lerp
      p.material.opacity = p.userData.startOpacity + (p.userData.endOpacity - p.userData.startOpacity) * t;
    }
  }

  clear() {
    for (const p of this.particles) {
      p.userData.active = false;
      p.visible = false;
    }
  }
}

export const particlePool = new ParticlePool(300);
export default particlePool;
