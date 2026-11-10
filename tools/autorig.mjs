// Auto-rig a generated humanoid mesh using an already-rigged character as a template.
//   node autorig.mjs <template_rigged.glb> <template_mesh.glb> <target_mesh.glb> <out.glb>
// 1. Skeleton fitting: template joints are re-placed on the target using
//    geometric landmarks (height, crotch, hand tips, arm axes, limb slab centroids).
// 2. Skinning: each vertex is seeded with its nearest *visible* bone (the
//    bone-heat visibility idea), labels spread geodesically over the surface
//    to vertices that see no bone (hair, accessories), then weights are
//    Laplacian-smoothed across the welded mesh and reduced to 4 influences.
// All meshes must be Y-up, facing +Z, feet at y=0, in an A/T pose.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const [tplRigPath, tplMeshPath, tgtPath, outPath, ...flags] = process.argv.slice(2);
const SMOOTH_ITERS = parseInt((flags.find(f => f.startsWith('--smooth=')) || '--smooth=18').split('=')[1], 10);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// ---------- helpers ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(a[0], a[1], a[2]);
const nrm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function meshData(doc) {
  const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  return { prim, pos: prim.getAttribute('POSITION').getArray(), nor: prim.getAttribute('NORMAL').getArray(), idx: prim.getIndices().getArray() };
}

// ---------- landmarks ----------
function landmarks(pos) {
  const n = pos.length / 3;
  let H = 0, maxX = 0, minX = 0;
  for (let i = 0; i < n; i++) { H = Math.max(H, pos[i * 3 + 1]); maxX = Math.max(maxX, pos[i * 3]); minX = Math.min(minX, pos[i * 3]); }
  const centroid = pred => {
    let c = [0, 0, 0], k = 0;
    for (let i = 0; i < n; i++) { const p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]; if (pred(p)) { c = add(c, p); k++; } }
    return k ? mul(c, 1 / k) : null;
  };
  const L = { H };
  // hand tips (left = +X)
  L.tipL = centroid(p => p[0] > maxX - 0.02);
  L.tipR = centroid(p => p[0] < minX + 0.02);
  // arm axes from two x-slabs that contain only arm
  const armPt = (side, f) => centroid(p => side * p[0] > f * side * (side > 0 ? maxX : minX) - 0.015 && side * p[0] < f * side * (side > 0 ? maxX : minX) + 0.015 && p[1] > 0.45 * H);
  for (const [s, key] of [[1, 'L'], [-1, 'R']]) {
    const a = armPt(s, 0.62), b = armPt(s, 0.86);
    L['armDir' + key] = nrm(sub(b, a));   // points from shoulder toward hand
    L['armRef' + key] = b;
  }
  // crotch: highest y where the legs are still separate (back half only, to ignore sashes)
  let crotch = 0.45 * H;
  for (let y = 0.25 * H; y < 0.62 * H; y += 0.005) {
    let minPos = Infinity, maxNeg = -Infinity;
    for (let i = 0; i < n; i++) {
      const py = pos[i * 3 + 1];
      if (py < y - 0.006 || py > y + 0.006 || pos[i * 3 + 2] > 0) continue;
      const x = pos[i * 3];
      if (Math.abs(x) > 0.3 * Math.max(maxX, -minX)) continue;
      if (x > 0) minPos = Math.min(minPos, x); else maxNeg = Math.max(maxNeg, x);
    }
    if (minPos - maxNeg < 0.012) { crotch = y; break; }
  }
  L.crotch = crotch;
  const limit = 0.5 * Math.max(maxX, -minX);
  L.legSlab = (side, y) => centroid(p => Math.abs(p[1] - y) < 0.02 && side * p[0] > 0.005 && Math.abs(p[0]) < limit);
  L.armSlab = (side, j) => centroid(p => Math.abs(p[0] - j[0]) < 0.025 && Math.abs(p[1] - j[1]) < 0.09 && side * p[0] > 0.6 * side * j[0]);
  L.torsoSlab = y => centroid(p => Math.abs(p[1] - y) < 0.025 && Math.abs(p[0]) < 0.11);
  return L;
}

