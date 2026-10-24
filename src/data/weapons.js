// Weapon stats. Damage values tuned for 100 HP humans; zombies have thousands of HP and get knocked back.
// rpm = rounds per minute, spread in degrees, recoil in degrees per shot, range = metres before damage falloff starts.

export const SLOTS = { primary: 1, secondary: 2, melee: 3, grenade: 4 };

const W = {
  // ---------------- rifles ----------------
  ak47: {
    name: 'AK-47', cat: 'rifle', slot: 'primary', price: 0, auto: true, rpm: 600, damage: 36, head: 4, mag: 30, reserve: 90, reload: 2.4,
    spread: 0.35, moveSpread: 3.2, jumpSpread: 8, crouchMul: 0.7, recoilV: 0.85, recoilH: 0.35, recoilRecover: 7, range: 45, falloff: 0.75,
    speed: 0.92, knockback: 7, sound: 'ak', shell: 'rifle', desc: '威力巨大的经典步枪，压枪是基本功。',
  },
  m4a1: {
    name: 'M4A1-S', cat: 'rifle', slot: 'primary', price: 0, auto: true, rpm: 700, damage: 31, head: 4, mag: 30, reserve: 90, reload: 2.2,
    spread: 0.28, moveSpread: 2.8, jumpSpread: 7, crouchMul: 0.7, recoilV: 0.62, recoilH: 0.25, recoilRecover: 8, range: 45, falloff: 0.78,
    speed: 0.94, knockback: 6, sound: 'm4s', shell: 'rifle', desc: '加装消音器的精准步枪，射速快、后坐小。',
  },
  an94: {
    name: 'AN-94', cat: 'rifle', slot: 'primary', price: 3200, auto: true, rpm: 650, damage: 33, head: 4, mag: 30, reserve: 90, reload: 2.5,
    spread: 0.25, moveSpread: 3, jumpSpread: 7, crouchMul: 0.65, recoilV: 0.55, recoilH: 0.2, recoilRecover: 8, range: 50, falloff: 0.8,
    speed: 0.92, knockback: 6.5, sound: 'ak', shell: 'rifle', desc: '俄制精确步枪，首发极稳。',
  },
  sg552: {
    name: 'SG552', cat: 'rifle', slot: 'primary', price: 3800, auto: true, rpm: 680, damage: 32, head: 4, mag: 30, reserve: 90, reload: 2.6,
    spread: 0.3, moveSpread: 3, jumpSpread: 7, crouchMul: 0.7, recoilV: 0.6, recoilH: 0.25, recoilRecover: 8, range: 55, falloff: 0.8,
    speed: 0.9, knockback: 6, sound: 'rifle', shell: 'rifle', zoom: [1.8], zoomSpreadMul: 0.4, desc: '带倍镜的突击步枪，右键开镜。',
  },
  // ---------------- SMGs ----------------
  mp5: {
    name: 'MP5', cat: 'smg', slot: 'primary', price: 1800, auto: true, rpm: 800, damage: 24, head: 3.5, mag: 30, reserve: 120, reload: 2.1,
    spread: 0.45, moveSpread: 1.6, jumpSpread: 5, crouchMul: 0.75, recoilV: 0.35, recoilH: 0.2, recoilRecover: 10, range: 25, falloff: 0.65,
    speed: 1.0, knockback: 4, sound: 'smg', shell: 'pistol', desc: '移动射击稳定的冲锋枪。',
  },
  uzi: {
    name: 'UZI', cat: 'smg', slot: 'primary', price: 1500, auto: true, rpm: 950, damage: 21, head: 3.2, mag: 32, reserve: 128, reload: 2.0,
    spread: 0.7, moveSpread: 1.8, jumpSpread: 5, crouchMul: 0.75, recoilV: 0.4, recoilH: 0.35, recoilRecover: 10, range: 18, falloff: 0.6,
    speed: 1.02, knockback: 3.5, sound: 'smg', shell: 'pistol', desc: '射速惊人的近战利器。',
  },
  p90: {
    name: 'P90', cat: 'smg', slot: 'primary', price: 2600, auto: true, rpm: 900, damage: 23, head: 3.4, mag: 50, reserve: 150, reload: 2.8,
    spread: 0.5, moveSpread: 1.6, jumpSpread: 5, crouchMul: 0.75, recoilV: 0.3, recoilH: 0.22, recoilRecover: 10, range: 25, falloff: 0.65,
    speed: 1.0, knockback: 4, sound: 'smg', shell: 'pistol', desc: '50发大弹匣，扫射无忧。',
  },
  // ---------------- snipers ----------------
  awm: {
    name: 'AWM', cat: 'sniper', slot: 'primary', price: 0, auto: false, bolt: true, rpm: 40, damage: 115, head: 2.5, mag: 10, reserve: 30, reload: 3.4,
    spread: 0.05, unscopedSpread: 6, moveSpread: 6, jumpSpread: 14, crouchMul: 0.8, recoilV: 4, recoilH: 0.5, recoilRecover: 4, range: 300, falloff: 1,
    speed: 0.82, knockback: 40, sound: 'awm', shell: 'sniper', zoom: [3, 8], desc: '一枪一个，狙击之王。',
  },
  m82a1: {
    name: '巴雷特 M82A1', cat: 'sniper', slot: 'primary', price: 4800, auto: false, rpm: 100, damage: 95, head: 2.5, mag: 10, reserve: 30, reload: 3.8,
    spread: 0.08, unscopedSpread: 7, moveSpread: 7, jumpSpread: 15, crouchMul: 0.8, recoilV: 5, recoilH: 0.8, recoilRecover: 4, range: 300, falloff: 1,
    speed: 0.78, knockback: 50, sound: 'barrett', shell: 'sniper', zoom: [3, 8], desc: '半自动反器材狙击枪，穿透力极强。',
  },
  svd: {
    name: 'SVD', cat: 'sniper', slot: 'primary', price: 3000, auto: false, rpm: 220, damage: 70, head: 3, mag: 10, reserve: 30, reload: 3.0,
    spread: 0.1, unscopedSpread: 5, moveSpread: 5, jumpSpread: 12, crouchMul: 0.8, recoilV: 2.6, recoilH: 0.5, recoilRecover: 5, range: 150, falloff: 0.9,
    speed: 0.85, knockback: 20, sound: 'svd', shell: 'rifle', zoom: [2.5, 6], desc: '连狙，点射节奏感强。',
  },
  // ---------------- shotguns ----------------
  m870: {
    name: 'M870', cat: 'shotgun', slot: 'primary', price: 1600, auto: false, pump: true, rpm: 70, damage: 16, pellets: 9, head: 2, mag: 8, reserve: 32, reload: 0.5, shellReload: true,
    spread: 4.5, moveSpread: 1, jumpSpread: 2, crouchMul: 0.9, recoilV: 4, recoilH: 1, recoilRecover: 6, range: 10, falloff: 0.35,
    speed: 0.92, knockback: 9, sound: 'shotgun', shell: 'shotgun', desc: '泵动霰弹枪，近距离一击毙命。',
  },
  xm1014: {
    name: 'XM1014', cat: 'shotgun', slot: 'primary', price: 3400, auto: false, rpm: 240, damage: 13, pellets: 8, head: 2, mag: 7, reserve: 35, reload: 0.45, shellReload: true,
    spread: 5, moveSpread: 1, jumpSpread: 2, crouchMul: 0.9, recoilV: 3, recoilH: 1, recoilRecover: 6, range: 10, falloff: 0.35,
    speed: 0.9, knockback: 8, sound: 'shotgun', shell: 'shotgun', desc: '半自动霰弹枪，生化模式的守点神器。',
  },
  // ---------------- MG ----------------
  m249: {
    name: 'M249', cat: 'mg', slot: 'primary', price: 4200, auto: true, rpm: 750, damage: 30, head: 3.5, mag: 100, reserve: 200, reload: 4.8,
    spread: 0.6, moveSpread: 4.5, jumpSpread: 9, crouchMul: 0.55, recoilV: 0.55, recoilH: 0.4, recoilRecover: 7, range: 40, falloff: 0.75,
    speed: 0.8, knockback: 8, sound: 'mg', shell: 'rifle', desc: '百发弹链机枪，火力压制。',
  },
  // ---------------- pistols ----------------
  deagle: {
    name: '沙漠之鹰', cat: 'pistol', slot: 'secondary', price: 1200, auto: false, rpm: 240, damage: 55, head: 3.5, mag: 7, reserve: 35, reload: 2.0,
    spread: 0.4, moveSpread: 2.5, jumpSpread: 6, crouchMul: 0.8, recoilV: 3.2, recoilH: 0.8, recoilRecover: 6, range: 35, falloff: 0.7,
    speed: 1.0, knockback: 10, sound: 'deagle', shell: 'pistol', desc: '手枪中的王者，爆头一击毙命。',
  },
  usp: {
    name: 'USP', cat: 'pistol', slot: 'secondary', price: 0, auto: false, rpm: 380, damage: 30, head: 4, mag: 12, reserve: 48, reload: 1.8,
    spread: 0.35, moveSpread: 1.6, jumpSpread: 5, crouchMul: 0.8, recoilV: 1.4, recoilH: 0.4, recoilRecover: 8, range: 25, falloff: 0.65,
    speed: 1.0, knockback: 4, sound: 'pistol', shell: 'pistol', desc: '精准可靠的标准手枪。',
  },
  glock18: {
    name: 'Glock-18', cat: 'pistol', slot: 'secondary', price: 600, auto: true, rpm: 1100, damage: 20, head: 3.5, mag: 20, reserve: 80, reload: 1.8,
    spread: 0.6, moveSpread: 1.6, jumpSpread: 5, crouchMul: 0.8, recoilV: 0.8, recoilH: 0.45, recoilRecover: 9, range: 18, falloff: 0.6,
    speed: 1.0, knockback: 3, sound: 'pistol', shell: 'pistol', desc: '全自动手枪，近距离泼水。',
  },
  // ---------------- melee ----------------
  knife: {
    name: '军刀', cat: 'melee', slot: 'melee', price: 0, damage: 45, heavyDamage: 95, head: 1.5, rate: 0.45, heavyRate: 1.1, reach: 1.9, heavyReach: 1.5,
    speed: 1.08, knockback: 3, desc: '左键轻砍，右键重刺。',
  },
  axe: {
    name: '斧头', cat: 'melee', slot: 'melee', price: 1500, damage: 60, heavyDamage: 130, head: 1.5, rate: 0.65, heavyRate: 1.3, reach: 2.0, heavyReach: 1.8,
    speed: 1.04, knockback: 6, desc: '重型近战，生化模式砍僵尸神器。',
  },
  machete: {
    name: '马来剑', cat: 'melee', slot: 'melee', price: 2200, damage: 55, heavyDamage: 110, head: 1.5, rate: 0.5, heavyRate: 1.1, reach: 2.3, heavyReach: 2.0,
    speed: 1.06, knockback: 5, desc: '攻击距离长的弯刀。',
  },
  // ---------------- grenades ----------------
  he: { name: '高爆手雷', cat: 'grenade', slot: 'grenade', price: 0, damage: 120, radius: 7, count: 1, fuse: 2.2, speed: 1.0, knockback: 30, desc: '范围爆炸伤害。' },
  flash: { name: '闪光弹', cat: 'grenade', slot: 'grenade', price: 300, damage: 0, radius: 20, count: 2, fuse: 1.6, speed: 1.0, desc: '致盲敌人。' },
  smoke: { name: '烟雾弹', cat: 'grenade', slot: 'grenade', price: 300, damage: 0, radius: 6, count: 1, fuse: 1.8, speed: 1.0, desc: '制造烟雾掩护。' },
};

