// main.js — bootstrap. The ONLY entry point besides index.html.
// Responsibilities (in strict order):
//   1. Verify vendor globals (howler, gsap, localforage — UMD)
//   2. Load all config files
//   3. Load all schema files
//   4. Boot the engine (Engine.js imports Renderer.js which imports 'three' via importmap)
//   5. Register asset loaders (texture, gltf, audio)
//   6. Load all barrel manifests
//   7. Init UI shell + router
//   8. Navigate to splash screen
//   9. Start main loop
//
// NOTE: three.js and cannon-es are loaded as ES modules via the importmap in index.html.
// Core files (Renderer.js, PhysicsWorld.js) import them with bare specifiers ('three', 'cannon-es').
// Barrel files (vehicle.base.js, track.downtown.js, etc.) also import 'three' directly.

import { engine } from './core/Engine.js';
import { uiShell } from './ui/ui-shell.js';
import { uiRouter } from './ui/ui-router.js';
import * as THREE from 'three';

// Expose globally so barrel modules (which don't import the engine) can access it
window.__engine = engine;
window.__uiRouter = uiRouter;
window.__uiShell = uiShell;
// Some legacy/inline code may reference window.THREE — keep it available for diagnostics
window.THREE = THREE;

const VENDOR_VERSIONS = {
  three: '0.160.0',
  'cannon-es': '0.20.0',
  howler: '2.2.4',
  gsap: '3.12.5',
  localforage: '1.10.0'
};

