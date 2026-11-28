import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
  writeFileSync(path.join(root, 'profiles', 'player-profiles.json'), JSON.stringify({
    version:1, profiles:[{ accountId:'missing-account', profile:{ schemaVersion:1, identity:{ displayName:'Orphelin', role:'MID', number:8 } } }]
  }));
  writeFileSync(path.join(root, 'progression', 'progression.json'), JSON.stringify({
    version:1, players:[{ accountId:'missing-account', progression:{
      level:1, experience:0, coins:250, trainingPoints:0,
      attributes:{ pace:55, shooting:50, passing:50, defense:45, stamina:55, control:50 },
      processedMatchIds:[]
    }}]
  }));
  const { server } = await import('../server/index.js');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const privateDirectory = path.join(projectRoot, 'data', `p27-static-private-${process.pid}`);
  const externalSecret = path.join(root, 'outside-app-root.json');
  const publicSymlink = path.join(projectRoot, `p27-static-link-${process.pid}.json`);
  mkdirSync(privateDirectory, { recursive:true });
  writeFileSync(path.join(privateDirectory, 'secret.json'), '{"private":true}');
  writeFileSync(externalSecret, '{"outside":true}');
  symlinkSync(externalSecret, publicSymlink);
  try {
    const privateData = await fetch(`${base}/data/p27-static-private-${process.pid}/secret.json`);
    assert.equal(privateData.status, 403);
    const serverSource = await fetch(`${base}/server/admin-auth.js`);
    assert.equal(serverSource.status, 403);
    const hiddenFile = await fetch(`${base}/.git/config`);
    assert.equal(hiddenFile.status, 403);
    const symlinkEscape = await fetch(`${base}/${path.basename(publicSymlink)}`);
    assert.equal(symlinkEscape.status, 403);
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
    assert.ok(audit.errors.some(item => item.code === 'PLAYER_PROFILE_ACCOUNT_UNKNOWN' && item.accountId === 'missing-account'), JSON.stringify(audit.errors));
    assert.ok(audit.errors.some(item => item.code === 'PLAYER_PROGRESSION_ACCOUNT_UNKNOWN' && item.accountId === 'missing-account'), JSON.stringify(audit.errors));
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    for (const key of [...Object.keys(directories), 'P27_ADMIN_TOKEN']) delete process.env[key];
    rmSync(root, { recursive:true, force:true });
    rmSync(privateDirectory, { recursive:true, force:true });
    rmSync(publicSymlink, { force:true });
  }
});
