// barrel/ui/screens/screen.settings.root.js — Settings hub with category navigation
// Features: category cards with navigation, current values preview for each category,
// Reset to Defaults button with confirmation, "Changes Saved" toast indicator

import { el, topNav, screenHeader, playUISound } from './_shared.js';

// Category definitions with icons and descriptions
const CATEGORIES = [
  { 
    id: 'settings.audio',         
    name: 'Audio',          
    desc: 'Master volume, music, SFX, voice, UI sounds, engine audio', 
    icon: '🔊',
    key: 'audio'
  },
  { 
    id: 'settings.video',         
    name: 'Video',          
    desc: 'Quality preset, resolution, shadows, bloom, FOV, vsync', 
    icon: '🖥',
    key: 'video'
  },
  { 
    id: 'settings.controls',      
    name: 'Controls',       
    desc: 'Keyboard, gamepad, touch bindings, deadzone, sensitivity', 
    icon: '🎮',
    key: 'controls'
  },
  { 
    id: 'settings.gameplay',      
    name: 'Gameplay',       
    desc: 'Difficulty, rubber-band, camera, auto-drift assist', 
    icon: '⚡',
    key: 'gameplay'
  },
  { 
    id: 'settings.accessibility', 
    name: 'Accessibility',  
    desc: 'Colorblind mode, subtitles, motion reduction, text size', 
    icon: '♿',
    key: 'accessibility'
  }
];

// Get current value summary for each category
function getCategoryPreview(categoryKey) {
  try {
    const save = window.__engine?.save;
    if (!save) return '—';
    
    switch (categoryKey) {
      case 'audio': {
        const master = save.get('settings.audio.master');
        return master != null ? `Master: ${Math.round(master * 100)}%` : 'Default';
      }
      case 'video': {
        const quality = save.get('settings.video.quality') || 'high';
        return `Quality: ${quality.charAt(0).toUpperCase() + quality.slice(1)}`;
      }
      case 'controls': {
        const scheme = save.get('settings.controls.scheme') || 'wasd';
        return `Scheme: ${scheme.toUpperCase()}`;
      }
      case 'gameplay': {
        const difficulty = save.get('settings.gameplay.difficulty') || 'normal';
        return `Difficulty: ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`;
      }
      case 'accessibility': {
        const colorblind = save.get('settings.accessibility.colorblind') || 'none';
        return colorblind !== 'none' ? `Colorblind: ${colorblind}` : 'No accessibility options';
      }
      default:
        return '—';
    }
  } catch (e) {
    return '—';
  }
}

