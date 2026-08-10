// barrel/scenes/scene.cutscene.js
// Season intro cutscene: camera moves on spline, text overlays fade in/out, audio sting.
// Triggered on first boot of a new season or via menu.

import * as THREE from 'three';

class CutsceneScene {
  constructor() {
    this.id = 'cutscene';
    this.type = 'cutscene';
    this._scene = null;
    this._camera = null;
    this._timeline = [];
    this._elapsed = 0;
    this._duration = 30;
    this._overlay = null;
    this._active = false;
  }

  async mount(payload = {}) {
    const engine = window.__engine;
    const { cutsceneId = 'season-intro' } = payload;

    engine.renderer.show();
    this._scene = engine.renderer.getScene();
    this._camera = engine.renderer.getCamera();

    // Set up overlay
    this._overlay = document.createElement('div');
    this._overlay.id = 'cutscene-overlay';
    this._overlay.style.cssText = `
      position:fixed; inset:0; z-index:100;
      display:flex; align-items:center; justify-content:center;
      flex-direction:column; gap:24px;
      background:linear-gradient(180deg, rgba(5,6,10,0.0) 0%, rgba(5,6,10,0.8) 60%, rgba(5,6,10,1.0) 100%);
      pointer-events:none;
      font-family:'Bebas Neue', Impact, sans-serif;
    `;
    document.body.appendChild(this._overlay);

    // Build timeline
    this._timeline = this._buildTimeline(cutsceneId);

    // Set up camera spline
    this._setupCamera(cutsceneId);

    // Hide UI shell
    const shell = document.getElementById('ui-shell');
    if (shell) shell.style.display = 'none';

    this._active = true;
    this._elapsed = 0;

    engine.bus.emit('cutscene:start', { id: cutsceneId });
  }

  _buildTimeline(id) {
    if (id === 'season-intro') {
      return [
        { time: 0,  duration: 4, text: 'WARZONE KART', sub: 'NEON UNDERGROUND', fontSize: '120px', subSize: '32px' },
        { time: 5,  duration: 4, text: 'SEASON 01', sub: 'A new era of underground racing', fontSize: '100px', subSize: '24px' },
        { time: 10, duration: 4, text: 'NEW VEHICLES', sub: 'Raptor ATV, Dune Buggy, Phantom Cycle', fontSize: '80px', subSize: '20px' },
        { time: 15, duration: 4, text: 'NEW CHARACTERS', sub: 'Vex, Jett, Rogue, Echo, Zero', fontSize: '80px', subSize: '20px' },
        { time: 20, duration: 4, text: 'NEW MODES', sub: 'Battle Royale, Derby, Elimination, Team Relay', fontSize: '80px', subSize: '20px' },
        { time: 25, duration: 4, text: 'RACE NOW', sub: 'Press any key to continue', fontSize: '100px', subSize: '24px' }
      ];
    }
    return [{ time: 0, duration: 3, text: id.toUpperCase(), sub: '', fontSize: '80px', subSize: '20px' }];
  }

  _setupCamera(id) {
    // Simple camera move: slow pan + zoom
    this._cameraStart = new THREE.Vector3(0, 30, 80);
    this._cameraEnd = new THREE.Vector3(0, 10, 20);
    this._camera.position.copy(this._cameraStart);
    this._camera.lookAt(0, 0, 0);
  }

  update(dt) {
    if (!this._active) return;
    this._elapsed += dt;

    // Camera interpolation
    const t = Math.min(1, this._elapsed / this._duration);
    this._camera.position.lerpVectors(this._cameraStart, this._cameraEnd, t);
    this._camera.lookAt(0, 0, 0);

    // Update text overlay
    let activeBeat = null;
    for (const beat of this._timeline) {
      if (this._elapsed >= beat.time && this._elapsed < beat.time + beat.duration) {
        activeBeat = beat;
        break;
      }
    }
    if (activeBeat) {
      const beatT = (this._elapsed - activeBeat.time) / activeBeat.duration;
      const fadeIn = Math.min(1, beatT * 4);
      const fadeOut = Math.min(1, (1 - beatT) * 4);
      const opacity = Math.min(fadeIn, fadeOut);
      this._overlay.innerHTML = `
        <div style="font-size:${activeBeat.fontSize}; letter-spacing:0.1em; color:#fff; opacity:${opacity}; text-shadow:0 0 30px rgba(255,77,46,${opacity * 0.8});">
          ${activeBeat.text}
        </div>
        <div style="font-size:${activeBeat.subSize}; letter-spacing:0.3em; color:#ffd23f; opacity:${opacity * 0.9}; text-transform:uppercase;">
          ${activeBeat.sub}
        </div>
      `;
    } else {
      this._overlay.innerHTML = '';
    }

    // End condition
    if (this._elapsed >= this._duration) {
      this._finish();
    }
  }

  _finish() {
    this._active = false;
    const engine = window.__engine;
    engine.bus.emit('cutscene:end', {});

    // Show UI shell, return to main menu
    const shell = document.getElementById('ui-shell');
    if (shell) shell.style.display = 'block';
    if (this._overlay) { this._overlay.remove(); this._overlay = null; }
    engine.renderer.hide();

    // Navigate to main menu
    if (window.__uiRouter) window.__uiRouter.replace('main-menu');
  }

  async unmount() {
    this._active = false;
    if (this._overlay) { this._overlay.remove(); this._overlay = null; }
    const engine = window.__engine;
    if (engine) engine.renderer.hide();
  }
}

const instance = new CutsceneScene();
export function mount(payload) { return instance.mount(payload); }
export function unmount() { return instance.unmount(); }
export function update(dt) { instance.update(dt); }
export default { mount, unmount, update, id: 'cutscene', type: 'cutscene' };
