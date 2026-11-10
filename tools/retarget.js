// Animation retargeting: bakes clips authored for one humanoid skeleton onto
// another with different bone names, proportions and rest pose.
//
// Method: world-space rotation deltas with rest-pose alignment.
//   target_world(t) = delta_source(t) * align * target_rest_world
// where delta_source(t) = source_world(t) * inverse(source_rest_world) and
// `align` rotates the target bone's rest direction onto the source bone's rest
// direction (so an A-pose rig and a T-pose rig agree on what "rest" means).
import * as THREE from 'three';

// Canonical humanoid slots -> name patterns (lower-cased, punctuation removed).
const SLOT_PATTERNS = {
  hips: [/^hips?$/, /^pelvis$/],
  // spine/chest are resolved by hierarchy depth in mapSkeleton()
  neck: [/^neck$/, /^neck0?1$/],
  head: [/^head$/],
  shoulderL: [/^leftshoulder$/, /^shoulderl$/, /^claviclel$/],
  upperArmL: [/^leftarm$/, /^upperarml$/, /^leftupperarm$/],
  lowerArmL: [/^leftforearm$/, /^lowerarml$/, /^leftlowerarm$/],
  handL: [/^lefthand$/, /^wristl$/, /^handl$/],
  shoulderR: [/^rightshoulder$/, /^shoulderr$/, /^clavicler$/],
  upperArmR: [/^rightarm$/, /^upperarmr$/, /^rightupperarm$/],
  lowerArmR: [/^rightforearm$/, /^lowerarmr$/, /^rightlowerarm$/],
  handR: [/^righthand$/, /^wristr$/, /^handr$/],
  upperLegL: [/^leftupleg$/, /^upperlegl$/, /^leftupperleg$/, /^thighl$/],
  lowerLegL: [/^leftleg$/, /^lowerlegl$/, /^leftlowerleg$/, /^calfl$/],
  footL: [/^leftfoot$/, /^footl$/],
  toesL: [/^lefttoebase$/, /^toesl$/, /^lefttoes$/, /^balll$/],
  upperLegR: [/^rightupleg$/, /^upperlegr$/, /^rightupperleg$/, /^thighr$/],
  lowerLegR: [/^rightleg$/, /^lowerlegr$/, /^rightlowerleg$/, /^calfr$/],
  footR: [/^rightfoot$/, /^footr$/],
  toesR: [/^righttoebase$/, /^toesr$/, /^righttoes$/, /^ballr$/],
};

// Which slot each slot's bone "points at" (to define its direction at rest).
const SLOT_CHILD = {
  hips: null, spine: 'chest', chest: 'head', neck: 'head', head: null,
  shoulderL: 'upperArmL', upperArmL: 'lowerArmL', lowerArmL: 'handL', handL: null,
  shoulderR: 'upperArmR', upperArmR: 'lowerArmR', lowerArmR: 'handR', handR: null,
  upperLegL: 'lowerLegL', lowerLegL: 'footL', footL: 'toesL', toesL: null,
  upperLegR: 'lowerLegR', lowerLegR: 'footR', footR: 'toesR', toesR: null,
};
// Leaf slots inherit their alignment from this slot.
const SLOT_ALIGN_FROM = { handL: 'lowerArmL', handR: 'lowerArmR', toesL: 'footL', toesR: 'footR' };

const norm = n => n.toLowerCase().replace(/^mixamorig:?/, '').replace(/[^a-z0-9]/g, '');

export function listBones(root) {
  const bones = [];
  root.traverse(o => { if (o.isBone) bones.push(o); });
  return bones;
}

