// assets/audio/audio-bank.js
// AUDIO BANK DEFINITIONS — Complete sound parameter definitions for all game audio
// Used by AudioEngine for procedural generation and AudioManager for external audio

// ============================================================================
// ENGINE SOUND DEFINITIONS — Per vehicle type with RPM bands
// ============================================================================

export const ENGINE_AUDIO_BANK = {
  // Per-vehicle engine configurations
  vehicles: {
    spectre: {
      id: 'spectre',
      name: 'Spectre GT',
      type: 'sports',
      rpmBands: [
        { id: 'idle',   minRPM: 0.0, maxRPM: 0.2, baseFreq: 120, harmonics: [1, 2, 3, 4], gains: [1, 0.5, 0.2, 0.08] },
        { id: 'low',    minRPM: 0.2, maxRPM: 0.5, baseFreq: 200, harmonics: [1, 2, 3, 4, 5], gains: [1, 0.6, 0.3, 0.12, 0.04] },
        { id: 'mid',    minRPM: 0.5, maxRPM: 0.8, baseFreq: 350, harmonics: [1, 2, 3, 4, 5, 6], gains: [1, 0.7, 0.35, 0.15, 0.06, 0.02] },
        { id: 'high',   minRPM: 0.8, maxRPM: 1.0, baseFreq: 500, harmonics: [1, 2, 3, 4, 5], gains: [1, 0.65, 0.28, 0.1, 0.03] }
      ],
      gearShift: { up: { freqSweep: [300, 550], duration: 0.12 }, down: { freqSweep: [250, 150], duration: 0.15 } },
      turbo: { spoolUp: { startFreq: 800, endFreq: 3000, duration: 0.4, volume: 0.12 },
                release: { endFreq: 600, duration: 0.35, volume: 0.08 } },
      damage: { misfireChance: 0.15, rattleFreq: [50, 90], volume: 0.05 },
      characteristics: { response: 'sharp', exhaustNote: 'crisp' }
    },

    titan: {
      id: 'titan',
      name: 'Titan Muscle',
      type: 'muscle',
      rpmBands: [
        { id: 'idle',   minRPM: 0.0, maxRPM: 0.25, baseFreq: 60, harmonics: [0.5, 1, 1.5, 2], gains: [0.8, 1, 0.6, 0.35] },
        { id: 'low',    minRPM: 0.2, maxRPM: 0.5, baseFreq: 100, harmonics: [0.5, 1, 1.5, 2, 2.5], gains: [0.85, 1, 0.65, 0.4, 0.18] },
        { id: 'mid',    minRPM: 0.45, maxRPM: 0.75, baseFreq: 160, harmonics: [0.5, 1, 1.5, 2, 3], gains: [0.8, 1, 0.6, 0.35, 0.12] },
        { id: 'high',   minRPM: 0.7, maxRPM: 1.0, baseFreq: 240, harmonics: [0.5, 1, 1.5, 2, 3, 4], gains: [0.75, 1, 0.55, 0.28, 0.1, 0.03] }
      ],
      gearShift: { up: { freqSweep: [200, 380], duration: 0.18 }, down: { freqSweep: [180, 100], duration: 0.22 } },
      turbo: null, // No turbo on muscle car
      damage: { misfireChance: 0.12, rattleFreq: [40, 70], volume: 0.08 },
      characteristics: { response: 'heavy', exhaustNote: 'rumble' }
    },

    vixen: {
      id: 'vixen',
      name: 'Vixen Drift',
      type: 'sports',
      rpmBands: [
        { id: 'idle',   minRPM: 0.0, maxRPM: 0.2, baseFreq: 140, harmonics: [1, 2, 3, 4], gains: [1, 0.55, 0.22, 0.08] },
        { id: 'low',    minRPM: 0.2, maxRPM: 0.5, baseFreq: 230, harmonics: [1, 2, 3, 4, 5], gains: [1, 0.62, 0.28, 0.1, 0.03] },
        { id: 'mid',    minRPM: 0.5, maxRPM: 0.8, baseFreq: 400, harmonics: [1, 2, 3, 4, 5, 6], gains: [1, 0.68, 0.32, 0.14, 0.05, 0.01] },
        { id: 'high',   minRPM: 0.8, maxRPM: 1.0, baseFreq: 580, harmonics: [1, 2, 3, 4, 5], gains: [1, 0.6, 0.25, 0.08, 0.02] }
      ],
      gearShift: { up: { freqSweep: [320, 600], duration: 0.1 }, down: { freqSweep: [280, 160], duration: 0.12 } },
      turbo: { spoolUp: { startFreq: 900, endFreq: 3500, duration: 0.35, volume: 0.14 },
                release: { endFreq: 700, duration: 0.3, volume: 0.09 } },
      damage: { misfireChance: 0.18, rattleFreq: [60, 100], volume: 0.04 },
      characteristics: { response: 'sharp', exhaustNote: 'crisp', backfireVolume: 0.12 }
    },

    phantom: {
      id: 'phantom',
      name: 'Phantom Cycle',
      type: 'motorcycle',
      rpmBands: [
        { id: 'idle',   minRPM: 0.0, maxRPM: 0.2, baseFreq: 180, harmonics: [1, 2, 3, 4, 5, 6], gains: [1, 0.72, 0.42, 0.22, 0.1, 0.03] },
        { id: 'low',    minRPM: 0.2, maxRPM: 0.5, baseFreq: 320, harmonics: [1, 2, 3, 4, 5, 6, 7, 8], gains: [1, 0.75, 0.45, 0.25, 0.12, 0.05, 0.02, 0.005] },
        { id: 'mid',    minRPM: 0.5, maxRPM: 0.8, baseFreq: 500, harmonics: [1, 2, 3, 4, 5, 6], gains: [1, 0.68, 0.38, 0.18, 0.07, 0.02] },
        { id: 'high',   minRPM: 0.8, maxRPM: 1.0, baseFreq: 700, harmonics: [1, 2, 3, 4, 5], gains: [1, 0.6, 0.28, 0.1, 0.02] }
      ],
      gearShift: { up: { freqSweep: [400, 750], duration: 0.08 }, down: { freqSweep: [350, 200], duration: 0.1 } },
      turbo: { spoolUp: { startFreq: 1000, endFreq: 4000, duration: 0.3, volume: 0.1 },
                release: { endFreq: 800, duration: 0.25, volume: 0.06 } },
      damage: { misfireChance: 0.2, rattleFreq: [70, 120], volume: 0.03 },
      characteristics: { response: 'very_sharp', exhaustNote: 'scream' }
    },

    raptor: {
      id: 'raptor',
      name: 'Raptor ATV',
      type: 'atv',
      rpmBands: [
        { id: 'idle',   minRPM: 0.0, maxRPM: 0.25, baseFreq: 100, harmonics: [1, 2, 3], gains: [1, 0.5, 0.15] },
        { id: 'low',    minRPM: 0.2, maxRPM: 0.55, baseFreq: 170, harmonics: [1, 2, 3, 4], gains: [1, 0.55, 0.2, 0.06] },
        { id: 'mid',    minRPM: 0.5, maxRPM: 0.8, baseFreq: 280, harmonics: [1, 2, 3, 4], gains: [1, 0.52, 0.18, 0.05] },
        { id: 'high',   minRPM: 0.75, maxRPM: 1.0, baseFreq: 400, harmonics: [1, 2, 3], gains: [1, 0.48, 0.12] }
      ],
      gearShift: { up: { freqSweep: [220, 400], duration: 0.15 }, down: { freqSweep: [200, 120], duration: 0.18 } },
      turbo: null,
      damage: { misfireChance: 0.1, rattleFreq: [55, 95], volume: 0.06 },
      characteristics: { response: 'rough', exhaustNote: 'raw' }
    },

    buggy: {
      id: 'buggy',
      name: 'Dune Buggy',
      type: 'buggy',
      rpmBands: [
        { id: 'idle',   minRPM: 0.0, maxRPM: 0.25, baseFreq: 90, harmonics: [1, 2, 3, 4], gains: [1, 0.58, 0.25, 0.08] },
        { id: 'low',    minRPM: 0.2, maxRPM: 0.55, baseFreq: 155, harmonics: [1, 2, 3, 4, 5], gains: [1, 0.6, 0.28, 0.1, 0.03] },
        { id: 'mid',    minRPM: 0.5, maxRPM: 0.8, baseFreq: 260, harmonics: [1, 2, 3, 4], gains: [1, 0.55, 0.22, 0.06] },
        { id: 'high',   minRPM: 0.75, maxRPM: 1.0, baseFreq: 370, harmonics: [1, 2, 3], gains: [1, 0.48, 0.12] }
      ],
      gearShift: { up: { freqSweep: [200, 380], duration: 0.14 }, down: { freqSweep: [180, 110], duration: 0.17 } },
      turbo: { spoolUp: { startFreq: 700, endFreq: 2500, duration: 0.38, volume: 0.11 },
                release: { endFreq: 500, duration: 0.32, volume: 0.07 } },
      damage: { misfireChance: 0.14, rattleFreq: [50, 85], volume: 0.07 },
      characteristics: { response: 'raw', exhaustNote: 'poppy' }
    },

    bolt: {
      id: 'bolt',
      name: 'Bolt EV',
      type: 'electric',
      rpmBands: [
        // Electric motors have continuous power band - simplified representation
        { id: 'idle',   minRPM: 0.0, maxRPM: 0.3, baseFreq: 80, harmonics: [1, 2, 3, 4, 5], gains: [1, 0.45, 0.18, 0.06, 0.015] },
        { id: 'cruise', minRPM: 0.25, maxRPM: 0.7, baseFreq: 180, harmonics: [1, 2, 3, 4], gains: [1, 0.48, 0.15, 0.04] },
        { id: 'high',   minRPM: 0.65, maxRPM: 1.0, baseFreq: 350, harmonics: [1, 2, 3], gains: [1, 0.4, 0.08] }
      ],
      gearShift: null, // No gears - single speed
      turbo: null,
      regenSound: { freq: 200, volume: 0.04, whine: true },
      damage: { motorWhine: true, volume: 0.06 },
      characteristics: { response: 'instant', note: 'whine' }
    },

    mammoth: {
      id: 'mammoth',
      name: 'Mammoth',
      type: 'monster_truck',
      rpmBands: [
        { id: 'idle',   minRPM: 0.0, maxRPM: 0.3, baseFreq: 45, harmonics: [0.33, 0.5, 1, 1.5, 2, 2.5], gains: [0.7, 0.9, 1, 0.75, 0.5, 0.28] },
        { id: 'low',    minRPM: 0.25, maxRPM: 0.55, baseFreq: 80, harmonics: [0.5, 1, 1.5, 2, 2.5, 3], gains: [0.82, 1, 0.72, 0.48, 0.25, 0.1] },
        { id: 'mid',    minRPM: 0.5, maxRPM: 0.78, baseFreq: 130, harmonics: [0.5, 1, 1.5, 2, 2.5], gains: [0.85, 1, 0.65, 0.38, 0.15] },
        { id: 'high',   minRPM: 0.73, maxRPM: 1.0, baseFreq: 190, harmonics: [0.5, 1, 1.5, 2], gains: [0.88, 1, 0.55, 0.22] }
      ],
      gearShift: { up: { freqSweep: [140, 280], duration: 0.25 }, down: { freqSweep: [130, 70], duration: 0.3 } },
      turbo: { spoolUp: { startFreq: 500, endFreq: 2000, duration: 0.5, volume: 0.18 },
                release: { endFreq: 350, duration: 0.45, volume: 0.12 } },
      damage: { misfireChance: 0.08, rattleFreq: [30, 55], volume: 0.12 },
      characteristics: { response: 'very_heavy', exhaustNote: 'earthquake' }
    },

    sprinter: {
      id: 'sprinter',
      name: 'Sprinter (Foot)',
      type: 'foot',
      // Footsteps and breathing instead of engine
      footstep: {
        run: { interval: 0.35, volume: 0.08, filterFreq: 800 },
        sprint: { interval: 0.25, volume: 0.12, filterFreq: 1000 }
      },
      breathing: {
        normal: { interval: 2.0, volume: 0.04 },
        exerted: { interval: 0.8, volume: 0.08 },
        exhausted: { interval: 0.5, volume: 0.12 }
      }
    },

    wraith: {
      id: 'wraith',
      name: 'Wraith',
      type: 'special',
      rpmBands: [
        { id: 'idle',   minRPM: 0.0, maxRPM: 0.3, baseFreq: 150, harmonics: [1, 2, 3, 4, 5, 6], gains: [1, 0.38, 0.14, 0.05, 0.015, 0.003] },
        { id: 'cruise', minRPM: 0.25, maxRPM: 0.7, baseFreq: 250, harmonics: [1, 2, 3, 4], gains: [1, 0.4, 0.12, 0.03] },
        { id: 'high',   minRPM: 0.65, maxRPM: 1.0, baseFreq: 400, harmonics: [1, 2, 3], gains: [1, 0.32, 0.06] }
      ],
      gearShift: null,
      hoverHum: { baseFreq: 80, volume: 0.06, modulation: { rate: 5, depth: 20 } },
      damage: { flickerModulation: true, depth: 0.3 },
      characteristics: { response: 'smooth', note: 'hum' }
    }
  }
};

