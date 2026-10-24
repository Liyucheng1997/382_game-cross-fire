// Procedural weapon models (CF arsenal).
// Gun frame: origin = right-hand grip point (web of the hand, top-back of the pistol grip), bore along -Z, +Y up, +X right, metres.
// Internally every part is placed with (x, y, f) where f = forward distance = -z, and side profiles are drawn in the (f, y) plane.
// Each mesh carries userData.role ('recv' | 'metal' | 'poly' | 'wood' ...) so variants can remap materials.
// Hand anchors have IDENTITY rotation (position only). anchor.userData.handQ = [x,y,z,w] is the viewmodel hand orientation
// (relative to the anchor's parent) in the canonical "handshake" hand frame used by viewarms.js:
//   fingers (flat) along local -Z, thumb along local +Y, palm toward local -X for the right hand / +X for the (mirrored) left hand.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, solid } from '../gfx/materials.js';

const PI = Math.PI, V3 = THREE.Vector3;
const LOCAL = new Map();
const lm = (k, fn) => { if (!LOCAL.has(k)) LOCAL.set(k, fn()); return LOCAL.get(k); };
const GEO = new Map();
const G = (k, fn) => { if (!GEO.has(k)) GEO.set(k, fn()); return GEO.get(k); };

// ------------------------------------------------------------------ materials by role
const STD = (k, o) => lm(k, () => new THREE.MeshStandardMaterial(o));
const MAT = {
  recv: () => M.gunmetal(), metal: () => M.blued(), bright: () => M.steelBright(),
  alu: () => STD('alu', { color: 0x25272b, metalness: 0.75, roughness: 0.42 }),
  dark: () => STD('dark', { color: 0x050506, metalness: 0.2, roughness: 0.85 }),
  poly: () => M.polymer(), tan: () => M.polymerTan(), od: () => M.polymerOD(), wood: () => M.wood(), rubber: () => M.rubber(),
  brass: () => M.brass(), copper: () => M.copper(), lens: () => M.lens(), blade: () => M.bladeSteel(),
  glowR: () => M.glowRed(), glowG: () => M.glowGreen(), cyan: () => M.glowCyan(), white: () => M.white(),
  gold: () => M.gold(), crimson: () => M.crimson(), obsidian: () => M.obsidian(),
  goldDark: () => STD('goldDark', { color: 0xb07a1e, metalness: 1, roughness: 0.3 }),
  stainless: () => STD('stainless', { color: 0xb4b8bd, metalness: 1, roughness: 0.28 }),
  darkSteel: () => STD('darkSteel', { color: 0x2a2d33, metalness: 1, roughness: 0.2 }),
  glass: () => lm('glass', () => new THREE.MeshPhysicalMaterial({ color: 0x9fd0ff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false })),
  amber: () => lm('amber', () => new THREE.MeshPhysicalMaterial({ color: 0x7a6a48, metalness: 0, roughness: 0.25, transparent: true, opacity: 0.6, clearcoat: 1 })),
  gren: () => STD('gren', { color: 0x4b5132, metalness: 0.3, roughness: 0.6 }),
  grenGrey: () => STD('grenGrey', { color: 0x5d6266, metalness: 0.5, roughness: 0.45 }),
  bandG: () => STD('bandG', { color: 0x2f9a3a, metalness: 0.1, roughness: 0.5 }),
  bandY: () => STD('bandY', { color: 0xd0a020, metalness: 0.1, roughness: 0.5 }),
  red: () => STD('redPlastic', { color: 0x9a1a14, metalness: 0, roughness: 0.45 }),
  cord: () => STD('cord', { color: 0x2b2a24, metalness: 0, roughness: 0.95 }),
};
const matFor = role => (MAT[role] || MAT.recv)();

export const VARIANTS = {
  gold: { name: '黄金', map: { stainless: 'gold', recv: 'gold', metal: 'gold', alu: 'gold', bright: 'gold', poly: 'poly', tan: 'poly', od: 'poly', wood: 'poly', blade: 'gold', gren: 'gold', grenGrey: 'gold' } },
  qilin: { name: '火麒麟', ornament: 'qilin', map: { stainless: 'crimson', recv: 'crimson', alu: 'crimson', poly: 'crimson', tan: 'crimson', od: 'crimson', wood: 'crimson', metal: 'goldDark', bright: 'gold', gren: 'crimson', grenGrey: 'gold' } },
  heilong: { name: '黑龙', ornament: 'heilong', map: { stainless: 'obsidian', recv: 'obsidian', alu: 'obsidian', poly: 'obsidian', tan: 'obsidian', od: 'obsidian', wood: 'obsidian', metal: 'darkSteel', bright: 'gold', blade: 'darkSteel', gren: 'obsidian', grenGrey: 'gold' } },
};

// ------------------------------------------------------------------ geometry helpers
// mesh placed at (x, y, f); rx > 0 tilts the nose up
function mesh(geo, role, parent, x = 0, y = 0, f = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, matFor(role));
  m.userData.role = role;
  m.position.set(x, y, -f); m.rotation.set(rx, ry, rz);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
function group(parent, name, x = 0, y = 0, f = 0) {
  const g = new THREE.Group(); if (name) g.name = name; g.position.set(x, y, -f); parent.add(g); return g;
}
// closed polygon with optional rounded corners: pts = [[f, y, r?], ...]
function rpath(pts, P = new THREE.Shape()) {
  const n = pts.length, pt = i => pts[(i + n) % n];
  pts.forEach((p, i) => {
    const r = p[2] || 0;
    if (!r) { i ? P.lineTo(p[0], p[1]) : P.moveTo(p[0], p[1]); return; }
    const a = pt(i - 1), b = pt(i + 1);
    const d1 = Math.hypot(a[0] - p[0], a[1] - p[1]) || 1, d2 = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1;
    const r1 = Math.min(r, d1 * 0.5), r2 = Math.min(r, d2 * 0.5);
    const s = [p[0] + (a[0] - p[0]) / d1 * r1, p[1] + (a[1] - p[1]) / d1 * r1], e = [p[0] + (b[0] - p[0]) / d2 * r2, p[1] + (b[1] - p[1]) / d2 * r2];
    i ? P.lineTo(s[0], s[1]) : P.moveTo(s[0], s[1]);
    P.quadraticCurveTo(p[0], p[1], e[0], e[1]);
  });
  P.closePath();
  return P;
}
// side-profile extrusion, centred on x = 0, width w across X
function ext(pts, w, o = {}) {
  const b = o.bevel ?? Math.min(0.0014, w * 0.18);
  const s = rpath(pts);
  if (o.holes) for (const h of o.holes) s.holes.push(rpath(h, new THREE.Path()));
  const depth = Math.max(w - 2 * b, 0.0002);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.8, bevelSegments: o.bs ?? 2, curveSegments: o.cs ?? 6 });
  g.translate(0, 0, -depth / 2); g.rotateY(PI / 2);
  if (o.taper) taper(g, o.taper);
  g.computeVertexNormals();
  return g;
}
// scale vertex x by fn(f, y) (wedge blades, tapered grips)
function taper(g, fn) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * fn(-p.getZ(i), p.getY(i)));
  p.needsUpdate = true;
  return g;
}
// lathe around the bore: prof = [[radius, f], ...] (f ascending = forward)
function lathe(prof, seg = 28) {
  const g = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(Math.max(p[0], 0.00001), p[1])), seg);
  g.rotateX(-PI / 2);
  return g;
}
const cylZ = (r, len, seg = 20, rf = r, open = false) => new THREE.CylinderGeometry(rf, r, len, seg, 1, open).rotateX(-PI / 2); // top (rf) forward
const cylX = (r, len, seg = 16) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(PI / 2);
const cylY = (r, len, seg = 16, rt = r) => new THREE.CylinderGeometry(rt, r, len, seg);
const box = (w, h, l) => new THREE.BoxGeometry(w, h, l);
// many boxes merged into one geometry: [[w, h, l, x, y, f, rx?, ry?, rz?], ...]
function boxes(list) {
  return mergeGeometries(list.map(([w, h, l, x, y, f, rx = 0, ry = 0, rz = 0]) => {
    const g = new THREE.BoxGeometry(w, h, l);
    if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
    return g.translate(x, y, -f);
  }));
}
// many cylinders along X merged: [[r, len, x, y, f], ...]
function pinsX(list, seg = 10) {
  return mergeGeometries(list.map(([r, len, x, y, f]) => cylX(r, len, seg).translate(x, y, -f)));
}
// row of side vent / slot holes on both sides: dark inset plates
function sideSlots(parent, { f0, f1, n, y, x, h = 0.006, l, both = true, role = 'dark', ry = 0 }) {
  const list = [], step = (f1 - f0) / n;
  for (let i = 0; i < n; i++) {
    const f = f0 + step * (i + 0.5);
    list.push([0.0012, h, l ?? step * 0.55, x, y, f, 0, ry]);
    if (both) list.push([0.0012, h, l ?? step * 0.55, -x, y, f, 0, -ry]);
  }
  return mesh(boxes(list), role, parent);
}
// picatinny rail (one merged mesh), top of teeth at y + 0.0085
function rail(parent, f0, f1, y, { x = 0, w = 0.021, role = 'alu', rz = 0 } = {}) {
  const len = f1 - f0;
  const geo = G(`rail${len.toFixed(4)}_${w}`, () => {
    const L = [[w * 0.72, 0.0042, len, 0, 0.0021, 0], [w, 0.0022, len, 0, 0.0047, 0]];
    const n = Math.max(1, Math.floor(len / 0.01)), off = (len - n * 0.01) / 2;
    for (let i = 0; i < n; i++) L.push([w * 0.84, 0.0028, 0.0052, 0, 0.0071, -len / 2 + off + 0.005 + i * 0.01]);
    return boxes(L);
  });
  return mesh(geo, role, parent, x, y, (f0 + f1) / 2, 0, 0, rz);
}
// domed screw head facing +X (side = 1) or -X (side = -1)
function screw(parent, x, y, f, side = 1, r = 0.0026, role = 'bright') {
  const geo = G('screw' + r, () => lathe([[0, 0.0014], [r * 0.75, 0.0011], [r, 0.0005], [r, 0]], 12).rotateY(-PI / 2));
  return mesh(geo, role, parent, x, y, f, 0, side > 0 ? 0 : PI, 0);
}
function screws(parent, w, y, fs, r, role) { for (const f of fs) { screw(parent, w / 2, y, f, 1, r, role); screw(parent, -w / 2, y, f, -1, r, role); } }
// trigger guard (U profile) + pivoting trigger group; returns trigger group
function triggerSet(parent, { fb, ff, y, d = 0.028, w = 0.011, t = 0.0045, role = 'recv', trigRole = 'bright', ft = (fb + ff) / 2 - 0.004, th = 0.021 }) {
  mesh(ext([[fb, y], [fb, y - d, 0.012], [ff, y - d, 0.012], [ff, y], [ff - t, y], [ff - t, y - d + t, 0.009], [fb + t, y - d + t, 0.009], [fb + t, y]], w, { bevel: 0.001 }), role, parent);
  const trig = group(parent, 'p_trigger', 0, y, ft);
  mesh(ext([[-0.003, 0.004], [0.003, 0.004], [0.0035, -th * 0.4], [0.006, -th * 0.85, 0.003], [0.0045, -th], [0.0005, -th * 0.6, 0.003], [-0.003, -th * 0.15]], 0.0055, { bevel: 0.0008 }), trigRole, trig);
  mesh(pinsX([[0.0016, w + 0.004, 0, y + 0.004, ft]]), 'bright', parent);
  return trig;
}
// pistol grip from a side profile; top-back corner sits at origin; rake = backward lean of the grip (rad)
function pistolGrip(parent, { len = 0.105, top = 0.045, bot = 0.04, w = 0.032, rake = 0.3, role = 'poly', f = 0, y = 0, swell = true, grooves = 3 }) {
  const s = Math.sin(rake), c = Math.cos(rake);
  const P = (u, v) => [f + u * c - v * s, y + u * -s - v * c]; // u = forward across grip, v = down along grip
  const pts = [P(-0.004, -0.002), P(top, -0.002), P(top, 0.012), [...P(bot + 0.004, len * 0.45), 0.02]];
  // finger grooves on the front strap
  for (let i = 1; i <= grooves; i++) { const v = 0.012 + (len * 0.78) * i / (grooves + 1); pts.push([...P(bot + 0.002, v), 0.006]); pts.push([...P(bot - 0.003, v + 0.006), 0.006]); }
  pts.push([...P(bot + 0.004, len - 0.006), 0.006], [...P(bot + 0.006, len), 0.004], [...P(-0.006, len + 0.002), 0.008], [...P(-0.008, len * 0.5), 0.03], [...P(-0.006, 0.01), 0.01]);
  const g = ext(pts, w, { bevel: 0.0035, bs: 3, taper: swell ? ((ff, yy) => 0.86 + 0.14 * Math.sin(Math.min(1, Math.max(0, (y - yy) / len)) * PI)) : null });
  return mesh(g, role, parent);
}
// lathe-built picatinny-free cylindrical sight post etc.
function frontSightA2(parent, f, y0, yBore, role = 'recv') {
  // triangular sight base from barrel to post, with protective ears
  mesh(ext([[f - 0.03, yBore - 0.012], [f - 0.006, y0 + 0.004, 0.006], [f + 0.01, y0 + 0.004, 0.004], [f + 0.014, yBore - 0.012]], 0.018, { bevel: 0.0015 }), role, parent);
  mesh(ext([[f - 0.008, y0], [f - 0.006, y0 + 0.024, 0.003], [f + 0.006, y0 + 0.024, 0.003], [f + 0.008, y0]], 0.003), role, parent, 0.0075);
  mesh(ext([[f - 0.008, y0], [f - 0.006, y0 + 0.024, 0.003], [f + 0.006, y0 + 0.024, 0.003], [f + 0.008, y0]], 0.003), role, parent, -0.0075);
  mesh(cylY(0.0016, 0.02, 8, 0.0011), 'bright', parent, 0, y0 + 0.012, f);
  mesh(cylZ(0.0145, 0.014, 20), role, parent, 0, yBore, f - 0.006); // barrel collar
  mesh(pinsX([[0.0017, 0.034, 0, yBore - 0.006, f - 0.012], [0.0014, 0.022, 0, yBore + 0.008, f + 0.002]]), 'bright', parent);
}
// A2 birdcage flash hider
function birdcage(parent, f, y, r = 0.011, len = 0.055, role = 'metal') {
  mesh(lathe([[0.0045, 0], [r * 0.82, 0], [r * 0.82, 0.008], [r, 0.012], [r, len - 0.003], [r * 0.92, len], [r * 0.6, len], [r * 0.6, len - 0.005], [0.005, len - 0.02]], 20), role, parent, 0, y, f);
  const L = [];
  for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2 + PI / 2; L.push([0.0028, 0.0012, len * 0.55, Math.cos(a) * r, Math.sin(a) * r, f + len * 0.6, 0, 0, a + PI / 2]); }
  mesh(boxes(L), 'dark', parent, 0, y, 0);
}
// suppressor: lathe body with end caps and grip rings
function suppressor(parent, f, y, { r = 0.019, len = 0.17, role = 'metal' } = {}) {
  const g = group(parent, 'p_suppressor', 0, y, f);
  mesh(lathe([[0.006, -0.012], [r * 0.7, -0.012], [r * 0.72, 0], [r * 0.96, 0.004], [r, 0.012], [r, len - 0.01], [r * 0.95, len - 0.003], [r * 0.8, len], [0.0055, len], [0.0045, len - 0.01]], 32), role, g);
  mesh(mergeGeometries([0.02, 0.028, len - 0.02].map(ff => new THREE.TorusGeometry(r + 0.0004, 0.0012, 6, 32).translate(0, 0, -ff))), 'bright', g);
  mesh(boxes(Array.from({ length: 8 }, (_, i) => { const a = i / 8 * PI * 2; return [0.0012, 0.0035, 0.012, Math.cos(a) * (r + 0.0002), Math.sin(a) * (r + 0.0002), len - 0.05, 0, 0, a]; })), 'dark', g);
  return g;
}
// riflescope; f0 = eyepiece (rear) end. Returns eye-point f (behind eyepiece).
function scope(parent, { f0, len, y, x = 0, r = 0.0127, rObj = 0.023, rEye = 0.019, objLen = 0.075, eyeLen = 0.07, role = 'alu', rings = null, ringBase = null, turrets = true }) {
  const g = group(parent, 'scope', x, y, f0);
  mesh(lathe([[rEye * 0.78, -0.002], [rEye * 0.98, 0], [rEye, 0.006], [rEye, eyeLen * 0.45], [rEye * 0.94, eyeLen * 0.5], [rEye * 0.94, eyeLen * 0.75], [r * 1.18, eyeLen], [r, eyeLen + 0.012],
    [r, len - objLen - 0.01], [r * 1.12, len - objLen], [rObj * 0.97, len - 0.025], [rObj, len - 0.012], [rObj, len], [rObj * 0.9, len + 0.002], [rObj * 0.82, len - 0.004]], 40), role, g);
  // magnification ring knurl
  mesh(boxes(Array.from({ length: 18 }, (_, i) => { const a = i / 18 * PI * 2; return [0.0016, 0.0016, eyeLen * 0.22, Math.cos(a) * rEye * 0.95, Math.sin(a) * rEye * 0.95, eyeLen * 0.62, 0, 0, a]; })), role, g);
  const front = mesh(new THREE.CircleGeometry(rObj * 0.84, 32), 'lens', g, 0, 0, len - 0.004, 0, PI, 0);
  mesh(new THREE.CircleGeometry(rEye * 0.72, 32), 'lens', g, 0, 0, 0.002);
  mesh(new THREE.TorusGeometry(rObj * 0.9, 0.0012, 6, 32), 'bright', g, 0, 0, len - 0.002);
  front.castShadow = false;
  if (turrets) {
    const tf = len - objLen - 0.01 - (len - objLen - eyeLen - 0.022) / 2;
    mesh(lathe([[r * 1.25, 0], [r * 1.25, 0.012], [r * 0.9, 0.012]], 16), role, g, 0, 0, tf, PI / 2); // saddle
    mesh(cylY(0.0105, 0.016, 24), role, g, 0, r + 0.012, tf);
    mesh(cylY(0.0112, 0.007, 24), 'rubber', g, 0, r + 0.022, tf);
    mesh(cylX(0.0105, 0.018, 24), role, g, r + 0.012, 0, tf);
    mesh(cylX(0.0112, 0.007, 24), 'rubber', g, r + 0.022, 0, tf);
    mesh(cylX(0.009, 0.014, 20), role, g, -r - 0.009, 0, tf);
    mesh(boxes([[0.0008, 0.002, 0.01, 0, r + 0.0265, tf], [0.002, 0.0008, 0.01, r + 0.0265, 0, tf]]), 'white', g);
  }
  if (rings) {
    for (const rf of rings) {
      mesh(new THREE.TorusGeometry(r + 0.0025, 0.003, 8, 24).scale(1, 1, 2.2), role, g, 0, 0, rf);
      mesh(boxes([[0.018, ringBase ?? 0.02, 0.012, 0, -(r + (ringBase ?? 0.02) / 2), rf], [0.026, 0.004, 0.006, 0, r + 0.0045, rf]]), role, g);
      screw(g, 0.013, r + 0.0045, rf, 1, 0.002);
      screw(g, 0.011, -(r + (ringBase ?? 0.02) * 0.6), rf, 1, 0.0022);
    }
  }
  return g;
}
// holographic sight (EOTech-like) sitting on a rail top at y
function holo(parent, f, y) {
  const g = group(parent, 'holo', 0, y, f);
  mesh(ext([[-0.05, 0], [-0.05, 0.012, 0.004], [0.045, 0.012, 0.004], [0.048, 0]], 0.03, { bevel: 0.002 }), 'alu', g);
  mesh(boxes([[0.004, 0.036, 0.055, 0.017, 0.031, 0], [0.004, 0.036, 0.055, -0.017, 0.031, 0], [0.038, 0.004, 0.055, 0, 0.05, 0]]), 'alu', g);
  mesh(box(0.03, 0.032, 0.0015), 'glass', g, 0, 0.031, 0.022).castShadow = false;
  mesh(box(0.03, 0.032, 0.0015), 'glass', g, 0, 0.031, -0.024).castShadow = false;
  const ret = mesh(new THREE.TorusGeometry(0.0055, 0.00035, 6, 32), 'glowR', g, 0, 0.031, 0.0); ret.castShadow = false;
  mesh(new THREE.SphereGeometry(0.0006, 8, 6), 'glowR', g, 0, 0.031, 0).castShadow = false;
  mesh(boxes([[0.024, 0.006, 0.016, 0, 0.015, -0.038], [0.004, 0.004, 0.004, 0.008, 0.019, -0.034], [0.004, 0.004, 0.004, -0.008, 0.019, -0.034]]), 'rubber', g);
  mesh(cylX(0.006, 0.006, 16), 'alu', g, 0.018, 0.008, -0.01);
  mesh(cylX(0.006, 0.005, 16), 'bright', g, -0.018, 0.008, 0.035);
  return g;
}
// red dot tube (Aimpoint-like) on a mount
function redDot(parent, f, y, r = 0.015, len = 0.07) {
  const g = group(parent, 'reddot', 0, y, f);
  mesh(lathe([[r * 0.9, -len / 2], [r, -len / 2 + 0.004], [r, len / 2 - 0.004], [r * 1.08, len / 2], [r * 0.95, len / 2 + 0.002]], 28), 'alu', g, 0, 0.032, 0);
  mesh(new THREE.CircleGeometry(r * 0.85, 24), 'glass', g, 0, 0.032, len / 2 - 0.002, 0, PI, 0).castShadow = false;
  mesh(new THREE.SphereGeometry(0.0007, 8, 6), 'glowR', g, 0, 0.032, 0).castShadow = false;
  mesh(cylX(0.007, 0.012, 16), 'alu', g, r + 0.004, 0.032, 0);
  mesh(cylY(0.006, 0.01, 16), 'alu', g, 0, 0.032 + r + 0.003, 0);
  mesh(boxes([[0.02, 0.016, 0.03, 0, 0.012, 0], [0.026, 0.006, 0.03, 0, 0.003, 0]]), 'alu', g);
  screw(g, 0.013, 0.006, 0, 1, 0.003);
  return g;
}
function swivel(parent, x, y, f, rot = 0, r = 0.007) {
  return mesh(G('swivel' + r, () => new THREE.TorusGeometry(r, 0.0013, 6, 16)), 'bright', parent, x, y, f, rot, PI / 2, 0);
}
function anchor(parent, name, x, y, f, q) {
  // anchors keep identity rotation (characters apply their own grip offsets); the viewmodel hand orientation is stored as data
  const o = new THREE.Object3D(); o.name = 'a_' + name; o.position.set(x, y, -f); if (q) o.userData.handQ = [q.x, q.y, q.z, q.w]; parent.add(o); return o;
}
const _hm = new THREE.Matrix4();
// hand orientation: fwd = finger direction, palm = direction the palm faces (gun frame)
function handQ(fwd, palm, left = false) {
  const z = new V3(...fwd).normalize().negate();
  const x = new V3(...palm); if (!left) x.negate();
  x.addScaledVector(z, -x.dot(z)).normalize();
  const y = new V3().crossVectors(z, x);
  return new THREE.Quaternion().setFromRotationMatrix(_hm.makeBasis(x, y, z));
}
// right hand on a pistol grip raked by `rake`
const RQ = (rake = 0.3) => handQ([0, -Math.sin(rake), -Math.cos(rake)], [-1, 0, 0]);
// left hand under a handguard: fingers to the right (yawed forward), palm up
const LQ = (yaw = 0.35, roll = 0.25) => handQ([Math.cos(yaw), Math.sin(roll), -Math.sin(yaw)], [-Math.sin(roll) * 0.7, 1, 0], true);
// left hand supporting a pistol grip from the left
const LQP = (rake = 0.3) => handQ([0.25, -Math.sin(rake), -Math.cos(rake)], [1, 0, 0.2], true);
function stdHands(g, { rake = 0.3, lx = -0.03, ly = -0.01, lf = 0.3, lyaw, lroll, rx = 0, ry = 0, rf = 0 } = {}) {
  anchor(g, 'rightHand', rx, ry, rf, RQ(rake));
  // web of the left hand sits under the left-bottom edge of the handguard; fingers wrap up its right side
  if (lf !== null) anchor(g, 'leftHand', lx + 0.014, ly - 0.01, lf, LQ(lyaw, lroll));
}
function grabPoint(parent, x, y, f) { // where the left hand grabs a magazine during reloads
  anchor(parent, 'handGrab', x, y, f, handQ([0.9, 0, -0.3], [0.2, 0.3, -1], true)).name = 'handGrab';
}
// cross-section (x, y) extruded along the bore from f = 0 to f = len (handguards, slides, rails)
function extZ(pts, len, o = {}) {
  const b = o.bevel ?? 0.0012;
  const s = rpath(pts);
  if (o.holes) for (const h of o.holes) s.holes.push(rpath(h, new THREE.Path()));
  const depth = Math.max(len - 2 * b, 0.0002);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.8, bevelSegments: 2, curveSegments: o.cs ?? 6 });
  g.translate(0, 0, -(depth + b));
  return g;
}
const rectXY = (w, h, r = 0, cx = 0, cy = 0) => [[cx - w / 2, cy - h / 2, r], [cx + w / 2, cy - h / 2, r], [cx + w / 2, cy + h / 2, r], [cx - w / 2, cy + h / 2, r]];
const clamp01 = v => Math.max(0, Math.min(1, v));

