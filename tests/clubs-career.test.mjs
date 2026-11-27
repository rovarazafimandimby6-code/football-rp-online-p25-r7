import test from 'node:test';
import assert from 'node:assert/strict';
import { ClubManager } from '../src/club-manager.js';
import { CareerManager } from '../src/career-manager.js';
import { syncCareerPlayerRoster } from '../src/career-roster-sync.js';

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
  assert.equal(accepted.wallet, 750);
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
  const clubs = new ClubManager([{ id: 'view-test', name: 'View Test', capacity: 12 }], null, 'view-test-p27');
  clubs.addPlayer('view-test', { id: 'p1', name: 'Test' });
  const view = clubs.getClub('view-test');
  const player = view.roster.find(item => item.id === 'p1');
  player.name = 'Altéré';
  assert.equal(clubs.getClub('view-test').roster.find(item => item.id === 'p1').name, 'Test');
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
  const clubs = new ClubManager([
    { id: 'unique-a', name: 'Unique A', capacity: 12 },
    { id: 'unique-b', name: 'Unique B', capacity: 12 }
  ], null, 'unique-player-test-p27');
  assert.equal(clubs.addPlayer('unique-a', { id: 'unique-player' }).ok, true);
  assert.equal(clubs.addPlayer('unique-b', { id: 'unique-player' }).reason, 'already-registered');
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


test('mercato: les offres échues passent automatiquement à expirées et sont persistées', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
  const career = new CareerManager({ storage, storageKey: 'expired-offers-p27' });
  career.signContract({ clubId: 'club-a', durationDays: 365, signedAt: '2030-01-01T00:00:00Z' });
  const offer = career.makeOffer({ fromClubId: 'club-b', expiresAt: '2030-02-01T00:00:00Z' });
  const refreshed = career.refreshOfferStatuses('2030-02-02T00:00:00Z');
  assert.equal(refreshed.updated, 1);
  assert.equal(career.offers.get(offer.offer.id).status, 'expired');
  const restored = new CareerManager({ storage, storageKey: 'expired-offers-p27' });
  assert.equal(restored.offers.get(offer.offer.id).status, 'expired');
});

test('mercato: les offres sans échéance restent ouvertes et une date invalide ne modifie rien', () => {
  const career = new CareerManager();
  career.signContract({ clubId: 'club-a', durationDays: 365, signedAt: '2030-01-01T00:00:00Z' });
  const offer = career.makeOffer({ fromClubId: 'club-b' });
  assert.deepEqual(career.refreshOfferStatuses('invalid-date'), { ok: false, reason: 'invalid-date', updated: 0 });
  assert.equal(career.refreshOfferStatuses('2030-01-01T00:00:00Z').updated, 0);
  assert.equal(career.offers.get(offer.offer.id).status, 'pending');
});


test('salaire : verse les semaines dues une seule fois et conserve le prochain paiement après rechargement', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) };
  const career = new CareerManager({ storage, storageKey: 'weekly-salary-p27', initialCoins: 50 });
  career.signContract({ clubId: 'club-a', salary: 120, durationDays: 90, signedAt: '2031-01-01T00:00:00Z' });
  const first = career.processSalary('2031-01-15T00:00:00Z');
  assert.equal(first.periods, 2);
  assert.equal(first.paid, 240);
  assert.equal(career.wallet, 290);
  assert.equal(career.processSalary('2031-01-15T00:00:00Z').paid, 0);
  const restored = new CareerManager({ storage, storageKey: 'weekly-salary-p27' });
  assert.equal(restored.processSalary('2031-01-15T00:00:00Z').paid, 0);
  assert.equal(restored.wallet, 290);
});

test('salaire : un contrat expiré ne verse que les échéances hebdomadaires atteintes avant son expiration', () => {
  const career = new CareerManager({ initialCoins: 0 });
  career.signContract({ clubId: 'club-a', salary: 200, durationDays: 10, signedAt: '2031-01-01T00:00:00Z' });
  const status = career.refreshContractStatus('2031-01-15T00:00:00Z');
  assert.equal(status.status, 'expired');
  assert.equal(career.wallet, 200);
  assert.equal(career.processSalary('2031-01-20T00:00:00Z').paid, 0);
  assert.equal(career.history.filter(item => item.type === 'salary').length, 1);
});

test('salaire : le renouvellement règle les périodes acquises avant de repartir sur un nouveau cycle', () => {
  const career = new CareerManager({ initialCoins: 0 });
  career.signContract({ clubId: 'club-a', salary: 100, durationDays: 90, signedAt: '2031-01-01T00:00:00Z' });
  const renewed = career.renewContract({ salary: 150, durationDays: 90, renewedAt: '2031-01-15T00:00:00Z' });
  assert.equal(renewed.ok, true);
  assert.equal(career.wallet, 200);
  assert.equal(career.contract.lastSalaryPaidAt, '2031-01-15T00:00:00.000Z');
  assert.equal(career.processSalary('2031-01-22T00:00:00Z').paid, 150);
});


