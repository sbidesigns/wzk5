// barrel/ui/screens/screen.settings.gameplay.js — Gameplay preferences
// Features: Difficulty selector (Easy/Normal/Hard/Brutal), HUD size slider,
// Minimap mode (Rotate/Fixed/Off), Racers count slider (1-12),
// Items toggle (On/Off/Friendly Only), Subtitles toggle,
// Camera follow distance slider, Screen shake amount slider,
// Language selector (dropdown of available locales), save to SaveSystem

import { el, topNav, screenHeader, playUISound } from './_shared.js';

// Difficulty options
const DIFFICULTY_OPTIONS = [
  { id: 'easy', name: 'Easy', desc: 'Slower AI, more assists available' },
  { id: 'normal', name: 'Normal', desc: 'Balanced experience for most players' },
  { id: 'hard', name: 'Hard', desc: 'Aggressive AI, fewer assists' },
  { id: 'brutal', name: 'Brutal', desc: 'Maximum challenge, no assists' }
];

// HUD size options
const HUD_SIZES = [
  { id: 'small', name: 'Small', value: 0.8 },
  { id: 'medium', name: 'Medium', value: 1.0 },
  { id: 'large', name: 'Large', value: 1.2 },
  { id: 'xl', name: 'XL', value: 1.5 }
];

// Minimap modes
const MINIMAP_MODES = [
  { id: 'rotate', name: 'Rotating', desc: 'Minimap rotates with vehicle direction' },
  { id: 'fixed', name: 'Fixed', desc: 'North is always up' },
  { id: 'off', name: 'Off', desc: 'Minimap hidden' }
];

// Items mode options
const ITEMS_MODES = [
  { id: 'on', name: 'On', desc: 'All items enabled for all players' },
  { id: 'off', name: 'Off', desc: 'No item boxes spawn' },
  { id: 'friendly', name: 'Friendly Only', desc: 'Only beneficial items appear' }
];