// ================================================================== RIFLES
function ak47(g) {
  const by = 0.048; // bore height
  // receiver + dust cover
  mesh(ext([[-0.075, 0.047], [-0.075, 0.002, 0.004], [-0.062, -0.006], [0.235, -0.006], [0.25, 0.004, 0.004], [0.25, 0.05], [-0.06, 0.05]], 0.042, { bevel: 0.0015 }), 'recv', g);
  mesh(extZ([[-0.0195, 0.046], [0.0195, 0.046], [0.0195, 0.06, 0.006], [0.012, 0.0705, 0.008], [-0.012, 0.0705, 0.008], [-0.0195, 0.06, 0.006]], 0.268, { bevel: 0.003 }), 'recv', g, 0, 0, -0.066);
  mesh(ext([[-0.02, 0.01], [-0.02, 0.034, 0.003], [0.1, 0.034, 0.003], [0.1, 0.01]], 0.0016, { bevel: 0.0004 }), 'recv', g, -0.0212); // left stamped panel
  mesh(boxes([-0.035, -0.005, 0.025, 0.055, 0.085, 0.115, 0.145].map(f => [0.022, 0.003, 0.006, 0, 0.0712, f])), 'recv', g); // stamped ribs
  mesh(box(0.008, 0.008, 0.008), 'bright', g, 0, 0.056, -0.077); // cover release button
  // rear sight block + leaf
  mesh(ext([[0.205, 0.046], [0.205, 0.062], [0.245, 0.066, 0.003], [0.258, 0.058], [0.258, 0.046]], 0.03), 'recv', g);
  mesh(ext([[0.2, 0.064], [0.201, 0.071], [0.25, 0.068], [0.25, 0.064]], 0.016, { bevel: 0.0006 }), 'metal', g);
  mesh(boxes([[0.02, 0.006, 0.008, 0, 0.07, 0.228], [0.004, 0.004, 0.003, 0, 0.073, 0.201]]), 'bright', g);
  // ejection port + bolt carrier / charging handle (part: bolt)
  mesh(box(0.0012, 0.016, 0.085), 'dark', g, 0.0212, 0.038, 0.125);
  const bolt = group(g, 'p_bolt', 0, 0, 0);
  mesh(boxes([[0.004, 0.012, 0.08, 0.019, 0.04, 0.125], [0.004, 0.006, 0.07, 0.0215, 0.052, 0.155]]), 'bright', bolt);
  mesh(cylX(0.005, 0.02, 14), 'bright', bolt, 0.032, 0.052, 0.19);
  mesh(new THREE.SphereGeometry(0.0062, 14, 10), 'bright', bolt, 0.043, 0.052, 0.19);
  // safety/selector lever (right side)
  mesh(ext([[0.0, 0.026], [0.185, 0.032, 0.004], [0.196, 0.022, 0.004], [0.182, 0.016], [0.035, 0.019], [0.012, 0.008, 0.005], [-0.002, 0.012]], 0.0022, { bevel: 0.0005 }), 'metal', g, 0.0222);
  // rivets
  for (const [y, f] of [[0.006, 0.02], [0.006, 0.055], [0.03, 0.02], [0.006, 0.21], [0.03, 0.215], [0.006, 0.235], [0.018, -0.05]]) { screw(g, 0.0211, y, f, 1, 0.0022, 'recv'); screw(g, -0.0211, y, f, -1, 0.0022, 'recv'); }
  // mag well dimple + mag catch
  mesh(boxes([[0.0012, 0.014, 0.05, 0.0212, 0.022, 0.12], [0.0012, 0.014, 0.05, -0.0212, 0.022, 0.12]]), 'dark', g);
  mesh(ext([[0.13, 0.008], [0.13, 0.036, 0.003], [0.235, 0.036, 0.003], [0.235, 0.008]], 0.003, { bevel: 0.0008 }), 'recv', g, -0.0225); // side optic rail
  mesh(boxes([[0.0012, 0.003, 0.1, -0.0242, 0.03, 0.182], [0.0012, 0.003, 0.1, -0.0242, 0.014, 0.182]]), 'dark', g);
  mesh(ext([[0.078, -0.006], [0.082, -0.03, 0.002], [0.09, -0.03], [0.092, -0.006]], 0.016), 'metal', g);
  // trigger group, grip
  triggerSet(g, { fb: 0.01, ff: 0.088, y: -0.004, d: 0.03, w: 0.012, ft: 0.058, role: 'recv' });
  pistolGrip(g, { len: 0.11, top: 0.04, bot: 0.036, w: 0.03, rake: 0.32, role: 'wood', grooves: 0 });
  mesh(ext([[-0.007, -0.003], [0.042, -0.003], [0.04, 0.003], [-0.005, 0.003]], 0.034), 'recv', g); // grip tang
  // stock
  mesh(ext([[-0.07, 0.045], [-0.1, 0.045], [-0.3, 0.025, 0.004], [-0.31, 0.022], [-0.31, -0.104, 0.004], [-0.298, -0.108], [-0.2, -0.06, 0.06], [-0.1, -0.002, 0.012], [-0.07, -0.004]], 0.044,
    { bevel: 0.004, bs: 3, taper: f => 0.78 + 0.22 * clamp01((-f - 0.07) / 0.22) }), 'wood', g);
  mesh(ext([[-0.309, 0.024], [-0.318, 0.023, 0.002], [-0.318, -0.107, 0.002], [-0.309, -0.109]], 0.046, { bevel: 0.0015 }), 'recv', g);
  mesh(ext([[-0.075, 0.047], [-0.11, 0.046, 0.002], [-0.11, 0.04], [-0.075, 0.041]], 0.03), 'recv', g); // tang
  screws(g, 0.036, 0.042, [-0.1], 0.0026, 'bright');
  swivel(g, 0, -0.07, -0.25, 0.6);
  // barrel, gas system
  mesh(lathe([[0.0115, 0.24], [0.0115, 0.27], [0.0095, 0.29], [0.0088, 0.53], [0.0078, 0.53]], 20), 'metal', g, 0, by, 0);
  mesh(cylZ(0.0105, 0.215, 18), 'metal', g, 0, 0.073, 0.36);
  mesh(boxes([0.42, 0.435, 0.45].flatMap(f => [[0.0012, 0.004, 0.006, 0.0105, 0.073, f], [0.0012, 0.004, 0.006, -0.0105, 0.073, f]])), 'dark', g);
  mesh(ext([[0.25, 0.062], [0.252, 0.083, 0.006], [0.405, 0.084, 0.008], [0.41, 0.062]], 0.034, { bevel: 0.005, bs: 3 }), 'wood', g); // upper handguard
  mesh(ext([[0.255, 0.056], [0.256, 0.02, 0.012], [0.27, 0.012], [0.43, 0.014, 0.006], [0.445, 0.028, 0.01], [0.446, 0.056]], 0.054,
    { bevel: 0.007, bs: 3, taper: f => 0.92 + 0.08 * Math.sin(clamp01((f - 0.26) / 0.18) * PI) }), 'wood', g); // lower handguard
  mesh(boxes([[0.0012, 0.026, 0.002, 0.0285, 0.036, 0.3], [0.0012, 0.026, 0.002, -0.0285, 0.036, 0.3]]), 'dark', g);
  mesh(extZ(rectXY(0.058, 0.054, 0.012, 0, 0.046), 0.012), 'recv', g, 0, 0, 0.445); // handguard retainer
  mesh(ext([[0.455, 0.036], [0.455, 0.08, 0.006], [0.49, 0.082, 0.006], [0.495, 0.036, 0.006]], 0.024, { bevel: 0.002 }), 'recv', g); // gas block
  mesh(cylZ(0.0118, 0.012, 18), 'recv', g, 0, 0.073, 0.468);
  mesh(cylZ(0.0028, 0.3, 8), 'bright', g, 0, 0.026, 0.4); // cleaning rod
  mesh(box(0.012, 0.012, 0.018), 'recv', g, 0, 0.03, 0.505); // bayonet lug
  // front sight block with ears
  mesh(ext([[0.495, 0.032], [0.497, 0.06, 0.004], [0.528, 0.06, 0.004], [0.53, 0.032]], 0.024, { bevel: 0.002 }), 'recv', g);
  for (const x of [0.0085, -0.0085]) mesh(ext([[0.503, 0.058], [0.506, 0.094, 0.003], [0.52, 0.094, 0.003], [0.523, 0.058]], 0.0035), 'recv', g, x);
  mesh(cylY(0.0018, 0.032, 8, 0.0013), 'bright', g, 0, 0.076, 0.513);
  // slant muzzle brake
  mesh(lathe([[0.0095, 0], [0.0112, 0.002], [0.0112, 0.03], [0.0098, 0.035], [0.0045, 0.035], [0.0045, 0.02]], 20), 'metal', g, 0, by, 0.53);
  mesh(box(0.012, 0.004, 0.014), 'dark', g, 0, by + 0.0095, 0.553, -0.35);
  // magazine
  const mag = group(g, 'p_mag', 0, -0.006, 0.093);
  mesh(ext([[0, 0.006], [0.002, -0.06], [0.017, -0.13, 0.03], [0.05, -0.195, 0.02], [0.06, -0.206, 0.006], [0.13, -0.176, 0.006], [0.124, -0.162], [0.1, -0.11, 0.04], [0.083, -0.05, 0.03], [0.073, 0.006]], 0.026, { bevel: 0.0018, cs: 8 }), 'recv', mag);
  mesh(ext([[0.01, -0.02], [0.012, -0.07], [0.026, -0.13, 0.03], [0.055, -0.18, 0.02], [0.1, -0.165, 0.01], [0.088, -0.11, 0.04], [0.072, -0.06, 0.03], [0.065, -0.02]], 0.0285, { bevel: 0.001, cs: 8 }), 'recv', mag);
  mesh(ext([[0.054, -0.195], [0.06, -0.212, 0.003], [0.136, -0.182, 0.003], [0.13, -0.17]], 0.03, { bevel: 0.0015 }), 'metal', mag);
  mesh(box(0.016, 0.006, 0.008), 'recv', mag, 0, 0.002, 0.076);
  mesh(box(0.024, 0.004, 0.06), 'brass', mag, 0, 0.007, 0.036);
  grabPoint(mag, -0.02, -0.1, 0.06);
  stdHands(g, { rake: 0.32, lx: -0.03, ly: 0.012, lf: 0.33 });
  anchor(g, 'muzzle', 0, by, 0.565); anchor(g, 'eject', 0.024, 0.04, 0.12);
  return { kind: 'rifle', length: 0.88, orn: { spans: [[0.27, 0.43, 0.03, 0.028], [-0.29, -0.1, -0.01, 0.025]], gem: [0.022, 0.025, 0.14] } };
}

