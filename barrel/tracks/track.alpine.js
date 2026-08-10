// barrel/tracks/track.alpine.js
// "Frost Peak" — Alpine/snowy mountain with pine trees, lodges, ice patches, snow particles.
// POOLED: pines, lodges, flags, ice patches, snowdrifts all use InstancedMesh.
// Draw calls: ~24 (road + dashes + barriers + finish + pines + lodges + flags + ice + drifts + snow + lights)

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
  group.name = 'track-alpine';
  const points = entry.spline.points.map(p => new THREE.Vector3(...p));
  const width = entry.spline.width;
  const curve = new THREE.CatmullRomCurve3(points, true);

  // ============ ROAD MESH (single mesh, ~240 segs) — Icy mountain asphalt ============
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
  const roadMat = new THREE.MeshStandardMaterial({ color: '#b8d4e8', roughness: 0.9, metalness: 0.05 });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  group.add(road);

  // ============ LANE MARKINGS (InstancedMesh — deep blue dashes for snow contrast) ============
  const dashCount = Math.floor(segments / 4);
  const dashGeo = new THREE.BoxGeometry(0.25, 0.02, 1.5);
  const dashMat = new THREE.MeshBasicMaterial({ color: '#1a5276' });
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

  // ============ BARRIERS — Safety orange snow barriers ============
  const barrierMat = new THREE.MeshStandardMaterial({
    color: '#e74c3c', emissive: '#e74c3c', emissiveIntensity: 0.15,
    roughness: 0.8, metalness: 0.1
  });
  const barrierGeo = new THREE.BoxGeometry(0.3, 0.8, 2);
  const barrierCount = Math.floor(segments / 2) + 1;
  const barriers = new THREE.InstancedMesh(barrierGeo, barrierMat, barrierCount * 2);
  let bIdx = 0;
  for (let i = 0; i <= segments; i += 2) {
    const t = i / segments;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    for (const sign of [1, -1]) {
      const bPos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 0.3));
      tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan.normalize());
      tmpPos.set(bPos.x, p.y + 0.4, bPos.z);
      tmpM.compose(tmpPos, tmpQ, tmpS);
      barriers.setMatrixAt(bIdx++, tmpM);
    }
  }
  barriers.instanceMatrix.needsUpdate = true;
  group.add(barriers);

  // ============ START/FINISH LINE — Ice blue and red checker ============
  const checkerTex = makeCheckerTexture('#e8f4f8', '#e74c3c');
  const finishMat = new THREE.MeshStandardMaterial({ map: checkerTex, roughness: 0.6 });
  const finish = new THREE.Mesh(new THREE.PlaneGeometry(width, 2), finishMat);
  finish.rotation.x = -Math.PI / 2;
  const startPos = curve.getPoint(0);
  const startTan = curve.getTangent(0);
  finish.position.copy(startPos); finish.position.y = startPos.y + 0.03;
  finish.lookAt(tmpC.copy(startPos).add(startTan));
  finish.rotateX(-Math.PI / 2);
  group.add(finish);

  // ============ SNOW PINES (InstancedMesh — trunk + cone foliage + snow cap) ============
  const PINE_COUNT = 70;
  const pineTrunkGeo = new THREE.CylinderGeometry(0.15, 0.25, 3, 6);
  const pineTrunkMat = new THREE.MeshStandardMaterial({ color: '#4a3728', roughness: 0.9 });
  const pineFoliageGeo = new THREE.ConeGeometry(1.5, 4, 8);
  const pineFoliageMat = new THREE.MeshStandardMaterial({ 
    color: '#228b22', roughness: 0.85, flatShading: true 
  });
  const pineSnowGeo = new THREE.ConeGeometry(1.7, 2, 8);
  const pineSnowMat = new THREE.MeshStandardMaterial({ 
    color: '#ffffff', roughness: 0.9, flatShading: true 
  });
  const pineTrunks = new THREE.InstancedMesh(pineTrunkGeo, pineTrunkMat, PINE_COUNT);
  const pineFoliages = new THREE.InstancedMesh(pineFoliageGeo, pineFoliageMat, PINE_COUNT);
  const pineSnows = new THREE.InstancedMesh(pineSnowGeo, pineSnowMat, PINE_COUNT);
  const lightPositions = [];
  for (let i = 0; i < PINE_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const offset = (Math.random() > 0.5 ? 1 : -1) * (width / 2 + 10 + Math.random() * 35);
    const pos = tmpC.copy(p).addScaledVector(side, offset);
    const scale = 0.7 + Math.random() * 0.8;
    // Trunk
    tmpPos.set(pos.x, p.y + 1.5 * scale, pos.z);
    tmpQ.identity();
    tmpS.set(scale, scale, scale);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    pineTrunks.setMatrixAt(i, tmpM);
    // Foliage
    tmpPos.set(pos.x, p.y + 5 * scale, pos.z);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    pineFoliages.setMatrixAt(i, tmpM);
    // Snow cap
    tmpPos.set(pos.x, p.y + 7 * scale, pos.z);
    tmpS.set(scale * 0.9, scale * 0.6, scale * 0.9);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    pineSnows.setMatrixAt(i, tmpM);
    if (i % 9 === 0) lightPositions.push({ x: pos.x, y: p.y + 7 * scale, z: pos.z });
  }
  pineTrunks.instanceMatrix.needsUpdate = true;
  pineFoliages.instanceMatrix.needsUpdate = true;
  pineSnows.instanceMatrix.needsUpdate = true;
  group.add(pineTrunks);
  group.add(pineFoliages);
  group.add(pineSnows);

  // ============ SKI LODGES (InstancedMesh — alpine chalet buildings) ============
  const LODGE_COUNT = 5;
  const lodgeBodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const lodgeBodyMat = new THREE.MeshStandardMaterial({ 
    color: '#8b4513', roughness: 0.85 
  });
  const lodgeRoofGeo = new THREE.ConeGeometry(1, 1, 4);
  const lodgeRoofMat = new THREE.MeshStandardMaterial({ 
    color: '#c0392b', roughness: 0.8, flatShading: true 
  });
  const lodgeWindowMat = new THREE.MeshBasicMaterial({ 
    color: '#ffd700', transparent: true, opacity: 0.8 
  });
  const lodgeBodies = new THREE.InstancedMesh(lodgeBodyGeo, lodgeBodyMat, LODGE_COUNT);
  const lodgeRoofs = new THREE.InstancedMesh(lodgeRoofGeo, lodgeRoofMat, LODGE_COUNT);
  const lodgeWindows = new THREE.InstancedMesh(lodgeBodyGeo, lodgeWindowMat, LODGE_COUNT);
  for (let i = 0; i < LODGE_COUNT; i++) {
    const t = 0.15 + i * 0.18;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = i % 2 === 0 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 18));
    const size = 12 + Math.random() * 8;
    // Body
    tmpPos.set(pos.x, p.y + size * 0.4, pos.z);
    tmpQ.identity();
    tmpS.set(size, size * 0.6, size * 0.7);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    lodgeBodies.setMatrixAt(i, tmpM);
    // Roof
    tmpPos.set(pos.x, p.y + size * 0.85, pos.z);
    tmpQ.setFromEuler(new THREE.Euler(0, Math.PI / 4, 0));
    tmpS.set(size * 0.75, size * 0.35, size * 0.75);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    lodgeRoofs.setMatrixAt(i, tmpM);
    // Glowing windows
    tmpPos.set(pos.x, p.y + size * 0.45, pos.z);
    tmpQ.identity();
    tmpS.set(size * 0.8, size * 0.15, size * 0.61);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    lodgeWindows.setMatrixAt(i, tmpM);
    lightPositions.push({ x: pos.x, y: p.y + size * 0.5, z: pos.z });
  }
  lodgeBodies.castShadow = true;
  lodgeRoofs.castShadow = true;
  lodgeBodies.instanceMatrix.needsUpdate = true;
  lodgeRoofs.instanceMatrix.needsUpdate = true;
  lodgeWindows.instanceMatrix.needsUpdate = true;
  group.add(lodgeBodies);
  group.add(lodgeRoofs);
  group.add(lodgeWindows);

  // ============ ICE PATCHES (InstancedMesh — slippery frozen areas on road edges) ============
  const ICE_COUNT = 25;
  const iceGeo = new THREE.CircleGeometry(1, 16);
  const iceMat = new THREE.MeshStandardMaterial({ 
    color: '#87ceeb', roughness: 0.05, metalness: 0.4,
    transparent: true, opacity: 0.85, emissive: '#87ceeb', emissiveIntensity: 0.1
  });
  const ices = new THREE.InstancedMesh(iceGeo, iceMat, ICE_COUNT);
  for (let i = 0; i < ICE_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = Math.random() > 0.5 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 - 1));
    tmpPos.set(pos.x, p.y + 0.01, pos.z);
    tmpQ.setFromEuler(new THREE.Euler(-Math.PI / 2, Math.random() * Math.PI, 0));
    tmpS.set(1.5 + Math.random() * 2, 1, 1.5 + Math.random() * 2);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    ices.setMatrixAt(i, tmpM);
  }
  ices.receiveShadow = true;
  ices.instanceMatrix.needsUpdate = true;
  group.add(ices);

  // ============ RACE FLAGS (InstancedMesh — checkpoint markers along course) ============
  const FLAG_COUNT = 16;
  const flagPoleGeo = new THREE.CylinderGeometry(0.05, 0.05, 4, 6);
  const flagPoleMat = new THREE.MeshStandardMaterial({ color: '#7f8c8d', metalness: 0.7 });
  const flagGeo = new THREE.PlaneGeometry(1.2, 0.8);
  const flagMat = new THREE.MeshBasicMaterial({ 
    color: '#e74c3c', side: THREE.DoubleSide 
  });
  const flagPoles = new THREE.InstancedMesh(flagPoleGeo, flagPoleMat, FLAG_COUNT);
  const flags = new THREE.InstancedMesh(flagGeo, flagMat, FLAG_COUNT);
  for (let i = 0; i < FLAG_COUNT; i++) {
    const t = i / FLAG_COUNT;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = i % 2 === 0 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 1.5));
    // Pole
    tmpPos.set(pos.x, p.y + 2, pos.z);
    tmpQ.identity();
    tmpS.set(1, 1, 1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    flagPoles.setMatrixAt(i, tmpM);
    // Flag
    tmpPos.set(pos.x + (sign > 0 ? 0.6 : -0.6), p.y + 3.5, pos.z);
    tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), side);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    flags.setMatrixAt(i, tmpM);
  }
  flagPoles.instanceMatrix.needsUpdate = true;
  flags.instanceMatrix.needsUpdate = true;
  group.add(flagPoles);
  group.add(flags);

  // ============ SNOWDRIFTS (InstancedMesh — soft mounds along edges) ============
  const DRIFT_COUNT = 40;
  const driftGeo = new THREE.SphereGeometry(1, 8, 6);
  const driftMat = new THREE.MeshStandardMaterial({ 
    color: '#ffffff', roughness: 1.0, flatShading: true 
  });
  const drifts = new THREE.InstancedMesh(driftGeo, driftMat, DRIFT_COUNT);
  for (let i = 0; i < DRIFT_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = Math.random() > 0.5 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 1));
    const sx = 2 + Math.random() * 4;
    const sy = 0.8 + Math.random() * 1.5;
    const sz = 3 + Math.random() * 5;
    tmpPos.set(pos.x, p.y + sy * 0.4, pos.z);
    tmpQ.identity();
    tmpS.set(sx, sy, sz);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    drifts.setMatrixAt(i, tmpM);
  }
  drifts.receiveShadow = true;
  drifts.instanceMatrix.needsUpdate = true;
  group.add(drifts);

  // ============ SNOW PARTICLES (InstancedSmall — falling snowflakes in air) ============
  const SNOW_COUNT = 80;
  const snowGeo = new THREE.SphereGeometry(0.12, 6, 6);
  const snowMat = new THREE.MeshBasicMaterial({ 
    color: '#ffffff', transparent: true, opacity: 0.8 
  });
  const snowflakes = new THREE.InstancedMesh(snowGeo, snowMat, SNOW_COUNT);
  for (let i = 0; i < SNOW_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const offset = (Math.random() > 0.5 ? 1 : -1) * (Math.random() * width + 10);
    const pos = tmpC.copy(p).addScaledVector(side, offset);
    tmpPos.set(pos.x, p.y + 3 + Math.random() * 25, pos.z);
    tmpQ.identity();
    tmpS.set(1, 1, 1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    snowflakes.setMatrixAt(i, tmpM);
  }
  snowflakes.instanceMatrix.needsUpdate = true;
  group.add(snowflakes);

  // ============ LIGHTING — Cool blue ambient with warm golden sun low on horizon ============
  const ambient = new THREE.AmbientLight('#b8d4e8', 0.65);
  group.add(ambient);
  
  const sun = new THREE.DirectionalLight('#ffffff', 0.7);
  sun.position.set(60, 120, 50);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -150;
  sun.shadow.camera.right = 150;
  sun.shadow.camera.top = 150;
  sun.shadow.camera.bottom = -150;
  group.add(sun);

  // Warm lights at lodges and key points (max 8!)
  lightPositions.slice(0, 8).forEach((lp, idx) => {
    const light = new THREE.PointLight('#ffcc00', 0.7, 28);
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