test('contrats: expose la prochaine échéance salariale sans modifier le portefeuille', () => {
  const career = new CareerManager();
  const signedAt = '2030-01-01T12:00:00.000Z';
  career.signContract({ clubId: 'club-a', salary: 75, durationDays: 30, signedAt });
  const beforeDue = career.getSalaryStatus('2030-01-07T23:59:59.000Z');
  assert.equal(beforeDue.salary, 75);
  assert.equal(beforeDue.nextPaymentAt, '2030-01-08T12:00:00.000Z');
  assert.equal(beforeDue.daysUntilPayment, 1);
  assert.equal(career.wallet, 500);
  const atDue = career.getSalaryStatus('2030-01-08T12:00:00.000Z');
  assert.equal(atDue.daysUntilPayment, 0);
  assert.equal(career.wallet, 500);
});

test('contrats: aucune échéance salariale n’est annoncée après la fin du contrat', () => {
  const career = new CareerManager();
  career.signContract({ clubId: 'club-a', salary: 90, durationDays: 5, signedAt: '2030-01-01T00:00:00.000Z' });
  const status = career.getSalaryStatus('2030-01-02T00:00:00.000Z');
  assert.equal(status.paymentBeforeExpiry, false);
  assert.equal(status.nextPaymentAt, null);
  assert.equal(status.daysUntilPayment, null);
});

test('clubs: numéros de maillot uniques et attribution automatique à l’inscription', () => {
  const clubs = new ClubManager([{ id: 'shirts', name: 'Shirts', control: 'open', capacity: 5 }], null, 'shirt-test');
  const first = clubs.addPlayer('shirts', { id: 'shirt-a', name: 'A', number: 9 });
  const second = clubs.addPlayer('shirts', { id: 'shirt-b', name: 'B', number: 9 });
  assert.equal(first.number, 9);
  assert.equal(second.number, 1);
  assert.equal(clubs.getClub('shirts').roster.filter(player => player.number === 9).length, 1);
});

test('clubs: modification refuse un numéro déjà porté par un coéquipier', () => {
  const clubs = new ClubManager([{ id: 'shirts', name: 'Shirts', control: 'open', capacity: 5 }], null, 'shirt-edit-test');
  clubs.addPlayer('shirts', { id: 'shirt-a', number: 9 });
  clubs.addPlayer('shirts', { id: 'shirt-b', number: 10 });
  assert.equal(clubs.updatePlayer('shirts', { id: 'shirt-b', number: 9 }).reason, 'shirt-number-taken');
  assert.equal(clubs.updatePlayer('shirts', { id: 'shirt-b', number: 11 }).ok, true);
});

test('clubs: un transfert réattribue un numéro si celui-ci est déjà occupé dans le club cible', () => {
  const clubs = new ClubManager([
    { id: 'source', name: 'Source', control: 'open', capacity: 5 },
    { id: 'target', name: 'Target', control: 'open', capacity: 5 }
  ], null, 'shirt-transfer-test');
  clubs.addPlayer('source', { id: 'moving-player', number: 7 });
  clubs.addPlayer('target', { id: 'target-player', number: 7 });
  const transfer = clubs.transferPlayer('source', 'target', 'moving-player');
  assert.equal(transfer.ok, true);
  assert.equal(transfer.number, 1);
  assert.equal(clubs.getClub('source').roster.some(player => player.id === 'moving-player'), false);
  assert.equal(clubs.getClub('target').roster.filter(player => player.number === 7).length, 1);
  assert.equal(clubs.getClub('target').roster.filter(player => player.number === 1).length, 1);
});


test('P27 génération: les notes individuelles suivent des fourchettes par division avec chevauchement', async () => {
  const { generateClubRoster } = await import('../src/club-roster.js');
  const bands = { D1:[65,84], D2:[59,77], D3:[53,70], D4:[47,64], D5:[40,58] };
  for (const [division, [min,max]] of Object.entries(bands)) {
    const roster = generateClubRoster({ id: `rating-${division}`, division, rating: 65 }, { size: 12 });
    assert.equal(roster.length, 12);
    assert.ok(roster.every(player => player.rating >= min && player.rating <= max));
    assert.ok(roster.every(player => player.potential >= player.rating && player.potential <= 99));
    assert.ok(roster.every(player => ['standard','good','high','exceptional'].includes(player.potentialBand)));
  }
});

