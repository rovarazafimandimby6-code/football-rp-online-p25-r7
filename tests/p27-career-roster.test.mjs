import test from 'node:test';
import assert from 'node:assert/strict';
import { ClubManager } from '../src/club-manager.js';
import { CareerManager } from '../src/career-manager.js';
import { createDefaultProfile } from '../src/player-profile.js';
import { CAREER_ROSTER_PLAYER_ID, syncCareerPlayerRoster } from '../src/career-roster-sync.js';

const clubSet = (capacity = 4) => new ClubManager([
  { id: 'club-a', name: 'Club A', countryCode: 'MG', control: 'ai', capacity },
  { id: 'club-b', name: 'Club B', countryCode: 'FR', control: 'ai', capacity }
], null, 'test-season');
const makeProfile = () => {
  const value = createDefaultProfile();
  value.identity.displayName = 'Rova Player';
  value.identity.number = 17;
  value.identity.role = 'FWD';
  value.progression.attributes = { pace: 80, shooting: 75, passing: 55, defense: 35, stamina: 70, control: 72 };
  return value;
};

test('P27 effectifs carrière : la signature inscrit le footballeur une seule fois dans le club', () => {
  const clubs = clubSet();
  const career = new CareerManager();
  const profile = makeProfile();
  assert.equal(career.signContract({ clubId: 'club-a', salary: 25, durationDays: 365 }).ok, true);
  const result = syncCareerPlayerRoster({ clubs, career, profile });
  assert.equal(result.ok, true);
  assert.equal(result.registered, true);
  assert.equal(result.player.id, CAREER_ROSTER_PLAYER_ID);
  assert.equal(result.player.name, 'Rova Player');
  assert.equal(result.player.role, 'FWD');
  assert.equal(result.player.number, 17);
  assert.equal(result.player.rating, 65);
  assert.equal(clubs.getClub('club-a').roster.filter(item => item.id === CAREER_ROSTER_PLAYER_ID).length, 1);
  assert.equal(clubs.getClub('club-b').roster.some(item => item.id === CAREER_ROSTER_PLAYER_ID), false);
});

test('P27 effectifs carrière : un transfert déplace le même joueur sans duplication', () => {
  const clubs = clubSet();
  const career = new CareerManager({
    initialCoins: 1000,
    transferWindows: [{ start: '2026-07-01T00:00:00Z', end: '2026-08-01T00:00:00Z' }]
  });
  const profile = makeProfile();
  career.signContract({ clubId: 'club-a', salary: 25, durationDays: 365, signedAt: '2026-07-01T00:00:00Z' });
  syncCareerPlayerRoster({ clubs, career, profile });
  const offer = career.makeOffer({ fromClubId: 'club-b', salary: 35, fee: 100, expiresAt: '2027-08-01T00:00:00Z' });
  assert.equal(offer.ok, true);
  assert.equal(career.acceptOffer(offer.offer.id, '2026-07-15T00:00:00Z').ok, true);
  const result = syncCareerPlayerRoster({ clubs, career, profile });
  assert.equal(result.ok, true);
  assert.equal(result.clubId, 'club-b');
  assert.equal(clubs.getClub('club-a').roster.some(item => item.id === CAREER_ROSTER_PLAYER_ID), false);
  assert.equal(clubs.getClub('club-b').roster.filter(item => item.id === CAREER_ROSTER_PLAYER_ID).length, 1);
});

test('P27 effectifs carrière : résiliation ou expiration libère la place dans le club', () => {
  const clubs = clubSet();
  const career = new CareerManager();
  const profile = makeProfile();
  career.signContract({ clubId: 'club-a', salary: 25, durationDays: 365 });
  syncCareerPlayerRoster({ clubs, career, profile });
  career.terminateContract();
  const released = syncCareerPlayerRoster({ clubs, career, profile });
  assert.equal(released.ok, true);
  assert.equal(released.registered, false);
  assert.equal(clubs.getClub('club-a').roster.some(item => item.id === CAREER_ROSTER_PLAYER_ID), false);

  career.signContract({ clubId: 'club-b', salary: 25, durationDays: 1, signedAt: '2026-01-01T00:00:00Z' });
  const expired = syncCareerPlayerRoster({ clubs, career, profile });
  assert.equal(expired.ok, true);
  assert.equal(expired.registered, false);
  assert.equal(career.clubId, null);
  assert.equal(clubs.getClub('club-b').roster.some(item => item.id === CAREER_ROSTER_PLAYER_ID), false);
});

test('P27 effectifs carrière : un effectif complet bloque le déplacement sans retirer le joueur source', () => {
  const clubs = clubSet(1);
  const career = new CareerManager();
  const profile = makeProfile();
  career.signContract({ clubId: 'club-a', salary: 25, durationDays: 365 });
  syncCareerPlayerRoster({ clubs, career, profile });
  assert.equal(clubs.addPlayer('club-b', { id: 'other-player', name: 'Autre joueur' }).ok, true);
  const moved = clubs.transferPlayer('club-a', 'club-b', CAREER_ROSTER_PLAYER_ID);
  assert.equal(moved.reason, 'roster-full');
  assert.equal(clubs.getClub('club-a').roster.some(item => item.id === CAREER_ROSTER_PLAYER_ID), true);
  assert.equal(clubs.getClub('club-b').roster.some(item => item.id === CAREER_ROSTER_PLAYER_ID), false);
});

test('P27 effectifs carrière : mise à jour du profil répercute le joueur déjà inscrit', () => {
  const clubs = clubSet();
  const career = new CareerManager();
  const profile = makeProfile();
  career.signContract({ clubId: 'club-a', salary: 25, durationDays: 365 });
  syncCareerPlayerRoster({ clubs, career, profile });
  profile.identity.displayName = 'Nouveau nom';
  profile.identity.role = 'MID';
  profile.progression.attributes.passing = 90;
  const updated = syncCareerPlayerRoster({ clubs, career, profile });
  assert.equal(updated.player.name, 'Nouveau nom');
  assert.equal(updated.player.role, 'MID');
  assert.equal(updated.player.attributes.passing, 90);
});
