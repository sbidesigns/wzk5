// core/AudioEngine.js
// PROCEDURAL AUDIO ENGINE — Complete audio synthesis system for wzk5 racing game
// Uses Web Audio API for real-time sound generation (no external files required)
// Features: Engine sounds, environmental audio, music, UI sounds, 3D spatial audio

import { EventBus } from './EventBus.js';

// ============================================================================
// AUDIO CONTEXT MANAGEMENT
// ============================================================================

class AudioContextManager {
  constructor() {
    this._ctx = null;
    this._masterGain = null;
    this._initialized = false;
  }

  async init() {
    if (this._initialized) return this._ctx;
    
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._masterGain = this._ctx.createGain();
      this._masterGain.gain.value = 1.0;
      this._masterGain.connect(this._ctx.destination);
      this._initialized = true;
      
      // Resume context if suspended (browser autoplay policy)
      if (this._ctx.state === 'suspended') {
        await this._ctx.resume();
      }
      
      console.log('[AudioEngine] AudioContext initialized');
      return this._ctx;
    } catch (e) {
      console.error('[AudioEngine] Failed to initialize AudioContext:', e);
      return null;
    }
  }

  get ctx() { return this._ctx; }
  get masterGain() { return this._masterGain; }
  get isInitialized() { return this._initialized; }
}

const audioContextManager = new AudioContextManager();

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dbToGain(db) {
  return Math.pow(10, db / 20);
}

function noiseBuffer(ctx, duration = 2, type = 'white') {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * duration;
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  
  if (type === 'white') {
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  } else if (type === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
  } else if (type === 'brown') {
    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + (0.02 * white)) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5;
    }
  }
  
  return buffer;
}

// ============================================================================
// ENGINE SOUND PROFILES — Per-vehicle-type engine characteristics
// ============================================================================

export const ENGINE_PROFILES = {
  sports: {
    name: 'Sports Engine',
    baseFreq: 150,
    freqRange: 450,       // RPM range in Hz
    harmonics: [1, 2, 3, 4, 6],
    harmonicGains: [1, 0.6, 0.25, 0.12, 0.05],
    attack: 0.02,
    release: 0.15,
    filterQ: 2,
    character: 'sharp',   // Sharp, responsive
    turboAvailable: true,
    idleRumble: 0.15,
    // Gear shift parameters
    gears: [
      { rpmStart: 0, rpmEnd: 0.25, ratio: 3.5 },
      { rpmStart: 0.22, rpmEnd: 0.45, ratio: 2.5 },
      { rpmStart: 0.42, rpmEnd: 0.65, ratio: 1.8 },
      { rpmStart: 0.62, rpmEnd: 0.85, ratio: 1.4 },
      { rpmStart: 0.82, rpmEnd: 1.0, ratio: 1.1 }
    ]
  },

  muscle: {
    name: 'Muscle V8',
    baseFreq: 80,
    freqRange: 280,
    harmonics: [0.5, 1, 1.5, 2, 3, 4],
    harmonicGains: [0.8, 1, 0.7, 0.5, 0.3, 0.15],
    attack: 0.05,
    release: 0.25,
    filterQ: 1.2,
    character: 'rumble', // Deep rumble
    turboAvailable: false,
    idleRumble: 0.35,
    gears: [
      { rpmStart: 0, rpmEnd: 0.28, ratio: 4.0 },
      { rpmStart: 0.25, rpmEnd: 0.50, ratio: 2.8 },
      { rpmStart: 0.47, rpmEnd: 0.70, ratio: 1.9 },
      { rpmStart: 0.67, rpmEnd: 0.88, ratio: 1.4 },
      { rpmStart: 0.85, rpmEnd: 1.0, ratio: 1.0 }
    ]
  },

  motorcycle: {
    name: 'Sport Bike',
    baseFreq: 200,
    freqRange: 600,
    harmonics: [1, 2, 3, 4, 5, 6, 8],
    harmonicGains: [1, 0.7, 0.4, 0.25, 0.15, 0.08, 0.03],
    attack: 0.01,
    release: 0.08,
    filterQ: 4,
    character: 'scream', // High-pitched scream
    turboAvailable: true,
    idleRumble: 0.08,
    gears: [
      { rpmStart: 0, rpmEnd: 0.30, ratio: 4.5 },
      { rpmStart: 0.27, rpmEnd: 0.55, ratio: 3.0 },
      { rpmStart: 0.52, rpmEnd: 0.75, ratio: 2.0 },
      { rpmStart: 0.72, rpmEnd: 0.90, ratio: 1.5 },
      { rpmStart: 0.87, rpmEnd: 1.0, ratio: 1.2 }
    ]
  },

  electric: {
    name: 'Electric Motor',
    baseFreq: 100,
    freqRange: 400,
    harmonics: [1, 2, 3, 4, 5],
    harmonicGains: [1, 0.5, 0.2, 0.08, 0.03],
    attack: 0.001,
    release: 0.01,
    filterQ: 0.8,
    character: 'whine', // Electric whine
    turboAvailable: false,
    idleRumble: 0.02,
    hasRegenSound: true,
    gears: [] // No gears - single speed
  },

  atv: {
    name: 'ATV Engine',
    baseFreq: 120,
    freqRange: 350,
    harmonics: [1, 2, 3, 4],
    harmonicGains: [1, 0.55, 0.2, 0.08],
    attack: 0.03,
    release: 0.18,
    filterQ: 1.5,
    character: 'rough',
    turboAvailable: false,
    idleRumble: 0.22,
    gears: [
      { rpmStart: 0, rpmEnd: 0.5, ratio: 3.0 },
      { rpmStart: 0.45, rpmEnd: 1.0, ratio: 1.5 }
    ]
  },

  buggy: {
    name: 'Buggy Engine',
    baseFreq: 100,
    freqRange: 320,
    harmonics: [1, 2, 3, 4, 5],
    harmonicGains: [1, 0.6, 0.3, 0.12, 0.05],
    attack: 0.04,
    release: 0.2,
    filterQ: 1.0,
    character: 'raw',
    turboAvailable: true,
    idleRumble: 0.28,
    gears: [
      { rpmStart: 0, rpmEnd: 0.55, ratio: 3.2 },
      { rpmStart: 0.5, rpmEnd: 1.0, ratio: 1.6 }
    ]
  },

  monster_truck: {
    name: 'Monster Truck V12',
    baseFreq: 60,
    freqRange: 220,
    harmonics: [0.5, 1, 1.5, 2, 2.5, 3],
    harmonicGains: [0.9, 1, 0.75, 0.5, 0.3, 0.18],
    attack: 0.08,
    release: 0.35,
    filterQ: 0.8,
    character: 'earthquake',
    turboAvailable: true,
    idleRumble: 0.5,
    gears: [
      { rpmStart: 0, rpmEnd: 0.35, ratio: 5.0 },
      { rpmStart: 0.3, rpmEnd: 0.6, ratio: 3.2 },
      { rpmStart: 0.55, rpmEnd: 0.82, ratio: 2.0 },
      { rpmStart: 0.78, rpmEnd: 1.0, ratio: 1.3 }
    ]
  },

  foot: {
    name: 'Footsteps/Breathing',
    baseFreq: 0, // Not an engine
    isFoot: true
  },

  special: {
    name: 'Hover/Wraith Engine',
    baseFreq: 180,
    freqRange: 300,
    harmonics: [1, 2, 3, 4, 5, 6],
    harmonicGains: [1, 0.4, 0.15, 0.06, 0.02, 0.01],
    attack: 0.001,
    release: 0.001,
    filterQ: 8,
    character: 'hum',
    turboAvailable: false,
    idleRumble: 0.03,
    isHover: true,
    gears: []
  }
};

// ============================================================================
// ENVIRONMENTAL AUDIO PROFILES — Per-track biome ambience
// ============================================================================

