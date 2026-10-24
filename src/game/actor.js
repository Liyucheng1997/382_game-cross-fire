// Actor: shared by the local player and bots. Movement physics, inventory, health.
import * as THREE from 'three';
import { weaponDef } from '../data/weapons.js';

export const GRAVITY = 20;
export const JUMP_V = 7.0;
export const BASE_SPEED = 5.2;
export const RADIUS = 0.35;
export const STAND_H = 1.8;
export const CROUCH_H = 1.2;
export const EYE_STAND = 1.65;
export const EYE_CROUCH = 1.08;

// Zombie archetypes: speed multipliers, hp, jump, attack
export const ZOMBIES = {
  normal: { name: '普通僵尸', hp: 1400, speed: 1.12, jump: 1.15, dmg: 25, reach: 1.7, rate: 0.75, radius: 0.38 },
  host: { name: '母体僵尸', hp: 4500, speed: 1.15, jump: 1.2, dmg: 35, reach: 1.9, rate: 0.7, radius: 0.42 },
  fast: { name: '迅捷僵尸', hp: 1100, speed: 1.4, jump: 1.3, dmg: 18, reach: 1.6, rate: 0.55, radius: 0.34 },
  heavy: { name: '重装僵尸', hp: 5000, speed: 0.85, jump: 0.9, dmg: 45, reach: 2.1, rate: 1.1, radius: 0.55 },
  exploder: { name: '自爆僵尸', hp: 700, speed: 1.2, jump: 1.0, dmg: 60, reach: 1.6, rate: 1, radius: 0.36 },
  boss: { name: '巨型魔王', hp: 40000, speed: 0.95, jump: 0.8, dmg: 70, reach: 3.6, rate: 1.4, radius: 1.1 },
};

let nextId = 1;

export class WeaponState {
  constructor(id) {
    this.def = weaponDef(id);
    this.id = id;
    this.ammo = this.def.mag ?? 0;
    this.reserve = this.def.reserve ?? 0;
    this.count = this.def.count ?? 0; // grenades
  }
}

export class Actor {
  constructor({ name, team, isPlayer = false }) {
    this.id = nextId++;
    this.name = name;
    this.team = team;
    this.isPlayer = isPlayer;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.onGround = true;
    this.crouch = 0; this.wantCrouch = false; this.walking = false;
    this.height = STAND_H;
    this.radius = RADIUS;
    this.hp = 100; this.maxHp = 100; this.armor = 100;
    this.alive = false;
    this.respawnT = 0;
    this.protectT = 0;
    this.zombie = null;   // zombie archetype key when zombie
    this.hero = false;
    this.slots = { primary: null, secondary: null, melee: null, grenade: null };
    this.cur = 'primary';
    this.lastSlot = 'secondary';
    this.switchT = 0; this.reloadT = 0; this.fireT = 0; this.boltT = 0; this.pumpPending = false;
    this.burst = 0;          // consecutive shots for recoil pattern
    this.recoil = 0;         // accumulated vertical kick (degrees)
    this.recoilYaw = 0;
    this.spreadAdd = 0;
    this.scope = 0;          // zoom level index (0 = none)
    this.kills = 0; this.deaths = 0; this.headshots = 0; this.score = 0; this.assists = 0;
    this.streak = 0; this.multi = 0; this.lastKillT = -10;
    this.damageBy = new Map();
    this.model = null;
    this.stepDist = 0;
    this.lastHurtT = -10;
    this.flashT = 0;        // blinded seconds
    this.knock = new THREE.Vector3();
    this.lastAttacker = null;
    this.moveSpeed = 0;
    this.localMove = { x: 0, z: 0 };
    this.firedThisFrame = false;
    this.chestBuff = { dmg: 1, t: 0 };
    this.groundMat = 'metal';
  }

