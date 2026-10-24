// 黑色城镇 — ruined night town for 生化模式 (infection) and the PvE zombie challenge.
// Axes: +X east, -Z north.  Red spawn = west end of the main road, blue = east end.
//
//   z=-44 ┌ H3 ┬──── cemetery ────┬ church ┬── container yard (stack = camp spot) ─┐
//         │    │  mausoleum/graves│  nave  │   shop stairs ↓                       │
//   z=-19 │ H1 ┤ alley ├ H2 │     │ tower  │ gas station: canopy + shop (roof camp) │
//   z=-7  ├──── W road ─────── PLAZA (fountain) ────────── E road (bus) ──────────┤
//   z=7   │ H4 ┤ alley ├ H5 │     │        │ H6 ┤ alley ├ H7                       │
//   z=21  │ fenced lot: watchtower (camp)  │S road H8│ yard: water tower, shed     │
//   z=44  └────────────────────────────────┴────┴────────────────────────────────┘
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, solid, T, worldUVBox } from '../world/mapkit.js';

// ---------------------------------------------------------------- materials (local, cached)
let _mat = null;
function mats() {
  if (_mat) return _mat;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  _mat = {
    dirt: std({ map: T.sand(41), color: 0x6a6356, roughness: 1, normalMap: T.microNormal(30, 3), normalScale: new THREE.Vector2(0.8, 0.8) }),
    mud: std({ map: T.sand(42), color: 0x4a4438, roughness: 1 }),
    asphalt: M.asphalt(), sidewalk: M.concrete('#77736b'), cobble: M.concrete('#66625b'),
    brick: M.brick('#6a3a2c'), brickDark: M.brick('#4e3028'), brickWall: M.brick('#5a3a30'),
    plasterG: M.plaster('#8b877c'), plasterY: M.plaster('#9a8a6a'), plasterW: M.plaster('#a6a294'),
    sidingA: std({ map: T.planks(71, '#5d564c', 8), roughness: 0.9 }), sidingB: std({ map: T.planks(72, '#4b585c', 8), roughness: 0.9 }),
    sidingR: std({ map: T.planks(73, '#6a3e34', 8), roughness: 0.9 }),
    shingle: std({ map: T.planks(77, '#3a3330', 12), roughness: 0.95 }), shingleB: std({ map: T.planks(78, '#2e3335', 12), roughness: 0.95 }),
    wood: std({ map: T.planks(74, '#6a5038', 4), roughness: 0.88 }), board: std({ map: T.planks(75, '#86704f', 3), roughness: 0.9 }),
    woodDark: std({ map: T.planks(76, '#3f2f22', 3), roughness: 0.92 }),
    stone: M.concrete('#6e6a62'), stoneDark: M.concrete('#55524c'), grave: M.concrete('#7c7a74'), graveDark: M.concrete('#5d5b56'),
    trim: solid('#a9a497', { roughness: 0.8 }),
    dark: solid('#0c0b0a', { roughness: 1 }), glass: solid('#111518', { roughness: 0.15, metalness: 0.4 }),
    iron: M.paintedSteel('#26282a', 0.7), rust: M.rust(),
    corr: M.container('#5b4a3a', 7), corr2: M.container('#4a5560', 8),
    sandbag: solid('#7a6d52', { roughness: 1 }), sandbag2: solid('#6a6048', { roughness: 1 }),
    jersey: M.concrete('#9a978f'), hazard: M.hazard(),
    lampGlass: M.lampOn(),
    winLit: solid('#ffcf80', { emissive: 0xffa040, emissiveIntensity: 0.75 }),
    winGreen: solid('#7fd890', { emissive: 0x30c050, emissiveIntensity: 0.45 }),
    stainedR: solid('#5a1418', { emissive: 0x801812, emissiveIntensity: 0.55 }),
    stainedB: solid('#18244a', { emissive: 0x1a2a80, emissiveIntensity: 0.5 }),
    neon: solid('#ff4060', { emissive: 0xff2040, emissiveIntensity: 1.4 }),
    canopy: M.paintedSteel('#cfcfc6', 0.35), canopyRed: M.paintedSteel('#a8241c', 0.35),
    canopyPanel: solid('#e8f0ff', { emissive: 0xc8d8ff, emissiveIntensity: 1.1 }),
    pump: M.paintedSteel('#b8b2a2', 0.5), pumpRed: M.paintedSteel('#9a2620', 0.5),
    rubber: M.rubber(), chrome: M.steelBright(),
    headLight: solid('#c8c4b0', { roughness: 0.2, metalness: 0.5 }), tailLight: solid('#5a1008', { roughness: 0.3 }),
    carA: M.paintedSteel('#5a6470', 0.8), carB: M.paintedSteel('#6a2a22', 0.85), carC: M.paintedSteel('#7a7462', 0.85),
    bus: M.paintedSteel('#a8842a', 0.85), truck: M.paintedSteel('#45503a', 0.8), burnt: M.paintedSteel('#2a2420', 1),
    policeW: M.paintedSteel('#c8c8c4', 0.35), policeB: M.paintedSteel('#1a1f2a', 0.4),
    beaconR: M.lampRed(), beaconB: solid('#2040ff', { emissive: 0x1030ff, emissiveIntensity: 2 }),
    bark: solid('#3b3026', { roughness: 1 }), barkDark: solid('#2a221b', { roughness: 1 }),
    hay: solid('#7d6e40', { roughness: 1 }),
    water: solid('#0b1114', { roughness: 0.05, metalness: 0.7 }),
    tank: M.paintedSteel('#6f7470', 0.85),
    blood: solid('#2e0505', { roughness: 0.35 }),
    redPaint: M.paintedSteel('#7a1e18', 0.6), cloth: solid('#4a4438', { roughness: 1 }), tent: solid('#4c5238', { roughness: 1 }),
    bell: M.brass(), coal: solid('#ff5a10', { emissive: 0xff3a00, emissiveIntensity: 2.2 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xff8a30, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  };
  return _mat;
}

// ---------------------------------------------------------------- tiny geometry helpers
const GC = new Map();
const UP = new THREE.Vector3(0, 1, 0);
function gBox(w, h, d, tile = 1) {
  const k = `b${w.toFixed(3)},${h.toFixed(3)},${d.toFixed(3)},${tile}`;
  let g = GC.get(k);
  if (!g) { g = worldUVBox(new THREE.BoxGeometry(w, h, d), w, h, d, tile); GC.set(k, g); }
  return g;
}
function gCyl(rt, rb, h, segs = 12, open = false, ts = 0, tl = Math.PI * 2) {
  const k = `c${rt.toFixed(3)},${rb.toFixed(3)},${h.toFixed(2)},${segs},${open},${ts.toFixed(2)},${tl.toFixed(2)}`;
  let g = GC.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, segs, 1, open, ts, tl); GC.set(k, g); }
  return g;
}
function gSph(r, ws = 12, hs = 8, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) {
  const k = `s${r.toFixed(3)},${ws},${hs},${ps},${pl.toFixed(2)},${ts},${tl.toFixed(2)}`;
  let g = GC.get(k);
  if (!g) { g = new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl); GC.set(k, g); }
  return g;
}
function B(g, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, tile = 1) {
  const m = new THREE.Mesh(gBox(w, h, d, tile), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m;
}
function C(g, mat, rt, rb, h, x, y, z, rx = 0, ry = 0, rz = 0, segs = 12) {
  const m = new THREE.Mesh(gCyl(rt, rb, h, segs), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m;
}
function Sph(g, mat, r, x, y, z, sx = 1, sy = 1, sz = 1, ws = 12, hs = 8) {
  const m = new THREE.Mesh(gSph(r, ws, hs), mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); g.add(m); return m;
}
const _d = new THREE.Vector3();
function seg(g, mat, r, a, b, segs = 6, r2 = r) {
  _d.subVectors(b, a); const len = _d.length();
  const m = new THREE.Mesh(gCyl(r2, r, len, segs, true), mat);
  m.position.copy(a).addScaledVector(_d, 0.5);
  m.quaternion.setFromUnitVectors(UP, _d.normalize());
  g.add(m); return m;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function put(mb, g, x, y, z, ry = 0) { g.position.set(x, y, z); g.rotation.y = ry; mb.mergeGroup(g); }
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function aabb(x, z, w, d, ry) {
  const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
  const hw = (w * c + d * s) / 2, hd = (w * s + d * c) / 2;
  return [x - hw, z - hd, x + hw, z + hd];
}
function face(b, side) {
  const [x0, z0, x1, z1] = b;
  if (side === 's') return { x: (x0 + x1) / 2, z: z1, ry: 0, len: x1 - x0 };
  if (side === 'n') return { x: (x0 + x1) / 2, z: z0, ry: Math.PI, len: x1 - x0 };
  if (side === 'e') return { x: x1, z: (z0 + z1) / 2, ry: Math.PI / 2, len: z1 - z0 };
  return { x: x0, z: (z0 + z1) / 2, ry: -Math.PI / 2, len: z1 - z0 };
}
function onFace(mb, b, side, fn) {
  const f = face(b, side), g = new THREE.Group();
  fn(g, f.len); put(mb, g, f.x, 0, f.z, f.ry);
}
// world position of a point given in a face's local frame
function faceToWorld(b, side, u, y, out = 0.05) {
  const f = face(b, side), c = Math.cos(f.ry), s = Math.sin(f.ry);
  return [f.x + u * c + out * s, y, f.z - u * s + out * c, f.ry];
}

// ---------------------------------------------------------------- facade details (local face frame, +z out of the wall)
function windowT(g, m, u, y, w, h, kind, R) {
  B(g, m.woodDark, w + 0.24, 0.12, 0.1, u, y + h + 0.06, 0.05);
  B(g, m.woodDark, w + 0.34, 0.08, 0.2, u, y - 0.04, 0.1);
  B(g, m.woodDark, 0.1, h, 0.1, u - w / 2 - 0.05, y + h / 2, 0.05);
  B(g, m.woodDark, 0.1, h, 0.1, u + w / 2 + 0.05, y + h / 2, 0.05);
  const pane = kind === 'lit' ? m.winLit : kind === 'green' ? m.winGreen : kind === 'boarded' ? m.dark : m.glass;
  B(g, pane, w, h, 0.03, u, y + h / 2, 0.015);
  if (kind !== 'boarded') { B(g, m.woodDark, 0.05, h, 0.05, u, y + h / 2, 0.04); B(g, m.woodDark, w, 0.05, 0.05, u, y + h * 0.55, 0.04); }
  if (kind === 'lit' || kind === 'green') B(g, m.cloth, w * 0.4, h * 0.95, 0.02, u - w * 0.28, y + h / 2, 0.035);
  if (kind === 'boarded' || kind === 'broken') {
    const n = kind === 'boarded' ? 3 + Math.floor(R() * 2) : 1;
    for (let i = 0; i < n; i++) {
      const yy = y + h * (0.15 + (0.7 * i) / Math.max(1, n - 1)) + (R() - 0.5) * 0.1;
      B(g, R() < 0.5 ? m.board : m.wood, w + 0.35, 0.17, 0.04, u + (R() - 0.5) * 0.1, kind === 'broken' ? y + h * 0.5 : yy, 0.1, 0, 0, (R() - 0.5) * 0.45);
    }
  }
  if (kind === 'shutter') {
    B(g, m.sidingB, w / 2, h, 0.04, u - w * 0.75 - 0.1, y + h / 2, 0.06);
    const sh = B(g, m.sidingB, w / 2, h, 0.04, u + w * 0.8 + 0.1, y + h / 2 - 0.25, 0.08); sh.rotation.z = -0.35;
  }
}
function doorT(g, m, u, kind, R) {
  const w = 1.1, h = 2.2;
  B(g, m.woodDark, w + 0.3, 0.14, 0.12, u, h + 0.07, 0.06);
  B(g, m.woodDark, 0.14, h, 0.12, u - w / 2 - 0.07, h / 2, 0.06);
  B(g, m.woodDark, 0.14, h, 0.12, u + w / 2 + 0.07, h / 2, 0.06);
  B(g, kind === 'open' ? m.dark : m.wood, w, h, 0.05, u, h / 2, 0.025);
  if (kind === 'boarded') { B(g, m.board, w + 0.4, 0.2, 0.05, u, h * 0.5, 0.08, 0, 0, 0.9); B(g, m.board, w + 0.4, 0.2, 0.05, u, h * 0.5, 0.09, 0, 0, -0.9); }
  else C(g, m.chrome, 0.03, 0.03, 0.06, u + w / 2 - 0.15, 1.0, 0.07, Math.PI / 2, 0, 0, 6);
  B(g, m.stone, w + 0.6, 0.15, 0.6, u, 0.075, 0.3);
  if (R() < 0.5) { // little porch roof (visual only)
    B(g, m.shingle, w + 1.2, 0.08, 1.2, u, h + 0.55, 0.55, 0.3, 0, 0);
    for (const s of [-1, 1]) C(g, m.wood, 0.05, 0.05, h + 0.4, u + s * (w / 2 + 0.45), (h + 0.4) / 2, 1.05, 0, 0, 0, 6);
  }
}

// solid (non-enterable) house with gable roof and boarded-up details
function house(mb, m, b, h, o = {}) {
  const [x0, z0, x1, z1] = b;
  const R = rng(o.seed || Math.floor(Math.abs(x0 * 31 + z0 * 17) + 77));
  const wall = o.wall || m.sidingA;
  mb.boxMM([x0, 0, z0], [x1, h, z1], wall, { mat: o.mat || 'wood', tile: 3 });
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  mb.box(cx, 0, cz, w + 0.12, 0.6, d + 0.12, m.stoneDark, { collide: false, tile: 2 });
  mb.box(cx, h - 0.25, cz, w + 0.3, 0.25, d + 0.3, m.woodDark, { collide: false });
  if (h > 5) mb.box(cx, 3.0, cz, w + 0.1, 0.16, d + 0.1, m.woodDark, { collide: false });
  const g0 = new THREE.Group();
  for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) B(g0, m.trim, 0.22, h, 0.22, px, h / 2, pz);
  mb.mergeGroup(g0);
  // roof
  const ridgeX = o.ridge ? o.ridge === 'x' : w >= d;
  const span = ridgeX ? d : w, len = ridgeX ? w : d;
  const a = o.pitch || 0.62, ov = 0.45;
  const half = span / 2 + ov, rise = (span / 2) * Math.tan(a), slab = half / Math.cos(a);
  const rm = o.roofMat || m.shingle;
  const rg = new THREE.Group();
  for (const s of [-1, 1]) {
    if (o.broken && s < 0) {
      // half the roof caved in: bare rafters and a scrap of shingles
      for (let t = -len / 2 + 0.4; t < len / 2; t += 0.75) {
        const rf = B(rg, m.woodDark, 0.12, 0.16, slab, 0, h + rise - (half * Math.tan(a)) / 2, (-half / 2), 0, 0, 0);
        rf.position.x = t; rf.rotation.x = -a;
      }
      const sc = B(rg, rm, len * 0.35, 0.12, slab * 0.6, len * 0.3, h + rise - (half * 0.3 * Math.tan(a)), -half * 0.3, -a, 0, 0, 2);
      void sc;
      continue;
    }
    B(rg, rm, len + 0.9, 0.14, slab, 0, h + rise - (half * Math.tan(a)) / 2 + 0.07, (s * half) / 2, s * a, 0, 0, 2);
  }
  B(rg, m.woodDark, len + 0.95, 0.16, 0.3, 0, h + rise + 0.1, 0);
  // gables
  const tri = new THREE.Shape(); tri.moveTo(-span / 2, 0); tri.lineTo(span / 2, 0); tri.lineTo(0, rise); tri.lineTo(-span / 2, 0);
  const tg = new THREE.ExtrudeGeometry(tri, { depth: 0.25, bevelEnabled: false });
  const uv = tg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3);
  for (const s of [-1, 1]) {
    const gm = new THREE.Mesh(tg, wall);
    gm.position.set(s > 0 ? len / 2 : -len / 2 + 0.25, h, 0); gm.rotation.y = -Math.PI / 2; rg.add(gm);
    // gable vent
    B(rg, m.dark, 0.05, 0.5, 0.6, s * (len / 2 + 0.01), h + rise * 0.45, 0);
  }
  if (o.chimney !== false) {
    B(rg, m.brickDark, 0.8, rise + 1.6, 0.8, len * 0.3, h + (rise + 1.6) / 2, span * 0.15, 0, 0, 0, 1);
    B(rg, m.stoneDark, 0.95, 0.15, 0.95, len * 0.3, h + rise + 1.6, span * 0.15);
  }
  put(mb, rg, cx, 0, cz, ridgeX ? 0 : Math.PI / 2);
  tg.dispose();
  // faces
  const doors = o.doors || {};
  for (const side of o.faces || []) {
    onFace(mb, b, side, (g, L) => {
      const dl = doors[side] || [];
      for (const du of dl) doorT(g, m, du, R() < 0.5 ? 'boarded' : R() < 0.5 ? 'open' : 'closed', R);
      const n = Math.max(1, Math.floor((L - 1.5) / 3));
      const rows = h > 5 ? [0.95, 3.75] : [0.95];
      for (const ry of rows) for (let i = 0; i < n; i++) {
        const u = -L / 2 + 0.75 + (i + 0.5) * ((L - 1.5) / n);
        if (ry < 2 && dl.some((du) => Math.abs(du - u) < 1.5)) continue;
        if (R() < 0.15) continue;
        const k = R();
        const kind = k < 0.42 ? 'boarded' : k < 0.66 ? 'broken' : k < 0.8 ? 'shutter' : (o.lit && k < 0.9) ? (R() < 0.75 ? 'lit' : 'green') : 'broken';
        windowT(g, m, u, ry, 1.0, 1.4, kind, R);
      }
      // drainpipe & stains
      if (R() < 0.6) C(g, m.rust, 0.05, 0.05, h - 0.2, L / 2 - 0.35, (h - 0.2) / 2, 0.08, 0, 0, 0, 6);
      for (let k = 0; k < 2; k++) if (R() < 0.5) B(g, m.mud, 0.6 + R(), 1.2 + R() * 1.5, 0.01, (R() - 0.5) * (L - 2), 0.6 + R(), 0.008);
    });
  }
}

// ---------------------------------------------------------------- props
function crate(mb, m, x, y, z, s = 1.2, ry = 0) {
  const g = new THREE.Group();
  B(g, M.crate(), s * 0.96, s * 0.96, s * 0.96, 0, s / 2, 0, 0, 0, 0, s);
  const bw = s * 0.1, f = m.woodDark;
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    B(g, f, bw, s, bw, a * (s / 2 - bw / 2), s / 2, b * (s / 2 - bw / 2));
    B(g, f, s, bw, bw, 0, a > 0 ? s - bw / 2 : bw / 2, b * (s / 2 - bw / 2));
    B(g, f, bw, bw, s, b * (s / 2 - bw / 2), a > 0 ? s - bw / 2 : bw / 2, 0);
  }
  for (const sg of [1, -1]) {
    B(g, f, s * 1.2, bw * 0.9, bw * 0.5, 0, s / 2, sg * (s / 2 + bw * 0.08), 0, 0, (Math.PI / 4) * sg);
    B(g, f, bw * 0.5, bw * 0.9, s * 1.2, sg * (s / 2 + bw * 0.08), s / 2, 0, (Math.PI / 4) * sg, 0, 0);
  }
  put(mb, g, x, y, z, ry);
  const hh = s * 0.5 * (Math.abs(Math.cos(ry)) + Math.abs(Math.sin(ry)));
  mb.collider([x - hh, y, z - hh], [x + hh, y + s, z + hh], 'wood');
}

