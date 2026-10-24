// Procedural characters: soldiers (潜伏者 red / 保卫者 blue, 4 variants each) and zombies (normal, fast, host 母体, heavy, exploder, boss).
//
// Every character is a hierarchy of Object3D joints with meshes attached, animated procedurally by rotating joints:
//   root (feet centre, faces -Z) → body (death-fall pivot) → hips → spine → chest → neck → head
//   chest → clavicle_L/R → upperArm_L/R → forearm_L/R → hand_L/R        chest → gunMount
//   hips  → thigh_L/R → shin_L/R → foot_L/R
// Limb joints point down their local -Y axis. Legs always use analytic 2-bone IK (foot planting driven by distance travelled),
// soldier arms use 2-bone IK to the held gun's anchors every frame (so recoil / pitch / reload keep the hands on the gun).
//
// Geometries are cached at module level (unit primitives scaled per mesh + keyed custom shapes), materials come from
// src/gfx/materials.js (extra colours via its cached `solid()` helper). update() allocates nothing.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, solid } from '../gfx/materials.js';
import { rng } from '../gfx/textures.js';

const PI = Math.PI, TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const damp = (dt, rate) => 1 - Math.exp(-dt * rate);
const V2 = (x, y) => new THREE.Vector2(x, y);

// =====================================================================================================================
// Geometry cache
// =====================================================================================================================
const GEO = new Map();
function geo(key, fn) {
  let g = GEO.get(key);
  if (!g) { g = fn(); g.userData.shared = true; GEO.set(key, g); }
  return g;
}
const f3 = (n) => (+n).toFixed(3);

function roundedBox(r = 0.16, seg = 7) {
  const g = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg);
  const p = g.attributes.position, n = g.attributes.normal;
  const h = 0.5 - r, band = (seg - 3) / seg; // t above which a grid line falls into the rounded band
  const remap = (u) => {
    const t = Math.abs(u) / 0.5, sg = Math.sign(u);
    if (t >= band - 1e-6) return sg * (h + ((t - band) / (1 - band)) * (0.5 - h));
    return sg * (t / band) * h;
  };
  for (let i = 0; i < p.count; i++) {
    const x = remap(p.getX(i)), y = remap(p.getY(i)), z = remap(p.getZ(i));
    const cx = clamp(x, -h, h), cy = clamp(y, -h, h), cz = clamp(z, -h, h);
    const dx = x - cx, dy = y - cy, dz = z - cz, l = Math.hypot(dx, dy, dz);
    if (l > 1e-7) {
      p.setXYZ(i, cx + (dx / l) * r, cy + (dy / l) * r, cz + (dz / l) * r);
      n.setXYZ(i, dx / l, dy / l, dz / l);
    } else p.setXYZ(i, x, y, z);
  }
  return g;
}

// unit primitives (diameter / size 1), scaled per mesh
const gSphere = () => geo('sph', () => new THREE.SphereGeometry(0.5, 20, 14));
const gSphereLo = () => geo('sphLo', () => new THREE.SphereGeometry(0.5, 10, 8));
const gCyl = () => geo('cyl', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 16));
const gCylLo = () => geo('cylLo', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 6));
const gBox = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
const gRBox = () => geo('rbox', () => roundedBox(0.16));
const gRing = () => geo('ring', () => new THREE.TorusGeometry(0.5, 0.07, 6, 28).rotateX(PI / 2));        // ring in XZ plane
const gRingFat = () => geo('ringFat', () => new THREE.TorusGeometry(0.5, 0.16, 8, 24).rotateX(PI / 2));

// Tapered limb (rounded ends), spans y = -len .. 0 (plus caps). Lathe gives a smooth muscle bulge.
function limbGeo(rTop, rBot, len, bulge = 0.06, seg = 14) {
  return geo(`limb${f3(rTop)},${f3(rBot)},${f3(len)},${bulge}`, () => {
    const pts = [];
    for (let i = 0; i <= 4; i++) {
      const a = -PI / 2 + (i / 4) * (PI / 2);
      pts.push(V2(i === 0 ? 0 : Math.cos(a) * rBot, -len + Math.sin(a) * rBot));
    }
    pts.push(V2(lerp(rBot, rTop, 0.35) * (1 + bulge), -len * 0.65));
    pts.push(V2(lerp(rBot, rTop, 0.7) * (1 + bulge * 0.8), -len * 0.3));
    for (let i = 0; i <= 4; i++) {
      const a = (i / 4) * (PI / 2);
      pts.push(V2(i === 4 ? 0 : Math.cos(a) * rTop, Math.sin(a) * rTop));
    }
    return new THREE.LatheGeometry(pts, seg);
  });
}

// Torn cloth tube: open cylinder (radius 0.5, height 1) with a ragged bottom edge. Use with a DoubleSide material.
function tatterGeo(seed, thetaStart = 0, thetaLen = TAU, rTop = 0.5, rBot = 0.5, jag = 0.32) {
  return geo(`tat${seed},${f3(thetaStart)},${f3(thetaLen)},${rTop},${rBot},${jag}`, () => {
    const g = new THREE.CylinderGeometry(rTop, rBot, 1, 20, 3, true, thetaStart, thetaLen);
    const r = rng(seed * 7919 + 13), p = g.attributes.position;
    const jagCol = [];
    for (let i = 0; i <= 20; i++) jagCol.push(r() * jag * (i % 2 ? 1 : 0.45));
    for (let i = 0; i < p.count; i++) {
      const col = i % 21, row = Math.floor(i / 21);
      const y = p.getY(i);
      if (row === 3) p.setY(i, y + jagCol[col]);
      else if (row === 2) p.setY(i, y + jagCol[col] * 0.35);
      const w = 1 + (r() - 0.5) * 0.06;
      p.setX(i, p.getX(i) * w); p.setZ(i, p.getZ(i) * w);
    }
    g.computeVertexNormals();
    return g;
  });
}

const _gm = new THREE.Matrix4(), _gq = new THREE.Quaternion(), _ge = new THREE.Euler(), _gv = new THREE.Vector3(), _gs = new THREE.Vector3();
function xf(g, p = [0, 0, 0], r = null, s = null) {
  _gq.setFromEuler(_ge.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0));
  _gm.compose(_gv.set(p[0], p[1], p[2]), _gq, s ? _gs.set(s[0], s[1], s[2]) : _gs.set(1, 1, 1));
  return g.applyMatrix4(_gm);
}
// Two spheres of radius `ratio` at x = ±1 (eyes, ears). Scale the mesh by the half-separation.
const pairGeo = (ratio) => geo(`pair${ratio}`, () => mergeGeometries([
  new THREE.SphereGeometry(ratio, 10, 8).translate(-1, 0, 0), new THREE.SphereGeometry(ratio, 10, 8).translate(1, 0, 0)]));

// ---------- soldier gear ----------
const helmetGeo = () => geo('helmet', () => {
  const R = 0.13, pts = [V2(0, R * 0.98)];
  for (let i = 1; i <= 10; i++) { const a = PI / 2 - (i / 10) * (PI / 2 + 0.32); pts.push(V2(Math.cos(a) * R, Math.sin(a) * R * 0.95)); }
  const l = pts[pts.length - 1];
  pts.push(V2(l.x + 0.009, l.y - 0.004), V2(l.x + 0.006, l.y - 0.012), V2(l.x - 0.007, l.y - 0.01), V2(R * 0.9, R * 0.05), V2(R * 0.62, R * 0.62), V2(0, R * 0.86));
  return new THREE.LatheGeometry(pts, 26);
});
const helmetRailsGeo = () => geo('hrails', () => mergeGeometries([
  xf(roundedBox(0.2), [-0.128, -0.005, 0.005], [0, 0, 0.12], [0.014, 0.03, 0.12]),
  xf(roundedBox(0.2), [0.128, -0.005, 0.005], [0, 0, -0.12], [0.014, 0.03, 0.12]),
  xf(roundedBox(0.2), [0, 0.005, 0.13], [0.3, 0, 0], [0.075, 0.045, 0.03]),          // counterweight pouch
]));
const nvgGeo = () => geo('nvg', () => mergeGeometries([
  xf(roundedBox(0.2), [0, 0, 0], null, [0.05, 0.042, 0.022]),                              // shroud
  xf(roundedBox(0.2), [0, 0.03, -0.012], [0.4, 0, 0], [0.018, 0.05, 0.018]),             // mount arm
  xf(roundedBox(0.2), [0, 0.06, -0.03], null, [0.07, 0.022, 0.03]),                       // bridge
  xf(new THREE.CylinderGeometry(0.016, 0.018, 0.075, 12), [-0.022, 0.085, -0.04], [0.5, 0, 0]),
  xf(new THREE.CylinderGeometry(0.016, 0.018, 0.075, 12), [0.022, 0.085, -0.04], [0.5, 0, 0]),
]));
const capCrownGeo = () => geo('capCrown', () => {
  const R = 0.117, pts = [V2(0, R * 0.82)];
  for (let i = 1; i <= 8; i++) { const a = PI / 2 - (i / 8) * (PI / 2); pts.push(V2(Math.cos(a) * R, Math.sin(a) * R * 0.85)); }
  pts.push(V2(R * 1.01, -0.012), V2(R * 0.95, -0.012), V2(R * 0.7, R * 0.5), V2(0, R * 0.7));
  return new THREE.LatheGeometry(pts, 22);
});
const brimGeo = () => geo('brim', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 18, 1, false, PI / 2, PI));
const headsetGeo = () => geo('headset', () => {
  const boomA = new THREE.Vector3(-0.118, 0.065, -0.025), boomB = new THREE.Vector3(-0.045, 0.028, -0.108);
  const boomLen = boomA.distanceTo(boomB);
  const boom = new THREE.CylinderGeometry(0.004, 0.004, boomLen, 6);
  boom.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), boomB.clone().sub(boomA).normalize()));
  boom.translate((boomA.x + boomB.x) / 2, (boomA.y + boomB.y) / 2, (boomA.z + boomB.z) / 2);
  return mergeGeometries([
    xf(new THREE.TorusGeometry(0.132, 0.008, 5, 22, PI), [0, 0.098, 0.01]),
    xf(new THREE.CylinderGeometry(0.036, 0.036, 0.034, 16), [-0.113, 0.078, 0.01], [0, 0, PI / 2]),
    xf(new THREE.CylinderGeometry(0.036, 0.036, 0.034, 16), [0.113, 0.078, 0.01], [0, 0, PI / 2]),
    boom, new THREE.SphereGeometry(0.011, 8, 6).translate(boomB.x, boomB.y, boomB.z),
  ]);
});
const strapsGeo = () => geo('straps', () => {
  const parts = [];
  for (const m of [-1, 1]) {
    parts.push(xf(roundedBox(0.2), [m * 0.1, 0.235, -0.105], [0.25, 0, 0], [0.058, 0.11, 0.022]));
    parts.push(xf(roundedBox(0.2), [m * 0.1, 0.282, 0], null, [0.058, 0.022, 0.2]));
    parts.push(xf(roundedBox(0.2), [m * 0.1, 0.235, 0.105], [-0.25, 0, 0], [0.058, 0.11, 0.022]));
  }
  return mergeGeometries(parts);
});
const pouchesGeo = () => geo('pouches', () => mergeGeometries([-1, 0, 1].flatMap((i) => [
  xf(roundedBox(0.18), [i * 0.083, 0, 0], null, [0.074, 0.12, 0.046]),
  xf(roundedBox(0.25), [i * 0.083, -0.015, -0.024], null, [0.05, 0.035, 0.006]),       // bungee / velcro tab
])));
const magTopsGeo = () => geo('magTops', () => mergeGeometries([-1, 0, 1].map((i) =>
  xf(roundedBox(0.2), [i * 0.083, 0.072, 0.002], [0.12, 0, 0], [0.058, 0.05, 0.026]))));

