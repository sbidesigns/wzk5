// core/Renderer.js
// IMMUTABLE CORE — wraps three.js. Quality presets, post-FX, camera rig.
// Public interface is the contract: init/render/setQuality/addObject/removeObject.
// To swap to WebGPU later, replace ONLY this file.

import * as THREE from 'three';

export class Renderer {
  constructor() {
    this._renderer = null;
    this._scene = null;
    this._camera = null;
    this._composer = null;
    this._bloomPass = null;
    this._quality = 'high';
    this._config = null;
    this._renderPasses = [];
    this._clock = new THREE.Clock();
    this._updateCallbacks = new Set();
  }

  async init(config) {
    this._config = config;
    const canvas = document.createElement('canvas');
    canvas.id = 'game-canvas';
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'none'; // hidden until a 3D scene is active
    document.body.appendChild(canvas);
    this._canvas = canvas;

    this._renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // we manage via quality preset
      powerPreference: 'high-performance',
      stencil: false,
      depth: true
    });

    this._scene = new THREE.Scene();
    const preset = config.qualityPresets[config.defaultPreset];
    this._quality = config.defaultPreset;
    this._applyPreset(preset);

    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = config.toneMappingExposure || 1.0;
    this._renderer.outputColorSpace = THREE.SRGBColorSpace;

    if (config.fog?.enabled) {
      this._scene.fog = new THREE.Fog(
        new THREE.Color(config.fog.color),
        config.fog.near,
        config.fog.far
      );
    }
    this._scene.background = new THREE.Color(config.clearColor || '#05060a');

    this._camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1000);
    this._camera.position.set(0, 5, 10);

    window.addEventListener('resize', () => this._onResize());

    return this;
  }

  _applyPreset(preset) {
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio * preset.pixelRatio, 2));
    this._renderer.setSize(window.innerWidth, window.innerHeight);
    this._renderer.shadowMap.enabled = !!preset.shadowMapEnabled;
    if (preset.shadowMapEnabled) {
      this._renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this._shadowMapSize = preset.shadowMapSize || 1024;
    }
    this._bloomEnabled = !!preset.bloom;
    this._bloomStrength = preset.bloomStrength || 0.7;
  }

  setQuality(presetName) {
    const preset = this._config.qualityPresets[presetName];
    if (!preset) throw new Error(`Unknown quality preset: ${presetName}`);
    this._quality = presetName;
    this._applyPreset(preset);
    this._setupPostFx();
  }

  _setupPostFx() {
    // Lazy-loaded three.js postprocessing modules
    if (this._bloomEnabled && !this._composer) {
      // We'll dynamically import the postprocessing modules to keep core clean
      // (the calling code in main.js will trigger this)
    }
  }

  async setupPostFx() {
    if (!this._bloomEnabled) return;
    // Use bare specifiers via the importmap ('three/addons/...' -> CDN URL).
    // This way the addons' internal `import * as THREE from 'three'` also resolves correctly.
    // Each module's named export is the class itself, so we destructure directly.
    const [
      { EffectComposer },
      { RenderPass },
      { UnrealBloomPass },
      { OutputPass }
    ] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js')
    ]);
    this._composer = new EffectComposer(this._renderer);
    const renderPass = new RenderPass(this._scene, this._camera);
    this._composer.addPass(renderPass);
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      this._bloomStrength, 0.4, 0.85
    );
    this._composer.addPass(bloom);
    const outputPass = new OutputPass();
    this._composer.addPass(outputPass);
  }

  show() { this._canvas.style.display = 'block'; }
  hide() { this._canvas.style.display = 'none'; }

  addObject(obj) { this._scene.add(obj); return obj; }
  removeObject(obj) { this._scene.remove(obj); }

  getScene() { return this._scene; }
  getCamera() { return this._camera; }
  getRenderer() { return this._renderer; }
  getCanvas() { return this._canvas; }
  getQuality() { return this._quality; }

  registerUpdate(fn) { this._updateCallbacks.add(fn); return () => this._updateCallbacks.delete(fn); }

  render() {
    const dt = Math.min(this._clock.getDelta(), 0.1);
    for (const fn of this._updateCallbacks) {
      try { fn(dt); } catch (e) { console.error('[Renderer] update cb threw', e); }
    }
    if (this._composer) this._composer.render();
    else this._renderer.render(this._scene, this._camera);
    return dt;
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(w, h);
    if (this._composer) this._composer.setSize(w, h);
  }
}

export const renderer = new Renderer();
