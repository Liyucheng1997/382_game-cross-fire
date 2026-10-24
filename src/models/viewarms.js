// First-person viewmodel arms: gloved segmented hands that snap to the gun's hand anchors, forearms solved with 2-bone IK
// from fixed (off-screen) shoulders. Also zombie claw arms for zombie-mode first person.
//
// Canonical hand frame (right hand; the left hand is the same geometry mirrored with scale.x = -1):
//   origin = web of the hand (thumb/index crotch), flat fingers along -Z, thumb along +Y, palm faces -X.
//   Fingers curl about local Y toward -X (the palm side), so a vertical grip of ~3 cm sits at x ≈ 0, z ≈ -0.025.
// Hand orientation comes from anchor.userData.handQ (gun anchors themselves have identity rotation).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { M } from '../gfx/materials.js';

const PI = Math.PI;
const GEO = new Map();
const G = (k, fn) => { if (!GEO.has(k)) GEO.set(k, fn()); return GEO.get(k); };
const MATS = new Map();
const lm = (k, fn) => { if (!MATS.has(k)) MATS.set(k, fn()); return MATS.get(k); };
const std = (k, o) => lm(k, () => new THREE.MeshStandardMaterial(o));

const STYLES = {
  red: () => ({ sleeve: M.uniformRed(), cuff: std('cuffRed', { color: 0x2e2a24, roughness: 0.95 }), glove: M.gloveTan(), pad: M.glove(), strap: M.glove(), knuckle: M.polymer(), watch: true }),
  blue: () => ({ sleeve: M.uniformBlue(), cuff: std('cuffBlue', { color: 0x1a2433, roughness: 0.95 }), glove: M.glove(), pad: M.polymer(), strap: std('strapBlue', { color: 0x223047, roughness: 0.8 }), knuckle: M.polymer(), watch: true }),
  hero: () => ({ sleeve: M.obsidian(), cuff: M.gold(), glove: M.obsidian(), pad: M.gold(), strap: M.gold(), knuckle: M.gold(), watch: false, armour: true }),
  zombie: () => ({ sleeve: M.rag(), cuff: M.rag(), glove: M.zombieSkin(), pad: null, strap: null, knuckle: null, watch: false, zombie: true, claw: M.bone() }),
};

// ------------------------------------------------------------------ geometry
const seg = (r, len) => G(`seg${r.toFixed(4)}_${len.toFixed(4)}`, () => new THREE.CapsuleGeometry(r, len, 4, 10).rotateX(PI / 2).translate(0, 0, -len / 2));
const sphere = () => G('sph', () => new THREE.SphereGeometry(1, 16, 12));
const clawGeo = (len, r) => G(`claw${len}${r}`, () => {
  const g = new THREE.ConeGeometry(r, len, 8, 1);
  g.translate(0, len / 2, 0); g.rotateX(-PI / 2 - 0.25); // hooked slightly downward
  return g;
});
function mk(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = false; m.receiveShadow = false; parent.add(m); return m;
}

const FINGERS = [ // knuckle [x, y, z], segment lengths, base radius
  { p: [0.027, -0.006, -0.036], L: [0.044, 0.027, 0.022], r: 0.0094 },
  { p: [0.028, -0.027, -0.038], L: [0.048, 0.03, 0.023], r: 0.0097 },
  { p: [0.027, -0.048, -0.036], L: [0.045, 0.028, 0.022], r: 0.0091 },
  { p: [0.025, -0.067, -0.031], L: [0.036, 0.022, 0.019], r: 0.0081 },
];