export async function mount(root, payload, ctx) {
  root.appendChild(topNav());
  const screen = el('div', 'screen');
  screen.appendChild(screenHeader('SETTINGS', 'Configure your game'));
  const body = el('div', 'screen-body');

  body.innerHTML = `
    <div class="settings-layout">
      <div class="settings-nav">
        ${CATEGORIES.map((s, i) => `
          <div class="settings-nav-item ${i === 0 ? 'active' : ''}" data-section="${s.id}" data-key="${s.key}">
            <div style="width:32px; height:32px; border-radius:50%; background:var(--surface-glass); display:flex; align-items:center; justify-content:center; font-size:16px;">${s.icon}</div>
            <div class="settings-nav-text">
              <div class="settings-nav-name">${s.name}</div>
              <div class="settings-nav-preview" id="preview-${s.key}">${getCategoryPreview(s.key)}</div>
            </div>
          </div>
        `).join('')}
        <div style="margin-top:auto; padding-top:var(--space-l); border-top:1px solid var(--border-subtle);">
          <button class="btn btn-ghost btn-sm" style="width:100%;" id="btn-reset-defaults">RESET TO DEFAULTS</button>
        </div>
      </div>
      <div class="settings-panel" id="settings-panel">
        <div class="card">
          <div class="hud-label">WELCOME</div>
          <h3 style="font-family:var(--font-display); font-size:var(--text-heading-l); margin:var(--space-s) 0;">CONFIGURE YOUR GAME</h3>
          <p style="color:var(--text-secondary); line-height:1.6;">Select a category on the left to configure. All settings are persisted to local storage and applied immediately. Most settings can be changed mid-race via the pause menu.</p>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-s); margin-top:var(--space-l);">
            <div class="settings-row" style="padding:var(--space-m);">
              <div class="settings-row-label">
                <div class="settings-row-title">Profile</div>
                <div class="settings-row-desc">Local player data</div>
              </div>
              <div class="badge" id="profile-badge">ACE · LVL 7</div>
            </div>
            <div class="settings-row" style="padding:var(--space-m);">
              <div class="settings-row-label">
                <div class="settings-row-title">Save Data</div>
                <div class="settings-row-desc">Last synced</div>
              </div>
              <div class="badge badge-success" id="save-status">SYNCED</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Save Toast (hidden by default) -->
    <div class="settings-toast" id="settings-toast" style="display:none;">
      <span class="toast-icon">✓</span>
      <span>Changes Saved</span>
    </div>

    <!-- Confirm Reset Dialog (hidden by default) -->
    <div class="pause-confirm-dialog" id="reset-confirm" style="display:none; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); z-index:1000;">
      <div class="confirm-content">
        <div class="confirm-icon">⚠</div>
        <p class="confirm-message">Reset all settings to defaults? This cannot be undone.</p>
        <div class="confirm-actions">
          <button class="btn btn-primary" data-action="reset-yes">Reset All</button>
          <button class="btn btn-ghost" data-action="reset-no">Cancel</button>
        </div>
      </div>
    </div>
  `;

  screen.appendChild(body);
  root.appendChild(screen);

  // Update profile badge if available
  try {
    const progression = window.__engine?.save?.get('progression');
    if (progression) {
      const profileBadge = root.querySelector('#profile-badge');
      if (profileBadge) {
        // Could show actual player name/level here
      }
    }
  } catch (e) { /* ignore */ }

  // Navigation click handlers
  root.querySelectorAll('.settings-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      playUISound('navigate');
      window.__uiRouter.push(item.dataset.section);
    });
  });

  // Reset to defaults handler
  const resetBtn = root.querySelector('#btn-reset-defaults');
  const resetConfirm = root.querySelector('#reset-confirm');
  
  resetBtn.addEventListener('click', () => {
    playUISound('navigate');
    resetConfirm.style.display = '';
  });

  root.querySelector('[data-action="reset-yes"]').addEventListener('click', async () => {
    playUISound('confirm');
    resetConfirm.style.display = '';
    
    try {
      // Use SettingsPersistence if available, otherwise use SaveSystem directly
      if (window.__settingsPersistence) {
        await window.__settingsPersistence.resetToDefaults();
      } else {
        // Fallback: reset settings via SaveSystem
        const save = window.__engine?.save;
        if (save && save.reset) {
          // We need to only reset settings, not everything
          const defaults = save.getDefaultSave()?.settings;
          if (defaults) {
            for (const [cat, values] of Object.entries(defaults)) {
              for (const [key, val] of Object.entries(values)) {
                save.set(`settings.${cat}.${key}`, val);
              }
            }
          }
        }
      }
      
      // Show saved toast
      showSavedToast();
      
      // Refresh previews
      refreshPreviews();
      
      // Apply resets to systems
      if (window.__settingsPersistence) {
        const allSettings = window.__settingsPersistence.getAll();
        window.__settingsPersistence.applyAudio(allSettings.audio);
        window.__settingsPersistence.applyGraphics(allSettings.video);
        window.__settingsPersistence.applyInput(allSettings.controls);
      }
      
      window.__engine.bus.emit('settings:reset');
    } catch (e) {
      console.error('[settings.root] Failed to reset:', e);
    }
  });

  root.querySelector('[data-action="reset-no"]').addEventListener('click', () => {
    playUISound('back');
    resetConfirm.style.display = 'none';
  });

  // Listen for settings changes to update previews
  const unlisten = window.__engine?.save?.on('settings', () => {
    refreshPreviews();
  });

  // Helper functions
  function refreshPreviews() {
    CATEGORIES.forEach(cat => {
      const previewEl = root.querySelector(`#preview-${cat.key}`);
      if (previewEl) {
        previewEl.textContent = getCategoryPreview(cat.key);
      }
    });
    
    // Update save status
    const statusBadge = root.querySelector('#save-status');
    if (statusBadge) {
      statusBadge.textContent = 'SYNCED';
      statusBadge.className = 'badge badge-success';
    }
  }

  function showSavedToast() {
    const toast = root.querySelector('#settings-toast');
    if (!toast) return;
    
    toast.style.display = '';
    toast.classList.add('toast-visible');
    
    setTimeout(() => {
      toast.classList.remove('toast-visible');
      setTimeout(() => {
        toast.style.display = 'none';
      }, 300);
    }, 2000);
  }

  // Store cleanup
  root._cleanup = () => {
    if (unlisten) unlisten();
  };
}

export async function unmount(root) {
  if (root._cleanup) root._cleanup();
}

export default { mount, unmount };