// ---------- read template ----------
const tplRig = await io.read(tplRigPath);
const skinT = tplRig.getRoot().listSkins()[0];
const jointsT = skinT.listJoints();
const names = jointsT.map(j => j.getName());
const JT = {};   // name -> world pos
for (const j of jointsT) { const m = j.getWorldMatrix(); JT[j.getName()] = [m[12], m[13], m[14]]; }
const parentOf = {};
for (const j of jointsT) for (const c of j.listChildren()) if (names.includes(c.getName())) parentOf[c.getName()] = j.getName();
const LT = landmarks(meshData(await io.read(tplMeshPath)).pos);

// ---------- read target ----------
const doc = await io.read(tgtPath);
const { prim, pos, nor, idx } = meshData(doc);
const LS = landmarks(pos);
const k = LS.H / LT.H;
console.log('template H', LT.H.toFixed(3), 'crotch', LT.crotch.toFixed(3), '| target H', LS.H.toFixed(3), 'crotch', LS.crotch.toFixed(3), 'scale', k.toFixed(3));

// ---------- fit joints ----------
const J = {};
const torsoRefT = LT.torsoSlab(LT.crotch + 0.6 * (LT.H - LT.crotch) * 0.6) || [0, 0, 0];
const torsoRefS = LS.torsoSlab(LS.crotch + 0.6 * (LS.H - LS.crotch) * 0.6) || [0, 0, 0];
const mapY = y => (y >= LT.crotch
  ? LS.crotch + (y - LT.crotch) * (LS.H - LS.crotch) / (LT.H - LT.crotch)
  : y * LS.crotch / LT.crotch);
for (const nme of ['Hips', 'Spine02', 'Spine01', 'Spine', 'neck', 'Head', 'head_end', 'headfront']) {
  const p = JT[nme];
  J[nme] = [p[0] * k, mapY(p[1]), torsoRefS[2] + (p[2] - torsoRefT[2]) * k];
}
for (const [side, key, pre] of [[1, 'L', 'Left'], [-1, 'R', 'Right']]) {
  // arm chain: place along the target arm axis at template distances from the hand tip
  const tipT = LT['tip' + key], dirT = LT['armDir' + key], tipS = LS['tip' + key], dirS = LS['armDir' + key];
  const upT = nrm(sub([0, 1, 0], mul(dirT, dot([0, 1, 0], dirT)))), upS = nrm(sub([0, 1, 0], mul(dirS, dot([0, 1, 0], dirS))));
  const fwd = [0, 0, 1];
  for (const b of ['Arm', 'ForeArm', 'Hand']) {
    const rel = sub(JT[pre + b], tipT);
    const along = dot(rel, dirT), up = dot(rel, upT), fw = dot(rel, fwd);
    J[pre + b] = add(tipS, add(mul(dirS, along * k), add(mul(upS, up * k), mul(fwd, fw * k))));
  }
  // depth (z): the arm axis estimate is unreliable front-to-back, so re-centre each joint in the limb's cross-section
  const armZ = (j, jt) => {
    const cS = LS.armSlab(side, j), cT = LT.armSlab(side, jt);
    return cS && cT ? cS[2] + (jt[2] - cT[2]) * k : null;
  };
  for (const b of ['ForeArm', 'Hand']) { const z = armZ(J[pre + b], JT[pre + b]); if (z !== null) J[pre + b][2] = z; }
  J[pre + 'Arm'][2] = torsoRefS[2] + (JT[pre + 'Arm'][2] - torsoRefT[2]) * k;
  // clavicle: same relative spot between upper spine and shoulder joint
  const tT = JT[pre + 'Shoulder'], a = JT.Spine, bT = JT[pre + 'Arm'];
  const f = Math.max(0, Math.min(1, dot(sub(tT, a), sub(bT, a)) / dot(sub(bT, a), sub(bT, a))));
  J[pre + 'Shoulder'] = lerp(J.Spine, J[pre + 'Arm'], f);
  J[pre + 'Shoulder'][1] += (tT[1] - lerp(a, bT, f)[1]) * k;
  // leg chain: slab centroids keep the bones centred in the limb
  const hipT = JT[pre + 'UpLeg'];
  const hipY = mapY(hipT[1]);
  const hipC = LS.legSlab(side, Math.min(hipY, LS.crotch - 0.03)) || [hipT[0] * k, hipY, 0];
  J[pre + 'UpLeg'] = [hipC[0], hipY, torsoRefS[2] + (hipT[2] - torsoRefT[2]) * k];
  for (const b of ['Leg', 'Foot']) {
    const y = mapY(JT[pre + b][1]);
    const c = LS.legSlab(side, y), cT = LT.legSlab(side, JT[pre + b][1]);
    J[pre + b] = c ? [c[0] + (JT[pre + b][0] - cT[0]) * k, y, c[2] + (JT[pre + b][2] - cT[2]) * k] : mul(JT[pre + b], k);
  }
  J[pre + 'ToeBase'] = add(J[pre + 'Foot'], mul(sub(JT[pre + 'ToeBase'], JT[pre + 'Foot']), k));
}
for (const nme of names) if (!J[nme]) { console.log('unfitted joint, scaling:', nme); J[nme] = mul(JT[nme], k); }

