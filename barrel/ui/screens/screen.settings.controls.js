// barrel/ui/screens/screen.settings.controls.js — Control remapping screen
// Features: Action list with current bindings, click to rebind workflow,
// controller type tabs (Keyboard/Mouse/Gamepad/Touch), sensitivity sliders,
// invert Y-axis toggle, deadzone slider for gamepad, reset to defaults per-controller,
// conflict detection warning, save to SaveSystem/input.config.json

import { el, topNav, screenHeader, playUISound } from './_shared.js';

// Controller type tabs
const CONTROLLER_TYPES = [
  { id: 'keyboard', name: 'Keyboard', icon: '⌨️' },
  { id: 'mouse', name: 'Mouse', icon: '🖱️' },
  { id: 'gamepad', name: 'Gamepad', icon: '🎮' },
  { id: 'touch', name: 'Touch', icon: '👆' }
];

// Actions that can be rebound (excluding navigation actions)
const REBINDABLE_ACTIONS = [
  { id: 'throttle', label: 'Accelerate', category: 'driving' },
  { id: 'brake', label: 'Brake / Reverse', category: 'driving' },
  { id: 'steerLeft', label: 'Steer Left', category: 'driving' },
  { id: 'steerRight', label: 'Steer Right', category: 'driving' },
  { id: 'drift', label: 'Drift / Handbrake', category: 'driving' },
  { id: 'useItem', label: 'Use Item', category: 'driving' },
  { id: 'lookBack', label: 'Look Back', category: 'driving' },
  { id: 'resetVehicle', label: 'Reset Vehicle', category: 'driving' },
  { id: 'pause', label: 'Pause', category: 'system' }
];

// Default keyboard bindings for reference
const DEFAULT_KEYBOARD_BINDINGS = {
  throttle: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  steerLeft: ['KeyA', 'ArrowLeft'],
  steerRight: ['KeyD', 'ArrowRight'],
  drift: ['Space'],
  useItem: ['KeyE'],
  lookBack: ['KeyC'],
  resetVehicle: ['KeyR'],
  pause: ['Escape']
};

// Default gamepad bindings
const DEFAULT_GAMEPAD_BINDINGS = {
  throttle: { type: 'axis', index: 7 },
  brake: { type: 'axis', index: 6 },
  steerLeft: { type: 'axis', index: 0, threshold: -0.2 },
  steerRight: { type: 'axis', index: 0, threshold: 0.2 },
  drift: { type: 'button', index: 0 },
  useItem: { type: 'button', index: 2 },
  lookBack: { type: 'button', index: 4 },
  resetVehicle: { type: 'button', index: 3 },
  pause: { type: 'button', index: 9 }
};

// Helper to format key code for display
function formatKeyCode(code) {
  const map = {
    'KeyW': 'W', 'KeyA': 'A', 'KeyS': 'S', 'KeyD': 'D',
    'KeyE': 'E', 'KeyQ': 'Q', 'KeyR': 'R', 'KeyC': 'C',
    'Space': 'SPACE', 'Escape': 'ESC', 'Enter': 'ENTER',
    'Tab': 'TAB', 'ShiftLeft': 'SHIFT', 'ControlLeft': 'CTRL',
    'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→'
  };
  return map[code] || code.replace(/^(Key|Digit|Numpad)/, '');
}

// Helper to format gamepad button/axis
function formatGamepadInput(binding) {
  if (!binding) return '—';
  if (binding.type === 'button') {
    const buttonNames = {
      0: 'A', 1: 'B', 2: 'X', 3: 'Y',
      4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
      8: 'BACK', 9: 'START', 10: 'L3', 11: 'R3',
      12: 'UP', 13: 'DOWN', 14: 'LEFT', 15: 'RIGHT'
    };
    return `Btn ${buttonNames[binding.index] || binding.index}`;
  } else if (binding.type === 'axis') {
    return `Axis ${binding.index}`;
  } else if (binding.type === 'hat') {
    return `D-Pad ${binding.value}`;
  }
  return '—';
}

