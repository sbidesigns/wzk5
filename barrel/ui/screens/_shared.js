// barrel/ui/screens/_shared.js
// Shared helpers for screens. NOT a screen itself — imported by other screen files.

export function el(tag, className = '', innerHTML = '') {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (innerHTML) e.innerHTML = innerHTML;
  return e;
}

export function button(label, variant = '', onClick = null) {
  const b = el('button', `btn ${variant}`);
  b.textContent = label;
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

export function statBar(label, value, max = 10) {
  const wrap = el('div', 'stat-bar');
  wrap.innerHTML = `
    <div class="stat-bar-label"><span>${label}</span><span>${value}/${max}</span></div>
    <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${(value / max) * 100}%"></div></div>
  `;
  return wrap;
}

export function topNav() {
  const nav = el('div', 'top-nav');
  nav.innerHTML = `
    <div class="top-nav-left">
      <button class="btn btn-ghost btn-sm" data-action="back">‹ Back</button>
    </div>
    <div class="top-nav-right">
      <div class="currency-chip"><div class="currency-chip-icon"></div><span id="currency-credits">25,000</span></div>
      <div class="currency-chip currency-chip-gold"><div class="currency-chip-icon"></div><span id="currency-gold">500</span></div>
      <div class="player-chip">
        <div class="player-chip-avatar">A</div>
        <div class="player-chip-info">
          <div class="player-chip-name">Ace</div>
          <div class="player-chip-level">LVL 7</div>
        </div>
      </div>
    </div>
  `;
  nav.querySelector('[data-action="back"]').addEventListener('click', () => {
    window.__uiRouter.pop();
  });
  return nav;
}

export function screenHeader(title, subtitle = '') {
  const h = el('div', 'screen-header');
  h.innerHTML = `
    <div>
      <h1 class="screen-title">${title}</h1>
      ${subtitle ? `<div class="screen-subtitle">${subtitle}</div>` : ''}
    </div>
  `;
  return h;
}

export function playUISound(name) {
  const engine = window.__engine;
  if (engine?.audio) engine.audio.ui(name);
}