function m4a1(g) {
  const by = 0.052;
  // lower receiver
  mesh(ext([[-0.066, 0.041], [-0.068, 0.016, 0.006], [-0.045, 0.0, 0.012], [-0.005, -0.004], [0.098, -0.004], [0.097, -0.046, 0.003], [0.18, -0.046, 0.003], [0.18, 0.0], [0.192, 0.012, 0.004], [0.192, 0.041]], 0.026, { bevel: 0.0016 }), 'recv', g);
  mesh(ext([[0.096, -0.044], [0.094, -0.05, 0.002], [0.183, -0.05, 0.002], [0.182, -0.044]], 0.03), 'recv', g); // flared well
  // upper receiver
  mesh(ext([[-0.07, 0.04], [-0.07, 0.066], [0.194, 0.066], [0.194, 0.04]], 0.026, { bevel: 0.003 }), 'recv', g);
  rail(g, -0.068, 0.192, 0.066, { role: 'recv' });
  // ejection port, dust cover, brass deflector, forward assist
  mesh(box(0.0012, 0.014, 0.06), 'dark', g, 0.0132, 0.05, 0.085);
  mesh(box(0.0014, 0.012, 0.062), 'recv', g, 0.0142, 0.042, 0.085);
  mesh(ext([[0.03, 0.04], [0.034, 0.064, 0.004], [0.05, 0.064], [0.05, 0.04]], 0.008), 'recv', g, 0.015);
  mesh(cylZ(0.0075, 0.04, 16), 'recv', g, 0.016, 0.05, 0.008);
  mesh(cylZ(0.0085, 0.008, 16), 'bright', g, 0.016, 0.05, -0.014);
  // charging handle (part)
  const ch = group(g, 'p_charging', 0, 0.06, 0);
  mesh(ext([[-0.072, -0.004], [-0.082, -0.004], [-0.086, 0.004, 0.002], [-0.072, 0.004]], 0.044, { bevel: 0.0015 }), 'recv', ch);
  mesh(box(0.006, 0.005, 0.01), 'recv', ch, -0.021, 0.0, -0.082);
  // pins, magazine release, bolt catch, selector
  mesh(pinsX([[0.003, 0.028, 0, 0.03, -0.045], [0.003, 0.028, 0, 0.03, 0.18], [0.0022, 0.028, 0, 0.012, 0.035], [0.0022, 0.028, 0, 0.012, 0.012]]), 'bright', g);
  mesh(cylX(0.0055, 0.005, 16), 'recv', g, 0.0145, 0.014, 0.095);
  mesh(ext([[0.0, 0.0], [0.035, 0.002], [0.04, 0.016, 0.003], [0.03, 0.018], [0.008, 0.008]], 0.002), 'recv', g, -0.0137, 0.012, 0.075);
  const sel = group(g, 'selector', -0.0138, 0.026, 0.002);
  mesh(cylX(0.006, 0.003, 16), 'recv', sel);
  mesh(ext([[-0.002, 0.0], [0.002, 0.0], [0.012, 0.012, 0.002], [0.008, 0.015]], 0.003), 'recv', sel, -0.001, 0, 0);
  mesh(box(0.001, 0.0045, 0.009), 'white', g, 0.0131, 0.02, 0.01);
  triggerSet(g, { fb: 0.005, ff: 0.092, y: -0.003, d: 0.026, w: 0.014, ft: 0.058 });
  pistolGrip(g, { len: 0.1, top: 0.038, bot: 0.036, w: 0.03, rake: 0.4, role: 'poly', grooves: 1 });
  // buffer tube, castle nut, collapsible stock
  mesh(lathe([[0.0145, -0.25], [0.0145, -0.07], [0.016, -0.068]], 24), 'alu', g, 0, 0.046, 0);
  mesh(box(0.008, 0.004, 0.18), 'alu', g, 0, 0.032, -0.16);
  mesh(cylZ(0.018, 0.008, 12), 'recv', g, 0, 0.046, -0.076);
  mesh(ext([[-0.072, 0.03], [-0.074, 0.062], [-0.08, 0.062], [-0.082, 0.03]], 0.03), 'recv', g); // end plate
  mesh(ext([[-0.165, 0.063], [-0.298, 0.068, 0.005], [-0.302, 0.064], [-0.302, -0.062, 0.006], [-0.288, -0.064], [-0.27, -0.045, 0.01], [-0.21, 0.016, 0.03], [-0.185, 0.026], [-0.165, 0.026]], 0.042,
    { bevel: 0.004, bs: 3, holes: [[[-0.25, 0.012, 0.005], [-0.275, -0.035, 0.005], [-0.282, -0.012, 0.005], [-0.282, 0.012, 0.005]]] }), 'poly', g);
  mesh(ext([[-0.3, 0.066], [-0.312, 0.065, 0.004], [-0.312, -0.06, 0.004], [-0.3, -0.064]], 0.046, { bevel: 0.002 }), 'rubber', g);
  mesh(ext([[-0.18, 0.024], [-0.2, 0.024], [-0.205, 0.016, 0.003], [-0.182, 0.018]], 0.008), 'poly', g); // adjust lever
  swivel(g, 0, 0.02, -0.17, 0.2);
  // quad rail handguard
  mesh(cylZ(0.022, 0.012, 24), 'recv', g, 0, by, 0.198); // barrel nut / delta
  mesh(extZ([[-0.022, 0.024, 0.006], [0.022, 0.024, 0.006], [0.024, 0.064, 0.004], [-0.024, 0.064, 0.004]], 0.19, { bevel: 0.002 }), 'alu', g, 0, 0, 0.205);
  rail(g, 0.205, 0.395, 0.064);
  rail(g, 0.215, 0.395, 0.044, { x: 0.023, rz: -PI / 2 });
  rail(g, 0.215, 0.395, 0.044, { x: -0.023, rz: PI / 2 });
  rail(g, 0.215, 0.395, 0.024, { rz: PI });
  sideSlots(g, { f0: 0.22, f1: 0.39, n: 6, y: 0.057, x: 0.0245, h: 0.004 });
  mesh(extZ(rectXY(0.052, 0.046, 0.008, 0, 0.044), 0.008), 'alu', g, 0, 0, 0.395);
  screws(g, 0.052, 0.04, [0.4], 0.0022, 'bright');
  // barrel, front sight, flash hider, suppressor
  mesh(lathe([[0.0095, 0.19], [0.0095, 0.41], [0.0075, 0.42], [0.0075, 0.51]], 20), 'metal', g, 0, by, 0);
  frontSightA2(g, 0.42, 0.075, by);
  swivel(g, 0, by - 0.02, 0.41, 0.1);
  birdcage(g, 0.505, by, 0.0105, 0.05);
  suppressor(g, 0.53, by, { r: 0.0195, len: 0.18 });
  // flip-up rear sight + holo
  mesh(ext([[-0.055, 0.0745], [-0.055, 0.085, 0.002], [-0.025, 0.085, 0.002], [-0.025, 0.0745]], 0.022), 'alu', g);
  mesh(ext([[-0.046, 0.085], [-0.044, 0.104, 0.003], [-0.036, 0.104, 0.003], [-0.034, 0.085]], 0.012, { holes: [[[-0.043, 0.094], [-0.043, 0.1], [-0.037, 0.1], [-0.037, 0.094]]] }), 'alu', g);
  holo(g, 0.07, 0.0745);
  // magazine
  const mag = group(g, 'p_mag', 0, -0.046, 0.1);
  mesh(ext([[0.002, 0.044], [0.0, -0.09], [0.011, -0.165, 0.03], [0.019, -0.18, 0.004], [0.087, -0.166, 0.004], [0.08, -0.152], [0.075, -0.08, 0.05], [0.074, 0.044]], 0.022, { bevel: 0.0014, cs: 8 }), 'alu', mag);
  mesh(boxes([0.012, 0.03, 0.05, 0.065].map(f => [0.0235, 0.09, 0.0025, 0, -0.06, f]).concat([[0.0235, 0.01, 0.07, 0, -0.005, 0.037]])), 'alu', mag);
  mesh(ext([[0.016, -0.176], [0.018, -0.186, 0.002], [0.09, -0.172, 0.002], [0.088, -0.162]], 0.026), 'poly', mag);
  mesh(box(0.02, 0.004, 0.06), 'brass', mag, 0, 0.046, 0.04);
  grabPoint(mag, -0.018, -0.09, 0.05);
  stdHands(g, { rake: 0.4, lx: -0.03, ly: 0.02, lf: 0.3 });
  anchor(g, 'muzzle', 0, by, 0.71); anchor(g, 'muzzleBare', 0, by, 0.555); anchor(g, 'eject', 0.016, 0.05, 0.085);
  return { kind: 'rifle', length: 1.01, orn: { spans: [[0.21, 0.39, 0.035, 0.032], [-0.29, -0.19, 0.0, 0.024]], gem: [0.0135, 0.02, 0.14] } };
}

// AK-74 style curved mag profile (mag group origin = rear-top of the mag)
const AK74_MAG = [[0, 0.006], [0.002, -0.06], [0.016, -0.125, 0.03], [0.045, -0.185, 0.02], [0.054, -0.196, 0.006], [0.122, -0.168, 0.006], [0.116, -0.155], [0.094, -0.105, 0.04], [0.079, -0.048, 0.03], [0.07, 0.006]];
function ak74Mag(mag, role = 'poly') {
  mesh(ext(AK74_MAG, 0.026, { bevel: 0.002, cs: 8 }), role, mag);
  mesh(ext([[0.012, -0.03], [0.014, -0.07], [0.026, -0.12, 0.03], [0.05, -0.165, 0.02], [0.092, -0.152, 0.01], [0.08, -0.105, 0.04], [0.067, -0.06, 0.03], [0.06, -0.03]], 0.0282, { bevel: 0.001, cs: 8 }), role, mag);
  mesh(ext([[0.048, -0.186], [0.054, -0.202, 0.003], [0.127, -0.174, 0.003], [0.121, -0.162]], 0.03, { bevel: 0.0015 }), role, mag);
  mesh(box(0.016, 0.006, 0.008), role, mag, 0, 0.002, 0.073);
  mesh(box(0.022, 0.004, 0.058), 'brass', mag, 0, 0.007, 0.035);
  grabPoint(mag, -0.02, -0.1, 0.06);
}

function an94(g) {
  const by = 0.05;
  // receiver (steel upper, polymer lower shell)
  mesh(ext([[-0.08, 0.05], [-0.08, 0.002, 0.004], [-0.066, -0.006], [0.23, -0.006], [0.245, 0.006, 0.004], [0.245, 0.052], [-0.066, 0.052]], 0.042, { bevel: 0.0018 }), 'recv', g);
  mesh(extZ([[-0.0195, 0.048], [0.0195, 0.048], [0.0195, 0.062, 0.006], [0.011, 0.072, 0.008], [-0.011, 0.072, 0.008], [-0.0195, 0.062, 0.006]], 0.27, { bevel: 0.003 }), 'recv', g, 0, 0, -0.072);
  mesh(ext([[-0.06, -0.004], [-0.06, 0.028, 0.004], [0.08, 0.028, 0.004], [0.08, -0.004]], 0.045, { bevel: 0.002 }), 'poly', g); // lower polymer shell
  mesh(boxes([[0.0012, 0.006, 0.12, 0.0226, 0.014, 0.01], [0.0012, 0.006, 0.12, -0.0226, 0.014, 0.01]]), 'dark', g);
  // left optic rail + right side charging handle (part: bolt)
  mesh(ext([[0.1, 0.012], [0.1, 0.038, 0.003], [0.23, 0.038, 0.003], [0.23, 0.012]], 0.003), 'recv', g, -0.0225);
  mesh(boxes([[0.0012, 0.003, 0.12, -0.0242, 0.032, 0.165], [0.0012, 0.003, 0.12, -0.0242, 0.018, 0.165]]), 'dark', g);
  const bolt = group(g, 'p_bolt');
  mesh(box(0.004, 0.006, 0.06), 'bright', bolt, 0.0215, 0.054, 0.17);
  mesh(cylX(0.0045, 0.022, 12), 'bright', bolt, 0.032, 0.054, 0.2);
  mesh(box(0.0012, 0.015, 0.075), 'dark', g, 0.0212, 0.04, 0.12);
  mesh(ext([[0.0, 0.026], [0.17, 0.031, 0.004], [0.18, 0.021, 0.004], [0.167, 0.015], [0.03, 0.018], [0.0, 0.012]], 0.0022, { bevel: 0.0005 }), 'metal', g, 0.0232);
  // rear drum sight
  mesh(ext([[0.19, 0.07], [0.19, 0.08, 0.004], [0.24, 0.08, 0.004], [0.245, 0.07]], 0.03), 'recv', g);
  mesh(cylX(0.016, 0.026, 24), 'recv', g, 0, 0.094, 0.215);
  mesh(cylX(0.0165, 0.006, 24), 'rubber', g, 0, 0.094, 0.215);
  mesh(new THREE.CircleGeometry(0.003, 12), 'dark', g, 0, 0.1, 0.2005, 0, PI, 0);
  // trigger, grip
  triggerSet(g, { fb: 0.008, ff: 0.09, y: -0.004, d: 0.03, w: 0.013, ft: 0.057, role: 'poly' });
  pistolGrip(g, { len: 0.11, top: 0.042, bot: 0.038, w: 0.032, rake: 0.28, role: 'poly', grooves: 3 });
  mesh(boxes([0, 1, 2, 3].flatMap(i => [[0.0012, 0.004, 0.026, 0.0186, -0.035 - i * 0.014, 0.012 - i * 0.004, 0.28], [0.0012, 0.004, 0.026, -0.0186, -0.035 - i * 0.014, 0.012 - i * 0.004, 0.28]])), 'dark', g); // grip texture panels
  // folding polymer stock with thumb hole
  mesh(ext([[-0.08, 0.05], [-0.1, 0.05], [-0.34, 0.044, 0.006], [-0.352, 0.04], [-0.352, -0.085, 0.006], [-0.338, -0.09], [-0.26, -0.05, 0.03], [-0.15, -0.012, 0.03], [-0.1, -0.006], [-0.08, -0.006]], 0.04,
    { bevel: 0.004, bs: 3, holes: [[[-0.14, 0.018, 0.012], [-0.25, -0.022, 0.012], [-0.3, -0.04, 0.012], [-0.312, 0.008, 0.01], [-0.3, 0.03, 0.01], [-0.16, 0.034, 0.01]]] }), 'poly', g);
  mesh(ext([[-0.35, 0.042], [-0.362, 0.041, 0.004], [-0.362, -0.087, 0.004], [-0.35, -0.09]], 0.044), 'rubber', g);
  mesh(cylY(0.007, 0.06, 16), 'recv', g, 0, 0.022, -0.088); // folding hinge
  // handguard + barrel
  mesh(ext([[0.245, 0.074], [0.25, 0.086, 0.008], [0.41, 0.086, 0.008], [0.425, 0.074], [0.425, 0.022, 0.012], [0.41, 0.01], [0.26, 0.008, 0.008], [0.245, 0.02]], 0.05,
    { bevel: 0.007, bs: 3 }), 'poly', g);
  sideSlots(g, { f0: 0.27, f1: 0.4, n: 5, y: 0.04, x: 0.0256, h: 0.022 });
  mesh(lathe([[0.0115, 0.24], [0.0095, 0.43], [0.0088, 0.57], [0.0075, 0.57]], 20), 'metal', g, 0, by, 0);
  mesh(cylZ(0.0115, 0.06, 18), 'metal', g, 0, 0.074, 0.45); // gas cylinder
  // front sight + gas block
  mesh(ext([[0.47, 0.034], [0.47, 0.084, 0.006], [0.505, 0.084, 0.006], [0.51, 0.034, 0.004]], 0.026, { bevel: 0.002 }), 'recv', g);
  mesh(ext([[0.484, 0.082], [0.487, 0.118, 0.004], [0.5, 0.118, 0.003], [0.503, 0.082]], 0.012), 'recv', g);
  mesh(boxes([[0.0035, 0.02, 0.012, 0.009, 0.118, 0.493], [0.0035, 0.02, 0.012, -0.009, 0.118, 0.493]]), 'recv', g);
  mesh(cylY(0.0017, 0.024, 8, 0.0012), 'bright', g, 0, 0.122, 0.493);
  // two-chamber muzzle brake
  mesh(lathe([[0.008, 0], [0.012, 0.002], [0.012, 0.042], [0.0105, 0.046], [0.005, 0.046], [0.005, 0.03]], 22), 'metal', g, 0, by, 0.57);
  mesh(boxes([[0.026, 0.006, 0.008, 0, 0, 0.583], [0.026, 0.006, 0.008, 0, 0, 0.602]]), 'dark', g, 0, by, 0);
  // canted mag (AN-94's 15° offset)
  const mag = group(g, 'p_mag', 0.003, -0.006, 0.09);
  mag.rotation.z = 0.26;
  ak74Mag(mag, 'poly');
  stdHands(g, { rake: 0.28, lx: -0.032, ly: 0.02, lf: 0.34 });
  anchor(g, 'muzzle', 0, by, 0.616); anchor(g, 'eject', 0.024, 0.042, 0.12);
  return { kind: 'rifle', length: 0.97, orn: { spans: [[0.26, 0.41, 0.05, 0.0255], [-0.33, -0.12, -0.03, 0.02]], gem: [0.022, 0.03, 0.15] } };
}

function sg552(g) {
  const by = 0.05;
  // pressed steel upper receiver
  mesh(ext([[-0.06, 0.026], [-0.062, 0.07, 0.004], [-0.05, 0.078], [0.2, 0.078], [0.205, 0.07, 0.003], [0.205, 0.026]], 0.036, { bevel: 0.002 }), 'recv', g);
  mesh(boxes([[0.0012, 0.004, 0.25, 0.0185, 0.072, 0.07], [0.0012, 0.004, 0.25, -0.0185, 0.072, 0.07]]), 'dark', g);
  rail(g, -0.04, 0.2, 0.078, { role: 'recv' });
  // polymer lower: grip + guard + mag well as one moulding
  mesh(ext([[-0.06, 0.03], [-0.06, 0.0, 0.01], [-0.04, -0.006], [0.088, -0.006], [0.09, -0.04, 0.004], [0.17, -0.04, 0.004], [0.172, -0.006], [0.2, 0.0, 0.006], [0.2, 0.03]], 0.04, { bevel: 0.003 }), 'poly', g);
  mesh(ext([[0.01, -0.006], [0.012, -0.034, 0.012], [0.08, -0.034, 0.01], [0.086, -0.006], [0.08, -0.006], [0.076, -0.029, 0.008], [0.016, -0.029, 0.008], [0.016, -0.006]], 0.016, { bevel: 0.0015 }), 'poly', g);
  const trig = group(g, 'p_trigger', 0, -0.006, 0.056);
  mesh(ext([[-0.003, 0.004], [0.003, 0.004], [0.0035, -0.008], [0.006, -0.018, 0.003], [0.0045, -0.021], [0.0005, -0.012, 0.003], [-0.003, -0.003]], 0.0055, { bevel: 0.0008 }), 'bright', trig);
  pistolGrip(g, { len: 0.112, top: 0.04, bot: 0.036, w: 0.033, rake: 0.25, role: 'poly', grooves: 0 });
  mesh(pinsX([[0.0025, 0.042, 0, 0.015, -0.03], [0.0025, 0.042, 0, 0.015, 0.18], [0.002, 0.042, 0, 0.006, 0.04]]), 'bright', g);
  // selector (ambi, both sides)
  for (const s of [1, -1]) mesh(ext([[-0.004, -0.003], [0.02, -0.002], [0.024, 0.004, 0.003], [-0.004, 0.003]], 0.003), 'recv', g, s * 0.021, 0.012, 0.0);
  // right side cocking handle (part: charging)
  const ch = group(g, 'p_charging', 0.018, 0.058, 0.16);
  mesh(box(0.006, 0.008, 0.02), 'recv', ch);
  mesh(cylX(0.0065, 0.02, 16), 'recv', ch, 0.012, 0, 0);
  mesh(box(0.0012, 0.01, 0.09), 'dark', g, 0.0185, 0.058, 0.12);
  mesh(box(0.0012, 0.014, 0.05), 'dark', g, 0.0185, 0.042, 0.08);
  // skeleton folding stock
  mesh(ext([[-0.058, 0.07], [-0.08, 0.07], [-0.235, 0.064, 0.006], [-0.245, 0.06], [-0.245, -0.07, 0.006], [-0.232, -0.074], [-0.15, -0.02, 0.03], [-0.08, 0.0], [-0.058, 0.0]], 0.034,
    { bevel: 0.0035, bs: 3, holes: [[[-0.085, 0.052, 0.008], [-0.085, 0.016, 0.008], [-0.15, 0.0, 0.015], [-0.215, -0.04, 0.01], [-0.222, 0.04, 0.01]]] }), 'poly', g);
  mesh(ext([[-0.243, 0.062], [-0.254, 0.061, 0.004], [-0.254, -0.072, 0.004], [-0.243, -0.075]], 0.038), 'rubber', g);
  mesh(cylY(0.008, 0.07, 16), 'recv', g, 0.01, 0.035, -0.064);
  // handguard with vents
  mesh(ext([[0.2, 0.074], [0.205, 0.086, 0.01], [0.36, 0.084, 0.01], [0.372, 0.07], [0.372, 0.02, 0.012], [0.355, 0.008], [0.215, 0.006, 0.01], [0.2, 0.02]], 0.054, { bevel: 0.008, bs: 3 }), 'poly', g);
  for (const yy of [0.06, 0.036]) sideSlots(g, { f0: 0.215, f1: 0.355, n: 6, y: yy, x: 0.0275, h: 0.009 });
  // barrel, gas block / front sight, flash hider
  mesh(lathe([[0.012, 0.2], [0.0095, 0.38], [0.0085, 0.46], [0.0075, 0.46]], 20), 'metal', g, 0, by, 0);
  mesh(ext([[0.372, 0.034], [0.374, 0.088, 0.006], [0.405, 0.088, 0.006], [0.41, 0.034, 0.004]], 0.028, { bevel: 0.002 }), 'recv', g);
  mesh(cylZ(0.0095, 0.06, 16), 'metal', g, 0, 0.074, 0.35);
  mesh(cylY(0.0018, 0.02, 8, 0.0012), 'bright', g, 0, 0.098, 0.392);
  mesh(boxes([[0.003, 0.018, 0.016, 0.008, 0.096, 0.392], [0.003, 0.018, 0.016, -0.008, 0.096, 0.392]]), 'recv', g);
  mesh(lathe([[0.007, 0], [0.0105, 0.002], [0.0105, 0.035], [0.009, 0.038], [0.005, 0.038], [0.005, 0.025]], 20), 'metal', g, 0, by, 0.455);
  mesh(boxes(Array.from({ length: 6 }, (_, i) => { const a = i / 6 * PI * 2; return [0.0026, 0.0012, 0.022, Math.cos(a) * 0.0105, Math.sin(a) * 0.0105, 0.478, 0, 0, a + PI / 2]; })), 'dark', g, 0, by, 0);
  // integrated low-power scope
  const sy = 0.118;
  scope(g, { f0: -0.03, len: 0.2, y: sy, r: 0.0127, rObj: 0.02, rEye: 0.018, objLen: 0.05, eyeLen: 0.06, rings: [0.05, 0.14], ringBase: sy - 0.0127 - 0.0865, turrets: true });
  // translucent mag with clip studs
  const mag = group(g, 'p_mag', 0, -0.04, 0.092);
  mesh(ext([[0.002, 0.04], [0.0, -0.08], [0.012, -0.15, 0.03], [0.022, -0.165, 0.004], [0.084, -0.152, 0.004], [0.077, -0.138], [0.072, -0.07, 0.05], [0.074, 0.04]], 0.024, { bevel: 0.0016, cs: 8 }), 'amber', mag);
  mesh(boxes([[0.01, 0.008, 0.006, 0, -0.04, 0.081], [0.03, 0.004, 0.004, 0, -0.1, 0.0]]), 'poly', mag);
  for (const s of [1, -1]) mesh(cylX(0.0035, 0.006, 10), 'poly', mag, s * 0.0135, -0.05, 0.03);
  mesh(mergeGeometries(Array.from({ length: 13 }, (_, i) => cylZ(0.0046, 0.05, 10).translate((i % 2 ? 1 : -1) * 0.0045, 0.036 - i * 0.0078, -0.037 - i * 0.0012))), 'brass', mag); // visible rounds
  mesh(ext([[0.02, -0.162], [0.022, -0.172, 0.002], [0.088, -0.158, 0.002], [0.086, -0.15]], 0.028), 'poly', mag);
  grabPoint(mag, -0.018, -0.09, 0.05);
  stdHands(g, { rake: 0.25, lx: -0.033, ly: 0.018, lf: 0.29 });
  anchor(g, 'muzzle', 0, by, 0.493); anchor(g, 'eject', 0.019, 0.045, 0.08);
  anchor(g, 'scopeEye', 0, sy, -0.1);
  return { kind: 'rifle', length: 0.75, scoped: true, orn: { spans: [[0.215, 0.355, 0.05, 0.028], [-0.23, -0.1, 0.03, 0.018]], gem: [0.021, 0.04, 0.12] } };
}

