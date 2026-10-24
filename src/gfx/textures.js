// Procedural canvas textures. Everything is generated at runtime so the game ships with no image assets.
// In Node (no DOM) every factory returns null so geometry code can still be smoke-tested headless.
import * as THREE from 'three';

const HAS_DOM = typeof document !== 'undefined';
const cache = new Map();

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Tileable value noise rendered into a Float32Array
function noiseField(size, cells, seed, octaves = 4) {
  const out = new Float32Array(size * size);
  const r = rng(seed);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = cells << o;
    const grid = new Float32Array(n * n);
    for (let i = 0; i < grid.length; i++) grid[i] = r();
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * n, y0 = Math.floor(gy), fy = gy - y0;
      const sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * n, x0 = Math.floor(gx), fx = gx - x0;
        const sx = fx * fx * (3 - 2 * fx);
        const a = grid[(y0 % n) * n + (x0 % n)], b = grid[(y0 % n) * n + ((x0 + 1) % n)];
        const c = grid[((y0 + 1) % n) * n + (x0 % n)], d = grid[((y0 + 1) % n) * n + ((x0 + 1) % n)];
        out[y * size + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy);
      }
    }
    total += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function finish(c, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function cached(key, fn) {
  if (!HAS_DOM) return null;
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

const hex = (c) => new THREE.Color(c);

// Paint a noise field into a colour ramp between two colours
function paintNoise(ctx, size, field, c0, c1, contrast = 1) {
  const img = ctx.getImageData(0, 0, size, size);
  const a = hex(c0), b = hex(c1);
  for (let i = 0; i < field.length; i++) {
    let t = (field[i] - 0.5) * contrast + 0.5;
    t = Math.min(1, Math.max(0, t));
    img.data[i * 4] = (a.r + (b.r - a.r) * t) * 255;
    img.data[i * 4 + 1] = (a.g + (b.g - a.g) * t) * 255;
    img.data[i * 4 + 2] = (a.b + (b.b - a.b) * t) * 255;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// Height field -> tangent-space normal map
function normalFromHeight(size, h, strength = 2) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
      const u = h[((y - 1 + size) % size) * size + x], d = h[((y + 1) % size) * size + x];
      let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function grime(ctx, size, seed, count, color, alphaMax = 0.25) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = r() * size, y = r() * size, rad = 4 + r() * size * 0.12;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, color.replace('A', (r() * alphaMax).toFixed(3)));
    g.addColorStop(1, color.replace('A', '0'));
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

// ---------- Generic surfaces ----------

export function noiseRoughness(seed = 7, base = 0.5, varAmt = 0.3, size = 256) {
  return cached(`rough${seed}_${base}_${varAmt}`, () => {
    const c = canvas(size), ctx = c.getContext('2d');
    const f = noiseField(size, 8, seed, 5);
    const v0 = Math.max(0, base - varAmt) * 255, v1 = Math.min(1, base + varAmt) * 255;
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < f.length; i++) {
      const v = v0 + (v1 - v0) * f[i];
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // fine scratches
    const r = rng(seed + 3);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 60; i++) {
      const x = r() * size, y = r() * size, a = r() * Math.PI, l = 5 + r() * 30;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    return finish(c, { srgb: false });
  });
}

export function microNormal(seed = 11, strength = 1.5, size = 256) {
  return cached(`mnorm${seed}_${strength}`, () => {
    const f = noiseField(size, 16, seed, 4);
    return finish(normalFromHeight(size, f, strength), { srgb: false });
  });
}

// Painted steel with rust + streaks. Used for containers, ship hull etc.
export function paintedMetal(color = '#2f5d8a', seed = 3, rust = 0.5) {
  return cached(`pm${color}${seed}${rust}`, () => {
    const size = 512, c = canvas(size), ctx = c.getContext('2d');
    const base = hex(color);
    const dark = base.clone().multiplyScalar(0.72).getStyle();
    paintNoise(ctx, size, noiseField(size, 6, seed, 5), dark, base.getStyle(), 1.3);
    // vertical rain streaks
    const r = rng(seed * 7);
    for (let i = 0; i < 140; i++) {
      const x = r() * size, w = 1 + r() * 4, l = 30 + r() * 220, y = r() * size * 0.4;
      const g = ctx.createLinearGradient(0, y, 0, y + l);
      g.addColorStop(0, `rgba(40,25,10,${0.25 * rust + r() * 0.15})`);
      g.addColorStop(1, 'rgba(40,25,10,0)');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, l);
    }
    // rust blotches
    grime(ctx, size, seed + 1, Math.floor(60 * rust), 'rgba(120,58,20,A)', 0.55);
    grime(ctx, size, seed + 2, 40, 'rgba(0,0,0,A)', 0.2);
    // chipped paint
    for (let i = 0; i < 300 * rust; i++) {
      ctx.fillStyle = `rgba(${90 + r() * 60},${45 + r() * 30},${20},${0.5 + r() * 0.5})`;
      ctx.fillRect(r() * size, r() * size, 1 + r() * 3, 1 + r() * 3);
    }
    return finish(c);
  });
}

// Corrugated container wall normal map (ribs along U)
export function corrugatedNormal(ribs = 12) {
  return cached(`corr${ribs}`, () => {
    const size = 256, h = new Float32Array(size * size);
    const n = noiseField(size, 16, 5, 3);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const p = (x / size) * ribs;
      const f = p - Math.floor(p);
      // trapezoid profile
      const v = f < 0.15 ? f / 0.15 : f < 0.5 ? 1 : f < 0.65 ? 1 - (f - 0.5) / 0.15 : 0;
      h[y * size + x] = v * 6 + n[y * size + x] * 0.5;
    }
    return finish(normalFromHeight(size, h, 1.2), { srgb: false });
  });
}

export function concrete(seed = 21, tint = '#8d8a84') {
  return cached(`conc${seed}${tint}`, () => {
    const size = 512, c = canvas(size), ctx = c.getContext('2d');
    const t = hex(tint);
    paintNoise(ctx, size, noiseField(size, 8, seed, 6), t.clone().multiplyScalar(0.78).getStyle(), t.clone().multiplyScalar(1.08).getStyle(), 1.6);
    grime(ctx, size, seed + 4, 50, 'rgba(30,30,30,A)', 0.25);
    const r = rng(seed);
    for (let i = 0; i < 2500; i++) {
      const v = r() < 0.5 ? 0 : 255;
      ctx.fillStyle = `rgba(${v},${v},${v},${r() * 0.12})`;
      ctx.fillRect(r() * size, r() * size, 1.5, 1.5);
    }
    // cracks
    ctx.strokeStyle = 'rgba(20,20,20,0.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      let x = r() * size, y = r() * size;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 12; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    return finish(c);
  });
}

// Desert plaster / sandstone wall (Dust-style)
export function plaster(seed = 31, tint = '#cdb48a') {
  return cached(`pl${seed}${tint}`, () => {
    const size = 512, c = canvas(size), ctx = c.getContext('2d');
    const t = hex(tint);
    paintNoise(ctx, size, noiseField(size, 5, seed, 6), t.clone().multiplyScalar(0.82).getStyle(), t.clone().multiplyScalar(1.06).getStyle(), 1.4);
    grime(ctx, size, seed + 9, 30, 'rgba(110,80,40,A)', 0.3);
    // exposed bricks
    const r = rng(seed + 2);
    for (let p = 0; p < 4; p++) {
      const bx = r() * size, by = r() * size;
      for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) {
        if (r() < 0.35) continue;
        ctx.fillStyle = `rgba(${150 + r() * 30},${100 + r() * 20},${60},0.85)`;
        ctx.fillRect(bx + i * 26 + (j % 2) * 13, by + j * 12, 24, 10);
      }
    }
    // dirty bottom
    const g = ctx.createLinearGradient(0, size * 0.75, 0, size);
    g.addColorStop(0, 'rgba(90,60,30,0)'); g.addColorStop(1, 'rgba(90,60,30,0.35)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    return finish(c);
  });
}

export function sand(seed = 41) {
  return cached(`sand${seed}`, () => {
    const size = 512, c = canvas(size), ctx = c.getContext('2d');
    paintNoise(ctx, size, noiseField(size, 6, seed, 6), '#a88a5c', '#d8bf8e', 1.5);
    const r = rng(seed);
    for (let i = 0; i < 6000; i++) {
      ctx.fillStyle = `rgba(${r() < 0.5 ? 80 : 240},${r() < 0.5 ? 60 : 220},${40},${r() * 0.18})`;
      ctx.fillRect(r() * size, r() * size, 1, 1);
    }
    grime(ctx, size, seed + 1, 20, 'rgba(120,90,60,A)', 0.2);
    return finish(c);
  });
}

// Wood planks (deck, crates). vertical = planks run along V
export function planks(seed = 51, tint = '#8a6a44', count = 6) {
  return cached(`pk${seed}${tint}${count}`, () => {
    const size = 512, c = canvas(size), ctx = c.getContext('2d');
    const t = hex(tint), r = rng(seed);
    const pw = size / count;
    for (let i = 0; i < count; i++) {
      const k = 0.8 + r() * 0.35;
      ctx.fillStyle = t.clone().multiplyScalar(k).getStyle();
      ctx.fillRect(i * pw, 0, pw, size);
      // grain
      for (let g = 0; g < 50; g++) {
        const x = i * pw + r() * pw;
        ctx.strokeStyle = `rgba(${r() < 0.5 ? 40 : 200},${r() < 0.5 ? 25 : 160},10,${0.05 + r() * 0.12})`;
        ctx.lineWidth = 0.5 + r() * 1.5;
        ctx.beginPath(); ctx.moveTo(x, 0);
        for (let y = 0; y <= size; y += 32) ctx.lineTo(x + Math.sin(y * 0.02 + g) * 2 * r(), y);
        ctx.stroke();
      }
      // knot
      if (r() < 0.6) {
        const kx = i * pw + pw * 0.5, ky = r() * size;
        const gr = ctx.createRadialGradient(kx, ky, 0, kx, ky, 8);
        gr.addColorStop(0, 'rgba(40,20,5,0.8)'); gr.addColorStop(1, 'rgba(40,20,5,0)');
        ctx.fillStyle = gr; ctx.fillRect(kx - 10, ky - 10, 20, 20);
      }
      // seams
      ctx.fillStyle = 'rgba(20,10,0,0.75)';
      ctx.fillRect(i * pw, 0, 2, size);
      const cut = r() * size;
      ctx.fillRect(i * pw, cut, pw, 2);
      // nails
      ctx.fillStyle = 'rgba(30,30,30,0.9)';
      for (let y = 20; y < size; y += 128) { ctx.fillRect(i * pw + 6, y, 3, 3); ctx.fillRect(i * pw + pw - 9, y, 3, 3); }
    }
    grime(ctx, size, seed + 5, 30, 'rgba(0,0,0,A)', 0.25);
    return finish(c);
  });
}

// Steel diamond-plate (ship decks, catwalks)
export function diamondPlate(seed = 61) {
  return cached(`dp${seed}`, () => {
    const size = 256, c = canvas(size), ctx = c.getContext('2d');
    paintNoise(ctx, size, noiseField(size, 8, seed, 4), '#5a5d60', '#7b7f83', 1.2);
    for (let y = 0; y < size; y += 16) for (let x = 0; x < size; x += 16) {
      const ox = (y / 16) % 2 ? 8 : 0;
      ctx.save(); ctx.translate(x + ox + 4, y + 8); ctx.rotate(((y / 16) % 2 ? 1 : -1) * 0.7);
      ctx.fillStyle = 'rgba(200,205,210,0.55)'; ctx.fillRect(-5, -1.2, 10, 2.4);
      ctx.fillStyle = 'rgba(20,20,20,0.5)'; ctx.fillRect(-5, 1.2, 10, 1);
      ctx.restore();
    }
    grime(ctx, size, seed, 20, 'rgba(70,40,15,A)', 0.4);
    return finish(c);
  });
}

export function brick(seed = 71, tint = '#7a3b2a') {
  return cached(`br${seed}${tint}`, () => {
    const size = 512, c = canvas(size), ctx = c.getContext('2d');
    ctx.fillStyle = '#8e877a'; ctx.fillRect(0, 0, size, size);
    const t = hex(tint), r = rng(seed);
    const bh = 32, bw = 64;
    for (let y = 0; y < size; y += bh) for (let x = -bw; x < size; x += bw) {
      const ox = (y / bh) % 2 ? bw / 2 : 0;
      ctx.fillStyle = t.clone().multiplyScalar(0.7 + r() * 0.45).getStyle();
      ctx.fillRect(x + ox + 2, y + 2, bw - 4, bh - 4);
    }
    const f = noiseField(size, 16, seed, 3);
    const img = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < f.length; i++) { const k = 0.8 + f[i] * 0.4; img.data[i * 4] *= k; img.data[i * 4 + 1] *= k; img.data[i * 4 + 2] *= k; }
    ctx.putImageData(img, 0, 0);
    grime(ctx, size, seed + 3, 40, 'rgba(10,10,10,A)', 0.35);
    return finish(c);
  });
}