export function mapSkeleton(root) {
  const bones = listBones(root);
  const slots = {};
  for (const [slot, pats] of Object.entries(SLOT_PATTERNS)) {
    for (const pat of pats) {
      const hit = bones.find(b => pat.test(norm(b.name)) && !Object.values(slots).includes(b));
      if (hit) { slots[slot] = hit; break; }
    }
  }
  // spine chain: shallowest spine-like bone = spine, deepest = chest
  const depth = b => { let d = 0; for (let p = b.parent; p; p = p.parent) d++; return d; };
  const chain = bones.filter(b => /^(spine\d*|chest|upperchest)$/.test(norm(b.name))).sort((a, b) => depth(a) - depth(b));
  if (chain.length) slots.spine = chain[0];
  if (chain.length > 1) slots.chest = chain[chain.length - 1];
  return slots;
}

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const worldQ = (o, q = new THREE.Quaternion()) => o.getWorldQuaternion(q);
const worldP = (o, v = new THREE.Vector3()) => o.getWorldPosition(v);

function restInfo(root, slots) {
  root.updateMatrixWorld(true);
  const info = {};
  for (const [slot, bone] of Object.entries(slots)) {
    const childSlot = SLOT_CHILD[slot];
    const child = childSlot && slots[childSlot];
    let dir = null;
    if (child) dir = worldP(child).sub(worldP(bone)).normalize();
    info[slot] = { q: worldQ(bone), p: worldP(bone), dir, local: bone.quaternion.clone(), pos: bone.position.clone() };
  }
  return info;
}

/**
 * Build a retargeter between a source rig (with clips) and a target rig.
 * Both roots must be at identity world transform while baking.
 */