test('P27 génération: les profils de nationalité sont internationaux et reproductibles', async () => {
  const { generateClubRoster } = await import('../src/club-roster.js');
  const club = { id:'international-test', division:'D3', rating:61, countryCode:'MG' };
  const first = generateClubRoster(club, { size:12 });
  const second = generateClubRoster(club, { size:12 });
  assert.deepEqual(first.map(player => player.nationality), second.map(player => player.nationality));
  assert.ok(new Set(first.map(player => player.nationality)).size >= 5);
  assert.ok(first.some(player => player.nationality === 'MG'));
  assert.ok(first.some(player => player.nationality !== 'MG'));
});

test('P27 clubs: caractéristiques sportives, économiques et structurelles bornées', () => {
  const clubs = new ClubManager();
  for (const club of clubs.listClubs()) {
    assert.ok(club.capacity <= 12);
    for (const key of ['popularity','attractiveness','infrastructure','management']) {
      assert.ok(club.characteristics[key] >= 1 && club.characteristics[key] <= 100);
    }
  }
});

test('P27 joueurs: le plafond de 12 joueurs est appliqué même si la donnée entrante demande davantage', () => {
  const clubs = new ClubManager([{ id:'capacity-limit', name:'Capacity Limit', capacity:30 }], null, 'capacity-limit-p27');
  assert.equal(clubs.getClub('capacity-limit').capacity, 12);
});


test('P27 catalogue: le premier club D4 est réservé au système si la division est présente sans réserve', () => {
  const clubs = new ClubManager([
    { id:'d4-alpha', name:'D4 Alpha', division:'D4', control:'ai', capacity:12 },
    { id:'d4-beta', name:'D4 Beta', division:'D4', control:'open', capacity:12 }
  ], null, 'd4-auto-reservation-test');
  assert.equal(clubs.getClub('d4-alpha').humanAdmission, 'system-only');
  assert.equal(clubs.getClub('d4-beta').humanAdmission, 'open');
  assert.equal(clubs.takeOver('d4-alpha', 'human-d4').reason, 'club-not-available');
});


test('P27 clubs: prestige, puissance, ambition et finances restent des dimensions séparées', async () => {
  const { generateClubStrategicProfile } = await import('../src/club-profile.js');
  const prestigiousModest = generateClubStrategicProfile({ id:'prestige-modest', division:'D1', rating:73, reputation:92, budget:300000 });
  const wealthyUnderdog = generateClubStrategicProfile({ id:'wealthy-underdog', division:'D5', rating:43, reputation:35, budget:5000000 });
  assert.equal(prestigiousModest.prestigeTier, 'iconic');
  assert.equal(prestigiousModest.strengthTier, 'competitive');
  assert.equal(wealthyUnderdog.financialTier, 'major');
  assert.equal(wealthyUnderdog.strengthTier, 'underdog');
  assert.equal(wealthyUnderdog.competitiveVariance.upsetPossible, true);
});

test('P27 joueurs: les profils de fidélité couvrent les joueurs fidèles, mobiles et presque intransférables', async () => {
  const { generateClubRoster } = await import('../src/club-roster.js');
  const roster = Array.from({ length:40 }, (_, index) => generateClubRoster({ id:`loyalty-spectrum-${index}`, division:'D2', rating:68 }, { size:12 })).flat();
  assert.ok(roster.every(player => player.loyalty.clubLoyalty >= 0 && player.loyalty.clubLoyalty <= 100));
  assert.ok(roster.every(player => player.loyalty.transferWillingness >= 0 && player.loyalty.transferWillingness <= 100));
  assert.ok(roster.some(player => player.loyalty.departurePolicy === 'no-normal-exit'));
  assert.ok(roster.some(player => player.loyalty.departurePolicy === 'ambitious'));
});

test('P27 clubs: un club réservé au système ne reste jamais marqué comme disponible à la reprise', () => {
  const clubs = new ClubManager();
  const reserved = clubs.getClub('nairobi-tana-academy');
  assert.equal(reserved.humanAdmission, 'system-only');
  assert.equal(reserved.control, 'ai');
  assert.equal(clubs.takeOver('nairobi-tana-academy','human-reserved').reason, 'club-not-available');
});


test('P27 catalogue: l’audit identifie les divisions, conférences et réservations manquantes sans inventer de clubs', async () => {
  const { auditClubCatalog } = await import('../src/club-catalog-validation.js');
  const audit = auditClubCatalog(new ClubManager().listClubs());
  assert.equal(audit.totalClubs, 156);
  assert.equal(audit.expectedTotal, 156);
  assert.equal(audit.complete, true, JSON.stringify(audit.issues.slice(0, 30)));
  assert.deepEqual(audit.divisionCounts, { D1:16, D2:20, D3:24, D4:32, D5:64 });
  assert.deepEqual(audit.conferenceCounts.D4, { A:16, B:16 });
  assert.deepEqual(audit.conferenceCounts.D5, { A:16, B:16, C:16, D:16 });
  assert.ok(Object.values(audit.systemOnlyCounts).every(count => count >= 1));
  assert.equal(audit.errors.length, 0);
  assert.equal(audit.warnings.length, 0);
});

