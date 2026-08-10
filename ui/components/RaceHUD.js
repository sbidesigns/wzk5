// RaceHUD.js - Complete race HUD system
// Full heads-up display with position, lap counter, speedometer,
// item display, countdown, messages, minimap, and rankings.

import { Minimap } from './Minimap.js';

// Ordinal suffix helper
function getOrdinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

class RaceHUD {
  constructor(options = {}) {
    // Configuration
    this._options = {
      showMinimap: options.showMinimap !== false,
      showSpeedometer: options.showSpeedometer !== false,
      analogSpeedo: options.analogSpeedo || false,
      showSplitTimes: options.showSplitTimes || false,
      ...options
    };

    // DOM elements
    this._container = null;
    this._elements = {};

    // State
    this._visible = true;
    this._position = 1;
    this._totalRacers = 8;
    this._currentLap = 1;
    this._totalLaps = 3;
    this._speed = 0;
    this._maxSpeed = 300; // km/h
    this._currentItem = null;
    this._driftCharge = 0; // 0-100 (0=none, 100=max turbo)
    this._driftTier = 0; // 0, 1, 2 (blue, red, purple)
    this._raceTime = 0;
    this._bestLapTime = Infinity;
    this._lastLapTime = 0;
    this._countdownValue = 0;
    this._showCountdown = false;
    this._abilityCooldown = 0;
    this._abilityMaxCooldown = 10;
    this._abilityReady = true;
    this._positionDelta = 0; // Time difference to racer ahead/behind

    // Rankings data
    this._rankings = [];

    // Split times (for time trial)
    this._splitTimes = [];

    // Active message
    this._message = null;
    this._messageTimer = 0;

    // Minimap instance
    this._minimap = null;

    // Callbacks
    this._onPause = null;
    this._onItemUse = null;

    // Bindings
    this._boundUpdate = this.update.bind(this);
  }

  /**
   * Create and mount the HUD element
   * @param {HTMLElement} parent - Parent container (usually document.body)
   * @returns {HTMLElement} The HUD container
   */
  mount(parent) {
    this._container = document.createElement('div');
    this._container.id = 'race-hud';
    this._container.className = 'race-hud';
    this._container.innerHTML = this._buildHTML();

    // Cache element references
    this._cacheElements();

    // Setup event listeners
    this._setupEvents();

    // Initialize minimap
    if (this._options.showMinimap) {
      const minimapContainer = this._elements.minimapContainer;
      this._minimap = new Minimap({ width: 180, height: 180 });
      this._minimap.mount(minimapContainer);
    }

    if (parent) {
      parent.appendChild(this._container);
    }

    return this._container;
  }

