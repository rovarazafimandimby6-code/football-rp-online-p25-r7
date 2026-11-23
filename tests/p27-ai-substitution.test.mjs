import test from 'node:test';
import assert from 'node:assert/strict';
import { selectAISubstitution } from '../src/ai-substitution-manager.js';

const player = (id, team, role, stamina, rating = 60, controlled = false) => ({
  id, team, role, stamina, rating, potential: rating + 5, isControlled: controlled
});

test('P27 remplacements IA : attend la seconde partie du match', () => {
  const result = selectAISubstitution({
    team: 'red', players: [player('tired','red','MID',0.2)],
    bench: [player('fresh','red','MID',1)], elapsedRatio: 0.39
  });
  assert.equal(result, null);
});

test('P27 remplacements IA : choisit le joueur fatigué et le meilleur remplaçant réel du même poste', () => {
  const tired = player('tired','red','MID',0.2,72);
  const result = selectAISubstitution({
    team: 'red', players: [player('fit','red','DEF',0.9), tired],
    bench: [player('reserve-low','red','MID',1,60), player('reserve-best','red','MID',1,78), player('wrong-role','red','DEF',1,99)],
    elapsedRatio: 0.6
  });
  assert.equal(result.outgoing, tired);
  assert.equal(result.incoming.id, 'reserve-best');
});

test('P27 remplacements IA : protège le footballeur contrôlé et respecte la limite', () => {
  const controlled = player('career','blue','FWD',0.1,70,true);
  assert.equal(selectAISubstitution({
    team: 'blue', players: [controlled], bench: [player('reserve','blue','FWD',1)],
    elapsedRatio: 0.8
  }), null);
  assert.equal(selectAISubstitution({
    team: 'blue', players: [player('tired','blue','MID',0.1)],
    bench: [player('reserve','blue','MID',1)], used: 3, limit: 3, elapsedRatio: 0.8
  }), null);
});

test('P27 remplacements IA : aucun changement si le banc réel ne propose pas le même poste', () => {
  assert.equal(selectAISubstitution({
    team: 'red', players: [player('tired','red','GK',0.1)],
    bench: [player('reserve','red','DEF',1)], elapsedRatio: 0.8
  }), null);
});
