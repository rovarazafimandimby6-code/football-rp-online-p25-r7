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

test('P27 bibliothèque joueurs : le maillot suit le club actuel sans écraser le portrait ni le numéro', () => {
  const custom = player('p-kit','Joueur maillot', {
    number:27,
    appearance:{ skinTone:'dark', hairStyle:'curly', hairColor:'black', kitColors:{ primary:'#111111', secondary:'#222222', accent:'#333333' }, kitDesign:'central' }
  });
  const club = { id:'kit-club', name:'Kit Club', division:'D1', colors:['#aa1122','#1122aa','#eeeeee'], kitDesign:'sash', roster:[custom] };
  const result = listP27Players({ clubs:[club], filters:{ limit:10 } });
  const found = result.players[0];
  assert.equal(found.number, 27);
  assert.equal(found.appearance.skinTone, 'dark');
  assert.equal(found.appearance.hairStyle, 'curly');
  assert.equal(found.appearance.kitColors.primary, '#aa1122');
  assert.equal(found.appearance.kitColors.secondary, '#1122aa');
  assert.equal(found.appearance.kitColors.accent, '#eeeeee');
  assert.equal(found.appearance.kitDesign, 'sash');
});

test('P27 bibliothèque joueurs : les fiches retournées ne permettent pas de modifier le maillot du roster', () => {
  const original = player('p-readonly','Fiche isolée', {
    number:14,
    appearance:{ skinTone:'dark', kitColors:{ primary:'#aa1122', secondary:'#1122aa', accent:'#eeeeee' }, kitDesign:'sash' }
  });
  const club = { id:'readonly-club', name:'Readonly FC', division:'D1', colors:['#aa1122','#1122aa','#eeeeee'], kitDesign:'sash', roster:[original] };
  const result = listP27Players({ clubs:[club], filters:{ limit:10 } });
  result.players[0].appearance.kitColors.primary = '#000000';
  result.players[0].appearance.kitDesign = 'central';
  assert.equal(original.appearance.kitColors.primary, '#aa1122');
  assert.equal(original.appearance.kitDesign, 'sash');
});

test('P27 bibliothèque joueurs : isole aussi les données imbriquées du contrat, des attributs et de l’apparence', () => {
  const original = player('p-deep-copy','Fiche profonde', {
    number:8,
    appearance:{ skinTone:'dark', details:{ scars:['left-cheek'], accessories:{ wristband:'blue' } }, kitColors:{ primary:'#aa1122' } },
    attributes:{ pace:80, technical:{ control:76, passing:71 } },
    contract:{ salary:1200, loan:{ status:'active', terms:{ returnDate:'2027-06-30' } } }
  });
  const club = { id:'deep-copy-club', name:'Deep Copy FC', division:'D1', colors:['#aa1122','#1122aa','#eeeeee'], roster:[original] };
  const result = listP27Players({ clubs:[club], filters:{ limit:10 } });
  const found = result.players[0];
  found.appearance.details.scars.push('chin');
  found.appearance.details.accessories.wristband = 'red';
  found.attributes.technical.control = 1;
  found.contract.loan.terms.returnDate = '1900-01-01';
  assert.deepEqual(original.appearance.details.scars, ['left-cheek']);
  assert.equal(original.appearance.details.accessories.wristband, 'blue');
  assert.equal(original.attributes.technical.control, 76);
  assert.equal(original.contract.loan.terms.returnDate, '2027-06-30');
});

test('P27 bibliothèque joueurs : le gardien reçoit le kit secondaire du club', () => {
  const keeper = player('p-gk','Gardien', { role:'GK', number:1 });
  const club = { id:'keeper-library', name:'Keeper FC', division:'D2', colors:['#123456','#102030','#eeeeee'], kitDesign:'hoops', roster:[keeper] };
  const result = listP27Players({ clubs:[club], filters:{ limit:10 } });
  assert.deepEqual(result.players[0].appearance.kitColors, { primary:'#eeeeee', secondary:'#123456', accent:'#102030' });
  assert.equal(result.players[0].appearance.kitVariant, 'goalkeeper');
  assert.equal(result.players[0].number, 1);
});