// ============================================================================
// ENVIRONMENTAL AUDIO BANK — Per-track biome ambience layers
// ============================================================================

export const ENVIRONMENT_AUDIO_BANK = {
  biomes: {
    desert: {
      id: 'desert',
      name: 'Desert Wastes',
      layers: [
        { name: 'wind', type: 'noise', color: 'brown', volume: 0.15, filterFreq: 400, filterQ: 0.5, lfoRate: 0.1, lfoDepth: 0.4 },
        { name: 'sand_particles', type: 'noise', color: 'white', volume: 0.04, filterFreq: 8000, filterQ: 1 },
        { name: 'distant_dune', type: 'tone', waveform: 'sine', freq: 80, volume: 0.02, detune: 5 }
      ],
      reverb: { decay: 2.5, preDelay: 0.02 },
      temperatureModulation: { hot: { highPass: 2000, amount: 0.1 } }
    },

    alpine: {
      id: 'alpine',
      name: 'Alpine Peaks',
      layers: [
        { name: 'mountain_wind', type: 'noise', color: 'white', volume: 0.18, filterFreq: 1200, filterQ: 0.3, lfoRate: 0.15, lfoDepth: 0.5 },
        { name: 'pine_rustle', type: 'noise', color: 'pink', volume: 0.06, filterFreq: 3000, filterQ: 0.8 },
        { name: 'avalanche_rumble', type: 'tone', waveform: 'sine', freq: 40, volume: 0.03, randomTrigger: { chance: 0.002, burstLength: 2 } }
      ],
      reverb: { decay: 4.0, preDelay: 0.04 },
      temperatureModulation: { cold: { lowShelfBoost: 100, amount: 0.15 } }
    },

    industrial: {
      id: 'industrial',
      name: 'Industrial Zone',
      layers: [
        { name: 'machinery_hum', type: 'noise', color: 'brown', volume: 0.12, filterFreq: 200, filterQ: 1 },
        { name: 'steam_hiss', type: 'noise', color: 'white', volume: 0.05, filterFreq: 5000, filterQ: 0.5, randomTrigger: { chance: 0.03, burstLength: 0.5 } },
        { name: 'transformer_buzz', type: 'tone', waveform: 'sawtooth', freq: 60, volume: 0.06, harmonics: [1, 2, 3, 4], harmonicGains: [1, 0.5, 0.2, 0.08] },
        { name: 'metal_clank', type: 'random_tone', minFreq: 80, maxFreq: 200, volume: 0.03, intervalRange: [2000, 5000] }
      ],
      reverb: { decay: 3.5, preDelay: 0.01 }
    },

    neon_grid: {
      id: 'neon_grid',
      name: 'Neon Grid',
      layers: [
        { name: 'electronic_hum', type: 'noise', color: 'pink', volume: 0.08, filterFreq: 2000, filterQ: 0.5 },
        { name: 'data_processing', type: 'tone', waveform: 'square', freq: 120, volume: 0.04, pulseWidth: 0.1 },
        { name: 'bass_pulse', type: 'tone', waveform: 'sine', freq: 60, volume: 0.02, lfoRate: 0.5, lfoDepth: 0.3 },
        { name: 'ambient_arpeggio', type: 'arpeggio', notes: [261.63, 329.63, 392.00, 523.25], tempo: 0.15, volume: 0.015, waveform: 'triangle' }
      ],
      reverb: { decay: 2.0, preDelay: 0.01 },
      digitalArtifacts: { bitCrush: 0.05, sampleRateModulation: 0.02 }
    },

    volcanic: {
      id: 'volcanic',
      name: 'Volcanic Region',
      layers: [
        { name: 'lava_bubble', type: 'noise', color: 'brown', volume: 0.2, filterFreq: 150, filterQ: 0.8, modulationType: 'random_burst', burstRange: [0.5, 2] },
        { name: 'rock_crack', type: 'noise', color: 'white', volume: 0.08, filterFreq: 6000, filterQ: 2, randomTrigger: { chance: 0.015, burstLength: 0.2 } },
        { name: 'deep_rumble', type: 'tone', waveform: 'sine', freq: 35, volume: 0.08, subHarmonics: true },
        { name: 'eruption_distant', type: 'random_impulse', volume: 0.06, chance: 0.008, decayTime: 4, filterFreq: 200 }
      ],
      reverb: { decay: 5.0, preDelay: 0.06 },
      heatDistortion: { pitchWobble: 0.03, volumeFlutter: 0.05 }
    },

    underwater: {
      id: 'underwater',
      name: 'Underwater Depths',
      layers: [
        { name: 'water_flow', type: 'noise', color: 'custom', volume: 0.18, filterFreq: 800, filterQ: 0.5, lowPassCutoff: 2000 },
        { name: 'bubbles', type: 'noise', color: 'pink', volume: 0.06, filterFreq: 2500, filterQ: 1.5, bubbleRise: true },
        { name: 'whale_call', type: 'tone', waveform: 'sine', freq: 50, volume: 0.04, glideRange: [40, 80], glideSpeed: 0.3 },
        { name: 'pressure_change', type: 'filter_sweep', startFreq: 200, endFreq: 800, rate: 0.05, volume: 0.03 }
      ],
      reverb: { decay: 6.0, preDelay: 0.08, density: 0.8 },
      underwaterEffect: { lowPass: 2000, muffleAmount: 0.6, pitchDown: 0.98 }
    },

    space: {
      id: 'space',
      name: 'Space Station',
      layers: [
        { name: 'ship_hum', type: 'noise', color: 'brown', volume: 0.06, filterFreq: 300, filterQ: 1 },
        { name: 'radio_static', type: 'noise', color: 'white', volume: 0.03, filterFreq: 8000, crackleDensity: 0.1 },
        { name: 'life_support', type: 'tone', waveform: 'sine', freq: 100, volume: 0.02, steady: true },
        { name: 'nav_computer', type: 'beep_sequence', pattern: [1,0,1,0,0,1,0,1], interval: 0.8, freq: 880, volume: 0.015 }
      ],
      reverb: { decay: 1.0, preDelay: 0, dryWet: 0.2 },
      vacuumEffect: { muffleExternal: true, internalOnly: true }
    },

    coastal: {
      id: 'coastal',
      name: 'Coastal Highway',
      layers: [
        { name: 'waves', type: 'noise', color: 'pink', volume: 0.16, filterFreq: 600, filterQ: 0.4, wavePattern: { period: 4, crashDuration: 0.8 } },
        { name: 'seagulls', type: 'noise', color: 'white', volume: 0.04, filterFreq: 4000, filterQ: 2, randomCall: { chance: 0.02, callVariation: 3 } },
        { name: 'buoy_bell', type: 'tone', waveform: 'sine', freq: 200, volume: 0.025, interval: 3, resonance: 8 },
        { name: 'gull_calls', type: 'random_tone', minFreq: 800, maxFreq: 2000, volume: 0.015, intervalRange: [3000, 8000] }
      ],
      reverb: { decay: 3.0, preDelay: 0.02 }
    }
  }
};

