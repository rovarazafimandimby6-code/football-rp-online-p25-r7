#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const args=process.argv.slice(2);
const option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1]||null;};
const input=option('--bundle'), output=option('--output');
if(!input||!output){process.stderr.write('Usage: node scripts/build-club-d1-import-sql.mjs --bundle <validated-bundle.json> --output <import.sql>\\n');process.exit(2);}
const fail=message=>{throw new Error(message);};
const q=value=>value===null?'NULL':typeof value==='number'?String(value):typeof value==='boolean'?(value?'1':'0'):"'"+String(value).replace(/'/g,"''")+"'";
const safeInt=(n,min=0,max=1_000_000_000_000)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const ledgerCategories=new Set(['sponsorship','ticketing','matchday','merchandise','transfer-income','transfer-expense','wages','staff','stadium-maintenance','medical','training','travel','competition-prize','loan','other','shop-purchase','shop-resale']);
const bundle=JSON.parse(await readFile(path.resolve(input),'utf8'));
if(bundle?.format!=='p27-club-d1-migration'||bundle.version!==1||!Array.isArray(bundle.clubs)||bundle.clubs.length!==156)
  fail('INVALID_OR_INCOMPLETE_MIGRATION_BUNDLE');
const statements=['-- Generated from a validated P27 migration bundle. INSERT OR IGNORE is intentional: existing rows are never overwritten.','PRAGMA foreign_keys = ON;','BEGIN TRANSACTION;'];
const clubIds=new Set(),owners=new Set();
for(const row of bundle.clubs){
  const f=row?.finance, id=row?.clubId, owner=row?.ownerAccountId??null;
  if(typeof id!=='string'||!/^[a-z0-9][a-z0-9-]{0,47}$/i.test(id)||clubIds.has(id))fail('INVALID_OR_DUPLICATE_CLUB');
  clubIds.add(id);
  if(owner!==null){if(typeof owner!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(owner)||owners.has(owner))fail('INVALID_OR_DUPLICATE_OWNER');owners.add(owner);}
  if(!f||f.clubId!==id||!safeInt(f.openingBalance)||!safeInt(f.balance)||!Array.isArray(f.entries)||!Array.isArray(f.sponsors)||!Array.isArray(f.loans))fail('INVALID_CLUB_FINANCE');
  let balance=f.openingBalance;
  const entryIds=new Set();
  const ledger=[];
  for(const e of f.entries){
    if(!e||typeof e.id!=='string'||e.id.length<1||e.id.length>80||entryIds.has(e.id)||
      !/^[a-z-]+$/.test(e.category)||!safeInt(e.amount,1)||!['income','expense'].includes(e.direction)||
      typeof e.description!=='string'||e.description.length>120||!safeInt(e.createdAt))fail('INVALID_LEDGER_ENTRY');
    entryIds.add(e.id);balance+=e.direction==='income'?e.amount:-e.amount;
    if(!safeInt(balance))fail('LEDGER_BALANCE_OUT_OF_RANGE');
    ledger.push({...e,balanceAfter:balance});
  }
  if(balance!==f.balance)fail('LEDGER_BALANCE_MISMATCH');
  const now=new Date().toISOString();
  statements.push(`INSERT OR IGNORE INTO p27_clubs (club_id,owner_account_id,ownership_revision,created_at,updated_at) VALUES (${q(id)},${q(owner)},0,${q(now)},${q(now)});`);
  statements.push(`INSERT OR IGNORE INTO p27_club_finance_accounts (club_id,opening_balance,balance,revision,created_at,updated_at) VALUES (${q(id)},${f.openingBalance},${f.balance},${ledger.length},${q(now)},${q(now)});`);
  if(owner!==null)statements.push(`INSERT OR IGNORE INTO p27_club_ownership_events (club_id,event_id,event_type,previous_owner_account_id,new_owner_account_id,ownership_revision,created_at) VALUES (${q(id)},'legacy-import','imported',NULL,${q(owner)},0,${q(now)});`);
  for(const e of ledger)statements.push(`INSERT OR IGNORE INTO p27_club_finance_entries (club_id,entry_id,category,amount,direction,description,reference_id,balance_after,created_at) VALUES (${q(id)},${q(e.id)},${q(e.category)},${e.amount},${q(e.direction)},${q(e.description)},${q(e.referenceId??null)},${e.balanceAfter},${e.createdAt});`);
  const sponsorIds=new Set();
  for(const s of f.sponsors){
    if(!s||typeof s.id!=='string'||s.id.length<1||s.id.length>80||sponsorIds.has(s.id)||
      typeof s.name!=='string'||s.name.length<1||s.name.length>80||!safeInt(s.weeklyPayment,1)||
      !Number.isInteger(s.durationWeeks)||s.durationWeeks<1||s.durationWeeks>104||!safeInt(s.signedAt)||
      !Number.isInteger(s.paidWeeks)||s.paidWeeks<0||s.paidWeeks>s.durationWeeks||
      !['active','completed'].includes(s.status))fail('INVALID_OR_DUPLICATE_SPONSOR_CONTRACT');
    sponsorIds.add(s.id);
    statements.push(`INSERT OR IGNORE INTO p27_club_sponsor_contracts (club_id,sponsor_id,name,weekly_payment,duration_weeks,signed_at,paid_weeks,status) VALUES (${q(id)},${q(s.id)},${q(s.name)},${s.weeklyPayment},${s.durationWeeks},${s.signedAt},${s.paidWeeks},${q(s.status)});`);
  }
  const loanIds=new Set();
  for(const l of f.loans){
    if(!l||typeof l.id!=='string'||l.id.length<1||l.id.length>80||loanIds.has(l.id)||
      typeof l.lender!=='string'||l.lender.length<1||l.lender.length>80||
      !safeInt(l.principal,1)||!safeInt(l.totalRepayment,l.principal)||
      !Number.isInteger(l.durationWeeks)||l.durationWeeks<1||l.durationWeeks>260||
      !safeInt(l.issuedAt)||!Number.isInteger(l.paidInstallments)||l.paidInstallments<0||
      l.paidInstallments>l.durationWeeks||!['active','repaid'].includes(l.status))fail('INVALID_OR_DUPLICATE_LOAN');
    loanIds.add(l.id);
    statements.push(`INSERT OR IGNORE INTO p27_club_loans (club_id,loan_id,lender,principal,total_repayment,duration_weeks,issued_at,paid_installments,status) VALUES (${q(id)},${q(l.id)},${q(l.lender)},${l.principal},${l.totalRepayment},${l.durationWeeks},${l.issuedAt},${l.paidInstallments},${q(l.status)});`);
  }
}
const payrollClubIds=new Set();
for(const p of bundle.payroll||[]){
  if(!p||!clubIds.has(p.clubId)||payrollClubIds.has(p.clubId)||!safeInt(p.nextDueAt))fail('INVALID_OR_DUPLICATE_PAYROLL_CHECKPOINT');
  payrollClubIds.add(p.clubId);
  statements.push(`INSERT OR IGNORE INTO p27_club_payroll_checkpoints (club_id,next_due_at,updated_at) VALUES (${q(p.clubId)},${p.nextDueAt},${q(new Date(p.nextDueAt).toISOString())});`);
}
const transferIds=new Set();
for(const t of bundle.transferCheckpoints||[]){
  if(!t||typeof t.id!=='string'||t.id.length<1||t.id.length>128||transferIds.has(t.id)||
    !clubIds.has(t.fromClubId)||!clubIds.has(t.toClubId)||t.fromClubId===t.toClubId||
    !safeInt(t.fee,1)||!safeInt(t.createdAt)||typeof t.debitPosted!=='boolean'||typeof t.creditPosted!=='boolean'||
    (t.status==='completed'&&(!t.debitPosted||!t.creditPosted))||(t.status==='pending'&&t.debitPosted&&t.creditPosted))fail('INVALID_OR_DUPLICATE_TRANSFER_CHECKPOINT');
  transferIds.add(t.id);
  const status=t.status|| (t.debitPosted&&t.creditPosted?'completed':'pending');
  if(!['pending','completed'].includes(status))fail('INVALID_TRANSFER_STATUS');
  statements.push(`INSERT OR IGNORE INTO p27_club_transfer_finance_checkpoints (transfer_id,from_club_id,to_club_id,fee,created_at,debit_posted,credit_posted,status) VALUES (${q(t.id)},${q(t.fromClubId)},${q(t.toClubId)},${t.fee},${t.createdAt},${q(t.debitPosted)},${q(t.creditPosted)},${q(status)});`);
}
const wageEventIds=new Set();
for(const w of bundle.playerWageCheckpoints||[]){
  if(!w||typeof w.id!=='string'||w.id.length<1||w.id.length>128||wageEventIds.has(w.id)||
    !clubIds.has(w.clubId)||!safeInt(w.amount,1)||!safeInt(w.createdAt)||typeof w.posted!=='boolean')fail('INVALID_OR_DUPLICATE_PLAYER_WAGE_CHECKPOINT');
  wageEventIds.add(w.id);
  statements.push(`INSERT OR IGNORE INTO p27_club_player_wage_checkpoints (event_id,club_id,amount,created_at,posted) VALUES (${q(w.id)},${q(w.clubId)},${w.amount},${w.createdAt},${q(w.posted)});`);
}
statements.push('COMMIT;');
statements.push('-- Post-import verification: compare these counts and per-club balances to the source bundle before cutover.');
statements.push('SELECT (SELECT COUNT(*) FROM p27_clubs) AS clubs, (SELECT COUNT(*) FROM p27_club_finance_accounts) AS finance_accounts, (SELECT COUNT(*) FROM p27_club_finance_entries) AS ledger_entries, (SELECT COUNT(*) FROM p27_club_sponsor_contracts) AS sponsors, (SELECT COUNT(*) FROM p27_club_loans) AS loans, (SELECT COUNT(*) FROM p27_club_payroll_checkpoints) AS payroll_checkpoints, (SELECT COUNT(*) FROM p27_club_transfer_finance_checkpoints) AS transfer_checkpoints, (SELECT COUNT(*) FROM p27_club_player_wage_checkpoints) AS player_wage_checkpoints;');
const target=path.resolve(output);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,statements.join(String.fromCharCode(10))+String.fromCharCode(10),{mode:0o600});
process.stdout.write(JSON.stringify({ok:true,clubs:bundle.clubs.length,owners:owners.size,statements:statements.length-5,output:target},null,2)+String.fromCharCode(10));
