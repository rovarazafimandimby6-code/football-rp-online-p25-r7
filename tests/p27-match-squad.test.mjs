import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchSquad } from '../src/match-squad.js';

const roster = [
  { id: 'gk', name: 'Gardien', role: 'GK', rating: 70, number: 1 },
  { id: 'def-1', name: 'Défenseur 1', role: 'DEF', rating: 80, number: 4 },
  { id: 'def-2', name: 'Défenseur 2', role: 'DEF', rating: 78, number: 5 },
  { id: 'fwd-1', name: 'Attaquant 1', role: 'FWD', rating: 75, number: 9 },
  { id: 'career-player', name: 'Joueur carrière', role: 'FWD', rating: 50, number: 17 },
  { id: 'mid-1', name: 'Milieu 1', role: 'MID', rating: 88, number: 8 },
  { id: 'mid-2', name: 'Milieu 2', role: 'MID', rating: 86, number: 6 },
  { id: 'fwd-2', name: 'Attaquant 2', role: 'FWD', rating: 84, number: 10 },
  { id: 'def-3', name: 'Défenseur 3', role: 'DEF', rating: 82, number: 3 }
];

test('P27 feuille de match : cinq titulaires et cinq remplaçants réels, sans doublon', () => {
  const squad = createMatchSquad('blue', '2-2', roster, 'career-player');
  assert.equal(squad.starters.length, 5);
  assert.equal(squad.substitutes.length, 4);
  assert.equal(squad.squadSize, 9);
  const ids = [...squad.starters, ...squad.substitutes].map(player => player.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('career-player'));
  assert.equal(squad.substitutes.some(player => player.id === 'career-player'), false);
});

test('P27 feuille de match : le joueur carrière reste titulaire même si sa note est inférieure', () => {
  const squad = createMatchSquad('blue', '2-2', roster, 'career-player');
  assert.ok(squad.starters.some(player => player.id === 'career-player'));
  assert.equal(squad.substitutes.some(player => player.id === 'career-player'), false);
});

test('P27 feuille de match : réserve triée par note puis potentiel et limitée à cinq', () => {
  const squad = createMatchSquad('red', '2-2', roster, null, 5);
  assert.equal(squad.substitutes.length, 4);
  assert.deepEqual(squad.substitutes.map(player => player.id), ['mid-1','mid-2','def-3','career-player']);
  assert.equal(createMatchSquad('red','2-2',roster,null,2).substitutes.length, 2);
});

test('P27 feuille de match : effectif incomplet et absence de réserve sans joueurs fictifs', () => {
  const squad = createMatchSquad('blue','2-2',[roster[0],roster[1]]);
  assert.equal(squad.starters.length, 5);
  assert.equal(squad.substitutes.length, 0);
  assert.equal(squad.squadSize, 2);
  assert.equal(squad.substitutes.some(player => String(player.id).startsWith('blue_')), false);
});

test('P27 feuille de match : identifiants répétés ignorés dans le banc et comptage unique', () => {
  const duplicated = [...roster, { ...roster[5], name: 'Copie du milieu' }];
  const squad = createMatchSquad('blue','2-2',duplicated);
  const reserveIds = squad.substitutes.map(player => player.id);
  assert.equal(new Set(reserveIds).size, reserveIds.length);
  assert.equal(squad.squadSize, 9);
});
