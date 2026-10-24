// 运输船 (Transport Ship) — CF's signature compact TDM map, rebuilt procedurally.
//
// A ~120 m cargo ship on open ocean at late afternoon. Bow points to -Z, stern to +Z, starboard = +X, port = -X.
//   潜伏者 (red)  spawn: stern, on the raised poop deck (y 2.4) under the accommodation overhang + main deck in front.
//   保卫者 (blue) spawn: bow, on the raised forecastle (y 2.4) + main deck in front of it.
//   Middle: three hatch bays (H1 z∈[-26,-12], H2 z∈[-7.5,7.5], H3 z∈[12,26], covers raised 0.35 m) stacked with
//   containers, separated by two cross alleys (A1/A2), with a port walkway (x<-7.6) and a starboard walkway (x>7.6).
//   The cargo layout is point-symmetric about the origin ((x,z) -> (-x,-z)) so both teams get mirrored routes.
// Everything here follows docs/INTERFACES.md §3 (AABB colliders, 2.5D nav, overhangs nav:false, enclosed bounds).
import * as THREE from 'three';
import { M, solid, T } from '../world/mapkit.js';

// ------------------------------------------------------------------------------------------------
// Ship shape
// ------------------------------------------------------------------------------------------------
const DECK_HI = 2.4;     // forecastle + poop deck height
const BW = 0.28;         // bulwark thickness (inner face = hull side - BW)
const WATER = -8;        // sea level
const WALL_TOP = 16;     // invisible boundary walls reach this high
const HY = 0.35;         // hatch cover top
const CH = 2.59;         // container height
const T1 = HY + CH;      // top of a 1-high stack on a hatch (2.94)

function hwDeck(z) {                       // hull half-width at deck level
  if (z < -30) { const t = Math.min(1, (-30 - z) / 30); return 13 * Math.sqrt(Math.max(0, 1 - t * t)); }
  if (z > 44) { const t = Math.min(1, (z - 44) / 16); return 13 - 1.0 * t * t; }
  return 13;
}
function hwWL(z) {                         // half-width at the waterline (finer entry -> bow flare)
  if (z < -24) { const t = Math.min(1, (-24 - z) / 32.5); return 13 * Math.sqrt(Math.max(0, 1 - t * t)); }
  if (z > 36) { const t = Math.min(1, (z - 36) / 24); return 13 - 5 * Math.pow(t, 1.5); }
  return 13;
}
function hullX(z, y) {                     // outer hull half-width at (z, y)
  const d = hwDeck(z);
  if (y >= 0) {
    const bowF = Math.min(1, Math.max(0, (-30 - z) / 20));
    return d + 0.08 * y * bowF * Math.min(1, d / 3);
  }
  const w = Math.min(hwWL(z), d);
  if (y >= -8) { const s = -y / 8; return d + (w - d) * Math.pow(s, 1.6); }
  const k = Math.min(1, (-8 - y) / 5);
  return Math.max(0, w - Math.min(w * 0.5, 1.6) * k * k);
}
function yTop(z) {                         // top of the bulwark (sheer line), raised at forecastle & poop
  if (z <= -41) return 3.6;
  if (z < -38) return 3.6 - ((z + 41) / 3) * 2.4;
  if (z >= 41) return 3.6;
  if (z > 38) return 1.2 + ((z - 38) / 3) * 2.4;
  return 1.2;
}
const yDeck = (z) => (z < -40 || z > 40 ? DECK_HI : 0);
const yBot = (z) => (z < 48 ? -13 : -13 + ((z - 48) / 12) * 4.6);
const hwi = (z) => Math.max(0, hullX(z, yDeck(z)) - BW);   // inner (walkable) half-width

// hull stations (dense at the bow)
const STATIONS = (() => {
  const s = new Set();
  for (let z = -60; z < -50; z += 0.5) s.add(+z.toFixed(2));
  for (let z = -50; z < -30; z += 1) s.add(z);
  for (let z = -30; z < 36; z += 3) s.add(z);
  for (let z = 36; z <= 60; z += 1) s.add(z);
  for (const z of [-41, -40.01, -39.99, -38, 38, 39.99, 40.01, 41, 44, 46]) s.add(z);
  return [...s].sort((a, b) => a - b);
})();

// ------------------------------------------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------------------------------------------
const LM = new Map();
const lm = (k, fn) => { if (!LM.has(k)) LM.set(k, fn()); return LM.get(k); };
const GEO = new Map();
const geoC = (k, fn) => { if (!GEO.has(k)) GEO.set(k, fn()); return GEO.get(k); };
const PI = Math.PI, HP = Math.PI / 2;

const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _mx = new THREE.Matrix4();

function mats() {
  return {
    hull: M.hull('#2a4566'),
    anti: M.hull('#8a2b22'),
    boot: solid('#d9d5c9', { roughness: 0.55 }),
    bulIn: M.paintedSteel('#a7ab9d', 0.35),
    cap: M.paintedSteel('#cfc79a', 0.25),
    deck: lm('deck', () => new THREE.MeshStandardMaterial({
      map: T.paintedMetal('#6f8462', 64, 0.55), metalness: 0.15, roughness: 0.8,
      normalMap: T.microNormal(65, 1.2), normalScale: new THREE.Vector2(0.35, 0.35),
    })),
    plate: M.deckPlate(),
    hatch: M.paintedSteel('#6e7d8a', 0.4),
    white: lm('ssWhite', () => new THREE.MeshStandardMaterial({ map: T.paintedMetal('#eeebe2', 72, 0.12), metalness: 0.2, roughness: 0.55 })),
    whiteDark: lm('ssWhiteD', () => new THREE.MeshStandardMaterial({ map: T.paintedMetal('#cfcabd', 73, 0.2), metalness: 0.25, roughness: 0.6 })),
    grey: M.paintedSteel('#7c8287', 0.4),
    darkGrey: M.paintedSteel('#3a3f44', 0.4),
    yellow: M.paintedSteel('#d6a823', 0.35),
    rail: M.paintedSteel('#c9b23a', 0.3),
    red: M.paintedSteel('#a8281f', 0.3),
    machine: M.paintedSteel('#4e6b5a', 0.4),
    funnel: M.paintedSteel('#d8cfb4', 0.2),
    orange: solid('#e2611c', { roughness: 0.5 }),
    black: M.black(),
    anchor: M.paintedSteel('#3b3c3e', 0.7),
    steel: M.steelBright(),
    rust: M.rust(),
    rope: M.rope(),
    hazard: M.hazard(),
    wood: M.deckWood(),
    crate: M.crate(),
    lampOn: M.lampOn(),
    glass: lm('glassDark', () => new THREE.MeshStandardMaterial({ color: 0x1a2532, metalness: 0.9, roughness: 0.07 })),
    glassLit: lm('glassLit', () => new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb15a, emissiveIntensity: 1.3, roughness: 0.3 })),
    chain: lm('chain', () => new THREE.MeshStandardMaterial({ color: 0x3a3530, metalness: 0.75, roughness: 0.5 })),
    frameWood: lm('frameWood', () => new THREE.MeshStandardMaterial({ map: T.planks(58, '#6e5230', 3), roughness: 0.85 })),
    stripe: lm('stripeY', () => new THREE.MeshStandardMaterial({ color: 0xd9b52c, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
    stripeW: lm('stripeW', () => new THREE.MeshStandardMaterial({ color: 0xdedbd0, roughness: 0.65, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })),
    navRed: lm('navRed', () => new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff1a10, emissiveIntensity: 3 })),
    navGreen: lm('navGreen', () => new THREE.MeshStandardMaterial({ color: 0x30ff70, emissive: 0x10ff50, emissiveIntensity: 3 })),
    far: (c) => solid(c, { roughness: 0.9 }),
  };
}

// visual-only box (bottom-centre)
function vbox(mb, x, y, z, w, h, d, mat, { rotY = 0, cast = true, tile = 2 } = {}) {
  mb.box(x, y, z, w, h, d, mat, { collide: false, rotY, cast, tile });
}
// visual cylinder between two points
function rod(mb, a, b, r, mat, segs = 6, cast = true) {
  _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = _v.length(); if (len < 1e-4) return;
  _v.divideScalar(len);
  _q.setFromUnitVectors(_up, _v); _e.setFromQuaternion(_q);
  const g = geoC(`rod${r}_${segs}`, () => new THREE.CylinderGeometry(r, r, 1, segs, 1));
  mb.addGeo(g, mat, { pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot: [_e.x, _e.y, _e.z], scale: [1, len, 1], cast });
}
function geo(mb, g, mat, pos, rot = [0, 0, 0], scale = [1, 1, 1], cast = true) { mb.addGeo(g, mat, { pos, rot, scale, cast }); }
function addM(mb, g, mat, m, cast = true) { const c = g.clone(); c.applyMatrix4(m); mb.addGeo(c, mat, { cast }); c.dispose(); }
function decal(mb, mat, x, y, z, w, h, rotY = 0) { mb.addGeo(new THREE.PlaneGeometry(w, h), mat, { pos: [x, y, z], rot: [0, rotY, 0], cast: false }); }
function floorDecal(mb, mat, x, y, z, w, d) { mb.addGeo(new THREE.PlaneGeometry(w, d), mat, { pos: [x, y, z], rot: [-HP, 0, 0], cast: false, receive: true }); }
function textMat(text, { fg = '#ffffff', bg = 'rgba(0,0,0,0)', w = 512, h = 128, font = 'bold 96px Arial' } = {}) {
  return lm(`txt|${text}|${fg}|${bg}|${w}|${h}|${font}`, () => new THREE.MeshStandardMaterial({
    map: T.label(text, { w, h, fg, bg, font }), transparent: true, roughness: 0.7, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  }));
}

