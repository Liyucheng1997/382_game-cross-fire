// 爆破模式: red (潜伏者) plants C4 at A or B, blue (保卫者) defends / defuses. Round based, no respawn.
import * as THREE from 'three';
import { BaseMode, TEAM_NAMES } from './base.js';
import { Audio } from '../../audio.js';
import { M } from '../../gfx/materials.js';

const PLANT_TIME = 3.2, DEFUSE_TIME = 6, BOMB_TIME = 40, ROUND_TIME = 120, FREEZE = 4;

function buildC4() {
  const g = new THREE.Group();
  const block = new THREE.MeshStandardMaterial({ color: 0xc9b98a, roughness: 0.8 });
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.05, 0.26), block);
    b.position.set((i - 1) * 0.08, 0.025, 0); g.add(b);
  }
  const tape = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
  for (const z of [-0.09, 0.09]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.055, 0.025), tape); t.position.set(0, 0.026, z); g.add(t); }
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.09), M.polymer());
  pad.position.set(0, 0.06, 0.02); g.add(pad);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.025), new THREE.MeshStandardMaterial({ color: 0x113311, emissive: 0x33ff55, emissiveIntensity: 0.8 }));
  screen.rotation.x = -Math.PI / 2; screen.position.set(0, 0.071, 0.0); g.add(screen);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), M.glowRed());
  led.position.set(0.045, 0.074, 0.05); g.add(led);
  const wireM = new THREE.MeshStandardMaterial({ color: 0xaa1111, roughness: 0.5 });
  for (let i = 0; i < 3; i++) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.05 + i * 0.02, 0.07, 0.06), new THREE.Vector3(-0.06 + i * 0.03, 0.09, 0.1), new THREE.Vector3(-0.08 + i * 0.08, 0.05, 0.13)]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.004, 5), i === 1 ? M.teamBlue() : wireM));
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.led = led;
  return g;
}

export class BombMode extends BaseMode {
  constructor(game, cfg) {
    super(game, cfg);
    this.id = 'bomb'; this.name = '爆破模式';
    this.winRounds = cfg.limit || 5;
    this.score = { red: 0, blue: 0 };
    this.round = 0;
    this.spawnProtect = 0;
    this.c4 = buildC4();
    this.c4.visible = false;
    game.scene.add(this.c4);
  }

  setup() {
    const per = Math.max(1, this.cfg.botsPerTeam || 5);
    this.createTeams('red', 'blue', per, this.cfg.team || 'red');
    this.startRound();
  }

  startRound() {
    const g = this.game;
    this.round++;
    this.phase = 'freeze';
    this.phaseT = FREEZE;
    this.roundT = ROUND_TIME;
    this.planted = false; this.bombT = 0; this.defuseT = 0; this.plantT = 0; this.defuser = null;
    this.c4.visible = false;
    this.dropped = null;
    this.spawnAll();
    for (const a of g.actors) a.respawnT = 9999;
    const reds = g.actors.filter((a) => a.team === 'red');
    this.carrier = reds.find((a) => a.isPlayer) || reds[Math.floor(Math.random() * reds.length)];
    this.targetSite = Math.random() < 0.5 ? 'A' : 'B';
    // assign blue defenders between sites
    g.actors.filter((a) => a.team === 'blue').forEach((a, i) => { a.guardSite = i % 2 ? 'A' : 'B'; });
    g.hud.bigMessage(`第 ${this.round} 回合`, this.game.player.team === 'red' ? (this.carrier.isPlayer ? '你携带了C4，前往A或B点安放！' : '掩护队友安放C4') : '守住A、B包点，阻止敌人安放C4', 3);
    Audio.play('round_start', { volume: 0.6 });
  }

  frozen() { return this.phase === 'freeze' || this.phase === 'end' && false; }
  canBuy(p) { return this.phase === 'freeze'; }
  respawnDelay() { return 9999; }

