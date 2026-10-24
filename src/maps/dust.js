// 沙漠灰 — Dust2-style bomb defusal map (simplified but faithful in flow).
// Axes: +X east, -Z north. 潜伏者 (red) spawn in the south, 保卫者 (blue) in the north.
//
//   z=-52 ┌───────────────┬──────────────┬─────────────────────────┐
//         │  B site       │  CT spawn    │  A site (plateau y=1.6) │
//         │  back plat    │  CT car      │  boxes / goose          │
//   z=-26 ├──B tunnel─────┤  CT mid      ├─A ramp──────────┬─pit───┤
//         │  (roofed)     │  mid doors   │ short/catwalk   │ long A│
//         │  lower tunnel ─── mid ──────── (raised y=1.6)  │       │
//         │  upper tunnel │  lower mid ─ stairs to catwalk │       │
//   z=32  │  outside tun. │  T mid arch  │                 └long doors
//         │               │  T spawn     │  outside long           │
//   z=52  └───────────────┴──────────────┴─────────────────────────┘
//        x=-52                                                  x=52
import * as THREE from 'three';
import { M, solid, T, worldUVBox } from '../world/mapkit.js';

// ---------------------------------------------------------------- materials (local, cached)
let _mat = null;
function mats() {
  if (_mat) return _mat;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  _mat = {
    sand: M.sand(),
    wallA: M.plaster('#cdb48a'), wallB: M.plaster('#d9c49c'), wallC: M.plaster('#c3a57b'), wallD: M.plaster('#bb9c72'),
    trim: M.plaster('#a98c64'), trimDark: M.plaster('#8b7452'), tunnel: M.plaster('#9a8565'),
    pave: M.concrete('#b5a486'), conc: M.concrete('#9d9483'), stoneDark: M.concrete('#7e7463'),
    glass: solid('#1a1815', { roughness: 0.25, metalness: 0.3 }),
    dark: solid('#120e0a', { roughness: 1 }),
    wood: std({ map: T.planks(54, '#6e4c2c', 4), roughness: 0.85 }),
    woodDark: std({ map: T.planks(55, '#4b3322', 3), roughness: 0.9 }),
    blue: std({ map: T.planks(56, '#2f6c9e', 4), roughness: 0.8 }),
    green: std({ map: T.planks(57, '#4f6b48', 4), roughness: 0.85 }),
    crate: M.crate(),
    crateFrame: std({ map: T.planks(58, '#6e5230', 3), roughness: 0.85 }),
    iron: M.paintedSteel('#2c2b29', 0.6),
    brick: M.brick('#a06c45'),
    clothR: solid('#8f3626', { roughness: 0.95 }), clothB: solid('#2f5878', { roughness: 0.95 }), clothC: solid('#cdb68c', { roughness: 0.95 }),
    trunk: solid('#6f5a3d', { roughness: 1 }), trunkDark: solid('#54432d', { roughness: 1 }),
    leaf: solid('#56702f', { roughness: 0.85 }), leafDry: solid('#877d3d', { roughness: 0.9 }),
    pole: solid('#4b3a29', { roughness: 0.95 }), cable: solid('#141414', { roughness: 0.7 }),
    ceramic: solid('#d8d2c4', { roughness: 0.4 }),
    rubber: M.rubber(), chrome: M.steelBright(),
    carA: M.paintedSteel('#a29e86', 0.6), carB: M.paintedSteel('#7a2a22', 0.7), truck: M.paintedSteel('#4f6472', 0.75),
    rust: M.rust(),
    tailLight: solid('#8a1810', { roughness: 0.3 }), headLight: solid('#d8d4c0', { roughness: 0.2, metalness: 0.5 }),
    rock: M.concrete('#a8946f'),
    domeBlue: solid('#3c6e8e', { roughness: 0.55, metalness: 0.1 }),
    tank: M.paintedSteel('#8d8f8c', 0.5),
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
function seg(g, mat, r, a, b, segs = 6) {
  _d.subVectors(b, a); const len = _d.length();
  const m = new THREE.Mesh(gCyl(r, r, len, segs, true), mat);
  m.position.copy(a).addScaledVector(_d, 0.5);
  m.quaternion.setFromUnitVectors(UP, _d.normalize());
  g.add(m); return m;
}
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
// face frame of an x/z rectangle: local +x runs along the face, local +z points outward
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

// ---------------------------------------------------------------- architectural details (local face frame)
function windowAt(g, m, u, y, w, h, style, R) {
  const t = 0.12;
  B(g, m.glass, w, h, 0.04, u, y + h / 2, 0.02);
  B(g, m.trim, w + 2 * t, t, 0.12, u, y + h + t / 2, 0.06);
  B(g, m.trim, t, h, 0.12, u - w / 2 - t / 2, y + h / 2, 0.06);
  B(g, m.trim, t, h, 0.12, u + w / 2 + t / 2, y + h / 2, 0.06);
  B(g, m.trimDark, w + 0.4, 0.09, 0.24, u, y - 0.045, 0.12);
  if (style === 'arch') {
    const r = w / 2 + t;
    const disc = new THREE.Mesh(gCyl(w / 2, w / 2, 0.04, 16, false, Math.PI / 2, Math.PI), m.glass);
    disc.position.set(u, y + h + t, 0.02); disc.rotation.x = Math.PI / 2; g.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r - t / 2, t / 2, 4, 14, Math.PI), m.trim);
    ring.position.set(u, y + h + t, 0.06); g.add(ring);
  } else {
    B(g, m.woodDark, w + 0.6, 0.16, 0.14, u, y + h + 0.22, 0.07);
  }
  if (style === 'shutter') {
    const sm = R() < 0.5 ? m.blue : (R() < 0.5 ? m.green : m.wood);
    for (const s of [-1, 1]) {
      const sx = u + s * (w / 2 + t + w / 4 + 0.02);
      B(g, sm, w / 2, h, 0.05, sx, y + h / 2, 0.05);
      for (let k = 1; k < 5; k++) B(g, m.dark, w / 2 - 0.08, 0.02, 0.06, sx, y + (h * k) / 5, 0.06);
    }
  } else if (style === 'bars') {
    const n = Math.max(3, Math.round(w / 0.16));
    for (let i = 0; i < n; i++) C(g, m.iron, 0.014, 0.014, h, u - w / 2 + (i + 0.5) * (w / n), y + h / 2, 0.09, 0, 0, 0, 5);
    B(g, m.iron, w, 0.03, 0.03, u, y + h * 0.5, 0.09);
  }
}

function doorAt(g, m, u, w, h, mat, { arch = false, step = true, awn = null } = {}) {
  B(g, m.trim, w + 0.4, 0.2, 0.16, u, h + 0.1, 0.08);
  B(g, m.trim, 0.2, h, 0.16, u - w / 2 - 0.1, h / 2, 0.08);
  B(g, m.trim, 0.2, h, 0.16, u + w / 2 + 0.1, h / 2, 0.08);
  B(g, mat, w, h, 0.08, u, h / 2, 0.04);
  B(g, m.dark, 0.025, h, 0.09, u, h / 2, 0.045);
  for (const yy of [0.35, h * 0.5, h - 0.4]) B(g, m.iron, w * 0.92, 0.05, 0.1, u, yy, 0.06);
  for (const s of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 4, 10), m.iron);
    ring.position.set(u + s * 0.14, h * 0.48, 0.1); g.add(ring);
  }
  if (arch) {
    const disc = new THREE.Mesh(gCyl(w / 2, w / 2, 0.08, 16, false, Math.PI / 2, Math.PI), mat);
    disc.position.set(u, h, 0.04); disc.rotation.x = Math.PI / 2; g.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(w / 2 + 0.1, 0.1, 4, 16, Math.PI), m.trim);
    ring.position.set(u, h, 0.08); g.add(ring);
  }
  if (step) B(g, m.conc, w + 0.7, 0.12, 0.55, u, 0.06, 0.27);
  if (awn) awning(g, m, awn, u, h + (arch ? w / 2 + 0.5 : 0.55), w + 1.4, 1.3);
}

