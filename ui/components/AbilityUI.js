// AbilityUI.js - In-race ability display and activation
// Features: ability icon, cooldown ring, activation button,
// touch support, flash effects, duration indicator, passive perks

class AbilityUI {
  constructor(options = {}) {
    // Configuration
    this._options = {
      position: options.position || 'bottom-right', // 'bottom-right', 'bottom-left', etc.
      size: options.size || 70,
      touchEnabled: options.touchEnabled !== false, // Auto-detect on mobile
      ...options
    };

    // DOM elements
    this._container = null;
    this._elements = {};

    // State
    this._visible = true;
    this._abilityData = null; // { id, name, icon, description, cooldown, duration, keyBinding }
    this._currentCooldown = 0;
    this._maxCooldown = 10;
    this._isReady = true;
    this._isActive = false;
    this._activeDuration = 0;
    this._maxDuration = 5;
    this._passivePerks = []; // Array of { icon, name, description }

    // Animation state
    this._flashOpacity = 0;
    this._pulsePhase = 0;

    // Callbacks
    this._onActivate = null;

    // Touch handling
    this._touchStartPos = null;
  }

  /**
   * Create and mount the ability UI element
   * @param {HTMLElement} parent - Parent container
   * @returns {HTMLElement} The ability UI container
   */
  mount(parent) {
    // Detect mobile for touch controls
    if (this._options.touchEnabled && ('ontouchstart' in window)) {
      this._isTouchDevice = true;
    }

    // Position styles based on configuration
    const positionStyles = this._getPositionStyles();

    this._container = document.createElement('div');
    this._container.id = 'ability-ui-container';
    this._container.className = 'ability-ui';
    this._container.style.cssText = `
      position: fixed;
      ${positionStyles}
      z-index: 150;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      pointer-events: none;
      transition: opacity 0.3s ease;
    `;

    this._container.innerHTML = this._buildHTML();

    // Cache elements
    this._cacheElements();

    // Setup events
    this._setupEvents();

    if (parent) {
      parent.appendChild(this._container);
    }

    return this._container;
  }

  _buildHTML() {
    const size = this._options.size;
    
    return `
      <!-- Passive perks row -->
      <div class="ability-passive-perks" id="ability-perks"></div>

      <!-- Main ability button -->
      <div class="ability-button-wrapper" id="ability-wrapper">
        <!-- Activation flash overlay -->
        <div class="ability-flash-overlay" id="ability-flash"></div>
        
        <!-- Cooldown ring (SVG circle) -->
        <svg class="ability-cooldown-ring" id="ability-ring-svg" 
             viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
          <defs>
            <linearGradient id="ability-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#00e5ff"/>
              <stop offset="100%" stop-color="#7c4dff"/>
            </linearGradient>
          </defs>
          <!-- Background circle -->
          <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 4}" 
                  fill="rgba(10,12,20,0.85)" stroke="#2a3040" stroke-width="2"/>
          <!-- Cooldown arc -->
          <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 6}"
                  fill="none" stroke="url(#ability-grad)" 
                  stroke-width="4" stroke-linecap="round"
                  transform="rotate(-90 ${size/2} ${size/2})"
                  id="ability-cooldown-arc"
                  stroke-dasharray="${Math.PI * (size - 12)} ${Math.PI * (size - 12)}"
                  stroke-dashoffset="0"/>
          <!-- Duration arc (when active) -->
          <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 8}"
                  fill="none" stroke="#00ff88" 
                  stroke-width="3" stroke-linecap="round"
                  transform="rotate(-90 ${size/2} ${size/2})"
                  id="ability-duration-arc"
                  stroke-dasharray="${Math.PI * (size - 16)} ${Math.PI * (size - 16)}"
                  stroke-dashoffset="0"
                  style="display:none;"/>
        </svg>
        
        <!-- Ability icon and content -->
        <button class="ability-button" id="ability-btn">
          <span class="ability-icon" id="ability-icon">⚡</span>
          <span class="ability-key-hint" id="ability-key">Q</span>
        </button>
        
        <!-- Cooldown text overlay -->
        <div class="ability-cooldown-text" id="ability-cd-text" style="display:none;"></div>
      </div>

      <!-- Duration bar (when active) -->
      <div class="ability-duration-bar" id="ability-duration-bar" style="display:none;">
        <div class="ability-duration-fill" id="ability-duration-fill"></div>
      </div>

      <!-- Ability name tooltip -->
      <div class="ability-name" id="ability-name"></div>
    `;
  }

  _getPositionStyles() {
    switch (this._options.position) {
      case 'bottom-left':
        return 'left: 20px; bottom: 180px;';
      case 'bottom-center':
        return 'left: 50%; bottom: 180px; transform: translateX(-50%);';
      case 'top-right':
        return 'right: 20px; top: 80px;';
      case 'top-left':
        return 'left: 20px; top: 80px;';
      case 'bottom-right':
      default:
        return 'right: 20px; bottom: 180px;';
    }
  }

