import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { JsonResultStore } from '../server/result-store.js';
import { RoomManager } from '../server/room-manager.js';
import { resolveMatchClub } from '../server/club-catalog.js';
import { DEFAULT_CLUBS } from '../src/club-manager.js';
import { P27_EXPANSION_CLUBS } from '../src/p27-club-expansion.js';

import { generateClubLore, P27_CLUB_LORE_ARCHETYPES, P27_CLUB_LORE_ORIGINS } from '../src/p27-club-lore.js';
import { ClubManager } from '../src/club-manager.js';

test('P27 identité : les 156 clubs possèdent une fiche éditoriale stable et explicitement provisoire',()=>{
  assert.equal(DEFAULT_CLUBS.length,156);
  const manager=new ClubManager(DEFAULT_CLUBS,null,'p27-lore-catalog-test');
  const clubs=manager.listClubs();
  assert.equal(clubs.length,156);
  assert.ok(clubs.every(club=>club.clubLore?.contentStatus==='generated-draft'));
  assert.ok(clubs.every(club=>P27_CLUB_LORE_ARCHETYPES.some(item=>item.id===club.clubLore.identityArchetype)));
  assert.ok(clubs.every(club=>P27_CLUB_LORE_ORIGINS.includes(club.clubLore.originType)));
  assert.ok(clubs.every(club=>club.clubLore.rivalryStatus==='unassigned'&&club.clubLore.rivalries.length===0));
  assert.ok(new Set(clubs.map(club=>club.clubLore.foundedYear)).size>1);
  assert.deepEqual(generateClubLore(clubs[0]),generateClubLore(clubs[0]));
});

test('P27 identité : les fiches éditoriales et rivalités explicites survivent au rechargement',()=>{
  const values=new Map();
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};
  const source=[{id:'lore-persist-a',name:'Lore A',city:'Tana',clubLore:{contentStatus:'approved',originType:'fictional-merger',foundedYear:1998,originSummary:'Histoire validée par la direction.',identityArchetype:'heritage',identityLabel:'Club de tradition',sportingPhilosophy:'Transmission.',supporterCulture:'Fidélité.',rivalries:[{clubId:'lore-persist-b',type:'historical',status:'active'}]}},{id:'lore-persist-b',name:'Lore B',city:'Toamasina'}];
  const first=new ClubManager(source,storage,'lore-persist-test');
  assert.equal(first.saveSeason(),true);
  const restored=new ClubManager(source,storage,'lore-persist-test');
  const lore=restored.getClub('lore-persist-a').clubLore;
  assert.equal(lore.contentStatus,'approved');
  assert.equal(lore.foundedYear,1998);
  assert.equal(lore.originSummary,'Histoire validée par la direction.');
  assert.deepEqual(lore.rivalries,[{clubId:'lore-persist-b',type:'historical',status:'active'}]);
});

test('P27 identité : une rivalité explicite est conservée sans en inventer automatiquement',()=>{
  const clubs=new ClubManager([{id:'lore-custom',name:'Lore Custom',city:'Tana',clubLore:{rivalries:[{clubId:'other-club',type:'geographic',status:'active'}]}}],null,'p27-lore-custom-test');
  const club=clubs.getClub('lore-custom');
  assert.equal(club.clubLore.rivalries.length,1);
  assert.deepEqual(club.clubLore.rivalries[0],{clubId:'other-club',type:'geographic',status:'active'});
  assert.equal(clubs.listClubs()[0].clubLore.rivalries.length,1);
});

test('P27: les salons associent uniquement des clubs fictifs connus du catalogue', () => {
  const manager = new RoomManager();
  const created = manager.create({ blueClubId: 'fianarantsoa-athletic', redClubId: 'antananarivo-fc' });
  assert.equal(created.teams.blue.name, 'Fianarantsoa Highland');
  assert.equal(created.teams.red.name, 'Antananarivo Crown FC');
  assert.deepEqual(created.teams.blue.colors, ['#7856b8','#34215e','#e6d8ff']);
  assert.throws(() => manager.create({ blueClubId: 'unknown-club', redClubId: 'antananarivo-fc' }), /INVALID_CLUB/);
  assert.throws(() => manager.create({ blueClubId: 'antananarivo-fc', redClubId: 'antananarivo-fc' }), /INVALID_CLUB_MATCHUP/);
  assert.throws(() => manager.create({ blueClubId: 'fianarantsoa-athletic' }), /INVALID_CLUB_MATCHUP/);
});

