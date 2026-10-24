// App shell: lobby (开始游戏 / 仓库 / 商城 / 个人信息 / 设置) and match lifecycle.
import './style.css';
import * as THREE from 'three';
import { createRenderer } from './gfx/env.js';
import { Audio } from './audio.js';
import { loadProfile, saveProfile, rankOf, RANKS } from './profile.js';
import { HUD } from './ui/hud.js';
import { Lobby3D } from './ui/lobby3d.js';
import { Game } from './game/game.js';
import { MODES } from './game/modes/index.js';
import { MAP_LIST } from './maps/index.js';
import { WEAPONS, SKINS, weaponDef, CAT_NAMES, RARITY } from './data/weapons.js';
import { DIFFICULTY } from './game/bot.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

class App {
  constructor() {
    this.profile = loadProfile();
    this.canvas = $('#game');
    this.renderer = createRenderer(this.canvas);
    this.applyQuality();
    this.hud = new HUD($('#hud'), this.profile, this);
    this.lobby3d = new Lobby3D(this.renderer);
    this.lobby3d.active = true;
    this.game = null;
    this.room = { mode: 'tdm', map: 'transport', botsPerTeam: 6, difficulty: this.profile.settings.difficulty || 'normal', limit: MODES.tdm.defLimit, time: 10, team: 'blue', allies: 3 };
    this.clock = new THREE.Clock();
    const pd = weaponDef(this.profile.loadout.primary) || weaponDef('ak47');
    this.lobby3d.setSoldier('blue', pd.base, pd.variant);
    this.renderer.setAnimationLoop(() => this.lobbyFrame());
    addEventListener('resize', () => { if (!this.game) this.renderer.setSize(innerWidth, innerHeight); });
    // first interaction unlocks audio
    const unlock = () => { Audio.init(); Audio.setVolume(this.profile.settings.volume); Audio.startLobbyMusic(); removeEventListener('pointerdown', unlock); };
    addEventListener('pointerdown', unlock);
    document.addEventListener('mouseover', (e) => { if (e.target.closest?.('.btn,.tab,.card-mode,.map-card,.w-item')) Audio.play('ui_hover', { volume: 0.15 }); });
    this.buildLobby();
    $('#loading').classList.add('hidden');
  }

  applyQuality() {
    const q = this.profile.settings.quality;
    this.renderer.setPixelRatio(q === 'low' ? 0.75 : q === 'medium' ? 1 : Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = q !== 'low';
    this.renderer.setSize(innerWidth, innerHeight);
  }

  lobbyFrame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.lobby3d.render(dt);
  }

  // ---------------- lobby ----------------
  buildLobby() {
    const L = $('#lobby');
    L.innerHTML = `
      <header class="topbar">
        <div class="logo"><span class="cf">CROSS<b>FIRE</b></span><span class="cn">穿越火线 · 网页怀旧版</span></div>
        <nav class="tabs">
          <button class="tab on" data-tab="play">开始游戏</button>
          <button class="tab" data-tab="armory">仓库</button>
          <button class="tab" data-tab="shop">商城</button>
          <button class="tab" data-tab="profile">个人信息</button>
          <button class="tab" data-tab="settings">设置</button>
        </nav>
        <div class="lb-me"><div class="rank-badge"></div><div class="me-info"><input class="me-name" maxlength="12"/><div class="me-rank"></div></div><div class="lb-gp"></div></div>
      </header>
      <section class="page" data-page="play"></section>
      <section class="page hidden" data-page="armory"></section>
      <section class="page hidden" data-page="shop"></section>
      <section class="page hidden" data-page="profile"></section>
      <section class="page hidden" data-page="settings"></section>
      <footer class="foot">粉丝自制 · 全部模型/贴图/音效均为程序化生成 · 鼠标拖动可旋转模型</footer>`;
    $$('.tab', L).forEach((t) => t.onclick = () => this.showTab(t.dataset.tab));
    const nameInput = $('.me-name', L);
    nameInput.value = this.profile.name;
    nameInput.onchange = () => { this.profile.name = nameInput.value.trim() || '新兵蛋子'; saveProfile(this.profile); };
    this.refreshHeader();
    this.showTab('play');
  }