// ============================================================================
// MUSIC AUDIO BANK — Context-based music parameters
// ============================================================================

export const MUSIC_AUDIO_BANK = {
  contexts: {
    menu: {
      id: 'menu',
      name: 'Menu Music',
      style: 'ambient_electronic',
      tempo: 85,
      key: 'C minor',
      variations: [
        { id: 'chill', mood: 'relaxed', intensity: 0.3, layers: ['pad', 'arpeggio', 'sub_bass'] },
        { id: 'energetic', mood: 'excited', intensity: 0.5, layers: ['pad', 'arpeggio', 'sub_bass', 'light_percussion'] },
        { id: 'mystery', mood: 'intriguing', intensity: 0.4, layers: ['pad', 'texture', 'sub_bass'] }
      ],
      layerDefinitions: {
        pad: { waveform: 'sine', octave: [-1, 0], volume: 0.04, attack: 0.8, release: 1.5 },
        arpeggio: { notes: [261.63, 329.63, 392.00, 523.25], tempo: 0.15, volume: 0.025, waveform: 'triangle' },
        sub_bass: { freq: 65.41, volume: 0.08, waveform: 'sine' },
        texture: { type: 'filtered_noise', filterFreq: 2000, volume: 0.015 },
        light_percussion: { pattern: 'hihat_eighths', volume: 0.02 }
      }
    },

    race: {
      id: 'race',
      name: 'Race Music',
      style: 'high_energy_electronic',
      tempoRange: [128, 175],
      dynamicIntensity: true,
      key: 'varies',
      intensityLayers: {
        calm: { threshold: 0.3, layers: ['kick', 'bass', 'pad'], bpmModifier: 0.9 },
        engaged: { threshold: 0.6, layers: ['kick', 'bass', 'hihat', 'lead_synth'], bpmModifier: 1.0 },
        intense: { threshold: 0.85, layers: ['kick', 'bass', 'hihat', 'lead_synth', 'risers', 'extra_perc'], bpmModifier: 1.1 },
        epic: { threshold: 1.0, layers: ['kick', 'bass', 'hihat', 'lead_synth', 'risers', 'extra_perc', 'orchral_hits'], bpmModifier: 1.15 }
      },
      layerDefinitions: {
        kick: { pattern: 'four_on_floor', volume: 0.15, attack: 0.001, decay: 0.15 },
        bass: { waveform: 'sawtooth', freq: 55, volume: 0.08, filterEnv: true },
        hihat: { pattern: 'sixteenths', volume: 0.025, metal: 0.7 },
        lead_synth: { waveform: 'square', volume: 0.04, filterFreq: 2000, playMode: 'follow_chord' },
        risers: { type: 'noise_rise', duration: 4, trigger: 'phrase_end', volume: 0.06 },
        extra_perc: { sounds: ['clap', 'snare', 'tom'], volume: 0.03 },
        orchral_hits: { type: 'sampled', volume: 0.08, trigger: 'beat_one' }
      },
      positionBasedMixing: {
        firstPlace: { extraLayers: ['orchral_hits'], intensityBoost: 0.15 },
        lastPlace: { removeLayers: ['lead_synth'], intensityReduction: 0.2 },
        overtaking: { riserTrigger: true, duration: 2 },
        beingOvertaken: { tensionLayer: true }
      }
    },

    results: {
      id: 'results',
      name: 'Results Music',
      style: 'fanfare',
      placementFanfares: {
        1: { name: 'victory_epic', notes: [523.25, 659.25, 783.99, 1046.5, 1046.5, 783.99, 1046.5], durations: [0.2, 0.2, 0.2, 0.4, 0.2, 0.2, 0.6], volume: 0.14, style: 'orchestral' },
        2: { name: 'second_place', notes: [440, 554.37, 659.25, 783.99], durations: [0.18, 0.18, 0.18, 0.4], volume: 0.11, style: 'bright' },
        3: { name: 'third_place', notes: [392, 493.88, 587.33, 659.25], durations: [0.16, 0.16, 0.16, 0.35], volume: 0.09, style: 'warm' },
        4: { name: 'participation', notes: [349.23, 440, 523.25], durations: [0.15, 0.15, 0.3], volume: 0.07, style: 'simple' }
      }
    },

    garage: {
      id: 'garage',
      name: 'Garage Music',
      style: 'mechanical_ambient',
      tempo: 70,
      layers: ['mechanical_hum', 'tool_sounds', 'ambient_pad'],
      layerDefinitions: {
        mechanical_hum: { type: 'drone', freq: 60, volume: 0.04, modulation: { type: 'slow_wobble', rate: 0.1, depth: 10 } },
        tool_sounds: { type: 'random_metallic', volume: 0.015, intervalRange: [3000, 8000] },
        ambient_pad: { waveform: 'sine', chord: 'minor', volume: 0.03, sparse: true }
      }
    },

    lobby: {
      id: 'lobby',
      name: 'Lobby Music',
      style: 'social_ambient',
      tempo: 95,
      layers: ['gentle_beat', 'soft_pad', 'ambience'],
      layerDefinitions: {
        gentle_beat: { kickVolume: 0.04, hihatVolume: 0.015, pattern: 'relaxed' },
        soft_pad: { waveform: 'sine', volume: 0.025, slowEvolution: true },
        ambience: { type: 'crowd_murmur', volume: 0.02, density: 0.3 }
      }
    }
  },

  stingers: {
    countdown: { name: 'Countdown', sounds: [{ freq: 440, duration: 0.2 }, { freq: 440, duration: 0.2 }, { freq: 440, duration: 0.2 }, { freq: 880, duration: 0.4 }], volumes: [0.12, 0.12, 0.12, 0.18] },
    go: { name: 'GO!', sounds: [{ freq: 400, duration: 0.15 }, { freq: 600, duration: 0.15 }, { freq: 800, duration: 0.25 }], volumes: [0.15, 0.15, 0.2] },
    overtake: { name: 'Overtake', type: 'rise', startFreq: 400, endFreq: 800, duration: 0.15, volume: 0.1 },
    overtaken: { name: 'Overtaken', type: 'fall', startFreq: 600, endFreq: 300, duration: 0.2, volume: 0.08 },
    crash_major: { name: 'Major Crash', impactSound: 'heavy', debrisSound: true, duration: 1.5, volume: 0.25 },
    crash_minor: { name: 'Minor Crash', impactSound: 'medium', duration: 0.5, volume: 0.15 },
    pickup_item: { name: 'Item Pickup', arpeggio: [523.25, 659.25, 783.99], duration: 0.1, volume: 0.1 },
    boost_start: { name: 'Boost Start', sweep: { start: 300, end: 1500, duration: 0.3 }, volume: 0.12 },
    boost_end: { name: 'Boost End', sweep: { start: 1200, end: 400, duration: 0.2 }, volume: 0.08 },
    lap_complete: { name: 'Lap Complete', chime: [523.25, 659.25, 783.99], durations: [0.1, 0.1, 0.2], volume: 0.11 },
    final_lap: { name: 'Final Lap', fanfare: [440, 554.37, 659.25, 880], durations: [0.12, 0.12, 0.12, 0.35], volume: 0.13 },
    elimination: { name: 'Eliminated', descent: [400, 300, 200, 100], durations: [0.15, 0.15, 0.2, 0.4], volume: 0.12 },
    new_record: { name: 'New Record', celebration: 'epic', volume: 0.15 }
  }
};

