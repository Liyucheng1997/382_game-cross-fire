// Collision world: axis-aligned boxes + axis-aligned ramps. Also provides ray casts and ground queries.
// Maps are 2.5D (a single walkable surface per x/z column for navigation) but colliders can stack freely.
import * as THREE from 'three';

export class World {
  constructor() {
    this.boxes = [];   // {min:[x,y,z], max:[x,y,z], mat:'metal'|'wood'|'concrete'|'sand'|'glass'}
    this.ramps = [];   // {min, max, axis:'x'|'z', dir:1|-1, mat}  surface rises from min side (dir=1) toward max side
    this.grid = new Map(); // spatial hash of collider indices, 4m cells
    this.cell = 4;
  }

  // flags.nav=false: collider still blocks movement/bullets but is ignored when baking the nav grid
  // (roofs, canopies, door lintels hanging over walkable floor).
  addBox(min, max, mat = 'metal', flags = {}) {
    const b = { min: [...min], max: [...max], mat, ramp: false, nav: flags.nav !== false };
    this._insert(b);
    this.boxes.push(b);
    return b;
  }

  // axis: direction the slope climbs along; dir=+1 means low at min[axis], high at max[axis]
  addRamp(min, max, axis = 'z', dir = 1, mat = 'metal') {
    const r = { min: [...min], max: [...max], axis, dir, mat, ramp: true, nav: true };
    this._insert(r);
    this.ramps.push(r);
    return r;
  }

  _insert(c) {
    const s = this.cell;
    for (let gx = Math.floor(c.min[0] / s); gx <= Math.floor(c.max[0] / s); gx++)
      for (let gz = Math.floor(c.min[2] / s); gz <= Math.floor(c.max[2] / s); gz++) {
        const k = gx * 73856093 ^ gz * 19349663;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(c);
      }
  }

  // colliders overlapping an x/z rectangle
  query(x0, z0, x1, z1, out = []) {
    out.length = 0;
    const s = this.cell, seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let gx = Math.floor(x0 / s); gx <= Math.floor(x1 / s); gx++)
      for (let gz = Math.floor(z0 / s); gz <= Math.floor(z1 / s); gz++) {
        const arr = this.grid.get(gx * 73856093 ^ gz * 19349663);
        if (!arr) continue;
        for (const c of arr) if (!seen.has(c)) { seen.add(c); out.push(c); }
      }
    return out;
  }

  // Height of ramp surface at x,z (assumes inside footprint)
  static rampHeight(r, x, z) {
    const ai = r.axis === 'x' ? 0 : 2;
    const p = r.axis === 'x' ? x : z;
    let t = (p - r.min[ai]) / (r.max[ai] - r.min[ai]);
    t = Math.min(1, Math.max(0, t));
    if (r.dir < 0) t = 1 - t;
    return r.min[1] + (r.max[1] - r.min[1]) * t;
  }

  // Highest walkable surface under (x,z) whose top is <= maxY. radius expands the footprint check.
  groundHeight(x, z, maxY = Infinity, radius = 0) {
    let best = -Infinity, bestMat = null;
    const list = this.query(x - radius, z - radius, x + radius, z + radius, this._q1 || (this._q1 = []));
    for (const c of list) {
      if (x < c.min[0] - radius || x > c.max[0] + radius || z < c.min[2] - radius || z > c.max[2] + radius) continue;
      let top;
      if (c.ramp) {
        // ramps: sample at clamped point so standing at an edge still works
        const cx = Math.min(c.max[0], Math.max(c.min[0], x)), cz = Math.min(c.max[2], Math.max(c.min[2], z));
        top = World.rampHeight(c, cx, cz);
      } else top = c.max[1];
      if (top <= maxY && top > best) { best = top; bestMat = c.mat; }
    }
    this.lastGroundMat = bestMat;
    return best;
  }

  // Lowest ceiling above y at (x,z) (for jump head-bump)
  ceilingHeight(x, z, y, radius = 0) {
    let best = Infinity;
    const list = this.query(x - radius, z - radius, x + radius, z + radius, this._q1 || (this._q1 = []));
    for (const c of list) {
      if (c.ramp) continue;
      if (x < c.min[0] - radius || x > c.max[0] + radius || z < c.min[2] - radius || z > c.max[2] + radius) continue;
      if (c.min[1] >= y && c.min[1] < best) best = c.min[1];
    }
    return best;
  }

  // Resolve a vertical cylinder (feet at pos.y, height h, radius r) against boxes horizontally.
  // Colliders whose top is within stepUp of the feet are ignored (handled as ground / stairs).
  collideHorizontal(pos, r, h, stepUp = 0.45) {
    const list = this.query(pos.x - r - 0.1, pos.z - r - 0.1, pos.x + r + 0.1, pos.z + r + 0.1, this._q2 || (this._q2 = []));
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      for (const c of list) {
        if (c.ramp) {
          // treat ramp sides as walls only when the ramp surface there is too high to step onto
          const top = World.rampHeight(c, Math.min(c.max[0], Math.max(c.min[0], pos.x)), Math.min(c.max[2], Math.max(c.min[2], pos.z)));
          if (top <= pos.y + stepUp || c.min[1] >= pos.y + h) continue;
        } else {
          if (c.max[1] <= pos.y + stepUp || c.min[1] >= pos.y + h) continue;
        }
        const cx = Math.min(c.max[0], Math.max(c.min[0], pos.x));
        const cz = Math.min(c.max[2], Math.max(c.min[2], pos.z));
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = r - d;
          pos.x += (dx / d) * push; pos.z += (dz / d) * push;
        } else {
          // center inside box: push out along smallest axis
          const px0 = pos.x - c.min[0], px1 = c.max[0] - pos.x, pz0 = pos.z - c.min[2], pz1 = c.max[2] - pos.z;
          const m = Math.min(px0, px1, pz0, pz1);
          if (m === px0) pos.x = c.min[0] - r; else if (m === px1) pos.x = c.max[0] + r;
          else if (m === pz0) pos.z = c.min[2] - r; else pos.z = c.max[2] + r;
        }
        hit = true;
      }
    }
    return hit;
  }

  // Ray vs world. Returns {t, point, normal, mat} or null. dir must be normalised.
  raycast(origin, dir, maxDist = 500) {
    let best = maxDist, bestN = null, bestMat = null;
    const ox = origin.x, oy = origin.y, oz = origin.z;
    const dx = dir.x, dy = dir.y, dz = dir.z;
    // walk the spatial grid along the ray (2D DDA over x/z)
    const s = this.cell;
    let gx = Math.floor(ox / s), gz = Math.floor(oz / s);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = Math.abs(s / (dx || 1e-9)), tDeltaZ = Math.abs(s / (dz || 1e-9));
    let tMaxX = dx > 0 ? ((gx + 1) * s - ox) / dx : dx < 0 ? (gx * s - ox) / dx : Infinity;
    let tMaxZ = dz > 0 ? ((gz + 1) * s - oz) / dz : dz < 0 ? (gz * s - oz) / dz : Infinity;
    const tested = this._tested || (this._tested = new Set());
    tested.clear();
    let tCell = 0;
    for (let steps = 0; steps < 400 && tCell <= best; steps++) {
      const arr = this.grid.get(gx * 73856093 ^ gz * 19349663);
      if (arr) for (const c of arr) {
        if (tested.has(c)) continue;
        tested.add(c);
        const res = c.ramp ? rayRamp(c, ox, oy, oz, dx, dy, dz, best) : rayBox(c, ox, oy, oz, dx, dy, dz, best);
        if (res) { best = res.t; bestN = res.n; bestMat = c.mat; }
      }
      if (tMaxX < tMaxZ) { tCell = tMaxX; tMaxX += tDeltaX; gx += stepX; }
      else { tCell = tMaxZ; tMaxZ += tDeltaZ; gz += stepZ; }
    }
    if (!bestN) return null;
    return {
      t: best,
      point: new THREE.Vector3(ox + dx * best, oy + dy * best, oz + dz * best),
      normal: new THREE.Vector3(bestN[0], bestN[1], bestN[2]),
      mat: bestMat,
    };
  }

  lineOfSight(a, b) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    if (len < 1e-4) return true;
    d.divideScalar(len);
    const h = this.raycast(a, d, len);
    return !h;
  }
}

