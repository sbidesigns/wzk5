// core/CrossPlatformBuild.js
// Mobile build configuration and native bridge APIs.
// Features Capacitor/Cordova detection, native bridges,
// platform-specific adjustments, and app store requirements.

import { EventBus } from './EventBus.js';

/**
 * Platform enumeration
 * @enum {string}
 */
const Platform = {
  WEB: 'web',
  IOS: 'ios',
  ANDROID: 'android',
  CAPACITOR_IOS: 'capacitor-ios',
  CAPACITOR_ANDROID: 'capacitor-android',
  CORDOVA_IOS: 'cordova-ios',
  CORDOVA_ANDROID: 'cordova-android'
};

/**
 * @typedef {Object} SafeAreaInsets
 * @property {number} top - Top inset (notch/status bar)
 * @property {number} right - Right inset
 * @property {number} bottom - Bottom inset (home indicator)
 * @property {number} left - Left inset
 */

/**
 * @typedef {Object} PerformanceProfile
 * @property {string} tier - 'high', 'medium', 'low'
 * @property {number} targetFPS - Target frame rate
 * @property {number} resolutionScale - Render resolution multiplier
 * @property {boolean} shadows - Enable shadows
 * @property {boolean} particles - Enable particle effects
 * @property {number} maxParticles - Maximum particle count
 * @property {number} shadowMapSize - Shadow map resolution
 * @property {boolean} postProcessing - Enable post-processing effects
 */

class CrossPlatformBuild {
  constructor() {
    /** @type {Platform} */
    this._platform = this._detectPlatform();
    
    /** @type {boolean} */
    this._isNativeWrapper = this._checkNativeWrapper();
    
    /** @type {string|null} */
    this._wrapperType = null; // 'capacitor', 'cordova', or null
    
    // Safe area handling (iOS notch)
    this._safeArea = { top: 0, right: 0, bottom: 0, left: 0 };
    
    // Performance profile
    this._performanceProfile = this._getDefaultPerformanceProfile();
    
    // Native bridge availability flags
    this._bridges = {
      gamepad: false,
      pushNotifications: false,
      inAppPurchases: false,
      share: false,
      haptics: false,
      biometrics: false,
      storage: false
    };

    // Permission states
    this._permissions = {
      notifications: 'prompt',
      location: 'prompt',
      camera: 'prompt',
      microphone: 'prompt'
    };

    // App store metadata
    this._appMetadata = {
      version: '1.0.0',
      buildNumber: '1',
      bundleId: 'com.wzk5.racing',
      displayName: 'WZK5 Racing',
      privacyPolicyUrl: '',
      ageRating: null
    };

    // Content rating calculator state
    this._contentDescriptors = new Set();

    console.log(`[CrossPlatform] Initialized on ${this._platform}, native: ${this._isNativeWrapper}`);
  }

  /**
   * Detect current platform
   * @private
   * @returns {Platform}
   */
  _detectPlatform() {
    const ua = navigator.userAgent || '';
    
    // Check for Capacitor
    if (window.Capacitor) {
      if (/iphone|ipad|ipod/i.test(ua)) return Platform.CAPACITOR_IOS;
      if (/android/i.test(ua)) return Platform.CAPACITOR_ANDROID;
    }
    
    // Check for Cordova
    if (window.cordova || window.phonegap) {
      if (/iphone|ipad|ipod/i.test(ua)) return Platform.CORDOVA_IOS;
      if (/android/i.test(ua)) return Platform.CORDOVA_ANDROID;
    }
    
    // Standard web platform detection
    if (/iphone|ipad|ipod/i.test(ua)) return Platform.IOS;
    if (/android/i.test(ua)) return Platform.ANDROID;
    
    return Platform.WEB;
  }

  /**
   * Check if running in a native wrapper
   * @private
   * @returns {boolean}
   */
  _checkNativeWrapper() {
    if (window.Capacitor?.isNativePlatform()) {
      this._wrapperType = 'capacitor';
      this._setupCapacitorBridges();
      return true;
    }
    
    if (window.cordova) {
      this._wrapperType = 'cordova';
      this._setupCordovaBridges();
      return true;
    }
    
    return false;
  }

