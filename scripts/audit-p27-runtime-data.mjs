import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stores = [
  ['accounts', 'ACCOUNTS_DIR', 'accounts', 'accounts.json', ['accounts', 'sessions']],
  ['playerIdentities', 'PLAYER_IDENTITIES_DIR', 'player-identities', 'player-identities.json', ['identities']],
  ['googleIdentities', 'GOOGLE_IDENTITIES_DIR', 'google-identities', 'google-identities.json', ['links', 'audit']],
  ['googleOidcTransactions', 'GOOGLE_OIDC_TRANSACTIONS_DIR', 'google-oidc-transactions', 'google-oidc-transactions.json', ['transactions']],
  ['playerProfiles', 'PLAYER_PROFILES_DIR', 'player-profiles', 'player-profiles.json', ['profiles']],
  ['progression', 'PLAYER_PROGRESSION_DIR', 'progression', 'progression.json', ['players']],
  ['careers', 'CAREERS_DIR', 'careers', 'careers.json', ['careers', 'playerCareers', 'pendingCloudMatches']],
  ['careerSyncQueue', 'CAREER_SYNC_DIR', 'career-sync', 'pending-career-sync.json', ['pending']],
  ['transfers', 'TRANSFERS_DIR', 'transfers', 'transfers.json', ['careers', 'events', 'clubs', 'rosterSync?']],
  ['clubRosters', 'CLUB_ROSTERS_DIR', 'club-rosters', 'club-rosters.json', ['clubs', 'fixtures']],
  ['clubFinance', 'FINANCES_DIR', 'finances', 'club-finance.json', ['clubs']],
  ['systemPayroll', 'FINANCES_DIR', 'finances', 'system-payroll-schedule.json', ['clubs']],
  ['transferFinanceJournal', 'FINANCES_DIR', 'finances', 'transfer-finance-journal.json', ['transfers', 'playerWages']],
  ['shopInventory', 'SHOP_INVENTORY_DIR', 'shop', 'shop-inventory.json', ['players', 'clubs', 'purchases', 'resales']],
  ['systemTransferOutbox', 'SYSTEM_TRANSFERS_DIR', 'system-transfers', 'system-transfer-outbox.json', ['transfers']],
  ['competitions', 'COMPETITIONS_DIR', 'competitions', 'competitions.json', ['seasons']],
  ['completedResults', 'RESULTS_DIR', 'results', 'completed-results.json', []],
  ['activeRooms', 'ROOMS_DIR', 'rooms', 'active-rooms.json', ['rooms']],
  ['rpClubs', 'RP_CLUBS_DIR', 'rp-clubs', 'rp-clubs.json', ['clubs']],
  ['rpClubChallenges', 'RP_CLUB_CHALLENGES_DIR', 'rp-club-challenges', 'rp-club-challenges.json', ['challenges']],
  ['rpClubSeasons', 'RP_CLUB_SEASONS_DIR', 'rp-club-seasons', 'rp-club-seasons.json', ['seasons']]
];

const report = [];
let invalid = 0;
let missing = 0;

for (const [name, envName, defaultDirectory, filename, collections] of stores) {
  const directory = path.resolve(process.env[envName] || path.join(root, 'data', defaultDirectory));
  const file = path.join(directory, filename);
  try {
    const raw = readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    const collectionCounts = {};
    let schemaOk = parsed !== null && typeof parsed === 'object';
    for (const field of collections) {
      const optional = field.endsWith('?');
      const key = optional ? field.slice(0, -1) : field;
      const value = parsed?.[key];
      if (Array.isArray(value)) collectionCounts[key] = value.length;
      else if (value && typeof value === 'object') collectionCounts[key] = Object.keys(value).length;
      else if (optional && value === undefined) collectionCounts[key] = 0;
      else {
        collectionCounts[key] = null;
        schemaOk = false;
      }
    }
    if (name === 'completedResults' && !Array.isArray(parsed)) schemaOk = false;
    if (parsed?.version !== undefined && parsed.version !== 1 && name !== 'clubRosters') schemaOk = false;
    if (name === 'clubRosters' && parsed?.version !== 8) schemaOk = false;
    if (!schemaOk) invalid++;
    report.push({ store: name, status: schemaOk ? 'ok' : 'invalid-schema', bytes: Buffer.byteLength(raw), collections: collectionCounts });
  } catch (error) {
    if (error.code === 'ENOENT') {
      missing++;
      report.push({ store: name, status: 'missing' });
    } else if (error instanceof SyntaxError) {
      invalid++;
      report.push({ store: name, status: 'invalid-json' });
    } else {
      invalid++;
      report.push({ store: name, status: 'unreadable', error: String(error.message || error).slice(0, 120) });
    }
  }
}

const result = {
  audit: 'football-rp-online-p27-runtime-data',
  version: 1,
  generatedAt: new Date().toISOString(),
  root,
  summary: { expectedStores: stores.length, readable: report.filter(item => item.status === 'ok').length, missing, invalid },
  stores: report
};

// Deliberately emit counts and statuses only; never print account, identity, career or finance records.
process.stdout.write(JSON.stringify(result, null, 2) + String.fromCharCode(10));
if (invalid > 0 || (process.argv.includes('--require-all') && missing > 0)) process.exitCode = 1;
