// Shared helpers for game modes
import * as THREE from 'three';
import { pickNames, BOT_LOADOUTS } from '../../data/names.js';

export class BaseMode {
  constructor(game, cfg) {
    this.game = game; this.cfg = cfg;
    this.timeLeft = (cfg.time || 10) * 60;
    this.spawnProtect = 3;
    this.over = false;
  }

  botLoadout(i) {
    const lo = BOT_LOADOUTS[(i * 7 + Math.floor(Math.random() * BOT_LOADOUTS.length)) % BOT_LOADOUTS.length];
    return { ...lo };
  }

  // create player + bots for two teams
  createTeams(teamA, teamB, perTeam, playerTeam) {
    const g = this.game;
    const names = pickNames(perTeam * 2);
    let ni = 0;
    const player = g.createActor({ name: this.cfg.playerName || '我', team: playerTeam, isPlayer: true, loadout: this.cfg.loadout });
    for (const team of [teamA, teamB]) {
      const n = team === playerTeam ? perTeam - 1 : perTeam;
      for (let i = 0; i < n; i++) g.createActor({ name: names[ni++], team, bot: true, loadout: this.botLoadout(ni) });
    }
    return player;
  }

  spawnAll(teamSpawn = (a) => a.team) {
    const g = this.game;
    const used = new Map();
    for (const a of g.actors) {
      const key = teamSpawn(a);
      const list = g.meta.spawns[key] || g.meta.spawns.ffa;
      const i = used.get(key) || 0; used.set(key, i + 1);
      g.spawnActor(a, list[i % list.length]);
    }
  }

  // Respawn dead actors whose timer elapsed
  handleRespawns(dt, teamSpawn = (a) => a.team) {
    const g = this.game;
    for (const a of g.actors) {
      if (a.alive) continue;
      a.respawnT -= dt;
      if (a.respawnT <= 0) g.spawnActor(a, g.respawnPoint(teamSpawn(a)));
    }
  }

  tickTimer(dt) {
    if (this.over) return false;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    return this.timeLeft <= 0;
  }

  teamKills(team) { return this.game.actors.filter((a) => a.team === team).reduce((s, a) => s + a.kills, 0); }
  alive(team) { return this.game.actors.filter((a) => a.alive && a.team === team); }

  finish(result) {
    if (this.over) return;
    this.over = true;
    this.game.endMatch(result);
  }

  // default bot goal: head toward enemy territory sometimes
  enemySpawnGoal(brain) {
    const g = this.game, a = brain.a;
    if (!brain.enemyGoal || a.pos.distanceTo(brain.enemyGoal) < 3 || (brain.enemyGoalT -= 1 / 60) < 0) {
      const enemy = a.team === 'red' ? 'blue' : 'red';
      const list = g.meta.spawns[enemy] || [];
      const hs = g.meta.hotspots || [];
      const r = Math.random();
      let p;
      if (r < 0.45 && hs.length) p = hs[Math.floor(Math.random() * hs.length)];
      else if (r < 0.8 && list.length) p = list[Math.floor(Math.random() * list.length)];
      else { const q = g.nav.randomPoint(); p = [q.x, q.y, q.z]; }
      brain.enemyGoal = new THREE.Vector3(p[0], p[1], p[2]);
      brain.enemyGoalT = 20;
    }
    return brain.enemyGoal;
  }

  scoreRows() {
    return this.game.actors.map((a) => ({ a, team: a.team }));
  }
}

export const TEAM_NAMES = { red: '潜伏者', blue: '保卫者', human: '人类', zombie: '僵尸' };