  /**
   * Set up Capacitor native bridges
   * @private
   */
  _setupCapacitorBridges() {
    try {
      const { Capacitor } = window.Capacitor;

      // Gamepad bridge (native game controller support)
      if (Capacitor.isPluginAvailable('Gamepad')) {
        this._bridges.gamepad = true;
      }

      // Push notifications
      if (Capacitor.isPluginAvailable('PushNotifications') || 
          Capacitor.isPluginAvailable('LocalNotifications')) {
        this._bridges.pushNotifications = true;
      }

      // In-app purchases
      if (Capacitor.isPluginAvailable('InAppPurchase') ||
          Capactor.isPluginAvailable('Store')) {
        this._bridges.inAppPurchases = true;
      }

      // Share
      if (Capacitor.isPluginAvailable('Share')) {
        this._bridges.share = true;
      }

      // Haptics
      if (Capacitor.isPluginAvailable('Haptics')) {
        this._bridges.haptics = true;
      }

      // Biometrics / Face ID
      if (Capacitor.isPluginAvailable('IdentityVault') ||
          Capacitor.isPluginAvailable('BiometricAuth')) {
        this._bridges.biometrics = true;
      }

      console.log('[CrossPlatform] Capacitor bridges initialized');
    } catch (e) {
      console.warn('[CrossPlatform] Error setting up Capacitor:', e);
    }
  }

  /**
   * Set up Cordova native bridges
   * @private
   */
  _setupCordovaBridges() {
    try {
      // Push notifications
      if (window.plugins?.pushNotification || window.PushNotification) {
        this._bridges.pushNotifications = true;
      }

      // In-app purchases
      if (window.inAppPurchase || window.IapInAppPurchase) {
        this._bridges.inAppPurchases = true;
      }

      // Share
      if (window.plugins?.socialsharing || navigator.share) {
        this._bridges.share = true;
      }

      // Haptics / vibration
      if (navigator.vibrate) {
        this._bridges.haptics = true;
      }

      console.log('[CrossPlatform] Cordova bridges initialized');
    } catch (e) {
      console.warn('[CrossPlatform] Error setting up Cordova:', e);
    }
  }

  /**
   * Initialize platform-specific features
   */
  async init() {
    // Detect safe areas
    this._detectSafeArea();
    
    // Detect performance capabilities
    await this._detectPerformanceTier();
    
    // Set up platform event listeners
    this._setupPlatformListeners();
    
    console.log(`[CrossPlatform] Init complete - Profile: ${this._performanceProfile.tier}`);
    EventBus.emit('crossplatform:initialized', {
      platform: this._platform,
      isNative: this._isNativeWrapper,
      profile: this._performanceProfile.tier
    });
  }

  /**
   * Detect safe area insets for notch/home indicator
   * @private
   */
  _detectSafeArea() {
    // CSS env() approach (modern browsers)
    const computedStyle = getComputedStyle(document.documentElement);
    
    const top = parseInt(computedStyle.getPropertyValue('--safe-area-inset-top') || '0', 10);
    const right = parseInt(computedStyle.getPropertyValue('--safe-area-inset-right') || '0', 10);
    const bottom = parseInt(computedStyle.getPropertyValue('--safe-area-inset-bottom') || '0', 10);
    const left = parseInt(computedStyle.getPropertyValue('--safe-area-inset-left') || '0', 10);

    // Fallback to viewport API or constants
    this._safeArea = {
      top: top || (this._isIOS() ? 44 : 0),
      right: right || 0,
      bottom: bottom || (this._isIOS() ? 34 : 0),
      left: left || 0
    };

    // Apply safe area CSS variable
    document.documentElement.style.setProperty('--safe-top', `${this._safeArea.top}px`);
    document.documentElement.style.setProperty('--safe-bottom', `${this._safeArea.bottom}px`);
  }