// vertical grip / foregrip held by the left hand from the left side
const VQ = (rake = 0.15) => handQ([0, -Math.sin(rake), -Math.cos(rake)], [1, 0, 0], true);

// ================================================================== SMGs
function mp5(g) {
  const by = 0.048;
  // tubular stamped receiver with flattened sides
  mesh(extZ([[-0.019, 0.026, 0.004], [0.019, 0.026, 0.004], [0.02, 0.06, 0.012], [0.012, 0.071, 0.01], [-0.012, 0.071, 0.01], [-0.02, 0.06, 0.012]], 0.3, { bevel: 0.002 }), 'recv', g, 0, 0, -0.06);
  mesh(boxes([[0.0012, 0.006, 0.2, 0.0205, 0.045, 0.08], [0.0012, 0.006, 0.2, -0.0205, 0.045, 0.08]]), 'dark', g); // pressed grooves
  mesh(box(0.0012, 0.013, 0.045), 'dark', g, 0.0205, 0.05, 0.09); // ejection port
  rail(g, 0.0, 0.12, 0.071, { role: 'recv', w: 0.018 }); // claw-mount stand-in
  // cocking tube + handle (part: charging) at 10 o'clock
  mesh(cylZ(0.009, 0.16, 16), 'recv', g, 0, 0.075, 0.32);
  mesh(cylZ(0.0094, 0.012, 16), 'recv', g, 0, 0.075, 0.395);
  const ch = group(g, 'p_charging', 0, 0.075, 0.34);
  mesh(box(0.004, 0.004, 0.02), 'recv', ch, -0.009, 0.004, 0, 0, 0, -0.7);
  mesh(cylX(0.004, 0.024, 12).rotateZ(-0.7), 'recv', ch, -0.017, 0.011, 0.005);
  mesh(new THREE.SphereGeometry(0.005, 12, 8), 'poly', ch, -0.026, 0.019, 0.005);
  // lower trigger housing (Navy style) + grip
  mesh(ext([[-0.05, 0.03], [-0.052, 0.0, 0.008], [-0.04, -0.006], [0.1, -0.006], [0.11, 0.004, 0.006], [0.11, 0.03]], 0.04, { bevel: 0.003 }), 'poly', g);
  triggerSet(g, { fb: 0.012, ff: 0.095, y: -0.005, d: 0.03, w: 0.016, ft: 0.058, role: 'poly' });
  pistolGrip(g, { len: 0.105, top: 0.04, bot: 0.036, w: 0.034, rake: 0.18, role: 'poly', grooves: 3 });
  mesh(pinsX([[0.0026, 0.046, 0, 0.018, -0.035], [0.0026, 0.046, 0, 0.018, 0.098]]), 'bright', g);
  const sel = group(g, 'selector', -0.0205, 0.016, -0.005);
  mesh(cylX(0.006, 0.004, 16), 'poly', sel);
  mesh(ext([[0, -0.003], [0.026, -0.002], [0.03, 0.004, 0.003], [0, 0.003]], 0.003), 'poly', sel, -0.0015, 0, 0, 0.5);
  mesh(boxes([[0.001, 0.003, 0.003, -0.0206, 0.024, 0.016], [0.001, 0.003, 0.003, -0.0206, 0.026, 0.024]]), 'white', g);
  // slim tapered handguard
  mesh(ext([[0.255, 0.07], [0.262, 0.074, 0.006], [0.37, 0.068, 0.006], [0.378, 0.06], [0.378, 0.03, 0.008], [0.37, 0.024], [0.27, 0.014, 0.008], [0.255, 0.018]], 0.044,
    { bevel: 0.007, bs: 3, taper: f => 1 - 0.18 * clamp01((f - 0.26) / 0.12) }), 'poly', g);
  mesh(boxes([0.285, 0.3, 0.315, 0.33, 0.345].flatMap(f => [[0.0014, 0.03, 0.003, 0.0225, 0.042, f], [0.0014, 0.03, 0.003, -0.0225, 0.042, f]])), 'poly', g);
  // barrel, front sight, rear drum
  mesh(lathe([[0.0115, 0.24], [0.009, 0.38], [0.0075, 0.44], [0.0085, 0.442], [0.0085, 0.46], [0.004, 0.46]], 20), 'metal', g, 0, by, 0);
  mesh(boxes([[0.008, 0.012, 0.004, 0.0085, by, 0.445], [0.008, 0.012, 0.004, -0.0085, by, 0.445]]), 'metal', g); // locking lugs
  mesh(ext([[0.37, 0.05], [0.372, 0.086, 0.004], [0.4, 0.086, 0.004], [0.405, 0.05]], 0.016), 'recv', g);
  mesh(new THREE.TorusGeometry(0.011, 0.0025, 8, 20), 'recv', g, 0, 0.1, 0.39);
  mesh(cylY(0.0015, 0.02, 8, 0.001), 'bright', g, 0, 0.096, 0.39);
  mesh(ext([[-0.05, 0.07], [-0.048, 0.082, 0.003], [-0.02, 0.082, 0.003], [-0.018, 0.07]], 0.02), 'recv', g);
  mesh(cylZ(0.0115, 0.02, 20), 'recv', g, 0, 0.096, -0.034);
  mesh(new THREE.TorusGeometry(0.0115, 0.0012, 6, 20), 'bright', g, 0, 0.096, -0.024);
  mesh(new THREE.CircleGeometry(0.0022, 10), 'dark', g, 0, 0.1, -0.0235, 0, PI, 0);
  // retractable stock: twin rails + butt pad
  const st = group(g, 'p_stock');
  mesh(mergeGeometries([cylZ(0.0045, 0.2, 10).translate(0.017, 0.052, 0.12), cylZ(0.0045, 0.2, 10).translate(-0.017, 0.052, 0.12)]), 'recv', st);
  mesh(ext([[-0.205, 0.07], [-0.225, 0.074, 0.006], [-0.228, 0.06], [-0.228, -0.04, 0.008], [-0.215, -0.044], [-0.205, 0.03, 0.01]], 0.05, { bevel: 0.003 }), 'recv', st);
  mesh(ext([[-0.226, 0.074], [-0.238, 0.073, 0.005], [-0.238, -0.042, 0.005], [-0.226, -0.045]], 0.054), 'rubber', st);
  mesh(cylX(0.006, 0.048, 14), 'recv', g, 0, 0.052, -0.055);
  // curved 30 rd mag
  const mag = group(g, 'p_mag', 0, -0.006, 0.112);
  mesh(ext([[0, 0.03], [0.002, -0.06], [0.014, -0.13, 0.04], [0.04, -0.19, 0.02], [0.046, -0.198, 0.004], [0.078, -0.184, 0.004], [0.072, -0.17], [0.05, -0.12, 0.04], [0.038, -0.06, 0.03], [0.034, 0.03]], 0.022, { bevel: 0.0015, cs: 8 }), 'recv', mag);
  mesh(ext([[0.008, -0.02], [0.01, -0.06], [0.02, -0.12, 0.04], [0.042, -0.168, 0.02], [0.056, -0.162], [0.04, -0.12, 0.04], [0.028, -0.06], [0.026, -0.02]], 0.0235, { bevel: 0.0008 }), 'recv', mag);
  mesh(ext([[0.044, -0.196], [0.047, -0.205, 0.002], [0.082, -0.19, 0.002], [0.079, -0.182]], 0.026), 'metal', mag);
  grabPoint(mag, -0.018, -0.1, 0.04);
  stdHands(g, { rake: 0.18, lx: -0.026, ly: 0.026, lf: 0.315 });
  anchor(g, 'muzzle', 0, by, 0.46); anchor(g, 'eject', 0.021, 0.05, 0.09);
  return { kind: 'smg', length: 0.7, orn: { spans: [[0.27, 0.37, 0.045, 0.022], [-0.1, 0.2, 0.035, 0.0205]], gem: [0.021, 0.012, 0.06] } };
}

function uzi(g) {
  // box receiver, mag inside the pistol grip
  mesh(ext([[-0.09, 0.0], [-0.092, 0.05, 0.006], [-0.08, 0.062], [0.2, 0.062], [0.212, 0.05, 0.006], [0.21, 0.0], [0.2, -0.008], [-0.08, -0.008]], 0.046, { bevel: 0.003 }), 'recv', g);
  for (const yy of [0.012, 0.03]) mesh(boxes([[0.0012, 0.008, 0.25, 0.0236, yy, 0.06], [0.0012, 0.008, 0.25, -0.0236, yy, 0.06]]), 'dark', g);
  mesh(box(0.0012, 0.014, 0.05), 'dark', g, 0.0236, 0.046, 0.07);
  // top cover cocking knob (part: charging)
  mesh(box(0.004, 0.0012, 0.13), 'dark', g, 0, 0.0625, 0.08);
  const ch = group(g, 'p_charging', 0, 0.062, 0.12);
  mesh(cylY(0.006, 0.012, 12), 'recv', ch, 0, 0.006, 0);
  mesh(box(0.022, 0.008, 0.012), 'recv', ch, 0, 0.012, 0);
  mesh(boxes([-0.008, -0.004, 0, 0.004, 0.008].map(x => [0.0012, 0.002, 0.012, x, 0.0165, 0])), 'recv', ch);
  // sights with protective ears
  for (const s of [1, -1]) {
    mesh(ext([[-0.07, 0.06], [-0.068, 0.082, 0.003], [-0.055, 0.082, 0.003], [-0.052, 0.06]], 0.004), 'recv', g, s * 0.011);
    mesh(ext([[0.17, 0.06], [0.172, 0.085, 0.003], [0.186, 0.085, 0.003], [0.19, 0.06]], 0.004), 'recv', g, s * 0.011);
  }
  mesh(box(0.012, 0.014, 0.008), 'recv', g, 0, 0.07, -0.062);
  mesh(cylY(0.0015, 0.018, 8, 0.001), 'bright', g, 0, 0.072, 0.18);
  // barrel + knurled nut
  mesh(lathe([[0.012, 0.2], [0.012, 0.235], [0.009, 0.24], [0.009, 0.27], [0.004, 0.27]], 20), 'metal', g, 0, 0.035, 0);
  mesh(cylZ(0.019, 0.022, 24), 'recv', g, 0, 0.035, 0.22);
  mesh(boxes(Array.from({ length: 16 }, (_, i) => { const a = i / 16 * PI * 2; return [0.0018, 0.0018, 0.02, Math.cos(a) * 0.019, Math.sin(a) * 0.019, 0.22, 0, 0, a]; })), 'recv', g, 0, 0.035, 0);
  // forearm guard (polymer) under the front
  mesh(ext([[0.08, -0.008], [0.082, -0.032, 0.008], [0.2, -0.028, 0.008], [0.205, -0.008]], 0.05, { bevel: 0.004 }), 'poly', g);
  mesh(boxes([0.1, 0.115, 0.13, 0.145, 0.16, 0.175, 0.19].map(f => [0.052, 0.0016, 0.003, 0, -0.031, f])), 'poly', g);
  // grip housing the magazine, grip safety
  const rake = 0.08, s = Math.sin(rake), c = Math.cos(rake);
  const P = (u, v) => [u * c - v * s, -u * s - v * c];
  mesh(ext([P(-0.004, -0.006), P(0.048, -0.006), [...P(0.05, 0.1), 0.006], [...P(-0.002, 0.11), 0.008], [...P(-0.008, 0.05), 0.02]], 0.036, { bevel: 0.0035, bs: 3 }), 'poly', g);
  mesh(boxes(Array.from({ length: 8 }, (_, i) => [0.0012, 0.003, 0.03, 0.0186, -0.02 - i * 0.009, 0.022 - (0.02 + i * 0.009) * s, rake]).concat(Array.from({ length: 8 }, (_, i) => [0.0012, 0.003, 0.03, -0.0186, -0.02 - i * 0.009, 0.022 - (0.02 + i * 0.009) * s, rake]))), 'dark', g);
  mesh(ext([P(-0.012, 0.0), P(-0.004, 0.0), P(-0.004, 0.06), [...P(-0.012, 0.055), 0.004]], 0.024), 'recv', g); // grip safety
  triggerSet(g, { fb: 0.045, ff: 0.13, y: -0.006, d: 0.032, w: 0.014, ft: 0.068, role: 'recv' });
  const sel = group(g, 'selector', -0.024, 0.0, 0.0);
  mesh(cylX(0.006, 0.004, 14), 'recv', sel);
  mesh(box(0.003, 0.004, 0.016), 'recv', sel, -0.002, 0, 0.008);
  // folded stock hinge + sling loop at the rear
  mesh(cylX(0.007, 0.05, 14), 'recv', g, 0, 0.0, -0.088);
  swivel(g, 0, 0.03, -0.098, 0, 0.009);
  // magazine (inserted through the grip)
  const mag = group(g, 'p_mag', 0, -0.01, 0.006);
  mesh(ext([[0.0, 0.0], [-0.012, -0.2, 0.004], [0.034, -0.2, 0.004], [0.042, 0.0]].map(([u, v, r]) => [...P(u + 0.002, -v), r || 0]), 0.024, { bevel: 0.0014 }), 'recv', mag);
  mesh(ext([[-0.016, -0.192], [-0.016, -0.212, 0.003], [0.04, -0.212, 0.003], [0.04, -0.192]].map(([u, v, r]) => [...P(u, -v), r || 0]), 0.03, { bevel: 0.0015 }), 'metal', mag);
  mesh(boxes([[0.0256, 0.04, 0.01, 0, -0.17, 0.028]]), 'recv', mag);
  grabPoint(mag, -0.02, -0.19, 0.02);
  anchor(g, 'rightHand', 0, 0, 0, RQ(rake));
  anchor(g, 'leftHand', -0.014, -0.042, 0.15, LQ(0.25, 0.2));
  anchor(g, 'muzzle', 0, 0.035, 0.27); anchor(g, 'eject', 0.024, 0.046, 0.07);
  return { kind: 'smg', length: 0.47, orn: { spans: [[-0.07, 0.19, 0.03, 0.0236]], gem: [0.025, 0.012, 0.1] } };
}