export function brickNormal() {
  return cached('brn', () => {
    const size = 256, h = new Float32Array(size * size), n = noiseField(size, 32, 9, 3);
    const bh = 16, bw = 32;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const row = Math.floor(y / bh), ox = row % 2 ? bw / 2 : 0;
      const lx = (x + ox) % bw, ly = y % bh;
      const mortar = lx < 2 || ly < 2 ? 0 : 1;
      h[y * size + x] = mortar * 3 + n[y * size + x];
    }
    return finish(normalFromHeight(size, h, 1.5), { srgb: false });
  });
}

// Water normals (tileable, two layers scrolled in material)
export function waterNormal() {
  return cached('waterN', () => {
    const size = 512, f = noiseField(size, 8, 99, 6);
    const r = rng(3);
    for (let w = 0; w < 6; w++) {
      const fx = Math.floor(1 + r() * 6), fy = Math.floor(1 + r() * 6), ph = r() * 6.28;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        f[y * size + x] += 0.12 * Math.sin(((x * fx + y * fy) / size) * Math.PI * 2 + ph);
      }
    }
    return finish(normalFromHeight(size, f, 6), { srgb: false });
  });
}

// Gun-metal parkerised finish with edge wear
export function gunmetal(seed = 81, tint = '#2b2d30') {
  return cached(`gm${seed}${tint}`, () => {
    const size = 256, c = canvas(size), ctx = c.getContext('2d');
    const t = hex(tint);
    paintNoise(ctx, size, noiseField(size, 16, seed, 5), t.clone().multiplyScalar(0.8).getStyle(), t.clone().multiplyScalar(1.25).getStyle(), 1.2);
    const r = rng(seed);
    ctx.strokeStyle = 'rgba(160,165,170,0.18)'; ctx.lineWidth = 0.5;
    for (let i = 0; i < 80; i++) {
      const x = r() * size, y = r() * size, a = r() * Math.PI, l = 3 + r() * 18;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    return finish(c);
  });
}

export function woodStock(seed = 91, tint = '#7a3e1c') {
  return cached(`ws${seed}${tint}`, () => {
    const size = 256, c = canvas(size), ctx = c.getContext('2d');
    const t = hex(tint), r = rng(seed);
    ctx.fillStyle = t.getStyle(); ctx.fillRect(0, 0, size, size);
    for (let g = 0; g < 120; g++) {
      const y = r() * size;
      ctx.strokeStyle = `rgba(${r() < 0.5 ? 30 : 170},${r() < 0.5 ? 12 : 90},5,${0.06 + r() * 0.16})`;
      ctx.lineWidth = 0.5 + r() * 2;
      ctx.beginPath(); ctx.moveTo(0, y);
      for (let x = 0; x <= size; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.03 + g) * 3);
      ctx.stroke();
    }
    return finish(c);
  });
}