// finger curl presets: [index, middle, ring, pinky] x [mcp, pip, dip], thumb { r: root euler [x,y,z], c: [c1, c2] }
const GRIPS = {
  rifle: { f: [[0.3, 1.25, 0.5], [1.3, 1.55, 0.85], [1.35, 1.6, 0.85], [1.4, 1.6, 0.85]], spread: [0.0, 0.05, 0.08, 0.12], thumb: { r: [-0.15, 0.8, 0.2], c: [0.3, 0.25] } },
  pistol: { f: [[0.3, 1.2, 0.5], [1.3, 1.55, 0.85], [1.35, 1.6, 0.85], [1.4, 1.6, 0.85]], spread: [0.0, 0.05, 0.08, 0.12], thumb: { r: [-0.25, 0.55, 0.1], c: [0.1, 0.1] } },
  knife: { f: [[1.45, 1.6, 0.8], [1.5, 1.6, 0.8], [1.5, 1.6, 0.8], [1.5, 1.6, 0.8]], spread: [0, 0.03, 0.06, 0.1], thumb: { r: [0.0, 1.1, 0.5], c: [0.5, 0.4] } },
  grenade: { f: [[1.15, 1.2, 0.6], [1.2, 1.25, 0.6], [1.25, 1.25, 0.6], [1.3, 1.3, 0.6]], spread: [-0.05, 0.03, 0.1, 0.18], thumb: { r: [0.1, 1.0, 0.4], c: [0.4, 0.3] } },
  none: { f: [[0.25, 0.35, 0.2], [0.3, 0.4, 0.2], [0.35, 0.45, 0.25], [0.4, 0.5, 0.25]], spread: [-0.04, 0.0, 0.05, 0.1], thumb: { r: [-0.1, 0.45, 0.0], c: [0.15, 0.1] } },
  support: { f: [[1.15, 1.05, 0.55], [1.2, 1.1, 0.6], [1.25, 1.15, 0.6], [1.3, 1.2, 0.65]], spread: [0.0, 0.04, 0.08, 0.12], thumb: { r: [-0.05, 0.5, 0.0], c: [0.1, 0.1] } },
  supportPistol: { f: [[1.0, 1.1, 0.6], [1.05, 1.15, 0.6], [1.1, 1.2, 0.6], [1.15, 1.25, 0.65]], spread: [0.0, 0.04, 0.08, 0.12], thumb: { r: [-0.2, 0.35, 0.0], c: [0.05, 0.05] } },
  grab: { f: [[0.85, 0.9, 0.45], [0.9, 0.95, 0.5], [0.95, 1.0, 0.5], [1.0, 1.05, 0.55]], spread: [-0.03, 0.02, 0.07, 0.12], thumb: { r: [-0.1, 0.9, 0.3], c: [0.3, 0.2] } },
  claw: { f: [[0.35, 0.45, 0.35], [0.3, 0.45, 0.35], [0.35, 0.5, 0.35], [0.4, 0.5, 0.4]], spread: [-0.12, -0.03, 0.06, 0.16], thumb: { r: [-0.2, 0.7, 0.1], c: [0.3, 0.3] } },
};
export const GRIP_PRESETS = Object.keys(GRIPS);

