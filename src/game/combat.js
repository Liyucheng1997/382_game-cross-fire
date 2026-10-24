// Hitscan shooting, melee and hitbox ray tests. Shared by player and bots.
import * as THREE from 'three';
import { Audio } from '../audio.js';

const _inv = new THREE.Matrix4();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _end = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3();
const _u2 = new THREE.Vector3();

const PART_MUL = { head: 1, chest: 1, stomach: 0.9, arm: 0.75, leg: 0.65 };

function rayOBB(o, d, half, offset, maxT) {
  let tmin = 0, tmax = maxT;
  const oo = [o.x - offset[0], o.y - offset[1], o.z - offset[2]], dd = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dd[i]) < 1e-9) { if (Math.abs(oo[i]) > half[i]) return -1; continue; }
    let t1 = (-half[i] - oo[i]) / dd[i], t2 = (half[i] - oo[i]) / dd[i];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin;
}

// Ray vs one actor's animated hitboxes. Returns {t, part} or null. t in world units.
export function rayActor(actor, origin, dir, maxT) {
  // broadphase: distance from ray to vertical axis
  const r = (actor.zombie ? actor.model.radius * 2.2 : 0.9) + 0.2;
  const h = actor.model ? actor.model.height * 1.15 + 0.3 : 2.1;
  const px = actor.pos.x - origin.x, pz = actor.pos.z - origin.z;
  const hl = Math.hypot(dir.x, dir.z);
  if (hl > 1e-6) {
    const tc = (px * dir.x + pz * dir.z) / (hl * hl);
    if (tc < -r) return null;
    const cx = origin.x + dir.x * tc - actor.pos.x, cz = origin.z + dir.z * tc - actor.pos.z;
    if (cx * cx + cz * cz > r * r) return null;
    const y = origin.y + dir.y * tc;
    if (y < actor.pos.y - 1.5 || y > actor.pos.y + h + 1.5) return null;
  } else if (px * px + pz * pz > r * r) return null;
  if (tcBehind(actor, origin, dir, maxT)) return null;

  let best = null;
  const boxes = actor.hitboxes;
  if (!boxes) return null;
  for (const hb of boxes) {
    _inv.copy(hb.bone.matrixWorld).invert();
    _o.copy(origin).applyMatrix4(_inv);
    _d.copy(dir).transformDirection(_inv);
    // transformDirection normalises; recover scale factor to convert t back to world units
    _tmp.copy(dir).add(origin).applyMatrix4(_inv).sub(_o);
    const scale = _tmp.length();
    const t = rayOBB(_o, _d, hb.half, hb.offset, maxT * scale);
    if (t >= 0) {
      const tw = t / scale;
      if (tw < maxT && (!best || tw < best.t)) best = { t: tw, part: hb.part };
    }
  }
  return best;
}

function tcBehind(actor, origin, dir, maxT) {
  const dx = actor.pos.x - origin.x, dz = actor.pos.z - origin.z;
  const along = dx * dir.x + dz * dir.z;
  return along > maxT + 3;
}

export function currentSpread(a) {
  const w = a.weapon; if (!w) return 0;
  const d = w.def;
  let s = d.spread || 0;
  if (d.cat === 'sniper') s = a.scope ? d.spread : d.unscopedSpread;
  else if (a.scope && d.zoomSpreadMul) s *= d.zoomSpreadMul;
  const sp = a.moveSpeed;
  if (sp > 0.6) s += (d.moveSpread || 0) * Math.min(1, sp / 5) * (a.walking ? 0.5 : 1);
  if (!a.onGround) s += d.jumpSpread || 0;
  s += a.spreadAdd;
  if (a.crouch > 0.5) s *= d.crouchMul || 1;
  if (a.isPlayer && a.bot == null) s *= 1; // hook for difficulty scaling
  return s;
}

function spreadDir(base, deg, out) {
  if (deg <= 0) return out.copy(base);
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * THREE.MathUtils.degToRad(deg);
  _right.crossVectors(base, _up);
  if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
  _right.normalize();
  _u2.crossVectors(_right, base).normalize();
  out.copy(base).addScaledVector(_right, Math.cos(a) * Math.tan(r)).addScaledVector(_u2, Math.sin(a) * Math.tan(r)).normalize();
  return out;
}

// Trace one bullet. Returns {actor, part, point, t} or world hit.
export function traceBullet(game, shooter, origin, dir, maxDist = 400) {
  const wh = game.world.raycast(origin, dir, maxDist);
  let maxT = wh ? wh.t : maxDist;
  let hitActor = null, hitPart = null;
  for (const a of game.actors) {
    if (a === shooter || !a.alive) continue;
    if (!game.canDamage(shooter, a)) continue;
    const r = rayActor(a, origin, dir, maxT);
    if (r && r.t < maxT) { maxT = r.t; hitActor = a; hitPart = r.part; }
  }
  const point = new THREE.Vector3().copy(origin).addScaledVector(dir, maxT);
  if (hitActor) return { actor: hitActor, part: hitPart, point, t: maxT };
  if (wh) return { world: wh, point: wh.point, t: wh.t };
  return { point, t: maxT };
}

