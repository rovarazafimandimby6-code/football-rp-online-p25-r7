import test from 'node:test';
import assert from 'node:assert/strict';
import { ClubManager, DEFAULT_CLUBS } from '../src/club-manager.js';
import { getP27ClubKit } from '../src/p27-club-kit.js';
import { listP27Players } from '../src/p27-player-library.js';
import { renderSystemPlayerPortrait } from '../src/p27-system-player-portrait.js';

const storage = { getItem(){ return null; }, setItem(){ return true; } };
const customClub = (id, colors, kitDesign) => ({
  id, name:id, city:'Ville', country:'Pays', countryCode:'MG', division:'D3',
  rating:60, control:'ai', colors, kitDesign, capacity:12, initialRosterSize:0
});

test('P27 maillots : Manchester Sporting reprend une identité parisienne bleu-rouge-blanc', () => {
  const manager = new ClubManager(DEFAULT_CLUBS, storage, 'p27-kit-paris-test');
  const club = manager.getClub('manparis-sporting');
  const kit = getP27ClubKit(club, 'MID');
  assert.deepEqual(kit.kitColors, { primary:'#123b7a', secondary:'#d72645', accent:'#ffffff' });
  assert.equal(kit.kitDesign, 'central');
  assert.match(kit.kitInspiration, /parisienne/i);
  assert.ok(club.roster.every(player => player.appearance.kitDesign === 'central'));
  assert.equal(new Set(club.roster.map(player => player.number)).size, club.roster.length);
});

test('P27 transfert : le numéro reste disponible et le maillot suit le club actuel', () => {
  const manager = new ClubManager([
    customClub('club-blue', ['#123456','#102030','#eeeeee'], 'vertical'),
    customClub('club-red', ['#b02030','#501020','#f4d0d0'], 'sash')
  ], storage, 'p27-kit-transfer-test');
  assert.equal(manager.addPlayer('club-blue', {
    id:'moving-player', name:'Joueur transféré', playerType:'system', role:'MID', number:1,
    appearance:{ skinTone:'brown', hairStyle:'curly', kitColors:{primary:'#123456',secondary:'#102030',accent:'#eeeeee'}, kitDesign:'vertical' }
  }).ok, true);
  assert.equal(manager.addPlayer('club-red', {
    id:'target-player', name:'Déjà présent', playerType:'system', role:'DEF', number:1
  }).ok, true);

  const moved = manager.transferPlayer('club-blue','club-red','moving-player');
  assert.equal(moved.ok, true);
  assert.equal(moved.number, 2);
  const currentClub = manager.getClub('club-red');
  const player = currentClub.roster.find(item => item.id === 'moving-player');
  assert.equal(player.number, 2);
  assert.equal(player.appearance.kitColors.primary, '#b02030');
  assert.equal(player.appearance.kitColors.secondary, '#501020');
  assert.equal(player.appearance.kitDesign, 'sash');
  assert.equal(player.appearance.kitVariant, 'outfield');
  assert.equal(player.appearance.skinTone, 'brown');
  assert.equal(player.appearance.hairStyle, 'curly');

  const library = listP27Players({ clubs:manager.listClubs(), filters:{ search:'moving-player', limit:10 } });
  assert.equal(library.total, 1);
  assert.equal(library.players[0].number, 2);
  assert.equal(library.players[0].clubId, 'club-red');
  assert.equal(library.players[0].appearance.kitColors.primary, '#b02030');
});

test('P27 gardiens : la tenue secondaire du club est appliquée sans perdre le numéro', () => {
  const kit = getP27ClubKit(customClub('keeper-club',['#123456','#102030','#eeeeee'],'hoops'),'GK');
  assert.deepEqual(kit.kitColors, { primary:'#eeeeee', secondary:'#123456', accent:'#102030' });
  assert.equal(kit.kitVariant, 'goalkeeper');
});

test('P27 portrait : le numéro de maillot apparaît aussi sous le portrait 3D', () => {
  const html = renderSystemPlayerPortrait({ id:'p-10', name:'Test', role:'FWD', number:10 }, 'roster');
  assert.match(html, /N° 10/);
  assert.match(html, /numéro 10/);
});
