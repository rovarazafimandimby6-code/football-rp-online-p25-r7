import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOnlinePlayerPerformance } from '../src/online-career-sync.js';

const report = (overrides = {}) => ({
  phase: 'fulltime',
  score: { blue: 2, red: 0 },
  players: [{ playerId: 'human-1', name: 'Test', team: 'blue', isBot: false, stats: { goals: 1, assists: 1, shots: 3, passes: 8, tackles: 2, interceptions: 1 } }],
  ...overrides
});

test('P27 carrière en ligne : extrait uniquement le joueur humain du rapport serveur', () => {
  const result = resolveOnlinePlayerPerformance(report(), 'human-1');
  assert.equal(result.result, 'win');
  assert.equal(result.cleanSheet, true);
  assert.equal(result.stats.goals, 1);
  assert.equal(result.stats.assists, 1);
  assert.equal(result.stats.completedPasses, 8);
});

test('P27 carrière en ligne : détermine correctement défaite, nul et clean sheet selon le camp', () => {
  const red = report({ score: { blue: 0, red: 1 }, players: [{ playerId: 'human-1', team: 'red', isBot: false, stats: {} }] });
  assert.equal(resolveOnlinePlayerPerformance(red, 'human-1').result, 'win');
  assert.equal(resolveOnlinePlayerPerformance(red, 'human-1').cleanSheet, true);
  const draw = report({ score: { blue: 2, red: 2 } });
  assert.equal(resolveOnlinePlayerPerformance(draw, 'human-1').result, 'draw');
  assert.equal(resolveOnlinePlayerPerformance(draw, 'human-1').cleanSheet, false);
  const loss = report({ score: { blue: 0, red: 2 } });
  assert.equal(resolveOnlinePlayerPerformance(loss, 'human-1').result, 'loss');
});

test('P27 carrière en ligne : refuse les rapports incomplets ou un joueur bot/inconnu', () => {
  assert.equal(resolveOnlinePlayerPerformance(null, 'human-1'), null);
  assert.equal(resolveOnlinePlayerPerformance(report({ phase: 'playing' }), 'human-1'), null);
  assert.equal(resolveOnlinePlayerPerformance(report(), 'missing'), null);
  assert.equal(resolveOnlinePlayerPerformance(report({ players: [{ playerId: 'human-1', team: 'blue', isBot: true }] }), 'human-1'), null);
});

test('P27 carrière en ligne : borne les statistiques invalides du rapport', () => {
  const result = resolveOnlinePlayerPerformance(report({ players: [{ playerId: 'human-1', team: 'blue', isBot: false, stats: { goals: -4, passes: 3.9, shots: Infinity } }] }), 'human-1');
  assert.equal(result.stats.goals, 0);
  assert.equal(result.stats.passes, 3);
  assert.equal(result.stats.shots, 0);
});
