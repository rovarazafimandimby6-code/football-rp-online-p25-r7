import test from 'node:test';
import assert from 'node:assert/strict';
import { ClubManager } from '../src/club-manager.js';
import { CareerManager } from '../src/career-manager.js';

test('clubs: seuls les clubs ouverts peuvent être repris', () => {
  const clubs = new ClubManager();
  assert.equal(clubs.takeOver('antananarivo-fc', 'user-1').reason, 'club-not-available');
  assert.equal(clubs.takeOver('mahajanga-city', 'user-1').ok, true);
  assert.equal(clubs.takeOver('mahajanga-city', 'user-2').ok, false);
});

test('clubs: effectif limité et joueurs uniques', () => {
  const clubs = new ClubManager([{ id: 'test', name: 'Test', city: 'Tana', control: 'open', rating: 50, capacity: 1 }]);
  assert.equal(clubs.addPlayer('test', { id: 'p1', name: 'Joueur' }).ok, true);
  assert.equal(clubs.addPlayer('test', { id: 'p1' }).reason, 'already-registered');
  assert.equal(clubs.addPlayer('test', { id: 'p2' }).reason, 'roster-full');
});

test('calendrier: format 3v3 à 5v5 et forfait sous trois présents', () => {
  const clubs = new ClubManager();
  clubs.createFixture({ id: 'm1', homeClubId: 'antananarivo-fc', awayClubId: 'mahajanga-city', scheduledAt: '2026-12-01T14:00:00Z' });
  assert.equal(clubs.resolveAttendance('m1', 3, 5).result.format, '3v3');
  clubs.createFixture({ id: 'm2', homeClubId: 'toamasina-united', awayClubId: 'fianarantsoa-athletic', scheduledAt: '2026-12-02T14:00:00Z' });
  assert.equal(clubs.resolveAttendance('m2', 2, 5).result.outcome, 'away-forfeit');
});

test('classement: victoire attribue trois points', () => {
  const clubs = new ClubManager();
  clubs.createFixture({ id: 'm3', homeClubId: 'antananarivo-fc', awayClubId: 'mahajanga-city', scheduledAt: '2026-12-03T14:00:00Z' });
  clubs.resolveAttendance('m3', 5, 5);
  clubs.recordResult('m3', 4, 2);
  assert.equal(clubs.standings()[0].id, 'antananarivo-fc');
  assert.equal(clubs.getClub('antananarivo-fc').points, 3);
});

test('mercato: négociation et transfert uniquement pendant une fenêtre active', () => {
  const start = '2026-07-01T00:00:00Z'; const end = '2026-08-01T00:00:00Z';
  const career = new CareerManager({ initialCoins: 1000, transferWindows: [{ start, end }] });
  assert.equal(career.signContract({ clubId: 'club-a', salary: 25, durationDays: 365, signedAt: start }).ok, true);
  const offer = career.makeOffer({ fromClubId: 'club-b', salary: 40, fee: 300 });
  career.negotiate(offer.offer.id, { salary: 45 });
  assert.equal(career.acceptOffer(offer.offer.id, '2026-06-15T00:00:00Z').reason, 'window-closed');
  const accepted = career.acceptOffer(offer.offer.id, '2026-07-15T00:00:00Z');
  assert.equal(accepted.ok, true);
  assert.equal(accepted.clubId, 'club-b');
  assert.equal(accepted.wallet, 700);
  assert.equal(career.history.at(-1).type, 'transfer');
});

test('carrière: récompenses de match converties en expérience et monnaie', () => {
  const career = new CareerManager({ initialCoins: 100 });
  const reward = career.recordMatch({ result: 'win', goals: 2, assists: 1, cleanSheet: true });
  assert.equal(reward.experience, 70);
  assert.equal(career.wallet, 114);
});

test('calendrier: un double forfait ne donne aucun point', () => {
  const clubs = new ClubManager();
  clubs.createFixture({ id: 'double-1', homeClubId: 'antananarivo-fc', awayClubId: 'mahajanga-city', scheduledAt: '2026-12-04T14:00:00Z' });
  const result = clubs.resolveAttendance('double-1', 2, 1);
  assert.equal(result.result.outcome, 'double-forfeit');
  assert.equal(clubs.getClub('antananarivo-fc').points, 0);
  assert.equal(clubs.getClub('mahajanga-city').points, 0);
  assert.equal(clubs.getClub('antananarivo-fc').losses, 1);
});

test('calendrier: refuse les identifiants vides, présences et scores invalides', () => {
  const clubs = new ClubManager();
  assert.equal(clubs.createFixture({ homeClubId: 'antananarivo-fc', awayClubId: 'mahajanga-city', scheduledAt: '2026-12-05T14:00:00Z' }).reason, 'invalid-fixture');
  clubs.createFixture({ id: 'safe-1', homeClubId: 'antananarivo-fc', awayClubId: 'mahajanga-city', scheduledAt: '2026-12-05T14:00:00Z' });
  assert.equal(clubs.resolveAttendance('safe-1', 5, Infinity).reason, 'invalid-attendance');
  clubs.resolveAttendance('safe-1', 5, 5);
  assert.equal(clubs.recordResult('safe-1', Infinity, 1).reason, 'invalid-score');
});

