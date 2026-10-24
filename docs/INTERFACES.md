# CF Web — module contracts

Browser FPS inspired by CrossFire, built with three.js 0.170 + Vite, **everything procedural** (no image/model assets).
Run `npm run dev`, open `http://localhost:5173/preview.html?...` to view models (see `src/preview.js` header for query params).

Global conventions
- Units: metres. +Y up. **Forward is -Z** for every model (guns, characters), matching the three.js camera.
- Import three as `import * as THREE from 'three'`. Use materials from `src/gfx/materials.js` (`M.gunmetal()`, `M.wood()`, ...) and
  textures from `src/gfx/textures.js`; add new ones there if needed (keep the caching pattern; textures must return `null` in Node).
- Share geometries/materials across instances (module-level caches). No per-frame allocations in `update()`.
- All meshes: `castShadow = true` (except tiny parts), `receiveShadow = true` for big parts.
- Code must import cleanly in Node (`node -e "import('./src/models/guns.js').then(m=>...)"`) — no DOM access at import time.

---------------------------------------------------------------------------------------------------
## 1. Guns — `src/models/guns.js`

```js
export const GUN_IDS = [...];                 // every id below
export function buildGun(id, { variant = 'default' } = {}) -> THREE.Group
export function buildShell(kind = 'rifle'|'pistol'|'shotgun'|'sniper') -> THREE.Mesh   // ejected casing, ~real size
export const VARIANTS = { gold: {...}, qilin: {...}, heilong: {...} }  // see below
```

Gun local frame: **origin = where the right hand grips the pistol grip** (top-back of grip, web of the hand). Bore along **-Z**, +Y up, +X right.
Real-world scale (AK-47 ≈ 0.88 m overall).

`group.userData` must contain:
- `anchors`: `{ muzzle, eject, rightHand, leftHand, scopeEye? }` — each an `Object3D` child placed at the point.
  `rightHand`/`leftHand` orientation = how the hand should be oriented (hand's local -Z points along fingers wrapping direction is NOT required;
  just: hand palm faces the grip, use anchor quaternion as the hand's rotation, with the hand's "forward" = gun -Z).
  `leftHand` sits on the handguard / foregrip / pump (for pistols: supporting under the grip; for knives/grenades: null).
  `scopeEye` (scoped weapons only): the point the camera should sit at when scoped, looking down -Z through the scope.
- `parts`: named moving `Object3D`s used by animations: `mag` (required for magazine weapons; its own group so it can be pulled out),
  optional `bolt` / `slide` / `pump` / `charging` / `hammer` / `trigger` / `drum` / `beltCover`, `blade` for melee, `pin`/`lever` for grenades.
- `kind`: 'rifle'|'smg'|'sniper'|'shotgun'|'mg'|'pistol'|'melee'|'grenade'
- `length`: overall length in metres.