async function main() {
  try {
    // 1. Verify UMD globals (howler, gsap, localforage)
    const bootProgress = document.getElementById('boot-progress');
    if (bootProgress) bootProgress.style.width = '15%';
    if (!window.Howler) throw new Error('howler not loaded — check CDN script tag in index.html');
    if (!window.gsap) throw new Error('gsap not loaded — check CDN script tag in index.html');
    if (!window.localforage) throw new Error('localforage not loaded — check CDN script tag in index.html');
    // three.js and cannon-es are verified implicitly when Engine.js / PhysicsWorld.js import them.

    // 2. Load configs
    const [engineConfig, gameConfig, uiConfig, inputConfig] = await Promise.all([
      fetch('./config/engine.config.json').then(r => r.json()),
      fetch('./config/game.config.json').then(r => r.json()),
      fetch('./config/ui.config.json').then(r => r.json()),
      fetch('./config/input.config.json').then(r => r.json())
    ]);
    if (bootProgress) bootProgress.style.width = '45%';

    // 3. Load schemas (file names are singular; categories are plural — map them)
    const schemaFiles = [
      { file: 'vehicle',    category: 'vehicles' },
      { file: 'character',  category: 'characters' },
      { file: 'controller', category: 'controllers' },
      { file: 'mode',       category: 'modes' },
      { file: 'track',      category: 'tracks' },
      { file: 'item',       category: 'items' },
      { file: 'scene',      category: 'scenes' },
      { file: 'screen',     category: 'screens' }
    ];
    const schemas = {};
    await Promise.all(schemaFiles.map(async ({ file, category }) => {
      const r = await fetch(`./config/schemas/${file}.schema.json`);
      if (r.ok) schemas[category] = await r.json();
    }));
    if (bootProgress) bootProgress.style.width = '60%';

    // 4. Boot engine
    await engine.boot({
      engineConfig, gameConfig, uiConfig, inputConfig,
      schemas,
      vendorVersions: VENDOR_VERSIONS
    });

    // 5. Register asset loaders (texture via three.js TextureLoader, gltf via GLTFLoader, audio via howler)
    engine.assets.registerLoader('texture', async (url) => {
      return new Promise((resolve, reject) => {
        new THREE.TextureLoader().load(url, resolve, undefined, reject);
      });
    });
    engine.assets.registerLoader('gltf', async (url) => {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      return new Promise((resolve, reject) => {
        new GLTFLoader().load(url, resolve, undefined, reject);
      });
    });
    engine.assets.registerLoader('audio', async (url) => {
      // Audio registration handled via engine.audio.registerSound
      return url;
    });

    if (bootProgress) bootProgress.style.width = '75%';

    // 7. Load all barrel manifests
    const barrelManifests = [
      { category: 'vehicles',    manifestPath: './barrel/vehicles/manifest.json' },
      { category: 'characters',  manifestPath: './barrel/characters/manifest.json' },
      { category: 'controllers', manifestPath: './barrel/controllers/manifest.json' },
      { category: 'modes',       manifestPath: './barrel/modes/manifest.json' },
      { category: 'tracks',      manifestPath: './barrel/tracks/manifest.json' },
      { category: 'items',       manifestPath: './barrel/items/manifest.json' },
      { category: 'scenes',      manifestPath: './barrel/scenes/manifest.json' },
      { category: 'screens',     manifestPath: './barrel/ui/screens/manifest.json' },
      { category: 'parts',       manifestPath: './barrel/parts/manifest.json' }
    ];
    const barrelResults = await engine.loadBarrel('./barrel/', barrelManifests);
    console.log('[main] Barrel loaded:', barrelResults);

    // Load parts catalog into GarageSystem
    try {
      const partsResp = await fetch('./barrel/parts/manifest.json');
      if (partsResp.ok) {
        const partsManifest = await partsResp.json();
        engine.garage.setPartsCatalog(partsManifest.entries || []);
        console.log('[main] Parts catalog loaded:', partsManifest.entries?.length, 'parts');
      }
    } catch (e) {
      console.warn('[main] Parts catalog load failed:', e.message);
    }

    if (bootProgress) bootProgress.style.width = '90%';

    // 8. Init UI shell + router
    uiShell.init();
    uiRouter.init(uiConfig.screenGraph, engine.resolver.listWithModules('screens'));

    // Wire pause overlay
    engine.bus.on('ui:showPause', () => {
      uiRouter.push('pause');
    });
    engine.bus.on('ui:hidePause', () => {
      if (uiRouter.current()?.screenId === 'pause') uiRouter.pop();
    });

    // Wire race:start → record payload for results
    engine.bus.on('race:start', (payload) => {
      engine.state.set('race.payload', payload);
    });

    // Wire race finished → show results
    engine.bus.on('mode:circuit:raceEnd', ({ results }) => {
      engine.scenes.transition({ module: { mount: async () => {}, unmount: async () => {} } }, {});
      document.getElementById('ui-shell').style.display = 'block';
      uiRouter.push('results', { results });
    });

    if (bootProgress) bootProgress.style.width = '100%';

    // 9. Navigate to splash
    await uiRouter.push('splash');

    // 10. Start main loop
    engine.start();

    // Remove boot fallback
    setTimeout(() => {
      const fallback = document.getElementById('boot-fallback');
      if (fallback) {
        fallback.style.transition = 'opacity 0.5s ease';
        fallback.style.opacity = '0';
        setTimeout(() => fallback.remove(), 500);
      }
    }, 400);

    console.log('[main] Warzone Kart booted. Vendor:', VENDOR_VERSIONS);
    console.log('[main] Resolver stats:', engine.resolver.stats());
  } catch (err) {
    console.error('[main] BOOT FAILED:', err);
    const fallback = document.getElementById('boot-fallback');
    if (fallback) {
      fallback.innerHTML = `
        <div style="color:#ff3d5a; font-family:system-ui; max-width:560px; text-align:center; padding:24px;">
          <div style="font-size:24px; font-weight:700; margin-bottom:12px;">BOOT FAILED</div>
          <div style="font-size:14px; color:#a0a4b0; margin-bottom:16px;">${err.message}</div>
          <div style="font-size:12px; color:#5a5e6a; font-family:monospace;">${err.stack || ''}</div>
          <div style="font-size:12px; color:#5a5e6a; margin-top:16px;">Open the browser console for details.</div>
        </div>
      `;
    }
  }
}

main();