// Available languages (from locales)
const AVAILABLE_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'zh-cn', name: '简体中文' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'pt-br', name: 'Português (BR)' },
  { code: 'ru', name: 'Русский' }
];

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

  // Current values
  const difficulty = loadSetting('settings.gameplay.difficulty', 'normal');
  const hudSize = loadSetting('settings.gameplay.hudSize', 'medium');
  const minimapMode = loadSetting('settings.gameplay.minimapRotate') ? 'rotate' : 
                       loadSetting('settings.gameplay.minimapFixed') ? 'fixed' : 
                       loadSetting('settings.gameplay.minimapOff') ? 'off' : 'rotate';
  const racersCount = loadSetting('settings.gameplay.racersCount', 8);
  const itemsMode = loadSetting('settings.gameplay.itemsMode', 'on');
  const subtitlesEnabled = loadSetting('settings.gameplay.subtitles', true);
  const cameraDistance = loadSetting('settings.gameplay.cameraDistance', 8);
  const screenShake = loadSetting('settings.gameplay.cameraShake', 60);
  const language = loadSetting('settings.gameplay.language', 'en');

  root.appendChild(topNav());
  const screen = el('div', 'screen');
  screen.appendChild(screenHeader('GAMEPLAY', 'Difficulty, assists, camera behavior'));
  const body = el('div', 'screen-body');

  body.innerHTML = `
    <div class="settings-layout">
      <div class="settings-nav">
        ${['audio','video','controls','gameplay','accessibility'].map(s => `
          <div class="settings-nav-item ${s === 'gameplay' ? 'active' : ''}" data-section="settings.${s}">
            <div style="width:32px; height:32px; border-radius:50%; background:var(--surface-glass); display:flex; align-items:center; justify-content:center; font-size:16px;">
              ${s === 'audio' ? '🔊' : s === 'video' ? '🖥' : s === 'controls' ? '🎮' : s === 'gameplay' ? '⚡' : '♿'}
            </div>
            <div>${s.charAt(0).toUpperCase() + s.slice(1)}</div>
          </div>
        `).join('')}
      </div>
      
      <div class="settings-panel">
        <!-- Difficulty -->
        <div class="card">
          <div class="hud-label">DIFFICULTY</div>
          <div style="display:flex; flex-direction:column; gap:var(--space-s); margin-top:var(--space-l);">
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">AI Difficulty</div>
                <div class="settings-row-desc">How aggressive AI racers are</div>
              </div>
              <div class="settings-row-control">
                <select class="input gameplay-select" id="difficulty-select" style="min-width:160px;">
                  ${DIFFICULTY_OPTIONS.map(d => `
                    <option value="${d.id}" ${d.id === difficulty ? 'selected' : ''}>${d.name}</option>
                  `).join('')}
                </select>
              </div>
            </div>
            <div id="difficulty-desc" style="color:var(--text-secondary); font-size:var(--text-body-s); padding-left:var(--space-m);">
              ${DIFFICULTY_OPTIONS.find(d => d.id === difficulty)?.desc || ''}
            </div>
          </div>
        </div>

        <!-- HUD & Display -->
        <div class="card">
          <div class="hud-label">HUD & DISPLAY</div>
          <div style="display:flex; flex-direction:column; gap:var(--space-s); margin-top:var(--space-l);">
            
            <!-- HUD Size -->
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">HUD Size</div>
                <div class="settings-row-desc">Scale of in-race UI elements</div>
              </div>
              <div class="settings-row-control">
                <div class="segmented-control" id="hud-size-control">
                  ${HUD_SIZES.map(size => `
                    <button class="segment-btn ${size.id === hudSize ? 'active' : ''}" data-value="${size.id}">${size.name}</button>
                  `).join('')}
                </div>
              </div>
            </div>

            <!-- Minimap Mode -->
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Minimap Mode</div>
                <div class="settings-row-desc">How the minimap behaves</div>
              </div>
              <div class="settings-row-control">
                <select class="input gameplay-select" id="minimap-select" style="min-width:160px;">
                  ${MINIMAP_MODES.map(m => `
                    <option value="${m.id}" ${m.id === minimapMode ? 'selected' : ''}>${m.name}</option>
                  `).join('')}
                </select>
              </div>
            </div>

            <!-- Racers Count -->
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Racers Count</div>
                <div class="settings-row-desc">Number of AI opponents in race</div>
              </div>
              <div class="settings-row-control">
                <div style="display:flex; align-items:center; gap:var(--space-s); width:100%;">
                  <input type="range" class="slider gameplay-slider" min="1" max="12" step="1" 
                         value="${racersCount}" data-setting="racersCount"
                         style="flex:1;">
                  <span class="gameplay-value" id="value-racersCount">${racersCount}</span>
                </div>
              </div>
            </div>

            <!-- Items Mode -->
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Items</div>
                <div class="settings-row-desc">Item box spawning rules</div>
              </div>
              <div class="settings-row-control">
                <select class="input gameplay-select" id="items-select" style="min-width:160px;">
                  ${ITEMS_MODES.map(m => `
                    <option value="${m.id}" ${m.id === itemsMode ? 'selected' : ''}>${m.name}</option>
                  `).join('')}
                </select>
              </div>
            </div>

            <!-- Subtitles -->
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Subtitles</div>
                <div class="settings-row-desc">Show dialogue and announcement text</div>
              </div>
              <div class="settings-row-control">
                <label class="badge gameplay-toggle ${subtitlesEnabled ? 'badge-success' : ''}" data-setting="subtitles">
                  <input type="checkbox" id="toggle-subtitles" ${subtitlesEnabled ? 'checked' : ''}> 
                  <span class="toggle-label">${subtitlesEnabled ? 'ON' : 'OFF'}</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Camera Settings -->
        <div class="card">
          <div class="hud-label">CAMERA</div>
          <div style="display:flex; flex-direction:column; gap:var(--space-s); margin-top:var(--space-l);">
            
            <!-- Camera Follow Distance -->
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Follow Distance</div>
                <div class="settings-row-desc">How far behind the camera follows</div>
              </div>
              <div class="settings-row-control">
                <div style="display:flex; align-items:center; gap:var(--space-s); width:100%;">
                  <input type="range" class="slider gameplay-slider" min="4" max="20" step="0.5" 
                         value="${cameraDistance}" data-setting="cameraDistance"
                         style="flex:1;">
                  <span class="gameplay-value" id="value-cameraDistance">${cameraDistance}m</span>
                </div>
              </div>
            </div>

            <!-- Screen Shake -->
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Screen Shake</div>
                <div class="settings-row-desc">Impact and speed vibration intensity</div>
              </div>
              <div class="settings-row-control">
                <div style="display:flex; align-items:center; gap:var(--space-s); width:100%;">
                  <input type="range" class="slider gameplay-slider" min="0" max="100" step="5" 
                         value="${screenShake}" data-setting="screenShake"
                         style="flex:1;">
                  <span class="gameplay-value" id="value-screenShake">${screenShake}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Language -->
        <div class="card">
          <div class="hud-label">LANGUAGE</div>
          <div style="display:flex; flex-direction:column; gap:var(--space-s); margin-top:var(--space-l);">
            <div class="settings-row">
              <div class="settings-row-label">
                <div class="settings-row-title">Game Language</div>
                <div class="settings-row-desc">Text and voice language</div>
              </div>
              <div class="settings-row-control">
                <select class="input gameplay-select" id="language-select" style="min-width:180px;">
                  ${AVAILABLE_LANGUAGES.map(l => `
                    <option value="${l.code}" ${l.code === language ? 'selected' : ''}>${l.name}</option>
                  `).join('')}
                </select>
              </div>
            </div>
            <p style="color:var(--text-tertiary); font-size:var(--text-caption);">
              Some languages may require a restart to fully apply.
            </p>
          </div>
        </div>

        <!-- Save Toast -->
        <div class="settings-toast" id="gameplay-toast" style="display:none;">
          <span class="toast-icon">✓</span>
          <span>Changes Saved</span>
        </div>
      </div>
    </div>
  `;
  screen.appendChild(body);
  root.appendChild(screen);

  // ==================== DIFFICULTY HANDLER ====================

  const difficultySelect = root.querySelector('#difficulty-select');
  const difficultyDesc = root.querySelector('#difficulty-desc');

  difficultySelect.addEventListener('change', () => {
    const value = difficultySelect.value;
    
    // Update description
    const option = DIFFICULTY_OPTIONS.find(d => d.id === value);
    if (option && difficultyDesc) {
      difficultyDesc.textContent = option.desc;
    }
    
    // Save
    engine.save.set('settings.gameplay.difficulty', value);
    
    // Emit event for AI system
    engine.bus.emit('gameplay:difficultyChanged', { difficulty: value });
    
    showSavedToast();
    playUISound('confirm');
  });

  // ==================== HUD SIZE HANDLER ====================

  root.querySelectorAll('#hud-size-control .segment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.value;
      
      // Update active state
      root.querySelectorAll('#hud-size-control .segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Save
      engine.save.set('settings.gameplay.hudSize', value);
      
      // Apply HUD scale
      const sizeConfig = HUD_SIZES.find(s => s.id === value);
      if (sizeConfig) {
        engine.bus.emit('gameplay:hudSizeChanged', { scale: sizeConfig.value });
      }
      
      showSavedToast();
      playUISound('confirm');
    });
  });

  // ==================== SELECT DROPDOWN HANDLERS ====================

  // Minimap mode
  const minimapSelect = root.querySelector('#minimap-select');
  minimapSelect.addEventListener('change', () => {
    const value = minimapSelect.value;
    
    // Save as boolean flags
    engine.save.set('settings.gameplay.minimapRotate', value === 'rotate');
    engine.save.set('settings.gameplay.minimapFixed', value === 'fixed');
    engine.save.set('settings.gameplay.minimapOff', value === 'off');
    
    engine.bus.emit('gameplay:minimapModeChanged', { mode: value });
    
    showSavedToast();
    playUISound('confirm');
  });

  // Items mode
  const itemsSelect = root.querySelector('#items-select');
  itemsSelect.addEventListener('change', () => {
    const value = itemsSelect.value;
    
    engine.save.set('settings.gameplay.itemsMode', value);
    engine.bus.emit('gameplay:itemsModeChanged', { mode: value });
    
    showSavedToast();
    playUISound('confirm');
  });

  // Language
  const languageSelect = root.querySelector('#language-select');
  languageSelect.addEventListener('change', () => {
    const value = languageSelect.value;
    
    engine.save.set('settings.gameplay.language', value);
    engine.bus.emit('gameplay:languageChanged', { language: value });
    
    showSavedToast();
    playUISound('confirm');
  });

  // ==================== SLIDER HANDLERS ====================

  root.querySelectorAll('.gameplay-slider').forEach(slider => {
    slider.addEventListener('input', (e) => {
      const setting = e.target.dataset.setting;
      const value = parseFloat(e.target.value);
      const valueEl = root.querySelector(`#value-${setting}`);
      
      if (valueEl) {
        if (setting === 'cameraDistance') {
          valueEl.textContent = `${value}m`;
        } else if (setting === 'screenShake') {
          valueEl.textContent = `${Math.round(value)}%`;
        } else {
          valueEl.textContent = Math.round(value);
        }
      }
    });

    slider.addEventListener('change', (e) => {
      const setting = e.target.dataset.setting;
      const value = parseFloat(e.target.value);
      
      // Save to SaveSystem
      engine.save.set(`settings.gameplay.${setting}`, value);
      
      // Emit appropriate event
      if (setting === 'racersCount') {
        engine.bus.emit('gameplay:racersCountChanged', { count: Math.round(value) });
      } else if (setting === 'cameraDistance') {
        engine.bus.emit('gameplay:cameraDistanceChanged', { distance: value });
      } else if (setting === 'screenShake') {
        engine.bus.emit('gameplay:screenShakeChanged', { amount: value / 100 });
      }
      
      showSavedToast();
      playUISound('confirm');
    });
  });

  // ==================== TOGGLE HANDLERS ====================

  const subtitlesToggle = root.querySelector('#toggle-subtitles');
  if (subtitlesToggle) {
    subtitlesToggle.addEventListener('change', () => {
      const label = subtitlesToggle.closest('.gameplay-toggle')?.querySelector('.toggle-label');
      const badge = subtitlesToggle.closest('.gameplay-toggle');
      
      if (label) label.textContent = subtitlesToggle.checked ? 'ON' : 'OFF';
      badge?.classList.toggle('badge-success', subtitlesToggle.checked);
      
      engine.save.set('settings.gameplay.subtitles', subtitlesToggle.checked);
      engine.bus.emit('gameplay:subtitlesToggled', { enabled: subtitlesToggle.checked });
      
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

  // Helper function
  function showSavedToast(msg = 'Changes Saved') {
    const toast = root.querySelector('#gameplay-toast');
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
}

export async function unmount(root) {}

export default { mount, unmount };
