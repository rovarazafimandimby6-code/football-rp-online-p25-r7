import test from 'node:test';
import assert from 'node:assert/strict';
import { ClubManager, DEFAULT_CLUBS } from '../src/club-manager.js';
import { getP27ClubKit, getP27ClubShopKit, getP27ClubShopAppearance } from '../src/p27-club-kit.js';
import { getP27StadiumCapacity, getShopItem } from '../src/p27-shop-catalog.js';
import { renderClubCrest } from '../src/club-identity.js';
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

test('P27 clubs : les 156 clubs reçoivent un motif stable et les 16 motifs sont utilisés', () => {
  const first = DEFAULT_CLUBS.map(club => getP27ClubKit(club).kitDesign);
  const second = DEFAULT_CLUBS.map(club => getP27ClubKit(club).kitDesign);
  assert.deepEqual(first, second);
  assert.equal(new Set(first).size, 16);
  assert.ok(first.every(design => ['vertical','sash','hoops','wave','pinstripes','quartered','chevron','sunburst','horizontal','diagonal','central','split','shoulder','ripple','cross','sidepanels'].includes(design)));
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

test('P27 boutique club : le maillot domicile équipé conserve la palette officielle et le motif du club', () => {
  const club = customClub('shop-kit-club',['#123456','#102030','#eeeeee'],'vertical');
  const kit = getP27ClubShopKit(club,[
    {itemId:'club-kit-home',status:'owned',equipped:true},
    {itemId:'club-kit-away',status:'owned',equipped:false}
  ],'home','MID');
  assert.deepEqual(kit.kitColors,{primary:'#123456',secondary:'#102030',accent:'#eeeeee'});
  assert.equal(kit.kitDesign,'sash');
  assert.equal(kit.kitVariant,'home');
});

test('P27 boutique club : les maillots extérieur, troisième et gardien changent réellement de tenue', () => {
  const club = customClub('shop-kit-club',['#123456','#102030','#eeeeee'],'vertical');
  const inventory = [
    {itemId:'club-kit-away',status:'owned',equipped:true},
    {itemId:'club-kit-third',status:'owned',equipped:true},
    {itemId:'club-kit-goalkeeper',status:'owned',equipped:true}
  ];
  const away = getP27ClubShopKit(club,inventory,'away','MID');
  assert.deepEqual(away.kitColors,{primary:'#eeeeee',secondary:'#123456',accent:'#102030'});
  assert.equal(away.kitDesign,'hoops');
  assert.equal(away.kitVariant,'away');
  const third = getP27ClubShopKit(club,inventory,'third','MID');
  assert.deepEqual(third.kitColors,{primary:'#102030',secondary:'#eeeeee',accent:'#123456'});
  assert.equal(third.kitDesign,'wave');
  assert.equal(third.kitVariant,'third');
  const goalkeeper = getP27ClubShopKit(club,inventory,'home','GK');
  assert.deepEqual(goalkeeper.kitColors,{primary:'#eeeeee',secondary:'#123456',accent:'#102030'});
  assert.equal(goalkeeper.kitDesign,'pinstripes');
  assert.equal(goalkeeper.kitVariant,'goalkeeper');
});

test('P27 boutique club : un article non équipé ou revendu ne modifie jamais le maillot', () => {
  const club = customClub('shop-kit-club',['#123456','#102030','#eeeeee'],'vertical');
  const expected = getP27ClubKit(club,'MID');
  assert.deepEqual(getP27ClubShopKit(club,[
    {itemId:'club-kit-away',status:'owned',equipped:false},
    {itemId:'club-kit-third',status:'resold',equipped:true}
  ],'away','MID'),expected);
});


test('P27 boutique club : écusson, couleurs, stade, pelouse et supporters suivent uniquement les articles équipés', () => {
  const club = customClub('shop-visual-club',['#123456','#102030','#eeeeee'],'vertical');
  const inventory = [
    {itemId:'club-crest-custom',status:'owned',equipped:true},
    {itemId:'club-official-colors',status:'owned',equipped:true},
    {itemId:'club-stadium-premium',status:'owned',equipped:true},
    {itemId:'club-grass-standard',status:'owned',equipped:true},
    {itemId:'club-supporter-flags',status:'owned',equipped:true},
    {itemId:'club-supporter-tifo',status:'owned',equipped:false},
    {itemId:'club-supporter-banners',status:'resold',equipped:true}
  ];
  const appearance = getP27ClubShopAppearance(club, inventory);
  assert.equal(appearance.crestStyle, 'custom');
  assert.deepEqual(appearance.crestColors, club.colors);
  assert.equal(appearance.stadiumSkin, 'premium');
  assert.equal(appearance.grassSkin, 'standard');
  assert.deepEqual(appearance.supporters,{flags:true,banners:false,tifo:false});
  assert.match(renderClubCrest({id:club.id,name:club.name,crestStyle:appearance.crestStyle}),/M50 5L91 24/);
  assert.doesNotMatch(renderClubCrest({id:club.id,name:club.name}),/M50 5L91 24/);
});

test('P27 boutique club : les articles non équipés ou revendus ne changent aucune apparence', () => {
  const club = customClub('shop-visual-club',['#123456','#102030','#eeeeee'],'vertical');
  const appearance = getP27ClubShopAppearance(club,[
    {itemId:'club-crest-custom',status:'owned',equipped:false},
    {itemId:'club-official-colors',status:'resold',equipped:true},
    {itemId:'club-stadium-premium',status:'owned',equipped:false},
    {itemId:'club-grass-premium',status:'resold',equipped:true},
    {itemId:'club-supporter-tifo',status:'owned',equipped:false}
  ]);
  assert.deepEqual(appearance,{
    crestStyle:'classic',crestColors:null,stadiumSkin:'default',grassSkin:'default',stadiumExpansionLevel:0,stadiumCapacity:5000,
    supporters:{flags:false,banners:false,tifo:false}
  });
});


test('P27 boutique club : les extensions achetées restent actives même sans emplacement équipable',()=>{
  const club = customClub('shop-capacity-club',['#123456','#102030','#eeeeee'],'vertical');
  const appearance = getP27ClubShopAppearance(club,[
    {itemId:'club-capacity-level-1',category:'capacity',upgradeLevel:1,status:'owned',equipped:false},
    {itemId:'club-capacity-level-2',category:'capacity',upgradeLevel:2,status:'owned',equipped:false}
  ]);
  assert.equal(appearance.stadiumExpansionLevel,2);
});


test('P27 stade : capacité d’accueil mesurable distincte de la capacité de l’effectif',()=>{
 assert.equal(getP27StadiumCapacity(0),5000);
 assert.equal(getP27StadiumCapacity(1),7500);
 assert.equal(getP27StadiumCapacity(2),10000);
 assert.equal(getP27StadiumCapacity(3),12500);
 assert.equal(getP27StadiumCapacity(4),15000);
 assert.equal(getP27StadiumCapacity(99),15000);
 const levelThree=getShopItem('club-capacity-level-3');
 assert.equal(levelThree.capacityIncrease,2500);
 assert.equal(levelThree.capacityAfterUpgrade,12500);
 assert.equal(levelThree.resellable,false);
 assert.equal(getP27StadiumCapacity(-1),5000);
 const appearance=getP27ClubShopAppearance(customClub('capacity-club',['#123456','#102030','#eeeeee'],'vertical'),[
  {itemId:'club-capacity-level-1',category:'capacity',upgradeLevel:1,status:'owned',equipped:false},
  {itemId:'club-capacity-level-2',category:'capacity',upgradeLevel:2,status:'owned',equipped:false},
  {itemId:'club-capacity-level-3',category:'capacity',upgradeLevel:3,status:'resold',equipped:false}
 ]);
 assert.equal(appearance.stadiumExpansionLevel,2);
 assert.equal(appearance.stadiumCapacity,10000);
 assert.equal(customClub('capacity-club',['#123456','#102030','#eeeeee'],'vertical').capacity,12);
});
