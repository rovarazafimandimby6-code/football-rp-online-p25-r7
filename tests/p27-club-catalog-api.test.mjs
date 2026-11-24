import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CLUBS } from '../src/club-manager.js';
import { listPublicClubs, resolvePublicClub } from '../server/club-catalog.js';

test('P27 catalogue public : expose les 156 clubs sans effectifs privés', () => {
  const result=listPublicClubs({limit:100});
  assert.equal(result.total,156);
  assert.equal(result.clubs.length,100);
  assert.ok(result.clubs.every(club=>!Object.hasOwn(club,'roster')&&!Object.hasOwn(club,'managerId')));
  const all=listPublicClubs({limit:100,offset:100});
  assert.equal(all.clubs.length,56);
  assert.equal(new Set([...result.clubs,...all.clubs].map(club=>club.id)).size,156);
});

test('P27 catalogue public : filtre les divisions et conférences avec les quotas exacts', () => {
  assert.equal(listPublicClubs({division:'D1'}).total,16);
  assert.equal(listPublicClubs({division:'D2'}).total,20);
  assert.equal(listPublicClubs({division:'D3'}).total,24);
  for(const conference of ['Nord','Sud']) assert.equal(listPublicClubs({division:'D4',conference}).total,16);
  for(const conference of ['Nord','Sud','Est','Ouest']) assert.equal(listPublicClubs({division:'D5',conference}).total,16);
});

test('P27 catalogue public : recherche, pagination et filtres invalides', () => {
  const result=listPublicClubs({search:'Antsiranana',limit:1,offset:0});
  assert.ok(result.total>=1);
  assert.equal(result.clubs.length,1);
  assert.throws(()=>listPublicClubs({division:'D6'}),/INVALID_DIVISION/);
  assert.throws(()=>listPublicClubs({division:'D4',conference:'Est'}),/INVALID_CONFERENCE/);
  assert.throws(()=>listPublicClubs({limit:101}),/INVALID_PAGINATION/);
  assert.throws(()=>listPublicClubs({search:'x'.repeat(65)}),/INVALID_CLUB_SEARCH/);
});

test('P27 fiche publique : un club expose son identité et sa conférence sans son effectif', () => {
  const club=resolvePublicClub('antsiranana-north-fc');
  assert.equal(club.division,'D5');
  assert.equal(club.conference,'Nord');
  assert.equal(club.location.city,'Antsiranana');
  assert.equal(club.stadium,'Stade du Nord');
  assert.equal(Object.hasOwn(club,'roster'),false);
  assert.equal(resolvePublicClub('club-unknown'),null);
});

test('P27 catalogue public : reflète les affectations de division de la saison active', () => {
  const clubs=DEFAULT_CLUBS.map(club=>({...club}));
  const target=clubs.find(club=>club.id==='antsiranana-north-fc');
  target.division='D4';
  target.conference='Nord';
  const current=resolvePublicClub(target.id,clubs);
  assert.equal(current.division,'D4');
  assert.equal(current.conference,'Nord');
  assert.equal(listPublicClubs({clubs,division:'D4',conference:'Nord'}).clubs.some(club=>club.id===target.id),true);
});