// ---------- bone segments ----------
const segs = [];   // { joint, a, b }
const childrenOf = {};
for (const [c, p] of Object.entries(parentOf)) (childrenOf[p] = childrenOf[p] || []).push(c);
for (const nme of names) {
  const ch = (childrenOf[nme] || []).filter(c => !/headfront/.test(c));
  if (nme === 'Hips') { segs.push({ joint: nme, a: J.Hips, b: J.Spine02 }); segs.push({ joint: nme, a: J.LeftUpLeg, b: J.RightUpLeg }); continue; }
  if (nme === 'Spine') { segs.push({ joint: nme, a: J.Spine, b: J.neck }); continue; }
  if (/Hand$/.test(nme)) { segs.push({ joint: nme, a: J[nme], b: LS['tip' + (nme.startsWith('Left') ? 'L' : 'R')] }); continue; }
  if (/ToeBase$/.test(nme)) { segs.push({ joint: nme, a: J[nme], b: add(J[nme], [0, 0, 0.09 * k]) }); continue; }
  if (nme === 'head_end' || nme === 'headfront') continue;
  for (const c of ch) segs.push({ joint: nme, a: J[nme], b: J[c] });
}
const jointIndex = Object.fromEntries(names.map((n, i) => [n, i]));

// ---------- weld + adjacency ----------
const nV = pos.length / 3;
const weldKey = new Map(), wid = new Int32Array(nV); let nW = 0;
for (let i = 0; i < nV; i++) {
  const key = Math.round(pos[i * 3] * 2e4) + ',' + Math.round(pos[i * 3 + 1] * 2e4) + ',' + Math.round(pos[i * 3 + 2] * 2e4);
  let w = weldKey.get(key); if (w === undefined) { w = nW++; weldKey.set(key, w); } wid[i] = w;
}
const wPos = new Float64Array(nW * 3), wNor = new Float64Array(nW * 3);
for (let i = 0; i < nV; i++) for (let c = 0; c < 3; c++) { wPos[wid[i] * 3 + c] = pos[i * 3 + c]; wNor[wid[i] * 3 + c] += nor[i * 3 + c]; }
const adj = Array.from({ length: nW }, () => new Set());
for (let t = 0; t < idx.length; t += 3) {
  const a = wid[idx[t]], b = wid[idx[t + 1]], c = wid[idx[t + 2]];
  if (a !== b) { adj[a].add(b); adj[b].add(a); } if (b !== c) { adj[b].add(c); adj[c].add(b); } if (a !== c) { adj[a].add(c); adj[c].add(a); }
}

