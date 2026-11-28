import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Render blueprint routes every P27 persistent store and backups onto the disk mount', async () => {
  const blueprint = await readFile(new URL('../render.yaml', import.meta.url), 'utf8');
  assert.match(blueprint, /plan:\s*starter/);
  assert.match(blueprint, /mountPath:\s*\/var\/data/);
  assert.match(blueprint, /sizeGB:\s*1/);
  const required = [
    'RESULTS_DIR', 'CAREERS_DIR', 'PLAYER_PROGRESSION_DIR',
    'PLAYER_PROFILES_DIR', 'COMPETITIONS_DIR', 'TRANSFERS_DIR',
    'FINANCES_DIR', 'CLUB_ROSTERS_DIR', 'SYSTEM_TRANSFERS_DIR',
    'ROOMS_DIR', 'ACCOUNTS_DIR', 'PLAYER_IDENTITIES_DIR',
    'GOOGLE_OIDC_TRANSACTIONS_DIR', 'GOOGLE_IDENTITIES_DIR',
    'P27_BACKUPS_DIR'
  ];
  for (const key of required) {
    assert.match(blueprint, new RegExp(`key:\\s*${key}\\n\\s+value:\\s+\/var\/data\/`), `missing persistent path for ${key}`);
  }
  assert.match(blueprint, /key:\s*P27_ADMIN_TOKEN\n\s+generateValue:\s*true/);
  assert.doesNotMatch(blueprint, /GOOGLE_CLIENT_SECRET\n\s+value:/);
});
