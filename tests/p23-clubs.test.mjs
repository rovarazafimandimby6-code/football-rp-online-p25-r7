import test from 'node:test';
import assert from 'node:assert/strict';
import { ClubManager, DIVISIONS } from '../src/club-manager.js';
import { generateClubRoster } from '../src/club-roster.js';
import { renderClubCrest } from '../src/club-identity.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('P23 clubs: catalogue international et malgache rattaché aux cinq championnats', () => {
  const manager = new ClubManager();
  assert.equal(manager.listClubs().length, 16);
  assert.deepEqual(DIVISIONS.map(item => item.id), ['D1','D2','D3','D4','D5']);
  assert.deepEqual(DIVISIONS.map(division => manager.clubsByDivision(division.id).length), [4,4,4,0,4]);
  assert.ok(manager.listClubs().filter(item => item.countryCode === 'MG').length >= 8);
});

test('P23 clubs: les effectifs IA sont complets, diversifiés et déterministes', () => {
  const manager = new ClubManager();
  const club = manager.getClub('antananarivo-fc');
  assert.equal(club.roster.length, 12);
  assert.deepEqual(generateClubRoster(club, { size: 12 }), generateClubRoster(club, { size: 12 }));
  assert.equal(new Set(club.roster.map(player => player.id)).size, 12);
  assert.ok(club.roster.some(player => player.nationality === 'MG'));
  assert.ok(club.roster.some(player => player.nationality !== 'MG'));
  assert.ok(club.roster.every(player => player.appearance && player.potential >= player.rating));
  for (const player of club.roster) {
    assert.deepEqual(Object.keys(player.attributes).sort(), ['control','defense','pace','passing','shooting','stamina']);
    assert.ok(Object.values(player.attributes).every(value => value >= 25 && value <= 99));
    assert.ok(Math.abs(Object.values(player.attributes).reduce((sum,value)=>sum+value,0)/6-player.rating) <= 3);
  }
  assert.deepEqual(club.roster.map(player => player.role).slice(0,6), ['GK','GK','DEF','DEF','DEF','DEF']);
});

test('P23 clubs: effectifs et identités survivent au rechargement local', () => {
  const storage = memoryStorage();
  const first = new ClubManager(undefined, storage, 'p23-club-test');
  const before = first.getClub('londaka-city');
  first.saveSeason();
  const restored = new ClubManager(undefined, storage, 'p23-club-test');
  const after = restored.getClub('londaka-city');
  assert.deepEqual(after.roster, before.roster);
  assert.equal(after.division, 'D2');
  assert.equal(after.stadium, before.stadium);
});

