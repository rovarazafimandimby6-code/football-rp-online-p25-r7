import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CLUBS } from '../src/club-manager.js';
import { P27_EXPANSION_CLUBS, P27_EXPANSION_COUNTS } from '../src/p27-club-expansion.js';
import { auditClubCatalog } from '../src/club-catalog-validation.js';

test('P27 expansion : les 140 clubs complètent exactement les cinq divisions', () => {
  assert.deepEqual(P27_EXPANSION_COUNTS, { total:140, D1:12, D2:16, D3:20, D4:32, D5:60 });
  assert.equal(P27_EXPANSION_CLUBS.length, 140);
  assert.equal(new Set(P27_EXPANSION_CLUBS.map(club=>club.id)).size, 140);
  assert.equal(new Set(P27_EXPANSION_CLUBS.map(club=>club.name)).size, 140);
  assert.deepEqual(Object.fromEntries(['D1','D2','D3','D4','D5'].map(division=>[division,P27_EXPANSION_CLUBS.filter(club=>club.division===division).length])), { D1:12, D2:16, D3:20, D4:32, D5:60 });
});

test('P27 audit catalogue : contrôle les 156 identités, localisations et équipements', () => {
  const audit = auditClubCatalog(DEFAULT_CLUBS);
  assert.equal(audit.complete, true, JSON.stringify(audit.issues.slice(0, 30)));
  assert.equal(audit.totalClubs, 156);
  assert.deepEqual(audit.divisionCounts, { D1:16, D2:20, D3:24, D4:32, D5:64 });
  assert.deepEqual(audit.conferenceCounts.D4, { Nord:16, Sud:16 });
  assert.deepEqual(audit.conferenceCounts.D5, { Nord:16, Sud:16, Est:16, Ouest:16 });
  assert.deepEqual(audit.quality, { named:156, located:156, stadiums:156, visualIdentities:156, rated:156, budgeted:156, rostered:156 });
});

test('P27 audit catalogue : détecte doublons d’identité et incohérences de données', () => {
  const clubs = DEFAULT_CLUBS.map(club => ({ ...club, location:club.location ? { ...club.location } : null, colors:[...club.colors], roster:club.roster.map(player=>({ ...player })) }));
  clubs[1].name = clubs[0].name;
  clubs[1].stadium = clubs[0].stadium;
  clubs[1].colors[0] = 'rouge';
  clubs[1].kitDesign = 'unknown-pattern';
  clubs[1].rating = 99;
  clubs[1].location.countryCode = 'BAD';
  clubs[1].roster[0].number = clubs[1].roster[1].number;
  const codes = new Set(auditClubCatalog(clubs).errors.map(issue=>issue.code));
  for (const code of ['duplicate-club-name','duplicate-club-stadium','invalid-club-color-palette','club-rating-out-of-division-range','club-location-incomplete','duplicate-player-shirt-number']) assert.ok(codes.has(code), `issue attendue: ${code}`);
});

test('P27 audit catalogue : une conférence explicite invalide ne se masque pas par la géographie', () => {
  const clubs = DEFAULT_CLUBS.map(club => ({ ...club }));
  const target = clubs.find(club => club.division === 'D5' && club.location?.city === 'Toamasina');
  target.conference = 'East';
  const audit = auditClubCatalog(clubs);
  assert.ok(audit.errors.some(issue => issue.code === 'invalid-explicit-conference' && issue.clubId === target.id));
});