  get weapon() { return this.slots[this.cur]; }
  get eyeHeight() {
    if (this.zombie && this.model) return this.model.eyeHeight * (1 - this.crouch * 0.35);
    return EYE_STAND + (EYE_CROUCH - EYE_STAND) * this.crouch;
  }
  get eye() { return this._eye ? this._eye.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z) : (this._eye = new THREE.Vector3(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z)); }

  setLoadout(lo) {
    this.slots.primary = lo.primary ? new WeaponState(lo.primary) : null;
    this.slots.secondary = lo.secondary ? new WeaponState(lo.secondary) : null;
    this.slots.melee = new WeaponState(lo.melee || 'knife');
    this.slots.grenade = lo.grenade ? new WeaponState(lo.grenade) : null;
    this.cur = this.slots.primary ? 'primary' : this.slots.secondary ? 'secondary' : 'melee';
    this.lastSlot = 'melee';
    this.reloadT = 0; this.switchT = 0.5; this.fireT = 0; this.scope = 0; this.boltT = 0;
  }

  aimDir(out = new THREE.Vector3()) {
    const p = this.pitch + THREE.MathUtils.degToRad(this.recoil);
    const y = this.yaw + THREE.MathUtils.degToRad(this.recoilYaw);
    return out.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
  }

  speedMul() {
    let m = 1;
    if (this.zombie) m = (this.zombieDef?.speed ?? 1.1) * (this.sprintT > 0 ? 1.45 : 1);
    else {
      const w = this.weapon;
      m = w ? (w.def.speed ?? 1) : 1;
      if (this.scope) m *= 0.6;
      if (this.hero) m *= 1.1;
    }
    if (this.crouch > 0.5) m *= 0.45;
    else if (this.walking) m *= 0.52;
    return m;
  }

  // wish: world-space horizontal unit vector (or zero), jump: bool
  move(dt, wish, jump, world, slowAir = true) {
    const speed = BASE_SPEED * this.speedMul();
    // crouch blend
    const tc = this.wantCrouch ? 1 : 0;
    if (tc < this.crouch || this.canStand(world)) this.crouch += Math.sign(tc - this.crouch) * Math.min(Math.abs(tc - this.crouch), dt * 7);
    const zScale = this.zombie && this.model ? this.model.height / STAND_H : 1;
    this.height = (STAND_H + (CROUCH_H - STAND_H) * this.crouch) * zScale;

    const accel = this.onGround ? 55 : (slowAir ? 9 : 20);
    const tx = wish.x * speed, tz = wish.z * speed;
    const dvx = tx - this.vel.x, dvz = tz - this.vel.z;
    const dl = Math.hypot(dvx, dvz), maxDv = accel * dt;
    if (this.onGround || wish.x || wish.z) {
      if (dl <= maxDv) { this.vel.x = tx; this.vel.z = tz; }
      else { this.vel.x += dvx / dl * maxDv; this.vel.z += dvz / dl * maxDv; }
    }
    // external knockback (zombies)
    if (this.knock.lengthSq() > 1e-4) {
      this.vel.x += this.knock.x; this.vel.z += this.knock.z;
      if (this.knock.y > 0 && this.onGround) { this.vel.y = Math.max(this.vel.y, this.knock.y); this.onGround = false; }
      this.knock.set(0, 0, 0);
    }
    if (jump && this.onGround) {
      const jm = this.zombie ? (this.zombieDef?.jump ?? 1) : 1;
      this.vel.y = JUMP_V * Math.sqrt(jm);
      this.onGround = false;
      this.jumped = true;
    }

    const p = this.pos;
    const px = p.x, pz = p.z;
    p.x += this.vel.x * dt; p.z += this.vel.z * dt;
    world.collideHorizontal(p, this.radius, this.height, this.onGround ? 0.45 : 0.25);
    // if blocked, kill velocity component
    if (dt > 0) {
      const ax = (p.x - px) / dt, az = (p.z - pz) / dt;
      if (Math.abs(ax) < Math.abs(this.vel.x) * 0.5) this.vel.x = ax;
      if (Math.abs(az) < Math.abs(this.vel.z) * 0.5) this.vel.z = az;
    }

    this.vel.y -= GRAVITY * dt;
    let ny = p.y + this.vel.y * dt;
    const ground = world.groundHeight(p.x, p.z, p.y + 0.46, this.radius * 0.55);
    this.groundMat = world.lastGroundMat || this.groundMat;
    const wasGround = this.onGround;
    if (this.vel.y > 0) {
      const ceil = world.ceilingHeight(p.x, p.z, p.y + this.height - 0.05, this.radius * 0.5);
      if (ny + this.height > ceil) { ny = ceil - this.height; this.vel.y = 0; }
    }
    if (ny <= ground) {
      if (!wasGround && this.vel.y < -6) this.landed = Math.min(1, -this.vel.y / 14);
      ny = ground; this.vel.y = 0; this.onGround = true;
    } else if (wasGround && this.vel.y <= 0 && ny - ground < 0.35) {
      // stick to slopes / small step-downs
      ny = ground; this.vel.y = 0; this.onGround = true;
    } else {
      this.onGround = false;
    }
    p.y = ny;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.moveSpeed = hs;
    // local move direction for animation
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    // forward vector (-sin, -cos); right vector (cos, -sin)
    this.localMove.x = hs > 0.1 ? (this.vel.x * c - this.vel.z * s) / hs : 0;
    this.localMove.z = hs > 0.1 ? (this.vel.x * s + this.vel.z * c) / hs : 0;
    if (this.onGround) this.stepDist += hs * dt;
  }

  canStand(world) {
    const ceil = world.ceilingHeight(this.pos.x, this.pos.z, this.pos.y + CROUCH_H, this.radius * 0.5);
    return ceil - this.pos.y > STAND_H;
  }

  // returns actual damage dealt
  takeDamage(amount, attacker, info = {}) {
    if (!this.alive || this.protectT > 0) return 0;
    let dmg = amount;
    if (!this.zombie && this.armor > 0 && !info.noArmor) {
      const absorbed = Math.min(this.armor, dmg * 0.25);
      this.armor -= absorbed * 0.6; dmg -= absorbed;
    }
    dmg = Math.min(this.hp, dmg);
    this.hp -= dmg;
    this.lastHurtT = performance.now() / 1000;
    if (attacker && attacker !== this) {
      this.damageBy.set(attacker, (this.damageBy.get(attacker) || 0) + dmg);
      this.lastAttacker = attacker;
    }
    return dmg;
  }
}
