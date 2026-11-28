import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountRecoveryPlan } from '../src/account-recovery-mapping.js';

const snapshot = () => ({
  schemaVersion: 1,
  profile: {
    identity: { displayName: 'Rova', number: 10, preferredFoot: 'right', role: 'MID' },
    appearance: { kit: 'emerald' },
    progression: { level: 2, experience: 5, coins: 250, trainingPoints: 0, attributes: { pace: 55 } },
    appliedMatchIds: ['local-old-match']
  },
  progression: {
    level: 4, experience: 20, coins: 900, trainingPoints: 2,
    attributes: { pace: 70, shooting: 50, passing: 50, defense: 45, stamina: 55, control: 50 },
    processedMatchIds: ['online-match-1']
  },
  career: { totals: { matches: 1 }, matches: [{ matchId: 'account-career-match', result: 'win' }] },
  playerCareer: { totals: { matches: 2 }, matches: [{ matchId: 'player-career-match', result: 'draw', stats: { goals: 1 } }] },
  seasonStats: { totals: { matches: 2, goals: 1 }, matches: [{ matchId: 'player-career-match', result: 'draw', goals: 1 }], processedMatchIds: ['player-career-match'] },
  contract: { wallet: 2500, clubId: 'club-1', contract: null, offers: [], history: [], loanOffers: [], loanHistory: [] }
});

test('P27 mapping : progression serveur remplace la progression potentiellement obsolète du profil', () => {
  const plan = buildAccountRecoveryPlan(snapshot());
  assert.equal(plan.stores.profileProgression.progression.level, 4);
  assert.equal(plan.stores.profileProgression.progression.coins, 900);
  assert.deepEqual(plan.stores.profileProgression.appliedMatchIds, ['local-old-match', 'online-match-1']);
});

test('P27 mapping : conserve les statistiques de saison dans le format du store local', () => {
  const plan = buildAccountRecoveryPlan(snapshot());
  assert.deepEqual(plan.stores.seasonStats, snapshot().seasonStats);
});

test('P27 mapping : ne confond pas les deux historiques de carrière', () => {
  const input = snapshot();
  const plan = buildAccountRecoveryPlan(input);
  assert.deepEqual(plan.stores.onlineCareerArchive, input.career);
  assert.deepEqual(plan.stores.playerCareerArchive, input.playerCareer);
  assert.notEqual(plan.stores.onlineCareerArchive, plan.stores.playerCareerArchive);
});

test('P27 mapping : conserve le contrat et les données de prêt sans conversion destructive', () => {
  const input = snapshot();
  input.contract.loanOffers = [{ id: 'loan-1', status: 'pending' }];
  input.contract.loanHistory = [{ type: 'loan-return' }];
  const plan = buildAccountRecoveryPlan(input);
  assert.deepEqual(plan.stores.transferCareerArchive, input.contract);
  assert.equal(plan.mapping.transferCareerArchive, 'server.contract (complete; includes loans)');
});

test('P27 mapping : ne modifie jamais le snapshot source', () => {
  const input = snapshot();
  const before = structuredClone(input);
  buildAccountRecoveryPlan(input);
  assert.deepEqual(input, before);
});

test('P27 mapping : refuse les sections absentes ou les structures de store incompatibles', () => {
  const missing = snapshot();
  delete missing.playerCareer;
  assert.throws(() => buildAccountRecoveryPlan(missing), { message: 'INVALID_RECOVERY_SNAPSHOT' });
  const malformed = snapshot();
  malformed.progression.processedMatchIds = null;
  assert.throws(() => buildAccountRecoveryPlan(malformed), { message: 'INVALID_RECOVERY_STORE_MAPPING' });
});