  sitePos(site) { const s = this.game.meta.sites[site]; return new THREE.Vector3(...s.center); }
  inSite(a) {
    for (const k of ['A', 'B']) {
      const s = this.game.meta.sites[k];
      if (Math.hypot(a.pos.x - s.center[0], a.pos.z - s.center[2]) < s.radius && Math.abs(a.pos.y - s.center[1]) < 3) return k;
    }
    return null;
  }

  update(dt) {
    const g = this.game;
    if (this.over) return;
    if (this.phase === 'freeze') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) { this.phase = 'live'; g.hud.toast('回合开始！'); }
      return;
    }
    if (this.phase === 'end') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        if (this.score.red >= this.winRounds || this.score.blue >= this.winRounds) {
          const win = this.score.red > this.score.blue ? 'red' : 'blue';
          this.finish({ winner: win, text: `${TEAM_NAMES[win]}胜利`, playerWon: win === g.player.team });
        } else this.startRound();
      }
      return;
    }
    // ---- live ----
    if (!this.planted) {
      this.roundT -= dt;
      if (this.roundT <= 0) return this.endRound('blue', '时间到，保卫者胜利');
    } else {
      this.bombT -= dt;
      const rate = this.bombT < 5 ? 0.15 : this.bombT < 15 ? 0.4 : 1;
      this.beepT = (this.beepT || 0) - dt;
      if (this.beepT <= 0) { this.beepT = rate; Audio.play('beep', { pos: this.c4.position, volume: 0.6, ref: 4 }); this.c4.userData.led.visible = !this.c4.userData.led.visible; }
      if (this.bombT <= 0) {
        g.fx.explosion(this.c4.position, 3);
        Audio.play('explosion', { pos: this.c4.position, volume: 2, ref: 15, maxDist: 400, rolloff: 0.3 });
        g.shake(this.c4.position, 3);
        for (const a of g.actors) if (a.alive && a.pos.distanceTo(this.c4.position) < 18) g.applyDamage(a, 300 * (1 - a.pos.distanceTo(this.c4.position) / 18), null, { weapon: 'c4', explosion: true, dir: a.pos.clone().sub(this.c4.position).normalize(), knock: 30 });
        this.c4.visible = false;
        return this.endRound('red', 'C4已爆炸，潜伏者胜利');
      }
    }
    // dropped bomb pickup
    if (this.dropped && !this.planted) {
      for (const a of g.actors) if (a.alive && a.team === 'red' && a.pos.distanceTo(this.dropped) < 1.2) {
        this.carrier = a; this.dropped = null; this.c4.visible = false;
        if (a.isPlayer) g.hud.toast('你捡起了C4');
        break;
      }
    }
    // bot plant / defuse progress
    for (const a of g.actors) {
      if (!a.alive || !a.bot) continue;
      if (a === this.carrier && !this.planted && this.inSite(a) && !(a.bot.target && a.bot.seeT > 0)) this.progressPlant(a, dt, true);
      if (a.team === 'blue' && this.planted && a.pos.distanceTo(this.c4.position) < 1.5 && !(a.bot.target && a.bot.seeT > 0)) this.progressDefuse(a, dt, true);
    }
    if (this.plantT > 0 && !this.planting) this.plantT = Math.max(0, this.plantT - dt * 2);
    if (this.defuseT > 0 && !this.defusing) this.defuseT = Math.max(0, this.defuseT - dt * 2);
    this.planting = false; this.defusing = false;

    // elimination
    const r = this.alive('red').length, b = this.alive('blue').length;
    if (b === 0) return this.endRound('red', '保卫者全灭，潜伏者胜利');
    if (r === 0 && !this.planted) return this.endRound('blue', '潜伏者全灭，保卫者胜利');
  }

  progressPlant(a, dt) {
    this.planting = true;
    this.plantT += dt;
    a.vel.set(0, a.vel.y, 0);
    if (this.plantT >= PLANT_TIME) {
      this.planted = true; this.bombT = BOMB_TIME; this.plantT = 0;
      this.c4.position.set(a.pos.x, a.pos.y, a.pos.z);
      this.c4.rotation.y = Math.random() * 6;
      this.c4.visible = true;
      this.plantedSite = this.inSite(a);
      Audio.play('plant', { volume: 0.8 });
      this.game.hud.bigMessage('C4 已安放', `${this.plantedSite} 点 · ${BOMB_TIME} 秒后爆炸`, 2.5);
      Audio.say('Bomb has been planted', { pitch: 0.7 });
      a.score += 2;
    }
  }

  progressDefuse(a, dt) {
    this.defusing = true;
    this.defuseT += dt;
    a.vel.set(0, a.vel.y, 0);
    if (this.defuseT >= DEFUSE_TIME) {
      this.planted = false; this.c4.visible = false; this.defuseT = 0;
      a.score += 3;
      Audio.say('Bomb has been defused', { pitch: 0.7 });
      this.endRound('blue', 'C4已拆除，保卫者胜利');
    }
  }

  playerUse(p, holding, dt) {
    if (this.phase !== 'live') return;
    this.useHint = null;
    if (p.team === 'red' && p === this.carrier && !this.planted) {
      if (this.inSite(p)) { this.useHint = '按住 E 安放C4'; if (holding) this.progressPlant(p, dt); }
    } else if (p.team === 'blue' && this.planted && p.pos.distanceTo(this.c4.position) < 1.6) {
      this.useHint = '按住 E 拆除C4'; if (holding) this.progressDefuse(p, dt);
    }
  }

  frozenActor(a) { return this.phase === 'freeze'; }

  endRound(winner, text) {
    if (this.phase === 'end') return;
    this.phase = 'end'; this.phaseT = 5;
    this.score[winner]++;
    const g = this.game;
    for (const a of g.actors) if (a.team === winner) a.score += 1;
    g.hud.bigMessage(winner === g.player.team ? '回合胜利' : '回合失败', text, 3.5, winner === 'red' ? 'red' : 'blue');
    Audio.say(winner === 'red' ? 'Terrorists win' : 'Counter-terrorists win', { pitch: 0.7 });
  }

  onKill(victim) {
    if (victim === this.carrier && !this.planted) {
      this.dropped = victim.pos.clone();
      this.c4.position.copy(this.dropped); this.c4.visible = true;
      this.carrier = null;
    }
  }

  botGoal(brain) {
    const a = brain.a, g = this.game;
    if (this.phase !== 'live') return null;
    if (a.team === 'red') {
      if (this.planted) return this.c4.position;
      if (this.dropped) return this.dropped;
      if (a === this.carrier) return this.sitePos(this.targetSite);
      // escort: go to the target site, slightly offset
      const s = this.sitePos(this.targetSite);
      if (!brain.escortOff) brain.escortOff = new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8);
      return s.clone().add(brain.escortOff);
    }
    // blue
    if (this.planted) return this.c4.position;
    const s = this.sitePos(a.guardSite || 'A');
    if (!brain.guardOff || (brain.guardT = (brain.guardT || 0) - 1 / 60) < 0) {
      brain.guardOff = new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10);
      brain.guardT = 8 + Math.random() * 8;
    }
    return s.clone().add(brain.guardOff);
  }

  hudInfo() {
    let center = null;
    if (this.phase === 'freeze') center = `准备阶段 ${Math.ceil(this.phaseT)}  (B 更换装备)`;
    if (this.plantT > 0) center = `安放中 ${Math.min(100, Math.round(this.plantT / PLANT_TIME * 100))}%`;
    if (this.defuseT > 0) center = `拆除中 ${Math.min(100, Math.round(this.defuseT / DEFUSE_TIME * 100))}%`;
    return {
      type: 'teams', left: { name: TEAM_NAMES.red, score: this.score.red, cls: 'red', alive: this.alive('red').length }, right: { name: TEAM_NAMES.blue, score: this.score.blue, cls: 'blue', alive: this.alive('blue').length },
      time: this.planted ? this.bombT : this.roundT, bomb: this.planted, goal: `第${this.round}回合 · 先胜${this.winRounds}局`, center, hint: this.useHint,
      carrier: this.carrier?.isPlayer,
    };
  }
}