// Special skins: model variant + stat boost. Obtained from chests in the zombie challenge mode.
export const SKINS = {
  'ak47-qilin': { base: 'ak47', variant: 'qilin', name: 'AK47-火麒麟', boost: { damage: 1.1, knockback: 1.5, mag: 40 }, rarity: 'legend' },
  'm4a1-heilong': { base: 'm4a1', variant: 'heilong', name: 'M4A1-黑龙', boost: { damage: 1.08, rpm: 1.08, mag: 40 }, rarity: 'legend' },
  'awm-gold': { base: 'awm', variant: 'gold', name: 'AWM-黄金', boost: { damage: 1.1 }, rarity: 'epic' },
  'deagle-qilin': { base: 'deagle', variant: 'qilin', name: '沙鹰-火麒麟', boost: { damage: 1.15, mag: 9 }, rarity: 'epic' },
  'm82a1-heilong': { base: 'm82a1', variant: 'heilong', name: '巴雷特-黑龙', boost: { damage: 1.1, knockback: 1.5 }, rarity: 'legend' },
  'ak47-gold': { base: 'ak47', variant: 'gold', name: 'AK47-黄金', boost: { damage: 1.05 }, rarity: 'rare' },
  'm4a1-gold': { base: 'm4a1', variant: 'gold', name: 'M4A1-黄金', boost: { damage: 1.05 }, rarity: 'rare' },
  'xm1014-gold': { base: 'xm1014', variant: 'gold', name: 'XM1014-黄金', boost: { damage: 1.1, knockback: 1.3 }, rarity: 'rare' },
  'm249-qilin': { base: 'm249', variant: 'qilin', name: 'M249-火麒麟', boost: { damage: 1.1, knockback: 1.4, mag: 150 }, rarity: 'legend' },
  'axe-gold': { base: 'axe', variant: 'gold', name: '黄金斧头', boost: { damage: 1.2 }, rarity: 'rare' },
};