// Camo pattern (soldier uniforms)
export function camo(colors = ['#4b5320', '#6b6b3a', '#3b3324', '#2a2a1e'], seed = 101) {
  return cached(`camo${colors.join()}${seed}`, () => {
    const size = 256, c = canvas(size), ctx = c.getContext('2d');
    ctx.fillStyle = colors[0]; ctx.fillRect(0, 0, size, size);
    const r = rng(seed);
    for (let k = 1; k < colors.length; k++) {
      ctx.fillStyle = colors[k];
      for (let i = 0; i < 22; i++) {
        const x = r() * size, y = r() * size;
        ctx.beginPath();
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2, rad = 8 + r() * 22;
          const px = x + Math.cos(ang) * rad, py = y + Math.sin(ang) * rad;
          a ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.closePath(); ctx.fill();
        // wrap copies for tiling
        ctx.save(); ctx.translate(x > size / 2 ? -size : size, 0); ctx.fill(); ctx.restore();
      }
    }
    const f = noiseField(size, 32, seed, 2);
    const img = ctx.getImageData(0, 0, size, size);
    for (let i = 0; i < f.length; i++) { const k = 0.85 + f[i] * 0.3; img.data[i * 4] *= k; img.data[i * 4 + 1] *= k; img.data[i * 4 + 2] *= k; }
    ctx.putImageData(img, 0, 0);
    return finish(c);
  });
}