export const ENVIRONMENT_PROFILES = {
  desert: {
    name: 'Desert Wastes',
    layers: [
      { type: 'noise', color: 'brown', volume: 0.15, filterFreq: 400, name: 'wind' },
      { type: 'noise', color: 'white', volume: 0.04, filterFreq: 8000, name: 'sand_particles' },
      { type: 'tone', freq: 80, volume: 0.02, waveform: 'sine', name: 'distant_dune' }
    ],
    windSpeedModulation: { rate: 0.1, depth: 0.4 },
    reverbDecay: 2.5,
    temperature: 'hot'
  },

  alpine: {
    name: 'Alpine Peaks',
    layers: [
      { type: 'noise', color: 'white', volume: 0.18, filterFreq: 1200, name: 'mountain_wind' },
      { type: 'noise', color: 'pink', volume: 0.06, filterFreq: 3000, name: 'pine_rustle' },
      { type: 'tone', freq: 40, volume: 0.03, waveform: 'sine', name: 'avalanche_rumble' }
    ],
    windSpeedModulation: { rate: 0.15, depth: 0.5 },
    reverbDecay: 4.0,
    temperature: 'cold'
  },

  industrial: {
    name: 'Industrial Zone',
    layers: [
      { type: 'noise', color: 'brown', volume: 0.12, filterFreq: 200, name: 'machinery_hum' },
      { type: 'noise', color: 'white', volume: 0.05, filterFreq: 5000, name: 'steam_hiss' },
      { type: 'tone', freq: 60, volume: 0.06, waveform: 'sawtooth', name: 'transformer_buzz' },
      { type: 'random_tone', minFreq: 80, maxFreq: 200, volume: 0.03, name: 'metal_clank' }
    ],
    windSpeedModulation: { rate: 0.05, depth: 0.2 },
    reverbDecay: 3.5,
    temperature: 'neutral'
  },

  neon_grid: {
    name: 'Neon Grid',
    layers: [
      { type: 'noise', color: 'pink', volume: 0.08, filterFreq: 2000, name: 'electronic_hum' },
      { type: 'tone', freq: 120, volume: 0.04, waveform: 'square', name: 'data_processing' },
      { type: 'tone', freq: 60, volume: 0.02, waveform: 'sine', name: 'bass_pulse' },
      { type: 'arpeggio', notes: [261.63, 329.63, 392.00, 523.25], tempo: 0.15, volume: 0.015, name: 'ambient_arpeggio' }
    ],
    windSpeedModulation: { rate: 0.08, depth: 0.15 },
    reverbDecay: 2.0,
    temperature: 'neutral'
  },

  volcanic: {
    name: 'Volcanic Region',
    layers: [
      { type: 'noise', color: 'brown', volume: 0.2, filterFreq: 150, name: 'lava_bubble' },
      { type: 'noise', color: 'white', volume: 0.08, filterFreq: 6000, name: 'rock_crack' },
      { type: 'tone', freq: 35, volume: 0.08, waveform: 'sine', name: 'deep_rumble' },
      { type: 'random_impulse', volume: 0.06, chance: 0.02, name: 'eruption_distant' }
    ],
    windSpeedModulation: { rate: 0.03, depth: 0.3 },
    reverbDecay: 5.0,
    temperature: 'hot'
  },

  underwater: {
    name: 'Underwater Depths',
    layers: [
      { type: 'noise', color: 'blue', volume: 0.18, filterFreq: 800, name: 'water_flow' },
      { type: 'noise', color: 'pink', volume: 0.06, filterFreq: 2500, name: 'bubbles' },
      { type: 'tone', freq: 50, volume: 0.04, waveform: 'sine', name: 'whale_call' },
      { type: 'filter_sweep', startFreq: 200, endFreq: 800, rate: 0.05, volume: 0.03, name: 'pressure_change' }
    ],
    lowPassFilter: 2000, // Muffled underwater sound
    windSpeedModulation: { rate: 0.04, depth: 0.2 },
    reverbDecay: 6.0,
    temperature: 'cold'
  },

  space: {
    name: 'Space Station',
    layers: [
      { type: 'noise', color: 'brown', volume: 0.06, filterFreq: 300, name: 'ship_hum' },
      { type: 'noise', color: 'white', volume: 0.03, filterFreq: 8000, name: 'radio_static' },
      { type: 'tone', freq: 100, volume: 0.02, waveform: 'sine', name: 'life_support' },
      { type: 'beep_sequence', pattern: [1,0,1,0,0,1,0,1], interval: 0.8, volume: 0.015, name: 'nav_computer' }
    ],
    windSpeedModulation: { rate: 0.02, depth: 0.1 },
    reverbDecay: 1.0,
    temperature: 'variable'
  },

  coastal: {
    name: 'Coastal Highway',
    layers: [
      { type: 'noise', color: 'pink', volume: 0.16, filterFreq: 600, name: 'waves' },
      { type: 'noise', color: 'white', volume: 0.04, filterFreq: 4000, name: 'seagulls' },
      { type: 'tone', freq: 200, volume: 0.025, waveform: 'sine', name: 'buoy_bell' },
      { type: 'random_tone', minFreq: 800, maxFreq: 2000, volume: 0.015, name: 'gull_calls' }
    ],
    windSpeedModulation: { rate: 0.12, depth: 0.45 },
    reverbDecay: 3.0,
    temperature: 'mild'
  }
};

// ============================================================================
// SURFACE TIRE SOUND DEFINITIONS
// ============================================================================

export const TIRE_SURFACE_SOUNDS = {
  asphalt: {
    name: 'Asphalt',
    baseVolume: 0.3,
    frequencyResponse: 'flat',
    texture: 'smooth',
    skidCharacter: 'screech',
    rollNoiseColor: 'white'
  },
  dirt: {
    name: 'Dirt/Gravel',
    baseVolume: 0.45,
    frequencyResponse: 'mid_boost',
    texture: 'rough',
    skidCharacter: 'gravel',
    rollNoiseColor: 'brown'
  },
  sand: {
    name: 'Sand',
    baseVolume: 0.38,
    frequencyResponse: 'low_pass',
    texture: 'soft',
    skidCharacter: 'muffled',
    rollNoiseColor: 'pink'
  },
  ice: {
    name: 'Ice',
    baseVolume: 0.15,
    frequencyResponse: 'high_shimmer',
    texture: 'smooth',
    skidCharacter: 'crunch',
    rollNoiseColor: 'white'
  },
  metal: {
    name: 'Metal Grid',
    baseVolume: 0.5,
    frequencyResponse: 'resonant',
    texture: 'ridged',
    skidCharacter: 'clang',
    rollNoiseColor: 'metallic'
  },
  grass: {
    name: 'Grass',
    baseVolume: 0.25,
    frequencyResponse: 'mid_cut',
    texture: 'soft',
    skidCharacter: 'rustle',
    rollNoiseColor: 'brown'
  }
};

// ============================================================================
// MAIN AUDIO ENGINE CLASS
// ============================================================================

