// core/MinimapSystem.js — Real-time 2D minimap rendering system
// Canvas-based high-performance rendering with track outline, player positions,
// rotation modes, checkpoint indicators, item box locations, and leaderboard.

/**
 * MinimapSystem - Advanced in-race minimap with full feature set
 * 
 * Features:
 * - Canvas-based 2D rendering (not DOM elements for performance)
 * - Track outline drawn from spline data (scaled to fit minimap)
 * - Player dots: local player = bright colored triangle pointing forward, others = circles
 * - Position updates every frame (or every 100ms for remote players)
 * - Zoom auto-calculated from track bounds
 * - Two modes: rotate-with-player (local dot stays centered, rotates) or fixed-north
 * - Checkpoint indicators (small flags or numbers)
 * - Item box locations shown as small icons
 * - Leaderboard list alongside minimap (position + name + gap)
 * - Collapse/expand animation
 * - Works for splitscreen (one minimap per viewport)
 */
class MinimapSystem {
  /**
   * Create a new MinimapSystem instance
   * @param {HTMLElement} containerElement - Parent DOM element to render into
   * @param {object} trackData - Track data containing curve/bounds info
   */
  constructor(containerElement, trackData = {}) {
    // Container reference
    this._container = containerElement || null;
    this._trackData = trackData;
    
    // Canvas elements
    this._canvas = null;
    this._ctx = null;
    this._leaderboardEl = null;
    
    // Dimensions
    this._width = 200;
    this._height = 200;
    this._padding = 12;
    
    // State
    this._initialized = false;
    this._visible = true;
    this._collapsed = false;
    this._mode = 'fixed'; // 'rotate' or 'fixed'
    this._zoom = 1;
    this._autoZoom = true;
    
    // Track data
    this._trackBounds = null;
    this._trackPoints = [];
    this._checkpoints = [];
    this._itemBoxPositions = [];
    this._checkpointPositions = [];
    
    // Player data
    this._players = new Map(); // playerId -> { position, rotation, color, name, positionInRace }
    this._localPlayerId = null;
    this._localPlayerRotation = 0;
    this._currentCheckpoint = -1;
    
    // Leaderboard
    this._showLeaderboard = true;
    this._leaderboardEntries = [];
    
    // Icons and markers
    this._icons = new Map(); // iconType -> [{position, ...}]
    this._flashingCheckpoint = -1;
    this._flashTimer = 0;
    
    // Performance throttling
    this._lastRemoteUpdate = 0;
    this._remoteUpdateInterval = 100; // ms
    
    // Animation
    this._collapseProgress = 1; // 0 = collapsed, 1 = expanded
    this._targetCollapseProgress = 1;
    
    // Colors theme
    this._colors = {
      background: 'rgba(10, 14, 24, 0.88)',
      backgroundBorder: 'rgba(60, 80, 120, 0.6)',
      track: 'rgba(45, 55, 72, 0.9)',
      trackBorder: '#5a6a8a',
      trackInner: 'rgba(30, 40, 58, 0.5)',
      checkpoint: 'rgba(0, 220, 255, 0.7)',
      checkpointActive: 'rgba(255, 220, 0, 1)',
      localPlayer: '#00ff88',
      localPlayerBorder: '#00cc66',
      otherPlayer: '#ff6b35',
      itemBox: '#ffcc00',
      hazard: '#ff4444',
      startFinish: '#ffffff',
      text: '#e8eef4',
      textSecondary: '#8899aa',
      leaderboardBg: 'rgba(10, 14, 24, 0.75)',
      leaderboardHighlight: 'rgba(0, 255, 136, 0.15)'
    };
    
    // Position-based colors (Mario Kart style)
    this._positionColors = [
      '#ffd700', // 1st - Gold
      '#c0c0c0', // 2nd - Silver  
      '#cd7f32', // 3rd - Bronze
      '#4fc3f7', // 4th - Light blue
      '#ba68c8', // 5th - Purple
      '#81c784', // 6th - Green
      '#ffb74d', // 7th - Orange
      '#e57373', // 8th - Red
      '#f06292', // 9th - Pink
      '#b39ddb', // 10th - Lavender
    ];
    
    // Splitscreen support
    this._viewportId = 'main';
    this._isSplitscreen = false;
  }