// ---------- zombie parts ----------
const ribsGeo = () => geo('ribs', () => {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const t = new THREE.TorusGeometry(0.5 - i * 0.012, 0.03, 5, 18, PI * 0.9);
    t.rotateZ(PI * 0.05); t.rotateX(-PI / 2); t.rotateX(-0.28); t.translate(0, -i * 0.19, 0);
    parts.push(t);
  }
  parts.push(xf(new THREE.BoxGeometry(0.07, 0.78, 0.05), [0, -0.42, -0.47]));
  return mergeGeometries(parts);
});
const spikesGeo = () => geo('spikes', () => {
  const up = new THREE.Vector3(0, 1, 0), parts = [];
  const list = [[0, 0.55, 0.5], [-0.5, 0.3, 0.42], [0.5, 0.3, 0.42], [0, 0.15, 0.55], [-0.35, -0.12, 0.38], [0.35, -0.12, 0.38],
    [0, -0.3, 0.4], [-0.9, 0.75, 0.62], [0.9, 0.75, 0.62], [-1.3, 0.5, 0.42], [1.3, 0.5, 0.42]];
  for (const [th, ph, L] of list) {
    const n = new THREE.Vector3(Math.sin(th) * Math.cos(ph), Math.sin(ph), Math.cos(th) * Math.cos(ph));
    const g = new THREE.ConeGeometry(0.045 + L * 0.08, L, 7).translate(0, L / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, n.clone().add(new THREE.Vector3(0, 0.4, 0.15)).normalize()));
    g.translate(n.x * 0.44, n.y * 0.44, n.z * 0.44);
    parts.push(g);
  }
  return mergeGeometries(parts);
});
const nubsGeo = () => geo('nubs', () => mergeGeometries([0, 1, 2, 3, 4].map((i) =>
  xf(new THREE.ConeGeometry(0.1 - i * 0.008, 0.22, 6), [0, -i * 0.22, 0.04], [PI / 2 - 0.5, 0, 0]))));
const pustulesGeo = (seed) => geo(`pus${seed}`, () => {
  const r = rng(seed), parts = [];
  for (let i = 0; i < 13; i++) {
    const u = r() * 2 - 1, a = r() * TAU, q = Math.sqrt(1 - u * u);
    const sz = 0.05 + r() * 0.1;
    parts.push(new THREE.SphereGeometry(sz, 9, 7).translate(q * Math.cos(a) * 0.47, u * 0.47, q * Math.sin(a) * 0.47));
  }
  return mergeGeometries(parts);
});
const teethGeo = () => geo('teeth', () => mergeGeometries([-3, -2, -1, 0, 1, 2, 3].map((i) => {
  const a = i * 0.24;
  return xf(new THREE.ConeGeometry(0.0065, 0.022, 5), [Math.sin(a) * 0.05, -0.01, -Math.cos(a) * 0.05 + 0.05], [PI, 0, 0]);
})));
const hornsGeo = () => geo('horns', () => mergeGeometries([-1, 1].flatMap((m) => [
  xf(new THREE.ConeGeometry(0.032, 0.11, 8), [m * 0.085, 0.2, 0.0], [-0.5, 0, -m * 0.75]),
  xf(new THREE.ConeGeometry(0.02, 0.09, 8), [m * 0.15, 0.255, 0.04], [-0.9, 0, -m * 1.25]),
])));
const bladesGeo = () => geo('fblades', () => mergeGeometries([0, 1, 2].map((i) =>
  xf(new THREE.ConeGeometry(0.018, 0.1 - i * 0.015, 6), [0, -0.05 - i * 0.07, 0.03], [0.9, 0, 0]))));
const stitchGeo = () => geo('stitch', () => {
  const parts = [new THREE.BoxGeometry(0.012, 0.8, 0.012)];
  for (let i = 0; i < 7; i++) parts.push(xf(new THREE.BoxGeometry(0.12, 0.012, 0.012), [0, -0.36 + i * 0.12, 0], [0, 0, 0.2]));
  return mergeGeometries(parts);
});
// Zombie hand (wrist at origin, fingers down -Y, palm faces -Z): group 0 = skin, group 1 = claws
const clawHandGeo = (type = 'normal') => geo(`claw${type}`, () => {
  const clawL = type === 'long' ? 0.075 : type === 'blade' ? 0.12 : 0.042, clawR = type === 'blade' ? 0.013 : 0.008;
  const X = new THREE.Vector3(1, 0, 0), skinP = [], clawP = [];
  skinP.push(xf(new THREE.SphereGeometry(0.5, 10, 8), [0, -0.05, 0], null, [0.095, 0.11, 0.045]));
  const xs = [-0.034, -0.012, 0.012, 0.034];
  for (let i = 0; i < 5; i++) {
    const thumb = i === 4;
    const fl = thumb ? 0.035 : 0.05 + (i === 1 || i === 2 ? 0.012 : 0);
    const curl = thumb ? 1.0 : 0.45;
    const base = thumb ? new THREE.Vector3(0, -0.045, -0.025) : new THREE.Vector3(xs[i], -0.095, 0);
    const f = new THREE.CapsuleGeometry(0.011, fl, 3, 6).translate(0, -fl / 2 - 0.011, 0).rotateX(curl);
    f.translate(base.x, base.y, base.z); skinP.push(f);
    const tip = new THREE.Vector3(0, -(fl + 0.016), 0).applyAxisAngle(X, curl);
    const cl = new THREE.ConeGeometry(clawR, clawL, 6).translate(0, clawL / 2, 0).rotateX(PI + curl + 0.35);
    cl.translate(base.x + tip.x, base.y + tip.y, base.z + tip.z); clawP.push(cl);
  }
  return mergeGeometries([mergeGeometries(skinP), mergeGeometries(clawP)], true);
});

// =====================================================================================================================
// Local materials (module cached)
// =====================================================================================================================
const LMAT = new Map();
function ds(m) { // double-sided variant of a shared material (torn cloth)
  let r = LMAT.get(m.uuid);
  if (!r) { r = m.clone(); r.side = THREE.DoubleSide; LMAT.set(m.uuid, r); }
  return r;
}

// =====================================================================================================================
// Hand grip frames. Soldier hand frame: wrist at origin, fingers toward -Z, back of hand up (+Y = thumb side),
// palm faces -X (right hand) / +X (left hand). Offsets are expressed in the gun anchor frame.
// =====================================================================================================================
const GRIP = (() => {
  const qR = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, 0, 0));
  const gR = new THREE.Vector3(-0.03, 0, -0.06);                                  // grip point inside the right fist
  const wristR = new THREE.Vector3(0, -0.04, 0.005).sub(gR.clone().applyQuaternion(qR));
  // left hand cupping a handguard from below-left, fingers wrapping up the right side
  const f = new THREE.Vector3(0.7, 0.35, -0.45).normalize();
  const p0 = new THREE.Vector3(0.3, 1, 0), p = p0.clone().addScaledVector(f, -p0.dot(f)).normalize();
  const Z = f.clone().negate(), Y = new THREE.Vector3().crossVectors(Z, p);
  const qL = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(p, Y, Z));
  const gL = new THREE.Vector3(0.03, 0, -0.06);
  const wristL = new THREE.Vector3(0, -0.028, 0).sub(gL.clone().applyQuaternion(qL));
  // left hand wrapping the right fist on a pistol (support grip)
  const qLp = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25, 0, 0));
  const wristLp = new THREE.Vector3(-0.012, -0.075, 0.012).sub(gL.clone().applyQuaternion(qLp));
  const qId = new THREE.Quaternion();
  const qZombieFix = new THREE.Quaternion().setFromEuler(new THREE.Euler(PI / 2, 0, 0)); // zombie hand (-Y fingers) → grip frame
  return { qR, wristR, qL, wristL, qLp, wristLp, qId, qZombieFix };
})();

// Hold presets: gun-origin (right grip) position relative to the shoulder-line pivot, in the aim frame (yaw · pitch).
const HOLD = {
  rifle: { off: [0.1, -0.015, -0.24], blade: -0.32, cheek: 1, twoHand: true, pitchF: 1, poleR: [0.9, -1.0, 0.35], poleL: [-0.45, -1.0, -0.1] },
  pistol: { off: [0.035, -0.08, -0.43], blade: -0.1, twoHand: true, pitchF: 1, poleR: [0.7, -1.0, 0.2], poleL: [-0.7, -1.0, 0.2] },
  melee: { off: [0.22, -0.32, -0.3], blade: 0.05, twoHand: false, pitchF: 0.4, poleR: [0.6, -0.8, 0.5], poleL: [-0.6, -1, 0.3] },
  grenade: { off: [0.21, 0.03, -0.14], blade: 0.1, twoHand: false, pitchF: 0.3, poleR: [0.8, -1.0, 0.3], poleL: [-0.6, -1, 0.3] },
};
const HOLD_ALIAS = { smg: 'rifle', sniper: 'rifle', shotgun: 'rifle', mg: 'rifle', knife: 'melee' };

// =====================================================================================================================
// Proportions
// =====================================================================================================================
function makeDims(H, { w = 1, armF = 1, legF = 1, headF = 1, belly = 1, bigArm = 0, wide = 0 } = {}) {
  const s = H / 1.8;
  const thigh = 0.44 * s * legF, shin = 0.4 * s * legF, ankle = 0.08 * s, hipDrop = 0.06 * s;
  const hipY = ankle + shin + thigh + hipDrop;
  const k = (H - hipY) / 0.82;          // torso length factor (soldier = 1)
  const hs = s * headF;                 // head size factor
  const hipX = 0.1 * s * Math.pow(w, 0.7);
  const d = {
    H, s, w, k, hs, thigh, shin, ankle, hipDrop, hipY, hipX, footX: hipX + 0.012 * s + wide * s, belly,
    hipToSpine: 0.1 * k, spineLen: 0.18 * k, chestLen: 0.24 * k, neckLen: 0.08 * k,
    shoulderX: 0.2 * s * Math.pow(w, 0.85), shoulderY: 0.19 * k,
    armA: [0.3 * s * armF, 0.3 * s * armF * (bigArm ? 1.1 : 1)],
    armB: [0.27 * s * armF, 0.27 * s * armF * (bigArm ? 1.15 : 1)],
  };
  d.eye = hipY + d.hipToSpine + d.spineLen + d.chestLen + d.neckLen + 0.075 * hs;
  d.lift = 0.15 * s * Math.pow(w, 0.9) * (belly > 1 ? 0.8 + belly * 0.35 : 1);
  return d;
}