export class AudioEngine {
  constructor() {
    this._ctx = null;
    this._masterGain = null;
    
    // Engine sound state
    this._engineNodes = null;
    this._currentRPM = 0;
    this._targetRPM = 0;
    this._currentGear = 0;
    this._loadFactor = 0; // Accelerating vs decelerating
    this._engineProfile = null;
    this._isEngineRunning = false;
    
    // Environmental audio state
    this._envNodes = [];
    this._currentEnvironment = null;
    this._windNode = null;
    this._windGain = null;
    
    // Music system state
    this._musicNodes = [];
    this._musicPlaying = false;
    this._musicContext = 'menu';
    this._musicIntensity = 0.5; // 0-1 dynamic intensity
    
    // 3D Audio state
    this._listener = null;
    this._spatialSources = new Map();
    
    // UI Sound cache
    this._uiSoundBuffers = new Map();
    
    // Initialization flag
    this._initialized = false;
    
    // Bind methods
    this.update = this.update.bind(this);
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  async init() {
    if (this._initialized) return true;
    
    const ctx = await audioContextManager.init();
    if (!ctx) return false;
    
    this._ctx = ctx;
    this._masterGain = audioContextManager.masterGain;
    
    // Create audio listener for 3D positioning
    this._listener = ctx.listener;
    
    // Pre-generate UI sound buffers
    this._preGenerateUISounds();
    
    // Set up event listeners
    this._setupEventListeners();
    
    this._initialized = true;
    console.log('[AudioEngine] Initialized successfully');
    
    EventBus.emit('audio:engineReady');
    return true;
  }

  _setupEventListeners() {
    EventBus.on('race:start', () => this.startEngine('sports'));
    EventBus.on('race:end', () => this.stopEngine());
    EventBus.on('vehicle:change', (data) => {
      if (data && data.vehicleType) {
        this.setEngineProfile(data.vehicleType);
      }
    });
    EventBus.on('track:change', (data) => {
      if (data && data.biome) {
        this.setEnvironment(data.biome);
      }
    });
  }

  // ==========================================================================
  // ENGINE SOUND SYSTEM
  // ==========================================================================

  setEngineProfile(vehicleType) {
    this._engineProfile = ENGINE_PROFILES[vehicleType] || ENGINE_PROFILES.sports;
    
    if (this._isEngineRunning) {
      this.stopEngine();
      this.startEngine(vehicleType);
    }
  }

  startEngine(vehicleType = 'sports') {
    if (!this._initialized || !this._ctx) return;
    
    this.setEngineProfile(vehicleType);
    if (this._engineProfile.isFoot) return; // No engine for foot runner
    
    this._stopEngineNodes();
    this._engineNodes = this._createEngineSoundGraph();
    this._isEngineRunning = true;
    this._currentRPM = 0;
    this._targetRPM = 0;
    
    console.log(`[AudioEngine] Engine started: ${this._engineProfile.name}`);
  }

  stopEngine() {
    this._stopEngineNodes();
    this._isEngineRunning = false;
    this._currentRPM = 0;
    this._targetRPM = 0;
  }

  _stopEngineNodes() {
    if (this._engineNodes) {
      Object.values(this._engineNodes).forEach(node => {
        try {
          if (node && typeof node.stop === 'function') node.stop();
          if (node && typeof node.disconnect === 'function') node.disconnect();
        } catch (e) {}
      });
      this._engineNodes = null;
    }
  }

  _createEngineSoundGraph() {
    const ctx = this._ctx;
    const profile = this._engineProfile;
    if (!profile || profile.isFoot) return null;
    
    const nodes = {};
    
    // Main oscillator(s) for engine tone
    nodes.oscillators = profile.harmonics.map((harmonic, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = profile.baseFreq * harmonic;
      
      const gain = ctx.createGain();
      gain.gain.value = profile.harmonicGains[i] * 0.15;
      
      osc.connect(gain);
      nodes[`osc_${i}_gain`] = gain;
      
      return osc;
    });
    
    // Sub oscillator for rumble (lower frequencies)
    if (profile.idleRumble > 0.1) {
      nodes.subOsc = ctx.createOscillator();
      nodes.subOsc.type = 'sine';
      nodes.subOsc.frequency.value = profile.baseFreq * 0.5;
      
      nodes.subGain = ctx.createGain();
      nodes.subGain.gain.value = profile.idleRumble * 0.3;
      nodes.subOsc.connect(nodes.subGain);
    }
    
    // Noise component for engine texture
    nodes.noiseSource = ctx.createBufferSource();
    nodes.noiseSource.buffer = noiseBuffer(ctx, 2, 'brown');
    nodes.noiseSource.loop = true;
    
    nodes.noiseFilter = ctx.createBiquadFilter();
    nodes.noiseFilter.type = 'bandpass';
    nodes.noiseFilter.frequency.value = profile.baseFreq * 2;
    nodes.noiseFilter.Q.value = profile.filterQ;
    
    nodes.noiseGain = ctx.createGain();
    nodes.noiseGain.gain.value = 0.04;
    
    nodes.noiseSource.connect(nodes.noiseFilter);
    nodes.noiseFilter.connect(nodes.noiseGain);
    
    // Main filter for tonal shaping
    nodes.mainFilter = ctx.createBiquadFilter();
    nodes.mainFilter.type = 'lowpass';
    nodes.mainFilter.frequency.value = profile.baseFreq + profile.freqRange;
    nodes.mainFilter.Q.value = profile.filterQ;
    
    // Master gain for engine
    nodes.masterGain = ctx.createGain();
    nodes.masterGain.gain.value = 0.7;
    
    // Connect oscillators to main filter
    nodes.oscillators.forEach(osc => {
      const gainKey = `osc_${nodes.oscillators.indexOf(osc)}_gain`;
      osc.connect(nodes[gainKey]);
      nodes[gainKey].connect(nodes.mainFilter);
    });
    
    // Connect sub oscillator
    if (nodes.subOsc) {
      nodes.subOsc.connect(nodes.subGain);
      nodes.subGain.connect(nodes.mainFilter);
    }
    
    // Connect noise path
    nodes.noiseGain.connect(nodes.mainFilter);
    
    // Connect main filter to master
    nodes.mainFilter.connect(nodes.masterGain);
    nodes.masterGain.connect(this._masterGain);
    
    // Start all sources
    nodes.oscillators.forEach(osc => osc.start());
    if (nodes.subOsc) nodes.subOsc.start();
    nodes.noiseSource.start();
    
    return nodes;
  }

  updateEngine(rpm, loadFactor = 0, deltaTime = 0.016) {
    if (!this._isEngineRunning || !this._engineNodes || !this._engineProfile) return;
    
    const profile = this._engineProfile;
    
    // Smooth RPM transitions
    this._targetRPM = clamp(rpm, 0, 1);
    const rpmSmoothSpeed = profile.character === 'sharp' ? 8 : 
                           profile.character === 'rumble' ? 3 : 5;
    this._currentRPM += (this._targetRPM - this._currentRPM) * rpmSmoothSpeed * deltaTime;
    
    const currentRPM = this._currentRPM;
    this._loadFactor = loadFactor;
    
    // Calculate current frequency based on RPM
    const baseFreq = profile.baseFreq + (profile.freqRange * currentRPM);
    
    // Update oscillators
    this._engineNodes.oscillators.forEach((osc, i) => {
      const harmonic = profile.harmonics[i];
      const targetFreq = baseFreq * harmonic;
      osc.frequency.setTargetAtTime(targetFreq, this._ctx.currentTime, 0.05);
      
      // Modulate gain based on load and RPM
      const gainNode = this._engineNodes[`osc_${i}_gain`];
      const baseGain = profile.harmonicGains[i] * 0.15;
      const loadBoost = loadFactor > 0 ? loadFactor * 0.05 : 0;
      const rpmBoost = currentRPM * 0.03;
      gainNode.gain.setTargetAtTime(baseGain + loadBoost + rpmBoost, this._ctx.currentTime, 0.05);
    });
    
    // Update sub oscillator
    if (this._engineNodes.subOsc) {
      this._engineNodes.subOsc.frequency.setTargetAtTime(
        baseFreq * 0.5, this._ctx.currentTime, 0.05
      );
      const subGainValue = profile.idleRumble * (0.2 + currentRPM * 0.4);
      this._engineNodes.subGain.gain.setTargetAtTime(subGainValue, this._ctx.currentTime, 0.05);
    }
    
    // Update noise filter (follows RPM)
    this._engineNodes.noiseFilter.frequency.setTargetAtTime(
      baseFreq * 1.5, this._ctx.currentTime, 0.08
    );
    const noiseGainValue = 0.02 + currentRPM * 0.06 + Math.abs(loadFactor) * 0.02;
    this._engineNodes.noiseGain.gain.setTargetAtTime(noiseGainValue, this._ctx.currentTime, 0.05);
    
    // Update main filter
    const filterFreq = baseFreq * (1.5 + currentRPM);
    this._engineNodes.mainFilter.frequency.setTargetAtTime(filterFreq, this._ctx.currentTime, 0.05);
    
    // Check for gear shift
    this._checkGearShift(currentRPM);
  }

  _checkGearShift(currentRPM) {
    const profile = this._engineProfile;
    if (!profile.gears || profile.gears.length === 0) return;
    
    const gearCount = profile.gears.length;
    let targetGear = 0;
    
    for (let i = 0; i < gearCount; i++) {
      if (currentRPM >= profile.gears[i].rpmStart) {
        targetGear = i;
      }
    }
    
    if (targetGear !== this._currentGear && this._loadFactor > 0.3) {
      this._playGearShiftSound(targetGear > this._currentGear ? 'up' : 'down');
      this._currentGear = targetGear;
    }
  }

  _playGearShiftSound(direction) {
    if (!this._ctx) return;
    
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sine';
    osc.frequency.value = direction === 'up' ? 300 : 200;
    gain.gain.value = 0.15;
    
    osc.connect(gain);
    gain.connect(this._masterGain);
    
    const now = ctx.currentTime;
    osc.frequency.exponentialRampToValueAtTime(direction === 'up' ? 500 : 100, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    
    osc.start(now);
    osc.stop(now + 0.15);
  }

  playTurboSpool() {
    if (!this._ctx || !this._engineProfile?.turboAvailable) return;
    
    const ctx = this._ctx;
    
    // Spool-up whistle
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    osc.type = 'sine';
    osc.frequency.value = 800;
    filter.type = 'bandpass';
    filter.frequency.value = 2000;
    filter.Q.value = 10;
    gain.gain.value = 0;
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this._masterGain);
    
    const now = ctx.currentTime;
    gain.gain.linearRampToValueAtTime(0.12, now + 0.3);
    osc.frequency.exponentialRampToValueAtTime(3000, now + 0.5);
    
    osc.start(now);
    
    // Store for later release
    this._turboOsc = osc;
    this._turboGain = gain;
  }

  releaseTurbo() {
    if (!this._turboOsc || !this._turboGain) return;
    
    const now = this._ctx.currentTime;
    this._turboOsc.frequency.exponentialRampToValueAtTime(800, now + 0.4);
    this._turboGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    
    this._turboOsc.stop(now + 0.5);
    this._turboOsc = null;
    this._turboGain = null;
  }

  playEngineDamage(level = 1) {
    if (!this._ctx) return;
    
    const ctx = this._ctx;
    const severity = clamp(level, 1, 3);
    
    // Misfire/cough sound
    const interval = setInterval(() => {
      if (!this._isEngineRunning) {
        clearInterval(interval);
        return;
      }
      
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer(ctx, 0.1, 'white');
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 200 + Math.random() * 400;
      filter.Q.value = 2;
      
      const gain = ctx.createGain();
      gain.gain.value = 0.08 * severity;
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this._masterGain);
      
      noise.start();
      
      // Rattle
      const rattle = ctx.createOscillator();
      rattle.type = 'square';
      rattle.frequency.value = 60 + Math.random() * 40;
      
      const rattleGain = ctx.createGain();
      rattleGain.gain.value = 0.03 * severity;
      rattleGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      
      rattle.connect(rattleGain);
      rattleGain.connect(this._masterGain);
      
      rattle.start();
      rattle.stop(ctx.currentTime + 0.1);
    }, 500 / severity);
    
    this._damageInterval = interval;
  }

