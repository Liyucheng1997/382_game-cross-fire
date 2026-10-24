// Dev-only model viewer.  /preview.html?gun=ak47&variant=gold  |  ?char=soldier&team=red  |  ?char=zombie&kind=host  |  ?map=transport  |  ?guns=all  |  ?chars=all
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createRenderer, setupEnvironment } from './gfx/env.js';
import { World } from './world/world.js';
import { MapBuilder } from './world/mapkit.js';

const q = new URLSearchParams(location.search);
const info = document.getElementById('info');
const renderer = createRenderer(document.getElementById('c'));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.01, 3000);
const controls = new OrbitControls(camera, renderer.domElement);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
const updaters = [];
window.__scene = scene; window.__camera = camera; window.__controls = controls;

async function main() {
  if (q.get('map')) {
    const mod = await import(`./maps/${q.get('map')}.js`);
    const def = mod.default;
    setupEnvironment(scene, renderer, def.env?.preset || 'day', def.env || {}, 90);
    const world = new World();
    const mb = new MapBuilder(scene, world);
    const t0 = performance.now();
    const meta = def.build(mb);
    mb.finalize();
    let calls = 0; scene.traverse(o => { if (o.isMesh) calls++; });
    info.textContent = `${def.name}  build ${(performance.now() - t0).toFixed(0)}ms  meshes ${calls}  colliders ${world.boxes.length}+${world.ramps.length}\nspawns ${Object.entries(meta.spawns).map(([k, v]) => k + ':' + v.length).join(' ')}`;
    camera.position.set(0, 60, 70); controls.target.set(0, 0, 0);
    // spawn markers
    const colors = { red: 0xff3030, blue: 0x3070ff, ffa: 0xffffff, zombie: 0x30ff30, human: 0xffff30 };
    for (const [k, list] of Object.entries(meta.spawns)) for (const s of list) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.8, 8), new THREE.MeshBasicMaterial({ color: colors[k] || 0xff00ff }));
      m.position.set(s[0], s[1] + 0.9, s[2]); scene.add(m);
    }
    if (q.get('fp')) { camera.position.set(...meta.spawns.red[0].slice(0, 3)); camera.position.y += 1.65; controls.target.copy(camera.position).add(new THREE.Vector3(0, 0, -1)); }
    updaters.push((dt, t) => mb.animated.forEach(a => a.update(dt, t)));
  } else {
    setupEnvironment(scene, renderer, q.get('env') || 'day', {}, 10);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    if (q.get('gun') || q.get('guns')) {
      const G = await import('./models/guns.js');
      const ids = q.get('guns') ? G.GUN_IDS : [q.get('gun')];
      ids.forEach((id, i) => {
        const g = G.buildGun(id, { variant: q.get('variant') || 'default' });
        const col = i % 6, row = Math.floor(i / 6);
        g.position.set(col * 1.2 - 3, 1 + row * 0.5, 0);
        g.rotation.y = Math.PI / 2;
        g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
        scene.add(g);
      });
      camera.position.set(0, 1.2, 1.4); controls.target.set(0, 1, 0);
      info.textContent = ids.join(', ');
    } else if (q.get('char') || q.get('chars')) {
      const C = await import('./models/characters.js');
      const list = q.get('chars') ? [
        C.createSoldier({ team: 'red', variant: 0 }), C.createSoldier({ team: 'red', variant: 1 }), C.createSoldier({ team: 'blue', variant: 0 }), C.createSoldier({ team: 'blue', variant: 1 }),
        C.createZombie({ kind: 'normal' }), C.createZombie({ kind: 'host' }), C.createZombie({ kind: 'fast' }), C.createZombie({ kind: 'heavy' }), C.createZombie({ kind: 'exploder' }), C.createZombie({ kind: 'boss' }),
      ] : [q.get('char') === 'zombie' ? C.createZombie({ kind: q.get('kind') || 'normal' }) : C.createSoldier({ team: q.get('team') || 'red', variant: +(q.get('variant') || 0) })];
      list.forEach((c, i) => {
        c.root.position.set(i * 1.6 - (list.length - 1) * 0.8, 0, 0);
        scene.add(c.root);
        let gun = null;
        if (q.get('gun')) import('./models/guns.js').then(G => { gun = G.buildGun(q.get('gun')); c.holdWeapon(gun, q.get('hold') || 'rifle'); });
        const anim = q.get('anim') || 'idle';
        updaters.push((dt, t) => c.update(dt, {
          speed: anim === 'run' ? 5 : anim === 'walk' ? 2 : 0, moveX: 0, moveZ: anim === 'idle' ? 0 : -1, crouch: anim === 'crouch', airborne: false,
          pitch: Math.sin(t) * 0.4, firing: anim === 'fire' && Math.floor(t * 10) % 2 === 0, reloading: anim === 'reload', alive: true,
        }));
        if (anim === 'die') setTimeout(() => c.die(new THREE.Vector3(0, 0, 1), false), 1000);
        if (anim === 'attack') setInterval(() => c.attack && c.attack(), 1200);
        if (q.get('hitbox')) {
          updaters.push(() => {
            c.__hb ||= c.getHitboxes().map(hb => { const m = new THREE.Mesh(new THREE.BoxGeometry(hb.half[0] * 2, hb.half[1] * 2, hb.half[2] * 2), new THREE.MeshBasicMaterial({ color: hb.part === 'head' ? 0xff0000 : 0x00ff00, wireframe: true })); scene.add(m); return [hb, m]; });
            for (const [hb, m] of c.__hb) { hb.bone.updateWorldMatrix(true, false); m.matrix.copy(hb.bone.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(...hb.offset)); m.matrixAutoUpdate = false; }
          });
        }
      });
      camera.position.set(0, 1.6, 4.5); controls.target.set(0, 1, 0);
      info.textContent = q.toString();
    }
  }
  controls.update();
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  for (const u of updaters) u(dt, t);
  controls.update();
  renderer.render(scene, camera);
});
main().catch(e => { info.textContent = 'ERROR: ' + e.stack; console.error(e); });