// builds one hand in the canonical frame; returns { root, fingers, thumb, wrist }
function buildHand(S, { clawLen = 0, thick = 1 } = {}) {
  const root = new THREE.Group();
  const glove = S.glove;
  // palm, thenar & hypothenar pads
  mk(G('palm', () => new RoundedBoxGeometry(0.028, 0.088, 0.09, 3, 0.011)), glove, root, 0.031, -0.04, 0.008).scale.set(thick, 1, 1);
  const th = mk(sphere(), glove, root, 0.022, -0.012, 0.012); th.scale.set(0.017, 0.022, 0.032); th.rotation.set(0.3, 0.4, 0);
  const hy = mk(sphere(), glove, root, 0.026, -0.068, 0.024); hy.scale.set(0.015, 0.02, 0.03);
  // glove details: knuckle guard, back pad, wrist strap
  if (S.knuckle) mk(G('knuckle', () => new RoundedBoxGeometry(0.01, 0.078, 0.02, 2, 0.004)), S.knuckle, root, 0.044, -0.037, -0.034);
  if (S.pad) mk(G('backpad', () => new RoundedBoxGeometry(0.006, 0.06, 0.04, 2, 0.0025)), S.pad, root, 0.0455, -0.04, 0.0);
  if (S.strap) mk(G('strap', () => new RoundedBoxGeometry(0.042, 0.07, 0.022, 2, 0.008)), S.strap, root, 0.029, -0.04, 0.054);
  // wrist / glove gauntlet (oval)
  mk(G('wristCuff', () => new THREE.CylinderGeometry(0.03, 0.028, 0.05, 20).rotateX(PI / 2).scale(0.72, 1, 1)), S.zombie ? glove : S.strap || glove, root, 0.029, -0.04, 0.075);
  if (S.armour) mk(G('heroPlate', () => new RoundedBoxGeometry(0.008, 0.07, 0.07, 2, 0.003)), M.gold(), root, 0.047, -0.04, 0.015);
  // fingers
  const fingers = FINGERS.map((F, i) => {
    const joints = [];
    let parent = root, r = F.r * (S.zombie ? 0.85 : 1);
    F.L.forEach((len, k) => {
      const j = new THREE.Group();
      if (k === 0) j.position.set(...F.p); else j.position.set(0, 0, -F.L[k - 1]);
      parent.add(j);
      const L = S.zombie ? len * 1.12 : len;
      mk(seg(r, L), glove, j);
      if (k === 0 && S.knuckle && !S.armour) { /* knuckle guard covers it */ }
      if (S.armour && k < 2) mk(G('hplate' + k, () => new RoundedBoxGeometry(0.012, 0.016, len * 0.7, 2, 0.002)), M.gold(), j, 0.008, 0, -len * 0.5);
      joints.push(j);
      parent = j; r *= 0.9;
    });
    if (S.zombie && clawLen) {
      const tip = new THREE.Group(); tip.position.set(0, 0, -F.L[2] * 1.12); joints[2].add(tip);
      mk(clawGeo(clawLen * (i === 3 ? 0.8 : 1), 0.0055), S.claw, tip);
    }
    return joints;
  });
  // thumb
  const thumb = [];
  {
    const t0 = new THREE.Group(); t0.position.set(0.02, -0.002, 0.012); t0.rotation.order = 'YXZ'; root.add(t0);
    mk(seg(0.012, 0.03), glove, t0);
    const t1 = new THREE.Group(); t1.position.set(0, 0, -0.03); t0.add(t1); mk(seg(0.0105, 0.028), glove, t1);
    const t2 = new THREE.Group(); t2.position.set(0, 0, -0.028); t1.add(t2); mk(seg(0.0095, 0.022), glove, t2);
    if (S.zombie && clawLen) { const tip = new THREE.Group(); tip.position.set(0, 0, -0.022); t2.add(tip); mk(clawGeo(clawLen * 0.7, 0.005), S.claw, tip); }
    thumb.push(t0, t1, t2);
  }
  return { root, fingers, thumb, wrist: new THREE.Vector3(0.029, -0.04, 0.085) };
}
function poseHand(h, name) {
  const P = GRIPS[name] || GRIPS.none;
  h.fingers.forEach((joints, i) => {
    joints.forEach((j, k) => { j.rotation.set(0, P.f[i][k], 0); });
    joints[0].rotation.x = (P.spread[i] || 0) * 0.5;
  });
  h.thumb[0].rotation.set(P.thumb.r[0], P.thumb.r[1], P.thumb.r[2]);
  h.thumb[1].rotation.set(0, P.thumb.c[0], 0);
  h.thumb[2].rotation.set(0, P.thumb.c[1], 0);
}