test('P27 catalogue: l’audit détecte les effectifs faibles et les conflits de club réservé', async () => {
  const { auditClubCatalog } = await import('../src/club-catalog-validation.js');
  const audit = auditClubCatalog([{
    id:'audit-invalid', division:'D1', capacity:12, control:'open', humanAdmission:'system-only',
    recruitmentProfile:{ mode:'country', nationalityCodes:['FR'] },
    roster:[{ id:'player-a', rating:60, nationality:'MG' }]
  }]);
  assert.ok(audit.errors.some(issue => issue.code === 'above-average-player-missing'));
  assert.ok(audit.errors.some(issue => issue.code === 'system-only-control-conflict'));
  assert.ok(audit.errors.some(issue => issue.code === 'recruitment-nationality-mismatch'));
});


test('clubs: chaque club starter possède une implantation principale structurée et indépendante de son recrutement', () => {
  const clubs = new ClubManager();
  const manparis = clubs.getClub('manparis-sporting');
  const antananarivo = clubs.getClub('antananarivo-fc');
  assert.deepEqual(manparis.location, { city:'Manchester', country:'Royaume-Uni', countryCode:'GB' });
  assert.equal(manparis.countryCode, 'GB');
  assert.deepEqual(antananarivo.location, { city:'Antananarivo', country:'Madagascar', countryCode:'MG' });
  manparis.location.city = 'Modifié';
  assert.equal(clubs.getClub('manparis-sporting').location.city, 'Manchester');
});

test('conférences: les affectations explicites priment sur les villes descriptives', async () => {
  const { conferenceForClub } = await import('../src/league-structure.js');
  assert.equal(conferenceForClub({ division:'D5', city:'Ville inconnue / Nairobi', location:{ city:'Antsiranana' }, conference:'A' }), 'A');
  assert.equal(conferenceForClub({ division:'D5', city:'Nairobi / Antananarivo' }), null);
  assert.equal(conferenceForClub({ division:'D5', city:'Ville inconnue' }), null);
});


test('P27 identité: les joueurs du système sont identifiés séparément du contrôle temporaire', () => {
  const clubs = new ClubManager();
  const systemPlayer = clubs.getClub('antananarivo-fc').roster[0];
  assert.equal(systemPlayer.playerType, 'system');
  assert.equal(systemPlayer.controlStatus, 'system');
  const custom = new ClubManager([{ id:'identity', name:'Identity', control:'open', capacity:3 }], null, 'identity-p27');
  assert.equal(custom.addPlayer('identity', { id:'human-1', name:'Humain' }).ok, true);
  assert.equal(custom.getClub('identity').roster[0].playerType, 'human');
  assert.equal(custom.setPlayerControlStatus('identity', 'human-1', 'automated').ok, true);
  const disconnected = custom.getClub('identity').roster[0];
  assert.equal(disconnected.playerType, 'human');
  assert.equal(disconnected.controlStatus, 'automated');
  assert.equal(custom.setPlayerControlStatus('identity', 'human-1', 'human').ok, true);
});

test('P27 effectif: sept humains maximum, même si des places restent disponibles', () => {
  const custom = new ClubManager([{ id:'human-cap', name:'Human Cap', control:'open', capacity:12 }], null, 'human-cap-p27');
  for (let i=1;i<=7;i++) assert.equal(custom.addPlayer('human-cap', { id:`human-${i}` }).ok, true);
  assert.equal(custom.addPlayer('human-cap', { id:'human-8' }).reason, 'human-player-limit');
  assert.equal(custom.addPlayer('human-cap', { id:'system-extra', playerType:'system' }).ok, true);
  assert.equal(custom.getClub('human-cap').roster.length, 8);
});

test('P27 effectif: un transfert humain respecte le plafond de sept du club receveur', () => {
  const custom = new ClubManager([
    { id:'human-source', name:'Source', control:'open', capacity:12 },
    { id:'human-target', name:'Target', control:'open', capacity:12 }
  ], null, 'human-transfer-cap-p27');
  custom.addPlayer('human-source', { id:'moving-human' });
  for (let i=1;i<=7;i++) custom.addPlayer('human-target', { id:`target-human-${i}` });
  assert.equal(custom.transferPlayer('human-source','human-target','moving-human').reason, 'human-player-limit');
  assert.equal(custom.getClub('human-source').roster.some(p=>p.id==='moving-human'), true);
});

