// Visual effects: GPU point particles (additive + alpha), tracers, decals, explosions, smoke clouds, casings.
import * as THREE from 'three';
import * as T from '../gfx/textures.js';

const PARTICLE_VS = `
attribute float size; attribute float alpha; attribute vec3 pcolor;
varying float vAlpha; varying vec3 vColor;
uniform float scale;
void main(){
  vAlpha = alpha; vColor = pcolor;
  vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = size * scale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const PARTICLE_FS = `
uniform sampler2D map; varying float vAlpha; varying vec3 vColor;
void main(){
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  if (gl_FragColor.a < 0.01) discard;
}`;

class ParticleSystem {
  constructor(scene, cap, additive) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.alpha = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.grow = new Float32Array(cap);
    this.a0 = new Float32Array(cap);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: T.softDot() }, scale: { value: 600 } },
      vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, life, size, r, g, b, a = 1, grav = 0, drag = 0, grow = 0) {
    const i = this.next; this.next = (this.next + 1) % this.cap;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.alpha[i] = a; this.a0[i] = a;
    this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow;
  }
  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3, dr = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= dr; this.vel[k + 1] = this.vel[k + 1] * dr - this.grav[i] * dt; this.vel[k + 2] *= dr;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = this.a0[i] * Math.min(1, t * 2.5);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.alpha.needsUpdate = a.size.needsUpdate = a.pcolor.needsUpdate = true;
  }
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.add = new ParticleSystem(scene, 3000, true);
    this.alpha = new ParticleSystem(scene, 3000, false);
    this.tracers = [];
    const trGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 4, 1, true);
    trGeo.rotateX(Math.PI / 2); trGeo.translate(0, 0, -0.5);
    this.trMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(trGeo, this.trMat); m.visible = false; m.frustumCulled = false;
      scene.add(m); this.tracers.push({ mesh: m, life: 0, from: new THREE.Vector3(), dir: new THREE.Vector3(), len: 0, travelled: 0 });
    }
    this.trI = 0;
    // decals: instanced quads
    const dGeo = new THREE.PlaneGeometry(1, 1);
    this.holes = new THREE.InstancedMesh(dGeo, new THREE.MeshStandardMaterial({ map: T.bulletHole(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.9 }), 400);
    this.blood = new THREE.InstancedMesh(dGeo, new THREE.MeshStandardMaterial({ map: T.bloodSplat(5), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, roughness: 0.4, color: 0xffffff }), 120);
    for (const im of [this.holes, this.blood]) {
      im.count = 0; im.frustumCulled = false; im.receiveShadow = true;
      scene.add(im);
    }
    this.holeI = 0; this.bloodI = 0;
    // smoke clouds (for smoke grenades): large alpha sprites
    this.clouds = [];
    // muzzle flash sprites (world)
    const fm = new THREE.SpriteMaterial({ map: T.muzzleFlash(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffd090 });
    this.flashes = [];
    for (let i = 0; i < 16; i++) { const s = new THREE.Sprite(fm); s.visible = false; scene.add(s); this.flashes.push({ s, life: 0 }); }
    this.flI = 0;
    // a few pooled lights for muzzle flashes / explosions
    this.lights = [];
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffb050, 0, 8, 2); scene.add(l); this.lights.push({ l, life: 0, max: 0.05, peak: 0 }); }
    this.lI = 0;
    this.casings = [];
    this.shellFactory = null;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
    this._z = new THREE.Vector3(0, 0, 1);
  }

  flashLight(pos, intensity = 6, life = 0.05, color = 0xffb050, dist = 8) {
    const L = this.lights[this.lI]; this.lI = (this.lI + 1) % this.lights.length;
    L.l.position.copy(pos); L.l.color.setHex(color); L.l.distance = dist; L.peak = intensity; L.life = life; L.max = life; L.l.intensity = intensity;
  }

  muzzle(pos, dir, big = 1) {
    const f = this.flashes[this.flI]; this.flI = (this.flI + 1) % this.flashes.length;
    f.s.position.copy(pos); f.s.scale.setScalar(0.35 * big); f.s.material.rotation = Math.random() * 6; f.s.visible = true; f.life = 0.04;
    this.flashLight(pos, 4 * big, 0.05);
    for (let i = 0; i < 3; i++) this.alpha.emit(pos.x, pos.y, pos.z, dir.x * 1.5 + (Math.random() - 0.5), dir.y * 1.5 + Math.random() * 0.5, dir.z * 1.5 + (Math.random() - 0.5), 0.6, 0.25, 0.7, 0.7, 0.7, 0.25, -0.3, 2, 0.6);
  }

  tracer(from, to, speed = 300) {
    const t = this.tracers[this.trI]; this.trI = (this.trI + 1) % this.tracers.length;
    t.from.copy(from); t.dir.subVectors(to, from); t.len = t.dir.length(); t.dir.divideScalar(t.len || 1);
    t.travelled = 0; t.speed = speed; t.life = 1; t.mesh.visible = true;
  }

  impact(point, normal, mat = 'concrete') {
    const n = normal;
    // decal
    this._q.setFromUnitVectors(this._z, n);
    this._v.copy(point).addScaledVector(n, 0.005);
    const s = 0.07 + Math.random() * 0.03;
    this._m.compose(this._v, this._q, this._s.set(s, s, s));
    this.holes.setMatrixAt(this.holeI, this._m);
    this.holeI = (this.holeI + 1) % 400;
    this.holes.count = Math.max(this.holes.count, this.holeI === 0 ? 400 : this.holeI);
    this.holes.instanceMatrix.needsUpdate = true;
    // sparks / dust
    if (mat === 'metal') {
      for (let i = 0; i < 8; i++) {
        const v = this.rndDir(n, 0.8).multiplyScalar(3 + Math.random() * 5);
        this.add.emit(point.x, point.y, point.z, v.x, v.y, v.z, 0.25 + Math.random() * 0.3, 0.05, 1, 0.75, 0.35, 1, 9.8, 1);
      }
    }
    const dust = mat === 'sand' ? [0.75, 0.62, 0.42] : mat === 'wood' ? [0.45, 0.33, 0.2] : mat === 'metal' ? [0.45, 0.45, 0.45] : [0.6, 0.58, 0.55];
    for (let i = 0; i < 5; i++) {
      const v = this.rndDir(n, 0.5).multiplyScalar(0.5 + Math.random() * 1.5);
      this.alpha.emit(point.x, point.y, point.z, v.x, v.y, v.z, 0.6 + Math.random() * 0.6, 0.12 + Math.random() * 0.1, dust[0], dust[1], dust[2], 0.7, 0.5, 2, 0.5);
    }
    for (let i = 0; i < 4; i++) {
      const v = this.rndDir(n, 0.7).multiplyScalar(2 + Math.random() * 3);
      this.alpha.emit(point.x, point.y, point.z, v.x, v.y, v.z, 0.5, 0.03, dust[0] * 0.6, dust[1] * 0.6, dust[2] * 0.6, 1, 9.8, 0.5);
    }
  }

  bloodHit(point, dir, zombie = false, amount = 1) {
    const c = zombie ? [0.25, 0.4, 0.08] : [0.45, 0.02, 0.02];
    for (let i = 0; i < 10 * amount; i++) {
      const v = this.rndDir(dir, 0.6).multiplyScalar(1 + Math.random() * 3);
      this.alpha.emit(point.x, point.y, point.z, v.x, v.y, v.z, 0.4 + Math.random() * 0.4, 0.05 + Math.random() * 0.07, c[0], c[1], c[2], 0.95, 9.8, 1);
    }
    for (let i = 0; i < 3; i++) this.alpha.emit(point.x, point.y, point.z, dir.x * 0.5, dir.y * 0.5, dir.z * 0.5, 0.5, 0.25, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8, 0.6, 0, 3, 0.8);
  }

  bloodDecal(point, normal) {
    this._q.setFromUnitVectors(this._z, normal);
    this._q.multiply(new THREE.Quaternion().setFromAxisAngle(this._z, Math.random() * 6.28));
    this._v.copy(point).addScaledVector(normal, 0.006);
    const s = 0.5 + Math.random() * 0.6;
    this._m.compose(this._v, this._q, this._s.set(s, s, s));
    this.blood.setMatrixAt(this.bloodI, this._m);
    this.bloodI = (this.bloodI + 1) % 120;
    this.blood.count = Math.max(this.blood.count, this.bloodI === 0 ? 120 : this.bloodI);
    this.blood.instanceMatrix.needsUpdate = true;
  }

  explosion(pos, scale = 1) {
    this.flashLight(pos, 60 * scale, 0.35, 0xffa040, 25);
    for (let i = 0; i < 40 * scale; i++) {
      const v = new THREE.Vector3().randomDirection(); v.y = Math.abs(v.y) * 0.8 + 0.2; v.multiplyScalar(2 + Math.random() * 7 * scale);
      this.add.emit(pos.x, pos.y + 0.2, pos.z, v.x, v.y, v.z, 0.3 + Math.random() * 0.4, 0.6 + Math.random() * 0.8 * scale, 1, 0.55 + Math.random() * 0.3, 0.15, 1, -1, 3, 3);
    }
    for (let i = 0; i < 30 * scale; i++) {
      const v = new THREE.Vector3().randomDirection(); v.y = Math.abs(v.y); v.multiplyScalar(1 + Math.random() * 3 * scale);
      this.alpha.emit(pos.x, pos.y + 0.3, pos.z, v.x, v.y + 1, v.z, 2 + Math.random() * 2, 1 + Math.random() * scale, 0.18, 0.17, 0.16, 0.75, -0.4, 1.2, 1.5);
    }
    for (let i = 0; i < 30; i++) {
      const v = new THREE.Vector3().randomDirection(); v.y = Math.abs(v.y) + 0.3; v.multiplyScalar(5 + Math.random() * 9);
      this.add.emit(pos.x, pos.y + 0.2, pos.z, v.x, v.y, v.z, 0.8 + Math.random() * 0.6, 0.06, 1, 0.7, 0.3, 1, 9.8, 0.5);
    }
  }

  flashbang(pos) {
    this.flashLight(pos, 120, 0.4, 0xffffff, 30);
    for (let i = 0; i < 25; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(4); this.add.emit(pos.x, pos.y, pos.z, v.x, v.y, v.z, 0.3, 1.5, 1, 1, 1, 1, 0, 3, 4); }
  }

  smokeCloud(pos, radius = 5, duration = 16) {
    const cloud = { pos: pos.clone(), radius, life: duration, max: duration, emitT: 0 };
    this.clouds.push(cloud);
    return cloud;
  }

  // point inside any smoke cloud (bots can't see through)
  smokeBlocks(a, b) {
    for (const c of this.clouds) {
      if (c.life < 1.5 || c.max - c.life < 1) continue;
      // segment-sphere distance
      const ab = this._v.subVectors(b, a), len2 = ab.lengthSq();
      const t = Math.max(0, Math.min(1, ((c.pos.x - a.x) * ab.x + (c.pos.y + 1 - a.y) * ab.y + (c.pos.z - a.z) * ab.z) / (len2 || 1)));
      const dx = a.x + ab.x * t - c.pos.x, dy = a.y + ab.y * t - (c.pos.y + 1), dz = a.z + ab.z * t - c.pos.z;
      if (dx * dx + dy * dy + dz * dz < c.radius * c.radius * 0.8) return true;
    }
    return false;
  }

  casing(factory, pos, vel, kind) {
    if (!factory) return;
    let c = this.casings.find((x) => x.life <= 0 && x.kind === kind);
    if (!c) {
      if (this.casings.length > 40) { c = this.casings.reduce((a, b) => (a.life < b.life ? a : b)); this.scene.remove(c.mesh); c.mesh = factory(kind); c.kind = kind; this.scene.add(c.mesh); }
      else { c = { mesh: factory(kind), kind, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, bounced: false }; this.scene.add(c.mesh); this.casings.push(c); }
    }
    c.mesh.position.copy(pos); c.vel.copy(vel); c.spin.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
    c.life = 3; c.bounced = false; c.mesh.visible = true;
  }

  rndDir(n, spread) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(spread).add(n).normalize();
    return v;
  }

  update(dt, camera, world) {
    this.add.update(dt); this.alpha.update(dt);
    for (const t of this.tracers) {
      if (!t.mesh.visible) continue;
      t.travelled += t.speed * dt;
      const segLen = Math.min(6, t.len * 0.5);
      if (t.travelled - segLen > t.len) { t.mesh.visible = false; continue; }
      const head = Math.min(t.travelled, t.len), tail = Math.max(0, t.travelled - segLen);
      t.mesh.position.copy(t.from).addScaledVector(t.dir, head);
      t.mesh.lookAt(this._v.copy(t.from).addScaledVector(t.dir, head + 1));
      t.mesh.scale.set(1, 1, Math.max(0.01, head - tail));
    }
    for (const f of this.flashes) if (f.s.visible) { f.life -= dt; if (f.life <= 0) f.s.visible = false; }
    for (const L of this.lights) if (L.life > 0) { L.life -= dt; L.l.intensity = Math.max(0, L.peak * (L.life / L.max)); }
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.life -= dt; c.emitT -= dt;
      if (c.emitT <= 0 && c.life > 2) {
        c.emitT = 0.08;
        const grow = Math.min(1, (c.max - c.life) / 2);
        for (let k = 0; k < 3; k++) {
          const v = new THREE.Vector3().randomDirection(); v.y = Math.abs(v.y) * 0.6;
          const r = c.radius * grow * Math.random();
          const g = 0.75 + Math.random() * 0.15;
          this.alpha.emit(c.pos.x + v.x * r, c.pos.y + 0.3 + v.y * r * 0.7, c.pos.z + v.z * r, v.x * 0.2, 0.05, v.z * 0.2, 3.5, 2.6 + Math.random() * 1.5, g, g, g, 0.55, -0.01, 0.2, 0.3);
        }
      }
      if (c.life <= 0) this.clouds.splice(i, 1);
    }
    for (const c of this.casings) {
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) { c.mesh.visible = false; continue; }
      c.vel.y -= 9.8 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt; c.mesh.rotation.y += c.spin.y * dt; c.mesh.rotation.z += c.spin.z * dt;
      const gh = world.groundHeight(c.mesh.position.x, c.mesh.position.z, c.mesh.position.y + 0.3);
      if (c.mesh.position.y < gh + 0.01) {
        c.mesh.position.y = gh + 0.01;
        if (Math.abs(c.vel.y) > 0.8) { c.vel.y *= -0.35; c.vel.x *= 0.5; c.vel.z *= 0.5; c.spin.multiplyScalar(0.5); if (!c.bounced && this.onCasingBounce) this.onCasingBounce(c.mesh.position); c.bounced = true; }
        else { c.vel.set(0, 0, 0); c.spin.set(0, 0, 0); c.mesh.rotation.x = Math.PI / 2; }
      }
    }
    void camera;
  }
}
