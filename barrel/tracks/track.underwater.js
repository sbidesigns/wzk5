// barrel/tracks/track.underwater.js
// "Abyssal Trench" — Underwater bioluminescent track with coral reefs, sea creatures, bubbles.
// POOLED: corals, kelp, shipwrecks, bubbles, bioluminescent creatures all use InstancedMesh.
// Draw calls: ~26 (road + dashes + barriers + finish + corals + kelp + wrecks + bubbles + creatures + lights)

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
  group.name = 'track-underwater';
  const points = entry.spline.points.map(p => new THREE.Vector3(...p));
  const width = entry.spline.width;
  const curve = new THREE.CatmullRomCurve3(points, true);

  // ============ ROAD MESH (single mesh, ~240 segs) — Sandy ocean floor path ============
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
    color: '#c2b280', roughness: 0.95, metalness: 0.05 
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  group.add(road);

  // ============ LANE MARKINGS (InstancedMesh — bioluminescent cyan dashes) ============
  const dashCount = Math.floor(segments / 4);
  const dashGeo = new THREE.BoxGeometry(0.25, 0.02, 1.5);
  const dashMat = new THREE.MeshBasicMaterial({ color: '#40e0d0' });
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

  // ============ BARRIERS — Coral reef formations with subtle glow ============
  const barrierMat = new THREE.MeshStandardMaterial({
    color: '#ff7f50', emissive: '#ff7f50', emissiveIntensity: 0.28,
    roughness: 0.8
  });
  const barrierGeo = new THREE.SphereGeometry(0.4, 8, 6);
  const barrierCount = Math.floor(segments / 2) + 1;
  const barriers = new THREE.InstancedMesh(barrierGeo, barrierMat, barrierCount * 2);
  let bIdx = 0;
  for (let i = 0; i <= segments; i += 2) {
    const t = i / segments;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    for (const sign of [1, -1]) {
      const bPos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 0.5));
      tmpQ.identity();
      tmpPos.set(bPos.x, p.y + 0.4, bPos.z);
      tmpS.set(1, 1, 1);
      tmpM.compose(tmpPos, tmpQ, tmpS);
      barriers.setMatrixAt(bIdx++, tmpM);
    }
  }
  barriers.instanceMatrix.needsUpdate = true;
  group.add(barriers);

  // ============ START/FINISH LINE — Deep blue/cyan aquatic checker ============
  const checkerTex = makeCheckerTexture('#0077be', '#40e0d0');
  const finishMat = new THREE.MeshStandardMaterial({ 
    map: checkerTex, emissive: '#40e0d0', emissiveIntensity: 0.4 
  });
  const finish = new THREE.Mesh(new THREE.PlaneGeometry(width, 2), finishMat);
  finish.rotation.x = -Math.PI / 2;
  const startPos = curve.getPoint(0);
  const startTan = curve.getTangent(0);
  finish.position.copy(startPos); finish.position.y = startPos.y + 0.03;
  finish.lookAt(tmpC.copy(startPos).add(startTan));
  finish.rotateX(-Math.PI / 2);
  group.add(finish);

  // ============ CORAL FORMATIONS (InstancedMesh — vibrant colorful reef structures by type) ============
  const CORAL_COUNT = 80;
  const coralGeo = new THREE.SphereGeometry(1, 10, 8);
  const coralColors = ['#ff6b6b', '#ffd93d', '#ff9f43', '#ee5a24', '#00d2d3', '#54a0ff'];
  const coralMats = coralColors.map(c => 
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, flatShading: true })
  );
  const coralsByColor = new Map();
  for (let i = 0; i < CORAL_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const offset = (Math.random() > 0.5 ? 1 : -1) * (width / 2 + 6 + Math.random() * 30);
    const pos = tmpC.copy(p).addScaledVector(side, offset);
    const colorIdx = Math.floor(Math.random() * coralColors.length);
    const scale = 0.5 + Math.random() * 2.5;
    if (!coralsByColor.has(colorIdx)) coralsByColor.set(colorIdx, []);
    coralsByColor.get(colorIdx).push({ x: pos.x, y: p.y + scale * 0.5, z: pos.z, s: scale });
  }
  coralsByColor.forEach((corals, colorIdx) => {
    const inst = new THREE.InstancedMesh(coralGeo, coralMats[colorIdx], corals.length);
    for (let i = 0; i < corals.length; i++) {
      const cr = corals[i];
      tmpPos.set(cr.x, cr.y, cr.z);
      tmpQ.setFromEuler(new THREE.Euler(
        Math.random() * 0.5, Math.random() * Math.PI * 2, Math.random() * 0.5
      ));
      tmpS.set(cr.s, cr.s, cr.s);
      tmpM.compose(tmpPos, tmpQ, tmpS);
      inst.setMatrixAt(i, tmpM);
    }
    inst.castShadow = true;
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  });

  // ============ SEAWEED/KELP FOREST (InstancedMesh — swaying kelp stalks along edges) ============
  const KELP_COUNT = 55;
  const kelpStalkGeo = new THREE.CylinderGeometry(0.08, 0.12, 1, 6);
  const kelpStalkMat = new THREE.MeshStandardMaterial({ 
    color: '#228b22', roughness: 0.85, transparent: true, opacity: 0.9 
  });
  const kelps = new THREE.InstancedMesh(kelpStalkGeo, kelpStalkMat, KELP_COUNT);
  const lightPositions = [];
  for (let i = 0; i < KELP_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = Math.random() > 0.5 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 2 + Math.random() * 8));
    const height = 3 + Math.random() * 6;
    tmpPos.set(pos.x, p.y + height / 2, pos.z);
    tmpQ.setFromEuler(new THREE.Euler(
      (Math.random() - 0.5) * 0.15, 0, (Math.random() - 0.5) * 0.15
    ));
    tmpS.set(1, height, 1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    kelps.setMatrixAt(i, tmpM);
    if (i % 7 === 0) lightPositions.push({ x: pos.x, y: p.y + height, z: pos.z });
  }
  kelps.instanceMatrix.needsUpdate = true;
  group.add(kelps);

  // ============ SHIPWRECK DEBRIS (InstancedMesh — broken hull pieces scattered on seafloor) ============
  const WRECK_COUNT = 18;
  const wreckGeo = new THREE.BoxGeometry(1, 1, 1);
  const wreckMat = new THREE.MeshStandardMaterial({ 
    color: '#8b4513', roughness: 0.9, metalness: 0.2 
  });
  const wrecks = new THREE.InstancedMesh(wreckGeo, wreckMat, WRECK_COUNT);
  for (let i = 0; i < WRECK_COUNT; i++) {
    const t = 0.08 + (i / WRECK_COUNT) * 0.8;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = i % 2 === 0 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 14));
    const size = 4 + Math.random() * 10;
    tmpPos.set(pos.x, p.y + size * 0.3, pos.z);
    tmpQ.setFromEuler(new THREE.Euler(
      Math.random() * 0.8, Math.random() * Math.PI, Math.random() * 0.5
    ));
    tmpS.set(size, size * 0.4, size * 0.6);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    wrecks.setMatrixAt(i, tmpM);
  }
  wrecks.castShadow = true;
  wrecks.receiveShadow = true;
  wrecks.instanceMatrix.needsUpdate = true;
  group.add(wrecks);

  // ============ BUBBLES (InstancedSmall — rising air bubbles throughout water column) ============
  const BUBBLE_COUNT = 60;
  const bubbleGeo = new THREE.SphereGeometry(1, 8, 8);
  const bubbleMat = new THREE.MeshBasicMaterial({ 
    color: '#ffffff', transparent: true, opacity: 0.35 
  });
  const bubbles = new THREE.InstancedMesh(bubbleGeo, bubbleMat, BUBBLE_COUNT);
  for (let i = 0; i < BUBBLE_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const offset = (Math.random() > 0.5 ? 1 : -1) * (width / 2 + 1 + Math.random() * 20);
    const pos = tmpC.copy(p).addScaledVector(side, offset);
    const size = 0.2 + Math.random() * 0.6;
    tmpPos.set(pos.x, p.y + 1 + Math.random() * 20, pos.z);
    tmpQ.identity();
    tmpS.set(size, size, size);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    bubbles.setMatrixAt(i, tmpM);
  }
  bubbles.instanceMatrix.needsUpdate = true;
  group.add(bubbles);

  // ============ BIOLUMINESCENT CREATURES (InstancedSmall — glowing jellyfish-like entities) ============
  const CREATURE_COUNT = 16;
  const creatureBodyGeo = new THREE.SphereGeometry(1, 12, 10);
  const creatureBodyMat = new THREE.MeshBasicMaterial({ 
    color: '#00ffff', transparent: true, opacity: 0.65 
  });
  const creatureTentacleGeo = new THREE.CylinderGeometry(0.05, 0.1, 1, 4);
  const creatureTentacleMat = new THREE.MeshBasicMaterial({ 
    color: '#00ffff', transparent: true, opacity: 0.4 
  });
  const creatureGlowGeo = new THREE.SphereGeometry(1, 12, 10);
  const creatureGlowMat = new THREE.MeshBasicMaterial({
    color: '#00ffff', transparent: true, opacity: 0.12
  });
  const creatureBodies = new THREE.InstancedMesh(creatureBodyGeo, creatureBodyMat, CREATURE_COUNT);
  const creatureTentacles = new THREE.InstancedMesh(creatureTentacleGeo, creatureTentacleMat, CREATURE_COUNT);
  const creatureGlows = new THREE.InstancedMesh(creatureGlowGeo, creatureGlowMat, CREATURE_COUNT);
  for (let i = 0; i < CREATURE_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const offset = (Math.random() > 0.5 ? 1 : -1) * (width / 2 + 8 + Math.random() * 25);
    const pos = tmpC.copy(p).addScaledVector(side, offset);
    const size = 1 + Math.random() * 1.5;
    const yBase = p.y + 8 + Math.random() * 10;
    // Glowing body
    tmpPos.set(pos.x, yBase, pos.z);
    tmpQ.identity();
    tmpS.set(size, size * 0.8, size);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    creatureBodies.setMatrixAt(i, tmpM);
    // Glow aura
    tmpS.set(size * 2.5, size * 2, size * 2.5);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    creatureGlows.setMatrixAt(i, tmpM);
    // Tentacles hanging down
    tmpPos.set(pos.x, yBase - size * 1.5, pos.z);
    tmpS.set(size * 0.3, size * 3, size * 0.3);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    creatureTentacles.setMatrixAt(i, tmpM);
    lightPositions.push({ x: pos.x, y: yBase, z: pos.z });
  }
  creatureBodies.instanceMatrix.needsUpdate = true;
  creatureTentacles.instanceMatrix.needsUpdate = true;
  creatureGlows.instanceMatrix.needsUpdate = true;
  group.add(creatureBodies);
  group.add(creatureTentacles);
  group.add(creatureGlows);

  // ============ FISH SCHOOLS (InstancedSmall — small fish swimming in groups) ============
  const FISH_COUNT = 40;
  const fishGeo = new THREE.ConeGeometry(0.3, 0.8, 6);
  const fishMat = new THREE.MeshBasicMaterial({
    color: '#ffd700', transparent: true, opacity: 0.75
  });
  const fishes = new THREE.InstancedMesh(fishGeo, fishMat, FISH_COUNT);
  for (let i = 0; i < FISH_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const offset = (Math.random() > 0.5 ? 1 : -1) * (width / 2 + 3 + Math.random() * 25);
    const pos = tmpC.copy(p).addScaledVector(side, offset);
    tmpPos.set(pos.x, p.y + 2 + Math.random() * 18, pos.z);
    tmpQ.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    tmpS.set(1, 1, 1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    fishes.setMatrixAt(i, tmpM);
  }
  fishes.instanceMatrix.needsUpdate = true;
  group.add(fishes);

  // ============ LIGHTING — Deep ocean blue ambient with caustic surface light from above ============
  const ambient = new THREE.AmbientLight('#0a1628', 0.38);
  group.add(ambient);
  
  // Surface light filtering down through water
  const surfaceLight = new THREE.DirectionalLight('#87ceeb', 0.65);
  surfaceLight.position.set(0, 100, 30);
  surfaceLight.castShadow = true;
  surfaceLight.shadow.mapSize.set(2048, 2048);
  surfaceLight.shadow.camera.left = -150;
  surfaceLight.shadow.camera.right = 150;
  surfaceLight.shadow.camera.top = 150;
  surfaceLight.shadow.camera.bottom = -150;
  group.add(surfaceLight);

  // Bioluminescent point lights at creatures and key spots (max 8!)
  lightPositions.slice(0, 8).forEach((lp, idx) => {
    const light = new THREE.PointLight('#00ffff', 1.2, 32);
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
