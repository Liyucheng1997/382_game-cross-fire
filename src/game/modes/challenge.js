// 挑战模式 · 僵尸猎场: PvE waves of zombies; killed zombies drop treasure chests (宝箱).
// Chests give an instant buff and are opened (翻牌) for permanent rewards at the end of the match.
import * as THREE from 'three';
import { BaseMode } from './base.js';
import { Audio } from '../../audio.js';
import { pickNames } from '../../data/names.js';
import { M } from '../../gfx/materials.js';

export const CHEST_TIERS = {
  wood: { name: '木质宝箱', color: 0x8a5a2b, trim: 0x6d6d6d, glow: 0xffd08a, weight: 62 },
  silver: { name: '白银宝箱', color: 0x9aa4ad, trim: 0xdfe6ec, glow: 0xbfe8ff, weight: 28 },
  gold: { name: '黄金宝箱', color: 0xb88a1e, trim: 0xffd75a, glow: 0xffc030, weight: 10 },
};

const chestGeo = {};
export function buildChest(tier = 'wood') {
  const t = CHEST_TIERS[tier];
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: t.color, roughness: tier === 'wood' ? 0.75 : 0.35, metalness: tier === 'wood' ? 0.05 : 0.7, map: tier === 'wood' ? M.crate().map : null });
  const trim = new THREE.MeshStandardMaterial({ color: t.trim, metalness: 1, roughness: 0.25 });
  const W = 0.62, D = 0.42, H = 0.32;
  chestGeo.base ||= new THREE.BoxGeometry(W, H, D);
  const base = new THREE.Mesh(chestGeo.base, body); base.position.y = H / 2; g.add(base);
  // arched lid
  const lid = new THREE.Group(); lid.position.set(0, H, -D / 2); g.add(lid);
  chestGeo.lid ||= (() => { const c = new THREE.CylinderGeometry(D / 2, D / 2, W, 20, 1, false, 0, Math.PI); c.rotateZ(Math.PI / 2); c.rotateX(Math.PI / 2); return c; })();
  const lm = new THREE.Mesh(chestGeo.lid, body); lm.position.set(0, 0, D / 2); lm.rotation.x = -Math.PI / 2; lid.add(lm);
  // straps
  for (const x of [-W * 0.32, W * 0.32]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, H + 0.01, D + 0.02), trim); s.position.set(x, H / 2, 0); g.add(s);
    const s2 = new THREE.Mesh(new THREE.TorusGeometry(D / 2 + 0.005, 0.02, 6, 16, Math.PI), trim); s2.rotation.y = Math.PI / 2; s2.position.set(x, 0, D / 2); lid.add(s2);
  }
  for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), trim); c.position.set(x, 0.035, z); g.add(c);
  }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.03), trim); lock.position.set(0, H - 0.02, D / 2 + 0.015); g.add(lock);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.035), new THREE.MeshStandardMaterial({ color: t.glow, emissive: t.glow, emissiveIntensity: 2 }));
  gem.position.set(0, H - 0.02, D / 2 + 0.04); g.add(gem);
  // glow halo
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.6, 32), new THREE.MeshBasicMaterial({ color: t.glow, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2; halo.position.y = 0.02; g.add(halo);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 3, 16, 1, true), new THREE.MeshBasicMaterial({ color: t.glow, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 1.5; g.add(beam);
  g.traverse((o) => { if (o.isMesh && o !== halo && o !== beam) o.castShadow = true; });
  g.userData = { lid, halo, beam, tier };
  return g;
}

const WAVES = 10;

export class ChallengeMode extends BaseMode {
  constructor(game, cfg) {
    super(game, cfg);
    this.id = 'challenge'; this.name = '挑战模式';
    this.wave = 0;
    this.phase = 'break'; this.phaseT = 8;
    this.toSpawn = 0; this.spawnT = 0;
    this.chests = [];
    this.collected = [];
    this.lives = 3;
    this.spawnProtect = 2;
    this.pool = []; // zombie actors pool
    this.totalKills = 0;
  }

  setup() {
    const g = this.game;
    const names = pickNames(3);
    g.createActor({ name: this.cfg.playerName || '我', team: 'human', isPlayer: true, loadout: this.cfg.loadout });
    const allies = Math.min(3, Math.max(0, this.cfg.allies ?? 3));
    for (let i = 0; i < allies; i++) g.createActor({ name: names[i], team: 'human', bot: true, loadout: this.botLoadout(i + 3), difficulty: 'hard' });
    const spawns = g.meta.spawns.human || g.meta.spawns.blue;
    g.actors.forEach((a, i) => g.spawnActor(a, spawns[i % spawns.length]));
    g.hud.bigMessage('挑战模式 · 僵尸猎场', `抵御 ${WAVES} 波僵尸进攻，击杀僵尸掉落宝箱！`, 4, 'gold');
    Audio.play('round_start', { volume: 0.6 });
  }

  isEnemy(a, b) { return a.team !== b.team; }
  canBuy() { return this.phase === 'break'; }
  respawnDelay(a) { return a.zombie ? 9999 : a.isPlayer ? 6 : 9999; }

  waveComposition(w) {
    const n = 8 + w * 4;
    const list = [];
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      let kind = 'normal';
      if (w >= 2 && r < 0.25) kind = 'fast';
      else if (w >= 3 && r < 0.35) kind = 'exploder';
      else if (w >= 4 && r < 0.45) kind = 'heavy';
      list.push(kind);
    }
    if (w === 5) list.push('bossMini');
    if (w === WAVES) list.push('boss');
    return list;
  }

  hpFor(kind) {
    const w = this.wave;
    const scale = 1 + (w - 1) * 0.22;
    if (kind === 'boss') return 28000;
    if (kind === 'bossMini') return 9000;
    return Math.round({ normal: 260, fast: 160, exploder: 180, heavy: 1400 }[kind] * scale);
  }

  startWave() {
    this.wave++;
    this.phase = 'wave';
    this.queue = this.waveComposition(this.wave);
    this.spawnT = 1;
    const boss = this.wave === WAVES || this.wave === 5;
    this.game.hud.bigMessage(`第 ${this.wave} 波`, boss ? '强大的魔王正在接近……' : `${this.queue.length} 只僵尸来袭`, 3, boss ? 'red' : 'green');
    Audio.play(boss ? 'scream' : 'round_start', { volume: 0.7 });
  }

  spawnZombie(kind) {
    const g = this.game;
    let z = this.pool.find((x) => !x.alive && x.respawnT <= -1);
    const realKind = kind === 'bossMini' ? 'boss' : kind;
    if (!z) {
      z = g.createActor({ name: '', team: 'zombie', bot: true, loadout: { melee: 'knife' } });
      this.pool.push(z);
    }
    g.makeZombie(z, realKind, this.hpFor(kind));
    if (kind === 'bossMini') { z.model.root.scale.setScalar(0.7); z.miniBoss = true; } else { z.model.root.scale.setScalar(1); z.miniBoss = false; }
    z.name = kind === 'boss' ? '巨型魔王' : kind === 'bossMini' ? '魔王守卫' : z.zombieDef.name;
    z.kindKey = kind;
    const list = g.meta.spawns.zombie || g.meta.spawns.red;
    // choose spawn far from the humans' centroid
    let best = list[0], bd = -1;
    for (let i = 0; i < 5; i++) {
      const sp = list[Math.floor(Math.random() * list.length)];
      let m = 1e9; for (const h of g.actors) if (h.alive && !h.zombie) m = Math.min(m, Math.hypot(h.pos.x - sp[0], h.pos.z - sp[2]));
      if (m > bd && m > 8) { bd = m; best = sp; }
    }
    g.spawnActor(z, best);
    z.hp = z.maxHp;
    z.protectT = 0.5;
    z.respawnT = 0;
    if (kind === 'boss' || kind === 'bossMini') g.hud.bossBar(z);
  }

  update(dt) {
    const g = this.game;
    if (this.over) return;
    // human respawns (player uses lives, bots revive each wave)
    for (const a of g.actors) {
      if (a.alive || a.zombie) continue;
      if (a.isPlayer) {
        a.respawnT -= dt;
        if (a.respawnT <= 0 && this.lives > 0) {
          this.lives--;
          g.spawnActor(a, (g.meta.spawns.human || g.meta.spawns.blue)[0]);
          g.hud.toast(`使用复活币，剩余 ${this.lives} 次`);
        }
      }
    }
    const humansAlive = g.actors.filter((a) => a.alive && !a.zombie);
    if (humansAlive.length === 0 && this.lives <= 0) {
      return this.finish({ winner: 'zombie', text: `挑战失败 · 坚持到第 ${this.wave} 波`, playerWon: false, chests: this.collected });
    }
    if (this.phase === 'break') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.startWave();
    } else if (this.phase === 'wave') {
      this.spawnT -= dt;
      const aliveZ = this.pool.filter((z) => z.alive).length;
      if (this.queue.length && this.spawnT <= 0 && aliveZ < 16) {
        this.spawnT = Math.max(0.35, 1.6 - this.wave * 0.12);
        this.spawnZombie(this.queue.shift());
      }
      if (!this.queue.length && aliveZ === 0) this.waveCleared();
    }
    // exploders detonate next to humans
    for (const z of this.pool) {
      if (!z.alive || z.zombie !== 'exploder') continue;
      for (const h of humansAlive) if (h.pos.distanceTo(z.pos) < 1.8) { this.detonate(z); break; }
    }
    // chests: bob, spin and pickup
    for (const c of this.chests) {
      if (c.taken) continue;
      c.t += dt;
      c.mesh.rotation.y += dt * 1.2;
      c.mesh.position.y = c.y + 0.12 + Math.sin(c.t * 3) * 0.06;
      c.mesh.userData.halo.material.opacity = 0.3 + Math.sin(c.t * 5) * 0.15;
      const p = g.player;
      if (p.alive && !p.zombie && p.pos.distanceTo(c.mesh.position) < 1.4) this.takeChest(c);
      if (c.t > 45) { c.taken = true; g.scene.remove(c.mesh); }
    }
    this.chests = this.chests.filter((c) => !c.taken || c.anim);
    for (const c of this.chests) if (c.anim) {
      c.anim -= dt;
      c.mesh.userData.lid.rotation.x = -Math.min(1.9, (0.8 - c.anim) * 5);
      c.mesh.position.y += dt * 1.5;
      c.mesh.scale.multiplyScalar(1 - dt * 1.2);
      if (c.anim <= 0) { c.anim = 0; g.scene.remove(c.mesh); }
    }
  }

  detonate(z) {
    const g = this.game;
    g.fx.explosion(z.pos.clone().setY(z.pos.y + 0.8), 0.8);
    Audio.play('explosion', { pos: z.pos, volume: 1, ref: 6 });
    for (const h of g.actors) {
      if (!h.alive || h.zombie) continue;
      const d = h.pos.distanceTo(z.pos);
      if (d < 4) g.applyDamage(h, 45 * (1 - d / 4) + 10, z, { weapon: 'explode', explosion: true, dir: h.pos.clone().sub(z.pos).normalize(), knock: 20 });
    }
    g.kill(z, null, { weapon: 'explode' });
  }

  waveCleared() {
    const g = this.game;
    if (this.wave >= WAVES) {
      return this.finish({ winner: 'human', text: '挑战成功！击败了巨型魔王！', playerWon: true, chests: this.collected });
    }
    this.phase = 'break'; this.phaseT = 10;
    // revive allies and resupply
    for (const a of g.actors) {
      if (a.zombie) continue;
      if (!a.alive && !a.isPlayer) g.spawnActor(a, (g.meta.spawns.human || g.meta.spawns.blue)[a.id % 4]);
      if (a.alive) { a.hp = Math.min(a.maxHp, a.hp + 50); for (const k of ['primary', 'secondary']) if (a.slots[k]) { a.slots[k].ammo = a.slots[k].def.mag; a.slots[k].reserve = 999; } if (a.slots.grenade) a.slots.grenade.count = a.slots.grenade.def.count; }
    }
    g.hud.bigMessage(`第 ${this.wave} 波 已清除`, `补给完毕 · ${this.phaseT} 秒后下一波（按 B 更换武器）`, 3, 'gold');
    Audio.play('levelup', { volume: 0.6 });
  }

  onKill(victim, killer) {
    if (!victim.zombie) return;
    victim.respawnT = -1;
    this.totalKills++;
    if (killer && !killer.zombie) killer.score += victim.kindKey === 'boss' ? 50 : victim.kindKey === 'bossMini' ? 20 : victim.zombie === 'heavy' ? 3 : 1;
    // chest drop
    const boss = victim.kindKey === 'boss' || victim.kindKey === 'bossMini';
    const dropChance = boss ? 1 : victim.zombie === 'heavy' ? 0.6 : 0.22;
    if (Math.random() < dropChance) {
      const n = boss ? (victim.kindKey === 'boss' ? 4 : 2) : 1;
      for (let i = 0; i < n; i++) {
        const tier = boss ? (i === 0 ? 'gold' : Math.random() < 0.5 ? 'silver' : 'gold') : this.rollTier();
        const off = new THREE.Vector3((Math.random() - 0.5) * (boss ? 3 : 0.4), 0, (Math.random() - 0.5) * (boss ? 3 : 0.4));
        this.dropChest(victim.pos.clone().add(off), tier);
      }
    }
    if (boss) this.game.hud.bossBar(null);
  }

  rollTier() {
    const r = Math.random() * 100;
    return r < CHEST_TIERS.gold.weight ? 'gold' : r < CHEST_TIERS.gold.weight + CHEST_TIERS.silver.weight ? 'silver' : 'wood';
  }

  dropChest(pos, tier) {
    const g = this.game;
    const mesh = buildChest(tier);
    const y = g.world.groundHeight(pos.x, pos.z, pos.y + 1);
    mesh.position.set(pos.x, y, pos.z);
    g.scene.add(mesh);
    this.chests.push({ mesh, tier, t: 0, y, taken: false, anim: 0 });
  }

  takeChest(c) {
    const g = this.game, p = g.player;
    c.taken = true; c.anim = 0.8;
    this.collected.push(c.tier);
    Audio.play('chest', { volume: 0.8 });
    // instant reward
    const r = Math.random();
    let msg;
    if (r < 0.3) { for (const k of ['primary', 'secondary']) if (p.slots[k]) p.slots[k].ammo = p.slots[k].def.mag; if (p.slots.grenade) p.slots.grenade.count = p.slots.grenade.def.count + 1; msg = '弹药补满 + 手雷'; }
    else if (r < 0.6) { p.hp = Math.min(p.maxHp, p.hp + 50); p.armor = 100; msg = '生命 +50 · 护甲修复'; }
    else if (r < 0.85) { p.chestBuff = { dmg: 2, t: 15 }; msg = '双倍伤害 15 秒！'; }
    else { this.lives++; msg = '复活币 +1'; }
    g.hud.chestToast(CHEST_TIERS[c.tier].name, msg, c.tier);
  }

  botGoal(brain) {
    const a = brain.a, g = this.game, p = g.player;
    if (a.zombie) return null;
    // allies stay near the player (or hotspots if player dead)
    const anchor = p.alive ? p.pos : null;
    if (anchor && a.pos.distanceTo(anchor) > 7) {
      if (!brain.followOff) brain.followOff = new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6);
      return anchor.clone().add(brain.followOff);
    }
    if (!anchor) {
      const hs = g.meta.hotspots || [];
      if (hs.length) { const h = hs[a.id % hs.length]; return new THREE.Vector3(h[0], h[1], h[2]); }
    }
    brain.task = { radius: 2 };
    return a.pos;
  }

  hudInfo() {
    const z = this.pool.filter((x) => x.alive).length + (this.queue?.length || 0);
    return {
      type: 'challenge', wave: this.wave, waves: WAVES, remaining: this.phase === 'wave' ? z : 0, lives: this.lives,
      chests: this.collected.length, center: this.phase === 'break' ? `下一波 ${Math.ceil(this.phaseT)} 秒` : null, kills: this.totalKills,
    };
  }
}
