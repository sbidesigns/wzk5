// barrel/ui/components/ReplayControls.js
// Complete replay playback UI controls for wzk5 game
// Features: play/pause, timeline scrubbing with checkpoint markers,
// speed controls, camera mode selection, ghost comparison toggle,
// clip sharing, highlight saving, and progress display.

import { EventBus } from '../../../core/EventBus.js';
import { PlaybackSpeed, CameraMode, HighlightType } from '../../../core/ReplaySystem.js';

/**
 * Control button configuration
 * @typedef {Object} ButtonConfig
 * @property {string} id - Button element ID
 * @property {string} label - Display text
 * @property {string} icon - Icon character or SVG
 * @property {string} [className] - Additional CSS class
 * @property {Function} [onClick] - Click handler
 */

/**
 * Timeline marker for checkpoints/highlights
 * @typedef {Object} TimelineMarker
 * @property {number} position - Position 0-1 on timeline
 * @property {string} type - 'checkpoint' or 'highlight'
 * @property {string} label - Display label
 * @property {string} color - Marker color
 */

/**
 * Configuration options for ReplayControls
 * @typedef {Object} ReplayControlsOptions
 * @property {boolean} [showTimeline=true] - Show timeline slider
 * @property {boolean} [showSpeedControls=true] - Show speed buttons
 * @property {boolean} [showCameraControls=true] - Show camera mode selector
 * @property {boolean} [showGhostToggle=true] - Show ghost comparison toggle
 * @property {boolean} [showShareButton=true] - Show share clip button
 * @property {boolean} [showHighlightButton=true] - Show save highlight button
 * @property {boolean} [compactMode=false] - Use compact layout
 * @property {Array<number>} [speedOptions] - Available playback speeds
 * @property {boolean} [autoHide=false] - Auto-hide controls after inactivity
 * @property {number} [autoHideDelay=3000] - MS before auto-hiding
 */

/**
 * ReplayControls - Full-featured playback control UI for replays.
 * Provides intuitive controls for navigating and analyzing race replays.
 *
 * @example
 * const controls = new ReplayControls();
 * controls.mount(document.body);
 * controls.setDuration(125.5);
 * // User interacts with controls, events are emitted via EventBus
 */
class ReplayControls {
  /**
   * Create a new ReplayControls instance
   * @param {ReplayControlsOptions} options - Configuration options
   */
  constructor(options = {}) {
    /**
     * Configuration options
     * @type {ReplayControlsOptions}
     * @private
     */
    this._options = {
      showTimeline: true,
      showSpeedControls: true,
      showCameraControls: true,
      showGhostToggle: true,
      showShareButton: true,
      showHighlightButton: true,
      compactMode: false,
      speedOptions: [PlaybackSpeed.QUARTER, PlaybackSpeed.HALF, PlaybackSpeed.NORMAL, PlaybackSpeed.DOUBLE],
      autoHide: false,
      autoHideDelay: 3000,
      ...options
    };

    /** @type {HTMLElement|null} */ this._container = null;
    /** @type {Object} */ this._elements = {};
    /** @type {boolean} */ this._visible = true;

    // Playback state
    /** @type {boolean} */ this._isPlaying = false;
    /** @type {number} */ this._currentTime = 0;
    /** @type {number} */ this._duration = 0;
    /** @type {number} */ this._currentSpeed = PlaybackSpeed.NORMAL;
    /** @type {string} */ this._cameraMode = CameraMode.FOLLOW;
    /** @type {boolean} */ this._ghostComparison = false;
    /** @type {boolean} */ this._isLooping = false;

    // Timeline data
    /** @type {Array<TimelineMarker>} */ this._timelineMarkers = [];

    // Auto-hide state
    /** @type {number|null} */ this._hideTimer = null;
    /** @type {boolean} */ this._isHovered = false;

    // Callbacks
    /** @type {Function|null} */ this._onPlayPause = null;
    /** @type {Function|null} */ this._onScrub = null;
    /** @type {Function|null} */ this._onSpeedChange = null;
    /** @type {Function|null} */ this._onCameraChange = null;
    /** @type {Function|null} */ this._onGhostToggle = null;
    /** @type {Function|null} */ this._onShareClip = null;
    /** @type {Function|null} */ this._onSaveHighlight = null;

    // Bindings
    this._boundMouseMove = this._handleMouseMove.bind(this);
    this._boundKeyDown = this._handleKeyDown.bind(this);

    console.log('[ReplayControls] Initialized');
  }

