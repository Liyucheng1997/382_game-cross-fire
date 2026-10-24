// Procedural audio: every sound is synthesised into AudioBuffers at startup, then played through
// HRTF panners for 3D positioning. Announcer lines use speechSynthesis when available.
import * as THREE from 'three';

let ctx = null, master = null, sfxBus = null, reverb = null, reverbSend = null, musicBus = null;
const buffers = new Map();
const listenerPos = new THREE.Vector3();
let volume = 0.8;

function rnd(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function makeBuffer(dur, fn, seed = 1) {
  const sr = ctx.sampleRate, n = Math.floor(dur * sr);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  fn(d, sr, rnd(seed * 9301 + 49297));
  // normalise
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak > 0) for (let i = 0; i < n; i++) d[i] /= peak;
  return buf;
}

// one-pole filters
function lowpass(d, sr, fc) { const a = Math.exp(-2 * Math.PI * fc / sr); let y = 0; for (let i = 0; i < d.length; i++) { y = (1 - a) * d[i] + a * y; d[i] = y; } }
function highpass(d, sr, fc) { const a = Math.exp(-2 * Math.PI * fc / sr); let y = 0, x0 = 0; for (let i = 0; i < d.length; i++) { const x = d[i]; y = a * (y + x - x0); x0 = x; d[i] = y; } }

function gunshot({ dur = 0.6, crack = 1, crackDecay = 60, body = 0.8, bodyDecay = 14, bodyLP = 1800, thump = 1, f0 = 140, f1 = 45, thumpDecay = 20, tail = 0.3, tailDecay = 4, hp = 60 }) {
  return (d, sr, r) => {
    const n = d.length;
    const crk = new Float32Array(n), bod = new Float32Array(n), tl = new Float32Array(n);
    for (let i = 0; i < n; i++) { const w = r() * 2 - 1; crk[i] = w; bod[i] = w; tl[i] = r() * 2 - 1; }
    highpass(crk, sr, 2500);
    lowpass(bod, sr, bodyLP); lowpass(bod, sr, bodyLP);
    lowpass(tl, sr, 900);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const f = f1 + (f0 - f1) * Math.exp(-t * 25);
      ph += (2 * Math.PI * f) / sr;
      const attack = Math.min(1, t * 2000);
      d[i] = attack * (
        crack * crk[i] * Math.exp(-t * crackDecay) +
        body * bod[i] * Math.exp(-t * bodyDecay) * 2.5 +
        thump * Math.sin(ph) * Math.exp(-t * thumpDecay) +
        tail * tl[i] * Math.exp(-t * tailDecay) * 2
      );
    }
    highpass(d, sr, hp);
  };
}

const SHOTS = {
  ak: { dur: 0.7, crack: 0.9, body: 1, bodyDecay: 12, bodyLP: 1600, f0: 160, f1: 50, tail: 0.35 },
  rifle: { dur: 0.6, crack: 0.9, body: 0.9, bodyDecay: 14, bodyLP: 2000, f0: 170, f1: 55, tail: 0.3 },
  m4s: { dur: 0.35, crack: 0.25, crackDecay: 90, body: 0.7, bodyDecay: 30, bodyLP: 900, f0: 120, f1: 60, thump: 0.6, tail: 0.05, hp: 150 },
  smg: { dur: 0.4, crack: 0.8, body: 0.8, bodyDecay: 22, bodyLP: 2400, f0: 200, f1: 70, thump: 0.6, tail: 0.2 },
  pistol: { dur: 0.45, crack: 1, body: 0.7, bodyDecay: 20, bodyLP: 2600, f0: 220, f1: 80, thump: 0.6, tail: 0.2 },
  deagle: { dur: 0.8, crack: 1, body: 1, bodyDecay: 10, bodyLP: 1500, f0: 130, f1: 40, thump: 1.2, tail: 0.4 },
  shotgun: { dur: 0.9, crack: 0.7, body: 1.2, bodyDecay: 8, bodyLP: 1200, f0: 110, f1: 35, thump: 1.4, tail: 0.5, tailDecay: 3 },
  awm: { dur: 1.6, crack: 1, body: 1.2, bodyDecay: 7, bodyLP: 1300, f0: 100, f1: 30, thump: 1.5, thumpDecay: 10, tail: 0.6, tailDecay: 2 },
  barrett: { dur: 1.8, crack: 1, body: 1.3, bodyDecay: 6, bodyLP: 1100, f0: 90, f1: 28, thump: 1.8, thumpDecay: 8, tail: 0.7, tailDecay: 1.8 },
  svd: { dur: 1.1, crack: 1, body: 1.1, bodyDecay: 9, bodyLP: 1500, f0: 120, f1: 40, thump: 1.2, tail: 0.5, tailDecay: 2.5 },
  mg: { dur: 0.6, crack: 0.9, body: 1, bodyDecay: 13, bodyLP: 1700, f0: 150, f1: 48, tail: 0.35 },
};