function car(mb, m, x, y, z, ry, paint, { flip = false, police = false, wreck = true } = {}) {
  const g = new THREE.Group(), L = 4.5, W = 1.8;
  B(g, paint, W, 0.6, L, 0, 0.62, 0);
  B(g, paint, W - 0.04, 0.1, 1.3, 0, 0.96, 1.5, -0.05, 0, 0);
  B(g, paint, W - 0.04, 0.1, 0.95, 0, 0.96, -1.75);
  B(g, m.glass, W - 0.18, 0.5, 2.05, 0, 1.17, -0.25);
  B(g, police ? m.policeW : paint, W - 0.2, 0.07, 1.72, 0, 1.45, -0.3);
  for (const s of [-1, 1]) {
    B(g, paint, 0.07, 0.52, 0.09, s * (W / 2 - 0.12), 1.18, 0.72, -0.5, 0, 0);
    B(g, paint, 0.07, 0.5, 0.09, s * (W / 2 - 0.1), 1.17, -0.25);
    B(g, m.dark, 0.012, 0.5, 0.02, s * (W / 2 + 0.004), 0.64, 0.2);
    B(g, m.dark, 0.012, 0.5, 0.02, s * (W / 2 + 0.004), 0.64, -0.95);
    B(g, paint, 0.16, 0.1, 0.08, s * (W / 2 + 0.06), 1.02, 0.55);
    B(g, m.headLight, 0.34, 0.13, 0.04, s * 0.58, 0.75, L / 2 + 0.01);
    B(g, m.tailLight, 0.32, 0.15, 0.04, s * 0.6, 0.77, -L / 2 - 0.01);
    for (const zz of [1.38, -1.38]) {
      const drop = wreck && s > 0 && zz < 0 ? 0.14 : 0;
      C(g, m.rubber, 0.33, 0.33, 0.24, s * (W / 2 - 0.1), 0.33 - drop, zz, 0, 0, Math.PI / 2, 16);
      C(g, wreck ? m.rust : m.chrome, 0.17, 0.17, 0.25, s * (W / 2 - 0.1), 0.33 - drop, zz, 0, 0, Math.PI / 2, 10);
    }
  }
  if (police) {
    for (const s of [-1, 1]) B(g, m.policeB, 0.02, 0.4, 2.2, s * (W / 2 + 0.01), 0.68, 0.1);
    B(g, m.iron, 1.2, 0.08, 0.3, 0, 1.52, -0.1);
    B(g, m.beaconR, 0.5, 0.14, 0.24, -0.32, 1.62, -0.1); B(g, m.beaconB, 0.5, 0.14, 0.24, 0.32, 1.62, -0.1);
  }
  B(g, m.dark, 0.72, 0.15, 0.03, 0, 0.72, L / 2 + 0.01);
  for (const s of [-1, 1]) B(g, m.iron, W + 0.04, 0.17, 0.13, 0, 0.44, s * (L / 2 + 0.04));
  if (wreck) {
    for (let i = 0; i < 6; i++) B(g, m.rust, 0.3 + i * 0.07, 0.22, 0.02, (i % 2 ? 1 : -1) * (W / 2 + 0.005), 0.5 + (i % 3) * 0.12, -1.6 + i * 0.6, 0, Math.PI / 2, 0);
    B(g, m.rust, 1.0, 0.02, 0.8, 0.1, 1.02, 1.5);
    B(g, m.dark, 0.6, 0.35, 0.02, W / 2 - 0.05, 1.17, -0.6, 0, Math.PI / 2, 0);
  }
  if (flip) { g.rotation.z = Math.PI; }
  const inner = new THREE.Group(); inner.add(g); if (flip) g.position.y = 1.62;
  put(mb, inner, x, y, z, ry);
  const bb = aabb(x, z, W + 0.12, L + 0.2, ry);
  mb.collider([bb[0], y, bb[1]], [bb[2], y + (flip ? 1.65 : 1.5), bb[3]], 'metal');
}

function bus(mb, m, x, z, ry) {
  const g = new THREE.Group(), L = 11, W = 2.5, H = 3.0;
  B(g, m.bus, W, 1.25, L, 0, 0.35 + 0.62, 0, 0, 0, 0, 2);
  B(g, m.bus, W, 0.35, L, 0, H - 0.17, 0, 0, 0, 0, 2);
  B(g, m.bus, W - 0.1, 0.06, L - 0.2, 0, H + 0.03, 0);
  B(g, m.glass, W - 0.06, 1.1, L - 0.3, 0, 2.15, 0);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 8; i++) B(g, m.bus, 0.06, 1.1, 0.14, s * (W / 2 - 0.01), 2.15, -L / 2 + 0.9 + i * 1.35);
    B(g, m.dark, 0.02, 0.06, L - 0.4, s * (W / 2 + 0.005), 1.15, 0);
    for (const zz of [3.6, -3.4]) {
      C(g, m.rubber, 0.5, 0.5, 0.32, s * (W / 2 - 0.15), 0.5, zz, 0, 0, Math.PI / 2, 16);
      C(g, m.rust, 0.26, 0.26, 0.33, s * (W / 2 - 0.15), 0.5, zz, 0, 0, Math.PI / 2, 10);
    }
    for (let i = 0; i < 5; i++) B(g, m.rust, 0.5 + i * 0.1, 0.3 + (i % 2) * 0.2, 0.02, s * (W / 2 + 0.006), 0.6 + (i % 3) * 0.25, -4 + i * 2, 0, Math.PI / 2, 0);
  }
  B(g, m.glass, W - 0.2, 1.1, 0.04, 0, 2.1, L / 2 + 0.005);
  B(g, m.iron, W + 0.05, 0.25, 0.15, 0, 0.5, L / 2 + 0.05); B(g, m.iron, W + 0.05, 0.25, 0.15, 0, 0.5, -L / 2 - 0.05);
  for (const s of [-1, 1]) { B(g, m.headLight, 0.3, 0.2, 0.04, s * 0.85, 0.95, L / 2 + 0.01); B(g, m.tailLight, 0.25, 0.35, 0.04, s * 0.95, 1.1, -L / 2 - 0.01); }
  B(g, m.dark, 0.02, 2.0, 1.0, W / 2 + 0.01, 1.35, 4.2); // open door
  B(g, m.dark, 1.2, 0.35, 0.03, 0, 2.85, L / 2 + 0.01);
  const sg = new THREE.Group(); sg.add(g); g.rotation.z = 0.025;
  put(mb, sg, x, 0, z, ry);
  const bb = aabb(x, z, W + 0.1, L + 0.2, ry);
  mb.collider([bb[0], 0, bb[1]], [bb[2], H, bb[3]], 'metal');
}