  refreshHeader() {
    const r = rankOf(this.profile.exp);
    $('.me-rank').innerHTML = `${r.name}<div class="bar"><i style="width:${r.progress * 100}%"></i></div>`;
    $('.rank-badge').textContent = r.name.slice(-1);
    $('.rank-badge').dataset.lv = r.index;
    $('.lb-gp').innerHTML = `<b>${this.profile.gp.toLocaleString()}</b> GP`;
  }

  showTab(tab) {
    Audio.play('ui_click', { volume: 0.3 });
    $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
    $$('.page').forEach((p) => p.classList.toggle('hidden', p.dataset.page !== tab));
    const page = $(`.page[data-page=${tab}]`);
    if (tab === 'play') { this.renderPlay(page); this.lobby3d.showSoldier(); }
    if (tab === 'armory') this.renderArmory(page);
    if (tab === 'shop') this.renderShop(page);
    if (tab === 'profile') { this.renderProfile(page); this.lobby3d.showSoldier(); }
    if (tab === 'settings') { this.renderSettings(page); this.lobby3d.showSoldier(); }
  }

  renderPlay(page) {
    const R = this.room;
    const maps = MAP_LIST.filter((m) => m.modes.includes(R.mode));
    if (!maps.find((m) => m.id === R.map)) R.map = maps[0]?.id;
    const M = MODES[R.mode];
    const opt = (k, list, fmt = (x) => x) => list.map((v) => `<button class="chip ${R[k] === v ? 'on' : ''}" data-k="${k}" data-v="${v}">${fmt(v)}</button>`).join('');
    page.innerHTML = `
      <div class="play">
        <div class="modes">${Object.entries(MODES).map(([id, m]) => `<button class="card-mode ${R.mode === id ? 'on' : ''}" data-mode="${id}"><b>${m.name}</b><span>${m.desc}</span></button>`).join('')}</div>
        <div class="room">
          <h3>选择地图</h3>
          <div class="maps">${maps.map((m) => `<button class="map-card ${R.map === m.id ? 'on' : ''} m-${m.id}" data-map="${m.id}"><b>${m.name}</b><span>${m.desc || ''}</span></button>`).join('')}</div>
          <h3>房间设置</h3>
          <div class="opts">
            <div class="opt"><label>${R.mode === 'challenge' ? 'AI 队友' : R.mode === 'ffa' || R.mode === 'zombie' ? '玩家人数' : '每队人数'}</label>
              <div>${R.mode === 'challenge' ? opt('allies', [0, 1, 2, 3]) : opt('botsPerTeam', [2, 3, 4, 5, 6, 8], (v) => R.mode === 'ffa' || R.mode === 'zombie' ? v * 2 : v)}</div></div>
            <div class="opt"><label>AI 难度</label><div>${opt('difficulty', Object.keys(DIFFICULTY), (v) => DIFFICULTY[v].name)}</div></div>
            ${M.limits.length ? `<div class="opt"><label>${M.limitLabel}</label><div>${opt('limit', M.limits)}</div></div>` : ''}
            ${R.mode === 'tdm' || R.mode === 'ffa' ? `<div class="opt"><label>时间(分钟)</label><div>${opt('time', [5, 10, 15, 20])}</div></div>` : ''}
            ${R.mode === 'tdm' || R.mode === 'bomb' ? `<div class="opt"><label>阵营</label><div>${opt('team', ['red', 'blue'], (v) => (v === 'red' ? '潜伏者' : '保卫者'))}</div></div>` : ''}
          </div>
          <div class="loadout-line">当前装备：${['primary', 'secondary', 'melee', 'grenade'].map((k) => `<span>${weaponDef(this.profile.loadout[k])?.name || '-'}</span>`).join('')}<button class="btn small" data-a="armory">更换</button></div>
          <button class="btn start" data-a="start">开 始 游 戏</button>
          <div class="keys">WASD 移动 · 空格 跳 · Ctrl/C 蹲 · Shift 静步 · 左键 射击 · 右键 开镜/重击 · R 换弹 · 1-4 切枪 · Q 快切 · E 安放/拆除 · B 换装备 · Tab 计分板 · Esc 暂停</div>
        </div>
      </div>`;
    $$('.card-mode', page).forEach((b) => b.onclick = () => {
      R.mode = b.dataset.mode; R.limit = MODES[R.mode].defLimit;
      if (R.mode === 'bomb') R.map = 'dust';
      if (R.mode === 'zombie' || R.mode === 'challenge') R.map = R.map === 'transport' ? 'transport' : 'town';
      Audio.play('ui_click', { volume: 0.3 }); this.renderPlay(page);
    });
    $$('.map-card', page).forEach((b) => b.onclick = () => { R.map = b.dataset.map; Audio.play('ui_click', { volume: 0.3 }); this.renderPlay(page); });
    $$('.chip', page).forEach((b) => b.onclick = () => {
      const k = b.dataset.k; const v = b.dataset.v;
      R[k] = isNaN(+v) ? v : +v;
      if (k === 'difficulty') { this.profile.settings.difficulty = v; saveProfile(this.profile); }
      Audio.play('ui_click', { volume: 0.3 }); this.renderPlay(page);
    });
    $('[data-a=armory]', page).onclick = () => this.showTab('armory');
    $('[data-a=start]', page).onclick = () => this.startMatch();
  }