  _cacheElements() {
    const get = (id) => this._container.querySelector(`#${id}`);
    
    this._elements = {
      wrapper: get('ability-wrapper'),
      btn: get('ability-btn'),
      icon: get('ability-icon'),
      keyHint: get('ability-key'),
      ringSvg: get('ability-ring-svg'),
      cooldownArc: get('ability-cooldown-arc'),
      durationArc: get('ability-duration-arc'),
      cdText: get('ability-cd-text'),
      flash: get('ability-flash'),
      name: get('ability-name'),
      perksContainer: get('ability-perks'),
      durationBar: get('ability-duration-bar'),
      durationFill: get('ability-duration-fill')
    };
  }

  _setupEvents() {
    if (!this._elements.btn) return;

    // Enable pointer events on button
    this._elements.btn.style.pointerEvents = 'auto';

    // Click/tap to activate
    this._elements.btn.addEventListener('click', () => {
      this.activate();
    });

    // Touch start/end for visual feedback
    if (this._isTouchDevice) {
      this._elements.btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this._touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        this._elements.wrapper?.classList.add('pressed');
      });

      this._elements.btn.addEventListener('touchend', () => {
        this._elements.wrapper?.classList.remove('pressed');
      });
    }

    // Hover effects for desktop
    this._elements.btn.addEventListener('mouseenter', () => {
      if (!this._isTouchDevice) {
        this._elements.wrapper?.classList.add('hovered');
      }
    });

    this._elements.btn.addEventListener('mouseleave', () => {
      if (!this._isTouchDevice) {
        this._elements.wrapper?.classList.remove('hovered');
      }
    });
  }

  // ==================== PUBLIC API ====================

  /**
   * Set ability data from character definition
   * @param {object} data - { id, name, icon, description, cooldown, duration, keyBinding }
   */
  setAbility(data) {
    this._abilityData = data;
    this._maxCooldown = data.cooldown || 10;
    this._maxDuration = data.duration || 5;

    if (this._elements.icon) {
      this._elements.icon.textContent = data.icon || '⚡';
    }
    if (this._elements.keyHint) {
      this._elements.keyHint.textContent = data.keyBinding || 'Q';
    }
    if (this._elements.name) {
      this._elements.name.textContent = data.name || '';
    }

    // Update cooldown arc circumference
    this._updateCooldownArc();
  }

  /**
   * Set passive perk indicators
   * @param {Array} perks - Array of { icon, name, description }
   */
  setPassivePerks(perks) {
    this._passivePerks = perks || [];
    
    if (!this._elements.perksContainer) return;

    this._elements.perksContainer.innerHTML = this._passivePerks.map(perk => `
      <div class="passive-perk" title="${perk.description || perk.name}">
        <span class="passive-perk-icon">${perk.icon}</span>
      </div>
    `).join('');
  }

  /**
   * Update cooldown state
   * @param {number} current - Current cooldown remaining (0 = ready)
   * @param {number} max - Maximum cooldown time
   */
  setCooldown(current, max) {
    this._currentCooldown = current;
    if (max) this._maxCooldown = max;
    
    this._isReady = current <= 0;
    
    this._updateCooldownVisual();
  }

  /**
   * Set active state with duration
   * @param {boolean} active - Is ability currently active
   * @param {number} remaining - Remaining active duration
   * @param {number} total - Total active duration
   */
  setActive(active, remaining = 0, total = 0) {
    this._isActive = active;
    this._activeDuration = remaining;
    if (total) this._maxDuration = total;

    this._updateActiveVisual();
  }

  /**
   * Trigger ability activation (from user input)
   */
  activate() {
    if (!this._isReady || this._isActive) return;

    // Show flash effect
    this._triggerFlash();

    // Call callback
    if (this._onActivate) {
      this._onActivate(this._abilityData?.id);
    }

    // Emit event
    if (typeof window !== 'undefined' && window.__engine?.bus) {
      window.__engine.bus.emit('ability:activated', { 
        abilityId: this._abilityData?.id,
        abilityName: this._abilityData?.name
      });
    }
  }

  /**
   * Show activation flash effect
   * @param {string} color - Flash color (CSS value)
   * @param {number} duration - Flash duration in seconds
   */
  triggerFlash(color = 'rgba(124, 77, 255, 0.3)', duration = 0.3) {
    this._triggerFlash(color, duration);
  }

  /**
   * Main update call - call every frame
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    if (!this._visible) return;

    // Update pulse animation when ready
    if (this._isReady && !this._isActive) {
      this._pulsePhase += dt * 3; // Pulse speed
      
      const scale = 1 + Math.sin(this._pulsePhase) * 0.05;
      const opacity = 0.8 + Math.sin(this._pulsePhase) * 0.2;
      
      if (this._elements.wrapper) {
        this._elements.wrapper.style.transform = `scale(${scale})`;
      }
      
      // Add ready pulse class
      if (this._elements.btn) {
        this._elements.btn.classList.toggle('ready-pulse', true);
      }
    } else {
      if (this._elements.btn) {
        this._elements.btn.classList.toggle('ready-pulse', false);
      }
      if (this._elements.wrapper) {
        this._elements.wrapper.style.transform = '';
      }
    }

    // Update flash fade
    if (this._flashOpacity > 0) {
      this._flashOpacity -= dt * 3; // Fade speed
      if (this._flashOpacity < 0) this._flashOpacity = 0;
      
      if (this._elements.flash) {
        this._elements.flash.style.opacity = this._flashOpacity;
      }
    }
  }

  /**
   * Show/hide the entire UI
   * @param {boolean} visible 
   */
  setVisible(visible) {
    this._visible = visible;
    if (this._container) {
      this._container.style.opacity = visible ? '1' : '0';
      this._container.style.pointerEvents = visible ? '' : 'none';
    }
  }

  /**
   * Set callback for ability activation
   * @param {function} cb - Callback(abilityId)
   */
  onActivate(cb) {
    this._onActivate = cb;
  }

  /**
   * Change position of the UI
   * @param {string} position - New position identifier
   */
  setPosition(position) {
    this._options.position = position;
    if (this._container) {
      Object.assign(this._container.style, this._getPositionStylesObj());
    }
  }

  // ==================== INTERNAL METHODS ====================

  _triggerFlash(color = 'rgba(124, 77, 255, 0.3)', duration = 0.3) {
    this._flashOpacity = 1;
    
    if (this._elements.flash) {
      this._elements.flash.style.background = color;
      this._elements.flash.style.opacity = '1';
    }
  }

  _updateCooldownVisual() {
    const percent = this._isReady ? 100 : Math.max(0, (1 - this._currentCooldown / this._maxCooldown) * 100);

    // Update arc
    if (this._elements.cooldownArc) {
      const circumference = parseFloat(this._elements.cooldownArc.getAttribute('stroke-dasharray').split(' ')[0]);
      const offset = circumference * (1 - percent / 100);
      this._elements.cooldownArc.setAttribute('stroke-dashoffset', offset);
    }

    // Update text
    if (this._elements.cdText) {
      if (this._isReady) {
        this._elements.cdText.style.display = 'none';
      } else {
        this._elements.cdText.style.display = '';
        this._elements.cdText.textContent = Math.ceil(this._currentCooldown).toString();
      }
    }

    // Update button state
    if (this._elements.btn) {
      this._elements.btn.disabled = !this._isReady;
      this._elements.btn.classList.toggle('on-cooldown', !this._isReady);
    }
  }

  _updateActiveVisual() {
    // Duration arc
    if (this._elements.durationArc) {
      if (this._isActive) {
        this._elements.durationArc.style.display = '';
        const percent = (this._activeDuration / this._maxDuration) * 100;
        const circumference = parseFloat(this._elements.durationArc.getAttribute('stroke-dasharray').split(' ')[0]);
        const offset = circumference * (1 - percent / 100);
        this._elements.durationArc.setAttribute('stroke-dashoffset', offset);
      } else {
        this._elements.durationArc.style.display = 'none';
      }
    }

    // Duration bar
    if (this._elements.durationBar) {
      if (this._isActive) {
        this._elements.durationBar.style.display = '';
        const percent = (this._activeDuration / this._maxDuration) * 100;
        if (this._elements.durationFill) {
          this._elements.durationFill.style.width = `${percent}%`;
        }
      } else {
        this._elements.durationBar.style.display = 'none';
      }
    }

    // Active state styling
    if (this._elements.wrapper) {
      this._elements.wrapper.classList.toggle('active', this._isActive);
    }
  }

  _updateCooldownArc() {
    if (!this._elements.cooldownArc) return;
    
    const size = this._options.size;
    const radius = size / 2 - 6;
    const circumference = 2 * Math.PI * radius;
    
    this._elements.cooldownArc.setAttribute('stroke-dasharray', `${circumference} ${circumference}`);
  }

  _getPositionStylesObj() {
    const positions = {
      'bottom-left': { left: '20px', bottom: '180px', right: '', top: '' },
      'bottom-center': { left: '50%', bottom: '180px', right: '', top: '', transform: 'translateX(-50%)' },
      'top-right': { right: '20px', top: '80px', left: '', bottom: '' },
      'top-left': { left: '20px', top: '80px', right: '', bottom: '' },
      'bottom-right': { right: '20px', bottom: '180px', left: '', top: '' }
    };

    return positions[this._options.position] || positions['bottom-right'];
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._container = null;
    this._elements = {};
    this._onActivate = null;
  }
}

export default AbilityUI;
export { AbilityUI };