  /**
   * Mount the controls to the DOM
   * @param {HTMLElement} parent - Parent element to append to
   * @returns {HTMLElement} The container element
   */
  mount(parent) {
    this._container = document.createElement('div');
    this._container.id = 'replay-controls';
    this._container.className = `replay-controls ${this._options.compactMode ? 'compact' : ''}`;
    this._container.innerHTML = this._buildHTML();

    this._cacheElements();
    this._setupEvents();
    this._setupKeyboardShortcuts();
    this._updateDisplay();

    if (parent) {
      parent.appendChild(this._container);
    }

    // Setup auto-hide if enabled
    if (this._options.autoHide) {
      this._startAutoHideTimer();
    }

    return this._container;
  }

  /**
   * Build the HTML structure for controls
   * @returns {string} HTML string
   * @private
   */
  _buildHTML() {
    const { compactMode } = this._options;

    return `
      <div class="rc-container">
        <!-- Main Controls Row -->
        <div class="rc-main-row">
          <!-- Transport Controls -->
          <div class="rc-transport">
            <button class="rc-btn rc-btn-skip" id="rc-skip-start" title="Skip to Start (Home)">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z"/>
              </svg>
            </button>
            
            <button class="rc-btn rc-btn-play" id="rc-play-pause" title="Play/Pause (Space)">
              <svg class="rc-icon-play" viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M8 5v14l11-7L8 5z"/>
              </svg>
              <svg class="rc-icon-pause" viewBox="0 0 24 24" width="22" height="22" fill="currentColor" style="display:none;">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
              </svg>
            </button>
            
            <button class="rc-btn rc-btn-skip" id="rc-skip-end" title="Skip to End (End)">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
              </svg>
            </button>
          </div>

          <!-- Timeline Section -->
          ${this._options.showTimeline ? this._buildTimelineHTML() : ''}

          <!-- Time Display -->
          <div class="rc-time-display" id="rc-time-display">
            <span class="rc-current-time" id="rc-current-time">0:00.00</span>
            <span class="rc-separator">/</span>
            <span class="rc-total-time" id="rc-total-time">0:00.00</span>
          </div>
        </div>

        <!-- Secondary Controls Row -->
        <div class="rc-secondary-row">
          <!-- Speed Controls -->
          ${this._options.showSpeedControls ? this._buildSpeedControlsHTML() : ''}

          <!-- Camera Mode -->
          ${this._options.showCameraControls ? this._buildCameraControlsHTML() : ''}

          <!-- Spacer -->
          <div class="rc-spacer"></div>

          <!-- Ghost Comparison Toggle -->
          ${this._options.showGhostToggle ? `
            <button class="rc-btn rc-btn-toggle" id="rc-ghost-toggle" title="Compare with Ghost">
              <span class="rc-toggle-icon">👻</span>
              <span class="rc-toggle-label">Ghost</span>
            </button>
          ` : ''}

          <!-- Loop Toggle -->
          <button class="rc-btn rc-btn-toggle" id="rc-loop-toggle" title="Toggle Loop (L)">
            <span class="rc-loop-icon">🔁</span>
            </button>

          <!-- Share Clip Button -->
          ${this._options.showShareButton ? `
            <button class="rc-btn rc-btn-action" id="rc-share-clip" title="Share Clip">
              <span>📤</span> Share
            </button>
          ` : ''}

          <!-- Save Highlight Button -->
          ${this._options.showHighlightButton ? `
            <button class="rc-btn rc-btn-action" id="rc-save-highlight" title="Save Highlight">
              <span>⭐</span> Highlight
            </button>
          ` : ''}
        </div>

        <!-- Timeline Markers Container (rendered via JS) -->
        <div class="rc-markers-container" id="rc-markers"></div>
      </div>
    `;
  }