function rayBox(c, ox, oy, oz, dx, dy, dz, maxT) {
  let tmin = 0, tmax = maxT, n = null;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < c.min[i] || o[i] > c.max[i]) return null;
      continue;
    }
    let t1 = (c.min[i] - o[i]) / d[i], t2 = (c.max[i] - o[i]) / d[i];
    let sign = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; sign = 1; }
    if (t1 > tmin) { tmin = t1; n = [0, 0, 0]; n[i] = sign; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (!n) return null; // origin inside box
  return { t: tmin, n };
}

function rayRamp(c, ox, oy, oz, dx, dy, dz, maxT) {
  // Clip against bounding box first, then intersect slope plane inside it
  const bb = rayBox(c, ox, oy, oz, dx, dy, dz, maxT);
  const ai = c.axis === 'x' ? 0 : 2;
  const len = c.max[ai] - c.min[ai], hgt = c.max[1] - c.min[1];
  // plane: y = min.y + hgt * (p - min[ai]) / len  (dir 1)  -> normal
  const s = (hgt / len) * c.dir;
  const n = [0, 1, 0];
  n[ai] = -s;
  const nl = Math.hypot(n[0], n[1], n[2]);
  n[0] /= nl; n[1] /= nl; n[2] /= nl;
  const p0 = c.dir > 0 ? c.min[ai] : c.max[ai];
  // point on plane
  const P = [0, c.min[1], 0]; P[ai] = p0;
  const denom = n[0] * dx + n[1] * dy + n[2] * dz;
  if (Math.abs(denom) > 1e-9) {
    const t = ((P[0] - ox) * n[0] + (P[1] - oy) * n[1] + (P[2] - oz) * n[2]) / denom;
    if (t > 0 && t < maxT) {
      const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
      if (x >= c.min[0] - 1e-3 && x <= c.max[0] + 1e-3 && z >= c.min[2] - 1e-3 && z <= c.max[2] + 1e-3 && y >= c.min[1] - 1e-3 && y <= c.max[1] + 1e-3) {
        return { t, n };
      }
    }
  }
  // side faces of the wedge (hit the bbox side below the slope)
  if (bb && bb.n[1] === 0) {
    const x = ox + dx * bb.t, y = oy + dy * bb.t, z = oz + dz * bb.t;
    if (y <= World.rampHeight(c, x, z) + 1e-3) return bb;
  }
  return null;
}