// ------------------------------------------------------------------------------------------------
// Hull
// ------------------------------------------------------------------------------------------------
// Loft a band of the hull surface between y0(z) and y1(z), offset horizontally by `off`.
function hullBand(mb, y0f, y1f, rows, mat, { off = 0, inward = false, z0 = -Infinity, z1 = Infinity } = {}) {
  const Z = STATIONS.filter((z) => z >= z0 && z <= z1);
  const nR = rows + 1;
  for (const side of [1, -1]) {
    const pos = [], uv = [], idx = [];
    for (const z of Z) {
      const ya = y0f(z), yb = y1f(z);
      for (let j = 0; j < nR; j++) {
        const y = ya + ((yb - ya) * j) / rows;
        pos.push(Math.max(0, hullX(z, y) + off) * side, y, z);
        uv.push(z / 3, y / 3);
      }
    }
    const outward = side > 0;
    const flip = inward ? !outward : outward;
    for (let i = 0; i < Z.length - 1; i++) for (let j = 0; j < rows; j++) {
      const a = i * nR + j, b = (i + 1) * nR + j, c = (i + 1) * nR + j + 1, d = i * nR + j + 1;
      if (flip) idx.push(a, d, b, b, d, c); else idx.push(a, b, d, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    mb.addGeo(g, mat, {});
    g.dispose();
  }
}

// Horizontal ribbon following the hull (cap rail), between offsets oA (outer) and oB (inner) at y(z)
function hullCap(mb, yf, oA, oB, mat) {
  for (const side of [1, -1]) {
    const pos = [], uv = [], idx = [];
    for (const z of STATIONS) {
      const y = yf(z);
      pos.push(Math.max(0, hullX(z, y) + oA) * side, y, z, Math.max(0, hullX(z, y) + oB) * side, y, z);
      uv.push(0, z / 2, 0.3, z / 2);
    }
    for (let i = 0; i < STATIONS.length - 1; i++) {
      const a = i * 2, b = (i + 1) * 2, d = i * 2 + 1, c = (i + 1) * 2 + 1;
      if (side > 0) idx.push(a, d, b, b, d, c); else idx.push(a, b, d, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    mb.addGeo(g, mat, {});
    g.dispose();
  }
}

// Text that hugs the hull side (one merged mesh per side)
function hullText(mb, text, zA, zB, yA, yB, fg = '#f2efe6', px = 104) {
  const mat = textMat(text, { fg, w: 1024, h: 128, font: `bold ${px}px Arial` });
  const N = 24;
  for (const side of [1, -1]) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const z = zA + ((zB - zA) * i) / N;
      const u = side > 0 ? (zB - z) / (zB - zA) : (z - zA) / (zB - zA);
      for (const [y, v] of [[yA, 0], [yB, 1]]) { pos.push((hullX(z, y) + 0.05) * side, y, z); uv.push(u, v); }
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2, d = i * 2 + 1, b = (i + 1) * 2, c = (i + 1) * 2 + 1;
      if (side > 0) idx.push(a, d, b, b, d, c); else idx.push(a, b, d, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    mb.addGeo(g, mat, { cast: false });
    g.dispose();
  }
}

function buildHull(mb, L) {
  // outside: red antifouling / white boot-top / navy topsides / white sheer line / navy bulwark
  hullBand(mb, yBot, () => -6.6, 6, L.anti);
  hullBand(mb, () => -6.6, () => -6.3, 1, L.boot);
  hullBand(mb, () => -6.3, () => -0.5, 8, L.hull);
  hullBand(mb, () => -0.5, () => -0.18, 1, L.boot);
  hullBand(mb, () => -0.18, yTop, 4, L.hull);
  // inside face of the bulwark + cap rail
  hullBand(mb, yDeck, yTop, 2, L.bulIn, { off: -BW, inward: true });
  hullCap(mb, yTop, 0.03, -BW - 0.04, L.cap);

  // transom (flat stern at z = 60)
  const zt = 60;
  const sec = (ya, yb, n) => {
    const pts = [];
    for (let j = 0; j <= n; j++) { const y = ya + ((yb - ya) * j) / n; pts.push(new THREE.Vector2(hullX(zt, y), y)); }
    for (let j = n; j >= 0; j--) { const y = ya + ((yb - ya) * j) / n; pts.push(new THREE.Vector2(-hullX(zt, y), y)); }
    return new THREE.ShapeGeometry(new THREE.Shape(pts));
  };
  const tAnti = sec(yBot(zt), -6.6, 3), tBoot = sec(-6.6, -6.3, 1), tHull = sec(-6.3, yTop(zt), 10);
  for (const [g, m] of [[tAnti, L.anti], [tBoot, L.boot], [tHull, L.hull]]) {
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3);
    mb.addGeo(g, m, { pos: [0, 0, zt] }); g.dispose();
  }
  decal(mb, textMat('CROSSFIRE', { w: 1024, h: 160, font: 'bold 120px Arial', fg: '#f2efe6' }), 0, 0.9, zt + 0.04, 9, 1.4);
  decal(mb, textMat('PANAMA', { w: 512, h: 128, font: 'bold 90px Arial', fg: '#f2efe6' }), 0, -0.7, zt + 0.04, 4.2, 1.05);

  // bulbous bow breaking the surface
  const bulb = geoC('bulb', () => new THREE.SphereGeometry(1, 20, 14));
  geo(mb, bulb, L.anti, [0, -10.2, -55.2], [0, 0, 0], [2.1, 2.7, 4.6]);

  // ship name on the bow (both sides) + Chinese name on the quarter
  hullText(mb, 'CROSSFIRE', -55.2, -45.2, 0.75, 2.0);
  hullText(mb, '运输船 · CF TRANSPORT', 29, 43, -2.25, -1.25, '#e8e4d8', 70);

  // hawse pipes + stowed anchors (per side)
  for (const side of [1, -1]) {
    const za = -53.2;
    const hx = (y) => (hullX(za, y) + 0.05) * side;
    // hull tangent yaw at the anchor
    const dz = 0.5, slope = (hullX(za + dz, -1) - hullX(za - dz, -1)) / (2 * dz);
    const yaw = Math.atan2(side, -slope * side);
    const ring = geoC('hawseRing', () => new THREE.TorusGeometry(0.55, 0.14, 8, 20));
    geo(mb, ring, L.darkGrey, [hx(-0.4), -0.4, za], [0, yaw, 0]);
    geo(mb, geoC('hawseHole', () => new THREE.CircleGeometry(0.5, 16)), L.black, [hx(-0.4) + 0.01 * side, -0.4, za], [0, yaw, 0]);
    // anchor: shank, crown, flukes
    const ax = hx(-2.2) + 0.12 * side;
    rod(mb, [hx(-0.7) + 0.12 * side, -0.7, za], [hx(-3.4) + 0.12 * side, -3.4, za], 0.14, L.anchor, 8);
    vbox(mb, hx(-3.7) + 0.15 * side, -3.95, za, 0.35, 0.5, 1.0, L.anchor, { rotY: yaw - HP });
    for (const f of [-1, 1]) rod(mb, [hx(-3.7) + 0.15 * side, -3.8, za], [hx(-2.6) + 0.2 * side, -2.6, za + f * 1.2], 0.17, L.anchor, 6);
    void ax;
  }
  // draught marks (white ticks at bow and stern)
  for (const side of [1, -1]) for (const zz of [-56.6, 57.6]) for (let k = 0; k < 6; k++) {
    const y = -7.6 + k * 0.5;
    vbox(mb, (hullX(zz, y) + 0.02) * side, y, zz, 0.04, 0.12, 0.45, L.boot, { cast: false });
  }
}

// Flat deck surface following the hull outline between z0..z1 at height y
function deckSurface(mb, z0, z1, y, mat) {
  const zs = STATIONS.filter((z) => z > z0 && z < z1 && hullX(z, y) - BW > 0.05);
  zs.unshift(z0); zs.push(z1);
  const w = (z) => Math.max(0.0, hullX(z, y) - BW + 0.03);
  const pts = [];
  if (w(z0) < 0.05) zs.shift();
  for (const z of zs) pts.push(new THREE.Vector2(w(z), -z));
  for (let i = zs.length - 1; i >= 0; i--) pts.push(new THREE.Vector2(-w(zs[i]), -zs[i]));
  if (w(z0) < 0.05) pts.push(new THREE.Vector2(0, -(z0 + 0.2)));
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
  mb.addGeo(g, mat, { pos: [0, y, 0], rot: [-HP, 0, 0], cast: false });
  g.dispose();
}

// ------------------------------------------------------------------------------------------------
// Decks, colliders, boundaries
// ------------------------------------------------------------------------------------------------
function buildDecks(mb, L) {
  deckSurface(mb, -40, 40, 0, L.deck);
  deckSurface(mb, 40, 60, DECK_HI, L.deck);
  deckSurface(mb, -60.5, -40, DECK_HI, L.deck);

  // main deck + poop colliders
  mb.collider([-13.4, -1, -40], [13.4, 0, 40], 'metal');
  mb.collider([-13.2, -1, 40], [13.2, DECK_HI, 60.5], 'metal');
  // forecastle: solid stepped slabs following the taper
  for (let z = -60.5; z < -40; ) {
    const step = z < -54 ? 0.5 : 1;
    const zb = Math.min(-40, z + step);
    const outer = Math.max(hwi(z), hwi(zb)) + 0.2;
    mb.collider([-outer, -1, z], [outer, DECK_HI, zb], 'metal');
    z = zb;
  }

  // invisible boundary walls (just inside the bulwark)
  const wall = (za, zb, y0) => {
    const inner = Math.max(0, Math.min(hwi(za), hwi(zb)));
    mb.collider([inner, y0, za], [inner + 2, WALL_TOP, zb], 'metal');
    mb.collider([-inner - 2, y0, za], [-inner, WALL_TOP, zb], 'metal');
  };
  for (let z = -60.5; z < -40; ) { const step = z < -54 ? 0.5 : 1; const zb = Math.min(-40, z + step); wall(z, zb, DECK_HI); z = zb; }
  for (let z = -40; z < -30; z += 1) wall(z, z + 1, 0);
  wall(-30, 46.5, 0);
  mb.collider([-2.5, 0, -62.5], [2.5, WALL_TOP, -60.3], 'metal');

  // forecastle front wall (z = -40) and poop front wall (z = 40) — visual faces of the solid slabs
  for (const k of [1, -1]) {
    const zf = -40 * k;              // k=1: forecastle face at -40 (faces +z); k=-1: poop face at +40 (faces -z)
    const hw = hwi(zf + (k > 0 ? -0.2 : 0.2)) - 0.02;
    vbox(mb, 0, 0, zf - 0.15 * k, hw * 2, DECK_HI, 0.3, L.white, { tile: 2 });
    vbox(mb, 0, DECK_HI - 0.16, zf + 0.012 * k, hw * 2, 0.16, 0.02, L.hazard, { cast: false, tile: 0.8 });
    // doors + portholes on the face
    for (const sx of [-1, 1]) {
      const dx = sx * 5.6;
      vbox(mb, dx, 0, zf + 0.04 * k, 1.2, 2.05, 0.08, L.darkGrey);
      vbox(mb, dx, 0.05, zf + 0.07 * k, 1.0, 1.9, 0.04, L.grey);
      geo(mb, geoC('porthole', () => new THREE.CylinderGeometry(0.17, 0.17, 0.06, 14)), L.glass, [dx, 1.55, zf + 0.1 * k], [HP, 0, 0]);
      vbox(mb, dx + sx * 0.38, 0.95, zf + 0.1 * k, 0.05, 0.25, 0.06, L.steel, { cast: false });
      for (const px of [7.6, 3.4]) {
        geo(mb, geoC('portRing', () => new THREE.TorusGeometry(0.22, 0.04, 6, 16)), L.steel, [sx * px, 1.45, zf + 0.02 * k], [0, 0, 0]);
        geo(mb, geoC('portGlass', () => new THREE.CircleGeometry(0.2, 14)), L.glass, [sx * px, 1.45, zf + 0.015 * k], [0, k > 0 ? 0 : PI, 0]);
      }
    }
  }

  // stairs from the main deck up to the forecastle (blue) and poop deck (red)
  for (const k of [1, -1]) {
    const zFace = -40 * k;
    const zFar = zFace + 5 * k;                      // stair foot
    const z0 = Math.min(zFace, zFar), z1 = Math.max(zFace, zFar);
    const dir = k > 0 ? -1 : 1;                      // rises toward the raised deck
    for (const [x0, x1] of [[-11.6, -9.2], [-1.6, 1.6], [9.2, 11.6]]) stairsR(mb, L, x0, z0, x1, z1, 0, DECK_HI, 'z', dir);
    // railings along the raised-deck edge between the stair openings
    const zr = zFace - 0.06 * k;
    const edge = hwi(zFace - 0.3 * k) - 0.05;
    for (const [a, b] of [[-edge, -11.6], [-9.2, -1.6], [1.6, 9.2], [11.6, edge]]) {
      if (b - a > 0.3) mb.railing(a, zr, b, zr, DECK_HI, { material: L.rail });
    }
  }
}

// Stairs with stringers and sloped hand rails
function stairsR(mb, L, x0, z0, x1, z1, y0, y1, axis, dir, { rails = [true, true] } = {}) {
  mb.stairs(x0, z0, x1, z1, y0, y1, axis, dir, L.plate, { mat: 'metal', tile: 1 });
  const lowAt = dir > 0 ? (axis === 'z' ? z0 : x0) : (axis === 'z' ? z1 : x1);
  const highAt = dir > 0 ? (axis === 'z' ? z1 : x1) : (axis === 'z' ? z0 : x0);
  const sides = axis === 'z' ? [x0, x1] : [z0, z1];
  sides.forEach((s, i) => {
    const P = (along, y) => (axis === 'z' ? [s, y, along] : [along, y, s]);
    // stringer (sloped plate)
    rod(mb, P(lowAt, y0 + 0.12), P(highAt, y1 - 0.05), 0.07, L.yellow, 4);
    if (!rails[i]) return;
    rod(mb, P(lowAt, y0 + 1.0), P(highAt, y1 + 1.0), 0.03, L.rail, 6);
    rod(mb, P(lowAt, y0 + 0.5), P(highAt, y1 + 0.5), 0.022, L.rail, 6);
    for (const t of [0, 0.5, 1]) {
      const a = lowAt + (highAt - lowAt) * t, y = y0 + (y1 - y0) * t;
      rod(mb, P(a, y), P(a, y + 1.0), 0.028, L.rail, 6);
    }
  });
}

// ------------------------------------------------------------------------------------------------
// Props
// ------------------------------------------------------------------------------------------------
// Wooden crate with cached materials (mapkit's crate() makes a new frame material per call)
function crate(mb, L, x, y, z, s = 1.2, { rotY = 0, collide = true } = {}) {
  const g = new THREE.Group();
  const box = geoC(`crateBox${s}`, () => { const b = new THREE.BoxGeometry(s * 0.96, s * 0.96, s * 0.96); return b; });
  g.add(new THREE.Mesh(box, L.crate).translateY(s / 2));
  const bw = s * 0.1;
  const ev = geoC(`crateV${s}`, () => new THREE.BoxGeometry(bw, s, bw));
  const eh = geoC(`crateH${s}`, () => new THREE.BoxGeometry(s, bw, bw));
  const ed = geoC(`crateD${s}`, () => new THREE.BoxGeometry(bw, bw, s));
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    g.add(new THREE.Mesh(ev, L.frameWood).translateX(a * (s / 2 - bw / 2)).translateZ(b * (s / 2 - bw / 2)).translateY(s / 2));
    g.add(new THREE.Mesh(eh, L.frameWood).translateY(a > 0 ? s - bw / 2 : bw / 2).translateZ(b * (s / 2 - bw / 2)));
    g.add(new THREE.Mesh(ed, L.frameWood).translateY(a > 0 ? s - bw / 2 : bw / 2).translateX(b * (s / 2 - bw / 2)));
  }
  const br = geoC(`crateBr${s}`, () => new THREE.BoxGeometry(s * 1.2, bw * 0.9, bw * 0.5));
  for (const sg of [1, -1]) { const m = new THREE.Mesh(br, L.frameWood); m.position.set(0, s / 2, sg * (s / 2 + bw * 0.1)); m.rotation.z = (PI / 4) * sg; g.add(m); }
  g.position.set(x, y, z); g.rotation.y = rotY;
  mb.mergeGroup(g);
  if (collide) {
    const h = s * 0.5 * (Math.abs(Math.cos(rotY)) + Math.abs(Math.sin(rotY)));
    mb.collider([x - h, y, z - h], [x + h, y + s, z + h], 'wood');
  }
}

// Shipping container wrapper. along:'z' (longitudinal) | 'x'. door: +1 doors toward -z (along z) / +x (along x).
const LOGO_FG = { '#cfc8b6': '#24415e' };
function cont(mb, x, y, z, { len = 6.06, color, along = 'z', door = 1, logo = null }) {
  const rotY = along === 'z' ? HP : 0;
  mb.container(x, y, z, { len, color, rotY, seed: 3, doorEnd: door, logo: null });
  if (logo) {
    const fg = LOGO_FG[color] || '#f0efe8';
    const mat = textMat(logo, { fg, w: 1024, h: 256, font: 'bold 128px Arial' });
    const w = Math.min(len * 0.66, 7.2), h = w / 4;
    for (const sg of [1, -1]) {
      if (along === 'z') decal(mb, mat, x + sg * 1.237, y + CH * 0.6, z, w, h, sg * HP);
      else decal(mb, mat, x, y + CH * 0.6, z + sg * 1.237, w, h, sg > 0 ? 0 : PI);
    }
  }
  return { W: 2.44, H: CH, L: len };
}

// Lashing rods at a container end (crossed X from hatch to top corner castings)
function lashing(mb, L, x, yBase, zEnd, outward) {
  const zo = zEnd + outward * 0.05;
  for (const sg of [-1, 1]) {
    rod(mb, [x + sg * 0.95, yBase + 0.02, zEnd + outward * 0.55], [x - sg * 1.1, yBase + CH - 0.1, zo], 0.022, L.steel, 5);
    geo(mb, geoC('turnb', () => new THREE.CylinderGeometry(0.045, 0.045, 0.35, 6)), L.yellow, [x + sg * 0.9, yBase + 0.35, zEnd + outward * 0.48], [outward * 0.45, 0, 0]);
  }
}

// Walk-in container with doors swung open (cover / peek spot). Along z; doorDir -1 => open end at -z.
function hollowCont(mb, L, x, y, z, { len = 6.06, color, doorDir = -1, logo = null }) {
  const W = 2.44, H = CH, t = 0.06;
  const body = M.container(color, 3);
  const frame = M.paintedSteel(new THREE.Color(color).multiplyScalar(0.7).getStyle(), 0.5);
  const inner = M.paintedSteel(new THREE.Color(color).multiplyScalar(0.55).getStyle(), 0.6);
  const z0 = z - len / 2, z1 = z + len / 2, zOpen = doorDir < 0 ? z0 : z1, zClosed = doorDir < 0 ? z1 : z0;
  // walls (outer corrugated material; colliders = the wall boxes)
  for (const sg of [-1, 1]) {
    mb.box(x + sg * (W / 2 - t / 2), y, z, t, H, len, body, { tile: 4 });
    vbox(mb, x + sg * (W / 2 - t - 0.01), y + 0.12, z, 0.02, H - 0.3, len - 0.2, inner, { cast: false });
  }
  mb.box(x, y, zClosed - (doorDir < 0 ? t / 2 : -t / 2), W, H, t, body, { tile: 4 });
  mb.box(x, y + H - 0.08, z, W, 0.08, len, body, { nav: false, tile: 4 });   // roof hangs over the interior floor
  mb.box(x, y, z, W - 0.12, 0.08, len - 0.08, L.wood, { mat: 'wood', tile: 2 });  // plywood floor (step up 0.08)
  vbox(mb, x, y + H - 0.12, z, W - 0.14, 0.03, len - 0.2, inner, { cast: false });
  // frame: corner posts, rails, castings
  for (const zz of [z0 + 0.085, z1 - 0.085]) for (const sg of [-1, 1]) {
    vbox(mb, x + sg * (W / 2 - 0.085), y, zz, 0.18, H, 0.18, frame);
    vbox(mb, x + sg * (W / 2 - 0.085), y + H - 0.12, zz, 0.2, 0.12, 0.2, L.darkGrey);
    vbox(mb, x + sg * (W / 2 - 0.085), y, zz, 0.2, 0.12, 0.2, L.darkGrey);
  }
  for (const yy of [y, y + H - 0.16]) for (const sg of [-1, 1]) vbox(mb, x + sg * (W / 2 - 0.08), yy, z, 0.17, 0.16, len, frame);
  vbox(mb, x, y + H - 0.3, zOpen, W, 0.3, 0.16, frame);           // door header
  vbox(mb, x, y, zOpen, W, 0.14, 0.16, frame);                    // door sill
  // open doors (~100 degrees), lock bars outside
  const dl = (W - 0.32) / 2, dh = H - 0.32;
  const leaf = geoC('doorLeaf', () => new THREE.BoxGeometry(dl, dh, 0.05));
  const bar = geoC('doorBar', () => new THREE.CylinderGeometry(0.022, 0.022, dh - 0.1, 6));
  for (const sg of [-1, 1]) {
    const hx = x + sg * (W / 2 - 0.02), hz = zOpen + doorDir * 0.03;
    const a = 10 * PI / 180;
    const dx = sg * Math.sin(a), dz = doorDir * Math.cos(a);
    const rotY = Math.atan2(-dz, dx);
    const cx = hx + dx * dl / 2, cz = hz + dz * dl / 2;
    geo(mb, leaf, body, [cx, y + 0.16 + dh / 2, cz], [0, rotY, 0]);
    for (const f of [0.3, 0.7]) geo(mb, bar, L.steel, [hx + dx * dl * f + sg * 0.045, y + 0.16 + dh / 2, hz + dz * dl * f]);
    const ex = hx + dx * dl, ez = hz + dz * dl;
    mb.collider([Math.min(hx, ex) - 0.04, y, Math.min(hz, ez) - 0.04], [Math.max(hx, ex) + 0.04, y + H - 0.15, Math.max(hz, ez) + 0.04], 'metal');
  }
  if (logo) {
    const mat = textMat(logo, { fg: LOGO_FG[color] || '#f0efe8', w: 1024, h: 256, font: 'bold 128px Arial' });
    for (const sg of [1, -1]) decal(mb, mat, x + sg * (W / 2 + 0.007), y + CH * 0.6, z, len * 0.66, len * 0.165, sg * HP);
  }
}

function barrel(mb, x, y, z, color, opts = {}) { mb.barrel(x, y, z, { color, ...opts }); }

function bollard(mb, L, x, y, z, along = 'z') {
  const bz = along === 'z';
  vbox(mb, x, y, z, bz ? 0.55 : 1.5, 0.08, bz ? 1.5 : 0.55, L.darkGrey);
  const post = geoC('bollPost', () => new THREE.CylinderGeometry(0.19, 0.21, 0.55, 14));
  const capG = geoC('bollCap', () => new THREE.CylinderGeometry(0.26, 0.26, 0.06, 14));
  for (const sg of [-1, 1]) {
    const px = bz ? x : x + sg * 0.45, pz = bz ? z + sg * 0.45 : z;
    geo(mb, post, L.black, [px, y + 0.35, pz]);
    geo(mb, capG, L.black, [px, y + 0.64, pz]);
  }
  mb.collider([x - (bz ? 0.27 : 0.72), y, z - (bz ? 0.72 : 0.27)], [x + (bz ? 0.27 : 0.72), y + 0.67, z + (bz ? 0.72 : 0.27)], 'metal');
}

function ventMushroom(mb, L, x, y, z, h = 1.3) {
  geo(mb, geoC('ventPipe', () => new THREE.CylinderGeometry(0.2, 0.22, 1, 14)), L.white, [x, y + h / 2, z], [0, 0, 0], [1, h, 1]);
  geo(mb, geoC('ventCap', () => new THREE.CylinderGeometry(0.28, 0.46, 0.28, 16)), L.white, [x, y + h + 0.1, z]);
  geo(mb, geoC('ventTop', () => new THREE.CylinderGeometry(0.12, 0.28, 0.12, 16)), L.white, [x, y + h + 0.3, z]);
  geo(mb, geoC('ventFl', () => new THREE.CylinderGeometry(0.3, 0.3, 0.05, 14)), L.darkGrey, [x, y + 0.02, z]);
  mb.collider([x - 0.32, y, z - 0.32], [x + 0.32, y + h + 0.36, z + 0.32], 'metal');
}

function gooseneck(mb, L, x, y, z, k = 1) {
  geo(mb, geoC('gnPipe', () => new THREE.CylinderGeometry(0.1, 0.1, 0.9, 10)), L.white, [x, y + 0.45, z]);
  geo(mb, geoC('gnBend', () => new THREE.TorusGeometry(0.18, 0.1, 8, 12, PI)), L.white, [x + 0.18 * k, y + 0.9, z], [0, 0, 0]);
  geo(mb, geoC('gnPipe2', () => new THREE.CylinderGeometry(0.1, 0.12, 0.3, 10)), L.white, [x + 0.36 * k, y + 0.75, z]);
}

// lifebuoy hanging on the bulwark inner face (nx: normal direction of the wall, +1 faces +x)
function lifebuoy(mb, L, x, y, z, nx) {
  const tor = geoC('buoy', () => new THREE.TorusGeometry(0.3, 0.07, 8, 20));
  geo(mb, tor, L.orange, [x, y, z], [0, HP, 0]);
  for (let i = 0; i < 4; i++) {
    const a = (i * PI) / 2 + PI / 4;
    vbox(mb, x, y + Math.sin(a) * 0.3 - 0.06, z + Math.cos(a) * 0.3, 0.17, 0.12, 0.08, L.white, { cast: false });
  }
  vbox(mb, x - nx * 0.06, y + 0.3, z, 0.06, 0.12, 0.1, L.darkGrey, { cast: false });
}

// Red fire station cabinet with hose reel (against a wall whose inside normal is nx)
function fireStation(mb, L, x, z, nx) {
  mb.box(x, 0, z, 0.42, 1.5, 1.1, L.red, { mat: 'metal' });
  decal(mb, textMat('FIRE 消防', { fg: '#ffffff', w: 512, h: 128, font: 'bold 80px Arial' }), x + nx * 0.215, 1.22, z, 0.95, 0.24, nx * HP);
  vbox(mb, x + nx * 0.215, 0.25, z, 0.02, 0.8, 0.9, L.darkGrey, { cast: false });
  geo(mb, geoC('reel', () => new THREE.TorusGeometry(0.22, 0.06, 8, 18)), L.red, [x + nx * 0.3, 0.75, z + 0.85], [0, HP, 0]);
  geo(mb, geoC('reelHub', () => new THREE.CylinderGeometry(0.1, 0.1, 0.14, 10)), L.steel, [x + nx * 0.3, 0.75, z + 0.85], [0, 0, HP]);
  geo(mb, geoC('hydr', () => new THREE.CylinderGeometry(0.08, 0.08, 0.6, 10)), L.red, [x + nx * 0.05, 0, z - 0.8]);
  geo(mb, geoC('hydrW', () => new THREE.TorusGeometry(0.1, 0.02, 6, 12)), L.steel, [x + nx * 0.05, 0.66, z - 0.8], [HP, 0, 0]);
}

// Deck locker / paint store
function locker(mb, L, x0, z0, x1, z1, h, mat) {
  mb.boxMM([x0, 0, z0], [x1, h, z1], mat, { mat: 'metal' });
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
  vbox(mb, cx, h, cz, w + 0.08, 0.06, d + 0.08, L.darkGrey);
  // door on the inboard face
  const inboardX = Math.abs(x0) < Math.abs(x1) ? x0 : x1, sg = inboardX === x0 ? -1 : 1;
  vbox(mb, inboardX + sg * 0.02, 0.1, cz, 0.04, h - 0.3, d * 0.55, L.grey);
  vbox(mb, inboardX + sg * 0.05, h * 0.5, cz + d * 0.18, 0.04, 0.2, 0.05, L.steel, { cast: false });
  decal(mb, textMat('PAINT STORE', { fg: '#1a1a1a', bg: '#e8d23a', w: 512, h: 96, font: 'bold 64px Arial' }), inboardX + sg * 0.045, h - 0.35, cz, d * 0.6, d * 0.1, sg * HP);
}

// Cargo net draped over a box region
function cargoNet(mb, L, x0, z0, x1, z1, yTopN, yBase) {
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    rod(mb, [x, yTopN + 0.03, z0], [x, yTopN + 0.03, z1], 0.015, L.rope, 4, false);
    rod(mb, [x0, yTopN + 0.03, z], [x1, yTopN + 0.03, z], 0.015, L.rope, 4, false);
    rod(mb, [x, yTopN + 0.03, z0], [x + 0.1, yBase + 0.02, z0 - 0.35], 0.015, L.rope, 4, false);
    rod(mb, [x, yTopN + 0.03, z1], [x - 0.1, yBase + 0.02, z1 + 0.35], 0.015, L.rope, 4, false);
  }
}

function chain(mb, L, a, b) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A); const len = d.length(); d.normalize();
  const side = new THREE.Vector3().crossVectors(d, _up); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); side.normalize();
  const upv = new THREE.Vector3().crossVectors(side, d).normalize();
  const link = geoC('link', () => new THREE.TorusGeometry(0.07, 0.022, 5, 10).scale(1, 1.6, 1));
  const n = Math.floor(len / 0.19);
  const xa = new THREE.Vector3(), za = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    xa.copy(i % 2 ? side : upv);
    za.crossVectors(xa, d);
    c.copy(A).addScaledVector(d, ((i + 0.5) * len) / n);
    _mx.makeBasis(xa, d, za).setPosition(c);
    addM(mb, link, L.chain, _mx, false);
  }
}