// forearm along local -Z from elbow (z = 0) to wrist (z = -len)
function buildForearm(S, len, side, { zombie = false, thick = 1 } = {}) {
  const g = new THREE.Group();
  if (zombie) {
    mk(G('zfa' + len + thick, () => {
      const pts = [];
      for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector2((0.04 - 0.014 * t + 0.003 * Math.sin(t * 19)) * thick, t * len)); }
      return new THREE.LatheGeometry(pts, 14).rotateX(-PI / 2).scale(0.85, 1, 1);
    }), S.glove, g);
    // tendons / veins
    for (const [a, r] of [[0.4, 0.006], [1.6, 0.005], [2.7, 0.0055], [4.1, 0.0045]]) {
      const m = mk(G('tendon' + r + len, () => new THREE.CylinderGeometry(r, r * 0.7, len * 0.85, 6).rotateX(PI / 2)), S.glove, g, Math.cos(a) * 0.028 * thick, Math.sin(a) * 0.032 * thick, -len * 0.5);
      m.rotation.z = a;
    }
    mk(G('ragCuff', () => new THREE.CylinderGeometry(0.05, 0.046, 0.07, 9, 1, true).rotateX(PI / 2)), lm('ragDS', () => { const m = M.rag().clone(); m.side = THREE.DoubleSide; return m; }), g, 0, 0, -0.03);
    return g;
  }
  const sleeveLen = len - 0.07;
  mk(G('fa' + len, () => new THREE.LatheGeometry([[0.0, 0.0], [0.043, 0.0], [0.045, 0.06], [0.04, sleeveLen * 0.7], [0.037, sleeveLen]].map(p => new THREE.Vector2(p[0], p[1])), 18).rotateX(-PI / 2).scale(0.92, 1, 1)), S.sleeve, g);
  mk(G('cuff', () => new THREE.TorusGeometry(0.037, 0.008, 8, 20).scale(0.92, 1, 1)), S.cuff, g, 0, 0, -sleeveLen);
  mk(G('cuff2', () => new THREE.CylinderGeometry(0.041, 0.04, 0.022, 18).rotateX(PI / 2).scale(0.92, 1, 1)), S.cuff, g, 0, 0, -sleeveLen + 0.016);
  mk(G('fskin' + len, () => new THREE.CylinderGeometry(0.03, 0.034, 0.08, 16).rotateX(PI / 2).scale(0.8, 1, 1)), S.armour ? M.gold() : S.glove, g, 0, 0, -len + 0.04);
  if (S.armour) {
    mk(G('bracer', () => new THREE.CylinderGeometry(0.044, 0.05, 0.13, 8).rotateX(PI / 2).scale(0.9, 1, 1)), M.gold(), g, 0, 0, -len + 0.12);
    mk(G('bracerEdge', () => new THREE.TorusGeometry(0.046, 0.004, 6, 8).scale(0.9, 1, 1)), M.obsidian(), g, 0, 0, -len + 0.055);
    mk(G('gemArm', () => new THREE.OctahedronGeometry(0.008, 0)), M.glowRed(), g, 0.045 * side, 0, -len + 0.12);
  }
  if (S.watch && side < 0) {
    mk(G('watchBand', () => new THREE.TorusGeometry(0.0315, 0.005, 6, 20).scale(0.8, 1, 1.6)), M.polymer(), g, 0, 0, -len + 0.03);
    const face = new THREE.Group(); face.position.set(0, 0.031, -len + 0.03); g.add(face);
    mk(G('watchCase', () => new THREE.CylinderGeometry(0.0125, 0.0125, 0.008, 20)), M.steelBright(), face);
    mk(G('watchLens', () => new THREE.CylinderGeometry(0.0105, 0.0105, 0.0015, 20)), M.lens(), face, 0, 0.0045, 0);
    mk(G('watchBezel', () => new THREE.TorusGeometry(0.0115, 0.0016, 6, 20).rotateX(PI / 2)), M.polymer(), face, 0, 0.0045, 0);
  }
  return g;
}
function buildUpperArm(S, len) {
  const g = new THREE.Group();
  mk(G('ua' + len, () => new THREE.CylinderGeometry(0.046, 0.055, len, 14).rotateX(PI / 2).translate(0, 0, -len / 2).scale(0.92, 1, 1)), S.sleeve, g);
  mk(G('elbow', () => new THREE.SphereGeometry(0.047, 14, 10)), S.sleeve, g, 0, 0, -len);
  return g;
}

// ------------------------------------------------------------------ IK helpers (preallocated)
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _u = new THREE.Vector3(), _p = new THREE.Vector3();
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _inv = new THREE.Matrix4();
const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _pos = new THREE.Vector3();
const DEFAULT_RQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0, 0));
const DEFAULT_LQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.9, 1.4));
const ONE = new THREE.Vector3(1, 1, 1), MIRROR = new THREE.Vector3(-1, 1, 1);

