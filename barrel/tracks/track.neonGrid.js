// barrel/tracks/track.neonGrid.js
// "Cyber Grid" — Tron-style neon grid with glowing lines, digital obstacles, data streams.
// POOLED: grid tiles, data towers, holographic ads, laser gates, data streams all use InstancedMesh.
// Draw calls: ~24 (road + dashes + gridLines + barriers + finish + tiles + towers + ads + gates + streams + lights)

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
  group.name = 'track-neongrid';
  const points = entry.spline.points.map(p => new THREE.Vector3(...p));
  const width = entry.spline.width;
  const curve = new THREE.CatmullRomCurve3(points, true);

  // ============ ROAD MESH (single mesh, ~240 segs) — Dark reflective digital surface ============
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
    color: '#0a0a1a', roughness: 0.15, metalness: 0.9 
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  group.add(road);

  // ============ NEON GRID LINES (InstancedMesh — glowing cyan cross-lines on road) ============
  const gridLineCount = Math.floor(segments / 3);
  const gridLineGeo = new THREE.BoxGeometry(0.08, 0.03, width - 0.5);
  const gridLineMat = new THREE.MeshBasicMaterial({ color: '#00ffff' });
  const gridLines = new THREE.InstancedMesh(gridLineGeo, gridLineMat, gridLineCount);
  for (let i = 0; i < gridLineCount; i++) {
    const t = (i * 3) / segments;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    tmpPos.set(p.x, 0.02, p.z);
    tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan.normalize());
    tmpM.compose(tmpPos, tmpQ, tmpS);
    gridLines.setMatrixAt(i, tmpM);
  }
  gridLines.instanceMatrix.needsUpdate = true;
  group.add(gridLines);

  // ============ LANE MARKINGS (Neon magenta dashes) ============
  const dashCount = Math.floor(segments / 4);
  const dashGeo = new THREE.BoxGeometry(0.3, 0.04, 2);
  const dashMat = new THREE.MeshBasicMaterial({ color: '#ff00ff' });
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashCount);
  for (let i = 0; i < dashCount; i++) {
    const t = (i * 4) / segments;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    tmpPos.set(p.x, 0.03, p.z);
    tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan.normalize());
    tmpM.compose(tmpPos, tmpQ, tmpS);
    dashes.setMatrixAt(i, tmpM);
  }
  dashes.instanceMatrix.needsUpdate = true;
  group.add(dashes);

  // ============ BARRIERS — Neon magenta light walls with high emissive ============
  const barrierMat = new THREE.MeshStandardMaterial({
    color: '#ff00ff', emissive: '#ff00ff', emissiveIntensity: 1.8,
    metalness: 0.8, roughness: 0.2
  });
  const barrierGeo = new THREE.BoxGeometry(0.15, 1.2, 2);
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
      tmpPos.set(bPos.x, 0.6, bPos.z);
      tmpM.compose(tmpPos, tmpQ, tmpS);
      barriers.setMatrixAt(bIdx++, tmpM);
    }
  }
  barriers.instanceMatrix.needsUpdate = true;
  group.add(barriers);

  // ============ START/FINISH LINE — Cyan/magenta neon checker ============
  const checkerTex = makeCheckerTexture('#00ffff', '#ff00ff');
  const finishMat = new THREE.MeshStandardMaterial({ 
    map: checkerTex, emissive: '#00ffff', emissiveIntensity: 0.6 
  });
  const finish = new THREE.Mesh(new THREE.PlaneGeometry(width, 2), finishMat);
  finish.rotation.x = -Math.PI / 2;
  const startPos = curve.getPoint(0);
  const startTan = curve.getTangent(0);
  finish.position.copy(startPos); finish.position.y = 0.03;
  finish.lookAt(tmpC.copy(startPos).add(startTan));
  finish.rotateX(-Math.PI / 2);
  group.add(finish);

  // ============ GLOWING GRID FLOOR TILES (InstancedMesh — surrounding digital terrain) ============
  const TILE_COUNT = 100;
  const tileGeo = new THREE.PlaneGeometry(4, 4);
  const tileMat = new THREE.MeshBasicMaterial({ 
    color: '#00ffff', transparent: true, opacity: 0.12, side: THREE.DoubleSide 
  });
  const tiles = new THREE.InstancedMesh(tileGeo, tileMat, TILE_COUNT);
  for (let i = 0; i < TILE_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const offset = (Math.random() > 0.5 ? 1 : -1) * (width / 2 + 8 + Math.random() * 35);
    const pos = tmpC.copy(p).addScaledVector(side, offset);
    tmpPos.set(pos.x, -0.01, pos.z);
    tmpQ.setFromEuler(new THREE.Euler(-Math.PI / 2, Math.random() * Math.PI, 0));
    tmpS.set(1, 1, 1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    tiles.setMatrixAt(i, tmpM);
  }
  tiles.instanceMatrix.needsUpdate = true;
  group.add(tiles);

  // ============ DATA TOWERS (InstancedMesh — tall monolithic server structures) ============
  const TOWER_COUNT = 14;
  const towerGeo = new THREE.BoxGeometry(1, 1, 1);
  const towerMat = new THREE.MeshStandardMaterial({ 
    color: '#1a1a2e', emissive: '#00ffff', emissiveIntensity: 0.35,
    metalness: 0.7, roughness: 0.3 
  });
  const towerGlowMat = new THREE.MeshBasicMaterial({
    color: '#00ffff', transparent: true, opacity: 0.4
  });
  const towers = new THREE.InstancedMesh(towerGeo, towerMat, TOWER_COUNT);
  const towerGlows = new THREE.InstancedMesh(towerGeo, towerGlowMat, TOWER_COUNT);
  const lightPositions = [];
  for (let i = 0; i < TOWER_COUNT; i++) {
    const t = (i / TOWER_COUNT) + 0.03;
    const p = curve.getPoint(t % 1);
    const tan = curve.getTangent(t % 1);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = i % 2 === 0 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 20));
    const height = 30 + Math.random() * 40;
    const size = 5 + Math.random() * 5;
    // Tower body
    tmpPos.set(pos.x, height / 2, pos.z);
    tmpQ.identity();
    tmpS.set(size, height, size);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    towers.setMatrixAt(i, tmpM);
    // Glow aura around tower
    tmpS.set(size * 1.3, height * 1.05, size * 1.3);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    towerGlows.setMatrixAt(i, tmpM);
    if (i % 2 === 0) lightPositions.push({ x: pos.x, y: height, z: pos.z });
  }
  towers.castShadow = true;
  towers.instanceMatrix.needsUpdate = true;
  towerGlows.instanceMatrix.needsUpdate = true;
  group.add(towers);
  group.add(towerGlows);

  // ============ HOLOGRAPHIC ADS (InstancedMesh — floating digital billboards by color) ============
  const AD_COUNT = 20;
  const adGeo = new THREE.PlaneGeometry(1, 1);
  const adColors = ['#00ffff', '#ff00ff', '#ffff00', '#00ff88'];
  const adsByColor = new Map();
  for (let i = 0; i < AD_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const offset = (Math.random() > 0.5 ? 1 : -1) * (width / 2 + 12 + Math.random() * 25);
    const pos = tmpC.copy(p).addScaledVector(side, offset);
    const colorIdx = Math.floor(Math.random() * adColors.length);
    const w = 8 + Math.random() * 10;
    const h = 4 + Math.random() * 6;
    const y = 12 + Math.random() * 20;
    if (!adsByColor.has(colorIdx)) adsByColor.set(colorIdx, []);
    adsByColor.get(colorIdx).push({ x: pos.x, y, z: pos.z, w, h, side: side.clone() });
  }
  adsByColor.forEach((ads, colorIdx) => {
    const mat = new THREE.MeshBasicMaterial({ 
      color: adColors[colorIdx], transparent: true, opacity: 0.75, side: THREE.DoubleSide 
    });
    const inst = new THREE.InstancedMesh(adGeo, mat, ads.length);
    for (let i = 0; i < ads.length; i++) {
      const a = ads[i];
      tmpPos.set(a.x, a.y, a.z);
      tmpQ.setFromUnitVectors(new THREE.Vector3(1, 0, 0), a.side);
      tmpS.set(a.w, a.h, 1);
      tmpM.compose(tmpPos, tmpQ, tmpS);
      inst.setMatrixAt(i, tmpM);
    }
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  });

  // ============ LASER GATES (InstancedMesh — checkpoint arches with beams) ============
  const GATE_COUNT = 8;
  const gatePostGeo = new THREE.CylinderGeometry(0.3, 0.3, 1, 8);
  const gatePostMat = new THREE.MeshBasicMaterial({ color: '#ff00ff' });
  const gateBeamGeo = new THREE.BoxGeometry(0.15, 1, 1);
  const gateBeamMat = new THREE.MeshBasicMaterial({ 
    color: '#00ffff', transparent: true, opacity: 0.65 
  });
  const gatePosts = new THREE.InstancedMesh(gatePostGeo, gatePostMat, GATE_COUNT * 2);
  const gateBeams = new THREE.InstancedMesh(gateBeamGeo, gateBeamMat, GATE_COUNT);
  for (let i = 0; i < GATE_COUNT; i++) {
    const t = (i / GATE_COUNT);
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const leftPos = tmpC.copy(p).addScaledVector(side, width / 2 + 1);
    const rightPos = tmpC.copy(p).addScaledVector(side, -(width / 2 + 1));
    // Left post
    tmpPos.set(leftPos.x, 3, leftPos.z);
    tmpQ.identity();
    tmpS.set(1, 6, 1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    gatePosts.setMatrixAt(i * 2, tmpM);
    // Right post
    tmpPos.set(rightPos.x, 3, rightPos.z);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    gatePosts.setMatrixAt(i * 2 + 1, tmpM);
    // Beam across
    tmpPos.set(p.x, 5, p.z);
    tmpQ.setFromUnitVectors(new THREE.Vector3(1, 0, 0), side);
    tmpS.set(width + 3, 0.5, 0.5);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    gateBeams.setMatrixAt(i, tmpM);
  }
  gatePosts.instanceMatrix.needsUpdate = true;
  gateBeams.instanceMatrix.needsUpdate = true;
  group.add(gatePosts);
  group.add(gateBeams);

  // ============ DATA STREAMS (InstancedMesh — flowing light trails in air) ============
  const STREAM_COUNT = 30;
  const streamGeo = new THREE.BoxGeometry(1, 1, 1);
  const streamMat = new THREE.MeshBasicMaterial({ 
    color: '#00ffff', transparent: true, opacity: 0.5 
  });
  const streams = new THREE.InstancedMesh(streamGeo, streamMat, STREAM_COUNT);
  for (let i = 0; i < STREAM_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const offset = (Math.random() > 0.5 ? 1 : -1) * (width / 2 + 3 + Math.random() * 20);
    const pos = tmpC.copy(p).addScaledVector(side, offset);
    const length = 8 + Math.random() * 15;
    tmpPos.set(pos.x, 5 + Math.random() * 15, pos.z);
    tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
    tmpS.set(0.15, 0.15, length);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    streams.setMatrixAt(i, tmpM);
  }
  streams.instanceMatrix.needsUpdate = true;
  group.add(streams);

  // ============ DIGITAL OBSTACLES (InstancedMesh — floating cubes blocking path) ============
  const OBSTACLE_COUNT = 16;
  const obstacleGeo = new THREE.OctahedronGeometry(1, 0);
  const obstacleMat = new THREE.MeshStandardMaterial({
    color: '#ff00ff', emissive: '#ff00ff', emissiveIntensity: 0.8,
    wireframe: true, transparent: true, opacity: 0.7
  });
  const obstacles = new THREE.InstancedMesh(obstacleGeo, obstacleMat, OBSTACLE_COUNT);
  for (let i = 0; i < OBSTACLE_COUNT; i++) {
    const t = (i / OBSTACLE_COUNT) * 0.95 + 0.02;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = i % 2 === 0 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 - 2));
    const size = 1 + Math.random() * 1.5;
    tmpPos.set(pos.x, 1.5 + Math.random() * 2, pos.z);
    tmpQ.setFromEuler(new THREE.Euler(
      Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI
    ));
    tmpS.set(size, size, size);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    obstacles.setMatrixAt(i, tmpM);
  }
  obstacles.instanceMatrix.needsUpdate = true;
  group.add(obstacles);

  // ============ LIGHTING — Near-black ambient with neon accent point lights ============
  const ambient = new THREE.AmbientLight('#0a0a1a', 0.22);
  group.add(ambient);
  
  // No directional sun — only neon point lights at towers (max 8!)
  lightPositions.slice(0, 8).forEach((lp, idx) => {
    const color = idx % 2 === 0 ? '#00ffff' : '#ff00ff';
    const light = new THREE.PointLight(color, 1.8, 48);
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