  stopEngineDamage() {
    if (this._damageInterval) {
      clearInterval(this._damageInterval);
      this._damageInterval = null;
    }
  }

  // ==========================================================================
  // ENVIRONMENTAL AUDIO SYSTEM
  // ==========================================================================

  setEnvironment(biome) {
    if (this._currentEnvironment === biome) return;
    
    this._stopEnvironment();
    this._currentEnvironment = biome;
    
    const profile = ENVIRONMENT_PROFILES[biome];
    if (!profile) return;
    
    console.log(`[AudioEngine] Environment set: ${profile.name}`);
    
    // Create each layer
    profile.layers.forEach(layer => {
      const node = this._createEnvLayer(layer, profile);
      if (node) this._envNodes.push(node);
    });
    
    // Create wind noise (speed-dependent)
    this._createWindNode(profile);
  }

  _stopEnvironment() {
    this._envNodes.forEach(node => {
      try {
        if (node.source && node.source.stop) node.source.stop();
        if (node.source && node.source.disconnect) node.source.disconnect();
        Object.values(node.nodes || {}).forEach(n => {
          if (n && n.disconnect) n.disconnect();
        });
      } catch (e) {}
    });
    this._envNodes = [];
    
    if (this._windNode) {
      try {
        if (this._windNode.stop) this._windNode.stop();
        if (this._windNode.disconnect) this._windNode.disconnect();
      } catch (e) {}
      this._windNode = null;
    }
    if (this._windGain) {
      try { this._windGain.disconnect(); } catch (e) {}
      this._windGain = null;
    }
  }

  _createEnvLayer(layer, profile) {
    const ctx = this._ctx;
    if (!ctx) return null;
    
    const node = { layer, nodes: {} };
    
    switch (layer.type) {
      case 'noise': {
        node.source = ctx.createBufferSource();
        node.source.buffer = noiseBuffer(ctx, 4, layer.color);
        node.source.loop = true;
        
        node.nodes.filter = ctx.createBiquadFilter();
        node.nodes.filter.type = 'lowpass';
        node.nodes.filter.frequency.value = layer.filterFreq || 1000;
        
        node.nodes.gain = ctx.createGain();
        node.nodes.gain.gain.value = layer.volume || 0.1;
        
        node.source.connect(node.nodes.filter);
        node.nodes.filter.connect(node.nodes.gain);
        node.nodes.gain.connect(this._masterGain);
        
        // Apply environment's low-pass if present (e.g., underwater)
        if (profile.lowPassFilter) {
          const envFilter = ctx.createBiquadFilter();
          envFilter.type = 'lowpass';
          envFilter.frequency.value = profile.lowPassFilter;
          node.nodes.gain.disconnect();
          node.nodes.gain.connect(envFilter);
          envFilter.connect(this._masterGain);
          node.nodes.envFilter = envFilter;
        }
        
        node.source.start();
        break;
      }
      
      case 'tone': {
        node.source = ctx.createOscillator();
        node.source.type = layer.waveform || 'sine';
        node.source.frequency.value = layer.freq || 100;
        
        node.nodes.gain = ctx.createGain();
        node.nodes.gain.gain.value = layer.volume || 0.05;
        
        node.source.connect(node.nodes.gain);
        node.nodes.gain.connect(this._masterGain);
        
        node.source.start();
        break;
      }
      
      case 'arpeggio': {
        // Ambient arpeggio sequence
        node.notes = layer.notes || [261.63, 329.63, 392.00];
        node.tempo = layer.tempo || 0.2;
        node.currentIndex = 0;
        
        node.source = ctx.createOscillator();
        node.source.type = 'sine';
        node.source.frequency.value = node.notes[0];
        
        node.nodes.gain = ctx.createGain();
        node.nodes.gain.gain.value = layer.volume || 0.02;
        
        node.source.connect(node.nodes.gain);
        node.nodes.gain.connect(this._masterGain);
        
        node.source.start();
        
        // Arpeggio scheduler
        node.interval = setInterval(() => {
          if (!node.source) { clearInterval(node.interval); return; }
          node.currentIndex = (node.currentIndex + 1) % node.notes.length;
          node.source.frequency.setTargetAtTime(
            node.notes[node.currentIndex], ctx.currentTime, 0.05
          );
        }, node.tempo * 1000);
        break;
      }
      
      case 'random_tone': {
        // Random metallic clanks or bird calls
        node.interval = setInterval(() => {
          if (!this._ctx) { clearInterval(node.interval); return; }
          
          const osc = this._ctx.createOscillator();
          const gain = this._ctx.createGain();
          
          osc.type = layer.waveform || 'sine';
          osc.frequency.value = layer.minFreq + Math.random() * (layer.maxFreq - layer.minFreq);
          gain.gain.value = (layer.volume || 0.03) * (0.5 + Math.random() * 0.5);
          
          osc.connect(gain);
          gain.connect(this._masterGain);
          
          const now = this._ctx.currentTime;
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3 + Math.random() * 0.5);
          
          osc.start(now);
          osc.stop(now + 0.8);
        }, 2000 + Math.random() * 3000);
        break;
      }
      
      case 'random_impulse': {
        // Distant eruptions, thunder, etc.
        node.interval = setInterval(() => {
          if (!this._ctx) { clearInterval(node.interval); return; }
          if (Math.random() > (layer.chance || 0.02)) return;
          
          const noise = this._ctx.createBufferSource();
          noise.buffer = noiseBuffer(this._ctx, 1, 'brown');
          
          const filter = this._ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 200 + Math.random() * 300;
          
          const gain = this._ctx.createGain();
          gain.gain.value = (layer.volume || 0.05) * (0.5 + Math.random() * 0.5);
          
          noise.connect(filter);
          filter.connect(gain);
          gain.connect(this._masterGain);
          
          const now = this._ctx.currentTime;
          gain.gain.exponentialRampToValueAtTime(0.001, now + 2 + Math.random() * 2);
          
          noise.start(now);
          noise.stop(now + 4);
        }, 500);
        break;
      }
      
      case 'filter_sweep': {
        // Slow modulating filter sweep
        node.source = this._ctx.createBufferSource();
        node.source.buffer = noiseBuffer(this._ctx, 4, 'pink');
        node.source.loop = true;
        
        node.nodes.filter = this._ctx.createBiquadFilter();
        node.nodes.filter.type = 'bandpass';
        node.nodes.filter.frequency.value = layer.startFreq || 200;
        node.nodes.filter.Q.value = 2;
        
        node.nodes.lfo = this._ctx.createOscillator();
        node.nodes.lfo.type = 'sine';
        node.nodes.lfo.frequency.value = layer.rate || 0.05;
        
        node.nodes.lfoGain = this._ctx.createGain();
        node.nodes.lfoGain.gain.value = (layer.endFreq || 800) - (layer.startFreq || 200);
        
        node.nodes.lfo.connect(node.nodes.lfoGain);
        node.nodes.lfoGain.connect(node.nodes.filter.frequency);
        
        node.nodes.gain = this._ctx.createGain();
        node.nodes.gain.gain.value = layer.volume || 0.02;
        
        node.source.connect(node.nodes.filter);
        node.nodes.filter.connect(node.nodes.gain);
        node.nodes.gain.connect(this._masterGain);
        
        node.nodes.lfo.start();
        node.source.start();
        break;
      }
      
      case 'beep_sequence': {
        // Computer beep patterns
        node.pattern = layer.pattern || [1, 0, 1];
        node.interval = layer.interval || 1;
        node.index = 0;
        
        node.intervalId = setInterval(() => {
          if (!this._ctx) { clearInterval(node.intervalId); return; }
          
          if (node.pattern[node.index]) {
            const osc = this._ctx.createOscillator();
            const gain = this._ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.value = 800 + Math.random() * 400;
            gain.gain.value = layer.volume || 0.02;
            
            osc.connect(gain);
            gain.connect(this._masterGain);
            
            const now = this._ctx.currentTime;
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            
            osc.start(now);
            osc.stop(now + 0.15);
          }
          
          node.index = (node.index + 1) % node.pattern.length;
        }, node.interval * 1000);
        break;
      }
    }
    
