// core/SplitscreenSystem.js
// 2-player vertical split or 4-player quad split.
// Single renderer, multiple viewports via scissor test.
// Each viewport: independent camera + HUD.

import * as THREE from 'three';

class SplitscreenSystem {
  constructor() {
    this._players = [];
    this._active = false;
    this._mode = 'single'; // 'single', '2p-vertical', '4p-quad'
  }

  setPlayerCount(count) {
    if (count === 1) this._mode = 'single';
    else if (count === 2) this._mode = '2p-vertical';
    else if (count === 4) this._mode = '4p-quad';
    else this._mode = 'single';
    this._players = Array.from({ length: count }, (_, i) => ({
      id: i,
      viewport: this._getViewport(i, count),
      camera: null,
      vehicle: null,
      hud: null
    }));
    this._active = count > 1;
  }

  _getViewport(index, total) {
    if (total === 1) return { x: 0, y: 0, w: 1, h: 1 };
    if (total === 2) {
      // Vertical split
      return index === 0
        ? { x: 0, y: 0, w: 0.5, h: 1 }
        : { x: 0.5, y: 0, w: 0.5, h: 1 };
    }
    if (total === 4) {
      // Quad split
      const positions = [
        { x: 0, y: 0.5, w: 0.5, h: 0.5 },
        { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
        { x: 0, y: 0, w: 0.5, h: 0.5 },
        { x: 0.5, y: 0, w: 0.5, h: 0.5 }
      ];
      return positions[index];
    }
    return { x: 0, y: 0, w: 1, h: 1 };
  }

  setupCameras(renderer, baseCamera) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const player of this._players) {
      if (!player.camera) {
        player.camera = baseCamera.clone();
        player.camera.aspect = (w * player.viewport.w) / (h * player.viewport.h);
        player.camera.updateProjectionMatrix();
      }
    }
  }

  render(renderer, scene) {
    if (!this._active || this._players.length <= 1) {
      // Single player — normal render
      renderer.render(scene, this._players[0]?.camera || renderer.getCamera());
      return;
    }
    const gl = renderer.getContext();
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    const origScissor = gl.isEnabled(gl.SCISSOR_TEST);
    gl.enable(gl.SCISSOR_TEST);
    for (const player of this._players) {
      const vp = player.viewport;
      const vx = Math.floor(vp.x * w);
      const vy = Math.floor(vp.y * h);
      const vw = Math.floor(vp.w * w);
      const vh = Math.floor(vp.h * h);
      gl.viewport(vx, vy, vw, vh);
      gl.scissor(vx, vy, vw, vh);
      renderer.clearDepth();
      if (player.camera) {
        renderer.render(scene, player.camera);
      }
    }
    if (!origScissor) gl.disable(gl.SCISSOR_TEST);
  }

  isActive() { return this._active; }
  getMode() { return this._mode; }
  getPlayers() { return this._players; }
}

export const splitscreen = new SplitscreenSystem();
export default splitscreen;