// Fire the shooter's current gun once (handles pellets). muzzle: world pos for tracer start
export function fireGun(game, a, muzzle, opts = {}) {
  const w = a.weapon, d = w.def;
  const origin = a.eye;
  a.aimDir(_dir);
  const spread = currentSpread(a) * (opts.spreadMul ?? 1);
  const pellets = d.pellets || 1;
  let anyHit = false, head = false;
  const hits = new Map();
  for (let i = 0; i < pellets; i++) {
    const dir = spreadDir(_dir, spread, new THREE.Vector3());
    const res = traceBullet(game, a, origin, dir, d.cat === 'shotgun' ? 60 : 400);
    if (res.actor) {
      const dist = res.t;
      let dmg = d.damage * (res.part === 'head' ? d.head : PART_MUL[res.part] ?? 1);
      if (d.range && dist > d.range) dmg *= Math.max(d.falloff, 1 - (dist - d.range) / (d.range * 2) * (1 - d.falloff));
      if (d.cat === 'shotgun' && dist > 4) dmg *= Math.max(0.2, 1 - (dist - 4) / 14);
      dmg *= a.chestBuff?.dmg || 1;
      const h = hits.get(res.actor) || { dmg: 0, head: false, point: res.point, dir, knock: 0 };
      h.dmg += dmg; h.head = h.head || res.part === 'head'; h.knock += (d.knockback || 0) / pellets * (res.part === 'head' ? 1.4 : 1);
      hits.set(res.actor, h);
      game.fx.bloodHit(res.point, dir.clone().negate().lerp(dir, 0.7), !!res.actor.zombie, pellets > 1 ? 0.4 : 1);
      // blood splatter on the wall behind
      if (Math.random() < 0.35) {
        const wh = game.world.raycast(res.point, dir, 3);
        if (wh) game.fx.bloodDecal(wh.point, wh.normal);
      }
      anyHit = true;
    } else if (res.world) {
      game.fx.impact(res.world.point, res.world.normal, res.world.mat);
      if (Math.random() < (pellets > 1 ? 0.15 : 0.5)) Audio.play(`impact_${res.world.mat === 'metal' ? 'metal' : res.world.mat === 'wood' ? 'wood' : 'concrete'}`, { pos: res.world.point, volume: 0.5, ref: 2, maxDist: 40 });
    }
    // tracers: every shot for bots (helps the player locate them), every other for the player
    if (muzzle && (i === 0 || Math.random() < 0.3) && (!a.isPlayer || Math.random() < 0.5)) game.fx.tracer(muzzle, res.point, 260);
    // bullet whiz near the local player
    if (!a.isPlayer && game.player && game.player.alive) whiz(game, origin, dir, res.t);
  }
  for (const [target, h] of hits) {
    game.applyDamage(target, h.dmg, a, { weapon: w.id, headshot: h.head, dir: h.dir, point: h.point, knock: h.knock });
    if (h.head) head = true;
  }
  return { hit: anyHit, head };
}

function whiz(game, origin, dir, t) {
  const p = game.player.eye;
  _tmp.subVectors(p, origin);
  const along = _tmp.dot(dir);
  if (along < 2 || along > t) return;
  _end.copy(origin).addScaledVector(dir, along);
  const d = _end.distanceTo(p);
  if (d < 1.2 && Math.random() < 0.5) Audio.play('swing', { pos: _end, volume: 0.25, rate: 2.2, ref: 1 });
}

// Melee: cone check in front. heavy = right click. Returns hit actor or null.
export function melee(game, a, heavy) {
  const d = a.weapon.def;
  const reach = a.zombie ? a.zombieDef.reach : heavy ? d.heavyReach : d.reach;
  const origin = a.eye;
  a.aimDir(_dir);
  let best = null, bestScore = Infinity;
  for (const t of game.actors) {
    if (t === a || !t.alive || !game.canDamage(a, t)) continue;
    // nearest point on target's vertical segment
    const ty = Math.min(t.pos.y + t.height * 0.9, Math.max(t.pos.y + 0.3, origin.y));
    _tmp.set(t.pos.x - origin.x, ty - origin.y, t.pos.z - origin.z);
    const dist = _tmp.length() - (t.zombie ? t.model.radius : t.radius);
    if (dist > reach) continue;
    _tmp.normalize();
    const dot = _tmp.dot(_dir);
    if (dot < (a.zombie ? 0.55 : 0.7)) continue;
    const score = dist - dot;
    if (score < bestScore) { bestScore = score; best = t; }
  }
  if (best) {
    // back-stab: attacker roughly behind the victim
    const fwd = new THREE.Vector3(-Math.sin(best.yaw), 0, -Math.cos(best.yaw));
    const toA = new THREE.Vector3(a.pos.x - best.pos.x, 0, a.pos.z - best.pos.z).normalize();
    const back = fwd.dot(toA) < -0.5;
    let dmg;
    if (a.zombie) dmg = a.zombieDef.dmg;
    else dmg = (heavy ? d.heavyDamage : d.damage) * (back ? (heavy ? 3 : 1.8) : 1) * (a.chestBuff?.dmg || 1);
    const p = best.eye.clone().lerp(best.pos, 0.35);
    game.fx.bloodHit(p, _dir.clone(), !!best.zombie, 1.2);
    game.applyDamage(best, dmg, a, { weapon: a.zombie ? 'claw' : a.weapon.id, headshot: false, dir: _dir.clone(), point: p, knock: (d.knockback || 2) * (heavy ? 2 : 1), melee: true, heavy, backstab: back });
    Audio.play(a.zombie ? 'claw' : 'stab', { pos: a.isPlayer ? null : p, volume: 0.8 });
    return best;
  }
  // wall hit
  const wh = game.world.raycast(origin, _dir, reach);
  if (wh) {
    game.fx.impact(wh.point, wh.normal, wh.mat);
    Audio.play(`impact_${wh.mat === 'metal' ? 'metal' : 'concrete'}`, { pos: wh.point, volume: 0.6 });
  }
  return null;
}
