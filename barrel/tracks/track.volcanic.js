// barrel/tracks/track.volcanic.js
// "Magma Core" — Volcanic arena with lava flows, ash clouds, rock formations, heat distortion.
// POOLED: lava rocks, obsidian spires, steam geysers, lava pools, ash clouds, embers all use InstancedMesh.
// Draw calls: ~26 (road + dashes + barriers + finish + rocks + spires + geysers + pools + ashClouds + embers + lights)

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
  group.name = 'track-volcanic';
  const points = entry.spline.points.map(p => new THREE.Vector3(...p));
  const width = entry.spline.width;
  const curve = new THREE.CatmullRomCurve3(points, true);

  // ============ ROAD MESH (single mesh, ~240 segs) — Dark volcanic rock surface ============
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
    color: '#1a0a0a', roughness: 0.95, metalness: 0.1 
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  group.add(road);

  // ============ LANE MARKINGS (InstancedMesh — glowing ember-orange dashes) ============
  const dashCount = Math.floor(segments / 4);
  const dashGeo = new THREE.BoxGeometry(0.3, 0.03, 1.8);
  const dashMat = new THREE.MeshBasicMaterial({ color: '#ff6b35' });
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

  // ============ BARRIERS — Molten metal bars with intense orange glow ============
  const barrierMat = new THREE.MeshStandardMaterial({
    color: '#ff4500', emissive: '#ff4500', emissiveIntensity: 1.5,
    metalness: 0.6, roughness: 0.4
  });
  const barrierGeo = new THREE.BoxGeometry(0.25, 0.9, 2);
  const barrierCount = Math.floor(segments / 2) + 1;
  const barriers = new THREE.InstancedMesh(barrierGeo, barrierMat, barrierCount * 2);
  let bIdx = 0;
  for (let i = 0; i <= segments; i += 2) {
    const t = i / segments;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    for (const sign of [1, -1]) {
      const bPos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 0.25));
      tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan.normalize());
      tmpPos.set(bPos.x, p.y + 0.45, bPos.z);
      tmpM.compose(tmpPos, tmpQ, tmpS);
      barriers.setMatrixAt(bIdx++, tmpM);
    }
  }
  barriers.instanceMatrix.needsUpdate = true;
  group.add(barriers);

  // ============ START/FINISH LINE — Fire orange/black checker ============
  const checkerTex = makeCheckerTexture('#ff4500', '#1a0a0a');
  const finishMat = new THREE.MeshStandardMaterial({ 
    map: checkerTex, emissive: '#ff4500', emissiveIntensity: 0.5 
  });
  const finish = new THREE.Mesh(new THREE.PlaneGeometry(width, 2), finishMat);
  finish.rotation.x = -Math.PI / 2;
  const startPos = curve.getPoint(0);
  const startTan = curve.getTangent(0);
  finish.position.copy(startPos); finish.position.y = startPos.y + 0.03;
  finish.lookAt(tmpC.copy(startPos).add(startTan));
  finish.rotateX(-Math.PI / 2);
  group.add(finish);

  // ============ LAVA ROCKS (InstancedMesh — jagged volcanic boulders scattered around) ============
  const ROCK_COUNT = 65;
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ 
    color: '#2d1810', roughness: 0.95, flatShading: true 
  });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_COUNT);
  for (let i = 0; i < ROCK_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const offset = (Math.random() > 0.5 ? 1 : -1) * (width / 2 + 5 + Math.random() * 30);
    const pos = tmpC.copy(p).addScaledVector(side, offset);
    const scale = 1 + Math.random() * 4;
    tmpPos.set(pos.x, p.y + scale * 0.4, pos.z);
    tmpQ.setFromEuler(new THREE.Euler(
      Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI
    ));
    tmpS.set(scale, scale * 0.7, scale);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    rocks.setMatrixAt(i, tmpM);
  }
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  rocks.instanceMatrix.needsUpdate = true;
  group.add(rocks);

  // ============ OBSIDIAN SPIRES (InstancedSharp — tall black crystal formations) ============
  const SPIRE_COUNT = 20;
  const spireGeo = new THREE.ConeGeometry(1, 1, 4);
  const spireMat = new THREE.MeshStandardMaterial({ 
    color: '#0a0505', roughness: 0.2, metalness: 0.8, flatShading: true 
  });
  const spireGlowMat = new THREE.MeshBasicMaterial({
    color: '#ff4500', transparent: true, opacity: 0.15
  });
  const spires = new THREE.InstancedMesh(spireGeo, spireMat, SPIRE_COUNT);
  const spireGlows = new THREE.InstancedMesh(spireGeo, spireGlowMat, SPIRE_COUNT);
  const lightPositions = [];
  for (let i = 0; i < SPIRE_COUNT; i++) {
    const t = (i / SPIRE_COUNT) * 0.95 + 0.02;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = i % 2 === 0 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 12));
    const height = 8 + Math.random() * 18;
    const radius = 1 + Math.random() * 2;
    // Spire body
    tmpPos.set(pos.x, p.y + height * 0.45, pos.z);
    tmpQ.identity();
    tmpS.set(radius, height, radius);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    spires.setMatrixAt(i, tmpM);
    // Heat glow aura
    tmpS.set(radius * 2, height * 1.1, radius * 2);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    spireGlows.setMatrixAt(i, tmpM);
    if (i % 3 === 0) lightPositions.push({ x: pos.x, y: p.y + height, z: pos.z });
  }
  spires.castShadow = true;
  spires.instanceMatrix.needsUpdate = true;
  spireGlows.instanceMatrix.needsUpdate = true;
  group.add(spires);
  group.add(spireGlows);

  // ============ STEAM GEYSERS (InstancedMesh — erupting steam columns from ground) ============
  const GEYSER_COUNT = 10;
  const geyserBaseGeo = new THREE.CylinderGeometry(1.5, 2, 1.5, 12);
  const geyserBaseMat = new THREE.MeshStandardMaterial({ color: '#4a3728', roughness: 0.9 });
  const geyserSteamGeo = new THREE.CylinderGeometry(0.5, 2, 1, 8);
  const geyserSteamMat = new THREE.MeshBasicMaterial({ 
    color: '#cccccc', transparent: true, opacity: 0.3 
  });
  const geyserBases = new THREE.InstancedMesh(geyserBaseGeo, geyserBaseMat, GEYSER_COUNT);
  const geyserSteams = new THREE.InstancedMesh(geyserSteamGeo, geyserSteamMat, GEYSER_COUNT);
  for (let i = 0; i < GEYSER_COUNT; i++) {
    const t = 0.08 + (i / GEYSER_COUNT) * 0.8;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = i % 2 === 0 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 4));
    // Base vent
    tmpPos.set(pos.x, p.y + 0.75, pos.z);
    tmpQ.identity();
    tmpS.set(1, 1, 1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    geyserBases.setMatrixAt(i, tmpM);
    // Steam column
    tmpPos.set(pos.x, p.y + 6, pos.z);
    tmpS.set(1, 12, 1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    geyserSteams.setMatrixAt(i, tmpM);
  }
  geyserBases.instanceMatrix.needsUpdate = true;
  geyserSteams.instanceMatrix.needsUpdate = true;
  group.add(geyserBases);
  group.add(geyserSteams);

  // ============ LAVA POOLS (InstancedMesh — glowing molten areas on ground) ============
  const POOL_COUNT = 8;
  const poolGeo = new THREE.CircleGeometry(1, 24);
  const poolMat = new THREE.MeshBasicMaterial({ 
    color: '#ff4500', transparent: true, opacity: 0.9 
  });
  const poolGlowMat = new THREE.MeshBasicMaterial({
    color: '#ff6b35', transparent: true, opacity: 0.25
  });
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, POOL_COUNT);
  const poolGlows = new THREE.InstancedMesh(poolGeo, poolGlowMat, POOL_COUNT);
  for (let i = 0; i < POOL_COUNT; i++) {
    const t = 0.12 + (i / POOL_COUNT) * 0.72;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = i % 2 === 0 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 6));
    const size = 5 + Math.random() * 5;
    // Pool surface
    tmpPos.set(pos.x, p.y + 0.02, pos.z);
    tmpQ.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    tmpS.set(size, 1, size);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    pools.setMatrixAt(i, tmpM);
    // Glow aura
    tmpS.set(size * 1.8, 1, size * 1.8);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    poolGlows.setMatrixAt(i, tmpM);
    lightPositions.push({ x: pos.x, y: p.y + 3, z: pos.z });
  }
  pools.instanceMatrix.needsUpdate = true;
  poolGlows.instanceMatrix.needsUpdate = true;
  group.add(pools);
  group.add(poolGlows);

  // ============ ASH CLOUDS (InstancedMesh — dark smoke/ash floating in air) ============
  const ASH_COUNT = 20;
  const ashGeo = new THREE.SphereGeometry(1, 8, 8);
  const ashMat = new THREE.MeshBasicMaterial({
    color: '#333333', transparent: true, opacity: 0.35
  });
  const ashes = new THREE.InstancedMesh(ashGeo, ashMat, ASH_COUNT);
  for (let i = 0; i < ASH_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const offset = (Math.random() > 0.5 ? 1 : -1) * (width / 2 + 5 + Math.random() * 30);
    const pos = tmpC.copy(p).addScaledVector(side, offset);
    const size = 5 + Math.random() * 12;
    tmpPos.set(pos.x, p.y + 15 + Math.random() * 25, pos.z);
    tmpQ.identity();
    tmpS.set(size, size * 0.6, size);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    ashes.setMatrixAt(i, tmpM);
  }
  ashes.instanceMatrix.needsUpdate = true;
  group.add(ashes);

  // ============ HEAT DISTORTION PLANES (InstancedMesh — shimmering heat wave effects) ============
  const HEAT_COUNT = 12;
  const heatGeo = new THREE.PlaneGeometry(1, 1);
  const heatMat = new THREE.MeshBasicMaterial({
    color: '#ffaa00', transparent: true, opacity: 0.06, side: THREE.DoubleSide
  });
  const heats = new THREE.InstancedMesh(heatGeo, heatMat, HEAT_COUNT);
  for (let i = 0; i < HEAT_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = Math.random() > 0.5 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 2));
    tmpPos.set(pos.x, p.y + 3, pos.z);
    tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), side);
    tmpS.set(8, 6, 1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    heats.setMatrixAt(i, tmpM);
  }
  heats.instanceMatrix.needsUpdate = true;
  group.add(heats);

  // ============ EMBER PARTICLES (InstancedSmall — floating fire sparks throughout scene) ============
  const EMBER_COUNT = 40;
  const emberGeo = new THREE.SphereGeometry(0.15, 6, 6);
  const emberMat = new THREE.MeshBasicMaterial({ color: '#ffff00' });
  const embers = new THREE.InstancedMesh(emberGeo, emberMat, EMBER_COUNT);
  for (let i = 0; i < EMBER_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const offset = (Math.random() > 0.5 ? 1 : -1) * (width / 2 + 3 + Math.random() * 15);
    const pos = tmpC.copy(p).addScaledVector(side, offset);
    tmpPos.set(pos.x, p.y + 2 + Math.random() * 15, pos.z);
    tmpQ.identity();
    tmpS.set(1, 1, 1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    embers.setMatrixAt(i, tmpM);
  }
  embers.instanceMatrix.needsUpdate = true;
  group.add(embers);

  // ============ LIGHTING — Deep red ambient with subsurface lava glow and dim top light ============
  const ambient = new THREE.AmbientLight('#1a0a0a', 0.28);
  group.add(ambient);
  
  // Subsurface magma glow from below
  const lavaGlow = new THREE.DirectionalLight('#ff4500', 0.9);
  lavaGlow.position.set(0, -40, 0);
  group.add(lavaGlow);
  
  // Dim top-down light through ash
  const topLight = new THREE.DirectionalLight('#ff6b35', 0.3);
  topLight.position.set(0, 100, 0);
  topLight.castShadow = true;
  topLight.shadow.mapSize.set(2048, 2048);
  topLight.shadow.camera.left = -150;
  topLight.shadow.camera.right = 150;
  topLight.shadow.camera.top = 150;
  topLight.shadow.camera.bottom = -150;
  group.add(topLight);

  // Intense point lights at lava hotspots and spires (max 8!)
  lightPositions.slice(0, 8).forEach((lp, idx) => {
    const light = new THREE.PointLight('#ff4500', 2.2, 38);
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