class Arm {
  constructor(S, side, opts) {
    this.side = side;
    this.a = 0.32; this.b = 0.29;
    this.shoulder = new THREE.Vector3(0.22 * side, -0.32, 0.25);
    this.pole = new THREE.Vector3(0.6 * side, -1, 0.25).normalize();
    this.hand = buildHand(S, opts);
    this.forearm = buildForearm(S, this.b, side, opts);
    this.upper = buildUpperArm(S, this.a);
    this.hand.root.matrixAutoUpdate = false;
    this.elbow = new THREE.Vector3();
    this.target = null; this.targetQ = new THREE.Quaternion();
  }
  addTo(o) { o.add(this.upper, this.forearm, this.hand.root); }
  setVisible(v) { this.upper.visible = this.forearm.visible = this.hand.root.visible = v; }
  // place the hand from an anchor object (in world space) and solve the arm, all in `space` (the ViewArms object3d) local coordinates
  solve(space, anchorObj, handQ, restPos, restQ) {
    const hm = _m1;
    if (anchorObj) {
      anchorObj.updateWorldMatrix(true, false);
      _inv.copy(space.matrixWorld).invert();
      _m2.compose(_pos.set(0, 0, 0), handQ, ONE);
      hm.multiplyMatrices(_inv, anchorObj.matrixWorld).multiply(_m2);
      hm.decompose(_pos, _q, _s);
    } else { _pos.copy(restPos); _q.copy(restQ); }
    this.hand.root.matrix.compose(_pos, _q, this.side < 0 ? MIRROR : ONE);
    this.hand.root.matrixWorldNeedsUpdate = true;
    // wrist point in space coordinates
    const W = _v1.copy(this.hand.wrist).applyMatrix4(this.hand.root.matrix);
    // two-bone IK shoulder -> elbow -> wrist, shoulder slides forward when out of reach
    const S = _v2.copy(this.shoulder), a = this.a, b = this.b;
    _u.subVectors(W, S); let d = _u.length(); _u.divideScalar(d || 1);
    if (d > a + b - 0.002) { S.copy(W).addScaledVector(_u, -(a + b - 0.002)); d = a + b - 0.002; }
    d = Math.max(d, Math.abs(a - b) + 0.01);
    const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    _p.copy(this.pole).addScaledVector(_u, -this.pole.dot(_u)).normalize();
    const E = this.elbow.copy(S).addScaledVector(_u, a * cosA).addScaledVector(_p, a * sinA);
    // orient segments (-Z toward the next joint); roll the forearm with the back of the hand
    _v3.set(this.side, 0, 0).applyQuaternion(_q); // back-of-hand direction (canonical +X, mirrored for the left)
    lookAlong(this.upper, S, E, _p);
    lookAlong(this.forearm, E, W, _v3);
  }
}
const _lm = new THREE.Matrix4(), _up = new THREE.Vector3();
function lookAlong(obj, from, to, upHint) {
  _up.copy(upHint);
  _lm.lookAt(from, to, _up);
  obj.position.copy(from);
  obj.quaternion.setFromRotationMatrix(_lm);
}

