// barrel/tracks/track.spaceStation.js
// "Orbital Ring" — Space station with zero-gravity sections, Earth view, solar panels, asteroids.
// POOLED: solar panels, satellite dishes, modules, stars, asteroids all use InstancedMesh.
// Draw calls: ~26 (road + dashes + barriers + finish + solarPanels + dishes + modules + earth + stars + asteroids + lights)

import * as THREE from 'three';

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3(1, 1, 1);
const tmpPos = new THREE.Vector3();

export function build(ctx, entry) {
  const group = new THREE.Group();
  group.name = 'track-spacestation';
  const points = entry.spline.points.map(p => new THREE.Vector3(...p));
  const width = entry.spline.width;
  const curve = new THREE.CatmullRomCurve3(points, true);

  // ============ ROAD MESH (single mesh, ~240 segs) — Metallic station deck plating ============
  const segments = 240;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const left  = tmpA.copy(p).addScaledVector(side,  width / 2);
    const right = tmpB.copy(p).addScaledVector(side, -width / 2);
    positions.push(left.x, left.y, left.z);
    positions.push(right.x, right.y, right.z);
    uvs.push(0, t * 40);
    uvs.push(1, t * 40);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    indices.push(a, c, b, b, c, d);
  }
  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  roadGeo.setIndex(indices);
  roadGeo.computeVertexNormals();
  const roadMat = new THREE.MeshStandardMaterial({ 
    color: '#c0c0c0', roughness: 0.35, metalness: 0.85 
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  group.add(road);

  // ============ LANE MARKINGS (InstancedMesh — high-vis yellow warning dashes) ============
  const dashCount = Math.floor(segments / 4);
  const dashGeo = new THREE.BoxGeometry(0.25, 0.02, 1.5);
  const dashMat = new THREE.MeshBasicMaterial({ color: '#f1c40f' });
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  for (let i = 0; i < dashCount; i++) {
    const t = (i * 4) / segments;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    tmpPos.set(p.x, p.y + 0.02, p.z);
    tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan.normalize());
    tmpM.compose(tmpPos, tmpQ, tmpS);
    dashes.setMatrixAt(i, tmpM);
  }
  dashes.instanceMatrix.needsUpdate = true;
  group.add(dashes);

  // ============ BARRIERS — Safety railings with warning light emissive ============
  const barrierMat = new THREE.MeshStandardMaterial({
    color: '#f1c40f', emissive: '#f1c40f', emissiveIntensity: 0.55,
    metalness: 0.7, roughness: 0.3
  });
  const barrierGeo = new THREE.BoxGeometry(0.15, 0.7, 1.8);
  const barrierCount = Math.floor(segments / 2) + 1;
  const barriers = new THREE.InstancedMesh(barrierGeo, barrierMat, barrierCount * 2);
  let bIdx = 0;
  for (let i = 0; i <= segments; i += 2) {
    const t = i / segments;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    for (const sign of [1, -1]) {
      const bPos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 0.2));
      tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan.normalize());
      tmpPos.set(bPos.x, p.y + 0.35, bPos.z);
      tmpM.compose(tmpPos, tmpQ, tmpS);
      barriers.setMatrixAt(bIdx++, tmpM);
    }
  }
  barriers.instanceMatrix.needsUpdate = true;
  group.add(barriers);

  // ============ START/FINISH LINE — White/blue space checker ============
  const checkerTex = makeCheckerTexture('#ffffff', '#4169e1');
  const finishMat = new THREE.MeshStandardMaterial({ 
    map: checkerTex, emissive: '#4169e1', emissiveIntensity: 0.35 
  });
  const finish = new THREE.Mesh(new THREE.PlaneGeometry(width, 2), finishMat);
  finish.rotation.x = -Math.PI / 2;
  const startPos = curve.getPoint(0);
  const startTan = curve.getTangent(0);
  finish.position.copy(startPos); finish.position.y = startPos.y + 0.03;
  finish.lookAt(tmpC.copy(startPos).add(startTan));
  finish.rotateX(-Math.PI / 2);
  group.add(finish);

  // ============ SOLAR PANEL ARRAYS (InstancedLarge — photovoltaic arrays along track) ============
  const SOLAR_COUNT = 30;
  const solarPanelGeo = new THREE.BoxGeometry(1, 1, 1);
  const solarPanelMat = new THREE.MeshStandardMaterial({ 
    color: '#1a237e', roughness: 0.15, metalness: 0.6 
  });
  const solarGridMat = new THREE.MeshBasicMaterial({ 
    color: '#0d47a1', transparent: true, opacity: 0.5 
  });
  const solarPanels = new THREE.InstancedMesh(solarPanelGeo, solarPanelMat, SOLAR_COUNT);
  const solarGrids = new THREE.InstancedMesh(solarPanelGeo, solarGridMat, SOLAR_COUNT);
  const lightPositions = [];
  for (let i = 0; i < SOLAR_COUNT; i++) {
    const t = (i / SOLAR_COUNT) * 0.95 + 0.025;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = i % 2 === 0 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 10));
    const w = 12 + Math.random() * 8;
    const h = 0.3;
    const d = 6 + Math.random() * 4;
    const panelY = p.y + 4 + Math.random() * 3;
    // Panel frame
    tmpPos.set(pos.x, panelY, pos.z);
    tmpQ.identity();
    tmpS.set(w, h, d);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    solarPanels.setMatrixAt(i, tmpM);
    // Grid overlay (slightly larger)
    tmpS.set(w * 0.95, h * 1.01, d * 0.95);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    solarGrids.setMatrixAt(i, tmpM);
    if (i % 4 === 0) lightPositions.push({ x: pos.x, y: panelY + 2, z: pos.z });
  }
  solarPanels.castShadow = true;
  solarPanels.instanceMatrix.needsUpdate = true;
  solarGrids.instanceMatrix.needsUpdate = true;
  group.add(solarPanels);
  group.add(solarGrids);

  // ============ SATELLITE DISHES (InstancedMesh — communication antenna arrays) ============
  const DISH_COUNT = 14;
  const dishBaseGeo = new THREE.CylinderGeometry(0.8, 1.2, 2, 12);
  const dishBaseMat = new THREE.MeshStandardMaterial({ color: '#7f8c8d', metalness: 0.7 });
  const dishDishGeo = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const dishDishMat = new THREE.MeshStandardMaterial({ 
    color: '#ffffff', roughness: 0.2, metalness: 0.9, side: THREE.DoubleSide 
  });
  const dishBases = new THREE.InstancedMesh(dishBaseGeo, dishBaseMat, DISH_COUNT);
  const dishDishes = new THREE.InstancedMesh(dishDishGeo, dishDishMat, DISH_COUNT);
  for (let i = 0; i < DISH_COUNT; i++) {
    const t = 0.06 + (i / DISH_COUNT) * 0.82;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = i % 2 === 0 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 18));
    // Base pedestal
    tmpPos.set(pos.x, p.y + 1, pos.z);
    tmpQ.identity();
    tmpS.set(1, 1, 1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    dishBases.setMatrixAt(i, tmpM);
    // Dish (tilted toward various directions)
    tmpPos.set(pos.x, p.y + 3.5, pos.z);
    tmpQ.setFromEuler(new THREE.Euler(
      Math.random() * 0.5 - 0.25,
      Math.random() * Math.PI * 2,
      Math.random() * 0.3
    ));
    tmpS.set(3, 3, 3);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    dishDishes.setMatrixAt(i, tmpM);
  }
  dishBases.castShadow = true;
  dishDishes.castShadow = true;
  dishBases.instanceMatrix.needsUpdate = true;
  dishDishes.instanceMatrix.needsUpdate = true;
  group.add(dishBases);
  group.add(dishDishes);

  // ============ STATION MODULES (InstancedMesh — habitat/laboratory cylinder units) ============
  const MODULE_COUNT = 10;
  const moduleGeo = new THREE.CylinderGeometry(1, 1, 1, 16);
  const moduleMat = new THREE.MeshStandardMaterial({ 
    color: '#ecf0f1', roughness: 0.4, metalness: 0.65 
  });
  const moduleWindowMat = new THREE.MeshBasicMaterial({ 
    color: '#3498db', transparent: true, opacity: 0.75 
  });
  const moduleGlowMat = new THREE.MeshBasicMaterial({
    color: '#3498db', transparent: true, opacity: 0.12
  });
  const modules = new THREE.InstancedMesh(moduleGeo, moduleMat, MODULE_COUNT);
  const moduleWindows = new THREE.InstancedMesh(moduleGeo, moduleWindowMat, MODULE_COUNT);
  const moduleGlows = new THREE.InstancedMesh(moduleGeo, moduleGlowMat, MODULE_COUNT);
  for (let i = 0; i < MODULE_COUNT; i++) {
    const t = 0.1 + (i / MODULE_COUNT) * 0.75;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = i % 2 === 0 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 22));
    const radius = 5 + Math.random() * 4;
    const length = 12 + Math.random() * 10;
    // Module body (oriented along track tangent)
    tmpPos.set(pos.x, p.y, pos.z);
    tmpQ.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.normalize());
    tmpS.set(radius, length, radius);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    modules.setMatrixAt(i, tmpM);
    // Window band
    tmpS.set(radius * 1.02, length * 0.3, radius * 1.02);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    moduleWindows.setMatrixAt(i, tmpM);
    // Subtle glow aura
    tmpS.set(radius * 1.5, length * 1.1, radius * 1.5);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    moduleGlows.setMatrixAt(i, tmpM);
    lightPositions.push({ x: pos.x, y: p.y, z: pos.z });
  }
  modules.castShadow = true;
  modules.instanceMatrix.needsUpdate = true;
  moduleWindows.instanceMatrix.needsUpdate = true;
  moduleGlows.instanceMatrix.needsUpdate = true;
  group.add(modules);
  group.add(moduleWindows);
  group.add(moduleGlows);

  // ============ EARTH SPHERE (Background element — distant beautiful planet) ============
  const earthGeo = new THREE.SphereGeometry(80, 48, 36);
  const earthMat = new THREE.MeshStandardMaterial({
    color: '#4169e1',
    roughness: 0.6,
    metalness: 0.1
  });
  const earth = new THREE.Mesh(earthGeo, earthMat);
  earth.position.set(200, -100, -300);
  group.add(earth);

  // Atmosphere glow around Earth
  const atmosGeo = new THREE.SphereGeometry(84, 48, 36);
  const atmosMat = new THREE.MeshBasicMaterial({
    color: '#87ceeb',
    transparent: true,
    opacity: 0.15,
    side: THREE.BackSide
  });
  const atmosphere = new THREE.Mesh(atmosGeo, atmosMat);
  atmosphere.position.copy(earth.position);
  group.add(atmosphere);

  // Cloud layer on Earth
  const cloudGeo = new THREE.SphereGeometry(81, 48, 36);
  const cloudMat = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.2
  });
  const clouds = new THREE.Mesh(cloudGeo, cloudMat);
  clouds.position.copy(earth.position);
  group.add(clouds);

  // ============ STARS BACKGROUND (InstancedSmall — distant star field sphere) ============
  const STAR_COUNT = 200;
  const starGeo = new THREE.SphereGeometry(0.5, 4, 4);
  const starMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const stars = new THREE.InstancedMesh(starGeo, starMat, STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 400 + Math.random() * 200;
    tmpPos.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi)
    );
    tmpQ.identity();
    const size = 0.3 + Math.random() * 1.2;
    tmpS.set(size, size, size);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    stars.setMatrixAt(i, tmpM);
  }
  stars.instanceMatrix.needsUpdate = true;
  group.add(stars);

  // ============ ASTEROIDS (InstancedMesh — floating rocks near station) ============
  const ASTEROID_COUNT = 35;
  const asteroidGeo = new THREE.DodecahedronGeometry(1, 1);
  const asteroidMat = new THREE.MeshStandardMaterial({
    color: '#8b8b83', roughness: 0.95, flatShading: true
  });
  const asteroids = new THREE.InstancedMesh(asteroidGeo, asteroidMat, ASTEROID_COUNT);
  for (let i = 0; i < ASTEROID_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const offset = (Math.random() > 0.5 ? 1 : -1) * (width / 2 + 20 + Math.random() * 50);
    const pos = tmpC.copy(p).addScaledVector(side, offset);
    const size = 1 + Math.random() * 4;
    tmpPos.set(pos.x, p.y + (Math.random() - 0.5) * 30, pos.z);
    tmpQ.setFromEuler(new THREE.Euler(
      Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI
    ));
    tmpS.set(size, size * (0.5 + Math.random() * 0.5), size);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    asteroids.setMatrixAt(i, tmpM);
  }
  asteroids.castShadow = true;
  asteroids.receiveShadow = true;
  asteroids.instanceMatrix.needsUpdate = true;
  group.add(asteroids);

  // ============ ZERO-G DEBRIS (InstancedSmall — small floating objects near track) ============
  const DEBRIS_COUNT = 25;
  const debrisGeo = new THREE.BoxGeometry(1, 1, 1);
  const debrisMat = new THREE.MeshStandardMaterial({
    color: '#a0a0a0', metalness: 0.8, roughness: 0.3
  });
  const debris = new THREE.InstancedMesh(debrisGeo, debrisMat, DEBRIS_COUNT);
  for (let i = 0; i < DEBRIS_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const offset = (Math.random() > 0.5 ? 1 : -1) * (width / 2 + 2 + Math.random() * 8);
    const pos = tmpC.copy(p).addScaledVector(side, offset);
    const size = 0.3 + Math.random() * 0.8;
    tmpPos.set(pos.x, p.y + 1 + Math.random() * 5, pos.z);
    tmpQ.setFromEuler(new THREE.Euler(
      Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI
    ));
    tmpS.set(size, size, size * (1 + Math.random()));
    tmpM.compose(tmpPos, tmpQ, tmpS);
    debris.setMatrixAt(i, tmpM);
  }
  debris.instanceMatrix.needsUpdate = true;
  group.add(debris);

  // ============ LIGHTING — Stark white sun from one direction, black space ambient ============
  const ambient = new THREE.AmbientLight('#1a1a2e', 0.18);
  group.add(ambient);
  
  // Bright directional sunlight
  const sunLight = new THREE.DirectionalLight('#ffffff', 1.55);
  sunLight.position.set(150, 100, 50);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -150;
  sunLight.shadow.camera.right = 150;
  sunLight.shadow.camera.top = 150;
  sunLight.shadow.camera.bottom = -150;
  group.add(sunLight);

  // Blue bounce light from Earth direction
  const earthBounce = new THREE.PointLight('#4169e1', 0.55, 220);
  earthBounce.position.copy(earth.position);
  group.add(earthBounce);

  // Warning lights at key points (max 8!)
  lightPositions.slice(0, 8).forEach((lp, idx) => {
    const light = new THREE.PointLight('#f1c40f', 0.9, 28);
    light.position.set(lp.x, lp.y, lp.z);
    group.add(light);
  });

  ctx.renderer.addObject(group);

  return { group, curve, startPos: startPos.clone(), startTan: startTan.clone() };
}

function makeCheckerTexture(colorA, colorB) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 32;
  const g = c.getContext('2d');
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 === 0 ? colorA : colorB;
      g.fillRect(i * 16, j * 16, 16, 16);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 1);
  return tex;
}

export function getStartPosition(built) {
  return built.startPos;
}

export function getCheckpoints(built) {
  const points = [];
  const segs = 16;
  for (let i = 0; i < segs; i++) {
    points.push(built.curve.getPoint(i / segs));
  }
  return points;
}

export default { build, getStartPosition, getCheckpoints };