test('P27 mapping : refuse les historiques de carrière tronqués, dupliqués ou mal typés', () => {
  const duplicateCareer = snapshot();
  duplicateCareer.career.matches.push({ matchId: 'account-career-match', result: 'win' });
  assert.throws(() => buildAccountRecoveryPlan(duplicateCareer), { message: 'INVALID_RECOVERY_CAREER' });

  const malformedPlayerCareer = snapshot();
  malformedPlayerCareer.playerCareer.matches = [{ matchId: 'player-career-match', result: 'abandoned' }];
  assert.throws(() => buildAccountRecoveryPlan(malformedPlayerCareer), { message: 'INVALID_RECOVERY_PLAYER_CAREER' });

  const malformedSeason = snapshot();
  malformedSeason.seasonStats.matches = [{ matchId: '', result: 'win' }];
  assert.throws(() => buildAccountRecoveryPlan(malformedSeason), { message: 'INVALID_RECOVERY_SEASON_STATS' });
});

test('P27 mapping : refuse les ressources et historiques contractuels incohérents', () => {
  const negativeWallet = snapshot();
  negativeWallet.contract.wallet = -1;
  assert.throws(() => buildAccountRecoveryPlan(negativeWallet), { message: 'INVALID_RECOVERY_STORE_MAPPING' });

  const malformedOffer = snapshot();
  malformedOffer.contract.offers = [null];
  assert.throws(() => buildAccountRecoveryPlan(malformedOffer), { message: 'INVALID_RECOVERY_STORE_MAPPING' });

  const invalidProgression = snapshot();
  invalidProgression.progression.level = 0;
  assert.throws(() => buildAccountRecoveryPlan(invalidProgression), { message: 'INVALID_RECOVERY_STORE_MAPPING' });
});


test('P27 mapping : refuse les offres contractuelles dupliquées, incohérentes ou trop nombreuses', () => {
  const duplicate = snapshot();
  duplicate.contract.offers = [
    { id: 'offer-1', fromClubId: 'club-2', salary: 100, fee: 50, status: 'pending' },
    { id: 'offer-1', fromClubId: 'club-3', salary: 100, fee: 50, status: 'pending' }
  ];
  assert.throws(() => buildAccountRecoveryPlan(duplicate), { message: 'INVALID_RECOVERY_OFFERS' });

  const malformed = snapshot();
  malformed.contract.offers = [{ id: 'offer-2', fromClubId: 'club-2', salary: -1, fee: 0, status: 'pending' }];
  assert.throws(() => buildAccountRecoveryPlan(malformed), { message: 'INVALID_RECOVERY_OFFERS' });

  const tooMany = snapshot();
  tooMany.contract.offers = Array.from({ length: 6 }, (_, i) => ({
    id: `offer-${i}`, fromClubId: `club-${i}`, salary: 100, fee: 0, status: 'pending'
  }));
  assert.throws(() => buildAccountRecoveryPlan(tooMany), { message: 'INVALID_RECOVERY_OFFERS' });
});

test('P27 mapping : refuse un contrat actif désaligné avec le club ou avec des dates invalides', () => {
  const mismatch = snapshot();
  mismatch.contract.contract = {
    clubId: 'club-2', status: 'active', salary: 100,
    signedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2026-06-01T00:00:00.000Z'
  };
  assert.throws(() => buildAccountRecoveryPlan(mismatch), { message: 'INVALID_RECOVERY_CONTRACT' });

  const invalidDate = snapshot();
  invalidDate.contract.clubId = 'club-2';
  invalidDate.contract.contract = {
    clubId: 'club-2', status: 'active', salary: 100,
    signedAt: 'not-a-date', expiresAt: '2026-06-01T00:00:00.000Z'
  };
  assert.throws(() => buildAccountRecoveryPlan(invalidDate), { message: 'INVALID_RECOVERY_CONTRACT' });
});

test('P27 mapping : borne les attributs et exige la cohérence des identifiants de saison', () => {
  const invalidAttribute = snapshot();
  invalidAttribute.progression.attributes.pace = 100;
  assert.throws(() => buildAccountRecoveryPlan(invalidAttribute), { message: 'INVALID_RECOVERY_STORE_MAPPING' });

  const foreignProcessedId = snapshot();
  foreignProcessedId.seasonStats.processedMatchIds = ['match-not-in-season'];
  assert.throws(() => buildAccountRecoveryPlan(foreignProcessedId), { message: 'INVALID_RECOVERY_SEASON_STATS' });
});
