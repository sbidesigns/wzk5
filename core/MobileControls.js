// core/MobileControls.js
// Touch controls for mobile: on-screen buttons for throttle/brake/steer/drift/item.
// Gyro steering option (tilt phone left/right to steer).
// Customizable layout (drag to reposition).

class MobileControls {
  constructor() {
    this._active = false;
    this._container = null;
    this._buttons = new Map();
    this._gyroEnabled = false;
    this._save = null;
  }

  init(saveSystem) {
    this._save = saveSystem;
    // Detect touch device
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouch) {
      this._createControls();
      this._active = true;
    }
  }

  _createControls() {
    this._container = document.createElement('div');
    this._container.id = 'mobile-controls';
    this._container.style.cssText = `
      position: fixed; inset: 0; pointer-events: none; z-index: 200;
      display: none;
    `;
    document.body.appendChild(this._container);

    // Left side: steering
    const leftBtn = document.createElement('div');
    leftBtn.className = 'mc-steer-left';
    leftBtn.innerHTML = '◀';
    leftBtn.style.cssText = this._btnStyle('left: 20px; bottom: 80px;');
    this._container.appendChild(leftBtn);

    const rightBtn = document.createElement('div');
    rightBtn.className = 'mc-steer-right';
    rightBtn.innerHTML = '▶';
    rightBtn.style.cssText = this._btnStyle('left: 110px; bottom: 80px;');
    this._container.appendChild(rightBtn);

    // Right side: throttle/brake/drift/item
    const throttleBtn = document.createElement('div');
    throttleBtn.className = 'mc-throttle';
    throttleBtn.innerHTML = '▲';
    throttleBtn.style.cssText = this._btnStyle('right: 110px; bottom: 80px; background: rgba(0,229,255,0.4);');
    this._container.appendChild(throttleBtn);

    const brakeBtn = document.createElement('div');
    brakeBtn.className = 'mc-brake';
    brakeBtn.innerHTML = '▼';
    brakeBtn.style.cssText = this._btnStyle('right: 20px; bottom: 80px; background: rgba(255,61,90,0.4);');
    this._container.appendChild(brakeBtn);

    const driftBtn = document.createElement('div');
    driftBtn.className = 'mc-drift';
    driftBtn.innerHTML = 'DRIFT';
    driftBtn.style.cssText = this._btnStyle('right: 65px; bottom: 160px; width: 70px; height: 70px; font-size: 12px; background: rgba(255,210,63,0.4);');
    this._container.appendChild(driftBtn);

    const itemBtn = document.createElement('div');
    itemBtn.className = 'mc-item';
    itemBtn.innerHTML = 'ITEM';
    itemBtn.style.cssText = this._btnStyle('right: 65px; bottom: 240px; width: 70px; height: 70px; font-size: 12px; background: rgba(155,45,255,0.4);');
    this._container.appendChild(itemBtn);

    // Wire touch events
    this._buttons.set('steerLeft', leftBtn);
    this._buttons.set('steerRight', rightBtn);
    this._buttons.set('throttle', throttleBtn);
    this._buttons.set('brake', brakeBtn);
    this._buttons.set('drift', driftBtn);
    this._buttons.set('useItem', itemBtn);

    for (const [action, btn] of this._buttons) {
      btn.style.pointerEvents = 'auto';
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        window.__engine?.input?.setAction(action, 1);
      });
      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        window.__engine?.input?.setAction(action, 0);
      });
    }
  }

  _btnStyle(extra = '') {
    return `
      position: absolute; width: 80px; height: 80px;
      border-radius: 50%; background: rgba(255,255,255,0.15);
      border: 2px solid rgba(255,255,255,0.3);
      color: white; font-size: 32px; font-weight: bold;
      display: flex; align-items: center; justify-content: center;
      user-select: none; -webkit-user-select: none;
      backdrop-filter: blur(8px);
      ${extra}
    `;
  }

  show() {
    if (this._container) this._container.style.display = 'block';
  }

  hide() {
    if (this._container) this._container.style.display = 'none';
  }

  isActive() { return this._active; }

  enableGyro() {
    if (typeof DeviceOrientationEvent === 'undefined') return;
    this._gyroEnabled = true;
    window.addEventListener('deviceorientation', (e) => {
      if (!this._gyroEnabled) return;
      // Gamma: left-right tilt (-90 to 90)
      const gamma = e.gamma || 0;
      const steerValue = Math.max(-1, Math.min(1, gamma / 45));
      const input = window.__engine?.input;
      if (input) {
        input.setAxis('steerRight', steerValue > 0 ? steerValue : 0);
        input.setAxis('steerLeft', steerValue < 0 ? -steerValue : 0);
      }
    });
  }

  disableGyro() {
    this._gyroEnabled = false;
  }
}

export const mobileControls = new MobileControls();
export default mobileControls;
