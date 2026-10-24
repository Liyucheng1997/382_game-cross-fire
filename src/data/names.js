// Nostalgic-style bot nicknames
export const BOT_NAMES = [
  '灬丶狙神', '情义丶兄弟', '★小学生★', '°殇ゞ寂寞', 'AK信仰', '爆破专家', '丶夜猫子', '残血不退', '老六本六', '网吧战神',
  '萌新求带', '刀锋丶战士', '冷月无声', '◆火麒麟◆', '一枪一个', '天使丶之翼', '无敌の寂寞', '神枪手阿强', '曾经的少年', '不服来战',
  '烟雾弹大师', '蹲坑专业户', '别开枪是我', '丨杀手丨', '黑龙丶传说', '运输船之王', '小鬼当家', '沙鹰一点', '快乐风男', '雷霆战神',
  '丶时光', '野狼Disco', '夜空中最亮', '泡面加蛋', '逃课打CF', '闪光弹警告', '电竞少年', '刚枪不怂', '下次一定', '躺赢选手',
];

export function pickNames(n, exclude = []) {
  const pool = BOT_NAMES.filter((x) => !exclude.includes(x));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const out = pool.slice(0, n);
  while (out.length < n) out.push('玩家' + Math.floor(Math.random() * 9000 + 1000));
  return out;
}

export const BOT_LOADOUTS = [
  { primary: 'ak47', secondary: 'usp', melee: 'knife', grenade: 'he' },
  { primary: 'm4a1', secondary: 'usp', melee: 'knife', grenade: 'he' },
  { primary: 'ak47', secondary: 'deagle', melee: 'knife', grenade: 'flash' },
  { primary: 'm4a1', secondary: 'glock18', melee: 'axe', grenade: 'smoke' },
  { primary: 'awm', secondary: 'deagle', melee: 'knife', grenade: 'he' },
  { primary: 'mp5', secondary: 'usp', melee: 'knife', grenade: 'he' },
  { primary: 'an94', secondary: 'usp', melee: 'machete', grenade: 'flash' },
  { primary: 'sg552', secondary: 'glock18', melee: 'knife', grenade: 'he' },
  { primary: 'p90', secondary: 'usp', melee: 'knife', grenade: 'smoke' },
  { primary: 'm870', secondary: 'deagle', melee: 'axe', grenade: 'he' },
  { primary: 'xm1014', secondary: 'usp', melee: 'knife', grenade: 'he' },
  { primary: 'm249', secondary: 'usp', melee: 'knife', grenade: 'he' },
  { primary: 'svd', secondary: 'deagle', melee: 'knife', grenade: 'flash' },
  { primary: 'uzi', secondary: 'glock18', melee: 'knife', grenade: 'he' },
];
