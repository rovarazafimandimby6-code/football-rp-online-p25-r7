#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY = n => Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000_000_000;
const CATEGORIES = new Set(['sponsorship','ticketing','matchday','merchandise','transfer-income','transfer-expense','wages','staff','stadium-maintenance','medical','training','travel','competition-prize','loan','other']);
const args = process.argv.slice(2);
const arg = name => { const i=args.indexOf(name); return i<0 ? null : args[i+1] || null; };
const root = path.resolve(arg('--data-root') || 'data');
const expectedClubs = Number(arg('--expected-clubs') || 156);
const output = arg('--write');
const issues = [];
const issue = (code, details={}) => issues.push({ code, ...details });
async function json(file, required=true) {
  try { return JSON.parse(await readFile(path.join(root,file),'utf8')); }
  catch (error) {
    if (!required && error.code === 'ENOENT') return null;
    issue(error.code === 'ENOENT' ? 'missing-file' : 'invalid-json', { file });
    return null;
  }
}
const roster = await json('club-rosters/club-rosters.json');
const finance = await json('finances/club-finance.json');
const payroll = await json('finances/system-payroll-schedule.json');
const journal = await json('finances/transfer-finance-journal.json');
const transfers = await json('transfers/transfers.json');
const accounts = await json('accounts/accounts.json');
const rosterClubs = roster?.version === 8 && Array.isArray(roster.clubs) ? roster.clubs : null;
const financeAccounts = finance?.version === 1 && Array.isArray(finance.accounts) ? finance.accounts : null;
const accountRows = accounts?.version === 1 && Array.isArray(accounts.accounts) ? accounts.accounts : null;
if (!rosterClubs) issue('invalid-roster-schema');
if (!financeAccounts) issue('invalid-finance-schema');
if (!payroll || payroll.version !== 1 || !payroll.clubs || typeof payroll.clubs !== 'object' || Array.isArray(payroll.clubs)) issue('invalid-payroll-schema');
if (!journal || journal.version !== 1 || !Array.isArray(journal.transfers) || !Array.isArray(journal.playerWages || [])) issue('invalid-transfer-journal-schema');
if (!transfers || transfers.version !== 1 || !Array.isArray(transfers.events)) issue('invalid-transfer-store-schema');
if (!accountRows) issue('invalid-account-store-schema');

const accountIds = new Set((accountRows || []).map(row => row?.id).filter(id => typeof id === 'string' && UUID.test(id)));
const clubs = rosterClubs || [];
const byId = new Map();
const owners = new Map();
for (const club of clubs) {
  if (!club || typeof club.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,47}$/i.test(club.id)) { issue('invalid-club-id'); continue; }
  if (byId.has(club.id)) issue('duplicate-club', { clubId:club.id });
  byId.set(club.id, club);
  const owner = club.managerId || null;
  if (owner !== null) {
    if (typeof owner !== 'string' || !UUID.test(owner)) issue('invalid-owner-id', { clubId:club.id });
    else if (!accountIds.has(owner)) issue('owner-account-not-found', { clubId:club.id, accountId:owner });
    else if (owners.has(owner)) issue('duplicate-club-owner', { accountId:owner, clubs:[owners.get(owner),club.id] });
    else owners.set(owner,club.id);
  }
}
if (clubs.length !== expectedClubs) issue('club-count-mismatch', { expected:expectedClubs, actual:clubs.length });

const financeById = new Map();
for (const account of financeAccounts || []) {
  if (!account || typeof account.clubId !== 'string') { issue('invalid-finance-account'); continue; }
  if (financeById.has(account.clubId)) issue('duplicate-finance-account', { clubId:account.clubId });
  financeById.set(account.clubId,account);
}
for (const id of byId.keys()) if (!financeById.has(id)) issue('missing-finance-account', { clubId:id });
for (const id of financeById.keys()) if (!byId.has(id)) issue('orphan-finance-account', { clubId:id });