test('P23 clubs: palettes personnalisées et SVG sécurisés', () => {
  const svg = renderClubCrest({ id: 'club-<script>', name: 'Madri-Tana FC', colors: ['#123456','#234567','#345678'] });
  assert.match(svg, /--crest-primary:#123456/);
  assert.doesNotMatch(svg, /<script>/);
  assert.match(svg, /crest-club--script/);
});

test('P23 clubs: les divisions ne changent pas les règles de reprise', () => {
  const manager = new ClubManager();
  assert.equal(manager.takeOver('antananarivo-fc','human-a').reason, 'club-not-available');
  assert.equal(manager.takeOver('tulear-sunrise','human-a').ok, true);
  assert.equal(manager.takeOver('morondava-lagoon','human-a').reason, 'manager-already-has-club');
});

test('P23 clubs: les onze joueurs IA des deux clubs sont injectés dans les lineups 5v5', async () => {
  const { createTeamRoster } = await import('../src/ai.js');
  const manager = new ClubManager();
  const home = manager.getClub('antananarivo-fc');
  const away = manager.getClub('toamasina-united');
  const blue = createTeamRoster('blue', '2-2', home.roster);
  const red = createTeamRoster('red', '2-2', away.roster);
  assert.equal(blue.length, 5);
  assert.equal(red.length, 5);
  assert.ok(blue.every(player => home.roster.some(source => source.id === player.id)));
  assert.ok(red.every(player => away.roster.some(source => source.id === player.id)));
  assert.ok(blue.every(player => player.appearance?.kitColors?.primary === home.colors[player.role === 'GK' ? 2 : 0]));
  assert.ok(red.every(player => player.appearance?.kitColors?.primary === away.colors[player.role === 'GK' ? 2 : 0]));
});

test('P23 clubs: les 192 joueurs ont des noms fictifs uniques et aucun nom vedette interdit', () => {
  const manager = new ClubManager();
  const players = manager.listClubs().flatMap(item => item.roster);
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  assert.equal(players.length, 192);
  assert.equal(new Set(players.map(player => normalize(player.name))).size, players.length);
  assert.ok(players.every(player => normalize(player.name) !== 'thiago silva'));
  assert.ok(players.every(player => !/\b(messi|ronaldo|neymar|mbappe|haaland|salah|yamal)\b/i.test(player.name)));
});

test('P23 clubs: diversité nationale internationale avec une présence malgache', () => {
  const manager = new ClubManager();
  const clubs = manager.listClubs();
  const players = clubs.flatMap(item => item.roster);
  const nationalities = new Set(players.map(player => player.nationality));
  const Malagasy = players.filter(player => player.nationality === 'MG').length;
  assert.ok(nationalities.size >= 12, `nationalités trouvées: ${[...nationalities].join(', ')}`);
  for (const code of nationalities) assert.ok(players.some(player => player.nationality === code), `${code} doit être représenté`);
  assert.ok(Malagasy >= 35 && Malagasy <= 75, `joueurs malgaches: ${Malagasy}`);
  for (const item of clubs) {
    assert.equal(item.roster.length, 12);
    assert.ok(new Set(item.roster.map(player => player.nationality)).size >= 3, `${item.name} doit avoir au moins 3 nationalités`);
  }
});

test('P23 clubs: effectifs équilibrés par poste, âge et niveau de division', () => {
  const manager = new ClubManager();
  const expected = ['GK','GK','DEF','DEF','DEF','DEF','MID','MID','MID','MID','FWD','FWD'];
  for (const item of manager.listClubs()) {
    assert.deepEqual(item.roster.map(player => player.role), expected);
    assert.ok(item.roster.every(player => player.age >= 18 && player.age <= 33));
    assert.ok(item.roster.filter(player => player.age <= 21).length >= 3);
    assert.ok(item.roster.filter(player => player.age >= 28).length >= 2);
    assert.ok(item.roster.every(player => player.rating >= 35 && player.rating <= 91 && player.potential >= player.rating));
    const average = item.roster.reduce((sum, player) => sum + player.rating, 0) / item.roster.length;
    assert.ok(Math.abs(average - item.rating) <= 3.5, `${item.name}: moyenne ${average}, référence ${item.rating}`);
  }
});

test('P23 clubs: migration des anciens effectifs remplace les identités IA obsolètes sans perdre les notes', () => {
  const storage = memoryStorage();
  const legacy = new ClubManager(undefined, null, 'legacy-unused');
  const oldClubs = legacy.listClubs().map(item => ({ ...item, roster: item.roster.map(player => { const { attributes, ...legacyPlayer } = player; return { ...legacyPlayer, name: player.id === 'manparis-sporting-ai-03' ? 'Thiago Silva' : player.name, nationality: 'BR', rating: player.rating + 1 }; }) }));
  storage.setItem('p23-legacy', JSON.stringify({ version: 4, clubs: oldClubs, fixtures: [] }));
  const migrated = new ClubManager(undefined, storage, 'p23-legacy');
  const player = migrated.getClub('manparis-sporting').roster.find(item => item.id === 'manparis-sporting-ai-03');
  assert.notEqual(player.name, 'Thiago Silva');
  assert.notEqual(player.nationality, 'BR');
  assert.equal(player.rating, oldClubs.find(item => item.id === 'manparis-sporting').roster[2].rating);
  assert.deepEqual(player.attributes, legacy.getClub('manparis-sporting').roster[2].attributes);
  migrated.saveSeason();
  assert.equal(JSON.parse(storage.getItem('p23-legacy')).version, 7);
});

test('P23 gameplay: les compositions 5v5 sélectionnent les meilleurs profils par poste et leurs attributs', async () => {
  const { createTeamRoster } = await import('../src/ai.js');
  const roster = [
    { id:'gk-low', role:'GK', rating:58, number:1, attributes:{pace:40,shooting:30,passing:45,defense:70,stamina:40,control:50} },
    { id:'gk-high', role:'GK', rating:80, number:2, attributes:{pace:50,shooting:35,passing:60,defense:90,stamina:65,control:70} },
    { id:'def-low', role:'DEF', rating:60, number:3 },
    { id:'def-high', role:'DEF', rating:82, number:4, archetype:'Défenseur stoppeur', attributes:{pace:55,shooting:40,passing:55,defense:90,stamina:75,control:55} },
    { id:'def-high-2', role:'DEF', rating:78, number:5 },
    { id:'fwd-low', role:'FWD', rating:61, number:6 },
    { id:'fwd-high', role:'FWD', rating:86, number:7, archetype:'Finisseur de surface', attributes:{pace:80,shooting:94,passing:65,defense:35,stamina:72,control:88} }
  ];
  const lineup = createTeamRoster('blue','2-2',roster);
  assert.deepEqual(lineup.map(player=>player.id), ['gk-high','def-high','def-high-2','fwd-high','fwd-low']);
  assert.equal(lineup[0].attributes.defense, 90);
  assert.equal(lineup[0].rating, 80);
  assert.equal(lineup[1].specialty, 'stopper');
  assert.equal(lineup[3].specialty, 'finisher');
});

test('P23 gameplay: la vitesse individuelle modifie le déplacement des joueurs IA', async () => {
  const { TeamAI } = await import('../src/ai.js');
  const makePlayer = pace => ({ id:`pace-${pace}`, team:'blue', role:'DEF', specialty:'cover', pos:{x:-12,z:-5}, homePos:{x:-12,z:-5}, vel:{x:0,z:0}, facing:0, stamina:1, actionCooldown:1, tackleTimer:0, attributes:{pace,stamina:50} });
  const slow = makePlayer(25); const fast = makePlayer(90);
  const ball = { pos:{x:8,z:0}, owner:null };
  new TeamAI().update([slow], structuredClone(ball), 0.1, { aiPass(){}, aiShoot(){}, tryTackle(){} });
  new TeamAI().update([fast], structuredClone(ball), 0.1, { aiPass(){}, aiShoot(){}, tryTackle(){} });
  assert.ok(Math.hypot(fast.vel.x,fast.vel.z) > Math.hypot(slow.vel.x,slow.vel.z));
});