function click(freq = 3000, dur = 0.05, decay = 120, ring = 0) {
  return (d, sr, r) => {
    for (let i = 0; i < d.length; i++) {
      const t = i / sr;
      d[i] = (r() * 2 - 1) * Math.exp(-t * decay) + ring * Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * decay * 0.5);
    }
    highpass(d, sr, freq * 0.4);
  };
}

function build() {
  for (const [k, p] of Object.entries(SHOTS)) for (let v = 0; v < 3; v++) buffers.set(`shot_${k}_${v}`, makeBuffer(p.dur, gunshot(p), v + k.length * 7));
  buffers.set('dry', makeBuffer(0.08, click(2200, 0.08, 90, 0.3), 3));
  buffers.set('mag_out', makeBuffer(0.18, (d, sr, r) => { click(1800, 0.18, 40, 0.4)(d, sr, r); }, 4));
  buffers.set('mag_in', makeBuffer(0.2, (d, sr, r) => {
    for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * (Math.exp(-t * 80) + 0.8 * Math.exp(-Math.max(0, t - 0.07) * 100) * (t > 0.07)); }
    highpass(d, sr, 900);
  }, 5));
  buffers.set('bolt', makeBuffer(0.35, (d, sr, r) => {
    for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * (Math.exp(-t * 60) + Math.exp(-Math.max(0, t - 0.16) * 70) * (t > 0.16)) + 0.3 * Math.sin(t * 2 * Math.PI * 2400) * Math.exp(-t * 30); }
    highpass(d, sr, 700);
  }, 6));
  buffers.set('pump', makeBuffer(0.4, (d, sr, r) => {
    for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * (0.7 * Math.exp(-t * 40) + Math.exp(-Math.max(0, t - 0.2) * 60) * (t > 0.2)); }
    lowpass(d, sr, 3000); highpass(d, sr, 300);
  }, 7));
  buffers.set('shell_in', makeBuffer(0.12, click(2600, 0.12, 70, 0.5), 8));
  buffers.set('draw', makeBuffer(0.25, (d, sr, r) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * Math.sin(Math.PI * t / 0.25) * 0.5; } highpass(d, sr, 1500); }, 9));
  buffers.set('casing', makeBuffer(0.25, (d, sr) => {
    for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * 4200 * t) * Math.exp(-t * 35) + 0.6 * Math.sin(2 * Math.PI * 6100 * t) * Math.exp(-t * 50) + 0.4 * Math.sin(2 * Math.PI * 4200 * t) * Math.exp(-Math.max(0, t - 0.09) * 40) * (t > 0.09); }
  }, 10));
  buffers.set('swing', makeBuffer(0.3, (d, sr, r) => {
    for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * Math.sin(Math.PI * t / 0.3) ** 2; }
    lowpass(d, sr, 2500); highpass(d, sr, 400);
  }, 11));
  buffers.set('stab', makeBuffer(0.3, (d, sr, r) => {
    for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * Math.exp(-t * 25) + Math.sin(2 * Math.PI * 90 * t) * Math.exp(-t * 20); }
    lowpass(d, sr, 1500);
  }, 12));
  buffers.set('hit_flesh', makeBuffer(0.18, (d, sr, r) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * Math.exp(-t * 40) + 0.6 * Math.sin(2 * Math.PI * 120 * t) * Math.exp(-t * 30); } lowpass(d, sr, 1200); }, 13));
  buffers.set('headshot', makeBuffer(0.5, (d, sr, r) => {
    for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 9) * 0.7 + Math.sin(2 * Math.PI * 2700 * t) * Math.exp(-t * 12) * 0.4 + (r() * 2 - 1) * Math.exp(-t * 60) * 0.5; }
  }, 14));
  buffers.set('hitmarker', makeBuffer(0.06, click(4500, 0.06, 150, 0.6), 15));
  buffers.set('impact_metal', makeBuffer(0.3, (d, sr, r) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * Math.exp(-t * 70) + 0.5 * Math.sin(2 * Math.PI * (2600 + 400 * r()) * t) * Math.exp(-t * 20); } highpass(d, sr, 800); }, 16));
  buffers.set('impact_concrete', makeBuffer(0.2, (d, sr, r) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * Math.exp(-t * 50); } lowpass(d, sr, 3000); highpass(d, sr, 200); }, 17));
  buffers.set('impact_wood', makeBuffer(0.2, (d, sr, r) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * Math.exp(-t * 45) + Math.sin(2 * Math.PI * 340 * t) * Math.exp(-t * 35); } lowpass(d, sr, 2200); }, 18));
  for (const [m, lp, dec, ring] of [['metal', 5000, 30, 0.35], ['concrete', 2500, 40, 0], ['wood', 1800, 35, 0.15], ['sand', 1400, 25, 0]]) {
    for (let v = 0; v < 4; v++) buffers.set(`step_${m}_${v}`, makeBuffer(0.22, (d, sr, r) => {
      for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * (Math.exp(-t * dec) + 0.5 * Math.exp(-Math.max(0, t - 0.03) * dec * 1.5) * (t > 0.03)) + ring * Math.sin(2 * Math.PI * (700 + v * 90) * t) * Math.exp(-t * 25); }
      lowpass(d, sr, lp); highpass(d, sr, 90);
    }, 20 + v * 3 + m.length));
  }
  buffers.set('jump_land', makeBuffer(0.25, (d, sr, r) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * Math.exp(-t * 25) + Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t * 18); } lowpass(d, sr, 1500); }, 30));
  buffers.set('explosion', makeBuffer(2.5, gunshot({ dur: 2.5, crack: 0.6, crackDecay: 20, body: 1.5, bodyDecay: 3, bodyLP: 700, thump: 2, f0: 70, f1: 22, thumpDecay: 4, tail: 1, tailDecay: 1.4, hp: 25 }), 31));
  buffers.set('flashbang', makeBuffer(1.2, gunshot({ dur: 1.2, crack: 1.4, crackDecay: 15, body: 0.6, bodyDecay: 8, bodyLP: 4000, thump: 0.6, f0: 200, f1: 80, tail: 0.5, tailDecay: 3 }), 32));
  buffers.set('smoke', makeBuffer(2, (d, sr, r) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * Math.min(1, t * 10) * Math.exp(-t * 1.5); } lowpass(d, sr, 2500); highpass(d, sr, 500); }, 33));
  buffers.set('pin', makeBuffer(0.2, click(3800, 0.2, 40, 0.8), 34));
  buffers.set('bounce', makeBuffer(0.15, (d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * 900 * t) * Math.exp(-t * 40) + Math.sin(2 * Math.PI * 1500 * t) * Math.exp(-t * 60); } }, 35));
  buffers.set('beep', makeBuffer(0.12, (d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * 2100 * t) * Math.min(1, (0.12 - t) * 60); } }, 36));
  buffers.set('plant', makeBuffer(0.4, (d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * (t < 0.2 ? 1200 : 1600) * t) * 0.6; } }, 37));
  buffers.set('pickup', makeBuffer(0.3, (d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; const f = 800 + 1200 * t / 0.3; d[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 6); } }, 38));
  buffers.set('chest', makeBuffer(1.0, (d, sr) => {
    const notes = [784, 988, 1175, 1568];
    for (let i = 0; i < d.length; i++) { const t = i / sr; let v = 0; notes.forEach((f, k) => { const st = k * 0.1; if (t > st) v += Math.sin(2 * Math.PI * f * (t - st)) * Math.exp(-(t - st) * 4); }); d[i] = v; }
  }, 39));
  buffers.set('levelup', makeBuffer(1.4, (d, sr) => {
    const notes = [523, 659, 784, 1047, 1319];
    for (let i = 0; i < d.length; i++) { const t = i / sr; let v = 0; notes.forEach((f, k) => { const st = k * 0.12; if (t > st) v += (Math.sin(2 * Math.PI * f * (t - st)) + 0.3 * Math.sin(4 * Math.PI * f * (t - st))) * Math.exp(-(t - st) * 3); }); d[i] = v; }
  }, 40));
  buffers.set('round_start', makeBuffer(1.2, (d, sr) => {
    for (let i = 0; i < d.length; i++) { const t = i / sr; const f = t < 0.3 ? 440 : t < 0.6 ? 554 : 659; d[i] = (Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.3 + Math.sin(2 * Math.PI * f * t)) * Math.exp(-((t % 0.3)) * 4) * (t < 1.0 ? 1 : (1.2 - t) * 5); }
    lowpass(d, sr, 3000);
  }, 41));
  buffers.set('heartbeat', makeBuffer(0.8, (d, sr) => {
    for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * 50 * t) * (Math.exp(-t * 25) + 0.7 * Math.exp(-Math.max(0, t - 0.25) * 25) * (t > 0.25)); }
  }, 42));
  // zombie voices: formant-ish growls built from detuned saws through a wobbling low-pass
  for (let v = 0; v < 4; v++) {
    buffers.set(`growl_${v}`, makeBuffer(1.1, (d, sr, r) => {
      let ph1 = 0, ph2 = 0, y = 0;
      const base = 70 + v * 18;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const f = base * (1 + 0.25 * Math.sin(t * 9 + v) + 0.1 * (r() - 0.5));
        ph1 += f / sr; ph2 += (f * 1.013) / sr;
        const saw = ((ph1 % 1) * 2 - 1) + ((ph2 % 1) * 2 - 1) + (r() * 2 - 1) * 0.6;
        const fc = 500 + 400 * Math.sin(t * 6 + v * 2);
        const a = Math.exp(-2 * Math.PI * fc / sr);
        y = (1 - a) * saw + a * y;
        d[i] = y * Math.sin(Math.PI * Math.min(1, t / 1.1)) ** 0.7;
      }
    }, 50 + v));
  }
  buffers.set('scream', makeBuffer(1.4, (d, sr, r) => {
    let ph = 0, y = 0;
    for (let i = 0; i < d.length; i++) {
      const t = i / sr, f = 260 + 140 * Math.sin(t * 4) - t * 80;
      ph += f / sr;
      const s = ((ph % 1) * 2 - 1) + (r() * 2 - 1) * 0.8;
      const a = Math.exp(-2 * Math.PI * (1400 + 600 * Math.sin(t * 13)) / sr);
      y = (1 - a) * s + a * y;
      d[i] = y * Math.sin(Math.PI * t / 1.4);
    }
  }, 60));
  buffers.set('claw', makeBuffer(0.35, (d, sr, r) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * Math.sin(Math.PI * t / 0.35) * (0.5 + 0.5 * Math.sin(t * 200)); } highpass(d, sr, 1200); }, 61));
  buffers.set('infect', makeBuffer(1.2, (d, sr, r) => {
    for (let i = 0; i < d.length; i++) { const t = i / sr; const f = 300 * Math.exp(-t * 1.5) + 60; d[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 2) + (r() * 2 - 1) * 0.3 * Math.exp(-t * 3); }
    lowpass(d, sr, 1500);
  }, 62));
  buffers.set('zdie', makeBuffer(1.0, (d, sr, r) => {
    let ph = 0, y = 0;
    for (let i = 0; i < d.length; i++) { const t = i / sr, f = 120 - t * 70; ph += f / sr; const s = ((ph % 1) * 2 - 1) + (r() - 0.5); const a = Math.exp(-2 * Math.PI * 600 / sr); y = (1 - a) * s + a * y; d[i] = y * Math.exp(-t * 2.5); }
  }, 63));
  buffers.set('hurt', makeBuffer(0.4, (d, sr, r) => {
    let ph = 0, y = 0;
    for (let i = 0; i < d.length; i++) { const t = i / sr, f = 190 - t * 120; ph += f / sr; const s = ((ph % 1) * 2 - 1) * 0.8 + (r() - 0.5) * 0.4; const a = Math.exp(-2 * Math.PI * 1100 / sr); y = (1 - a) * s + a * y; d[i] = y * Math.sin(Math.PI * t / 0.4); }
  }, 64));
  buffers.set('ui_click', makeBuffer(0.05, click(3000, 0.05, 160, 0.5), 65));
  buffers.set('ui_hover', makeBuffer(0.04, (d, sr) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t * 90); } }, 66));
  buffers.set('card_flip', makeBuffer(0.25, (d, sr, r) => { for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = (r() * 2 - 1) * Math.exp(-t * 30) * 0.6 + Math.sin(2 * Math.PI * (600 + t * 3000) * t) * Math.exp(-t * 10); } }, 67));
}