function awning(g, m, mat, u, y, w, depth, ang = 0.38) {
  const s = Math.sin(ang), c = Math.cos(ang);
  B(g, mat, w, 0.04, depth, u, y - (s * depth) / 2, (c * depth) / 2, ang, 0, 0);
  B(g, mat, w, 0.22, 0.03, u, y - s * depth - 0.1, c * depth + 0.01);
  B(g, m.woodDark, w + 0.1, 0.1, 0.1, u, y + 0.03, 0.05);
  for (const sx of [-1, 1]) seg(g, m.iron, 0.015, new THREE.Vector3(u + sx * (w / 2 - 0.1), y - 0.8, 0.02), new THREE.Vector3(u + sx * (w / 2 - 0.1), y - s * depth, c * depth));
}

function decorateFace(g, m, len, h, base, R, o) {
  const doors = o.doors || [];
  const rows = [];
  if (o.ground !== false && h - base > 3.6) rows.push({ y: base + 1.15, h: 1.15, w: 0.85, style: 'bars', ground: true });
  if (h - base > 5.2 && o.upper !== false) rows.push({ y: base + 3.5, h: 1.45, w: 1.05, style: null });
  if (h - base > 5.2) B(g, m.trim, len, 0.14, 0.08, 0, base + 3.05, 0.04);
  for (const row of rows) {
    const n = Math.floor((len - 2) / 3.6);
    for (let i = 0; i < n; i++) {
      if (R() < 0.32) continue;
      const u = -len / 2 + 1 + (i + 0.5) * ((len - 2) / n) + (R() - 0.5) * 0.5;
      if (row.ground && doors.some((d) => Math.abs(d - u) < 1.9)) continue;
      const st = row.style || ['shutter', 'arch', 'plain', 'bars', 'shutter'][Math.floor(R() * 5)];
      windowAt(g, m, u, row.y, row.w, row.h, st, R);
    }
  }
  // patches of exposed brick and stains
  for (let k = 0; k < len / 5; k++) {
    if (R() < 0.45) continue;
    const pw = 0.6 + R() * 1.3, ph = 0.3 + R() * 0.6;
    B(g, m.brick, pw, ph, 0.03, -len / 2 + 0.8 + R() * (len - 1.6), base + 0.7 + R() * Math.max(0.2, h - base - 1.8), 0.015, 0, 0, 0, 1);
  }
  if (o.vigas) for (let u = -len / 2 + 0.6; u < len / 2 - 0.4; u += 1.15) C(g, m.woodDark, 0.08, 0.095, 0.62, u, h - 0.9, 0.29, Math.PI / 2, 0, 0, 7);
  if (o.pipe && R() < 0.7) {
    const u = -len / 2 + 0.5 + R() * (len - 1);
    C(g, m.iron, 0.05, 0.05, h - 0.4, u, (h - 0.4) / 2, 0.08, 0, 0, 0, 6);
  }
}

// solid (non-enterable) sandstone building block with decorated faces
function building(mb, m, b, h, o = {}) {
  const [x0, z0, x1, z1] = b;
  const R = rng(o.seed || Math.floor(x0 * 13 + z0 * 7 + 999));
  const wall = o.wall || m.wallA;
  mb.boxMM([x0, 0, z0], [x1, h, z1], wall, { mat: 'concrete', tile: 3 });
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  mb.box(cx, 0, cz, w + 0.14, 0.5, d + 0.14, m.trimDark, { collide: false, tile: 2 });
  mb.box(cx, h - 0.3, cz, w + 0.28, 0.3, d + 0.28, m.trim, { collide: false });
  if (o.parapet !== false) {
    mb.box(cx, h, z0 + 0.15, w, 0.55, 0.3, m.trim, { collide: false });
    mb.box(cx, h, z1 - 0.15, w, 0.55, 0.3, m.trim, { collide: false });
    mb.box(x0 + 0.15, h, cz, 0.3, 0.55, d, m.trim, { collide: false });
    mb.box(x1 - 0.15, h, cz, 0.3, 0.55, d, m.trim, { collide: false });
  }
  for (const fs of o.faces || []) {
    const [side, base = 0] = Array.isArray(fs) ? fs : [fs, 0];
    const doors = (o.doors || {})[side] || [];
    onFace(mb, b, side, (g, len) => {
      decorateFace(g, m, len, h, base, R, { ...o, doors });
      for (const u of doors) {
        const k = R();
        doorAt(g, m, u, 1.5, 2.4, k < 0.45 ? m.blue : k < 0.75 ? m.wood : m.green,
          { arch: R() < 0.55, awn: R() < 0.4 ? [m.clothR, m.clothB, m.clothC][Math.floor(R() * 3)] : null });
      }
    });
  }
  // rooftop clutter (skyline)
  if (o.roof !== false) {
    const g = new THREE.Group();
    const nItems = 1 + Math.floor(R() * 2.5);
    for (let i = 0; i < nItems; i++) {
      const rx = (R() - 0.5) * (w - 3), rz = (R() - 0.5) * (d - 3), k = R();
      if (k < 0.3) { // water tank
        B(g, m.iron, 1.2, 0.6, 1.2, rx, 0.3, rz);
        C(g, m.tank, 0.55, 0.55, 1.3, rx, 1.25, rz, 0, 0, 0, 14);
      } else if (k < 0.55 && w > 7 && d > 7) { // stair hut
        B(g, wall, 2.6, 2.4, 2.6, rx, 1.2, rz, 0, 0, 0, 3);
        B(g, m.trim, 2.8, 0.2, 2.8, rx, 2.5, rz);
        B(g, m.woodDark, 0.9, 1.9, 0.06, rx, 0.95, rz + 1.31);
      } else if (k < 0.72 && w > 8 && d > 8) { // small dome on a drum
        const r = Math.min(2.6, Math.min(w, d) * 0.22);
        C(g, wall, r, r, 1.0, rx, 0.5, rz, 0, 0, 0, 20);
        const dm = new THREE.Mesh(gSph(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), R() < 0.4 ? m.domeBlue : m.wallB);
        dm.position.set(rx, 1.0, rz); g.add(dm);
        C(g, m.trim, 0.06, 0.1, 0.8, rx, 1.0 + r + 0.3, rz, 0, 0, 0, 6);
      } else { // antenna
        C(g, m.iron, 0.03, 0.04, 3.2, rx, 1.6, rz, 0, 0, 0, 5);
        for (const hh of [2.2, 2.7, 3.1]) B(g, m.iron, 1.0 - hh * 0.2, 0.03, 0.03, rx, hh, rz);
      }
    }
    put(mb, g, cx, h, cz, 0);
  }
}

