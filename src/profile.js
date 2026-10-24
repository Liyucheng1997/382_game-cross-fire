// Persistent player profile in localStorage (GP, EXP, owned weapons, loadout, settings, stats)
const KEY = 'cfweb_profile_v1';

export const RANKS = [
  ['新兵', 0], ['列兵', 300], ['下士', 900], ['中士', 2000], ['上士', 3800], ['准尉', 6500], ['少尉', 10000], ['中尉', 15000],
  ['上尉', 22000], ['少校', 32000], ['中校', 45000], ['上校', 62000], ['大校', 85000], ['少将', 115000], ['中将', 150000], ['上将', 200000], ['元帅', 280000],
];

const DEFAULT = {
  name: '新兵蛋子',
  gp: 12000,
  exp: 0,
  owned: ['ak47', 'm4a1', 'awm', 'usp', 'knife', 'he'],
  loadout: { primary: 'ak47', secondary: 'usp', melee: 'knife', grenade: 'he' },
  settings: { sensitivity: 1.0, fov: 72, volume: 0.8, invertY: false, quality: 'high', crosshair: '#3cff3c', difficulty: 'normal' },
  stats: { kills: 0, deaths: 0, headshots: 0, matches: 0, wins: 0, chests: 0 },
};

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { ...DEFAULT, ...p, settings: { ...DEFAULT.settings, ...p.settings }, stats: { ...DEFAULT.stats, ...p.stats }, loadout: { ...DEFAULT.loadout, ...p.loadout } };
    }
  } catch (e) { /* storage unavailable */ }
  return JSON.parse(JSON.stringify(DEFAULT));
}

export function saveProfile(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
}

export function rankOf(exp) {
  let i = 0;
  while (i + 1 < RANKS.length && exp >= RANKS[i + 1][1]) i++;
  const next = RANKS[i + 1];
  return { index: i, name: RANKS[i][0], cur: RANKS[i][1], next: next ? next[1] : null, progress: next ? (exp - RANKS[i][1]) / (next[1] - RANKS[i][1]) : 1 };
}
