// Minimap.js - In-race minimap component
// Canvas-based 2D rendering with track layout, player positions,
// rotation modes, checkpoint indicators, and lap counter.

class Minimap {
  constructor(options = {}) {
    // Configuration
    this._width = options.width || 180;
    this._height = options.height || 180;
    this._rotationMode = options.rotationMode || 'fixed'; // 'fixed' or 'player'
    this._showCheckpoints = options.showCheckpoints !== false;
    this._showLeaderArrow = options.showLeaderArrow !== false;
    this._showLapCounter = options.showLapCounter !== false;

    // State
    this._canvas = null;
    this._ctx = null;
    this._container = null;
    this._trackBounds = null;
    this._trackPoints = [];
    this._checkpoints = [];
    this._players = new Map(); // playerId -> { position, color, name }
    this._localPlayerId = null;
    this._leaderPlayerId = null;
    this._currentLap = 1;
    this._totalLaps = 3;
    this._isFullscreen = false;
    this._visible = true;

    // Colors (can be customized)
    this._colors = {
      background: 'rgba(10, 12, 20, 0.85)',
      track: '#2a3040',
      trackBorder: '#3d4a5c',
      checkpoint: 'rgba(0, 229, 255, 0.6)',
      localPlayer: '#00ff88',
      localPlayerBorder: '#00cc66',
      otherPlayer: '#ff6b35',
      leaderArrow: '#ffd700',
      text: '#ffffff',
      textSecondary: '#8892a0'
    };

    // Position-based colors for racers (Mario Kart style)
    this._positionColors = [
      '#ffd700', // 1st - Gold
      '#c0c0c0', // 2nd - Silver
      '#cd7f32', // 3rd - Bronze
      '#4fc3f7', // 4th - Light blue
      '#ba68c8', // 5th - Purple
      '#81c784', // 6th - Green
      '#ffb74d', // 7th - Orange
      '#e57373'  // 8th - Red
    ];
  }

  /**
   * Create and mount the minimap element
   * @param {HTMLElement} parent - Parent container
   * @returns {HTMLElement} The minimap container
   */
  mount(parent) {
    // Create container
    this._container = document.createElement('div');
    this._container.id = 'minimap-container';
    this._container.className = 'minimap-container';
    this._container.style.cssText = `
      position: relative;
      width: ${this._width}px;
      height: ${this._height + (this._showLapCounter ? 24 : 0)}px;
      border-radius: 8px;
      overflow: hidden;
      transition: all 0.3s ease;
      z-index: 100;
    `;

    // Create canvas
    this._canvas = document.createElement('canvas');
    this._canvas.width = this._width * 2; // Retina support
    this._canvas.height = this._height * 2;
    this._canvas.style.cssText = `
      width: ${this._width}px;
      height: ${this._height}px;
      display: block;
      cursor: pointer;
    `;
    this._ctx = this._canvas.getContext('2d');
    this._ctx.scale(2, 2);

    this._container.appendChild(this._canvas);

    // Lap counter (optional)
    if (this._showLapCounter) {
      const lapCounter = document.createElement('div');
      lapCounter.id = 'minimap-lap-counter';
      lapCounter.className = 'minimap-lap-counter';
      lapCounter.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 600;
        color: ${this._colors.textSecondary};
        background: rgba(0, 0, 0, 0.4);
        font-family: var(--font-display, system-ui);
        letter-spacing: 1px;
      `;
      lapCounter.textContent = `LAP ${this._currentLap}/${this._totalLaps}`;
      this._lapCounterEl = lapCounter;
      this._container.appendChild(lapCounter);
    }

    // Fullscreen toggle button
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.className = 'minimap-fullscreen-btn';
    fullscreenBtn.innerHTML = '⛶';
    fullscreenBtn.style.cssText = `
      position: absolute;
      top: 4px;
      right: 4px;
      width: 20px;
      height: 20px;
      border: none;
      background: rgba(255, 255, 255, 0.15);
      color: white;
      border-radius: 4px;
      font-size: 10px;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    fullscreenBtn.addEventListener('mouseenter', () => { fullscreenBtn.style.opacity = '1'; });
    fullscreenBtn.addEventListener('mouseleave', () => { fullscreenBtn.style.opacity = '0'; });
    this._container.appendChild(fullscreenBtn);

    // Click to toggle fullscreen
    this._canvas.addEventListener('dblclick', () => this.toggleFullscreen());

    if (parent) {
      parent.appendChild(this._container);
    }

    return this._container;
  }

  /**
   * Set track data from spline/curve points
   * @param {Array} points - Array of {x, z} or {x, y, z} points defining the track
   */
  setTrackData(points) {
    this._trackPoints = points.map(p => ({ x: p.x, y: p.z || p.y }));

    // Calculate bounds for auto-fit zoom
    if (points.length > 0) {
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;

      for (const p of this._trackPoints) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }

      // Add padding
      const padding = Math.max(maxX - minX, maxY - minY) * 0.15;
      this._trackBounds = {
        minX: minX - padding,
        maxX: maxX + padding,
        minY: minY - padding,
        maxY: maxY + padding,
        width: (maxX - minX) + padding * 2,
        height: (maxY - minY) + padding * 2
      };
    }
  }