// archway wall: along 'x' spans x[a0,a1] with thickness z[t0,t1]; along 'z' spans z[a0,a1] with thickness x[t0,t1]
function archWall(mb, m, axis, a0, a1, t0, t1, H, o0, o1, ys, rise, mat) {
  const L = a1 - a0, u0 = o0 - a0, u1 = o1 - a0, cx = (u0 + u1) / 2, rx = (u1 - u0) / 2;
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(u0, 0); s.lineTo(u0, ys);
  s.absellipse(cx, ys, rx, rise, Math.PI, 0, true, 0);
  s.lineTo(u1, 0); s.lineTo(L, 0); s.lineTo(L, H); s.lineTo(0, H); s.lineTo(0, 0);
  const th = t1 - t0;
  const geo = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: false, curveSegments: 18 });
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3);
  const pos = axis === 'x' ? [a0, 0, t0] : [t1, 0, a0];
  const rot = axis === 'x' ? [0, 0, 0] : [0, -Math.PI / 2, 0];
  mb.addGeo(geo, mat, { pos, rot });
  geo.dispose();
  // trim: cap + keystones + reveal band
  const g = new THREE.Group();
  B(g, m.trim, L + 0.3, 0.3, th + 0.3, L / 2, H - 0.15, th / 2);
  for (const zz of [-0.06, th + 0.06]) {
    B(g, m.trim, 0.5, 0.7, 0.14, cx, ys + rise + 0.2, zz);
    B(g, m.trimDark, L, 0.45, 0.1, L / 2, 0.22, zz);
    B(g, m.trim, 0.35, 0.18, 0.14, u0 - 0.1, ys, zz); B(g, m.trim, 0.35, 0.18, 0.14, u1 + 0.1, ys, zz);
  }
  g.position.set(pos[0], 0, pos[2]); g.rotation.y = rot[1]; mb.mergeGroup(g);
  // colliders: piers + lintel (lintel overhangs walkable ground -> nav:false)
  const lint = ys + rise * 0.72;
  if (axis === 'x') {
    if (o0 > a0) mb.collider([a0, 0, t0], [o0, H, t1], 'concrete');
    if (a1 > o1) mb.collider([o1, 0, t0], [a1, H, t1], 'concrete');
    mb.collider([o0, lint, t0], [o1, H, t1], 'concrete', { nav: false });
  } else {
    if (o0 > a0) mb.collider([t0, 0, a0], [t1, H, o0], 'concrete');
    if (a1 > o1) mb.collider([t0, 0, o1], [t1, H, a1], 'concrete');
    mb.collider([t0, lint, o0], [t1, H, o1], 'concrete', { nav: false });
  }
}

// heavy wooden door leaf (opened). centre x,z; w along local x; ry rotation
function doorLeaf(mb, m, x, z, w, h, ry, mat) {
  const g = new THREE.Group();
  B(g, mat, w, h, 0.09, 0, h / 2, 0, 0, 0, 0, 1);
  for (const yy of [0.35, h * 0.5, h - 0.35]) for (const s of [-1, 1]) B(g, m.iron, w * 0.94, 0.07, 0.03, 0, yy, s * 0.06);
  for (let i = 0; i < 4; i++) for (const yy of [0.35, h * 0.5, h - 0.35]) for (const s of [-1, 1]) Sph(g, m.iron, 0.025, -w / 2 + 0.2 + i * (w - 0.4) / 3, yy, s * 0.08, 1, 1, 1, 6, 4);
  B(g, m.woodDark, 0.1, h, 0.12, -w / 2 + 0.05, h / 2, 0);
  put(mb, g, x, 0, z, ry);
  const bb = aabb(x, z, w, 0.12, ry);
  mb.collider([bb[0], 0, bb[1]], [bb[2], h, bb[3]], 'wood');
}

