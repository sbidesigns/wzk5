// core/SaveSystem.js
// IMMUTABLE CORE — wraps localforage for persistent save/load.
// Versioned schema with migration + corruption recovery.
// All gameplay systems read/write through this single API.

const SAVE_VERSION = 1;
const SAVE_KEY = 'wzk5_save_v1';

const DEFAULT_SAVE = {
  version: SAVE_VERSION,
  settings: {
    audio: { master: 1.0, music: 0.7, sfx: 0.9, voice: 0.8, ui: 0.8, engine: 0.85, positional: true, voiceChat: false, subtitles: true },
    video: { quality: 'high', resolutionScale: 1.0, shadows: true, bloom: true, fov: 75, motionBlur: false, vsync: true },
    controls: { scheme: 'wasd', deadzone: 0.18, sensitivity: 1.0, lookSensitivity: 1.0, bindings: {} },
    gameplay: { autoAccelerate: false, driftAssist: false, cameraShake: 1.0, minimapRotate: true, lapCounterPosition: 'tl' },
    accessibility: { colorblind: 'none', subtitles: true, subtitleSize: 'medium', buttonHold: false, screenShakeReduction: 0.0, highContrast: false, hudScale: 1.0 }
  },
  progression: {
    xp: 0, level: 1, credits: 25000, gold: 500,
    racesWon: 0, racesCompleted: 0, totalTimePlayed: 0,
    lastRaceResults: null
  },
  unlocks: {
    vehicles: ['spectre', 'titan', 'vixen', 'runner-01'],
    characters: ['ace', 'brick', 'nova'],
    parts: [],
    tracks: ['downtown']
  },
  garage: {
    equippedParts: {},
    paint: {},
    tuning: {}
  },
  battlePass: {
    seasonId: null, tier: 0, xpInTier: 0, paid: false,
    claimedTiers: []
  },
  stats: {
    topSpeed: 0, totalDrift: 0, totalBurnout: 0, itemsUsed: 0,
    lapsCompleted: 0, bestLaps: {}
  },
  preferences: {
    lastVehicle: 'spectre', lastCharacter: 'ace', lastTrack: 'downtown', lastMode: 'circuit'
  }
};

class SaveSystem {
  constructor() {
    this._storage = null;
    this._cache = null;
    this._dirty = false;
    this._saveTimeout = null;
    this._listeners = new Map();
  }

  async init() {
    if (!window.localforage) {
      console.warn('[SaveSystem] localforage not loaded — save disabled');
      return this;
    }
    this._storage = window.localforage.createInstance({
      name: 'wzk5',
      storeName: 'save',
      description: 'Warzone Kart save data'
    });
    // Load existing save
    const existing = await this._storage.getItem(SAVE_KEY);
    if (existing) {
      this._cache = this._migrate(existing);
      console.log('[SaveSystem] Loaded save v' + this._cache.version);
    } else {
      this._cache = JSON.parse(JSON.stringify(DEFAULT_SAVE));
      console.log('[SaveSystem] No save found — created default');
      await this._flush();
    }
    return this;
  }

  _migrate(data) {
    if (!data || typeof data !== 'object') return JSON.parse(JSON.stringify(DEFAULT_SAVE));
    if (data.version === SAVE_VERSION) return data;
    // Future: migration logic from older versions
    // For now, merge with defaults to fill missing keys
    const merged = JSON.parse(JSON.stringify(DEFAULT_SAVE));
    for (const cat of Object.keys(merged)) {
      if (data[cat]) {
        merged[cat] = { ...merged[cat], ...data[cat] };
      }
    }
    merged.version = SAVE_VERSION;
    return merged;
  }

  get(path) {
    if (!this._cache) return undefined;
    const parts = path.split('.');
    let cur = this._cache;
    for (const p of parts) {
      if (cur == null) return undefined;
      cur = cur[p];
    }
    return cur;
  }

  set(path, value) {
    if (!this._cache) return;
    const parts = path.split('.');
    let cur = this._cache;
    for (let i = 0; i < parts.length - 1; i++) {
      if (cur[parts[i]] == null) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
    this._dirty = true;
    this._scheduleFlush();
    this._notify(path, value);
  }

  update(path, updater) {
    const current = this.get(path);
    const next = updater(current);
    this.set(path, next);
    return next;
  }

  on(path, callback) {
    if (!this._listeners.has(path)) this._listeners.set(path, new Set());
    this._listeners.get(path).add(callback);
    return () => this._listeners.get(path)?.delete(callback);
  }

  _notify(path, value) {
    // Notify exact path listeners
    this._listeners.get(path)?.forEach(cb => { try { cb(value, path); } catch (e) { console.error('[SaveSystem] listener error:', e); } });
    // Notify parent path listeners (e.g., 'settings' listener fires when 'settings.audio.master' changes)
    const parts = path.split('.');
    for (let i = parts.length - 1; i > 0; i--) {
      const parent = parts.slice(0, i).join('.');
      this._listeners.get(parent)?.forEach(cb => { try { cb(value, path); } catch (e) {} });
    }
  }

  _scheduleFlush() {
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => this._flush(), 1000);
  }

  async _flush() {
    if (!this._storage || !this._cache) return;
    try {
      await this._storage.setItem(SAVE_KEY, this._cache);
      this._dirty = false;
    } catch (err) {
      console.error('[SaveSystem] save failed:', err);
    }
  }

  async forceSave() {
    await this._flush();
  }

  async reset() {
    this._cache = JSON.parse(JSON.stringify(DEFAULT_SAVE));
    await this._flush();
    console.log('[SaveSystem] Save reset to defaults');
  }

  exportSave() {
    return btoa(JSON.stringify(this._cache));
  }

  importSave(code) {
    try {
      const data = JSON.parse(atob(code));
      this._cache = this._migrate(data);
      this._flush();
      return true;
    } catch (e) {
      console.error('[SaveSystem] import failed:', e);
      return false;
    }
  }

  getSaveVersion() { return SAVE_VERSION; }
  getDefaultSave() { return JSON.parse(JSON.stringify(DEFAULT_SAVE)); }
}

export const saveSystem = new SaveSystem();
export default saveSystem;