// ------------------------------------------------------------------------------------------------
// Forecastle (blue end)
// ------------------------------------------------------------------------------------------------
function buildForecastle(mb, L) {
  const Y = DECK_HI;
  // windlasses + anchor chains
  for (const sx of [-1, 1]) {
    const x = sx * 3.2, z = -51.5;
    vbox(mb, x, Y, z, 2.0, 0.15, 2.4, L.darkGrey);
    mb.box(x - sx * 0.35, Y + 0.15, z + 0.4, 1.0, 0.9, 1.3, L.machine);                 // motor housing
    geo(mb, geoC('gypsy', () => new THREE.CylinderGeometry(0.55, 0.55, 0.38, 18)), L.black, [x + sx * 0.25, Y + 0.85, z - 0.75], [0, 0, HP]);
    geo(mb, geoC('gypsyF', () => new THREE.CylinderGeometry(0.66, 0.66, 0.06, 18)), L.machine, [x + sx * 0.05, Y + 0.85, z - 0.75], [0, 0, HP]);
    geo(mb, geoC('gypsyF', () => new THREE.CylinderGeometry(0.66, 0.66, 0.06, 18)), L.machine, [x + sx * 0.45, Y + 0.85, z - 0.75], [0, 0, HP]);
    geo(mb, geoC('warpHead', () => new THREE.CylinderGeometry(0.28, 0.34, 0.5, 14)), L.steel, [x - sx * 0.95, Y + 0.85, z - 0.75], [0, 0, HP]);
    geo(mb, geoC('brakeWheel', () => new THREE.TorusGeometry(0.28, 0.035, 6, 16)), L.red, [x - sx * 0.35, Y + 1.25, z + 1.15], [0, 0, 0]);
    rod(mb, [x - sx * 0.35, Y + 0.6, z + 1.1], [x - sx * 0.35, Y + 1.25, z + 1.15], 0.04, L.steel, 6);
    mb.collider([x - 1.05, Y, z - 1.25], [x + 1.05, Y + 1.25, z + 1.2], 'metal');
    // chain from gypsy forward to the deck hawse pipe, and aft down the spurling pipe
    const hx = sx * 4.25, hz = -56.0;
    chain(mb, L, [x + sx * 0.25, Y + 1.35, z - 0.85], [hx, Y + 0.08, hz + 0.3]);
    chain(mb, L, [x + sx * 0.25, Y + 0.4, z - 0.2], [x + sx * 0.25, Y + 1.35, z - 0.65]);
    geo(mb, geoC('dHawse', () => new THREE.CylinderGeometry(0.42, 0.5, 0.35, 16)), L.darkGrey, [hx, Y, hz]);
    geo(mb, geoC('dHawseIn', () => new THREE.CircleGeometry(0.32, 14)), L.black, [hx, Y + 0.355, hz], [-HP, 0, 0]);
    vbox(mb, hx * 0.98, Y, hz + 1.0, 0.55, 0.45, 0.8, L.machine);                         // bow stopper
    mb.collider([hx - 0.5, Y, hz - 0.5], [hx + 0.5, Y + 0.45, hz + 1.4], 'metal');
    geo(mb, geoC('spurl', () => new THREE.CylinderGeometry(0.25, 0.3, 0.4, 12)), L.darkGrey, [x + sx * 0.25, Y, z - 0.2]);
  }
  // mooring winches
  for (const sx of [-1, 1]) {
    const x = sx * 6.6, z = -44.5;
    vbox(mb, x, Y, z, 2.6, 0.12, 1.5, L.darkGrey);
    geo(mb, geoC('mDrum', () => new THREE.CylinderGeometry(0.42, 0.42, 1.3, 16)), L.machine, [x - sx * 0.2, Y + 0.75, z], [0, 0, HP]);
    geo(mb, geoC('mRope', () => new THREE.CylinderGeometry(0.5, 0.5, 1.1, 16)), L.rope, [x - sx * 0.2, Y + 0.75, z], [0, 0, HP]);
    for (const f of [-0.68, 0.68]) geo(mb, geoC('mFl', () => new THREE.CylinderGeometry(0.62, 0.62, 0.06, 16)), L.machine, [x - sx * 0.2 + f, Y + 0.75, z], [0, 0, HP]);
    mb.box(x + sx * 0.95, Y + 0.12, z, 0.7, 0.85, 0.9, L.machine);
    mb.collider([x - 1.3, Y, z - 0.75], [x + 1.3, Y + 1.4, z + 0.75], 'metal');
  }
  // bollards / fairleads
  bollard(mb, L, -10.1, Y, -43.6); bollard(mb, L, 10.1, Y, -43.6);
  bollard(mb, L, -7.7, Y, -49.2); bollard(mb, L, 7.7, Y, -49.2);
  bollard(mb, L, -4.9, Y, -55.0, 'z'); bollard(mb, L, 4.9, Y, -55.0, 'z');
  // foremast with lamp and crosstree
  mb.box(0, Y, -50.5, 1.1, 0.9, 1.1, L.yellow);
  geo(mb, geoC('mast', () => new THREE.CylinderGeometry(0.16, 0.24, 10.5, 12)), L.yellow, [0, Y + 0.9 + 5.25, -50.5]);
  mb.collider([-0.3, Y, -50.8], [0.3, Y + 11, -50.2], 'metal');
  rod(mb, [-1.6, Y + 9.2, -50.5], [1.6, Y + 9.2, -50.5], 0.07, L.yellow);
  rod(mb, [0, Y + 6.5, -50.5], [-1.4, Y + 9.15, -50.5], 0.04, L.yellow); rod(mb, [0, Y + 6.5, -50.5], [1.4, Y + 9.15, -50.5], 0.04, L.yellow);
  for (let yy = Y + 1.2; yy < Y + 8.5; yy += 0.35) rod(mb, [-0.22, yy, -50.25], [0.22, yy, -50.25], 0.015, L.steel, 4, false);
  geo(mb, geoC('mastTop', () => new THREE.SphereGeometry(0.14, 10, 8)), L.lampOn, [0, Y + 11.5, -50.5], [0, 0, 0], [1, 1, 1], false);
  // jack staff with flag at the stem
  geo(mb, geoC('staff', () => new THREE.CylinderGeometry(0.04, 0.06, 5, 8)), L.white, [0, Y + 2.5, -59.0]);
  // bell
  geo(mb, geoC('bell', () => new THREE.CylinderGeometry(0.12, 0.22, 0.32, 14, 1, true)), M.brass(), [0, Y + 2.35, -50.0]);
  // breakwater-ish deck fittings & vents
  ventMushroom(mb, L, -8.6, Y, -46.8, 1.2); ventMushroom(mb, L, 8.6, Y, -46.8, 1.2);
  gooseneck(mb, L, -5.6, Y, -57.0, 1); gooseneck(mb, L, 5.6, Y, -57.0, -1);
  // hazard strips around the hawses / walkway lines on the forecastle
  floorDecal(mb, L.stripe, 0, Y + 0.004, -41.0, 22.5, 0.12);
}

