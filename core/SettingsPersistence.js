// core/SettingsPersistence.js - Settings Save/Load Manager
// Persists all settings categories to SaveSystem with migration support

import { EventBus } from './EventBus.js';

const DEFAULTS = {
  audio: {
    masterVolume: 80,
    musicVolume: 70,
    sfxVolume: 80,
    engineVolume: 60,
    uiSoundsVolume: 100,
    muted: false
  },
  video: {
    qualityPreset: 'high',
    resolution: 'auto',
    fpsCounter: false,
    vsync: true,
    motionBlur: true,
    shadowQuality: 'high'
  },
  controls: {
    steeringSensitivity: 0.7,
    throttleResponse: 0.8,
    invertYAxis: false,
    gamepadDeadzone: 0.12,
    autoBrakeAssist: false,
    autoSteeringAssist: false
  },
  gameplay: {
    difficulty: 'normal',
    hudSize: 'medium',
    minimapMode: 'rotate',
    racerCount: 8,
    itemsEnabled: true,
    friendlyFire: false,
    subtitles: true,
    cameraDistance: 10,
    screenShakeAmount: 0.5
  },
  accessibility: {
    colorblindMode: 'none',
    highContrastMode: false,
    hudScale: 1.0,
    screenShakeReduction: 0,
    motionBlurReduction: false,
    largeTextMode: false,
    oneButtonMode: false
  }
};

const SETTINGS_VERSION = 1;

class SettingsPersistence {
  constructor(saveSystem) {
    this._saveSystem = saveSystem;
    this._cache = null;
    this._listeners = new Map();
    this._dirty = new Set();
  }

  async loadAll() {
    try {
      const saved = await this._saveSystem.get('settings');
      if (!saved) {
        this._cache = JSON.parse(JSON.stringify(DEFAULTS));
        return this._cache;
      }

      // Version migration
      if ((saved.version || 0) < SETTINGS_VERSION) {
        this._migrate(saved);
      }

      this._cache = this._mergeWithDefaults(saved);
      return this._cache;
    } catch (e) {
      console.warn('[SettingsPersistence] Load failed, using defaults:', e);
      this._cache = JSON.parse(JSON.stringify(DEFAULTS));
      return this._cache;
    }
  }

  async saveCategory(category, values) {
    if (!this._cache) await this.loadAll();

    this._cache[category] = { ...this._cache[category], ...values };
    this._dirty.add(category);

    try {
      await this._save();
      this._notifyListeners(category, values);
      EventBus.emit('settings:changed', { category, values });
    } catch (e) {
      console.error('[SettingsPersistence] Save failed:', e);
    }
  }

  async resetToDefaults(category) {
    if (!this._cache) await this.loadAll();

    if (category) {
      this._cache[category] = JSON.parse(JSON.stringify(DEFAULTS[category]));
      await this.saveCategory(category, this._cache[category]);
    } else {
      this._cache = JSON.parse(JSON.stringify(DEFAULTS));
      Object.keys(this._cache).forEach(cat => this._dirty.add(cat));
      await this._save();
      EventBus.emit('settings:reset');
    }
  }

  getDefaults() {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  get(category, key) {
    if (!this._cache) return DEFAULTS[category]?.[key];
    return this._cache[category]?.[key] ?? DEFAULTS[category]?.[key];
  }

  onCategoryChange(category, callback) {
    if (!this._listeners.has(category)) {
      this._listeners.set(category, new Set());
    }
    this._listeners.get(category).add(callback);
    return () => this._listeners.get(category)?.delete(callback);
  }

  async applyGraphics(settings, renderer) {
    if (!renderer) return;

    const qualityMap = {
      low: { shadowMapSize: 512, pixelRatio: 1, antialias: false },
      medium: { shadowMapSize: 1024, pixelRatio: 1, antialias: true },
      high: { shadowMapSize: 2048, pixelRatio: window.devicePixelRatio || 1, antialias: true },
      ultra: { shadowMapSize: 4096, pixelRatio: Math.min(window.devicePixelRatio || 1, 2), antialias: true }
    };

    const preset = qualityMap[settings.qualityPreset] || qualityMap.high;
    Object.assign(renderer.qualityPreset, preset);
    renderer.applyQualityPreset(settings.qualityPreset);
  }

  async applyAudio(settings, audioManager) {
    if (!audioManager) return;

    audioManager.setMasterVolume(settings.masterVolume / 100);
    audioManager.setBusVolume('music', settings.musicVolume / 100);
    audioManager.setBusVolume('sfx', settings.sfxVolume / 100);
    audioManager.setBusVolume('engine', settings.engineVolume / 100);
    audioManager.setBusVolume('ui', settings.uiSoundsVolume / 100);
    audioManager.setMuted(settings.muted);
  }

  async applyInput(settings, inputManager) {
    if (!inputManager) return;

    inputManager.setSensitivity('steering', settings.steeringSensitivity);
    inputManager.setSensitivity('throttle', settings.throttleResponse);
    inputManager.setInvertYAxis(settings.invertYAxis);
    inputManager.setDeadzone(settings.gamepadDeadzone);
  }

  _mergeWithDefaults(saved) {
    const merged = {};
    for (const category of Object.keys(DEFAULTS)) {
      merged[category] = { ...DEFAULTS[category], ...(saved[category] || {}) };
    }
    merged.version = SETTINGS_VERSION;
    return merged;
  }

  async _save() {
    if (this._dirty.size === 0) return;
    await this._saveSystem.set('settings', this._cache);
    this._dirty.clear();
  }

  _migrate(oldData) {
    // Future migrations go here
    // Example: if (oldData.version < 2) { /* migrate to v2 */ }
  }

  _notifyListeners(category, values) {
    const listeners = this._listeners.get(category);
    if (listeners) {
      listeners.forEach(cb => {
        try { cb(values); } catch (e) { console.warn('[SettingsPersistence] Listener error:', e); }
      });
    }
  }
}

export default SettingsPersistence;
export { DEFAULTS };