// ---------- triangle grid for visibility rays ----------
const CELL = 0.05;
const cellKey = (x, y, z) => (Math.floor(x / CELL) + 512) + (Math.floor(y / CELL) + 512) * 1024 + (Math.floor(z / CELL) + 512) * 1048576;
const grid = new Map();
const nT = idx.length / 3;
for (let t = 0; t < nT; t++) {
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < 3; v++) for (let c = 0; c < 3; c++) { const val = pos[idx[t * 3 + v] * 3 + c]; mn[c] = Math.min(mn[c], val); mx[c] = Math.max(mx[c], val); }
  for (let x = Math.floor(mn[0] / CELL); x <= Math.floor(mx[0] / CELL); x++)
    for (let y = Math.floor(mn[1] / CELL); y <= Math.floor(mx[1] / CELL); y++)
      for (let z = Math.floor(mn[2] / CELL); z <= Math.floor(mx[2] / CELL); z++) {
        const key = (x + 512) + (y + 512) * 1024 + (z + 512) * 1048576;
        let arr = grid.get(key); if (!arr) grid.set(key, arr = []); arr.push(t);
      }
}
const stamp = new Int32Array(nT); let stampId = 0;
function blocked(o, e) {   // does segment o->e cross the surface?
  stampId++;
  const d = sub(e, o), L = len(d); if (L < 1e-6) return false;
  const steps = Math.ceil(L / (CELL * 0.5));
  for (let s = 0; s <= steps; s++) {
    const p = add(o, mul(d, s / steps));
    const arr = grid.get(cellKey(p[0], p[1], p[2])); if (!arr) continue;
    for (const t of arr) {
      if (stamp[t] === stampId) continue; stamp[t] = stampId;
      const i0 = idx[t * 3] * 3, i1 = idx[t * 3 + 1] * 3, i2 = idx[t * 3 + 2] * 3;
      const e1 = [pos[i1] - pos[i0], pos[i1 + 1] - pos[i0 + 1], pos[i1 + 2] - pos[i0 + 2]];
      const e2 = [pos[i2] - pos[i0], pos[i2 + 1] - pos[i0 + 1], pos[i2 + 2] - pos[i0 + 2]];
      const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
      const a = dot(e1, h); if (Math.abs(a) < 1e-12) continue;
      const f = 1 / a, sv = [o[0] - pos[i0], o[1] - pos[i0 + 1], o[2] - pos[i0 + 2]];
      const u = f * dot(sv, h); if (u < 0 || u > 1) continue;
      const q = [sv[1] * e1[2] - sv[2] * e1[1], sv[2] * e1[0] - sv[0] * e1[2], sv[0] * e1[1] - sv[1] * e1[0]];
      const v = f * dot(d, q); if (v < 0 || u + v > 1) continue;
      const tt = f * dot(e2, q);
      if (tt > 0.02 && tt < 0.98) return true;
    }
  }
  return false;
}
function closestOnSeg(p, s) {
  const ab = sub(s.b, s.a), t = Math.max(0, Math.min(1, dot(sub(p, s.a), ab) / (dot(ab, ab) || 1)));
  return add(s.a, mul(ab, t));
}

// ---------- seeds: nearest visible bone ----------
const label = new Int32Array(nW).fill(-1);
let seeded = 0;
console.time('visibility');
for (let w = 0; w < nW; w++) {
  const p = [wPos[w * 3], wPos[w * 3 + 1], wPos[w * 3 + 2]];
  const n = nrm([wNor[w * 3], wNor[w * 3 + 1], wNor[w * 3 + 2]]);
  const o = sub(p, mul(n, 0.003));   // start just under the surface
  const cand = segs.map((s, i) => { const c = closestOnSeg(p, s); return { i, c, d: len(sub(p, c)) }; }).sort((a, b) => a.d - b.d).slice(0, 3);
  for (const c of cand) {
    if (c.d > 0.45) break;
    if (!blocked(o, c.c)) { label[w] = jointIndex[segs[c.i].joint]; seeded++; break; }
  }
}
console.timeEnd('visibility');
console.log('seeded', seeded, 'of', nW, 'welded vertices');