// ------------------------------------------------------------------------------------------------
// Poop deck + accommodation superstructure (red end)
// ------------------------------------------------------------------------------------------------
function rrect(w, d, r) {
  const s = new THREE.Shape(), x = w / 2, y = d / 2;
  s.moveTo(-x + r, -y); s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r); s.lineTo(x, y - r);
  s.quadraticCurveTo(x, y, x - r, y); s.lineTo(-x + r, y); s.quadraticCurveTo(-x, y, -x, y - r); s.lineTo(-x, -y + r);
  s.quadraticCurveTo(-x, -y, -x + r, -y);
  return s;
}

function window_(mb, L, x, y, z, w, h, nx, nz, lit) {
  // frame + glass on a wall facing (nx, nz)
  const rotY = nx !== 0 ? HP : 0;
  const fw = nx !== 0 ? 0.08 : w + 0.16, fd = nx !== 0 ? w + 0.16 : 0.08;
  vbox(mb, x + nx * 0.04, y - 0.08, z + nz * 0.04, fw, h + 0.16, fd, L.whiteDark, { cast: false });
  const gw = nx !== 0 ? 0.04 : w, gd = nx !== 0 ? w : 0.04;
  vbox(mb, x + nx * 0.09, y, z + nz * 0.09, gw, h, gd, lit ? L.glassLit : L.glass, { cast: false });
  void rotY;
}

