import test from 'node:test';
import assert from 'node:assert/strict';
import { CareerManager } from '../src/career-manager.js';
import { PlayerSeasonStats } from '../src/player-season-stats.js';

function storage() { const values = new Map(); return { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,String(v)) }; }

test('P27 résultat : un rapport serveur répété ne crédite pas deux fois le portefeuille', () => {
  const s = storage(), career = new CareerManager({ storage: s, storageKey: 'idempotent-career', initialCoins: 100 });
  const first = career.recordMatch({ matchId: 'room-123', result: 'win', goals: 2, assists: 1 });
  const walletAfterFirst = career.wallet;
  const duplicate = career.recordMatch({ matchId: 'room-123', result: 'win', goals: 2, assists: 1 });
  assert.equal(first.duplicate, undefined); assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.coins, 0); assert.equal(career.wallet, walletAfterFirst);
  const restored = new CareerManager({ storage: s, storageKey: 'idempotent-career' });
  assert.equal(restored.recordMatch({ matchId: 'room-123', result: 'win' }).duplicate, true);
  assert.equal(restored.wallet, walletAfterFirst);
});

test('P27 résultat : les statistiques de saison ignorent un match déjà comptabilisé après reconnexion', () => {
  const s = storage(), stats = new PlayerSeasonStats(s, 'idempotent-season');
  stats.recordMatch({ matchId: 'room-456', result: 'win', stats: { goals: 1 } });
  const restored = new PlayerSeasonStats(s, 'idempotent-season');
  const duplicate = restored.recordMatch({ matchId: 'room-456', result: 'loss', stats: { goals: 99 } });
  assert.equal(duplicate.duplicate, true);
  assert.equal(restored.snapshot().totals.matches, 1);
  assert.equal(restored.snapshot().totals.goals, 1);
  assert.equal(restored.snapshot().totals.losses, 0);
});
