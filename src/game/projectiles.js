// Thrown grenades with bouncing physics.
import * as THREE from 'three';
import { Audio } from '../audio.js';

const _d = new THREE.Vector3();
const _p = new THREE.Vector3();

export class Grenade {
  constructor(game, type, pos, vel, owner) {
    this.game = game; this.type = type; this.owner = owner;
    this.pos = pos.clone(); this.vel = vel.clone();
    this.fuse = { he: 2.2, flash: 1.6, smoke: 1.8 }[type] ?? 2;
    this.dead = false;
    this.mesh = game.makeGrenadeMesh(type);
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
    this.spin = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
    this.rest = false;
  }

  update(dt) {
    if (this.dead) return;
    this.fuse -= dt;
    if (!this.rest) {
      this.vel.y -= 16 * dt;
      const sp = this.vel.length();
      if (sp > 1e-3) {
        _d.copy(this.vel).divideScalar(sp);
        const hit = this.game.world.raycast(this.pos, _d, sp * dt + 0.06);
        if (hit) {
          this.pos.copy(hit.point).addScaledVector(hit.normal, 0.07);
          const vn = this.vel.dot(hit.normal);
          this.vel.addScaledVector(hit.normal, -1.6 * vn).multiplyScalar(0.45);
          if (Math.abs(vn) > 2) Audio.play('bounce', { pos: this.pos, volume: Math.min(1, Math.abs(vn) / 10) });
          if (hit.normal.y > 0.7 && this.vel.length() < 1.2) { this.rest = true; this.vel.set(0, 0, 0); }
        } else this.pos.addScaledVector(this.vel, dt);
      }
      this.mesh.rotation.x += this.spin.x * dt; this.mesh.rotation.z += this.spin.z * dt;
      if (this.pos.y < this.game.killY - 2) this.dead = true;
    }
    this.mesh.position.copy(this.pos);
    if (this.fuse <= 0) this.explode();
  }

  explode() {
    this.dead = true;
    this.game.scene.remove(this.mesh);
    const g = this.game, p = this.pos;
    if (this.type === 'he') {
      g.fx.explosion(p, 1);
      Audio.play('explosion', { pos: p, volume: 1.4, ref: 8, maxDist: 250, rolloff: 0.6 });
      const R = 7;
      for (const a of g.actors) {
        if (!a.alive) continue;
        _p.set(a.pos.x, a.pos.y + a.height * 0.5, a.pos.z);
        const d = _p.distanceTo(p);
        if (d > R) continue;
        if (!g.world.lineOfSight(p.clone().setY(p.y + 0.2), _p)) continue;
        if (a !== this.owner && !g.canDamage(this.owner, a)) continue;
        const f = 1 - d / R;
        const dmg = 120 * f * f + 10 * f;
        const dir = _p.clone().sub(p).normalize();
        g.applyDamage(a, a.zombie ? dmg * 8 : dmg, this.owner, { weapon: 'he', headshot: false, dir, point: _p.clone(), knock: 40 * f, explosion: true });
      }
      g.shake(p, 1.2);
    } else if (this.type === 'flash') {
      g.fx.flashbang(p);
      Audio.play('flashbang', { pos: p, volume: 1.2, ref: 8, maxDist: 120 });
      for (const a of g.actors) {
        if (!a.alive) continue;
        const eye = a.eye;
        const d = eye.distanceTo(p);
        if (d > 25 || !g.world.lineOfSight(eye, p)) continue;
        const look = a.aimDir(new THREE.Vector3()).dot(_d.copy(p).sub(eye).normalize());
        const amount = (1 - d / 25) * (look > 0.3 ? 1 : look > -0.3 ? 0.5 : 0.2);
        a.flashT = Math.max(a.flashT, amount * 4.5);
      }
    } else if (this.type === 'smoke') {
      g.fx.smokeCloud(p, 5.5, 18);
      Audio.play('smoke', { pos: p, volume: 0.8 });
    }
  }
}
