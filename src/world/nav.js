// 2.5D navigation grid baked from world colliders + A* with jump/drop edges and path smoothing.
import { World } from './world.js';

const CELL = 0.5;
const WALK = 0.5;   // max step without jumping
const JUMP = 1.15;  // max climb with a jump
const DROP = 4.0;   // max safe drop

class Heap {
  constructor() { this.a = []; this.p = []; }
  push(v, pr) { const a = this.a, p = this.p; a.push(v); p.push(pr); let i = a.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (p[j] <= p[i]) break; [a[i], a[j]] = [a[j], a[i]]; [p[i], p[j]] = [p[j], p[i]]; i = j; } }
  pop() {
    const a = this.a, p = this.p, top = a[0], lv = a.pop(), lp = p.pop();
    if (a.length) {
      a[0] = lv; p[0] = lp; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && p[l] < p[m]) m = l; if (r < a.length && p[r] < p[m]) m = r; if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; [p[i], p[m]] = [p[m], p[i]]; i = m; }
    }
    return top;
  }
  get size() { return this.a.length; }
}

export class NavGrid {
  constructor(world, bounds, killY = -50) {
    this.world = world;
    const [x0, z0, x1, z1] = bounds;
    this.x0 = x0; this.z0 = z0;
    this.w = Math.ceil((x1 - x0) / CELL); this.h = Math.ceil((z1 - z0) / CELL);
    const n = this.w * this.h;
    this.height = new Float32Array(n);
    this.ok = new Uint8Array(n);
    this.cost = new Float32Array(n);
    const q = [];
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const x = x0 + (i + 0.5) * CELL, z = z0 + (j + 0.5) * CELL;
      const k = j * this.w + i;
      // conservative raster: any collider overlapping the cell counts, so thin fences/railings
      // can't slip between cell centres
      const hh = CELL * 0.45;
      world.query(x - hh, z - hh, x + hh, z + hh, q);
      let best = -Infinity, floor = -Infinity;
      for (const c of q) {
        if (!c.nav) continue;
        if (x + hh < c.min[0] || x - hh > c.max[0] || z + hh < c.min[2] || z - hh > c.max[2]) continue;
        const inside = x >= c.min[0] && x <= c.max[0] && z >= c.min[2] && z <= c.max[2];
        const top = c.ramp ? World.rampHeight(c, Math.min(c.max[0], Math.max(c.min[0], x)), Math.min(c.max[2], Math.max(c.min[2], z))) : c.max[1];
        if (inside && top > floor) floor = top;
        // partial overlaps only matter when they stick up above the floor (walls), small lips are ignored
        if (top > best) best = top;
      }
      if (floor > -Infinity && best - floor <= WALK) best = floor;
      this.height[k] = best;
      let ok = best > killY && best > -1e5;
      if (ok) {
        // head clearance (roofs flagged nav:false still block)
        const ceil = world.ceilingHeight(x, z, best + 0.05, 0);
        if (ceil - best < 1.75) ok = false;
      }
      this.ok[k] = ok ? 1 : 0;
    }
    // wall proximity cost so paths keep off walls
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const k = j * this.w + i;
      if (!this.ok[k]) continue;
      let pen = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= this.w || jj >= this.h) { pen = 3; continue; }
        const kk = jj * this.w + ii;
        if (!this.ok[kk] || this.height[kk] - this.height[k] > WALK || this.height[k] - this.height[kk] > WALK) pen = Math.max(pen, 2.5);
      }
      this.cost[k] = pen;
      if (pen >= 2.5) this.edge = true;
    }
    // walkable cells list for random roaming
    this.cells = [];
    for (let k = 0; k < n; k++) if (this.ok[k] && this.cost[k] === 0) this.cells.push(k);
    this.gScore = new Float32Array(n);
    this.from = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.curStamp = 1;
    // connected components (walk+jump) so we can pick reachable destinations
    this.comp = new Int32Array(n).fill(-1);
    let cid = 0;
    const stack = [];
    for (const s of this.cells) {
      if (this.comp[s] >= 0) continue;
      stack.push(s); this.comp[s] = cid;
      while (stack.length) {
        const k = stack.pop(), i = k % this.w, j = (k / this.w) | 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= this.w || jj >= this.h) continue;
          const kk = jj * this.w + ii;
          if (!this.ok[kk] || this.comp[kk] >= 0) continue;
          const dh = Math.abs(this.height[kk] - this.height[k]);
          if (dh > WALK) continue;
          this.comp[kk] = cid; stack.push(kk);
        }
      }
      cid++;
    }
  }

  idx(x, z) {
    const i = Math.floor((x - this.x0) / CELL), j = Math.floor((z - this.z0) / CELL);
    if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1;
    return j * this.w + i;
  }
  cx(k) { return this.x0 + ((k % this.w) + 0.5) * CELL; }
  cz(k) { return this.z0 + (((k / this.w) | 0) + 0.5) * CELL; }

  // nearest walkable cell to a point, preferring cells near height y
  nearest(x, z, y = null, maxR = 8) {
    const k0 = this.idx(x, z);
    if (k0 >= 0 && this.ok[k0] && (y === null || Math.abs(this.height[k0] - y) < 1.2)) return k0;
    const i0 = Math.floor((x - this.x0) / CELL), j0 = Math.floor((z - this.z0) / CELL);
    let best = -1, bd = Infinity;
    for (let r = 1; r <= maxR; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
        const k = j * this.w + i;
        if (!this.ok[k]) continue;
        const d = di * di + dj * dj + (y === null ? 0 : (this.height[k] - y) ** 2 * 16) + this.cost[k];
        if (d < bd) { bd = d; best = k; }
      }
      if (best >= 0 && r >= 2) break;
    }
    return best;
  }

  randomCell(rand = Math.random) { return this.cells[Math.floor(rand() * this.cells.length)]; }
  randomPoint(rand = Math.random) {
    const k = this.randomCell(rand);
    return { x: this.cx(k), y: this.height[k], z: this.cz(k) };
  }

  // A* from world pos a to b. canJump enables jump edges. Returns array of {x,y,z,jump} or null.
  findPath(ax, ay, az, bx, by, bz, { canJump = true, maxIter = 30000 } = {}) {
    const s = this.nearest(ax, az, ay), t = this.nearest(bx, bz, by);
    if (s < 0 || t < 0) return null;
    if (s === t) return [{ x: bx, y: this.height[t], z: bz, jump: false }];
    const stamp = ++this.curStamp;
    const W = this.w, H = this.h, hgt = this.height, ok = this.ok, cost = this.cost;
    const g = this.gScore, from = this.from, st = this.stamp, closed = this.closed;
    const tx = t % W, tz = (t / W) | 0;
    const heap = new Heap();
    g[s] = 0; st[s] = stamp; from[s] = -1;
    heap.push(s, 0);
    let iter = 0, found = false, bestK = s, bestH = Infinity;
    const climb = canJump ? JUMP : WALK;
    while (heap.size && iter++ < maxIter) {
      const k = heap.pop();
      if (closed[k] === stamp) continue;
      closed[k] = stamp;
      if (k === t) { found = true; break; }
      const i = k % W, j = (k / W) | 0;
      const hk = hgt[k];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
        const kk = jj * W + ii;
        if (!ok[kk] || closed[kk] === stamp) continue;
        const dh = hgt[kk] - hk;
        if (dh > climb || dh < -DROP) continue;
        // diagonal corner cutting check
        if (di && dj) {
          const a = j * W + ii, b = jj * W + i;
          if (!ok[a] || !ok[b] || Math.abs(hgt[a] - hk) > climb || Math.abs(hgt[b] - hk) > climb) continue;
        }
        let c = (di && dj ? 1.414 : 1) + cost[kk];
        if (dh > WALK) c += 4;   // jump
        if (dh < -WALK) c += 1.5; // drop
        const ng = g[k] + c;
        if (st[kk] !== stamp || ng < g[kk]) {
          st[kk] = stamp; g[kk] = ng; from[kk] = k;
          const hx = Math.abs(ii - tx), hz = Math.abs(jj - tz);
          const hh = Math.max(hx, hz) + 0.414 * Math.min(hx, hz);
          if (hh < bestH) { bestH = hh; bestK = kk; }
          heap.push(kk, ng + hh * 1.05);
        }
      }
    }
    let end = found ? t : bestK;
    if (end === s) return null;
    const raw = [];
    for (let k = end; k !== -1; k = from[k]) raw.push(k);
    raw.reverse();
    return this.smooth(raw, found ? { x: bx, z: bz } : null);
  }

  // String-pull: keep a waypoint only where straight walking would fail
  smooth(raw, goal) {
    const out = [];
    let a = 0;
    while (a < raw.length - 1) {
      let b = Math.min(raw.length - 1, a + 40);
      while (b > a + 1 && !this.walkableLine(raw[a], raw[b])) b--;
      const k = raw[b];
      const prevH = this.height[raw[b - 1]];
      out.push({ x: this.cx(k), y: this.height[k], z: this.cz(k), jump: this.height[k] - prevH > WALK });
      a = b;
    }
    if (goal && out.length) { const last = out[out.length - 1]; last.x = goal.x; last.z = goal.z; }
    return out;
  }

  walkableLine(ka, kb) {
    const ax = this.cx(ka), az = this.cz(ka), bx = this.cx(kb), bz = this.cz(kb);
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / (CELL * 0.5));
    // sweep the centre line and both shoulders of the walker
    const px = -(bz - az) / (d || 1) * 0.3, pz = (bx - ax) / (d || 1) * 0.3;
    for (const off of [0, 1, -1]) {
      let ph = this.height[ka];
      for (let s = 1; s <= n; s++) {
        const t = s / n, k = this.idx(ax + (bx - ax) * t + px * off, az + (bz - az) * t + pz * off);
        if (k < 0 || !this.ok[k] || (off === 0 && this.cost[k] > 0)) return false;
        const h = this.height[k];
        if (Math.abs(h - ph) > WALK) return false;
        ph = h;
      }
    }
    return true;
  }

  sameComponent(ax, az, bx, bz) {
    const a = this.nearest(ax, az), b = this.nearest(bx, bz);
    return a >= 0 && b >= 0 && this.comp[a] >= 0 && this.comp[a] === this.comp[b];
  }
}
