// 生化模式: after a countdown some humans mutate into host zombies; zombies infect humans by hitting them.
// Humans win by surviving the round; the last survivor becomes the 英雄 (hero).
import * as THREE from 'three';
import { BaseMode } from './base.js';
import { Audio } from '../../audio.js';
import { pickNames } from '../../data/names.js';

const COUNTDOWN = 20, ROUND_TIME = 180;

export class ZombieMode extends BaseMode {
  constructor(game, cfg) {
    super(game, cfg);
    this.id = 'zombie'; this.name = '生化模式';
    this.rounds = cfg.limit || 5;
    this.round = 0;
    this.score = { human: 0, zombie: 0 };
    this.spawnProtect = 0;
  }

  setup() {
    const g = this.game;
    const total = Math.max(4, (this.cfg.botsPerTeam || 6) * 2);
    const names = pickNames(total);
    g.createActor({ name: this.cfg.playerName || '我', team: 'human', isPlayer: true, loadout: this.cfg.loadout });
    for (let i = 0; i < total - 1; i++) g.createActor({ name: names[i], team: 'human', bot: true, loadout: this.botLoadout(i) });
    this.startRound();
  }

  startRound() {
    const g = this.game;
    this.round++;
    this.phase = 'countdown';
    this.phaseT = COUNTDOWN;
    this.roundT = ROUND_TIME;
    this.heroChosen = false;
    for (const a of g.actors) {
      if (a.zombie) g.makeHuman(a, 'human');
      a.team = 'human'; a.hero = false; a.maxHp = 100;
    }
    const spawns = g.meta.spawns.human || g.meta.spawns.ffa || g.meta.spawns.blue;
    g.actors.forEach((a, i) => g.spawnActor(a, spawns[i % spawns.length]));
    for (const a of g.actors) a.respawnT = 9999;
    g.hud.bigMessage(`生化模式 · 第 ${this.round} 回合`, `${COUNTDOWN} 秒后出现母体僵尸，坚持 ${ROUND_TIME / 60} 分钟即可获胜`, 4, 'green');
    Audio.play('round_start', { volume: 0.6 });
  }

  isEnemy(a, b) { return a.team !== b.team; }
  canBuy() { return this.phase === 'countdown'; }
  respawnDelay(a) { return a.zombie ? 5 : 9999; }

  humans() { return this.game.actors.filter((a) => a.alive && !a.zombie); }
  zombies() { return this.game.actors.filter((a) => a.zombie); }

  hostHp() { return 2000 + this.game.actors.length * 250; }