// ============================================================================
// UI SOUND BANK — Complete UI interaction sounds
// ============================================================================

export const UI_AUDIO_BANK = {
  navigation: {
    hover: { freq: 800, duration: 0.05, waveform: 'sine', volume: 0.08, attack: 0.005, release: 0.04 },
    click: { freq: 600, duration: 0.08, waveform: 'square', volume: 0.1, attack: 0.001, release: 0.07 },
    confirm: { notes: [{ freq: 523.25, duration: 0.08 }, { freq: 659.25, duration: 0.1 }], volume: 0.1 },
    back: { freq: 400, duration: 0.1, waveform: 'sawtooth', volume: 0.08, attack: 0.002, release: 0.08 },
    navigate: { freq: 500, duration: 0.04, waveform: 'sine', volume: 0.06 },
    tab_switch: { freq: 700, duration: 0.06, waveform: 'triangle', volume: 0.07 },
    scroll: { freq: 450, duration: 0.03, waveform: 'sine', volume: 0.04, pitchVariation: 0.1 },
    drag_start: { freq: 550, duration: 0.05, waveform: 'sine', volume: 0.06 },
    drag_end: { freq: 650, duration: 0.06, waveform: 'sine', volume: 0.07 }
  },

  notifications: {
    achievement: { 
      name: 'Achievement Unlocked',
      notes: [{ freq: 523.25, duration: 0.1 }, { freq: 659.25, duration: 0.1 }, { freq: 783.99, duration: 0.1 }, { freq: 1046.5, duration: 0.25 }],
      volume: 0.12,
      sparkle: true
    },
    level_up: {
      name: 'Level Up',
      notes: [{ freq: 400, duration: 0.1 }, { freq: 500, duration: 0.1 }, { freq: 600, duration: 0.1 }, { freq: 800, duration: 0.2 }],
      volume: 0.11,
      rise: true
    },
    friend_online: { freq: 900, duration: 0.15, waveform: 'sine', volume: 0.07, chime: true },
    friend_offline: { freq: 500, duration: 0.2, waveform: 'sine', volume: 0.05, fade: true },
    message_received: { notes: [{ freq: 700, duration: 0.06 }, { freq: 850, duration: 0.08 }], volume: 0.06 },
    invite_received: { notes: [{ freq: 600, duration: 0.08 }, { freq: 750, duration: 0.08 }, { freq: 900, duration: 0.12 }], volume: 0.08, urgent: false },
    invite_urgent: { notes: [{ freq: 600, duration: 0.08 }, { freq: 750, duration: 0.08 }, { freq: 900, duration: 0.12 }], volume: 0.1, urgent: true, repeat: 2 },
    party_join: { notes: [{ freq: 523.25, duration: 0.08 }, { freq: 659.25, duration: 0.08 }, { freq: 783.99, duration: 0.15 }], volume: 0.1 },
    party_leave: { freq: 400, duration: 0.2, waveform: 'sine', volume: 0.05, sad: true },
    new_highscore: { celebration: 'major', volume: 0.14 },
    daily_bonus: { coins: 5, soundPerCoin: { freq: 1200, duration: 0.04, volume: 0.05 }, totalVolume: 0.1 }
  },

  warnings: {
    error: { notes: [{ freq: 200, duration: 0.15 }, { freq: 150, duration: 0.2 }], waveform: 'square', volume: 0.1, harsh: true },
    warning: { freq: 300, duration: 0.2, waveform: 'square', volume: 0.08, repeat: 3, interval: 0.25 },
    critical_error: { notes: [{ freq: 180, duration: 0.2 }, { freq: 140, duration: 0.2 }, { freq: 100, duration: 0.3 }], waveform: 'square', volume: 0.12 },
    connection_lost: { freq: 150, duration: 0.4, waveform: 'sawtooth', volume: 0.1, descending: true },
    connection_restored: { notes: [{ freq: 400, duration: 0.1 }, { freq: 600, duration: 0.1 }, { freq: 800, duration: 0.15 }], volume: 0.08, hopeful: true },
    low_health: { freq: 200, duration: 0.15, waveform: 'square', volume: 0.09, repeat: 2, urgency: 'high' },
    low_fuel: { freq: 250, duration: 0.18, waveform: 'sawtooth', volume: 0.07, repeat: 2 },
    timeout_warning: { freq: 350, duration: 0.12, waveform: 'square', volume: 0.08, accelerating: true },
    invalid_action: { freq: 180, duration: 0.15, waveform: 'sawtooth', volume: 0.07, buzz: true }
  },

  store: {
    purchase_success: { notes: [{ freq: 600, duration: 0.06 }, { freq: 800, duration: 0.06 }, { freq: 1000, duration: 0.15 }], volume: 0.1, satisfying: true },
    purchase_failed: { notes: [{ freq: 300, duration: 0.15 }, { freq: 200, duration: 0.2 }], volume: 0.09 },
    insufficient_funds: { notes: [{ freq: 300, duration: 0.15 }, { freq: 200, duration: 0.2 }], waveform: 'square', volume: 0.09 },
    item_reveal: { 
      name: 'Item Reveal',
      notes: [{ freq: 400, duration: 0.05 }, { freq: 600, duration: 0.05 }, { freq: 800, duration: 0.05 }, { freq: 1000, duration: 0.05 }, { freq: 1200, duration: 0.2 }],
      volume: 0.1,
      buildUp: true
    },
    item_reveal_rare: { notes: [{ freq: 400, duration: 0.06 }, { freq: 600, duration: 0.06 }, { freq: 800, duration: 0.06 }, { freq: 1000, duration: 0.06 }, { freq: 1200, duration: 0.06 }, { freq: 1500, duration: 0.25 }], volume: 0.12, sparkles: true },
    item_reveal_legendary: { celebration: 'epic', volume: 0.15, screenShake: true },
    store_open: { notes: [{ freq: 500, duration: 0.06 }, { freq: 700, duration: 0.1 }], volume: 0.08, whoosh: true },
    store_close: { notes: [{ freq: 700, duration: 0.06 }, { freq: 500, duration: 0.1 }], volume: 0.08 },
    cart_add: { freq: 750, duration: 0.08, waveform: 'sine', volume: 0.07, pop: true },
    cart_remove: { freq: 450, duration: 0.1, waveform: 'sine', volume: 0.06 },
    equip_item: { freq: 850, duration: 0.1, waveform: 'sine', volume: 0.07, click: true },
    currency_earned: { freq: 1100, duration: 0.08, waveform: 'sine', volume: 0.06, coin: true }
  },

  social: {
    message_send: { freq: 650, duration: 0.06, waveform: 'sine', volume: 0.05 },
    emote_play: { freq: 500, duration: 0.1, waveform: 'triangle', volume: 0.06 },
    report_sent: { notes: [{ freq: 500, duration: 0.08 }, { freq: 600, duration: 0.1 }], volume: 0.06 },
    block_confirm: { freq: 300, duration: 0.15, waveform: 'sine', volume: 0.05, muted: true },
    mute_toggle_on: { freq: 400, duration: 0.08, waveform: 'sine', volume: 0.04 },
    mute_toggle_off: { freq: 400, duration: 0.08, waveform: 'sine', volume: 0.04, lowerPitch: true },
    voice_chat_start: { freq: 800, duration: 0.05, waveform: 'sine', volume: 0.04, subtle: true },
    voice_chat_end: { freq: 800, duration: 0.05, waveform: 'sine', volume: 0.04, subtle: true, fadeOut: true }
  }
};