  weaponStats(d) {
    if (d.cat === 'melee') return [['轻击伤害', d.damage / 130], ['重击伤害', d.heavyDamage / 130], ['攻击距离', d.reach / 2.5], ['机动性', (d.speed - 0.7) / 0.4]];
    if (d.cat === 'grenade') return [['伤害', d.damage / 130], ['范围', d.radius / 20]];
    const dmg = d.damage * (d.pellets || 1);
    return [['威力', Math.min(1, dmg / 130)], ['射速', Math.min(1, d.rpm / 1100)], ['精准', Math.max(0.05, 1 - (d.cat === 'sniper' ? d.spread : d.spread + d.moveSpread * 0.15) / 1.6)], ['后坐控制', Math.max(0.05, 1 - d.recoilV / 5)], ['机动性', (d.speed - 0.7) / 0.4], ['弹匣', Math.min(1, d.mag / 100)]];
  }

  weaponCard(d, extra = '') {
    return `<div class="w-detail"><h2 class="${d.rarity || ''}">${d.name}</h2><div class="w-cat">${CAT_NAMES[d.cat]}${d.rarity ? ' · ' + RARITY[d.rarity].name : ''}</div><p>${d.desc || ''}</p>
      <div class="stats">${this.weaponStats(d).map(([k, v]) => `<div class="st"><span>${k}</span><div class="bar"><i style="width:${Math.max(4, Math.min(100, v * 100))}%"></i></div></div>`).join('')}</div>
      ${d.mag ? `<div class="nums"><span>伤害 <b>${d.damage}${d.pellets ? '×' + d.pellets : ''}</b></span><span>弹匣 <b>${d.mag}</b></span><span>射速 <b>${Math.round(d.rpm)}</b></span><span>换弹 <b>${d.reload}s</b></span></div>` : ''}${extra}</div>`;
  }

  renderArmory(page) {
    const prof = this.profile;
    const slots = [['primary', '主武器'], ['secondary', '副武器'], ['melee', '近身'], ['grenade', '投掷']];
    this.armSlot = this.armSlot || 'primary';
    const ids = prof.owned.filter((id) => weaponDef(id)?.slot === this.armSlot);
    this.armSel = ids.includes(this.armSel) ? this.armSel : prof.loadout[this.armSlot];
    const d = weaponDef(this.armSel);
    page.innerHTML = `<div class="armory">
      <div class="arm-left"><div class="slot-tabs">${slots.map(([k, n]) => `<button class="chip ${this.armSlot === k ? 'on' : ''}" data-slot="${k}">${n}</button>`).join('')}</div>
        <div class="w-list">${ids.map((id) => { const w = weaponDef(id); return `<button class="w-item ${id === this.armSel ? 'sel' : ''} ${prof.loadout[this.armSlot] === id ? 'eq' : ''} ${w.rarity || ''}" data-id="${id}"><b>${w.name}</b><span>${CAT_NAMES[w.cat]}</span>${prof.loadout[this.armSlot] === id ? '<em>已装备</em>' : ''}</button>`; }).join('')}</div></div>
      <div class="arm-right">${d ? this.weaponCard(d, prof.loadout[this.armSlot] === this.armSel ? '<button class="btn" disabled>已装备</button>' : '<button class="btn primary" data-a="equip">装 备</button>') : ''}</div></div>`;
    $$('.slot-tabs .chip', page).forEach((b) => b.onclick = () => { this.armSlot = b.dataset.slot; this.armSel = null; this.renderArmory(page); });
    $$('.w-item', page).forEach((b) => b.onclick = () => { this.armSel = b.dataset.id; Audio.play('ui_click', { volume: 0.3 }); this.renderArmory(page); });
    const eq = $('[data-a=equip]', page);
    if (eq) eq.onclick = () => {
      prof.loadout[this.armSlot] = this.armSel; saveProfile(prof); Audio.play('mag_in', { volume: 0.5 });
      if (this.armSlot === 'primary') this.lobby3d.setSoldier('blue', d.base, d.variant);
      this.renderArmory(page);
    };
    if (d) this.lobby3d.showGun(d.base, d.variant);
  }