  update(dt) {
    const g = this.game;
    if (this.over) return;
    if (this.phase === 'countdown') {
      const before = Math.ceil(this.phaseT);
      this.phaseT -= dt;
      const now = Math.ceil(this.phaseT);
      if (now !== before && now <= 5 && now > 0) { g.hud.countdown(now); Audio.play('beep', { volume: 0.5, rate: 0.7 }); }
      if (this.phaseT <= 0) this.releaseHosts();
      return;
    }
    if (this.phase === 'end') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        if (this.round >= this.rounds) {
          const win = this.score.human >= this.score.zombie ? 'human' : 'zombie';
          this.finish({ winner: win, text: `${win === 'human' ? '人类' : '僵尸'}阵营获得最终胜利 ${this.score.human}:${this.score.zombie}`, playerWon: (win === 'human') === (this.score.human >= this.score.zombie && !g.player.zombie) || win === g.player.team });
        } else this.startRound();
      }
      return;
    }
    // live
    this.roundT -= dt;
    // zombie respawn near their spawn
    for (const a of g.actors) {
      if (a.alive || !a.zombie) continue;
      a.respawnT -= dt;
      if (a.respawnT <= 0) {
        const sp = this.zombieSpawn();
        g.spawnActor(a, sp);
        a.hp = a.maxHp = Math.round(a.zombieDef.hp * (a.zombie === 'host' ? 0.7 : 1));
        a.protectT = 1;
      }
    }
    const humans = this.humans();
    if (humans.length === 0) return this.endRound('zombie', '人类全部被感染，僵尸胜利！');
    if (humans.length === 1 && !this.heroChosen && g.actors.length >= 4) this.makeHero(humans[0]);
    if (this.roundT <= 0) return this.endRound('human', '人类坚持到了最后，人类胜利！');
    // heartbeat when zombies are near the player
    const p = g.player;
    if (p.alive && !p.zombie) {
      let near = 99;
      for (const z of this.zombies()) if (z.alive) near = Math.min(near, z.pos.distanceTo(p.pos));
      this.hbT = (this.hbT || 0) - dt;
      if (near < 12 && this.hbT <= 0) { this.hbT = near < 5 ? 0.45 : 0.8; Audio.play('heartbeat', { volume: 0.35 }); }
    }
    // ambient growls
    this.growlT = (this.growlT || 0) - dt;
    if (this.growlT <= 0) {
      this.growlT = 1.5 + Math.random() * 2;
      const zs = this.zombies().filter((z) => z.alive);
      if (zs.length) { const z = zs[Math.floor(Math.random() * zs.length)]; Audio.play('growl', { variants: 4, pos: z.eye, volume: 0.8, maxDist: 50 }); }
    }
  }

  zombieSpawn() {
    const g = this.game;
    const list = g.meta.spawns.zombie || g.meta.spawns.red;
    // spawn far from humans
    let best = list[0], bd = -1;
    for (let i = 0; i < 4; i++) {
      const sp = list[Math.floor(Math.random() * list.length)];
      let m = 1e9; for (const h of this.humans()) m = Math.min(m, Math.hypot(h.pos.x - sp[0], h.pos.z - sp[2]));
      if (m > bd) { bd = m; best = sp; }
    }
    return best;
  }

  releaseHosts() {
    const g = this.game;
    this.phase = 'live';
    const humans = this.humans();
    const n = Math.max(1, Math.floor(humans.length / 7));
    for (let i = 0; i < n; i++) {
      const pool = this.humans().filter((h) => !h.isPlayer || Math.random() < 0.3);
      const pick = pool[Math.floor(Math.random() * pool.length)] || this.humans()[0];
      this.infect(pick, null, true);
    }
    Audio.play('scream', { volume: 0.9 });
    g.hud.bigMessage('母体僵尸出现了！', '快找掩体守住！对着僵尸开火可以击退它们', 3, 'green');
  }

  infect(h, by, host = false) {
    const g = this.game;
    const kind = host ? 'host' : (Math.random() < 0.25 ? 'fast' : Math.random() < 0.15 ? 'heavy' : 'normal');
    const pos = h.pos.clone(), yaw = h.yaw;
    h.team = 'zombie';
    g.makeZombie(h, kind, host ? this.hostHp() : null);
    h.alive = true; h.pos.copy(pos); h.yaw = yaw;
    h.model.root.position.copy(pos);
    h.model.reset();
    h.protectT = 1.5;
    h.respawnT = 5;
    if (h.bot) { h.bot.target = null; h.bot.path = null; }
    g.fx.bloodHit(h.eye, new THREE.Vector3(0, 1, 0), true, 3);
    Audio.play('infect', { pos: h.isPlayer ? null : h.eye, volume: 1 });
    if (by) {
      by.kills++; by.score += 3;
      g.hud.killfeed(by, h, { weapon: 'infect' });
      if (by.isPlayer) g.hud.killBanner(1, false, true, false, h, '感染');
    }
    if (h.isPlayer) g.hud.bigMessage(host ? '你变成了母体僵尸！' : '你被感染了！', '左键/右键攻击人类，F 发动疾跑技能', 3, 'green');
  }

  makeHero(h) {
    const g = this.game;
    this.heroChosen = true;
    h.hero = true;
    h.maxHp = 600; h.hp = 600; h.armor = 200;
    h.loadout = { ...h.loadout, primary: 'm249-qilin' };
    const save = { ...h.loadout };
    h.setLoadout(save);
    for (const k of ['primary', 'secondary']) if (h.slots[k]) h.slots[k].reserve = 999;
    h.chestBuff = { dmg: 1.5, t: 9999 };
    g.updateHeldWeapon(h);
    if (h.isPlayer) { g.view.setStyle('hero'); g.view.equip(h); }
    g.hud.bigMessage(h.isPlayer ? '你成为了英雄！' : `${h.name} 成为了英雄！`, '最后的幸存者获得了火麒麟机枪与强化体质', 3, 'gold');
    Audio.play('levelup', { volume: 0.8 });
  }

  onDamage(target, dmg, attacker, info) {
    if (this.phase !== 'live') return false;
    if (attacker && attacker.zombie && !target.zombie) {
      // zombie hit on a human
      if (target.hero) return dmg * 1.2;
      if (target.armor > 60 && info.melee && !info.heavy) { target.armor -= 70; Audio.play('impact_metal', { pos: target.eye, volume: 0.6 }); return false; }
      this.infect(target, attacker);
      return false;
    }
    if (target.zombie && attacker && !attacker.zombie) {
      attacker.score += dmg / 600;
      return dmg;
    }
    return dmg;
  }

  onKill(victim, killer) {
    if (victim.zombie) victim.respawnT = 5;
    if (killer && victim.zombie && killer.isPlayer) this.game.hud.toast('僵尸将在 5 秒后复活');
  }

  endRound(winner, text) {
    if (this.phase === 'end') return;
    this.phase = 'end'; this.phaseT = 6;
    this.score[winner]++;
    const g = this.game;
    for (const a of g.actors) if ((winner === 'human') === !a.zombie) a.score += 2;
    g.hud.bigMessage(winner === 'human' ? '人类胜利' : '僵尸胜利', text, 4, winner === 'human' ? 'blue' : 'green');
  }

  // bots: humans camp defensive hotspots, zombies hunt
  botGoal(brain) {
    const a = brain.a, g = this.game;
    if (a.zombie) return null;
    const hs = g.meta.hotspots || [];
    if (!brain.campSpot && hs.length) {
      const h = hs[Math.floor(Math.random() * hs.length)];
      brain.campSpot = new THREE.Vector3(h[0] + (Math.random() - 0.5) * 2, h[1], h[2] + (Math.random() - 0.5) * 2);
    }
    brain.task = { radius: 1.5 };
    return brain.campSpot;
  }

  hudInfo() {
    let center = null;
    if (this.phase === 'countdown') center = `母体僵尸将在 ${Math.ceil(this.phaseT)} 秒后出现`;
    return {
      type: 'teams', left: { name: '人类', score: this.score.human, cls: 'blue', alive: this.humans().length }, right: { name: '僵尸', score: this.score.zombie, cls: 'green', alive: this.zombies().filter((z) => z.alive).length },
      time: this.phase === 'countdown' ? this.phaseT : this.roundT, goal: `第${this.round}/${this.rounds}回合`, center,
    };
  }
}
