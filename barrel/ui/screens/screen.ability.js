// barrel/ui/screens/screen.ability.js - In-Race Ability Activation UI
// Shows character ability with cooldown, activation feedback, and passive perks

import { el, button } from './_shared.js';

let _abilityData = null;
let _cooldownRemaining = 0;
let _isActive = false;
let _durationRemaining = 0;
let _container = null;
let _cooldownRing = null;
let _abilityIcon = null;
let _statusText = null;
let _passiveContainer = null;

export function mount(ctx) {
  _container = el('div', { class: 'ability-ui' }, [
    el('div', { class: 'ability-main', id: 'abilityMain' }, [
      _cooldownRing = el('svg', { class: 'ability-ring', viewBox: '0 0 64 64', width: 64, height: 64 }, [
        el('circle', { cx: 32, cy: 32, r: 28, fill: 'none', stroke: 'rgba(255,255,255,0.15)', 'stroke-width': 4 }),
        el('circle', {
          cx: 32, cy: 32, r: 28,
          fill: 'none',
          stroke: '#ffd23f',
          'stroke-width': 4,
          'stroke-dasharray': 176,
          'stroke-dashoffset': 176,
          class: 'ability-progress',
          transform: 'rotate(-90 32 32)',
          style: 'transition: stroke-dashoffset 0.1s linear'
        })
      ]),
      _abilityIcon = el('div', { class: 'ability-icon', innerHTML: '?' }),
      _statusText = el('span', { class: 'ability-status' }, 'READY')
    ]),
    _passiveContainer = el('div', { class: 'ability-passives', id: 'passivesContainer' })
  ]);

  // Event listeners
  ctx.engine.bus.on('ability:update', _onAbilityUpdate);
  ctx.engine.bus.on('ability:activated', _onActivated);
  ctx.engine.bus.on('ability:cooldown', _onCooldown);
  ctx.engine.bus.on('character:changed', _onCharacterChanged);

  return { root: _container };
}

export function unmount(ctx) {
  ctx.engine.bus.off('ability:update', _onAbilityUpdate);
  ctx.engine.bus.off('ability:activated', _onActivated);
  ctx.engine.bus.off('ability:cooldown', _onCooldown);
  ctx.engine.bus.off('character:changed', _onCharacterChanged);
  _container = null;
}

export function update(ctx, dt) {
  if (!_container) return;

  if (_cooldownRemaining > 0) {
    _cooldownRemaining = Math.max(0, _cooldownRemaining - dt / 1000);
    _updateCooldownDisplay();
  }

  if (_isActive && _durationRemaining > 0) {
    _durationRemaining = Math.max(0, _durationRemaining - dt / 1000);
    if (_durationRemaining <= 0) {
      _isActive = false;
      _container?.classList.remove('active');
    }
  }
}

function _onAbilityUpdate(data) {
  if (!data) return;
  _abilityData = data;
  _cooldownRemaining = data.cooldownRemaining || 0;
  _updateIcon();
  _updatePassives(data.passivePerks);
}

function _onActivated(data) {
  _isActive = true;
  _durationRemaining = data.duration || 3;
  _container?.classList.add('active');
  
  // Flash effect
  _container?.classList.add('flash');
  setTimeout(() => _container?.classList.remove('flash'), 200);

  // Play sound
  playUISound('abilityActivate');
}

function _onCooldown(data) {
  _cooldownRemaining = data.cooldown || 5;
  _isActive = false;
  _container?.classList.remove('active');
}

function _onCharacterChanged(data) {
  if (data?.ability) {
    _abilityData = data.ability;
    _updateIcon();
    _updatePassives(data.passivePerks);
  }
}

function _updateIcon() {
  if (!_abilityIcon || !_abilityData) return;
  _abilityIcon.innerHTML = _abilityData.icon || '?';
  _abilityIcon.style.setProperty('--ability-color', _abilityData.color || '#ffd23f');
  _updateCooldownDisplay();
}