  renderShop(page) {
    const prof = this.profile;
    const items = Object.keys(WEAPONS).filter((id) => WEAPONS[id].price > 0);
    this.shopSel = this.shopSel || items.find((id) => !prof.owned.includes(id)) || items[0];
    const d = weaponDef(this.shopSel);
    const owned = prof.owned.includes(this.shopSel);
    page.innerHTML = `<div class="armory shop">
      <div class="arm-left"><h3>武器商城</h3><div class="w-list">${items.map((id) => { const w = WEAPONS[id]; const o = prof.owned.includes(id); return `<button class="w-item ${id === this.shopSel ? 'sel' : ''} ${o ? 'eq' : ''}" data-id="${id}"><b>${w.name}</b><span>${CAT_NAMES[w.cat]}</span><em>${o ? '已拥有' : w.price + ' GP'}</em></button>`; }).join('')}</div>
      <h3>神器（挑战模式宝箱掉落）</h3><div class="w-list">${Object.keys(SKINS).map((id) => { const s = SKINS[id]; const o = prof.owned.includes(id); return `<button class="w-item ${s.rarity} ${id === this.shopSel ? 'sel' : ''} ${o ? 'eq' : ''}" data-id="${id}"><b>${s.name}</b><span>${RARITY[s.rarity].name}</span><em>${o ? '已拥有' : '宝箱获取'}</em></button>`; }).join('')}</div></div>
      <div class="arm-right">${this.weaponCard(d, owned ? '<button class="btn" disabled>已拥有</button>' : d.skin ? '<button class="btn" disabled>挑战模式宝箱掉落</button>' : `<button class="btn primary" data-a="buy">购买 · ${d.price} GP</button>`)}</div></div>`;
    $$('.w-item', page).forEach((b) => b.onclick = () => { this.shopSel = b.dataset.id; Audio.play('ui_click', { volume: 0.3 }); this.renderShop(page); });
    const buy = $('[data-a=buy]', page);
    if (buy) buy.onclick = () => {
      if (prof.gp < d.price) { buy.textContent = 'GP 不足！'; Audio.play('dry', { volume: 0.5 }); return; }
      prof.gp -= d.price; prof.owned.push(this.shopSel); saveProfile(prof);
      Audio.play('chest', { volume: 0.6 }); this.refreshHeader(); this.renderShop(page);
    };
    this.lobby3d.showGun(d.base, d.variant);
  }

  renderProfile(page) {
    const p = this.profile, s = p.stats, r = rankOf(p.exp);
    const kd = s.deaths ? (s.kills / s.deaths).toFixed(2) : s.kills;
    page.innerHTML = `<div class="profile panel-glass"><h2>${p.name}</h2><div class="big-rank">${r.name}</div>
      <div class="rank-bar"><div class="bar"><i style="width:${r.progress * 100}%"></i></div><span>${p.exp} / ${r.next ?? 'MAX'} EXP</span></div>
      <div class="pstats"><div><b>${s.matches}</b><span>总场次</span></div><div><b>${s.wins}</b><span>胜场</span></div><div><b>${s.kills}</b><span>击杀</span></div><div><b>${s.deaths}</b><span>死亡</span></div><div><b>${kd}</b><span>K/D</span></div><div><b>${s.kills ? Math.round(s.headshots / s.kills * 100) : 0}%</b><span>爆头率</span></div><div><b>${s.chests}</b><span>开启宝箱</span></div><div><b>${p.owned.length}</b><span>拥有武器</span></div></div>
      <div class="ranks">${RANKS.map(([n, e], i) => `<span class="${i <= r.index ? 'got' : ''}">${n}</span>`).join('')}</div></div>`;
  }

