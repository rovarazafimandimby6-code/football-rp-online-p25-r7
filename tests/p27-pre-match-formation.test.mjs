import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createTeamRoster } from '../src/ai.js';
import { createMatchSquad } from '../src/match-squad.js';

const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const game = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
const roster = [
  { id: 'keeper', name: 'Gardien', role: 'GK', rating: 72, number: 1 },
  { id: 'def-a', name: 'Défenseur', role: 'DEF', rating: 80, number: 4 },
  { id: 'mid-a', name: 'Milieu', role: 'MID', rating: 82, number: 8 },
  { id: 'fwd-a', name: 'Attaquant', role: 'FWD', rating: 84, number: 9 },
  { id: 'career-player', name: 'Mon joueur', role: 'MID', rating: 55, number: 17 },
  { id: 'reserve-a', name: 'Réserve', role: 'DEF', rating: 68, number: 5 }
];

test('P27 gestion équipe : les trois schémas tactiques produisent cinq titulaires sans perdre le joueur carrière', () => {
  for (const formation of ['2-2', '1-2-1', '2-1-1']) {
    const lineup = createTeamRoster('blue', formation, roster, 'career-player');
    assert.equal(lineup.length, 5);
    assert.equal(new Set(lineup.map(player => player.id)).size, 5);
    assert.ok(lineup.some(player => player.id === 'career-player'));
    assert.equal(lineup.find(player => player.id === 'career-player').number, 17);
  }
  assert.notDeepEqual(createTeamRoster('blue', '2-2', roster).map(p => p.role), createTeamRoster('blue', '1-2-1', roster).map(p => p.role));
});

test('P27 gestion équipe : le choix de formation avant match met à jour la feuille de match et le moteur', () => {
  assert.match(main, /let selectedFormation = '2-2'/);
  assert.match(main, /id="pre-match-formation"/);
  assert.match(main, /selectedFormation = event.target.value/);
  assert.match(main, /createMatchSquad\('blue',selectedFormation,home.roster,'career-player'\)/);
  assert.match(main, /formation: selectedFormation/);
  assert.match(main, /id="pre-match-bench-size"/);
  assert.match(main, /selectedBenchSize = size/);
  assert.match(main, /benchSize: selectedBenchSize/);
  assert.match(game, /const formation = \['2-2','1-2-1','2-1-1'\]\.includes\(callbacks\.formation\) \? callbacks\.formation : '2-2'/);
  assert.match(game, /createTeamRoster\('blue', formation, callbacks\.homeRoster, callbacks\.careerPlayerId\)/);
  assert.match(game, /createMatchSquad\('blue', formation, callbacks\.homeRoster, callbacks\.careerPlayerId\)/);
});

test('P27 gestion équipe : le joueur personnel reste titulaire avec son poste et son numéro après sélection du schéma', () => {
  const lineup = createTeamRoster('blue', '1-2-1', roster, 'career-player');
  const player = lineup.find(item => item.id === 'career-player');
  assert.equal(player.role, 'MID');
  assert.equal(player.number, 17);
  const squad = createMatchSquad('blue', '1-2-1', roster, 'career-player', 3);
  assert.ok(squad.starters.some(item => item.id === 'career-player'));
  assert.ok(!squad.substitutes.some(item => item.id === 'career-player'));
});

test('P27 gestion équipe : la feuille de match accepte un banc réglable de trois à sept réservistes', () => {
  const fullRoster = [...roster, ...Array.from({length:6}, (_, index) => ({
    id:`reserve-${index+2}`, name:`Réserve ${index+2}`, role:index%2?'DEF':'MID', rating:60+index, number:20+index
  }))];
  for (const size of [3,4,5,6,7]) {
    const squad = createMatchSquad('blue','2-2',fullRoster,'career-player',size);
    assert.equal(squad.starters.length,5);
    assert.equal(squad.substitutes.length,size);
    assert.equal(new Set([...squad.starters,...squad.substitutes].map(player=>player.id)).size,5+size);
  }
});