function _updateCooldownDisplay() {
  if (!_cooldownRing || !_statusText) return;

  const progress = _cooldownRing.querySelector('.ability-progress');
  const totalCooldown = _abilityData?.cooldownMs ? _abilityData.cooldownMs / 1000 : 5;
  const pct = Math.min(1, _cooldownRemaining / totalCooldown);
  const offset = 176 * (1 - pct); // circumference * (1 - progress)

  if (progress) progress.style.strokeDashoffset = offset;

  if (_cooldownRemaining > 0) {
    _statusText.textContent = Math.ceil(_cooldownRemaining).toString();
    _container?.classList.add('on-cooldown');
    _container?.classList.remove('ready');
  } else {
    _statusText.textContent = 'READY';
    _container?.classList.remove('on-cooldown');
    _container?.classList.add('ready');
  }
}

function _updatePassives(passives) {
  if (!_passiveContainer || !passives) return;
  _passiveContainer.innerHTML = '';

  Object.entries(passives).forEach(([key, value]) => {
    const perkEl = el('span', { 
      class: 'passive-perk',
      title: key.replace(/([A-Z])/g, ' $1').trim()
    }, [
      el('span', { class: 'perk-icon' }, _getPerkIcon(key)),
      el('span', { class: 'perk-value' }, value.toString())
    ]);
    _passiveContainer.appendChild(perkEl);
  });
}

function _getPerkIcon(perkKey) {
  const icons = {
    speedBoost: '⚡', driftBonus: '🌀', massBonus: '💪',
    gripBonus: '🛞', startBonus: '🚀', luckBonus: '🍀'
  };
  return icons[perkKey] || '✦';
}

// Inject styles
const style = document.createElement('style');
style.textContent = `
.ability-ui {
  position: fixed;
  bottom: 120px;
  right: 20px;
  z-index: 1000;
  font-family: var(--font-primary, 'Inter', sans-serif);
  user-select: none;
  pointer-events: auto;
}
.ability-main {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.ability-ring {
  filter: drop-shadow(0 0 8px rgba(255,210,63,0.4));
  transition: filter 0.2s;
}
.ability-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: rgba(0,0,0,0.7);
  color: var(--ability-color, #ffd23f);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: bold;
  border: 2px solid var(--ability-color, #ffd23f);
}
.ability-status {
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0,0,0,0.8);
  letter-spacing: 0.5px;
}
.ability-passives {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  justify-content: center;
}
.passive-perk {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  background: rgba(0,0,0,0.6);
  border-radius: 10px;
  font-size: 11px;
  color: #ccc;
}
.perk-icon { font-size: 12px; }
.perk-value { font-weight: 600; color: #ffd23f; }
/* States */
.ability-ui.ready .ability-ring { animation: pulse-ready 1.5s ease-in-out infinite; }
.ability-ui.on-cooldown .ability-ring { opacity: 0.7; }
.ability-ui.active .ability-icon { animation: ability-active-glow 0.5s ease-out; box-shadow: 0 0 20px var(--ability-color, #ffd23f); }
.ability-ui.flash { animation: flash-white 0.2s ease-out; }
@keyframes pulse-ready {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}
@keyframes ability-active-glow {
  0% { transform: translate(-50%, -50%) scale(1); }
  50% { transform: translate(-50%, -50%) scale(1.15); }
  100% { transform: translate(-50%, -50%) scale(1); }
}
@keyframes flash-white {
  0% { background: #fff; }
  100% { background: rgba(0,0,0,0.7); }
}
/* Mobile adjustments */
@media (max-width: 768px) {
  .ability-ui { bottom: 180px; right: 10px; }
  .ability-ring { width: 56px; height: 56px; }
  .ability-icon { width: 34px; height: 34px; font-size: 16px; }
}
`;
document.head.appendChild(style);

export default { mount, unmount, update };