function buildSuperstructure(mb, L) {
  const X = 10.5, ZF = 42.5, ZA = 46, ZR = 58, Y0 = DECK_HI;
  const lit = (a, b) => ((a * 7 + b * 13) % 6) === 0;

  // ---- colliders ----
  mb.collider([-X, Y0, ZA], [X, 19.8, ZR], 'metal');
  mb.collider([-X, 5.4, ZF], [X, 19.8, ZA], 'metal', { nav: false });        // overhang above the spawn alcove
  for (const sx of [-1, 1]) {
    // side passages closed by a steel wall with a watertight door
    mb.box(sx * 11.62, Y0, 46.15, 2.24, 3.2, 0.3, L.white, { mat: 'metal' });
    mb.collider([sx > 0 ? 10.5 : -12.8, Y0, 46], [sx > 0 ? 12.8 : -10.5, WALL_TOP, 46.3], 'metal');
    vbox(mb, sx * 11.62, Y0 + 0.1, 45.98, 0.9, 1.95, 0.06, L.grey);
    geo(mb, geoC('wtWheel', () => new THREE.TorusGeometry(0.16, 0.025, 6, 14)), L.steel, [sx * 11.62, Y0 + 1.1, 45.93]);
    for (const yy of [0.4, 1.8]) vbox(mb, sx * 11.62 - 0.38, Y0 + yy, 45.96, 0.12, 0.1, 0.05, L.steel, { cast: false });
  }

  // ---- masses ----
  vbox(mb, 0, Y0, (ZA + ZR) / 2, 2 * X, 5.6 - Y0, ZR - ZA, L.white, { tile: 7 });          // A deck
  vbox(mb, 0, 5.6, (ZF + ZR) / 2, 2 * X, 14.0 - 5.6, ZR - ZF, L.white, { tile: 7 });       // B-D decks
  vbox(mb, 0, 14.0, (ZF + 50) / 2, 19, 5.6, 50 - ZF, L.white, { tile: 7 });               // E deck + bridge
  vbox(mb, 0, 14.0, 54.25, 9, 2.8, 7.5, L.whiteDark, { tile: 7 });                         // engine casing
  vbox(mb, 0, 5.4, (ZF + ZA) / 2, 2 * X, 0.2, ZA - ZF, L.whiteDark);                       // alcove ceiling
  for (const sx of [-1, 1]) mb.box(sx * 5.5, Y0, 43.0, 0.45, 3.0, 0.45, L.whiteDark, { mat: 'metal' });  // pillars

  // ---- ledges / external decks with railings ----
  for (const y of [5.6, 8.4, 11.2, 14.0]) {
    vbox(mb, 0, y - 0.18, ZF - 0.4, 2 * X + 1.6, 0.18, 0.8, L.whiteDark);
    mb.railing(-X - 0.75, ZF - 0.76, X + 0.75, ZF - 0.76, y, { collide: false, material: L.white, height: 1.0, posts: 1.8 });
    for (const sx of [-1, 1]) {
      vbox(mb, sx * (X + 0.4), y - 0.18, (ZF - 0.8 + 49.5) / 2, 0.8, 0.18, 49.5 - ZF + 0.8, L.whiteDark);
      mb.railing(sx * (X + 0.76), ZF - 0.76, sx * (X + 0.76), 49.5, y, { collide: false, material: L.white, height: 1.0, posts: 1.8 });
    }
  }

  // ---- windows ----
  const fx = [-8.4, -6.0, -3.6, -1.2, 1.2, 3.6, 6.0, 8.4];
  [5.6, 8.4, 11.2].forEach((y, li) => {
    fx.forEach((x, i) => window_(mb, L, x, y + 1.0, ZF, 1.3, 1.0, 0, -1, lit(i, li)));
    for (const sx of [-1, 1]) for (let i = 0, z = 44.2; z < 57.5; z += 2.4, i++) window_(mb, L, sx * X, y + 1.0, z, 1.2, 0.95, sx, 0, lit(i + 3, li + sx));
  });
  [-6.6, -3.3, 3.3, 6.6].forEach((x, i) => window_(mb, L, x, 15.0, ZF, 1.3, 1.0, 0, -1, lit(i, 9)));
  for (const sx of [-1, 1]) {
    for (let i = 0, z = 44.0; z < 49.5; z += 2.4, i++) window_(mb, L, sx * 9.5, 15.0, z, 1.2, 0.95, sx, 0, lit(i, 11 + sx));
    for (let z = 47.6; z < 57.5; z += 2.4) window_(mb, L, sx * X, 3.6, z, 1.1, 0.9, sx, 0, false);
  }
  // bridge: continuous window band + mullions + sun visor
  vbox(mb, 0, 17.45, ZF - 0.05, 18.4, 1.55, 0.1, L.glass, { cast: false });
  for (let i = -7; i <= 7; i++) vbox(mb, i * 1.22, 17.45, ZF - 0.12, 0.08, 1.55, 0.06, L.white, { cast: false });
  for (const sx of [-1, 1]) {
    vbox(mb, sx * 9.55, 17.45, 46.2, 0.1, 1.55, 6.8, L.glass, { cast: false });
    for (let z = 43.2; z < 49.6; z += 1.3) vbox(mb, sx * 9.61, 17.45, z, 0.06, 1.55, 0.08, L.white, { cast: false });
  }
  vbox(mb, 0, 19.25, ZF - 0.55, 19.4, 0.1, 1.1, L.white);
  // A deck front (inside the alcove): doors, portholes, safety sign, fire extinguishers
  for (const sx of [-1, 1]) {
    vbox(mb, sx * 3.2, Y0, ZA - 0.06, 1.15, 2.15, 0.1, L.darkGrey);
    vbox(mb, sx * 3.2, Y0 + 0.05, ZA - 0.1, 0.95, 2.0, 0.04, L.grey);
    vbox(mb, sx * 3.2, Y0 + 1.35, ZA - 0.13, 0.5, 0.4, 0.02, L.glass, { cast: false });
    vbox(mb, sx * 3.2 - sx * 0.35, Y0 + 1.0, ZA - 0.14, 0.05, 0.25, 0.05, L.steel, { cast: false });
    for (const px of [6.8, 8.8]) {
      geo(mb, geoC('portRing', () => new THREE.TorusGeometry(0.22, 0.04, 6, 16)), L.steel, [sx * px, Y0 + 1.7, ZA - 0.02]);
      geo(mb, geoC('portGlass', () => new THREE.CircleGeometry(0.2, 14)), L.glass, [sx * px, Y0 + 1.7, ZA - 0.015], [0, PI, 0]);
    }
    geo(mb, geoC('ext', () => new THREE.CylinderGeometry(0.09, 0.09, 0.55, 10)), L.red, [sx * 4.6, Y0 + 0.5, ZA - 0.14]);
    vbox(mb, sx * 1.6, Y0 + 1.0, ZA - 0.04, 1.0, 0.75, 0.04, L.cap, { cast: false });                // notice boards
  }
  decal(mb, textMat('安全第一  SAFETY FIRST', { fg: '#ffffff', bg: '#1f6b3a', w: 1024, h: 128, font: 'bold 78px Arial' }), 0, Y0 + 2.55, ZA - 0.03, 5.6, 0.7, PI);
  decal(mb, textMat('潜伏者', { fg: '#f0e0d0', bg: 'rgba(120,20,15,0.85)', w: 512, h: 128, font: 'bold 90px Arial' }), 0, Y0 + 1.55, ZA - 0.03, 1.4, 0.35, PI);

  // ---- bridge wings ----
  for (const sx of [-1, 1]) {
    vbox(mb, sx * 12.05, 16.62, 44.15, 5.1, 0.18, 3.3, L.whiteDark);
    vbox(mb, sx * 14.57, 16.8, 44.15, 0.06, 1.1, 3.3, L.white);
    vbox(mb, sx * 12.05, 16.8, 42.53, 5.1, 1.1, 0.06, L.white);
    mb.railing(sx * 9.5, 45.77, sx * 14.6, 45.77, 16.8, { collide: false, material: L.white, height: 1.05 });
    vbox(mb, sx * 14.0, 16.8, 43.2, 0.8, 1.0, 0.6, L.grey);
    for (const z of [42.8, 45.4]) rod(mb, [sx * 10.5, 14.1, z], [sx * 14.3, 16.6, z], 0.07, L.whiteDark, 6);
    vbox(mb, sx * 14.45, 17.7, 43.0, 0.22, 0.3, 0.3, L.darkGrey);
    geo(mb, geoC('navLamp', () => new THREE.SphereGeometry(0.11, 10, 8)), sx < 0 ? L.navRed : L.navGreen, [sx * 14.6, 17.85, 43.0], [0, 0, 0], [1, 1, 1], false);
  }
  // ---- roof, mast, radar, antennas ----
  vbox(mb, 0, 19.6, 46.25, 19.6, 0.2, 8.3, L.whiteDark);
  mb.railing(-9.7, 42.2, 9.7, 42.2, 19.8, { collide: false, material: L.white, height: 0.95, posts: 2 });
  mb.railing(-9.7, 50.3, 9.7, 50.3, 19.8, { collide: false, material: L.white, height: 0.95, posts: 2 });
  for (const sx of [-1, 1]) mb.railing(sx * 9.7, 42.2, sx * 9.7, 50.3, 19.8, { collide: false, material: L.white, height: 0.95, posts: 2 });
  const mz = 47.4;
  for (const sx of [-1, 1]) {
    rod(mb, [sx * 1.6, 19.8, mz - 0.9], [sx * 0.3, 24.0, mz], 0.12, L.yellow, 8);
    rod(mb, [sx * 1.6, 19.8, mz + 0.9], [sx * 0.3, 24.0, mz], 0.12, L.yellow, 8);
  }
  vbox(mb, 0, 23.95, mz, 2.4, 0.12, 1.6, L.yellow);
  mb.railing(-1.2, mz - 0.8, 1.2, mz - 0.8, 24.07, { collide: false, material: L.yellow, height: 0.8, posts: 1.2 });
  geo(mb, geoC('topMast', () => new THREE.CylinderGeometry(0.08, 0.13, 4.2, 10)), L.yellow, [0, 26.15, mz]);
  rod(mb, [-2.6, 26.6, mz], [2.6, 26.6, mz], 0.06, L.yellow);
  geo(mb, geoC('mastTop', () => new THREE.SphereGeometry(0.14, 10, 8)), L.lampOn, [0, 28.35, mz], [0, 0, 0], [1, 1, 1], false);
  for (const sx of [-1, 1]) geo(mb, geoC('mastTop', () => new THREE.SphereGeometry(0.14, 10, 8)), sx < 0 ? L.navRed : L.lampOn, [sx * 2.4, 26.45, mz], [0, 0, 0], [0.7, 0.7, 0.7], false);
  geo(mb, geoC('horn', () => new THREE.CylinderGeometry(0.22, 0.06, 0.7, 10)), L.steel, [0.9, 24.5, mz - 0.4], [HP, 0, 0]);
  for (const [ax, az, h] of [[-8.6, 49.6, 4.5], [-7.6, 49.6, 3.5], [8.6, 49.6, 4.0], [6.2, 43.0, 2.5]]) rod(mb, [ax, 19.8, az], [ax, 19.8 + h, az], 0.025, L.white, 5, false);
  for (const [dx, dz, r] of [[5.6, 48.8, 0.62], [-5.4, 48.9, 0.5]]) {
    vbox(mb, dx, 19.8, dz, 0.5, 0.6, 0.5, L.whiteDark);
    geo(mb, geoC(`dome${r}`, () => new THREE.SphereGeometry(r, 16, 12)), L.white, [dx, 20.4 + r * 0.8, dz]);
  }
  // rotating radar scanners (animated)
  const radar = (x, y, z, len, speed) => {
    const g = new THREE.Group();
    const ped = new THREE.Mesh(geoC('radPed', () => new THREE.CylinderGeometry(0.22, 0.3, 0.5, 12)), L.white);
    ped.position.y = 0.25; ped.castShadow = true; g.add(ped);
    const rot = new THREE.Group(); rot.position.y = 0.6; g.add(rot);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len, 0.22, 0.32), L.white); bar.castShadow = true; rot.add(bar);
    const face = new THREE.Mesh(new THREE.BoxGeometry(len * 0.96, 0.14, 0.02), L.darkGrey); face.position.z = -0.17; rot.add(face);
    g.position.set(x, y, z);
    mb.addObject(g);
    mb.animated.push({ update: (dt, t) => { rot.rotation.y = t * speed; } });
  };
  radar(0, 24.07, mz + 0.1, 3.8, 2.2);
  radar(-3.6, 19.8, 44.3, 2.8, -2.9);

  // ---- funnel ----
  const fz = 54.5;
  const seg = (y0, y1, mat) => {
    const g = new THREE.ExtrudeGeometry(rrect(5.6, 5.8, 1.4), { depth: y1 - y0, bevelEnabled: false, curveSegments: 6 });
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 3, uv.getY(i) / 3);
    mb.addGeo(g, mat, { pos: [0, y0, fz], rot: [-HP, 0, 0] });
    g.dispose();
  };
  seg(16.8, 23.0, L.funnel); seg(23.0, 24.8, L.red); seg(24.8, 26.4, L.black);
  const capG = new THREE.ShapeGeometry(rrect(5.4, 5.6, 1.3));
  mb.addGeo(capG, L.darkGrey, { pos: [0, 26.25, fz], rot: [-HP, 0, 0] }); capG.dispose();
  geo(mb, geoC('exh1', () => new THREE.CylinderGeometry(0.42, 0.42, 1.6, 16)), L.black, [-0.9, 26.0 + 0.8, fz + 0.6]);
  geo(mb, geoC('exh2', () => new THREE.CylinderGeometry(0.3, 0.3, 1.4, 14)), L.black, [1.0, 26.0 + 0.7, fz + 0.4]);
  geo(mb, geoC('exh3', () => new THREE.CylinderGeometry(0.18, 0.18, 1.2, 10)), L.black, [0.3, 26.0 + 0.6, fz - 1.3]);
  for (const sx of [-1, 1]) {
    decal(mb, textMat('CF', { fg: '#ffffff', w: 256, h: 256, font: 'bold 150px Arial' }), sx * 2.815, 23.9, fz, 1.6, 1.6, sx * HP);
    vbox(mb, sx * 2.81, 23.0, fz, 0.02, 0.12, 4.0, L.funnel, { cast: false });
    vbox(mb, sx * 2.81, 24.68, fz, 0.02, 0.12, 4.0, L.funnel, { cast: false });
  }
  rod(mb, [2.9, 16.8, fz + 2.9], [2.9, 26.4, fz + 2.9], 0.02, L.steel, 4, false);   // ladder rails
  // funnel smoke (soft sprites, recycled)
  const smokeMat = new THREE.SpriteMaterial({ map: T.softDot('70,66,62'), transparent: true, depthWrite: false, opacity: 0.3, color: 0x8a847c });
  const puffs = [];
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(smokeMat.clone());
    mb.addObject(s); puffs.push({ s, ph: i / 9 });
  }
  mb.animated.push({
    update: (dt, t) => {
      for (const p of puffs) {
        const f = (t * 0.07 + p.ph) % 1;
        p.s.position.set(-0.4 + f * 3.5, 27.2 + f * 9, fz + 0.5 + f * 14);
        p.s.scale.setScalar(1.4 + f * 7);
        p.s.material.opacity = 0.32 * (1 - f) * Math.min(1, f * 8);
      }
    },
  });

  // ---- lifeboats on davits ----
  for (const sx of [-1, 1]) {
    const bx = sx * 11.95, by = 9.2, bz = 54.2;
    geo(mb, geoC('lbHull', () => new THREE.CapsuleGeometry(1.15, 4.6, 6, 14)), L.orange, [bx, by + 0.85, bz], [HP, 0, 0], [1, 1, 0.72]);
    geo(mb, geoC('lbTop', () => new THREE.CapsuleGeometry(0.95, 3.9, 6, 14)), L.white, [bx, by + 1.3, bz], [HP, 0, 0], [1, 1, 0.7]);
    for (const s2 of [-1, 1]) vbox(mb, bx + s2 * 0.95, by + 1.35, bz, 0.04, 0.22, 3.6, L.glass, { cast: false });
    for (const dz of [-2.8, 2.8]) {
      vbox(mb, sx * 10.75, 8.4, bz + dz, 0.3, 4.3, 0.3, L.white);
      rod(mb, [sx * 10.75, 12.6, bz + dz], [sx * 12.25, 12.9, bz + dz], 0.12, L.white, 6);
      rod(mb, [sx * 12.15, 12.85, bz + dz], [bx, by + 2.0, bz + dz * 0.8], 0.02, L.steel, 4, false);
    }
    // liferaft canisters
    for (const dz of [0, 1.1]) geo(mb, geoC('raft', () => new THREE.CylinderGeometry(0.36, 0.36, 1.25, 14)), L.white, [sx * 10.95, 14.4, 43.6 + dz], [0, 0, HP]);
    vbox(mb, sx * 10.95, 14.0, 44.15, 0.9, 0.04, 2.3, L.darkGrey);
  }
  // stern flag pole + flag on the yardarm
  geo(mb, geoC('sternPole', () => new THREE.CylinderGeometry(0.05, 0.07, 5, 8)), L.white, [0, Y0 + 3.6, 59.3]);

  // ---- poop deck furniture ----
  bollard(mb, L, -11.75, Y0, 43.8); bollard(mb, L, 11.75, Y0, 43.8);
  for (const sx of [-1, 1]) {
    mb.box(sx * 9.4, Y0, 45.45, 1.4, 1.1, 0.8, L.orange, { mat: 'metal' });                   // life jacket boxes
    decal(mb, textMat('LIFE JACKETS', { fg: '#ffffff', w: 512, h: 96, font: 'bold 64px Arial' }), sx * 9.4, Y0 + 0.75, 45.04, 1.2, 0.22, PI);
  }
  floorDecal(mb, L.stripe, 0, Y0 + 0.004, 41.0, 22.5, 0.12);
  floorDecal(mb, L.stripe, 0, Y0 + 0.004, 42.3, 21, 0.08);
}