test('P27 admission: les clubs réservés au système refusent les joueurs humains', () => {
  const custom = new ClubManager([{ id:'system-only-test', name:'System Only', humanAdmission:'system-only', capacity:12 }], null, 'system-only-human-p27');
  assert.equal(custom.addPlayer('system-only-test', { id:'blocked-human' }).reason, 'human-admission-closed');
  assert.equal(custom.addPlayer('system-only-test', { id:'allowed-system', playerType:'system' }).ok, true);
});

test('P27 audit: détecte les dépassements humains, les identifiants dupliqués et les types invalides', async () => {
  const { auditClubCatalog } = await import('../src/club-catalog-validation.js');
  const result = auditClubCatalog([
    { id:'audit-a', division:'D1', capacity:12, roster:Array.from({length:8},(_,i)=>({id:`p${i}`,playerType:'human',controlStatus:'human',rating:80})) },
    { id:'audit-b', division:'D1', capacity:12, roster:[{id:'p0',playerType:'unknown',rating:80}] }
  ]);
  assert.ok(result.errors.some(issue=>issue.code==='human-player-limit-exceeded'));
  assert.ok(result.errors.some(issue=>issue.code==='duplicate-player-id'));
  assert.ok(result.errors.some(issue=>issue.code==='invalid-player-type'));
});

test('P27 carrière : une panne de sauvegarde annule la signature et restaure le profil',()=>{
  const values=new Map();
  let failWrites=false;
  const storage={
    getItem:key=>values.get(key)??null,
    setItem:(key,value)=>{if(failWrites)throw new Error('DISK_FULL');values.set(key,String(value));}
  };
  const career=new CareerManager({storage,storageKey:'career-sign-atomic-p27',initialCoins:900});
  failWrites=true;
  const result=career.signContract({clubId:'club-a',salary:40,durationDays:180,signedAt:'2032-01-01T00:00:00Z'});
  assert.deepEqual(result,{ok:false,reason:'persistence-failed'});
  assert.equal(career.clubId,null);
  assert.equal(career.contract,null);
  assert.equal(career.history.length,0);
  assert.equal(values.has('career-sign-atomic-p27'),false);
});

test('P27 carrière : une panne de sauvegarde annule le transfert et conserve l’offre',()=>{
  const values=new Map();
  let failWrites=false;
  const storage={
    getItem:key=>values.get(key)??null,
    setItem:(key,value)=>{if(failWrites)throw new Error('DISK_FULL');values.set(key,String(value));}
  };
  const career=new CareerManager({
    storage,storageKey:'career-transfer-atomic-p27',initialCoins:1000,
    transferWindows:[{start:'2032-01-01T00:00:00Z',end:'2032-02-01T00:00:00Z'}]
  });
  assert.equal(career.signContract({clubId:'club-a',salary:50,durationDays:365,signedAt:'2032-01-01T00:00:00Z'}).ok,true);
  const offer=career.makeOffer({fromClubId:'club-b',salary:70,fee:250});
  assert.equal(offer.ok,true);
  const saved=values.get('career-transfer-atomic-p27');
  failWrites=true;
  const result=career.acceptOffer(offer.offer.id,'2032-01-15T00:00:00Z');
  assert.deepEqual(result,{ok:false,reason:'persistence-failed'});
  assert.equal(career.clubId,'club-a');
  assert.equal(career.wallet,1000);
  assert.equal(career.offers.get(offer.offer.id).status,'pending');
  assert.ok(career.history.some(item=>item.type==='signing'));
  assert.equal(career.history.at(-1).type,'offer-received');
  assert.equal(values.get('career-transfer-atomic-p27'),saved);
});

test('P27 mercato : une panne de sauvegarde annule la négociation et le rejet d’offre',()=>{
  const values=new Map();
  let failWrites=false;
  const storage={
    getItem:key=>values.get(key)??null,
    setItem:(key,value)=>{if(failWrites)throw new Error('DISK_FULL');values.set(key,String(value));}
  };
  const career=new CareerManager({
    storage,storageKey:'career-offer-edit-atomic-p27',
    transferWindows:[{start:'2033-01-01T00:00:00Z',end:'2033-02-01T00:00:00Z'}]
  });
  assert.equal(career.signContract({clubId:'club-a',durationDays:365,signedAt:'2033-01-01T00:00:00Z'}).ok,true);
  const offer=career.makeOffer({fromClubId:'club-b',salary:40,fee:100});
  const saved=values.get('career-offer-edit-atomic-p27');
  failWrites=true;
  assert.deepEqual(career.negotiate(offer.offer.id,{salary:75,fee:250},'2033-01-02T00:00:00Z'),{ok:false,reason:'persistence-failed'});
  assert.equal(career.offers.get(offer.offer.id).salary,40);
  assert.equal(career.offers.get(offer.offer.id).fee,100);
  assert.equal(career.rejectOffer(offer.offer.id),false);
  assert.equal(career.offers.get(offer.offer.id).status,'pending');
  assert.equal(values.get('career-offer-edit-atomic-p27'),saved);
});

