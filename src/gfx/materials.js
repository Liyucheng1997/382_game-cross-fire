// Shared, cached PBR materials. Maps, guns and characters should pull from here so the look stays coherent.
import * as THREE from 'three';
import * as T from './textures.js';

const cache = new Map();
function mat(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

// Clone a texture with its own repeat so materials can tile differently from the cached source
export function tiled(tex, rx, ry) {
  if (!tex) return null;
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

export const M = {
  // ---------- weapon materials ----------
  gunmetal: () => mat('gunmetal', () => new THREE.MeshStandardMaterial({
    color: 0xffffff, map: T.gunmetal(81, '#2a2c2f'), metalness: 0.85, roughness: 0.38,
    roughnessMap: T.noiseRoughness(12, 0.45, 0.2), normalMap: T.microNormal(13, 0.6), normalScale: new THREE.Vector2(0.3, 0.3),
  })),
  steelBright: () => mat('steelBright', () => new THREE.MeshStandardMaterial({
    color: 0x9aa0a6, metalness: 1, roughness: 0.22, roughnessMap: T.noiseRoughness(14, 0.3, 0.15),
  })),
  blued: () => mat('blued', () => new THREE.MeshStandardMaterial({
    color: 0x1d2228, metalness: 0.9, roughness: 0.3, roughnessMap: T.noiseRoughness(15, 0.35, 0.15),
  })),
  polymer: () => mat('polymer', () => new THREE.MeshStandardMaterial({
    color: 0x1b1c1e, metalness: 0.05, roughness: 0.62, normalMap: T.microNormal(16, 1.2), normalScale: new THREE.Vector2(0.5, 0.5),
  })),
  polymerTan: () => mat('polymerTan', () => new THREE.MeshStandardMaterial({
    color: 0x8f7b5a, metalness: 0.05, roughness: 0.65, normalMap: T.microNormal(17, 1.2), normalScale: new THREE.Vector2(0.5, 0.5),
  })),
  polymerOD: () => mat('polymerOD', () => new THREE.MeshStandardMaterial({
    color: 0x4a5236, metalness: 0.05, roughness: 0.6, normalMap: T.microNormal(18, 1.2), normalScale: new THREE.Vector2(0.5, 0.5),
  })),
  rubber: () => mat('rubber', () => new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0, roughness: 0.9 })),
  wood: () => mat('wood', () => new THREE.MeshStandardMaterial({
    color: 0xffffff, map: T.woodStock(91, '#7a3a17'), metalness: 0, roughness: 0.45, roughnessMap: T.noiseRoughness(19, 0.45, 0.2),
  })),
  brass: () => mat('brass', () => new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.28 })),
  copper: () => mat('copper', () => new THREE.MeshStandardMaterial({ color: 0xb06a3a, metalness: 1, roughness: 0.3 })),
  gold: () => mat('gold', () => new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 1, roughness: 0.18, roughnessMap: T.noiseRoughness(20, 0.2, 0.1) })),
  // 火麒麟 style: deep red lacquer with gold trim
  crimson: () => mat('crimson', () => new THREE.MeshPhysicalMaterial({ color: 0x9b0d0d, metalness: 0.4, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 })),
  // 黑龙 style: piano black with glossy clearcoat
  obsidian: () => mat('obsidian', () => new THREE.MeshPhysicalMaterial({ color: 0x08080a, metalness: 0.6, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 })),
  glowRed: () => mat('glowRed', () => new THREE.MeshStandardMaterial({ color: 0xff3010, emissive: 0xff2000, emissiveIntensity: 2.5 })),
  glowGreen: () => mat('glowGreen', () => new THREE.MeshStandardMaterial({ color: 0x30ff60, emissive: 0x20ff40, emissiveIntensity: 2 })),
  glowCyan: () => mat('glowCyan', () => new THREE.MeshStandardMaterial({ color: 0x40e0ff, emissive: 0x20c0ff, emissiveIntensity: 2.2 })),
  lens: () => mat('lens', () => new THREE.MeshPhysicalMaterial({
    color: 0x2a4a6a, metalness: 0.2, roughness: 0.02, transmission: 0, clearcoat: 1, clearcoatRoughness: 0, iridescence: 0.6, envMapIntensity: 2,
  })),
  bladeSteel: () => mat('blade', () => new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 1, roughness: 0.15, roughnessMap: T.noiseRoughness(22, 0.18, 0.12) })),

  // ---------- character materials ----------
  skin: () => mat('skin', () => new THREE.MeshStandardMaterial({ color: 0xd9a782, roughness: 0.62, metalness: 0 })),
  skinDark: () => mat('skinDark', () => new THREE.MeshStandardMaterial({ color: 0x8d5a3b, roughness: 0.62, metalness: 0 })),
  glove: () => mat('glove', () => new THREE.MeshStandardMaterial({ color: 0x23211e, roughness: 0.8, normalMap: T.fabricNormal(), normalScale: new THREE.Vector2(0.6, 0.6) })),
  gloveTan: () => mat('gloveTan', () => new THREE.MeshStandardMaterial({ color: 0x7a6548, roughness: 0.85, normalMap: T.fabricNormal(), normalScale: new THREE.Vector2(0.6, 0.6) })),
  // team uniforms: red = 潜伏者 (desert/urban dark), blue = 保卫者 (navy/woodland)
  uniformRed: () => mat('uniformRed', () => new THREE.MeshStandardMaterial({
    map: T.camo(['#3b3a36', '#55524a', '#26241f', '#6e3a2c'], 201), roughness: 0.9, normalMap: T.fabricNormal(), normalScale: new THREE.Vector2(0.7, 0.7),
  })),
  uniformBlue: () => mat('uniformBlue', () => new THREE.MeshStandardMaterial({
    map: T.camo(['#2c3a4f', '#3e5068', '#1e2633', '#55657a'], 202), roughness: 0.9, normalMap: T.fabricNormal(), normalScale: new THREE.Vector2(0.7, 0.7),
  })),
  vestRed: () => mat('vestRed', () => new THREE.MeshStandardMaterial({ color: 0x2b2924, roughness: 0.85, normalMap: T.fabricNormal(), normalScale: new THREE.Vector2(1, 1) })),
  vestBlue: () => mat('vestBlue', () => new THREE.MeshStandardMaterial({ color: 0x1f2a38, roughness: 0.85, normalMap: T.fabricNormal(), normalScale: new THREE.Vector2(1, 1) })),
  teamRed: () => mat('teamRed', () => new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.6 })),
  teamBlue: () => mat('teamBlue', () => new THREE.MeshStandardMaterial({ color: 0x1f5fbf, roughness: 0.6 })),
  boot: () => mat('boot', () => new THREE.MeshStandardMaterial({ color: 0x1a1714, roughness: 0.7 })),
  helmet: () => mat('helmet', () => new THREE.MeshStandardMaterial({ color: 0x3c4232, roughness: 0.7, normalMap: T.microNormal(23, 1.5), normalScale: new THREE.Vector2(0.5, 0.5) })),
  helmetBlack: () => mat('helmetBlack', () => new THREE.MeshStandardMaterial({ color: 0x1e1f21, roughness: 0.55 })),
  goggles: () => mat('goggles', () => new THREE.MeshPhysicalMaterial({ color: 0x111111, metalness: 0.3, roughness: 0.05, clearcoat: 1, iridescence: 0.5 })),
  zombieSkin: () => mat('zskin', () => new THREE.MeshStandardMaterial({ map: T.zombieSkin(111, '#7d8f6a'), roughness: 0.75, normalMap: T.microNormal(24, 2.5), normalScale: new THREE.Vector2(0.8, 0.8) })),
  zombieSkinRed: () => mat('zskinR', () => new THREE.MeshStandardMaterial({ map: T.zombieSkin(112, '#9a5a4e'), roughness: 0.7, normalMap: T.microNormal(25, 2.5), normalScale: new THREE.Vector2(0.8, 0.8) })),
  zombieSkinGrey: () => mat('zskinG', () => new THREE.MeshStandardMaterial({ map: T.zombieSkin(113, '#7a7a80'), roughness: 0.75, normalMap: T.microNormal(26, 2.5), normalScale: new THREE.Vector2(0.8, 0.8) })),
  gore: () => mat('gore', () => new THREE.MeshPhysicalMaterial({ color: 0x5a0606, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 })),
  bone: () => mat('bone', () => new THREE.MeshStandardMaterial({ color: 0xd8cfb0, roughness: 0.6 })),
  rag: () => mat('rag', () => new THREE.MeshStandardMaterial({ color: 0x4a4236, roughness: 0.95, normalMap: T.fabricNormal() })),
  eyeGlowRed: () => mat('eyeGlowRed', () => new THREE.MeshStandardMaterial({ color: 0xff2200, emissive: 0xff1100, emissiveIntensity: 4 })),
  eyeGlowYellow: () => mat('eyeGlowY', () => new THREE.MeshStandardMaterial({ color: 0xffdd00, emissive: 0xffcc00, emissiveIntensity: 4 })),

  // ---------- environment materials ----------
  container: (color = '#2f5d8a', seed = 3) => mat(`cont${color}${seed}`, () => new THREE.MeshStandardMaterial({
    map: T.paintedMetal(color, seed, 0.6), normalMap: T.corrugatedNormal(14), normalScale: new THREE.Vector2(1.4, 1.4),
    metalness: 0.55, roughness: 0.62, roughnessMap: T.noiseRoughness(seed + 30, 0.6, 0.2),
  })),
  hull: (color = '#3a3f45') => mat(`hull${color}`, () => new THREE.MeshStandardMaterial({
    map: T.paintedMetal(color, 9, 0.8), metalness: 0.5, roughness: 0.6, normalMap: T.microNormal(27, 1), normalScale: new THREE.Vector2(0.4, 0.4),
  })),
  paintedSteel: (color = '#6e7276', rust = 0.4) => mat(`ps${color}${rust}`, () => new THREE.MeshStandardMaterial({
    map: T.paintedMetal(color, 17, rust), metalness: 0.45, roughness: 0.6,
  })),
  deckPlate: () => mat('deckPlate', () => new THREE.MeshStandardMaterial({ map: T.diamondPlate(61), metalness: 0.7, roughness: 0.45 })),
  deckWood: () => mat('deckWood', () => new THREE.MeshStandardMaterial({ map: T.planks(52, '#7d6243', 8), roughness: 0.8 })),
  crate: () => mat('crate', () => new THREE.MeshStandardMaterial({ map: T.planks(53, '#9a7a4a', 5), roughness: 0.82 })),
  concrete: (tint = '#8d8a84') => mat(`conc${tint}`, () => new THREE.MeshStandardMaterial({ map: T.concrete(21, tint), roughness: 0.92, normalMap: T.microNormal(28, 2), normalScale: new THREE.Vector2(0.6, 0.6) })),
  plaster: (tint = '#cdb48a') => mat(`pl${tint}`, () => new THREE.MeshStandardMaterial({ map: T.plaster(31, tint), roughness: 0.95, normalMap: T.microNormal(29, 2.5), normalScale: new THREE.Vector2(0.7, 0.7) })),
  sand: () => mat('sand', () => new THREE.MeshStandardMaterial({ map: T.sand(41), roughness: 1, normalMap: T.microNormal(30, 3), normalScale: new THREE.Vector2(0.8, 0.8) })),
  brick: (tint = '#7a3b2a') => mat(`brick${tint}`, () => new THREE.MeshStandardMaterial({ map: T.brick(71, tint), roughness: 0.9, normalMap: T.brickNormal(), normalScale: new THREE.Vector2(1, 1) })),
  hazard: () => mat('hazard', () => new THREE.MeshStandardMaterial({ map: T.hazard(), roughness: 0.7, metalness: 0.2 })),
  rust: () => mat('rust', () => new THREE.MeshStandardMaterial({ map: T.paintedMetal('#6a3a1e', 41, 1), roughness: 0.9, metalness: 0.3 })),
  glass: () => mat('glass', () => new THREE.MeshPhysicalMaterial({ color: 0x9fc4d8, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.35, envMapIntensity: 1.5 })),
  rope: () => mat('rope', () => new THREE.MeshStandardMaterial({ color: 0x8f7a55, roughness: 1 })),
  lampOn: () => mat('lampOn', () => new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffdd99, emissiveIntensity: 3 })),
  lampRed: () => mat('lampRed', () => new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff1111, emissiveIntensity: 3 })),
  black: () => mat('black', () => new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.8 })),
  white: () => mat('white', () => new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 })),
  foliage: () => mat('foliage', () => new THREE.MeshStandardMaterial({ color: 0x3f5a2a, roughness: 0.9 })),
  asphalt: () => mat('asphalt', () => new THREE.MeshStandardMaterial({ map: T.concrete(33, '#45464a'), roughness: 0.95 })),
};

// Simple colour material helper for one-off parts
export function solid(color, { metalness = 0, roughness = 0.7, emissive = 0, emissiveIntensity = 1 } = {}) {
  return mat(`solid${color}${metalness}${roughness}${emissive}${emissiveIntensity}`, () =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity }));
}
