// In-match HUD (DOM overlay): crosshair, health/ammo, scores, kill feed, banners, minimap, scoreboard, results.
import * as THREE from 'three';
import { weaponDef, CAT_NAMES, RARITY, SKINS } from '../data/weapons.js';
import { currentSpread } from '../game/combat.js';
import { TEAM_NAMES } from '../game/modes/base.js';
import { Audio } from '../audio.js';
import { rankOf, saveProfile } from '../profile.js';
import { CHEST_TIERS } from '../game/modes/challenge.js';
import { switchWeapon } from '../game/weaponctl.js';

const $ = (sel, root = document) => root.querySelector(sel);
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const MULTI = ['', '', 'DOUBLE KILL', 'TRIPLE KILL', 'MULTI KILL', 'ULTRA KILL', 'RAMPAGE', 'UNSTOPPABLE', 'GODLIKE'];
const MULTI_CN = ['', '', '双杀', '三杀', '四杀', '五杀', '六杀', '七杀', '超神'];

function weaponLabel(id) {
  if (id === 'infect') return '感染';
  if (id === 'claw') return '利爪';
  if (id === 'fall') return '坠落';
  if (id === 'c4') return 'C4';
  if (id === 'explode') return '自爆';
  return weaponDef(id)?.name || id || '';
}

export class HUD {
  constructor(root, profile, app) {
    this.root = root; this.profile = profile; this.app = app;
    root.innerHTML = `
      <div id="h-flash"></div><div id="h-hurt"></div><div id="h-scope"><div class="sc-h"></div><div class="sc-v"></div></div>
      <div id="h-cross"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="dot"></i></div>
      <div id="h-hit"><i></i><i></i><i></i><i></i></div>
      <div id="h-top"></div>
      <div id="h-feed"></div>
      <div id="h-mini"><canvas width="200" height="200"></canvas><div class="mini-n">N</div></div>
      <div id="h-hp"><div class="hp-row"><span class="ico">✚</span><b class="hp">100</b><div class="bar"><i></i></div></div><div class="ar-row"><span class="ico">⛨</span><b class="ar">100</b><div class="bar"><i></i></div></div></div>
      <div id="h-ammo"><div class="wname"></div><div class="ammo"><b class="cur">30</b><span class="res">/ 90</span></div><div class="slots"></div></div>
      <div id="h-banner"></div>
      <div id="h-big"></div>
      <div id="h-toast"></div>
      <div id="h-center"></div>
      <div id="h-hint"></div>
      <div id="h-dmg"></div>
      <div id="h-boss" class="hidden"><div class="bn"></div><div class="bb"><i></i></div></div>
      <div id="h-thp" class="hidden"><div class="tn"></div><div class="bb"><i></i></div></div>
      <div id="h-death" class="hidden"></div>
      <div id="h-score" class="hidden"></div>
      <div id="h-pause" class="hidden"></div>
      <div id="h-load" class="hidden"></div>
      <div id="h-results" class="hidden"></div>
      <div id="h-count"></div>
      <div id="h-buff"></div>
    `;
    this.miniCanvas = $('#h-mini canvas', root);
    this.miniCtx = this.miniCanvas.getContext('2d');
    this.feedItems = [];
    this.lastHud = 0;
    this.dmgIndicators = [];
  }

  startMatch(game) {
    this.game = game;
    this.root.classList.remove('hidden');
    this.root.classList.add('active');
    for (const id of ['#h-results', '#h-death', '#h-score', '#h-pause', '#h-load', '#h-boss', '#h-thp']) $(id, this.root).classList.add('hidden');
    $('#h-feed', this.root).innerHTML = '';
    this.feedItems = [];
    $('#h-cross', this.root).style.setProperty('--cc', this.profile.settings.crosshair);
  }

  endMatchCleanup() {
    this.root.classList.remove('active');
    this.root.classList.add('hidden');
  }

