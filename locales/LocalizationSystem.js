// LocalizationSystem.js - Internationalization support
// Features: dynamic locale loading, language detection, fallback chain,
// string interpolation, pluralization, RTL support, font fallback

// Supported locales
const SUPPORTED_LOCALES = [
  'en',        // English (default)
  'es',        // Spanish
  'fr',        // French
  'de',        // German
  'ja',        // Japanese
  'zh-cn',     // Simplified Chinese
  'ko',        // Korean
  'pt-br',     // Brazilian Portuguese
  'ru'         // Russian
];

// RTL locales
const RTL_LOCALES = ['ar', 'he', 'fa', 'ur'];

// Font mappings for different language groups
const FONT_MAPPINGS = {
  default: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  ja: "'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif",
  zh-cn: "'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif",
  ko: "'Noto Sans KR', 'Malgun Gothic', sans-serif",
  ar: "'Noto Sans Arabic', 'Tahoma', sans-serif",
  th: "'Noto Sans Thai', sans-serif"
};

class LocalizationSystem {
  constructor(options = {}) {
    this._options = {
      defaultLocale: options.defaultLocale || 'en',
      fallbackLocale: options.fallbackLocale || 'en',
      localePath: options.localePath || './locales',
      ...options
    };

    // State
    this._currentLocale = this._options.defaultLocale;
    this._localeData = {};       // Current locale strings
    this._fallbackData = {};      // Fallback locale strings
    this._loadedLocales = new Set();
    this._isRTL = false;
    
    // Pluralization rules (simplified)
    this._pluralRules = {
      en: (n) => n === 1 ? 'one' : 'other',
      es: (n) => n === 1 ? 'one' : 'other',
      fr: (n) => n === 0 || n === 1 ? 'one' : 'other',
      de: (n) => n === 1 ? 'one' : 'other',
      ja: () => 'other',         // No plural in Japanese
      zh-cn: () => 'other',      // No plural in Chinese
      ko: () => 'other',         // No plural in Korean
      pt-br: (n) => n === 0 || n === 1 ? 'one' : 'other',
      ru: (n) => {
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return 'one';
        if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'few';
        return 'other';
      }
    };

    // Callbacks
    this._onLocaleChange = null;

    // Hot-reload for development
    this._hotReloadEnabled = options.hotReload || false;
  }

  /**
   * Initialize and detect/load appropriate locale
   * @param {string} [forcedLocale] - Force a specific locale
   * @returns {Promise<string>} Loaded locale code
   */
  async init(forcedLocale = null) {
    let locale = forcedLocale;

    // Detect language if not forced
    if (!locale) {
      locale = this._detectLanguage();
    }

    // Load the locale
    await this.loadLocale(locale);

    console.log(`[i18n] Initialized with locale: ${locale}`);
    return locale;
  }

  /**
   * Detect user's preferred language
   * @returns {string} Detected locale code
   */
  _detectLanguage() {
    // Check saved preference first
    const saved = localStorage.getItem('wzk5_locale');
    if (saved && SUPPORTED_LOCALES.includes(saved)) {
      return saved;
    }

    // Check browser language
    const browserLang = navigator.language || navigator.userLanguage || 'en';
    
    // Try exact match first
    if (SUPPORTED_LOCALES.includes(browserLang.toLowerCase())) {
      return browserLang.toLowerCase();
    }

    // Try language-only match (e.g., "en-US" -> "en")
    const langOnly = browserLang.split('-')[0].toLowerCase();
    if (SUPPORTED_LOCALES.includes(langOnly)) {
      return langOnly;
    }

    // Try specific mappings
    const langMap = {
      'zh': 'zh-cn',
      'pt': 'pt-br'
    };
    if (langMap[langOnly]) {
      return langMap[langOnly];
    }

    // Default to English
    return this._options.defaultLocale;
  }