test('P27 effectifs : un échec de sauvegarde annule le transfert sans perdre le joueur source',()=>{
  const values=new Map();
  let failWrites=false;
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{if(failWrites)throw new Error('DISK_FULL');values.set(key,String(value));}};
  const clubs=new ClubManager([
    {id:'atomic-source',name:'Atomic Source',control:'open',capacity:5},
    {id:'atomic-target',name:'Atomic Target',control:'open',capacity:5}
  ],storage,'club-transfer-atomic-p27');
  assert.equal(clubs.addPlayer('atomic-source',{id:'atomic-moving-player',playerType:'system',number:8}).ok,true);
  const before=values.get('club-transfer-atomic-p27');
  failWrites=true;
  const result=clubs.transferPlayer('atomic-source','atomic-target','atomic-moving-player');
  assert.deepEqual(result,{ok:false,reason:'roster-persistence-failed'});
  assert.equal(clubs.getClub('atomic-source').roster.some(player=>player.id==='atomic-moving-player'),true);
  assert.equal(clubs.getClub('atomic-target').roster.some(player=>player.id==='atomic-moving-player'),false);
  assert.equal(values.get('club-transfer-atomic-p27'),before);
});

test('P27 salaire : une panne de sauvegarde ne crédite pas deux fois une échéance',()=>{
  const values=new Map();
  let failWrites=false;
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{if(failWrites)throw new Error('DISK_FULL');values.set(key,String(value));}};
  const career=new CareerManager({storage,storageKey:'career-salary-atomic-p27',initialCoins:100});
  assert.equal(career.signContract({clubId:'club-a',salary:80,durationDays:60,signedAt:'2034-01-01T00:00:00Z'}).ok,true);
  const saved=values.get('career-salary-atomic-p27');
  failWrites=true;
  const failed=career.processSalary('2034-01-15T00:00:00Z');
  assert.deepEqual(failed,{ok:false,reason:'persistence-failed',paid:0,periods:0});
  assert.equal(career.wallet,100);
  assert.equal(career.contract.lastSalaryPaidAt,'2034-01-01T00:00:00.000Z');
  assert.equal(career.history.some(item=>item.type==='salary'),false);
  assert.equal(values.get('career-salary-atomic-p27'),saved);
});

test('P27 mercato : une panne de sauvegarde conserve les offres et contrats non expirés',()=>{
  const values=new Map();
  let failWrites=false;
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>{if(failWrites)throw new Error('DISK_FULL');values.set(key,String(value));}};
  const career=new CareerManager({storage,storageKey:'career-expiry-atomic-p27'});
  assert.equal(career.signContract({clubId:'club-a',durationDays:1,signedAt:'2035-01-01T00:00:00Z'}).ok,true);
  const offer=career.makeOffer({fromClubId:'club-b',expiresAt:'2035-01-02T00:00:00Z'});
  const saved=values.get('career-expiry-atomic-p27');
  failWrites=true;
  assert.deepEqual(career.refreshOfferStatuses('2035-01-03T00:00:00Z'),{ok:false,reason:'persistence-failed',updated:0});
  assert.equal(career.offers.get(offer.offer.id).status,'pending');
  const expired=career.refreshContractStatus('2035-01-03T00:00:00Z');
  assert.equal(expired.persistenceFailed,true);
  assert.equal(career.clubId,'club-a');
  assert.equal(career.contract.status,'active');
  assert.equal(values.get('career-expiry-atomic-p27'),saved);
});

function failingCareerStorage(key){
  const values=new Map();let failWrites=false;
  return {
    values,
    storage:{getItem:name=>values.get(name)??null,setItem:(name,value)=>{if(failWrites)throw new Error('DISK_FULL');values.set(name,String(value));}},
    fail(){failWrites=true;}
  };
}

test('P27 contrat : une panne de sauvegarde annule le renouvellement sans modifier salaire ni échéance',()=>{
  const fixture=failingCareerStorage();
  const career=new CareerManager({storage:fixture.storage,storageKey:'career-renew-atomic-p27',initialCoins:700});
  assert.equal(career.signContract({clubId:'club-renew',salary:80,durationDays:90,signedAt:'2034-01-01T00:00:00Z'}).ok,true);
  const before=JSON.stringify(career.snapshot());
  fixture.fail();
  assert.deepEqual(career.renewContract({salary:120,durationDays:240,renewedAt:'2034-01-15T00:00:00Z'}),{ok:false,reason:'persistence-failed'});
  assert.equal(JSON.stringify(career.snapshot()),before);
});