  _buildHTML() {
    return `
      <!-- Top Left: Position & Lap -->
      <div class="hud-corner hud-tl" id="hud-position-container">
        <div class="hud-position-display">
          <span class="hud-position-number" id="hud-position">1</span>
          <span class="hud-position-suffix" id="hud-position-suffix">st</span>
          <span class="hud-position-total">/ <span id="hud-total-racers">8</span></span>
        </div>
        <div class="hud-lap-display">
          <span class="hud-label">LAP</span>
          <span class="hud-lap-current" id="hud-lap-current">1</span>
          <span class="hud-lap-separator">/</span>
          <span class="hud-lap-total" id="hud-lap-total">3</span>
        </div>
        <div class="hud-lap-progress">
          <div class="hud-lap-progress-bar" id="hud-lap-progress"></div>
        </div>
      </div>

      <!-- Top Right: Race Timer & Position Delta -->
      <div class="hud-corner hud-tr" id="hud-timer-container">
        <div class="hud-race-time" id="hud-race-time">0:00.00</div>
        <div class="hud-position-delta ${this._positionDelta >= 0 ? 'delta-behind' : 'delta-ahead'}" 
             id="hud-position-delta" style="display:none;">
          ${this._positionDelta >= 0 ? '+' : ''}${this._positionDelta.toFixed(1)}s
        </div>
        <div class="hud-best-lap" id="hud-best-lap" style="display:none;">
          BEST: <span id="hud-best-lap-time">--:--.--</span>
        </div>
      </div>

      <!-- Bottom Left: Item Box & Drift Charge -->
      <div class="hud-corner hud-bl" id="hud-item-container">
        <div class="hud-item-box" id="hud-item-box">
          <div class="hud-item-icon" id="hud-item-icon">—</div>
          <div class="hud-item-name" id="hud-item-name"></div>
        </div>
        <div class="hud-drift-charge" id="hud-drift-charge">
          <div class="hud-drift-label">TURBO</div>
          <div class="hud-drift-bar">
            <div class="hud-drift-fill" id="hud-drift-fill"></div>
          </div>
          <div class="hud-drift-tier" id="hud-drift-tier"></div>
        </div>
      </div>

      <!-- Bottom Right: Speedometer -->
      <div class="hud-speed-container" id="hud-speed-container">
        ${this._options.analogSpeedo ? this._analogSpeedoHTML() : this._digitalSpeedoHTML()}
      </div>

      <!-- Center Top: Countdown Overlay -->
      <div class="hud-countdown-overlay" id="hud-countdown" style="display:none;">
        <div class="hud-countdown-value" id="hud-countdown-value">3</div>
      </div>

      <!-- Center: Race Messages -->
      <div class="hud-message" id="hud-message" style="display:none;"></div>

      <!-- Pause Button (top right corner) -->
      <button class="hud-pause-btn" id="hud-pause-btn" title="Pause (ESC)">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <rect x="6" y="4" width="4" height="16"/>
          <rect x="14" y="4" width="4" height="16"/>
        </svg>
      </button>

      <!-- Minimap Container (bottom center-right) -->
      <div class="hud-minimap-container" id="hud-minimap-container"></div>

      <!-- Ability Cooldown (if applicable) -->
      <div class="hud-ability-container" id="hud-ability-container" style="display:none;">
        <div class="hud-ability-icon" id="hud-ability-icon">⚡</div>
        <div class="hud-ability-cooldown-ring" id="hud-ability-ring">
          <svg viewBox="0 0 36 36" class="circular-chart">
            <path class="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
            <path class="circle" id="hud-ability-circle" stroke-dasharray="0, 100"/>
          </svg>
        </div>
        <div class="hud-ability-key" id="hud-ability-key">Q</div>
      </div>

      <!-- Rankings Panel (hidden by default, toggleable) -->
      <div class="hud-rankings-panel" id="hud-rankings" style="display:none;">
        <div class="hud-rankings-header">STANDINGS</div>
        <div class="hud-rankings-list" id="hud-rankings-list"></div>
      </div>

      <!-- Split Times (for time trial mode) -->
      <div class="hud-split-times" id="hud-split-times" style="display:none;">
        <div class="hud-split-header">SPLIT TIMES</div>
        <div class="split-list" id="hud-split-list"></div>
      </div>

      <!-- Controls Hint -->
      <div class="hud-controls-hint" id="hud-controls-hint">
        WASD drive · SPACE drift · E item · ESC pause
      </div>
    `;
  }

  _digitalSpeedoHTML() {
    return `
      <div class="hud-speed-digital">
        <div class="hud-speed-value" id="hud-speed">0</div>
        <div class="hud-speed-unit">KM/H</div>
      </div>
    `;
  }

  _analogSpeedoHTML() {
    return `
      <div class="hud-speed-analog">
        <svg viewBox="0 0 120 120" class="speed-gauge">
          <defs>
            <linearGradient id="speedGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#00ff88"/>
              <stop offset="50%" stop-color="#ffff00"/>
              <stop offset="100%" stop-color="#ff4444"/>
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="54" fill="rgba(10,12,20,0.85)" stroke="#2a3040" stroke-width="2"/>
          <path id="speed-arc" fill="none" stroke="url(#speedGradient)" stroke-width="6" 
                stroke-linecap="round" d="M 20 90 A 50 50 0 1 1 100 90"
                stroke-dasharray="157 157" stroke-dashoffset="157"/>
          <text x="60" y="75" text-anchor="middle" fill="white" font-size="22" font-weight="bold" 
                id="hud-speed-analog">0</text>
          <text x="60" y="92" text-anchor="middle" fill="#8892a0" font-size="9">KM/H</text>
        </svg>
      </div>
    `;
  }

