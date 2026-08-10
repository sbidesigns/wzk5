// barrel/ui/screens/screen.settings.audio.js — Audio mixing board
// Features: Master/Music/SFX/Engine/UI volume sliders, mute toggle per-bus,
// preview button for each bus, live preview as sliders move,
// save to SaveSystem on change, load from SaveSystem on mount

import { el, topNav, screenHeader, playUISound } from './_shared.js';

// Audio bus definitions
const AUDIO_BUSES = [
  { id: 'master', name: 'Master Volume', desc: 'Overall volume control', icon: '🔊', previewSound: 'ui.confirm' },
  { id: 'music', name: 'Music', desc: 'Background music and tracks', icon: '🎵', previewSound: 'music.menu' },
  { id: 'sfx', name: 'SFX', desc: 'In-race sound effects (collisions, drifts)', icon: '💥', previewSound: 'sfx.crash' },
  { id: 'engine', name: 'Engine', desc: 'Vehicle engine audio', icon: '🏎️', previewSound: 'engine.idle' },
  { id: 'ui', name: 'UI Sounds', desc: 'Menu and button sounds', icon: '🔔', previewSound: 'ui.click' }
];

// Default values
const DEFAULT_VOLUMES = {
  master: 1.0,
  music: 0.7,
  sfx: 0.9,
  voice: 0.8,
  ui: 0.8,
  engine: 0.85
};

const DEFAULT_MUTED = {
  master: false,
  music: false,
  sfx: false,
  voice: false,
  ui: false,
  engine: false
};