test('P27 contrat : une panne de sauvegarde annule la résiliation et conserve le club',()=>{
  const fixture=failingCareerStorage();
  const career=new CareerManager({storage:fixture.storage,storageKey:'career-terminate-atomic-p27'});
  assert.equal(career.signContract({clubId:'club-terminate',salary:50,durationDays:90,signedAt:'2034-01-01T00:00:00Z'}).ok,true);
  const before=JSON.stringify(career.snapshot());
  fixture.fail();
  assert.deepEqual(career.terminateContract('2034-01-15T00:00:00Z'),{ok:false,reason:'persistence-failed'});
  assert.equal(JSON.stringify(career.snapshot()),before);
});

test('P27 récompenses : une panne de sauvegarde annule pièces, expérience et identifiant de match',()=>{
  const fixture=failingCareerStorage();
  const career=new CareerManager({storage:fixture.storage,storageKey:'career-match-reward-atomic-p27',initialCoins:300});
  const before=JSON.stringify(career.snapshot());
  fixture.fail();
  assert.deepEqual(career.recordMatch({result:'win',goals:2,assists:1,matchId:'match-atomic-reward'}),{ok:false,reason:'persistence-failed'});
  assert.equal(JSON.stringify(career.snapshot()),before);
  assert.equal(career.recordMatch({result:'win',matchId:'match-atomic-reward'}).ok,false);
});


test('P27 carrière : le renouvellement règle les salaires échus une seule fois avant de prolonger', () => {
  const career = new CareerManager({ initialCoins:100 });
  career.signContract({ clubId:'club-a', salary:80, durationDays:90, signedAt:'2036-01-01T00:00:00Z' });
  const renewed = career.renewContract({ salary:100, durationDays:180, renewedAt:'2036-01-15T00:00:00Z' });
  assert.equal(renewed.ok,true);
  assert.equal(career.wallet,260);
  assert.equal(career.history.filter(item=>item.type==='salary').length,1);
  assert.equal(career.history.filter(item=>item.type==='renewal').length,1);
  assert.equal(career.contract.lastSalaryPaidAt,'2036-01-15T00:00:00.000Z');
});

test('P27 carrière : la résiliation règle les salaires échus et libère le contrat en une opération', () => {
  const career = new CareerManager({ initialCoins:100 });
  career.signContract({ clubId:'club-a', salary:80, durationDays:90, signedAt:'2036-01-01T00:00:00Z' });
  const ended = career.terminateContract('2036-01-15T00:00:00Z');
  assert.equal(ended.ok,true);
  assert.equal(career.wallet,260);
  assert.equal(career.clubId,null);
  assert.equal(career.contract.status,'terminated');
  assert.equal(career.history.filter(item=>item.type==='salary').length,1);
  assert.equal(career.history.at(-1).type,'termination');
});

test('P27 mercato : la couche métier refuse une sixième offre en attente', () => {
  const career = new CareerManager();
  career.signContract({ clubId:'club-current', durationDays:365 });
  for (let index=0; index<5; index++) {
    const result=career.makeOffer({ fromClubId:`club-${index}`});
    assert.equal(result.ok,true);
  }
  assert.deepEqual(career.makeOffer({ fromClubId:'club-sixth' }),{ok:false,reason:'pending-offer-limit'});
  assert.equal([...career.offers.values()].filter(offer=>offer.status==='pending').length,5);
});

test('P27 mercato : une offre expirée libère une place dans la limite des cinq', () => {
  const career = new CareerManager();
  career.signContract({ clubId:'club-current', durationDays:365, signedAt:'2037-01-01T00:00:00Z' });
  for (let index=0; index<5; index++) {
    const result=career.makeOffer({ fromClubId:`club-expire-${index}`, expiresAt:'2037-01-02T00:00:00Z', at:'2037-01-01T00:00:00Z' });
    assert.equal(result.ok,true);
  }
  const replacement=career.makeOffer({ fromClubId:'club-new', expiresAt:'2037-01-04T00:00:00Z', at:'2037-01-03T00:00:00Z' });
  assert.equal(replacement.ok,true);
  assert.equal([...career.offers.values()].filter(offer=>offer.status==='pending').length,1);
  assert.equal([...career.offers.values()].filter(offer=>offer.status==='expired').length,5);
});


test('P27 mercato : le salaire hebdomadaire échu est crédité avant de vérifier le coût du transfert', () => {
  const career = new CareerManager({
    initialCoins:100,
    transferWindows:[{start:'2038-01-01T00:00:00Z',end:'2038-02-01T00:00:00Z'}]
  });
  career.signContract({clubId:'club-current',salary:80,durationDays:90,signedAt:'2038-01-01T00:00:00Z'});
  const offer=career.makeOffer({fromClubId:'club-new',salary:100,fee:250,at:'2038-01-01T00:00:00Z'});
  const accepted=career.acceptOffer(offer.offer.id,'2038-01-15T00:00:00Z');
  assert.equal(accepted.ok,true);
  assert.equal(career.wallet,10);
  assert.equal(career.clubId,'club-new');
});

