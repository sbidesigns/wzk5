// barrel/ui/components/GhostComparisonHUD.js
// HUD overlay for ghost comparison in Time Trial mode
// Features: split-screen view, overlay mode, time delta display,
// delta graph over time, best split comparison per checkpoint

import { EventBus } from '../../../core/EventBus.js';

/**
 * Display modes for ghost comparison
 * @enum {string}
 */
export const ComparisonMode = {
  OVERLAY: 'overlay',           // Ghost rendered transparently over player view
  SPLIT_SCREEN: 'splitScreen',  // Player left, ghost right (or vice versa)
  DELTA_ONLY: 'deltaOnly',      // Only show delta information, no visual ghost
  MINIMAP: 'minimap'            // Show ghost position on minimap overlay
};

/**
 * Delta graph display styles
 * @enum {string}
 */
export const DeltaGraphStyle = {
  LINE: 'line',                 // Continuous line graph
  BAR: 'bar',                   // Bar chart style
  AREA: 'area',                 Filled area under line
  NONE: 'none'                  // Hide delta graph
};

/**
 * Configuration options for GhostComparisonHUD
 * @typedef {Object} GhostComparisonHUDOptions
 * @property {ComparisonMode} [defaultMode='overlay'] - Initial display mode
 * @property {DeltaGraphStyle} [graphStyle='area'] - Delta graph style
 * @property {boolean} [showDelta=true] - Show time delta display
 * @property {boolean} [showDeltaGraph=true] - Show delta history graph
 * @property {boolean} [showSplits=true] - Show split time comparison
 * @property {number} [graphHistoryLength=200] - Number of data points in graph
 * @property {number} [updateInterval=100] - Update interval in ms
 */

/**
 * Checkpoint split data for comparison
 * @typedef {Object} SplitData
 * @property {number} index - Checkpoint index
 * @property {number} playerTime - Player's split time
 * @property {number} ghostTime - Ghost's split time
 * @property {number} difference - Time difference (positive = player slower)
 * @property {boolean} isBest - Whether this is player's best split
 */

/**
 * Time delta data point for graph
 * @typedef {Object} DeltaPoint
 * @property {number} time - Timestamp of this reading
 * @property {number} value - Delta value at this time
 */

/**
 * GhostComparisonHUD - HUD overlay component for comparing player performance
 * against ghost replays. Supports multiple visualization modes and detailed
 * timing analysis.
 *
 * @example
 * const hud = new GhostComparisonHUD();
 * hud.mount(document.body);
 * hud.setGhostData(ghostReplay);
 * hud.setMode(ComparisonMode.SPLIT_SCREEN);
 * // In game loop:
 * hud.update(playerState, ghostState);
 */
class GhostComparisonHUD {
  /**
   * Create a new GhostComparisonHUD instance
   * @param {GhostComparisonHUDOptions} options - Configuration options
   */
  constructor(options = {}) {
    /**
     * Configuration options
     * @type {GhostComparisonHUDOptions}
     * @private
     */
    this._options = {
      defaultMode: ComparisonMode.OVERLAY,
      graphStyle: DeltaGraphStyle.AREA,
      showDelta: true,
      showDeltaGraph: true,
      showSplits: true,
      graphHistoryLength: 200,
      updateInterval: 100,
      ...options
    };

    /** @type {HTMLElement|null} */ this._container = null;
    /** @type {Object} */ this._elements = {};
    /** @type {boolean} */ this._visible = true;
    /** @type {ComparisonMode} */ this._mode = this._options.defaultMode;

    // Ghost data reference
    /** @type {Object|null} */ this._ghostData = null;
    /** @type {string} */ this._ghostName = 'Ghost';

    // Current state
    /** @type {number} */ this._currentTime = 0;
    /** @type {number} */ this._currentDelta = 0;
    /** @type {number} */ this._totalTime = 0;

    // Delta history for graph
    /** @type {Array<DeltaPoint>} */ this._deltaHistory = [];
    /** @type {number} */ this._lastGraphUpdate = 0;

    // Split times data
    /** @type {Array<SplitData>} */ this._splits = [];
    /** @type {number} */ this._currentCheckpoint = -1;

    // Canvas contexts for custom rendering
    /** @type {CanvasRenderingContext2D|null} */ this._graphCtx = null;
    /** @type {HTMLCanvasElement|null} */ this._graphCanvas = null;

    // Callbacks
    /** @type {Function|null} */ this._onModeChange = null;
    /** @type {Function|null} */ this._onSplitClick = null;

    console.log('[GhostComparisonHUD] Initialized');
  }

