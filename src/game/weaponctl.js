// Weapon state machine: firing cadence, recoil, reload, switching, zoom, melee timing, grenade throws.
// Emits string events on actor.events for the viewmodel / third-person model / audio to consume.
import * as THREE from 'three';
import { fireGun, melee } from './combat.js';
import { Audio } from '../audio.js';
import { Grenade } from './projectiles.js';

const DRAW_TIME = { rifle: 0.7, smg: 0.6, sniper: 0.9, shotgun: 0.75, mg: 1.0, pistol: 0.45, melee: 0.35, grenade: 0.5 };

export function emit(a, ev) { (a.events || (a.events = [])).push(ev); }

export function switchWeapon(a, slot) {
  if (!a.slots[slot] || slot === a.cur || !a.alive) return false;
  if (a.zombie) return false;
  if (slot === 'grenade' && a.slots.grenade.count <= 0) return false;
  a.lastSlot = a.cur;
  a.cur = slot;
  a.switchT = DRAW_TIME[a.weapon.def.cat] ?? 0.6;
  a.reloadT = 0; a.scope = 0; a.boltT = 0; a.pendingMelee = null; a.grenadeCook = 0;
  a.burst = 0; a.reloadingShells = false;
  emit(a, 'draw');
  if (a.isPlayer) Audio.play('draw', { volume: 0.4 });
  return true;
}

export function startReload(a) {
  const w = a.weapon;
  if (!w || a.reloadT > 0 || a.switchT > 0) return false;
  const d = w.def;
  if (!d.mag || w.ammo >= d.mag || w.reserve <= 0) return false;
  a.scope = 0;
  if (d.shellReload) {
    a.reloadingShells = true;
    a.reloadT = d.reload + 0.25; // first shell includes the lift
  } else a.reloadT = d.reload;
  emit(a, 'reload');
  if (a.isPlayer) Audio.play('mag_out', { volume: 0.5, delay: 0.15 });
  else Audio.play('mag_out', { pos: a.pos, volume: 0.4, maxDist: 25 });
  return true;
}