  _cacheElements() {
    const get = (id) => document.getElementById(id);
    
    this._elements = {
      position: get('hud-position'),
      positionSuffix: get('hud-position-suffix'),
      totalRacers: get('hud-total-racers'),
      lapCurrent: get('hud-lap-current'),
      lapTotal: get('hud-lap-total'),
      lapProgress: get('hud-lap-progress'),
      raceTime: get('hud-race-time'),
      positionDelta: get('hud-position-delta'),
      bestLap: get('hud-best-lap'),
      bestLapTime: get('hud-best-lap-time'),
      itemBox: get('hud-item-box'),
      itemIcon: get('hud-item-icon'),
      itemName: get('hud-item-name'),
      driftFill: get('hud-drift-fill'),
      driftTier: get('hud-drift-tier'),
      speed: get('hud-speed'),
      speedArc: get('speed-arc'),
      speedAnalog: get('hud-speed-analog'),
      countdown: get('hud-countdown'),
      countdownValue: get('hud-countdown-value'),
      message: get('hud-message'),
      pauseBtn: get('hud-pause-btn'),
      minimapContainer: get('hud-minimap-container'),
      abilityContainer: get('hud-ability-container'),
      abilityIcon: get('hud-ability-icon'),
      abilityCircle: get('hud-ability-circle'),
      abilityKey: get('hud-ability-key'),
      rankings: get('hud-rankings'),
      rankingsList: get('hud-rankings-list'),
      splitTimes: get('hud-split-times'),
      splitList: get('hud-split-list'),
      controlsHint: get('hud-controls-hint')
    };
  }

  _setupEvents() {
    // Pause button
    this._elements.pauseBtn?.addEventListener('click', () => {
      this._onPause?.();
    });
  }

  // ==================== UPDATE METHODS ====================

  /**
   * Main update call - call every frame during race
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    if (!this._visible) return;

    // Update countdown timer
    if (this._showCountdown && this._messageTimer > 0) {
      this._messageTimer -= dt;
      if (this._messageTimer <= 0) {
        this._showCountdown = false;
        this._elements.countdown.style.display = 'none';
      }
    }

    // Update message timer
    if (this._message && this._messageTimer > 0) {
      this._messageTimer -= dt;
      if (this._messageTimer <= 0) {
        this.hideMessage();
      }
    }

    // Update ability cooldown visual
    if (this._abilityCooldown > 0) {
      this._abilityCooldown -= dt;
      this._updateAbilityVisual();
    }

    // Render minimap
    this._minimap?.render();
  }

  /**
   * Update position display
   * @param {number} position - Current race position (1-based)
   * @param {number} total - Total number of racers
   */
  setPosition(position, total) {
    this._position = position;
    this._totalRacers = total;

    if (this._elements.position) this._elements.position.textContent = position;
    if (this._elements.positionSuffix) this._elements.positionSuffix.textContent = getOrdinalSuffix(position);
    if (this._elements.totalRacers) this._elements.totalRacers.textContent = total;
  }

  /**
   * Update lap counter
   * @param {number} current - Current lap
   * @param {number} total - Total laps
   * @param {number} progress - Lap progress (0-1)
   */
  setLap(current, total, progress = 0) {
    this._currentLap = current;
    this._totalLaps = total;

    if (this._elements.lapCurrent) this._elements.lapCurrent.textContent = current;
    if (this._elements.lapTotal) this._elements.lapTotal.textContent = total;
    if (this._elements.lapProgress) {
      this._elements.lapProgress.style.width = `${progress * 100}%`;
    }

    // Also update minimap lap counter
    this._minimap?.setLap(current, total);
  }

  /**
   * Update speed display
   * @param {number} speedKmh - Speed in km/h
   */
  setSpeed(speedKmh) {
    this._speed = Math.round(speedKmh);

    if (this._options.analogSpeedo) {
      if (this._elements.speedAnalog) this._elements.speedAnalog.textContent = this._speed;
      if (this._elements.speedArc) {
        const percent = Math.min(1, this._speed / this._maxSpeed);
        const arcLength = 157; // Approximate circumference of arc
        const offset = arcLength * (1 - percent);
        this._elements.speedArc.setAttribute('stroke-dashoffset', offset);
      }
    } else {
      if (this._elements.speed) this._elements.speed.textContent = this._speed;
    }
  }

  /**
   * Set max speed for gauge calibration
   * @param {number} maxSpeed 
   */
  setMaxSpeed(maxSpeed) {
    this._maxSpeed = maxSpeed;
  }

