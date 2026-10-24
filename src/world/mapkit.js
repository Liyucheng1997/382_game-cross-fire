// MapBuilder: helpers maps use to place geometry + colliders. Static meshes are merged per material in finalize()
// so even very detailed maps stay at a few dozen draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, solid } from '../gfx/materials.js';
import * as T from '../gfx/textures.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

// Scale BoxGeometry UVs so textures tile in world units (tile = metres per texture repeat)
export function worldUVBox(geo, w, h, d, tile = 2) {
  const uv = geo.attributes.uv;
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  const per = uv.count / 6;
  for (let i = 0; i < uv.count; i++) {
    const f = Math.floor(i / per), s = sizes[f];
    uv.setXY(i, uv.getX(i) * s[0] / tile, uv.getY(i) * s[1] / tile);
  }
  uv.needsUpdate = true;
  return geo;
}

export class MapBuilder {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.static = new Map(); // key -> {material, geos:[], cast, receive}
    this.dynamic = new THREE.Group(); // non-merged things (animated, lights, transparent)
    this.dynamic.name = 'mapDynamic';
    scene.add(this.dynamic);
    this.lights = [];
    this.animated = []; // {update(dt,time)}
    this.waterLevel = null;
  }

  // ---- low level ----
  // Add a geometry (already in local space) with transform to the merge pool
  addGeo(geo, material, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], cast = true, receive = true } = {}) {
    _e.set(rot[0], rot[1], rot[2]);
    _q.setFromEuler(_e);
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scale[0], scale[1], scale[2]));
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(_m);
    // keep only shared attributes so everything merges
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const key = material.uuid + (cast ? 'c' : '') + (receive ? 'r' : '');
    if (!this.static.has(key)) this.static.set(key, { material, geos: [], cast, receive });
    this.static.get(key).geos.push(g);
    return g;
  }

  // Add a ready mesh/group that should not be merged (moving parts, transparent, emissive with lights...)
  addObject(obj) { this.dynamic.add(obj); return obj; }

  collider(min, max, mat = 'metal', flags = {}) { return this.world.addBox(min, max, mat, flags); }

  // ---- primitives ----
  // Box with bottom-centre at (x, y, z). Collider added automatically unless collide:false.
  // opts.rotY rotates visual only; collider becomes the rotated AABB.
  box(x, y, z, w, h, d, material, opts = {}) {
    const { collide = true, mat = 'metal', tile = 2, rotY = 0, cast = true, receive = true, nav = true } = opts;
    const geo = worldUVBox(new THREE.BoxGeometry(w, h, d), w, h, d, tile);
    this.addGeo(geo, material, { pos: [x, y + h / 2, z], rot: [0, rotY, 0], cast, receive });
    geo.dispose();
    if (collide) {
      const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
      const hw = (w * c + d * s) / 2, hd = (w * s + d * c) / 2;
      this.collider([x - hw, y, z - hd], [x + hw, y + h, z + hd], mat, { nav });
    }
  }

  // Box from min/max corners (convenient for walls)
  boxMM(min, max, material, opts = {}) {
    const w = max[0] - min[0], h = max[1] - min[1], d = max[2] - min[2];
    this.box(min[0] + w / 2, min[1], min[2] + d / 2, w, h, d, material, opts);
  }

  // Wedge ramp. Footprint min/max in x/z, rises from y0 to y1 along axis ('x'|'z') in direction dir (+1/-1).
  ramp(x0, z0, x1, z1, y0, y1, axis, dir, material, opts = {}) {
    const { mat = 'metal', tile = 2, collide = true } = opts;
    const w = x1 - x0, d = z1 - z0, h = y1 - y0;
    const len = axis === 'x' ? w : d, wid = axis === 'x' ? d : w;
    // build wedge in local space: length along +X from 0..len, width along Z, rise along +X
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(len, 0); shape.lineTo(len, h); shape.lineTo(0, 0.001);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: wid, bevelEnabled: false });
    // UV world scale
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / tile, uv.getY(i) / tile);
    geo.translate(0, 0, -wid / 2);
    let rotY = 0, px, pz;
    if (axis === 'x') { rotY = dir > 0 ? 0 : Math.PI; px = dir > 0 ? x0 : x1; pz = z0 + d / 2; }
    else { rotY = dir > 0 ? -Math.PI / 2 : Math.PI / 2; px = x0 + w / 2; pz = dir > 0 ? z0 : z1; }
    this.addGeo(geo, material, { pos: [px, y0, pz], rot: [0, rotY, 0] });
    geo.dispose();
    if (collide) this.world.addRamp([x0, y0, z0], [x1, y1, z1], axis, dir, mat);
  }

  // Straight stairs made of step boxes. Footprint like ramp; steps rise along axis/dir.
  stairs(x0, z0, x1, z1, y0, y1, axis, dir, material, opts = {}) {
    const h = y1 - y0;
    const n = Math.max(2, Math.round(h / 0.25));
    const len = axis === 'x' ? x1 - x0 : z1 - z0;
    const sh = h / n, sl = len / n;
    for (let i = 0; i < n; i++) {
      const top = y0 + sh * (i + 1);
      const a = dir > 0 ? i * sl : len - (i + 1) * sl;
      if (axis === 'x') this.box(x0 + a + sl / 2, y0, (z0 + z1) / 2, sl, top - y0, z1 - z0, material, { ...opts, collide: false });
      else this.box((x0 + x1) / 2, y0, z0 + a + sl / 2, x1 - x0, top - y0, sl, material, { ...opts, collide: false });
    }
    // smooth ramp collider so movement & nav are clean
    this.world.addRamp([x0, y0, z0], [x1, y1, z1], axis, dir, opts.mat || 'metal');
  }

  cylinder(x, y, z, rTop, rBot, h, material, opts = {}) {
    const { segs = 16, collide = false, mat = 'metal', rot = [0, 0, 0], open = false } = opts;
    const geo = new THREE.CylinderGeometry(rTop, rBot, h, segs, 1, open);
    this.addGeo(geo, material, { pos: [x, y + h / 2, z], rot, cast: opts.cast ?? true, receive: opts.receive ?? true });
    geo.dispose();
    if (collide) { const r = Math.max(rTop, rBot) * 0.85; this.collider([x - r, y, z - r], [x + r, y + h, z + r], mat); }
  }

  // ---- props ----
  // ISO shipping container. len 6.06 (20ft) or 12.19 (40ft). rotY in multiples of PI/2 recommended.
  container(x, y, z, { len = 6.06, color = '#2f5d8a', rotY = 0, seed = 3, doorEnd = 1, collide = true, logo = null } = {}) {
    const W = 2.44, H = 2.59, L = len;
    const g = new THREE.Group();
    const body = M.container(color, seed);
    const frame = M.paintedSteel(new THREE.Color(color).multiplyScalar(0.7).getStyle(), 0.5);
    const add = (geo, m, px, py, pz, rx = 0, ry = 0, rz = 0) => { const me = new THREE.Mesh(geo, m); me.position.set(px, py, pz); me.rotation.set(rx, ry, rz); g.add(me); return me; };
    // corrugated side walls (ribs via normal map, tiled so ribs ~0.3m)
    const side = new THREE.PlaneGeometry(L - 0.3, H - 0.3);
    const su = side.attributes.uv; for (let i = 0; i < su.count; i++) su.setXY(i, su.getX(i) * (L / 4), su.getY(i));
    add(side, body, 0, H / 2, W / 2, 0, 0, 0);
    add(side.clone(), body, 0, H / 2, -W / 2, 0, Math.PI, 0);
    // roof
    const roof = new THREE.PlaneGeometry(L - 0.2, W - 0.2);
    add(roof, body, 0, H - 0.02, 0, -Math.PI / 2, 0, 0);
    // inner core so walls aren't see-through
    add(new THREE.BoxGeometry(L - 0.34, H - 0.34, W - 0.1), body, 0, H / 2, 0);
    // front (blank end) wall
    const endW = new THREE.PlaneGeometry(W - 0.3, H - 0.3);
    add(endW, body, -L / 2 * doorEnd, H / 2, 0, 0, -Math.PI / 2 * doorEnd, 0);
    // door end: two doors with lock bars
    const de = L / 2 * doorEnd;
    const doorGeo = new THREE.BoxGeometry(0.04, H - 0.3, (W - 0.32) / 2);
    add(doorGeo, body, de, H / 2, (W - 0.32) / 4 + 0.01);
    add(doorGeo, body, de, H / 2, -(W - 0.32) / 4 - 0.01);
    const bar = new THREE.CylinderGeometry(0.022, 0.022, H - 0.2, 8);
    for (const zz of [-0.85, -0.3, 0.3, 0.85]) {
      add(bar, M.steelBright(), de + 0.05 * doorEnd, H / 2, zz);
      const handle = new THREE.BoxGeometry(0.06, 0.04, 0.22);
      add(handle, M.steelBright(), de + 0.07 * doorEnd, 1.1, zz + 0.1);
      for (const yy of [0.25, H - 0.25]) add(new THREE.BoxGeometry(0.08, 0.1, 0.1), frame, de + 0.05 * doorEnd, yy, zz);
    }
    // frame rails + corner posts + corner castings
    const rail = new THREE.BoxGeometry(L, 0.16, 0.16);
    for (const yy of [0.08, H - 0.08]) for (const zz of [W / 2 - 0.08, -W / 2 + 0.08]) add(rail, frame, 0, yy, zz);
    const endRail = new THREE.BoxGeometry(0.16, 0.16, W);
    for (const xx of [L / 2 - 0.08, -L / 2 + 0.08]) for (const yy of [0.08, H - 0.08]) add(endRail, frame, xx, yy, 0);
    const post = new THREE.BoxGeometry(0.17, H, 0.17);
    const cast = new THREE.BoxGeometry(0.19, 0.12, 0.19);
    for (const xx of [L / 2 - 0.085, -L / 2 + 0.085]) for (const zz of [W / 2 - 0.085, -W / 2 + 0.085]) {
      add(post, frame, xx, H / 2, zz);
      add(cast, M.paintedSteel('#555555', 0.7), xx, 0.06, zz);
      add(cast, M.paintedSteel('#555555', 0.7), xx, H - 0.06, zz);
    }
    // forklift pockets on 20ft
    if (L < 7) for (const xx of [-1.0, 1.0]) for (const zz of [W / 2 + 0.001, -W / 2 - 0.001]) add(new THREE.BoxGeometry(0.36, 0.12, 0.01), M.black(), xx, 0.12, zz);
    // logo / ID panel
    const lt = logo ? T.label(logo, { w: 512, h: 128, fg: '#f0f0f0', font: 'bold 96px Arial' }) : null;
    if (lt) {
      const lm = new THREE.MeshStandardMaterial({ map: lt, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      for (const sgn of [1, -1]) {
        const p = add(new THREE.PlaneGeometry(Math.min(L * 0.7, 6), 0.6), lm, 0, H * 0.62, sgn * (W / 2 + 0.02), 0, sgn > 0 ? 0 : Math.PI, 0);
        p.userData.noMerge = true;
      }
    }
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    this.mergeGroup(g);
    if (collide) {
      const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
      const hw = (L * c + W * s) / 2, hd = (L * s + W * c) / 2;
      this.collider([x - hw, y, z - hd], [x + hw, y + H, z + hd], 'metal');
    }
    return { W, H, L };
  }

  // Wooden crate with frame boards. size cube edge.
  crate(x, y, z, size = 1.2, { rotY = 0, collide = true, tint = null } = {}) {
    const g = new THREE.Group();
    const wood = tint ? new THREE.MeshStandardMaterial({ map: T.planks(57, tint, 5), roughness: 0.85 }) : M.crate();
    const s = size;
    g.add(new THREE.Mesh(worldUVBox(new THREE.BoxGeometry(s * 0.96, s * 0.96, s * 0.96), s, s, s, s), wood).translateY(s / 2));
    const bw = s * 0.1, frameMat = M.paintedSteel('#6b5233', 0.2);
    const frameWood = new THREE.MeshStandardMaterial({ map: T.planks(58, '#6e5230', 3), roughness: 0.85 });
    // edge boards
    for (const a of [-1, 1]) for (const b of [-1, 1]) {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(bw, s, bw), frameWood).translateX(a * (s / 2 - bw / 2)).translateZ(b * (s / 2 - bw / 2)).translateY(s / 2));
      g.add(new THREE.Mesh(new THREE.BoxGeometry(s, bw, bw), frameWood).translateY(a > 0 ? s - bw / 2 : bw / 2).translateZ(b * (s / 2 - bw / 2)));
      g.add(new THREE.Mesh(new THREE.BoxGeometry(bw, bw, s), frameWood).translateY(a > 0 ? s - bw / 2 : bw / 2).translateX(b * (s / 2 - bw / 2)));
    }
    // diagonal brace on two faces
    for (const sgn of [1, -1]) {
      const br = new THREE.Mesh(new THREE.BoxGeometry(s * 1.25, bw * 0.9, bw * 0.5), frameWood);
      br.position.set(0, s / 2, sgn * (s / 2 + bw * 0.1)); br.rotation.z = Math.PI / 4 * sgn;
      g.add(br);
    }
    void frameMat;
    g.position.set(x, y, z); g.rotation.y = rotY;
    this.mergeGroup(g);
    if (collide) {
      const h = s * 0.5 * (Math.abs(Math.cos(rotY)) + Math.abs(Math.sin(rotY)));
      this.collider([x - h, y, z - h], [x + h, y + s, z + h], 'wood');
    }
  }

  // 200L steel drum
  barrel(x, y, z, { color = '#2c4f7c', collide = true, tipped = false } = {}) {
    const g = new THREE.Group();
    const m = M.paintedSteel(color, 0.6);
    const r = 0.29, h = 0.88;
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), m).translateY(h / 2));
    for (const yy of [0.02, h * 0.33, h * 0.66, h - 0.02]) g.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 24), m).translateY(yy).rotateX(Math.PI / 2));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8), M.steelBright()).translateY(h + 0.005).translateX(0.15));
    g.position.set(x, y, z);
    if (tipped) { g.rotation.z = Math.PI / 2; g.position.y += r; g.position.x += h / 2; }
    this.mergeGroup(g);
    if (collide) {
      if (tipped) this.collider([x - 0.02, y, z - r], [x + h, y + 2 * r, z + r], 'metal');
      else this.collider([x - r, y, z - r], [x + r, y + h, z + r], 'metal');
    }
  }

  // Railing along a line (x0,z0)->(x1,z1) at height y. Thin collider so players can't fall.
  railing(x0, z0, x1, z1, y, { height = 1.05, material = null, collide = true, posts = 1.5 } = {}) {
    const m = material || M.paintedSteel('#c9b23a', 0.3);
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    const ang = Math.atan2(-dz, dx);
    const n = Math.max(1, Math.round(len / posts));
    const post = new THREE.CylinderGeometry(0.025, 0.025, height, 8);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.addGeo(post, m, { pos: [x0 + dx * t, y + height / 2, z0 + dz * t] });
    }
    const bar = new THREE.CylinderGeometry(0.022, 0.022, len, 8);
    for (const hh of [height, height * 0.5]) this.addGeo(bar, m, { pos: [x0 + dx / 2, y + hh, z0 + dz / 2], rot: [0, ang, Math.PI / 2] });
    if (collide) {
      const pad = 0.06;
      this.collider([Math.min(x0, x1) - pad, y, Math.min(z0, z1) - pad], [Math.max(x0, x1) + pad, y + height, Math.max(z0, z1) + pad], 'metal');
    }
  }

  // Point light with a visible fixture. Keep to <= 8 per map for performance.
  lamp(x, y, z, { color = 0xffe2b0, intensity = 8, distance = 18, fixture = true, red = false } = {}) {
    const light = new THREE.PointLight(color, intensity, distance, 1.6);
    light.position.set(x, y, z);
    this.dynamic.add(light);
    this.lights.push(light);
    if (fixture) {
      this.addGeo(new THREE.SphereGeometry(0.12, 12, 8), red ? M.lampRed() : M.lampOn(), { pos: [x, y, z], cast: false });
      this.addGeo(new THREE.CylinderGeometry(0.16, 0.2, 0.08, 12, 1, true), M.paintedSteel('#333333', 0.3), { pos: [x, y + 0.1, z] });
    }
    return light;
  }

  // Flat text sign / decal
  sign(text, x, y, z, w, h, { rotY = 0, fg = '#ffffff', bg = 'rgba(0,0,0,0)', font = 'bold 150px Arial', emissive = false } = {}) {
    const tex = T.label(text, { w: 512, h: Math.round(512 * h / w), fg, bg, font });
    const m = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    if (emissive) { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = tex; m.emissiveIntensity = 1.2; }
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    p.position.set(x, y, z); p.rotation.y = rotY;
    this.dynamic.add(p);
    return p;
  }

  // Animated ocean plane. Only one per map.
  water(level = 0, size = 600, color = 0x1c4a63) {
    const n = T.waterNormal();
    const mat = new THREE.MeshPhysicalMaterial({
      color, roughness: 0.08, metalness: 0.0, normalMap: n, normalScale: new THREE.Vector2(0.6, 0.6), clearcoat: 1, clearcoatRoughness: 0.15,
      envMapIntensity: 1.2, transparent: true, opacity: 0.94,
    });
    if (n) { n.repeat.set(size / 20, size / 20); }
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2; mesh.position.y = level; mesh.receiveShadow = true;
    this.dynamic.add(mesh);
    this.waterLevel = level;
    this.animated.push({ update: (dt, t) => { if (n) { n.offset.x = t * 0.012; n.offset.y = t * 0.007; } } });
    return mesh;
  }

  // Ground plane (big, receives shadows, no collider unless asked)
  ground(y, size, material, { collide = true, tile = 4, mat = 'concrete', cx = 0, cz = 0 } = {}) {
    const geo = new THREE.PlaneGeometry(size, size);
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size / tile, uv.getY(i) * size / tile);
    this.addGeo(geo, material, { pos: [cx, y, cz], rot: [-Math.PI / 2, 0, 0], cast: false });
    if (collide) this.collider([cx - size / 2, y - 1, cz - size / 2], [cx + size / 2, y, cz + size / 2], mat);
  }

  // Merge every mesh inside a group into the static pool (respecting its world transform)
  mergeGroup(g) {
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      if (!o.isMesh) return;
      if (o.userData.noMerge || (o.material.transparent && o.material.opacity < 1)) {
        const clone = o.clone();
        o.matrixWorld.decompose(clone.position, clone.quaternion, clone.scale);
        this.dynamic.add(clone);
        return;
      }
      let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      const cast = o.userData.cast ?? true, receive = true;
      const key = o.material.uuid + (cast ? 'c' : '') + 'r';
      if (!this.static.has(key)) this.static.set(key, { material: o.material, geos: [], cast, receive });
      this.static.get(key).geos.push(geo);
    });
  }

  finalize() {
    const group = new THREE.Group();
    group.name = 'mapStatic';
    for (const { material, geos, cast, receive } of this.static.values()) {
      // split very large batches so frustum culling still helps
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = cast; mesh.receiveShadow = receive;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      for (const g of geos) g.dispose();
    }
    this.scene.add(group);
    this.static.clear();
    this.staticGroup = group;
    return group;
  }
}

export { M, solid, T };