// input: {fire, firePressed, fire2Pressed, reload, fireReleased}
export function updateWeapon(game, a, dt, input) {
  const w = a.weapon;
  if (!w || !a.alive) return;
  const d = w.def;
  a.fireT = Math.max(0, a.fireT - dt);
  a.switchT = Math.max(0, a.switchT - dt);
  // recoil recovery
  const rec = (d.recoilRecover || 8) * (input.fire && d.auto ? 0.25 : 1);
  a.recoil = Math.max(0, a.recoil - rec * dt * (1 + a.recoil * 0.25));
  a.recoilYaw *= Math.max(0, 1 - rec * 0.6 * dt);
  a.spreadAdd = Math.max(0, a.spreadAdd - dt * 6);
  if (!input.fire) a.burst = Math.max(0, a.burst - dt * 12);
  if (a.chestBuff && a.chestBuff.t > 0) { a.chestBuff.t -= dt; if (a.chestBuff.t <= 0) a.chestBuff.dmg = 1; }

  // pending melee hit (delayed so the swing animation lands)
  if (a.pendingMelee) {
    a.pendingMelee.t -= dt;
    if (a.pendingMelee.t <= 0) { melee(game, a, a.pendingMelee.heavy); a.pendingMelee = null; }
  }

  // bolt cycling
  if (a.boltT > 0) {
    a.boltT -= dt;
    if (a.boltT <= 0 && a.rezoom) { a.scope = a.rezoom; a.rezoom = 0; }
  }

  // reload progress
  if (a.reloadT > 0) {
    if (a.reloadingShells && input.firePressed && w.ammo > 0) { a.reloadT = 0; a.reloadingShells = false; emit(a, 'reloadEnd'); }
    else {
      a.reloadT -= dt;
      if (a.reloadT <= 0) {
        if (a.reloadingShells) {
          w.ammo++; w.reserve--;
          if (a.isPlayer) Audio.play('shell_in', { volume: 0.5 });
          if (w.ammo < d.mag && w.reserve > 0) { a.reloadT = d.reload; emit(a, 'shell'); }
          else { a.reloadingShells = false; emit(a, 'reloadEnd'); if (a.isPlayer) Audio.play('pump', { volume: 0.5 }); }
        } else {
          const need = d.mag - w.ammo, take = Math.min(need, w.reserve);
          w.ammo += take; w.reserve -= take;
          if (game.infiniteReserve?.(a)) w.reserve = d.reserve;
          emit(a, 'reloadEnd');
          if (a.isPlayer) Audio.play(d.cat === 'sniper' || d.cat === 'rifle' && d.bolt ? 'bolt' : 'mag_in', { volume: 0.55 });
        }
      }
      return;
    }
  }
  if (input.reload) { startReload(a); return; }
  if (a.switchT > 0) return;

  if (a.zombie) return zombieAttack(game, a, input);

  // ---------- melee ----------
  if (d.cat === 'melee') {
    if (a.fireT > 0 || a.pendingMelee) return;
    if (input.fire || input.fire2) {
      const heavy = !input.fire && input.fire2;
      a.fireT = heavy ? d.heavyRate : d.rate;
      a.pendingMelee = { t: heavy ? 0.32 : 0.12, heavy };
      emit(a, heavy ? 'meleeHeavy' : 'melee');
      Audio.play('swing', { pos: a.isPlayer ? null : a.pos, volume: 0.6, rate: heavy ? 0.8 : 1.1 });
    }
    return;
  }

  // ---------- grenade ----------
  if (d.cat === 'grenade') {
    if (w.count <= 0) { switchWeapon(a, a.lastSlot !== 'grenade' ? a.lastSlot : 'melee'); return; }
    if (input.fire && !a.grenadeCook && a.fireT <= 0) { a.grenadeCook = 0.001; emit(a, 'pin'); if (a.isPlayer) Audio.play('pin', { volume: 0.5 }); }
    if (a.grenadeCook) {
      a.grenadeCook += dt;
      if (!input.fire && a.grenadeCook > 0.35) {
        throwGrenade(game, a, w);
        a.grenadeCook = 0;
        a.fireT = 0.8;
      }
    }
    return;
  }

  // ---------- zoom ----------
  if (input.fire2Pressed && d.zoom && a.boltT <= 0) {
    a.scope = (a.scope + 1) % (d.zoom.length + 1);
    if (a.isPlayer) Audio.play('ui_click', { volume: 0.3 });
  }

  // ---------- guns ----------
  const wantFire = d.auto ? input.fire : input.firePressed;
  if (!wantFire || a.fireT > 0 || a.boltT > 0) return;
  if (w.ammo <= 0) {
    if (input.firePressed) { if (a.isPlayer) Audio.play('dry', { volume: 0.5 }); a.fireT = 0.2; }
    if (!startReload(a) && w.reserve <= 0 && a.isPlayer && input.firePressed) {
      // out of everything: auto switch
      if (a.cur === 'primary' && a.slots.secondary) switchWeapon(a, 'secondary');
    }
    return;
  }
  w.ammo--;
  a.fireT = 60 / d.rpm;
  a.firedThisFrame = true;
  const muzzle = game.muzzlePos(a);
  const res = fireGun(game, a, muzzle);
  // recoil
  a.burst++;
  const climb = d.recoilV * (a.burst < 4 ? 1 : 1.15) * (a.crouch > 0.5 ? 0.8 : 1) * (a.isPlayer ? 1 : 0.6);
  a.recoil = Math.min(a.recoil + climb, d.cat === 'sniper' ? 12 : 9 + d.recoilV * 2);
  const side = a.burst > 6 ? Math.sin(a.burst * 0.55) * 1.4 : (Math.random() - 0.5);
  a.recoilYaw += side * d.recoilH * (a.isPlayer ? 1 : 0.6);
  a.spreadAdd = Math.min(a.spreadAdd + (d.cat === 'rifle' || d.cat === 'mg' ? 0.25 : d.cat === 'smg' ? 0.12 : 0.6), 3);
  emit(a, 'fire');
  Audio.shot(d.sound, a.eye, a.isPlayer);
  if (d.cat !== 'melee') game.fx.muzzle(muzzle, a.aimDir(new THREE.Vector3()), d.sound === 'm4s' ? 0.35 : d.cat === 'sniper' ? 1.4 : 1);
  game.onShot?.(a, res);
  if (d.bolt) {
    a.rezoom = a.scope; a.scope = 0; a.boltT = 1.25;
    emit(a, 'bolt');
    setTimeout(() => Audio.play('bolt', { pos: a.isPlayer ? null : a.pos, volume: 0.5 }), 400);
  } else if (d.pump) {
    emit(a, 'pump');
    setTimeout(() => Audio.play('pump', { pos: a.isPlayer ? null : a.pos, volume: 0.5 }), 300);
  }
  // casing
  if (d.shell) game.ejectCasing(a, d.shell);
  if (w.ammo === 0 && w.reserve > 0 && !a.isPlayer) startReload(a);
}

function zombieAttack(game, a, input) {
  if (a.fireT > 0 || a.pendingMelee) return;
  if (input.fire || input.fire2) {
    const heavy = !input.fire && input.fire2;
    a.fireT = a.zombieDef.rate * (heavy ? 1.5 : 1);
    a.pendingMelee = { t: heavy ? 0.35 : 0.2, heavy };
    emit(a, heavy ? 'meleeHeavy' : 'melee');
    if (a.model?.attack) a.model.attack();
    Audio.play('claw', { pos: a.isPlayer ? null : a.pos, volume: 0.6 });
  }
}

export function throwGrenade(game, a, w) {
  const dir = a.aimDir(new THREE.Vector3());
  dir.y += 0.12; dir.normalize();
  const pos = a.eye.clone().addScaledVector(dir, 0.5);
  pos.y -= 0.1;
  const vel = dir.multiplyScalar(15).add(new THREE.Vector3(a.vel.x * 0.6, a.vel.y * 0.3, a.vel.z * 0.6));
  game.addProjectile(new Grenade(game, w.def.base || w.id, pos, vel, a));
  w.count--;
  emit(a, 'throw');
  Audio.play('swing', { pos: a.isPlayer ? null : a.pos, volume: 0.5 });
  if (w.count <= 0) setTimeout(() => { if (a.cur === 'grenade') switchWeapon(a, a.lastSlot !== 'grenade' ? a.lastSlot : 'melee'); }, 450);
}
