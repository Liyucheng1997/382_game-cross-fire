// Match orchestrator: world, actors, player control, rendering, damage/kill flow.
import * as THREE from 'three';
import { setupEnvironment } from '../gfx/env.js';
import { World } from '../world/world.js';
import { MapBuilder } from '../world/mapkit.js';
import { NavGrid } from '../world/nav.js';
import { Effects } from './effects.js';
import { ViewModel } from './viewmodel.js';
import { Input } from './input.js';
import { Actor, ZOMBIES, RADIUS } from './actor.js';
import { BotBrain } from './bot.js';
import { updateWeapon, switchWeapon, emit } from './weaponctl.js';
import { Audio } from '../audio.js';
import { buildGun, buildShell } from '../models/guns.js';
import { createSoldier, createZombie } from '../models/characters.js';
import { MAPS } from '../maps/index.js';
import { createMode } from './modes/index.js';
import { weaponDef } from '../data/weapons.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const UP = new THREE.Vector3(0, 1, 0);

export class Game {
  constructor(renderer, hud, settings) {
    this.renderer = renderer;
    this.hud = hud;
    this.settings = settings;
    this.input = new Input(renderer.domElement);
    this.running = false;
    this.paused = false;
    this.onExit = null;
  }

  async start(cfg) {
    this.cfg = cfg;
    const mapDef = MAPS[cfg.map];
    this.mapDef = mapDef;
    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.05, 2500);
    this.camera.rotation.order = 'YXZ';
    scene.add(this.camera);
    this.env = setupEnvironment(scene, this.renderer, mapDef.env?.preset || 'day', mapDef.env || {}, mapDef.size || 80);
    this.world = new World();
    const mb = (this.mb = new MapBuilder(scene, this.world));
    this.meta = mapDef.build(mb);
    mb.finalize();
    this.killY = this.meta.killY ?? -20;
    this.nav = new NavGrid(this.world, this.meta.bounds, this.killY);
    this.fx = new Effects(scene);
    this.fx.onCasingBounce = (p) => { if (this.player && p.distanceTo(this.player.pos) < 6) Audio.play('casing', { pos: p, volume: 0.25, ref: 1 }); };
    this.view = new ViewModel(this.renderer, scene);
    this.view.syncLighting(this.env);
    this.fogVisRange = mapDef.env?.preset === 'night' ? 45 : 95;
    Audio.setReverb(mapDef.env?.preset === 'night' ? 0.35 : 0.2);

    this.actors = [];
    this.projectiles = [];
    this.pathQueue = [];
    this.time = 0;
    this.shakeAmt = 0;
    this.killfeed = [];
    this.gunCache = new Map();
    this.ended = false;

    this.mode = createMode(cfg.mode, this, cfg);
    this.mode.setup();
    this.player = this.actors.find((a) => a.isPlayer);
    this.view.setStyle(this.player.team === 'blue' || this.player.team === 'human' ? 'blue' : 'red');
    this.view.equip(this.player);
    this.hud.startMatch(this);
    this.hud.buildMinimap(this.nav, this.meta.bounds);