function p90(g) {
  // one-piece polymer frame: rear thumbhole, grip bar, trigger loop, front loop
  const frame = [[-0.23, 0.03], [-0.236, 0.0, 0.03], [-0.225, -0.085, 0.03], [-0.18, -0.105, 0.03], [-0.05, -0.1, 0.02], [0.05, -0.1, 0.02], [0.12, -0.1, 0.02], [0.15, -0.075, 0.02],
    [0.16, -0.01, 0.02], [0.2, 0.0], [0.24, 0.002, 0.004], [0.245, 0.03], [0.19, 0.03]];
  const thumb = [[-0.06, -0.002, 0.012], [0.0, -0.002, 0.008], [-0.018, -0.085, 0.012], [-0.065, -0.082, 0.02], [-0.085, -0.05, 0.02]];
  const loop = [[0.04, -0.006, 0.01], [0.1, -0.006, 0.01], [0.122, -0.04, 0.012], [0.116, -0.082, 0.012], [0.012, -0.085, 0.012], [0.026, -0.04, 0.01]];
  mesh(ext(frame, 0.052, { bevel: 0.006, bs: 3, cs: 8, holes: [thumb, loop] }), 'poly', g);
  mesh(ext([[-0.215, 0.025], [-0.218, 0.0, 0.02], [-0.2, -0.08, 0.02], [-0.17, -0.09], [-0.16, 0.025]], 0.054, { bevel: 0.002 }), 'rubber', g); // butt texture
  mesh(boxes([0.06, 0.075, 0.09, 0.105, 0.12].map(f => [0.056, 0.002, 0.003, 0, -0.097, f])), 'poly', g); // front loop ribs
  // trigger inside the loop
  const trig = group(g, 'p_trigger', 0, -0.006, 0.056);
  mesh(ext([[-0.003, 0.004], [0.003, 0.004], [0.0035, -0.012], [0.007, -0.026, 0.003], [0.005, -0.03], [0.0, -0.016, 0.003], [-0.003, -0.004]], 0.006, { bevel: 0.0008 }), 'poly', trig);
  // ambidextrous selector disc under trigger
  mesh(cylY(0.012, 0.004, 20), 'poly', g, 0, -0.087, 0.065);
  // top: translucent 50-round mag (rounds lie across)
  const mag = group(g, 'p_mag', 0, 0.03, -0.19);
  mesh(ext([[0.0, 0.0], [0.002, 0.03, 0.01], [0.335, 0.033, 0.01], [0.35, 0.012, 0.006], [0.345, 0.0]], 0.05, { bevel: 0.003, bs: 3 }), 'amber', mag);
  mesh(mergeGeometries(Array.from({ length: 16 }, (_, i) => cylX(0.0028, 0.03, 8).translate(0, 0.012 + (i % 2) * 0.006, -(0.03 + i * 0.019)))), 'brass', mag);
  mesh(boxes([[0.054, 0.006, 0.02, 0, 0.012, 0.008], [0.054, 0.008, 0.012, 0, 0.012, 0.34]]), 'poly', mag);
  grabPoint(mag, -0.03, 0.02, 0.2);
  // reflex ring sight on the front top
  mesh(ext([[0.17, 0.03], [0.175, 0.07, 0.01], [0.235, 0.068, 0.008], [0.24, 0.03]], 0.04, { bevel: 0.003, holes: [[[0.198, 0.04, 0.008], [0.198, 0.06, 0.008], [0.218, 0.06, 0.008], [0.218, 0.04, 0.008]]] }), 'poly', g);
  mesh(box(0.032, 0.022, 0.0015), 'glass', g, 0, 0.055, 0.21).castShadow = false;
  mesh(new THREE.TorusGeometry(0.004, 0.0004, 6, 24), 'glowR', g, 0, 0.055, 0.21).castShadow = false;
  // barrel shroud + flash hider, charging handles (both sides)
  mesh(cylZ(0.0115, 0.03, 20), 'metal', g, 0, 0.014, 0.255);
  mesh(lathe([[0.007, 0], [0.0095, 0.002], [0.0095, 0.022], [0.006, 0.024], [0.004, 0.024]], 18), 'metal', g, 0, 0.014, 0.27);
  mesh(boxes(Array.from({ length: 4 }, (_, i) => { const a = i / 4 * PI * 2 + PI / 4; return [0.0024, 0.0012, 0.014, Math.cos(a) * 0.0095, Math.sin(a) * 0.0095, 0.282, 0, 0, a + PI / 2]; })), 'dark', g, 0, 0.014, 0);
  const ch = group(g, 'p_charging', 0, 0.006, 0.17);
  for (const s of [1, -1]) mesh(ext([[-0.008, -0.004], [0.006, -0.004], [0.01, 0.004, 0.003], [-0.008, 0.004]], 0.008), 'poly', ch, s * 0.03);
  mesh(boxes([[0.0012, 0.006, 0.09, 0.0272, 0.006, 0.14], [0.0012, 0.006, 0.09, -0.0272, 0.006, 0.14]]), 'dark', g);
  mesh(box(0.024, 0.0012, 0.05), 'dark', g, 0, -0.1035, -0.13); // ejection chute (downward)
  mesh(pinsX([[0.003, 0.058, 0, -0.05, -0.2], [0.003, 0.058, 0, 0.012, 0.13], [0.0025, 0.058, 0, -0.02, 0.13]]), 'bright', g);
  anchor(g, 'rightHand', 0, 0, 0, RQ(0.25));
  anchor(g, 'leftHand', 0, -0.012, 0.128, VQ(0.35));
  anchor(g, 'muzzle', 0, 0.014, 0.294); anchor(g, 'eject', 0, -0.105, -0.13);
  return { kind: 'smg', length: 0.53, orn: { spans: [[-0.2, -0.08, -0.04, 0.026], [0.12, 0.16, -0.05, 0.026]], gem: [0.026, -0.03, 0.02] } };
}

// ================================================================== SNIPERS
// fluted barrel: lathe + dark flutes
function flutedBarrel(parent, f0, f1, y, r0, r1, n = 6, role = 'metal') {
  mesh(lathe([[r0 * 1.15, f0], [r0, f0 + 0.03], [r1, f1 - 0.01], [r1 * 0.9, f1]], 28), role, parent, 0, y, 0);
  const L = [];
  for (let i = 0; i < n; i++) { const a = i / n * PI * 2; const rr = (r0 + r1) / 2; L.push([0.0028, 0.0014, (f1 - f0) * 0.7, Math.cos(a) * rr, Math.sin(a) * rr, (f0 + f1) / 2 + 0.01, 0, 0, a + PI / 2]); }
  mesh(boxes(L), 'dark', parent, 0, y, 0);
}
function boltHandle(parent, f, y, { len = 0.055, drop = 0.03, knob = 0.009, role = 'bright' } = {}) {
  const b = group(parent, 'p_bolt', 0, y, f);
  const ang = Math.atan2(drop, len);
  mesh(cylX(0.0042, Math.hypot(len, drop), 12).rotateZ(-ang), 'bright', b, len / 2, -drop / 2, 0);
  mesh(new THREE.SphereGeometry(knob, 16, 12).scale(1, 1, 1.15), role === 'bright' ? 'poly' : role, b, len, -drop, 0);
  return b;
}

function awm(g) {
  const by = 0.06;
  // olive chassis stock with thumbhole
  const stock = [[0.45, 0.078, 0.008], [0.455, 0.03, 0.01], [0.43, 0.018], [0.17, 0.012], [0.15, -0.006], [0.0, -0.006], [0.035, -0.01], [0.012, -0.11, 0.01], [-0.02, -0.122, 0.01],
    [-0.15, -0.116, 0.02], [-0.38, -0.1, 0.02], [-0.455, -0.118, 0.01], [-0.47, -0.11], [-0.47, 0.072, 0.01], [-0.44, 0.08], [-0.2, 0.08, 0.01], [-0.12, 0.066, 0.02], [-0.07, 0.052], [0.17, 0.05], [0.2, 0.06, 0.01]];
  const hole = [[-0.016, -0.006, 0.01], [-0.12, 0.03, 0.02], [-0.17, 0.02, 0.02], [-0.17, -0.072, 0.02], [-0.07, -0.088, 0.015], [-0.038, -0.088, 0.01]];
  mesh(ext(stock, 0.05, { bevel: 0.005, bs: 3, cs: 8, holes: [hole] }), 'od', g);
  sideSlots(g, { f0: 0.22, f1: 0.42, n: 5, y: 0.035, x: 0.0255, h: 0.014 });
  // adjustable cheek piece + butt pad + spacers + monopod
  mesh(ext([[-0.4, 0.08], [-0.398, 0.098, 0.006], [-0.16, 0.098, 0.006], [-0.15, 0.08]], 0.046, { bevel: 0.004 }), 'od', g);
  mesh(cylX(0.008, 0.06, 18), 'recv', g, 0, 0.075, -0.17);
  mesh(ext([[-0.47, 0.074], [-0.478, 0.074], [-0.478, -0.112], [-0.47, -0.112]], 0.052, { bevel: 0.001 }), 'recv', g);
  mesh(ext([[-0.478, 0.076], [-0.5, 0.074, 0.008], [-0.5, -0.112, 0.008], [-0.478, -0.116]], 0.054, { bevel: 0.003 }), 'rubber', g);
  mesh(cylY(0.006, 0.07, 12), 'recv', g, 0, -0.15, -0.4);
  mesh(cylY(0.012, 0.012, 16), 'rubber', g, 0, -0.19, -0.4);
  swivel(g, 0, -0.125, -0.36, 0); swivel(g, 0, 0.012, 0.42, 0);
  // action, rail, bolt
  mesh(lathe([[0.012, -0.075], [0.0165, -0.07], [0.0175, -0.06], [0.0175, 0.2], [0.014, 0.21]], 28), 'recv', g, 0, by, 0);
  rail(g, -0.05, 0.2, by + 0.016, { role: 'recv' });
  mesh(box(0.0012, 0.014, 0.07), 'dark', g, 0.0176, by + 0.004, 0.06);
  mesh(lathe([[0.008, -0.11], [0.013, -0.105], [0.013, -0.075], [0.0175, -0.07]], 20), 'bright', g, 0, by, 0); // bolt shroud
  boltHandle(g, -0.04, by, { len: 0.058, drop: 0.035, knob: 0.0105 });
  mesh(box(0.008, 0.01, 0.018), 'recv', g, 0.0, by + 0.012, -0.085); // safety
  triggerSet(g, { fb: 0.0, ff: 0.085, y: -0.006, d: 0.03, w: 0.014, ft: 0.056, role: 'recv' });
  screws(g, 0.052, -0.004, [0.12, -0.05], 0.003, 'bright');
  // fluted barrel + muzzle brake
  flutedBarrel(g, 0.2, 0.66, by, 0.0135, 0.011, 6);
  mesh(lathe([[0.012, 0], [0.0165, 0.004], [0.0165, 0.06], [0.014, 0.065], [0.006, 0.065], [0.006, 0.05]], 24), 'metal', g, 0, by, 0.66);
  mesh(boxes([0.675, 0.69, 0.705].flatMap(f => [[0.034, 0.012, 0.008, 0, 0, f]])), 'dark', g, 0, by, 0);
  // big scope
  const sy = 0.122;
  scope(g, { f0: -0.11, len: 0.38, y: sy, r: 0.015, rObj: 0.029, rEye: 0.021, objLen: 0.09, eyeLen: 0.08, rings: [0.04, 0.17], ringBase: sy - 0.015 - (by + 0.0245) });
  // 5 round box mag
  const mag = group(g, 'p_mag', 0, -0.006, 0.07);
  mesh(ext([[0, 0.02], [-0.002, -0.05, 0.004], [0.085, -0.05, 0.004], [0.083, 0.02]], 0.036, { bevel: 0.0018 }), 'recv', mag);
  mesh(boxes([[0.0372, 0.006, 0.07, 0, -0.03, 0.041]]), 'recv', mag);
  mesh(box(0.012, 0.01, 0.014), 'bright', mag, 0, -0.044, 0.09);
  grabPoint(mag, -0.024, -0.045, 0.04);
  stdHands(g, { rake: 0.25, lx: -0.034, ly: 0.02, lf: 0.32 });
  anchor(g, 'muzzle', 0, by, 0.725); anchor(g, 'eject', 0.018, by + 0.005, 0.06);
  anchor(g, 'scopeEye', 0, sy, -0.19);
  return { kind: 'sniper', length: 1.22, scoped: true, orn: { spans: [[0.22, 0.43, 0.045, 0.027], [-0.44, -0.2, 0.02, 0.027]], gem: [0.027, -0.04, -0.09] } };
}

function m82a1(g) {
  const by = 0.07;
  // upper receiver with big lightening holes up front
  const up = [[-0.08, 0.02], [-0.08, 0.1, 0.006], [0.53, 0.1, 0.006], [0.56, 0.09, 0.01], [0.56, 0.035, 0.01], [0.53, 0.02]];
  const holes = [0.3, 0.37, 0.44, 0.51].map(f => Array.from({ length: 10 }, (_, i) => { const a = i / 10 * PI * 2; return [f + Math.cos(a) * 0.022, 0.06 + Math.sin(a) * 0.022]; }));
  mesh(ext(up, 0.064, { bevel: 0.003, holes }), 'recv', g);
  mesh(lathe([[0.024, 0.24], [0.024, 0.56]], 24), 'metal', g, 0, by - 0.008, 0); // recoiling barrel jacket seen through holes
  rail(g, -0.06, 0.4, 0.1, { role: 'recv', w: 0.024 });
  mesh(box(0.0012, 0.02, 0.1), 'dark', g, 0.0322, 0.07, 0.12);
  mesh(boxes([[0.0012, 0.004, 0.25, 0.0322, 0.03, 0.12], [0.0012, 0.004, 0.25, -0.0322, 0.03, 0.12]]), 'dark', g);
  // charging handle (right side)
  const ch = group(g, 'p_charging', 0.034, 0.085, 0.2);
  mesh(box(0.008, 0.01, 0.03), 'recv', ch);
  mesh(cylX(0.007, 0.025, 14), 'recv', ch, 0.015, 0, 0.01);
  // lower receiver + stock
  mesh(ext([[0.22, 0.022], [0.22, -0.006, 0.006], [0.19, -0.012], [0.19, -0.05, 0.004], [0.07, -0.05, 0.004], [0.07, -0.006], [-0.06, -0.006], [-0.12, -0.03, 0.02], [-0.4, -0.08, 0.02],
    [-0.42, -0.1, 0.01], [-0.44, -0.1], [-0.44, 0.07, 0.006], [-0.42, 0.09], [-0.25, 0.09, 0.02], [-0.08, 0.022]], 0.056, { bevel: 0.003, holes: [[[-0.14, 0.03, 0.01], [-0.36, -0.04, 0.015], [-0.4, -0.04, 0.01], [-0.4, 0.06, 0.01], [-0.26, 0.06, 0.02]]] }), 'recv', g);
  mesh(ext([[-0.44, 0.07], [-0.465, 0.07, 0.008], [-0.465, -0.1, 0.008], [-0.44, -0.102]], 0.06, { bevel: 0.003 }), 'rubber', g);
  mesh(ext([[-0.38, 0.09], [-0.375, 0.105, 0.006], [-0.24, 0.105, 0.006], [-0.235, 0.09]], 0.05), 'poly', g); // cheek rest
  mesh(cylY(0.007, 0.08, 12), 'recv', g, 0, -0.12, -0.38); // rear monopod
  mesh(pinsX([[0.004, 0.068, 0, 0.0, -0.06], [0.004, 0.068, 0, 0.01, 0.2], [0.0035, 0.068, 0, 0.08, 0.5]]), 'bright', g);
  triggerSet(g, { fb: 0.0, ff: 0.085, y: -0.006, d: 0.032, w: 0.016, ft: 0.056, role: 'recv' });
  pistolGrip(g, { len: 0.11, top: 0.042, bot: 0.038, w: 0.034, rake: 0.3, role: 'poly', grooves: 3 });
  for (const s of [1, -1]) mesh(ext([[-0.004, -0.003], [0.02, -0.002], [0.024, 0.004, 0.003], [-0.004, 0.003]], 0.003), 'recv', g, s * 0.029, 0.01, -0.02);
  // carry handle
  mesh(ext([[0.14, 0.1], [0.145, 0.14, 0.012], [0.3, 0.14, 0.012], [0.305, 0.1], [0.29, 0.1], [0.287, 0.128, 0.006], [0.158, 0.128, 0.006], [0.155, 0.1]], 0.016, { bevel: 0.002 }), 'recv', g, 0.0, 0.0, 0.0, 0, 0, 0).position.x = 0.0;
  // barrel + arrowhead muzzle brake
  mesh(lathe([[0.017, 0.55], [0.0145, 0.6], [0.0135, 0.93]], 24), 'metal', g, 0, by, 0);
  mesh(lathe([[0.008, 0.555], [0.008, 0.56]], 8), 'metal', g, 0, by, 0);
  const mb = group(g, 'brake', 0, by, 0.93);
  mesh(ext([[0.0, -0.022], [0.0, 0.022, 0.004], [0.07, 0.022, 0.004], [0.1, 0.0], [0.07, -0.022, 0.004]], 0.045, { bevel: 0.004 }).rotateZ(PI / 2), 'metal', mb);
  mesh(boxes([[0.074, 0.03, 0.016, 0, 0, 0.025], [0.074, 0.026, 0.014, 0, 0, 0.055]]), 'dark', mb);
  // bipod (deployed) under the front
  const bp = group(g, 'bipod', 0, 0.025, 0.5);
  mesh(cylX(0.012, 0.05, 16), 'recv', bp);
  for (const s of [1, -1]) {
    const leg = group(bp, null, s * 0.02, 0, 0); leg.rotation.set(-0.35, 0, s * 0.35);
    mesh(cylY(0.007, 0.24, 12), 'recv', leg, 0, -0.12, 0);
    mesh(cylY(0.005, 0.08, 10), 'bright', leg, 0, -0.27, 0);
    mesh(new THREE.SphereGeometry(0.01, 12, 8).scale(1, 0.6, 1.4), 'rubber', leg, 0, -0.31, 0);
  }
  // scope
  const sy = 0.148;
  scope(g, { f0: -0.03, len: 0.38, y: sy, r: 0.015, rObj: 0.029, rEye: 0.021, objLen: 0.09, eyeLen: 0.08, rings: [0.1, 0.23], ringBase: sy - 0.015 - 0.1085 });
  // 10 rd mag
  const mag = group(g, 'p_mag', 0, -0.03, 0.08);
  mesh(ext([[0, 0.025], [-0.002, -0.085, 0.005], [0.105, -0.085, 0.005], [0.103, 0.025]], 0.05, { bevel: 0.002 }), 'recv', mag);
  mesh(boxes([[0.0515, 0.06, 0.004, 0, -0.04, 0.02], [0.0515, 0.06, 0.004, 0, -0.04, 0.05], [0.0515, 0.06, 0.004, 0, -0.04, 0.08]]), 'recv', mag);
  mesh(ext([[-0.004, -0.083], [-0.004, -0.092, 0.003], [0.108, -0.092, 0.003], [0.108, -0.083]], 0.054), 'metal', mag);
  grabPoint(mag, -0.03, -0.08, 0.05);
  stdHands(g, { rake: 0.3, lx: -0.038, ly: 0.02, lf: 0.28 });
  anchor(g, 'muzzle', 0, by, 1.03); anchor(g, 'eject', 0.033, 0.07, 0.12);
  anchor(g, 'scopeEye', 0, sy, -0.11);
  return { kind: 'sniper', length: 1.47, scoped: true, orn: { spans: [[0.0, 0.25, 0.04, 0.032], [-0.4, -0.25, 0.07, 0.028]], gem: [0.032, 0.085, -0.04] } };
}

