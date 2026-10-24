// Sky, sun, hemisphere light, fog and PMREM environment for reflections.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const ENV_PRESETS = {
  day: { sunDir: [0.45, 0.8, 0.35], sunColor: 0xfff1dc, sunIntensity: 3.2, hemiSky: 0xbcd6ff, hemiGround: 0x6b5d48, hemiIntensity: 1.1, fogColor: 0xb9cde0, fogDensity: 0.0045, turbidity: 6, rayleigh: 1.6, exposure: 0.85 },
  dusk: { sunDir: [-0.7, 0.18, 0.4], sunColor: 0xffb070, sunIntensity: 2.8, hemiSky: 0x8a90b8, hemiGround: 0x4a3a30, hemiIntensity: 0.9, fogColor: 0xc89a78, fogDensity: 0.005, turbidity: 10, rayleigh: 3, exposure: 0.75 },
  desert: { sunDir: [0.3, 0.75, -0.5], sunColor: 0xffe6c0, sunIntensity: 3.6, hemiSky: 0xcfe0f5, hemiGround: 0x9a7a50, hemiIntensity: 1.2, fogColor: 0xe0d2b8, fogDensity: 0.004, turbidity: 8, rayleigh: 1.2, exposure: 0.8 },
  night: { sunDir: [0.3, 0.6, -0.4], sunColor: 0x8fa8ff, sunIntensity: 0.55, hemiSky: 0x2a3550, hemiGround: 0x15120f, hemiIntensity: 0.55, fogColor: 0x0d1118, fogDensity: 0.022, turbidity: 2, rayleigh: 0.2, exposure: 1.1, night: true },
};

export function setupEnvironment(scene, renderer, presetName = 'day', overrides = {}, bounds = 80) {
  const p = { ...ENV_PRESETS[presetName] || ENV_PRESETS.day, ...overrides };
  const objs = [];
  renderer.toneMappingExposure = p.exposure;

  const sunDir = new THREE.Vector3(...p.sunDir).normalize();
  // Sky dome
  const sky = new Sky();
  sky.scale.setScalar(4000);
  const u = sky.material.uniforms;
  u.turbidity.value = p.turbidity; u.rayleigh.value = p.rayleigh;
  u.mieCoefficient.value = 0.005; u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(sunDir);
  if (p.night) {
    // a dark sky with stars instead of the scattering dome
    scene.background = new THREE.Color(0x05070c);
    const starGeo = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < 1500; i++) {
      const v = new THREE.Vector3().randomDirection(); if (v.y < 0.05) v.y = Math.abs(v.y) + 0.05;
      pts.push(...v.multiplyScalar(1800).toArray());
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false }));
    scene.add(stars); objs.push(stars);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 16), new THREE.MeshBasicMaterial({ color: 0xdfe6ff, fog: false }));
    moon.position.copy(sunDir).multiplyScalar(1500);
    scene.add(moon); objs.push(moon);
  } else {
    scene.add(sky); objs.push(sky);
  }

  // Environment map for PBR reflections: sky for outdoor, room env blended for night
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT;
  if (p.night) {
    const room = new RoomEnvironment();
    envRT = pmrem.fromScene(room, 0.04);
    scene.environmentIntensity = 0.15;
  } else {
    const envScene = new THREE.Scene();
    const sky2 = new Sky(); sky2.scale.setScalar(1000);
    Object.assign(sky2.material.uniforms.sunPosition.value, sunDir);
    sky2.material.uniforms.turbidity.value = p.turbidity; sky2.material.uniforms.rayleigh.value = p.rayleigh;
    envScene.add(sky2);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 16), new THREE.MeshBasicMaterial({ color: p.hemiGround, side: THREE.DoubleSide }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -10; envScene.add(ground);
    envRT = pmrem.fromScene(envScene, 0);
    scene.environmentIntensity = 0.55;
  }
  scene.environment = envRT.texture;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(p.hemiSky, p.hemiGround, p.hemiIntensity);
  scene.add(hemi); objs.push(hemi);

  const sun = new THREE.DirectionalLight(p.sunColor, p.sunIntensity);
  sun.position.copy(sunDir).multiplyScalar(120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -bounds; sc.right = bounds; sc.top = bounds; sc.bottom = -bounds;
  sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun); scene.add(sun.target); objs.push(sun, sun.target);

  scene.fog = new THREE.FogExp2(p.fogColor, p.fogDensity);
  if (!p.night) scene.background = null;

  return {
    sun, hemi, preset: p,
    dispose() { for (const o of objs) scene.remove(o); envRT.dispose(); scene.environment = null; scene.fog = null; },
  };
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}