test('P27 mercato : accepter une offre annule les autres propositions et historise chaque étape', () => {
  const career = new CareerManager({
    initialCoins:1000,
    transferWindows:[{start:'2039-01-01T00:00:00Z',end:'2039-02-01T00:00:00Z'}]
  });
  career.signContract({clubId:'club-current',durationDays:365,signedAt:'2039-01-01T00:00:00Z'});
  const first=career.makeOffer({fromClubId:'club-first',salary:40,fee:100,at:'2039-01-01T00:00:00Z'});
  const second=career.makeOffer({fromClubId:'club-second',salary:45,fee:120,at:'2039-01-01T00:00:00Z'});
  assert.equal(career.negotiate(first.offer.id,{salary:55,fee:90},'2039-01-02T00:00:00Z').ok,true);
  assert.equal(career.acceptOffer(first.offer.id,'2039-01-03T00:00:00Z').ok,true);
  assert.equal(career.offers.get(second.offer.id).status,'cancelled');
  assert.deepEqual(career.history.filter(item=>item.type.startsWith('offer-')).map(item=>item.type),['offer-received','offer-received','offer-negotiated','offer-cancelled']);
});

test('P27 mercato : refuser une offre déjà expirée l’enregistre comme expirée, pas comme refusée', () => {
  const career = new CareerManager();
  career.signContract({clubId:'club-current',durationDays:365,signedAt:'2040-01-01T00:00:00Z'});
  const offer=career.makeOffer({fromClubId:'club-other',expiresAt:'2040-01-02T00:00:00Z',at:'2040-01-01T00:00:00Z'});
  assert.equal(career.rejectOffer(offer.offer.id,'2040-01-03T00:00:00Z'),false);
  assert.equal(career.offers.get(offer.offer.id).status,'expired');
  assert.equal(career.history.at(-1).type,'offer-expired');
});


test('P27 mercato : la fin ou la résiliation du contrat annule et historise les offres encore ouvertes', () => {
  const career = new CareerManager();
  career.signContract({clubId:'club-current',durationDays:1,signedAt:'2041-01-01T00:00:00Z'});
  const offer=career.makeOffer({fromClubId:'club-other',at:'2041-01-01T00:00:00Z'});
  assert.equal(offer.ok,true);
  career.terminateContract('2041-01-01T12:00:00Z');
  assert.equal(career.offers.get(offer.offer.id).status,'cancelled');
  assert.ok(career.history.some(item=>item.type==='offer-cancelled'&&item.reason==='contract-terminated'));
});

test('carrière : le club du contrat actif reste la référence si le clubId historique est incohérent', async () => {
  const clubs = new ClubManager([
    { id: 'contract-club', name: 'Club du contrat', capacity: 12 },
    { id: 'stale-club', name: 'Ancien identifiant', capacity: 12 }
  ], null, 'career-contract-source-of-truth');
  const career = new CareerManager();
  const now = new Date().toISOString();
  assert.equal(career.signContract({ clubId: 'contract-club', salary: 100, durationDays: 365, signedAt: now }).ok, true);
  assert.equal(clubs.addPlayer('contract-club', { id: 'career-player', name: 'Joueur carrière', playerType: 'human' }).ok, true);
  career.clubId = 'stale-club';
  const profile = {
    identity: { displayName: 'Joueur carrière', role: 'MID' },
    progression: { attributes: { pace: 50, shooting: 50, passing: 50, defense: 50, stamina: 50, control: 50 }, level: 1 },
    appearance: {}
  };
  const synced = syncCareerPlayerRoster({ clubs, career, profile });
  assert.equal(synced.ok, true);
  assert.equal(synced.clubId, 'contract-club');
  assert.equal(clubs.getClub('contract-club').roster.some(player => player.id === 'career-player'), true);
  assert.equal(clubs.getClub('stale-club').roster.some(player => player.id === 'career-player'), false);
  assert.equal(synced.player.contract.clubId, 'contract-club');
});

test('mercato : refuse deux offres simultanées du même club', () => {
  const career = new CareerManager();
  career.signContract({ clubId: 'club-a', durationDays: 365, signedAt: '2032-01-01T00:00:00Z' });
  const first = career.makeOffer({ fromClubId: 'club-b', salary: 40 });
  assert.equal(first.ok, true);
  assert.equal(career.makeOffer({ fromClubId: 'club-b', salary: 45 }).reason, 'duplicate-pending-offer');
  assert.equal(career.makeOffer({ fromClubId: 'club-c', salary: 45 }).ok, true);
});