function svd(g) {
  const by = 0.048;
  // receiver (AK-derived)
  mesh(ext([[-0.08, 0.047], [-0.08, 0.002, 0.004], [-0.066, -0.006], [0.19, -0.006], [0.205, 0.004, 0.004], [0.205, 0.05], [-0.066, 0.05]], 0.04, { bevel: 0.0015 }), 'recv', g);
  mesh(extZ([[-0.019, 0.046], [0.019, 0.046], [0.019, 0.058, 0.006], [0.011, 0.068, 0.008], [-0.011, 0.068, 0.008], [-0.019, 0.058, 0.006]], 0.25, { bevel: 0.003 }), 'recv', g, 0, 0, -0.072);
  mesh(ext([[0.0, 0.026], [0.15, 0.03, 0.004], [0.16, 0.02, 0.004], [0.148, 0.015], [0.03, 0.018], [0.0, 0.012]], 0.0022, { bevel: 0.0005 }), 'metal', g, 0.0212);
  mesh(box(0.0012, 0.015, 0.06), 'dark', g, 0.0202, 0.038, 0.1);
  const bolt = group(g, 'p_bolt');
  mesh(box(0.004, 0.006, 0.05), 'bright', bolt, 0.0205, 0.052, 0.13);
  mesh(cylX(0.0045, 0.02, 12), 'bright', bolt, 0.03, 0.052, 0.155);
  // side scope rail (left) + PSO mount
  mesh(ext([[0.04, 0.008], [0.04, 0.036, 0.003], [0.17, 0.036, 0.003], [0.17, 0.008]], 0.004), 'recv', g, -0.022);
  mesh(ext([[0.05, 0.012], [0.06, 0.1, 0.004], [0.15, 0.1, 0.004], [0.16, 0.012]], 0.005, { bevel: 0.0015 }), 'recv', g, -0.027);
  mesh(box(0.03, 0.01, 0.12), 'recv', g, -0.016, 0.1, 0.105);
  mesh(cylX(0.009, 0.012, 16), 'bright', g, -0.034, 0.03, 0.1);
  triggerSet(g, { fb: 0.012, ff: 0.085, y: -0.004, d: 0.03, w: 0.012, ft: 0.056, role: 'recv' });
  // skeleton wood stock (grip is its front member)
  const st = [[-0.075, 0.046], [-0.42, 0.04, 0.006], [-0.435, 0.036], [-0.435, -0.112, 0.006], [-0.42, -0.122], [-0.06, -0.118, 0.02], [0.012, -0.11, 0.01], [0.036, -0.012, 0.004], [0.02, -0.004], [-0.07, -0.004]];
  const hole = [[-0.014, -0.012, 0.008], [-0.034, -0.096, 0.012], [-0.33, -0.1, 0.02], [-0.37, -0.075, 0.02], [-0.37, 0.006, 0.02], [-0.09, 0.012, 0.012]];
  mesh(ext(st, 0.04, { bevel: 0.004, bs: 3, cs: 8, holes: [hole] }), 'wood', g);
  mesh(ext([[-0.3, 0.04], [-0.3, 0.008, 0.006], [-0.16, 0.01, 0.01], [-0.15, 0.042]], 0.012, { bevel: 0.003 }), 'poly', g, -0.024); // cheek rest
  mesh(ext([[-0.434, 0.038], [-0.442, 0.038, 0.002], [-0.442, -0.12, 0.002], [-0.434, -0.122]], 0.042), 'recv', g);
  swivel(g, 0, -0.125, -0.3, 0);
  // vented wood handguard + barrel + flash hider
  mesh(ext([[0.2, 0.08], [0.205, 0.088, 0.008], [0.47, 0.084, 0.008], [0.48, 0.07], [0.48, 0.02, 0.01], [0.465, 0.01], [0.215, 0.008, 0.01], [0.2, 0.02]], 0.046, { bevel: 0.006, bs: 3 }), 'wood', g);
  sideSlots(g, { f0: 0.23, f1: 0.45, n: 6, y: 0.055, x: 0.0235, h: 0.012 });
  mesh(extZ(rectXY(0.05, 0.08, 0.012, 0, 0.048), 0.01), 'recv', g, 0, 0, 0.48);
  mesh(lathe([[0.0115, 0.19], [0.0095, 0.5], [0.0085, 0.76], [0.0075, 0.76]], 20), 'metal', g, 0, by, 0);
  mesh(cylZ(0.0105, 0.07, 16), 'metal', g, 0, 0.075, 0.52);
  mesh(ext([[0.49, 0.036], [0.49, 0.086, 0.006], [0.52, 0.086, 0.006], [0.525, 0.036]], 0.024), 'recv', g);
  mesh(ext([[0.7, 0.04], [0.702, 0.065, 0.004], [0.73, 0.065, 0.004], [0.735, 0.04]], 0.022), 'recv', g);
  for (const s of [1, -1]) mesh(ext([[0.705, 0.062], [0.708, 0.085, 0.003], [0.726, 0.085, 0.003], [0.73, 0.062]], 0.003), 'recv', g, s * 0.008);
  mesh(cylY(0.0016, 0.024, 8, 0.0011), 'bright', g, 0, 0.074, 0.717);
  mesh(lathe([[0.008, 0], [0.0115, 0.003], [0.0115, 0.075], [0.01, 0.08], [0.006, 0.08], [0.006, 0.06]], 22), 'metal', g, 0, by, 0.76);
  mesh(boxes(Array.from({ length: 5 }, (_, i) => { const a = i / 5 * PI * 2 + PI / 2; return [0.003, 0.0012, 0.05, Math.cos(a) * 0.0115, Math.sin(a) * 0.0115, 0.81, 0, 0, a + PI / 2]; })), 'dark', g, 0, by, 0);
  // PSO-1 scope with rubber eyecup, sunshade and side battery housing
  const sx = -0.012, sy = 0.128;
  const sc = scope(g, { f0: -0.07, len: 0.33, x: sx, y: sy, r: 0.013, rObj: 0.019, rEye: 0.019, objLen: 0.06, eyeLen: 0.075 });
  mesh(lathe([[0.017, -0.05], [0.02, -0.045], [0.021, -0.02], [0.018, 0.0]], 24), 'rubber', sc);
  mesh(lathe([[0.0205, 0.33], [0.0205, 0.37], [0.019, 0.37]], 24), 'recv', sc);
  mesh(box(0.012, 0.03, 0.04), 'recv', sc, -0.018, -0.006, 0.17);
  mesh(box(0.014, 0.018, 0.12), 'recv', g, sx, 0.106, 0.1);
  // 10 rd mag
  const mag = group(g, 'p_mag', 0, -0.006, 0.092);
  mesh(ext([[0, 0.006], [0.002, -0.08, 0.004], [0.016, -0.1, 0.006], [0.082, -0.094, 0.004], [0.078, 0.006]], 0.024, { bevel: 0.0016 }), 'recv', mag);
  mesh(ext([[0.01, -0.01], [0.012, -0.075], [0.07, -0.072], [0.066, -0.01]], 0.0265, { bevel: 0.0008 }), 'recv', mag);
  mesh(ext([[0.014, -0.096], [0.016, -0.106, 0.002], [0.086, -0.1, 0.002], [0.084, -0.09]], 0.028), 'metal', mag);
  grabPoint(mag, -0.018, -0.06, 0.04);
  stdHands(g, { rake: 0.25, lx: -0.03, ly: 0.02, lf: 0.32 });
  anchor(g, 'muzzle', 0, by, 0.84); anchor(g, 'eject', 0.021, 0.04, 0.1);
  anchor(g, 'scopeEye', sx, sy, -0.16);
  return { kind: 'sniper', length: 1.28, scoped: true, orn: { spans: [[0.22, 0.46, 0.045, 0.024], [-0.42, -0.06, 0.025, 0.02]], gem: [0.021, 0.02, 0.03] } };
}

// ================================================================== SHOTGUNS
function m870(g) {
  // built in "natural" coordinates, shifted so the wrist web point lands at the origin
  const b = group(g, null, 0, -0.063, -0.08);
  const by = 0.05;
  mesh(ext([[-0.06, 0.0], [-0.06, 0.058, 0.006], [-0.045, 0.07, 0.012], [0.19, 0.07, 0.012], [0.205, 0.058, 0.004], [0.205, 0.004, 0.004], [0.195, 0.0]], 0.036, { bevel: 0.0025 }), 'recv', b);
  mesh(box(0.0012, 0.02, 0.075), 'dark', b, 0.0184, 0.044, 0.1); // ejection port
  mesh(box(0.02, 0.0012, 0.08), 'dark', b, 0, -0.0005, 0.11); // loading port
  mesh(boxes([[0.0012, 0.003, 0.22, 0.0184, 0.008, 0.07], [0.0012, 0.003, 0.22, -0.0184, 0.008, 0.07]]), 'recv', b);
  mesh(pinsX([[0.0026, 0.04, 0, 0.012, -0.02], [0.0026, 0.04, 0, 0.012, 0.07]]), 'bright', b);
  triggerSet(b, { fb: -0.035, ff: 0.055, y: 0.0, d: 0.03, w: 0.014, ft: 0.0, role: 'recv' });
  mesh(cylX(0.0045, 0.03, 12), 'bright', b, 0, 0.004, -0.04); // cross-bolt safety
  mesh(box(0.004, 0.01, 0.006), 'recv', b, 0.0, -0.006, 0.062); // slide release
  // classic wood stock with wrist
  mesh(ext([[-0.058, 0.066], [-0.1, 0.064], [-0.39, 0.052, 0.006], [-0.4, 0.048], [-0.4, -0.098, 0.006], [-0.388, -0.104], [-0.25, -0.07, 0.04], [-0.14, -0.035, 0.03], [-0.09, -0.02, 0.012], [-0.058, 0.0]], 0.042,
    { bevel: 0.005, bs: 3, cs: 8, taper: f => 0.82 + 0.18 * clamp01((-f - 0.08) / 0.2) }), 'wood', b);
  mesh(boxes(Array.from({ length: 7 }, (_, i) => [0.001, 0.002, 0.04, 0.0182, 0.035 - i * 0.006, -0.12 - i * 0.002, 0.25]).concat(Array.from({ length: 7 }, (_, i) => [0.001, 0.002, 0.04, -0.0182, 0.035 - i * 0.006, -0.12 - i * 0.002, 0.25]))), 'dark', b); // wrist checkering
  mesh(ext([[-0.398, 0.05], [-0.415, 0.049, 0.006], [-0.415, -0.1, 0.006], [-0.398, -0.106]], 0.046, { bevel: 0.003 }), 'rubber', b);
  swivel(b, 0, -0.085, -0.33, 0.3);
  // barrel with vent rib + bead, magazine tube + cap
  mesh(lathe([[0.0125, 0.2], [0.0118, 0.23], [0.0112, 0.67], [0.0102, 0.672], [0.0094, 0.672]], 24), 'metal', b, 0, by, 0);
  mesh(box(0.006, 0.003, 0.44), 'metal', b, 0, by + 0.0125, 0.45);
  mesh(boxes(Array.from({ length: 14 }, (_, i) => [0.004, 0.003, 0.004, 0, by + 0.0105, 0.25 + i * 0.03])), 'dark', b);
  mesh(new THREE.SphereGeometry(0.0022, 10, 8), 'brass', b, 0, by + 0.016, 0.665);
  mesh(cylZ(0.012, 0.42, 20), 'metal', b, 0, 0.02, 0.41);
  mesh(lathe([[0.012, 0.62], [0.0135, 0.622], [0.0135, 0.645], [0.009, 0.65]], 20), 'recv', b, 0, 0.02, 0);
  mesh(extZ(rectXY(0.03, 0.05, 0.01, 0, 0.034), 0.012), 'recv', b, 0, 0, 0.6); // barrel clamp ring
  swivel(b, 0, 0.004, 0.64, 0);
  // pump (part) with grooves and action bars; the left hand rides on it
  const pump = group(b, 'p_pump');
  mesh(ext([[0.27, 0.042], [0.272, 0.006, 0.012], [0.46, 0.004, 0.012], [0.462, 0.042]], 0.054, { bevel: 0.009, bs: 3 }), 'wood', pump);
  mesh(boxes(Array.from({ length: 9 }, (_, i) => [0.0558, 0.004, 0.006, 0, 0.012, 0.3 + i * 0.018])), 'dark', pump);
  mesh(boxes([[0.0025, 0.006, 0.2, 0.012, 0.012, 0.18], [0.0025, 0.006, 0.2, -0.012, 0.012, 0.18]]), 'bright', pump);
  anchor(pump, 'leftHand', -0.018, -0.006, 0.37, LQ(0.3, 0.25));
  anchor(b, 'rightHand', 0, 0.063, -0.08, RQ(1.15));
  anchor(b, 'muzzle', 0, by, 0.672); anchor(b, 'eject', 0.019, 0.044, 0.1);
  return { kind: 'shotgun', length: 1.08, grip: 'rifle', orn: { spans: [[-0.13, 0.1, -0.03, 0.0186], [-0.44, -0.22, -0.08, 0.02]], gem: [0.019, -0.035, 0.02] } };
}

function xm1014(g) {
  const by = 0.05;
  mesh(ext([[-0.06, 0.0], [-0.06, 0.06, 0.006], [-0.05, 0.068], [0.215, 0.068], [0.225, 0.058, 0.004], [0.225, 0.004, 0.004], [0.215, -0.004], [-0.05, -0.004]], 0.036, { bevel: 0.0025 }), 'recv', g);
  rail(g, -0.05, 0.21, 0.068, { role: 'recv' });
  mesh(box(0.0012, 0.022, 0.08), 'dark', g, 0.0184, 0.04, 0.11);
  mesh(box(0.02, 0.0012, 0.08), 'dark', g, 0, -0.0045, 0.13);
  const ch = group(g, 'p_charging', 0.019, 0.032, 0.17);
  mesh(box(0.006, 0.01, 0.022), 'bright', ch);
  mesh(cylX(0.0055, 0.018, 12), 'bright', ch, 0.01, 0, 0);
  triggerSet(g, { fb: 0.008, ff: 0.092, y: -0.004, d: 0.028, w: 0.014, ft: 0.058, role: 'recv' });
  pistolGrip(g, { len: 0.105, top: 0.04, bot: 0.036, w: 0.032, rake: 0.35, role: 'poly', grooves: 1 });
  mesh(pinsX([[0.0025, 0.04, 0, 0.01, -0.03], [0.0025, 0.04, 0, 0.01, 0.2]]), 'bright', g);
  mesh(cylX(0.0045, 0.03, 12), 'bright', g, 0, 0.004, 0.098);
  // ghost-ring rear sight with protective wings, front post with ears
  mesh(ext([[-0.04, 0.0765], [-0.04, 0.084, 0.002], [-0.005, 0.084, 0.002], [-0.005, 0.0765]], 0.03), 'recv', g);
  for (const s of [1, -1]) mesh(ext([[-0.035, 0.084], [-0.032, 0.112, 0.004], [-0.018, 0.112, 0.003], [-0.012, 0.084]], 0.003), 'recv', g, s * 0.012);
  mesh(new THREE.TorusGeometry(0.0055, 0.0018, 8, 20), 'recv', g, 0, 0.1, -0.024);
  mesh(box(0.004, 0.012, 0.004), 'recv', g, 0, 0.09, -0.024);
  // collapsible tube stock
  mesh(lathe([[0.0145, -0.24], [0.0145, -0.06], [0.016, -0.058]], 24), 'alu', g, 0, 0.044, 0);
  mesh(cylZ(0.018, 0.008, 12), 'recv', g, 0, 0.044, -0.066);
  mesh(ext([[-0.15, 0.062], [-0.3, 0.066, 0.005], [-0.305, 0.062], [-0.305, -0.06, 0.006], [-0.29, -0.062], [-0.27, -0.04, 0.01], [-0.2, 0.014, 0.03], [-0.17, 0.024], [-0.15, 0.024]], 0.042,
    { bevel: 0.004, bs: 3, holes: [[[-0.24, 0.012, 0.005], [-0.272, -0.036, 0.005], [-0.282, -0.012, 0.005], [-0.282, 0.012, 0.005]]] }), 'poly', g);
  mesh(ext([[-0.303, 0.064], [-0.316, 0.063, 0.004], [-0.316, -0.058, 0.004], [-0.303, -0.062]], 0.046), 'rubber', g);
  mesh(ext([[-0.16, 0.022], [-0.185, 0.022], [-0.19, 0.014, 0.003], [-0.165, 0.016]], 0.008), 'poly', g);
  // ribbed handguard over tube & barrel
  mesh(ext([[0.225, 0.064], [0.23, 0.07, 0.008], [0.42, 0.068, 0.008], [0.43, 0.06], [0.43, 0.012, 0.012], [0.42, 0.002], [0.24, 0.002, 0.01], [0.225, 0.012]], 0.05, { bevel: 0.007, bs: 3 }), 'poly', g);
  mesh(boxes(Array.from({ length: 10 }, (_, i) => [0.0525, 0.0035, 0.006, 0, 0.003, 0.25 + i * 0.017])), 'poly', g);
  sideSlots(g, { f0: 0.25, f1: 0.41, n: 5, y: 0.05, x: 0.0255, h: 0.006 });
  // barrel, tube mag, twin gas cylinders, front sight
  mesh(lathe([[0.0125, 0.22], [0.0115, 0.25], [0.011, 0.69], [0.0095, 0.69]], 24), 'metal', g, 0, by, 0);
  mesh(cylZ(0.0125, 0.24, 20), 'metal', g, 0, 0.02, 0.55);
  mesh(lathe([[0.0125, 0.67], [0.014, 0.672], [0.014, 0.69], [0.009, 0.695]], 20), 'recv', g, 0, 0.02, 0);
  for (const s of [1, -1]) mesh(cylZ(0.0055, 0.07, 12), 'bright', g, s * 0.012, 0.034, 0.465);
  mesh(extZ(rectXY(0.04, 0.052, 0.012, 0, 0.034), 0.03), 'recv', g, 0, 0, 0.43);
  mesh(extZ(rectXY(0.03, 0.05, 0.01, 0, 0.034), 0.012), 'recv', g, 0, 0, 0.65);
  mesh(ext([[0.655, 0.06], [0.658, 0.08, 0.003], [0.67, 0.08, 0.003], [0.673, 0.06]], 0.006), 'recv', g);
  for (const s of [1, -1]) mesh(ext([[0.652, 0.058], [0.655, 0.084, 0.003], [0.672, 0.084, 0.003], [0.676, 0.058]], 0.0025), 'recv', g, s * 0.008);
  mesh(cylZ(0.0125, 0.03, 16), 'recv', g, 0, by, 0.66);
  swivel(g, 0, 0.004, 0.65, 0);
  stdHands(g, { rake: 0.35, lx: -0.031, ly: 0.012, lf: 0.33 });
  anchor(g, 'muzzle', 0, by, 0.69); anchor(g, 'eject', 0.019, 0.04, 0.11);
  return { kind: 'shotgun', length: 1.01, orn: { spans: [[0.24, 0.42, 0.035, 0.026], [-0.29, -0.2, 0.0, 0.022]], gem: [0.019, 0.03, 0.05] } };
}