const financeRows = [];
for (const [clubId, account] of financeById) {
  const opening = account.openingBalance;
  const entries = Array.isArray(account.entries) ? account.entries : null;
  if (!MONEY(opening) || !entries) { issue('invalid-ledger-account', { clubId }); continue; }
  let balance = opening;
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id || entry.id.length>80 ||
        !CATEGORIES.has(entry.category) || !Number.isSafeInteger(entry.amount) || entry.amount<=0 ||
        entry.amount>1_000_000_000_000 || !['income','expense'].includes(entry.direction) ||
        !Number.isSafeInteger(entry.createdAt) || entry.createdAt<0) {
      issue('invalid-ledger-entry', { clubId, entryId:entry?.id || null }); continue;
    }
    if (seen.has(entry.id)) issue('duplicate-ledger-entry', { clubId, entryId:entry.id });
    seen.add(entry.id);
    balance += entry.direction === 'income' ? entry.amount : -entry.amount;
    if (!MONEY(balance)) issue('ledger-balance-out-of-range', { clubId, entryId:entry.id });
  }
  if (!MONEY(balance)) issue('ledger-balance-out-of-range', { clubId, computed:balance });
  const sponsors = Array.isArray(account.sponsors) ? account.sponsors : [];
  const loans = Array.isArray(account.loans) ? account.loans : [];
  for (const s of sponsors) if (!s?.id || !s.name || !Number.isSafeInteger(s.weeklyPayment) || s.weeklyPayment<=0 ||
    !Number.isInteger(s.durationWeeks) || s.durationWeeks<1 || s.durationWeeks>104 ||
    !Number.isSafeInteger(s.signedAt) || s.signedAt<0 || !Number.isInteger(s.paidWeeks) ||
    s.paidWeeks<0 || s.paidWeeks>s.durationWeeks || !['active','completed'].includes(s.status))
    issue('invalid-sponsor-contract', { clubId, sponsorId:s?.id || null });
  for (const l of loans) if (!l?.id || !l.lender || !Number.isSafeInteger(l.principal) || l.principal<=0 ||
    !Number.isSafeInteger(l.totalRepayment) || l.totalRepayment<l.principal ||
    !Number.isInteger(l.durationWeeks) || l.durationWeeks<1 || l.durationWeeks>260 ||
    !Number.isSafeInteger(l.issuedAt) || l.issuedAt<0 || !Number.isInteger(l.paidInstallments) ||
    l.paidInstallments<0 || l.paidInstallments>l.durationWeeks || !['active','repaid'].includes(l.status))
    issue('invalid-loan', { clubId, loanId:l?.id || null });
  financeRows.push({ clubId, openingBalance:opening, balance, entries, sponsors, loans });
}
const payrollRows = [];
for (const clubId of byId.keys()) {
  const nextDueAt = payroll?.clubs?.[clubId];
  if (!Number.isSafeInteger(nextDueAt) || nextDueAt<0) issue('missing-payroll-checkpoint', { clubId });
  else payrollRows.push({ clubId, nextDueAt });
}
for (const clubId of Object.keys(payroll?.clubs || {})) if (!byId.has(clubId)) issue('orphan-payroll-checkpoint', { clubId });

const transferRows = journal?.transfers || [];
for (const t of transferRows) if (!t?.id || !byId.has(t.fromClubId) || !byId.has(t.toClubId) ||
  t.fromClubId===t.toClubId || !Number.isSafeInteger(t.fee) || t.fee<=0 ||
  !Number.isSafeInteger(t.createdAt) || t.createdAt<0 ||
  typeof t.debitPosted!=='boolean' || typeof t.creditPosted!=='boolean')
  issue('invalid-transfer-checkpoint', { transferId:t?.id || null });
const wageRows = journal?.playerWages || [];
for (const w of wageRows) if (!w?.id || !byId.has(w.clubId) || !Number.isSafeInteger(w.amount) || w.amount<=0 ||
  !Number.isSafeInteger(w.createdAt) || w.createdAt<0 || typeof w.posted!=='boolean')
  issue('invalid-player-wage-checkpoint', { eventId:w?.id || null });

const bundle = {
  format:'p27-club-d1-migration',
  version:1,
  source:{ rosterVersion:roster?.version, financeVersion:finance?.version, payrollVersion:payroll?.version,
    transferJournalVersion:journal?.version, transferStoreVersion:transfers?.version },
  clubs:[...byId.values()].sort((a,b)=>a.id.localeCompare(b.id)).map(club=>({
    clubId:club.id, ownerAccountId:club.managerId || null,
    finance:financeRows.find(row=>row.clubId===club.id) || null
  })),
  payroll:payrollRows.sort((a,b)=>a.clubId.localeCompare(b.clubId)),
  transferCheckpoints:transferRows,
  playerWageCheckpoints:wageRows,
  // Keep the source event stream for audit/reconciliation; do not replay it as new payments.
  sourceTransferEvents:(transfers?.events || []).filter(event=>event?.type==='transfer' || event?.type==='salary-payment').map(event=>({
    id:event.id, type:event.type, at:event.at, fromClubId:event.fromClubId || null,
    toClubId:event.toClubId || null, fee:event.fee ?? null, clubId:event.clubId || null,
    amount:event.amount ?? null
  }))
};
const report = {
  ok:issues.length===0, mode:output?'bundle-export':'dry-run',
  expectedClubs, actualClubs:clubs.length, owners:owners.size,
  financeAccounts:financeRows.length,
  ledgerEntries:financeRows.reduce((n,row)=>n+row.entries.length,0),
  sponsorContracts:financeRows.reduce((n,row)=>n+row.sponsors.length,0),
  loans:financeRows.reduce((n,row)=>n+row.loans.length,0),
  payrollCheckpoints:payrollRows.length, transferCheckpoints:transferRows.length,
  playerWageCheckpoints:wageRows.length, sourceTransferEvents:bundle.sourceTransferEvents.length,
  issueCount:issues.length, issues
};
if (output && report.ok) {
  const target=path.resolve(output);
  await mkdir(path.dirname(target),{recursive:true});
  await writeFile(target,JSON.stringify(bundle,null,2)+'\n',{mode:0o600});
  report.output=target;
}
process.stdout.write(JSON.stringify(report,null,2)+'\n');
if (!report.ok) process.exitCode=1;
