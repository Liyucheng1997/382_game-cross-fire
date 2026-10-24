// 团队竞技 (TDM) and 个人竞技 (FFA)
import { BaseMode, TEAM_NAMES } from './base.js';
import { Audio } from '../../audio.js';

export class TDMMode extends BaseMode {
  constructor(game, cfg) {
    super(game, cfg);
    this.id = 'tdm'; this.name = '团队竞技';
    this.killLimit = cfg.limit || 60;
  }
  setup() {
    const per = Math.max(1, this.cfg.botsPerTeam || 6);
    this.createTeams('red', 'blue', per, this.cfg.team || 'blue');
    this.spawnAll();
    Audio.play('round_start', { volume: 0.6 });
    this.game.hud.bigMessage('团队竞技', `率先达到 ${this.killLimit} 击杀的队伍获胜`, 3);
  }
  respawnDelay() { return 3; }
  canBuy(p) { return !p.alive || p.protectT > 0; }
  update(dt) {
    if (this.over) return;
    this.handleRespawns(dt);
    const r = this.teamKills('red'), b = this.teamKills('blue');
    if (r >= this.killLimit || b >= this.killLimit || this.tickTimer(dt)) {
      const win = r === b ? null : r > b ? 'red' : 'blue';
      this.finish({ winner: win, text: win ? `${TEAM_NAMES[win]}胜利` : '平局', playerWon: win === this.game.player.team });
    }
  }
  botGoal(brain) { return this.enemySpawnGoal(brain); }
  hudInfo() {
    return { type: 'teams', left: { name: TEAM_NAMES.red, score: this.teamKills('red'), cls: 'red' }, right: { name: TEAM_NAMES.blue, score: this.teamKills('blue'), cls: 'blue' }, time: this.timeLeft, goal: `目标 ${this.killLimit}` };
  }
}

export class FFAMode extends BaseMode {
  constructor(game, cfg) {
    super(game, cfg);
    this.id = 'ffa'; this.name = '个人竞技';
    this.killLimit = cfg.limit || 30;
  }
  setup() {
    const g = this.game;
    const n = Math.max(2, (this.cfg.botsPerTeam || 6) * 2);
    this.createTeams('ffa', 'ffa', n, 'ffa');
    // every actor is its own team
    for (const a of g.actors) a.team = 'p' + a.id;
    const list = g.meta.spawns.ffa;
    g.actors.forEach((a, i) => g.spawnActor(a, list[i % list.length]));
    this.game.hud.bigMessage('个人竞技', `率先达到 ${this.killLimit} 击杀获胜`, 3);
    Audio.play('round_start', { volume: 0.6 });
  }
  isEnemy(a, b) { return a !== b; }
  respawnDelay() { return 3; }
  canBuy(p) { return !p.alive || p.protectT > 0; }
  update(dt) {
    if (this.over) return;
    this.handleRespawns(dt, () => 'ffa');
    const top = this.game.actors.reduce((m, a) => (a.kills > m.kills ? a : m), this.game.actors[0]);
    if (top.kills >= this.killLimit || this.tickTimer(dt)) {
      this.finish({ winner: top.name, text: top.isPlayer ? '你获得了第一名！' : `${top.name} 获得第一名`, playerWon: top.isPlayer });
    }
  }
  botGoal() { return null; }
  hudInfo() {
    const sorted = [...this.game.actors].sort((a, b) => b.kills - a.kills);
    const p = this.game.player;
    return { type: 'ffa', leader: sorted[0], me: p, rank: sorted.indexOf(p) + 1, time: this.timeLeft, goal: `目标 ${this.killLimit}` };
  }
}
