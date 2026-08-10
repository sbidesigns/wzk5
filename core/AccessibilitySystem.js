// core/AccessibilitySystem.js
// Colorblind modes, subtitle system, button hold/toggle, screen shake reduction, HUD scale, high contrast.

const COLORBLIND_FILTERS = {
  none: { hue: 0, sat: 1.0, contrast: 1.0 },
  protanopia: { hue: -10, sat: 0.85, contrast: 1.1 },     // Red-blind
  deuteranopia: { hue: 5, sat: 0.85, contrast: 1.1 },     // Green-blind
  tritanopia: { hue: 15, sat: 0.9, contrast: 1.05 }       // Blue-blind
};

class AccessibilitySystem {
  constructor() {
    this._save = null;
    this._filterEl = null;
  }

  init(saveSystem) {
    this._save = saveSystem;
    // Create CSS filter element
    this._filterEl = document.createElement('style');
    this._filterEl.id = 'accessibility-filters';
    document.head.appendChild(this._filterEl);
    this.applySettings();
  }

  applySettings() {
    if (!this._save) return;
    const settings = this._save.get('settings.accessibility') || {};
    // Colorblind filter
    const cb = settings.colorblind || 'none';
    const filter = COLORBLIND_FILTERS[cb] || COLORBLIND_FILTERS.none;
    this._filterEl.textContent = `
      html { filter: hue-rotate(${filter.hue}deg) saturate(${filter.sat}) contrast(${filter.contrast}); }
      ${settings.highContrast ? 'body { --text-primary: #ffffff; --text-secondary: #e0e0e0; --text-tertiary: #c0c0c0; --bg-base: #000000; }' : ''}
      ${settings.hudScale ? `#race-hud, .hud-corner, .hud-speed { transform: scale(${settings.hudScale}); transform-origin: top left; }` : ''}
    `;
    // Screen shake reduction
    if (settings.screenShakeReduction != null) {
      document.documentElement.style.setProperty('--shake-reduction', settings.screenShakeReduction);
    }
  }

  setColorblind(mode) {
    this._save?.set('settings.accessibility.colorblind', mode);
    this.applySettings();
  }

  setHighContrast(enabled) {
    this._save?.set('settings.accessibility.highContrast', enabled);
    this.applySettings();
  }

  setHUDScale(scale) {
    this._save?.set('settings.accessibility.hudScale', scale);
    this.applySettings();
  }

  setScreenShakeReduction(value) {
    this._save?.set('settings.accessibility.screenShakeReduction', value);
    this.applySettings();
  }

  getSettings() {
    return this._save?.get('settings.accessibility') || {};
  }
}

export const accessibility = new AccessibilitySystem();
export default accessibility;