// Fabric weave normal for clothes
export function fabricNormal() {
  return cached('fabN', () => {
    const size = 128, h = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      h[y * size + x] = Math.sin(x * 1.6) * Math.sin(y * 1.6) * 0.5 + ((x + y) % 4 < 2 ? 0.2 : 0);
    }
    return finish(normalFromHeight(size, h, 0.8), { srgb: false, repeat: [4, 4] });
  });
}

// Zombie skin: mottled pale green with veins and gore
export function zombieSkin(seed = 111, tint = '#7d8f6a') {
  return cached(`zs${seed}${tint}`, () => {
    const size = 256, c = canvas(size), ctx = c.getContext('2d');
    const t = hex(tint);
    paintNoise(ctx, size, noiseField(size, 8, seed, 5), t.clone().multiplyScalar(0.65).getStyle(), t.clone().multiplyScalar(1.15).getStyle(), 1.5);
    const r = rng(seed);
    ctx.strokeStyle = 'rgba(70,30,60,0.35)';
    for (let i = 0; i < 40; i++) {
      let x = r() * size, y = r() * size;
      ctx.lineWidth = 0.5 + r();
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 18; y += (r() - 0.5) * 18; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    grime(ctx, size, seed + 1, 25, 'rgba(110,10,10,A)', 0.7);
    grime(ctx, size, seed + 2, 25, 'rgba(20,30,10,A)', 0.5);
    return finish(c);
  });
}

// Radial soft sprite (particles, glow)
export function softDot(color = '255,255,255') {
  return cached(`dot${color}`, () => {
    const size = 64, c = canvas(size), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, `rgba(${color},1)`); g.addColorStop(0.4, `rgba(${color},0.5)`); g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    return finish(c);
  });
}