test('P27: le catalogue serveur expose les 156 clubs, y compris les 140 clubs ajoutés',()=>{
  assert.equal(DEFAULT_CLUBS.length,156);
  assert.equal(P27_EXPANSION_CLUBS.length,140);
  const generated=P27_EXPANSION_CLUBS[0];
  const resolved=resolveMatchClub(generated.id);
  assert.equal(resolved.id,generated.id);
  assert.equal(resolved.name,generated.name);
  assert.equal(resolved.division,generated.division);
  assert.equal(resolved.roster.length,generated.initialRosterSize);
  const manager=new RoomManager();
  const created=manager.create({blueClubId:generated.id,redClubId:'antananarivo-fc'});
  assert.equal(created.teams.blue.id,generated.id);
});

test('P27: les identités de clubs sont incluses dans les états publics et les résultats archivés', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'fpro-p27-clubs-'));
  try {
    const store = new JsonResultStore(directory);
    const manager = new RoomManager({ now: () => 123456, resultStore: store });
    const created = manager.create({ blueClubId: 'fianarantsoa-athletic', redClubId: 'antananarivo-fc' });
    const joined = manager.join(created.id, { displayName: 'Testeur' });
    const state = manager.get(created.id);
    assert.equal(state.teams.blue.id, 'fianarantsoa-athletic');
    assert.equal(state.teams.red.id, 'antananarivo-fc');
    assert.equal(Object.values(state.players[0]).includes(joined.token), false);
    const publicHuman = state.players.find(player => !player.isBot);
    assert.ok(publicHuman);
    assert.equal(Object.hasOwn(publicHuman, 'careerPlayerId'), false);
    assert.equal(Object.hasOwn(publicHuman, 'accountId'), false);
    const room = manager.rooms.get(created.id);
    room.phase = 'fulltime';
    room.elapsedMs = 300000;
    const result = manager.finalizeResult(room);
    assert.equal(result.teams.blue.name, 'Fianarantsoa Highland');
    assert.equal(result.teams.red.name, 'Antananarivo Crown FC');
    const restored = new JsonResultStore(directory).get(created.id);
    assert.equal(restored.teams.blue.name, 'Fianarantsoa Highland');
    assert.equal(restored.teams.red.name, 'Antananarivo Crown FC');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('P27: les feuilles de résultats restent rétrocompatibles sans identité de club', () => {
  const manager = new RoomManager();
  const created = manager.create();
  const room = manager.rooms.get(created.id);
  room.phase = 'fulltime';
  room.elapsedMs = 300000;
  const result = manager.finalizeResult(room);
  assert.deepEqual(result.teams, { blue: null, red: null });
});

test('P27: la création de match utilise l’affiche sélectionnée et affiche les noms archivés', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /const homeClub = clubs\.getClub\(selectedMatchup\.home\)/);
  assert.match(main, /blueClubId: homeClub\.id, redClubId: awayClub\.id/);
  assert.match(main, /result\.teams\?\.\[key\]\?\.name/);
  assert.match(main, /result\.teams\?\.\[player\.team\]\?\.name/);
});

test('P27: un salon vide reste joignable jusqu’à expiration de son TTL', () => {
  let now = 1000;
  const manager = new RoomManager({ now: () => now, roomTtlMs: 60_000 });
  const created = manager.create();
  now += 50;
  manager.tick(0.05);
  assert.equal(manager.get(created.id).id, created.id);
  assert.doesNotThrow(() => manager.join(created.id, { displayName: 'Premier joueur' }));
});

