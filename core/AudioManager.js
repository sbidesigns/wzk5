// core/AudioManager.js
// IMMUTABLE CORE — wraps howler.js. Bus layout from config. Music + SFX + UI + engine.

import { EventBus } from './EventBus.js';

export class AudioManager {
  constructor() {
    this._Howler = null;
    this._buses = new Map();        // busName -> Howl group / master gain
    this._sounds = new Map();       // id -> { howl, bus, positional? }
    this._config = null;
    this._currentMusic = null;
    this._currentMusicId = null;
  }

  async init(config) {
    if (!window.Howler) throw new Error('AudioManager.init: window.Howler not loaded');
    this._Howler = window.Howler;
    this._config = config;
    // Set up buses via Howler volume; Howler doesn't have native buses, so we simulate with grouped volume tracking
    for (const [name, settings] of Object.entries(config.buses || {})) {
      this._buses.set(name, { volume: settings.volume, muted: settings.muted, sounds: new Set() });
    }
    return this;
  }

  setBusVolume(bus, volume) {
    const b = this._buses.get(bus);
    if (!b) return;
    b.volume = volume;
    for (const soundId of b.sounds) {
      const sound = this._sounds.get(soundId);
      if (sound && !sound.positional) sound.howl.volume(volume * (sound.baseVolume || 1));
    }
    EventBus.emit('audio:busVolume', { bus, volume });
  }

  setBusMuted(bus, muted) {
    const b = this._buses.get(bus);
    if (!b) return;
    b.muted = muted;
    for (const soundId of b.sounds) {
      const sound = this._sounds.get(soundId);
      if (sound) sound.howl.mute(muted);
    }
    EventBus.emit('audio:busMuted', { bus, muted });
  }

  registerSound(id, { src, bus = 'sfx', loop = false, volume = 1, positional = false, sprite }) {
    const Howl = window.Howl;
    const howl = new Howl({
      src: Array.isArray(src) ? src : [src],
      loop, volume, sprite,
      format: ['mp3', 'ogg', 'wav']
    });
    this._sounds.set(id, { howl, bus, baseVolume: volume, positional });
    const b = this._buses.get(bus);
    if (b) {
      b.sounds.add(id);
      howl.volume(b.volume * volume);
      howl.mute(b.muted);
    }
    return id;
  }

  play(id, opts = {}) {
    const sound = this._sounds.get(id);
    if (!sound) {
      console.warn(`AudioManager.play: unknown sound id "${id}"`);
      return null;
    }
    const soundId = sound.howl.play();
    if (opts.volume != null) sound.howl.volume(opts.volume * (this._buses.get(sound.bus)?.volume || 1), soundId);
    return soundId;
  }

  stop(id, soundId = null) {
    const sound = this._sounds.get(id);
    if (!sound) return;
    if (soundId) sound.howl.stop(soundId);
    else sound.howl.stop();
  }

  playMusic(id, fadeMs = 600) {
    if (this._currentMusic === id) return;
    const Howl = window.Howler;
    // Fade out current
    if (this._currentMusic && this._currentMusicId != null) {
      const prev = this._sounds.get(this._currentMusic);
      if (prev) {
        prev.howl.fade(prev.howl.volume(this._currentMusicId), 0, fadeMs, this._currentMusicId);
        prev.howl.once('fade', () => prev.howl.stop(this._currentMusicId), this._currentMusicId);
      }
    }
    this._currentMusic = id;
    const sound = this._sounds.get(id);
    if (!sound) return;
    sound.howl.volume(0);
    this._currentMusicId = sound.howl.play();
    sound.howl.fade(0, this._buses.get('music')?.volume || 0.7, fadeMs, this._currentMusicId);
  }

  stopMusic(fadeMs = 600) {
    if (!this._currentMusic) return;
    const sound = this._sounds.get(this._currentMusic);
    if (sound && this._currentMusicId != null) {
      sound.howl.fade(sound.howl.volume(this._currentMusicId), 0, fadeMs, this._currentMusicId);
      sound.howl.once('fade', () => sound.howl.stop(this._currentMusicId), this._currentMusicId);
    }
    this._currentMusic = null;
    this._currentMusicId = null;
  }

  // SFX shortcut for UI clicks etc.
  ui(soundName) {
    return this.play(`ui.${soundName}`);
  }

  getBuses() {
    const out = {};
    for (const [name, b] of this._buses) out[name] = { volume: b.volume, muted: b.muted };
    return out;
  }
}

export const audioManager = new AudioManager();