// ------------------------------------------------------------------------------------------------
// Hatches, containers, cover (point-symmetric layout)
// ------------------------------------------------------------------------------------------------
const CRED = ['#9a2f27', '#c8742a', '#5e2a2e', '#cfc8b6', '#7b8087'];
const CBLU = ['#2f5d8a', '#2d7d7a', '#3d6b45', '#cfc8b6', '#7b8087'];

function hatchCover(mb, L, z0, z1) {
  const zc = (z0 + z1) / 2, d = z1 - z0, W = 15.2;
  mb.box(0, 0, zc, W, HY, d, L.hatch, { tile: 3 });
  // coaming lip, panel joints, cleats, stiffeners
  for (const sx of [-1, 1]) {
    vbox(mb, sx * (W / 2 + 0.03), 0, zc, 0.06, HY + 0.05, d, L.darkGrey, { cast: false });
    for (let z = z0 + 0.8; z < z1 - 0.5; z += 1.6) vbox(mb, sx * (W / 2 + 0.07), 0.04, z, 0.08, HY - 0.08, 0.1, L.hatch, { cast: false });
  }
  const panels = Math.round(d / 3.5);
  for (let i = 1; i < panels; i++) vbox(mb, 0, HY, z0 + (d * i) / panels, W, 0.015, 0.06, L.darkGrey, { cast: false });
  vbox(mb, 0, HY, zc, 0.05, 0.015, d, L.darkGrey, { cast: false });
  for (const zz of [z0, z1]) for (let x = -6.5; x <= 6.5; x += 2.6) vbox(mb, x, 0.05, zz + (zz === z0 ? -0.04 : 0.04), 0.12, 0.22, 0.08, L.yellow, { cast: false });
}

function buildCargo(mb, L) {
  hatchCover(mb, L, -26, -12);
  hatchCover(mb, L, -7.5, 7.5);
  hatchCover(mb, L, 12, 26);

  // centre piece of H2 (crosswise, 1-high, climbable from crates on both sides)
  cont(mb, 0, HY, 0, { color: '#7b8087', along: 'x', door: 1, logo: 'CF LOGISTICS' });

  for (const [k, s] of [[1, 0], [-1, 1]]) {
    const C = s === 0 ? CRED : CBLU;
    const X = (x) => x * k, Z = (z) => z * k;
    const lg = s === 0 ? ['ORIENT STAR', '火线物流', 'NOVA LINES'] : ['BLUE WHALE', 'SEA DRAGON', 'NOVA LINES'];

    // ---- H3 / H1 ----
    // port-outer 40ft, 1-high: HIGH GROUND (stairs on the walkway)
    cont(mb, X(-6.2), HY, Z(19), { len: 12.19, color: C[0], door: -k, logo: lg[0] });
    lashing(mb, L, X(-6.2), HY, Z(25.095), k);
    // port-inner: 2-high 20ft + 1-high 20ft (joined to the high ground)
    cont(mb, X(-3.65), HY, Z(15.15), { color: C[1], door: k });
    cont(mb, X(-3.65), T1, Z(15.15), { color: C[4], door: k, logo: lg[1] });
    cont(mb, X(-3.65), HY, Z(22.95), { color: C[2], door: -k });
    lashing(mb, L, X(-3.65), HY, Z(25.98), k);
    // solid filler + bridge plate joining the two container tops (no nav hole in the 0.11 m gap)
    mb.box(X(-4.925), HY, Z(22.51), 0.13, CH, 5.18, L.darkGrey);
    vbox(mb, X(-4.925), T1, Z(22.51), 0.5, 0.02, 5.0, L.plate, { cast: false, tile: 1 });
    // starboard-inner: walk-in container facing the alley + 1-high 20ft with crate steps
    hollowCont(mb, L, X(3.65), HY, Z(15.15), { color: C[3], doorDir: -k, logo: lg[2] });
    crate(mb, L, X(3.65), HY + 0.08, Z(17.25), 0.8);
    cont(mb, X(3.65), HY, Z(22.95), { color: C[1], door: -k });
    lashing(mb, L, X(3.65), HY, Z(25.98), k);
    crate(mb, L, X(1.9), HY, Z(24.0), 1.0); crate(mb, L, X(1.9), HY + 1.0, Z(24.0), 1.0, { rotY: 0.08 });
    crate(mb, L, X(0.85), HY, Z(24.0), 1.0, { rotY: -0.05 });
    // starboard-outer 40ft, 2-high wall
    cont(mb, X(6.2), HY, Z(19), { len: 12.19, color: C[4], door: k });
    cont(mb, X(6.2), HY + CH, Z(19), { len: 12.19, color: C[0], door: -k, logo: lg[0] });
    lashing(mb, L, X(6.2), HY, Z(12.905), -k);
    lashing(mb, L, X(6.2), HY, Z(25.095), k);
    // centre-lane cover: crates under a cargo net
    crate(mb, L, X(-0.7), HY, Z(19.0), 1.2); crate(mb, L, X(0.5), HY, Z(19.4), 0.9, { rotY: 0.3 });
    cargoNet(mb, L, Math.min(X(-1.35), X(-0.05)), Math.min(Z(18.35), Z(19.65)), Math.max(X(-1.35), X(-0.05)), Math.max(Z(18.35), Z(19.65)), HY + 1.2, HY);

    // ---- H2 half ----
    cont(mb, X(6.2), HY, Z(4.3), { color: C[2], door: k });
    cont(mb, X(6.2), T1, Z(4.3), { color: C[3], door: k, logo: lg[1] });
    cont(mb, X(-6.2), HY, Z(4.3), { color: C[1], door: k });
    cont(mb, X(3.65), HY, Z(4.3), { color: C[0], door: k, logo: lg[2] });
    crate(mb, L, X(1.2), HY, Z(1.75), 1.0); crate(mb, L, X(1.2), HY + 1.0, Z(1.75), 1.0, { rotY: 0.1 });
    crate(mb, L, X(1.2), HY, Z(2.8), 1.0, { rotY: -0.06 });
    lashing(mb, L, X(-6.2), HY, Z(7.33), k);
    lashing(mb, L, X(3.65), HY, Z(7.33), k);
    lashing(mb, L, X(6.2), HY, Z(7.33), k);

    // ---- spawn-side area in front of the raised deck ----
    cont(mb, 0, 0, Z(30.5), { color: C[1], along: 'x', door: k, logo: s === 0 ? '火线物流' : 'CF LOGISTICS' });
    crate(mb, L, X(-5.0), 0, Z(28.6), 1.2); crate(mb, L, X(-6.25), 0, Z(28.9), 1.0, { rotY: 0.2 });
    crate(mb, L, X(-5.05), 1.2, Z(28.6), 0.8, { rotY: 0.4 });
    barrel(mb, X(5.2), 0, Z(29.0), '#2c4f7c'); barrel(mb, X(5.85), 0, Z(29.4), '#a8321e'); barrel(mb, X(5.15), 0, Z(29.75), '#c9a227');

    // ---- alley ----
    mb.box(X(-4.4), 0, Z(9.75), 1.6, 1.0, 1.0, L.machine, { mat: 'metal' });           // hatch hydraulic unit
    vbox(mb, X(-4.4), 1.0, Z(9.75), 1.7, 0.06, 1.1, L.darkGrey);
    for (const dx of [-0.5, 0, 0.5]) geo(mb, geoC('hydPipe', () => new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6)), L.steel, [X(-4.4 + dx), 0.3, Z(9.75 + 0.55)], [HP, 0, 0]);
    geo(mb, geoC('ropeCoil', () => new THREE.TorusGeometry(0.42, 0.11, 8, 20)), L.rope, [X(2.3), 0.11, Z(8.4)], [HP, 0, 0]);
    geo(mb, geoC('ropeCoil2', () => new THREE.TorusGeometry(0.3, 0.1, 8, 18)), L.rope, [X(2.3), 0.3, Z(8.4)], [HP, 0, 0]);
    // deck painting: yellow walkway lines and hatch-end hazard
    floorDecal(mb, L.stripe, X(7.9), 0.004, Z(19), 0.12, 14);
    floorDecal(mb, L.stripe, X(-7.9), 0.004, Z(19), 0.12, 14);
    floorDecal(mb, L.stripeW, 0, 0.004, Z(26.6), 15.2, 0.1);
  }
}