// ============================================================================
// WEAPON/ITEM SOUND BANK — Item usage sounds
// ============================================================================

export const ITEM_AUDIO_BANK = {
  items: {
    missile: {
      name: 'Missile',
      lockOn: { beepFreq: 800, beepInterval: 0.15, acceleration: true, volume: 0.06 },
      launch: { noiseBurst: 0.15, rocketSound: { freq: 150, duration: 0.3, volume: 0.12 }, whoosh: true },
      flight: { rocketHum: { freq: 80, volume: 0.04 } },
      impact: { explosion: 'medium', debris: true, volume: 0.2 }
    },
    shield: {
      name: 'Shield',
      activate: { chargeUp: { freq: 200, endFreq: 800, duration: 0.3, volume: 0.1 }, shimmer: true },
      active: { hum: { freq: 120, volume: 0.03 } },
      hit: { deflect: { freq: 800, duration: 0.08, volume: 0.08 }, flash: true },
      deactivate: { powerDown: { freq: 600, endFreq: 100, duration: 0.2, volume: 0.06 } },
      break: { shatter: { noiseBurst: 0.1, glassFreq: 3000, volume: 0.12 } }
    },
    boost: {
      name: 'Boost',
      activate: { whoosh: { startFreq: 300, endFreq: 2000, duration: 0.2, volume: 0.14 }, rumble: true },
      active: { engineStrain: { volumeMultiplier: 1.5 }, windRush: { volume: 0.08 } },
      miniTurbo: { chargeComplete: { tripleBeep: [600, 800, 1000], volume: 0.1 }, release: { superWhoosh: true, volume: 0.18 } },
      deactivate: { fadeOut: 0.15 }
    },
    health: {
      name: 'Health Pickup',
      collect: { chime: { notes: [400, 500, 600], durations: [0.08, 0.08, 0.12], volume: 0.08 }, healing: true }
    },
    coin: {
      name: 'Coin',
      collect: { freq: 1200, duration: 0.06, waveform: 'sine', volume: 0.06, bright: true }
    },
    banana: {
      name: 'Banana Peel',
      drop: { softThud: { volume: 0.04 } },
      slip: { squeak: { freq: 800, duration: 0.25, volume: 0.1 }, comedySpin: true }
    },
    shell: {
      name: 'Shell',
      green: { throw: { whoosh: { volume: 0.06 } }, bounce: { thud: { volume: 0.08, bounceDecay: 0.6 } } },
      red: { lockOn: true, homingSound: { beep: { freq: 600, volume: 0.05 } } },
      blue: { shockwave: { boom: { volume: 0.18 }, screenFlash: true } }
    },
    bomb: {
      name: 'Bomb',
      tick: { ticking: { freq: 800, interval: 0.5, accelerating: true, volume: 0.06 }, tension: true },
      explode: { explosion: 'large', debris: true, screenShake: true, volume: 0.28 },
      fuse: { sizzle: { noise: true, volume: 0.04 } }
    },
    lightning: {
      name: 'Lightning',
      charge: { buildUp: { crackle: true, volume: 0.06 } },
      strike: { thunder: { boom: { volume: 0.2 }, rumble: { duration: 1, volume: 0.12 } }, zap: { freq: 2000, duration: 0.1, volume: 0.1 } },
      chain: { arcSound: { freq: 1500, duration: 0.05, volume: 0.06 } }
    },
    star: {
      name: 'Star Power',
      activate: { fanfare: 'epic', invincibilityJingle: { notes: [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568], tempo: 0.08, volume: 0.12 } },
      active: { musicChange: 'invincible_theme', sparkleLoop: { freq: 2000, volume: 0.03 } },
      deactivate: { fadeOut: { duration: 1, sad: true } }
    }
  }
};