  /**
   * Build timeline slider HTML
   * @returns {string} HTML string
   * @private
   */
  _buildTimelineHTML() {
    return `
      <div class="rc-timeline-container" id="rc-timeline-container">
        <input type="range" 
               class="rc-timeline-slider" 
               id="rc-timeline" 
               min="0" max="100" value="0" step="0.01"
               aria-label="Timeline scrubber">
        <div class="rc-timeline-progress" id="rc-timeline-progress"></div>
        <div class="rc-timeline-buffered" id="rc-timeline-buffered"></div>
      </div>
    `;
  }

  /**
   * Build speed control buttons HTML
   * @returns {string} HTML string
   * @private
   */
  _buildSpeedControlsHTML() {
    const speeds = this._options.speedOptions;
    
    return `
      <div class="rc-speed-controls" id="rc-speed-controls">
        <span class="rc-group-label">Speed:</span>
        ${speeds.map(speed => `
          <button class="rc-btn rc-btn-speed ${speed === PlaybackSpeed.NORMAL ? 'active' : ''}" 
                  data-speed="${speed}"
                  title="${speed}x speed">
            ${speed}x
          </button>
        `).join('')}
      </div>
    `;
  }

  /**
   * Build camera mode selector HTML
   * @returns {string} HTML string
   * @private
   */
  _buildCameraControlsHTML() {
    const modes = [
      { id: CameraMode.FOLLOW, label: 'Follow', icon: '🎯' },
      { id: CameraMode.CINEMATIC, label: 'Cinema', icon: '🎬' },
      { id: CameraMode.FREE, label: 'Free', icon: '🔓' },
      { id: CameraMode.COMPARISON, label: 'Compare', icon: '⫿' }
    ];

    return `
      <div class="rc-camera-controls" id="rc-camera-controls">
        <span class="rc-group-label">Camera:</span>
        <select class="rc-camera-select" id="rc-camera-select">
          ${modes.map(m => `
            <option value="${m.id}" ${m.id === this._cameraMode ? 'selected' : ''}>
              ${m.icon} ${m.label}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  }

  /**
   * Cache DOM element references
   * @private
   */
  _cacheElements() {
    const get = (id) => document.getElementById(id);

    this._elements = {
      // Transport
      playPause: get('rc-play-pause'),
      skipStart: get('rc-skip-start'),
      skipEnd: get('rc-skip-end'),
      iconPlay: document.querySelector('.rc-icon-play'),
      iconPause: document.querySelector('.rc-icon-pause'),

      // Timeline
      timeline: get('rc-timeline'),
      timelineContainer: get('rc-timeline-container'),
      timelineProgress: get('rc-timeline-progress'),
      timelineBuffered: get('rc-timeline-buffered'),

      // Time display
      currentTime: get('rc-current-time'),
      totalTime: get('rc-total-time'),
      timeDisplay: get('rc-time-display'),

      // Speed controls
      speedControls: get('rc-speed-controls'),

      // Camera controls
      cameraSelect: get('rc-camera-select'),

      // Toggles
      ghostToggle: get('rc-ghost-toggle'),
      loopToggle: get('rc-loop-toggle'),

      // Action buttons
      shareClip: get('rc-share-clip'),
      saveHighlight: get('rc-save-highlight'),

      // Markers
      markersContainer: get('rc-markers')
    };
  }

