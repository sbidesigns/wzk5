// barrel/ui/screens/screen.settings.video.js — Video/graphics settings
// Features: Quality preset selector (Low/Medium/High/Ultra) with descriptions,
// Resolution dropdown, FPS counter toggle, VSync toggle, Motion Blur toggle,
// Shadow quality selector, Show FPS toggle, Apply button for reload-required changes,
// Current performance stats display (FPS, draw calls, memory estimate)

import { el, topNav, screenHeader, playUISound } from './_shared.js';

// Quality presets with descriptions
const QUALITY_PRESETS = [
  { 
    id: 'low', 
    name: 'LOW', 
    desc: '0.75× pixel ratio, no shadows, no bloom, no antialiasing. Best for low-end devices or battery saving.',
    pixelRatio: 0.75,
    shadows: false,
    bloom: false,
    antialias: false
  },
  { 
    id: 'medium', 
    name: 'MEDIUM', 
    desc: '1.0× pixel ratio, 1024 shadow map, no bloom, antialiasing on. Good balance of quality and performance.',
    pixelRatio: 1.0,
    shadows: true,
    shadowSize: 1024,
    bloom: false,
    antialias: true
  },
  { 
    id: 'high', 
    name: 'HIGH', 
    desc: '1.5× pixel ratio, 2048 soft shadows, bloom enabled. Recommended for most gaming PCs.',
    pixelRatio: 1.5,
    shadows: true,
    shadowSize: 2048,
    bloom: true,
    bloomStrength: 0.7,
    antialias: true
  },
  { 
    id: 'ultra', 
    name: 'ULTRA', 
    desc: '2.0× pixel ratio, 4096 shadows, strong bloom, all effects. For high-end GPUs only.',
    pixelRatio: 2.0,
    shadows: true,
    shadowSize: 4096,
    bloom: true,
    bloomStrength: 1.0,
    antialias: true,
    motionBlur: true
  }
];

// Shadow quality options
const SHADOW_QUALITIES = [
  { id: 'off', name: 'Off', desc: 'No shadows' },
  { id: 'low', name: 'Low', desc: '512 map, blocky' },
  { id: 'medium', name: 'Medium', desc: '1024 map, soft' },
  { id: 'high', name: 'High', desc: '2048+ map, crisp' }
];

// Resolution options
const RESOLUTION_OPTIONS = [
  { id: 'auto', name: 'Auto (Native)', desc: 'Match display resolution' },
  { id: '1080p', name: '1920×1080', desc: 'Full HD' },
  { id: '1440p', name: '2560×1440', desc: '2K / QHD' },
  { id: '4k', name: '3840×2160', desc: '4K UHD' }
];