  /**
   * Load a specific locale file
   * @param {string} locale - Locale code to load
   * @returns {Promise<boolean>} Success status
   */
  async loadLocale(locale) {
    if (!SUPPORTED_LOCALES.includes(locale)) {
      console.warn(`[i18n] Unsupported locale: ${locale}, falling back to ${this._options.defaultLocale}`);
      locale = this._options.defaultLocale;
    }

    try {
      const response = await fetch(`${this._options.localePath}/${locale}.json`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      this._localeData = data;
      this._currentLocale = locale;
      this._isRTL = RTL_LOCALES.includes(locale);
      this._loadedLocales.add(locale);

      // Ensure fallback is loaded
      if (locale !== this._options.fallbackLocale && !this._fallbackData[this._options.fallbackLocale]) {
        try {
          const fallbackResponse = await fetch(`${this._options.localePath}/${this._options.fallbackLocale}.json`);
          if (fallbackResponse.ok) {
            this._fallbackData = await fallbackResponse.json();
          }
        } catch (e) {
          console.warn('[i18n] Could not load fallback locale');
        }
      }

      // Apply locale settings
      this._applyLocaleSettings();

      // Notify listeners
      this._onLocaleChange?.(locale);
      
      // Emit event
      if (typeof window !== 'undefined' && window.__engine?.bus) {
        window.__engine.bus.emit('i18n:localeChanged', { locale });
      }

      console.log(`[i18n] Loaded locale: ${locale}`);
      return true;

    } catch (error) {
      console.error(`[i18n] Failed to load locale ${locale}:`, error);
      
      // Fall back to default if available
      if (locale !== this._options.defaultLocale) {
        return this.loadLocale(this._options.defaultLocale);
      }
      
      return false;
    }
  }

  /**
   * Switch to a different locale at runtime
   * @param {string} locale - Target locale code
   * @returns {Promise<boolean>}
   */
  async setLocale(locale) {
    const success = await this.loadLocale(locale);
    
    if (success) {
      localStorage.setItem('wzk5_locale', locale);
    }
    
    return success;
  }

  /**
   * Get current locale code
   * @returns {string}
   */
  getLocale() {
    return this._currentLocale;
  }

  /**
   * Check if current locale is RTL
   * @returns {boolean}
   */
  isRTL() {
    return this._isRTL;
  }

  /**
   * Get list of supported locales
   * @returns {string[]}
   */
  getSupportedLocales() {
    return [...SUPPORTED_LOCALES];
  }

  // ==================== TRANSLATION METHODS ====================

  /**
   * Get translated string by key
   * @param {string} key - Dot-notation key (e.g., 'menu.play')
   * @param {object} [params] - Interpolation parameters
   * @param {number} [count] - Count for pluralization
   * @returns {string} Translated string
   */
  t(key, params = null, count = null) {
    let value = this._getValue(key);

    // Handle pluralization
    if (count !== null && typeof value === 'object') {
      const pluralForm = this._getPluralForm(count);
      value = value[pluralForm] || value['other'] || '';
    }

    // Fallback to key if no translation found
    if (typeof value !== 'string') {
      value = key;
    }

    // Interpolate parameters
    if (params && typeof value === 'string') {
      value = this._interpolate(value, params);
    }

    return value;
  }

  /**
   * Convenience method for pluralized translations
   * @param {string} key - Base key (will append .one/.other etc.)
   * @param {number} count - Number for plural form selection
   * @param {object} [params] - Additional interpolation params
   * @returns {string}
   */
  n(key, count, params = null) {
    return this.t(key, { ...params, count }, count);
  }

  /**
   * Check if a translation key exists
   * @param {string} key 
   * @returns {boolean}
   */
  has(key) {
    return this._getValue(key) !== undefined;
  }

  /**
   * Get all translations for a namespace
   * @param {string} namespace - Top-level key
   * @returns {object}
   */
  getNamespace(namespace) {
    return this._localeData[namespace] || this._fallbackData[namespace] || {};
  }

  // ==================== INTERNAL METHODS ====================

  _getValue(key) {
    // Navigate dot notation
    const parts = key.split('.');
    let value = this._localeData;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        // Try fallback
        value = this._fallbackData;
        for (const p of parts) {
          if (value && typeof value === 'object' && p in value) {
            value = value[p];
          } else {
            return undefined; // Key not found
          }
        }
        return value;
      }
    }

    return value;
  }

  _interpolate(template, params) {
    return template.replace(/\{(\w+)\}/g, (match, paramKey) => {
      return params.hasOwnProperty(paramKey) ? params[paramKey] : match;
    });
  }

  _getPluralForm(count) {
    const rule = this._pluralRules[this._currentLocale] || this._pluralRules.en;
    return rule(count);
  }

  _applyLocaleSettings() {
    // Update HTML lang attribute
    document.documentElement.lang = this._currentLocale;
    
    // Update direction
    document.documentElement.dir = this._isRTL ? 'rtl' : 'ltr';
    
    // Update font family for CJK languages
    const font = FONT_MAPPINGS[this._currentLocale] || FONT_MAPPINGS.default;
    document.documentElement.style.fontFamily = font;
    
    // Add locale class to body for CSS targeting
    document.body.classList.remove(...SUPPORTED_LOCALES.map(l => `locale-${l}`));
    document.body.classList.add(`locale-${this._currentLocale}`);
    if (this._isRTL) {
      document.body.classList.add('rtl');
    } else {
      document.body.classList.remove('rtl');
    }
  }

  /**
   * Enable hot-reload for development (watches for changes)
   */
  enableHotReload() {
    this._hotReloadEnabled = true;
    console.log('[i18n] Hot reload enabled');
  }

  /**
   * Reload current locale (for hot-reload)
   * @returns {Promise<void>}
   */
  async reload() {
    await this.loadLocale(this._currentLocale);
  }

  /**
   * Set callback for locale changes
   * @param {function} cb 
   */
  onLocaleChange(cb) {
    this._onLocaleChange = cb;
  }

  /**
   * Get formatted date according to locale
   * @param {Date|string|number} date 
   * @param {object} [options] - Intl.DateTimeFormat options
   * @returns {string}
   */
  formatDate(date, options = {}) {
    const d = new Date(date);
    return new Intl.DateTimeFormat(this._currentLocale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      ...options
    }).format(d);
  }

  /**
   * Get formatted number according to locale
   * @param {number} num 
   * @param {object} [options] - Intl.NumberFormat options
   * @returns {string}
   */
  formatNumber(num, options = {}) {
    return new Intl.NumberFormat(this._currentLocale, options).format(num);
  }
}

// Export singleton instance and class
export const i18n = new LocalizationSystem();
export default i18n;
export { SUPPORTED_LOCALES, RTL_LOCALES, FONT_MAPPINGS };