function truck(mb, m, x, z, ry, paint) {
  const g = new THREE.Group(), L = 6.4, W = 2.3;
  B(g, paint, W, 0.3, L, 0, 0.75, 0);
  B(g, paint, W, 1.6, 1.9, 0, 1.7, L / 2 - 0.95, 0, 0, 0, 2);
  B(g, m.glass, W - 0.3, 0.6, 0.04, 0, 2.05, L / 2 + 0.005);
  B(g, m.dark, 0.9, 0.5, 0.03, 0, 1.25, L / 2 + 0.01);
  for (const s of [-1, 1]) {
    B(g, m.glass, 0.04, 0.55, 0.9, s * (W / 2 + 0.002), 2.05, L / 2 - 0.8);
    for (const zz of [L / 2 - 1.0, -L / 2 + 1.6, -L / 2 + 0.6]) {
      C(g, m.rubber, 0.48, 0.48, 0.34, s * (W / 2 - 0.2), 0.48, zz, 0, 0, Math.PI / 2, 14);
      C(g, m.rust, 0.24, 0.24, 0.35, s * (W / 2 - 0.2), 0.48, zz, 0, 0, Math.PI / 2, 8);
    }
    // canvas cover ribs
    for (let i = 0; i < 4; i++) B(g, m.iron, 0.06, 1.6, 0.06, s * (W / 2 - 0.03), 1.7, -L / 2 + 0.3 + i * 1.3);
  }
  B(g, m.tent, W, 0.08, 4.3, 0, 2.55, -1.0);
  for (const s of [-1, 1]) B(g, m.tent, 0.04, 1.2, 4.3, s * (W / 2 - 0.02), 1.9, -1.0);
  B(g, m.woodDark, W, 0.6, 0.05, 0, 1.2, -L / 2 + 0.02);
  put(mb, g, x, 0, z, ry);
  const bb = aabb(x, z, W + 0.1, L + 0.1, ry);
  mb.collider([bb[0], 0, bb[1]], [bb[2], 2.6, bb[3]], 'metal');
}

function sandbags(mb, m, x0, z0, x1, z1, y = 0, rows = 3) {
  const g = new THREE.Group();
  const alongX = x1 - x0 >= z1 - z0, len = alongX ? x1 - x0 : z1 - z0;
  const n = Math.max(1, Math.round(len / 0.62));
  for (let r = 0; r < rows; r++) for (let i = 0; i < n - (r % 2); i++) {
    const t = (i + 0.5 + (r % 2) * 0.5) / n;
    const px = alongX ? x0 + t * (x1 - x0) : (x0 + x1) / 2, pz = alongX ? (z0 + z1) / 2 : z0 + t * (z1 - z0);
    const bag = Sph(g, (i + r) % 3 ? m.sandbag : m.sandbag2, 0.5, px, y + 0.1 + r * 0.19, pz, alongX ? 0.33 : 0.22, 0.12, alongX ? 0.22 : 0.33, 10, 6);
    bag.rotation.y = (i * 0.37) % 0.2 - 0.1;
  }
  mb.mergeGroup(g);
  mb.collider([x0, y, z0], [x1, y + rows * 0.19 + 0.06, z1], 'sand');
}

let _jerseyGeo = null;
function jersey(mb, m, x, z, alongX, len = 3) {
  if (!_jerseyGeo) {
    const s = new THREE.Shape();
    s.moveTo(-0.3, 0); s.lineTo(0.3, 0); s.lineTo(0.3, 0.08); s.lineTo(0.13, 0.3); s.lineTo(0.09, 0.82); s.lineTo(-0.09, 0.82); s.lineTo(-0.13, 0.3); s.lineTo(-0.3, 0.08); s.lineTo(-0.3, 0);
    _jerseyGeo = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
    const uv = _jerseyGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i));
  }
  const g = new THREE.Group();
  const me = new THREE.Mesh(_jerseyGeo, m.jersey); me.scale.set(1, 1, len); me.position.z = -len / 2; g.add(me);
  B(g, m.hazard, 0.02, 0.18, len * 0.9, 0.2, 0.18, 0, 0, 0, 0.35);
  B(g, m.hazard, 0.02, 0.18, len * 0.9, -0.2, 0.18, 0, 0, 0, -0.35);
  put(mb, g, x, 0, z, alongX ? Math.PI / 2 : 0);
  if (alongX) mb.collider([x - len / 2, 0, z - 0.3], [x + len / 2, 0.82, z + 0.3], 'concrete');
  else mb.collider([x - 0.3, 0, z - len / 2], [x + 0.3, 0.82, z + len / 2], 'concrete');
}

function hedgehog(mb, m, x, y, z, ry = 0) {
  const g = new THREE.Group();
  const beam = (a, b) => { const p = new THREE.Mesh(gBox(0.13, 0.13, 1), m.rust); _d.subVectors(b, a); p.scale.z = _d.length(); p.position.copy(a).addScaledVector(_d, 0.5); p.lookAt(b.x + g.position.x, b.y, b.z); g.add(p); };
  // three crossed beams (legs on the ground)
  beam(V(-0.8, 0, -0.5), V(0.8, 1.35, 0.5));
  beam(V(0.8, 0, -0.5), V(-0.8, 1.35, 0.5));
  beam(V(0, 0, 0.9), V(0, 1.35, -0.9));
  put(mb, g, x, y, z, ry);
  mb.collider([x - 0.85, y, z - 0.85], [x + 0.85, y + 1.3, z + 0.85], 'metal');
}

function sawhorse(mb, m, x, y, z, ry) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    B(g, m.wood, 0.08, 1.1, 0.08, s * 1.0, 0.5, 0.25, 0.35, 0, 0);
    B(g, m.wood, 0.08, 1.1, 0.08, s * 1.0, 0.5, -0.25, -0.35, 0, 0);
  }
  B(g, m.board, 2.4, 0.22, 0.05, 0, 0.95, 0.03);
  B(g, m.board, 2.4, 0.18, 0.05, 0, 0.6, 0.03, 0, 0, 0.04);
  for (let i = 0; i < 4; i++) B(g, m.pumpRed, 0.25, 0.221, 0.055, -0.9 + i * 0.6, 0.95, 0.03, 0, 0, 0.5);
  put(mb, g, x, y, z, ry);
  const bb = aabb(x, z, 2.5, 0.7, ry);
  mb.collider([bb[0], y, bb[1]], [bb[2], y + 1.1, bb[3]], 'wood');
}

function deadTree(mb, m, x, z, h, R) {
  const g = new THREE.Group();
  const branch = (a, dir, len, r, depth) => {
    const b = a.clone().addScaledVector(dir, len);
    seg(g, depth ? m.bark : m.barkDark, r * 0.6, a, b, 6, r);
    if (depth >= 3) return;
    const kids = depth === 0 ? 4 : 2 + Math.floor(R() * 2);
    for (let i = 0; i < kids; i++) {
      const nd = dir.clone().add(V((R() - 0.5) * 1.6, 0.2 + R() * 0.5, (R() - 0.5) * 1.6)).normalize();
      branch(b, nd, len * (0.5 + R() * 0.25), r * 0.6, depth + 1);
    }
  };
  branch(V(0, 0, 0), V((R() - 0.5) * 0.2, 1, (R() - 0.5) * 0.2).normalize(), h * 0.45, 0.24, 0);
  put(mb, g, x, 0, z, 0);
  mb.collider([x - 0.3, 0, z - 0.3], [x + 0.3, 3, z + 0.3], 'wood');
}

function pole(mb, m, x, y, z, ry, h = 8) {
  const g = new THREE.Group();
  C(g, m.woodDark, 0.11, 0.15, h, 0, h / 2, 0, 0, 0, 0, 9);
  B(g, m.woodDark, 2.0, 0.12, 0.12, 0, h - 0.5, 0);
  for (const o of [-0.85, 0, 0.85]) C(g, m.glass, 0.045, 0.06, 0.18, o, h - 0.35, 0, 0, 0, 0, 8);
  C(g, m.tank, 0.18, 0.18, 0.55, 0.3, h - 1.8, 0.2, 0, 0, 0, 10);
  g.rotation.z = (x * 0.013) % 0.05;
  put(mb, g, x, y, z, ry);
  mb.collider([x - 0.16, 0, z - 0.16], [x + 0.16, h, z + 0.16], 'wood');
  const c = Math.cos(ry), s = Math.sin(ry);
  return [-0.85, 0, 0.85].map((o) => V(x + o * c, y + h - 0.26, z - o * s));
}
function wires(mb, m, A, Bp, sag = 0.8) {
  const g = new THREE.Group();
  for (let i = 0; i < A.length; i++) {
    const a = A[i], b = Bp[Math.min(i, Bp.length - 1)];
    let prev = a.clone();
    for (let k = 1; k <= 10; k++) {
      const t = k / 10, p = new THREE.Vector3().lerpVectors(a, b, t); p.y -= sag * 4 * t * (1 - t) * (i === 1 ? 1.3 : 1);
      seg(g, m.dark, 0.014, prev, p, 4); prev = p;
    }
  }
  mb.mergeGroup(g);
}

// street lamp: returns head position (for a light)
function streetLamp(mb, m, x, y, z, ry, { broken = false, glass = true } = {}) {
  const g = new THREE.Group();
  C(g, m.iron, 0.2, 0.24, 0.5, 0, 0.25, 0, 0, 0, 0, 10);
  C(g, m.iron, 0.07, 0.1, 5.2, 0, 2.85, 0, 0, 0, 0, 8);
  B(g, m.iron, 0.07, 0.07, 1.4, 0, 5.35, 0.65);
  seg(g, m.iron, 0.025, V(0, 4.7, 0), V(0, 5.32, 0.7), 5);
  B(g, m.iron, 0.42, 0.16, 0.62, 0, 5.28, 1.32);
  if (glass && !broken) B(g, m.lampGlass, 0.3, 0.05, 0.46, 0, 5.18, 1.32);
  const outer = new THREE.Group(); outer.add(g);
  if (broken) g.rotation.x = 0.22;
  put(mb, outer, x, y, z, ry);
  mb.collider([x - 0.2, y, z - 0.2], [x + 0.2, y + 5, z + 0.2], 'metal');
  return [x + Math.sin(ry) * 1.32, y + 5.05, z + Math.cos(ry) * 1.32];
}

// flickering helper for lights
function flicker(mb, light, base, kind, ph = 0) {
  mb.animated.push({
    update: (dt, t) => {
      if (kind === 'fire') light.intensity = base * (0.75 + 0.15 * Math.sin(t * 11 + ph) + 0.1 * Math.sin(t * 23.7 + ph * 3));
      else if (kind === 'beacon') { const s = 0.5 + 0.5 * Math.sin(t * 7 + ph); light.intensity = base * s * s; }
      else if (kind === 'blink') light.intensity = Math.sin(t * 2.2 + ph) > 0.2 ? base : base * 0.05;
      else { // failing street lamp / fluorescent tube
        const n = Math.sin(t * 13.7 + ph) * Math.sin(t * 3.1 + ph * 2.3);
        light.intensity = n > 0.82 ? base * 0.08 : n > 0.7 ? base * 0.5 : base;
      }
    },
  });
}

