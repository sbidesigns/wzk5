// barrel/ui/screens/screen.mode-select.js
import { el, topNav, screenHeader, playUISound } from './_shared.js';

export async function mount(root, payload, ctx) {
  const engine = window.__engine;
  const modes = engine.resolver.list('modes');
  root.appendChild(topNav());
  const screen = el('div', 'screen');
  screen.appendChild(screenHeader('SELECT MODE', `${modes.length} modes available · Choose your race type`));
  const body = el('div', 'screen-body');
  const grid = el('div', 'select-grid');

  modes.forEach((mode, idx) => {
    const tile = el('div', 'select-tile stagger');
    tile.style.animationDelay = `${0.05 * idx}s`;
    tile.innerHTML = `
      <div class="select-tile-visual">
        <div style="font-family:var(--font-display); font-size:120px; color:rgba(255,255,255,0.06); letter-spacing:var(--tracking-tight);">${(idx + 1).toString().padStart(2, '0')}</div>
        <div style="position:absolute; bottom:var(--space-m); left:var(--space-m); display:flex; gap:var(--space-s);">
          ${mode.matchConfig?.allowItems ? '<span class="badge badge-secondary">ITEMS</span>' : '<span class="badge">NO ITEMS</span>'}
          ${mode.matchConfig?.allowCombat ? '<span class="badge badge-danger">COMBAT</span>' : ''}
          <span class="badge">${(mode.matchConfig?.laps ?? 0) === 0 ? 'TIMED' : (mode.matchConfig.laps + ' LAPS')}</span>
        </div>
      </div>
      <div class="select-tile-info">
        <div class="select-tile-name">${mode.displayName}</div>
        <div class="select-tile-class">${(mode.category || 'race').toUpperCase()} · ${mode.matchConfig?.maxPlayers || mode.playersMax || 8}P</div>
      </div>
    `;
    tile.addEventListener('click', () => {
      playUISound('confirm');
      document.querySelectorAll('.select-tile').forEach(t => t.classList.remove('selected'));
      tile.classList.add('selected');
      engine.state.set('race.payload', { ...(engine.state.get('race.payload') || {}), mode: mode.id });
      setTimeout(() => window.__uiRouter.push('track-select'), 350);
    });
    grid.appendChild(tile);
  });

  body.appendChild(grid);
  screen.appendChild(body);
  root.appendChild(screen);
}

export async function unmount(root) {}
export default { mount, unmount };