// ------------------------------------------------------------------------------------------------
// Walkway fittings (point-symmetric)
// ------------------------------------------------------------------------------------------------
function buildFittings(mb, L) {
  for (const [k, s] of [[1, 0], [-1, 1]]) {
    const X = (x) => x * k, Z = (z) => z * k;
    // port side of this half (x<0 for red half)
    locker(mb, L, Math.min(X(-12.72), X(-11.32)), Math.min(Z(30.2), Z(32.2)), Math.max(X(-12.72), X(-11.32)), Math.max(Z(30.2), Z(32.2)), 1.55, s === 0 ? L.grey : L.machine);
    // high-ground stairs on the walkway up to the 40ft container top
    {
      const x0 = Math.min(X(-9.8), X(-7.42)), x1 = Math.max(X(-9.8), X(-7.42));
      const z0 = Math.min(Z(21.5), Z(26.5)), z1 = Math.max(Z(21.5), Z(26.5));
      const outerIsX0 = Math.abs(x0) > Math.abs(x1);
      stairsR(mb, L, x0, z0, x1, z1, 0, T1, 'z', -k, { rails: outerIsX0 ? [true, false] : [false, true] });
      // landing bar at the top end so nobody walks off the high end blindly
      // (floats above the walkway below -> collider must be nav:false)
      mb.railing(x0, Z(21.45), x1, Z(21.45), T1, { material: L.rail, height: 1.0, collide: false });
      mb.collider([x0, T1, Math.min(Z(21.39), Z(21.51))], [x1, T1 + 1.0, Math.max(Z(21.39), Z(21.51))], 'metal', { nav: false });
    }
    ventMushroom(mb, L, X(-12.25), 0, Z(18.0));
    barrel(mb, X(-12.15), 0, Z(13.2), '#3d6b45'); barrel(mb, X(-12.15), 0, Z(13.85), '#2c4f7c'); barrel(mb, X(-11.5), 0, Z(13.5), '#a8321e');
    barrel(mb, X(-11.55), 0.88, Z(13.5), '#c9a227');
    // inboard hydraulic power pack (breaks the walkway sightline)
    mb.boxMM([Math.min(X(-9.05), X(-7.75)), 0, Math.min(Z(4.6), Z(6.6))], [Math.max(X(-9.05), X(-7.75)), 1.3, Math.max(Z(4.6), Z(6.6))], L.machine, { mat: 'metal' });
    vbox(mb, X(-8.4), 1.3, Z(5.6), 1.4, 0.08, 2.1, L.darkGrey);
    geo(mb, geoC('ppMotor', () => new THREE.CylinderGeometry(0.28, 0.28, 0.8, 12)), L.machine, [X(-8.4), 1.65, Z(5.6)], [HP, 0, 0]);
    crate(mb, L, X(-11.9), 0, Z(2.7), 1.2); crate(mb, L, X(-11.95), 1.2, Z(2.75), 0.9, { rotY: 0.25 });
    fireStation(mb, L, X(-12.51), Z(8.9), k);
    lifebuoy(mb, L, X(-12.66), 0.85, Z(27.6), k);
    lifebuoy(mb, L, X(-12.66), 0.85, Z(-0.6), k);

    // starboard side of this half
    crane(mb, L, k);
    fireStation(mb, L, X(12.51), Z(16.0), -k);
    lifebuoy(mb, L, X(12.66), 0.85, Z(17.4), -k);
    crate(mb, L, X(11.6), 0, Z(20.8), 1.2, { rotY: 0.1 }); crate(mb, L, X(11.75), 0, Z(22.1), 1.0);
    mb.boxMM([Math.min(X(7.75), X(9.05)), 0, Math.min(Z(27.7), Z(29.3))], [Math.max(X(7.75), X(9.05)), 1.1, Math.max(Z(27.7), Z(29.3))], L.yellow, { mat: 'metal' });  // lashing-gear bin
    for (let i = 0; i < 6; i++) rod(mb, [X(7.95 + i * 0.2), 1.1, Z(28.0)], [X(8.0 + i * 0.2), 2.0, Z(28.3)], 0.02, L.steel, 4, false);
    barrel(mb, X(12.1), 0, Z(31.0), '#2c4f7c'); barrel(mb, X(12.1), 0, Z(31.65), '#3d6b45'); barrel(mb, X(11.45), 0, Z(31.3), '#c9a227');
    ventMushroom(mb, L, X(12.25), 0, Z(3.8));
    gooseneck(mb, L, X(12.3), 0, Z(36.0), -k);
    bollard(mb, L, X(12.0), 0, Z(34.2));
    bollard(mb, L, X(-12.0), 0, Z(34.2));
  }

  // pipes, bulwark stays and scuppers along both sides (visual)
  for (const sx of [-1, 1]) {
    const xp = sx * 12.5;
    rod(mb, [xp, 0.62, -38.5], [xp, 0.62, 38.5], 0.09, L.white, 8);
    rod(mb, [sx * 12.56, 0.38, -38.5], [sx * 12.56, 0.38, 38.5], 0.06, L.grey, 6);
    for (let z = -36; z <= 36; z += 6) geo(mb, geoC('flange', () => new THREE.CylinderGeometry(0.15, 0.15, 0.06, 10)), L.white, [xp, 0.62, z], [HP, 0, 0]);
    for (let z = -38; z <= 38; z += 2) {
      if (Math.abs(z - 9.75 * sx) < 1.5) continue;
      vbox(mb, sx * 12.62, 0, z, 0.2, 1.0, 0.03, L.bulIn, { cast: false });                 // bulwark stays
    }
    for (let z = -35; z <= 35; z += 5) vbox(mb, sx * 12.705, 0, z + 1, 0.02, 0.18, 0.5, L.black, { cast: false }); // freeing ports
  }
}

// ------------------------------------------------------------------------------------------------
// Deck cranes (k = 1: starboard crane at z=+9.75, k = -1: port crane at z=-9.75)
// ------------------------------------------------------------------------------------------------
function crane(mb, L, k) {
  const px = 11.6 * k, pz = 9.75 * k;
  const ped = geoC('cranePed', () => new THREE.CylinderGeometry(1.05, 1.1, 4.2, 20));
  geo(mb, ped, L.yellow, [px, 2.1, pz]);
  geo(mb, geoC('craneBase', () => new THREE.CylinderGeometry(1.3, 1.3, 0.12, 20)), L.darkGrey, [px, 0.06, pz]);
  geo(mb, geoC('craneRing', () => new THREE.CylinderGeometry(1.32, 1.32, 0.35, 22)), L.darkGrey, [px, 4.35, pz]);
  mb.collider([px - 1.1, 0, pz - 1.1], [px + 1.1, 7.2, pz + 1.1], 'metal');
  for (let y = 0.6; y < 4.0; y += 0.32) rod(mb, [px - k * 1.12, y, pz - 0.22], [px - k * 1.12, y, pz + 0.22], 0.014, L.steel, 4, false);
  // house + cab
  vbox(mb, px - k * 0.3, 4.52, pz, 3.4, 2.5, 3.0, L.yellow);
  vbox(mb, px - k * 1.85, 4.9, pz - k * 0.8, 0.9, 1.7, 1.2, L.yellow);
  vbox(mb, px - k * 2.31, 5.5, pz - k * 0.8, 0.04, 0.9, 1.0, L.glass, { cast: false });
  vbox(mb, px - k * 0.3, 7.02, pz, 3.5, 0.1, 3.1, L.darkGrey);
  vbox(mb, px + k * 1.43, 5.0, pz, 0.05, 0.6, 1.8, L.darkGrey, { cast: false });  // louvres
  decal(mb, textMat('SWL 30T', { fg: '#111111', w: 512, h: 128, font: 'bold 90px Arial' }), px - k * 0.3, 6.2, pz + k * 1.505, 1.6, 0.4, k > 0 ? 0 : PI);
  // A-frame on the house
  const top = [px + k * 0.6, 9.6, pz];
  for (const dz of [-1.1, 1.1]) { rod(mb, [px + k * 1.1, 7.1, pz + dz], top, 0.09, L.yellow, 6); rod(mb, [px - k * 0.2, 7.1, pz + dz], top, 0.09, L.yellow, 6); }
  // lattice jib from the foot toward the tip over the hatch
  const foot = new THREE.Vector3(px - k * 1.6, 5.4, pz), tip = new THREE.Vector3(1.8 * k, 16.0, 19.0 * k);
  const dir = tip.clone().sub(foot).normalize();
  const side = new THREE.Vector3().crossVectors(dir, _up).normalize();
  const upv = new THREE.Vector3().crossVectors(side, dir).normalize();
  const corner = (t, a, b) => { const w = 0.55 * (1 - t) + 0.22 * t; return foot.clone().lerp(tip, t).addScaledVector(side, a * w).addScaledVector(upv, b * w); };
  const CS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [a, b] of CS) rod(mb, corner(0, a, b).toArray(), corner(1, a, b).toArray(), 0.07, L.yellow, 6);
  const n = 12;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    for (let c = 0; c < 4; c++) {
      const [a0, b0] = CS[c], [a1, b1] = CS[(c + 1) % 4];
      rod(mb, corner(t0, a0, b0).toArray(), corner(t1, a1, b1).toArray(), 0.035, L.yellow, 4, false);
      rod(mb, corner(t1, a0, b0).toArray(), corner(t1, a1, b1).toArray(), 0.03, L.yellow, 4, false);
    }
  }
  geo(mb, geoC('sheave', () => new THREE.CylinderGeometry(0.35, 0.35, 0.3, 14)), L.darkGrey, tip.toArray(), [HP, 0, 0]);
  // luffing wires, hoist wire, hook block
  rod(mb, top, tip.toArray(), 0.025, L.steel, 4, false);
  rod(mb, [top[0], top[1], top[2] + 0.2], tip.toArray(), 0.025, L.steel, 4, false);
  const hookY = 9.2;
  rod(mb, [tip.x - 0.12, tip.y, tip.z], [tip.x - 0.12, hookY + 0.7, tip.z], 0.02, L.steel, 4, false);
  rod(mb, [tip.x + 0.12, tip.y, tip.z], [tip.x + 0.12, hookY + 0.7, tip.z], 0.02, L.steel, 4, false);
  vbox(mb, tip.x, hookY, tip.z, 0.55, 0.75, 0.35, L.hazard, { tile: 0.5 });
  geo(mb, geoC('hook', () => new THREE.TorusGeometry(0.2, 0.05, 8, 14, PI * 1.5)), L.darkGrey, [tip.x, hookY - 0.25, tip.z], [0, 0, PI * 0.75]);
  // jib rest / lamp
  mb.lamp(px - k * 2.0, 7.4, pz + k * 1.2, { intensity: 7, distance: 17 });
}

