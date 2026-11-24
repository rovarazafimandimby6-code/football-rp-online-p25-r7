import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePlayerMatchRating, buildMatchPerformance } from '../server/player-rating.js';
import { stepRoomSimulation } from '../server/simulation.js';

const player = (overrides = {}) => ({
  playerId: 'p1', name: 'Joueur', team: 'blue', role: 'MID', minutesPlayedMs: 180000,
  stats: { passes: 10, completedPasses: 8, shots: 1, tackles: 1, interceptions: 1, goals: 0, assists: 0, saves: 0 },
  ...overrides
});

test('P27 performance: ignore les joueurs sans temps de jeu significatif', () => {
  assert.equal(calculatePlayerMatchRating(player({ minutesPlayedMs: 1000 })), null);
  assert.equal(calculatePlayerMatchRating(player({ minutesPlayedMs: 0 })), null);
});

test('P27 performance: la précision des passes influence la note', () => {
  const accurate = calculatePlayerMatchRating(player());
  const inaccurate = calculatePlayerMatchRating(player({ stats: { ...player().stats, completedPasses: 2 } }));
  assert.ok(accurate > inaccurate);
});

test('P27 performance: les actions sont pondérées selon le poste', () => {
  const defensive = { ...player(), role: 'DEF', stats: { passes: 0, completedPasses: 0, tackles: 3, interceptions: 3 } };
  const goalkeeper = { ...player(), role: 'GK', stats: { passes: 0, completedPasses: 0, saves: 3 } };
  const forward = { ...player(), role: 'FWD', stats: { passes: 0, completedPasses: 0, shots: 4, goals: 1 } };
  assert.ok(calculatePlayerMatchRating(defensive) > calculatePlayerMatchRating({ ...defensive, role: 'FWD' }));
  assert.ok(calculatePlayerMatchRating(goalkeeper) > calculatePlayerMatchRating({ ...goalkeeper, role: 'MID' }));
  assert.ok(calculatePlayerMatchRating(forward) > calculatePlayerMatchRating({ ...forward, role: 'DEF' }));
});

test('P27 performance: normalise les valeurs invalides et plafonne la note', () => {
  const malformed = player({ stats: { passes: -5, completedPasses: 999, goals: NaN, assists: Infinity, shots: 'bad' } });
  assert.equal(calculatePlayerMatchRating(malformed), 6.2);
  const elite = player({ stats: { goals: 8, assists: 8, saves: 8, tackles: 8, interceptions: 8, passes: 100, completedPasses: 100 } });
  assert.equal(calculatePlayerMatchRating(elite), 10);
});

test('P27 performance: attribue homme du match, meilleur de chaque équipe et précision', () => {
  const result = buildMatchPerformance([
    player({ playerId: 'blue-star', name: 'Bleu', stats: { goals: 1, passes: 12, completedPasses: 11 } }),
    player({ playerId: 'red-star', name: 'Rouge', team: 'red', role: 'GK', stats: { saves: 3, passes: 2, completedPasses: 2 } }),
    player({ playerId: 'bench', minutesPlayedMs: 0 })
  ]);
  assert.equal(result.awards.playerOfMatch.playerId, 'blue-star');
  assert.equal(result.awards.teamStandouts.blue.playerId, 'blue-star');
  assert.equal(result.awards.teamStandouts.red.playerId, 'red-star');
  assert.equal(result.players[0].stats.passAccuracy, 92);
  assert.equal(result.players.find(p => p.playerId === 'bench').rating, null);
});

test('P27 performance: départage de façon stable les notes égales', () => {
  const result = buildMatchPerformance([
    player({ playerId: 'z', stats: {} }), player({ playerId: 'a', stats: {} })
  ]);
  assert.equal(result.awards.playerOfMatch.playerId, 'a');
});


test('P27 performance: crédite une passe seulement à la réception par un coéquipier', () => {
  const passer = { id: 'passer', team: 'blue', role: 'MID', x: -3, z: 0, input: { x: 0, z: 0 }, connected: true, stats: { passes: 1, completedPasses: 0 } };
  const receiver = { id: 'receiver', team: 'blue', role: 'FWD', x: 0, z: 0, input: { x: 0, z: 0 }, connected: true, stats: {} };
  const room = {
    players: new Map([[passer.id, passer], [receiver.id, receiver]]),
    ball: { x: 0, y: 0.36, z: 0, vx: 0, vy: 0, vz: 0, ownerId: null, lastTouchTeam: 'blue', lastTouchPlayerId: passer.id, pendingPasserId: passer.id },
    elapsedMs: 1000, events: [], score: { blue: 0, red: 0 }, attackDirection: { blue: 1, red: -1 }, goalPauseMs: 0
  };
  stepRoomSimulation(room, 0.01);
  assert.equal(passer.stats.completedPasses, 1);
  assert.equal(room.events.filter(event => event.type === 'pass-completed').length, 1);
  stepRoomSimulation(room, 0.01);
  assert.equal(passer.stats.completedPasses, 1, 'une même passe ne doit pas être comptée deux fois');
});

test('P27 performance: une interception adverse ne valide pas la passe', () => {
  const passer = { id: 'passer', team: 'blue', role: 'MID', x: -3, z: 0, input: { x: 0, z: 0 }, connected: true, stats: { passes: 1, completedPasses: 0 } };
  const opponent = { id: 'opponent', team: 'red', role: 'DEF', x: 0, z: 0, input: { x: 0, z: 0 }, connected: true, stats: {} };
  const room = {
    players: new Map([[passer.id, passer], [opponent.id, opponent]]),
    ball: { x: 0, y: 0.36, z: 0, vx: 0, vy: 0, vz: 0, ownerId: null, lastTouchTeam: 'blue', lastTouchPlayerId: passer.id, pendingPasserId: passer.id },
    elapsedMs: 1000, events: [], score: { blue: 0, red: 0 }, attackDirection: { blue: 1, red: -1 }, goalPauseMs: 0
  };
  stepRoomSimulation(room, 0.01);
  assert.equal(passer.stats.completedPasses, 0);
  assert.equal(room.events.some(event => event.type === 'pass-completed'), false);
});
