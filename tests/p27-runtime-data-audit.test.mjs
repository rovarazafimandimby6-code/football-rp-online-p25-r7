import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = mkdtempSync(path.join(os.tmpdir(), 'p27-runtime-audit-'));
const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/audit-p27-runtime-data.mjs');
const specs = [
  ['ACCOUNTS_DIR','accounts','accounts.json',{version:1,accounts:[{privateMarker:'DO_NOT_PRINT'}],sessions:[]}],
  ['PLAYER_IDENTITIES_DIR','player-identities','player-identities.json',{version:1,identities:[]}],
  ['GOOGLE_IDENTITIES_DIR','google-identities','google-identities.json',{version:1,links:[],audit:[]}],
  ['GOOGLE_OIDC_TRANSACTIONS_DIR','google-oidc-transactions','google-oidc-transactions.json',{version:1,transactions:[]}],
  ['PLAYER_PROFILES_DIR','player-profiles','player-profiles.json',{version:1,profiles:[]}],
  ['PLAYER_PROGRESSION_DIR','progression','progression.json',{version:1,players:[]}],
  ['CAREERS_DIR','careers','careers.json',{version:1,careers:[],playerCareers:[],pendingCloudMatches:[]}],
  ['CAREER_SYNC_DIR','career-sync','pending-career-sync.json',{version:1,pending:[]}],
  ['TRANSFERS_DIR','transfers','transfers.json',{version:1,careers:[],events:[],clubs:[]}],
  ['CLUB_ROSTERS_DIR','club-rosters','club-rosters.json',{version:8,clubs:[],fixtures:[]}],
  ['FINANCES_DIR','finances','club-finance.json',{version:1,clubs:[]}],
  ['FINANCES_DIR','finances','system-payroll-schedule.json',{version:1,clubs:{}}],
  ['FINANCES_DIR','finances','transfer-finance-journal.json',{version:1,transfers:[],playerWages:[]}],
  ['SHOP_INVENTORY_DIR','shop','shop-inventory.json',{version:1,players:[],clubs:[],purchases:[],resales:[]}],
  ['SYSTEM_TRANSFERS_DIR','system-transfers','system-transfer-outbox.json',{version:1,transfers:[]}],
  ['COMPETITIONS_DIR','competitions','competitions.json',{version:1,seasons:[]}],
  ['RESULTS_DIR','results','completed-results.json',[]],
  ['ROOMS_DIR','rooms','active-rooms.json',{version:1,rooms:[]}],
  ['RP_CLUBS_DIR','rp-clubs','rp-clubs.json',{version:1,clubs:[]}],
  ['RP_CLUB_CHALLENGES_DIR','rp-club-challenges','rp-club-challenges.json',{version:1,challenges:[]}],
  ['RP_CLUB_SEASONS_DIR','rp-club-seasons','rp-club-seasons.json',{version:1,seasons:[]}]
];

function prepare({ omit = null } = {}) {
  const env = { ...process.env };
  for (const [envName, directory, filename, value] of specs) {
    const dir = path.join(root, directory);
    mkdirSync(dir, { recursive: true });
    env[envName] = dir;
    if (omit !== filename) writeFileSync(path.join(dir, filename), JSON.stringify(value));
  }
  return env;
}

test('P27 audit runtime: valide les 21 stores de test sans exposer leur contenu', () => {
  try {
    const result = spawnSync(process.execPath, [script], { encoding: 'utf8', env: prepare() });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.summary, { expectedStores: 21, readable: 21, missing: 0, invalid: 0 });
    assert.equal(result.stdout.includes('DO_NOT_PRINT'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('P27 audit runtime: signale les JSON invalides et les stores manquants en mode strict', () => {
  const localRoot = mkdtempSync(path.join(os.tmpdir(), 'p27-runtime-audit-invalid-'));
  try {
    const env = { ...process.env };
    for (const [envName, directory, filename, value] of specs) {
      const dir = path.join(localRoot, directory);
      mkdirSync(dir, { recursive: true });
      env[envName] = dir;
      if (filename !== 'completed-results.json') writeFileSync(path.join(dir, filename), JSON.stringify(value));
      else writeFileSync(path.join(dir, filename), '[]');
    }
    writeFileSync(path.join(env.ACCOUNTS_DIR, 'accounts.json'), '{invalid');
    const invalid = spawnSync(process.execPath, [script], { encoding: 'utf8', env });
    assert.equal(invalid.status, 1);
    assert.equal(JSON.parse(invalid.stdout).summary.invalid, 1);

    rmSync(path.join(env.ACCOUNTS_DIR, 'accounts.json'));
    const missing = spawnSync(process.execPath, [script, '--require-all'], { encoding: 'utf8', env });
    assert.equal(missing.status, 1);
    assert.equal(JSON.parse(missing.stdout).summary.missing, 1);
  } finally {
    rmSync(localRoot, { recursive: true, force: true });
  }
});
