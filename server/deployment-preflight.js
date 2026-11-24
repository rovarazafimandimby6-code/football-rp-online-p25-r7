import { mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isAdminTokenConfigured } from './admin-auth.js';

const STORAGE_PATHS = [
  ['RESULTS_DIR', 'results'],
  ['CAREERS_DIR', 'careers'],
  ['PLAYER_PROGRESSION_DIR', 'progression'],
  ['PLAYER_PROFILES_DIR', 'player-profiles'],
  ['COMPETITIONS_DIR', 'competitions'],
  ['TRANSFERS_DIR', 'transfers'],
  ['FINANCES_DIR', 'finances'],
  ['CLUB_ROSTERS_DIR', 'club-rosters'],
  ['SYSTEM_TRANSFERS_DIR', 'system-transfers'],
  ['ROOMS_DIR', 'rooms'],
  ['ACCOUNTS_DIR', 'accounts'],
];

/** Checks deployment prerequisites without printing or returning secret material. */
export async function runP27DeploymentPreflight({ env = process.env, root = process.cwd() } = {}) {
  const errors = [];
  if (!isAdminTokenConfigured(env.P27_ADMIN_TOKEN)) errors.push('P27_ADMIN_TOKEN_MISSING_OR_TOO_SHORT');
  const checked = [];
  for (const [variable, fallback] of STORAGE_PATHS) {
    const directory = path.resolve(root, env[variable] || path.join(root, 'data', fallback));
    let probe;
    try {
      await mkdir(directory, { recursive: true });
      probe = path.join(directory, `.p27-preflight-${process.pid}-${randomUUID()}.tmp`);
      const handle = await open(probe, 'wx', 0o600);
      await handle.close();
      await unlink(probe);
      checked.push({ variable, writable: true });
    } catch {
      if (probe) { try { await unlink(probe); } catch {} }
      errors.push(`STORAGE_NOT_WRITABLE:${variable}`);
      checked.push({ variable, writable: false });
    }
  }
  return { ok: errors.length === 0, errors, checked };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const result = await runP27DeploymentPreflight();
  for (const item of result.checked) process.stdout.write(`${item.variable}: ${item.writable ? 'writable' : 'FAILED'}\\n`);
  for (const error of result.errors) process.stderr.write(`${error}\\n`);
  if (result.ok) process.stdout.write('P27 deployment preflight: OK\\n');
  process.exitCode = result.ok ? 0 : 1;
}