  /**
   * Mount the HUD to the DOM
   * @param {HTMLElement} parent - Parent element to append to
   * @returns {HTMLElement} The container element
   */
  mount(parent) {
    this._container = document.createElement('div');
    this._container.id = 'ghost-comparison-hud';
    this._container.className = 'ghost-comparison-hud';
    this._container.innerHTML = this._buildHTML();

    this._cacheElements();
    this._setupEvents();
    this._initGraph();

    if (parent) {
      parent.appendChild(this._container);
    }

    return this._container;
  }

  /**
   * Build the HTML structure for the HUD
   * @returns {string} HTML string
   * @private
   */
  _buildHTML() {
    return `
      <div class="gch-container ${this._mode}">
        <!-- Main Delta Display -->
        <div class="gch-delta-display" id="gch-delta" style="display:none;">
          <div class="gch-delta-label">vs GHOST</div>
          <div class="gch-delta-value" id="gch-delta-value">+0.00s</div>
          <div class="gch-delta-indicator" id="gch-delta-indicator">
            <span class="gch-arrow" id="gch-arrow">→</span>
          </div>
        </div>

        <!-- Delta Graph -->
        <div class="gch-graph-container" id="gch-graph-container" style="display:none;">
          <canvas class="gch-delta-graph" id="gch-delta-graph" width="300" height="80"></canvas>
          <div class="gch-graph-label">TIME GAP</div>
        </div>

        <!-- Split Times Panel -->
        <div class="gch-splits-panel" id="gch-splits-panel" style="display:none;">
          <div class="gch-splits-header">
            <span>SPLITS</span>
            <span class="gch-total-delta" id="gch-total-delta"></span>
          </div>
          <div class="gch-splits-list" id="gch-splits-list">
            <!-- Populated dynamically -->
          </div>
        </div>

        <!-- Mode Indicator -->
        <div class="gch-mode-indicator" id="gch-mode-indicator">
          <span class="gch-mode-icon" id="gch-mode-icon">◉</span>
          <span class="gch-mode-text" id="gch-mode-text">${this._getModeLabel()}</span>
        </div>

        <!-- Split Screen Overlay (for SPLIT_SCREEN mode) -->
        <div class="gch-split-overlay" id="gch-split-overlay" style="display:none;">
          <div class="gch-split-pane gch-split-player">
            <div class="gch-split-label">YOU</div>
            <div class="gch-split-time" id="gch-player-time">0:00.00</div>
          </div>
          <div class="gch-split-divider"></div>
          <div class="gch-split-pane gch-split-ghost">
            <div class="gch-split-label">${this._ghostName}</div>
            <div class="gch-split-time" id="gch-ghost-time">0:00.00</div>
          </div>
        </div>
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
      deltaDisplay: get('gch-delta'),
      deltaValue: get('gch-delta-value'),
      deltaIndicator: get('gch-delta-indicator'),
      arrow: get('gch-arrow'),
      graphContainer: get('gch-graph-container'),
      graphCanvas: get('gch-delta-graph'),
      graphLabel: get('gch-graph-label'),
      splitsPanel: get('gch-splits-panel'),
      splitsList: get('gch-splits-list'),
      totalDelta: get('gch-total-delta'),
      modeIndicator: get('gch-mode-indicator'),
      modeIcon: get('gch-mode-icon'),
      modeText: get('gch-mode-text'),
      splitOverlay: get('gch-split-overlay'),
      playerTime: get('gch-player-time'),
      ghostTime: get('gch-ghost-time')
    };
  }

  /**
   * Setup event listeners
   * @private
   */
  _setupEvents() {
    // Click on delta display to cycle modes
    this._elements.modeIndicator?.addEventListener('click', () => {
      this.cycleMode();
    });
  }

  /**
   * Initialize the delta graph canvas
   * @private
   */
  _initGraph() {
    if (!this._elements.graphCanvas) return;

    this._graphCanvas = this._elements.graphCanvas;
    this._graphCtx = this._graphCanvas.getContext('2d');

    // Set up canvas resolution for crisp rendering
    const dpr = window.devicePixelRatio || 1;
    const rect = this._graphCanvas.getBoundingClientRect();
    this._graphCanvas.width = rect.width * dpr;
    this._graphCanvas.height = rect.height * dpr;
    this._graphCtx.scale(dpr, dpr);
    this._graphCanvas.style.width = rect.width + 'px';
    this._graphCanvas.style.height = rect.height + 'px';
  }

  // ==================== PUBLIC METHODS ====================

  /**
   * Set the ghost data for comparison
   * @param {Object} ghostData - Ghost replay data
   * @param {string} [name='Ghost'] - Display name for the ghost
   */
  setGhostData(ghostData, name = 'Ghost') {
    this._ghostData = ghostData;
    this._ghostName = name;
    this._totalTime = ghostData?.duration || 0;

    // Initialize splits from ghost data if available
    if (ghostData?.checkpoints) {
      this._splits = ghostData.checkpoints.map((cp, i) => ({
        index: i,
        playerTime: 0,
        ghostTime: cp.time || 0,
        difference: 0,
        isBest: false
      }));
    }

    // Update visibility of components
    this._updateVisibility();

    console.log(`[GhostComparisonHUD] Set ghost: ${name}, duration: ${this._totalTime.toFixed(2)}s`);
  }

  /**
   * Set the comparison display mode
   * @param {ComparisonMode} mode - The mode to use
   */
  setMode(mode) {
    if (!Object.values(ComparisonMode).includes(mode)) {
      console.warn(`[GhostComparisonHUD] Invalid mode: ${mode}`);
      return;
    }

    this._mode = mode;

    // Update container class
    if (this._container) {
      this._container.className = `ghost-comparison-hud ${mode}`;
    }

    // Update mode indicator
    if (this._elements.modeText) {
      this._elements.modeText.textContent = this._getModeLabel();
    }
    if (this._elements.modeIcon) {
      this._elements.modeIcon.textContent = this._getModeIcon();
    }

    // Show/hide mode-specific elements
    this._updateVisibility();

    this._onModeChange?.(mode);
    EventBus.emit('ghostHud:modeChanged', { mode });
  }

  /**
   * Cycle through available modes
   * @returns {ComparisonMode} New mode after cycling
   */
  cycleMode() {
    const modes = Object.values(ComparisonMode);
    const currentIndex = modes.indexOf(this._mode);
    const nextIndex = (currentIndex + 1) % modes.length;
    this.setMode(modes[nextIndex]);
    return this._mode;
  }

  /**
   * Get current mode
   * @returns {ComparisonMode}
   */
  getMode() {
    return this._mode;
  }

  /**
   * Set the delta graph style
   * @param {DeltaGraphStyle} style - Graph style to use
   */
  setGraphStyle(style) {
    if (!Object.values(DeltaGraphStyle).includes(style)) return;
    
    this._options.graphStyle = style;
    EventBus.emit('ghostHud:graphStyleChanged', { style });
  }

  /**
   * Main update call - call every frame during gameplay
   * @param {Object} playerState - Current player state
   * @param {Object} [ghostState] - Current ghost state (if available externally)
   */
  update(playerState, ghostState = null) {
    if (!this._visible || !this._ghostData) return;

    // Update current time
    this._currentTime = playerState?.raceTime ?? this._currentTime;

    // Calculate or receive delta
    if (ghostState?.timeDelta !== undefined) {
      this._currentDelta = ghostState.timeDelta;
    } else if (playerState?.ghostDelta !== undefined) {
      this._currentDelta = playerState.ghostDelta;
    } else if (this._ghostData && this._currentTime > 0 && this._totalTime > 0) {
      // Estimate delta based on progress
      const ghostProgress = Math.min(this._currentTime / this._totalTime, 1);
      const playerProgress = playerState?.progress ?? ghostProgress;
      this._currentDelta = (ghostProgress - playerProgress) * this._totalTime;
    }

    // Update displays
    this._updateDeltaDisplay();
    this._updateSplitScreenTimes(playerState, ghostState);

    // Update graph periodically
    const now = performance.now();
    if (now - this._lastGraphUpdate >= this._options.updateInterval) {
      this._addToDeltaHistory();
      this._renderDeltaGraph();
      this._lastGraphUpdate = now;
    }
  }

  /**
   * Update a specific checkpoint split
   * @param {number} checkpointIndex - Index of the checkpoint
   * @param {number} playerTime - Player's time at this checkpoint
   * @param {number} [ghostTime] - Ghost's time (optional, uses stored)
   */
  updateSplit(checkpointIndex, playerTime, ghostTime) {
    if (checkpointIndex < 0 || checkpointIndex >= this._splits.length) return;

    const split = this._splits[checkpointIndex];
    split.playerTime = playerTime;

    if (ghostTime !== undefined) {
      split.ghostTime = ghostTime;
    }

    split.difference = playerTime - split.ghostTime;
    split.isBest = split.difference < 0; // Negative means faster

    this._currentCheckpoint = checkpointIndex;
    this._renderSplits();
  }

  /**
   * Set all splits data at once
   * @param {Array<SplitData>} splits - Array of split data
   */
  setSplits(splits) {
    this._splits = splits;
    this._renderSplits();
  }

  /**
   * Show/hide the entire HUD
   * @param {boolean} visible - Visibility state
   */
  setVisible(visible) {
    this._visible = visible;
    if (this._container) {
      this._container.style.display = visible ? '' : 'none';
    }
  }

  /**
   * Get current visibility state
   * @returns {boolean}
   */
  isVisible() {
    return this._visible;
  }

  /**
   * Reset all state for a new run
   */
  reset() {
    this._currentTime = 0;
    this._currentDelta = 0;
    this._deltaHistory = [];
    this._currentCheckpoint = -1;

    // Reset splits
    for (const split of this._splits) {
      split.playerTime = 0;
      split.difference = 0;
      split.isBest = false;
    }

    this._renderSplits();
    this._renderDeltaGraph();
  }

  /**
   * Set callback for mode changes
   * @param {Function} callback - Called with new mode
   */
  onModeChange(callback) {
    this._onModeChange = callback;
  }

  /**
   * Set callback for split click events
   * @param {Function} callback - Called with split index
   */
  onSplitClick(callback) {
    this._onSplitClick = callback;
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
    this._graphCtx = null;
    this._graphCanvas = null;
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Update visibility based on current mode and options
   * @private
   */
  _updateVisibility() {
    // Delta display
    if (this._elements.deltaDisplay) {
      const showDelta = this._options.showDelta && 
                        this._mode !== ComparisonMode.DELTA_ONLY &&
                        this._ghostData !== null;
      this._elements.deltaDisplay.style.display = showDelta ? '' : 'none';
    }

    // Graph
    if (this._elements.graphContainer) {
      const showGraph = this._options.showDeltaGraph && 
                        this._options.graphStyle !== DeltaGraphStyle.NONE &&
                        this._ghostData !== null;
      this._elements.graphContainer.style.display = showGraph ? '' : 'none';
    }

    // Splits panel
    if (this._elements.splitsPanel) {
      this._elements.splitsPanel.style.display = 
        (this._options.showSplits && this._splits.length > 0) ? '' : 'none';
    }

    // Split screen overlay
    if (this._elements.splitOverlay) {
      this._elements.splitOverlay.style.display = 
        this._mode === ComparisonMode.SPLIT_SCREEN ? '' : 'none';
    }
  }

  /**
   * Update the main delta display
   * @private
   */
  _updateDeltaDisplay() {
    if (!this._elements.deltaValue) return;

    const delta = this._currentDelta;
    const absDelta = Math.abs(delta);
    const isBehind = delta > 0; // Positive = behind ghost

    // Format delta text
    const sign = isBehind ? '+' : '';
    this._elements.deltaValue.textContent = `${sign}${absDelta.toFixed(2)}s`;

    // Update color based on state
    this._elements.deltaDisplay.className = `gch-delta-display ${isBehind ? 'behind' : 'ahead'}`;

    // Update arrow indicator
    if (this._elements.arrow) {
      this._elements.arrow.textContent = isBehind ? '↓' : '↑';
      this._elements.arrow.className = `gch-arrow ${isBehind ? 'down' : 'up'}`;
    }

    // Update total delta in splits header
    if (this._elements.totalDelta) {
      this._elements.totalDelta.textContent = `${sign}${absDelta.toFixed(2)}s`;
      this._elements.totalDelta.className = `gch-total-delta ${isBehind ? 'behind' : 'ahead'}`;
    }
  }

  /**
   * Update split screen time displays
   * @private
   * @param {Object} playerState - Player state
   * @param {Object} ghostState - Ghost state
   */
  _updateSplitScreenTimes(playerState, ghostState) {
    if (this._mode !== ComparisonMode.SPLIT_SCREEN) return;

    if (this._elements.playerTime) {
      this._elements.playerTime.textContent = this._formatTime(
        playerState?.raceTime ?? this._currentTime
      );
    }

    if (this._elements.ghostTime) {
      const ghostTime = ghostState?.raceTime ?? 
        (this._ghostData ? Math.min(this._currentTime, this._totalTime) : 0);
      this._elements.ghostTime.textContent = this._formatTime(ghostTime);
    }
  }

  /**
   * Add current delta to history for graph
   * @private
   */
  _addToDeltaHistory() {
    this._deltaHistory.push({
      time: this._currentTime,
      value: this._currentDelta
    });

    // Trim to max length
    while (this._deltaHistory.length > this._options.graphHistoryLength) {
      this._deltaHistory.shift();
    }
  }

  /**
   * Render the delta graph to canvas
   * @private
   */
  _renderDeltaGraph() {
    if (!this._graphCtx || !this._graphCanvas) return;

    const ctx = this._graphCtx;
    const canvas = this._graphCanvas;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    // Clear
    ctx.clearRect(0, 0, width, height);

    if (this._deltaHistory.length < 2) return;

    // Find data range
    let minVal = Infinity, maxVal = -Infinity;
    for (const pt of this._deltaHistory) {
      minVal = Math.min(minVal, pt.value);
      maxVal = Math.max(maxVal, pt.value);
    }

    // Add padding to range
    const range = Math.max(maxVal - minVal, 0.5);
    minVal -= range * 0.1;
    maxVal += range * 0.1;

    const padding = { left: 5, right: 5, top: 8, bottom: 8 };
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;

    // Draw zero line
    const zeroY = padding.top + graphHeight * (1 - (0 - minVal) / (maxVal - minVal));
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(width - padding.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    switch (this._options.graphStyle) {
      case DeltaGraphStyle.LINE:
        this._drawLineGraph(ctx, minVal, maxVal, padding, graphWidth, graphHeight);
        break;
      case DeltaGraphStyle.BAR:
        this._drawBarGraph(ctx, minVal, maxVal, padding, graphWidth, graphHeight);
        break;
      case DeltaGraphStyle.AREA:
        this._drawAreaGraph(ctx, minVal, maxVal, padding, graphWidth, graphHeight, zeroY);
        break;
    }
  }

  /**
   * Draw line-style graph
   * @private
   */
  _drawLineGraph(ctx, minVal, maxVal, padding, graphWidth, graphHeight) {
    const stepX = graphWidth / (this._options.graphHistoryLength - 1);
    const startIndex = Math.max(0, this._deltaHistory.length - this._options.graphHistoryLength);

    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < this._deltaHistory.length; i++) {
      const pt = this._deltaHistory[i];
      const x = padding.left + i * stepX;
      const y = padding.top + graphHeight * (1 - (pt.value - minVal) / (maxVal - minVal));

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
  }

  /**
   * Draw bar-style graph
   * @private
   */
  _drawBarGraph(ctx, minVal, maxVal, padding, graphWidth, graphHeight) {
    const barCount = this._deltaHistory.length;
    const barWidth = graphWidth / barCount;
    const zeroY = padding.top + graphHeight * (1 - (0 - minVal) / (maxVal - minVal));

    for (let i = 0; i < barCount; i++) {
      const pt = this._deltaHistory[i];
      const x = padding.left + i * barWidth;
      const y = padding.top + graphHeight * (1 - (pt.value - minVal) / (maxVal - minVal));
      const barHeight = Math.abs(y - zeroY);

      ctx.fillStyle = pt.value >= 0 ? 'rgba(255, 100, 100, 0.7)' : 'rgba(100, 255, 150, 0.7)';
      
      if (pt.value >= 0) {
        ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
      } else {
        ctx.fillRect(x + 1, zeroY, barWidth - 2, barHeight);
      }
    }
  }

  /**
   * Draw filled area graph
   * @private
   */
  _drawAreaGraph(ctx, minVal, maxVal, padding, graphWidth, graphHeight, zeroY) {
    const stepX = graphWidth / (this._options.graphHistoryLength - 1);

    // Create gradient
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + graphHeight);
    gradient.addColorStop(0, 'rgba(255, 100, 100, 0.4)');
    gradient.addColorStop(0.5, 'rgba(100, 200, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(100, 255, 150, 0.4)');

    // Draw area fill
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);

    for (let i = 0; i < this._deltaHistory.length; i++) {
      const pt = this._deltaHistory[i];
      const x = padding.left + i * stepX;
      const y = padding.top + graphHeight * (1 - (pt.value - minVal) / (maxVal - minVal));
      ctx.lineTo(x, y);
    }

    const lastX = padding.left + (this._deltaHistory.length - 1) * stepX;
    ctx.lineTo(lastX, zeroY);
    ctx.closePath();
    ctx.fill();

    // Draw line on top
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < this._deltaHistory.length; i++) {
      const pt = this._deltaHistory[i];
      const x = padding.left + i * stepX;
      const y = padding.top + graphHeight * (1 - (pt.value - minVal) / (maxVal - minVal));

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Draw current point dot
    if (this._deltaHistory.length > 0) {
      const lastPt = this._deltaHistory[this._deltaHistory.length - 1];
      const lastX = padding.left + (this._deltaHistory.length - 1) * stepX;
      const lastY = padding.top + graphHeight * (1 - (lastPt.value - minVal) / (maxVal - minVal));

      ctx.beginPath();
      ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
      ctx.fillStyle = lastPt.value >= 0 ? '#ff6464' : '#64ff96';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  /**
   * Render the splits list
   * @private
   */
  _renderSplits() {
    if (!this._elements.splitsList) return;

    if (this._splits.length === 0) {
      this._elements.splitsList.innerHTML = '<div class="gch-no-splits">No split data</div>';
      return;
    }

    this._elements.splitsList.innerHTML = this._splits.map((split, i) => `
      <div class="gch-split-row ${i <= this._currentCheckpoint ? 'completed' : ''} ${split.isBest ? 'best' : ''}"
           data-index="${i}">
        <span class="gch-split-cp">${split.index + 1}</span>
        <span class="gch-split-player">${split.playerTime > 0 ? this._formatTime(split.playerTime) : '--:--'}</span>
        <span class="gch-split-ghost">${this._formatTime(split.ghostTime)}</span>
        <span class="gch-split-diff ${split.difference > 0 ? 'slower' : 'faster'}">
          ${split.difference !== 0 ? (split.difference > 0 ? '+' : '') + split.difference.toFixed(2) : ''}
        </span>
      </div>
    `).join('');

    // Add click handlers
    this._elements.splitsList.querySelectorAll('.gch-split-row').forEach(row => {
      row.addEventListener('click', () => {
        const index = parseInt(row.dataset.index);
        this._onSplitClick?.(index);
        EventBus.emit('ghostHud:splitClicked', { index });
      });
    });
  }

  /**
   * Get label text for current mode
   * @private
   * @returns {string}
   */
  _getModeLabel() {
    const labels = {
      [ComparisonMode.OVERLAY]: 'Overlay',
      [ComparisonMode.SPLIT_SCREEN]: 'Split',
      [ComparisonMode.DELTA_ONLY]: 'Delta',
      [ComparisonMode.MINIMAP]: 'Map'
    };
    return labels[this._mode] || this._mode;
  }

  /**
   * Get icon character for current mode
   * @private
   * @returns {string}
   */
  _getModeIcon() {
    const icons = {
      [ComparisonMode.OVERLAY]: '◉',
      [ComparisonMode.SPLIT_SCREEN]: '⫿',
      [ComparisonMode.DELTA_ONLY]: 'Δ',
      [ComparisonMode.MINIMAP]: '⊕'
    };
    return icons[this._mode] || '◉';
  }

  /**
   * Format time as M:SS.mm
   * @private
   * @param {number} seconds
   * @returns {string}
   */
  _formatTime(seconds) {
    if (!seconds || seconds < 0) return '--:--.--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(2).padStart(5, '0')}`;
  }
}

// Export class and singleton factory
export default GhostComparisonHUD;
export { GhostComparisonHUD };