    this.input.enabled = true;
    this.input.onLockChange = (locked) => {
      if (!locked && this.running && !this.ended) this.setPaused(true);
    };
    this.running = true;
    this.clock = new THREE.Clock();
    this._resize = () => {
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
      this.view.resize(); this.renderer.setSize(innerWidth, innerHeight);
      this.fx.add.mat.uniforms.scale.value = this.fx.alpha.mat.uniforms.scale.value = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    };
    addEventListener('resize', this._resize);
    this._resize();
    this.renderer.setAnimationLoop(() => this.frame());
    // warm-up render so shaders compile before the first real frame
    this.renderer.compile(scene, this.camera);
    this.input.lock();
  }

  setPaused(p) {
    this.paused = p;
    this.hud.showPause(p);
    if (!p) this.input.lock();
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.input.enabled = false;
    this.input.unlock();
    removeEventListener('resize', this._resize);
    // dispose scene
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.env.dispose();
    this.hud.endMatchCleanup();
  }

  // ---------------- actors ----------------
  createActor({ name, team, isPlayer = false, loadout, bot = false, difficulty }) {
    const a = new Actor({ name, team, isPlayer });
    a.loadout = loadout;
    a.setLoadout(loadout);
    a.events = [];
    this.setSoldierModel(a);
    if (bot) a.bot = new BotBrain(a, this, difficulty || this.cfg.difficulty);
    if (isPlayer) this.player = a;
    this.actors.push(a);
    return a;
  }

  setSoldierModel(a) {
    if (a.model) { this.scene.remove(a.model.root); a.model.dispose?.(); }
    const team = a.team === 'red' ? 'red' : a.team === 'blue' || a.team === 'human' ? 'blue' : a.id % 2 ? 'red' : 'blue';
    a.model = createSoldier({ team, variant: a.id % 4 });
    a.hitboxes = a.model.getHitboxes();
    a.model.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    a.model.root.visible = false;
    this.scene.add(a.model.root);
    a.heldKey = null;
    this.updateHeldWeapon(a);
  }

  setZombieModel(a, kind) {
    if (a.model) { this.scene.remove(a.model.root); a.model.dispose?.(); }
    a.model = createZombie({ kind, seed: a.id });
    a.hitboxes = a.model.getHitboxes();
    a.model.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(a.model.root);
    a.heldKey = null;
  }

  updateHeldWeapon(a) {
    if (a.zombie || !a.model) return;
    const w = a.weapon;
    const key = w ? w.id : 'none';
    if (a.heldKey === key) return;
    a.heldKey = key;
    if (a.heldGun) a.heldGun.removeFromParent();
    if (!w) { a.model.holdWeapon(null, 'none'); return; }
    const id = w.def.base || w.id;
    const g = buildGun(id, { variant: w.def.variant || 'default' });
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    a.heldGun = g;
    const hold = w.def.cat === 'pistol' ? 'pistol' : w.def.cat === 'melee' ? 'melee' : w.def.cat === 'grenade' ? 'grenade' : 'rifle';
    a.model.holdWeapon(g, hold);
  }

  spawnActor(a, sp) {
    a.pos.set(sp[0], sp[1] + 0.02, sp[2]);
    a.vel.set(0, 0, 0);
    a.yaw = sp[3] ?? 0; a.pitch = 0;
    a.alive = true;
    a.hp = a.maxHp; a.armor = a.zombie ? 0 : 100;
    a.recoil = 0; a.recoilYaw = 0; a.flashT = 0; a.spreadAdd = 0;
    a.protectT = this.mode.spawnProtect ?? 3;
    a.damageBy.clear();
    a.onGround = true;
    if (!a.zombie) {
      a.setLoadout(a.loadout);
      if (this.cfg.mode === 'zombie' || this.cfg.mode === 'challenge') for (const k of ['primary', 'secondary']) if (a.slots[k]) a.slots[k].reserve = 999;
    }
    if (a.model) { a.model.reset(); a.model.root.visible = !a.isPlayer; }
    a.heldKey = null;
    this.updateHeldWeapon(a);
    if (a.bot) { a.bot.path = null; a.bot.target = null; a.bot.aimYaw = a.yaw; a.bot.aimPitch = 0; a.bot.campSpot = null; a.bot.roamGoal = null; }
    if (a.isPlayer) { this.view.setStyle(a.zombie ? 'zombie' : a.hero ? 'hero' : (a.team === 'red' ? 'red' : 'blue')); this.view.equip(a); this.deathCam = null; }
  }

  // turn an actor into a zombie (zombie / challenge modes)
  makeZombie(a, kind = 'normal', hpOverride = null) {
    a.zombie = kind;
    a.zombieDef = ZOMBIES[kind];
    a.maxHp = hpOverride ?? a.zombieDef.hp;
    a.hp = a.maxHp; a.armor = 0;
    a.slots = { primary: null, secondary: null, melee: { def: weaponDef('knife'), id: 'claw', ammo: 0, reserve: 0 }, grenade: null };
    a.cur = 'melee';
    a.scope = 0; a.reloadT = 0; a.switchT = 0.3;
    this.setZombieModel(a, kind);
    a.radius = Math.min(0.6, a.zombieDef.radius);
    a.model.root.visible = !a.isPlayer;
    if (a.isPlayer) { this.view.setStyle('zombie'); this.view.equip(a); }
  }

  makeHuman(a, team) {
    a.zombie = null; a.zombieDef = null; a.hero = false;
    a.team = team; a.maxHp = 100; a.radius = RADIUS;
    this.setSoldierModel(a);
  }

  // ---------------- rules ----------------
  isEnemy(a, b) { return this.mode.isEnemy ? this.mode.isEnemy(a, b) : a.team !== b.team; }
  canDamage(a, b) { return !a || this.isEnemy(a, b); }
  infiniteReserve(a) { return this.cfg.mode === 'zombie' || this.cfg.mode === 'challenge' ? !a.zombie : false; }

  applyDamage(target, dmg, attacker, info = {}) {
    if (!target.alive || (target.protectT > 0 && attacker && attacker !== target)) return;
    if (this.mode.onDamage) {
      const r = this.mode.onDamage(target, dmg, attacker, info);
      if (r === false) return;
      if (typeof r === 'number') dmg = r;
    }
    const dealt = target.takeDamage(dmg, attacker, info);
    if (dealt <= 0 && target.protectT > 0) return;
    // knockback (zombies are pushed by bullets)
    if (target.zombie && info.dir && info.knock) {
      const mass = target.zombie === 'boss' ? 8 : target.zombie === 'heavy' ? 2.2 : 1;
      const k = info.knock * 0.15 / mass * (target.onGround ? 1 : 1.6);
      target.knock.x += info.dir.x * k; target.knock.z += info.dir.z * k;
      if (info.explosion) target.knock.y += info.knock * 0.12 / mass;
    } else if (info.explosion && info.dir) {
      target.knock.x += info.dir.x * info.knock * 0.08; target.knock.z += info.dir.z * info.knock * 0.08;
    }
    target.model?.flinch?.(info.dir || _v.set(0, 0, 1));
    if (attacker?.isPlayer && attacker !== target) {
      this.hud.hitMarker(info.headshot, target.hp <= 0);
      Audio.play(info.headshot ? 'headshot' : 'hitmarker', { volume: info.headshot ? 0.55 : 0.4 });
      if (target.zombie) this.hud.showTargetHp(target);
    }
    if (target.isPlayer) {
      if (attacker && attacker !== target) this.hud.damageFrom(attacker.pos, this.player);
      this.hud.hurtFlash(dealt);
      this.shakeAmt = Math.max(this.shakeAmt, Math.min(0.6, dealt / 60));
      Audio.play('hurt', { volume: 0.5 });
    } else if (dealt > 0 && Math.random() < 0.35) {
      Audio.play(target.zombie ? 'growl' : 'hurt', { variants: target.zombie ? 4 : undefined, pos: target.eye, volume: 0.6 });
    }
    if (target.hp <= 0) this.kill(target, attacker, info);
  }

  kill(victim, killer, info = {}) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.deaths++;
    victim.streak = 0;
    victim.scope = 0;
    victim.respawnT = this.mode.respawnDelay?.(victim) ?? 5;
    if (victim.model) {
      victim.model.root.visible = true;
      victim.model.die(info.dir || _v.set(0, 0, 1), !!info.headshot);
    }
    if (victim.zombie) Audio.play('zdie', { pos: victim.eye, volume: 0.9 });
    if (killer && killer !== victim) {
      killer.kills++;
      if (info.headshot) killer.headshots++;
      killer.score += victim.zombie ? 2 : 1;
      killer.streak++;
      if (this.time - killer.lastKillT < 4.5) killer.multi++; else killer.multi = 1;
      killer.lastKillT = this.time;
      // assists
      for (const [att, d] of victim.damageBy) if (att !== killer && d >= 40) att.assists++;
      if (killer.isPlayer) this.hud.killBanner(killer.multi, info.headshot, info.melee, info.weapon === 'he', victim);
    }
    this.hud.killfeed(killer, victim, info);
    if (victim.isPlayer) {
      this.deathCam = { t: 0, killer: killer && killer !== victim ? killer : null, from: this.camera.position.clone() };
      this.hud.showDeath(killer, info, victim.respawnT);
      Audio.play('heartbeat', { volume: 0.5 });
    }
    // drop held gun visual (kept on the ragdoll)
    this.mode.onKill?.(victim, killer, info);
  }

  // ---------------- paths (budgeted) ----------------
  requestPath(brain) {
    if (!this.pathQueue.includes(brain)) this.pathQueue.push(brain);
    return true;
  }

  pickRoamPoint(brain) {
    const hs = this.meta.hotspots;
    if (hs && hs.length && Math.random() < 0.6) {
      const h = hs[Math.floor(Math.random() * hs.length)];
      return new THREE.Vector3(h[0], h[1], h[2]);
    }
    const p = this.nav.randomPoint();
    return new THREE.Vector3(p.x, p.y, p.z);
  }

  // ---------------- misc hooks ----------------
  muzzlePos(a) {
    if (a.isPlayer && this.view.cur) return this.view.muzzleWorld(this.camera, new THREE.Vector3());
    const m = a.heldGun?.userData.anchors?.muzzle;
    if (m) return m.getWorldPosition(new THREE.Vector3());
    return a.eye.clone();
  }

  ejectCasing(a, kind) {
    const isP = a.isPlayer;
    if (!isP && a.pos.distanceTo(this.camera.position) > 25) return;
    const pos = isP ? this.view.ejectWorld(this.camera, new THREE.Vector3()) : (a.heldGun?.userData.anchors?.eject?.getWorldPosition(new THREE.Vector3()) || a.eye.clone());
    const right = _v2.set(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
    const vel = right.clone().multiplyScalar(2 + Math.random()).add(new THREE.Vector3(0, 2 + Math.random(), 0)).add(_fwd.set(-Math.sin(a.yaw), 0, -Math.cos(a.yaw)).multiplyScalar(-0.5));
    this.fx.casing(this._shellFactory || (this._shellFactory = (k) => { const m = buildShell(k); m.castShadow = false; return m; }), pos, vel, kind);
  }

  makeGrenadeMesh(type) {
    const g = buildGun(type);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  addProjectile(p) { this.projectiles.push(p); }

  onShot(a, res) {
    // gunshots alert bots nearby; suppressed weapons are quiet
    const quiet = a.weapon.def.sound === 'm4s';
    for (const b of this.actors) if (b.bot && b.alive && b !== a && this.isEnemy(b, a)) {
      const d = b.pos.distanceTo(a.pos);
      if (d < (quiet ? 14 : 45)) b.bot.hear(a.pos);
    }
    a.revealT = 1.2; // minimap reveal
  }

  shake(pos, amount) {
    const d = pos.distanceTo(this.camera.position);
    if (d < 25) this.shakeAmt = Math.max(this.shakeAmt, amount * (1 - d / 25));
  }

  zombieSkill(a) {
    if ((a.skillCd || 0) > 0) return;
    a.sprintT = 4; a.skillCd = 15;
    Audio.play('scream', { pos: a.isPlayer ? null : a.eye, volume: 0.8 });
    if (a.isPlayer) this.hud.toast('疾跑技能发动！');
  }

  respawnPoint(team) {
    const list = this.meta.spawns[team] || this.meta.spawns.ffa || this.meta.spawns.red;
    // pick the spawn farthest from enemies among a few random candidates
    let best = list[0], bestScore = -Infinity;
    for (let i = 0; i < 5; i++) {
      const sp = list[Math.floor(Math.random() * list.length)];
      let minD = 1e9;
      for (const a of this.actors) if (a.alive && a.team !== team) minD = Math.min(minD, Math.hypot(a.pos.x - sp[0], a.pos.z - sp[2]));
      const occupied = this.actors.some((a) => a.alive && Math.hypot(a.pos.x - sp[0], a.pos.z - sp[2]) < 0.9);
      const score = Math.min(minD, 40) - (occupied ? 100 : 0) + Math.random() * 3;
      if (score > bestScore) { bestScore = score; best = sp; }
    }
    return best;
  }

  // ---------------- frame ----------------
  frame() {
    if (!this.running) return;
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    this.lastDt = this.paused ? 0 : dt;
    if (!this.paused) this.update(dt);
    this.render();
    this.input.endFrame();
  }

  update(dt) {
    this.time += dt;
    const inp = this.input, p = this.player;

    // ---- player control ----
    if (!this.ended) this.updatePlayer(dt);

    // ---- bots ----
    // path budget
    let budget = 4;
    while (budget-- > 0 && this.pathQueue.length) { const b = this.pathQueue.shift(); if (b.a.alive) b.computePath(); }
    for (const a of this.actors) {
      if (a.isPlayer) continue;
      if (!a.alive) continue;
      if (this.mode.frozen?.(a)) { a.move(dt, _v.set(0, 0, 0), false, this.world); continue; }
      const r = a.bot ? a.bot.update(dt) : null;
      a.move(dt, r ? r.wish : _v.set(0, 0, 0), r ? r.jump : false, this.world);
      updateWeapon(this, a, dt, a.bot.input);
    }

    // ---- timers, separation, kill plane ----
    for (const a of this.actors) {
      if (!a.alive) continue;
      a.protectT = Math.max(0, a.protectT - dt);
      a.flashT = Math.max(0, a.flashT - dt);
      if (a.sprintT > 0) a.sprintT -= dt;
      if (a.skillCd > 0) a.skillCd -= dt;
      if (a.revealT > 0) a.revealT -= dt;
      if (a.pos.y < this.killY) this.kill(a, a.lastAttacker && this.time - a.lastHurtT < 5 ? a.lastAttacker : null, { weapon: 'fall' });
    }
    this.separate();

    // ---- projectiles ----
    for (const pr of this.projectiles) pr.update(dt);
    this.projectiles = this.projectiles.filter((x) => !x.dead);

    // ---- mode ----
    this.mode.update(dt);

    // ---- animate models ----
    for (const a of this.actors) this.animateActor(a, dt);

    this.mb.animated.forEach((x) => x.update(dt, this.time));
    this.fx.update(dt, this.camera, this.world);
  }

  updatePlayer(dt) {
    const inp = this.input, p = this.player, s = this.settings;
    if (inp.hit('Tab') || inp.down('Tab')) this.hud.showScores(true); else this.hud.showScores(false);
    if (inp.hit('Escape')) { this.setPaused(true); return; }
    if (inp.hit('KeyB') && this.mode.canBuy?.(p)) this.hud.openLoadout(this);
    if (!p.alive) {
      // spectate / death cam
      if (this.deathCam) this.deathCam.t += dt;
      return;
    }
    if (this.mode.frozen?.(p)) { p.move(dt, _v.set(0, 0, 0), false, this.world); return; }
    // look
    const zoom = p.scope && p.weapon?.def.zoom ? p.weapon.def.zoom[p.scope - 1] : 1;
    const sens = s.sensitivity * 0.0022 / (zoom > 1 ? zoom * 0.8 : 1);
    p.yaw -= inp.mouse.dx * sens;
    p.pitch = THREE.MathUtils.clamp(p.pitch - inp.mouse.dy * sens * (s.invertY ? -1 : 1), -1.45, 1.45);
    // move
    let fx = 0, fz = 0;
    if (inp.down('KeyW')) fz -= 1;
    if (inp.down('KeyS')) fz += 1;
    if (inp.down('KeyA')) fx -= 1;
    if (inp.down('KeyD')) fx += 1;
    const c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
    _v.set(fx * c + fz * sn, 0, -fx * sn + fz * c);
    if (_v.lengthSq() > 0) _v.normalize();
    p.wantCrouch = inp.down('ControlLeft') || inp.down('KeyC');
    p.walking = inp.down('ShiftLeft');
    p.move(dt, _v, inp.down('Space'), this.world);
    if (p.jumped) { p.jumped = false; }
    // weapon input
    if (!p.zombie) {
      if (inp.hit('Digit1')) switchWeapon(p, 'primary');
      if (inp.hit('Digit2')) switchWeapon(p, 'secondary');
      if (inp.hit('Digit3')) switchWeapon(p, 'melee');
      if (inp.hit('Digit4')) switchWeapon(p, 'grenade');
      if (inp.hit('KeyQ')) switchWeapon(p, p.lastSlot);
      if (inp.mouse.wheel) {
        const order = ['primary', 'secondary', 'melee', 'grenade'].filter((k) => p.slots[k] && (k !== 'grenade' || p.slots[k].count > 0));
        const i = order.indexOf(p.cur);
        switchWeapon(p, order[(i + (inp.mouse.wheel > 0 ? 1 : -1) + order.length) % order.length]);
      }
    } else if (inp.hit('KeyF') || inp.hit('KeyG')) this.zombieSkill(p);
    const winput = this._pin || (this._pin = {});
    winput.fire = inp.mouse.left; winput.fire2 = inp.mouse.right;
    winput.firePressed = inp.mouse.leftPressed; winput.fire2Pressed = inp.mouse.rightPressed;
    winput.reload = inp.hit('KeyR');
    if (p.flashT > 2.5) { /* blinded: still can shoot */ }
    const before = p.cur;
    updateWeapon(this, p, dt, winput);
    if (p.cur !== before) this.view.equip(p);
    this.mode.playerUse?.(p, inp.down('KeyE'), dt);
    // footsteps
    if (p.onGround && p.moveSpeed > 2.2 && !p.walking && p.crouch < 0.5) {
      if (p.stepDist - (p.lastStep || 0) > 2.1) { p.lastStep = p.stepDist; Audio.step(p.groundMat, null, true, 0.4); }
    }
  }

  animateActor(a, dt) {
    const m = a.model;
    if (!m) return;
    // bots' footsteps
    if (!a.isPlayer && a.alive && a.onGround && a.moveSpeed > 2.5 && !a.walking && a.crouch < 0.5) {
      if (a.stepDist - (a.lastStep || 0) > 2.1) { a.lastStep = a.stepDist; if (a.pos.distanceTo(this.camera.position) < 35) Audio.step(a.zombie ? 'concrete' : a.groundMat, a.pos, false, a.zombie ? 0.5 : 0.4); }
    }
    let firing = false, reloading = a.reloadT > 0;
    if (a.events.length) {
      for (const e of a.events) {
        if (e === 'fire') firing = true;
        if (a.isPlayer) { if (e === 'draw') this.view.equip(a); this.view.onEvent(e, a); }
        if (e === 'draw' && !a.isPlayer) this.updateHeldWeapon(a);
        if ((e === 'melee' || e === 'meleeHeavy') && m.attack && !a.zombie) m.attack();
      }
      a.events.length = 0;
    }
    a.firedThisFrame = false;
    if (!a.isPlayer && a.heldKey !== (a.weapon ? a.weapon.id : 'none')) this.updateHeldWeapon(a);
    m.root.position.copy(a.pos);
    if (a.alive) m.root.rotation.y = a.yaw;
    // skip animation work for far invisible actors
    const far = a.pos.distanceToSquared(this.camera.position) > 90 * 90;
    if (!far || !a.alive) {
      const st = this._st || (this._st = {});
      st.speed = a.moveSpeed; st.moveX = a.localMove.x; st.moveZ = a.localMove.z;
      st.crouch = a.crouch > 0.5; st.airborne = !a.onGround; st.pitch = a.pitch + THREE.MathUtils.degToRad(a.recoil * 0.5);
      st.firing = firing; st.reloading = reloading; st.alive = a.alive;
      m.update(dt, st);
      m.root.updateMatrixWorld(true);
    }
    // spawn protection shimmer
    if (m.setHighlight) {
      const want = a.protectT > 0 ? 0x66ccff : a.hero ? 0xffcc33 : null;
      if (want !== a._hl) { m.setHighlight(want); a._hl = want; }
    }
  }

  separate() {
    const A = this.actors;
    for (let i = 0; i < A.length; i++) {
      const a = A[i]; if (!a.alive) continue;
      for (let j = i + 1; j < A.length; j++) {
        const b = A[j]; if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const r = a.radius + b.radius;
        if (Math.abs(b.pos.y - a.pos.y) > 1.6) continue;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r || d2 < 1e-8) continue;
        const d = Math.sqrt(d2), push = (r - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        a.pos.x -= nx * push; a.pos.z -= nz * push;
        b.pos.x += nx * push; b.pos.z += nz * push;
      }
    }
  }

  render() {
    const p = this.player, cam = this.camera;
    if (p) {
      if (p.alive || !this.deathCam) {
        cam.position.set(p.pos.x, p.pos.y + p.eyeHeight, p.pos.z);
        cam.rotation.set(p.pitch + THREE.MathUtils.degToRad(p.recoil * 0.35), p.yaw + THREE.MathUtils.degToRad(p.recoilYaw * 0.35), 0);
      } else {
        // death camera: drop to the floor, then look at the killer
        const dc = this.deathCam, t = Math.min(1, dc.t / 0.8);
        const ground = p.pos.y + 0.35;
        cam.position.set(p.pos.x, THREE.MathUtils.lerp(p.pos.y + p.eyeHeight, ground, t * t), p.pos.z);
        if (dc.killer && dc.t > 0.8) {
          _v.copy(dc.killer.pos); _v.y += 1.4;
          const m = new THREE.Matrix4().lookAt(cam.position, _v, UP);
          const q = new THREE.Quaternion().setFromRotationMatrix(m);
          cam.quaternion.slerp(q, 0.08);
        } else cam.rotation.z = t * 0.5;
      }
      // shake
      if (this.shakeAmt > 0.001) {
        cam.position.x += (Math.random() - 0.5) * this.shakeAmt * 0.08;
        cam.position.y += (Math.random() - 0.5) * this.shakeAmt * 0.08;
        this.shakeAmt *= 0.9;
      }
      // FOV / zoom
      const zoom = p.alive && p.scope && p.weapon?.def.zoom ? p.weapon.def.zoom[p.scope - 1] : 1;
      const fov = this.settings.fov / zoom;
      if (Math.abs(cam.fov - fov) > 0.01) {
        cam.fov = fov; cam.updateProjectionMatrix();
        this.fx.add.mat.uniforms.scale.value = this.fx.alpha.mat.uniforms.scale.value = innerHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
      }
      _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
      _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
      Audio.setListener(cam.position, _fwd, _up);
      this.view.update(this.lastDt || 0, p, this.input.mouse.dx, this.input.mouse.dy, cam);
      this.hud.update(this);
    }
    const r = this.renderer;
    r.autoClear = true;
    r.render(this.scene, cam);
    if (p && p.alive && this.view.root.visible) {
      r.autoClear = false;
      r.clearDepth();
      r.render(this.view.scene, this.view.camera);
      r.autoClear = true;
    }
  }

  endMatch(result) {
    if (this.ended) return;
    this.ended = true;
    this.input.unlock();
    setTimeout(() => this.hud.showResults(this, result), 1800);
  }
}