test('P27: les kits 3D des deux équipes utilisent les palettes des clubs sélectionnés', async () => {
  const game = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const player = await readFile(new URL('../src/player.js', import.meta.url), 'utf8');
  assert.match(game, /cfg\.team === 'blue' \? callbacks\.homeKitColors : callbacks\.awayKitColors/);
  assert.match(game, /callbacks\.homeKitAppearance/);
  assert.match(game, /callbacks\.awayKitAppearance/);
  assert.match(game, /cfg\.role === 'GK'/);
  assert.match(game, /homeGoalkeeperKitAppearance/);
  assert.match(game, /awayGoalkeeperKitAppearance/);
  assert.match(game, /kitAppearance && typeof kitAppearance === 'object'/);
  assert.match(main, /getP27ClubShopKit/);
  assert.match(main, /getShopSnapshot\('club', club\.id\)/);
  assert.match(main, /getP27ClubShopAppearance/);
  assert.match(main, /homeClubAppearance:/);
  assert.match(main, /crestStyle:homeKits\.appearance/);
  assert.match(game, /applyClubAppearance\(callbacks\.homeClubAppearance/);

  assert.match(main, /homeKitAppearance,/);
  assert.match(main, /awayKitAppearance,/);
  assert.match(player, /kitColors/);
});

test('P27: le tableau de match affiche les écussons SVG propres aux deux clubs', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  assert.match(main, /blueCrest\.outerHTML = renderClubCrest/);
  assert.match(main, /redCrest\.outerHTML = renderClubCrest/);
  assert.match(main, /onlineTeams\?\.blue\?\.id/);
  assert.match(css, /#board \.club-crest-svg/);
});

test('P27: les bots des clubs utilisent une identité stable reliée aux fiches du roster', () => {
  const manager = new RoomManager();
  const created = manager.create({ blueClubId: 'fianarantsoa-athletic', redClubId: 'antananarivo-fc' });
  manager.join(created.id, { displayName: 'Testeur', preferredTeam: 'blue' });
  const state = manager.get(created.id);
  const blueBot = state.players.find(player => player.team === 'blue' && player.isBot);
  const rosterPlayer = manager.rooms.get(created.id).teams.blue.roster.find(player => player.id === 'fianarantsoa-athletic-ai-02');
  assert.ok(blueBot);
  assert.ok(rosterPlayer);
  assert.equal(blueBot.name, rosterPlayer.name);
  assert.equal(blueBot.careerPlayerId, `club-fianarantsoa-athletic-${rosterPlayer.id}`);
  assert.equal(blueBot.role, rosterPlayer.role);
  assert.equal(state.teams.blue.roster, undefined);
});


test('P27 match : les apparences publiques des clubs sont jointes au salon sans inventaire privé',()=>{
 const manager=new RoomManager({
  resolveClubAppearance:clubId=>clubId==='antananarivo-fc'
   ? {equippedItemIds:['club-crest-custom','club-supporter-flags'],stadiumExpansionLevel:3,stadiumCapacity:999999,ownerId:'must-not-leak',balance:999999}
   : {equippedItemIds:[],stadiumExpansionLevel:0}
 });
 const created=manager.create({blueClubId:'antananarivo-fc',redClubId:'fianarantsoa-athletic'});
 assert.deepEqual(created.teams.blue.shopAppearance,{equippedItemIds:['club-crest-custom','club-supporter-flags'],stadiumExpansionLevel:3,stadiumCapacity:12500});
 assert.deepEqual(created.teams.red.shopAppearance,{equippedItemIds:[],stadiumExpansionLevel:0,stadiumCapacity:5000});
 assert.equal(JSON.stringify(created.teams).includes('must-not-leak'),false);
 assert.equal(JSON.stringify(created.teams).includes('999999'),false);
});


test('P27 match : les extensions du club pilotent des niveaux de tribunes supplémentaires',async()=>{
 const field=await readFile(new URL('../src/field.js',import.meta.url),'utf8');
 const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(main,/stadiumExpansionLevel/);
 assert.match(field,/expansionLevel/);
 assert.match(field,/clubExpansionGroup/);
 assert.match(field,/PITCH\.HALF_W - 12\.0 - offset/);
});


test('P27 match : le serveur diffuse les seuls cosmétiques publics et le client applique les deux clubs',async()=>{
 const server=await readFile(new URL('../server/index.js',import.meta.url),'utf8');
 const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(server,/resolveClubAppearance:clubId => shopService\.publicAppearance\(clubId\)/);
 assert.match(main,/onlineTeams\?\.\[teamKey\]\?\.shopAppearance/);
 assert.match(main,/loadClubKits\(homeClub, 'home', 'blue'\)/);
 assert.match(main,/loadClubKits\(awayClub, 'away', 'red'\)/);
 assert.match(main,/publicTeamAppearance\.equippedItemIds/);
});