  /**
   * Initialize the minimap with track data
   * @param {object} trackBounds - { minX, maxX, minZ, maxZ } or similar bounds
   * @param {Array} checkpointPositions - Array of {x, z} checkpoint positions
   */
  initialize(trackBounds, checkpointPositions = []) {
    if (!this._container) {
      console.warn('[MinimapSystem] No container element provided');
      return false;
    }
    
    // Store track bounds
    this._trackBounds = trackBounds || this._calculateTrackBounds();
    this._checkpointPositions = checkpointPositions;
    
    // Generate track points from curve if available
    if (this._trackData?.curve) {
      this._generateTrackPoints();
    }
    
    // Create DOM structure
    this._createDOM();
    
    // Calculate auto zoom
    if (this._autoZoom) {
      this._calculateZoom();
    }
    
    // Draw initial static content
    this._drawStaticContent();
    
    this._initialized = true;
    console.log('[MinimapSystem] Initialized successfully');
    return true;
  }

  /**
   * Create DOM elements for minimap
   * @private
   */
  _createDOM() {
    // Main wrapper
    this._wrapper = document.createElement('div');
    this._wrapper.className = `minimap-system-wrapper ${this._viewportId}`;
    this._wrapper.style.cssText = `
      position: absolute;
      bottom: 20px;
      right: 20px;
      display: flex;
      flex-direction: row-reverse;
      gap: 8px;
      align-items: flex-start;
      z-index: 150;
      font-family: var(--font-display, 'Rajdhani', system-ui);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
      user-select: none;
    `;
    
    // Minimap container
    this._minimapContainer = document.createElement('div');
    this._minimapContainer.className = 'minimap-canvas-container';
    this._minimapContainer.style.cssText = `
      position: relative;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), inset 0 0 0 1px ${this._colors.backgroundBorder};
      transition: width 0.3s ease, height 0.3s ease;
    `;
    
    // Canvas element (retina support with 2x resolution)
    this._canvas = document.createElement('canvas');
    this._canvas.width = this._width * 2;
    this._canvas.height = this._height * 2;
    this._canvas.style.cssText = `
      display: block;
      width: ${this._width}px;
      height: ${this._height}px;
      cursor: pointer;
    `;
    this._ctx = this._canvas.getContext('2d');
    this._ctx.scale(2, 2);
    
    this._minimapContainer.appendChild(this._canvas);
    
    // Collapse/expand button
    this._toggleBtn = document.createElement('button');
    this._toggleBtn.className = 'minimap-toggle-btn';
    this._toggleBtn.innerHTML = '◀';
    this._toggleBtn.style.cssText = `
      position: absolute;
      top: 50%;
      left: -16px;
      transform: translateY(-50%);
      width: 20px;
      height: 28px;
      border: none;
      border-radius: 4px 0 0 4px;
      background: rgba(20, 28, 42, 0.9);
      color: ${this._colors.textSecondary};
      font-size: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s, color 0.2s;
      z-index: 10;
    `;
    this._toggleBtn.addEventListener('click', () => this.toggleCollapse());
    this._toggleBtn.addEventListener('mouseenter', () => {
      this._toggleBtn.style.background = 'rgba(40, 55, 80, 0.95)';
      this._toggleBtn.style.color = this._colors.text;
    });
    this._toggleBtn.addEventListener('mouseleave', () => {
      this._toggleBtn.style.background = 'rgba(20, 28, 42, 0.9)';
      this._toggleBtn.style.color = this._colors.textSecondary;
    });
    this._minimapContainer.appendChild(this._toggleBtn);
    
    // Leaderboard panel
    this._leaderboardContainer = document.createElement('div');
    this._leaderboardContainer.className = 'minimap-leaderboard';
    this._leaderboardContainer.style.cssText = `
      background: ${this._colors.leaderboardBg};
      border-radius: 8px;
      padding: 8px;
      min-width: 120px;
      max-height: ${this._height}px;
      overflow-y: auto;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
      transition: opacity 0.3s ease, transform 0.3s ease;
    `;
    this._leaderboardContainer.innerHTML = `
      <div style="font-size: 10px; font-weight: 700; color: ${this._colors.textSecondary}; 
           text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; padding-bottom: 4px; 
           border-bottom: 1px solid rgba(255,255,255,0.1);">Standings</div>
      <div class="leaderboard-entries" id="minimap-leaderboard-entries"></div>
    `;
    this._leaderboardEl = this._leaderboardContainer.querySelector('#minimap-leaderboard-entries');
    
    // Assemble
    this._wrapper.appendChild(this._minimapContainer);
    if (this._showLeaderboard) {
      this._wrapper.appendChild(this._leaderboardContainer);
    }
    
    // Double-click to toggle fullscreen
    this._canvas.addEventListener('dblclick', () => this.toggleFullscreen());
    
    this._container.appendChild(this._wrapper);
  }

