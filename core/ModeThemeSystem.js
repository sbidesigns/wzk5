// core/ModeThemeSystem.js
// Mode-specific lobby themes. Changes background, lighting, music, HUD accent.
// Driven by lobbyTheme field in mode manifest.

const THEMES = {
  'ui_cinematic_garage': {
    displayName: 'Ranked',
    background: 'linear-gradient(135deg, #0a0c14 0%, #1a1a2e 100%)',
    accentColor: '#ffd23f',
    musicTrack: 'menu',
    lighting: { ambient: '#1a1a2e', sun: '#ffd23f', intensity: 0.6 }
  },
  'ui_underground_tunnel': {
    displayName: 'Underground',
    background: 'linear-gradient(135deg, #0a0a14 0%, #2e0a3a 100%)',
    accentColor: '#9b2dff',
    musicTrack: 'menu',
    lighting: { ambient: '#1a0a2e', sun: '#9b2dff', intensity: 0.7 }
  },
  'ui_neon_arena': {
    displayName: 'Arena',
    background: 'linear-gradient(135deg, #0a0a14 0%, #0a2e3a 100%)',
    accentColor: '#00e5ff',
    musicTrack: 'menu',
    lighting: { ambient: '#0a1a2e', sun: '#00e5ff', intensity: 0.8 }
  },
  'ui_battle_royale': {
    displayName: 'Battle Royale',
    background: 'linear-gradient(135deg, #0a0a0a 0%, #2e0a0a 100%)',
    accentColor: '#ff3d5a',
    musicTrack: 'menu',
    lighting: { ambient: '#1a0a0a', sun: '#ff3d5a', intensity: 0.5 }
  },
  'ui_party_mode': {
    displayName: 'Party',
    background: 'linear-gradient(135deg, #2e0a3a 0%, #0a2e3a 50%, #2e3a0a 100%)',
    accentColor: '#ff2edf',
    musicTrack: 'menu',
    lighting: { ambient: '#2e0a2e', sun: '#ff2edf', intensity: 0.9 }
  }
};

class ModeThemeSystem {
  constructor() {
    this._currentTheme = null;
    this._currentModeId = null;
  }

  applyTheme(themeId, rootElement) {
    const theme = THEMES[themeId] || THEMES['ui_cinematic_garage'];
    this._currentTheme = themeId;
    if (rootElement) {
      rootElement.style.background = theme.background;
      rootElement.style.setProperty('--mode-accent', theme.accentColor);
      rootElement.dataset.theme = themeId;
    }
    // Emit event for audio crossfade
    EventBus_emit('modetheme:applied', { themeId, theme });
    return theme;
  }

  getTheme(modeId) {
    // Look up mode's lobbyTheme field
    const engine = window.__engine;
    if (!engine) return THEMES['ui_cinematic_garage'];
    const modeEntry = engine.resolver.resolve('modes', modeId);
    const themeId = modeEntry?.entry?.lobbyTheme || 'ui_cinematic_garage';
    return THEMES[themeId] || THEMES['ui_cinematic_garage'];
  }

  getCurrentTheme() { return this._currentTheme; }
  getAllThemes() { return THEMES; }
}

// Local emit to avoid circular import with EventBus
function EventBus_emit(event, data) {
  if (window.__engine?.bus) window.__engine.bus.emit(event, data);
}

export const modeTheme = new ModeThemeSystem();
export default modeTheme;
