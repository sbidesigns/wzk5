// barrel/tracks/track.industrial.js
// "Iron Foundry" — Industrial zone with factories, conveyor belts, smoke stacks, molten metal glow.
// POOLED: containers, smokestacks, cranes, pipes, conveyor belts, furnaces all use InstancedMesh.
// Draw calls: ~26 (road + dashes + barriers + finish + containers + stacks + cranes + pipes + belts + furnaces + lights)

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
  group.name = 'track-industrial';
  const points = entry.spline.points.map(p => new THREE.Vector3(...p));
  const width = entry.spline.width;
  const curve = new THREE.CatmullRomCurve3(points, true);

  // ============ ROAD MESH (single mesh, ~240 segs) — Worn concrete industrial road ============
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
  const roadMat = new THREE.MeshStandardMaterial({ color: '#3d3d3d', roughness: 0.85, metalness: 0.4 });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.receiveShadow = true;
  group.add(road);

  // ============ LANE MARKINGS (InstancedMesh — hazard yellow/orange dashes) ============
  const dashCount = Math.floor(segments / 4);
  const dashGeo = new THREE.BoxGeometry(0.25, 0.02, 1.5);
  const dashMat = new THREE.MeshBasicMaterial({ color: '#ff6b35' });
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

  // ============ BARRIERS — Industrial safety barriers with warning stripe emissive ============
  const barrierMat = new THREE.MeshStandardMaterial({
    color: '#ff6b35', emissive: '#ff6b35', emissiveIntensity: 0.35,
    metalness: 0.5, roughness: 0.5
  });
  const barrierGeo = new THREE.BoxGeometry(0.4, 1.0, 2.5);
  const barrierCount = Math.floor(segments / 2) + 1;
  const barriers = new THREE.InstancedMesh(barrierGeo, barrierMat, barrierCount * 2);
  let bIdx = 0;
  for (let i = 0; i <= segments; i += 2) {
    const t = i / segments;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    for (const sign of [1, -1]) {
      const bPos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 0.35));
      tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan.normalize());
      tmpPos.set(bPos.x, 0.5, bPos.z);
      tmpM.compose(tmpPos, tmpQ, tmpS);
      barriers.setMatrixAt(bIdx++, tmpM);
    }
  }
  barriers.instanceMatrix.needsUpdate = true;
  group.add(barriers);

  // ============ START/FINISH LINE — Industrial orange/black checker ============
  const checkerTex = makeCheckerTexture('#ff6b35', '#2d3436');
  const finishMat = new THREE.MeshStandardMaterial({ map: checkerTex, roughness: 0.5 });
  const finish = new THREE.Mesh(new THREE.PlaneGeometry(width, 2), finishMat);
  finish.rotation.x = -Math.PI / 2;
  const startPos = curve.getPoint(0);
  const startTan = curve.getTangent(0);
  finish.position.copy(startPos); finish.position.y = 0.03;
  finish.lookAt(tmpC.copy(startPos).add(startTan));
  finish.rotateX(-Math.PI / 2);
  group.add(finish);

  // ============ SHIPPING CONTAINERS (InstancedStacked — various colors grouped by material) ============
  const CONTAINER_COUNT = 50;
  const containerGeo = new THREE.BoxGeometry(1, 1, 1);
  const containerColors = ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad'];
  const containerMats = containerColors.map(c => 
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.3 })
  );
  const containersByColor = new Map();
  for (let i = 0; i < CONTAINER_COUNT; i++) {
    const t = Math.random();
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const offset = (Math.random() > 0.5 ? 1 : -1) * (width / 2 + 10 + Math.random() * 40);
    const pos = tmpC.copy(p).addScaledVector(side, offset);
    const colorIdx = Math.floor(Math.random() * containerColors.length);
    const cW = 6 + Math.random() * 4;
    const cH = 2.5 + Math.random() * 1.5;
    const cD = 2.5 + Math.random() * 2;
    if (!containersByColor.has(colorIdx)) containersByColor.set(colorIdx, []);
    containersByColor.get(colorIdx).push({ x: pos.x, z: pos.z, w: cW, h: cH, d: cD });
  }
  containersByColor.forEach((conts, colorIdx) => {
    const inst = new THREE.InstancedMesh(containerGeo, containerMats[colorIdx], conts.length);
    for (let i = 0; i < conts.length; i++) {
      const c = conts[i];
      tmpPos.set(c.x, c.h / 2, c.z);
      tmpQ.identity();
      tmpS.set(c.w, c.h, c.d);
      tmpM.compose(tmpPos, tmpQ, tmpS);
      inst.setMatrixAt(i, tmpM);
    }
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  });

  // ============ SMOKESTACKS (InstancedMesh — tall factory chimneys with emission glow) ============
  const STACK_COUNT = 12;
  const stackGeo = new THREE.CylinderGeometry(1, 1.3, 1, 12);
  const stackMat = new THREE.MeshStandardMaterial({ 
    color: '#4a4a4a', roughness: 0.7, metalness: 0.4 
  });
  const stackTopMat = new THREE.MeshStandardMaterial({
    color: '#ff4500', emissive: '#ff4500', emissiveIntensity: 0.6
  });
  const stacks = new THREE.InstancedMesh(stackGeo, stackMat, STACK_COUNT);
  const stackTops = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.1, 1.1, 0.8, 12), stackTopMat, STACK_COUNT);
  const lightPositions = [];
  for (let i = 0; i < STACK_COUNT; i++) {
    const t = (i / STACK_COUNT) + 0.05;
    const p = curve.getPoint(t % 1);
    const tan = curve.getTangent(t % 1);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = i % 2 === 0 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 25));
    const height = 25 + Math.random() * 20;
    const radius = 2 + Math.random() * 2;
    // Stack body
    tmpPos.set(pos.x, height / 2, pos.z);
    tmpQ.identity();
    tmpS.set(radius, height, radius);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    stacks.setMatrixAt(i, tmpM);
    // Glowing top rim
    tmpPos.set(pos.x, height + 0.4, pos.z);
    tmpS.set(radius * 1.1, 0.8, radius * 1.1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    stackTops.setMatrixAt(i, tmpM);
    lightPositions.push({ x: pos.x, y: height + 2, z: pos.z });
  }
  stacks.castShadow = true;
  stacks.instanceMatrix.needsUpdate = true;
  stackTops.instanceMatrix.needsUpdate = true;
  group.add(stacks);
  group.add(stackTops);

  // ============ CRANES (InstancedMesh — construction cranes along perimeter) ============
  const CRANE_COUNT = 6;
  const craneBaseGeo = new THREE.CylinderGeometry(1.5, 2, 4, 8);
  const craneBaseMat = new THREE.MeshStandardMaterial({ color: '#f1c40f', metalness: 0.6 });
  const craneArmGeo = new THREE.BoxGeometry(1, 1, 1);
  const craneArmMat = new THREE.MeshStandardMaterial({ color: '#f1c40f', metalness: 0.6 });
  const craneBases = new THREE.InstancedMesh(craneBaseGeo, craneBaseMat, CRANE_COUNT);
  const craneArms = new THREE.InstancedMesh(craneArmGeo, craneArmMat, CRANE_COUNT);
  for (let i = 0; i < CRANE_COUNT; i++) {
    const t = 0.1 + (i / CRANE_COUNT) * 0.7;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = i % 2 === 0 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 30));
    // Base
    tmpPos.set(pos.x, 2, pos.z);
    tmpQ.identity();
    tmpS.set(1, 1, 1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    craneBases.setMatrixAt(i, tmpM);
    // Arm
    tmpPos.set(pos.x, 40, pos.z);
    tmpS.set(3, 3, 35);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    craneArms.setMatrixAt(i, tmpM);
  }
  craneBases.castShadow = true;
  craneArms.castShadow = true;
  craneBases.instanceMatrix.needsUpdate = true;
  craneArms.instanceMatrix.needsUpdate = true;
  group.add(craneBases);
  group.add(craneArms);

  // ============ PIPES (InstancedMesh — industrial piping running along ground) ============
  const PIPE_COUNT = 80;
  const pipeGeo = new THREE.CylinderGeometry(0.3, 0.3, 1, 8);
  const pipeMat = new THREE.MeshStandardMaterial({ 
    color: '#7f8c8d', roughness: 0.4, metalness: 0.7 
  });
  const pipes = new THREE.InstancedMesh(pipeGeo, pipeMat, PIPE_COUNT);
  for (let i = 0; i < PIPE_COUNT; i++) {
    const t = i / PIPE_COUNT;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = i % 2 === 0 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 2.5));
    tmpPos.set(pos.x, 0.3, pos.z);
    tmpQ.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.normalize());
    tmpS.set(1, 3, 1);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    pipes.setMatrixAt(i, tmpM);
  }
  pipes.instanceMatrix.needsUpdate = true;
  group.add(pipes);

  // ============ CONVEYOR BELTS (InstancedMesh — elevated transport belts) ============
  const BELT_COUNT = 15;
  const beltGeo = new THREE.BoxGeometry(1, 1, 1);
  const beltMat = new THREE.MeshStandardMaterial({ 
    color: '#2c3e50', roughness: 0.6, metalness: 0.3 
  });
  const beltRollerMat = new THREE.MeshStandardMaterial({
    color: '#95a5a6', metalness: 0.8, roughness: 0.3
  });
  const belts = new THREE.InstancedMesh(beltGeo, beltMat, BELT_COUNT);
  const beltRollers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.3, 1, 8), beltRollerMat, BELT_COUNT * 2);
  let rollerIdx = 0;
  for (let i = 0; i < BELT_COUNT; i++) {
    const t = 0.05 + (i / BELT_COUNT) * 0.85;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = i % 2 === 0 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 5));
    // Belt surface
    tmpPos.set(pos.x, 5, pos.z);
    tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), side);
    tmpS.set(1.5, 0.3, 12);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    belts.setMatrixAt(i, tmpM);
    // End rollers
    const rollerOffset = 5.5;
    for (const rSign of [-1, 1]) {
      const rollerPos = tmpC.copy(pos).addScaledVector(side, rSign * rollerOffset);
      tmpPos.set(rollerPos.x, 4.7, rollerPos.z);
      tmpQ.setFromUnitVectors(new THREE.Vector3(1, 0, 0), side);
      tmpS.set(1, 1.2, 1);
      tmpM.compose(tmpPos, tmpQ, tmpS);
      beltRollers.setMatrixAt(rollerIdx++, tmpM);
    }
  }
  belts.instanceMatrix.needsUpdate = true;
  beltRollers.instanceMatrix.needsUpdate = true;
  group.add(belts);
  group.add(beltRollers);

  // ============ MOLTEN METAL FURNACES (InstancedMesh — glowing foundry equipment) ============
  const FURNACE_COUNT = 10;
  const furnaceBodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const furnaceBodyMat = new THREE.MeshStandardMaterial({ 
    color: '#2c2c2c', roughness: 0.6, metalness: 0.7 
  });
  const furnaceGlowGeo = new THREE.BoxGeometry(1, 1, 1);
  const furnaceGlowMat = new THREE.MeshBasicMaterial({ 
    color: '#ff4500', transparent: true, opacity: 0.9 
  });
  const furnaceBodies = new THREE.InstancedMesh(furnaceBodyGeo, furnaceBodyMat, FURNACE_COUNT);
  const furnaceGlows = new THREE.InstancedMesh(furnaceGlowGeo, furnaceGlowMat, FURNACE_COUNT);
  for (let i = 0; i < FURNACE_COUNT; i++) {
    const t = 0.08 + (i / FURNACE_COUNT) * 0.8;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const sign = i % 2 === 0 ? 1 : -1;
    const pos = tmpC.copy(p).addScaledVector(side, sign * (width / 2 + 8));
    const size = 5 + Math.random() * 4;
    // Body
    tmpPos.set(pos.x, size * 0.55, pos.z);
    tmpQ.identity();
    tmpS.set(size, size * 1.1, size * 0.7);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    furnaceBodies.setMatrixAt(i, tmpM);
    // Glowing opening (molten metal view)
    tmpPos.set(pos.x + (sign > 0 ? size * 0.4 : -size * 0.4), size * 0.5, pos.z);
    tmpS.set(0.3, size * 0.4, size * 0.5);
    tmpM.compose(tmpPos, tmpQ, tmpS);
    furnaceGlows.setMatrixAt(i, tmpM);
    lightPositions.push({ x: pos.x, y: size * 0.5, z: pos.z });
  }
  furnaceBodies.castShadow = true;
  furnaceBodies.instanceMatrix.needsUpdate = true;
  furnaceGlows.instanceMatrix.needsUpdate = true;
  group.add(furnaceBodies);
  group.add(furnaceGlows);

  // ============ LIGHTING — Dim gray ambient with intense orange warning lights ============
  const ambient = new THREE.AmbientLight('#4a4a4a', 0.45);
  group.add(ambient);
  
  const sun = new THREE.DirectionalLight('#ffaa55', 0.5);
  sun.position.set(-60, 80, -40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -150;
  sun.shadow.camera.right = 150;
  sun.shadow.camera.top = 150;
  sun.shadow.camera.bottom = -150;
  group.add(sun);

  // Orange/red warning lights at smokestacks and furnaces (max 8!)
  lightPositions.slice(0, 8).forEach((lp, idx) => {
    const light = new THREE.PointLight('#ff4500', 1.5, 42);
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