export class ViewArms {
  constructor({ style = 'red' } = {}) {
    this.style = STYLES[style] ? style : 'red';
    const S = STYLES[this.style]();
    const opts = S.zombie ? { zombie: true, clawLen: 0.035 } : {};
    this.object3d = new THREE.Group();
    this.object3d.name = 'viewArms';
    this.right = new Arm(S, 1, opts);
    this.left = new Arm(S, -1, opts);
    this.right.addTo(this.object3d); this.left.addTo(this.object3d);
    this.gun = null;
    this.grip = 'none';
    this.leftTarget = null;
    this.restR = new THREE.Vector3(0.16, -0.22, -0.32);
    this.restL = new THREE.Vector3(-0.16, -0.22, -0.32);
    this.setGrip(S.zombie ? 'claw' : 'none');
  }
  attach(gun) {
    if (this.gun && this.gun.parent === this.object3d && this.gun !== gun) this.object3d.remove(this.gun);
    this.gun = gun || null;
    this.leftTarget = null;
    if (gun) {
      this.object3d.add(gun);
      const ud = gun.userData;
      this.setGrip(ud.grip || (ud.kind === 'pistol' ? 'pistol' : ud.kind === 'melee' ? 'knife' : ud.kind === 'grenade' ? 'grenade' : 'rifle'));
    } else this.setGrip('none');
    this.update();
  }
  setGrip(name) {
    this.grip = GRIPS[name] ? name : 'none';
    poseHand(this.right.hand, this.style === 'zombie' && this.grip === 'none' ? 'claw' : this.grip);
    this._poseLeft();
  }
  // temporarily retarget the left hand (e.g. to the magazine during reload); null restores the gun's leftHand anchor
  setLeftTarget(obj) { this.leftTarget = obj || null; this._poseLeft(); }
  _poseLeft() {
    let p = this.grip === 'pistol' ? 'supportPistol' : this.grip === 'none' ? 'none' : 'support';
    if (this.leftTarget) p = 'grab';
    if (this.style === 'zombie' && !this.gun) p = 'claw';
    poseHand(this.left.hand, p);
  }
  update() {
    const o = this.object3d;
    o.updateWorldMatrix(true, true);
    const A = this.gun?.userData.anchors || NO_ANCHORS;
    const rA = A.rightHand || null;
    this.right.solve(o, rA, handQOf(rA, DEFAULT_RQ), this.restR, DEFAULT_RQ);
    let lA = A.leftHand || null;
    if (this.leftTarget) lA = this.leftTarget.getObjectByName?.('handGrab') || this.leftTarget;
    const showLeft = !!lA || !this.gun;
    this.left.setVisible(showLeft);
    if (showLeft) this.left.solve(o, lA, handQOf(lA, DEFAULT_LQ), this.restL, DEFAULT_LQ);
  }
}
const NO_ANCHORS = Object.freeze({});
const _hq = new THREE.Quaternion();
function handQOf(a, def) {
  const q = a?.userData?.handQ;
  return q ? _hq.set(q[0], q[1], q[2], q[3]) : def;
}

// ------------------------------------------------------------------ zombie claws (zombie-mode first person)
const ZK = {
  normal: { mat: () => M.zombieSkin(), claw: 0.045, thick: 1 },
  host: { mat: () => M.zombieSkinRed(), claw: 0.07, thick: 1.15, spikes: true },
  fast: { mat: () => M.zombieSkinGrey(), claw: 0.06, thick: 0.85 },
  heavy: { mat: () => M.zombieSkin(), claw: 0.04, thick: 1.35 },
  exploder: { mat: () => M.zombieSkin(), claw: 0.035, thick: 1.05, pustules: true },
  boss: { mat: () => M.zombieSkinRed(), claw: 0.09, thick: 1.4, spikes: true },
};
export function buildZombieClaws(kind = 'normal') {
  const K = ZK[kind] || ZK.normal;
  const S = { glove: K.mat(), claw: M.bone(), zombie: true };
  const make = side => {
    const g = new THREE.Group(); g.name = 'zombieClaw_' + (side > 0 ? 'R' : 'L');
    const h = buildHand(S, { clawLen: K.claw, thick: K.thick });
    poseHand(h, 'claw');
    // palm down, wrist at the origin
    const hp = new THREE.Group(); hp.rotation.z = PI / 2; g.add(hp);
    h.root.position.copy(h.wrist).negate(); hp.add(h.root);
    h.root.scale.setScalar(K.thick > 1 ? 1 + (K.thick - 1) * 0.5 : 1);
    const fa = buildForearm(S, 0.32, side, { zombie: true, thick: K.thick });
    fa.position.z = 0.32; // elbow end at +Z, wrist at the origin
    g.add(fa);
    if (K.spikes) for (let i = 0; i < 4; i++) {
      const sp = mk(G('zspike', () => new THREE.ConeGeometry(0.008, 0.045, 6).translate(0, 0.0225, 0)), M.bone(), g, 0, 0.03 * K.thick, 0.06 + i * 0.06);
      sp.rotation.x = -0.6;
    }
    if (K.pustules) for (let i = 0; i < 5; i++) {
      const p = mk(sphere(), M.glowGreen(), g, (i % 2 ? 0.02 : -0.02), 0.028, 0.05 + i * 0.05); p.scale.setScalar(0.009 + (i % 3) * 0.003);
    }
    if (side < 0) g.scale.x = -1;
    g.userData.hand = h;
    return g;
  };
  return { left: make(-1), right: make(1) };
}
