// First-person weapon view: separate scene rendered on top of the world with procedural animations.
import * as THREE from 'three';
import { buildGun } from '../models/guns.js';
import { ViewArms, buildZombieClaws } from '../models/viewarms.js';

// grip position in camera space per weapon category
const HOLD = {
  rifle: { pos: [0.13, -0.185, -0.31], rot: [0.02, 0.075, 0.14] },
  smg: { pos: [0.125, -0.175, -0.3], rot: [0.02, 0.08, 0.14] },
  sniper: { pos: [0.13, -0.19, -0.3], rot: [0.02, 0.07, 0.12] },
  shotgun: { pos: [0.13, -0.185, -0.31], rot: [0.02, 0.075, 0.14] },
  mg: { pos: [0.14, -0.2, -0.33], rot: [0.02, 0.07, 0.12] },
  pistol: { pos: [0.085, -0.118, -0.33], rot: [0.03, 0.05, 0.05] },
  melee: { pos: [0.13, -0.12, -0.28], rot: [0.4, 0.3, 0.3] },
  grenade: { pos: [0.13, -0.13, -0.3], rot: [0.2, 0.2, 0] },
};

const _v = new THREE.Vector3();

export class ViewModel {
  constructor(renderer, mainScene) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 10);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.scene.add(this.camera);
    this.hemi = new THREE.HemisphereLight(0xdde6ff, 0x5a4a3a, 1.2);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.position.set(0.6, 1, 0.4);
    this.scene.add(this.hemi, this.sun);
    this.flash = new THREE.PointLight(0xffb060, 0, 2, 2);
    this.scene.add(this.flash);
    this.mainScene = mainScene;
    this.cache = new Map();
    this.cur = null;
    this.arms = null;
    this.style = 'red';
    this.t = 0;
    this.kick = 0; this.kickRot = 0; this.kickSide = 0;
    this.sway = new THREE.Vector2(); this.swayTarget = new THREE.Vector2();
    this.anim = null; // {type, t, dur}
    this.drawT = 0;
    this.landDip = 0;
    this.zclaws = null; this.clawSwing = 0; this.clawSide = 1;
    this.slideT = 0;
    this.visible = true;
  }

  syncLighting(env) {
    this.scene.environment = this.mainScene.environment;
    this.scene.environmentIntensity = (this.mainScene.environmentIntensity ?? 1) * 1.3;
    if (env) {
      this.hemi.color.copy(env.hemi.color); this.hemi.groundColor.copy(env.hemi.groundColor);
      this.hemi.intensity = env.hemi.intensity * 1.1 + 0.3;
      this.sun.color.copy(env.sun.color);
      this.sun.intensity = Math.max(0.8, env.sun.intensity * 0.7);
    }
  }

  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }

  setStyle(style) {
    if (this.style === style && this.arms) return;
    this.style = style;
    if (this.arms) { this.root.remove(this.arms.object3d); }
    this.arms = new ViewArms({ style });
    this.root.add(this.arms.object3d);
    this.cur = null;
  }

  getGun(id, variant) {
    const key = id + ':' + variant;
    if (!this.cache.has(key)) {
      const g = buildGun(id, { variant });
      g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
      // remember rest transforms of moving parts
      const parts = g.userData.parts || {};
      for (const k in parts) if (parts[k]) parts[k].userData.rest = { p: parts[k].position.clone(), r: parts[k].rotation.clone() };
      this.cache.set(key, g);
    }
    return this.cache.get(key);
  }

  // show weapon of actor (call when slot changes)
  equip(actor) {
    if (actor.zombie) {
      if (this.cur) { this.cur.gun.removeFromParent(); this.cur = null; }
      if (this.arms) this.arms.object3d.visible = false;
      if (!this.zclaws || this.zclaws.kind !== actor.zombie) {
        if (this.zclaws) { this.root.remove(this.zclaws.left); this.root.remove(this.zclaws.right); }
        const c = buildZombieClaws(actor.zombie);
        c.kind = actor.zombie;
        c.left.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
        c.right.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
        this.root.add(c.left, c.right);
        this.zclaws = c;
      }
      this.zclaws.left.visible = this.zclaws.right.visible = true;
      return;
    }
    if (this.zclaws) this.zclaws.left.visible = this.zclaws.right.visible = false;
    if (this.arms) this.arms.object3d.visible = true;
    const w = actor.weapon;
    if (!w) return;
    const id = w.def.base || w.id, variant = w.def.variant || 'default';
    if (this.cur && this.cur.key === id + variant) return;
    if (this.cur) this.cur.gun.removeFromParent();
    const gun = this.getGun(id, variant);
    const kind = gun.userData.kind || w.def.cat;
    this.cur = { key: id + variant, gun, kind, def: w.def, hold: HOLD[w.def.cat] || HOLD.rifle };
    this.arms.attach(gun);
    if (!gun.parent) this.root.add(gun);
    this.arms.setGrip(w.def.cat === 'melee' ? 'knife' : w.def.cat === 'grenade' ? 'grenade' : w.def.cat === 'pistol' ? 'pistol' : 'rifle');
    this.drawT = 1;
    this.anim = null;
    this.resetParts();
  }

  resetParts() {
    const parts = this.cur?.gun.userData.parts || {};
    for (const k in parts) { const p = parts[k]; if (p?.userData.rest) { p.position.copy(p.userData.rest.p); p.rotation.copy(p.userData.rest.r); p.visible = true; } }
    this.arms?.setLeftTarget?.(null);
  }

  onEvent(ev, actor) {
    const d = actor.weapon?.def;
    switch (ev) {
      case 'fire': {
        const big = d.cat === 'sniper' ? 2.4 : d.cat === 'shotgun' ? 2 : d.cat === 'pistol' ? (d.id === 'deagle' || d.base === 'deagle' ? 1.8 : 1.1) : d.cat === 'mg' ? 1.1 : 1;
        this.kick += 0.018 * big; this.kickRot += 0.035 * big; this.kickSide += (Math.random() - 0.5) * 0.01 * big;
        this.flash.intensity = d.sound === 'm4s' ? 0.6 : 3;
        this.slideT = 0.08;
        break;
      }
      case 'reload': this.anim = { type: d.shellReload ? 'shellStart' : 'reload', t: 0, dur: d.shellReload ? 0.25 : d.reload }; break;
      case 'shell': this.anim = { type: 'shell', t: 0, dur: d.reload }; break;
      case 'reloadEnd': if (this.anim && (this.anim.type === 'shell' || this.anim.type === 'shellStart')) this.anim = { type: 'pumpBack', t: 0, dur: 0.35 }; break;
      case 'bolt': this.anim = { type: 'bolt', t: 0, dur: 1.2 }; break;
      case 'pump': this.anim = { type: 'pump', t: 0, dur: 0.55 }; break;
      case 'draw': this.drawT = 1; this.anim = null; this.resetParts(); break;
      case 'melee': this.anim = { type: actor.zombie ? 'claw' : 'slash', t: 0, dur: actor.zombie ? 0.45 : 0.42, side: (this.clawSide = -this.clawSide) }; break;
      case 'meleeHeavy': this.anim = { type: actor.zombie ? 'clawHeavy' : 'stab', t: 0, dur: actor.zombie ? 0.6 : 0.9 }; break;
      case 'pin': this.anim = { type: 'pin', t: 0, dur: 0.35, hold: true }; break;
      case 'throw': this.anim = { type: 'throw', t: 0, dur: 0.45 }; break;
    }
  }

  update(dt, actor, mouseDX, mouseDY, camera) {
    this.t += dt;
    const zoomed = actor.scope > 0;
    this.root.visible = this.visible && actor.alive && !zoomed;
    this.camera.fov = 58;
    this.camera.updateProjectionMatrix();
    if (!actor.alive) return;
    // sway from mouse movement
    this.swayTarget.set(THREE.MathUtils.clamp(-mouseDX * 0.0009, -0.05, 0.05), THREE.MathUtils.clamp(mouseDY * 0.0009, -0.05, 0.05));
    this.sway.lerp(this.swayTarget, Math.min(1, dt * 10));
    // bob
    const sp = Math.min(1, actor.moveSpeed / 5) * (actor.onGround ? 1 : 0.2);
    const ph = actor.stepDist * 1.9;
    const bobX = Math.sin(ph) * 0.011 * sp, bobY = -Math.abs(Math.cos(ph)) * 0.009 * sp;
    const breathe = Math.sin(this.t * 1.6) * 0.0018;
    if (actor.landed) { this.landDip = actor.landed * 0.05; actor.landed = 0; }
    this.landDip *= Math.max(0, 1 - dt * 8);
    // recoil spring
    this.kick *= Math.max(0, 1 - dt * 14); this.kickRot *= Math.max(0, 1 - dt * 11); this.kickSide *= Math.max(0, 1 - dt * 10);
    this.flash.intensity *= Math.max(0, 1 - dt * 40);
    this.drawT = Math.max(0, this.drawT - dt * 2.4);

    if (actor.zombie && this.zclaws) return this.updateClaws(dt, actor, bobX, bobY + breathe);
    if (!this.cur) return;
    const g = this.cur.gun, hold = this.cur.hold, parts = g.userData.parts || {};
    const sprintTilt = actor.walking ? 0 : sp * 0.04;
    const crouchOff = actor.crouch * 0.01;
    g.position.set(hold.pos[0] + bobX + this.sway.x * 0.6 + this.kickSide, hold.pos[1] + bobY + breathe - this.landDip + this.sway.y * 0.6 - crouchOff - this.drawT * 0.25, hold.pos[2] + this.kick);
    g.rotation.set(hold.rot[0] + this.kickRot + this.sway.y * 1.2 - this.drawT * 0.9, hold.rot[1] + this.sway.x * 1.4, hold.rot[2] - this.sway.x * 1.2 - sprintTilt * 0);
    this.flash.position.copy(g.position).add(_v.set(0, 0.05, -0.5));

    // pistol slide blowback
    if (parts.slide?.userData.rest) {
      this.slideT = Math.max(0, this.slideT - dt);
      const empty = actor.weapon.ammo === 0 && !this.anim;
      parts.slide.position.z = parts.slide.userData.rest.p.z + (empty ? 0.03 : this.slideT > 0 ? 0.035 * (this.slideT / 0.08) : 0);
    }
    if (parts.bolt?.userData.rest && this.cur.def.auto && !this.anim) {
      parts.bolt.position.z = parts.bolt.userData.rest.p.z + (this.slideT > 0 ? 0.04 * (this.slideT / 0.08) : 0);
    }

    if (this.anim) this.animate(dt, g, parts, actor);
    this.arms.update();
  }

  animate(dt, g, parts, actor) {
    const a = this.anim;
    a.t += dt;
    const u = Math.min(1, a.t / a.dur);
    const ease = (x) => x * x * (3 - 2 * x);
    const bump = (x, a0, a1) => (x < a0 || x > a1 ? 0 : Math.sin(((x - a0) / (a1 - a0)) * Math.PI));
    const rest = (p) => p?.userData.rest;
    switch (a.type) {
      case 'reload': {
        // tilt the gun, drop mag, insert, slap charging handle
        const tilt = bump(u, 0, 1);
        g.rotation.z += tilt * 0.5; g.rotation.x += tilt * 0.25; g.position.y -= tilt * 0.04; g.position.x -= tilt * 0.02;
        const mag = parts.mag;
        if (mag && rest(mag)) {
          let off = 0;
          if (u > 0.15 && u < 0.4) off = ease((u - 0.15) / 0.25);
          else if (u >= 0.4 && u < 0.55) off = 1;
          else if (u >= 0.55 && u < 0.75) off = 1 - ease((u - 0.55) / 0.2);
          mag.position.y = rest(mag).p.y - off * 0.3;
          mag.position.z = rest(mag).p.z + off * 0.05;
          mag.rotation.x = rest(mag).r.x + off * 0.4;
          mag.visible = !(u > 0.38 && u < 0.5);
          this.arms.setLeftTarget?.(u > 0.1 && u < 0.8 ? mag : null);
        }
        const ch = parts.charging || parts.bolt;
        if (ch && rest(ch) && u > 0.8) ch.position.z = rest(ch).p.z + bump(u, 0.8, 0.97) * 0.06;
        if (u >= 1) { this.anim = null; this.resetParts(); }
        break;
      }
      case 'shellStart': g.rotation.z += ease(u) * 0.3; g.rotation.x += ease(u) * 0.1; if (u >= 1) this.anim = { type: 'shellHold', t: 0, dur: 99 }; break;
      case 'shellHold': g.rotation.z += 0.3; g.rotation.x += 0.1; break;
      case 'shell': g.rotation.z += 0.3; g.rotation.x += 0.1 + bump(u, 0.3, 0.8) * 0.05; g.position.y -= bump(u, 0.3, 0.8) * 0.01; if (u >= 1) this.anim = { type: 'shellHold', t: 0, dur: 99 }; break;
      case 'pumpBack': {
        const k = 1 - ease(u);
        g.rotation.z += 0.3 * k; g.rotation.x += 0.1 * k;
        if (parts.pump && rest(parts.pump)) parts.pump.position.z = rest(parts.pump).p.z + bump(u, 0.2, 1) * 0.08;
        if (u >= 1) { this.anim = null; this.resetParts(); }
        break;
      }
      case 'pump': {
        if (parts.pump && rest(parts.pump)) parts.pump.position.z = rest(parts.pump).p.z + bump(u, 0.25, 0.9) * 0.09;
        g.rotation.z += bump(u, 0.2, 0.95) * 0.08;
        if (u >= 1) { this.anim = null; this.resetParts(); }
        break;
      }
      case 'bolt': {
        // lower gun, rotate bolt up, pull back, push, rotate down
        g.rotation.z += bump(u, 0.15, 0.95) * 0.25; g.position.y -= bump(u, 0.15, 0.95) * 0.02;
        const b = parts.bolt;
        if (b && rest(b)) {
          const lift = u < 0.3 ? ease((u - 0.2) / 0.1) : u < 0.75 ? 1 : 1 - ease((u - 0.75) / 0.1);
          b.rotation.z = rest(b).r.z + Math.max(0, Math.min(1, lift)) * 1.1;
          b.position.z = rest(b).p.z + bump(u, 0.3, 0.75) * 0.09;
          this.arms.setLeftTarget?.(u > 0.15 && u < 0.9 ? b : null);
        }
        if (u >= 1) { this.anim = null; this.resetParts(); }
        break;
      }
      case 'slash': {
        const s = a.side;
        const k = bump(u, 0, 1);
        g.rotation.y += s * (u < 0.5 ? -0.6 + u * 3 : 0.9 - (u - 0.5) * 1.8) * 0.8;
        g.rotation.z += s * k * 0.9; g.rotation.x -= k * 0.4;
        g.position.x -= s * (u - 0.5) * 0.25 * k; g.position.z -= k * 0.08;
        if (u >= 1) this.anim = null;
        break;
      }
      case 'stab': {
        const back = bump(u, 0, 0.35), fwd = bump(u, 0.3, 0.7);
        g.position.z += back * 0.08 - fwd * 0.22; g.position.y += back * 0.03; g.rotation.x += back * 0.3 - fwd * 0.6;
        if (u >= 1) this.anim = null;
        break;
      }
      case 'pin': g.position.y -= ease(u) * 0.03; g.position.z += ease(u) * 0.05; if (u >= 1) a.t = a.dur; break;
      case 'throw': {
        const k = bump(u, 0, 1);
        g.position.z -= k * 0.25; g.position.y += k * 0.1; g.rotation.x -= k * 1.2;
        g.visible = u < 0.35;
        if (u >= 1) { this.anim = null; g.visible = true; }
        break;
      }
    }
  }

  updateClaws(dt, actor, bobX, bobY) {
    const L = this.zclaws.left, R = this.zclaws.right;
    const idle = Math.sin(this.t * 2.2) * 0.01;
    L.position.set(-0.2 + bobX + this.sway.x, -0.24 + bobY + idle + this.sway.y, -0.35);
    R.position.set(0.2 + bobX + this.sway.x, -0.24 + bobY - idle + this.sway.y, -0.35);
    L.rotation.set(0.2, 0.25, 0.3); R.rotation.set(0.2, -0.25, -0.3);
    const a = this.anim;
    if (a && (a.type === 'claw' || a.type === 'clawHeavy')) {
      a.t += dt;
      const u = Math.min(1, a.t / a.dur), k = Math.sin(u * Math.PI);
      const arms = a.type === 'clawHeavy' ? [L, R] : [a.side > 0 ? R : L];
      for (const arm of arms) {
        const s = arm === R ? 1 : -1;
        arm.position.x -= s * k * 0.2; arm.position.y += k * 0.12; arm.position.z -= k * 0.15;
        arm.rotation.z += -s * k * 1.0; arm.rotation.x -= k * 0.6;
      }
      if (u >= 1) this.anim = null;
    }
  }

  // world position of the muzzle (for tracers) given main camera
  muzzleWorld(mainCamera, out) {
    if (!this.cur?.gun.userData.anchors?.muzzle) return out.copy(mainCamera.position);
    this.root.updateMatrixWorld(true);
    this.cur.gun.userData.anchors.muzzle.getWorldPosition(out);
    // view scene camera sits at origin looking -Z, so this is camera space
    return mainCamera.localToWorld(out);
  }

  ejectWorld(mainCamera, out) {
    const e = this.cur?.gun.userData.anchors?.eject;
    if (!e) return out.copy(mainCamera.position);
    e.getWorldPosition(out);
    return mainCamera.localToWorld(out);
  }
}
