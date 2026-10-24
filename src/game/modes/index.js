import { TDMMode, FFAMode } from './tdm.js';
import { BombMode } from './bomb.js';
import { ZombieMode } from './zombie.js';
import { ChallengeMode } from './challenge.js';

export const MODES = {
  tdm: { name: '团队竞技', desc: '两队对抗，击杀数先达到目标的队伍获胜。复活快、节奏爽。', cls: TDMMode, limitLabel: '目标击杀', limits: [40, 60, 100, 150], defLimit: 60 },
  ffa: { name: '个人竞技', desc: '人人皆敌，率先达到目标击杀数的玩家获胜。', cls: FFAMode, limitLabel: '目标击杀', limits: [20, 30, 50], defLimit: 30 },
  bomb: { name: '爆破模式', desc: '潜伏者安放C4，保卫者阻止或拆除。回合制、死亡不复活。', cls: BombMode, limitLabel: '胜利局数', limits: [3, 5, 7], defLimit: 5 },
  zombie: { name: '生化模式', desc: '倒计时后出现母体僵尸，被抓即感染。坚持到最后！最后一人化身英雄。', cls: ZombieMode, limitLabel: '回合数', limits: [3, 5, 8], defLimit: 5 },
  challenge: { name: '挑战模式', desc: '与队友抵御十波僵尸与巨型魔王，击杀僵尸掉落宝箱，结算翻牌拿神器！', cls: ChallengeMode, limitLabel: '', limits: [], defLimit: 0 },
};

export function createMode(id, game, cfg) {
  const M = MODES[id] || MODES.tdm;
  return new M.cls(game, cfg);
}
