// barrel/tracks/track.desert.js
// "Dust Bowl Circuit" — Desert biome with sand dunes, cacti, oil rigs, mirage effects.
// POOLED: dunes, cacti, oil rigs, obelisks, oasis pools all use InstancedMesh.
// Draw calls: ~22 (road + dashes + barriers + finish + dunes + cacti + rigs + obelisks + oases + lights)

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
  group.name = 'track-desert';
  const points = entry.spline.points.map(p => new THREE.Vector3(...p));
  const width = entry.spline.width;
  const curve = new THREE.CatmullRomCurve3(points, true);

  // ============ ROAD MESH (single mesh, ~240 segs) — Worn desert asphalt ============
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
  const roadMat = new THREE.MeshStandardMaterial({ color: '#c4956a', roughness: 0.95, metalness: 0.05 });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  group.add(road);

  // ============ LANE MARKINGS (InstancedMesh — faded white dashes) ============
  const dashCount = Math.floor(segments / 4);
  const dashGeo = new THREE.BoxGeometry(0.25, 0.02, 1.5);
  const dashMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  for (let i = 0; i < dashCount; i++) {
    const t = (i * 4) / segments;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    tmpPos.set(p.x, 0.02, p.z);
    tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan.normalize());
    tmpM.compose(tmpPos, tmpQ, tmpS);
    dashes.setMatrixAt(i, tmpM);
  }
  dashes.instanceMatrix.needsUpdate = true;
  group.add(dashes);

  // ============ BARRIERS — Weathered stone pillars with desert patina ============
  const barrierMat = new THREE.MeshStandardMaterial({
    color: '#8b7355', roughness: 0.9, metalness: 0.1
  });
  const barrierGeo = new THREE.CylinderGeometry(0.25, 0.35, 1.0, 6);
  const barrierCount = Math.floor(segments / 2) + 1;
  const barriers = new THREE.InstancedMesh(barrierGeo, barrierMat, barrierCount * 2);
  let bIdx = 0;
  for (let i = 0; i <= segments; i += 2) {
    const t = i / segments;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    for (const sign of [1, -1]) {
      const bPos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 0.4));
      tmpQ.identity();
      tmpPos.set(bPos.x, 0.5, bPos.z);
      tmpM.compose(tmpPos, tmpQ, tmpS);
      barriers.setMatrixAt(bIdx++, tmpM);
    }
  }
  barriers.instanceMatrix.needsUpdate = true;
  group.add(barriers);

  // ============ START/FINISH LINE — Sand/gold checker ============
  const checkerTex = makeCheckerTexture('#d4a574', '#ffd93d');
  const finishMat = new THREE.MeshStandardMaterial({ map: checkerTex, roughness: 0.7 });
  const finish = new THREE.Mesh(new THREE.PlaneGeometry(width, 2), finishMat);
  finish.rotation.x = -Math.PI / 2;
  const startPos = curve.getPoint(0);
  const startTan = curve.getTangent(0);
  finish.position.copy(startPos); finish.position.y = 0.03;
  finish.lookAt(tmpC.copy(startPos).add(startTan));
  finish.rotateX(-Math.PI / 2);
  group.add(finish);

  // ============ SAND DUNES (InstancedMesh — rolling dune shapes with ripple texture) ============
  const DUNE_COUNT = 60;
  const duneData = [];
  for (let i = 0; i < DUNE_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const offset = (Math.random() > 0.5 ? 1 : -1) * (width / 2 + 12 + Math.random() * 50);
    const pos = tmpC.copy(p).addScaledVector(side, offset);
    const scaleX = 8 + Math.random() * 20;
    const scaleY = 2 + Math.random() * 6;
    const scaleZ = 10 + Math.random() * 25;
    duneData.push({ x: pos.x, z: pos.z, sx: scaleX, sy: scaleY, sz: scaleZ });
  }
  const duneGeo = new THREE.SphereGeometry(1, 12, 8);
  const duneMat = new THREE.MeshStandardMaterial({ 
    color: '#d4a574', roughness: 1.0, metalness: 0.0, flatShading: true 
  });
  const dunes = new THREE.InstancedMesh(duneGeo, duneMat, DUNE_COUNT);
  for (let i = 0; i < DUNE_COUNT; i++) {
    const d = duneData[i];
    tmpPos.set(d.x, d.sy * 0.5, d.z);
    tmpQ.identity();
    tmpS.set(d.sx, d.sy, d.sz);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    dunes.setMatrixAt(i, tmpM);
  }
  dunes.castShadow = true;
  dunes.receiveShadow = true;
  dunes.instanceMatrix.needsUpdate = true;
  group.add(dunes);

  // ============ CACTI (InstancedMesh — saguaro-style desert cacti) ============
  const CACTUS_COUNT = 45;
  const cactusBodyGeo = new THREE.CylinderGeometry(0.3, 0.4, 1, 8);
  const cactusBodyMat = new THREE.MeshStandardMaterial({ 
    color: '#2d5016', roughness: 0.85, flatShading: true 
  });
  const cactusArmGeo = new THREE.CylinderGeometry(0.15, 0.2, 1, 6);
  const cactusArmMat = new THREE.MeshStandardMaterial({ 
    color: '#3d6b1e', roughness: 0.85, flatShading: true 
  });
  const cactusFlowerGeo = new THREE.SphereGeometry(0.25, 6, 6);
  const cactusFlowerMat = new THREE.MeshBasicMaterial({ color: '#ff69b4' });
  const cactusBodies = new THREE.InstancedMesh(cactusBodyGeo, cactusBodyMat, CACTUS_COUNT);
  const cactusArms = new THREE.InstancedMesh(cactusArmGeo, cactusArmMat, CACTUS_COUNT * 2);
  const cactusFlowers = new THREE.InstancedMesh(cactusFlowerGeo, cactusFlowerMat, CACTUS_COUNT);
  let armIdx = 0;
  const lightPositions = [];
  for (let i = 0; i < CACTUS_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const offset = (Math.random() > 0.5 ? 1 : -1) * (width / 2 + 5 + Math.random() * 18);
    const pos = tmpC.copy(p).addScaledVector(side, offset);
    const height = 2 + Math.random() * 4;
    // Body
    tmpPos.set(pos.x, height / 2, pos.z);
    tmpQ.identity();
    tmpS.set(1, height, 1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    cactusBodies.setMatrixAt(i, tmpM);
    // Left arm
    tmpPos.set(pos.x - 0.5, height * 0.65, pos.z);
    tmpQ.setFromEuler(new THREE.Euler(0, 0, Math.PI / 4));
    tmpS.set(1, height * 0.35, 1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    cactusArms.setMatrixAt(armIdx++, tmpM);
    // Right arm
    tmpPos.set(pos.x + 0.5, height * 0.55, pos.z);
    tmpQ.setFromEuler(new THREE.Euler(0, 0, -Math.PI / 4));
    tmpM.compose(tmpPos, tmpQ, tmpS);
    cactusArms.setMatrixAt(armIdx++, tmpM);
    // Flower on top
    tmpPos.set(pos.x, height + 0.25, pos.z);
    tmpQ.identity();
    tmpS.set(1, 1, 1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    cactusFlowers.setMatrixAt(i, tmpM);
    if (i % 6 === 0) lightPositions.push({ x: pos.x, y: height, z: pos.z });
  }
  cactusBodies.castShadow = true;
  cactusBodies.instanceMatrix.needsUpdate = true;
  cactusArms.instanceMatrix.needsUpdate = true;
  cactusFlowers.instanceMatrix.needsUpdate = true;
  group.add(cactusBodies);
  group.add(cactusArms);
  group.add(cactusFlowers);

  // ============ OIL RIGS (InstancedMesh — industrial drilling towers) ============
  const RIG_COUNT = 8;
  const rigTowerGeo = new THREE.CylinderGeometry(0.8, 1.2, 1, 8);
  const rigTowerMat = new THREE.MeshStandardMaterial({ 
    color: '#cd853f', roughness: 0.6, metalness: 0.5 
  });
  const rigTopGeo = new THREE.BoxGeometry(1, 1, 1);
  const rigTopMat = new THREE.MeshStandardMaterial({ 
    color: '#ff4500', emissive: '#ff4500', emissiveIntensity: 0.4 
  });
  const rigTowers = new THREE.InstancedMesh(rigTowerGeo, rigTowerMat, RIG_COUNT);
  const rigTops = new THREE.InstancedMesh(rigTopGeo, rigTopMat, RIG_COUNT);
  for (let i = 0; i < RIG_COUNT; i++) {
    const angle = (i / RIG_COUNT) * Math.PI * 2;
    const dist = 100 + Math.random() * 30;
    const px = Math.cos(angle) * dist;
    const pz = Math.sin(angle) * dist;
    const height = 20 + Math.random() * 15;
    // Tower
    tmpPos.set(px, height / 2, pz);
    tmpQ.identity();
    tmpS.set(1, height, 1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    rigTowers.setMatrixAt(i, tmpM);
    // Top (glowing warning light housing)
    tmpPos.set(px, height + 1.5, pz);
    tmpS.set(3, 3, 3);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    rigTops.setMatrixAt(i, tmpM);
    lightPositions.push({ x: px, y: height + 3, z: pz });
  }
  rigTowers.castShadow = true;
  rigTops.castShadow = true;
  rigTowers.instanceMatrix.needsUpdate = true;
  rigTops.instanceMatrix.needsUpdate = true;
  group.add(rigTowers);
  group.add(rigTops);

  // ============ OBELISKS (InstancedMesh — ancient stone markers) ============
  const OBELISK_COUNT = 16;
  const obeliskGeo = new THREE.BoxGeometry(1, 1, 1);
  const obeliskMat = new THREE.MeshStandardMaterial({ 
    color: '#f5deb3', roughness: 0.6, metalness: 0.2 
  });
  const obelisks = new THREE.InstancedMesh(obeliskGeo, obeliskMat, OBELISK_COUNT);
  for (let i = 0; i < OBELISK_COUNT; i++) {
    const t = i / OBELISK_COUNT;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = i % 2 === 0 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 3));
    tmpPos.set(pos.x, 3, pos.z);
    tmpQ.identity();
    tmpS.set(1, 6, 1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    obelisks.setMatrixAt(i, tmpM);
  }
  obelisks.castShadow = true;
  obelisks.instanceMatrix.needsUpdate = true;
  group.add(obelisks);

  // ============ OASIS POOLS (InstancedMesh — mirage-like water patches) ============
  const OASIS_COUNT = 4;
  const oasisGeo = new THREE.CircleGeometry(1, 24);
  const oasisMat = new THREE.MeshStandardMaterial({ 
    color: '#40e0d0', roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.8 
  });
  const oases = new THREE.InstancedMesh(oasisGeo, oasisMat, OASIS_COUNT);
  for (let i = 0; i < OASIS_COUNT; i++) {
    const t = 0.2 + (i / OASIS_COUNT) * 0.6;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = i % 2 === 0 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 8));
    tmpPos.set(pos.x, 0.05, pos.z);
    tmpQ.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    tmpS.set(4 + Math.random() * 3, 1, 4 + Math.random() * 3);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    oases.setMatrixAt(i, tmpM);
  }
  oases.instanceMatrix.needsUpdate = true;
  group.add(oases);

  // ============ MIRAGE EFFECTS (InstancedMesh — heat shimmer planes) ============
  const MIRAGE_COUNT = 6;
  const mirageGeo = new THREE.PlaneGeometry(1, 1);
  const mirageMat = new THREE.MeshBasicMaterial({ 
    color: '#fff8dc', transparent: true, opacity: 0.08, side: THREE.DoubleSide 
  });
  const mirages = new THREE.InstancedMesh(mirageGeo, mirageMat, MIRAGE_COUNT);
  for (let i = 0; i < MIRAGE_COUNT; i++) {
    const t = 0.15 + (i / MIRAGE_COUNT) * 0.7;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = i % 2 === 0 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 30));
    tmpPos.set(pos.x, 4, pos.z);
    tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), side);
    tmpS.set(15, 8, 1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    mirages.setMatrixAt(i, tmpM);
  }
  mirages.instanceMatrix.needsUpdate = true;
  group.add(mirages);

  // ============ LIGHTING — Harsh golden desert sun with orange ambient ============
  const ambient = new THREE.AmbientLight('#ffd93d', 0.5);
  group.add(ambient);
  
  const sun = new THREE.DirectionalLight('#ffa500', 1.0);
  sun.position.set(80, 100, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -150;
  sun.shadow.camera.right = 150;
  sun.shadow.camera.top = 150;
  sun.shadow.camera.bottom = -150;
  group.add(sun);

  // Strategic point lights at oil rigs and key points (max 8!)
  lightPositions.slice(0, 8).forEach((lp, idx) => {
    const light = new THREE.PointLight('#ff8c00', 0.9, 35);
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