Ids (CF-familiar arsenal):
- Rifles: `ak47` (wood furniture, curved steel mag, ribbed dust cover, gas tube), `m4a1` (flat-top rail + red-dot/holo, A2 front sight, quad-rail or ribbed handguard,
  collapsible stock, optional suppressor part `parts.suppressor` visible by default — CF's M4A1 iconic silencer), `an94`, `sg552` (with integrated scope, scopeEye).
- SMGs: `mp5` (curved mag, slim handguard, drum rear sight, retractable stock), `uzi`, `p90` (bullpup, top-mounted translucent mag).
- Snipers: `awm` (olive green thumbhole stock, fluted barrel, muzzle brake, big scope, bolt handle), `m82a1` (Barrett: huge muzzle brake, box mag, carry handle, bipod),
  `svd` (Dragunov: skeleton wood stock, PSO scope).
- Shotguns: `m870` (pump, tube mag), `xm1014` (semi-auto, ghost ring sights, collapsible stock).
- MG: `m249` (box mag + belt, bipod, carry handle, heat shield).
- Pistols: `deagle` (Desert Eagle: triangular barrel, big slide), `usp`, `glock18`.
- Melee: `knife` (CF 军刀: clip-point blade with fuller and serrations, rubberised grip), `axe` (CF 斧头: tactical tomahawk), `machete` (马来剑-ish).
- Grenades: `he` (高爆手雷: M67-style sphere, spoon, pin ring), `flash` (闪光弹: cylinder), `smoke` (烟雾弹: cylinder with green band).

Detail target: this is the #1 thing the player stares at. Use `ExtrudeGeometry` from `THREE.Shape` side profiles with small bevels for receivers/stocks/grips/mags/blades,
`LatheGeometry` for barrels/suppressors/muzzle devices/scope tubes, many small parts (pins, screws, rail teeth, sights, selector, trigger guard, sling swivels, vent holes as
dark inset boxes, serrations). 30–120 meshes per gun is fine. Lens = `M.lens()`. Merge is not required.

Variants (applied by `buildGun(id, {variant})` to any gun):
- `default`
- `gold` — metal parts gold (`M.gold()`), furniture black.
- `qilin` (火麒麟) — receiver/furniture crimson lacquer (`M.crimson()`), gold trim/edges, add a few ornamental gold flame/scale fins along the handguard and stock, glowing red gem.
- `heilong` (黑龙) — piano black (`M.obsidian()`) + gold dragon accents + glowing cyan inlay strips (`M.glowCyan()`).

### Viewmodel arms — `src/models/viewarms.js`

```js
export class ViewArms {
  constructor({ style = 'red'|'blue'|'zombie'|'hero' })
  object3d: THREE.Group           // add to the view camera; positioned in camera space by caller
  attach(gunGroup)                // parents gun under object3d (caller positions gun), hands snap to gun anchors
  update()                        // re-solve arm poses each frame (after the caller moves the gun / its parts)
  setGrip(name)                   // 'rifle'|'pistol'|'knife'|'grenade'|'none' — finger curl preset
}
export function buildZombieClaws(kind) -> { left: THREE.Group, right: THREE.Group }  // first-person zombie arms, origin at wrist, claws toward -Z
```
Arms: gloved hands with fingers (segments) wrapped around grips, forearm with sleeve rolled/cuffed, wristwatch or wrist pad detail; elbows live off-screen
(right shoulder approx camera-space (0.22,-0.32,0.25), left (-0.22,-0.32,0.25)); forearms run from elbow to the hand anchors (simple 2-bone IK or look-at).
Style colours: red = dark brown/black sleeve, tan gloves; blue = navy sleeve, black gloves; hero = gold/black armour gauntlets.

---------------------------------------------------------------------------------------------------
## 2. Characters — `src/models/characters.js`

```js
export function createSoldier({ team = 'red'|'blue', variant = 0..3 }) -> CharacterModel
export function createZombie({ kind = 'normal'|'host'|'fast'|'heavy'|'exploder'|'boss', seed }) -> CharacterModel
```
`CharacterModel`:
- `root: THREE.Group` — origin at feet centre, facing -Z. Caller sets `root.position` / `root.rotation.y` (yaw).
- `height`, `eyeHeight`, `radius`, `kind`, `isZombie`.
- `holdWeapon(gunGroup | null, hold = 'rifle'|'pistol'|'melee'|'grenade'|'none')` — attaches the gun to the right hand / aim pivot; solve both arms with
  analytic 2-bone IK to `gun.userData.anchors.rightHand` / `leftHand` (leftHand null → left arm relaxed or on pistol grip).
- `update(dt, s)` where `s = { speed, moveX, moveZ, crouch, airborne, pitch, firing, reloading, alive }`
  (speed m/s; moveX/moveZ local move direction −1..1, -Z = forward; pitch = aim pitch radians, + up; firing = true on frames a shot fires).
  Procedural animation: idle breathing, walk/run cycles scaled by speed (feet must not slide badly), strafe, crouch pose (crouched height ≈ 1.2 m),
  jump pose when airborne, spine/arms follow pitch, recoil kick when firing, reload gesture, zombie lurch/hunch & arm sway.
- `die(hitDirWorld: Vector3, headshot: bool)` — procedural death fall (≈1 s, pivot down, rest on ground), `reset()` back to alive pose.
- `attack()` (zombies: claw swipe ~0.4 s; soldiers: knife slash), `flinch(dirWorld)` small hit reaction.
- `getHitboxes()` → array of `{ part: 'head'|'chest'|'stomach'|'arm'|'leg', bone: Object3D, half:[hx,hy,hz], offset:[ox,oy,oz] }` — oriented boxes in bone local
  space that follow the animation (head, torso, pelvis, upper/lower arms & legs). Caller ray-tests them with `bone.matrixWorld`.
- `setHighlight(color|null)` optional (e.g. hero glow), `dispose()`.

Proportions: soldiers 1.80 m tall, eye 1.65 m. Zombies: normal 1.85 hunched, fast 1.75 lean, host (母体) 2.05 bulky with exposed ribs/spikes,
heavy 2.4 fat brute, exploder 1.7 with glowing pustules, boss 4.0 giant mutant. Soldiers: helmet/beret/cap per variant, goggles, balaclava or face,
plate carrier vest with mag pouches, radio, knee pads, boots, holster, team armband (`M.teamRed()`/`M.teamBlue()`).
潜伏者 (red) = darker mercenary look; 保卫者 (blue) = SWAT/special-forces navy look. Zombies: torn clothes, exposed flesh, glowing eyes, claws.
Budget: ≤ 90 meshes per character; share geometries.

---------------------------------------------------------------------------------------------------
## 3. Maps — `src/maps/<id>.js`

```js
export default {
  id, name, desc,
  modes: ['tdm','ffa','bomb','zombie','challenge'],     // which modes it supports
  env: { preset: 'day'|'dusk'|'desert'|'night', ...overrides },  // see src/gfx/env.js
  size: 90,                                              // half-extent used for the shadow camera
  build(mb) -> {
    spawns: { red: [[x,y,z,yaw],...], blue: [...], ffa: [...], zombie: [...] },   // ≥8 each; yaw radians (0 = facing -Z)
    sites?: { A: { center:[x,y,z], radius }, B: {...} },                         // bomb mode only
    bounds: [minX, minZ, maxX, maxZ],                                             // playable area (nav grid extent)
    killY: -3,                                                                    // below this = dead (fell in water)
    hotspots?: [[x,y,z],...],                                                     // interesting places bots roam to / defend (zombie mode camping spots)
  }
}
```
`mb` is a `MapBuilder` (`src/world/mapkit.js`): `box`, `boxMM`, `ramp`, `stairs`, `cylinder`, `container`, `crate`, `barrel`, `railing`, `lamp`,
`sign`, `water`, `ground`, `collider`, `addGeo`, `addObject`, `mergeGroup`. Everything placed through it is merged per material in `finalize()` (called by the engine).

Collision / navigation rules (important):
- Colliders are axis-aligned boxes and axis-aligned ramps only. Rotated visuals are fine but their collider is the AABB.
- Movement steps up ≤ 0.45 m automatically; use `stairs()`/`ramp()` for anything higher. Jump height ≈ 1.1 m (crates 1 m tall are jump-up-able).
- **Nav is 2.5D**: bots path on the highest walkable surface of each x/z column. Never put a walkable floor under another walkable floor.
  Roofs / canopies / lintels hanging over walkable ground must use `nav:false` (`mb.box(..., {nav:false})`, `mb.collider(min,max,mat,{nav:false})`).
- Enclose the playable area with invisible colliders or walls so nobody leaves the map; deck edges need railings (or killY water).
- Collider `mat` ('metal'|'wood'|'concrete'|'sand'|'glass') drives impact effects & footstep sounds.
- Performance: < 3000 merged meshes before finalize is fine; ≤ 8 point lights (`mb.lamp`).