  /**
   * Set checkpoint positions on the minimap
   * @param {Array} checkpoints - Array of {x, z} or {x, y, z} positions
   */
  setCheckpoints(checkpoints) {
    this._checkpoints = checkpoints.map(cp => ({ x: cp.x, y: cp.z || cp.y }));
  }

  /**
   * Update or add a player's position
   * @param {string} playerId - Unique player identifier
   * @param {object} data - { position: {x, y, z}, positionInRace, name }
   */
  updatePlayer(playerId, data) {
    this._players.set(playerId, {
      ...data,
      lastUpdate: performance.now()
    });
  }

  /**
   * Remove a player from the minimap
   * @param {string} playerId 
   */
  removePlayer(playerId) {
    this._players.delete(playerId);
  }

  /**
   * Set the local player ID (for special rendering)
   * @param {string} playerId 
   */
  setLocalPlayer(playerId) {
    this._localPlayerId = playerId;
  }

  /**
   * Set the current race leader
   * @param {string} playerId 
   */
  setLeader(playerId) {
    this._leaderPlayerId = playerId;
  }

  /**
   * Update lap counter display
   * @param {number} current - Current lap
   * @param {number} total - Total laps
   */
  setLap(current, total) {
    this._currentLap = current;
    this._totalLaps = total;
    if (this._lapCounterEl) {
      this._lapCounterEl.textContent = `LAP ${current}/${total}`;
    }
  }

  /**
   * Set rotation mode
   * @param {string} mode - 'fixed' or 'player'
   */
  setRotationMode(mode) {
    this._rotationMode = mode;
  }

  /**
   * Toggle between normal and fullscreen view
   */
  toggleFullscreen() {
    this._isFullscreen = !this._isFullscreen;

    if (this._isFullscreen) {
      this._container.style.position = 'fixed';
      this._container.style.top = '50%';
      this._container.style.left = '50%';
      this._container.style.transform = 'translate(-50%, -50%)';
      this._container.style.width = '300px';
      this._container.style.height = '320px';
      this._container.style.zIndex = '1000';
      this._container.style.boxShadow = '0 10px 40px rgba(0, 0, 0, 0.6)';
      
      this._canvas.style.width = '300px';
      this._canvas.style.height = '300px';
      this._width = 300;
      this._height = 300;
    } else {
      this._container.style.position = '';
      this._container.style.top = '';
      this._container.style.left = '';
      this._container.style.transform = '';
      this._container.style.width = '180px';
      this._container.style.height = '204px';
      this._container.style.zIndex = '100';
      this._container.style.boxShadow = '';
      
      this._width = 180;
      this._height = 180;
      this._canvas.style.width = '180px';
      this._canvas.style.height = '180px';
    }

    // Resize canvas for retina
    this._canvas.width = this._width * 2;
    this._canvas.height = this._height * 2;
    this._ctx.scale(2, 2);
  }

  /**
   * Show/hide the minimap
   * @param {boolean} visible 
   */
  setVisible(visible) {
    this._visible = visible;
    this._container.style.display = visible ? '' : 'none';
  }

  /**
   * Main render call - should be called every frame during race
   */
  render() {
    if (!this._ctx || !this._visible) return;

    const ctx = this._ctx;
    const w = this._width;
    const h = this._height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = this._colors.background;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 8);
    ctx.fill();

    // Save context for potential rotation
    ctx.save();

    // Apply player-relative rotation if enabled
    if (this._rotationMode === 'player' && this._localPlayerId) {
      const localPlayer = this._players.get(this._localPlayerId);
      if (localPlayer?.position) {
        const cx = w / 2;
        const cy = h / 2;
        ctx.translate(cx, cy);
        
        // Calculate player heading (simplified)
        const pos = localPlayer.position;
        // This would need velocity or previous position for accurate heading
        // For now, use a simple approximation
        ctx.rotate(0); // Would be player's yaw angle
        ctx.translate(-cx, -cy);
      }
    }

    // Draw track
    this._drawTrack(ctx, w, h);

    // Draw checkpoints
    if (this._showCheckpoints && this._checkpoints.length > 0) {
      this._drawCheckpoints(ctx, w, h);
    }