  renderSettings(page) {
    const st = this.profile.settings;
    const row = (k, label, min, max, step) => `<label class="set"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${st[k]}" data-k="${k}"><b>${st[k]}</b></label>`;
    page.innerHTML = `<div class="settings panel-glass"><h2>设置</h2>
      ${row('sensitivity', '鼠标灵敏度', 0.2, 3, 0.05)}${row('fov', '视野 FOV', 60, 95, 1)}${row('volume', '音量', 0, 1, 0.05)}
      <label class="set"><span>画质</span><div>${['low', 'medium', 'high'].map((q) => `<button class="chip ${st.quality === q ? 'on' : ''}" data-q="${q}">${{ low: '流畅', medium: '均衡', high: '高清' }[q]}</button>`).join('')}</div></label>
      <label class="set"><span>准星颜色</span><div>${['#3cff3c', '#ff3c3c', '#3cd0ff', '#ffe03c', '#ffffff'].map((c) => `<button class="chip col ${st.crosshair === c ? 'on' : ''}" data-c="${c}" style="--c:${c}"></button>`).join('')}</div></label>
      <label class="set"><span>反转Y轴</span><div><button class="chip ${st.invertY ? 'on' : ''}" data-inv="1">${st.invertY ? '开' : '关'}</button></div></label>
      <button class="btn" data-a="reset">重置存档</button></div>`;
    $$('input', page).forEach((i) => i.oninput = () => { st[i.dataset.k] = parseFloat(i.value); i.nextElementSibling.textContent = i.value; if (i.dataset.k === 'volume') Audio.setVolume(st.volume); saveProfile(this.profile); });
    $$('[data-q]', page).forEach((b) => b.onclick = () => { st.quality = b.dataset.q; saveProfile(this.profile); this.applyQuality(); this.renderSettings(page); });
    $$('[data-c]', page).forEach((b) => b.onclick = () => { st.crosshair = b.dataset.c; saveProfile(this.profile); this.renderSettings(page); });
    $('[data-inv]', page).onclick = () => { st.invertY = !st.invertY; saveProfile(this.profile); this.renderSettings(page); };
    $('[data-a=reset]', page).onclick = () => { if (confirm('确定要重置存档吗？所有武器和战绩将清空。')) { localStorage.clear(); location.reload(); } };
  }

  // ---------------- match ----------------
  async startMatch() {
    Audio.init();
    Audio.stopLobbyMusic();
    const R = this.room;
    const cfg = { ...R, loadout: { ...this.profile.loadout }, playerName: this.profile.name };
    $('#lobby').classList.add('hidden');
    $('#loading').classList.remove('hidden');
    $('#loading .lt').textContent = `正在载入 ${MAP_LIST.find((m) => m.id === R.map).name} · ${MODES[R.mode].name}`;
    await new Promise((r) => setTimeout(r, 50));
    this.renderer.setAnimationLoop(null);
    this.lobby3d.active = false;
    try {
      this.game = new Game(this.renderer, this.hud, this.profile.settings);
      await this.game.start(cfg);
    } catch (e) {
      console.error(e);
      alert('载入失败：' + e.message);
      this.exitMatch();
      return;
    }
    $('#loading').classList.add('hidden');
    $('#clicklock').classList.remove('hidden');
    const lock = () => { if (this.game && !this.game.paused) this.game.input.lock(); };
    $('#clicklock').onclick = lock;
    this.game.input.onLockChange = (locked) => {
      const g = this.game;
      if (!g) return;
      // losing pointer lock unexpectedly (Esc / alt-tab) pauses the match
      if (!locked && !g.ended && !g.paused) g.setPaused(true);
      $('#clicklock').classList.toggle('hidden', locked || g.paused || g.ended);
    };
  }

  exitMatch() {
    if (this.game) { this.game.stop(); this.game = null; }
    $('#clicklock').classList.add('hidden');
    $('#loading').classList.add('hidden');
    $('#lobby').classList.remove('hidden');
    this.lobby3d.active = true;
    this.refreshHeader();
    this.showTab('play');
    this.renderer.toneMappingExposure = 1;
    this.renderer.setAnimationLoop(() => this.lobbyFrame());
    Audio.startLobbyMusic();
  }
}

window.app = new App();