  buildMinimap(nav, bounds) {
    const [x0, z0, x1, z1] = bounds;
    const size = 512;
    const c = document.createElement('canvas'); c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    let minH = Infinity, maxH = -Infinity;
    for (let k = 0; k < nav.height.length; k++) if (nav.ok[k]) { minH = Math.min(minH, nav.height[k]); maxH = Math.max(maxH, nav.height[k]); }
    const span = Math.max(x1 - x0, z1 - z0);
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const x = x0 + (i / size) * span, z = z0 + (j / size) * span;
      const k = nav.idx(x, z);
      const o = (j * size + i) * 4;
      if (k < 0) { img.data[o + 3] = 0; continue; }
      const h = nav.height[k];
      if (!nav.ok[k]) {
        if (h > -1e5) { img.data[o] = 40; img.data[o + 1] = 44; img.data[o + 2] = 50; img.data[o + 3] = 230; }
        else img.data[o + 3] = 0;
        continue;
      }
      const t = (h - minH) / Math.max(0.1, maxH - minH);
      const v = 85 + t * 110;
      img.data[o] = v * 0.85; img.data[o + 1] = v * 0.95; img.data[o + 2] = v; img.data[o + 3] = nav.cost[k] > 0 ? 200 : 170;
    }
    ctx.putImageData(img, 0, 0);
    this.mini = { img: c, x0, z0, span };
  }

  // ---------------- per frame ----------------
  update(game) {
    const p = game.player;
    const now = performance.now();
    const w = p.weapon;
    // crosshair
    const cross = $('#h-cross', this.root);
    const scoped = p.alive && p.scope > 0;
    $('#h-scope', this.root).style.display = scoped ? 'block' : 'none';
    const sniperNoCross = w && w.def.cat === 'sniper' && !scoped;
    cross.style.display = !p.alive || scoped || sniperNoCross || p.zombie && false ? 'none' : 'block';
    if (w && p.alive) {
      const spread = w.def.cat === 'melee' ? 1 : currentSpread(p) + p.recoil * 0.25;
      const fovPx = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(game.camera.fov) / 2));
      const gap = Math.min(80, 4 + Math.tan(THREE.MathUtils.degToRad(spread)) * fovPx);
      cross.style.setProperty('--gap', gap.toFixed(1) + 'px');
    }
    // flashbang & hurt overlay
    $('#h-flash', this.root).style.opacity = Math.min(1, p.flashT / 2).toFixed(3);
    // low hp vignette
    $('#h-hurt', this.root).style.setProperty('--low', p.alive && !p.zombie && p.hp < 30 ? 0.5 : 0);

    if (now - this.lastHud < 60) return;
    this.lastHud = now;
    // hp/armor
    const hpEl = $('#h-hp', this.root);
    $('.hp', hpEl).textContent = Math.max(0, Math.ceil(p.hp));
    $('.hp-row .bar i', hpEl).style.width = `${Math.max(0, p.hp / p.maxHp) * 100}%`;
    $('.ar', hpEl).textContent = Math.ceil(p.armor);
    $('.ar-row .bar i', hpEl).style.width = `${Math.min(1, p.armor / 100) * 100}%`;
    hpEl.classList.toggle('zombie', !!p.zombie);
    hpEl.classList.toggle('low', p.hp < 30 && !p.zombie);
    // ammo
    const am = $('#h-ammo', this.root);
    if (p.zombie) {
      $('.wname', am).textContent = p.zombieDef?.name || '僵尸';
      $('.cur', am).textContent = p.skillCd > 0 ? Math.ceil(p.skillCd) : 'F';
      $('.res', am).textContent = p.skillCd > 0 ? ' 技能冷却' : ' 疾跑就绪';
      $('.slots', am).innerHTML = '';
    } else if (w) {
      $('.wname', am).textContent = w.def.name;
      const isGun = w.def.mag;
      $('.cur', am).textContent = isGun ? w.ammo : w.def.cat === 'grenade' ? w.count : '∞';
      $('.res', am).textContent = isGun ? ` / ${w.reserve > 900 ? '∞' : w.reserve}` : '';
      am.classList.toggle('low', isGun && w.ammo <= Math.ceil(w.def.mag * 0.2));
      am.classList.toggle('reload', p.reloadT > 0);
      const slots = ['primary', 'secondary', 'melee', 'grenade'].map((k, i) => {
        const s = p.slots[k];
        if (!s) return '';
        return `<span class="${p.cur === k ? 'on' : ''}">${i + 1} ${s.def.name}${k === 'grenade' ? ' ×' + s.count : ''}</span>`;
      }).join('');
      $('.slots', am).innerHTML = slots;
    }
    // top bar
    const info = game.mode.hudInfo();
    const top = $('#h-top', this.root);
    if (info.type === 'teams') {
      top.innerHTML = `<div class="tm ${info.left.cls}"><span>${info.left.name}</span><b>${info.left.score}</b>${info.left.alive != null ? `<em>存活 ${info.left.alive}</em>` : ''}</div>
        <div class="clock ${info.bomb ? 'bomb' : ''}"><b>${fmtTime(info.time)}</b><span>${info.goal || ''}</span></div>
        <div class="tm ${info.right.cls}"><b>${info.right.score}</b><span>${info.right.name}</span>${info.right.alive != null ? `<em>存活 ${info.right.alive}</em>` : ''}</div>`;
    } else if (info.type === 'ffa') {
      top.innerHTML = `<div class="tm red"><span>第一名 ${info.leader.name}</span><b>${info.leader.kills}</b></div><div class="clock"><b>${fmtTime(info.time)}</b><span>${info.goal}</span></div><div class="tm blue"><b>${info.me.kills}</b><span>我的排名 ${info.rank}</span></div>`;
    } else if (info.type === 'challenge') {
      top.innerHTML = `<div class="tm green"><span>波次</span><b>${info.wave}/${info.waves}</b></div><div class="clock"><b>${info.remaining}</b><span>剩余僵尸</span></div><div class="tm gold"><b>🎁 ${info.chests}</b><span>宝箱 · 复活币 ${info.lives}</span></div>`;
    }
    $('#h-center', this.root).textContent = info.center || '';
    $('#h-hint', this.root).textContent = info.hint || '';
    // buff
    $('#h-buff', this.root).textContent = p.chestBuff?.t > 0 && p.chestBuff.dmg > 1 && !p.hero ? `双倍伤害 ${Math.ceil(p.chestBuff.t)}s` : p.hero ? '英雄 · 伤害强化' : '';
    // death countdown
    if (!p.alive && !this.deathShown) { /* handled by showDeath */ }
    if (!p.alive) {
      const d = $('#h-death', this.root);
      const t = $('.rt', d);
      if (t) t.textContent = p.respawnT < 999 ? `${Math.max(0, p.respawnT).toFixed(1)} 秒后复活` : '等待下一回合';
    } else $('#h-death', this.root).classList.add('hidden');
    // boss bar
    if (this.boss) {
      const b = $('#h-boss', this.root);
      if (!this.boss.alive) { b.classList.add('hidden'); this.boss = null; }
      else $('.bb i', b).style.width = `${(this.boss.hp / this.boss.maxHp) * 100}%`;
    }
    if (this.thp && now > this.thpUntil) { $('#h-thp', this.root).classList.add('hidden'); this.thp = null; }
    else if (this.thp) $('#h-thp .bb i', this.root).style.width = `${Math.max(0, this.thp.hp / this.thp.maxHp) * 100}%`;
    // scoreboard if open
    if (this.scoresOpen) this.renderScores(game);
    // damage indicators
    for (const d of this.dmgIndicators) {
      const age = (now - d.t) / 1000;
      if (age > 1.5) { d.el.remove(); d.dead = true; continue; }
      const vx = d.pos.x - p.pos.x, vz = d.pos.z - p.pos.z;
      const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
      const rel = Math.atan2(vx * cy - vz * sy, -vx * sy - vz * cy);
      d.el.style.transform = `translate(-50%,-50%) rotate(${rel}rad) translateY(-120px)`;
      d.el.style.opacity = 1 - age / 1.5;
    }
    this.dmgIndicators = this.dmgIndicators.filter((d) => !d.dead);
    this.drawMinimap(game);
    // feed expiry
    for (const f of this.feedItems) if (now - f.t > 6000 && !f.gone) { f.gone = true; f.el.classList.add('out'); setTimeout(() => f.el.remove(), 400); }
  }

  drawMinimap(game) {
    if (!this.mini) return;
    const ctx = this.miniCtx, S = 200, p = game.player;
    const scale = S / 60; // 60m across
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(10,14,20,0.75)'; ctx.fillRect(0, 0, S, S);
    ctx.translate(S / 2, S / 2);
    ctx.rotate(p.yaw);
    const px = (p.pos.x - this.mini.x0) / this.mini.span * 512, pz = (p.pos.z - this.mini.z0) / this.mini.span * 512;
    const k = scale * this.mini.span / 512;
    ctx.globalAlpha = 0.9;
    ctx.drawImage(this.mini.img, -px * k, -pz * k, 512 * k, 512 * k);
    ctx.globalAlpha = 1;
    for (const a of game.actors) {
      if (!a.alive || a === p) continue;
      const enemy = game.isEnemy(p, a);
      const near = a.pos.distanceTo(p.pos) < 8;
      if (enemy && !(a.revealT > 0) && !near) continue;
      const x = (a.pos.x - p.pos.x) * scale, z = (a.pos.z - p.pos.z) * scale;
      ctx.fillStyle = enemy ? (a.zombie ? '#7dff4a' : '#ff4040') : '#4ab4ff';
      ctx.beginPath(); ctx.arc(x, z, a.zombie === 'boss' ? 7 : 4, 0, Math.PI * 2); ctx.fill();
    }
    // bomb
    const m = game.mode;
    if (m.c4?.visible) { ctx.fillStyle = '#ffcc00'; const x = (m.c4.position.x - p.pos.x) * scale, z = (m.c4.position.z - p.pos.z) * scale; ctx.fillRect(x - 4, z - 4, 8, 8); }
    if (m.chests) for (const c of m.chests) if (!c.taken) { ctx.fillStyle = '#ffd040'; const x = (c.mesh.position.x - p.pos.x) * scale, z = (c.mesh.position.z - p.pos.z) * scale; ctx.fillRect(x - 3, z - 3, 6, 6); }
    if (game.meta.sites) for (const [k, s] of Object.entries(game.meta.sites)) {
      ctx.save(); const x = (s.center[0] - p.pos.x) * scale, z = (s.center[2] - p.pos.z) * scale;
      ctx.translate(x, z); ctx.rotate(-p.yaw); ctx.fillStyle = '#ffdd55'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(k, 0, 0); ctx.restore();
    }
    ctx.restore();
    // player arrow
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(S / 2, S / 2 - 8); ctx.lineTo(S / 2 - 5, S / 2 + 6); ctx.lineTo(S / 2, S / 2 + 3); ctx.lineTo(S / 2 + 5, S / 2 + 6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); ctx.stroke();
  }

  // ---------------- events ----------------
  hitMarker(head, kill) {
    const h = $('#h-hit', this.root);
    h.className = ''; void h.offsetWidth;
    h.className = `show ${head ? 'head' : ''} ${kill ? 'kill' : ''}`;
  }

  showTargetHp(t) {
    this.thp = t; this.thpUntil = performance.now() + 2500;
    const e = $('#h-thp', this.root);
    e.classList.remove('hidden');
    $('.tn', e).textContent = `${t.name || ''} ${t.zombieDef?.name || ''}`;
  }

  bossBar(z) {
    const b = $('#h-boss', this.root);
    this.boss = z;
    if (!z) { b.classList.add('hidden'); return; }
    b.classList.remove('hidden');
    $('.bn', b).textContent = z.name;
  }

  damageFrom(pos) {
    const e = el('div', 'dmgi');
    $('#h-dmg', this.root).appendChild(e);
    this.dmgIndicators.push({ el: e, pos: pos.clone(), t: performance.now() });
  }

  hurtFlash(d) {
    const e = $('#h-hurt', this.root);
    e.style.setProperty('--hit', Math.min(0.8, 0.2 + d / 60));
    clearTimeout(this._hurtT);
    this._hurtT = setTimeout(() => e.style.setProperty('--hit', 0), 120);
  }

  killfeed(killer, victim, info) {
    const feed = $('#h-feed', this.root);
    const g = this.game;
    const cls = (a) => (a?.isPlayer ? 'me' : a?.zombie ? 'green' : a?.team === 'red' ? 'red' : a?.team === 'blue' || a?.team === 'human' ? 'blue' : 'red');
    const row = el('div', 'kf ' + (killer?.isPlayer || victim.isPlayer ? 'mine' : ''));
    row.innerHTML = `${killer && killer !== victim ? `<span class="${cls(killer)}">${killer.name || killer.zombieDef?.name || ''}</span>` : ''}
      <span class="wpn">${weaponLabel(info.weapon)}</span>${info.headshot ? '<span class="hs">爆头</span>' : ''}${info.backstab ? '<span class="hs">背刺</span>' : ''}
      <span class="${cls(victim)}">${victim.name || victim.zombieDef?.name || ''}</span>`;
    feed.prepend(row);
    this.feedItems.push({ el: row, t: performance.now() });
    while (feed.children.length > 6) feed.lastChild.remove();
    void g;
  }

  killBanner(multi, head, melee, grenade, victim, label) {
    const b = $('#h-banner', this.root);
    const n = Math.min(8, multi);
    const icons = Array.from({ length: n }, (_, i) => `<i class="kb ${i === n - 1 ? 'new' : ''}"></i>`).join('');
    let title = label || (head ? 'HEADSHOT' : melee ? 'KNIFE KILL' : grenade ? 'GRENADE KILL' : 'KILL');
    let sub = MULTI_CN[n] || (head ? '爆头击杀' : '击杀');
    if (n >= 2) title = MULTI[n] || 'GODLIKE';
    b.innerHTML = `<div class="kb-row">${icons}</div><div class="kb-t ${head ? 'hs' : ''}">${title}</div><div class="kb-s">${sub}${victim ? ' · ' + (victim.name || victim.zombieDef?.name || '') : ''}</div>`;
    b.className = ''; void b.offsetWidth; b.className = 'show';
    clearTimeout(this._bT); this._bT = setTimeout(() => { b.className = ''; }, 2200);
    if (n >= 2) Audio.say(MULTI[n].toLowerCase(), { pitch: 0.6, rate: 1 });
    else if (head) Audio.say('headshot', { pitch: 0.6, rate: 1.1 });
  }

  showDeath(killer, info, respawnT) {
    const d = $('#h-death', this.root);
    d.classList.remove('hidden');
    d.innerHTML = `<div class="dt">你被击败了</div>${killer ? `<div class="dk">击杀者：<b>${killer.name || killer.zombieDef?.name}</b> · ${weaponLabel(info.weapon)}${info.headshot ? ' · 爆头' : ''}${killer.alive ? ` · 剩余生命 ${Math.ceil(killer.hp)}` : ''}</div>` : ''}<div class="rt">${respawnT < 999 ? respawnT + ' 秒后复活' : '等待下一回合'}</div><div class="dh">按 B 更换武器配置</div>`;
  }

  bigMessage(title, sub, dur = 3, color = '') {
    const b = $('#h-big', this.root);
    b.innerHTML = `<div class="bt ${color}">${title}</div><div class="bs">${sub || ''}</div>`;
    b.className = ''; void b.offsetWidth; b.className = 'show';
    clearTimeout(this._bigT); this._bigT = setTimeout(() => { b.className = ''; }, dur * 1000);
  }

  toast(text) {
    const t = $('#h-toast', this.root);
    const e = el('div', 'tt', text);
    t.appendChild(e);
    setTimeout(() => { e.classList.add('out'); setTimeout(() => e.remove(), 500); }, 2200);
  }

  chestToast(name, msg, tier) {
    const t = $('#h-toast', this.root);
    const e = el('div', 'tt chest ' + tier, `<b>获得 ${name}</b><span>${msg}</span>`);
    t.appendChild(e);
    setTimeout(() => { e.classList.add('out'); setTimeout(() => e.remove(), 500); }, 2800);
  }

  countdown(n) {
    const c = $('#h-count', this.root);
    c.textContent = n; c.className = ''; void c.offsetWidth; c.className = 'show';
  }

  // ---------------- overlays ----------------
  showScores(open) {
    if (open === this.scoresOpen) return;
    this.scoresOpen = open;
    $('#h-score', this.root).classList.toggle('hidden', !open);
    if (open) this.renderScores(this.game);
  }

  renderScores(game) {
    const s = $('#h-score', this.root);
    const rows = (list) => list.sort((a, b) => b.score - a.score || b.kills - a.kills).map((a) => `<tr class="${a.isPlayer ? 'me' : ''} ${a.alive ? '' : 'dead'}"><td>${a.name || a.zombieDef?.name}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${a.headshots}</td><td>${Math.round(a.score)}</td></tr>`).join('');
    const head = '<tr><th>玩家</th><th>击杀</th><th>死亡</th><th>爆头</th><th>得分</th></tr>';
    const actors = game.actors.filter((a) => a.name);
    let html = '';
    if (game.mode.id === 'ffa' || game.mode.id === 'challenge' || game.mode.id === 'zombie') {
      const list = game.mode.id === 'challenge' ? actors.filter((a) => !a.zombie) : actors;
      html = `<div class="sb-one"><h3>${game.mode.name} · ${game.mapDef.name}</h3><table>${head}${rows(list)}</table></div>`;
    } else {
      html = `<div class="sb-two"><div class="red"><h3>${TEAM_NAMES.red}</h3><table>${head}${rows(actors.filter((a) => a.team === 'red'))}</table></div><div class="blue"><h3>${TEAM_NAMES.blue}</h3><table>${head}${rows(actors.filter((a) => a.team === 'blue'))}</table></div></div>`;
    }
    s.innerHTML = html;
  }

  showPause(open) {
    const p = $('#h-pause', this.root);
    p.classList.toggle('hidden', !open);
    if (!open) return;
    const st = this.profile.settings;
    p.innerHTML = `<div class="panel"><h2>游戏暂停</h2>
      <label>鼠标灵敏度 <input type="range" min="0.2" max="3" step="0.05" value="${st.sensitivity}" data-k="sensitivity"><span>${st.sensitivity}</span></label>
      <label>视野 FOV <input type="range" min="60" max="95" step="1" value="${st.fov}" data-k="fov"><span>${st.fov}</span></label>
      <label>音量 <input type="range" min="0" max="1" step="0.05" value="${st.volume}" data-k="volume"><span>${st.volume}</span></label>
      <div class="keys">WASD 移动 · 空格 跳 · Ctrl/C 蹲 · Shift 静步 · R 换弹 · 1-4/滚轮 切枪 · Q 快切 · 右键 开镜/重击 · E 安放/拆除 · B 装备 · Tab 计分板 · F 僵尸技能</div>
      <button class="btn primary" data-a="resume">继续游戏</button><button class="btn" data-a="quit">退出房间</button></div>`;
    p.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', () => {
      const k = inp.dataset.k; st[k] = parseFloat(inp.value); inp.nextElementSibling.textContent = inp.value;
      if (k === 'volume') Audio.setVolume(st.volume);
      saveProfile(this.profile);
    }));
    $('[data-a=resume]', p).onclick = () => this.game.setPaused(false);
    $('[data-a=quit]', p).onclick = () => { this.game.ended = true; this.app.exitMatch(); };
  }

  openLoadout(game) {
    const pane = $('#h-load', this.root);
    pane.classList.remove('hidden');
    game.input.unlock();
    game.paused = true;
    const lo = { ...this.profile.loadout };
    const owned = this.profile.owned;
    const sec = (slot, title) => {
      const ids = owned.filter((id) => weaponDef(id)?.slot === slot);
      return `<div class="lo-sec"><h4>${title}</h4><div class="lo-list">${ids.map((id) => { const d = weaponDef(id); return `<button class="lo-item ${lo[slot] === id ? 'on' : ''} ${d.rarity || ''}" data-slot="${slot}" data-id="${id}"><b>${d.name}</b><span>${CAT_NAMES[d.cat]}</span></button>`; }).join('')}</div></div>`;
    };
    pane.innerHTML = `<div class="panel wide"><h2>更换装备</h2>${sec('primary', '主武器')}${sec('secondary', '副武器')}${sec('melee', '近身武器')}${sec('grenade', '投掷武器')}<button class="btn primary" data-a="ok">确定</button></div>`;
    pane.querySelectorAll('.lo-item').forEach((b) => b.onclick = () => {
      lo[b.dataset.slot] = b.dataset.id;
      pane.querySelectorAll(`.lo-item[data-slot=${b.dataset.slot}]`).forEach((x) => x.classList.toggle('on', x === b));
      Audio.play('ui_click', { volume: 0.4 });
    });
    $('[data-a=ok]', pane).onclick = () => {
      this.profile.loadout = lo; saveProfile(this.profile);
      const p = game.player;
      p.loadout = { ...lo };
      if (p.hero) p.loadout.primary = 'm249-qilin';
      if (p.alive && !p.zombie && game.mode.canBuy?.(p)) {
        p.setLoadout(p.loadout);
        if (game.infiniteReserve(p)) for (const k of ['primary', 'secondary']) if (p.slots[k]) p.slots[k].reserve = 999;
        game.view.equip(p);
      }
      pane.classList.add('hidden');
      game.paused = false;
      game.input.lock();
    };
  }

  // ---------------- results ----------------
  showResults(game, result) {
    const r = $('#h-results', this.root);
    r.classList.remove('hidden');
    this.showScores(false);
    const p = game.player;
    const prof = this.profile;
    const before = rankOf(prof.exp);
    const exp = Math.round(p.kills * 30 + p.headshots * 15 + p.score * 10 + (result.playerWon ? 300 : 100) + (game.mode.wave || 0) * 40);
    const gp = Math.round(p.kills * 20 + (result.playerWon ? 500 : 150) + (game.mode.wave || 0) * 60);
    prof.exp += exp; prof.gp += gp;
    prof.stats.kills += p.kills; prof.stats.deaths += p.deaths; prof.stats.headshots += p.headshots; prof.stats.matches++;
    if (result.playerWon) prof.stats.wins++;
    const after = rankOf(prof.exp);
    const chests = result.chests || [];
    prof.stats.chests += chests.length;
    saveProfile(prof);
    const sorted = [...game.actors].filter((a) => a.name && !(game.mode.id === 'challenge' && a.zombie)).sort((a, b) => b.score - a.score);
    const mvp = sorted[0];
    r.innerHTML = `<div class="panel res">
      <div class="res-title ${result.playerWon ? 'win' : 'lose'}">${result.playerWon ? 'VICTORY' : 'DEFEAT'}</div>
      <div class="res-sub">${result.text}</div>
      <div class="res-grid">
        <div class="res-me"><h4>本局战绩</h4>
          <div class="kv"><span>击杀</span><b>${p.kills}</b></div><div class="kv"><span>死亡</span><b>${p.deaths}</b></div>
          <div class="kv"><span>爆头</span><b>${p.headshots}</b></div><div class="kv"><span>得分</span><b>${Math.round(p.score)}</b></div>
          <div class="kv"><span>经验</span><b class="up">+${exp}</b></div><div class="kv"><span>GP</span><b class="gp">+${gp}</b></div>
          <div class="rank"><span>${after.name}</span><div class="bar"><i style="width:${after.progress * 100}%"></i></div>${after.index > before.index ? '<em>军衔晋升！</em>' : ''}</div>
          <div class="mvp">MVP：<b>${mvp?.name}</b></div>
        </div>
        <div class="res-board"><table><tr><th>#</th><th>玩家</th><th>击杀</th><th>死亡</th><th>得分</th></tr>${sorted.slice(0, 16).map((a, i) => `<tr class="${a.isPlayer ? 'me' : ''}"><td>${i + 1}</td><td>${a.name}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${Math.round(a.score)}</td></tr>`).join('')}</table></div>
      </div>
      ${chests.length ? `<div class="cards-wrap"><h4>开启宝箱 · 点击翻牌（${chests.length} 个宝箱）</h4><div class="cards"></div></div>` : ''}
      <button class="btn primary" data-a="back">返回大厅</button></div>`;
    if (after.index > before.index) Audio.play('levelup', { volume: 0.7 });
    if (chests.length) this.buildCards($(".cards", r), chests.slice(0, 18));
    $('[data-a=back]', r).onclick = () => this.app.exitMatch();
  }

  buildCards(container, chests) {
    const prof = this.profile;
    chests.forEach((tier, i) => {
      const reward = rollChestReward(tier, prof);
      const c = el('div', `card ${tier}`);
      c.innerHTML = `<div class="inner"><div class="front"><div class="chest-ico"></div><span>${CHEST_TIERS[tier].name}</span></div><div class="back ${reward.rarity}"><b>${reward.title}</b><span>${reward.sub}</span></div></div>`;
      c.style.animationDelay = `${i * 0.06}s`;
      c.onclick = () => {
        if (c.classList.contains('flipped')) return;
        c.classList.add('flipped');
        Audio.play('card_flip', { volume: 0.6 });
        reward.apply();
        saveProfile(prof);
        if (reward.rarity === 'legend' || reward.rarity === 'epic') setTimeout(() => Audio.play('levelup', { volume: 0.7 }), 300);
        else setTimeout(() => Audio.play('chest', { volume: 0.5 }), 250);
      };
      container.appendChild(c);
    });
  }
}