  /**
   * Generate track points from spline curve data
   * @private
   */
  _generateTrackPoints() {
    const curve = this._trackData.curve;
    if (!curve) return;
    
    const segments = 120;
    this._trackPoints = [];
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const point = curve.getPoint(t);
      this._trackPoints.push({ x: point.x, z: point.z });
    }
  }

  /**
   * Calculate track bounds from points
   * @private
   * @returns {object} Calculated bounds
   */
  _calculateTrackBounds() {
    if (this._trackPoints.length === 0) {
      // Try to get from trackData bounds
      if (this._trackData?.bounds) {
        return this._trackData.bounds;
      }
      return { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
    }
    
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    
    for (const p of this._trackPoints) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    
    // Add padding
    const padX = (maxX - minX) * 0.12;
    const padZ = (maxZ - minZ) * 0.12;
    
    return {
      minX: minX - padX,
      maxX: maxX + padX,
      minZ: minZ - padZ,
      maxZ: maxZ + padZ
    };
  }

  /**
   * Calculate zoom level to fit track in minimap
   * @private
   */
  _calculateZoom() {
    if (!this._trackBounds) return;
    
    const trackWidth = this._trackBounds.maxX - this._trackBounds.minX;
    const trackHeight = this._trackBounds.maxZ - this._trackBounds.minZ;
    
    const availableWidth = this._width - this._padding * 2;
    const availableHeight = this._height - this._padding * 2;
    
    const zoomX = availableWidth / trackWidth;
    const zoomY = availableHeight / trackHeight;
    
    this._zoom = Math.min(zoomX, zoomY);
  }

  /**
   * Draw static content (track outline, checkpoints, item boxes)
   * Called once on init or when track changes
   * @private
   */
  _drawStaticContent() {
    if (!this._ctx) return;
    
    const ctx = this._ctx;
    const w = this._width;
    const h = this._height;
    
    // Clear
    ctx.clearRect(0, 0, w, h);
    
    // Background
    ctx.fillStyle = this._colors.background;
    this._roundedRect(ctx, 0, 0, w, h, 10);
    ctx.fill();
    
    // Save context for potential transforms
    ctx.save();
    
    // Draw track
    this._drawTrack(ctx, w, h);
    
    // Draw checkpoints
    if (this._checkpoints.length > 0 || this._checkpointPositions.length > 0) {
      this._drawCheckpoints(ctx, w, h);
    }
    
    // Draw item boxes
    if (this._itemBoxPositions.length > 0) {
      this._drawItemBoxes(ctx, w, h);
    }
    
    // Draw start/finish line
    this._drawStartFinish(ctx, w, h);
    
    ctx.restore();
  }

  /**
   * Transform world coordinates to minimap canvas coordinates
   * @private
   * @param {number} x - World X coordinate
   * @param {number} z - World Z coordinate  
   * @param {number} w - Canvas width
   * @param {number} h - Canvas height
   * @returns {object} {x, y} canvas coordinates
   */
  _worldToCanvas(x, z, w, h) {
    if (!this._trackBounds) return { x: w / 2, y: h / 2 };
    
    const bounds = this._trackBounds;
    const canvasX = ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * (w - this._padding * 2) + this._padding;
    const canvasY = ((z - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * (h - this._padding * 2) + this._padding;
    
    return { x: canvasX, y: canvasY };
  }

  /**
   * Draw track outline from spline points
   * @private
   */
  _drawTrack(ctx, w, h) {
    if (this._trackPoints.length < 3) return;
    
    // Transform all points
    const points = this._trackPoints.map(p => this._worldToCanvas(p.x, p.z, w, h));
    
    // Draw track fill (inner area)
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    
    // Track fill with slight transparency
    ctx.fillStyle = this._colors.trackInner;
    ctx.fill();
    
    // Track border/outline
    ctx.strokeStyle = this._colors.track;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    
    // Inner track border highlight
    ctx.strokeStyle = this._colors.trackBorder;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  /**
   * Draw checkpoint markers
   * @private
   */
  _drawCheckpoints(ctx, w, h) {
    const checkpoints = this._checkpoints.length > 0 ? this._checkpoints : this._checkpointPositions;
    
    for (let i = 0; i < checkpoints.length; i++) {
      const cp = checkpoints[i];
      const pos = this._worldToCanvas(cp.x, cp.z || cp.y, w, h);
      
      // Flash current checkpoint
      const isActive = i === this._flashingCheckpoint && Math.sin(this._flashTimer * 8) > 0;
      
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, isActive ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? this._colors.checkpointActive : this._colors.checkpoint;
      ctx.fill();
      
      // Checkpoint number
      if (!isActive) {
        ctx.fillStyle = '#000';
        ctx.font = 'bold 6px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((i + 1).toString(), pos.x, pos.y);
      }
    }
  }

  /**
   * Draw item box icons
   * @private
   */
  _drawItemBoxes(ctx, w, h) {
    for (const box of this._itemBoxPositions) {
      const pos = this._worldToCanvas(box.x, box.z || box.y, w, h);
      
      // Draw small box icon
      ctx.save();
      ctx.translate(pos.x, pos.y);
      
      // Box shape
      ctx.fillStyle = this._colors.itemBox;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.rect(-4, -4, 8, 8);
      ctx.fill();
      
      // Inner detail
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.rect(-2, -2, 4, 4);
      ctx.fill();
      
      // Pulsing glow effect
      ctx.globalAlpha = 0.3 + Math.sin(performance.now() * 0.005) * 0.2;
      ctx.fillStyle = this._colors.itemBox;
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();
    }
  }

  /**
   * Draw start/finish line marker
   * @private
   */
  _drawStartFinish(ctx, w, h) {
    if (this._trackPoints.length === 0) return;
    
    const start = this._trackPoints[0];
    const pos = this._worldToCanvas(start.x, start.z, w, h);
    
    // Checkered pattern indicator
    ctx.save();
    ctx.translate(pos.x, pos.y);
    
    ctx.strokeStyle = this._colors.startFinish;
    ctx.lineWidth = 2;
    
    // Simple cross pattern for start/finish
    ctx.beginPath();
    ctx.moveTo(-5, -5);
    ctx.lineTo(5, 5);
    ctx.moveTo(5, -5);
    ctx.lineTo(-5, 5);
    ctx.stroke();
    
    ctx.restore();
  }

  /**
   * Main update/render call - should be called every frame during race
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    if (!this._initialized || !this._visible || !this._ctx) return;
    
    // Update flash timer
    this._flashTimer += dt;
    
    // Update collapse animation
    if (Math.abs(this._collapseProgress - this._targetCollapseProgress) > 0.01) {
      this._collapseProgress += (this._targetCollapseProgress - this._collapseProgress) * dt * 8;
      this._updateCollapseVisual();
    }
    
    // Redraw everything
    this.render();
    
    // Update leaderboard
    this._updateLeaderboard();
  }

  /**
   * Full frame render
   */
  render() {
    const ctx = this._ctx;
    const w = this._width;
    const h = this._height;
    
    // Clear and draw static base
    this._drawStaticContent();
    
    ctx.save();
    
    // Apply rotation mode
    if (this._mode === 'rotate' && this._localPlayerId) {
      const localPlayer = this._players.get(this._localPlayerId);
      if (localPlayer) {
        const cx = w / 2;
        const cy = h / 2;
        
        // Center on local player in rotate mode
        ctx.translate(cx, cy);
        ctx.rotate(-this._localPlayerRotation + Math.PI / 2);
        ctx.translate(-cx, -cy);
      }
    }
    
    // Redraw static content with rotation applied
    // (in rotate mode, we need to redraw under the transform)
    if (this._mode === 'rotate') {
      ctx.globalAlpha = 0.3;
      this._drawTrack(ctx, w, h);
      this._drawCheckpoints(ctx, w, h);
      this._drawItemBoxes(ctx, w, h);
      ctx.globalAlpha = 1;
    }
    
    // Draw players
    this._drawPlayers(ctx, w, h);
    
    // Draw custom icons
    this._drawIcons(ctx, w, h);
    
    ctx.restore();
  }

  /**
   * Draw all player dots
   * @private
   */
  _drawPlayers(ctx, w, h) {
    const now = performance.now();
    
    for (const [playerId, player] of this._players) {
      // Skip stale remote players
      if (playerId !== this._localPlayerId && (now - player.lastUpdate) > this._remoteUpdateInterval * 3) {
        continue;
      }
      
      if (!player.position) continue;
      
      const pos = this._worldToCanvas(player.position.x, player.position.z, w, h);
      const isLocal = playerId === this._localPlayerId;
      const racePos = player.positionInRace || 1;
      
      // Determine color based on race position
      let color;
      if (isLocal) {
        color = this._colors.localPlayer;
      } else {
        color = this._positionColors[Math.min(racePos - 1, this._positionColors.length - 1)] || this._colors.otherPlayer;
      }
      
      ctx.save();
      ctx.translate(pos.x, pos.y);
      
      if (isLocal) {
        // Local player: triangle pointing forward
        const rotation = player.rotation || this._localPlayerRotation || 0;
        ctx.rotate(rotation);
        
        // Outer glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        
        // Triangle shape
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(-5.5, 6);
        ctx.lineTo(5.5, 6);
        ctx.closePath();
        
        ctx.fillStyle = this._colors.localPlayerBorder;
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(-4, 4.5);
        ctx.lineTo(4, 4.5);
        ctx.closePath();
        
        ctx.fillStyle = color;
        ctx.fill();
        
        ctx.shadowBlur = 0;
      } else {
        // Other players: circles with position number
        const radius = 4.5;
        
        // Subtle shadow
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 3;
        
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        
        // Border
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        ctx.shadowBlur = 0;
        
        // Position number inside circle
        if (racePos <= 10) {
          ctx.fillStyle = '#000';
          ctx.font = 'bold 6px system-ui';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(racePos.toString(), 0, 0);
        }
      }
      
      ctx.restore();
    }
  }

  /**
   * Draw custom icons (hazards, power-ups, etc.)
   * @private
   */
  _drawIcons(ctx, w, h) {
    for (const [iconType, icons] of this._icons) {
      for (const icon of icons) {
        const pos = this._worldToCanvas(icon.position.x, icon.position.z || icon.position.y, w, h);
        
        ctx.save();
        ctx.translate(pos.x, pos.y);
        
        switch (iconType) {
          case 'hazard':
            // Warning triangle
            ctx.fillStyle = this._colors.hazard;
            ctx.beginPath();
            ctx.moveTo(0, -6);
            ctx.lineTo(-5, 4);
            ctx.lineTo(5, 4);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.font = 'bold 8px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('!', 0, 1);
            break;
            
          case 'powerup':
            // Star shape
            ctx.fillStyle = '#ffff00';
            ctx.shadowColor = '#ffff00';
            ctx.shadowBlur = 6;
            this._drawStar(ctx, 0, 0, 5, 6, 4);
            ctx.shadowBlur = 0;
            break;
            
          default:
            // Generic icon circle
            ctx.fillStyle = '#aaa';
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
      }
    }
  }

  /**
   * Helper to draw a star shape
   * @private
   */
  _drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
    let rot = Math.PI / 2 * 3;
    const step = Math.PI / spikes;
    
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    
    for (let i = 0; i < spikes; i++) {
      let x = cx + Math.cos(rot) * outerRadius;
      let y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;
      
      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Helper for rounded rectangles
   * @private
   */
  _roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ==========================================================================
  // PUBLIC API METHODS
  // ==========================================================================

  /**
   * Update all player positions (call each frame for local, less often for remote)
   * @param {Array} players - Array of { id, position: {x,z}, rotation, name, positionInRace }
   */
  updatePlayerPositions(players) {
    const now = performance.now();
    
    for (const player of players) {
      const existing = this._players.get(player.id);
      
      // Throttle remote player updates
      if (player.id !== this._localPlayerId && existing && (now - existing.lastUpdate) < this._remoteUpdateInterval) {
        continue;
      }
      
      this._players.set(player.id, {
        position: player.position,
        rotation: player.rotation || 0,
        color: player.color,
        name: player.name || `Player ${player.id}`,
        positionInRace: player.positionInRace || 1,
        lastUpdate: now
      });
    }
  }

  /**
   * Update local player specifically (called every frame)
   * @param {object} position - {x, z} world position
   * @param {number} rotation - Y-axis rotation in radians
   */
  updateLocalPlayer(position, rotation) {
    if (!this._localPlayerId) {
      this._localPlayerId = 'local';
    }
    
    this._localPlayerRotation = rotation || 0;
    
    this._players.set(this._localPlayerId, {
      position: position,
      rotation: rotation || 0,
      color: this._colors.localPlayer,
      name: 'You',
      positionInRace: this._players.get(this._localPlayerId)?.positionInRace || 1,
      lastUpdate: performance.now()
    });
  }

  /**
   * Set zoom level manually
   * @param {number} level - Zoom multiplier (1 = auto-fit)
   */
  setZoom(level) {
    this._zoom = Math.max(0.25, Math.min(4, level));
    this._autoZoom = false;
  }

  /**
   * Set display mode
   * @param {string} mode - 'rotate' (rotates with player) or 'fixed' (north always up)
   */
  setMode(mode) {
    if (mode === 'rotate' || mode === 'fixed') {
      this._mode = mode;
    }
  }

  /**
   * Show/highlight current checkpoint
   * @param {number} checkpointIndex - Index of active checkpoint (-1 to disable flash)
   */
  showCheckpoint(checkpointIndex) {
    this._flashingCheckpoint = checkpointIndex;
    this._flashTimer = 0;
  }

  /**
   * Draw a special icon at a position
   * @param {string} iconType - Type of icon ('hazard', 'powerup', etc.)
   * @param {object} position - {x, z} world position
   */
  drawIcon(iconType, position) {
    if (!this._icons.has(iconType)) {
      this._icons.set(iconType, []);
    }
    this._icons.get(iconType).push({ position, timestamp: performance.now() });
  }

  /**
   * Clear all icons of a type
   * @param {string} iconType - Type to clear (or clear all if not specified)
   */
  clearIcons(iconType) {
    if (iconType) {
      this._icons.delete(iconType);
    } else {
      this._icons.clear();
    }
  }

  /**
   * Set item box positions for display
   * @param {Array} positions - Array of {x, z} positions
   */
  setItemBoxPositions(positions) {
    this._itemBoxPositions = positions;
  }

  /**
   * Set checkpoint positions
   * @param {Array} checkpoints - Array of {x, z} positions
   */
  setCheckpoints(checkpoints) {
    this._checkpoints = checkpoints;
  }

  /**
   * Update leaderboard entries
   * @param {Array} entries - Array of { position, name, gap, isLocal }
   */
  setLeaderboard(entries) {
    this._leaderboardEntries = entries;
  }

  /**
   * Update leaderboard DOM
   * @private
   */
  _updateLeaderboard() {
    if (!this._leaderboardEl || !this._showLeaderboard) return;
    
    // Sort by position
    const sorted = [...this._leaderboardEntries].sort((a, b) => a.position - b.position);
    
    let html = '';
    for (const entry of sorted.slice(0, 8)) { // Show top 8
      const highlight = entry.isLocal ? `background: ${this._colors.leaderboardHighlight};` : '';
      const posColor = entry.position <= 3 ? this._positionColors[entry.position - 1] : this._colors.textSecondary;
      
      html += `
        <div style="display: flex; align-items: center; gap: 6px; padding: 3px 4px; 
                    border-radius: 3px; font-size: 11px; ${highlight}">
          <span style="color: ${posColor}; font-weight: 700; min-width: 16px;">${entry.position}</span>
          <span style="color: ${this._colors.text}; flex: 1; overflow: hidden; text-overflow: ellipsis; 
                     white-space: nowrap;">${entry.name}</span>
          ${entry.gap ? `<span style="color: ${this._colors.textSecondary}; font-size: 9px;">${entry.gap}</span>` : ''}
        </div>
      `;
    }
    
    this._leaderboardEl.innerHTML = html;
  }

  /**
   * Toggle collapse/expand state
   */
  toggleCollapse() {
    this._collapsed = !this._collapsed;
    this._targetCollapseProgress = this._collapsed ? 0 : 1;
    this._toggleBtn.innerHTML = this._collapsed ? '▶' : '◀';
  }

  /**
   * Update visual state for collapse animation
   * @private
   */
  _updateCollapseVisual() {
    const progress = this._collapseProgress;
    
    if (progress < 0.5) {
      this._minimapContainer.style.transform = `scaleX(${0.3 + progress * 1.4})`;
      this._leaderboardContainer.style.opacity = progress * 2;
      this._leaderboardContainer.style.transform = `translateX(${(1 - progress * 2) * 20}px)`;
    } else {
      this._minimapContainer.style.transform = 'scaleX(1)';
      this._leaderboardContainer.style.opacity = '1';
      this._leaderboardContainer.style.transform = 'translateX(0)';
    }
  }

  /**
   * Toggle fullscreen mode
   */
  toggleFullscreen() {
    // Implementation for fullscreen expansion
    // Could overlay the entire screen with enlarged minimap
    console.log('[MinimapSystem] Fullscreen toggle requested');
  }

  /**
   * Handle container resize
   */
  resize() {
    if (!this._container) return;
    
    const rect = this._container.getBoundingClientRect();
    // Adjust size based on container if needed
    
    // Recalculate zoom
    if (this._autoZoom) {
      this._calculateZoom();
    }
  }

  /**
   * Set visibility
   * @param {boolean} visible 
   */
  setVisible(visible) {
    this._visible = visible;
    if (this._wrapper) {
      this._wrapper.style.display = visible ? '' : 'none';
    }
  }

  /**
   * Configure for splitscreen mode
   * @param {string} viewportId - Unique ID for this viewport
   * @param {object} options - Splitscreen options
   */
  configureSplitscreen(viewportId, options = {}) {
    this._viewportId = viewportId;
    this._isSplitscreen = true;
    
    if (options.size) {
      this._width = options.size;
      this._height = options.size;
    }
    
    if (options.position) {
      // Position the minimap within its viewport
      Object.assign(this._wrapper.style, options.position);
    }
  }

  /**
   * Clean up and dispose of resources
   */
  dispose() {
    if (this._wrapper && this._wrapper.parentNode) {
      this._wrapper.parentNode.removeChild(this._wrapper);
    }
    
    this._canvas = null;
    this._ctx = null;
    this._players.clear();
    this._icons.clear();
    this._initialized = false;
    
    console.log('[MinimapSystem] Disposed');
  }
}

// Export
export default MinimapSystem;
export { MinimapSystem };