export function createRetargeter(srcRoot, tgtRoot, opts = {}) {
  const src = mapSkeleton(srcRoot);
  const tgt = mapSkeleton(tgtRoot);
  const srcMixer = new THREE.AnimationMixer(srcRoot);
  if (opts.restClip) {   // pose the source in its reference pose before measuring
    const a = srcMixer.clipAction(opts.restClip);
    a.play(); srcMixer.setTime(0); srcRoot.updateMatrixWorld(true);
    a.stop(); // transforms stay as posed until the next mixer update
    srcMixer.uncacheAction(opts.restClip);
  }
  const srcRest = restInfo(srcRoot, src);
  const tgtRest = restInfo(tgtRoot, tgt);

  // Facing: forward = up x (rightHip - leftHip). Y rotates source space into target space.
  const fwd = rest => _v1.copy(rest.upperLegR.p).sub(rest.upperLegL.p).setY(0).normalize().clone().applyAxisAngle(UP, 0) && new THREE.Vector3().crossVectors(UP, _v1);
  const fs = fwd(srcRest), ft = fwd(tgtRest);
  const yaw = Math.atan2(ft.x, ft.z) - Math.atan2(fs.x, fs.z);
  const Y = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  const Yi = Y.clone().invert();
  const slotsUsed = Object.keys(tgt).filter(s => src[s]);

  // alignment per slot (world space)
  const align = {};
  for (const slot of slotsUsed) {
    const a = new THREE.Quaternion();
    const ds = srcRest[slot].dir, dt = tgtRest[slot].dir;
    if (ds && dt) a.setFromUnitVectors(dt, ds.clone().applyQuaternion(Y));
    align[slot] = a;
  }
  for (const [leaf, from] of Object.entries(SLOT_ALIGN_FROM)) {
    if (align[leaf] && align[from]) align[leaf].copy(align[from]);
  }

  // hips scale (leg length ratio) for translation
  const legLen = (rest) => {
    if (!rest.upperLegL || !rest.footL) return 1;
    return rest.upperLegL.p.y - rest.footL.p.y || 1;
  };
  const hipScale = legLen(tgtRest) / legLen(srcRest);

  // target bones in hierarchy order (parents first) for world->local conversion
  const tgtBones = listBones(tgtRoot);
  const tgtSlotOf = new Map();
  for (const slot of slotsUsed) tgtSlotOf.set(tgt[slot], slot);

  function bake(clip, { fps = 30, name = clip.name, rootMotion = 'vertical', trimStart = 0, trimEnd = clip.duration, turn = 0 } = {}) {
    // `turn` yaws the whole character about its origin (e.g. to angle a stance toward the camera)
    const T = new THREE.Quaternion().setFromAxisAngle(UP, turn);
    const duration = Math.max(1e-3, trimEnd - trimStart);
    const frames = Math.max(2, Math.round(duration * fps) + 1);
    const times = new Float32Array(frames);
    const qVals = new Map(); // bone -> Float32Array
    for (const b of tgtBones) qVals.set(b, new Float32Array(frames * 4));
    const hipVals = new Float32Array(frames * 3);

    const action = srcMixer.clipAction(clip);
    action.reset().play();
    const computedWorld = new Map();
    const q = new THREE.Quaternion(), d = new THREE.Quaternion(), pw = new THREE.Quaternion();

    for (let f = 0; f < frames; f++) {
      const t = trimStart + (f / (frames - 1)) * duration;
      times[f] = t - trimStart;
      srcMixer.setTime(Math.min(t, clip.duration - 1e-4));
      srcRoot.updateMatrixWorld(true);
      computedWorld.clear();

      for (const b of tgtBones) {
        const slot = tgtSlotOf.get(b);
        const parentW = b.parent && computedWorld.get(b.parent);
        if (parentW) pw.copy(parentW); else if (b.parent) worldQ(b.parent, pw); else pw.identity();
        let w;
        if (slot) {
          // delta of source bone from its rest, in world space
          worldQ(src[slot], q);
          d.copy(q).multiply(_qi(srcRest[slot].q));
          d.premultiply(Y).multiply(Yi);   // express the delta in target space
          w = d.clone().multiply(align[slot]).multiply(tgtRest[slot].q).premultiply(T);
        } else {
          // unmapped bone keeps its rest local rotation
          w = pw.clone().multiply(b.quaternion);
        }
        computedWorld.set(b, w);
        const local = _qi(pw).multiply(w);
        const arr = qVals.get(b);
        arr[f * 4] = local.x; arr[f * 4 + 1] = local.y; arr[f * 4 + 2] = local.z; arr[f * 4 + 3] = local.w;
      }

      // hips translation: source delta from rest, scaled to target proportions
      if (src.hips && tgt.hips) {
        worldP(src.hips, _v1).sub(srcRest.hips.p).multiplyScalar(hipScale).applyQuaternion(Y);
        if (rootMotion === 'vertical') { _v1.x = 0; _v1.z = 0; }
        else if (rootMotion === 'none') _v1.set(0, 0, 0);
        // convert world delta into the hips' parent space
        const parent = tgt.hips.parent;
        _v2.copy(tgtRest.hips.p).add(_v1).applyQuaternion(T);
        if (parent) parent.worldToLocal(_v2);
        hipVals[f * 3] = _v2.x; hipVals[f * 3 + 1] = _v2.y; hipVals[f * 3 + 2] = _v2.z;
      }
    }
    action.stop();
    srcMixer.uncacheAction(clip);

    const tracks = [];
    for (const b of tgtBones) {
      const arr = qVals.get(b);
      // keep quaternions sign-continuous for clean interpolation
      for (let f = 1; f < frames; f++) {
        const i = f * 4, p = i - 4;
        if (arr[i] * arr[p] + arr[i + 1] * arr[p + 1] + arr[i + 2] * arr[p + 2] + arr[i + 3] * arr[p + 3] < 0) {
          arr[i] = -arr[i]; arr[i + 1] = -arr[i + 1]; arr[i + 2] = -arr[i + 2]; arr[i + 3] = -arr[i + 3];
        }
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, arr));
    }
    if (tgt.hips) tracks.push(new THREE.VectorKeyframeTrack(tgt.hips.name + '.position', times, hipVals));
    return new THREE.AnimationClip(name, duration, tracks);
  }

  return { bake, src, tgt, slotsUsed, hipScale, tgtRest, srcRest, align, yaw, forward: ft };
}

function _qi(q) { return q.clone().invert(); }