// Reward table for opening chests
export function rollChestReward(tier, prof) {
  const r = Math.random();
  const skinChance = { wood: 0.04, silver: 0.12, gold: 0.35 }[tier];
  const unowned = Object.keys(SKINS).filter((k) => !prof.owned.includes(k));
  if (r < skinChance && unowned.length) {
    // rarer skins less likely
    const pool = unowned.flatMap((k) => Array(SKINS[k].rarity === 'legend' ? 1 : SKINS[k].rarity === 'epic' ? 2 : 4).fill(k));
    const id = pool[Math.floor(Math.random() * pool.length)];
    const s = SKINS[id];
    return { title: s.name, sub: `${RARITY[s.rarity].name} · 永久`, rarity: s.rarity, apply: () => { if (!prof.owned.includes(id)) prof.owned.push(id); } };
  }
  const gp = Math.round({ wood: 300, silver: 800, gold: 2000 }[tier] * (0.6 + Math.random() * 0.9) / 10) * 10;
  if (r < 0.75) return { title: `${gp} GP`, sub: '游戏币', rarity: 'common', apply: () => { prof.gp += gp; } };
  const exp = Math.round(gp * 1.5);
  return { title: `${exp} 经验`, sub: '军衔经验', rarity: 'rare', apply: () => { prof.exp += exp; } };
}

export { switchWeapon };