// Muzzle flash star sprite
export function muzzleFlash() {
  return cached('mflash', () => {
    const size = 128, c = canvas(size), ctx = c.getContext('2d');
    ctx.translate(64, 64);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 60);
    g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(0.25, 'rgba(255,200,80,0.9)'); g.addColorStop(1, 'rgba(255,90,0,0)');
    ctx.fillStyle = g;
    for (let i = 0; i < 7; i++) {
      ctx.rotate((Math.PI * 2) / 7);
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(0, -62 + (i % 2) * 22); ctx.lineTo(7, 0); ctx.closePath(); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
    return finish(c);
  });
}

export function bulletHole() {
  return cached('bhole', () => {
    const size = 64, c = canvas(size), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.18, 'rgba(10,10,10,0.95)'); g.addColorStop(0.3, 'rgba(40,35,30,0.6)'); g.addColorStop(1, 'rgba(40,35,30,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    return finish(c);
  });
}

export function bloodSplat(seed = 5) {
  return cached(`blood${seed}`, () => {
    const size = 128, c = canvas(size), ctx = c.getContext('2d'), r = rng(seed);
    ctx.fillStyle = 'rgba(110,0,0,0.9)';
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2, d = r() * 40, rad = 3 + r() * 14;
      ctx.beginPath(); ctx.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rad * (1 - d / 60), 0, Math.PI * 2); ctx.fill();
    }
    return finish(c);
  });
}

// Simple text/decal texture: signage, container logos, site letters
export function label(text, { w = 512, h = 256, bg = 'rgba(0,0,0,0)', fg = '#ffffff', font = 'bold 150px Arial', stroke = null } = {}) {
  return cached(`lbl${text}${w}${h}${bg}${fg}${font}`, () => {
    const c = canvas(w, h), ctx = c.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 8; ctx.strokeText(text, w / 2, h / 2); }
    ctx.fillStyle = fg; ctx.fillText(text, w / 2, h / 2);
    const t = finish(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

// Hazard stripes (yellow/black)
export function hazard() {
  return cached('haz', () => {
    const size = 256, c = canvas(size), ctx = c.getContext('2d');
    ctx.fillStyle = '#e0b422'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#1a1a1a';
    for (let i = -size; i < size * 2; i += 64) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 32, 0); ctx.lineTo(i + 32 - size, size); ctx.lineTo(i - size, size); ctx.closePath(); ctx.fill();
    }
    grime(ctx, size, 4, 30, 'rgba(0,0,0,A)', 0.3);
    return finish(c);
  });
}
