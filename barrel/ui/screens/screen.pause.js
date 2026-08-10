// barrel/ui/screens/screen.pause.js — Complete pause menu overlay
// Features: full-screen blur backdrop, menu options, quick settings (master volume only),
// confirm dialogs for restart/quit, keyboard shortcuts, slide-in animation from top,
// blocks game input while open, emits pause:resume/pause:restart/pause:quit events

import { el, playUISound } from './_shared.js';

// State for settings (read from save system)
let _settingsState = {
  masterVolume: 1.0
};

// Load settings from save system if available
function _loadSettings() {
  try {
    const save = window.__engine?.save;
    if (save) {
      _settingsState.masterVolume = save.get('settings.audio.master') ?? 1.0;
    }
  } catch (e) {
    console.warn('[pause] Could not load settings:', e);
  }
}

// Save settings back to save system
function _saveSettings() {
  try {
    const save = window.__engine?.save;
    if (save) {
      save.set('settings.audio.master', _settingsState.masterVolume);
      
      // Apply audio volume immediately
      if (window.__engine?.audio) {
        window.__engine.audio.setBusVolume('master', _settingsState.masterVolume);
      }
    }
  } catch (e) {
    console.warn('[pause] Could not save settings:', e);
  }
}

export async function mount(root, payload, ctx) {
  // Load current settings
  _loadSettings();

  // Check if this is a multiplayer race
  const isMultiplayer = payload?.isMultiplayer || false;

  // Block game input while pause is open
  if (window.__engine?.input) {
    window.__engine.input.setOnScreenUI(true);
  }

  root.innerHTML = `
    <div class="pause-overlay" id="pause-overlay">
      <!-- Blur backdrop -->
      <div class="pause-backdrop" id="pause-backdrop"></div>
      
      <!-- Pause card with slide-from-top animation -->
      <div class="pause-card anim-slide-in-top" id="pause-card">
        
        <!-- Header -->
        <div class="pause-header">
          <h2 class="pause-title">PAUSED</h2>
          <div class="pause-subtitle">Race Paused</div>
        </div>

        <!-- Main Menu Options -->
        <div class="pause-menu" id="pause-menu">
          <button class="btn btn-primary btn-lg pause-btn-primary" data-action="resume" id="btn-resume">
            <span class="pause-btn-icon">▶</span>
            <span>RESUME</span>
          </button>
          
          <button class="btn pause-btn-secondary" data-action="restart" id="btn-restart">
            <span class="pause-btn-icon">↻</span>
            <span>RESTART</span>
          </button>
          
          <button class="btn pause-btn-secondary" data-action="settings" id="btn-settings">
            <span class="pause-btn-icon">⚙</span>
            <span>SETTINGS</span>
          </button>
          
          ${isMultiplayer ? `
          <button class="btn pause-btn-secondary" data-action="spectate" id="btn-spectate">
            <span class="pause-btn-icon">👁</span>
            <span>SPECTATE</span>
          </button>
          ` : ''}
          
          <button class="btn btn-ghost pause-btn-danger" data-action="quit" id="btn-quit">
            <span class="pause-btn-icon">✕</span>
            <span>QUIT TO MENU</span>
          </button>
        </div>

        <!-- Quick Settings Panel (hidden by default) - Master Volume Only -->
        <div class="pause-settings-panel" id="pause-settings" style="display:none;">
          <div class="pause-settings-header">
            <h3>Quick Settings</h3>
            <button class="btn btn-ghost btn-sm" data-action="close-settings">✕</button>
          </div>
          
          <div class="pause-setting-row">
            <label class="pause-setting-label">
              <span class="setting-icon">🔊</span>
              <span>Master Volume</span>
            </label>
            <input type="range" class="pause-slider" id="slider-master" 
                   min="0" max="100" value="${Math.round(_settingsState.masterVolume * 100)}"
                   data-setting="masterVolume">
            <span class="pause-setting-value" id="value-master">${Math.round(_settingsState.masterVolume * 100)}%</span>
          </div>
          
          <button class="btn btn-primary btn-sm" data-action="apply-settings" style="margin-top: var(--space-m); width:100%;">
            Apply
          </button>
        </div>

        <!-- Confirm Dialog (hidden by default) -->
        <div class="pause-confirm-dialog" id="pause-confirm" style="display:none;">
          <div class="confirm-content">
            <div class="confirm-icon">⚠</div>
            <p class="confirm-message" id="confirm-message">Are you sure? Progress will be lost.</p>
            <div class="confirm-actions">
              <button class="btn btn-primary" data-action="confirm-yes">Yes</button>
              <button class="btn btn-ghost" data-action="confirm-no">Cancel</button>
            </div>
          </div>
        </div>

        <!-- Keyboard Shortcuts Hint -->
        <div class="pause-shortcuts">
          <span><kbd>ESC</kbd> Resume</span>
          <span><kbd>R</kbd> Restart</span>
          <span><kbd>Q</kbd> Quit</span>
        </div>
      </div>
    </div>
  `;

  // Store pending action for confirm dialog
  let _pendingAction = null;

  // ==================== BUTTON HANDLERS ====================

  // Resume button - emit pause:resume event
  root.querySelector('#btn-resume').addEventListener('click', () => {
    playUISound('confirm');
    window.__engine.bus.emit('pause:resume');
    window.__engine.bus.emit('ui:hidePause');
  });

  // Restart button - shows confirmation dialog
  root.querySelector('#btn-restart').addEventListener('click', () => {
    showConfirm('Are you sure? Progress will be lost.', 'restart');
  });

  // Settings toggle - navigate to full settings or show quick settings panel
  root.querySelector('#btn-settings').addEventListener('click', () => {
    playUISound('navigate');
    const settingsPanel = root.querySelector('#pause-settings');
    const mainMenu = root.querySelector('#pause-menu');
    
    if (settingsPanel.style.display === 'none') {
      settingsPanel.style.display = '';
      mainMenu.style.display = 'none';
    } else {
      settingsPanel.style.display = 'none';
      mainMenu.style.display = '';
    }
  });

  // Close settings panel
  root.querySelector('[data-action="close-settings"]').addEventListener('click', () => {
    const settingsPanel = root.querySelector('#pause-settings');
    const mainMenu = root.querySelector('#pause-menu');
    settingsPanel.style.display = 'none';
    mainMenu.style.display = '';
    playUISound('back');
  });

  // Spectate button (multiplayer only)
  const spectateBtn = root.querySelector('#btn-spectate');
  if (spectateBtn) {
    spectateBtn.addEventListener('click', () => {
      playUISound('confirm');
      window.__engine.bus.emit('ui:hidePause');
      window.__engine.bus.emit('race:spectate');
    });
  }

  // Quit button - shows confirmation dialog
  root.querySelector('#btn-quit').addEventListener('click', () => {
    showConfirm('Are you sure? Progress will be lost.', 'quit');
  });

  // Apply settings button - saves master volume
  root.querySelector('[data-action="apply-settings"]').addEventListener('click', () => {
    _saveSettings();
    playUISound('confirm');
    
    // Show brief feedback
    const btn = root.querySelector('[data-action="apply-settings"]');
    const originalText = btn.textContent;
    btn.textContent = 'Applied!';
    setTimeout(() => { btn.textContent = originalText; }, 1000);
  });

  // Master volume slider handler with live preview
  const masterSlider = root.querySelector('#slider-master');
  if (masterSlider) {
    masterSlider.addEventListener('input', (e) => {
      const value = parseFloat(e.target.value);
      _settingsState.masterVolume = value / 100;
      const valueEl = root.querySelector('#value-master');
      if (valueEl) valueEl.textContent = `${Math.round(value)}%`;

      // Live preview audio changes
      if (window.__engine?.audio) {
        window.__engine.audio.setBusVolume('master', value / 100);
      }
    });
  }

  // Confirm dialog handlers
  root.querySelector('[data-action="confirm-yes"]').addEventListener('click', () => {
    playUISound('confirm');
    hideConfirm();
    
    if (_pendingAction === 'restart') {
      performRestart();
    } else if (_pendingAction === 'quit') {
      performQuit();
    }
    _pendingAction = null;
  });

  root.querySelector('[data-action="confirm-no"]').addEventListener('click', () => {
    playUISound('back');
    hideConfirm();
    _pendingAction = null;
  });

  // ==================== KEYBOARD SHORTCUTS ====================

  const _keyHandler = (e) => {
    // Don't handle if confirm dialog is showing and user is just pressing Enter/Escape on it
    const confirmDialog = root.querySelector('#pause-confirm');
    const isConfirmVisible = confirmDialog && confirmDialog.style.display !== 'none';
    
    switch (e.key.toLowerCase()) {
      case 'escape':
        e.preventDefault();
        if (isConfirmVisible) {
          root.querySelector('[data-action="confirm-no"]').click();
        } else {
          root.querySelector('#btn-resume').click();
        }
        break;
      case 'r':
        if (!e.ctrlKey && !e.metaKey && !isConfirmVisible && document.activeElement.tagName !== 'INPUT') {
          e.preventDefault();
          showConfirm('Are you sure? Progress will be lost.', 'restart');
        }
        break;
      case 'q':
        if (!e.ctrlKey && !e.metaKey && !isConfirmVisible && document.activeElement.tagName !== 'INPUT') {
          e.preventDefault();
          showConfirm('Are you sure? Progress will be lost.', 'quit');
        }
        break;
      case 'enter':
        if (isConfirmVisible) {
          e.preventDefault();
          root.querySelector('[data-action="confirm-yes"]').click();
        }
        break;
    }
  };

  document.addEventListener('keydown', _keyHandler);

  // Store cleanup function
  root._cleanup = () => {
    document.removeEventListener('keydown', _keyHandler);
    // Restore game input
    if (window.__engine?.input) {
      window.__engine.input.setOnScreenUI(false);
    }
  };

  // ==================== HELPER FUNCTIONS ====================

  function showConfirm(message, action) {
    playUISound('navigate');
    _pendingAction = action;
    
    const confirmDialog = root.querySelector('#pause-confirm');
    const confirmMessage = root.querySelector('#confirm-message');
    const mainMenu = root.querySelector('#pause-menu');
    const settingsPanel = root.querySelector('#pause-settings');
    
    confirmMessage.textContent = message;
    confirmDialog.style.display = '';
    mainMenu.style.display = 'none';
    settingsPanel.style.display = 'none';
  }

  function hideConfirm() {
    const confirmDialog = root.querySelector('#pause-confirm');
    const mainMenu = root.querySelector('#pause-menu');
    
    confirmDialog.style.display = 'none';
    mainMenu.style.display = '';
  }

  function performRestart() {
    const engine = window.__engine;
    const racePayload = engine.state.get('race.payload');
    
    // Emit restart event
    engine.bus.emit('pause:restart');
    
    // Leave multiplayer if applicable
    if (isMultiplayer) {
      window.__onlineMultiplayer?.disconnect();
    }
    
    engine.scenes.transition(engine.resolver.resolve('scenes', 'race'), racePayload);
    window.__engine.bus.emit('ui:hidePause');
  }

  function performQuit() {
    const engine = window.__engine;
    
    // Emit quit event
    engine.bus.emit('pause:quit');
    
    // Disconnect from multiplayer if applicable
    if (isMultiplayer) {
      window.__onlineMultiplayer?.disconnect();
    }
    
    // Transition to empty scene and return to menu
    engine.scenes.transition({ module: { mount: async () => {}, unmount: async () => {} } }, {});
    document.getElementById('ui-shell').style.display = 'block';
    window.__uiRouter.popToRoot();
  }
}

export async function unmount(root) {
  if (root._cleanup) root._cleanup();
  // Ensure game input is restored
  if (window.__engine?.input) {
    window.__engine.input.setOnScreenUI(false);
  }
}

export default { mount, unmount };
