// core/ReplaySystem.js
// Records player inputs at 60Hz during race. Plays back as ghost vehicle.
// Replays are compact: array of input frames (throttle/brake/steer/drift/item + timestamp).

import { EventBus } from './EventBus.js';

const FRAME_SIZE = 6; // 6 floats per frame: time, throttle, brake, steer, drift, item
const MAX_FRAMES = 60 * 60 * 5; // 5 minutes max at 60fps

class ReplaySystem {
  constructor() {
    this._recording = false;
    this._frames = new Float32Array(MAX_FRAMES * FRAME_SIZE);
    this._frameCount = 0;
    this._startTime = 0;
    this._playback = null;
    this._ghostVehicle = null;
  }

  startRecording() {
    this._recording = true;
    this._frameCount = 0;
    this._startTime = performance.now();
  }

  recordFrame(input) {
    if (!this._recording || this._frameCount >= MAX_FRAMES) return;
    const t = (performance.now() - this._startTime) / 1000;
    const offset = this._frameCount * FRAME_SIZE;
    this._frames[offset] = t;
    this._frames[offset + 1] = input.throttle || 0;
    this._frames[offset + 2] = input.brake || 0;
    this._frames[offset + 3] = input.steer || 0;
    this._frames[offset + 4] = input.drift ? 1 : 0;
    this._frames[offset + 5] = input.item ? 1 : 0;
    this._frameCount++;
  }

  stopRecording() {
    this._recording = false;
    return this.getReplayData();
  }

  getReplayData() {
    return {
      frames: this._frames.slice(0, this._frameCount * FRAME_SIZE),
      frameCount: this._frameCount,
      duration: this._frames[(this._frameCount - 1) * FRAME_SIZE] || 0,
      timestamp: Date.now()
    };
  }

  // Save as personal best ghost (per track)
  saveGhost(trackId, vehicleId, replayData) {
    const save = window.__engine?.save;
    if (!save) return;
    const ghostData = {
      trackId, vehicleId,
      replay: replayData,
      lapTime: replayData.duration
    };
    save.set(`stats.ghosts.${trackId}`, ghostData);
    EventBus.emit('replay:ghostSaved', { trackId, vehicleId, lapTime: replayData.duration });
  }

  loadGhost(trackId) {
    return window.__engine?.save?.get(`stats.ghosts.${trackId}`);
  }

  // Generate share code (base64 of compact replay)
  generateShareCode(replayData) {
    const compact = {
      v: 1,
      d: Math.round(replayData.duration * 1000),
      f: Array.from(replayData.frames).map(v => Math.round(v * 1000) / 1000)
    };
    return btoa(JSON.stringify(compact)).replace(/=/g, '');
  }

  parseShareCode(code) {
    try {
      const data = JSON.parse(atob(code));
      if (data.v !== 1) return null;
      return {
        frames: new Float32Array(data.f),
        frameCount: data.f.length / FRAME_SIZE,
        duration: data.d / 1000,
        timestamp: Date.now()
      };
    } catch (e) {
      console.error('[ReplaySystem] invalid share code:', e);
      return null;
    }
  }

  // Playback: returns the input state at time t
  getFrameAtTime(t) {
    if (this._frameCount === 0) return null;
    // Binary search for frame at time t
    let lo = 0, hi = this._frameCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this._frames[mid * FRAME_SIZE] < t) lo = mid + 1;
      else hi = mid;
    }
    const offset = lo * FRAME_SIZE;
    return {
      time: this._frames[offset],
      throttle: this._frames[offset + 1],
      brake: this._frames[offset + 2],
      steer: this._frames[offset + 3],
      drift: this._frames[offset + 4] > 0.5,
      item: this._frames[offset + 5] > 0.5
    };
  }

  isRecording() { return this._recording; }
  getFrameCount() { return this._frameCount; }
}

export const replay = new ReplaySystem();
export default replay;
