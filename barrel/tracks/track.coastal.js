// barrel/tracks/track.coastal.js
// "Sunset Pier" — Coastal highway with beach, pier, lighthouse, boardwalk.
// POOLED: palm trees, beach umbrellas, pier planks, lighthouse, waves all use InstancedMesh.
// Draw calls: ~24 (road + dashes + barriers + finish + palms + umbrellas + pier + lighthouse + waves + lights)

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
  group.name = 'track-coastal';
  const points = entry.spline.points.map(p => new THREE.Vector3(...p));
  const width = entry.spline.width;
  const curve = new THREE.CatmullRomCurve3(points, true);

  // ============ ROAD MESH (single mesh, ~240 segs) — Coastal asphalt ============
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
  const roadMat = new THREE.MeshStandardMaterial({ color: '#4a4a4a', roughness: 0.85, metalness: 0.05 });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  group.add(road);

  // ============ LANE MARKINGS (InstancedMesh — white dashes) ============
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

  // ============ BARRIERS — Wooden guardrails with nautical style ============
  const barrierMat = new THREE.MeshStandardMaterial({
    color: '#f5deb3', roughness: 0.85
  });
  const barrierGeo = new THREE.BoxGeometry(0.2, 0.9, 1.8);
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
      tmpPos.set(bPos.x, 0.45, bPos.z);
      tmpM.compose(tmpPos, tmpQ, tmpS);
      barriers.setMatrixAt(bIdx++, tmpM);
    }
  }
  barriers.instanceMatrix.needsUpdate = true;
  group.add(barriers);

  // ============ START/FINISH LINE ============
  const checkerTex = makeCheckerTexture('#ffa07a', '#ffffff');
  const finishMat = new THREE.MeshStandardMaterial({ map: checkerTex, roughness: 0.6 });
  const finish = new THREE.Mesh(new THREE.PlaneGeometry(width, 2), finishMat);
  finish.rotation.x = -Math.PI / 2;
  const startPos = curve.getPoint(0);
  const startTan = curve.getTangent(0);
  finish.position.copy(startPos); finish.position.y = 0.03;
  finish.lookAt(tmpC.copy(startPos).add(startTan));
  finish.rotateX(-Math.PI / 2);
  group.add(finish);

  // ============ PALM TREES (InstancedMesh — curved trunk + fronds) ============
  const PALM_COUNT = 40;
  const palmTrunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 1, 8);
  const palmTrunkMat = new THREE.MeshStandardMaterial({ color: '#8b4513', roughness: 0.9 });
  const palmFrondGeo = new THREE.ConeGeometry(1.5, 1.2, 8);
  const palmFrondMat = new THREE.MeshStandardMaterial({ 
    color: '#228b22', roughness: 0.8, flatShading: true 
  });
  const palmTrunks = new THREE.InstancedMesh(palmTrunkGeo, palmTrunkMat, PALM_COUNT);
  const palmFronds = new THREE.InstancedMesh(palmFrondGeo, palmFrondMat, PALM_COUNT);
  const lightPositions = [];
  for (let i = 0; i < PALM_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const offset = (Math.random() > 0.5 ? 1 : -1) * (width / 2 + 5 + Math.random() * 25);
    const pos = tmpC.copy(p).addScaledVector(side, offset);
    const height = 5 + Math.random() * 4;
    const lean = (Math.random() - 0.5) * 0.3;
    // Trunk (slightly curved)
    tmpPos.set(pos.x + lean * height * 0.3, height / 2, pos.z);
    tmpQ.setFromEuler(new THREE.Euler(lean * 0.5, 0, 0));
    tmpS.set(1, height, 1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    palmTrunks.setMatrixAt(i, tmpM);
    // Fronds at top
    tmpPos.set(pos.x + lean * height * 0.5, height + 0.5, pos.z);
    tmpQ.identity();
    tmpS.set(1, 1, 1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    palmFronds.setMatrixAt(i, tmpM);
    if (i % 6 === 0) lightPositions.push({ x: pos.x, y: height + 1, z: pos.z });
  }
  palmTrunks.castShadow = true;
  palmTrunks.instanceMatrix.needsUpdate = true;
  palmFronds.instanceMatrix.needsUpdate = true;
  group.add(palmTrunks);
  group.add(palmFronds);

  // ============ BEACH UMBRELLAS (InstancedColorful — colorful umbrellas on beach) ============
  const UMBRELLA_COUNT = 20;
  const umbrellaPoleGeo = new THREE.CylinderGeometry(0.06, 0.08, 1, 6);
  const umbrellaPoleMat = new THREE.MeshStandardMaterial({ color: '#7f8c8d', metalness: 0.5 });
  const umbrellaTopGeo = new THREE.ConeGeometry(1, 1, 8);
  const umbrellaColors = ['#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#1abc9c'];
  const umbrellaTopsByColor = new Map();
  for (let i = 0; i < UMBRELLA_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = Math.random() > 0.5 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 10 + Math.random() * 15));
    const colorIdx = Math.floor(Math.random() * umbrellaColors.length);
    if (!umbrellaTopsByColor.has(colorIdx)) umbrellaTopsByColor.set(colorIdx, []);
    umbrellaTopsByColor.get(colorIdx).push({ x: pos.x, z: pos.z });
  }
  const umbrellaPoles = new THREE.InstancedMesh(umbrellaPoleGeo, umbrellaPoleMat, UMBRELLA_COUNT);
  let poleIdx = 0;
  umbrellaTopsByColor.forEach((positions, colorIdx) => {
    const mat = new THREE.MeshStandardMaterial({ 
      color: umbrellaColors[colorIdx], roughness: 0.7, side: THREE.DoubleSide 
    });
    const inst = new THREE.InstancedMesh(umbrellaTopGeo, mat, positions.length);
    for (let i = 0; i < positions.length; i++) {
      const up = positions[i];
      // Pole
      tmpPos.set(up.x, 1.75, up.z);
      tmpQ.identity();
      tmpS.set(1, 3.5, 1);
      tmpM.compose(tmpPos, tmpQ, tmpS);
      umbrellaPoles.setMatrixAt(poleIdx++, tmpM);
      // Top
      tmpPos.set(up.x, 3.8, up.z);
      tmpQ.setFromEuler(new THREE.Euler(0, 0, 0));
      tmpS.set(2.2, 1.2, 2.2);
      tmpM.compose(tmpPos, tmpQ, tmpS);
      inst.setMatrixAt(i, tmpM);
    }
    inst.castShadow = true;
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  });
  umbrellaPoles.instanceMatrix.needsUpdate = true;
  group.add(umbrellaPoles);

  // ============ PIER PLANKS (InstancedMesh — wooden pier section) ============
  const PIER_PLANK_COUNT = 80;
  const plankGeo = new THREE.BoxGeometry(1, 1, 1);
  const plankMat = new THREE.MeshStandardMaterial({ 
    color: '#deb887', roughness: 0.9 
  });
  const planks = new THREE.InstancedMesh(plankGeo, plankMat, PIER_PLANK_COUNT);
  for (let i = 0; i < PIER_PLANK_COUNT; i++) {
    const t = 0.35 + (i / PIER_PLANK_COUNT) * 0.25;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = i % 2 === 0 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 3));
    tmpPos.set(pos.x, -0.15, pos.z);
    tmpQ.identity();
    tmpS.set(0.8, 0.08, 4);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    planks.setMatrixAt(i, tmpM);
  }
  planks.receiveShadow = true;
  planks.instanceMatrix.needsUpdate = true;
  group.add(planks);

  // ============ LIGHTHOUSE (Single detailed mesh — landmark at one end) ============
  const lighthouseBaseGeo = new THREE.CylinderGeometry(4, 5, 12, 16);
  const lighthouseBaseMat = new THREE.MeshStandardMaterial({ 
    color: '#ffffff', roughness: 0.7 
  });
  const lighthouseMidGeo = new THREE.CylinderGeometry(3, 4, 10, 16);
  const lighthouseMidMat = new THREE.MeshStandardMaterial({ 
    color: '#e74c3c', roughness: 0.65 
  });
  const lighthouseTopGeo = new THREE.ConeGeometry(3.5, 5, 16);
  const lighthouseTopMat = new THREE.MeshStandardMaterial({ 
    color: '#2c3e50', roughness: 0.5 
  });
  const lighthouseLightGeo = new THREE.SphereGeometry(1.2, 16, 16);
  const lighthouseLightMat = new THREE.MeshBasicMaterial({ 
    color: '#ffff00', emissive: '#ffff00', emissiveIntensity: 2 
  });

  const lhPos = curve.getPoint(0.85);
  const lhSide = new THREE.Vector3().subVectors(
    curve.getPoint(0.86),
    curve.getPoint(0.84)
  ).normalize();
  const lhOffset = lhSide.cross(new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(width / 2 + 18);
  const lhPosition = lhPos.clone().add(lhOffset);

  const lighthouseBase = new THREE.Mesh(lighthouseBaseGeo, lighthouseBaseMat);
  lighthouseBase.position.set(lhPosition.x, 6, lhPosition.z);
  lighthouseBase.castShadow = true;

  const lighthouseMid = new THREE.Mesh(lighthouseMidGeo, lighthouseMidMat);
  lighthouseMid.position.set(lhPosition.x, 17, lhPosition.z);
  lighthouseMid.castShadow = true;

  const lighthouseTop = new THREE.Mesh(lighthouseTopGeo, lighthouseTopMat);
  lighthouseTop.position.set(lhPosition.x, 24.5, lhPosition.z);
  lighthouseTop.castShadow = true;

  const lighthouseLight = new THREE.Mesh(lighthouseLightGeo, lighthouseLightMat);
  lighthouseLight.position.set(lhPosition.x, 27, lhPosition.z);

  group.add(lighthouseBase);
  group.add(lighthouseMid);
  group.add(lighthouseTop);
  group.add(lighthouseLight);
  
  lightPositions.push({ x: lhPosition.x, y: 27, z: lhPosition.z });

  // ============ OCEAN WAVES (InstancedMesh — animated-looking wave strips) ============
  const WAVE_COUNT = 30;
  const waveGeo = new THREE.PlaneGeometry(1, 1);
  const waveMat = new THREE.MeshStandardMaterial({ 
    color: '#87ceeb', transparent: true, opacity: 0.45, 
    roughness: 0.1, metalness: 0.3, side: THREE.DoubleSide 
  });
  const waves = new THREE.InstancedMesh(waveGeo, waveMat, WAVE_COUNT);
  for (let i = 0; i < WAVE_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = Math.random() > 0.5 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 25 + Math.random() * 30));
    tmpPos.set(pos.x, 0.1, pos.z);
    tmpQ.setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.1, Math.random() * Math.PI, 0));
    tmpS.set(8 + Math.random() * 12, 1, 3 + Math.random() * 4);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    waves.setMatrixAt(i, tmpM);
  }
  waves.instanceMatrix.needsUpdate = true;
  group.add(waves);

  // ============ BEACH SAND PATCHES (InstancedMesh — sandy areas) ============
  const SAND_PATCH_COUNT = 25;
  const sandPatchGeo = new THREE.CircleGeometry(1, 16);
  const sandPatchMat = new THREE.MeshStandardMaterial({ 
    color: '#f4a460', roughness: 1.0 
  });
  const sandPatches = new THREE.InstancedMesh(sandPatchGeo, sandPatchMat, SAND_PATCH_COUNT);
  for (let i = 0; i < SAND_PATCH_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = Math.random() > 0.5 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 8 + Math.random() * 12));
    tmpPos.set(pos.x, -0.01, pos.z);
    tmpQ.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.random() * Math.PI));
    tmpS.set(5 + Math.random() * 8, 1, 5 + Math.random() * 8);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    sandPatches.setMatrixAt(i, tmpM);
  }
  sandPatches.receiveShadow = true;
  sandPatches.instanceMatrix.needsUpdate = true;
  group.add(sandPatches);

  // ============ LIGHTING — Golden hour sunset colors ============
  const ambient = new THREE.AmbientLight('#ffa07a', 0.55);
  group.add(ambient);
  
  // Warm sunset sun
  const sunsetSun = new THREE.DirectionalLight('#ff7f50', 1.0);
  sunsetSun.position.set(100, 30, -80);
  sunsetSun.castShadow = true;
  sunsetSun.shadow.mapSize.set(2048, 2048);
  sunsetSun.shadow.camera.left = -150;
  sunsetSun.shadow.camera.right = 150;
  sunsetSun.shadow.camera.top = 150;
  sunsetSun.shadow.camera.bottom = -150;
  group.add(sunsetSun);

  // Fill light from sky (cooler blue)
  const skyFill = new THREE.DirectionalLight('#87ceeb', 0.3);
  skyFill.position.set(-50, 100, 50);
  group.add(skyFill);

  // Strategic warm lights (lighthouse, key points)
  lightPositions.slice(0, 8).forEach((lp, idx) => {
    const intensity = idx === 0 ? 2.5 : 0.6;
    const distance = idx === 0 ? 60 : 25;
    const light = new THREE.PointLight('#ffaa00', intensity, distance);
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