function crate(mb, m, x, y, z, s = 1.2, ry = 0) {
  const g = new THREE.Group();
  B(g, m.crate, s * 0.96, s * 0.96, s * 0.96, 0, s / 2, 0, 0, 0, 0, s);
  const bw = s * 0.1, f = m.crateFrame;
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

function palm(mb, m, x, z, h, R) {
  const g = new THREE.Group();
  const lx = (R() - 0.5) * 1.8, lz = (R() - 0.5) * 1.8;
  const n = 10; let prev = new THREE.Vector3(0, 0, 0);
  for (let i = 1; i <= n; i++) {
    const t = i / n, p = new THREE.Vector3(lx * t * t, h * t, lz * t * t);
    const r = 0.25 - 0.1 * t;
    seg(g, i % 2 ? m.trunk : m.trunkDark, r, prev, p, 9);
    C(g, m.trunkDark, r * 1.12, r * 1.02, 0.1, p.x, p.y - 0.05, p.z, 0, 0, 0, 9);
    prev = p;
  }
  const top = prev;
  C(g, m.trunkDark, 0.26, 0.17, 0.5, top.x, top.y + 0.05, top.z, 0, 0, 0, 9);
  for (let k = 0; k < 11; k++) {
    const fg = new THREE.Group();
    fg.position.copy(top).add(new THREE.Vector3(0, 0.2, 0)); fg.rotation.y = (k / 11) * Math.PI * 2 + R() * 0.3; g.add(fg);
    let px = 0, py = 0, a = 0.5 + R() * 0.45;
    const L = 0.72 + R() * 0.15, lm = R() < 0.22 ? m.leafDry : m.leaf;
    for (let j = 0; j < 5; j++) {
      const wdt = 0.6 - j * 0.1;
      for (const sd of [-1, 1]) {
        const lf = B(fg, lm, L, 0.025, wdt / 2, px + (Math.cos(a) * L) / 2, py + (Math.sin(a) * L) / 2, (sd * wdt) / 4);
        lf.rotation.order = 'ZYX'; lf.rotation.set(sd * 0.32, 0, a);
      }
      px += Math.cos(a) * L; py += Math.sin(a) * L; a -= 0.36 + R() * 0.08;
    }
  }
  for (let k = 0; k < 4; k++) { const a = k * 1.7; Sph(g, m.trunkDark, 0.12, top.x + Math.cos(a) * 0.22, top.y - 0.12, top.z + Math.sin(a) * 0.22); }
  put(mb, g, x, 0, z, 0);
  mb.collider([x - 0.3, 0, z - 0.3], [x + 0.3, 3.2, z + 0.3], 'wood');
}

function sedan(mb, m, x, y, z, ry, paint, wreck = false) {
  const g = new THREE.Group(), L = 4.4, W = 1.76;
  B(g, paint, W, 0.55, L, 0, 0.62, 0);
  B(g, paint, W - 0.04, 0.1, 1.3, 0, 0.94, 1.48, -0.05, 0, 0);
  B(g, paint, W - 0.04, 0.1, 0.95, 0, 0.94, -1.72);
  B(g, m.glass, W - 0.18, 0.5, 2.05, 0, 1.15, -0.25);
  B(g, paint, W - 0.22, 0.07, 1.72, 0, 1.43, -0.3);
  for (const s of [-1, 1]) {
    B(g, paint, 0.07, 0.52, 0.09, s * (W / 2 - 0.12), 1.16, 0.72, -0.5, 0, 0);
    B(g, paint, 0.07, 0.5, 0.09, s * (W / 2 - 0.1), 1.15, -0.25);
    B(g, m.dark, 0.012, 0.48, 0.02, s * (W / 2 + 0.004), 0.64, 0.2);
    B(g, m.dark, 0.012, 0.48, 0.02, s * (W / 2 + 0.004), 0.64, -0.95);
    B(g, m.chrome, 0.02, 0.04, 0.18, s * (W / 2 + 0.01), 0.82, 0.05);
    B(g, paint, 0.16, 0.1, 0.08, s * (W / 2 + 0.06), 1.0, 0.55);
    B(g, m.headLight, 0.34, 0.13, 0.04, s * 0.58, 0.74, L / 2 + 0.01);
    B(g, m.tailLight, 0.32, 0.15, 0.04, s * 0.6, 0.76, -L / 2 - 0.01);
    for (const zz of [1.35, -1.35]) {
      const drop = wreck && s > 0 && zz < 0 ? 0.12 : 0;
      C(g, m.rubber, 0.33, 0.33, 0.24, s * (W / 2 - 0.1), 0.33 - drop, zz, 0, 0, Math.PI / 2, 16);
      C(g, wreck ? m.rust : m.chrome, 0.17, 0.17, 0.25, s * (W / 2 - 0.1), 0.33 - drop, zz, 0, 0, Math.PI / 2, 10);
    }
  }
  B(g, m.dark, 0.72, 0.15, 0.03, 0, 0.72, L / 2 + 0.01);
  for (const s of [-1, 1]) B(g, m.iron, W + 0.04, 0.17, 0.13, 0, 0.44, s * (L / 2 + 0.04));
  B(g, m.ceramic, 0.5, 0.12, 0.02, 0, 0.48, L / 2 + 0.115);
  B(g, m.ceramic, 0.5, 0.12, 0.02, 0, 0.62, -L / 2 - 0.115);
  if (wreck) {
    for (let i = 0; i < 5; i++) B(g, m.rust, 0.3 + i * 0.07, 0.2, 0.02, W / 2 + 0.005, 0.5 + (i % 2) * 0.2, -1.5 + i * 0.7, 0, Math.PI / 2, 0);
    B(g, m.rust, 1.1, 0.02, 0.9, 0.1, 1.0, 1.5);
  }
  if (wreck) g.rotation.z = 0.03;
  put(mb, g, x, y, z, ry);
  const bb = aabb(x, z, W + 0.1, L + 0.2, ry);
  mb.collider([bb[0], y, bb[1]], [bb[2], y + 1.45, bb[3]], 'metal');
}

function pickup(mb, m, x, y, z, ry, paint) {
  const g = new THREE.Group(), L = 5.2, W = 1.9;
  B(g, paint, W, 0.6, L, 0, 0.75, 0);
  B(g, paint, W - 0.05, 0.12, 1.25, 0, 1.1, 1.9);
  B(g, m.glass, W - 0.16, 0.6, 1.5, 0, 1.38, 0.6);
  B(g, paint, W - 0.18, 0.07, 1.3, 0, 1.72, 0.5);
  for (const s of [-1, 1]) {
    B(g, paint, 0.08, 0.6, 0.1, s * (W / 2 - 0.1), 1.38, 1.3, -0.4, 0, 0);
    B(g, paint, 0.08, 0.6, 0.1, s * (W / 2 - 0.1), 1.38, -0.12);
    B(g, paint, 0.08, 0.5, 2.25, s * (W / 2 - 0.04), 1.3, -1.45);
    B(g, m.headLight, 0.3, 0.15, 0.04, s * 0.62, 0.9, L / 2 + 0.01);
    B(g, m.tailLight, 0.12, 0.3, 0.04, s * 0.85, 1.25, -L / 2 - 0.01);
    for (const zz of [1.7, -1.6]) {
      C(g, m.rubber, 0.4, 0.4, 0.28, s * (W / 2 - 0.12), 0.4, zz, 0, 0, Math.PI / 2, 16);
      C(g, m.chrome, 0.2, 0.2, 0.29, s * (W / 2 - 0.12), 0.4, zz, 0, 0, Math.PI / 2, 10);
    }
  }
  B(g, paint, W, 0.5, 0.08, 0, 1.3, -L / 2 + 0.04);
  B(g, m.woodDark, W - 0.2, 0.05, 2.2, 0, 1.06, -1.45);
  B(g, m.dark, 0.9, 0.2, 0.03, 0, 0.9, L / 2 + 0.01);
  B(g, m.iron, W + 0.06, 0.18, 0.14, 0, 0.55, L / 2 + 0.05);
  // cargo: sacks + a crate in the bed
  Sph(g, m.clothC, 0.32, -0.4, 1.3, -1.1, 1, 0.55, 1.4);
  Sph(g, m.clothC, 0.3, 0.35, 1.28, -1.9, 1, 0.55, 1.3);
  B(g, m.crate, 0.7, 0.6, 0.7, 0.4, 1.39, -0.9, 0, 0.3, 0);
  put(mb, g, x, y, z, ry);
  const bb = aabb(x, z, W + 0.1, L + 0.2, ry);
  mb.collider([bb[0], y, bb[1]], [bb[2], y + 1.8, bb[3]], 'metal');
}

function handCart(mb, m, x, z, ry) {
  const g = new THREE.Group();
  B(g, m.wood, 1.3, 0.08, 2.0, 0, 0.75, 0);
  for (const s of [-1, 1]) {
    B(g, m.wood, 0.06, 0.4, 2.0, s * 0.62, 0.98, 0);
    C(g, m.woodDark, 0.48, 0.48, 0.08, s * 0.72, 0.48, 0.2, 0, 0, Math.PI / 2, 14);
    C(g, m.iron, 0.08, 0.08, 0.14, s * 0.72, 0.48, 0.2, 0, 0, Math.PI / 2, 8);
    B(g, m.woodDark, 0.07, 0.07, 1.6, s * 0.5, 0.55, -1.6, -0.3, 0, 0);
  }
  Sph(g, m.clothC, 0.32, 0, 1.0, 0.3, 1.3, 0.6, 1.1);
  put(mb, g, x, 0, z, ry);
  const bb = aabb(x, z, 1.5, 2.2, ry);
  mb.collider([bb[0], 0, bb[1]], [bb[2], 1.2, bb[3]], 'wood');
}

function pole(mb, m, x, z, ry, h = 8.4) {
  const g = new THREE.Group();
  C(g, m.pole, 0.11, 0.15, h, 0, h / 2, 0, 0, 0, 0, 9);
  B(g, m.pole, 2.0, 0.12, 0.12, 0, h - 0.5, 0);
  seg(g, m.pole, 0.03, new THREE.Vector3(-0.7, h - 0.5, 0), new THREE.Vector3(0, h - 1.3, 0));
  seg(g, m.pole, 0.03, new THREE.Vector3(0.7, h - 0.5, 0), new THREE.Vector3(0, h - 1.3, 0));
  for (const o of [-0.85, 0, 0.85]) C(g, m.ceramic, 0.045, 0.06, 0.18, o, h - 0.35, 0, 0, 0, 0, 8);
  C(g, m.tank, 0.18, 0.18, 0.55, 0.3, h - 1.8, 0.2, 0, 0, 0, 10);
  put(mb, g, x, 0, z, ry);
  mb.collider([x - 0.16, 0, z - 0.16], [x + 0.16, h, z + 0.16], 'wood');
  const c = Math.cos(ry), s = Math.sin(ry);
  return [-0.85, 0, 0.85].map((o) => new THREE.Vector3(x + o * c, h - 0.26, z - o * s));
}
function wires(mb, m, A, Bp, sag = 0.7) {
  const g = new THREE.Group();
  for (let i = 0; i < A.length; i++) {
    const a = A[i], b = Bp[Math.min(i, Bp.length - 1)];
    let prev = a.clone();
    for (let k = 1; k <= 10; k++) {
      const t = k / 10;
      const p = new THREE.Vector3().lerpVectors(a, b, t); p.y -= sag * 4 * t * (1 - t);
      seg(g, m.cable, 0.014, prev, p, 4); prev = p;
    }
  }
  mb.mergeGroup(g);
}

function rocks(mb, m, x, z, n, R, spread = 1.5) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const r = 0.1 + R() * 0.25;
    const me = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), m.rock);
    me.position.set((R() - 0.5) * spread * 2, r * 0.4, (R() - 0.5) * spread * 2);
    me.scale.set(1, 0.6 + R() * 0.3, 1 + R() * 0.4); me.rotation.set(R() * 3, R() * 3, R() * 3); g.add(me);
  }
  put(mb, g, x, 0, z, 0);
}