// ============================================================================
// VOICE/ANNOUNCER BANK — Announcer phrases
// ============================================================================

export const ANNOUNCER_AUDIO_BANK = {
  phrases: {
    // Race start sequence
    countdown_3: { text: 'Three!', tonePattern: [440], durations: [0.2], volume: 0.13, pace: 'steady' },
    countdown_2: { text: 'Two!', tonePattern: [440], durations: [0.2], volume: 0.13, pace: 'steady' },
    countdown_1: { text: 'One!', tonePattern: [440], durations: [0.35], volume: 0.15, pace: 'dramatic' },
    go: { text: 'GO!', tonePattern: [400, 600, 800], durations: [0.15, 0.15, 0.25], volume: 0.16, pace: 'explosive' },
    
    // Position announcements
    first_place: { text: 'First Place!', tonePattern: [523.25, 659.25, 783.99, 1046.5], durations: [0.12, 0.12, 0.12, 0.3], volume: 0.14, excitement: 'maximum' },
    second_place: { text: 'Second Place!', tonePattern: [440, 554.37, 659.25], durations: [0.1, 0.1, 0.25], volume: 0.11, excitement: 'high' },
    third_place: { text: 'Third Place!', tonePattern: [392, 493.88, 587.33], durations: [0.1, 0.1, 0.22], volume: 0.1, excitement: 'good' },
    last_place: { text: 'In Last!', tonePattern: [300, 250], durations: [0.15, 0.2], volume: 0.08, excitement: 'sympathetic' },
    
    // Overtaking
    overtake: { text: 'Overtaken!', tonePattern: [600, 800], durations: [0.08, 0.12], volume: 0.1, excitement: 'tense' },
    got_overtaken: { text: 'Passed!', tonePattern: [500, 350], durations: [0.1, 0.15], volume: 0.09, excitement: 'disappointing' },
    
    // Race events
    lap_complete: { text: 'Lap Complete!', tonePattern: [523.25, 659.25, 783.99], durations: [0.1, 0.1, 0.2], volume: 0.12 },
    final_lap: { text: 'Final Lap!', tonePattern: [440, 554.37, 659.25, 880], durations: [0.12, 0.12, 0.12, 0.35], volume: 0.14, excitement: 'dramatic' },
    half_way: { text: 'Half Way!', tonePattern: [440, 523.25], durations: [0.12, 0.18], volume: 0.1 },
    
    // Item events
    item_pickup: { text: 'Got an Item!', tonePattern: [600, 800], durations: [0.06, 0.08], volume: 0.08 },
    item_ready: { text: 'Item Ready!', tonePattern: [700, 900], durations: [0.05, 0.07], volume: 0.07 },
    
    // Elimination/Derby events
    eliminated: { text: 'Eliminated!', tonePattern: [400, 300, 200, 100], durations: [0.15, 0.15, 0.2, 0.4], volume: 0.12, excitement: 'tragic' },
    knockout: { text: 'Knockout!', tonePattern: [350, 250, 150], durations: [0.12, 0.15, 0.3], volume: 0.11 },
    survivor: { text: 'Last One Standing!', tonePattern: [523.25, 659.25, 783.99, 1046.5, 1046.5], durations: [0.15, 0.15, 0.15, 0.2, 0.4], volume: 0.15, excitement: 'epic' },
    
    // Warnings
    warning: { text: 'Warning!', tonePattern: [300], durations: [0.2], volume: 0.1, repeat: 2, urgency: 'high' },
    danger: { text: 'Danger!', tonePattern: [250, 200], durations: [0.15, 0.2], volume: 0.11, urgency: 'critical' },
    
    // Special events
    new_record: { text: 'New Record!', tonePattern: [523.25, 659.25, 783.99, 1046.5, 1318.5], durations: [0.1, 0.1, 0.1, 0.1, 0.4], volume: 0.15, excitement: 'celebration' },
    perfect_lap: { text: 'Perfect Lap!', tonePattern: [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568], durations: [0.08, 0.08, 0.08, 0.08, 0.08, 0.5], volume: 0.16, excitement: 'maximum' },
    combo_x2: { text: 'Double!', tonePattern: [600, 900], durations: [0.08, 0.12], volume: 0.1 },
    combo_x3: { text: 'Triple!', tonePattern: [600, 800, 1000], durations: [0.07, 0.07, 0.15], volume: 0.11 },
    combo_x4_plus: { text: 'Amazing!', tonePattern: [600, 800, 1000, 1200], durations: [0.06, 0.06, 0.06, 0.2], volume: 0.12 },
    
    // Game state
    game_over: { text: 'Game Over!', tonePattern: [400, 350, 300, 250], durations: [0.2, 0.2, 0.2, 0.5], volume: 0.11, excitement: 'final' },
    time_up: { text: "Time's Up!", tonePattern: [450, 380, 300], durations: [0.15, 0.15, 0.35], volume: 0.1 },
    race_complete: { text: 'Race Complete!', tonePattern: [523.25, 659.25, 783.99], durations: [0.12, 0.12, 0.3], volume: 0.12 }
  },

  personalityPresets: {
    energetic: { pitchOffset: 2, speedMultiplier: 1.1, energy: 'high' },
    calm: { pitchOffset: 0, speedMultiplier: 0.9, energy: 'low' },
    dramatic: { pitchOffset: -1, speedMultiplier: 0.85, pauses: true },
    robotic: { pitchOffset: 0, monotone: true, effects: ['slight_echo'] },
    commentator: { pitchOffset: 1, conversational: true, reactions: true }
  }
};