export async function mount(root, payload, ctx) {
  const engine = window.__engine;
  
  // Load settings from save system
  function loadSetting(path, defaultValue) {
    try {
      const saved = engine.save.get(path);
      return saved != null ? saved : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  }

  // Current state
  let _activeControllerType = 'keyboard';
  let _rebindingAction = null; // Currently rebinding action ID
  let _bindings = {}; // Current loaded bindings

  // Load saved bindings or defaults
  function loadBindings(controllerType) {
    try {
      const saved = engine.save.get(`settings.controls.bindings.${controllerType}`);
      if (saved && Object.keys(saved).length > 0) {
        return saved;
      }
    } catch (e) { /* ignore */ }
    
    // Return defaults based on controller type
    if (controllerType === 'keyboard') {
      return { ...DEFAULT_KEYBOARD_BINDINGS };
    } else if (controllerType === 'gamepad') {
      return { ...DEFAULT_GAMEPAD_BINDINGS };
    }
    return {};
  }

  _bindings = loadBindings('keyboard');

  // Load sensitivity/deadzone values
  const steerSensitivity = loadSetting('settings.controls.steerSensitivity', 1.0);
  const throttleResponse = loadSetting('settings.controls.throttleResponse', 1.0);
  const invertYAxis = loadSetting('settings.controls.invertYAxis', false);
  const deadzone = loadSetting('settings.controls.deadzone', 0.18);

  root.appendChild(topNav());
  const screen = el('div', 'screen');
  screen.appendChild(screenHeader('CONTROLS', 'Bindings, sensitivity, deadzone'));
  const body = el('div', 'screen-body');

  body.innerHTML = `
    <div class="settings-layout">
      <div class="settings-nav">
        ${['audio','video','controls','gameplay','accessibility'].map(s => `
          <div class="settings-nav-item ${s === 'controls' ? 'active' : ''}" data-section="settings.${s}">
            <div style="width:32px; height:32px; border-radius:50%; background:var(--surface-glass); display:flex; align-items:center; justify-content:center; font-size:16px;">
              ${s === 'audio' ? '🔊' : s === 'video' ? '🖥' : s === 'controls' ? '🎮' : s === 'gameplay' ? '⚡' : '♿'}
            </div>
            <div>${s.charAt(0).toUpperCase() + s.slice(1)}</div>
          </div>
        `).join('')}
        
        <div style="margin-top:auto; padding-top:var(--space-l); border-top:1px solid var(--border-subtle);">
          <button class="btn btn-ghost btn-sm" style="width:100%;" id="btn-reset-controls">RESET BINDINGS</button>
        </div>
      </div>
      
      <div class="settings-panel">
        <!-- Controller Type Tabs -->
        <div class="card">
          <div class="hud-label">CONTROLLER TYPE</div>
          <div class="tab-bar" style="margin-top:var(--space-s);" id="controller-tabs">
            ${CONTROLLER_TYPES.map(ct => `
              <div class="tab ${ct.id === _activeControllerType ? 'tab-active' : ''}" data-controller="${ct.id}">
                ${ct.icon} ${ct.name}
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Bindings List -->
        <div class="card">
          <div class="hud-label">KEY BINDINGS</div>
          <p style="color:var(--text-secondary); font-size:var(--text-body-s); margin-top:var(--space-s);">
            Click a binding to rebind. Press any key or button to assign.
          </p>
          
          <!-- Conflict Warning -->
          <div class="controls-conflict-warning" id="conflict-warning" style="display:none;">
            <span>⚠ This binding conflicts with another action!</span>
          </div>
          
          <div class="bindings-list" id="bindings-list" style="display:flex; flex-direction:column; gap:var(--space-s); margin-top:var(--space-l);">
            ${REBINDABLE_ACTIONS.map(action => `
              <div class="binding-row" data-action="${action.id}">
                <div class="binding-info">
                  <div class="binding-label">${action.label}</div>
                  <div class="binding-category">${action.category}</div>
                </div>
                <div class="binding-buttons" id="bindings-${action.id}">
                  ${renderBindingButtons(action.id)}
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Sensitivity & Deadzone -->
        <div class="card">
          <div class="hud-label">SENSITIVITY</div>
          <div style="display:flex; flex-direction:column; gap:var(--space-s); margin-top:var(--space-l);">
            
            <!-- Steering Sensitivity -->
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Steering Sensitivity</div>
                <div class="settings-row-desc">Response curve for steering</div>
              </div>
              <div class="settings-row-control">
                <div style="display:flex; align-items:center; gap:var(--space-s); width:100%;">
                  <input type="range" class="slider controls-slider" min="0.1" max="2.0" step="0.1" 
                         value="${steerSensitivity}" data-setting="steerSensitivity"
                         style="flex:1;">
                  <span class="controls-value" id="value-steerSensitivity">${steerSensitivity.toFixed(1)}</span>
                </div>
              </div>
            </div>

            <!-- Throttle Response -->
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Throttle Response</div>
                <div class="settings-row-desc">How quickly throttle responds</div>
              </div>
              <div class="settings-row-control">
                <div style="display:flex; align-items:center; gap:var(--space-s); width:100%;">
                  <input type="range" class="slider controls-slider" min="0.1" max="2.0" step="0.1" 
                         value="${throttleResponse}" data-setting="throttleResponse"
                         style="flex:1;">
                  <span class="controls-value" id="value-throttleResponse">${throttleResponse.toFixed(1)}</span>
                </div>
              </div>
            </div>

            <!-- Invert Y-Axis -->
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Invert Y-Axis</div>
                <div class="settings-row-desc">Invert vertical camera/control axis</div>
              </div>
              <div class="settings-row-control">
                <label class="badge controls-toggle ${invertYAxis ? 'badge-success' : ''}" data-setting="invertYAxis">
                  <input type="checkbox" id="toggle-invertY" ${invertYAxis ? 'checked' : ''}> 
                  <span class="toggle-label">${invertYAxis ? 'ON' : 'OFF'}</span>
                </label>
              </div>
            </div>

            <!-- Deadzone (Gamepad only) -->
            <div class="settings-row" id="deadzone-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Stick Deadzone</div>
                <div class="settings-row-desc">Ignore small stick movements</div>
              </div>
              <div class="settings-row-control">
                <div style="display:flex; align-items:center; gap:var(--space-s); width:100%;">
                  <input type="range" class="slider controls-slider" min="0" max="0.5" step="0.01" 
                         value="${deadzone}" data-setting="deadzone"
                         style="flex:1;">
                  <span class="controls-value" id="value-deadzone">${deadzone.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Save Toast -->
        <div class="settings-toast" id="controls-toast" style="display:none;">
          <span class="toast-icon">✓</span>
          <span>Changes Saved</span>
        </div>
      </div>
    </div>
  `;
  screen.appendChild(body);
  root.appendChild(screen);

  // ==================== RENDER HELPERS ====================

  function renderBindingButtons(actionId) {
    const binding = _bindings[actionId];
    if (!binding) return '<span class="badge">Not bound</span>';
    
    if (_activeControllerType === 'keyboard') {
      // Keyboard: array of key codes
      const keys = Array.isArray(binding) ? binding : [binding];
      return keys.map(k => `
        <button class="badge binding-btn" data-action="${actionId}" data-key="${k}">
          ${formatKeyCode(k)}
        </button>
      `).join('');
    } else if (_activeControllerType === 'gamepad') {
      // Gamepad: object with type/index
      return `
        <button class="badge binding-btn" data-action="${actionId}">
          ${formatGamepadInput(binding)}
        </button>
      `;
    }
    
    return '<span class="badge">—</span>';
  }

  function refreshBindingsList() {
    const listEl = root.querySelector('#bindings-list');
    if (!listEl) return;
    
    listEl.innerHTML = REBINDABLE_ACTIONS.map(action => `
      <div class="binding-row ${_rebindingAction === action.id ? 'rebinding' : ''}" data-action="${action.id}">
        <div class="binding-info">
          <div class="binding-label">${action.label}</div>
          <div class="binding-category">${action.category}</div>
        </div>
        <div class="binding-buttons" id="bindings-${action.id}">
          ${_rebindingAction === action.id ? `
            <button class="badge badge-accent rebinding-indicator" id="rebind-indicator">
              Press any key...
            </button>
            <button class="btn btn-ghost btn-sm" id="cancel-rebind">Cancel</button>
          ` : renderBindingButtons(action.id)}
        </div>
      </div>
    `).join('');

    // Reattach event listeners after render
    attachBindingListeners();
  }

  function attachBindingListeners() {
    // Binding click handlers
    root.querySelectorAll('.binding-btn:not(.rebinding-indicator)').forEach(btn => {
      btn.addEventListener('click', () => {
        startRebinding(btn.dataset.action);
      });
    });

    // Cancel rebinding handler
    const cancelBtn = root.querySelector('#cancel-rebind');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', cancelRebinding);
    }
  }

  // ==================== REBINDING WORKFLOW ====================

  function startRebinding(actionId) {
    playUISound('navigate');
    _rebindingAction = actionId;
    refreshBindingsList();
    
    // Show conflict warning as hidden initially
    hideConflictWarning();

    // Set up input listener based on controller type
    if (_activeControllerType === 'keyboard') {
      document.addEventListener('keydown', handleKeyDownCapture);
    } else if (_activeControllerType === 'gamepad') {
      // Poll gamepad for button press
      _gamepadPollInterval = setInterval(pollGamepadInput, 50);
    }
  }

  function cancelRebinding() {
    playUISound('back');
    stopRebinding();
  }

  function stopRebinding() {
    _rebindingAction = null;
    document.removeEventListener('keydown', handleKeyDownCapture);
    if (_gamepadPollInterval) {
      clearInterval(_gamepadPollInterval);
      _gamepadPollInterval = null;
    }
    refreshBindingsList();
    hideConflictWarning();
  }

  let _gamepadPollInterval = null;

  function handleKeyDownCapture(e) {
    if (!_rebindingAction) return;
    e.preventDefault();
    e.stopPropagation();
    
    const newKey = e.code;
    
    // Check for conflicts
    const conflict = checkConflict(_rebindingAction, newKey);
    if (conflict) {
      showConflictWarning(`"${newKey}" is already bound to "${conflict}"`);
      return;
    }
    
    // Apply new binding
    applyBinding(_rebindingAction, newKey);
    playUISound('confirm');
    stopRebinding();
    showSavedToast();
  }

  function pollGamepadInput() {
    if (!_rebindingAction) return;
    
    const pads = navigator.getGamepads?.() || [];
    for (const pad of pads) {
      if (!pad) continue;
      
      // Check buttons
      for (let i = 0; i < pad.buttons.length; i++) {
        if (pad.buttons[i]?.pressed) {
          const newBinding = { type: 'button', index: i };
          
          // Check for conflicts
          const conflict = checkConflictGamepad(_rebindingAction, newBinding);
          if (conflict) {
            showConflictWarning(`Button ${i} is already bound to "${conflict}"`);
            return;
          }
          
          applyBinding(_rebindingAction, newBinding);
          playUISound('confirm');
          stopRebinding();
          showSavedToast();
          return;
        }
      }
      
      // Check axes
      for (let i = 0; i < pad.axes.length; i++) {
        if (Math.abs(pad.axes[i]) > 0.8) {
          const newBinding = { 
            type: 'axis', 
            index: i,
            threshold: pad.axes[i] > 0 ? 0.2 : -0.2,
            positive: pad.axes[i] > 0
          };
          
          applyBinding(_rebindingAction, newBinding);
          playUISound('confirm');
          stopRebinding();
          showSavedToast();
          return;
        }
      }
    }
  }

  // ==================== CONFLICT DETECTION ====================

  function checkConflict(actionId, keyCode) {
    for (const [action, binding] of Object.entries(_bindings)) {
      if (action === actionId) continue;
      if (Array.isArray(binding) && binding.includes(keyCode)) {
        return action.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
      }
    }
    return null;
  }

  function checkConflictGamepad(actionId, newBinding) {
    for (const [action, binding] of Object.entries(_bindings)) {
      if (action === actionId) continue;
      if (binding?.type === newBinding?.type && binding?.index === newBinding?.index) {
        return action.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
      }
    }
    return null;
  }

  function showConflictWarning(message) {
    const warning = root.querySelector('#conflict-warning');
    if (warning) {
      warning.querySelector('span').textContent = `⚠ ${message}`;
      warning.style.display = '';
    }
  }

  function hideConflictWarning() {
    const warning = root.querySelector('#conflict-warning');
    if (warning) warning.style.display = 'none';
  }

  // ==================== APPLY BINDING ====================

  function applyBinding(actionId, newValue) {
    _bindings[actionId] = newValue;
    
    // Save to SaveSystem
    engine.save.set(`settings.controls.bindings.${_activeControllerType}.${actionId}`, newValue);
    
    // Also update input config in memory
    try {
      const inputConfig = engine.state.get('input.config');
      if (inputConfig?.controllers?.[_activeControllerType]?.defaultBindings) {
        inputConfig.controllers[_activeControllerType].defaultBindings[actionId] = newValue;
      }
    } catch (e) { /* ignore */ }
  }

  // ==================== CONTROLLER TAB HANDLERS ====================

  root.querySelectorAll('[data-controller]').forEach(tab => {
    tab.addEventListener('click', () => {
      playUISound('navigate');
      
      // Cancel any active rebinding
      if (_rebindingAction) {
        stopRebinding();
      }
      
      _activeControllerType = tab.dataset.controller;
      
      // Update tab UI
      root.querySelectorAll('[data-controller]').forEach(t => t.classList.remove('tab-active'));
      tab.classList.add('tab-active');
      
      // Load bindings for this controller type
      _bindings = loadBindings(_activeControllerType);
      
      // Refresh bindings display
      refreshBindingsList();
      
      // Show/hide deadzone for non-gamepad controllers
      const deadzoneRow = root.querySelector('#deadzone-row');
      if (deadzoneRow) {
        deadzoneRow.style.display = _activeControllerType === 'gamepad' ? '' : 'none';
      }
    });
  });

  // ==================== SLIDER HANDLERS ====================

  root.querySelectorAll('.controls-slider').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const setting = e.target.dataset.setting;
      const value = parseFloat(e.target.value);
      const valueEl = root.querySelector(`#value-${setting}`);
      
      if (valueEl) {
        valueEl.textContent = setting === 'deadzone' ? value.toFixed(2) : value.toFixed(1);
      }
    });

    slider.addEventListener('change', (e) => {
      const setting = e.target.dataset.setting;
      const value = parseFloat(e.target.value);
      
      // Save to SaveSystem
      engine.save.set(`settings.controls.${setting}`, value);
      
      // Apply to input manager if available
      if (engine.input && setting === 'deadzone') {
        try {
          // Update deadzone in input config
          const inputConfig = engine.state.get('input.config');
          if (inputConfig?.controllers?.gamepad) {
            inputConfig.controllers.gamepad.deadzone = value;
          }
        } catch (e) { /* ignore */ }
      }
      
      showSavedToast();
      playUISound('confirm');
    });
  });

  // ==================== TOGGLE HANDLERS ====================

  const invertToggle = root.querySelector('#toggle-invertY');
  if (invertToggle) {
    invertToggle.addEventListener('change', () => {
      const label = invertToggle.closest('.controls-toggle')?.querySelector('.toggle-label');
      const badge = invertToggle.closest('.controls-toggle');
      
      if (label) label.textContent = invertToggle.checked ? 'ON' : 'OFF';
      badge?.classList.toggle('badge-success', invertToggle.checked);
      
      engine.save.set('settings.controls.invertYAxis', invertToggle.checked);
      showSavedToast();
      playUISound('confirm');
    });
  }

  // ==================== RESET BUTTON ====================

  root.querySelector('#btn-reset-controls').addEventListener('click', () => {
    playUISound('navigate');
    
    // Reset bindings to defaults for current controller type
    if (_activeControllerType === 'keyboard') {
      _bindings = { ...DEFAULT_KEYBOARD_BINDINGS };
    } else if (_activeControllerType === 'gamepad') {
      _bindings = { ...DEFAULT_GAMEPAD_BINDINGS };
    }
    
    // Save reset bindings
    engine.save.set(`settings.controls.bindings.${_activeControllerType}`, { ..._bindings });
    
    // Refresh display
    refreshBindingsList();
    showSavedToast('Bindings Reset');
    
    // Emit event
    engine.bus.emit('controls:bindingsReset', { controllerType: _activeControllerType });
  });

  // Navigation handlers
  root.querySelectorAll('.settings-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      // Cancel any active rebinding before navigating
      if (_rebindingAction) {
        stopRebinding();
      }
      playUISound('navigate');
      window.__uiRouter.replace(item.dataset.section);
    });
  });

  // Initial render of binding listeners
  attachBindingListeners();

  // Helper functions
  function showSavedToast(msg = 'Changes Saved') {
    const toast = root.querySelector('#controls-toast');
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

  // Cleanup
  root._cleanup = () => {
    stopRebinding();
  };
}

export async function unmount(root) {
  if (root._cleanup) root._cleanup();
}

export default { mount, unmount };