function lowWall(mb, m, x0, z0, x1, z1, y, h, mat) {
  mb.boxMM([x0, y, z0], [x1, y + h, z1], mat || m.wallC, { mat: 'concrete', tile: 2 });
  mb.box((x0 + x1) / 2, y + h, (z0 + z1) / 2, x1 - x0 + 0.12, 0.1, z1 - z0 + 0.12, m.trim, { collide: false });
}

// ================================================================== map
export default {
  id: 'dust',
  name: '沙漠灰',
  desc: '经典爆破地图：A大、A小道（天桥）、中门、B洞。潜伏者自南面出生，保卫者守北面。',
  modes: ['bomb', 'tdm', 'ffa'],
  env: { preset: 'desert' },
  size: 70,
  build(mb) {
    const m = mats();
    const R = rng(20240);

    // ---------------- ground (with a hole for the pit at the end of long A)
    const gnd = (x0, z0, x1, z1) => mb.boxMM([x0, -2, z0], [x1, 0, z1], m.sand, { mat: 'sand', tile: 6 });
    gnd(-60, -60, 45, 60); gnd(45, -60, 60, -32); gnd(45, -18, 60, 60); gnd(52, -32, 60, -18);
    mb.boxMM([45, -2.4, -32], [52, -1.2, -22], m.sand, { mat: 'sand', tile: 4 });
    mb.stairs(45, -22, 52, -18, -1.2, 0, 'z', 1, m.conc, { mat: 'concrete', tile: 2 });
    mb.box(45.04, -1.2, -27, 0.08, 1.2, 10, m.stoneDark, { collide: false, tile: 2 });
    mb.box(48.5, -1.2, -31.96, 7, 1.2, 0.08, m.stoneDark, { collide: false, tile: 2 });
    mb.box(45.1, 0, -25, 0.3, 0.08, 14.2, m.trim, { collide: false });
    // paved patches & worn paths
    const pv = (x0, z0, x1, z1) => mb.box((x0 + x1) / 2, 0, (z0 + z1) / 2, x1 - x0, 0.03, z1 - z0, m.pave, { collide: false, tile: 3 });
    pv(-50, -50, -26, -28); pv(-10, -50, 6, -34); pv(-3, -23, 7, 10); pv(-20, 40, 20, 50); pv(40, -18, 50, 28);

    // ---------------- outer walls (thick, tall) with decorated inner faces
    building(mb, m, [-60, -60, -24, -52], 9, { faces: ['s'], wall: m.wallB, vigas: true });
    building(mb, m, [-24, -60, -12, -52], 10, { faces: [], wall: m.wallA });
    building(mb, m, [-12, -60, 20, -52], 9.5, { faces: ['s'], wall: m.wallC, doors: { s: [-6] } });
    building(mb, m, [20, -60, 60, -52], 9, { faces: [['s', 1.6]], wall: m.wallB, vigas: true });
    building(mb, m, [-60, 52, -22, 60], 8.5, { faces: ['n'], wall: m.wallA, doors: { n: [-4] } });
    building(mb, m, [-22, 52, 22, 60], 9, { faces: ['n'], wall: m.wallD, vigas: true, doors: { n: [-10, 12] } });
    building(mb, m, [22, 52, 60, 60], 8.5, { faces: ['n'], wall: m.wallC });
    building(mb, m, [-60, -52, -52, -26], 9, { faces: ['e'], wall: m.wallC });
    building(mb, m, [-60, -26, -52, 44], 8, { faces: [], wall: m.wallA, roof: false });
    building(mb, m, [-60, 44, -52, 52], 8.5, { faces: ['e'], wall: m.wallB });
    building(mb, m, [52, -52, 60, -34], 9, { faces: [['w', 1.6]], wall: m.wallA });
    building(mb, m, [52, -34, 60, 52], 9, { faces: ['w'], wall: m.wallC, vigas: true, pipe: true });

    // ---------------- interior building blocks
    building(mb, m, [-52, -26, -46, 22], 7, { faces: ['n'], wall: m.wallD, roof: false });
    building(mb, m, [-52, 22, -46, 44], 7, { faces: ['e', 's'], wall: m.wallA, doors: { e: [-5] } });
    building(mb, m, [-38, -26, -24, -16], 6.5, { faces: ['n'], wall: m.wallB, vigas: true });
    building(mb, m, [-24, -32, -8, -16], 7, { faces: ['n', 'e', 's'], wall: m.wallA, doors: { n: [3] }, pipe: true });
    building(mb, m, [-8, -24, -4, -16], 6, { faces: ['n', 'e'], wall: m.wallC });
    building(mb, m, [-38, -10, -22, 10], 7, { faces: [], wall: m.wallC });
    building(mb, m, [-22, -10, -4, 10], 6, { faces: ['n', 'e'], wall: m.wallB, doors: { e: [3] } });
    building(mb, m, [-38, 10, -22, 32], 6.5, { faces: ['s'], wall: m.wallD, doors: { s: [2] } });
    building(mb, m, [-22, 10, -4, 38], 7.5, { faces: ['e', 's', 'w'], wall: m.wallA, vigas: true, doors: { s: [3], e: [-3] } });
    building(mb, m, [-24, -52, -12, -42], 6, { faces: ['e', 's', 'w'], wall: m.wallB, doors: { s: [0] } });
    building(mb, m, [14, -20, 26, 6], 7, { faces: [['w', 1.6], 'n'], wall: m.wallC, vigas: true });
    building(mb, m, [26, -20, 38, 6], 6, { faces: ['e', 'n'], wall: m.wallA, doors: { e: [-6] } });
    building(mb, m, [14, 6, 38, 32], 6.5, { faces: ['w', 'e', 's'], wall: m.wallB, doors: { e: [4], s: [2] }, pipe: true });
    building(mb, m, [14, -30, 22, -20], 6, { faces: [['n', 1.6], 'e'], wall: m.wallD });
    building(mb, m, [6, 26, 22, 38], 7, { faces: ['w', 's', 'e'], wall: m.wallD, vigas: true, doors: { s: [-2] } });
    building(mb, m, [28, 44, 40, 52], 6, { faces: ['n', 'w', 'e'], wall: m.wallA, doors: { n: [-2] } });

    // ---------------- raised areas: A site plateau, short/catwalk (y = 1.6)
    const H = 1.6;
    const plat = (x0, z0, x1, z1) => {
      mb.boxMM([x0, 0, z0], [x1, H, z1], m.pave, { mat: 'concrete', tile: 3 });
    };
    plat(20, -52, 52, -34); plat(8, -42, 22, -30); plat(8, -30, 14, 6);
    // stone coping on exposed edges
    mb.box(43, H, -34.1, 18, 0.08, 0.3, m.trim, { collide: false });
    mb.box(8.1, H, -18, 0.3, 0.08, 48, m.trim, { collide: false });
    mb.box(15, H, -41.9, 14, 0.08, 0.3, m.trim, { collide: false });
    // A ramp from long corner, CT ramp from CT spawn, stairs mid -> catwalk
    mb.ramp(22, -34, 34, -26, 0, H, 'z', -1, m.pave, { mat: 'concrete', tile: 3 });
    lowWall(mb, m, 34, -30, 34.45, -26, 0, 1.3);
    lowWall(mb, m, 34, -34, 34.45, -30, 0, 2.5);
    mb.ramp(12, -50, 20, -42, 0, H, 'x', 1, m.pave, { mat: 'concrete', tile: 3 });
    mb.stairs(8, 6, 14, 12, 0, H, 'z', -1, m.pave, { mat: 'concrete', tile: 2 });
    mb.railing(8.1, 6.2, 8.1, 11.8, 0, { height: 1.0, material: m.iron, collide: false });
    // catwalk parapets & short walls (cover)
    lowWall(mb, m, 8, -20, 8.45, -12, H, 1.05);
    lowWall(mb, m, 8, -6, 8.45, 2, H, 1.05);
    lowWall(mb, m, 8, -42, 8.45, -36, H, 1.0);
    lowWall(mb, m, 36, -34.55, 44, -34, H, 1.0);
    lowWall(mb, m, 46, -52, 46.6, -49.4, H, 1.15);  // goose
    lowWall(mb, m, 20, -38, 20.5, -34.5, H, 1.1);

    // ---------------- gate walls & arches
    archWall(mb, m, 'x', 38, 52, 30, 32, 6.5, 43, 47, 2.6, 1.2, m.wallB);   // long doors
    doorLeaf(mb, m, 43.07, 29, 2, 2.7, Math.PI / 2, m.wood);
    doorLeaf(mb, m, 46.93, 28.95, 2, 2.7, -Math.PI / 2, m.wood);
    archWall(mb, m, 'x', -4, 8, -25, -23, 5.6, 0, 4, 2.6, 1.0, m.wallA);    // mid doors
    doorLeaf(mb, m, 0.07, -26, 2, 2.65, Math.PI / 2, m.blue);
    doorLeaf(mb, m, 3.93, -26.05, 2, 2.65, -Math.PI / 2, m.blue);
    archWall(mb, m, 'z', -42, -32, -25, -23, 6, -39, -35, 2.6, 1.1, m.wallC); // B doors
    doorLeaf(mb, m, -26, -38.93, 2, 2.7, 0, m.wood);
    doorLeaf(mb, m, -26.05, -35.07, 2, 2.7, Math.PI, m.wood);
    archWall(mb, m, 'x', -46, -38, -27, -25, 6.5, -44, -40, 2.4, 1.3, m.wallD); // B tunnel exit
    archWall(mb, m, 'x', -46, -38, 31, 33, 6.5, -44.5, -39.5, 2.5, 1.5, m.wallB); // upper tunnel entrance
    archWall(mb, m, 'z', -16, -10, -6, -4, 5.5, -15, -11, 2.4, 1.2, m.wallA); // lower tunnel -> mid
    archWall(mb, m, 'x', -4, 6, 32, 34, 6.2, -2, 4, 3.0, 1.4, m.wallC);     // T mid arch
    mb.sign('中门', 2, 4.65, -22.89, 1.6, 0.5, { fg: '#f2e8d0', bg: 'rgba(60,40,20,0.85)', font: 'bold 120px sans-serif' });

    // ---------------- tunnels (roofs are nav:false overhangs)
    const roof = (x0, z0, x1, z1) => {
      mb.boxMM([x0, 3.6, z0], [x1, 4.2, z1], m.tunnel, { mat: 'concrete', nav: false, tile: 3 });
      const g = new THREE.Group();
      const alongZ = (z1 - z0) > (x1 - x0);
      const len = alongZ ? z1 - z0 : x1 - x0, wid = alongZ ? x1 - x0 : z1 - z0;
      for (let t = 1.5; t < len; t += 3) {
        if (alongZ) {
          B(g, m.woodDark, wid, 0.24, 0.26, (x0 + x1) / 2, 3.48, z0 + t);
          B(g, m.woodDark, 0.22, 3.6, 0.22, x0 + 0.11, 1.8, z0 + t); B(g, m.woodDark, 0.22, 3.6, 0.22, x1 - 0.11, 1.8, z0 + t);
        } else {
          B(g, m.woodDark, 0.26, 0.24, wid, x0 + t, 3.48, (z0 + z1) / 2);
          B(g, m.woodDark, 0.22, 3.6, 0.22, x0 + t, 1.8, z0 + 0.11); B(g, m.woodDark, 0.22, 3.6, 0.22, x0 + t, 1.8, z1 - 0.11);
        }
      }
      mb.mergeGroup(g);
    };
    roof(-46, -24, -38, 22); roof(-38, -16, -26, -10);
    mb.boxMM([-42, 0, 4], [-38, 3.6, 10], m.wallC, { mat: 'concrete', tile: 3 }); // jog in upper tunnel
    // tunnel wainscot, pipes and cables
    const tg = new THREE.Group();
    for (const [x, z0, z1] of [[-45.97, -24, 22], [-38.03, -10, 4], [-38.03, 10, 22], [-38.03, -24, -16], [-42.03, 4, 10]]) {
      B(tg, m.trimDark, 0.06, 1.1, z1 - z0, x, 0.55, (z0 + z1) / 2, 0, 0, 0, 2);
      B(tg, m.trim, 0.1, 0.08, z1 - z0, x, 1.12, (z0 + z1) / 2);
    }
    C(tg, m.iron, 0.07, 0.07, 46, -45.8, 3.1, -1, Math.PI / 2, 0, 0, 8);
    C(tg, m.cable, 0.025, 0.025, 46, -45.85, 3.3, -1, Math.PI / 2, 0, 0, 5);
    for (const [x, z0, z1] of [[-37, -15.97, -15.97], [-37, -10.03, -10.03]]) B(tg, m.trimDark, 12, 1.1, 0.06, -32, 0.55, z0, 0, 0, 0, 2);
    mb.mergeGroup(tg);
    mb.lamp(-42, 3.25, -18, { intensity: 7, distance: 14, color: 0xffd9a0 });
    mb.lamp(-42, 3.25, -3, { intensity: 7, distance: 14, color: 0xffd9a0 });
    mb.lamp(-42, 3.25, 15, { intensity: 7, distance: 14, color: 0xffd9a0 });
    mb.lamp(-31, 3.25, -13, { intensity: 6, distance: 12, color: 0xffd9a0 });
    crate(mb, m, -44.6, 0, -6, 1.2, 0.1); crate(mb, m, -44.7, 0, -4.6, 1.0, 0.4);
    crate(mb, m, -39.5, 0, 17, 1.2, 0); crate(mb, m, -39.5, 1.2, 17, 0.9, 0.2);
    mb.barrel(-45.3, 0, 19.5, { color: '#5a3a24' }); mb.barrel(-36.6, 0, -11, { color: '#3d5e3a' });

    // ---------------- T spawn (south)
    palm(mb, m, -20.5, 39.5, 6.5, R); palm(mb, m, 20, 50.5, 7.2, R); palm(mb, m, -2, 51, 5.8, R);
    crate(mb, m, -16, 0, 40.5, 1.3, 0.2); crate(mb, m, -16.1, 1.3, 40.4, 1.0, 0.6); crate(mb, m, -14.6, 0, 40.4, 1.1, 0);
    crate(mb, m, 15.5, 0, 40.8, 1.2, 0.3);
    mb.barrel(-19.5, 0, 50.5, { color: '#3c5a7a' }); mb.barrel(-18.8, 0, 51.2, { color: '#7a3c2c' }); mb.barrel(-20.6, 0, 48.6, { color: '#3c5a7a', tipped: true });
    pickup(mb, m, 16.5, 0, 46.5, 0.35, m.truck);
    handCart(mb, m, -14.5, 51.2, 1.3);
    rocks(mb, m, 8, 51, 8, R); rocks(mb, m, -8, 39.5, 6, R);
    onFace(mb, [-22, 10, -4, 38], 's', (g) => awning(g, m, m.clothR, -5, 3.2, 3.6, 1.6));
    onFace(mb, [6, 26, 22, 38], 's', (g) => awning(g, m, m.clothB, 4, 3.0, 3.2, 1.4));

    // ---------------- outside long + long A
    crate(mb, m, 30, 0, 34, 1.3, 0); crate(mb, m, 31.35, 0, 34.1, 1.3, 0); crate(mb, m, 30.6, 1.3, 34.0, 1.1, 0);
    mb.barrel(31, 0, 43, { color: '#2c4f7c' }); mb.barrel(31.7, 0, 42.6, { color: '#2c4f7c' });
    pickup(mb, m, 46.5, 0, 48, 1.45, m.carB);
    palm(mb, m, 24, 42.5, 6, R);
    sedan(mb, m, 43, 0, -10, 0.3, m.carA, true);                 // the car at long A
    crate(mb, m, 39.8, 0, -17.6, 1.4, 0); crate(mb, m, 39.8, 1.4, -17.6, 1.1, 0.4); crate(mb, m, 41.3, 0, -17.8, 1.2, 0.2); // long corner
    crate(mb, m, 50.6, 0, 12, 1.2, 0); mb.barrel(50.8, 0, 10.4, { color: '#7a3c2c' }); mb.barrel(51.1, 0, 9.6, { color: '#7a3c2c' });
    lowWall(mb, m, 48.5, 2, 52, 2.6, 0, 1.15);
    rocks(mb, m, 46, 20, 6, R); rocks(mb, m, 40, -3, 5, R);
    crate(mb, m, 24.2, 0, -21.6, 1.2, 0.2);                       // A cross
    mb.barrel(36.2, 0, -21, { color: '#3c5a7a' });
    // power line down long A
    const pA = pole(mb, m, 50.9, 26, 0), pB = pole(mb, m, 50.9, 4, 0), pC = pole(mb, m, 50.9, -14, 0);
    wires(mb, m, pA, pB, 0.8); wires(mb, m, pB, pC, 0.8);
    const pD = pole(mb, m, 50.9, -33, 0), pE = pole(mb, m, 50.9, 38, 0);
    wires(mb, m, pC, pD, 0.7); wires(mb, m, pE, pA, 0.4);

    // ---------------- A site (plateau)
    crate(mb, m, 34, H, -44, 1.4, 0); crate(mb, m, 34, H + 1.4, -44, 1.2, 0.3); crate(mb, m, 35.5, H, -44.1, 1.3, 0);
    crate(mb, m, 47.5, H, -49.8, 1.2, 0.15); crate(mb, m, 49, H, -50.7, 1.1, 0);
    crate(mb, m, 24, H, -48.5, 1.3, 0.2); crate(mb, m, 24, H + 1.3, -48.5, 1.0, 0.6);
    mb.barrel(42.6, H, -51, { color: '#2c4f7c' }); mb.barrel(43.3, H, -51.3, { color: '#7a3c2c' });
    palm(mb, m, 28, -36.5, 5.5, R);
    mb.box(40, 1.6, -51.75, 5.2, 5.7, 0.5, m.wallB, { mat: 'concrete', tile: 3 });
    mb.box(40, 7.3, -51.7, 5.6, 0.2, 0.6, m.trim, { collide: false });
    mb.sign('A', 40, 5.0, -51.48, 3.2, 3.2, { fg: '#b3241a', font: 'bold 420px Arial' });
    { const s = mb.sign('A', 40, H + 0.012, -41, 4, 4, { fg: 'rgba(170,30,20,0.75)', font: 'bold 420px Arial' }); s.rotation.set(-Math.PI / 2, 0, 0); }
    mb.sign('A ↑', 30, 3.2, -20.06, 1.6, 0.8, { rotY: Math.PI, fg: '#f4f0e0', bg: 'rgba(150,40,30,0.9)', font: 'bold 160px Arial' });
    mb.sign('A →', 12.9, 3.2, -52 + 0.06, 1.6, 0.8, { fg: '#f4f0e0', bg: 'rgba(150,40,30,0.9)', font: 'bold 160px Arial' });

    // ---------------- catwalk / mid
    crate(mb, m, 5.2, 0, 9.4, 1.3, 0);                           // "xbox"
    crate(mb, m, 11.5, H, -26.5, 1.2, 0.2);
    mb.barrel(-3.1, 0, -19.5, { color: '#3d5e3a' }); mb.barrel(-3.3, 0, -18.7, { color: '#3d5e3a' });
    crate(mb, m, -2.6, 0, 24.4, 1.2, 0.3); crate(mb, m, -2.6, 0, 23.0, 1.0, 0);
    palm(mb, m, 12.5, 24.5, 6.2, R);
    rocks(mb, m, 2, -5, 6, R); rocks(mb, m, 1, 18, 5, R);
    const pM1 = pole(mb, m, -2.9, 20, 0), pM2 = pole(mb, m, -2.9, -2, 0), pM3 = pole(mb, m, -2.9, -21, 0);
    wires(mb, m, pM1, pM2, 0.9); wires(mb, m, pM2, pM3, 0.8);
    wires(mb, m, pM1, [new THREE.Vector3(-3.95, 6.9, 27.5)], 0.5);

    // ---------------- CT mid / CT spawn
    crate(mb, m, -6.5, 0, -27.5, 1.3, 0.1); crate(mb, m, -6.5, 1.3, -27.5, 1.0, 0.5);
    mb.barrel(6.9, 0, -31, { color: '#2c4f7c' });
    sedan(mb, m, -17, 0, -35.2, 1.45, m.carB, false);             // CT car
    palm(mb, m, -11, -33.5, 6.4, R); palm(mb, m, 6.8, -51, 6, R);
    crate(mb, m, 2, 0, -35.5, 1.2, 0.25);
    crate(mb, m, 10, 0, -51, 1.1, 0); mb.barrel(9.2, 0, -51.3, { color: '#7a3c2c' });
    mb.sign('B ←', -11.94, 3.2, -45, 1.6, 0.8, { rotY: Math.PI / 2, fg: '#f4f0e0', bg: 'rgba(30,70,120,0.9)', font: 'bold 160px Arial' });
    onFace(mb, [-24, -52, -12, -42], 's', (g) => awning(g, m, m.clothB, 0, 3.2, 3.4, 1.5));

    // ---------------- B site
    mb.boxMM([-50, 0, -52], [-30, 0.9, -48], m.pave, { mat: 'concrete', tile: 2 });  // back plat
    mb.boxMM([-50, 0, -48], [-30, 0.45, -47.2], m.pave, { mat: 'concrete', tile: 2 });
    mb.box(-40, 0.9, -47.95, 20, 0.08, 0.2, m.trim, { collide: false });
    crate(mb, m, -46, 0.9, -50.6, 1.3, 0); crate(mb, m, -44.6, 0.9, -50.7, 1.2, 0.2);
    crate(mb, m, -40, 0, -40, 1.45, 0); crate(mb, m, -40, 1.45, -40, 1.2, 0.35); crate(mb, m, -38.5, 0, -40.1, 1.3, 0); // big box
    crate(mb, m, -28.5, 0, -49.6, 1.3, 0.2); crate(mb, m, -28.4, 1.3, -49.6, 1.0, 0);
    crate(mb, m, -47.5, 0, -30.5, 1.2, 0.3);
    lowWall(mb, m, -34, -33, -30, -32.5, 0, 1.15);
    handCart(mb, m, -32, -28.5, 0.4);
    mb.barrel(-25.8, 0, -44, { color: '#2c4f7c' }); mb.barrel(-25.9, 0, -44.8, { color: '#3c5a7a' }); mb.barrel(-26.5, 0, -44.4, { color: '#7a3c2c', tipped: true });
    palm(mb, m, -50.2, -42, 6.8, R);
    mb.box(-40, 0.9, -51.75, 5.2, 5.2, 0.5, m.wallB, { mat: 'concrete', tile: 3 });
    mb.box(-40, 6.1, -51.7, 5.6, 0.2, 0.6, m.trim, { collide: false });
    mb.sign('B', -40, 4.0, -51.48, 3.2, 3.2, { fg: '#b3241a', font: 'bold 420px Arial' });
    { const s = mb.sign('B', -36, 0.012, -38, 4, 4, { fg: 'rgba(170,30,20,0.75)', font: 'bold 420px Arial' }); s.rotation.set(-Math.PI / 2, 0, 0); }
    rocks(mb, m, -34, -44, 6, R);
    onFace(mb, [-38, -26, -24, -16], 'n', (g) => awning(g, m, m.clothC, -2, 3.0, 4, 1.4));

    // ---------------- outside tunnels
    crate(mb, m, -30, 0, 36, 1.3, 0.2); crate(mb, m, -28.7, 0, 36.2, 1.1, 0);
    mb.barrel(-50.6, 0, 50.6, { color: '#3d5e3a' }); mb.barrel(-49.9, 0, 51.1, { color: '#3d5e3a' });
    handCart(mb, m, -40, 47, 2.2);
    palm(mb, m, -26, 49.5, 6.6, R); palm(mb, m, -48, 45, 5.6, R);
    rocks(mb, m, -36, 42, 7, R);
    const pT1 = pole(mb, m, -21, 41.5, Math.PI / 2), pT2 = pole(mb, m, 0, 41.2, Math.PI / 2), pT3 = pole(mb, m, 21, 41.5, Math.PI / 2);
    wires(mb, m, pT1, pT2, 1.0); wires(mb, m, pT2, pT3, 1.0);

    // ---------------- skyline outside the walls (visual only)
    const sk = new THREE.Group();
    const tall = [[-30, -66, 14, 10, 12], [5, -68, 18, 12, 14], [40, -66, 16, 10, 11], [-66, -20, 10, 18, 12], [-66, 25, 12, 14, 10], [66, -5, 10, 20, 13], [66, 35, 12, 12, 11], [-20, 66, 18, 10, 11], [25, 66, 14, 10, 12]];
    for (const [x, z, w, d, h] of tall) {
      B(sk, R() < 0.5 ? m.wallA : m.wallC, w, h, d, x, h / 2, z, 0, 0, 0, 3);
      B(sk, m.trim, w + 0.3, 0.35, d + 0.3, x, h - 0.17, z);
    }
    // minaret
    C(sk, m.wallB, 1.6, 1.9, 22, 30, 11, -64, 0, 0, 0, 12);
    C(sk, m.trim, 2.4, 2.4, 0.5, 30, 18, -64, 0, 0, 0, 12);
    C(sk, m.wallB, 1.2, 1.4, 4, 30, 24, -64, 0, 0, 0, 12);
    { const dm = new THREE.Mesh(gSph(1.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.domeBlue); dm.position.set(30, 26, -64); sk.add(dm); }
    C(sk, m.trim, 0.05, 0.12, 1.4, 30, 27.9, -64, 0, 0, 0, 6);
    { const dm = new THREE.Mesh(gSph(5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.domeBlue); dm.position.set(5, 14, -68); sk.add(dm); }
    mb.mergeGroup(sk);

    // invisible lid colliders above the outer walls so nothing escapes
    mb.collider([-60, 0, -60], [-52, 30, 60], 'concrete'); mb.collider([52, 0, -60], [60, 30, 60], 'concrete');
    mb.collider([-60, 0, -60], [60, 30, -52], 'concrete'); mb.collider([-60, 0, 52], [60, 30, 60], 'concrete');

    // ---------------- spawns
    const red = [[-12, 46], [-8, 43.5], [-4, 47], [0, 44], [4, 47], [8, 43.5], [10, 48], [-10, 49.5], [-3, 50], [5, 50.5]].map(([x, z]) => [x, 0, z, 0]);
    const blue = [[-8, -48], [-4, -46], [0, -48], [4, -46], [-8, -44], [-2, -43], [3, -42.5], [6, -47.5], [-5, -50.5], [1, -51]].map(([x, z]) => [x, 0, z, Math.PI]);
    const ffa = [
      [0, 0, 0, 0], [44, 0, 10, Math.PI], [30, 0, 39, -Math.PI / 2], [-34, 0, 40, Math.PI / 2], [-44, 0, 8, 0], [-42, 0, -36, -Math.PI / 2],
      [41, H, -46, Math.PI / 2], [11, H, -14, Math.PI], [-16, 0, -13, -Math.PI / 2], [0, 0, -29, Math.PI], [-6, 0, -46, Math.PI], [5, 0, 19, 0],
    ];
    return {
      spawns: { red, blue, ffa },
      sites: { A: { center: [39, H, -43], radius: 6 }, B: { center: [-38, 0, -39], radius: 6 } },
      bounds: [-52, -52, 52, 52],
      killY: -3,
      hotspots: [
        [39, H, -43], [-38, 0, -39], [2, 0, -21], [45, 0, 27], [11, H, -20], [-42, 0, -23], [-20, 0, -13],
        [48, -1.2, -28], [42, 0, -23], [0, 0, -29], [1, 0, 30], [28, H, -40], [-26, 0, -37], [-42, 0, 30],
      ],
    };
  },
};