// ============================================================================
// SURFACE/SFX BANK — Tire and surface interaction sounds
// ============================================================================

export const SFX_AUDIO_BANK = {
  surfaces: {
    asphalt: {
      name: 'Asphalt',
      rollNoise: { type: 'white', volume: 0.3, filterFreq: 800, filterQ: 0.5 },
      skid: { type: 'white', volume: 0.5, filterFreq: 4000, filterQ: 2, character: 'screech' },
      bump: { type: 'thud', volume: 0.15, filterFreq: 200 },
      splash: null
    },
    dirt: {
      name: 'Dirt/Gravel',
      rollNoise: { type: 'brown', volume: 0.45, filterFreq: 600, filterQ: 0.8, gravelTexture: true },
      skid: { type: 'brown', volume: 0.55, filterFreq: 1500, filterQ: 1, character: 'gravel' },
      bump: { type: 'thud', volume: 0.2, filterFreq: 150, dustPuff: true },
      splash: null
    },
    grass: {
      name: 'Grass',
      rollNoise: { type: 'brown', volume: 0.25, filterFreq: 400, filterQ: 1 },
      skid: { type: 'brown', volume: 0.3, filterFreq: 1000, filterQ: 0.8, character: 'rustle' },
      bump: { type: 'soft', volume: 0.08 },
      splash: null
    },
    sand: {
      name: 'Sand',
      rollNoise: { type: 'pink', volume: 0.38, filterFreq: 500, filterQ: 0.6 },
      skid: { type: 'pink', volume: 0.4, filterFreq: 1200, filterQ: 0.5, character: 'muffled' },
      bump: { type: 'muffled_thud', volume: 0.12 },
      spray: { sprayParticles: true, volume: 0.06 }
    },
    ice: {
      name: 'Ice',
      rollNoise: { type: 'white', volume: 0.15, filterFreq: 3000, filterQ: 1, shimmer: true },
      skid: { type: 'white', volume: 0.35, filterFreq: 6000, filterQ: 1.5, character: 'crunch' },
      bump: { type: 'crack', volume: 0.2, glassFreq: 2500 },
      splash: null
    },
    metal: {
      name: 'Metal Grid',
      rollNoise: { type: 'metallic', volume: 0.5, filterFreq: 1000, filterQ: 3, resonant: true, clangFreq: 800 },
      skid: { type: 'metallic', volume: 0.55, filterFreq: 2000, filterQ: 4, character: 'clang' },
      bump: { type: 'clang', volume: 0.3, ringDecay: 0.8 },
      splash: null
    },
    water: {
      name: 'Water',
      rollNoise: { type: 'splash', volume: 0.5, splashIntensity: 'high' },
      skid: { type: 'splash', volume: 0.6, aquaplane: true },
      bump: { type: 'splash', volume: 0.4 },
      splash: { largeSplash: true, droplets: true, volume: 0.5 }
    },
    mud: {
      name: 'Mud',
      rollNoise: { type: 'brown', volume: 0.42, filterFreq: 350, filterQ: 0.7, sticky: true },
      skid: { type: 'brown', volume: 0.48, filterFreq: 900, filterQ: 0.6, character: 'squish' },
      bump: { type: 'squelch', volume: 0.25 },
      splatter: { mudSplatter: true, volume: 0.15 }
    }
  },

  collisions: {
    light: { impactVolume: 0.15, thudFreq: 150, debris: false, screenShake: 0 },
    medium: { impactVolume: 0.3, thudFreq: 100, debris: true, screenShake: 0.3 },
    heavy: { impactVolume: 0.5, thudFreq: 60, debris: true, screenShake: 0.6, rumble: true },
    catastrophic: { impactVolume: 0.7, thudFreq: 40, debris: true, screenShake: 1.0, rumble: true, longDecay: true },
    vehicle_vs_vehicle: { modifier: 1.3, crunchFactor: 0.2 },
    vehicle_vs_wall: { modifier: 1.5, crunchFactor: 0.3 },
    vehicle_vs_ground: { modifier: 0.8, thudOnly: true }
  },

  ambient: {
    crowd_cheer: { type: 'noise', volume: 0.15, density: 'high', reactionDelay: 0.3 },
    crowd_gasp: { type: 'noise', volume: 0.1, density: 'medium', sudden: true },
    rain: { type: 'noise', color: 'white', volume: 0.12, filterFreq: 4000, patter: true },
    thunder: { type: 'impulse', volume: 0.3, rumbleDuration: 2, crack: true },
    wind_gust: { type: 'noise', color: 'pink', volume: 0.2, gustDuration: 1, variation: 0.5 }
  }
};

// ============================================================================
// COMPLETE EXPORTED AUDIO BANK
// ============================================================================

export const AUDIO_BANK = {
  engines: ENGINE_AUDIO_BANK,
  environment: ENVIRONMENT_AUDIO_BANK,
  music: MUSIC_AUDIO_BANK,
  ui: UI_AUDIO_BANK,
  items: ITEM_AUDIO_BANK,
  announcer: ANNOUNCER_AUDIO_BANK,
  surfaces: SFX_AUDIO_BANK
};

export default AUDIO_BANK;
