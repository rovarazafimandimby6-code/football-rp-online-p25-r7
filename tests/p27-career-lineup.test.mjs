import test from 'node:test';
import assert from 'node:assert/strict';
import { createTeamRoster } from '../src/ai.js';

const roster = [
  { id: 'keeper', name: 'Gardien', role: 'GK', rating: 70, number: 1 },
  { id: 'def-a', name: 'Défenseur A', role: 'DEF', rating: 92, number: 4 },
  { id: 'def-b', name: 'Défenseur B', role: 'DEF', rating: 89, number: 5 },
  { id: 'mid-a', name: 'Milieu A', role: 'MID', rating: 88, number: 8 },
  { id: 'career-player', name: 'Mon joueur', role: 'FWD', rating: 55, number: 17 },
  { id: 'forward-star', name: 'Attaquant vedette', role: 'FWD', rating: 99, number: 10 }
];

test('P27 match carrière : le footballeur personnel est prioritaire dans le onze même avec une note inférieure', () => {
  const lineup = createTeamRoster('blue', '2-2', roster, 'career-player');
  assert.equal(lineup.some(player => player.id === 'career-player'), true);
  assert.equal(lineup.find(player => player.id === 'career-player').number, 17);
  assert.equal(lineup.find(player => player.id === 'career-player').name, 'Mon joueur');
  assert.equal(lineup.some(player => player.id === 'forward-star'), false);
});

test('P27 match carrière : le joueur personnel prend le slot correspondant à son poste', () => {
  const lineup = createTeamRoster('blue', '1-2-1', roster, 'mid-a');
  const controlled = lineup.find(player => player.id === 'mid-a');
  assert.ok(controlled);
  assert.equal(controlled.role, 'MID');
  assert.equal(controlled.number, 8);
});

test('P27 match carrière : sans joueur prioritaire, la sélection compétitive habituelle est conservée', () => {
  const lineup = createTeamRoster('blue', '2-2', roster);
  assert.equal(lineup[0].id, 'keeper');
  assert.equal(lineup[3].id, 'forward-star');
});