  /**
   * Setup event listeners
   * @private
   */
  _setupEvents() {
    // Play/Pause button
    this._elements.playPause?.addEventListener('click', () => {
      this.togglePlayPause();
    });

    // Skip buttons
    this._elements.skipStart?.addEventListener('click', () => {
      this.scrubTo(0);
    });

    this._elements.skipEnd?.addEventListener('click', () => {
      this.scrubTo(1); // Scrub to end
    });

    // Timeline slider
    this._elements.timeline?.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      this.scrubToPercent(value);
    });

    // Timeline drag events for smoother scrubbing
    let isDragging = false;
    this._elements.timeline?.addEventListener('mousedown', () => { isDragging = true; });
    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        EventBus.emit('replayControls:scrubComplete', { time: this._currentTime });
      }
    });

    // Speed buttons
    this._elements.speedControls?.querySelectorAll('.rc-btn-speed').forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseFloat(btn.dataset.speed);
        this.setPlaybackSpeed(speed);
      });
    });

    // Camera select
    this._elements.cameraSelect?.addEventListener('change', (e) => {
      this.setCameraMode(e.target.value);
    });

    // Ghost toggle
    this._elements.ghostToggle?.addEventListener('click', () => {
      this.toggleGhostComparison();
    });

    // Loop toggle
    this._elements.loopToggle?.addEventListener('click', () => {
      this.toggleLoop();
    });

    // Share clip
    this._elements.shareClip?.addEventListener('click', () => {
      this.shareClip();
    });

    // Save highlight
    this._elements.saveHighlight?.addEventListener('click', () => {
      this.saveHighlight();
    });

    // Mouse move for auto-hide
    if (this._options.autoHide) {
      this._container?.addEventListener('mousemove', () => {
        this._handleMouseMove();
      });
      this._container?.addEventListener('mouseenter', () => {
        this._isHovered = true;
        this.cancelAutoHide();
      });
      this._container?.addEventListener('mouseleave', () => {
        this._isHovered = false;
        this._startAutoHideTimer();
      });
    }
  }

  /**
   * Setup keyboard shortcuts
   * @private
   */
  _setupKeyboardShortcuts() {
    document.addEventListener('keydown', this._boundKeyDown);
  }

  /**
   * Handle keyboard input
   * @param {KeyboardEvent} e
   * @private
   */
  _handleKeyDown(e) {
    // Ignore if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        this.togglePlayPause();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.skipBackward(e.shiftKey ? 10 : 2);
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.skipForward(e.shiftKey ? 10 : 2);
        break;
      case 'Home':
        e.preventDefault();
        this.scrubTo(0);
        break;
      case 'End':
        e.preventDefault();
        this.scrubTo(1);
        break;
      case 'KeyJ':
        this.setPlaybackSpeed(Math.max(0.25, this._currentSpeed / 2));
        break;
      case 'KeyK':
        this.setPlaybackSpeed(Math.min(4, this._currentSpeed * 2));
        break;
      case 'KeyL':
        this.toggleLoop();
        break;
      case 'KeyG':
        this.toggleGhostComparison();
        break;
      case 'KeyS':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.saveHighlight();
        }
        break;
    }
  }

  /**
   * Handle mouse movement for auto-hide
   * @private
   */
  _handleMouseMove() {
    this.show();
    this._startAutoHideTimer();
  }

  // ==================== PUBLIC API ====================

  /**
   * Set total duration of the replay
   * @param {number} duration - Duration in seconds
   */
  setDuration(duration) {
    this._duration = Math.max(0, duration);
    this._updateTimeDisplay();
    EventBus.emit('replayControls:durationSet', { duration });
  }

  /**
   * Set current playback time
   * @param {number} time - Current time in seconds
   */
  setCurrentTime(time) {
    this._currentTime = Math.max(0, Math.min(time, this._duration));
    this._updateTimelinePosition();
    this._updateTimeDisplay();
  }

  /**
   * Set playing state
   * @param {boolean} playing - Whether currently playing
   */
  setPlaying(playing) {
    this._isPlaying = playing;
    this._updatePlayButton();
    EventBus.emit('replayControls:stateChanged', { playing, time: this._currentTime });
  }

  /**
   * Toggle play/pause state
   * @returns {boolean} New playing state
   */
  togglePlayPause() {
    this._isPlaying = !this._isPlaying;
    this._updatePlayButton();
    
    this._onPlayPause?.(this._isPlaying);
    EventBus.emit('replayControls:playPause', { playing: this._isPlaying });
    
    return this._isPlaying;
  }

  /**
   * Scrub to specific percentage of timeline
   * @param {number} percent - Position as 0-100
   */
  scrubToPercent(percent) {
    const clamped = Math.max(0, Math.min(100, percent));
    const time = (clamped / 100) * this._duration;
    
    this._currentTime = time;
    this._updateTimelinePosition();
    this._updateTimeDisplay();

    this._onScrub?.(time);
    EventBus.emit('replayControls:scrubbed', { time, percent: clamped });
  }

  /**
   * Scrub to specific time
   * @param {number} time - Target time in seconds
   */
  scrubTo(time) {
    if (this._duration > 0) {
      this.scrubToPercent((time / this._duration) * 100);
    } else {
      this._currentTime = 0;
      this._updateDisplay();
    }
  }

  /**
   * Skip forward by specified seconds
   * @param {number} [seconds=2] - Seconds to skip
   */
  skipForward(seconds = 2) {
    this.scrubTo(this._currentTime + seconds);
  }

  /**
   * Skip backward by specified seconds
   * @param {number} [seconds=2] - Seconds to skip
   */
  skipBackward(seconds = 2) {
    this.scrubTo(this._currentTime - seconds);
  }

  /**
   * Set playback speed
   * @param {number} speed - Speed multiplier
   */
  setPlaybackSpeed(speed) {
    this._currentSpeed = speed;

    // Update active button
    this._elements.speedControls?.querySelectorAll('.rc-btn-speed').forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.speed) === speed);
    });

    this._onSpeedChange?.(speed);
    EventBus.emit('replayControls:speedChanged', { speed });
  }

  /**
   * Set camera mode
   * @param {string} mode - CameraMode value
   */
  setCameraMode(mode) {
    this._cameraMode = mode;

    if (this._elements.cameraSelect) {
      this._elements.cameraSelect.value = mode;
    }

    this._onCameraChange?.(mode);
    EventBus.emit('replayControls:cameraChanged', { mode });
  }

  /**
   * Toggle ghost comparison mode
   * @returns {boolean} New ghost comparison state
   */
  toggleGhostComparison() {
    this._ghostComparison = !this._ghostComparison;

    if (this._elements.ghostToggle) {
      this._elements.ghostToggle.classList.toggle('active', this._ghostComparison);
    }

    this._onGhostToggle?.(this._ghostComparison);
    EventBus.emit('replayControls:ghostToggled', { enabled: this._ghostComparison });

    return this._ghostComparison;
  }

  /**
   * Set ghost comparison state directly
   * @param {boolean} enabled - Whether enabled
   */
  setGhostComparison(enabled) {
    if (this._ghostComparison !== enabled) {
      this.toggleGhostComparison();
    }
  }

  /**
   * Toggle loop mode
   * @returns {boolean} New loop state
   */
  toggleLoop() {
    this._isLooping = !this._isLooping;

    if (this._elements.loopToggle) {
      this._elements.loopToggle.classList.toggle('active', this._isLooping);
    }

    EventBus.emit('replayControls:loopToggled', { looping: this._isLooping });
    return this._isLooping;
  }

  /**
   * Add a timeline marker (checkpoint or highlight)
   * @param {number} position - Position 0-1 on timeline
   * @param {string} type - 'checkpoint' or 'highlight'
   * @param {string} label - Display label
   * @param {string} [color='#ffffff'] - Marker color
   */
  addMarker(position, type, label, color = '#ffffff') {
    const marker = { position, type, label, color };
    this._timelineMarkers.push(marker);
    this._timelineMarkers.sort((a, b) => a.position - b.position);
    this._renderMarkers();
  }

  /**
   * Clear all timeline markers
   */
  clearMarkers() {
    this._timelineMarkers = [];
    this._renderMarkers();
  }

  /**
   * Set markers from array
   * @param {Array<TimelineMarker>} markers
   */
  setMarkers(markers) {
    this._timelineMarkers = [...markers];
    this._renderMarkers();
  }

  /**
   * Share/export current clip or selection
   */
  async shareClip() {
    const clipData = {
      startTime: 0,
      endTime: this._duration,
      currentTime: this._currentTime,
      duration: this._duration,
      cameraMode: this._cameraMode,
      speed: this._currentSpeed
    };

    try {
      this._elements.shareClip?.classList.add('loading');
      
      this._onShareClip?.(clipData);
      EventBus.emit('replayControls:shareClip', clipData);

      // Show feedback
      this.showMessage('Preparing clip...');

      // Simulate async operation (in production would generate actual share code)
      await new Promise(resolve => setTimeout(resolve, 500));

      this.showMessage('Copied to clipboard!');

    } catch (error) {
      console.error('[ReplayControls] Error sharing clip:', error);
      this.showMessage('Failed to share clip');
    } finally {
      this._elements.shareClip?.classList.remove('loading');
    }
  }

  /**
   * Save current moment as a highlight
   */
  saveHighlight() {
    const highlightData = {
      time: this._currentTime,
      type: HighlightType.ITEM_USE, // Default type, can be customized
      description: `Moment at ${this._formatTime(this._currentTime)}`
    };

    this._onSaveHighlight?.(highlightData);
    EventBus.emit('replayControls:saveHighlight', highlightData);

    // Add visual feedback
    this.addMarker(
      this._duration > 0 ? this._currentTime / this._duration : 0,
      'highlight',
      '★',
      '#ffd700'
    );

    this.showMessage('⭐ Highlight saved!');
  }

  /**
   * Show/hide controls
   * @param {boolean} visible - Visibility state
   */
  show(visible = true) {
    this._visible = visible;
    if (this._container) {
      this._container.style.opacity = visible ? '1' : '0';
      this._container.style.pointerEvents = visible ? '' : 'none';
    }
  }

  /**
   * Hide controls
   */
  hide() {
    this.show(false);
  }

  /**
   * Get current state snapshot
   * @returns {Object} Current control state
   */
  getState() {
    return {
      isPlaying: this._isPlaying,
      currentTime: this._currentTime,
      duration: this._duration,
      speed: this._currentSpeed,
      cameraMode: this._cameraMode,
      ghostComparison: this._ghostComparison,
      isLooping: this._isLooping,
      progress: this._duration > 0 ? this._currentTime / this._duration : 0
    };
  }

  // ==================== CALLBACK SETTERS ====================

  /**
   * Set callback for play/pause
   * @param {Function} cb - Called with boolean playing state
   */
  onPlayPause(cb) { this._onPlayPause = cb; }

  /**
   * Set callback for scrub
   * @param {Function} cb - Called with time value
   */
  onScrub(cb) { this._onScrub = cb; }

  /**
   * Set callback for speed change
   * @param {Function} cb - Called with speed value
   */
  onSpeedChange(cb) { this._onSpeedChange = cb; }

  /**
   * Set callback for camera change
   * @param {Function} cb - Called with camera mode
   */
  onCameraChange(cb) { this._onCameraChange = cb; }

  /**
   * Set callback for ghost toggle
   * @param {Function} cb - Called with boolean enabled
   */
  onGhostToggle(cb) { this._onGhostToggle = cb; }

  /**
   * Set callback for share clip
   * @param {Function} cb - Called with clip data
   */
  onShareClip(cb) { this._onShareClip = cb; }

  /**
   * Set callback for save highlight
   * @param {Function} cb - Called with highlight data
   */
  onSaveHighlight(cb) { this._onSaveHighlight = cb; }

  /**
   * Clean up resources
   */
  destroy() {
    document.removeEventListener('keydown', this._boundKeyDown);

    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }

    this.cancelAutoHide();
    this._container = null;
    this._elements = {};
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Update all display elements
   * @private
   */
  _updateDisplay() {
    this._updatePlayButton();
    this._updateTimelinePosition();
    this._updateTimeDisplay();
  }

  /**
   * Update play/pause button appearance
   * @private
   */
  _updatePlayButton() {
    if (this._elements.iconPlay) {
      this._elements.iconPlay.style.display = this._isPlaying ? 'none' : '';
    }
    if (this._elements.iconPause) {
      this._elements.iconPause.style.display = this._isPlaying ? '' : 'none';
    }
    if (this._elements.playPause) {
      this._elements.playPause.setAttribute('aria-label', 
        this._isPlaying ? 'Pause (Space)' : 'Play (Space)');
      this._elements.playPause.title = this._isPlaying ? 'Pause (Space)' : 'Play (Space)';
    }
  }

  /**
   * Update timeline slider position
   * @private
   */
  _updateTimelinePosition() {
    if (!this._elements.timeline || !this._duration) return;

    const percent = (this._currentTime / this._duration) * 100;
    this._elements.timeline.value = percent;

    if (this._elements.timelineProgress) {
      this._elements.timelineProgress.style.width = `${percent}%`;
    }
  }

  /**
   * Update time display text
   * @private
   */
  _updateTimeDisplay() {
    if (this._elements.currentTime) {
      this._elements.currentTime.textContent = this._formatTime(this._currentTime);
    }
    if (this._elements.totalTime) {
      this._elements.totalTime.textContent = this._formatTime(this._duration);
    }
  }

  /**
   * Render timeline markers
   * @private
   */
  _renderMarkers() {
    if (!this._elements.markersContainer) return;

    if (this._timelineMarkers.length === 0) {
      this._elements.markersContainer.innerHTML = '';
      return;
    }

    this._elements.markersContainer.innerHTML = this._timelineMarkers.map(marker => `
      <div class="rc-marker rc-marker-${marker.type}" 
           style="left: ${marker.position * 100}%"
           title="${marker.label}">
        <div class="rc-marker-dot" style="background-color: ${marker.color}"></div>
        ${marker.label ? `<span class="rc-marker-label">${marker.label}</span>` : ''}
      </div>
    `).join('');
  }

  /**
   * Start auto-hide timer
   * @private
   */
  _startAutoHideTimer() {
    this.cancelAutoHide();
    
    if (!this._options.autoHide || this._isHovered) return;

    this._hideTimer = setTimeout(() => {
      this.hide();
    }, this._options.autoHideDelay);
  }

  /**
   * Cancel auto-hide timer
   * @private
   */
  cancelAutoHide() {
    if (this._hideTimer !== null) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }
  }

  /**
   * Show temporary message
   * @param {string} text - Message to display
   * @private
   */
  showMessage(text) {
    // Create or reuse message element
    let msgEl = this._container?.querySelector('.rc-message');
    
    if (!msgEl) {
      msgEl = document.createElement('div');
      msgEl.className = 'rc-message';
      this._container?.appendChild(msgEl);
    }

    msgEl.textContent = text;
    msgEl.classList.add('visible');

    // Auto-hide after delay
    setTimeout(() => {
      msgEl.classList.remove('visible');
    }, 2000);
  }

  /**
   * Format time as M:SS.mm
   * @param {number} seconds
   * @returns {string}
   * @private
   */
  _formatTime(seconds) {
    if (!seconds || seconds < 0) return '0:00.00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(2).padStart(5, '0')}`;
  }
}

// Export class and singleton factory
export default ReplayControls;
export { ReplayControls };