function makeImpulse(dur = 1.8, decay = 3) {
  const sr = ctx.sampleRate, n = Math.floor(sr * dur);
  const ir = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
  }
  return ir;
}

export const Audio = {
  get ready() { return !!ctx; },
  init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.35; musicBus.connect(master);
    reverb = ctx.createConvolver(); reverb.buffer = makeImpulse();
    reverbSend = ctx.createGain(); reverbSend.gain.value = 0.25;
    reverbSend.connect(reverb); reverb.connect(master);
    build();
  },
  setVolume(v) { volume = v; if (master) master.gain.value = v; },
  setReverb(v) { if (reverbSend) reverbSend.gain.value = v; },

  setListener(pos, forward, up) {
    if (!ctx) return;
    listenerPos.copy(pos);
    const L = ctx.listener;
    if (L.positionX) {
      const t = ctx.currentTime;
      L.positionX.setValueAtTime(pos.x, t); L.positionY.setValueAtTime(pos.y, t); L.positionZ.setValueAtTime(pos.z, t);
      L.forwardX.setValueAtTime(forward.x, t); L.forwardY.setValueAtTime(forward.y, t); L.forwardZ.setValueAtTime(forward.z, t);
      L.upX.setValueAtTime(up.x, t); L.upY.setValueAtTime(up.y, t); L.upZ.setValueAtTime(up.z, t);
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  },

  // play(name, {pos, volume, rate, variants}) — pos null = 2D (player's own sounds)
  play(name, opts = {}) {
    if (!ctx) return null;
    let key = name;
    if (opts.variants) key = `${name}_${Math.floor(Math.random() * opts.variants)}`;
    const buf = buffers.get(key);
    if (!buf) return null;
    const pos = opts.pos;
    if (pos) {
      const d = listenerPos.distanceTo(pos);
      if (d > (opts.maxDist || 120)) return null;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (opts.rate || 1) * (opts.jitter === false ? 1 : 0.94 + Math.random() * 0.12);
    const g = ctx.createGain();
    g.gain.value = opts.volume ?? 1;
    src.connect(g);
    let out = g;
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
      p.refDistance = opts.ref || 3; p.rolloffFactor = opts.rolloff || 1.1; p.maxDistance = 200;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p); out = p;
    }
    out.connect(sfxBus);
    if (opts.reverb !== false) {
      const rs = ctx.createGain(); rs.gain.value = opts.reverbAmt ?? 0.6;
      out.connect(rs); rs.connect(reverbSend);
    }
    src.start(ctx.currentTime + (opts.delay || 0));
    return src;
  },

  shot(sound, pos, isLocal) {
    this.play(`shot_${sound}`, { variants: 3, pos: isLocal ? null : pos, volume: isLocal ? 0.55 : 1, ref: 6, maxDist: 220, rolloff: 0.8 });
  },
  step(mat, pos, isLocal, vol = 0.35) {
    const m = ['metal', 'concrete', 'wood', 'sand'].includes(mat) ? mat : 'concrete';
    this.play(`step_${m}`, { variants: 4, pos: isLocal ? null : pos, volume: isLocal ? vol * 0.7 : vol, ref: 2, maxDist: 40, reverbAmt: 0.2 });
  },

  // Announcer lines (CF-style) via speech synthesis; falls back silently
  say(text, { lang = 'en-US', rate = 1.05, pitch = 0.8, volume: v = 1 } = {}) {
    if (typeof speechSynthesis === 'undefined') return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang; u.rate = rate; u.pitch = pitch; u.volume = v * volume;
      const voices = speechSynthesis.getVoices();
      const pick = voices.find((x) => x.lang === lang && /male|David|Guy|Mark/i.test(x.name)) || voices.find((x) => x.lang.startsWith(lang.slice(0, 2)));
      if (pick) u.voice = pick;
      speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  },

  // Simple procedural background loop for the lobby (pad + arpeggio)
  startLobbyMusic() {
    if (!ctx || this._music) return;
    const notes = [[220, 261.6, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [196, 246.9, 329.6]];
    const g = ctx.createGain(); g.gain.value = 0.0; g.connect(musicBus);
    g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200; lp.connect(g);
    let step = 0;
    const tick = () => {
      const chord = notes[Math.floor(step / 8) % notes.length];
      const t = ctx.currentTime;
      if (step % 8 === 0) for (const f of chord) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f / 2;
        const og = ctx.createGain(); og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.06, t + 0.4); og.gain.linearRampToValueAtTime(0, t + 3.2);
        o.connect(og); og.connect(lp); o.start(t); o.stop(t + 3.3);
      }
      const f = chord[step % 3] * (step % 4 === 3 ? 2 : 1);
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f * 2;
      const og = ctx.createGain(); og.gain.setValueAtTime(0.08, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(og); og.connect(lp); o.start(t); o.stop(t + 0.4);
      const kick = step % 4 === 0;
      if (kick) {
        const k = ctx.createOscillator(); k.frequency.setValueAtTime(120, t); k.frequency.exponentialRampToValueAtTime(40, t + 0.15);
        const kg = ctx.createGain(); kg.gain.setValueAtTime(0.25, t); kg.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        k.connect(kg); kg.connect(g); k.start(t); k.stop(t + 0.25);
      }
      step++;
    };
    this._music = { timer: setInterval(tick, 200), gain: g };
  },
  stopLobbyMusic() {
    if (!this._music) return;
    const m = this._music; this._music = null;
    m.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
    setTimeout(() => { clearInterval(m.timer); m.gain.disconnect(); }, 1100);
  },
};