// ================================================================== MACHINE GUN
function m249(g) {
  const by = 0.06;
  // receiver + feed cover (part beltCover)
  mesh(ext([[-0.08, -0.004], [-0.08, 0.07, 0.006], [0.26, 0.07], [0.27, 0.06, 0.004], [0.27, 0.0, 0.004], [0.255, -0.01], [-0.06, -0.01]], 0.05, { bevel: 0.003 }), 'recv', g);
  mesh(boxes([[0.0012, 0.006, 0.3, 0.0256, 0.03, 0.09], [0.0012, 0.006, 0.3, -0.0256, 0.03, 0.09], [0.0012, 0.02, 0.08, 0.0256, 0.052, 0.14]]), 'dark', g);
  const cov = group(g, 'p_beltCover', 0, 0.07, -0.03);
  mesh(ext([[0.0, 0.0], [0.002, 0.018, 0.006], [0.2, 0.02, 0.006], [0.23, 0.012], [0.23, 0.0]], 0.05, { bevel: 0.003 }), 'recv', cov);
  rail(cov, 0.03, 0.2, 0.02, { role: 'recv' });
  mesh(ext([[-0.01, 0.01], [-0.006, 0.042, 0.004], [0.012, 0.042, 0.004], [0.016, 0.01]], 0.018, { holes: [[[-0.002, 0.026], [-0.002, 0.036], [0.008, 0.036], [0.008, 0.026]]] }), 'recv', cov);
  mesh(cylX(0.004, 0.056, 10), 'bright', cov, 0, 0.004, 0.0);
  mesh(box(0.008, 0.008, 0.012), 'bright', cov, 0.0, 0.006, 0.232);
  // feed tray throat (left) + charging handle (right)
  mesh(box(0.02, 0.03, 0.06), 'recv', g, -0.035, 0.05, 0.13);
  const ch = group(g, 'p_charging', 0.027, 0.04, 0.2);
  mesh(box(0.006, 0.01, 0.026), 'recv', ch);
  mesh(cylX(0.006, 0.024, 12), 'recv', ch, 0.012, 0, 0);
  triggerSet(g, { fb: 0.004, ff: 0.095, y: -0.01, d: 0.032, w: 0.016, ft: 0.058, role: 'recv' });
  pistolGrip(g, { len: 0.105, top: 0.04, bot: 0.036, w: 0.034, rake: 0.32, role: 'poly', grooves: 3 });
  mesh(pinsX([[0.003, 0.054, 0, 0.0, -0.06], [0.003, 0.054, 0, 0.015, 0.24]]), 'bright', g);
  // fixed polymer stock
  mesh(ext([[-0.078, 0.068], [-0.3, 0.06, 0.006], [-0.312, 0.052], [-0.312, -0.085, 0.006], [-0.295, -0.092], [-0.15, -0.025, 0.04], [-0.078, -0.01]], 0.046,
    { bevel: 0.005, bs: 3, holes: [[[-0.12, 0.04, 0.01], [-0.25, 0.034, 0.01], [-0.27, -0.03, 0.012], [-0.16, 0.0, 0.02]]] }), 'poly', g);
  mesh(ext([[-0.31, 0.054], [-0.322, 0.053, 0.004], [-0.322, -0.086, 0.004], [-0.31, -0.09]], 0.05), 'rubber', g);
  swivel(g, 0, -0.06, -0.24, 0.3);
  // barrel, heat shield, carry handle, gas tube, lower handguard, bipod
  mesh(lathe([[0.016, 0.26], [0.016, 0.3], [0.0125, 0.31], [0.0115, 0.72], [0.0095, 0.72]], 24), 'metal', g, 0, by, 0);
  const sh = Array.from({ length: 9 }, (_, i) => { const a = 0.35 + i / 8 * (PI - 0.7); return [Math.cos(a) * 0.022, by + Math.sin(a) * 0.022]; });
  mesh(extZ(sh.concat(sh.slice().reverse().map(([x, y]) => [x * 1.12, by + (y - by) * 1.12])), 0.24, { bevel: 0.0008 }), 'recv', g, 0, 0, 0.3);
  mesh(boxes(Array.from({ length: 10 }, (_, i) => [0.005, 0.0012, 0.01, 0, by + 0.0235, 0.32 + i * 0.022])), 'dark', g);
  mesh(ext([[0.31, 0.088], [0.318, 0.14, 0.012], [0.42, 0.14, 0.012], [0.428, 0.088], [0.412, 0.088], [0.405, 0.126, 0.006], [0.333, 0.126, 0.006], [0.326, 0.088]], 0.016, { bevel: 0.002 }), 'poly', g);
  mesh(cylZ(0.009, 0.3, 16), 'metal', g, 0, 0.028, 0.41);
  mesh(ext([[0.27, 0.05], [0.272, 0.006, 0.01], [0.46, 0.008, 0.01], [0.47, 0.04]], 0.052, { bevel: 0.007, bs: 3 }), 'poly', g);
  mesh(boxes(Array.from({ length: 8 }, (_, i) => [0.054, 0.0035, 0.006, 0, 0.012, 0.3 + i * 0.02])), 'poly', g);
  mesh(ext([[0.54, 0.02], [0.54, 0.075, 0.006], [0.58, 0.075, 0.006], [0.585, 0.02]], 0.03), 'recv', g); // gas block
  mesh(ext([[0.69, 0.065], [0.692, 0.098, 0.004], [0.706, 0.098, 0.004], [0.71, 0.065]], 0.01), 'recv', g);
  mesh(cylZ(0.015, 0.025, 18), 'recv', g, 0, by, 0.7);
  birdcage(g, 0.72, by, 0.012, 0.05);
  const bp = group(g, 'bipod', 0, 0.02, 0.57);
  mesh(cylX(0.01, 0.04, 14), 'recv', bp);
  for (const s of [1, -1]) {
    const leg = group(bp, null, s * 0.016, 0, 0); leg.rotation.set(-0.3, 0, s * 0.3);
    mesh(cylY(0.0055, 0.22, 10), 'recv', leg, 0, -0.11, 0);
    mesh(cylY(0.0042, 0.06, 10), 'bright', leg, 0, -0.245, 0);
    mesh(cylX(0.004, 0.02, 8), 'recv', leg, 0, -0.278, 0);
  }
  // 200 rd box + belt into the feed tray
  const mag = group(g, 'p_mag', -0.012, -0.012, 0.06);
  mesh(ext([[0, 0], [0, -0.11, 0.006], [0.13, -0.11, 0.006], [0.13, 0]], 0.07, { bevel: 0.003 }), 'od', mag);
  mesh(boxes([[0.0715, 0.006, 0.13, 0, -0.03, 0.065], [0.0715, 0.006, 0.13, 0, -0.07, 0.065]]), 'od', mag);
  mesh(box(0.03, 0.012, 0.03), 'poly', mag, -0.025, -0.02, 0.1);
  grabPoint(mag, -0.04, -0.08, 0.06);
  const belt = group(g, 'p_belt', -0.035, 0.0, 0.0);
  const R = [];
  for (let i = 0; i < 7; i++) { const t = i / 6; const yy = -0.012 + t * 0.06, xx = -0.01 * Math.sin(t * PI); R.push(cylX(0.0045, 0.05, 8).translate(xx, yy, -(0.13 + (i % 2) * 0.004))); }
  mesh(mergeGeometries(R), 'brass', belt);
  mesh(box(0.004, 0.065, 0.016), 'metal', belt, -0.022, 0.018, 0.13);
  stdHands(g, { rake: 0.32, lx: -0.032, ly: 0.012, lf: 0.36 });
  anchor(g, 'muzzle', 0, by, 0.77); anchor(g, 'eject', 0.026, 0.048, 0.14);
  return { kind: 'mg', length: 1.09, orn: { spans: [[0.28, 0.46, 0.028, 0.026], [-0.29, -0.12, 0.03, 0.023]], gem: [0.026, 0.02, 0.0] } };
}

// ================================================================== PISTOLS
function slideSerrations(parent, f0, n, step, y0, h, hw, role = 'dark') {
  const L = [];
  for (let i = 0; i < n; i++) for (const s of [1, -1]) L.push([0.0012, h, 0.0016, s * hw, y0, f0 + i * step]);
  return mesh(boxes(L), role, parent);
}
function pistolMag(g, { rake, len, w = 0.022, d = 0.03, f = 0.018, base = 'poly', body = 'recv', baseH = 0.008 }) {
  const mag = group(g, 'p_mag', 0, -0.004, f);
  mag.rotation.x = -rake;
  mesh(box(w, len, d), body, mag, 0, -len / 2, 0);
  mesh(ext([[-d / 2 - 0.003, -len], [-d / 2 - 0.004, -len - baseH, 0.002], [d / 2 + 0.003, -len - baseH, 0.002], [d / 2 + 0.002, -len]], w + 0.006, { bevel: 0.0015 }), base, mag);
  mesh(box(w * 0.8, 0.004, d * 0.7), 'brass', mag, 0, 0.002, 0.003);
  grabPoint(mag, -0.02, -len, 0);
  return mag;
}

function deagle(g) {
  const by = 0.034, rake = 0.24;
  // frame
  mesh(ext([[-0.034, 0.016], [-0.036, -0.004, 0.006], [-0.02, -0.01], [0.2, -0.01], [0.212, 0.0, 0.004], [0.212, 0.016]], 0.028, { bevel: 0.002 }), 'stainless', g);
  triggerSet(g, { fb: 0.008, ff: 0.08, y: -0.008, d: 0.032, w: 0.012, ft: 0.046, role: 'stainless' });
  mesh(box(0.012, 0.004, 0.012), 'stainless', g, 0, -0.04, 0.083); // squared guard hook
  pistolGrip(g, { len: 0.1, top: 0.05, bot: 0.047, w: 0.034, rake, role: 'stainless', grooves: 0, swell: false });
  for (const s of [1, -1]) mesh(ext([[0.004, -0.01], [0.038, -0.012], [0.016, -0.088, 0.01], [-0.012, -0.084, 0.01]], 0.003, { bevel: 0.001 }), 'rubber', g, s * 0.0182);
  // slide (part) with rear serrations, hammer, rear sight
  const slide = group(g, 'p_slide');
  mesh(extZ([[-0.0152, 0.014], [0.0152, 0.014], [0.0152, 0.037, 0.003], [0.009, 0.047, 0.004], [-0.009, 0.047, 0.004], [-0.0152, 0.037, 0.003]], 0.155, { bevel: 0.002 }), 'stainless', slide, 0, 0, -0.04);
  slideSerrations(slide, -0.03, 9, 0.0045, 0.03, 0.016, 0.0156);
  mesh(box(0.0012, 0.012, 0.04), 'dark', slide, 0.0156, 0.038, 0.06);
  mesh(ext([[-0.034, 0.047], [-0.033, 0.054, 0.002], [-0.02, 0.054, 0.002], [-0.018, 0.047]], 0.016, { holes: [[[-0.03, 0.05], [-0.03, 0.055], [-0.022, 0.055], [-0.022, 0.05]]] }), 'stainless', slide);
  for (const s of [1, -1]) mesh(ext([[-0.03, 0.025], [-0.012, 0.025], [-0.012, 0.031], [-0.03, 0.034, 0.002]], 0.003), 'stainless', slide, s * 0.0168); // ambi safety
  const hammer = group(g, 'p_hammer', 0, 0.022, -0.038);
  mesh(ext([[0.004, -0.004], [-0.008, 0.002, 0.003], [-0.012, 0.016, 0.004], [-0.004, 0.018], [0.004, 0.006]], 0.008), 'bright', hammer);
  // fixed barrel with triangular top, polygonal muzzle
  mesh(extZ([[-0.0135, 0.016], [0.0135, 0.016], [0.0135, 0.031, 0.002], [0.004, 0.0465, 0.002], [-0.004, 0.0465, 0.002], [-0.0135, 0.031, 0.002]], 0.125, { bevel: 0.0015 }), 'stainless', g, 0, 0, 0.113);
  mesh(lathe([[0.0062, 0.236], [0.0062, 0.237], [0.009, 0.238]], 8), 'dark', g, 0, by, 0);
  mesh(new THREE.CircleGeometry(0.0065, 8), 'dark', g, 0, by, 0.2385, 0, PI, 0);
  mesh(boxes([[0.0012, 0.008, 0.08, 0.0141, 0.024, 0.17], [0.0012, 0.008, 0.08, -0.0141, 0.024, 0.17]]), 'dark', g);
  mesh(ext([[0.222, 0.046], [0.224, 0.056, 0.002], [0.232, 0.056], [0.234, 0.046]], 0.004), 'stainless', g);
  mesh(box(0.003, 0.003, 0.003), 'glowR', g, 0, 0.054, 0.229);
  // slide stop, mag release, pins
  mesh(ext([[0.04, 0.008], [0.09, 0.01, 0.002], [0.095, 0.018, 0.003], [0.08, 0.02], [0.045, 0.014]], 0.003), 'stainless', g, -0.0155);
  mesh(cylX(0.005, 0.004, 14), 'stainless', g, -0.015, -0.004, 0.003);
  mesh(pinsX([[0.0022, 0.031, 0, 0.004, 0.13], [0.0022, 0.031, 0, 0.004, -0.02]]), 'bright', g);
  pistolMag(g, { rake, len: 0.095, w: 0.024, d: 0.04, f: 0.02, base: 'stainless', body: 'stainless', baseH: 0.008 });
  anchor(g, 'rightHand', 0, 0, 0, RQ(rake));
  anchor(g, 'leftHand', -0.016, -0.03, 0.028, LQP(rake));
  anchor(g, 'muzzle', 0, by, 0.24); anchor(g, 'eject', 0.016, 0.04, 0.06);
  return { kind: 'pistol', length: 0.27, orn: { spans: [[0.12, 0.23, 0.026, 0.0135], [-0.03, 0.1, 0.03, 0.0153]], gem: [0.016, -0.04, -0.01] } };
}

function usp(g) {
  const by = 0.029, rake = 0.3;
  // polymer frame with accessory groove rail
  mesh(ext([[-0.03, 0.014], [-0.034, -0.002, 0.006], [-0.02, -0.008], [0.15, -0.008], [0.158, -0.004, 0.004], [0.158, 0.014]], 0.026, { bevel: 0.002 }), 'poly', g);
  mesh(boxes([[0.03, 0.003, 0.06, 0, -0.012, 0.12], [0.022, 0.004, 0.06, 0, -0.008, 0.12]]), 'poly', g);
  triggerSet(g, { fb: 0.006, ff: 0.078, y: -0.007, d: 0.03, w: 0.011, ft: 0.044, role: 'poly' });
  mesh(ext([[0.068, -0.03], [0.083, -0.03, 0.003], [0.083, -0.022]], 0.006), 'poly', g); // guard hook
  pistolGrip(g, { len: 0.098, top: 0.044, bot: 0.04, w: 0.03, rake, role: 'poly', grooves: 0 });
  // slide
  const slide = group(g, 'p_slide');
  mesh(extZ([[-0.0145, 0.012], [0.0145, 0.012], [0.0145, 0.035, 0.004], [0.0095, 0.041, 0.004], [-0.0095, 0.041, 0.004], [-0.0145, 0.035, 0.004]], 0.198, { bevel: 0.002 }), 'recv', slide, 0, 0, -0.036);
  slideSerrations(slide, -0.028, 8, 0.0042, 0.026, 0.014, 0.0148);
  mesh(box(0.0012, 0.011, 0.035), 'dark', slide, 0.0148, 0.034, 0.04);
  mesh(box(0.012, 0.0012, 0.035), 'dark', slide, 0.006, 0.0412, 0.04);
  mesh(box(0.012, 0.011, 0.03), 'bright', slide, 0.002, 0.032, 0.04); // barrel hood in the port
  mesh(ext([[-0.032, 0.041], [-0.031, 0.048, 0.002], [-0.02, 0.048, 0.002], [-0.018, 0.041]], 0.016), 'recv', slide);
  mesh(boxes([[0.0025, 0.0025, 0.002, 0.005, 0.0475, -0.032], [0.0025, 0.0025, 0.002, -0.005, 0.0475, -0.032]]), 'white', slide);
  mesh(ext([[0.148, 0.041], [0.15, 0.048, 0.002], [0.157, 0.048], [0.158, 0.041]], 0.0035), 'recv', slide);
  mesh(box(0.002, 0.002, 0.001), 'white', slide, 0, 0.046, 0.1495);
  mesh(lathe([[0.0055, 0.16], [0.0065, 0.162], [0.0045, 0.162]], 16), 'bright', g, 0, by, 0);
  mesh(new THREE.CircleGeometry(0.0045, 12), 'dark', g, 0, by, 0.1615, 0, PI, 0);
  const hammer = group(g, 'p_hammer', 0, 0.02, -0.034);
  mesh(ext([[0.003, -0.004], [-0.006, 0.0, 0.003], [-0.01, 0.012, 0.004], [-0.003, 0.014], [0.003, 0.004]], 0.007), 'recv', hammer);
  // control lever (left), slide stop, takedown pin
  mesh(ext([[-0.03, 0.006], [-0.006, 0.006], [-0.006, 0.013], [-0.026, 0.016, 0.003]], 0.003), 'poly', g, -0.0145);
  mesh(ext([[0.035, 0.004], [0.075, 0.006, 0.002], [0.08, 0.013, 0.003], [0.07, 0.015], [0.038, 0.011]], 0.003), 'recv', g, -0.0145);
  mesh(pinsX([[0.002, 0.028, 0, 0.004, 0.105]]), 'bright', g);
  pistolMag(g, { rake, len: 0.09, w: 0.02, d: 0.034, f: 0.018 });
  anchor(g, 'rightHand', 0, 0, 0, RQ(rake));
  anchor(g, 'leftHand', -0.015, -0.03, 0.026, LQP(rake));
  anchor(g, 'muzzle', 0, by, 0.162); anchor(g, 'eject', 0.015, 0.036, 0.04);
  return { kind: 'pistol', length: 0.2, orn: { spans: [[0.0, 0.15, 0.028, 0.0147]], gem: [0.016, -0.045, -0.008] } };
}

function glock18(g) {
  const by = 0.027, rake = 0.36;
  mesh(ext([[-0.028, 0.012], [-0.03, -0.002, 0.005], [-0.018, -0.008], [0.15, -0.008], [0.156, -0.002, 0.003], [0.156, 0.012]], 0.025, { bevel: 0.002 }), 'poly', g);
  mesh(boxes([[0.026, 0.003, 0.04, 0, -0.011, 0.13]]), 'poly', g);
  mesh(boxes([0.115, 0.125, 0.135, 0.145].map(f => [0.027, 0.0014, 0.0035, 0, -0.012, f])), 'dark', g);
  triggerSet(g, { fb: 0.006, ff: 0.076, y: -0.007, d: 0.028, w: 0.011, ft: 0.044, role: 'poly', trigRole: 'poly' });
  pistolGrip(g, { len: 0.096, top: 0.042, bot: 0.038, w: 0.029, rake, role: 'poly', grooves: 3 });
  // boxy slide with compensator cuts and selector
  const slide = group(g, 'p_slide');
  mesh(extZ([[-0.0128, 0.012], [0.0128, 0.012], [0.0128, 0.034, 0.002], [0.0105, 0.0375, 0.002], [-0.0105, 0.0375, 0.002], [-0.0128, 0.034, 0.002]], 0.188, { bevel: 0.0015 }), 'recv', slide, 0, 0, -0.03);
  slideSerrations(slide, -0.024, 7, 0.0045, 0.025, 0.016, 0.013);
  mesh(box(0.0012, 0.011, 0.034), 'dark', slide, 0.013, 0.031, 0.04);
  mesh(box(0.012, 0.011, 0.03), 'bright', slide, 0.002, 0.03, 0.04);
  mesh(boxes([[0.003, 0.0012, 0.008, -0.003, 0.0378, 0.135], [0.003, 0.0012, 0.008, 0.003, 0.0378, 0.135], [0.003, 0.0012, 0.008, -0.003, 0.0378, 0.147], [0.003, 0.0012, 0.008, 0.003, 0.0378, 0.147]]), 'dark', slide);
  mesh(ext([[-0.026, 0.0375], [-0.025, 0.044, 0.002], [-0.016, 0.044, 0.002], [-0.014, 0.0375]], 0.015), 'recv', slide);
  mesh(ext([[0.148, 0.0375], [0.15, 0.044, 0.002], [0.156, 0.044], [0.157, 0.0375]], 0.0035), 'recv', slide);
  mesh(box(0.002, 0.002, 0.001), 'white', slide, 0, 0.042, 0.1495);
  const sel = group(slide, 'selector', -0.0135, 0.026, -0.02);
  mesh(cylX(0.004, 0.003, 12), 'recv', sel);
  mesh(box(0.003, 0.004, 0.009), 'recv', sel, -0.001, 0, 0.004);
  mesh(lathe([[0.0055, 0.157], [0.0065, 0.1585], [0.0045, 0.1585]], 16), 'bright', g, 0, by, 0);
  mesh(new THREE.CircleGeometry(0.0045, 12), 'dark', g, 0, by, 0.158, 0, PI, 0);
  mesh(box(0.003, 0.004, 0.006), 'recv', g, -0.013, 0.002, 0.1); // takedown lever
  mesh(ext([[0.035, 0.004], [0.07, 0.006, 0.002], [0.074, 0.012, 0.003], [0.065, 0.013], [0.038, 0.01]], 0.0025), 'recv', g, -0.0132);
  mesh(box(0.006, 0.008, 0.006), 'poly', g, -0.012, -0.012, 0.0); // mag release
  pistolMag(g, { rake, len: 0.088, w: 0.02, d: 0.032, f: 0.016 });
  anchor(g, 'rightHand', 0, 0, 0, RQ(rake));
  anchor(g, 'leftHand', -0.015, -0.03, 0.026, LQP(rake));
  anchor(g, 'muzzle', 0, by, 0.159); anchor(g, 'eject', 0.014, 0.034, 0.04);
  return { kind: 'pistol', length: 0.19, orn: { spans: [[0.0, 0.14, 0.024, 0.013]], gem: [0.0155, -0.045, -0.01] } };
}

