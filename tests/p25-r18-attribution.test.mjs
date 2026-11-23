import test from 'node:test';
import assert from 'node:assert/strict';
import { stepRoomSimulation, applyPlayerAction } from '../server/simulation.js';
import { RoomManager } from '../server/room-manager.js';

function player(id, team, role = 'FWD') {
  return { id, team, role, connected: true, x: 0, y: 0, z: 0, vx: 0, vz: 0, facing: Math.PI / 2,
    input: { x: 0, z: 0, sprint: false }, stats: { passes: 0, shots: 0, tackles: 0, goals: 0, assists: 0, saves: 0, interceptions: 0 } };
}
function roomWith(players, ball, extra = {}) {
  return { players: new Map(players.map(p => [p.id, p])), ball, score: { blue: 0, red: 0 },
    events: [], elapsedMs: 5000, attackDirection: { blue: 1, red: -1 }, goalPauseMs: 0, ...extra };
}

test('R18: but attribué au dernier toucher et passe décisive au coéquipier précédent', () => {
  const passer = player('p1', 'blue'), scorer = player('p2', 'blue');
  const room = roomWith([passer, scorer], { x: 27.9, y: 0.36, z: 0, vx: 0, vy: 0, vz: 0, ownerId: 'p2',
    lastTouchTeam: 'blue', lastTouchPlayerId: 'p2', previousTouchTeam: 'blue', previousTouchPlayerId: 'p1', previousTouchAt: 1000 });
  assert.equal(applyPlayerAction(room, scorer, 'shoot', 1000), true);
  stepRoomSimulation(room, 0.01);
  assert.equal(room.score.blue, 1);
  assert.equal(scorer.stats.goals, 1);
  assert.equal(passer.stats.assists, 1);
  assert.equal(room.events.find(e => e.type === 'goal').playerId, 'p2');
});

test('R18: une interception est attribuée au joueur qui récupère une passe adverse', () => {
  const interceptor = player('def', 'red');
  const room = roomWith([interceptor], { x: 0, y: 0.36, z: 0, vx: 0, vy: 0, vz: 0, ownerId: null,
    lastTouchTeam: 'blue', lastTouchPlayerId: 'att', previousTouchTeam: null, previousTouchPlayerId: null });
  stepRoomSimulation(room, 0.01);
  assert.equal(interceptor.stats.interceptions, 1);
  assert.ok(room.events.some(e => e.type === 'interception' && e.playerId === 'def'));
});

test('R18: une prise de balle du gardien après un tir adverse compte comme arrêt', () => {
  const keeper = player('gk', 'red', 'GK');
  const room = roomWith([keeper], { x: 0, y: 0.36, z: 0, vx: 1, vy: 0, vz: 0, ownerId: null,
    lastTouchTeam: 'blue', lastTouchPlayerId: 'shot', lastShotTeam: 'blue', lastShotPlayerId: 'shot', lastShotAt: 4500 });
  stepRoomSimulation(room, 0.01);
  assert.equal(keeper.stats.saves, 1);
  assert.ok(room.events.some(e => e.type === 'save' && e.playerId === 'gk'));
});

test('R18: le bilan final expose les nouvelles statistiques individuelles et collectives', () => {
  let now = 1000;
  const manager = new RoomManager({ now: () => now });
  const created = manager.create();
  const joined = manager.join(created.id, { displayName: 'Testeur', preferredTeam: 'blue' });
  const room = manager.rooms.get(created.id);
  const human = room.players.get(joined.playerId);
  human.stats.assists = 2; human.stats.saves = 1; human.stats.interceptions = 3; human.stats.goals = 1;
  room.score.blue = 1; room.phase = 'fulltime'; room.elapsedMs = 300000;
  const result = manager.finalizeResult(room);
  const row = result.players.find(p => p.playerId === human.id);
  assert.deepEqual({ assists: row.stats.assists, saves: row.stats.saves, interceptions: row.stats.interceptions }, { assists: 2, saves: 1, interceptions: 3 });
  assert.equal(result.teamStats.blue.goals, 1);
  assert.equal(result.teamStats.blue.assists, 2);
  assert.equal(result.teamStats.blue.saves, 1);
  assert.equal(result.teamStats.blue.interceptions, 3);
});