  /**
   * Detect device performance tier
   * @private
   */
  async _detectPerformanceTier() {
    // Start with medium profile
    let profile = this._getDefaultPerformanceProfile();

    // Check hardware concurrency
    const cores = navigator.hardwareConcurrency || 2;
    if (cores >= 8) {
      profile.tier = 'high';
      profile.targetFPS = 60;
      profile.resolutionScale = 1.0;
      profile.shadows = true;
      profile.particles = true;
      profile.maxParticles = 500;
      profile.shadowMapSize = 1024;
      profile.postProcessing = true;
    } else if (cores >= 4) {
      profile.tier = 'medium';
      profile.targetFPS = 60;
      profile.resolutionScale = 0.85;
      profile.shadows = true;
      profile.particles = true;
      profile.maxParticles = 250;
      profile.shadowMapSize = 512;
      profile.postProcessing = true;
    } else {
      profile.tier = 'low';
      profile.targetFPS = 30;
      profile.resolutionScale = 0.7;
      profile.shadows = false;
      profile.particles = false;
      profile.maxParticles = 50;
      profile.shadowMapSize = 256;
      profile.postProcessing = false;
    }

    // Further reduce for mobile
    if (this._isMobile()) {
      profile.targetFPS = Math.min(profile.targetFPS, 30);
      profile.resolutionScale *= 0.85;
      
      // Check device memory if available
      if (navigator.deviceMemory !== undefined && navigator.deviceMemory < 4) {
        profile.tier = 'low';
        profile.resolutionScale = 0.6;
        profile.shadows = false;
      }
    }

    this._performanceProfile = profile;
  }

  /**
   * Get default performance profile
   * @private
   * @returns {PerformanceProfile}
   */
  _getDefaultPerformanceProfile() {
    return {
      tier: 'medium',
      targetFPS: 60,
      resolutionScale: 1.0,
      shadows: true,
      particles: true,
      maxParticles: 300,
      shadowMapSize: 512,
      postProcessing: true
    };
  }