export const RARITY = {
  common: { name: '普通', color: '#c8c8c8' },
  rare: { name: '稀有', color: '#4aa3ff' },
  epic: { name: '史诗', color: '#c86bff' },
  legend: { name: '传说', color: '#ffb020' },
};

// Resolve a loadout id (base id or skin id) into full stats
export function weaponDef(id) {
  if (W[id]) return { id, base: id, variant: 'default', ...W[id] };
  const s = SKINS[id];
  if (!s) return null;
  const b = W[s.base];
  const d = { ...b, id, base: s.base, variant: s.variant, name: s.name, skin: true, rarity: s.rarity };
  const bo = s.boost || {};
  if (bo.damage) { d.damage = Math.round(d.damage * bo.damage); if (d.heavyDamage) d.heavyDamage = Math.round(d.heavyDamage * bo.damage); }
  if (bo.rpm) d.rpm = d.rpm * bo.rpm;
  if (bo.mag) { d.mag = bo.mag; d.reserve = bo.mag * 3; }
  if (bo.knockback) d.knockback = (d.knockback || 0) * bo.knockback;
  return d;
}

export const WEAPONS = W;
export const PRIMARY_IDS = Object.keys(W).filter((k) => W[k].slot === 'primary');
export const SECONDARY_IDS = Object.keys(W).filter((k) => W[k].slot === 'secondary');
export const MELEE_IDS = Object.keys(W).filter((k) => W[k].slot === 'melee');
export const GRENADE_IDS = Object.keys(W).filter((k) => W[k].slot === 'grenade');
export const CAT_NAMES = { rifle: '步枪', smg: '冲锋枪', sniper: '狙击枪', shotgun: '霰弹枪', mg: '机枪', pistol: '手枪', melee: '近身武器', grenade: '投掷武器' };