  /**
   * Update current held item
   * @param {object|null} item - Item object or null
   */
  setCurrentItem(item) {
    this._currentItem = item;

    if (this._elements.itemIcon) {
      if (item) {
        this._elements.itemIcon.textContent = item.icon || item.id?.toUpperCase() || '?';
        this._elements.itemBox?.classList.add('has-item');
      } else {
        this._elements.itemIcon.textContent = '—';
        this._elements.itemBox?.classList.remove('has-item');
      }
    }
    if (this._elements.itemName) {
      this._elements.itemName.textContent = item?.name || '';
    }
  }

  /**
   * Update drift/mini-turbo charge
   * @param {number} charge - Charge value 0-100
   * @param {number} tier - Turbo tier (0=none, 1=blue, 2=red, 3=purple)
   */
  setDriftCharge(charge, tier = 0) {
    this._driftCharge = charge;
    this._driftTier = tier;

    if (this._elements.driftFill) {
      this._elements.driftFill.style.width = `${charge}%`;
      
      // Color based on tier
      const colors = ['#00e5ff', '#ff6b35', '#ff00ff'];
      this._elements.driftFill.style.background = colors[Math.min(tier, 2)] || colors[0];
    }
    if (this._elements.driftTier) {
      const tierLabels = ['', '⬆', '⬆⬆', '⬆⬆⬆'];
      this._elements.driftTier.textContent = tierLabels[tier] || '';
    }
  }

  /**
   * Update race timer
   * @param {number} time - Elapsed time in seconds
   */
  setRaceTime(time) {
    this._raceTime = time;
    if (this._elements.raceTime) {
      this._elements.raceTime.textContent = this._formatTime(time);
    }
  }

  /**
   * Update best lap time
   * @param {number|null} time - Best lap in seconds, or null to hide
   */
  setBestLap(time) {
    if (time !== null && time < Infinity) {
      this._bestLapTime = time;
      if (this._elements.bestLap) this._elements.bestLap.style.display = '';
      if (this._elements.bestLapTime) this._elements.bestLapTime.textContent = this._formatTime(time);
    } else {
      if (this._elements.bestLap) this._elements.bestLap.style.display = 'none';
    }
  }

  /**
   * Show/update position delta (time to racer ahead/behind)
   * @param {number} delta - Positive = behind leader, negative = ahead
   */
  setPositionDelta(delta) {
    this._positionDelta = delta;
    
    if (this._elements.positionDelta && delta !== 0) {
      this._elements.positionDelta.style.display = '';
      this._elements.positionDelta.textContent = `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}s`;
      this._elements.positionDelta.className = `hud-position-delta ${delta >= 0 ? 'delta-behind' : 'delta-ahead'}`;
    } else if (this._elements.positionDelta) {
      this._elements.positionDelta.style.display = 'none';
    }
  }

  /**
   * Show countdown overlay
   * @param {string|number} value - "3", "2", "1", or "GO!"
   */
  showCountdown(value) {
    this._showCountdown = true;
    this._countdownValue = value;
    this._messageTimer = 1; // 1 second per count
    
    if (this._elements.countdown) {
      this._elements.countdown.style.display = 'flex';
    }
    if (this._elements.countdownValue) {
      this._elements.countdownValue.textContent = value;
      
      // Style based on value
      if (value === 'GO!') {
        this._elements.countdownValue.style.color = '#00ff88';
        this._elements.countdownValue.classList.add('go-flash');
      } else {
        this._elements.countdownValue.style.color = '#00e5ff';
        this._elements.countdownValue.classList.remove('go-flash');
      }
    }
  }

  /**
   * Hide countdown overlay
   */
  hideCountdown() {
    this._showCountdown = false;
    if (this._elements.countdown) {
      this._elements.countdown.style.display = 'none';
    }
  }

  /**
   * Show a race message (CHECKPOINT!, NEW RECORD!, etc.)
   * @param {string} text - Message text
   * @param {string} type - 'info', 'success', 'warning'
   * @param {number} duration - Display duration in seconds
   */
  showMessage(text, type = 'info', duration = 2) {
    this._message = text;
    this._messageTimer = duration;

    if (this._elements.message) {
      this._elements.message.style.display = '';
      this._elements.message.textContent = text;
      this._elements.message.className = `hud-message hud-message-${type}`;
    }
  }