  /**
   * Set up platform-specific event listeners
   * @private
   */
  _setupPlatformListeners() {
    // Android back button
    if (this._isAndroid()) {
      document.addEventListener('backbutton', (e) => {
        EventBus.emit('crossplatform:backButton');
        e.preventDefault();
      });
    }

    // iOS visibility change (app backgrounding)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        EventBus.emit('crossplatform:appBackgrounded');
      } else {
        EventBus.emit('crossplatform:appForegrounded');
      }
    });

    // Orientation change
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this._detectSafeArea(), 100); // Re-detect after rotation
      EventBus.emit('crossplatform:orientationChange', {
        orientation: screen.orientation?.type || window.orientation
      });
    });

    // Resize (includes safe area changes)
    window.addEventListener('resize', () => {
      this._detectSafeArea();
    });

    // Keyboard appearance (mobile)
    if (this._isMobile()) {
      visualViewport?.addEventListener('geometrychange', () => {
        EventBus.emit('crossplatform:keyboardChange', {
          visible: window.innerHeight > visualViewport.height,
          height: visualViewport.height
        });
      });
    }
  }

  // ==================== PLATFORM DETECTION ====================

  /**
   * Check if iOS platform
   * @returns {boolean}
   */
  _isIOS() {
    return this._platform === Platform.IOS || 
           this._platform === Platform.CAPACITOR_IOS || 
           this._platform === Platform.CORDOVA_IOS;
  }

  /**
   * Check if Android platform
   * @returns {boolean}
   */
  _isAndroid() {
    return this._platform === Platform.ANDROID || 
           this._platform === Platform.CAPACITOR_ANDROID || 
           this._platform === Platform.CORDOVA_ANDROID;
  }

  /**
   * Check if mobile device
   * @returns {boolean}
   */
  _isMobile() {
    return this._isIOS() || this._isAndroid() || 
           /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
             navigator.userAgent
           );
  }

  /**
   * Get current platform
   * @returns {Platform}
   */
  getPlatform() {
    return this._platform;
  }

  /**
   * Check if in native wrapper
   * @returns {boolean}
   */
  isNativeWrapper() {
    return this._isNativeWrapper;
  }

  /**
   * Get wrapper type
   * @returns {string|null}
   */
  getWrapperType() {
    return this._wrapperType;
  }

  // ==================== SAFE AREA ====================

  /**
   * Get safe area insets
   * @returns {SafeAreaInsets}
   */
  getSafeArea() {
    return { ...this._safeArea };
  }

  /**
   * Get total safe area height adjustment
   * @returns {number} Total vertical pixels to offset
   */
  getSafeAreaHeightAdjustment() {
    return this._safeArea.top + this._safeArea.bottom;
  }

  // ==================== PERFORMANCE ====================

  /**
   * Get current performance profile
   * @returns {PerformanceProfile}
   */
  getPerformanceProfile() {
    return { ...this._performanceProfile };
  }

  /**
   * Override performance profile (for user settings)
   * @param {Partial<PerformanceProfile>} overrides - Settings to override
   */
  setPerformanceOverrides(overrides) {
    Object.assign(this._performanceProfile, overrides);
    EventBus.emit('crossplatform:performanceChanged', this._performanceProfile);
  }

  // ==================== NATIVE BRIDGES ====================

  /**
   * Register gamepad input via native bridge
   * @param {Function} callback - Called with gamepad state changes
   * @returns {boolean} Success
   */
  registerNativeGamepad(callback) {
    if (!this._bridges.gamepad) {
      console.warn('[CrossPlatform] Native gamepad not available');
      return false;
    }

    // Implementation depends on plugin used
    // This is a placeholder structure
    try {
      if (this._wrapperType === 'capacitor') {
        const { Gamepad } = window.Capacitor.Plugins;
        if (Gamepad) {
          Gamepad.addListener('gamepadConnected', callback);
          return true;
        }
      }
    } catch (e) {
      console.error('[CrossPlatform] Gamepad registration error:', e);
    }

    return false;
  }

  /**
   * Request push notification permission
   * @returns {Promise<boolean>} Granted status
   */
  async requestPushPermission() {
    if (!this._bridges.pushNotifications) {
      console.log('[CrossPlatform] Push notifications not available, using web fallback');
      // Fallback to web Notification API
      if ('Notification' in window) {
        const result = await Notification.requestPermission();
        this._permissions.notifications = result;
        return result === 'granted';
      }
      return false;
    }

    try {
      if (this._wrapperType === 'capacitor') {
        const { PushNotifications } = window.Capacitor.Plugins;
        if (PushNotifications) {
          const result = await PushNotifications.requestPermissions();
          this._permissions.notifications = result.receive === 'granted' ? 'granted' : 'denied';
          return this._permissions.notifications === 'granted';
        }
      }
    } catch (e) {
      console.error('[CrossPlatform] Push permission error:', e);
    }

    return false;
  }

  /**
   * Purchase gold currency via IAP
   * @param {string} productId - Product identifier
   * @param {number} amount - Amount of gold
   * @returns {Promise<Object>} Purchase result
   */
  async purchaseGold(productId, amount) {
    if (!this._bridges.inAppPurchases) {
      console.warn('[CrossPlatform] IAP not available');
      // Fallback to web-based purchase
      EventBus.emit('crossplatform:purchaseWeb', { productId, amount });
      return { success: false, fallback: true };
    }

    try {
      if (this._wrapperType === 'capacitor') {
        const Store = window.Capacitor.Plugins?.Store;
        if (Store) {
          const result = await Store.order({ product: productId });
          
          if (result.success) {
            EventBus.emit('crossplatform:purchaseComplete', { productId, amount });
            return { success: true, transactionId: result.transactionId };
          }
        }
      }
    } catch (e) {
      console.error('[CrossPlatform] Purchase error:', e);
    }

    return { success: false, error: 'Purchase failed' };
  }

  /**
   * Open native share sheet
   * @param {Object} options - Share options
   * @param {string} options.title - Share title
   * @param {string} options.text - Share text
   * @param {string} [options.url] - URL to share
   * @param {string} [options.image] - Image data URL
   * @returns {Promise<boolean}> Success
   */
  async share(options) {
    const shareData = {
      title: options.title || 'WZK5 Racing',
      text: options.text || 'Check out my racing skills!',
      url: options.url || window.location.href
    };

    // Try Web Share API first (works in many mobile browsers)
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return true;
      } catch (e) {
        if (e.name !== 'AbortError') {
          console.error('[CrossPlatform] Share error:', e);
        }
        return false; // User cancelled
      }
    }

    // Try native bridge
    if (this._bridges.share) {
      try {
        if (this._wrapperType === 'capacitor') {
          const { Share } = window.Capacitor.Plugins;
          if (Share) {
            await Share.share(shareData);
            return true;
          }
        }
      } catch (e) {
        console.error('[CrossPlatform] Native share error:', e);
      }
    }

    // Final fallback: copy to clipboard
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`.trim());
      console.log('[CrossPlatform] Copied to clipboard as fallback');
      return true;
    }

    return false;
  }

  /**
   * Trigger haptic feedback
   * @param {string} type - 'light', 'medium', 'heavy', 'success', 'warning', 'error', 'selection'
   */
  triggerHaptic(type = 'light') {
    // Vibration API fallback
    if (navigator.vibrate) {
      const patterns = {
        light: 10,
        medium: 20,
        heavy: 30,
        success: [10, 50, 10],
        warning: [15, 30, 15, 30, 15],
        error: [20, 40, 20, 40, 20],
        selection: 5
      };
      
      navigator.vibrate(patterns[type] || patterns.light);
    }

    // Native haptics
    if (this._bridges.haptics) {
      try {
        if (this._wrapperType === 'capacitor') {
          const { Haptics, ImpactStyle } = window.Capacitor.Plugins;
          if (Haptics) {
            const styleMap = {
              light: ImpactStyle.Light,
              medium: ImpactStyle.Medium,
              heavy: ImpactStyle.Heavy
            };
            
            if (styleMap[type]) {
              Haptics.impact({ style: styleMap[type] });
            } else {
              Haptics.notification(); // For success/warning/error
            }
          }
        }
      } catch (e) {
        // Silently fail for haptics
      }
    }
  }

  // ==================== PERMISSIONS ====================

  /**
   * Request a specific permission
   * @param {string} permission - Permission type
   * @returns {Promise<string>} Permission state
   */
  async requestPermission(permission) {
    if (!(permission in this._permissions)) {
      console.warn(`[CrossPlatform] Unknown permission: ${permission}`);
      return 'unsupported';
    }

    try {
      // Handle specific permissions based on type
      switch (permission) {
        case 'notifications':
          return await this.requestPushPermission();
        
        case 'microphone':
          if (navigator.mediaDevices?.getUserMedia) {
            try {
              await navigator.mediaDevices.getUserMedia({ audio: true });
              this._permissions.microphone = 'granted';
              // Stop stream immediately
              // (we just wanted permission)
              return 'granted';
            } catch (e) {
              this._permissions.microphone = 'denied';
              return 'denied';
            }
          }
          break;
        
        case 'camera':
          if (navigator.mediaDevices?.getUserMedia) {
            try {
              await navigator.mediaDevices.getUserMedia({ video: true });
              this._permissions.camera = 'granted';
              return 'granted';
            } catch (e) {
              this._permissions.camera = 'denied';
              return 'denied';
            }
          }
          break;
      }
    } catch (e) {
      console.error(`[CrossPlatform] Error requesting ${permission}:`, e);
    }

    return this._permissions[permission];
  }

  /**
   * Get permission state
   * @param {string} permission - Permission type
   * @returns {string} Current state
   */
  getPermissionState(permission) {
    return this._permissions[permission] || 'unknown';
  }

  // ==================== APP STORE REQUIREMENTS ====================

  /**
   * Configure splash screen settings
   * @param {Object} config - Splash configuration
   */
  configureSplashScreen(config) {
    // This would modify Capacitor/Cordova config
    // For now, emit event for UI layer to handle
    EventBus.emit('crossplatform:splashConfig', {
      backgroundColor: config.backgroundColor || '#1a1a2e',
      image: config.image || '/assets/splash.png',
      duration: config.duration || 2000,
      scaleMode: config.scaleMode || 'centerCrop'
    });
  }

  /**
   * Get icon generation specifications
   * @returns {Object} Required icon sizes per platform
   */
  getIconSpecs() {
    return {
      ios: [
        { size: 1024, name: 'AppIcon-1024.png', usage: 'App Store' },
        { size: 180, name: 'AppIcon-60@3x.png', usage: 'iPhone @3x' },
        { size: 120, name: 'AppIcon-60@2x.png', usage: 'iPhone @2x' },
        { size: 87, name: 'AppIcon-29@3x.png', usage: 'Settings @3x' },
        { size: 80, name: 'AppIcon-40@2x.png', usage: 'Spotlight @2x' },
        { size: 58, name: 'AppIcon-29@2x.png', usage: 'Settings @2x' }
      ],
      android: [
        { size: 192, name: 'mipmap-xxxhdpi/ic_launcher.png', usage: 'XXXHDPI' },
        { size: 144, name: 'mipmap-xxhdpi/ic_launcher.png', usage: 'XXHDPI' },
        { size: 96, name: 'mipmap-xhdpi/ic_launcher.png', usage: 'XHDPI' },
        { size: 72, name: 'mipmap-hdpi/ic_launcher.png', usage: 'HDPI' },
        { size: 48, name: 'mipmap-mdpi/ic_launcher.png', usage: 'MDPI' },
        { size: 48, name: 'mipmap-mdpi/ic_launcher_foreground.png', usage: 'Adaptive foreground' },
        { size: 108, name: 'mipmap-mdpi/ic_launcher_background.png', usage: 'Adaptive background' }
      ]
    };
  }

  /**
   * Set privacy policy URL
   * @param {string} url - Privacy policy URL
   */
  setPrivacyPolicy(url) {
    this._appMetadata.privacyPolicyUrl = url;
  }

  /**
   * Add content descriptor for ESRB calculation
   * @param {string} descriptor - Content descriptor
   * Possible values: 'violence', 'blood', 'gambling', 'language', etc.
   */
  addContentDescriptor(descriptor) {
    this._contentDescriptors.add(descriptor.toLowerCase());
  }

  /**
   * Calculate suggested ESRB/PEGI rating based on content
   * @returns {Object} Suggested rating info
   */
  calculateAgeRating() {
    const descriptors = Array.from(this._contentDescriptors);
    
    // Simplified rating algorithm
    let rating = 'E'; // Everyone (ESRB) / 3+ (PEGI)
    let age = 3;
    let contentDescriptors = [];

    if (descriptors.includes('gambling') || descriptors.includes('real_gambling')) {
      rating = 'A'; // Adults Only / 18+
      age = 18;
      contentDescriptors.push('Gambling');
    } else if (descriptors.includes('intense_violence') || descriptors.includes('graphic_sexual')) {
      rating = 'M'; // Mature / 17+
      age = 17;
      contentDescriptors.push('Intense Violence');
    } else if (descriptors.includes('violence') || descriptors.includes('blood') || 
               descriptors.includes('sexual_content') || descriptors.includes('strong_language')) {
      rating = 'T'; // Teen / 13+
      age = 13;
      if (descriptors.includes('violence')) contentDescriptors.push('Violence');
      if (descriptors.includes('blood')) contentDescriptors.push('Blood');
      if (descriptors.includes('strong_language')) contentDescriptors.push('Strong Language');
    } else if (descriptors.includes('mild_violence') || descriptors.includes('mild_language')) {
      rating = 'E10+'; // Everyone 10+ / 7+
      age = 10;
      contentDescriptors.push('Mild Violence');
    }

    this._appMetadata.ageRating = { rating, age, contentDescriptors };
    
    return {
      esrb: rating,
      pegi: age,
      contentDescriptors,
      notes: `Based on detected content: ${descriptors.join(', ') || 'none'}`
    };
  }

  /**
   * Get all app metadata
   * @returns {Object}
   */
  getAppMetadata() {
    return { ...this._appMetadata };
  }

  /**
   * Set app version info
   * @param {string} version - Semantic version
   * @param {string} buildNumber - Build number
   */
  setVersion(version, buildNumber) {
    this._appMetadata.version = version;
    this._appMetadata.buildNumber = buildNumber;
  }

  // ==================== UTILITIES ====================

  /**
   * Check if a specific bridge is available
   * @param {string} bridgeName - Bridge name
   * @returns {boolean}
   */
  hasBridge(bridgeName) {
    return !!this._bridges[bridgeName];
  }

  /**
   * Get all available bridges
   * @returns {Object}
   */
  getAvailableBridges() {
    return { ...this._bridges };
  }

  /**
   * Get platform-specific adjustments summary
   * @returns {Object}
   */
  getPlatformInfo() {
    return {
      platform: this._platform,
      isNative: this._isNativeWrapper,
      wrapperType: this._wrapperType,
      safeArea: this._safeArea,
      performance: this._performanceProfile.tier,
      bridges: this.getAvailableBridges(),
      permissions: { ...this._permissions }
    };
  }

  /**
   * Get all available platforms
   * @returns {string[]}
   */
  static getPlatforms() {
    return Object.values(Platform);
  }
}

export const crossPlatform = new CrossPlatformBuild();
export { Platform };
export default crossPlatform;
