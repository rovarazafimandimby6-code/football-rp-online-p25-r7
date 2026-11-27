import test from 'node:test';
import assert from 'node:assert/strict';
import { listP27Players } from '../src/p27-player-library.js';

const player = (id, name, extra = {}) => ({ id, name, playerType:'system', role:'MID', age:22, rating:70, potential:80, nationality:'MG', ...extra });
const clubs = [
  { id:'club-a', name:'Club A', division:'D1', roster:[player('p1','Rija', { rating:82 }), player('p2','Mamy', { role:'DEF', rating:61 })], releasedPlayers:[{ player:player('p3','Solo'), releasedAt:'2027-01-01T00:00:00.000Z', reason:'contract-expired' }, { player:player('p4','Transfere'), releasedAt:'2027-01-02T00:00:00.000Z', reason:'transferred' }] },
  { id:'club-b', name:'Club B', division:'D2', roster:[player('p4','Transfere', { rating:77 }), player('p5','Tovo', { playerType:'human', role:'FWD', contract:{ loan:{ status:'active' } } })], releasedPlayers:[{ player:player('p3','Solo'), releasedAt:'2026-12-01T00:00:00.000Z', reason:'released' }] }
];

test('P27 bibliothèque joueurs : réunit effectifs et joueurs libres sans doublons', () => {
  const result = listP27Players({ clubs, filters:{ limit:100 } });
  assert.equal(result.total, 5);
  assert.equal(result.players.filter(item => item.id === 'p3').length, 1);
  assert.equal(result.players.find(item => item.id === 'p3').status, 'free');
  assert.equal(result.players.find(item => item.id === 'p3').number, null);
  assert.equal(result.players.find(item => item.id === 'p3').appearance.kitColors.primary, '#465365');
  assert.equal(result.players.find(item => item.id === 'p4').clubId, 'club-b');
  assert.equal(result.players.find(item => item.id === 'p4').status, 'active');
  assert.equal(result.facets.statuses.loaned, 1);
});

test('P27 bibliothèque joueurs : filtres combinés division, poste, type et statut', () => {
  const result = listP27Players({ clubs, filters:{ division:'D2', role:'FWD', type:'human', status:'loaned' } });
  assert.equal(result.total, 1);
  assert.equal(result.players[0].id, 'p5');
});

test('P27 bibliothèque joueurs : recherche accent-insensitive et pagination bornée', () => {
  const result = listP27Players({ clubs, filters:{ search:'rija', sort:'name', limit:1, offset:0 } });
  assert.equal(result.total, 1);
  assert.equal(result.players[0].id, 'p1');
  const capped = listP27Players({ clubs, filters:{ limit:1000, offset:-5 } });
  assert.equal(capped.limit, 100);
  assert.equal(capped.offset, 0);
});

test('P27 bibliothèque joueurs : un joueur transféré archivé ne réapparaît pas comme joueur libre', () => {
  const result = listP27Players({ clubs, filters:{ status:'free', limit:100 } });
  assert.deepEqual(result.players.map(item => item.id), ['p3']);
});