test('clubs: les vues retournées ne permettent pas de modifier le roster interne', () => {
  const clubs = new ClubManager();
  clubs.addPlayer('antananarivo-fc', { id: 'p1', name: 'Test' });
  const view = clubs.getClub('antananarivo-fc');
  const player = view.roster.find(item => item.id === 'p1');
  player.name = 'Altéré';
  assert.equal(clubs.getClub('antananarivo-fc').roster.find(item => item.id === 'p1').name, 'Test');
});

test('mercato: identifiants uniques après rejet et dates invalides refusées', () => {
  const career = new CareerManager({ transferWindows: [{ start: '2026-07-01T00:00:00Z', end: '2026-08-01T00:00:00Z' }] });
  career.signContract({ clubId: 'club-a', durationDays: 365, signedAt: '2026-07-01T00:00:00Z' });
  const first = career.makeOffer({ fromClubId: 'club-b', salary: 30 });
  assert.equal(career.rejectOffer(first.offer.id), true);
  const second = career.makeOffer({ fromClubId: 'club-c', salary: 35 });
  assert.notEqual(first.offer.id, second.offer.id);
  assert.equal(career.makeOffer({ fromClubId: 'club-d', expiresAt: 'date-invalide' }).reason, 'invalid-expiry');
  assert.equal(career.negotiate(second.offer.id, { salary: Infinity }).reason, 'invalid-salary');
});

test('carrière: résultats invalides ne créent pas de récompense', () => {
  const career = new CareerManager();
  assert.equal(career.recordMatch({ result: 'win', goals: Infinity }).experience, 30);
  assert.equal(career.recordMatch({ result: 'unknown' }).reason, 'invalid-result');
});

test('clubs: un joueur ne peut pas être inscrit dans deux clubs', () => {
  const clubs = new ClubManager();
  assert.equal(clubs.addPlayer('antananarivo-fc', { id: 'unique-player' }).ok, true);
  assert.equal(clubs.addPlayer('mahajanga-city', { id: 'unique-player' }).reason, 'already-registered');
});

test('contrats: renouvellement met à jour le salaire et prolonge la durée', () => {
  const career = new CareerManager();
  const signedAt = '2026-01-01T00:00:00Z';
  career.signContract({ clubId: 'club-a', salary: 20, durationDays: 30, signedAt });
  const renewed = career.renewContract({ salary: 35, durationDays: 180, renewedAt: '2026-01-15T00:00:00Z' });
  assert.equal(renewed.ok, true);
  assert.equal(renewed.contract.salary, 35);
  assert.equal(renewed.contract.status, 'active');
  assert.equal(new Date(renewed.contract.expiresAt).toISOString(), '2026-07-14T00:00:00.000Z');
  assert.equal(career.history.at(-1).type, 'renewal');
});

test('contrats: expiration libère le joueur et annule les offres en attente', () => {
  const career = new CareerManager();
  const now = Date.now();
  career.signContract({ clubId: 'club-a', durationDays: 2, signedAt: new Date(now - 86400000).toISOString() });
  const offer = career.makeOffer({ fromClubId: 'club-b', expiresAt: new Date(now + 30 * 86400000).toISOString() });
  const status = career.refreshContractStatus(new Date(now + 3 * 86400000).toISOString());
  assert.equal(status.status, 'expired');
  assert.equal(career.clubId, null);
  assert.equal(career.contract.status, 'expired');
  assert.equal(career.offers.get(offer.offer.id).status, 'cancelled');
});

test('contrats: résiliation libère le joueur et conserve une trace', () => {
  const career = new CareerManager();
  career.signContract({ clubId: 'club-a', durationDays: 365, signedAt: '2026-01-01T00:00:00Z' });
  const ended = career.terminateContract('2026-02-01T00:00:00Z');
  assert.equal(ended.ok, true);
  assert.equal(career.clubId, null);
  assert.equal(career.contract.status, 'terminated');
  assert.equal(career.history.at(-1).type, 'termination');
  assert.equal(career.signContract({ clubId: 'club-b', signedAt: '2026-02-02T00:00:00Z' }).ok, true);
});

test('contrats: un contrat expiré ne peut pas conclure un transfert', () => {
  const now = Date.now();
  const career = new CareerManager({ transferWindows: [{ start: new Date(now - 86400000).toISOString(), end: new Date(now + 30 * 86400000).toISOString() }] });
  career.signContract({ clubId: 'club-a', durationDays: 2, signedAt: new Date(now - 86400000).toISOString() });
  const offer = career.makeOffer({ fromClubId: 'club-b' });
  assert.equal(offer.ok, true);
  assert.equal(career.acceptOffer(offer.offer.id, new Date(now + 3 * 86400000).toISOString()).reason, 'contract-expired');
});