let _flameGeo = null;
function fireBarrel(mb, m, x, y, z, R, withLight = false) {
  mb.barrel(x, y, z, { color: '#3a2a1e' });
  const g = new THREE.Group();
  C(g, m.coal, 0.26, 0.26, 0.04, 0, 0.86, 0, 0, 0, 0, 12);
  for (let i = 0; i < 6; i++) { const a = i * 1.05; B(g, m.barkDark, 0.5, 0.07, 0.07, Math.cos(a) * 0.08, 0.9, Math.sin(a) * 0.08, 0, a, 0.4); }
  put(mb, g, x, y, z, 0);
  if (!_flameGeo) {
    const parts = [];
    for (let i = 0; i < 6; i++) {
      const c = new THREE.ConeGeometry(0.1 + (i % 3) * 0.04, 0.5 + (i % 3) * 0.25, 6, 1, true);
      const a = i * 1.1, r = i ? 0.13 : 0;
      c.translate(Math.cos(a) * r, 0.25 + (i % 3) * 0.12, Math.sin(a) * r);
      parts.push(c.toNonIndexed());
    }
    _flameGeo = mergeGeometries(parts);
  }
  const fl = new THREE.Mesh(_flameGeo, m.flame);
  fl.position.set(x, y + 0.86, z); fl.renderOrder = 2;
  mb.addObject(fl);
  const ph = R() * 10;
  mb.animated.push({ update: (dt, t) => { fl.scale.set(1 + 0.08 * Math.sin(t * 9 + ph), 0.8 + 0.3 * Math.sin(t * 13 + ph) * Math.sin(t * 5.3 + ph), 1 + 0.08 * Math.cos(t * 8 + ph)); fl.rotation.y = t * 0.7 + ph; } });
  if (withLight) { const L = mb.lamp(x, y + 1.6, z, { color: 0xff7a2a, intensity: 14, distance: 17, fixture: false }); flicker(mb, L, 14, 'fire', ph); }
}

function grave(mb, m, x, z, kind, R) {
  const g = new THREE.Group();
  const tilt = (R() - 0.5) * 0.25, mat = R() < 0.5 ? m.grave : m.graveDark;
  const st = new THREE.Group(); g.add(st); st.rotation.set(tilt * 0.6, 0, tilt);
  if (kind === 0) { // rounded headstone
    B(st, mat, 0.7, 0.7, 0.16, 0, 0.35, 0, 0, 0, 0, 1);
    const top = new THREE.Mesh(gCyl(0.35, 0.35, 0.16, 14, false, 0, Math.PI), mat); top.rotation.set(Math.PI / 2, 0, Math.PI / 2); top.position.set(0, 0.7, 0); st.add(top);
    B(st, m.stoneDark, 0.4, 0.06, 0.02, 0, 0.62, 0.085);
  } else if (kind === 1) { // stone cross
    B(st, mat, 0.16, 1.2, 0.14, 0, 0.6, 0); B(st, mat, 0.62, 0.15, 0.14, 0, 0.88, 0);
  } else if (kind === 2) { // wooden cross
    B(st, m.woodDark, 0.09, 1.1, 0.07, 0, 0.55, 0); B(st, m.woodDark, 0.5, 0.08, 0.07, 0, 0.82, 0);
  } else { // obelisk
    B(st, mat, 0.6, 0.25, 0.6, 0, 0.125, 0); C(st, mat, 0.12, 0.2, 1.3, 0, 0.9, 0, 0, Math.PI / 4, 0, 4);
  }
  B(g, mat, 0.9, 0.12, 0.35, 0, 0.06, 0);
  B(g, m.mud, 0.85, 0.16, 1.7, 0, 0.08, 1.05, 0, 0, 0, 2); // mound
  if (R() < 0.3) Sph(g, m.cloth, 0.08, 0.2, 0.2, 0.6, 1, 0.6, 1, 6, 4); // dead flowers
  put(mb, g, x, 0, z, (R() - 0.5) * 0.15);
  if (kind !== 2) mb.collider([x - 0.4, 0, z - 0.2], [x + 0.4, kind === 1 ? 1.2 : 0.9, z + 0.2], 'concrete');
}

function fenceRun(mb, m, x0, z0, x1, z1, H = 2.4, mat = null) {
  const g = new THREE.Group();
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ang = Math.atan2(-dz, dx);
  const n = Math.max(1, Math.round(len / 2.4));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, px = x0 + dx * t, pz = z0 + dz * t;
    const pm = (mat || (i % 3 === 1 ? m.corr2 : m.corr));
    const p = B(g, pm, len / n - 0.04, H - (i % 4 === 2 ? 0.3 : 0), 0.05, px, (H - (i % 4 === 2 ? 0.3 : 0)) / 2 + 0.05, pz, 0, ang, (i % 5 === 3 ? 0.03 : 0), 1);
    void p;
  }
  for (let i = 0; i <= n; i++) {
    const t = i / n, px = x0 + dx * t, pz = z0 + dz * t;
    B(g, m.iron, 0.09, H + 0.45, 0.09, px, (H + 0.45) / 2, pz);
    B(g, m.iron, 0.05, 0.45, 0.05, px, H + 0.55, pz, 0, ang, 0.5);
  }
  for (const hh of [H + 0.25, H + 0.45]) B(g, m.iron, len, 0.015, 0.015, x0 + dx / 2, hh, z0 + dz / 2, 0, ang, 0);
  mb.mergeGroup(g);
  mb.collider([Math.min(x0, x1) - 0.08, 0, Math.min(z0, z1) - 0.08], [Math.max(x0, x1) + 0.08, H + 0.4, Math.max(z0, z1) + 0.08], 'metal');
}

function picket(mb, m, x0, z0, x1, z1) {
  const g = new THREE.Group();
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ang = Math.atan2(-dz, dx);
  const n = Math.round(len / 0.18);
  for (let i = 0; i < n; i++) {
    if (i % 17 === 5 || i % 23 === 11) continue; // missing pickets
    const t = (i + 0.5) / n;
    const pk = B(g, m.board, 0.1, 1.05, 0.03, x0 + dx * t, 0.52, z0 + dz * t, 0, ang, ((i * 7) % 5 - 2) * 0.02);
    void pk;
  }
  for (const hh of [0.3, 0.8]) B(g, m.wood, len, 0.08, 0.05, x0 + dx / 2, hh, z0 + dz / 2 - 0.03, 0, ang, 0);
  mb.mergeGroup(g);
  mb.collider([Math.min(x0, x1) - 0.06, 0, Math.min(z0, z1) - 0.06], [Math.max(x0, x1) + 0.06, 1.05, Math.max(z0, z1) + 0.06], 'wood');
}

function blood(mb, m, x, y, z, r, R) {
  const g = new THREE.Group();
  C(g, m.blood, r, r, 0.01, 0, 0.005, 0, 0, 0, 0, 14);
  for (let i = 0; i < 5; i++) { const a = R() * 6.28, d = r * (0.8 + R() * 0.8); C(g, m.blood, r * 0.2, r * 0.2, 0.01, Math.cos(a) * d, 0.005, Math.sin(a) * d, 0, 0, 0, 8); }
  put(mb, g, x, y + 0.01, z, 0);
}

function tires(mb, m, x, z, n) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.12, 8, 16), m.rubber); t.rotation.x = Math.PI / 2; t.position.set((i % 2) * 0.05, 0.12 + i * 0.24, 0); g.add(t); }
  put(mb, g, x, 0, z, 0);
  mb.collider([x - 0.44, 0, z - 0.44], [x + 0.44, n * 0.24, z + 0.44], 'wood');
}