const ZK = {
  normal: { H: 1.85, w: 1.0, armF: 1.05, legF: 1.0, headF: 1.0, skin: 'zombieSkin', eyes: 'Y', hunch: 0.42, pose: 'reach', radius: 0.34, claw: 'normal', gait: 0.85, lift: 0.6 },
  fast: { H: 1.75, w: 0.82, armF: 1.22, legF: 1.06, headF: 0.95, skin: 'zombieSkinGrey', eyes: 'Y', hunch: 0.32, pose: 'trail', radius: 0.3, claw: 'long', gait: 1.0, lift: 1.1 },
  host: { H: 2.05, w: 1.28, armF: 1.1, legF: 1.0, headF: 1.0, skin: 'zombieSkinRed', eyes: 'R', hunch: 0.36, pose: 'claw', radius: 0.42, claw: 'long', gait: 0.95, lift: 0.9 },
  heavy: { H: 2.4, w: 1.45, armF: 1.0, legF: 0.85, headF: 0.78, skin: 'zombieSkinGrey', eyes: 'R', hunch: 0.26, pose: 'brute', radius: 0.62, claw: 'normal', belly: 1.6, wide: 0.05, gait: 0.9, lift: 0.7 },
  exploder: { H: 1.7, w: 1.2, armF: 0.95, legF: 0.9, headF: 1.0, skin: 'zombieSkin', eyes: 'Y', hunch: 0.3, pose: 'hang', radius: 0.4, claw: 'normal', belly: 1.5, wide: 0.02, gait: 0.85, lift: 0.7 },
  boss: { H: 4.0, w: 1.35, armF: 1.2, legF: 1.0, headF: 0.75, skin: 'zombieSkinRed', eyes: 'R', hunch: 0.38, pose: 'boss', radius: 1.0, claw: 'long', bigArm: 1, wide: 0.04, gait: 0.9, lift: 0.8 },
};

// =====================================================================================================================
// Temps (no per-frame allocation)
// =====================================================================================================================
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3();
const _T = new THREE.Vector3(), _T2 = new THREE.Vector3(), _pole = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qA = new THREE.Quaternion(), _qE = new THREE.Quaternion();
const _qRoot = new THREE.Quaternion(), _qAim = new THREE.Quaternion(), _qPole = new THREE.Quaternion();
const _e1 = new THREE.Euler();
const _A = new THREE.Vector3(), _D = new THREE.Vector3(), _P = new THREE.Vector3(), _U = new THREE.Vector3(), _E = new THREE.Vector3();
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _Y2 = new THREE.Vector3(), _Z2 = new THREE.Vector3(), _TT = new THREE.Vector3();
const _qU = new THREE.Quaternion(), _qL = new THREE.Quaternion(), _qP = new THREE.Quaternion(), _mIK = new THREE.Matrix4();
const _atk = [0, 0, 0, 0, 0, 0, 0];

/**
 * Analytic 2-bone IK. Bones point along their local -Y. `pole` = world direction the middle joint should point to.
 * bend = +1: lower bone folds toward the upper's local -Z (elbow), -1: toward +Z (knee). endQ: optional world rotation for `end`.
 */