// ---------- geodesic label propagation (multi-source Dijkstra) ----------
{
  const dist = new Float64Array(nW).fill(Infinity);
  // simple binary heap
  const heap = [];
  const push = (d, v) => { heap.push([d, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = i * 2 + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  for (let w = 0; w < nW; w++) if (label[w] >= 0) { dist[w] = 0; push(0, w); }
  while (heap.length) {
    const [d, v] = pop(); if (d > dist[v]) continue;
    for (const u of adj[v]) {
      const nd = d + Math.hypot(wPos[u * 3] - wPos[v * 3], wPos[u * 3 + 1] - wPos[v * 3 + 1], wPos[u * 3 + 2] - wPos[v * 3 + 2]);
      if (nd < dist[u]) { dist[u] = nd; label[u] = label[v]; push(nd, u); }
    }
  }
  let orphan = 0;
  for (let w = 0; w < nW; w++) if (label[w] < 0) { label[w] = jointIndex.Hips; orphan++; }
  if (orphan) console.log('orphan vertices bound to Hips:', orphan);
}

// ---------- smooth weights ----------
const nJ = names.length;
let W = new Float32Array(nW * nJ);
for (let w = 0; w < nW; w++) W[w * nJ + label[w]] = 1;
for (let it = 0; it < SMOOTH_ITERS; it++) {
  const N = new Float32Array(nW * nJ);
  for (let w = 0; w < nW; w++) {
    const nb = adj[w], inv = 0.5 / (nb.size || 1);
    for (let j = 0; j < nJ; j++) N[w * nJ + j] = 0.5 * W[w * nJ + j];
    for (const u of nb) for (let j = 0; j < nJ; j++) N[w * nJ + j] += inv * W[u * nJ + j];
  }
  W = N;
}

// ---------- write skin ----------
const jointsArr = new Uint16Array(nV * 4), weightsArr = new Float32Array(nV * 4);
for (let i = 0; i < nV; i++) {
  const w = wid[i];
  const top = [];
  for (let j = 0; j < nJ; j++) { const v = W[w * nJ + j]; if (v > 0.01) top.push([v, j]); }
  top.sort((a, b) => b[0] - a[0]); top.length = Math.min(top.length, 4);
  const s = top.reduce((a, b) => a + b[0], 0) || 1;
  for (let q = 0; q < 4; q++) { jointsArr[i * 4 + q] = top[q] ? top[q][1] : 0; weightsArr[i * 4 + q] = top[q] ? top[q][0] / s : 0; }
}
const buffer = doc.getRoot().listBuffers()[0];
prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(jointsArr).setBuffer(buffer));
prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(weightsArr).setBuffer(buffer));

const scene = doc.getRoot().listScenes()[0];
const nodes = {};
for (const nme of names) nodes[nme] = doc.createNode(nme);
const armature = doc.createNode('Armature');
for (const nme of names) {
  const p = parentOf[nme];
  nodes[nme].setTranslation(p ? sub(J[nme], J[p]) : J[nme]);
  (p ? nodes[p] : armature).addChild(nodes[nme]);
}
scene.addChild(armature);
const ibm = new Float32Array(nJ * 16);
names.forEach((nme, i) => { ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -J[nme][0], -J[nme][1], -J[nme][2], 1], i * 16); });
const skin = doc.createSkin('skin').setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buffer)).setSkeleton(nodes.Hips);
for (const nme of names) skin.addJoint(nodes[nme]);
const meshNode = doc.getRoot().listNodes().find(n => n.getMesh());
meshNode.setSkin(skin);
await io.write(outPath, doc);
console.log('wrote', outPath, '| joints', nJ, '| e.g. LeftArm', J.LeftArm.map(n => n.toFixed(3)), 'LeftHand', J.LeftHand.map(n => n.toFixed(3)), 'LeftLeg', J.LeftLeg.map(n => n.toFixed(3)));