    return node;
  }

  _createWindNode(profile) {
    const ctx = this._ctx;
    if (!ctx) return;
    
    // Wind noise source
    this._windNode = ctx.createBufferSource();
    this._windNode.buffer = noiseBuffer(ctx, 4, 'white');
    this._windNode.loop = true;
    
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 800;
    windFilter.Q.value = 0.5;
    
    this._windGain = ctx.createGain();
    this._windGain.gain.value = 0; // Starts silent, increases with speed
    
    this._windNode.connect(windFilter);
    windFilter.connect(this._windGain);
    this._windGain.connect(this._masterGain);
    
    this._windNode.start();
  }

  updateWind(speed) {
    if (!this._windGain) return;
    // Speed from 0-1 maps to wind volume 0-0.3
    const targetWind = Math.pow(clamp(speed, 0, 1), 2) * 0.3;
    this._windGain.gain.setTargetAtTime(targetWind, this._ctx.currentTime, 0.1);
  }

  // ==========================================================================
  // MUSIC SYSTEM
  // ==========================================================================

  async playMusic(context = 'menu', options = {}) {
    if (!this._ctx) await this.init();
    
    this._musicContext = context;
    this._stopMusic();
    
    switch (context) {
      case 'menu':
        this._playMenuMusic(options.variation || 0);
        break;
      case 'race':
        this._playRaceMusic(options.intensity || 0.5);
        break;
      case 'results':
        this._playResultsMusic(options.placement || 1);
        break;
      case 'garage':
        this._playGarageMusic();
        break;
      default:
        this._playAmbientMusic(context);
    }
    
    this._musicPlaying = true;
  }

  _stopMusic() {
    this._musicNodes.forEach(node => {
      try {
        if (node.source && node.source.stop) node.source.stop();
        if (node.source && node.source.disconnect) node.source.disconnect();
        if (node.interval) clearInterval(node.interval);
        Object.values(node.nodes || {}).forEach(n => {
          if (n && n.disconnect) n.disconnect();
        });
      } catch (e) {}
    });
    this._musicNodes = [];
    this._musicPlaying = false;
  }

  stopMusic() {
    this._stopMusic();
  }

  _playMenuMusic(variation = 0) {
    const ctx = this._ctx;
    const node = { nodes: {} };
    
    // Chill electronic ambient
    const chordProgression = [
      [261.63, 329.63, 392.00], // C major
      [293.66, 369.99, 440.00], // D minor
      [349.23, 440.00, 523.25], // F major
      [392.00, 493.88, 587.33], // G major
    ];
    
    // Bass drone
    node.bassOsc = ctx.createOscillator();
    node.bassOsc.type = 'sine';
    node.bassOsc.frequency.value = 65.41; // C2
    
    node.bassGain = ctx.createGain();
    node.bassGain.gain.value = 0.08;
    
    node.bassOsc.connect(node.bassGain);
    node.bassGain.connect(this._masterGain);
    node.bassOsc.start();
    
    // Pad chords
    node.padOscillators = chordProgression[variation % chordProgression.length].map(freq => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq / 2; // Lower octave
      
      const gain = ctx.createGain();
      gain.gain.value = 0.04;
      
      // Slow tremolo
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.3 + variation * 0.1;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.02;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();
      
      osc.connect(gain);
      gain.connect(this._masterGain);
      osc.start();
      
      return { osc, gain, lfo };
    });
    
    // Subtle arpeggio
    node.arpeggioIndex = 0;
    node.arpeggioNotes = [261.63, 329.63, 392.00, 523.25]; // C major arpeggio
    node.arpeggioOsc = ctx.createOscillator();
    node.arpeggioOsc.type = 'triangle';
    node.arpeggioOsc.frequency.value = node.arpeggioNotes[0];
    
    node.arpeggioGain = ctx.createGain();
    node.arpeggioGain.gain.value = 0.025;
    
    node.arpeggioOsc.connect(node.arpeggioGain);
    node.arpeggioGain.connect(this._masterGain);
    node.arpeggioOsc.start();
    
    node.interval = setInterval(() => {
      if (!node.arpeggioOsc) return;
      node.arpeggioIndex = (node.arpeggioIndex + 1) % node.arpeggioNotes.length;
      node.arpeggioOsc.frequency.setTargetAtTime(
        node.arpeggioNotes[node.arpeggioIndex], ctx.currentTime, 0.1
      );
    }, 400);
    
    node.source = { stop: () => {}, disconnect: () => {} }; // Placeholder
    this._musicNodes.push(node);
  }

  _playRaceMusic(intensity = 0.5) {
    const ctx = this._ctx;
    const node = { nodes: {} };
    
    // High-energy racing music with dynamic layers
    const bpm = 140 + intensity * 40;
    const beatInterval = 60 / bpm;
    
    // Kick drum
    node.kickOsc = ctx.createOscillator();
    node.kickOsc.type = 'sine';
    node.kickOsc.frequency.value = 60;
    
    node.kickGain = ctx.createGain();
    node.kickGain.gain.value = 0;
    
    node.kickOsc.connect(node.kickGain);
    node.kickGain.connect(this._masterGain);
    node.kickOsc.start();
    
    // Bass line
    node.bassOsc = ctx.createOscillator();
    node.bassOsc.type = 'sawtooth';
    node.bassOsc.frequency.value = 55;
    
    node.bassFilter = ctx.createBiquadFilter();
    node.bassFilter.type = 'lowpass';
    node.bassFilter.frequency.value = 200;
    node.bassFilter.Q.value = 2;
    
    node.bassGain = ctx.createGain();
    node.bassGain.gain.value = 0.06 * (0.5 + intensity * 0.5);
    
    node.bassOsc.connect(node.bassFilter);
    node.bassFilter.connect(node.bassGain);
    node.bassGain.connect(this._masterGain);
    node.bassOsc.start();
    
    // Synth lead (intensity-dependent)
    if (intensity > 0.5) {
      node.leadOsc = ctx.createOscillator();
      node.leadOsc.type = 'square';
      node.leadOsc.frequency.value = 440;
      
      node.leadFilter = ctx.createBiquadFilter();
      node.leadFilter.type = 'lowpass';
      node.leadFilter.frequency.value = 2000;
      
      node.leadGain = ctx.createGain();
      node.leadGain.gain.value = 0.03 * (intensity - 0.5) * 2;
      
      node.leadOsc.connect(node.leadFilter);
      node.leadFilter.connect(node.leadGain);
      node.leadGain.connect(this._masterGain);
      node.leadOsc.start();
    }
    
    // Hi-hat pattern
    node.hihatInterval = setInterval(() => {
      if (!this._ctx) return;
      
      const hihat = ctx.createBufferSource();
      hihat.buffer = noiseBuffer(ctx, 0.05, 'white');
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 8000;
      
      const gain = ctx.createGain();
      gain.gain.value = 0.025;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      
      hihat.connect(filter);
      filter.connect(gain);
      gain.connect(this._masterGain);
      
      hihat.start();
    }, beatInterval * 1000 / 2);
    
    // Kick pattern
    node.kickInterval = setInterval(() => {
      if (!node.kickOsc) return;
      
      const now = ctx.currentTime;
      node.kickOsc.frequency.setValueAtTime(150, now);
      node.kickOsc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
      node.kickGain.gain.setValueAtTime(0.15, now);
      node.kassGain?.gain?.exponentialRampToValueAtTime?.(0.001, now + 0.2);
      node.kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    }, beatInterval * 1000);
    
    node.source = { stop: () => {}, disconnect: () => {} };
    this._musicNodes.push(node);
    this._musicIntensity = intensity;
  }

  updateMusicIntensity(intensity) {
    if (Math.abs(intensity - this._musicIntensity) < 0.1) return;
    
    this._musicIntensity = intensity;
    
    // Could dynamically add/remove layers here
    // For now, just log the change
    if (this._musicContext === 'race') {
      // Restart race music with new intensity
      this.playMusic('race', { intensity });
    }
  }

  _playResultsMusic(placement = 1) {
    const ctx = this._ctx;
    const node = { nodes: {} };
    
    // Fanfare based on placement
    const fanfares = {
      1: { notes: [523.25, 659.25, 783.99, 1046.5], duration: 0.3, volume: 0.12 }, // Epic victory
      2: { notes: [440, 554.37, 659.25], duration: 0.25, volume: 0.1 },
      3: { notes: [392, 493.88, 587.33], duration: 0.25, volume: 0.08 },
      4: { notes: [349.23, 440, 523.25], duration: 0.2, volume: 0.06 }
    };
    
    const fanfare = fanfares[Math.min(placement, 4)] || fanfares[4];
    
    fanfare.notes.forEach((freq, i) => {
      setTimeout(() => {
        const osc = ctx.createOscillator();
        osc.type = placement === 1 ? 'sawtooth' : 'sine';
        osc.frequency.value = freq;
        
        const gain = ctx.createGain();
        gain.gain.value = fanfare.volume;
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + fanfare.duration * 2);
        
        osc.connect(gain);
        gain.connect(this._masterGain);
        
        osc.start();
        osc.stop(ctx.currentTime + fanfare.duration * 2);
      }, i * fanfare.duration * 1000);
    });
    
    node.source = { stop: () => {}, disconnect: () => {} };
    this._musicNodes.push(node);
  }

  _playGarageMusic() {
    // Similar to menu but more mechanical
    this._playMenuMusic(2);
  }

  _playAmbientMusic(context) {
    // Generic ambient for other contexts
    const ctx = this._ctx;
    const node = { nodes: {} };
    
    node.drone = ctx.createOscillator();
    node.drone.type = 'sine';
    node.drone.frequency.value = 80 + context.charCodeAt(0) % 40;
    
    node.droneGain = ctx.createGain();
    node.droneGain.gain.value = 0.04;
    
    node.drone.connect(node.droneGain);
    node.droneGain.connect(this._masterGain);
    node.drone.start();
    
    node.source = { stop: () => {}, disconnect: () => {} };
    this._musicNodes.push(node);
  }

  // Stinger effects for events
  playStinger(type = 'overtake') {
    if (!this._ctx) return;
    
    const ctx = this._ctx;
    const stingers = {
      overtake: { freqStart: 400, freqEnd: 800, duration: 0.15, type: 'rising' },
      crash: { freqStart: 200, freqEnd: 50, duration: 0.3, type: 'falling', noise: true },
      pickup: { freqs: [523.25, 659.25, 783.99], duration: 0.1, type: 'arpeggio' },
      boost: { freqStart: 300, freqEnd: 1200, duration: 0.4, type: 'rising_sweep' },
      countdown: { freqs: [440, 440, 440, 880], durations: [0.2, 0.2, 0.2, 0.4], type: 'sequence' }
    };
    
    const stinger = stingers[type] || stingers.overtake;
    
    if (stinger.type === 'rising' || stinger.type === 'falling' || stinger.type === 'rising_sweep') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = stinger.freqStart;
      
      const gain = ctx.createGain();
      gain.gain.value = 0.1;
      
      osc.connect(gain);
      gain.connect(this._masterGain);
      
      const now = ctx.currentTime;
      osc.frequency.exponentialRampToValueAtTime(stinger.freqEnd, now + stinger.duration);
      gain.gain.exponentialRampToValueAtTime(0.001, now + stinger.duration);
      
      osc.start(now);
      osc.stop(now + stinger.duration + 0.1);
      
      if (stinger.noise) {
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer(ctx, stinger.duration, 'white');
        const noiseGain = ctx.createGain();
        noiseGain.gain.value = 0.15;
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + stinger.duration);
        noise.connect(noiseGain);
        noiseGain.connect(this._masterGain);
        noise.start(now);
      }
    } else if (stinger.type === 'arpeggio') {
      stinger.freqs.forEach((freq, i) => {
        setTimeout(() => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = freq;
          
          const gain = ctx.createGain();
          gain.gain.value = 0.08;
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + stinger.duration * 2);
          
          osc.connect(gain);
          gain.connect(this._masterGain);
          
          osc.start();
          osc.stop(ctx.currentTime + stinger.duration * 2);
        }, i * stinger.duration * 1000);
      });
    } else if (stinger.type === 'sequence') {
      let timeOffset = 0;
      stinger.freqs.forEach((freq, i) => {
        setTimeout(() => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = freq;
          
          const gain = ctx.createGain();
          gain.gain.value = 0.12;
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (stinger.durations[i] || 0.2));
          
          osc.connect(gain);
          gain.connect(this._masterGain);
          
          osc.start();
          osc.stop(ctx.currentTime + (stinger.durations[i] || 0.2) + 0.05);
        }, timeOffset);
        timeOffset += (stinger.durations[i] || 0.2) * 1000;
      });
    }
  }

  // ==========================================================================
  // UI SOUND SYSTEM
  // ==========================================================================

  _preGenerateUISounds() {
    // Generate procedural UI sound definitions
    const uiSounds = {
      hover: { freq: 800, duration: 0.05, type: 'sine', volume: 0.08 },
      click: { freq: 600, duration: 0.08, type: 'square', volume: 0.1 },
      confirm: { freqs: [523.25, 659.25], durations: [0.08, 0.1], volume: 0.1 },
      back: { freq: 400, duration: 0.1, type: 'sawtooth', volume: 0.08 },
      navigate: { freq: 500, duration: 0.04, type: 'sine', volume: 0.06 },
      error: { freqs: [200, 150], durations: [0.15, 0.2], type: 'square', volume: 0.1 },
      warning: { freq: 300, duration: 0.2, type: 'square', volume: 0.08, repeat: 3 },
      achievement: { freqs: [523.25, 659.25, 783.99, 1046.5], durations: [0.1, 0.1, 0.1, 0.2], volume: 0.12 },
      levelUp: { freqs: [400, 500, 600, 800], durations: [0.1, 0.1, 0.1, 0.2], volume: 0.11 },
      friendOnline: { freq: 900, duration: 0.15, type: 'sine', volume: 0.07 },
      messageReceived: { freqs: [700, 850], durations: [0.06, 0.08], volume: 0.06 },
      invite: { freqs: [600, 750, 900], durations: [0.08, 0.08, 0.12], volume: 0.08 },
      partyJoin: { freqs: [523.25, 659.25, 783.99], durations: [0.08, 0.08, 0.15], volume: 0.1 },
      purchaseSuccess: { freqs: [600, 800, 1000], durations: [0.06, 0.06, 0.15], volume: 0.1 },
      insufficientFunds: { freqs: [300, 200], durations: [0.15, 0.2], type: 'square', volume: 0.09 },
      itemReveal: { freqs: [400, 600, 800, 1000, 1200], durations: [0.05, 0.05, 0.05, 0.05, 0.2], volume: 0.1 },
      connectionLost: { freq: 150, duration: 0.4, type: 'sawtooth', volume: 0.1 },
      criticalError: { freqs: [180, 140, 100], durations: [0.2, 0.2, 0.3], type: 'square', volume: 0.12 },
      lowHealth: { freq: 200, duration: 0.15, type: 'square', volume: 0.09, repeat: 2 },
      storeOpen: { freqs: [500, 700], durations: [0.06, 0.1], volume: 0.08 },
      storeClose: { freqs: [700, 500], durations: [0.06, 0.1], volume: 0.08 }
    };
    
    this._uiSounds = uiSounds;
  }

  playUI(soundName) {
    if (!this._ctx || !this._uiSounds) return;
    
    const sound = this._uiSounds[soundName];
    if (!sound) {
      console.warn(`[AudioEngine] Unknown UI sound: ${soundName}`);
      return;
    }
    
    const ctx = this._ctx;
    const repeatCount = sound.repeat || 1;
    
    for (let rep = 0; rep < repeatCount; rep++) {
      setTimeout(() => {
        if (sound.freqs) {
          // Multi-note sound
          sound.freqs.forEach((freq, i) => {
            setTimeout(() => {
              this._playTone(freq, sound.durations[i] || sound.duration || 0.1, 
                            sound.type || 'sine', sound.volume || 0.08);
            }, i * ((sound.durations && sound.durations[i]) || sound.duration || 0.1) * 1000 * (rep > 0 ? 1.5 : 1));
          });
        } else {
          // Single note sound
          this._playTone(sound.freq, sound.duration, sound.type || 'sine', sound.volume || 0.08);
        }
      }, rep * (sound.duration || 0.1) * 1000 * (repeatCount > 1 ? 1.5 : 1));
    }
  }

  _playTone(frequency, duration, type = 'sine', volume = 0.1) {
    if (!this._ctx) return;
    
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    
    const gain = ctx.createGain();
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(this._masterGain);
    
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.05);
  }

  // ==========================================================================
  // 3D POSITIONAL AUDIO SYSTEM
  // ==========================================================================

  setListenerPosition(position, orientation = { x: 0, y: 0, z: -1 }) {
    if (!this._listener) return;
    
    const now = this._ctx.currentTime;
    
    this._listener.positionX.setTargetAtTime(position.x, now, 0.1);
    this._listener.positionY.setTargetAtTime(position.y, now, 0.1);
    this._listener.positionZ.setTargetAtTime(position.z, now, 0.1);
    
    this._listener.forwardX.setTargetAtTime(orientation.x, now, 0.1);
    this._listener.forwardY.setTargetAtTime(orientation.y, now, 0.1);
    this._listener.forwardZ.setTargetAtTime(orientation.z, now, 0.1);
  }

  createSpatialSource(id, options = {}) {
    if (!this._ctx) return null;
    
    const ctx = this._ctx;
    const source = {
      panner: ctx.createPanner(),
      gain: ctx.createGain()
    };
    
    // Configure panner for 3D sound
    source.panner.panningModel = 'HRTF';
    source.panner.distanceModel = 'inverse';
    source.panner.refDistance = options.refDistance || 1;
    source.panner.maxDistance = options.maxDistance || 100;
    source.panner.rolloffFactor = options.rolloffFactor || 1;
    source.panner.coneInnerAngle = options.coneInnerAngle || 360;
    source.panner.coneOuterAngle = options.coneOuterAngle || 360;
    source.panner.coneOuterGain = 0;
    
    source.gain.gain.value = options.volume || 0.5;
    
    source.panner.connect(source.gain);
    source.gain.connect(this._masterGain);
    
    // Set initial position
    if (options.position) {
      source.panner.positionX.value = options.position.x || 0;
      source.panner.positionY.value = options.position.y || 0;
      source.panner.positionZ.value = options.position.z || 0;
    }
    
    this._spatialSources.set(id, source);
    return source;
  }

  updateSpatialSource(id, position) {
    const source = this._spatialSources.get(id);
    if (!source) return;
    
    const now = this._ctx.currentTime;
    source.panner.positionX.setTargetAtTime(position.x, now, 0.05);
    source.panner.positionY.setTargetAtTime(position.y, now, 0.05);
    source.panner.positionZ.setTargetAtTime(position.z, now, 0.05);
  }

  playSpatialSound(id, soundConfig) {
    const source = this._spatialSources.get(id);
    if (!source || !this._ctx) return;
    
    const ctx = this._ctx;
    
    // Create sound at source location
    if (soundConfig.type === 'noise') {
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer(ctx, soundConfig.duration || 0.5, soundConfig.color || 'white');
      
      const gain = ctx.createGain();
      gain.gain.value = soundConfig.volume || 0.3;
      if (soundConfig.duration) {
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + soundConfig.duration);
      }
      
      noise.connect(gain);
      gain.connect(source.panner);
      
      noise.start();
      if (soundConfig.duration) noise.stop(ctx.currentTime + soundConfig.duration + 0.1);
    } else {
      const osc = ctx.createOscillator();
      osc.type = soundConfig.waveform || 'sine';
      osc.frequency.value = soundConfig.frequency || 440;
      
      const gain = ctx.createGain();
      gain.gain.value = soundConfig.volume || 0.2;
      if (soundConfig.duration) {
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + soundConfig.duration);
      }
      
      osc.connect(gain);
      gain.connect(source.panner);
      
      osc.start();
      if (soundConfig.duration) osc.stop(ctx.currentTime + (soundConfig.duration || 1) + 0.1);
    }
  }

  removeSpatialSource(id) {
    const source = this._spatialSources.get(id);
    if (source) {
      try {
        source.panner.disconnect();
        source.gain.disconnect();
      } catch (e) {}
      this._spatialSources.delete(id);
    }
  }

  // ==========================================================================
  // TIRE/SURFACE SOUNDS
  // ==========================================================================

  playTireSound(surfaceType, speed, isSkidding = false) {
    if (!this._ctx) return;
    
    const surface = TIRE_SURFACE_SOUNDS[surfaceType] || TIRE_SURFACE_SOUNDS.asphalt;
    const ctx = this._ctx;
    
    if (isSkidding) {
      // Skid sound - louder, harsher
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer(ctx, 0.5, surface.rollNoiseColor);
      
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = surface.skidCharacter === 'screech' ? 4000 :
                               surface.skidCharacter === 'gravel' ? 1500 :
                               surface.skidCharacter === 'clang' ? 2000 : 2000;
      filter.Q.value = 2;
      
      const gain = ctx.createGain();
      const volume = surface.baseVolume * 2 * clamp(speed, 0, 1);
      gain.gain.value = volume;
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this._masterGain);
      
      noise.start();
      
      // Store reference for stopping
      this._skidNode = { noise, gain };
    } else {
      // Rolling tire noise
      this._updateTireRoll(surface, speed);
    }
  }

  _updateTireRoll(surface, speed) {
    if (!this._tireRollNode) {
      // Create continuous tire roll noise
      const ctx = this._ctx;
      
      this._tireRollNode = {
        source: ctx.createBufferSource(),
        filter: ctx.createBiquadFilter(),
        gain: ctx.createGain()
      };
      
      this._tireRollNode.source.buffer = noiseBuffer(ctx, 4, 'white');
      this._tireRollNode.source.loop = true;
      
      this._tireRollNode.filter.type = 'bandpass';
      this._tireRollNode.gain.gain.value = 0;
      
      this._tireRollNode.source.connect(this._tireRollNode.filter);
      this._tireRollNode.filter.connect(this._tireRollNode.gain);
      this._tireRollNode.gain.connect(this._masterGain);
      
      this._tireRollNode.source.start();
    }
    
    const surfaceData = TIRE_SURFACE_SOUNDS[surface] || TIRE_SURFACE_SOUNDS.asphalt;
    const targetVolume = surfaceData.baseVolume * clamp(speed, 0, 1) * 0.5;
    const targetFreq = 200 + clamp(speed, 0, 1) * 800;
    
    this._tireRollNode.gain.gain.setTargetAtTime(targetVolume, this._ctx.currentTime, 0.1);
    this._tireRollNode.filter.frequency.setTargetAtTime(targetFreq, this._ctx.currentTime, 0.1);
  }

  stopSkid() {
    if (this._skidNode) {
      const now = this._ctx.currentTime;
      this._skidNode.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      try {
        this._skidNode.noise.stop(now + 0.15);
      } catch (e) {}
      this._skidNode = null;
    }
  }

  // ==========================================================================
  // COLLISION/IMPACT SOUNDS
  // ==========================================================================

  playCollision(intensity = 0.5, collisionType = 'generic') {
    if (!this._ctx) return;
    
    const ctx = this._ctx;
    const intensityClamped = clamp(intensity, 0, 1);
    
    // Impact noise burst
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 0.3, 'white');
    
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000 + (1 - intensityClamped) * 2000;
    
    const gain = ctx.createGain();
    gain.gain.value = 0.2 + intensityClamped * 0.5;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this._masterGain);
    
    noise.start();
    
    // Low thud
    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.value = 60 + (1 - intensityClamped) * 80;
    
    const thudGain = ctx.createGain();
    thudGain.gain.value = 0.15 + intensityClamped * 0.25;
    thudGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    
    thud.connect(thudGain);
    thudGain.connect(this._masterGain);
    
    thud.start();
    thud.stop(ctx.currentTime + 0.25);
    
    // Metal/rattle for harder impacts
    if (intensityClamped > 0.5) {
      const rattle = ctx.createBufferSource();
      rattle.buffer = noiseBuffer(ctx, 0.2, 'white');
      
      const rattleFilter = ctx.createBiquadFilter();
      rattleFilter.type = 'bandpass';
      rattleFilter.frequency.value = 2000 + Math.random() * 2000;
      rattleFilter.Q.value = 5;
      
      const rattleGain = ctx.createGain();
      rattleGain.gain.value = intensityClamped * 0.15;
      rattleGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      
      rattle.connect(rattleFilter);
      rattleFilter.connect(rattleGain);
      rattleGain.connect(this._masterGain);
      
      rattle.start();
    }
  }

  // ==========================================================================
  // ITEM/PICKUP SOUNDS
  // ==========================================================================

  playItemPickup(itemType = 'generic') {
    if (!this._ctx) return;
    
    const itemSounds = {
      generic: { freqs: [523.25, 783.99], duration: 0.08 },
      missile: { freqs: [300, 500, 800], duration: 0.06, type: 'sawtooth' },
      shield: { freqs: [400, 600, 800, 1000], duration: 0.1, type: 'sine' },
      boost: { freq: 200, endFreq: 1500, duration: 0.3, type: 'rising' },
      health: { freqs: [400, 500, 600], duration: 0.1, type: 'sine' },
      coin: { freq: 1200, duration: 0.08, type: 'sine', volume: 0.08 }
    };
    
    const sound = itemSounds[itemType] || itemSounds.generic;
    this.playStinger(itemType === 'boost' ? 'boost' : 'pickup');
  }

  // ==========================================================================
  // ANNOUNCER VOICE SYSTEM (Procedural blips and tones)
  // ==========================================================================

  playAnnouncer(phrase) {
    if (!this._ctx) return;
    
    // Map phrases to simple tonal patterns (not actual speech)
    const announcerPhrases = {
      'go': { freqs: [400, 600, 800], durations: [0.15, 0.15, 0.25], volume: 0.15 },
      'ready': { freq: 440, duration: 0.2 },
      'set': { freq: 440, duration: 0.2 },
      'first_place': { freqs: [523.25, 659.25, 783.99, 1046.5], durations: [0.12, 0.12, 0.12, 0.3], volume: 0.13 },
      'overtake': { freqs: [600, 800], durations: [0.08, 0.12], volume: 0.1 },
      'warning': { freq: 250, duration: 0.25, type: 'square', repeat: 2 },
      'eliminated': { freqs: [300, 200, 100], durations: [0.2, 0.2, 0.4], type: 'sawtooth', volume: 0.12 },
      'lap_complete': { freqs: [523.25, 659.25, 783.99], durations: [0.1, 0.1, 0.2] },
      'final_lap': { freqs: [440, 554.37, 659.25, 880], durations: [0.12, 0.12, 0.12, 0.3], volume: 0.13 },
      'countdown_3': { freq: 440, duration: 0.2 },
      'countdown_2': { freq: 440, duration: 0.2 },
      'countdown_1': { freq: 440, duration: 0.35, volume: 0.15 },
      'game_over': { freqs: [400, 350, 300, 250], durations: [0.2, 0.2, 0.2, 0.5], volume: 0.1 }
    };
    
    const sound = announcerPhrases[phrase.toLowerCase()];
    if (sound) {
      if (sound.freqs) {
        sound.freqs.forEach((freq, i) => {
          setTimeout(() => {
            this._playTone(freq, sound.durations[i], sound.type || 'sine', sound.volume || 0.1);
          }, sound.freqs.slice(0, i).reduce((sum, _, j) => sum + sound.durations[j] * 1000, 0));
        });
      } else {
        this._playTone(sound.freq, sound.duration, sound.type || 'sine', sound.volume || 0.1);
      }
    }
  }

  // ==========================================================================
  // UPDATE LOOP
  // ==========================================================================

  update(deltaTime = 0.016) {
    // Called every frame for smooth audio parameter updates
    // Most updates are handled by setTargetAtTime for smooth interpolation
  }

  // ==========================================================================
  // CLEANUP
  // ==========================================================================

  dispose() {
    this.stopEngine();
    this._stopEnvironment();
    this._stopMusic();
    this.stopEngineDamage();
    
    this._spatialSources.forEach((_, id) => this.removeSpatialSource(id));
    
    if (this._tireRollNode) {
      try {
        this._tireRollNode.source.stop();
        this._tireRollNode.source.disconnect();
        this._tireRollNode.filter.disconnect();
        this._tireRollNode.gain.disconnect();
      } catch (e) {}
      this._tireRollNode = null;
    }
    
    this._initialized = false;
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  get isInitialized() { return this._initialized; }
  get isEngineRunning() { return this._isEngineRunning; }
  get currentRPM() { return this._currentRPM; }
  get currentEnvironment() { return this._currentEnvironment; }
  get musicPlaying() { return this._musicPlaying; }
}

// Singleton export
export const audioEngine = new AudioEngine();