    // Draw players
    this._drawPlayers(ctx, w, h);

    // Draw leader arrow
    if (this._showLeaderArrow && this._leaderPlayerId && this._localPlayerId) {
      this._drawLeaderArrow(ctx, w, h);
    }

    ctx.restore();
  }

  _drawTrack(ctx, w, h) {
    if (this._trackPoints.length < 2) return;

    const bounds = this._trackBounds;
    if (!bounds) return;

    // Transform world coordinates to canvas coordinates
    const transform = (x, y) => ({
      x: ((x - bounds.minX) / bounds.width) * (w - 20) + 10,
      y: ((y - bounds.minY) / bounds.height) * (h - 20) + 10
    });

    // Draw track outline/fill
    ctx.beginPath();
    const start = transform(this._trackPoints[0].x, this._trackPoints[0].y);
    ctx.moveTo(start.x, start.y);

    for (let i = 1; i < this._trackPoints.length; i++) {
      const p = transform(this._trackPoints[i].x, this._trackPoints[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();

    // Track fill
    ctx.fillStyle = this._colors.track;
    ctx.fill();

    // Track border
    ctx.strokeStyle = this._colors.trackBorder;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw start/finish line
    if (this._trackPoints.length > 0) {
      const startPt = transform(this._trackPoints[0].x, this._trackPoints[0].y);
      ctx.beginPath();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      // Checkered pattern simplified as line
      ctx.moveTo(startPt.x - 5, startPt.y - 5);
      ctx.lineTo(startPt.x + 5, startPt.y + 5);
      ctx.moveTo(startPt.x + 5, startPt.y - 5);
      ctx.lineTo(startPt.x - 5, startPt.y + 5);
      ctx.stroke();
    }
  }

  _drawCheckpoints(ctx, w, h) {
    const bounds = this._trackBounds;
    if (!bounds) return;

    const transform = (x, y) => ({
      x: ((x - bounds.minX) / bounds.width) * (w - 20) + 10,
      y: ((y - bounds.minY) / bounds.height) * (h - 20) + 10
    });

    ctx.fillStyle = this._colors.checkpoint;

    for (const cp of this._checkpoints) {
      const p = transform(cp.x, cp.y);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawPlayers(ctx, w, h) {
    const bounds = this._trackBounds;
    if (!bounds) return;

    const transform = (x, y) => ({
      x: ((x - bounds.minX) / bounds.width) * (w - 20) + 10,
      y: ((y - bounds.minY) / bounds.height) * (h - 20) + 10
    });

    const now = performance.now();

    for (const [playerId, player] of this._players) {
      // Skip stale players (>3 seconds without update)
      if (now - player.lastUpdate > 3000) continue;

      if (!player.position) continue;

      const pos = transform(player.position.x, player.position.z || player.position.y);
      const isLocal = playerId === this._localPlayerId;
      const racePos = player.positionInRace || 1;

      // Determine color
      let color;
      if (isLocal) {
        color = this._colors.localPlayer;
      } else {
        color = this._positionColors[Math.min(racePos - 1, this._positionColors.length - 1)] || this._colors.otherPlayer;
      }

      // Draw player dot
      ctx.beginPath();
      if (isLocal) {
        // Local player: larger with border
        ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = this._colors.localPlayerBorder;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        // Other players: smaller dots
        ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        
        // Position number for other players
        if (racePos <= 8) {
          ctx.fillStyle = '#000';
          ctx.font = 'bold 7px system-ui';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(racePos.toString(), pos.x, pos.y);
        }
      }
    }
  }

  _drawLeaderArrow(ctx, w, h) {
    const localPlayer = this._players.get(this._localPlayerId);
    const leaderPlayer = this._players.get(this._leaderPlayerId);

    if (!localPlayer?.position || !leaderPlayer?.position) return;

    // Calculate direction from local player to leader
    const dx = leaderPlayer.position.x - localPlayer.position.x;
    const dz = (leaderPlayer.position.z || leaderPlayer.position.y) - (localPlayer.position.z || localPlayer.position.y);
    
    // Only show arrow if leader is somewhat far
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 10) return; // Too close, no arrow needed

    // Draw arrow at edge of minimap pointing toward leader
    const angle = Math.atan2(dz, dx);
    const arrowDist = Math.min(w, h) * 0.35;
    const ax = w / 2 + Math.cos(angle) * arrowDist;
    const ay = h / 2 + Math.sin(angle) * arrowDist;

    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-4, -5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fillStyle = this._colors.leaderArrow;
    ctx.fill();

    ctx.restore();
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._canvas = null;
    this._ctx = null;
    this._players.clear();
  }
}

export default Minimap;
export { Minimap };