  /**
   * Hide current message
   */
  hideMessage() {
    this._message = null;
    if (this._elements.message) {
      this._elements.message.style.display = 'none';
    }
  }

  /**
   * Update ability cooldown display
   * @param {number} current - Current cooldown remaining
   * @param {number} max - Maximum cooldown
   * @param {boolean} ready - Is ability ready to use
   */
  setAbilityCooldown(current, max, ready = true) {
    this._abilityCooldown = current;
    this._abilityMaxCooldown = max;
    this._abilityReady = ready;

    if (this._elements.abilityContainer) {
      this._elements.abilityContainer.style.display = ready ? '' : 'none';
    }
    this._updateAbilityVisual();
  }

  _updateAbilityVisual() {
    if (!this._elements.abilityCircle) return;

    const percent = this._abilityCooldown > 0 ? 
      (1 - this._abilityCooldown / this._abilityMaxCooldown) * 100 : 100;
    
    this._elements.abilityCircle.setAttribute('stroke-dasharray', `${percent}, 100`);

    // Add ready pulse when fully charged
    if (percent >= 100) {
      this._elements.abilityContainer?.classList.add('ready');
    } else {
      this._elements.abilityContainer?.classList.remove('ready');
    }
  }

  /**
   * Set ability icon and key binding
   * @param {string} icon - Icon character or emoji
   * @param {string} key - Key binding label
   */
  setAbilityInfo(icon, key = 'Q') {
    if (this._elements.abilityIcon) this._elements.abilityIcon.textContent = icon;
    if (this._elements.abilityKey) this._elements.abilityKey.textContent = key;
  }

  /**
   * Update standings/rankings list
   * @param {Array} rankings - Array of { position, name, lap, timeDiff }
   */
  setRankings(rankings) {
    this._rankings = rankings;

    if (!this._elements.rankingsList) return;

    this._elements.rankingsList.innerHTML = rankings.map((r, i) => `
      <div class="ranking-row ${r.isPlayer ? 'player-row' : ''}">
        <span class="rank-pos">${r.position}</span>
        <span class="rank-name">${r.name}</span>
        <span class="rank-lap">L${r.lap}</span>
        <span class="rank-diff">${r.timeDiff || ''}</span>
      </div>
    `).join('');
  }

  /**
   * Toggle rankings panel visibility
   * @param {boolean} show 
   */
  showRankings(show) {
    if (this._elements.rankings) {
      this._elements.rankings.style.display = show ? '' : 'none';
    }
  }

  /**
   * Update split times (time trial mode)
   * @param {Array} splits - Array of { sector, time, bestDiff }
   */
  setSplitTimes(splits) {
    this._splitTimes = splits;

    if (!this._elements.splitList) return;

    this._elements.splitList.innerHTML = splits.map(s => `
      <div class="split-row">
        <span>Sector ${s.sector}</span>
        <span>${this._formatTime(s.time)}</span>
        <span class="${s.bestDiff < 0 ? 'split-better' : 'split-worse'}">
          ${s.bestDiff !== null ? (s.bestDiff >= 0 ? '+' : '') + s.bestDiff.toFixed(2) : ''}
        </span>
      </div>
    `).join('');
  }

  /**
   * Enable/disable split times display
   * @param {boolean} enable 
   */
  showSplitTimes(enable) {
    if (this._elements.splitTimes) {
      this._elements.splitTimes.style.display = enable ? '' : 'none';
    }
  }

  /**
   * Get minimap instance for external updates
   * @returns {Minimap}
   */
  getMinimap() {
    return this._minimap;
  }

  /**
   * Show/hide entire HUD
   * @param {boolean} visible 
   */
  setVisible(visible) {
    this._visible = visible;
    if (this._container) {
      this._container.style.display = visible ? '' : 'none';
    }
  }

  /**
   * Set callback for pause button
   * @param {function} cb 
   */
  onPause(cb) {
    this._onPause = cb;
  }

  /**
   * Format time as M:SS.mm
   * @param {number} seconds 
   * @returns {string}
   */
  _formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(2).padStart(5, '0')}`;
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._minimap?.destroy();
    this._minimap = null;
    this._container = null;
    this._elements = {};
  }
}

export default RaceHUD;
export { RaceHUD };