// ================================================================== MELEE
// fist orientation for a handle running along the bore (thumb toward the blade)
const KQ = () => handQ([-0.6, -0.8, 0], [-0.8, 0.6, 0]);
const edgeTaper = (yEdge, ySpine, min = 0.12) => (f, y) => min + (1 - min) * clamp01((y - yEdge) / (ySpine - yEdge));

function knife(g) {
  const blade = group(g, 'p_blade');
  const pts = [[0.012, 0.011], [0.13, 0.011], [0.205, -0.001], [0.175, -0.011, 0.035], [0.12, -0.0165], [0.012, -0.0165]];
  mesh(ext(pts, 0.0055, { bevel: 0.0005, cs: 10, taper: edgeTaper(-0.0165, 0.006, 0.1) }), 'blade', blade);
  mesh(boxes([[0.0006, 0.0035, 0.1, 0.0024, 0.0015, 0.075], [0.0006, 0.0035, 0.1, -0.0024, 0.0015, 0.075]]), 'metal', blade); // fuller
  mesh(boxes(Array.from({ length: 12 }, (_, i) => [0.0045, 0.0028, 0.0028, 0, 0.011, 0.025 + i * 0.0055, PI / 4])), 'blade', blade); // spine serrations
  mesh(boxes([[0.0058, 0.0012, 0.11, 0, -0.0158, 0.07]]), 'bright', blade);
  // guard, grip, pommel
  mesh(ext([[0.0, 0.022], [0.002, 0.026, 0.002], [0.012, 0.024, 0.002], [0.012, -0.028, 0.002], [0.004, -0.034, 0.003], [0.0, -0.03]], 0.014, { bevel: 0.0015 }), 'recv', g);
  const grip = lathe([[0.0105, -0.118], [0.0125, -0.108], [0.0135, -0.09], [0.012, -0.072], [0.0135, -0.05], [0.0125, -0.025], [0.0115, -0.004], [0.0105, 0.0]], 24);
  grip.scale(0.78, 1, 1);
  mesh(grip, 'rubber', g, 0, -0.002, 0);
  mesh(mergeGeometries([-0.02, -0.035, -0.06, -0.08, -0.1].map(f => new THREE.TorusGeometry(0.0128, 0.0011, 6, 20).scale(0.8, 1, 1).translate(0, 0, -f))), 'poly', g, 0, -0.002, 0);
  mesh(lathe([[0.006, -0.135], [0.011, -0.132], [0.012, -0.124], [0.0105, -0.118]], 20).scale(0.85, 1, 1), 'recv', g, 0, -0.002, 0);
  mesh(new THREE.TorusGeometry(0.004, 0.0013, 6, 14), 'bright', g, 0, -0.002, -0.128, 0, PI / 2, 0);
  anchor(g, 'rightHand', 0.015, 0.02, -0.005, KQ());
  anchor(g, 'muzzle', 0, 0, 0.205); // blade tip (for hit traces)
  return { kind: 'melee', length: 0.34, grip: 'knife', orn: { spans: [[0.03, 0.12, 0.004, 0.0026]], gem: [0.007, -0.004, 0.006] } };
}

function axe(g) {
  // G10 handle with cord wrap
  mesh(extZ(rectXY(0.02, 0.03, 0.008), 0.42, { bevel: 0.002 }), 'poly', g, 0, -0.004, -0.1);
  mesh(mergeGeometries(Array.from({ length: 14 }, (_, i) => new THREE.TorusGeometry(0.0145, 0.0022, 6, 16).scale(0.78, 1, 1).translate(0, 0, 0.095 - i * 0.0068))), 'cord', g, 0, -0.004, 0);
  mesh(cylX(0.004, 0.024, 10), 'bright', g, 0, -0.004, -0.09);
  // head (part: blade): bearded blade below, spike above
  const head = group(g, 'p_blade');
  const blade = [[0.262, 0.012], [0.262, -0.025], [0.236, -0.085, 0.012], [0.244, -0.108], [0.345, -0.106, 0.05], [0.335, -0.06, 0.02], [0.305, -0.02, 0.01], [0.304, 0.012]];
  mesh(ext(blade, 0.009, { bevel: 0.0008, cs: 10, taper: (f, y) => 0.12 + 0.88 * clamp01((-y - 0.0) / 0.03 < 1 ? 1 : 1 - (-y - 0.03) / 0.08) }), 'recv', head);
  mesh(ext([[0.243, -0.103], [0.248, -0.11], [0.348, -0.108, 0.05], [0.343, -0.096, 0.045]], 0.0026, { bevel: 0.0004 }), 'blade', head);
  mesh(ext([[0.268, 0.012], [0.268, 0.04], [0.283, 0.105], [0.3, 0.04], [0.298, 0.012]], 0.008, { bevel: 0.0008, taper: (f, y) => 1 - 0.8 * clamp01((y - 0.04) / 0.065) }), 'recv', head);
  mesh(extZ(rectXY(0.026, 0.036, 0.004, 0, -0.004), 0.05, { bevel: 0.002 }), 'recv', head, 0, 0, 0.258);
  mesh(new THREE.CircleGeometry(0.009, 18), 'dark', head, 0.0046, -0.06, 0.286, 0, PI / 2, 0);
  mesh(new THREE.CircleGeometry(0.009, 18), 'dark', head, -0.0046, -0.06, 0.286, 0, -PI / 2, 0);
  screws(head, 0.026, -0.004, [0.27, 0.296], 0.0028, 'bright');
  anchor(g, 'rightHand', 0.015, 0.016, -0.005, KQ());
  anchor(g, 'muzzle', 0, -0.108, 0.3);
  return { kind: 'melee', length: 0.43, grip: 'knife', orn: { spans: [[0.0, 0.25, 0.006, 0.01]], gem: [0.0046, -0.06, 0.286] } };
}

function machete(g) {
  const blade = group(g, 'p_blade');
  const pts = [[0.012, 0.012], [0.3, 0.02], [0.4, 0.016, 0.03], [0.445, -0.004], [0.41, -0.032, 0.05], [0.25, -0.04, 0.08], [0.1, -0.03], [0.012, -0.022]];
  mesh(ext(pts, 0.0045, { bevel: 0.0005, cs: 10, taper: (f, y) => 0.1 + 0.9 * clamp01((y + 0.03 + f * 0.02) / 0.04) }), 'blade', blade);
  mesh(boxes([[0.0005, 0.003, 0.3, 0.0021, 0.008, 0.18], [0.0005, 0.003, 0.3, -0.0021, 0.008, 0.18]]), 'metal', blade);
  mesh(boxes([[0.0047, 0.0014, 0.25, 0, 0.0165, 0.16, 0.027]]), 'bright', blade);
  // brass bolster + guard, wood scales with rivets, pommel hook
  mesh(ext([[0.0, 0.02], [0.012, 0.02, 0.002], [0.012, -0.03, 0.002], [0.0, -0.03]], 0.014, { bevel: 0.0015 }), 'brass', g);
  mesh(ext([[0.0, 0.016], [-0.13, 0.014, 0.006], [-0.145, 0.006], [-0.15, -0.024, 0.008], [-0.13, -0.022], [-0.08, -0.018, 0.03], [-0.04, -0.022, 0.03], [0.0, -0.022]], 0.024, { bevel: 0.004, bs: 3 }), 'wood', g);
  mesh(boxes([[0.0018, 0.03, 0.15, 0, 0.0, -0.07]]), 'recv', g); // tang
  for (const f of [-0.025, -0.07, -0.115]) { screw(g, 0.0125, -0.003, f, 1, 0.0032, 'brass'); screw(g, -0.0125, -0.003, f, -1, 0.0032, 'brass'); }
  mesh(new THREE.TorusGeometry(0.0045, 0.0014, 6, 14), 'brass', g, 0, -0.006, -0.138, 0, PI / 2, 0);
  anchor(g, 'rightHand', 0.015, 0.018, -0.005, KQ());
  anchor(g, 'muzzle', 0, -0.004, 0.445);
  return { kind: 'melee', length: 0.6, grip: 'knife', orn: { spans: [[0.03, 0.3, 0.0, 0.0024]], gem: [0.0125, -0.003, -0.025] } };
}

// ================================================================== GRENADES
function grenadeTop(g, topY, { role = 'grenGrey', backF = -0.03, bodyR = 0.032, spoonDown = 0.06 } = {}) {
  mesh(lathe([[0.012, 0], [0.0125, 0.004], [0.011, 0.016], [0.009, 0.02], [0.003, 0.022]], 20).rotateX(PI / 2), role, g, 0, topY - 0.002, 0);
  mesh(cylX(0.0045, 0.03, 12), role, g, 0, topY + 0.008, 0); // striker housing
  const lever = group(g, 'p_lever', 0, topY + 0.018, -0.004);
  mesh(ext([[0.012, 0.0], [0.0, 0.004, 0.004], [backF + 0.006, -0.006, 0.01], [backF - 0.002, -0.03, 0.02], [backF + 0.002, -spoonDown], [backF + 0.006, -spoonDown], [backF + 0.003, -0.03, 0.02], [backF + 0.01, -0.0025, 0.01], [0.0, 0.0005, 0.003], [0.012, -0.004]], 0.012, { bevel: 0.0006, cs: 8 }), role, lever);
  const pin = group(g, 'p_pin', 0.018, topY + 0.006, 0.004);
  mesh(new THREE.TorusGeometry(0.011, 0.0013, 8, 24), 'bright', pin, 0.012, 0, 0.0, 0, 0.35, 0);
  mesh(cylX(0.001, 0.026, 6), 'bright', pin, -0.004, 0, 0);
}
function he(g) {
  const R = 0.032;
  mesh(lathe([[0.001, -R], [R * 0.6, -R * 0.82], [R * 0.95, -R * 0.35], [R, 0.0], [R * 0.93, R * 0.4], [R * 0.6, R * 0.82], [0.012, R + 0.002]], 28).rotateX(PI / 2), 'gren', g);
  mesh(mergeGeometries([-0.016, 0.0, 0.016].map(y => new THREE.TorusGeometry(Math.sqrt(R * R - y * y) + 0.0004, 0.0007, 6, 32).rotateX(PI / 2).translate(0, y, 0))), 'gren', g);
  mesh(cylY(0.0125, 0.006, 20), 'bandY', g, 0, R - 0.001, 0);
  grenadeTop(g, R + 0.004, { backF: -0.03, spoonDown: 0.058 });
  anchor(g, 'rightHand', 0.015, 0.02, 0.04, KQ());
  anchor(g, 'muzzle', 0, 0.045, 0);
  return { kind: 'grenade', length: 0.1, grip: 'grenade', orn: { spans: [], gem: [R * 0.92, 0.0, 0.0] } };
}
function canGrenade(g, { r = 0.024, h = 0.11, body = 'grenGrey', holes = false, band = null }) {
  mesh(lathe([[0.001, -h / 2], [r * 0.9, -h / 2], [r, -h / 2 + 0.004], [r, h / 2 - 0.004], [r * 0.9, h / 2], [0.012, h / 2]], 28).rotateX(PI / 2), body, g);
  if (holes) {
    const L = [];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 8; i++) { const a = (i + row * 0.5) / 8 * PI * 2; L.push([0.0052, 0.009, 0.0012, Math.sin(a) * r, -0.03 + row * 0.03, -Math.cos(a) * r, 0, a, 0]); }
    mesh(boxes(L.map(([w, hh, l, x, y, f, rx, ry]) => [w, hh, l, x, y, f, rx, ry])), 'dark', g);
  }
  if (band) mesh(cylY(r + 0.0006, 0.018, 28), band, g, 0, h / 2 - 0.03, 0);
  mesh(new THREE.TorusGeometry(r, 0.0012, 6, 28).rotateX(PI / 2), body, g, 0, -h / 2 + 0.01, 0);
  grenadeTop(g, h / 2 + 0.002, { backF: -r - 0.003, spoonDown: 0.075 });
  anchor(g, 'rightHand', 0.015, 0.02, 0.04, KQ());
  anchor(g, 'muzzle', 0, h / 2 + 0.02, 0);
}
function flash(g) {
  canGrenade(g, { r: 0.024, h: 0.11, body: 'grenGrey', holes: true });
  return { kind: 'grenade', length: 0.13, grip: 'grenade', orn: { spans: [], gem: [0.0245, -0.045, 0] } };
}
function smoke(g) {
  canGrenade(g, { r: 0.03, h: 0.115, body: 'gren', band: 'bandG' });
  mesh(cylY(0.0306, 0.004, 28), 'white', g, 0, -0.02, 0);
  return { kind: 'grenade', length: 0.14, grip: 'grenade', orn: { spans: [], gem: [0.0305, -0.045, 0] } };
}

// ================================================================== variants / ornaments
function ornament(g, kind, orn) {
  const og = group(g, 'ornament');
  const flame = G('flame', () => ext([[0, 0], [0.022, 0.003, 0.006], [0.034, 0.017, 0.004], [0.02, 0.011], [0.012, 0.023, 0.003], [0.005, 0.01], [-0.007, 0.016, 0.002], [-0.004, 0.002]], 0.0022, { bevel: 0.0006 }));
  const scale = G('scale', () => ext([[0, 0], [0.006, 0.004, 0.0015], [0.012, 0], [0.006, -0.004, 0.0015]], 0.0016, { bevel: 0.0005 }));
  for (const [f0, f1, y, hw] of orn.spans || []) {
    const len = f1 - f0;
    for (const s of [1, -1]) {
      const x = s * (hw + 0.0022);
      if (kind === 'qilin') {
        const n = Math.max(2, Math.floor(len / 0.034));
        mesh(mergeGeometries(Array.from({ length: n }, (_, i) => flame.clone().translate(x, y - 0.006 + (i % 2) * 0.003, -(f0 + (i + 0.5) * len / n - 0.012)))), 'gold', og);
        mesh(box(0.0015, 0.0025, len), 'gold', og, x, y - 0.012, (f0 + f1) / 2);
      } else {
        const n = Math.max(2, Math.floor(len / 0.013));
        const L = [];
        for (let i = 0; i < n; i++) for (const r of [0, 1]) L.push([f0 + (i + 0.5 + r * 0.5) * len / (n + 0.5), y + 0.004 - r * 0.007]);
        mesh(mergeGeometries(L.map(([f, yy]) => scale.clone().translate(x, yy, -(f - 0.006)))), 'gold', og);
        mesh(box(0.0016, 0.0018, len), 'cyan', og, x, y - 0.011, (f0 + f1) / 2).castShadow = false;
        mesh(box(0.0016, 0.0012, len * 0.7), 'cyan', og, x, y + 0.011, (f0 + f1) / 2).castShadow = false;
      }
    }
  }
  if (orn.gem) {
    const [gx, gy, gf] = orn.gem;
    for (const s of [1, -1]) {
      mesh(G('bezel', () => new THREE.TorusGeometry(0.0065, 0.0016, 8, 20)), 'gold', og, s * (gx + 0.001), gy, gf, 0, PI / 2, 0);
      const gem = mesh(G('gem', () => new THREE.OctahedronGeometry(0.0055, 0).scale(0.6, 1, 1)), kind === 'qilin' ? 'glowR' : 'cyan', og, s * (gx + 0.0015), gy, gf);
      gem.castShadow = false;
    }
  }
}

// ================================================================== assembly
const BUILDERS = { ak47,m4a1,an94,sg552,mp5,uzi,p90,awm,m82a1,svd,m870,xm1014,m249,deagle,usp,glock18,knife,axe,machete,he,flash,smoke };
export const GUN_IDS = Object.keys(BUILDERS);
const TEMPLATES = new Map();
function template(id) {
  if (!TEMPLATES.has(id)) {
    const fn = BUILDERS[id];
    if (!fn) throw new Error('unknown gun id ' + id);
    const g = new THREE.Group(); g.name = 'gun_' + id;
    const meta = fn(g);
    g.userData = { id, kind: meta.kind, length: meta.length, orn: meta.orn || null, scoped: !!meta.scoped, grip: meta.grip || (meta.kind === 'pistol' ? 'pistol' : meta.kind === 'melee' ? 'knife' : meta.kind === 'grenade' ? 'grenade' : 'rifle') };
    TEMPLATES.set(id, g);
  }
  return TEMPLATES.get(id);
}
export function buildGun(id, { variant = 'default' } = {}) {
  const g = template(id).clone(true);
  const V = VARIANTS[variant];
  if (V) {
    g.traverse(o => { if (o.isMesh && V.map[o.userData.role]) o.material = matFor(V.map[o.userData.role]); });
    if (V.ornament && g.userData.orn) ornament(g, V.ornament, g.userData.orn);
  }
  const anchors = { muzzle: null, eject: null, rightHand: null, leftHand: null }, parts = {};
  g.traverse(o => {
    if (o.name.startsWith('a_')) anchors[o.name.slice(2)] = o;
    else if (o.name.startsWith('p_')) parts[o.name.slice(2)] = o;
  });
  // non-enumerable so gun.clone() (which JSON-copies userData) keeps working
  Object.defineProperty(g.userData, 'anchors', { value: anchors, enumerable: false, writable: true, configurable: true });
  Object.defineProperty(g.userData, 'parts', { value: parts, enumerable: false, writable: true, configurable: true });
  g.userData.variant = variant;
  return g;
}

// ejected casing, real size, axis along -Z (mouth forward)
const SHELLS = {
  rifle: { r: 0.0048, L: 0.045, neck: 0.62 },
  pistol: { r: 0.0049, L: 0.019, neck: 0.94 },
  sniper: { r: 0.0074, L: 0.069, neck: 0.58 },
};
export function buildShell(kind = 'rifle') {
  if (kind === 'shotgun') {
    const hull = new THREE.Mesh(G('shellHull', () => lathe([[0.0098, 0.012], [0.0102, 0.013], [0.0102, 0.068], [0.009, 0.07], [0.003, 0.07]], 16)), matFor('red'));
    const base = new THREE.Mesh(G('shellBase', () => lathe([[0, 0], [0.0112, 0], [0.0112, 0.0015], [0.0104, 0.0018], [0.0104, 0.0135], [0.0098, 0.0135]], 16)), matFor('brass'));
    hull.add(base); hull.castShadow = base.castShadow = true;
    return hull;
  }
  const s = SHELLS[kind] || SHELLS.rifle;
  const geo = G('shell' + kind, () => lathe([[0, 0], [s.r * 0.98, 0], [s.r * 0.98, 0.0012], [s.r * 0.82, 0.0017], [s.r * 0.82, 0.0029], [s.r, 0.0035],
    [s.r * 0.97, s.L * 0.72], [s.r * s.neck, s.L * 0.82], [s.r * s.neck, s.L], [s.r * s.neck * 0.85, s.L]], 12));
  const m = new THREE.Mesh(geo, matFor('brass'));
  m.castShadow = true;
  return m;
}
