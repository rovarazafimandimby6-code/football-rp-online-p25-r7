import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('P27 API admin : inclut les carrières individuelles persistées dans l’audit du monde', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'p27-world-audit-api-'));
  const secret = 'p27-admin-test-secret-0123456789abcdef';
  const directories = {
    RESULTS_DIR:'results', CAREERS_DIR:'careers', PLAYER_PROGRESSION_DIR:'progression',
    PLAYER_PROFILES_DIR:'profiles', COMPETITIONS_DIR:'competitions', TRANSFERS_DIR:'transfers',
    FINANCES_DIR:'finances', CLUB_ROSTERS_DIR:'rosters', SYSTEM_TRANSFERS_DIR:'system-transfers',
    ACCOUNTS_DIR:'accounts'
  };
  for (const [key, name] of Object.entries(directories)) {
    const directory = path.join(root, name);
    mkdirSync(directory, { recursive:true });
    process.env[key] = directory;
  }
  process.env.P27_ADMIN_TOKEN = secret;
  const career = {
    playerId:'duplicate-player-career',
    name:'Test',
    role:'MID',
    clubName:'Club test',
    totals:{ matches:0, wins:0, draws:0, losses:0 },
    matches:[],
    processedMatchIds:[]
  };
  writeFileSync(path.join(root, 'careers', 'careers.json'), JSON.stringify({
    version:1, careers:[], playerCareers:[career, { ...career }]
  }));
  const { server } = await import('../server/index.js');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const unauthorized = await fetch(`${base}/api/admin/world-integrity`);
    assert.equal(unauthorized.status, 401);
    const response = await fetch(`${base}/api/admin/world-integrity`, {
      headers:{ authorization:`Bearer ${secret}` }
    });
    assert.equal(response.status, 409);
    const audit = await response.json();
    assert.ok(audit.errors.some(item =>
      item.code === 'PLAYER_CAREER_ID_INVALID_OR_DUPLICATE' &&
      item.playerId === 'duplicate-player-career'
    ), JSON.stringify(audit.errors));
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    for (const key of [...Object.keys(directories), 'P27_ADMIN_TOKEN']) delete process.env[key];
    rmSync(root, { recursive:true, force:true });
  }
});