export async function mount(root, payload, ctx) {
  const engine = window.__engine;
  
  // Load current values from save system
  function loadVolume(busId) {
    try {
      const saved = engine.save.get(`settings.audio.${busId}`);
      return saved != null ? saved : DEFAULT_VOLUMES[busId] ?? 0.8;
    } catch (e) {
      return DEFAULT_VOLUMES[busId] ?? 0.8;
    }
  }

  function loadMuted(busId) {
    try {
      const saved = engine.save.get(`settings.audio.${busId}Muted`);
      return saved != null ? saved : DEFAULT_MUTED[busId] ?? false;
    } catch (e) {
      return DEFAULT_MUTED[busId] ?? false;
    }
  }

  root.appendChild(topNav());
  const screen = el('div', 'screen');
  screen.appendChild(screenHeader('AUDIO', 'Bus volumes, output device, positional audio'));
  const body = el('div', 'screen-body');

  // Build slider row HTML
  const sliderRow = (bus) => {
    const vol = loadVolume(bus.id);
    const muted = loadMuted(bus.id);
    const volPercent = Math.round(vol * 100);
    
    return `
      <div class="audio-bus-row" data-bus="${bus.id}">
        <div class="audio-bus-info">
          <span class="audio-bus-icon">${bus.icon}</span>
          <div class="audio-bus-label">
            <div class="audio-bus-name">${bus.name}</div>
            <div class="audio-bus-desc">${bus.desc}</div>
          </div>
        </div>
        <div class="audio-bus-controls">
          <button class="btn btn-ghost btn-sm audio-mute-btn" data-mute="${bus.id}" title="${muted ? 'Unmute' : 'Mute'}">
            ${muted ? '🔇' : '🔊'}
          </button>
          <div class="audio-slider-wrap">
            <input type="range" class="slider audio-slider" 
                   min="0" max="100" value="${volPercent}" 
                   data-bus="${bus.id}" ${muted ? 'disabled' : ''}>
            <span class="audio-value" data-value="${bus.id}">${volPercent}%</span>
          </div>
          <button class="btn btn-ghost btn-sm audio-preview-btn" data-preview="${bus.id}" title="Preview sound">
            ▶
          </button>
        </div>
      </div>
    `;
  };

  body.innerHTML = `
    <div class="settings-layout">
      <div class="settings-nav">
        ${['audio','video','controls','gameplay','accessibility'].map(s => `
          <div class="settings-nav-item ${s === 'audio' ? 'active' : ''}" data-section="settings.${s}">
            <div style="width:32px; height:32px; border-radius:50%; background:var(--surface-glass); display:flex; align-items:center; justify-content:center; font-size:16px;">
              ${s === 'audio' ? '🔊' : s === 'video' ? '🖥' : s === 'controls' ? '🎮' : s === 'gameplay' ? '⚡' : '♿'}
            </div>
            <div>${s.charAt(0).toUpperCase() + s.slice(1)}</div>
          </div>
        `).join('')}
      </div>
      <div class="settings-panel">
        <div class="card">
          <div class="hud-label">VOLUME MIXER</div>
          <p style="color:var(--text-secondary); font-size:var(--text-body-s); margin-top:var(--space-s);">
            Adjust volume for each audio channel. Changes are applied immediately.
          </p>
          <div class="audio-mixer" style="display:flex; flex-direction:column; gap:var(--space-m); margin-top:var(--space-l);">
            ${AUDIO_BUSES.map(sliderRow).join('')}
          </div>
        </div>
        
        <div class="card">
          <div class="hud-label">OUTPUT</div>
          <div style="display:flex; flex-direction:column; gap:var(--space-s); margin-top:var(--space-l);">
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Output Device</div>
                <div class="settings-row-desc">Audio output device</div>
              </div>
              <div class="settings-row-control">
                <select class="input audio-output-select" style="min-width:220px;" id="output-device">
                  <option value="default">System Default</option>
                  <option value="headphones">Headphones</option>
                  <option value="speakers">Speakers</option>
                  <option value="hdmi">HDMI</option>
                </select>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Positional Audio</div>
                <div class="settings-row-desc">3D spatial sound in race</div>
              </div>
              <div class="settings-row-control">
                <label class="badge audio-toggle" data-setting="positional">
                  <input type="checkbox" id="toggle-positional"> 
                  <span class="toggle-label">ENABLED</span>
                </label>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Voice Chat</div>
                <div class="settings-row-desc">Push-to-talk in lobby</div>
              </div>
              <div class="settings-row-control">
                <label class="badge audio-toggle" data-setting="voiceChat">
                  <input type="checkbox" id="toggle-voiceChat"> 
                  <span class="toggle-label">DISABLED</span>
                </label>
              </div>
            </div>
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Subtitles</div>
                <div class="settings-row-desc">Show voice subtitles</div>
              </div>
              <div class="settings-row-control">
                <label class="badge audio-toggle" data-setting="subtitles">
                  <input type="checkbox" id="toggle-subtitles" checked> 
                  <span class="toggle-label">ENABLED</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Save indicator -->
        <div class="settings-toast" id="audio-toast" style="display:none;">
          <span class="toast-icon">✓</span>
          <span>Changes Saved</span>
        </div>
      </div>
    </div>
  `;
  screen.appendChild(body);
  root.appendChild(screen);

  // ==================== SLIDER HANDLERS ====================
  
  // Load saved toggle states
  const toggleSettings = ['positional', 'voiceChat', 'subtitles'];
  toggleSettings.forEach(key => {
    const cb = root.querySelector(`#toggle-${key}`);
    if (!cb) return;
    
    try {
      const saved = engine.save.get(`settings.audio.${key}`);
      if (saved != null) cb.checked = saved;
    } catch (e) { /* ignore */ }
    
    updateToggleLabel(cb);
  });

  // Slider input handlers - live preview + save
  root.querySelectorAll('.audio-slider').forEach(input => {
    const busId = input.dataset.bus;
    
    input.addEventListener('input', (e) => {
      const vol = parseInt(e.target.value, 10);
      const valueEl = root.querySelector(`[data-value="${busId}"]`);
      
      if (valueEl) {
        valueEl.textContent = `${vol}%`;
      }
      
      // Live preview - apply volume immediately
      if (engine.audio) {
        engine.audio.setBusVolume(busId, vol / 100);
      }
    });

    // Save on change (after user releases slider)
    input.addEventListener('change', (e) => {
      const vol = parseInt(e.target.value, 10);
      
      // Save to SaveSystem
      engine.save.set(`settings.audio.${busId}`, vol / 100);
      
      // Show saved toast
      showSavedToast();
      
      playUISound('confirm');
    });
  });

  // Mute toggle handlers
  root.querySelectorAll('.audio-mute-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const busId = btn.dataset.mute;
      const slider = root.querySelector(`.audio-slider[data-bus="${busId}"]`);
      
      // Toggle muted state
      try {
        const currentMuted = engine.save.get(`settings.audio.${busId}Muted`) || false;
        const newMuted = !currentMuted;
        
        // Update UI
        btn.textContent = newMuted ? '🔇' : '🔊';
        btn.title = newMuted ? 'Unmute' : 'Mute';
        if (slider) slider.disabled = newMuted;
        
        // Apply mute
        if (engine.audio) {
          engine.audio.setBusMuted(busId, newMuted);
        }
        
        // Save
        engine.save.set(`settings.audio.${busId}Muted`, newMuted);
        
        showSavedToast();
        playUISound('confirm');
      } catch (e) {
        console.error('[audio] Failed to toggle mute:', e);
      }
    });
  });

  // Preview button handlers
  root.querySelectorAll('.audio-preview-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const busId = btn.dataset.preview;
      const busConfig = AUDIO_BUSES.find(b => b.id === busId);
      
      if (busConfig && engine.audio) {
        // Play preview sound
        try {
          engine.audio.play(busConfig.previewSound || `preview.${busId}`);
        } catch (e) {
          // Fallback: play a generic UI sound
          engine.audio.ui('confirm');
        }
        
        // Visual feedback
        btn.classList.add('previewing');
        setTimeout(() => btn.classList.remove('previewing'), 300);
      }
      
      playUISound('navigate');
    });
  });

  // Toggle checkbox handlers
  root.querySelectorAll('.audio-toggle input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const setting = cb.closest('.audio-toggle').dataset.setting;
      
      // Save to SaveSystem
      engine.save.set(`settings.audio.${setting}`, cb.checked);
      
      // Update label
      updateToggleLabel(cb);
      
      showSavedToast();
      playUISound('confirm');
    });
  });

  // Output device handler
  const outputSelect = root.querySelector('#output-device');
  if (outputSelect) {
    // Load saved value
    try {
      const savedDevice = engine.save.get('settings.audio.outputDevice');
      if (savedDevice) outputSelect.value = savedDevice;
    } catch (e) { /* ignore */ }
    
    outputSelect.addEventListener('change', () => {
      engine.save.set('settings.audio.outputDevice', outputSelect.value);
      showSavedToast();
      playUISound('confirm');
    });
  }

  // Navigation handlers
  root.querySelectorAll('.settings-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      playUISound('navigate');
      window.__uiRouter.replace(item.dataset.section);
    });
  });

  // Helper functions
  function showSavedToast() {
    const toast = root.querySelector('#audio-toast');
    if (!toast) return;
    
    toast.style.display = '';
    toast.classList.add('toast-visible');
    
    // Clear any existing timeout
    if (toast._timeout) clearTimeout(toast._timeout);
    
    toast._timeout = setTimeout(() => {
      toast.classList.remove('toast-visible');
      setTimeout(() => { toast.style.display = 'none'; }, 300);
    }, 2000);
  }

  function updateToggleLabel(cb) {
    const label = cb.closest('.audio-toggle')?.querySelector('.toggle-label');
    if (label) {
      label.textContent = cb.checked ? 'ENABLED' : 'DISABLED';
    }
    
    const badge = cb.closest('.audio-toggle');
    if (badge) {
      badge.classList.toggle('badge-success', cb.checked);
    }
  }
}

export async function unmount(root) {}

export default { mount, unmount };
