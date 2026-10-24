// 3D backdrop for the lobby: a soldier on a lit stage, and a turntable for weapon previews in the armory/shop.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildGun } from '../models/guns.js';
import { createSoldier } from '../models/characters.js';
import { M } from '../gfx/materials.js';

export class Lobby3D {
  constructor(renderer) {
    this.renderer = renderer;
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x07090c);
    s.fog = new THREE.Fog(0x07090c, 8, 22);
    const pm = new THREE.PMREMGenerator(renderer);
    this.envRT = pm.fromScene(new RoomEnvironment(), 0.04);
    s.environment = this.envRT.texture;
    s.environmentIntensity = 0.5;
    pm.dispose();
    this.camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 100);
    this.camera.position.set(0.4, 1.25, 5.4);
    // stage
    const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.MeshStandardMaterial({ color: 0x15181c, metalness: 0.6, roughness: 0.35, map: M.deckPlate().map }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.36, 64), new THREE.MeshBasicMaterial({ color: 0xf0a020 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(2.1, 0.005, 0); s.add(ring);
    const key = new THREE.SpotLight(0xffe0b0, 60, 20, 0.5, 0.6, 1.5);
    key.position.set(4, 6, 4); key.target.position.set(2.1, 1, 0); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005;
    s.add(key); s.add(key.target);
    const rim = new THREE.SpotLight(0x5aa0ff, 50, 20, 0.6, 0.7, 1.5);
    rim.position.set(-4, 4, -4); s.add(rim); s.add(rim.target);
    const rim2 = new THREE.PointLight(0xff6020, 3, 6); rim2.position.set(3.6, 2.2, -2.2); s.add(rim2);
    s.add(new THREE.HemisphereLight(0x8899aa, 0x221a12, 0.5));
    // background container wall for flavour
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(2.44, 2.59, 6), M.container(['#7a2a1d', '#2f5d8a', '#3d5a2a', '#8a6a1d', '#444b52'][i], i + 3));
      c.position.set(-6 + i * 2.6, 1.3 + (i % 2) * 0, -7); c.rotation.y = 0.0; c.receiveShadow = true; s.add(c);
      if (i % 2 === 0) { const c2 = c.clone(); c2.position.y += 2.6; s.add(c2); }
    }
    this.soldier = null;
    this.gun = null;
    this.mode = 'soldier';
    this.t = 0;
    this.drag = { on: false, x: 0, rot: 0 };
    renderer.domElement.addEventListener('pointerdown', (e) => { if (!this.active) return; this.drag.on = true; this.drag.x = e.clientX; });
    addEventListener('pointerup', () => { this.drag.on = false; });
    addEventListener('pointermove', (e) => { if (this.drag.on && this.active) { this.drag.rot += (e.clientX - this.drag.x) * 0.01; this.drag.x = e.clientX; } });
  }

  setSoldier(team, primary, variant = 'default') {
    if (this.soldier) this.scene.remove(this.soldier.root);
    this.soldier = createSoldier({ team, variant: 1 });
    this.soldier.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const g = buildGun(primary, { variant });
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.soldier.holdWeapon(g, 'rifle');
    this.soldier.root.position.set(2.1, 0, 0);
    this.scene.add(this.soldier.root);
  }

  showGun(id, variant = 'default') {
    if (this.gun) this.scene.remove(this.gun);
    const holder = new THREE.Group();
    const g = buildGun(id, { variant });
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    // centre the gun on its bounding box
    const box = new THREE.Box3().setFromObject(g);
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    g.position.sub(c);
    holder.add(g);
    const sc = 1.1 / Math.max(size.x, size.y, size.z, 0.2);
    holder.scale.setScalar(sc);
    holder.position.set(0, 1.25, 0);
    this.scene.add(holder);
    this.gun = holder;
    this.mode = 'gun';
    this.drag.rot = 0;
  }

  showSoldier() {
    if (this.gun) { this.scene.remove(this.gun); this.gun = null; }
    this.mode = 'soldier';
  }

  render(dt) {
    this.t += dt;
    const cam = this.camera;
    cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix();
    if (this.mode === 'gun' && this.gun) {
      cam.position.lerp(new THREE.Vector3(0, 1.35, 2.2), 0.1);
      cam.lookAt(0, 1.25, 0);
      if (!this.drag.on) this.drag.rot += dt * 0.35;
      this.gun.rotation.set(Math.sin(this.t * 0.6) * 0.06, this.drag.rot + Math.PI / 2, 0);
      if (this.soldier) this.soldier.root.visible = false;
    } else {
      cam.position.lerp(new THREE.Vector3(0.4, 1.25, 5.4), 0.08);
      cam.lookAt(1.25, 1.0, 0);
      if (this.soldier) {
        this.soldier.root.visible = true;
        if (!this.drag.on) this.drag.rot += (Math.sin(this.t * 0.3) * 0.4 - 0.5 - this.drag.rot) * 0.01;
        this.soldier.root.rotation.y = this.drag.rot + Math.PI - 0.35;
        this.soldier.update(dt, { speed: 0, moveX: 0, moveZ: 0, crouch: false, airborne: false, pitch: Math.sin(this.t * 0.7) * 0.05, firing: false, reloading: false, alive: true });
      }
    }
    this.renderer.render(this.scene, cam);
  }
}
