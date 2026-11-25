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
  assert.equal(plan.mapping.transferCareerArchive, 'server.contract (not flattened into CareerManager)');
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