// ================================================================== map
export default {
  id: 'town',
  name: '黑色城镇',
  desc: '被遗弃的夜色小镇：教堂、墓地、加油站与铁皮围场。生化模式与挑战模式专用，多处高点可据守。',
  modes: ['zombie', 'challenge', 'tdm', 'ffa'],
  env: { preset: 'night', fogDensity: 0.028, fogColor: 0x0e1217, hemiIntensity: 0.85, sunIntensity: 0.7 },
  size: 60,
  build(mb) {
    const m = mats();
    const R = rng(6661);

    // ---------------- ground, roads, sidewalks, plaza
    mb.ground(0, 130, m.dirt, { mat: 'concrete', tile: 6 });
    const flat = (x0, z0, x1, z1, mat, y = 0, h = 0.02, tile = 4) => mb.box((x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, h, z1 - z0, mat, { collide: false, tile });
    flat(-65, -5, -12, 5, m.asphalt); flat(12, -5, 65, 5, m.asphalt); flat(-5, 12, 5, 65, m.asphalt);
    const lines = new THREE.Group();
    for (let x = -60; x < 60; x += 4) if (Math.abs(x) > 13) B(lines, m.plasterY, 2, 0.005, 0.14, x, 0.022, 0);
    for (let z = 14; z < 60; z += 4) B(lines, m.plasterY, 0.14, 0.005, 2, 0, 0.022, z);
    for (let i = 0; i < 18; i++) { const px = (R() - 0.5) * 100, pz = (R() - 0.5) * 8; if (Math.abs(px) > 13) C(lines, m.mud, 0.4 + R() * 0.8, 0.4 + R() * 0.8, 0.01, px, 0.025, pz, 0, 0, 0, 9); }
    mb.mergeGroup(lines);
    const walk = (x0, z0, x1, z1) => { mb.boxMM([x0, 0, z0], [x1, 0.15, z1], m.sidewalk, { mat: 'concrete', tile: 2 }); };
    walk(-44, -7, -12, -5); walk(-44, 5, -12, 7); walk(12, -7, 44, -5); walk(12, 5, 44, 7); walk(-7, 12, -5, 44); walk(5, 12, 7, 44);
    mb.boxMM([-12, 0, -16], [12, 0.15, 12], m.cobble, { mat: 'concrete', tile: 1.5 });
    const curb = new THREE.Group();
    B(curb, m.stoneDark, 24.3, 0.17, 0.3, 0, 0.085, 12); B(curb, m.stoneDark, 24.3, 0.17, 0.3, 0, 0.085, -16);
    B(curb, m.stoneDark, 0.3, 0.17, 28.3, -12, 0.085, -2); B(curb, m.stoneDark, 0.3, 0.17, 28.3, 12, 0.085, -2);
    mb.mergeGroup(curb);
    flat(12, -25, 30, -7, m.sidewalk, 0, 0.025, 3); // gas forecourt slab

    // ---------------- boundary (brick walls, invisible lid) + road-end barricades
    const bwall = (x0, z0, x1, z1) => {
      mb.boxMM([x0, 0, z0], [x1, 3.6, z1], m.brickWall, { mat: 'concrete', tile: 2 });
      mb.box((x0 + x1) / 2, 3.6, (z0 + z1) / 2, x1 - x0 + 0.1, 0.15, z1 - z0 + 0.1, m.stoneDark, { collide: false });
    };
    bwall(-46, -46, 46, -44);
    bwall(-46, -44, -44, -7); bwall(-46, 7, -44, 44);
    bwall(44, -44, 46, -7); bwall(44, 7, 46, 44);
    bwall(-46, 44, -7, 46); bwall(7, 44, 46, 46);
    const piers = new THREE.Group();
    for (let t = -44; t <= 44; t += 6) { B(piers, m.brickDark, 0.6, 4.0, 0.6, t, 2.0, -45, 0, 0, 0, 1); if (Math.abs(t) > 8) B(piers, m.brickDark, 0.6, 4.0, 0.6, t, 2.0, 45, 0, 0, 0, 1); }
    for (let t = -38; t <= 38; t += 6) if (Math.abs(t) > 8) { B(piers, m.brickDark, 0.6, 4.0, 0.6, -45, 2.0, t, 0, 0, 0, 1); B(piers, m.brickDark, 0.6, 4.0, 0.6, 45, 2.0, t, 0, 0, 0, 1); }
    mb.mergeGroup(piers);
    mb.collider([-70, 0, -70], [-44, 16, 70], 'concrete'); mb.collider([44, 0, -70], [70, 16, 70], 'concrete');
    mb.collider([-70, 0, -70], [70, 16, -44], 'concrete'); mb.collider([-70, 0, 44], [70, 16, 70], 'concrete');
    // west road end
    jersey(mb, m, -43.6, -5.4, false, 3); jersey(mb, m, -43.6, -2.2, false, 3); jersey(mb, m, 43.6, 2.2, false, 3);
    jersey(mb, m, -43.6, 1.6, false, 3); jersey(mb, m, -43.6, 5.0, false, 3);
    sandbags(mb, m, -43.3, -1.0, -42.7, 0.4, 0, 3);
    // east road end
    jersey(mb, m, 43.6, -5.4, false, 3); jersey(mb, m, 43.6, -1.6, false, 3); jersey(mb, m, 43.6, 5.4, false, 3);
    hedgehog(mb, m, 42.0, 0, 6.0, 0.3);
    // south road end
    jersey(mb, m, -3.2, 43.6, true, 3); jersey(mb, m, 0.4, 43.4, true, 3); jersey(mb, m, 3.6, 43.7, true, 3);
    hedgehog(mb, m, -5.8, 0.15, 42.4, 0.5);
    // beyond the barricades (visual only, outside the invisible walls)
    const out = new THREE.Group();
    for (const [x, z, w, d, h] of [[-54, -26, 8, 12, 7], [-56, 24, 10, 10, 6], [54, -28, 8, 14, 8], [55, 26, 9, 12, 6], [-24, 55, 12, 8, 7], [26, 56, 14, 8, 6], [0, -56, 18, 8, 9], [-30, -55, 10, 8, 6], [32, -55, 12, 8, 7]]) {
      B(out, m.sidingA, w, h, d, x, h / 2, z, 0, 0, 0, 3);
      B(out, m.shingle, w + 0.6, 0.2, d * 0.62, x, h + d * 0.2, z - d * 0.22, -0.6, 0, 0, 2);
      B(out, m.shingle, w + 0.6, 0.2, d * 0.62, x, h + d * 0.2, z + d * 0.22, 0.6, 0, 0, 2);
    }
    mb.mergeGroup(out);
    car(mb, m, -52, 0, -1.5, 1.9, m.carC, { wreck: true });
    car(mb, m, 0.5, 0, 53, 0.3, m.carA, { flip: true });
    for (const [x, z] of [[-50, -40], [-52, 38], [50, -40], [52, 40], [-38, 52], [38, 52], [-20, -52], [20, -52]]) deadTree(mb, m, x, z, 8 + R() * 3, R);

    // ---------------- church (north)
    {
      const nave = [-7, -44, 7, -23];
      mb.boxMM([-7, 0, -44], [7, 8, -23], m.stone, { mat: 'concrete', tile: 3 });
      const g = new THREE.Group();
      B(g, m.stoneDark, 14.2, 0.7, 21.2, 0, 0.35, -33.5, 0, 0, 0, 2);
      B(g, m.stoneDark, 14.4, 0.3, 21.4, 0, 7.9, -33.5, 0, 0, 0, 2);
      const a = 0.78, half = 7.5, rise = 7 * Math.tan(a), slab = half / Math.cos(a);
      for (const s of [-1, 1]) B(g, m.shingleB, slab, 0.18, 21.8, (s * half) / 2, 8 + rise - (half * Math.tan(a)) / 2, -33.5, 0, 0, -s * a, 2);
      B(g, m.woodDark, 0.35, 0.2, 22, 0, 8 + rise + 0.12, -33.5);
      const tri = new THREE.Shape(); tri.moveTo(-7, 0); tri.lineTo(7, 0); tri.lineTo(0, rise); tri.lineTo(-7, 0);
      const tg = new THREE.ExtrudeGeometry(tri, { depth: 0.3, bevelEnabled: false });
      const uv = tg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3);
      const g1 = new THREE.Mesh(tg, m.stone); g1.position.set(0, 8, -23.3); g.add(g1);
      const g2 = new THREE.Mesh(tg, m.stone); g2.position.set(0, 8, -44); g.add(g2);
      // buttresses + lancet windows along the sides
      for (let z = -41.5; z <= -25; z += 4.1) for (const s of [-1, 1]) {
        B(g, m.stoneDark, 0.8, 5.5, 1.0, s * 7.4, 2.75, z, 0, 0, 0, 2);
        B(g, m.stoneDark, 0.6, 1.6, 0.8, s * 7.3, 6.0, z, 0, 0, s * 0.35, 2);
      }
      for (let z = -39.5; z <= -27; z += 4.1) for (const s of [-1, 1]) {
        const mat = (Math.round(z) % 2) ? m.stainedR : m.stainedB;
        B(g, mat, 0.04, 2.6, 1.0, s * 7.02, 4.0, z);
        const tip = new THREE.Mesh(gCyl(0.5, 0.5, 0.04, 3, false), mat); tip.rotation.set(0, 0, Math.PI / 2); tip.scale.set(1, 1, 1); tip.position.set(s * 7.02, 5.55, z); g.add(tip);
        B(g, m.stoneDark, 0.1, 0.12, 1.3, s * 7.06, 2.66, z); B(g, m.iron, 0.05, 2.6, 0.04, s * 7.05, 4.0, z); B(g, m.iron, 0.05, 0.04, 1.0, s * 7.05, 4.4, z);
      }
      // tower
      mb.collider([-3.5, 0, -23], [3.5, 17, -16], 'concrete');
      mb.box(0, 0, -19.5, 7, 12.2, 7, m.stone, { collide: false, tile: 3 });
      mb.box(0, 15.5, -19.5, 7, 1.5, 7, m.stone, { collide: false, tile: 3 });
      mb.box(0, 12.2, -19.5, 6.9, 0.2, 6.9, m.stoneDark, { collide: false });
      { // open belfry: corner piers + mullions, bell hanging in the middle
        const bg = new THREE.Group();
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(bg, m.stone, 1.2, 3.3, 1.2, sx * 2.9, 13.85, -19.5 + sz * 2.9, 0, 0, 0, 2);
        for (const [x, z, w, d] of [[0, -16.25, 0.5, 0.5], [0, -22.75, 0.5, 0.5], [3.25, -19.5, 0.5, 0.5], [-3.25, -19.5, 0.5, 0.5]]) B(bg, m.stone, w, 3.3, d, x, 13.85, z, 0, 0, 0, 2);
        for (const [x, z, w, d] of [[0, -16.1, 7, 0.25], [0, -22.9, 7, 0.25], [3.4, -19.5, 0.25, 7], [-3.4, -19.5, 0.25, 7]]) { B(bg, m.stoneDark, w, 0.35, d, x, 15.32, z); B(bg, m.stoneDark, w, 0.9, d, x, 12.75, z); }
        B(bg, m.woodDark, 6, 0.25, 0.3, 0, 15.1, -19.5);
        C(bg, m.iron, 0.03, 0.03, 0.5, 0, 14.75, -19.5, 0, 0, 0, 5);
        mb.mergeGroup(bg);
      }
      B(g, m.stoneDark, 7.4, 0.8, 7.4, 0, 0.4, -19.5, 0, 0, 0, 2);
      for (const y of [6, 11.9]) B(g, m.stoneDark, 7.5, 0.3, 7.5, 0, y, -19.5);
      // belfry openings on each face (dark arches) with the bell visible through the south one
      for (const [fx, fz, ry] of [[0, -15.97, 0], [0, -23.03, Math.PI], [3.53, -19.5, Math.PI / 2], [-3.53, -19.5, -Math.PI / 2]]) {
        const fg = new THREE.Group(); fg.position.set(fx, 0, fz); fg.rotation.y = ry; g.add(fg);
        // clock
        C(fg, m.plasterW, 0.9, 0.9, 0.08, 0, 9.3, 0.04, Math.PI / 2, 0, 0, 24);
        C(fg, m.iron, 1.0, 1.0, 0.05, 0, 9.3, 0.02, Math.PI / 2, 0, 0, 24);
        B(fg, m.iron, 0.06, 0.7, 0.03, 0.1, 9.55, 0.1, 0, 0, -0.4); B(fg, m.iron, 0.05, 0.5, 0.03, -0.2, 9.15, 0.1, 0, 0, 1.2);
      }
      B(g, m.stoneDark, 7.8, 0.4, 7.8, 0, 17.2, -19.5);
      for (const [px, pz] of [[-3.5, -16], [3.5, -16], [-3.5, -23], [3.5, -23]]) { B(g, m.stoneDark, 0.6, 1.4, 0.6, px, 18.0, pz); C(g, m.stoneDark, 0.05, 0.25, 1.2, px, 19.3, pz, 0, Math.PI / 4, 0, 4); }
      C(g, m.shingleB, 0.05, 4.4, 9, 0, 21.9, -19.5, 0, Math.PI / 4, 0, 4);
      B(g, m.iron, 0.12, 1.6, 0.12, 0, 27.1, -19.5); B(g, m.iron, 0.9, 0.12, 0.12, 0, 27.4, -19.5);
      // bell (inside belfry, visible through openings)
      const bell = new THREE.Mesh(new THREE.LatheGeometry([V(0, 0, 0), V(0.62, 0, 0), V(0.58, 0.12, 0), V(0.45, 0.4, 0), V(0.38, 0.85, 0), V(0.25, 1.0, 0), V(0, 1.02, 0)].map((p) => new THREE.Vector2(p.x, p.y)), 16), m.bell);
      bell.position.set(0, 13.4, -19.5); bell.scale.setScalar(1.1); g.add(bell);
      // door, rose window, steps, notice board
      const fd = new THREE.Group(); fd.position.set(0, 0, -15.95); g.add(fd);
      B(fd, m.woodDark, 2.4, 3.2, 0.08, 0, 1.6, 0.04);
      const dt = new THREE.Mesh(gCyl(1.2, 1.2, 0.08, 3, false), m.woodDark); dt.rotation.set(Math.PI / 2, 0, 0); dt.scale.set(1, 1, 0.6); dt.position.set(0, 3.45, 0.04); fd.add(dt);
      B(fd, m.dark, 0.03, 3.2, 0.1, 0, 1.6, 0.05);
      for (const yy of [0.6, 1.6, 2.6]) B(fd, m.iron, 2.2, 0.08, 0.1, 0, yy, 0.09);
      B(fd, m.board, 3.0, 0.25, 0.06, 0, 1.5, 0.16, 0, 0, 0.5); B(fd, m.board, 3.0, 0.25, 0.06, 0, 1.6, 0.18, 0, 0, -0.45);
      B(fd, m.stoneDark, 3.2, 0.3, 0.3, 0, 4.2, 0.1); B(fd, m.stoneDark, 0.4, 4.2, 0.3, -1.45, 2.1, 0.1); B(fd, m.stoneDark, 0.4, 4.2, 0.3, 1.45, 2.1, 0.1);
      C(fd, m.stainedR, 1.1, 1.1, 0.06, 0, 7.4, 0.03, Math.PI / 2, 0, 0, 20);
      C(fd, m.stoneDark, 1.25, 1.25, 0.04, 0, 7.4, 0.01, Math.PI / 2, 0, 0, 20);
      for (let i = 0; i < 6; i++) B(fd, m.stoneDark, 0.07, 2.2, 0.08, 0, 7.4, 0.07, 0, 0, (i * Math.PI) / 6);
      mb.mergeGroup(g);
      tg.dispose();
      mb.boxMM([-3, 0.15, -16], [3, 0.3, -15.1], m.stone, { mat: 'concrete', tile: 2 });
      void nave;
      mb.sign('救救我们', 5.5, 2.2, -22.95, 2.6, 0.8, { fg: 'rgba(150,10,10,0.9)', font: 'bold 120px serif' });
    }

    // ---------------- cemetery (north-west)
    {
      const lw = (x0, z0, x1, z1) => {
        mb.boxMM([x0, 0, z0], [x1, 0.9, z1], m.stoneDark, { mat: 'concrete', tile: 2 });
        mb.box((x0 + x1) / 2, 0.9, (z0 + z1) / 2, x1 - x0 + 0.1, 0.08, z1 - z0 + 0.1, m.grave, { collide: false });
      };
      lw(-13.4, -44, -13, -33); lw(-13.4, -29, -13, -19); lw(-15, -19.4, -13, -19);
      // iron gate posts
      const gg = new THREE.Group();
      for (const z of [-33, -29]) { B(gg, m.stoneDark, 0.5, 1.6, 0.5, -13.2, 0.8, z); Sph(gg, m.grave, 0.18, -13.2, 1.75, z); }
      for (const x of [-31, -27]) { B(gg, m.stoneDark, 0.5, 1.6, 0.5, x, 0.8, -19.2); Sph(gg, m.grave, 0.18, x, 1.75, -19.2); }
      const ig = B(gg, m.iron, 0.05, 1.4, 1.9, -13.6, 0.8, -32.0, 0, 0.9, 0); void ig;
      for (let i = 0; i < 9; i++) B(gg, m.iron, 0.03, 1.5, 0.03, -12.95 - Math.sin(0.9) * (i * 0.2), 0.8, -32.9 + Math.cos(0.9) * i * 0.2);
      mb.mergeGroup(gg);
      // mausoleum
      mb.boxMM([-37, 0, -43.5], [-31, 3.6, -38], m.grave, { mat: 'concrete', tile: 2 });
      const mg = new THREE.Group();
      B(mg, m.graveDark, 6.4, 0.4, 5.9, -34, 0.2, -40.75);
      B(mg, m.graveDark, 6.6, 0.35, 6.1, -34, 3.75, -40.75);
      const ped = new THREE.Shape(); ped.moveTo(-3.3, 0); ped.lineTo(3.3, 0); ped.lineTo(0, 1.3); ped.lineTo(-3.3, 0);
      const pg = new THREE.ExtrudeGeometry(ped, { depth: 0.3, bevelEnabled: false });
      const pm = new THREE.Mesh(pg, m.grave); pm.position.set(-34, 3.9, -38.1); mg.add(pm);
      for (const x of [-36.3, -35.1, -32.9, -31.7]) C(mg, m.grave, 0.17, 0.2, 3.4, x, 1.9, -37.7, 0, 0, 0, 10);
      B(mg, m.iron, 1.4, 2.4, 0.06, -34, 1.4, -37.97);
      for (let i = 0; i < 7; i++) B(mg, m.rust, 0.04, 2.3, 0.04, -34.6 + i * 0.2, 1.4, -37.92);
      put(mb, mg, 0, 0, 0, 0);
      // graves in rows, leaving the gate paths clear
      const cols = [-36.5, -34, -25, -22.5, -20, -17.5, -15.2];
      const rows = [-40.5, -37, -25.5, -22];
      for (const z of rows) for (const x of cols) {
        if (z < -36 && x < -31) continue;
        if (R() < 0.12) continue;
        grave(mb, m, x + (R() - 0.5) * 0.3, z, Math.floor(R() * 4), R);
      }
      for (const [x, z] of [[-36.5, -33.5], [-34, -34], [-22.5, -34], [-17.5, -33.6]]) grave(mb, m, x, z - 1.6, Math.floor(R() * 4), R);
      // open grave with shovel
      const og = new THREE.Group();
      B(og, m.dark, 0.9, 0.02, 1.9, -20, 0.012, -28.4);
      B(og, m.mud, 1.6, 0.35, 0.9, -21.3, 0.17, -28.4, 0, 0, 0.1, 2);
      seg(og, m.wood, 0.025, V(-20.7, 0.0, -27.2), V(-20.2, 1.2, -27.0));
      B(og, m.iron, 0.22, 0.28, 0.02, -20.75, 0.1, -27.22, 0, 0, 0.4);
      mb.mergeGroup(og);
      deadTree(mb, m, -34, -27, 9, R); deadTree(mb, m, -16.5, -41.5, 7.5, R);
      blood(mb, m, -28.6, 0, -24, 0.6, R);
    }

    // ---------------- houses
    house(mb, m, [-44, -19, -31, -7], 6.5, { wall: m.sidingA, faces: ['s', 'e'], doors: { s: [1.5] }, lit: true });
    house(mb, m, [-27, -19, -15, -7], 6, { wall: m.brick, mat: 'concrete', faces: ['s', 'w', 'e'], doors: { s: [-2] } });
    house(mb, m, [-44, -44, -38, -31], 5.5, { wall: m.sidingB, faces: ['e'], ridge: 'z' });
    house(mb, m, [-44, -31, -38, -19], 6, { wall: m.plasterG, mat: 'concrete', faces: ['e'], ridge: 'z', lit: true });
    house(mb, m, [-44, 7, -31, 17], 6, { wall: m.sidingR, faces: ['n', 'e'], doors: { n: [-2] } });
    house(mb, m, [-27, 7, -15, 16], 7, { wall: m.plasterY, mat: 'concrete', faces: ['n', 'w', 'e', 's'], doors: { n: [1] }, broken: true, lit: true });
    house(mb, m, [15, 7, 27, 16], 6, { wall: m.sidingB, faces: ['n', 'w', 'e', 's'], doors: { n: [2] } });
    house(mb, m, [31, 7, 44, 17], 7, { wall: m.brickDark, mat: 'concrete', faces: ['n', 'w', 's'], doors: { n: [-3] }, lit: true });
    house(mb, m, [7, 24, 13, 36], 4.6, { wall: m.plasterW, mat: 'concrete', faces: ['w', 'n', 's'], ridge: 'z', pitch: 0.45, doors: { w: [0] }, chimney: false });
    mb.sign('旅  馆', 6.92, 3.9, 30, 3.4, 0.7, { rotY: -Math.PI / 2, fg: '#ff4060', bg: 'rgba(20,10,10,0.85)', font: 'bold 140px sans-serif', emissive: true });
    mb.sign('快 跑', -20.5, 2.7, -6.93, 2.2, 0.9, { fg: 'rgba(140,8,8,0.92)', font: 'bold 150px serif' });
    mb.sign('HELP', 15.0 - 0.04, 2.0, 11.5, 2.2, 0.8, { rotY: -Math.PI / 2, fg: 'rgba(140,8,8,0.9)', font: 'bold 170px serif' });
    // porches/awnings on the main road (visual only)
    onFace(mb, [-44, -19, -31, -7], 's', (g) => { B(g, m.shingle, 6, 0.1, 1.8, 1.5, 2.9, 0.9, 0.22, 0, 0, 2); for (const u of [-1.3, 4.3]) C(g, m.wood, 0.06, 0.06, 2.9, u, 1.45, 1.7, 0, 0, 0, 6); });
    onFace(mb, [15, 7, 27, 16], 'n', (g) => { B(g, m.canopyRed, 5, 0.06, 1.4, 2, 2.8, 0.65, 0.35, 0, 0, 2); });

    // ---------------- plaza: fountain, police car, lamps, barricades
    {
      const g = new THREE.Group();
      const basin = new THREE.Mesh(gCyl(3.2, 3.3, 0.7, 8), m.stone); basin.position.set(0, 0.5, 0); basin.rotation.y = Math.PI / 8; g.add(basin);
      const rim = new THREE.Mesh(gCyl(3.35, 3.35, 0.12, 8), m.grave); rim.position.set(0, 0.88, 0); rim.rotation.y = Math.PI / 8; g.add(rim);
      const wtr = new THREE.Mesh(gCyl(2.9, 2.9, 0.02, 8), m.water); wtr.position.set(0, 0.7, 0); wtr.rotation.y = Math.PI / 8; g.add(wtr);
      C(g, m.stone, 0.7, 0.85, 1.6, 0, 1.5, 0, 0, 0, 0, 12);
      C(g, m.stone, 1.4, 0.5, 0.35, 0, 2.45, 0, 0, 0, 0, 14);
      C(g, m.stone, 0.35, 0.45, 0.9, 0, 3.05, 0, 0, 0, 0, 10);
      // broken angel statue
      B(g, m.grave, 0.55, 1.0, 0.35, 0, 4.0, 0, 0, 0, 0.06);
      Sph(g, m.grave, 0.3, 0, 3.45, 0, 1.2, 0.5, 1);
      for (const s of [-1, 1]) { B(g, m.grave, 0.08, 0.9, 0.6, s * 0.35, 4.4, -0.25, 0.5, 0, s * 0.6); }
      B(g, m.grave, 0.14, 0.6, 0.14, 0.32, 4.2, 0.15, 0, 0, -0.5);
      Sph(g, m.grave, 0.12, 0.9, 0.85, 2.2, 1, 0.8, 1); B(g, m.grave, 0.18, 0.16, 0.4, 1.2, 0.86, 1.8, 0, 0.6, 0);
      put(mb, g, 0, 0.15, 0, 0);
      mb.collider([-2.96, 0.15, -2.96], [2.96, 0.94, 2.96], 'concrete');
      mb.collider([-0.85, 0.94, -0.85], [0.85, 4.6, 0.85], 'concrete');
    }
    car(mb, m, 7, 0.15, -8, 0.5, m.policeB, { police: true, wreck: false });
    { const L = mb.lamp(6.85, 1.95, -8.2, { color: 0xff2a20, intensity: 9, distance: 15, fixture: false, red: true }); flicker(mb, L, 9, 'beacon'); }
    const lp1 = streetLamp(mb, m, -11.3, 0.15, -15.3, Math.PI * 0.75);
    { const L = mb.lamp(lp1[0], lp1[1], lp1[2], { color: 0xffd8a0, intensity: 14, distance: 22, fixture: false }); flicker(mb, L, 14, 'lamp', 1); }
    const lp2 = streetLamp(mb, m, 11.3, 0.15, 11.3, -Math.PI * 0.25);
    { const L = mb.lamp(lp2[0], lp2[1], lp2[2], { color: 0xffd8a0, intensity: 14, distance: 22, fixture: false }); flicker(mb, L, 14, 'lamp', 4); }
    streetLamp(mb, m, -11.3, 0.15, 11.3, Math.PI * 0.25, { broken: true });
    streetLamp(mb, m, 11.3, 0.15, -15.3, -Math.PI * 0.75, { glass: false });
    streetLamp(mb, m, -36, 0.15, -6.3, Math.PI, { glass: false }); streetLamp(mb, m, 36, 0.15, 6.3, 0, { broken: true });
    streetLamp(mb, m, -6.3, 0.15, 24, Math.PI / 2, { glass: false }); streetLamp(mb, m, 6.3, 0.15, 40, -Math.PI / 2);
    fireBarrel(mb, m, -7, 0.15, 7, R, true);
    sandbags(mb, m, -9.5, 8.6, -5.5, 9.2, 0.15, 3); sandbags(mb, m, -10.2, 4.6, -9.6, 8.4, 0.15, 3);
    sawhorse(mb, m, 8, 0.15, 10.4, 0.1); sawhorse(mb, m, -10.6, 0.15, -2, Math.PI / 2);
    // benches
    for (const [x, z, ry] of [[-6, -11, 0], [6, 4.5, Math.PI / 2 * 0], [-5.5, -4.5, 0.2]]) {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) B(g, m.wood, 1.8, 0.05, 0.12, 0, 0.45, -0.15 + i * 0.15);
      for (let i = 0; i < 2; i++) B(g, m.wood, 1.8, 0.12, 0.04, 0, 0.7 + i * 0.16, -0.27, 0.15, 0, 0);
      for (const s of [-1, 1]) B(g, m.iron, 0.06, 0.45, 0.45, s * 0.8, 0.22, 0, 0, 0, 0);
      put(mb, g, x, 0.15, z, ry);
      const bb = aabb(x, z, 1.9, 0.6, ry); mb.collider([bb[0], 0.15, bb[1]], [bb[2], 0.65, bb[3]], 'wood');
    }
    // phone booth
    {
      const g = new THREE.Group();
      B(g, m.redPaint, 1.0, 2.3, 1.0, 0, 1.15, 0); B(g, m.glass, 1.02, 1.4, 0.8, 0, 1.3, 0); B(g, m.redPaint, 1.1, 0.15, 1.1, 0, 2.35, 0);
      B(g, m.dark, 0.7, 0.14, 1.04, 0, 2.15, 0);
      put(mb, g, -11, 0.15, 6.5, 0.15);
      mb.collider([-11.55, 0.15, 5.95], [-10.45, 2.6, 7.05], 'metal');
    }
    blood(mb, m, 3.5, 0.15, -6, 0.8, R); blood(mb, m, -2, 0.15, 9, 0.5, R); blood(mb, m, -24, 0, 3, 0.7, R);

    // ---------------- main road: wrecks, hedgehogs, sandbags, wires
    car(mb, m, -24, 0, -2.5, 0.35, m.carC, { wreck: true });
    hedgehog(mb, m, -16, 0, 3.5, 0.4); hedgehog(mb, m, 29, 0, -3, 0.9);
    sandbags(mb, m, -29.4, 1.2, -28.8, 4.6, 0, 3);
    bus(mb, m, 21, 1.9, Math.PI / 2 + 0.06);
    car(mb, m, 2, 0, 26, 0.2, m.carB, { flip: true });
    car(mb, m, -2.2, 0, 37, -0.15, m.carA, { wreck: true });
    const wp = [pole(mb, m, -40, 0, -6.2, Math.PI / 2), pole(mb, m, -26, 0, -6.2, Math.PI / 2), pole(mb, m, -14, 0, -6.2, Math.PI / 2)];
    wires(mb, m, wp[0], wp[1]); wires(mb, m, wp[1], wp[2]);
    const ep = [pole(mb, m, 14, 0, 6.2, Math.PI / 2), pole(mb, m, 29, 0, 6.2, Math.PI / 2), pole(mb, m, 41, 0, 6.2, Math.PI / 2)];
    wires(mb, m, ep[0], ep[1]); wires(mb, m, ep[1], ep[2]);
    const sp = [pole(mb, m, -6.2, 0, 16, 0), pole(mb, m, -6.2, 0, 30, 0), pole(mb, m, -6.2, 0, 42, 0)];
    wires(mb, m, sp[0], sp[1]); wires(mb, m, sp[1], sp[2]);
    wires(mb, m, wp[2], sp[0], 1.6);

    // ---------------- gas station (east): canopy (nav:false), pumps, shop with camp-able roof
    {
      mb.boxMM([14, 4.6, -21], [28, 5.1, -11], m.canopy, { mat: 'metal', nav: false, tile: 3 });
      const g = new THREE.Group();
      for (const s of [-1, 1]) { B(g, m.canopyRed, 14.1, 0.42, 0.06, 21, 4.82, s > 0 ? -10.97 : -21.03); }
      for (const s of [-1, 1]) B(g, m.canopyRed, 0.06, 0.42, 10.1, s > 0 ? 28.03 : 13.97, 4.82, -16);
      for (const z of [-19, -16, -13]) for (const x of [17, 21, 25]) B(g, m.canopyPanel, 1.2, 0.03, 0.4, x, 4.58, z);
      B(g, m.dark, 3, 0.04, 0.5, 21, 4.57, -16); // one dead tube row
      for (const [x, z] of [[15, -20], [27, -20], [15, -12], [27, -12]]) { B(g, m.canopy, 0.5, 4.6, 0.5, x, 2.3, z); B(g, m.canopyRed, 0.52, 0.5, 0.52, x, 0.25, z); }
      for (const x of [18, 24]) {
        B(g, m.stone, 1.6, 0.2, 6.4, x, 0.1, -16, 0, 0, 0, 2);
        B(g, m.hazard, 1.62, 0.2, 0.3, x, 0.1, -19.1); B(g, m.hazard, 1.62, 0.2, 0.3, x, 0.1, -12.9);
        for (const z of [-17.6, -14.4]) {
          B(g, m.pump, 0.7, 1.7, 0.5, x, 1.05, z); B(g, m.pumpRed, 0.72, 0.3, 0.52, x, 1.75, z);
          B(g, m.glass, 0.5, 0.3, 0.52, x, 1.35, z); B(g, m.dark, 0.3, 0.5, 0.53, x, 0.6, z);
          seg(g, m.rubber, 0.025, V(x + 0.36, 1.2, z), V(x + 0.55, 0.25, z + 0.3), 5); seg(g, m.rubber, 0.025, V(x + 0.55, 0.25, z + 0.3), V(x + 0.38, 0.6, z + 0.5), 5);
        }
        B(g, m.iron, 0.12, 0.9, 0.12, x, 0.65, -19.6); B(g, m.iron, 0.12, 0.9, 0.12, x, 0.65, -12.4);
      }
      mb.mergeGroup(g);
      for (const [x, z] of [[15, -20], [27, -20], [15, -12], [27, -12]]) mb.collider([x - 0.26, 0, z - 0.26], [x + 0.26, 4.6, z + 0.26], 'metal');
      for (const x of [18, 24]) {
        mb.collider([x - 0.8, 0, -19.2], [x + 0.8, 0.2, -12.8], 'concrete');
        for (const z of [-17.6, -14.4]) mb.collider([x - 0.36, 0.2, z - 0.26], [x + 0.36, 1.9, z + 0.26], 'metal');
      }
      car(mb, m, 21.2, 0, -16, 0.02, m.carA, { wreck: true });
      const cl = mb.lamp(21, 4.35, -16, { color: 0xdfe8ff, intensity: 11, distance: 18, fixture: false });
      flicker(mb, cl, 11, 'lamp', 2.5);
      // price pylon
      const pg = new THREE.Group();
      B(pg, m.iron, 0.3, 6.5, 0.3, 0, 3.25, 0); B(pg, m.canopyRed, 2.4, 1.6, 0.4, 0, 6.6, 0); B(pg, m.canopy, 2.4, 1.6, 0.42, 0, 5.0, 0);
      for (let i = 0; i < 3; i++) B(pg, m.dark, 1.8, 0.3, 0.43, 0, 4.55 + i * 0.42, 0);
      put(mb, pg, 13, 0, -8.5, Math.PI / 2);
      mb.collider([12.8, 0, -8.7], [13.2, 6, -8.3], 'metal');
      mb.sign('加油站', 13.22, 6.6, -8.5, 2.2, 0.8, { rotY: Math.PI / 2, fg: '#f2f2f2', font: 'bold 150px sans-serif' });
      mb.sign('加油站', 12.78, 6.6, -8.5, 2.2, 0.8, { rotY: -Math.PI / 2, fg: '#f2f2f2', font: 'bold 150px sans-serif' });
      // shop: solid block, flat roof reached by an external stair from the container yard
      const shop = [30, -25, 44, -12], SH = 3.6;
      mb.boxMM([30, 0, -25], [44, SH, -12], m.plasterW, { mat: 'concrete', tile: 3 });
      const sg = new THREE.Group();
      B(sg, m.stoneDark, 14.1, 0.5, 13.1, 37, 0.25, -18.5, 0, 0, 0, 2);
      B(sg, m.canopyRed, 14.2, 0.6, 0.1, 37, SH - 0.3, -25.05); B(sg, m.canopyRed, 14.2, 0.6, 0.1, 37, SH - 0.3, -11.95);
      B(sg, m.canopyRed, 0.1, 0.6, 13.2, 29.95, SH - 0.3, -18.5);
      B(sg, m.mud, 13.9, 0.02, 12.9, 37, SH + 0.01, -18.5, 0, 0, 0, 3);
      mb.mergeGroup(sg);
      onFace(mb, shop, 'w', (g2, L) => {
        for (let u = -L / 2 + 1.2; u < L / 2 - 1; u += 2.2) {
          if (Math.abs(u - 1.2) < 1.2) continue;
          B(g2, m.glass, 1.9, 1.9, 0.03, u, 1.75, 0.02); B(g2, m.iron, 0.08, 2.1, 0.08, u + 1.0, 1.75, 0.04);
          if (R() < 0.5) B(g2, m.board, 2.1, 0.2, 0.04, u, 1.4 + R() * 0.6, 0.08, 0, 0, (R() - 0.5) * 0.5);
        }
        B(g2, m.iron, L, 0.1, 0.1, 0, 0.75, 0.05); B(g2, m.iron, L, 0.1, 0.1, 0, 2.75, 0.05);
        B(g2, m.dark, 1.6, 2.3, 0.04, 1.2, 1.15, 0.02); B(g2, m.iron, 1.7, 0.08, 0.1, 1.2, 2.35, 0.05);
      });
      mb.sign('便利店 24H', 29.9, 3.25, -18.5, 3.8, 0.55, { rotY: -Math.PI / 2, fg: '#f0f0e8', bg: 'rgba(160,30,25,0.95)', font: 'bold 110px sans-serif' });
      onFace(mb, shop, 's', (g2, L) => { for (let u = -L / 2 + 1.5; u < L / 2; u += 3.5) windowT(g2, m, u, 1.0, 1.1, 1.2, 'boarded', R); });
      onFace(mb, shop, 'n', (g2) => { B(g2, m.iron, 1.3, 2.1, 0.06, 3.5, 1.05, 0.03); });
      // roof parapet (cover) leaving the stair head open (x 33..35.5 on the north edge)
      const par = (x0, z0, x1, z1) => mb.boxMM([x0, SH, z0], [x1, SH + 0.9, z1], m.plasterW, { mat: 'concrete', tile: 2 });
      par(30, -25, 33, -24.75); par(35.5, -25, 44, -24.75); par(30, -12.25, 44, -12); par(30, -24.75, 30.25, -12.25); par(43.75, -24.75, 44, -12.25);
      const rg = new THREE.Group();
      for (const [x, z] of [[40, -21], [40, -16]]) { B(rg, m.pump, 1.4, 0.9, 1.0, x, SH + 0.45, z); C(rg, m.iron, 0.4, 0.4, 0.05, x, SH + 0.92, z, 0, 0, 0, 14); }
      C(rg, m.iron, 0.12, 0.12, 1.2, 33, SH + 0.6, -14, 0, 0, 0, 8);
      mb.mergeGroup(rg);
      mb.collider([39.3, SH, -21.5], [40.7, SH + 0.9, -20.5], 'metal'); mb.collider([39.3, SH, -16.5], [40.7, SH + 0.9, -15.5], 'metal');
      sandbags(mb, m, 31, -14.0, 35, -13.4, SH, 3);
      mb.stairs(33, -32, 35.5, -25, 0, SH, 'z', 1, m.iron, { mat: 'metal', tile: 1 });
      const stg = new THREE.Group();
      for (const x of [32.95, 35.55]) { seg(stg, m.iron, 0.03, V(x, 1.0, -32), V(x, SH + 1.0, -25)); for (let z = -31.5; z <= -25.2; z += 1.6) seg(stg, m.iron, 0.025, V(x, ((z + 32) / 7) * SH, z), V(x, ((z + 32) / 7) * SH + 1.0, z)); }
      mb.mergeGroup(stg);
      tires(mb, m, 29.2, -8.6, 4); tires(mb, m, 28.4, -9.2, 3);
      mb.barrel(42.6, 0, -10.5, { color: '#3a2a1e' }); mb.barrel(41.9, 0, -10.0, { color: '#4a4a40', tipped: true });
      blood(mb, m, 25, 0, -9, 0.6, R);
    }

    // ---------------- container yard (north-east): stacked pair = camping spot
    {
      mb.container(24, 0, -37, { len: 12.19, color: '#7a3424', seed: 5, logo: 'CFX LINE' });
      mb.container(24, 0, -34.56, { len: 12.19, color: '#2e4c6a', seed: 6 });
      mb.stairs(30.1, -37.5, 36.1, -35.5, 0, 2.59, 'x', -1, m.iron, { mat: 'metal', tile: 1 });
      const sg = new THREE.Group();
      for (const z of [-37.55, -35.45]) seg(sg, m.iron, 0.03, V(36.1, 1.0, z), V(30.1, 2.59 + 1.0, z));
      mb.mergeGroup(sg);
      mb.container(41, 0, -40.5, { len: 6.06, color: '#7a3424', seed: 5, rotY: Math.PI / 2 });
      mb.container(15.1, 0, -41.5, { len: 6.06, color: '#2e4c6a', seed: 6 });
      mb.container(30, 0, -42.6, { len: 12.19, color: '#5a5f66', seed: 9, doorEnd: -1 });
      sandbags(mb, m, 19, -38.1, 25, -37.6, 2.59, 3);
      sandbags(mb, m, 18.1, -37.6, 18.6, -34, 2.59, 3);
      crate(mb, m, 27.5, 2.59, -34.4, 1.1, 0.2);
      mb.barrel(28.9, 2.59, -37.4, { color: '#4a4a40' });
      crate(mb, m, 37.5, 0, -39, 1.2, 0.1); crate(mb, m, 37.5, 1.2, -39, 1.0, 0.1); crate(mb, m, 38.8, 0, -38.8, 1.2, 0);
      // cable spools & pallets
      const pg = new THREE.Group();
      for (const [x, z] of [[14.5, -34], [16, -31.5]]) { C(pg, m.wood, 0.8, 0.8, 0.1, x, 0.8, z - 0.45, Math.PI / 2, 0, 0, 16); C(pg, m.wood, 0.8, 0.8, 0.1, x, 0.8, z + 0.45, Math.PI / 2, 0, 0, 16); C(pg, m.dark, 0.5, 0.5, 0.8, x, 0.8, z, Math.PI / 2, 0, 0, 12); }
      for (let i = 0; i < 4; i++) { B(pg, m.board, 1.2, 0.12, 1.0, 36.5, 0.06 + i * 0.14, -29.5, 0, i * 0.05, 0); }
      mb.mergeGroup(pg);
      mb.collider([13.7, 0, -34.6], [15.3, 1.6, -33.4], 'wood'); mb.collider([15.2, 0, -32.1], [16.8, 1.6, -30.9], 'wood');
      mb.collider([35.9, 0, -30.1], [37.1, 0.6, -28.9], 'wood');
      const yl = streetLamp(mb, m, 37.8, 0, -32.8, Math.PI * 0.85);
      { const L = mb.lamp(yl[0], yl[1], yl[2], { color: 0xffe0b0, intensity: 12, distance: 20, fixture: false }); flicker(mb, L, 12, 'lamp', 7); }
      fireBarrel(mb, m, 38.5, 0, -27.5, R, false);
      blood(mb, m, 22, 0, -31, 0.7, R);
    }

    // ---------------- fenced lot (south-west) with the watchtower
    {
      fenceRun(mb, m, -44, 21, -31, 21); fenceRun(mb, m, -27, 21, -12, 21);
      fenceRun(mb, m, -12, 21, -12, 29); fenceRun(mb, m, -12, 33, -12, 44);
      const T0 = [-36.5, 31.5, -31.5, 36.5], TH = 4.2;
      mb.boxMM([T0[0], 0, T0[1]], [T0[2], TH, T0[3]], m.board, { mat: 'wood', tile: 2 });
      const g = new THREE.Group();
      const cx = -34, cz = 34;
      for (const [px, pz] of [[-36.4, 31.6], [-31.6, 31.6], [-36.4, 36.4], [-31.6, 36.4]]) B(g, m.woodDark, 0.3, 7.0, 0.3, px, 3.5, pz);
      for (const s of [-1, 1]) {
        seg(g, m.woodDark, 0.06, V(-36.55, 0.3, cz + s * 2.55), V(-31.45, TH - 0.3, cz + s * 2.55));
        seg(g, m.woodDark, 0.06, V(-31.45, 0.3, cz + s * 2.55), V(-36.55, TH - 0.3, cz + s * 2.55));
        seg(g, m.woodDark, 0.06, V(cx + s * 2.55, 0.3, 31.45), V(cx + s * 2.55, TH - 0.3, 36.55));
        seg(g, m.woodDark, 0.06, V(cx + s * 2.55, 0.3, 36.55), V(cx + s * 2.55, TH - 0.3, 31.45));
      }
      B(g, m.wood, 5.6, 0.15, 5.6, cx, TH - 0.07, cz, 0, 0, 0, 2);
      // roof (visual only) + searchlight
      B(g, m.corr, 6.2, 0.08, 3.4, cx, 7.2, cz - 1.45, -0.32, 0, 0, 2); B(g, m.corr, 6.2, 0.08, 3.4, cx, 7.2, cz + 1.45, 0.32, 0, 0, 2);
      C(g, m.iron, 0.25, 0.3, 0.5, -36, TH + 1.35, 31.9, 0.6, 0.6, 0, 12); C(g, m.lampGlass, 0.22, 0.22, 0.02, -36.12, TH + 1.5, 31.75, 0.6, 0.6, 0, 12);
      B(g, m.iron, 0.12, 1.1, 0.12, -36, TH + 0.55, 31.95);
      put(mb, g, 0, 0, 0, 0);
      const rl = (x0, z0, x1, z1) => mb.railing(x0, z0, x1, z1, TH, { height: 1.05, material: m.wood, posts: 1.2 });
      rl(-36.5, 31.6, -31.5, 31.6); rl(-36.4, 31.5, -36.4, 36.5); rl(-36.5, 36.4, -31.5, 36.4); rl(-31.6, 31.5, -31.6, 34.4);
      sandbags(mb, m, -36.2, 31.8, -32.2, 32.3, TH, 4);
      for (const [px, pz] of [[-36.35, 31.65], [-31.65, 31.65], [-36.35, 36.35], [-31.65, 36.35]]) mb.collider([px - 0.15, TH, pz - 0.15], [px + 0.15, 7.0, pz + 0.15], 'wood');
      mb.stairs(-31.5, 34.5, -23.5, 36.5, 0, TH, 'x', -1, m.wood, { mat: 'wood', tile: 1 });
      const stg = new THREE.Group();
      for (const z of [34.45, 36.55]) seg(stg, m.woodDark, 0.04, V(-23.5, 1.0, z), V(-31.5, TH + 1.0, z));
      for (const x of [-25.5, -27.5, -29.5]) for (const z of [34.45, 36.55]) seg(stg, m.woodDark, 0.035, V(x, ((-23.5 - x) / 8) * TH, z), V(x, ((-23.5 - x) / 8) * TH + 1.0, z));
      mb.mergeGroup(stg);
      { const L = mb.lamp(-34, 7.55, 34, { color: 0xff2020, intensity: 8, distance: 16, red: true }); flicker(mb, L, 8, 'blink'); }
      truck(mb, m, -18, 38.5, 0.2, m.burnt);
      tent: {
        const tg = new THREE.Group();
        for (const s of [-1, 1]) B(tg, m.tent, 4.2, 0.05, 1.9, 0, 1.0, s * 0.72, s * 0.9, 0, 0);
        B(tg, m.woodDark, 4.4, 0.08, 0.08, 0, 1.75, 0);
        const tri = new THREE.Shape(); tri.moveTo(-1.5, 0); tri.lineTo(1.5, 0); tri.lineTo(0, 1.75); tri.lineTo(-1.5, 0);
        const tgeo = new THREE.ExtrudeGeometry(tri, { depth: 0.04, bevelEnabled: false });
        const back = new THREE.Mesh(tgeo, m.tent); back.rotation.y = Math.PI / 2; back.position.set(-2.05, 0, 0); tg.add(back);
        put(mb, tg, -20, 0, 25, 0);
        mb.collider([-22.1, 0, 23.5], [-17.9, 1.75, 26.5], 'wood');
      }
      fireBarrel(mb, m, -24, 0, 31, R, true);
      sandbags(mb, m, -26.5, 29.6, -25.9, 32.4, 0, 2);
      crate(mb, m, -41.5, 0, 23.8, 1.3, 0.1); crate(mb, m, -41.5, 1.3, 23.8, 1.1, 0.1); crate(mb, m, -40.1, 0, 23.6, 1.2, 0);
      crate(mb, m, -14.5, 0, 41.5, 1.3, 0.3); crate(mb, m, -16, 0, 42.3, 1.1, 0);
      tires(mb, m, -21, 22.6, 5); tires(mb, m, -22, 22.8, 3);
      // generator
      const gn = new THREE.Group();
      B(gn, m.truck, 1.8, 1.1, 1.0, 0, 0.65, 0); B(gn, m.dark, 1.0, 0.6, 0.02, 0, 0.75, 0.51); C(gn, m.rust, 0.06, 0.06, 0.8, 0.6, 1.5, 0, 0, 0, 0, 6);
      for (const s of [-1, 1]) C(gn, m.rubber, 0.2, 0.2, 0.12, s * 0.7, 0.2, 0.55, Math.PI / 2, 0, 0, 10);
      put(mb, gn, -40.5, 0, 40.5, 0.4);
      mb.collider([-41.6, 0, 39.6], [-39.4, 1.25, 41.4], 'metal');
      deadTree(mb, m, -41, 30, 8, R);
      blood(mb, m, -30, 0, 27, 0.9, R);
    }

    // ---------------- south-east yard: water tower, shed, picket fence
    {
      picket(mb, m, 13, 21, 27, 21); picket(mb, m, 31, 21, 43.5, 21);
      const g = new THREE.Group();
      const legs = [[27.5, 28.5], [32.5, 28.5], [27.5, 33.5], [32.5, 33.5]];
      for (const [lx, lz] of legs) seg(g, m.tank, 0.16, V(lx + (lx < 30 ? -0.5 : 0.5), 0, lz + (lz < 31 ? -0.5 : 0.5)), V(lx, 11, lz), 8, 0.12);
      for (const y of [3.5, 7.2]) for (let i = 0; i < 4; i++) {
        const a = legs[i], b = legs[[1, 3, 0, 2][i]];
        seg(g, m.tank, 0.05, V(a[0], y, a[1]), V(b[0], y + 3.4, b[1]), 5);
        seg(g, m.tank, 0.05, V(b[0], y, b[1]), V(a[0], y + 3.4, a[1]), 5);
      }
      C(g, m.tank, 3.3, 3.3, 4.5, 30, 13.25, 31, 0, 0, 0, 24);
      C(g, m.tank, 0.3, 3.45, 1.6, 30, 16.3, 31, 0, 0, 0, 24);
      for (const y of [12.0, 14.5]) { const t = new THREE.Mesh(new THREE.TorusGeometry(3.32, 0.05, 6, 32), m.rust); t.rotation.x = Math.PI / 2; t.position.set(30, y, 31); g.add(t); }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.7, 0.06, 6, 32), m.iron); ring.rotation.x = Math.PI / 2; ring.position.set(30, 12.1, 31); g.add(ring);
      B(g, m.iron, 0.45, 11, 0.06, 32.6, 6.5, 28.3); for (let y = 1; y < 12; y += 0.45) B(g, m.iron, 0.45, 0.03, 0.06, 32.6, y, 28.25);
      C(g, m.iron, 0.12, 0.12, 13, 30, 6.5, 31, 0, 0, 0, 8);
      put(mb, g, 0, 0, 0, 0);
      for (const [lx, lz] of legs) mb.collider([lx - 0.3, 0, lz - 0.3], [lx + 0.3, 11, lz + 0.3], 'metal');
      mb.collider([30 - 0.2, 0, 31 - 0.2], [30 + 0.2, 11, 31 + 0.2], 'metal');
      mb.collider([26.6, 10.9, 27.6], [33.4, 17.1, 34.4], 'metal', { nav: false });
      mb.sign('黑 色 城 镇', 30, 13.4, 34.32, 4.4, 0.9, { fg: 'rgba(220,220,210,0.85)', font: 'bold 120px serif' });
      // shed
      mb.boxMM([37, 0, 36], [44, 3.2, 44], m.corr2, { mat: 'metal', tile: 2.5 });
      const sh = new THREE.Group(); B(sh, m.rust, 7.6, 0.12, 8.6, 40.5, 3.35, 40, 0.06, 0, 0, 2); B(sh, m.woodDark, 2.2, 2.4, 0.06, 39, 1.2, 35.98); put(mb, sh, 0, 0, 0, 0);
      // tractor-ish wreck and hay
      const tr = new THREE.Group();
      B(tr, m.carB, 1.2, 1.0, 2.6, 0, 1.0, 0); B(tr, m.carB, 0.9, 0.8, 1.0, 0, 1.9, -0.6); C(tr, m.rust, 0.06, 0.06, 1.0, 0.3, 2.3, 0.8, 0, 0, 0, 6);
      for (const s of [-1, 1]) { C(tr, m.rubber, 0.75, 0.75, 0.4, s * 0.85, 0.75, -0.8, 0, 0, Math.PI / 2, 16); C(tr, m.rubber, 0.42, 0.42, 0.25, s * 0.7, 0.42, 1.0, 0, 0, Math.PI / 2, 12); }
      put(mb, tr, 19.5, 0, 30, 0.3);
      mb.collider([18.1, 0, 28.4], [20.9, 2.3, 31.6], 'metal');
      for (const [x, z] of [[37, 24], [38.4, 24.3], [37.6, 25.6]]) { const hg = new THREE.Group(); C(hg, m.hay, 0.6, 0.6, 1.1, 0, 0.6, 0, Math.PI / 2, 0, 0, 14); put(mb, hg, x, 0, z, R()); mb.collider([x - 0.6, 0, z - 0.6], [x + 0.6, 1.2, z + 0.6], 'wood'); }
      crate(mb, m, 15, 0, 33, 1.2, 0.2); crate(mb, m, 15, 1.2, 33, 1.0, 0.6);
      deadTree(mb, m, 20, 37, 8.5, R); deadTree(mb, m, 41, 30.5, 7, R);
      fireBarrel(mb, m, 4.2, 0, 41.5, R, false);
      blood(mb, m, 34, 0, 27, 0.8, R);
    }

    // ---------------- misc dressing
    deadTree(mb, m, -10, -36, 8, R); deadTree(mb, m, 9.8, -27, 7, R);
    fireBarrel(mb, m, 28.4, 0.15, 6.2, R, false);
    crate(mb, m, -9, 0, -19.5, 1.1, 0.3); mb.barrel(9.2, 0, -19.4, { color: '#4a4a40' }); mb.barrel(9.8, 0, -18.8, { color: '#4a4a40', tipped: true });
    sawhorse(mb, m, -2, 0, 14.6, 0.05); sawhorse(mb, m, -29, 0, 19.4, 0); sawhorse(mb, m, 29, 0, 19.5, 0.1);
    hedgehog(mb, m, -9.5, 0, 37, 0.2);

    // ---------------- spawns
    const red = [], blue = [];
    for (const x of [41, 38, 35]) for (const z of [-3.5, 0, 3.5]) { red.push([-x, 0, z, -Math.PI / 2]); blue.push([x, 0, z, Math.PI / 2]); }
    red.push([-32, 0, -1.5, -Math.PI / 2]); blue.push([32, 0, -1.5, Math.PI / 2]);
    const ffa = [
      [-9, 0.15, -3, 0], [9, 0.15, 4, Math.PI], [0, 0.15, -12, Math.PI], [-29, 0, -12, Math.PI], [-30, 0, 29, 0], [0, 0, 33, 0],
      [22, 0, -29, Math.PI], [38, 0, 27, Math.PI / 2], [-18, 0, 1.5, -Math.PI / 2], [15.5, 0, -23, Math.PI], [-10, 0, -30, Math.PI], [10, 0, -22, 0],
    ];
    const zombie = [
      [-29, 0, -41.5], [-20, 0, -31], [10, 0, -40], [21, 0, -39.8], [40, 0, -34], [42.5, 0, -8.3], [42, 0, 26], [30, 0, 42], [16, 0, 42],
      [0, 0, 41], [-24, 0, 42.2], [-42, 0, 42], [-42.5, 0, 22.2], [-36, 0, 19], [36, 0, 19],
    ].map(([x, y, z]) => [x, y, z, Math.atan2(x, z)]);
    // humans (challenge / infection) start together around the fountain, facing outward
    const human = [[-4, 6], [0, 6.5], [4, 6], [-6, 0], [6, 0], [-3, -6.5], [0, -6], [3, -6], [-8, -8], [9, 8]]
      .map(([x, z]) => [x, 0.15, z, Math.atan2(-x, -z)]);
    return {
      spawns: { red, blue, ffa, zombie, human },
      bounds: [-44, -44, 44, 44],
      killY: -3,
      hotspots: [
        // camping spots (listed twice so defending bots favour them): watchtower, shop roof, container stack
        [-34, 4.2, 34], [38, 3.6, -18.5], [24, 2.59, -35.8], [-33.5, 4.2, 33.5], [36, 3.6, -16], [22, 2.59, -35.6],
        [0, 0.15, 6], [0, 0.15, -13], [21, 0, -8], [21, 0, -2.5], [-29, 0, -16], [-10, 0, 31], [30, 0, 26.5], [-22, 0, -31], [-36, 0, 0], [36, 0, 0],
      ],
    };
  },
};