export async function mount(root, payload, ctx) {
  const engine = window.__engine;
  
  // Load current values from save system
  function loadSetting(path, defaultValue) {
    try {
      const saved = engine.save.get(path);
      return saved != null ? saved : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }

  const currentQuality = loadSetting('settings.video.quality', 'high');
  const currentResolution = loadSetting('settings.video.resolution', 'auto');
  const vsyncEnabled = loadSetting('settings.video.vsync', true);
  const motionBlurEnabled = loadSetting('settings.video.motionBlur', false);
  const shadowQuality = loadSetting('settings.video.shadowQuality', 'high');
  const showFps = loadSetting('settings.video.showFps', false);
  const fpsLimit = loadSetting('settings.video.fpsLimit', 'unlimited');

  root.appendChild(topNav());
  const screen = el('div', 'screen');
  screen.appendChild(screenHeader('VIDEO', 'Quality, resolution, post-processing'));
  const body = el('div', 'screen-body');

  body.innerHTML = `
    <div class="settings-layout">
      <div class="settings-nav">
        ${['audio','video','controls','gameplay','accessibility'].map(s => `
          <div class="settings-nav-item ${s === 'video' ? 'active' : ''}" data-section="settings.${s}">
            <div style="width:32px; height:32px; border-radius:50%; background:var(--surface-glass); display:flex; align-items:center; justify-content:center; font-size:16px;">
              ${s === 'audio' ? '🔊' : s === 'video' ? '🖥' : s === 'controls' ? '🎮' : s === 'gameplay' ? '⚡' : '♿'}
            </div>
            <div>${s.charAt(0).toUpperCase() + s.slice(1)}</div>
          </div>
        `).join('')}
      </div>
      <div class="settings-panel">
        <!-- Quality Preset -->
        <div class="card">
          <div class="hud-label">QUALITY PRESET</div>
          <div class="tab-bar" style="margin-top:var(--space-s);" id="quality-tabs">
            ${QUALITY_PRESETS.map(p => `
              <div class="tab ${p.id === currentQuality ? 'tab-active' : ''}" data-quality="${p.id}">${p.name}</div>
            `).join('')}
          </div>
          <div id="quality-desc" style="color:var(--text-secondary); margin-top:var(--space-m); font-size:var(--text-body-s); line-height:1.5;">
            ${QUALITY_PRESETS.find(p => p.id === currentQuality)?.desc || 'Select a preset to see details.'}
          </div>
        </div>

        <!-- Display Settings -->
        <div class="card">
          <div class="hud-label">DISPLAY</div>
          <div style="display:flex; flex-direction:column; gap:var(--space-s); margin-top:var(--space-l);">
            
            <!-- Resolution -->
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Resolution</div>
                <div class="settings-row-desc">Rendering resolution</div>
              </div>
              <div class="settings-row-control">
                <select class="input video-select" id="video-resolution" style="min-width:180px;">
                  ${RESOLUTION_OPTIONS.map(r => `
                    <option value="${r.id}" ${r.id === currentResolution ? 'selected' : ''}>${r.name}</option>
                  `).join('')}
                </select>
              </div>
            </div>

            <!-- Shadow Quality -->
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Shadow Quality</div>
                <div class="settings-row-desc">Shadow map resolution</div>
              </div>
              <div class="settings-row-control">
                <select class="input video-select" id="video-shadows" style="min-width:140px;">
                  ${SHADOW_QUALITIES.map(s => `
                    <option value="${s.id}" ${s.id === shadowQuality ? 'selected' : ''}>${s.name}</option>
                  `).join('')}
                </select>
              </div>
            </div>

            <!-- FPS Limit -->
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">FPS Limit</div>
                <div class="settings-row-desc">Cap frame rate</div>
              </div>
              <div class="settings-row-control">
                <select class="input video-select" id="video-fpslimit" style="min-width:120px;">
                  <option value="unlimited" ${fpsLimit === 'unlimited' ? 'selected' : ''}>Unlimited</option>
                  <option value="30" ${fpsLimit === '30' ? 'selected' : ''}>30 FPS</option>
                  <option value="60" ${fpsLimit === '60' ? 'selected' : ''}>60 FPS</option>
                  <option value="120" ${fpsLimit === '120' ? 'selected' : ''}>120 FPS</option>
                  <option value="144" ${fpsLimit === '144' ? 'selected' : ''}>144 FPS</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Toggle Options -->
        <div class="card">
          <div class="hud-label">OPTIONS</div>
          <div style="display:flex; flex-direction:column; gap:var(--space-s); margin-top:var(--space-l);">
            
            <!-- VSync -->
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">VSync</div>
                <div class="settings-row-desc">Sync to display refresh rate</div>
              </div>
              <div class="settings-row-control">
                <label class="badge video-toggle ${vsyncEnabled ? 'badge-success' : ''}" data-setting="vsync">
                  <input type="checkbox" id="toggle-vsync" ${vsyncEnabled ? 'checked' : ''}> 
                  <span class="toggle-label">${vsyncEnabled ? 'ON' : 'OFF'}</span>
                </label>
              </div>
            </div>

            <!-- Show FPS Counter -->
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Show FPS</div>
                <div class="settings-row-desc">Display frames per second counter</div>
              </div>
              <div class="settings-row-control">
                <label class="badge video-toggle ${showFps ? 'badge-success' : ''}" data-setting="showFps">
                  <input type="checkbox" id="toggle-showfps" ${showFps ? 'checked' : ''}> 
                  <span class="toggle-label">${showFps ? 'ON' : 'OFF'}</span>
                </label>
              </div>
            </div>

            <!-- Motion Blur -->
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Motion Blur</div>
                <div class="settings-row-desc">Speed blur at high velocity</div>
              </div>
              <div class="settings-row-control">
                <label class="badge video-toggle ${motionBlurEnabled ? 'badge-success' : ''}" data-setting="motionBlur">
                  <input type="checkbox" id="toggle-motionblur" ${motionBlurEnabled ? 'checked' : ''}> 
                  <span class="toggle-label">${motionBlurEnabled ? 'ON' : 'OFF'}</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Performance Stats -->
        <div class="card">
          <div class="hud-label">PERFORMANCE</div>
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:var(--space-s); margin-top:var(--space-l);">
            <div class="stat-card">
              <div class="stat-card-value" id="perf-fps">--</div>
              <div class="stat-card-label">FPS</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-value" id="perf-drawcalls">--</div>
              <div class="stat-card-label">Draw Calls</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-value" id="perf-memory">--</div>
              <div class="stat-card-label">Memory (MB)</div>
            </div>
          </div>
        </div>

        <!-- Apply Button -->
        <div style="display:flex; gap:var(--space-s); margin-top:var(--space-m);">
          <button class="btn btn-primary" id="btn-apply-video" style="flex:1;">
            Apply Changes
          </button>
          <button class="btn btn-ghost" id="btn-reset-video">
            Reset to Default
          </button>
        </div>

        <!-- Save Toast -->
        <div class="settings-toast" id="video-toast" style="display:none;">
          <span class="toast-icon">✓</span>
          <span>Changes Saved</span>
        </div>
        
        <!-- Apply Warning -->
        <div class="video-apply-warning" id="video-warning" style="display:none;">
          <span>⚠ Some changes require a scene reload to take effect.</span>
        </div>
      </div>
    </div>
  `;
  screen.appendChild(body);
  root.appendChild(screen);

  // Track if changes need apply
  let _hasChanges = false;

  // ==================== QUALITY PRESET HANDLERS ====================
  
  root.querySelectorAll('[data-quality]').forEach(tab => {
    tab.addEventListener('click', () => {
      playUISound('navigate');
      
      // Update active state
      root.querySelectorAll('[data-quality]').forEach(t => t.classList.remove('tab-active'));
      tab.classList.add('tab-active');
      
      const preset = tab.dataset.quality;
      
      // Update description
      const presetData = QUALITY_PRESETS.find(p => p.id === preset);
      if (presetData) {
        root.querySelector('#quality-desc').textContent = presetData.desc;
      }
      
      // Mark as changed
      engine.save.set('settings.video.quality', preset);
      _hasChanges = true;
      
      // Apply quality preset immediately
      if (engine.renderer) {
        try {
          engine.renderer.setQuality(preset);
        } catch (e) {
          console.warn('[video] Could not apply quality:', e);
        }
      }
    });
  });

  // ==================== SELECT DROPDOWN HANDLERS ====================

  // Resolution
  const resolutionSelect = root.querySelector('#video-resolution');
  resolutionSelect.addEventListener('change', () => {
    engine.save.set('settings.video.resolution', resolutionSelect.value);
    _hasChanges = true;
    showWarning();
  });

  // Shadow Quality
  const shadowSelect = root.querySelector('#video-shadows');
  shadowSelect.addEventListener('change', () => {
    engine.save.set('settings.video.shadowQuality', shadowSelect.value);
    _hasChanges = true;
  });

  // FPS Limit
  const fpsLimitSelect = root.querySelector('#video-fpslimit');
  fpsLimitSelect.addEventListener('change', () => {
    engine.save.set('settings.video.fpsLimit', fpsLimitSelect.value);
    _hasChanges = true;
  });

  // ==================== TOGGLE HANDLERS ====================

  const toggles = ['vsync', 'showFps', 'motionBlur'];
  toggles.forEach(toggleId => {
    const cb = root.querySelector(`#toggle-${toggleId}`);
    if (!cb) return;
    
    cb.addEventListener('change', () => {
      const label = cb.closest('.video-toggle')?.querySelector('.toggle-label');
      const badge = cb.closest('.video-toggle');
      
      if (label) label.textContent = cb.checked ? 'ON' : 'OFF';
      badge?.classList.toggle('badge-success', cb.checked);
      
      engine.save.set(`settings.video.${toggleId}`, cb.checked);
      _hasChanges = true;
      
      // Special handling for showFps - emit event to HUD
      if (toggleId === 'showFps') {
        engine.bus.emit('video:toggleFpsCounter', { visible: cb.checked });
      }
      
      playUISound('confirm');
    });
  });

  // ==================== APPLY BUTTON ====================

  root.querySelector('#btn-apply-video').addEventListener('click', () => {
    if (!_hasChanges) return;
    
    playUISound('confirm');
    
    // Apply all video settings
    const settings = {
      quality: engine.save.get('settings.video.quality'),
      resolution: engine.save.get('settings.video.resolution'),
      vsync: engine.save.get('settings.video.vsync'),
      motionBlur: engine.save.get('settings.video.motionBlur'),
      shadowQuality: engine.save.get('settings.video.shadowQuality'),
      showFps: engine.save.get('settings.video.showFps'),
      fpsLimit: engine.save.get('settings.video.fpsLimit')
    };
    
    // Use SettingsPersistence if available
    if (window.__settingsPersistence) {
      window.__settingsPersistence.applyGraphics(settings);
    } else if (engine.renderer) {
      // Fallback: apply quality directly
      try {
        engine.renderer.setQuality(settings.quality);
      } catch (e) { /* ignore */ }
    }
    
    // Emit event for other systems
    engine.bus.emit('video:settingsApplied', settings);
    
    _hasChanges = false;
    hideWarning();
    showSavedToast();
  });

  // Reset button
  root.querySelector('#btn-reset-video').addEventListener('click', () => {
    playUISound('navigate');
    
    // Reset to defaults
    const defaults = {
      quality: 'high',
      resolution: 'auto',
      vsync: true,
      motionBlur: false,
      shadowQuality: 'high',
      showFps: false,
      fpsLimit: 'unlimited'
    };
    
    for (const [key, val] of Object.entries(defaults)) {
      engine.save.set(`settings.video.${key}`, val);
    }
    
    // Reset UI
    root.querySelectorAll('[data-quality]').forEach(t => {
      t.classList.toggle('tab-active', t.dataset.quality === defaults.quality);
    });
    root.querySelector('#quality-desc').textContent = 
      QUALITY_PRESETS.find(p => p.id === defaults.quality)?.desc || '';
    
    resolutionSelect.value = defaults.resolution;
    root.querySelector('#video-shadows').value = defaults.shadowQuality;
    root.querySelector('#video-fpslimit').value = defaults.fpsLimit;
    
    root.querySelector('#toggle-vsync').checked = defaults.vsync;
    root.querySelector('#toggle-showfps').checked = defaults.showFps;
    root.querySelector('#toggle-motionblur').checked = defaults.motionBlur;
    
    // Update labels
    ['vsync', 'showFps', 'motionBlur'].forEach(t => {
      const cb = root.querySelector(`#toggle-${t}`);
      const label = cb?.closest('.video-toggle')?.querySelector('.toggle-label');
      const badge = cb?.closest('.video-toggle');
      if (label) label.textContent = cb.checked ? 'ON' : 'OFF';
      badge?.classList.toggle('badge-success', cb.checked);
    });
    
    _hasChanges = true;
    showSavedToast('Reset to Defaults');
  });

  // Navigation handlers
  root.querySelectorAll('.settings-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      playUISound('navigate');
      window.__uiRouter.replace(item.dataset.section);
    });
  });

  // ==================== PERFORMANCE STATS UPDATE ====================
  
  // Update performance stats periodically
  let _statsInterval = setInterval(() => {
    try {
      // Get FPS from renderer if available
      const fpsEl = root.querySelector('#perf-fps');
      if (fpsEl && engine.renderer?._clock) {
        // Estimate FPS from delta time
        const delta = engine.renderer._clock.getDelta();
        if (delta > 0) {
          fpsEl.textContent = Math.round(1 / delta);
        }
      }
      
      // Draw calls estimate (from Three.js info if available)
      const drawCallsEl = root.querySelector('#perf-drawcalls');
      if (drawCallsEl && engine.renderer?._renderer?.info) {
        drawCallsEl.textContent = engine.renderer._renderer.info.render.calls || '--';
      }
      
      // Memory estimate
      const memoryEl = root.querySelector('#perf-memory');
      if (memoryEl && performance.memory) {
        memoryEl.textContent = Math.round(performance.memory.usedJSHeapSize / 1048576);
      } else if (memoryEl) {
        memoryEl.textContent = '--';
      }
    } catch (e) {
      // Stats not available
    }
  }, 1000);

  // Helper functions
  function showSavedToast(msg = 'Changes Saved') {
    const toast = root.querySelector('#video-toast');
    if (!toast) return;
    
    toast.querySelector('span:last-child').textContent = msg;
    toast.style.display = '';
    toast.classList.add('toast-visible');
    
    if (toast._timeout) clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('toast-visible');
      setTimeout(() => { toast.style.display = 'none'; }, 300);
    }, 2000);
  }

  function showWarning() {
    const warning = root.querySelector('#video-warning');
    if (warning) warning.style.display = '';
  }

  function hideWarning() {
    const warning = root.querySelector('#video-warning');
    if (warning) warning.style.display = 'none';
  }

  // Cleanup
  root._cleanup = () => {
    if (_statsInterval) clearInterval(_statsInterval);
  };
}

export async function unmount(root) {
  if (root._cleanup) root._cleanup();
}

export default { mount, unmount };