// ------------------------------------------------------------------------------------------------
// Distant scenery (no colliders, no shadows)
// ------------------------------------------------------------------------------------------------
function buildScenery(mb, L) {
  const far = (x, y, z, w, h, d, c, rotY = 0) => vbox(mb, x, y, z, w, h, d, L.far(c), { cast: false, rotY, tile: 8 });
  const W = WATER;
  // ---- container port off the starboard bow ----
  far(420, W - 1, -170, 150, 3.5, 560, '#8a877f');                         // quay
  far(498, W + 2.5, -170, 40, 1, 560, '#76736c');
  const pal = ['#8e3a2e', '#3d5f80', '#5f7a52', '#b27a3a', '#888c90', '#6d4a5e'];
  for (let i = 0; i < 26; i++) {
    const z = -420 + i * 20 + ((i * 37) % 7), x = 420 + ((i * 53) % 5) * 9, h = 2.6 * (2 + (i % 3));
    far(x, W + 2.5, z, 12, h, 14, pal[i % pal.length]);
  }
  for (let i = 0; i < 6; i++) {                                              // STS gantry cranes
    const z = -380 + i * 70, c = i % 2 ? '#c8c4bc' : '#b4402e';
    for (const dz of [-8, 8]) for (const dx of [-12, 12]) far(372 + dx, W + 2.5, z + dz, 1.6, 40, 1.6, c);
    far(372, W + 40, z, 30, 3, 18, c);
    far(342, W + 37, z, 60, 2.2, 3, c);                                     // boom over the water
    far(380, W + 43, z, 4, 10, 3, c);
    rod(mb, [312, W + 38, z], [380, W + 52, z], 0.4, L.far(c), 4, false);
  }
  for (let i = 0; i < 7; i++) far(530 + (i % 2) * 22, W + 2.5, -400 + i * 75, 30, 12 + (i % 3) * 5, 60, i % 2 ? '#7f8a94' : '#a59d8c');
  for (let i = 0; i < 18; i++) {                                             // city skyline
    const h = 25 + ((i * 41) % 60);
    far(620 + ((i * 29) % 70), W, -460 + i * 52, 26 + (i % 4) * 6, h, 24, i % 3 ? '#46505c' : '#575049');
  }
  const hill = geoC('hill', () => new THREE.ConeGeometry(1, 1, 7, 1));
  const hills = [[800, -260, 170, 48, 0.3], [870, -60, 210, 66, 1.1], [760, -560, 150, 40, 2.0], [930, -400, 240, 82, 0.7], [960, 120, 220, 58, 2.6], [1040, -230, 260, 95, 1.7], [720, 60, 120, 30, 0.2]];
  for (const [x, z, r, h, ry] of hills) geo(mb, hill, L.far('#56625f'), [x, W + h / 2 - 2, z], [0, ry, 0], [r, h, r * 0.8], false);
  // ---- another freighter passing on the port side ----
  const sx0 = -330, sz0 = 90;
  far(sx0, W - 2, sz0, 24, 12, 150, '#3a2e2a');
  far(sx0, W - 2.2, sz0, 24.2, 2.5, 150.2, '#8a2b22');
  far(sx0, W + 10, sz0 + 62, 20, 14, 16, '#e0dbd0');
  far(sx0, W + 24, sz0 + 58, 26, 3, 6, '#e0dbd0');
  far(sx0, W + 22, sz0 + 70, 6, 10, 5, '#b3261e');
  for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) far(sx0 - 7.5 + j * 7.5, W + 10, sz0 - 60 + i * 13, 7, 2.6 * (1 + ((i + j) % 3)), 12, pal[(i * 3 + j) % pal.length]);
  // ---- lighthouse islet ahead ----
  const rock = geoC('rock', () => new THREE.DodecahedronGeometry(1, 0));
  geo(mb, rock, L.far('#4c4a46'), [-170, W - 4, -420], [0.3, 0.6, 0.1], [40, 12, 28], false);
  geo(mb, rock, L.far('#5a5650'), [-150, W - 3, -400], [0.1, 1.6, 0.4], [18, 8, 16], false);
  for (let i = 0; i < 6; i++) geo(mb, geoC('lhSeg', () => new THREE.CylinderGeometry(2.6, 3.0, 4, 16)), L.far(i % 2 ? '#b3261e' : '#e8e4da'), [-165, W + 6 + i * 4 + 2, -418]);
  geo(mb, geoC('lhTop', () => new THREE.CylinderGeometry(2.0, 2.0, 2.6, 12)), M.lampOn(), [-165, W + 31.3, -418], [0, 0, 0], [1, 1, 1], false);
  geo(mb, geoC('lhRoof', () => new THREE.ConeGeometry(2.6, 2.4, 12)), L.far('#2a2a2a'), [-165, W + 33.8, -418], [0, 0, 0], [1, 1, 1], false);
  // ---- channel buoys that bob ----
  for (const [bx, bz, red] of [[-38, -150, true], [42, -175, false], [-46, 210, true]]) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(geoC('buoyBody', () => new THREE.CylinderGeometry(0.9, 1.2, 2.2, 12)), red ? L.red : M.paintedSteel('#2f7a3a', 0.3));
    body.position.y = 0.6; g.add(body);
    const cage = new THREE.Mesh(geoC('buoyTop', () => new THREE.ConeGeometry(0.6, 1.6, 8)), L.darkGrey); cage.position.y = 2.4; g.add(cage);
    const lampM = new THREE.Mesh(geoC('buoyLamp', () => new THREE.SphereGeometry(0.2, 8, 6)), red ? L.navRed : L.navGreen); lampM.position.y = 3.3; g.add(lampM);
    g.position.set(bx, W, bz);
    mb.addObject(g);
    const ph = bx * 0.1;
    mb.animated.push({ update: (dt, t) => { g.position.y = W - 0.2 + Math.sin(t * 1.3 + ph) * 0.25; g.rotation.z = Math.sin(t * 0.9 + ph) * 0.08; g.rotation.x = Math.cos(t * 1.1 + ph) * 0.06; } });
  }
}

// Waving flags (vertex-animated planes)
function flag(mb, x, y, z, w, h, color, rotY = 0) {
  const g = new THREE.PlaneGeometry(w, h, 10, 2);
  g.translate(w / 2, 0, 0);
  const base = g.attributes.position.array.slice();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide }));
  m.position.set(x, y, z); m.rotation.y = rotY; m.castShadow = true;
  mb.addObject(m);
  const pos = g.attributes.position;
  mb.animated.push({
    update: (dt, t) => {
      for (let i = 0; i < pos.count; i++) {
        const bx = base[i * 3];
        pos.array[i * 3 + 2] = Math.sin(bx * 3.2 - t * 6 + x) * 0.09 * bx;
        pos.array[i * 3 + 1] = base[i * 3 + 1] - bx * 0.06;
      }
      pos.needsUpdate = true;
    },
  });
}

// ------------------------------------------------------------------------------------------------
// Map definition
// ------------------------------------------------------------------------------------------------
export default {
  id: 'transport',
  name: '运输船',
  desc: '远洋货轮甲板上的近距离团队战：集装箱迷宫、两侧走道与船首船尾高台。',
  modes: ['tdm', 'ffa', 'zombie', 'challenge'],
  env: {
    preset: 'dusk',
    sunDir: [-0.8, 0.33, 0.2], sunIntensity: 3.3, sunColor: 0xffb676,
    hemiSky: 0xa9b3d6, hemiGround: 0x6a5644, hemiIntensity: 1.2,
    fogColor: 0xd8bea0, fogDensity: 0.0024, turbidity: 8, rayleigh: 2.4, exposure: 0.9,
  },
  size: 66,
  build(mb) {
    const L = mats();
    buildHull(mb, L);
    buildDecks(mb, L);
    buildForecastle(mb, L);
    buildSuperstructure(mb, L);
    buildCargo(mb, L);
    buildFittings(mb, L);
    buildScenery(mb, L);
    flag(mb, 0, 6.9, -59.0, 1.3, 0.85, 0xc0261c, -HP);
    flag(mb, 2.6, 26.2, 47.4, 1.0, 0.65, 0xe8a020, -HP);
    flag(mb, 0, 7.4, 59.3, 1.6, 1.0, 0xc0261c, -HP);

    // lights (7): alcove, superstructure floodlights, foremast, forecastle front, cranes (2, in crane())
    mb.lamp(0, 5.15, 44.2, { intensity: 6, distance: 14 });
    mb.lamp(-7.2, 13.5, 41.9, { intensity: 9, distance: 26 });
    mb.lamp(7.2, 13.5, 41.9, { intensity: 9, distance: 26 });
    mb.lamp(0, 12.6, -50.2, { intensity: 9, distance: 24 });
    mb.lamp(0, 2.15, -39.75, { intensity: 5, distance: 13 });

    mb.water(WATER, 1600, 0x1d4658);

    const R = 0, B = PI;
    const spawns = {
      red: [
        [-7.6, DECK_HI, 44.4, R], [-2.6, DECK_HI, 44.6, R], [2.6, DECK_HI, 44.6, R], [7.6, DECK_HI, 44.4, R],
        [-4.2, DECK_HI, 41.4, R], [4.2, DECK_HI, 41.4, R],
        [-6.2, 0, 36.6, R], [6.2, 0, 36.6, R], [-3.6, 0, 38.0, R], [3.6, 0, 38.0, R], [-9.4, 0, 33.4, R], [9.4, 0, 33.4, R],
      ],
      blue: [
        [-4.6, DECK_HI, -42.2, B], [4.6, DECK_HI, -42.2, B], [-1.8, DECK_HI, -46.5, B], [1.8, DECK_HI, -46.5, B],
        [-8.3, DECK_HI, -41.4, B], [8.3, DECK_HI, -41.4, B],
        [6.2, 0, -36.6, B], [-6.2, 0, -36.6, B], [3.6, 0, -38.0, B], [-3.6, 0, -38.0, B], [9.4, 0, -33.4, B], [-9.4, 0, -33.4, B],
      ],
      ffa: [
        [-10.6, 0, 17.0, HP], [10.6, 0, -17.0, -HP], [0, HY, 15.0, 0], [0, HY, -15.0, PI],
        [-3.7, HY, 4.6, PI / 4], [3.7, HY, -4.6, -3 * PI / 4], [-9.0, 0, 9.8, -HP], [9.0, 0, -9.8, HP],
        [6.0, 0, 33.6, 0], [-6.0, 0, -33.6, PI], [-8.0, DECK_HI, 43.2, 0], [7.6, DECK_HI, -42.4, PI],
      ],
      zombie: [
        [-6.2, T1, 19.0, 0], [6.2, T1, -19.0, PI], [0, T1, 0, 0], [-11.0, 0, -1.6, 0], [11.0, 0, 1.6, PI],
        [0, HY, 22.0, 0], [0, HY, -22.0, PI], [-9.5, 0, 28.0, 0], [9.5, 0, -28.0, PI],
        [0, DECK_HI, -45.5, PI], [0, DECK_HI, 44.6, 0], [6.0, 0, 9.8, HP], [-6.0, 0, -9.8, -HP], [3.65, HY + 0.08, 14.4, PI], [-3.65, HY + 0.08, -14.4, 0],
      ],
    };
    const hotspots = [
      [-6.2, T1, 19.0], [6.2, T1, -19.0], [-3.65, T1, 23.5], [3.65, T1, -23.5],
      [3.65, HY + 0.08, 15.5], [-3.65, HY + 0.08, -15.5],
      [0, DECK_HI, -45.5], [0, DECK_HI, 44.4], [-10.8, 0, 0], [10.8, 0, 0], [0, 0, 9.75], [0, 0, -9.75],
      [-3.7, HY, 4.6], [3.7, HY, -4.6], [0, 0, 34.0], [0, 0, -34.0],
    ];
    return { spawns, bounds: [-14, -61, 14, 47], killY: -3, hotspots };
  },
};
