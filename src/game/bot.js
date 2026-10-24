// Bot AI: perception, aiming, navigation and per-mode goals.
import * as THREE from 'three';
import { switchWeapon, startReload } from './weaponctl.js';

export const DIFFICULTY = {
  easy: { name: '简单', reaction: 0.65, aimErr: 4.5, turn: 220, headChance: 0.1, fov: 0.35, burst: 4, accuracyGain: 0.6 },
  normal: { name: '普通', reaction: 0.38, aimErr: 2.4, turn: 380, headChance: 0.25, fov: 0.2, burst: 6, accuracyGain: 0.8 },
  hard: { name: '困难', reaction: 0.22, aimErr: 1.3, turn: 600, headChance: 0.4, fov: 0.05, burst: 9, accuracyGain: 1.0 },
  hell: { name: '地狱', reaction: 0.13, aimErr: 0.7, turn: 900, headChance: 0.6, fov: -0.2, burst: 14, accuracyGain: 1.0 },
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _wish = new THREE.Vector3();

function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

export class BotBrain {
  constructor(actor, game, diffKey = 'normal') {
    this.a = actor; this.game = game;
    this.diff = DIFFICULTY[diffKey] || DIFFICULTY.normal;
    this.state = 'roam';
    this.path = null; this.pi = 0; this.repathT = 0; this.goal = null;
    this.target = null; this.seeT = 0; this.lastSeen = new THREE.Vector3(); this.lastSeenT = -100;
    this.reactT = 0; this.perceiveT = Math.random() * 0.2;
    this.strafeT = 0; this.strafeDir = 1;
    this.stuckT = 0; this.lastPos = new THREE.Vector3();
    this.aimYaw = actor.yaw; this.aimPitch = 0;
    this.errYaw = 0; this.errPitch = 0; this.errT = 0;
    this.input = { fire: false, fire2: false, firePressed: false, fire2Pressed: false, reload: false };
    this.prevFire = false;
    this.wantJump = false;
    this.burstLeft = 0; this.burstPause = 0;
    this.campSpot = null;
    this.hearPos = null; this.hearT = -100;
    this.task = null; // mode-specific: {type:'plant'|'defuse'|'guard', pos}
    this.crouchT = 0;
    this.headAim = Math.random() < this.diff.headChance;
    this.followT = 0;
  }

  hear(pos) {
    if (this.target && this.seeT > 0) return;
    if (this.a.pos.distanceTo(pos) < 45) { this.hearPos = pos.clone(); this.hearT = this.game.time; }
  }

  // ------------- perception -------------
  perceive() {
    const g = this.game, a = this.a, eye = a.eye;
    let best = null, bestScore = Infinity;
    const fwdX = -Math.sin(a.yaw), fwdZ = -Math.cos(a.yaw);
    const hurtRecently = g.time - (a.lastHurtT || -10) < 1.5;
    for (const t of g.actors) {
      if (t === a || !t.alive || !g.isEnemy(a, t)) continue;
      const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z, dist = Math.hypot(dx, dz);
      const maxD = g.fogVisRange ?? 90;
      if (dist > maxD) continue;
      const dot = (dx * fwdX + dz * fwdZ) / (dist || 1);
      const zombieSense = a.zombie && dist < 30; // zombies smell humans
      if (dot < this.diff.fov && !hurtRecently && !zombieSense && dist > 3) continue;
      _v.set(t.pos.x, t.pos.y + t.height * 0.75, t.pos.z);
      let visible = g.world.lineOfSight(eye, _v) && !g.fx.smokeBlocks(eye, _v);
      if (!visible) { _v.y = t.pos.y + t.height * 0.35; visible = g.world.lineOfSight(eye, _v) && !g.fx.smokeBlocks(eye, _v); }
      if (!visible && !zombieSense) continue;
      const score = dist * (visible ? 1 : 3) * (t === this.target ? 0.7 : 1) * (t.isPlayer ? 0.9 : 1);
      if (score < bestScore) { bestScore = score; best = { t, visible }; }
    }
    if (best && best.visible) {
      if (this.target !== best.t) {
        this.target = best.t;
        this.reactT = this.diff.reaction * (0.7 + Math.random() * 0.6) * (a.flashT > 0 ? 3 : 1);
        this.headAim = Math.random() < this.diff.headChance;
        this.errYaw = (Math.random() - 0.5) * 2 * this.diff.aimErr * 3;
        this.errPitch = (Math.random() - 0.5) * 2 * this.diff.aimErr * 2;
      }
      this.seeT = 0.4;
      this.lastSeen.copy(best.t.pos); this.lastSeenT = g.time;
    } else if (best && a.zombie) {
      // zombies track humans without LOS
      this.target = best.t; this.lastSeen.copy(best.t.pos); this.lastSeenT = g.time;
      this.seeT = 0;
    } else {
      this.seeT = Math.max(0, this.seeT - 0.15);
      if (this.target && (!this.target.alive || g.time - this.lastSeenT > 4)) this.target = null;
    }
  }

  // ------------- navigation -------------
  goTo(pos, force = false) {
    if (!force && this.goal && this.goal.distanceTo(pos) < 1.5 && this.path && this.repathT > 0) return;
    this.goal = (this.goal || new THREE.Vector3()).copy(pos);
    if (!this.game.requestPath(this)) { this.repathT = 0.2; return; }
  }

  computePath() {
    const a = this.a, gpos = this.goal;
    if (!gpos) return;
    this.path = this.game.nav.findPath(a.pos.x, a.pos.y, a.pos.z, gpos.x, gpos.y, gpos.z, { canJump: true });
    this.pi = 0;
    this.repathT = a.zombie ? 0.6 + Math.random() * 0.4 : 2 + Math.random();
  }

  followPath(dt, wish) {
    const a = this.a;
    if (!this.path || this.pi >= this.path.length) return false;
    let wp = this.path[this.pi];
    let dx = wp.x - a.pos.x, dz = wp.z - a.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.55 && Math.abs(wp.y - a.pos.y) < 1.3) {
      this.pi++;
      if (this.pi >= this.path.length) return false;
      wp = this.path[this.pi];
      dx = wp.x - a.pos.x; dz = wp.z - a.pos.z; d = Math.hypot(dx, dz);
    }
    wish.set(dx / (d || 1), 0, dz / (d || 1));
    if (wp.jump && d < 1.6 && wp.y - a.pos.y > 0.4 && a.onGround) this.wantJump = true;
    return true;
  }

  // ------------- main update -------------
  update(dt) {
    const a = this.a, g = this.game, inp = this.input;
    if (!a.alive) return;
    inp.fire = false; inp.fire2 = false; inp.reload = false;
    this.wantJump = false;
    a.walking = false;
    this.perceiveT -= dt;
    if (this.perceiveT <= 0) { this.perceiveT = 0.15 + Math.random() * 0.05; this.perceive(); }
    this.repathT -= dt;
    this.reactT -= dt;
    _wish.set(0, 0, 0);

    const t = this.target;
    const engaged = t && t.alive && this.seeT > 0;
    let lookAt = null;

    if (a.zombie) this.updateZombie(dt, _wish);
    else if (engaged) {
      lookAt = this.engage(dt, t, _wish);
    } else {
      this.updateGoal(dt, _wish);
      // reload when safe
      const w = a.weapon;
      if (w && w.def.mag && w.ammo < w.def.mag * 0.4 && w.reserve > 0 && a.reloadT <= 0) inp.reload = true;
      if (a.cur !== 'primary' && a.slots.primary && (a.slots.primary.ammo > 0 || a.slots.primary.reserve > 0) && !this.task?.melee) switchWeapon(a, 'primary');
    }
    if (a.zombie && t && t.alive) {
      _v.set(t.pos.x, t.pos.y + t.height * 0.6, t.pos.z);
      if (a.pos.distanceTo(t.pos) < 6 || this.seeT > 0) lookAt = _v;
    }

    // stuck detection
    const moved = this.lastPos.distanceTo(a.pos);
    this.lastPos.copy(a.pos);
    if (_wish.lengthSq() > 0.1 && moved < 0.6 * dt) {
      this.stuckT += dt;
      if (this.stuckT > 0.5 && a.onGround) this.wantJump = true;
      if (this.stuckT > 1.4) { this.stuckT = 0; this.path = null; this.repathT = 0; this.strafeDir *= -1; _wish.set(-_wish.z * this.strafeDir, 0, _wish.x * this.strafeDir); }
    } else this.stuckT = Math.max(0, this.stuckT - dt);

    // look direction
    let dy, dp;
    if (lookAt) {
      _aim.subVectors(lookAt, a.eye);
      dy = Math.atan2(-_aim.x, -_aim.z);
      dp = Math.atan2(_aim.y, Math.hypot(_aim.x, _aim.z));
    } else if (_wish.lengthSq() > 0.01) {
      dy = Math.atan2(-_wish.x, -_wish.z); dp = 0;
    } else { dy = this.aimYaw; dp = this.aimPitch * 0.9; }
    // aim error converges over time while engaged
    if (engaged) {
      this.errT += dt;
      const k = Math.exp(-dt * 2.2 * this.diff.accuracyGain);
      this.errYaw *= k; this.errPitch *= k;
      // wobble
      const wob = this.diff.aimErr * 0.5;
      dy += THREE.MathUtils.degToRad(this.errYaw + Math.sin(g.time * 3.1 + a.id) * wob);
      dp += THREE.MathUtils.degToRad(this.errPitch + Math.cos(g.time * 2.3 + a.id) * wob * 0.6);
      // partial recoil compensation
      dp -= THREE.MathUtils.degToRad(a.recoil * 0.6);
    }
    const maxTurn = THREE.MathUtils.degToRad(this.diff.turn * (a.zombie ? 0.8 : 1)) * dt;
    const ddy = angDiff(dy, this.aimYaw);
    this.aimYaw += Math.max(-maxTurn, Math.min(maxTurn, ddy));
    this.aimPitch += Math.max(-maxTurn, Math.min(maxTurn, dp - this.aimPitch));
    a.yaw = this.aimYaw; a.pitch = THREE.MathUtils.clamp(this.aimPitch, -1.3, 1.3);

    inp.firePressed = inp.fire && !this.prevFire;
    inp.fire2Pressed = inp.fire2 && !this.prevFire2;
    this.prevFire = inp.fire; this.prevFire2 = inp.fire2;
    a.wantCrouch = this.crouchT > 0;
    this.crouchT -= dt;
    return { wish: _wish, jump: this.wantJump };
  }

  engage(dt, t, wish) {
    const a = this.a, g = this.game, inp = this.input, w = a.weapon;
    const dist = a.pos.distanceTo(t.pos);
    // aim point
    const aimY = this.headAim && dist < 50 ? t.eyeHeight + 0.03 : t.height * 0.68;
    const lookAt = _v2.set(t.pos.x, t.pos.y + aimY, t.pos.z);
    // weapon choice
    if (w) {
      if (w.def.cat === 'grenade' || (w.ammo <= 0 && w.reserve <= 0)) {
        if (a.slots.primary && (a.slots.primary.ammo + a.slots.primary.reserve) > 0) switchWeapon(a, 'primary');
        else if (a.slots.secondary && (a.slots.secondary.ammo + a.slots.secondary.reserve) > 0) switchWeapon(a, 'secondary');
        else switchWeapon(a, 'melee');
      } else if (w.ammo <= 0 && a.reloadT <= 0) {
        if (dist < 12 && a.cur === 'primary' && a.slots.secondary?.ammo > 0) switchWeapon(a, 'secondary');
        else startReload(a);
      }
    }
    const cat = w?.def.cat;
    // movement: strafe / approach / retreat
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeT = 0.4 + Math.random() * 0.9;
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      if (Math.random() < 0.18 && this.diff.reaction < 0.4) this.crouchT = 0.6 + Math.random();
      if (Math.random() < 0.07) this.wantJump = true;
    }
    const tx = t.pos.x - a.pos.x, tz = t.pos.z - a.pos.z, tl = Math.hypot(tx, tz) || 1;
    const fx = tx / tl, fz = tz / tl;
    let approach = 0;
    if (cat === 'melee') approach = 1;
    else if (cat === 'shotgun' || cat === 'smg') approach = dist > 9 ? 0.7 : 0;
    else if (cat === 'sniper') approach = dist < 10 ? -0.6 : 0;
    else approach = dist > 35 ? 0.5 : dist < 6 ? -0.4 : 0;
    if (t.zombie) approach = dist < 8 ? -1 : dist < 14 ? -0.3 : 0; // kite zombies
    const strafeAmt = cat === 'sniper' && a.scope ? 0.2 : 0.8;
    wish.set(fx * approach - fz * this.strafeDir * strafeAmt, 0, fz * approach + fx * this.strafeDir * strafeAmt);
    if (wish.lengthSq() > 1) wish.normalize();
    // avoid walking off ledges while strafing
    const ahead = g.world.groundHeight(a.pos.x + wish.x * 0.8, a.pos.z + wish.z * 0.8, a.pos.y + 0.5);
    if (ahead < a.pos.y - 1.5) { wish.set(0, 0, 0); this.strafeDir *= -1; }
    if (cat === 'sniper' && !a.scope && dist > 12) inp.fire2 = true; // scope in
    // fire control
    if (this.reactT <= 0 && w && a.switchT <= 0) {
      _aim.subVectors(lookAt, a.eye).normalize();
      const fwd = a.aimDir(new THREE.Vector3());
      const err = Math.acos(Math.min(1, fwd.dot(_aim)));
      const tol = Math.max(0.025, Math.atan2(0.45, dist));
      if (err < tol * 2.2) {
        if (cat === 'melee') { if (dist < 2.2) inp.fire = true; }
        else if (w.def.auto) {
          // burst control: long bursts close, taps far
          if (this.burstPause > 0) this.burstPause -= dt;
          else {
            inp.fire = true;
            if (a.firedThisFrame) {
              this.burstLeft--;
              if (this.burstLeft <= 0) {
                this.burstLeft = dist < 12 ? this.diff.burst * 2 : dist < 30 ? this.diff.burst : 3;
                this.burstPause = dist < 12 ? 0.08 : 0.25 + Math.random() * 0.2;
              }
            }
          }
        } else {
          // semi auto: alternate press/release
          inp.fire = !this.prevFire && a.fireT <= 0 && (cat !== 'sniper' || a.scope || dist < 10);
        }
      }
    }
    if (t.zombie) this.crouchT = 0;
    return lookAt;
  }

  // non-combat movement goal, delegated to mode
  updateGoal(dt, wish) {
    const a = this.a, g = this.game;
    let goal = g.mode.botGoal?.(this) || null;
    if (!goal) {
      if (this.hearPos && g.time - this.hearT < 6) goal = this.hearPos;
      else if (this.target && g.time - this.lastSeenT < 4) goal = this.lastSeen;
    }
    if (!goal) {
      if (!this.roamGoal || a.pos.distanceTo(this.roamGoal) < 2 || (this.roamT -= dt) < 0) {
        this.roamGoal = g.pickRoamPoint(this);
        this.roamT = 15 + Math.random() * 10;
      }
      goal = this.roamGoal;
    }
    if (!goal) return;
    if (this.repathT <= 0 || !this.goal || this.goal.distanceTo(goal) > 2) this.goTo(goal, true);
    const close = a.pos.distanceTo(goal) < (this.task?.radius ?? 1.2);
    if (!close) this.followPath(dt, wish);
    else if (this.task?.onArrive) this.task.onArrive(this, dt);
  }

  updateZombie(dt, wish) {
    const a = this.a, g = this.game, t = this.target;
    if (!t || !t.alive) {
      // head to nearest human or roam
      let best = null, bd = Infinity;
      for (const h of g.actors) if (h.alive && g.isEnemy(a, h)) { const d = h.pos.distanceTo(a.pos); if (d < bd) { bd = d; best = h; } }
      if (best) { this.target = best; this.lastSeen.copy(best.pos); this.lastSeenT = g.time; }
      else return this.updateGoal(dt, wish);
    }
    const tgt = this.target;
    const dist = a.pos.distanceTo(tgt.pos);
    const direct = dist < 5 && Math.abs(tgt.pos.y - a.pos.y) < 1 && g.world.lineOfSight(a.eye, tgt.eye);
    if (direct) {
      const dx = tgt.pos.x - a.pos.x, dz = tgt.pos.z - a.pos.z, l = Math.hypot(dx, dz) || 1;
      wish.set(dx / l, 0, dz / l);
    } else {
      if (this.repathT <= 0 || !this.path || (this.goal && this.goal.distanceTo(tgt.pos) > 3)) this.goTo(tgt.pos, true);
      if (!this.followPath(dt, wish)) {
        const dx = tgt.pos.x - a.pos.x, dz = tgt.pos.z - a.pos.z, l = Math.hypot(dx, dz) || 1;
        wish.set(dx / l, 0, dz / l);
      }
    }
    // jump at humans standing higher up
    if (dist < 4 && tgt.pos.y - a.pos.y > 0.6 && a.onGround) this.wantJump = true;
    const reach = a.zombieDef.reach + (tgt.radius || 0.35);
    if (dist < reach + 0.3 && Math.abs(tgt.pos.y - a.pos.y) < 2.2) {
      if (Math.random() < 0.8) this.input.fire = true; else this.input.fire2 = true;
    }
    // zombie skill: sprint when close but not in reach
    if (dist < 18 && dist > 4 && (a.skillCd || 0) <= 0 && Math.random() < 0.02) g.zombieSkill?.(a);
  }
}