function solveIK(upper, lower, end, a, b, target, pole, bend, endQ) {
  const par = upper.parent;
  par.getWorldQuaternion(_qP);                                   // also refreshes par.matrixWorld
  _A.copy(upper.position).applyMatrix4(par.matrixWorld);
  _D.subVectors(target, _A);
  let dist = _D.length();
  if (dist < 1e-6) { _D.set(0, -1, 0); dist = 1e-6; } else _D.divideScalar(dist);
  const L = clamp(dist, Math.abs(a - b) + 1e-4, (a + b) * 0.9995);
  const cosA = clamp((a * a + L * L - b * b) / (2 * a * L), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
  _P.copy(pole).addScaledVector(_D, -pole.dot(_D));
  if (_P.lengthSq() < 1e-10) { _P.set(0, 0, 1).addScaledVector(_D, -_D.z); if (_P.lengthSq() < 1e-10) _P.set(1, 0, 0); }
  _P.normalize();
  _U.copy(_D).multiplyScalar(cosA).addScaledVector(_P, sinA);           // upper bone direction
  _E.copy(_A).addScaledVector(_U, a);                                    // middle joint
  _Y.copy(_U).negate();
  _Z.copy(_D).multiplyScalar(-sinA).addScaledVector(_P, cosA).multiplyScalar(bend);
  _X.crossVectors(_Y, _Z);
  _qU.setFromRotationMatrix(_mIK.makeBasis(_X, _Y, _Z));
  upper.quaternion.copy(_qP.invert()).multiply(_qU);
  _TT.copy(_A).addScaledVector(_D, L);
  _Y2.subVectors(_E, _TT).normalize();
  _Z2.crossVectors(_X, _Y2);
  _qL.setFromRotationMatrix(_mIK.makeBasis(_X, _Y2, _Z2));
  lower.quaternion.copy(_qU).invert().multiply(_qL);
  if (endQ && end) end.quaternion.copy(_qL).invert().multiply(endQ);
}

const DEF_STATE = { speed: 0, moveX: 0, moveZ: 0, crouch: false, airborne: false, pitch: 0, firing: false, reloading: false, alive: true };

// =====================================================================================================================
// CharacterModel
// =====================================================================================================================
class CharacterModel {
  constructor({ kind, isZombie, dims, seed = 1, zc = null, team = null, variant = 0 }) {
    this.kind = kind; this.isZombie = isZombie; this.team = team; this.variant = variant; this.seed = seed;
    this.d = dims; this.zc = zc;
    this.height = dims.H; this.eyeHeight = dims.eye; this.radius = zc ? zc.radius : 0.32;
    this.rand = rng(seed * 31 + 7);
    this.meshes = [];
    this.pulse = [];
    const d = dims;
    const J = (parent, name, x, y, z) => { const o = new THREE.Object3D(); o.name = name; o.position.set(x, y, z); parent.add(o); return o; };
    this.root = new THREE.Group(); this.root.name = isZombie ? `zombie_${kind}` : `soldier_${team}_${variant}`;
    this.root.userData.character = this;
    this.body = J(this.root, 'body', 0, 0, 0);
    this.hips = J(this.body, 'hips', 0, d.hipY, 0);
    this.spine = J(this.hips, 'spine', 0, d.hipToSpine, 0);
    this.chest = J(this.spine, 'chest', 0, d.spineLen, 0);
    this.neck = J(this.chest, 'neck', 0, d.chestLen, 0);
    this.head = J(this.neck, 'head', 0, d.neckLen, 0);
    this.mount = J(this.chest, 'gunMount', 0, 0, 0);
    this.arms = [-1, 1].map((m, i) => {
      const sd = m < 0 ? 'L' : 'R';
      const clav = J(this.chest, `clavicle_${sd}`, m * d.shoulderX, d.shoulderY, 0);
      const upper = J(clav, `upperArm_${sd}`, 0, 0, 0);
      const fore = J(upper, `forearm_${sd}`, 0, -d.armA[i], 0);
      const hand = J(fore, `hand_${sd}`, 0, -d.armB[i], 0);
      return { m, clav, upper, fore, hand, a: d.armA[i], b: d.armB[i], clavBase: clav.position.clone(), rU: 0.05 * d.s, rF: 0.044 * d.s };
    });
    this.legs = [-1, 1].map((m) => {
      const sd = m < 0 ? 'L' : 'R';
      const thigh = J(this.hips, `thigh_${sd}`, m * d.hipX, -d.hipDrop, 0);
      const shin = J(thigh, `shin_${sd}`, 0, -d.thigh, 0);
      const foot = J(shin, `foot_${sd}`, 0, -d.shin, 0);
      return { m, thigh, shin, foot, a: d.thigh, b: d.shin, tx: m * d.footX, ty: d.ankle, tz: 0, toe: 0, rT: 0.085 * d.s, rS: 0.06 * d.s };
    });
    this.joints = {};
    this.root.traverse((o) => { if (!o.isMesh && o !== this.root) this.joints[o.name] = o; });
    this._blend = [this.spine, this.chest, this.neck, this.head, ...this.arms.flatMap((a) => [a.upper, a.fore, a.hand]), ...this.legs.flatMap((l) => [l.thigh, l.shin, l.foot])];
    this._blendQ = this._blend.map(() => new THREE.Quaternion());
    // animation state
    this.time = this.rand() * 10; this.phase = 0; this.spd = 0; this.dirX = 0; this.dirZ = -1;
    this.crouchW = 0; this.airW = 0; this.blade = 0; this.recoil = 0; this.reloadT = 0; this.reloadW = 0;
    this.attackT = -1; this.attackDur = 0.45; this.attackSide = 1;
    this.flinchT = 0; this.flX = 0; this.flZ = 0;
    this.dead = false; this.deathT = 0; this.headshot = false;
    this.fallDir = new THREE.Vector3(0, 0, 1); this.fallAxis = new THREE.Vector3(1, 0, 0);
    this.gun = null; this.hold = 'none';
    this._anchorR = null; this._anchorL = null;
    this._fbR = J(this.mount, 'fallbackRightHand', 0, 0, 0);
    this._fbL = J(this.mount, 'fallbackLeftHand', 0, 0.02, -0.32);
    this._mag = null; this._magBase = new THREE.Vector3(); this._magHome = new THREE.Vector3(0, -0.1, -0.12);
    this._handFix = isZombie ? GRIP.qZombieFix : GRIP.qId;
    this._hl = null; this._hlColor = null;
    this.headTilt = (this.rand() - 0.5) * 0.4;
    this.armAsym = this.rand() < 0.5 ? -1 : 1;
    this.jaw = null;
  }

  add(parent, g, mat, p = null, sc = null, r = null, cast = true) {
    const mesh = new THREE.Mesh(g, mat);
    if (p) mesh.position.set(p[0], p[1], p[2]);
    if (sc) mesh.scale.set(sc[0], sc[1], sc[2]);
    if (r) mesh.rotation.set(r[0], r[1], r[2]);
    mesh.castShadow = cast; mesh.receiveShadow = true;
    parent.add(mesh); this.meshes.push(mesh);
    return mesh;
  }

  _finish() {
    const d = this.d, sw = d.s * d.w, k = d.k, hs = d.hs;
    const bel = d.belly, bx = 1 + (bel - 1) * 0.6, bz = bel;
    const hb = [
      { part: 'head', bone: this.head, half: [0.12 * hs, 0.13 * hs, 0.128 * hs], offset: [0, 0.105 * hs, -0.005 * hs] },
      { part: 'chest', bone: this.chest, half: [0.205 * sw, 0.17 * k, 0.145 * sw], offset: [0, 0.1 * k, 0] },
      { part: 'stomach', bone: this.spine, half: [0.17 * sw * bx, 0.12 * k * (1 + (bel - 1) * 0.35), 0.13 * sw * bz], offset: [0, 0.08 * k, -0.035 * d.s * (bel - 1)] },
      { part: 'stomach', bone: this.hips, half: [0.175 * sw, 0.11 * d.s, 0.13 * sw], offset: [0, -0.03 * d.s, 0] },
    ];
    for (const arm of this.arms) {
      hb.push({ part: 'arm', bone: arm.upper, half: [arm.rU * 1.3, arm.a / 2 + 0.01 * d.s, arm.rU * 1.3], offset: [0, -arm.a / 2, 0] });
      const fl = arm.b + 0.07 * d.s;
      hb.push({ part: 'arm', bone: arm.fore, half: [arm.rF * 1.4, fl / 2, arm.rF * 1.4], offset: [0, -fl / 2, 0] });
    }
    for (const leg of this.legs) {
      hb.push({ part: 'leg', bone: leg.thigh, half: [leg.rT * 1.08, leg.a / 2 + 0.01 * d.s, leg.rT * 1.08], offset: [0, -leg.a / 2, 0] });
      const sl = leg.b + d.ankle;
      hb.push({ part: 'leg', bone: leg.shin, half: [leg.rS * 1.25, sl / 2, leg.rS * 1.25 + 0.03 * d.s], offset: [0, -sl / 2, -0.025 * d.s] });
    }
    this.hitboxes = hb;
    this.meshCount = this.meshes.length;
    this.update(0, DEF_STATE);
  }

  // -------------------------------------------------------------------------------------------------------------------
  holdWeapon(gun, hold = 'rifle') {
    if (this.gun) {
      this._restoreMag();
      if (this.gun.parent) this.gun.parent.remove(this.gun);
    }
    this.gun = null; this._anchorR = this._anchorL = null; this._mag = null;
    hold = HOLD_ALIAS[hold] || hold;
    this.hold = gun ? (HOLD[hold] || hold === 'none' ? hold : 'rifle') : 'none';
    if (!gun) return;
    this.gun = gun;
    const an = gun.userData && gun.userData.anchors;
    if (this.hold === 'none') {
      // carried in the hand, arms relaxed
      const hand = this.arms[1].hand;
      hand.add(gun);
      _q1.copy(GRIP.qR).multiply(this._handFix).invert();
      gun.quaternion.copy(_q1);
      gun.position.copy(GRIP.wristR).applyQuaternion(gun.quaternion).negate();
      return;
    }
    this.mount.add(gun);
    gun.position.set(0, 0, 0); gun.quaternion.identity();
    this._anchorR = (an && an.rightHand) || this._fbR;
    this._anchorL = an ? (an.leftHand || null) : (this.hold === 'rifle' ? this._fbL : null);
    const mag = gun.userData && gun.userData.parts && gun.userData.parts.mag;
    if (mag && mag.isObject3D) {
      this._mag = mag; this._magBase.copy(mag.position);
      gun.updateWorldMatrix(true, true);
      mag.getWorldPosition(this._magHome); gun.worldToLocal(this._magHome);
    } else this._magHome.set(0, this.hold === 'pistol' ? -0.09 : -0.1, this.hold === 'pistol' ? 0.01 : -0.12);
    this.update(0, DEF_STATE);
  }

  _restoreMag() { if (this._mag) this._mag.position.copy(this._magBase); }

  attack() {
    if (this.dead) return;
    this.attackT = 0;
    this.attackSide = -this.attackSide;
    this.attackDur = this.kind === 'boss' ? 0.8 : this.kind === 'heavy' ? 0.6 : 0.45;
  }

  flinch(dirWorld) {
    if (this.dead) return;
    let x = 0, z = 1;
    if (dirWorld && dirWorld.lengthSq() > 1e-8) {
      this.root.getWorldQuaternion(_q1);
      _v1.copy(dirWorld).applyQuaternion(_q1.invert()); x = _v1.x; z = _v1.z;
      const l = Math.hypot(x, z) || 1; x /= l; z /= l;
    }
    this.flX = x; this.flZ = z; this.flinchT = 0.3;
  }

  die(dirWorld, headshot = false) {
    if (this.dead) return;
    this.dead = true; this.deathT = 0; this.headshot = !!headshot;
    let x = 0, z = 1;
    if (dirWorld && dirWorld.lengthSq && dirWorld.lengthSq() > 1e-8) {
      this.root.getWorldQuaternion(_q1);
      _v1.copy(dirWorld).applyQuaternion(_q1.invert()); x = _v1.x; z = _v1.z;
    }
    let l = Math.hypot(x, z);
    if (l < 1e-4) { x = 0; z = 1; l = 1; }
    x /= l; z /= l;
    const a = (this.rand() - 0.5) * 0.5, c = Math.cos(a), s = Math.sin(a);
    const fx = x * c + z * s, fz = -x * s + z * c;
    this.fallDir.set(fx, 0, fz);
    this.fallAxis.set(fz, 0, -fx);                      // up × dir: tips +Y toward the fall direction
    this.deathSpin = (this.rand() - 0.5) * 0.6;
    // ground clearance of the lying body: back / front / side extents
    const d = this.d, legR = this.legs[0].rT;
    const back = d.lift, front = d.lift + 0.045 * d.s * d.belly, side = Math.max(d.lift, d.hipX + legR * 1.05);
    this._lift = (fz >= 0 ? back : front) * fz * fz + side * fx * fx;
    for (let i = 0; i < this._blend.length; i++) this._blendQ[i].copy(this._blend[i].quaternion);
    this._hipStartY = this.hips.position.y; this._hipStartZ = this.hips.position.z;
    this._restoreMag();
    if (this.gun && this.gun.parent === this.mount) { this.root.updateWorldMatrix(true, true); this.arms[1].hand.attach(this.gun); }
  }

  reset() {
    this.dead = false; this.deathT = 0;
    this.body.position.set(0, 0, 0); this.body.quaternion.identity();
    this.phase = 0; this.spd = 0; this.recoil = 0; this.attackT = -1; this.flinchT = 0; this.crouchW = 0; this.airW = 0;
    this.reloadT = 0; this.reloadW = 0;
    for (const j of this._blend) j.quaternion.identity();
    for (const a of this.arms) a.clav.position.copy(a.clavBase);
    if (this.gun) {
      if (this.hold !== 'none') { this.mount.add(this.gun); this.gun.position.set(0, 0, 0); this.gun.quaternion.identity(); }
      this._restoreMag();
    }
    this.update(0, DEF_STATE);
  }

  getHitboxes() { return this.hitboxes; }

  setHighlight(color) {
    if (color === null || color === undefined || color === false) {
      if (this._hl) for (const m of this.meshes) if (m.userData._mat0) { m.material = m.userData._mat0; }
      this._hlColor = null;
      return;
    }
    if (!this._hl) this._hl = new Map();
    const col = new THREE.Color(color);
    const conv = (mat) => {
      if (mat.emissiveIntensity > 1.5) return mat;           // keep glowing parts as they are
      let c = this._hl.get(mat);
      if (!c) { c = mat.clone(); this._hl.set(mat, c); }
      if (c.emissive) { c.emissive.copy(col); c.emissiveIntensity = 0.55; }
      return c;
    };
    for (const m of this.meshes) {
      if (!m.userData._mat0) m.userData._mat0 = m.material;
      const m0 = m.userData._mat0;
      m.material = Array.isArray(m0) ? m0.map(conv) : conv(m0);
    }
    this._hlColor = col;
  }

  dispose() {
    this.setHighlight(null);
    if (this._hl) { for (const c of this._hl.values()) c.dispose(); this._hl = null; }
    if (this.gun) { this._restoreMag(); if (this.gun.parent) this.gun.parent.remove(this.gun); this.gun = null; }
    if (this.root.parent) this.root.parent.remove(this.root);
    this.disposed = true;
  }

  // -------------------------------------------------------------------------------------------------------------------
  update(dt, st = DEF_STATE) {
    if (this.disposed) return;
    st = st || DEF_STATE;
    dt = clamp(dt || 0, 0, 0.1);
    this.time += dt;
    if (st.alive === false && !this.dead) this.die(null, false);
    this.root.updateWorldMatrix(true, false);
    this.root.getWorldQuaternion(_qRoot);
    for (let i = 0; i < this.pulse.length; i++) {
      const p = this.pulse[i];
      p.mesh.scale.copy(p.base).multiplyScalar(1 + 0.07 * Math.sin(this.time * 4.5 + i * 1.9));
    }
    if (this.jaw) this.jaw.rotation.x = 0.22 + 0.12 * (0.5 + 0.5 * Math.sin(this.time * (this.attackT >= 0 ? 14 : 2.3)));
    if (this.dead) { this.deathT += dt; this._animDeath(); return; }

    const d = this.d, zc = this.zc;
    // ---------- smoothed inputs ----------
    this.crouchW += ((st.crouch ? 1 : 0) - this.crouchW) * damp(dt, 9);
    this.airW += ((st.airborne ? 1 : 0) - this.airW) * damp(dt, 12);
    this.spd += (Math.max(0, st.speed || 0) - this.spd) * damp(dt, 8);
    let mx = st.moveX || 0, mz = st.moveZ || 0;
    const ml = Math.hypot(mx, mz);
    if (ml > 0.05) { mx /= ml; mz /= ml; } else { mx = this.dirX; mz = this.dirZ; }
    const kd = damp(dt, 10);
    this.dirX += (mx - this.dirX) * kd; this.dirZ += (mz - this.dirZ) * kd;
    let dl = Math.hypot(this.dirX, this.dirZ);
    if (dl < 1e-3) { this.dirX = 0; this.dirZ = -1; dl = 1; }
    const dx = this.dirX / dl, dz = this.dirZ / dl;
    const sN = this.spd / d.s;
    const moveW = clamp(sN / 0.8, 0, 1), runW = clamp((sN - 2.6) / 2.2, 0, 1);
    const crouchW = this.crouchW, airW = this.airW;

    // ---------- gait: foot targets in root space (stance foot moves at ground speed → no sliding) ----------
    const legLen = d.thigh + d.shin;
    const gaitF = zc ? zc.gait : 1;
    const cycleLen = legLen * (1.3 + 0.24 * Math.min(sN, 8)) * (1 - 0.3 * crouchW) * gaitF;
    if (airW < 0.5) this.phase = (this.phase + (this.spd * dt) / cycleLen) % 1;
    const sf = lerp(0.6, 0.4, runW), stride = sf * cycleLen;
    const liftH = (0.07 + 0.09 * runW) * d.s * (1 - 0.4 * crouchW) * (zc ? zc.lift : 1);
    // ---------- hips ----------
    const bob = moveW * (0.012 + 0.03 * runW) * d.s * (0.5 + 0.5 * Math.cos(this.phase * TAU * 2));
    const hunchDrop = zc ? 0.05 * d.s : 0;
    const crouchDrop = (this.isZombie ? 0.38 : 0.56) * d.s;
    const twist = -0.12 * moveW * Math.cos(TAU * this.phase) * (-dz) * (1 - airW);
    this.hips.position.set(
      Math.sin(this.phase * TAU) * 0.018 * d.s * moveW * (1 - runW) + Math.sin(this.time * 0.6) * 0.004 * d.s,
      d.hipY - 0.018 * d.s - bob - 0.035 * runW * d.s - crouchDrop * crouchW - hunchDrop - airW * 0.03 * d.s,
      0.09 * d.s * crouchW);
    this.hips.rotation.set(0, twist, 0.04 * moveW * Math.sin(TAU * this.phase) * (1 - runW));
    const armed = !!(this.gun && this.hold !== 'none');
    for (const leg of this.legs) {
      const m = leg.m, p = (this.phase + (m < 0 ? 0 : 0.5)) % 1;
      let along, lift = 0, toe = 0;
      if (p < sf) along = stride * (0.5 - p / sf);
      else {
        const t = (p - sf) / (1 - sf);
        along = stride * (-0.5 + smooth(t)); lift = Math.sin(PI * t); toe = Math.sin(PI * t) * (-0.7 + 0.9 * t);
      }
      let nz = armed && !this.isZombie ? (m < 0 ? -0.07 : 0.07) * d.s : 0;
      nz = lerp(nz, (m < 0 ? -0.15 : 0.3) * d.s, crouchW);
      const nx = m * d.footX * (1 + 0.15 * crouchW);
      let fx = nx + dx * along * moveW, fz = nz + dz * along * moveW, fy = d.ankle + lift * liftH * moveW;
      fx = lerp(fx, nx, airW);
      fy = lerp(fy, d.ankle + (m < 0 ? 0.3 : 0.17) * d.s, airW);
      fz = lerp(fz, nz + (m < 0 ? -0.12 : 0.1) * d.s, airW);
      // keep the target inside the leg's reach: lift the heel instead of dragging the planted foot
      const hjx = m * d.hipX - fx, hjz = this.hips.position.z - fz, hjy = this.hips.position.y - d.hipDrop;
      const rr = legLen * 0.985, hh = hjx * hjx + hjz * hjz;
      const minY = hjy - Math.sqrt(Math.max(rr * rr - hh, 0));
      if (fy < minY) { toe -= (minY - fy) * 6 / d.s; fy = minY; }
      leg.tx = fx; leg.ty = fy; leg.tz = fz; leg.p = p;
      leg.toe = lerp(clamp(toe, -1.1, 0.6) * moveW, -0.35, airW);
      if (crouchW > 0.01 && m > 0) leg.toe = lerp(leg.toe, -0.6, crouchW * (1 - moveW)); // back foot on its toes
    }
    const g = this._g || (this._g = {});
    g.moveW = moveW; g.runW = runW; g.dx = dx; g.dz = dz; g.twist = twist;
    g.side = -0.1 * dx * moveW;
    g.lean = (0.08 + 0.14 * runW) * moveW * Math.max(0, -dz) - 0.05 * moveW * Math.max(0, dz) + 0.45 * crouchW + 0.08 * airW;

    // ---------- flinch / attack ----------
    let fl = 0;
    if (this.flinchT > 0) { this.flinchT = Math.max(0, this.flinchT - dt); fl = Math.sin(PI * (1 - this.flinchT / 0.3)); }
    g.flx = this.flX * fl * 0.2; g.flz = this.flZ * fl * 0.2;
    g.atk = -1;
    if (this.attackT >= 0) {
      this.attackT += dt;
      const a = this.attackT / this.attackDur;
      if (a >= 1) this.attackT = -1; else g.atk = a;
    }
    const pitch = clamp(st.pitch || 0, -1.45, 1.45);
    if (this.isZombie) this._upperZombie(dt, st, g, pitch);
    else this._upperSoldier(dt, st, g, pitch);

    // ---------- legs IK ----------
    for (const leg of this.legs) {
      _T.set(leg.tx, leg.ty, leg.tz); this.root.localToWorld(_T);
      const kneel = leg.m > 0 ? crouchW : 0;
      _pole.set(leg.m * 0.12, -0.55 * kneel, -1).applyQuaternion(_qRoot).normalize();
      _qE.copy(_qRoot).multiply(_q1.setFromEuler(_e1.set(leg.toe, leg.m * 0.06, 0)));
      solveIK(leg.thigh, leg.shin, leg.foot, leg.a, leg.b, _T, _pole, -1, _qE);
    }
  }

  // Attack keyframes: writes [yaw, roll, x, y, z, lean, w] into _atk for phase a (0..1)
  _attackCurve(a, W, S) {
    let u, from, to;
    if (a < 0.32) { u = smooth(a / 0.32); from = null; to = W; }
    else if (a < 0.6) { u = smooth((a - 0.32) / 0.28); from = W; to = S; }
    else { u = smooth((a - 0.6) / 0.4); from = S; to = null; }
    for (let i = 0; i < 6; i++) _atk[i] = lerp(from ? from[i] : 0, to ? to[i] : 0, u);
    _atk[6] = a < 0.6 ? 1 : 1 - u;
  }

  _relaxArm(arm, g, ux0 = 0, fx0 = 0) {
    const m = arm.m, sw = Math.cos(TAU * this.phase) * m * (-g.dz >= 0 ? 1 : -1);
    arm.clav.position.copy(arm.clavBase);
    arm.upper.rotation.set(sw * lerp(0.32, 0.75, g.runW) * g.moveW + 0.06 + this.airW * 0.5 + ux0 + 0.025 * Math.sin(this.time * 1.7),
      0, m * (0.12 + this.airW * 0.35 + 0.05 * this.crouchW));
    arm.fore.rotation.set(0.18 + g.runW * 1.1 + g.moveW * 0.15 + this.airW * 0.3 + fx0, 0, 0);
    arm.hand.rotation.set(this.isZombie ? 0.15 : -PI / 2 + 0.12, 0, 0);
  }

  _reachArm(arm, target) {
    arm.clav.position.copy(arm.clavBase);
    _v5.copy(arm.clavBase).applyMatrix4(this.chest.matrixWorld);
    const dist = _v5.distanceTo(target), reach = (arm.a + arm.b) * 0.96;
    if (dist > reach) {
      const ex = Math.min(dist - reach, 0.07 * this.d.s);
      _v5.copy(target); this.chest.worldToLocal(_v5).sub(arm.clavBase).normalize();
      arm.clav.position.addScaledVector(_v5, ex);
    }
  }

  _upperSoldier(dt, st, g, pitch) {
    const d = this.d;
    const holdName = this.gun ? this.hold : 'none';
    const H = HOLD[holdName] || null;
    if (st.firing) this.recoil = 1;
    this.recoil = Math.max(0, this.recoil - dt * 9);
    const rk = this.recoil * this.recoil;
    const reloading = !!(st.reloading && H && H.twoHand);
    this.reloadT = reloading ? this.reloadT + dt : 0;
    this.reloadW += ((reloading ? 1 : 0) - this.reloadW) * damp(dt, 8);
    const rw = this.reloadW;
    const bladeT = H ? H.blade * (1 - 0.5 * rw) : 0;
    this.blade += (bladeT - this.blade) * damp(dt, 6);
    // attack: knife slash / weapon bash
    for (let i = 0; i < 7; i++) _atk[i] = 0;
    if (g.atk >= 0) this._attackCurve(g.atk, SLASH_W, SLASH_S);
    const aYaw = _atk[0], aRoll = _atk[1], aX = _atk[2], aY = _atk[3], aZ = _atk[4], aLean = _atk[5];
    const breath = Math.sin(this.time * 1.7) * 0.014;
    const lean = g.lean;
    this.spine.rotation.set(-lean * 0.5 + pitch * 0.22 + g.flz * 0.6, -g.twist * 0.5 + this.blade * 0.45 + aYaw * 0.25, g.side - g.flx * 0.6);
    this.chest.rotation.set(-lean * 0.5 + pitch * 0.22 + breath + rk * 0.04 + g.flz * 0.4 - aLean, -g.twist * 0.4 + this.blade * 0.55 + aYaw * 0.3, -g.flx * 0.4);
    this.neck.rotation.set(lean * 0.5 + pitch * 0.26 - rk * 0.02, -this.blade * 0.5 - aYaw * 0.3, 0);
    const cheek = H && H.cheek ? 1 - rw : 0;
    this.head.rotation.set(lean * 0.5 + pitch * 0.3 + 0.12 * rw - g.flz * 0.5 - 0.12 * cheek, -this.blade * 0.5 - aYaw * 0.25, g.flx * 0.3 - 0.12 * cheek);

    if (!H) {
      const L = this.arms[0], R = this.arms[1];
      this._relaxArm(L, g);
      this._relaxArm(R, g);
      if (_atk[6] > 0) { // unarmed / carried: right-arm swing
        const w = _atk[6];
        R.upper.rotation.x = lerp(R.upper.rotation.x, 1.2 + aYaw * 0.6, w);
        R.upper.rotation.z = lerp(R.upper.rotation.z, 0.2 + aYaw * 0.6, w);
        R.fore.rotation.x = lerp(R.fore.rotation.x, 0.5 - aYaw * 0.4, w);
      }
      return;
    }
    // ---------- weapon mount (aim frame = root yaw · pitch) ----------
    const aimPitch = pitch * H.pitchF + rk * 0.08 - 0.25 * rw + (holdName === 'melee' ? -0.2 : 0);
    _qAim.copy(_qRoot).multiply(_q1.setFromEuler(_e1.set(aimPitch, aYaw, aRoll - 0.4 * rw, 'YXZ')));
    this.chest.getWorldQuaternion(_q2);
    _v1.set(0, d.shoulderY * 0.92, 0); this.chest.localToWorld(_v1);
    _v2.set(H.off[0] + aX - 0.02 * rw, H.off[1] + aY + 0.02 * rw, H.off[2] + aZ + rk * 0.035 + 0.07 * rw).applyQuaternion(_qAim);
    _v1.add(_v2);
    this.mount.position.copy(this.chest.worldToLocal(_v1));
    this.mount.quaternion.copy(_q2.invert()).multiply(_qAim);
    _qPole.copy(_qRoot).multiply(_q1.setFromEuler(_e1.set(pitch * 0.5, 0, 0)));

    // ---------- right arm → grip ----------
    const R = this.arms[1], L = this.arms[0];
    this._anchorR.getWorldPosition(_T); this._anchorR.getWorldQuaternion(_qA);
    _v3.copy(GRIP.wristR).applyQuaternion(_qA); _T.add(_v3);
    _qE.copy(_qA).multiply(GRIP.qR).multiply(this._handFix);
    _pole.set(H.poleR[0], H.poleR[1], H.poleR[2]).applyQuaternion(_qPole).normalize();
    this._reachArm(R, _T);
    solveIK(R.upper, R.fore, R.hand, R.a, R.b, _T, _pole, 1, _qE);

    // ---------- left arm → handguard / support / reload ----------
    let leftIK = false;
    if (H.twoHand && this._anchorL) {
      this._anchorL.getWorldPosition(_T); this._anchorL.getWorldQuaternion(_qA);
      const pistol = holdName === 'pistol';
      _v3.copy(pistol ? GRIP.wristLp : GRIP.wristL).applyQuaternion(_qA); _T.add(_v3);
      _qE.copy(_qA).multiply(pistol ? GRIP.qLp : GRIP.qL).multiply(this._handFix);
      leftIK = true;
    } else if (holdName === 'pistol') {
      this._anchorR.getWorldPosition(_T); this._anchorR.getWorldQuaternion(_qA);
      _v3.copy(GRIP.wristLp).applyQuaternion(_qA); _T.add(_v3);
      _qE.copy(_qA).multiply(GRIP.qLp).multiply(this._handFix);
      leftIK = true;
    }
    if (leftIK && (rw > 0.01 || this._mag)) this._reloadLeft(rw);
    if (leftIK) {
      _pole.set(H.poleL[0], H.poleL[1], H.poleL[2]).applyQuaternion(_qPole).normalize();
      this._reachArm(L, _T);
      solveIK(L.upper, L.fore, L.hand, L.a, L.b, _T, _pole, 1, _qE);
    } else {
      this._relaxArm(L, g, holdName === 'melee' ? 0.35 : 0.1, holdName === 'melee' ? 1.1 : 0.2);
    }
  }

  // Blends the left-hand target (_T, world) toward the reload path and moves the gun's mag with the hand.
  _reloadLeft(rw) {
    if (rw <= 0.01) { this._restoreMag(); return; }
    const RL = 1.9, u = (this.reloadT % RL) / RL;
    const mount = this.mount, home = this._magHome;
    _v1.copy(_T); mount.worldToLocal(_v1);                                     // H0: handguard (mount local)
    _v2.copy(home).add(_v4.set(-0.07, -0.05, 0.03));                          // H1: on the magazine
    _v3.copy(home).add(_v4.set(-0.12, -0.27, 0.15));                          // H2: down at the vest pouches
    let magT = 0;
    if (u < 0.15) _v4.lerpVectors(_v1, _v2, smooth(u / 0.15));
    else if (u < 0.4) { magT = smooth((u - 0.15) / 0.25); _v4.lerpVectors(_v2, _v3, magT); }
    else if (u < 0.55) { magT = 1; _v4.copy(_v3); }
    else if (u < 0.8) { magT = 1 - smooth((u - 0.55) / 0.25); _v4.lerpVectors(_v2, _v3, magT); }
    else _v4.lerpVectors(_v2, _v1, smooth((u - 0.8) / 0.2));
    if (this._mag) {
      if (this._mag.parent === this.gun && magT > 0) this._mag.position.copy(this._magBase).addScaledVector(_v5.subVectors(_v3, _v2), magT * rw);
      else this._restoreMag();
    }
    mount.localToWorld(_v4);
    _T.lerp(_v4, rw);
    // hand palm up-ish while handling the mag
    _q1.setFromEuler(_e1.set(0, 0, 0.6 * rw));
    _qE.multiply(_q1);
  }

  _upperZombie(dt, st, g, pitch) {
    const zc = this.zc, h = zc.hunch, d = this.d;
    for (let i = 0; i < 7; i++) _atk[i] = 0;
    const lurch = Math.sin(TAU * this.phase) * 0.07 * g.moveW + Math.sin(this.time * 0.9 + this.seed) * 0.04;
    const breath = Math.sin(this.time * (1.3 + g.runW)) * 0.025;
    // attack: claw swipe with alternating arm
    const side = this.attackSide;
    let atkW = 0, twistA = 0, leanA = 0;
    if (g.atk >= 0) {
      this._attackCurve(g.atk, CLAW_W, CLAW_S);
      atkW = _atk[6]; twistA = _atk[0] * side; leanA = _atk[5];
    }
    const lean = g.lean + h * 0.15 * g.runW * (zc.pose === 'trail' ? 2 : 1);
    this.spine.rotation.set(-h * 0.5 - lean * 0.5 + pitch * 0.1 + g.flz * 0.7, -g.twist * 0.5 + twistA * 0.4, lurch + g.side - g.flx * 0.7);
    this.chest.rotation.set(-h * 0.5 - lean * 0.5 + breath + pitch * 0.1 + g.flz * 0.5 - leanA, twistA * 0.6, lurch * 0.5 - g.flx * 0.4);
    this.neck.rotation.set(h * 0.55 + lean * 0.4 + pitch * 0.3, -twistA * 0.3, -lurch * 0.6);
    this.head.rotation.set(h * 0.35 + lean * 0.4 + pitch * 0.35 - g.flz * 0.6 + 0.03 * Math.sin(this.time * 7.3) * (1 - g.moveW),
      Math.sin(this.time * 0.7 + this.seed) * 0.15 - twistA * 0.3, this.headTilt + Math.sin(this.time * 1.1) * 0.06);
    // arms (FK)
    for (const arm of this.arms) {
      const m = arm.m;
      const sw = Math.cos(TAU * this.phase) * m * (-g.dz >= 0 ? 1 : -1) * g.moveW;
      const t = this.time * 1.3 + m * 1.7 + this.seed;
      let ux, uz, fx;
      switch (zc.pose) {
        case 'reach': {
          const hi = arm.m === this.armAsym ? 1 : 0.75;
          ux = (1.25 + 0.1 * Math.sin(t)) * hi + 0.12 * sw - 0.3 * g.runW + h * 0.5; uz = m * (0.1 + 0.05 * Math.sin(t * 0.7)); fx = 0.25 + 0.12 * Math.sin(t * 1.3);
          break;
        }
        case 'trail':
          ux = lerp(0.25 + 0.5 * sw, -0.85 + 0.15 * sw, g.runW) + h * 0.4; uz = m * lerp(0.2, 0.3, g.runW); fx = lerp(0.45, 0.25, g.runW) + 0.1 * Math.sin(t);
          break;
        case 'claw':
          ux = 0.55 + 0.35 * sw + 0.08 * Math.sin(t) + h * 0.4; uz = m * 0.28; fx = 0.9 + 0.15 * Math.sin(t * 1.2);
          break;
        case 'brute':
          ux = 0.15 + 0.4 * sw + h * 0.5; uz = m * 0.32; fx = 0.45 + 0.1 * Math.sin(t);
          break;
        case 'boss':
          if (m > 0) { ux = 0.1 + 0.2 * sw + h * 0.55; uz = 0.3; fx = 0.25; }
          else { ux = 0.45 + 0.35 * sw + h * 0.5; uz = -0.25; fx = 0.7 + 0.1 * Math.sin(t); }
          break;
        default: // hang
          ux = 0.12 + 0.35 * sw + 0.04 * Math.sin(t) + h * 0.45; uz = m * 0.35; fx = 0.35 + 0.2 * g.moveW;
      }
      ux += this.airW * 0.6; uz += m * this.airW * 0.3;
      if (atkW > 0 && m === side) {
        ux = lerp(ux, _atk[2], atkW); uz = lerp(uz, m * _atk[3], atkW); fx = lerp(fx, _atk[4], atkW);
      } else if (atkW > 0) {
        ux = lerp(ux, 0.6, atkW * 0.5);
      }
      arm.clav.position.copy(arm.clavBase);
      arm.clav.position.y += 0.01 * d.s * Math.sin(this.time * 1.3);
      arm.upper.rotation.set(ux, 0, uz);
      arm.fore.rotation.set(fx, 0, 0);
      arm.hand.rotation.set(0.2 + 0.15 * Math.sin(t * 1.7) + (atkW > 0 && m === side ? 0.4 * atkW : 0), 0, 0);
    }
  }

  _animDeath() {
    const d = this.d, dur = this.kind === 'boss' ? 1.4 : 1.0;
    const t = Math.min(this.deathT / dur, 1);
    const fallMax = PI / 2 - 0.035;
    const th = t < 0.82 ? Math.pow(t / 0.82, 2.1) * fallMax : fallMax - Math.sin(((t - 0.82) / 0.18) * PI) * 0.07;
    const lie = th / fallMax;
    this.body.quaternion.setFromAxisAngle(this.fallAxis, th);
    _q1.setFromAxisAngle(_v1.set(0, 1, 0), this.deathSpin * lie);
    this.body.quaternion.premultiply(_q1);
    this.body.position.set(0, this._lift * smooth(clamp(lie * 1.15, 0, 1)), 0);
    const bk = smooth(clamp(t / 0.45, 0, 1));
    this.hips.position.set(0, lerp(this._hipStartY, d.hipY - d.s * 0.16, bk), lerp(this._hipStartZ, 0, bk));
    const w = smooth(clamp(t / 0.4, 0, 1));
    const fz = this.fallDir.z, fx = this.fallDir.x, hsK = this.headshot ? 1 : 0;
    this._dw = w;
    const set = this._dsetB || (this._dsetB = this._dset.bind(this));
    const afz = Math.abs(fz), afx = Math.abs(fx), early = 1 - lie;
    set(0, 0.12 * fz * early - 0.1 * early, this.deathSpin * 0.3, 0.1 * fx * lie);
    set(1, 0.1 * fz * early, this.deathSpin * 0.4, 0.06 * fx * lie);
    set(2, 0.45 * hsK * early - 0.12 * fz * lie, 0, -0.25 * fx);
    set(3, 0.5 * hsK * early - 0.1 * fz * lie, this.deathSpin, (0.35 + 0.2 * this.headTilt) * (fx >= 0 ? 1 : -1) * (0.4 + 0.6 * afz));
    let i = 4;
    for (const arm of this.arms) {
      const m = arm.m, bottom = m * fx > 0;
      arm.clav.position.copy(arm.clavBase);
      const uxFB = -0.25 * fz * lie + 0.5 * early, uzFB = m * (0.3 + 0.9 * lie);
      const uxS = bottom ? 1.3 * lie + 0.4 * early : 0.4, uzS = bottom ? -m * 0.3 * lie : m * 0.1 + fx * 0.6 * lie;
      set(i++, uxFB * afz + uxS * afx, 0, (bottom ? uzFB * afz * afz : uzFB * afz) + uzS * afx);
      set(i++, 0.35 + 0.25 * early, 0, 0);
      set(i++, this.isZombie ? 0.3 : -PI / 2 + 0.4, 0, 0);
    }
    for (const leg of this.legs) {
      const m = leg.m, buck = bk * early;
      set(i++, 0.15 + 0.5 * buck + lie * (0.22 * fz + (m > 0 ? 0.1 : -0.05)), 0, m * 0.08 - fx * 0.1 * lie);
      set(i++, -0.2 - 0.85 * buck - lie * (fz < 0 ? 0.45 * afz : 0.15) - (m > 0 ? 0.12 : 0), 0, 0);
      set(i++, 0.35, 0, 0);
    }
  }
}

CharacterModel.prototype._dset = function (i, x, y, z) {
  _q1.setFromEuler(_e1.set(x, y, z));
  this._blend[i].quaternion.copy(this._blendQ[i]).slerp(_q1, this._dw);
};

const SLASH_W = [0.8, -0.5, 0.1, 0.12, 0.08, -0.05];
const SLASH_S = [-0.9, 0.5, -0.22, -0.12, -0.18, 0.15];
// zombie claw: [twist, -, upperX, upperZ(abduct), foreX, lean]
const CLAW_W = [-0.4, 0, 2.7, 0.5, 1.4, -0.08];
const CLAW_S = [0.5, 0, 0.55, -0.35, 0.15, 0.3];

// =====================================================================================================================
// Soldier build
// =====================================================================================================================
function buildSoldier(c, team, variant) {
  const red = team !== 'blue', v = (((variant | 0) % 4) + 4) % 4;
  const P = {
    uni: red ? M.uniformRed() : M.uniformBlue(),
    vest: red ? M.vestRed() : M.vestBlue(),
    pouch: red ? solid(0x4a4234, { roughness: 0.88 }) : solid(0x15181d, { roughness: 0.85 }),
    web: red ? solid(0x24211c, { roughness: 0.9 }) : solid(0x101318, { roughness: 0.9 }),
    team: red ? M.teamRed() : M.teamBlue(),
    glove: red ? M.gloveTan() : M.glove(),
    helmet: red ? M.helmet() : M.helmetBlack(),
    pad: red ? solid(0x2e2a24, { roughness: 0.6 }) : solid(0x0e1013, { roughness: 0.45 }),
    hair: solid(0x1c1611, { roughness: 0.95 }),
  };
  const skin = (red ? [M.skin, M.skinDark, M.skin, M.skin] : [M.skin, M.skin, M.skinDark, M.skin])[v]();
  const balac = v === 3;
  const face = balac ? solid(0x141414, { roughness: 0.95 }) : skin;
  const eye = solid(0x17110d, { roughness: 0.15 });
  const { hips, spine, chest, neck, head } = c;

  // ---- pelvis / belt ----
  c.add(hips, gSphere(), P.uni, [0, -0.03, 0], [0.33, 0.22, 0.23]);
  c.add(hips, gCyl(), P.web, [0, 0.05, 0], [0.345, 0.06, 0.245]);
  c.add(hips, gRBox(), M.gunmetal(), [0, 0.05, -0.123], [0.055, 0.04, 0.015], null, false);
  c.add(hips, gRBox(), P.pouch, [-0.13, 0.0, 0.11], [0.1, 0.12, 0.07], [0, 0.5, 0]);          // dump pouch
  c.add(hips, gCyl(), P.pouch, [0.165, 0.02, -0.06], [0.065, 0.095, 0.065]);                  // grenade pouch
  // ---- abdomen ----
  c.add(spine, gSphere(), P.uni, [0, 0.08, 0], [0.3, 0.28, 0.21]);
  c.add(spine, gCyl(), P.vest, [0, 0.1, 0], [0.335, 0.15, 0.25]);                             // cummerbund
  // ---- chest / plate carrier ----
  c.add(chest, gSphere(), P.uni, [0, 0.1, 0], [0.39, 0.34, 0.25]);
  c.add(chest, gRBox(), P.vest, [0, 0.07, -0.112], [0.31, 0.3, 0.06], [0.04, 0, 0]);
  c.add(chest, gRBox(), P.vest, [0, 0.09, 0.112], [0.32, 0.31, 0.06], [-0.04, 0, 0]);
  c.add(chest, strapsGeo(), P.web);
  c.add(chest, pouchesGeo(), P.pouch, [0, -0.02, -0.165]);
  c.add(chest, magTopsGeo(), M.polymer(), [0, -0.02, -0.165], null, null, false);
  c.add(chest, gRBox(), P.team, [0.09, 0.17, -0.148], [0.07, 0.045, 0.012], [0.04, 0, 0], false);  // flag patch
  c.add(chest, gRBox(), P.team, [0, 0.17, 0.146], [0.2, 0.04, 0.01], [-0.04, 0, 0], false);       // back ID stripe
  c.add(chest, gRBox(), M.polymer(), [-0.115, 0.16, -0.152], [0.055, 0.1, 0.032], [0.04, 0, 0]);  // radio
  c.add(chest, gCylLo(), M.rubber(), [-0.128, 0.33, -0.152], [0.008, 0.25, 0.008], [0, 0, 0.1], false); // antenna
  if (red && v !== 1) c.add(chest, gRingFat(), solid(0x8a7a58, { roughness: 0.95 }), [0, 0.262, 0.0], [0.17, 0.22, 0.165]); // shemagh
  else c.add(chest, gRingFat(), P.uni, [0, 0.255, 0.0], [0.15, 0.16, 0.145]);                    // collar
  if (red && (v === 0 || v === 2)) c.add(chest, gRBox(), P.pouch, [0, 0.05, 0.18], [0.25, 0.32, 0.09]); // hydration pack
  // ---- neck / head ----
  c.add(neck, limbGeo(0.05, 0.056, 0.1, 0), face, [0, 0.1, 0]);
  c.add(head, gSphere(), face, [0, 0.105, 0.005], [0.19, 0.22, 0.215]);                       // cranium
  c.add(head, gSphere(), face, [0, 0.028, -0.03], [0.15, 0.11, 0.15]);                        // jaw
  c.add(head, gSphere(), face, [0, 0.062, -0.106], [0.03, 0.05, 0.04], [-0.25, 0, 0], false); // nose
  c.add(head, gSphere(), face, [0, 0.106, -0.092], [0.155, 0.028, 0.045], null, false);       // brow
  c.add(head, pairGeo(0.12), face, [0, 0.08, 0.01], [0.097, 0.23, 0.146], null, false);       // ears
  c.add(head, pairGeo(0.35), eye, [0, 0.083, -0.093], [0.034, 0.034, 0.034], null, false);    // eyes
  if (!balac) c.add(head, gBox(), solid(0x6a3a30, { roughness: 0.6 }), [0, 0.03, -0.103], [0.042, 0.007, 0.01], null, false); // mouth
  if (v === 1 || v === 2) c.add(head, gSphere(), P.hair, [0, 0.125, 0.016], [0.198, 0.2, 0.222]);
  if (red && (v === 1 || v === 2)) c.add(head, gSphere(), P.hair, [0, 0.02, -0.034], [0.152, 0.095, 0.15]); // beard
  // ---- headgear ----
  if (v === 0) {           // helmet + NVG mount
    c.add(head, helmetGeo(), P.helmet, [0, 0.125, 0.0], null, [0.25, 0, 0]);
    c.add(head, helmetRailsGeo(), M.polymer(), [0, 0.125, 0.0], null, [0.25, 0, 0]);
    c.add(head, nvgGeo(), M.polymer(), [0, 0.178, -0.13], null, [-0.3, 0, 0]);
    c.add(head, gRing(), P.web, [0, 0.04, -0.012], [0.19, 0.25, 0.2], [0.9, 0, 0], false);   // chin strap
  } else if (v === 1) {    // beret
    c.add(head, gSphere(), red ? solid(0x5c1418, { roughness: 0.9 }) : solid(0x14161b, { roughness: 0.9 }), [-0.012, 0.205, 0.0], [0.235, 0.075, 0.245], [0.05, 0, -0.2]);
    c.add(head, gRing(), solid(0x111111, { roughness: 0.5 }), [0, 0.172, 0.003], [0.2, 0.22, 0.218], null, false);
    c.add(head, gRBox(), M.gold(), [-0.055, 0.19, -0.106], [0.028, 0.032, 0.008], [-0.3, 0, 0], false);
  } else if (v === 2) {    // cap + headset
    const capMat = red ? solid(0x4a4234, { roughness: 0.9 }) : solid(0x1a2232, { roughness: 0.9 });
    c.add(head, capCrownGeo(), capMat, [0, 0.125, 0.005], null, [0.08, 0, 0]);
    c.add(head, brimGeo(), capMat, [0, 0.13, -0.072], [0.2, 0.012, 0.14], [-0.12, 0, 0]);
    c.add(head, headsetGeo(), red ? M.polymerOD() : M.polymer());
  } else {                 // balaclava + goggles
    c.add(head, gSphere(), face, [0, 0.103, 0.004], [0.198, 0.228, 0.222]);
    c.add(head, gRBox(), M.polymer(), [0, 0.088, -0.098], [0.17, 0.052, 0.045]);
    c.add(head, gRBox(), M.goggles(), [0, 0.088, -0.121], [0.152, 0.04, 0.012], null, false);
    c.add(head, gRing(), P.web, [0, 0.092, 0.004], [0.205, 0.3, 0.228], null, false);
  }
  // ---- arms ----
  for (const arm of c.arms) {
    const m = arm.m;
    arm.rU = 0.05; arm.rF = 0.044;
    c.add(arm.upper, gSphere(), P.uni, [m * 0.01, -0.025, 0], [0.12, 0.13, 0.12]);             // deltoid
    c.add(arm.upper, limbGeo(0.05, 0.043, arm.a, 0.08), P.uni);
    c.add(arm.upper, gCyl(), P.team, [0, -0.09, 0], [0.108, 0.045, 0.108]);                   // team armband
    c.add(arm.fore, limbGeo(0.044, 0.035, arm.b - 0.02, 0.1), P.uni);
    c.add(arm.fore, gSphere(), P.pad, [0, -0.005, 0.03], [0.085, 0.085, 0.06]);               // elbow pad
    c.add(arm.fore, gCyl(), P.glove, [0, -arm.b + 0.035, 0], [0.078, 0.06, 0.078]);           // glove cuff
    c.add(arm.hand, gRBox(), P.glove, [0, 0, -0.045], [0.034, 0.085, 0.095]);                 // palm
    c.add(arm.hand, gRBox(), P.glove, [-m * 0.026, -0.003, -0.094], [0.032, 0.08, 0.036]);    // curled fingers
    c.add(arm.hand, gSphere(), P.glove, [-m * 0.024, 0.042, -0.048], [0.024, 0.024, 0.065], [0.3, 0, 0], false); // thumb
  }
  // ---- legs ----
  for (const leg of c.legs) {
    const m = leg.m;
    leg.rT = 0.085; leg.rS = 0.06;
    c.add(leg.thigh, limbGeo(0.085, 0.06, leg.a, 0.08), P.uni, null, [1, 1, 1.05]);
    if (m < 0) c.add(leg.thigh, gRBox(), P.uni, [-0.074, -0.22, -0.005], [0.04, 0.13, 0.11]); // cargo pocket
    else {
      c.add(leg.thigh, gRBox(), M.polymer(), [0.082, -0.17, 0.005], [0.05, 0.17, 0.09]);       // drop-leg holster
      c.add(leg.thigh, gRBox(), M.polymer(), [0.084, -0.055, 0.022], [0.03, 0.075, 0.035], [-0.25, 0, 0], false); // pistol butt
      c.add(leg.thigh, gRing(), P.web, [0, -0.26, 0], [0.155, 0.35, 0.155], null, false);    // leg strap
    }
    c.add(leg.shin, limbGeo(0.06, 0.046, leg.b, 0.1), P.uni);
    c.add(leg.shin, gRBox(), P.pad, [0, -0.015, -0.058], [0.095, 0.11, 0.05]);                // knee pad
    c.add(leg.foot, gCyl(), M.boot(), [0, 0.035, 0.005], [0.1, 0.14, 0.115]);                 // boot shaft
    c.add(leg.foot, gRBox(), M.boot(), [0, -0.035, -0.055], [0.1, 0.07, 0.25]);               // boot
    c.add(leg.foot, gRBox(), M.rubber(), [0, -0.0675, -0.055], [0.106, 0.025, 0.262]);        // sole
  }
}

// =====================================================================================================================
// Zombie build
// =====================================================================================================================
function buildZombie(c, kind, zc, R) {
  const d = c.d, s = d.s, w = d.w, k = d.k, hs = d.hs, sw = s * w, bel = d.belly;
  const skin = M[zc.skin]();
  const eye = zc.eyes === 'R' ? M.eyeGlowRed() : M.eyeGlowYellow();
  const claw = solid(0x1b1712, { roughness: 0.35 });
  const pants = kind === 'heavy' ? solid(0x3a3128, { roughness: 0.95 }) : solid(0x2b313a, { roughness: 0.92 });
  const gore = M.gore(), bone = M.bone(), rag = M.rag();
  const { hips, spine, chest, neck, head } = c;
  const seedK = (c.seed >>> 0) % 4;
  const thick = kind === 'heavy' ? 1.25 : kind === 'boss' ? 1.15 : kind === 'host' ? 1.1 : kind === 'fast' ? 0.85 : 1;

  // ---- pelvis ----
  c.add(hips, gSphere(), kind === 'fast' ? rag : pants, [0, -0.03 * s, 0], [0.34 * sw, 0.24 * s, 0.25 * sw]);
  // ---- abdomen / belly ----
  const bx = 0.3 * sw * (1 + (bel - 1) * 0.6), by = 0.3 * k * (1 + (bel - 1) * 0.35), bz = 0.22 * sw * bel;
  const belly = c.add(spine, gSphere(), skin, [0, 0.08 * k, -0.035 * s * (bel - 1)], [bx, by, bz]);
  // ---- chest ----
  const cw = 0.4 * sw, ch = 0.36 * k, cd = 0.26 * sw;
  c.add(chest, gSphere(), skin, [0, 0.1 * k, 0], [cw, ch, cd]);
  if (kind === 'host' || kind === 'heavy' || kind === 'boss') c.add(chest, gSphere(), skin, [0, 0.25 * k, 0.03 * sw], [cw * 0.85, 0.15 * k, cd * 0.75]); // traps
  const ribs = kind === 'normal' || kind === 'fast' || kind === 'host' || kind === 'boss';
  if (ribs) {
    c.add(chest, gSphereLo(), gore, [-0.03 * sw, 0.1 * k, -0.09 * sw], [cw * 0.62, ch * 0.62, cd * 0.4], null, false);
    c.add(chest, ribsGeo(), bone, [0, 0.21 * k, 0], [cw * 1.05, 0.3 * k, cd * 1.07]);
  }
  // ---- neck ----
  const nr = 0.058 * s * Math.pow(w, 0.6);
  c.add(neck, limbGeo(nr, nr * 1.15, d.neckLen + 0.03 * s, 0), skin, [0, d.neckLen + 0.012 * s, 0]);
  // ---- head ----
  c.add(head, gSphere(), skin, [0, 0.11 * hs, 0.005 * hs], [0.2 * hs, 0.235 * hs, 0.22 * hs]);
  c.jaw = c.add(head, gSphere(), skin, [0, 0.03 * hs, -0.03 * hs], [0.165 * hs, 0.1 * hs, 0.155 * hs]);
  c.add(head, gSphere(), gore, [0, 0.045 * hs, -0.085 * hs], [0.11 * hs, 0.05 * hs, 0.07 * hs], null, false);   // mouth
  c.add(head, teethGeo(), bone, [0, 0.062 * hs, -0.1 * hs], [hs, hs, hs], null, false);
  c.add(head, gSphere(), skin, [0, 0.122 * hs, -0.088 * hs], [0.175 * hs, 0.04 * hs, 0.06 * hs], [0.1, 0, 0]);   // brow ridge
  c.add(head, pairGeo(0.42), eye, [0, 0.095 * hs, -0.1 * hs], [0.036 * hs, 0.026 * hs, 0.022 * hs], null, false);
  c.add(head, gSphere(), skin, [0, 0.07 * hs, -0.112 * hs], [0.035 * hs, 0.04 * hs, 0.035 * hs], null, false);   // nose
  c.add(head, gSphere(), skin, [0.1 * hs, 0.08 * hs, 0.01 * hs], [0.022 * hs, 0.05 * hs, 0.035 * hs], null, false); // ear
  if (kind === 'normal' || kind === 'exploder') c.add(head, gSphereLo(), bone, [-0.055 * hs, 0.19 * hs, 0.0], [0.1 * hs, 0.08 * hs, 0.11 * hs], [0, 0, 0.5]); // skull
  if (kind === 'normal' || kind === 'fast') c.add(head, gSphereLo(), gore, [0.06 * hs, 0.04 * hs, -0.07 * hs], [0.06 * hs, 0.05 * hs, 0.04 * hs], null, false);
  if (kind === 'host') c.add(head, spikesGeo(), bone, [0, 0.11 * hs, 0], [0.2 * hs, 0.22 * hs, 0.2 * hs]);
  if (kind === 'heavy') c.add(head, gRBox(), M.gunmetal(), [0, 0.02 * hs, -0.105 * hs], [0.17 * hs, 0.06 * hs, 0.04 * hs], [0.25, 0, 0]); // iron jaw plate
  if (kind === 'boss') {
    c.add(head, hornsGeo(), bone, null, [hs, hs, hs]);
    c.add(head, pairGeo(0.42), eye, [0, 0.135 * hs, -0.085 * hs], [0.05 * hs, 0.02 * hs, 0.02 * hs], null, false);
  }
  // ---- arms ----
  for (const arm of c.arms) {
    const m = arm.m, big = zc.bigArm && m > 0 ? 1.9 : 1;
    const rU = 0.052 * s * Math.pow(w, 0.8) * thick * big, rF = 0.044 * s * Math.pow(w, 0.8) * thick * big * (big > 1 ? 1.1 : 1);
    arm.rU = rU; arm.rF = rF;
    c.add(arm.upper, gSphere(), skin, [m * 0.01 * s, -0.02 * s, 0], [rU * 2.5, rU * 2.6, rU * 2.4]);  // shoulder
    c.add(arm.upper, limbGeo(rU, rU * 0.85, arm.a, 0.14), skin);
    c.add(arm.fore, limbGeo(rF, rF * 0.78, arm.b, 0.16), skin);
    const hsc = s * (kind === 'fast' ? 1.1 : 1) * Math.pow(big, 0.85) * Math.pow(w, 0.4);
    c.add(arm.hand, clawHandGeo(big > 1 ? 'blade' : zc.claw), [skin, claw], null, [hsc, hsc, hsc]);
    if (kind === 'host' || kind === 'boss') c.add(arm.fore, bladesGeo(), bone, [0, -0.02 * s, rF * 0.6], [s * big, s * big, s * big]);
    if (kind === 'boss') { const r0 = rU / big; c.add(arm.clav, gSphereLo(), bone, [m * 0.03 * s, 0.06 * s + r0 * 0.4 * big, 0], [r0 * 2.6 * Math.sqrt(big), r0 * 1.1, r0 * 2.4 * Math.sqrt(big)], [0, 0, -m * 0.35]); } // shoulder plate
  }
  // torn sleeve (normal)
  if (kind === 'normal') { const a = c.arms[0]; c.add(a.upper, tatterGeo(seedK + 10), ds(rag), [0, -a.a * 0.3, 0], [a.rU * 2.5, a.a * 0.55, a.rU * 2.5]); }
  // ---- legs ----
  for (const leg of c.legs) {
    const m = leg.m;
    const rT = 0.085 * s * Math.pow(w, 0.85) * thick, rS = 0.06 * s * Math.pow(w, 0.85) * thick;
    leg.rT = rT; leg.rS = rS;
    const legMat = kind === 'fast' ? skin : pants;
    c.add(leg.thigh, limbGeo(rT, rT * 0.72, leg.a, 0.1), legMat);
    const bareShin = kind === 'fast' || (kind === 'normal' && m > 0) || kind === 'boss';
    c.add(leg.shin, limbGeo(rS, rS * 0.75, leg.b, 0.14), bareShin ? skin : pants);
    const booted = (kind === 'normal' && m < 0) || kind === 'heavy';
    c.add(leg.foot, gSphere(), booted ? M.boot() : skin, [0, -0.035 * s, -0.06 * s], [0.105 * s * Math.sqrt(w), 0.078 * s, 0.25 * s]);
    if (kind === 'normal' && m > 0) c.add(leg.thigh, tatterGeo(seedK + 20), ds(pants), [0, -leg.a * 0.86, 0], [rT * 2.1, leg.a * 0.36, rT * 2.1]);
    else if (!bareShin) c.add(leg.shin, tatterGeo(seedK + 30), ds(pants), [0, -leg.b * 0.8, 0], [rS * 2.5, leg.b * 0.34, rS * 2.5]);
    if (kind === 'fast') c.add(leg.thigh, tatterGeo(seedK + 40), ds(rag), [0, -leg.a * 0.22, 0], [rT * 2.45, leg.a * 0.42, rT * 2.45]);
  }
  // ---- gore patches ----
  c.add(c.arms[0].upper, gSphereLo(), gore, [0, -0.1 * s, -c.arms[0].rU * 0.7], [c.arms[0].rU * 1.8, 0.08 * s, c.arms[0].rU * 1.2], null, false);
  c.add(c.legs[1].thigh, gSphereLo(), gore, [0, -c.legs[1].a * 0.4, -c.legs[1].rT * 0.75], [c.legs[1].rT * 1.4, 0.1 * s, c.legs[1].rT * 0.7], null, false);

  // ---- kind-specific ----
  if (kind === 'normal') {
    // torn shirt with the front-left torn open (ribs show through)
    c.add(chest, tatterGeo(seedK, 3 * PI / 2 + 0.25, 3 * PI - (3 * PI / 2 + 0.25), 0.42, 0.5), ds(rag), [0, 0.04 * k, 0], [cw * 1.08, 0.52 * k, cd * 1.12]);
  } else if (kind === 'fast') {
    c.add(chest, nubsGeo(), bone, [0, 0.27 * k, cd * 0.42], [0.2 * s, 0.25 * k, 0.2 * s]);
    c.add(spine, nubsGeo(), bone, [0, 0.16 * k, 0.2 * sw * 0.48], [0.16 * s, 0.13 * k, 0.16 * s]);
  } else if (kind === 'host') {
    c.add(chest, spikesGeo(), bone, [0, 0.13 * k, 0.02 * sw], [cw * 1.05, 0.42 * k, cd * 1.1]);
    c.add(chest, gSphereLo(), gore, [0.07 * sw, 0.0, -cd * 0.4], [0.12 * sw, 0.1 * k, 0.05 * sw], null, false);
  } else if (kind === 'heavy') {
    const leather = solid(0x2e1f15, { roughness: 0.7 });
    c.add(spine, gRing(), leather, [0, 0.0, -0.035 * s * (bel - 1)], [bx * 1.0, 0.9 * s, bz * 1.0]);        // belt over the belly
    c.add(chest, gRBox(), leather, [0, 0.1 * k, -cd * 0.47], [0.06 * s, 0.44 * k, 0.025 * s], [0.12, 0, 0.6]); // harness strap
    c.add(chest, gRBox(), leather, [0, 0.1 * k, cd * 0.47], [0.06 * s, 0.44 * k, 0.025 * s], [-0.12, 0, -0.6]);
    c.add(spine, stitchGeo(), solid(0x1a120e, { roughness: 0.8 }), [0.04 * sw, 0.1 * k, -0.035 * s * (bel - 1) - bz * 0.49], [0.6 * s, by * 0.9, 0.6 * s], [0, 0, 0.15], false);
    c.add(c.arms[1].fore, gRing(), M.gunmetal(), [0, -c.arms[1].b * 0.75, 0], [c.arms[1].rF * 2.4, 0.5 * s, c.arms[1].rF * 2.4]); // iron cuff
  } else if (kind === 'exploder') {
    const pus = solid(0xc8ff50, { emissive: 0x9aff30, emissiveIntensity: 2.2, roughness: 0.3 });
    c.add(chest, tatterGeo(seedK + 50, -1.3, 2.6, 0.42, 0.5), ds(rag), [0, 0.04 * k, 0], [cw * 1.08, 0.5 * k, cd * 1.12]); // shirt back only
    const P1 = c.add(spine, pustulesGeo(1 + seedK), pus, [0, 0.08 * k, -0.035 * s * (bel - 1)], [bx * 1.02, by * 1.02, bz * 1.02], null, false);
    const P2 = c.add(chest, pustulesGeo(5 + seedK), pus, [0, 0.12 * k, 0.02 * s], [cw * 0.98, ch * 0.95, cd * 1.02], null, false);
    const P3 = c.add(c.arms[0].upper, pustulesGeo(9), pus, [0, -0.08 * s, 0], [c.arms[0].rU * 2.6, 0.2 * s, c.arms[0].rU * 2.6], null, false);
    const P4 = c.add(c.legs[1].thigh, pustulesGeo(11), pus, [0, -0.15 * s, 0], [c.legs[1].rT * 2.2, 0.25 * s, c.legs[1].rT * 2.2], null, false);
    for (const p of [P1, P2, P3, P4]) c.pulse.push({ mesh: p, base: p.scale.clone() });
    c.pulse.push({ mesh: belly, base: belly.scale.clone() });
  } else if (kind === 'boss') {
    c.add(chest, spikesGeo(), bone, [0, 0.13 * k, 0.03 * sw], [cw * 1.15, 0.5 * k, cd * 1.2]);
    c.add(spine, spikesGeo(), bone, [0, 0.08 * k, 0.0], [bx * 0.9, by * 0.9, bz * 1.1]);
    const core = c.add(chest, gSphere(), M.glowRed(), [-0.02 * sw, 0.11 * k, -cd * 0.3], [0.1 * s, 0.1 * s, 0.07 * s], null, false);
    c.pulse.push({ mesh: core, base: core.scale.clone() });
    c.add(hips, tatterGeo(seedK + 60, PI / 2 + 0.4, PI - 0.8, 0.5, 0.55, 0.5), ds(rag), [0, -0.12 * s, 0], [0.36 * sw, 0.3 * s, 0.27 * sw]); // loincloth
  }
}

// =====================================================================================================================
// Public API
// =====================================================================================================================
export function createSoldier({ team = 'red', variant = 0 } = {}) {
  team = team === 'blue' ? 'blue' : 'red';
  variant = (((variant | 0) % 4) + 4) % 4;
  const c = new CharacterModel({ kind: 'soldier', isZombie: false, dims: makeDims(1.8), seed: variant * 7 + (team === 'blue' ? 3 : 1), team, variant });
  buildSoldier(c, team, variant);
  c._finish();
  return c;
}

export function createZombie({ kind = 'normal', seed } = {}) {
  if (!ZK[kind]) kind = 'normal';
  const zc = ZK[kind];
  seed = seed === undefined || seed === null ? (Math.random() * 1e9) | 0 : seed | 0;
  const c = new CharacterModel({ kind, isZombie: true, dims: makeDims(zc.H, zc), seed, zc });
  buildZombie(c, kind, zc, rng(seed + 17));
  c._finish();
  return c;
}

export const ZOMBIE_KINDS = Object.keys(ZK);
