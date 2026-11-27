import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script=path.resolve('scripts/export-club-d1-migration.mjs');
const accountId='123e4567-e89b-42d3-a456-426614174000';
async function fixture(t,{badBalance=false}={}) {
  const root=await mkdtemp(path.join(os.tmpdir(),'p27-club-migration-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const dir of ['club-rosters','finances','transfers','accounts']) await mkdir(path.join(root,dir),{recursive:true});
  const write=(file,value)=>writeFile(path.join(root,file),JSON.stringify(value));
  await write('club-rosters/club-rosters.json',{version:8,clubs:[{id:'club-one',managerId:accountId}]});
  await write('finances/club-finance.json',{version:1,accounts:[{
    clubId:'club-one',openingBalance:badBalance?50:1000,
    entries:[{id:'expense-1',category:'wages',amount:100,direction:'expense',description:'Wage',createdAt:1000,referenceId:'contract-1'}],
    sponsors:[{id:'sponsor-1',name:'Sponsor',weeklyPayment:50,durationWeeks:10,signedAt:1000,paidWeeks:2,status:'active'}],
    loans:[{id:'loan-1',lender:'Bank',principal:200,totalRepayment:220,durationWeeks:10,issuedAt:1000,paidInstallments:1,status:'active'}]
  }]});
  await write('finances/system-payroll-schedule.json',{version:1,clubs:{'club-one':2000}});
  await write('finances/transfer-finance-journal.json',{version:1,transfers:[],playerWages:[]});
  await write('transfers/transfers.json',{version:1,careers:[],events:[],clubs:[],rosterSync:[]});
  await write('accounts/accounts.json',{version:1,accounts:[{id:accountId}],sessions:[]});
  return root;
}
test('migration exporter dry-run validates owners, ledger, contracts and checkpoints',async t=>{
  const root=await fixture(t);
  const result=spawnSync(process.execPath,[script,'--data-root',root,'--expected-clubs','1'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
  const report=JSON.parse(result.stdout);
  assert.equal(report.ok,true);
  assert.equal(report.owners,1);
  assert.equal(report.ledgerEntries,1);
  assert.equal(report.sponsorContracts,1);
  assert.equal(report.loans,1);
  assert.equal(report.payrollCheckpoints,1);
});
test('migration exporter refuses a balance mismatch and does not write a bundle',async t=>{
  const root=await fixture(t,{badBalance:true});
  const output=path.join(root,'out','bundle.json');
  const result=spawnSync(process.execPath,[script,'--data-root',root,'--expected-clubs','1','--write',output],{encoding:'utf8'});
  assert.equal(result.status,1);
  const report=JSON.parse(result.stdout);
  assert.equal(report.ok,false);
  assert.ok(report.issues.some(item=>item.code==='ledger-balance-out-of-range'));
  await assert.rejects(readFile(output));
});
test('migration exporter writes a deterministic normalized bundle only after clean audit',async t=>{
  const root=await fixture(t);
  const output=path.join(root,'out','bundle.json');
  const result=spawnSync(process.execPath,[script,'--data-root',root,'--expected-clubs','1','--write',output],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr+'\n'+result.stdout);
  const bundle=JSON.parse(await readFile(output,'utf8'));
  assert.equal(bundle.format,'p27-club-d1-migration');
  assert.equal(bundle.clubs[0].ownerAccountId,accountId);
  assert.equal(bundle.clubs[0].finance.balance,900);
  assert.equal(bundle.clubs[0].finance.sponsors.length,1);
  assert.equal(bundle.clubs[0].finance.loans.length,1);
});


test('migration exporter rejects duplicate sponsor, loan and player-wage checkpoint IDs',async t=>{
  const root=await fixture(t);
  const read=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
  const write=async(file,value)=>writeFile(path.join(root,file),JSON.stringify(value));
  const finance=await read('finances/club-finance.json');
  finance.accounts[0].sponsors.push({...finance.accounts[0].sponsors[0]});
  finance.accounts[0].loans.push({...finance.accounts[0].loans[0]});
  await write('finances/club-finance.json',finance);
  const journal=await read('finances/transfer-finance-journal.json');
  journal.playerWages=[
    {id:'salary-event-1',clubId:'club-one',amount:25,createdAt:1000,posted:true},
    {id:'salary-event-1',clubId:'club-one',amount:25,createdAt:1000,posted:true}
  ];
  await write('finances/transfer-finance-journal.json',journal);
  const result=spawnSync(process.execPath,[script,'--data-root',root,'--expected-clubs','1'],{encoding:'utf8'});
  assert.equal(result.status,1);
  const report=JSON.parse(result.stdout);
  const codes=new Set(report.issues.map(item=>item.code));
  assert.ok(codes.has('duplicate-sponsor-contract'));
  assert.ok(codes.has('duplicate-loan'));
  assert.ok(codes.has('duplicate-player-wage-checkpoint'));
});


test('migration exporter rejects duplicate legacy account IDs hidden by set normalization',async t=>{
  const root=await fixture(t);
  const file=path.join(root,'accounts/accounts.json');
  const accounts=JSON.parse(await readFile(file,'utf8'));
  accounts.accounts.push({...accounts.accounts[0]});
  await writeFile(file,JSON.stringify(accounts));
  const result=spawnSync(process.execPath,[script,'--data-root',root,'--expected-clubs','1'],{encoding:'utf8'});
  assert.equal(result.status,1);
  const report=JSON.parse(result.stdout);
  assert.ok(report.issues.some(item=>item.code==='duplicate-account-id'));
});


test('migration exporter rejects duplicate transfer-fee checkpoint IDs',async t=>{
  const root=await fixture(t);
  const read=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
  const write=async(file,value)=>writeFile(path.join(root,file),JSON.stringify(value));
  const roster=await read('club-rosters/club-rosters.json');
  roster.clubs.push({id:'club-two',managerId:null});
  await write('club-rosters/club-rosters.json',roster);
  const finance=await read('finances/club-finance.json');
  finance.accounts.push({clubId:'club-two',openingBalance:1000,entries:[],sponsors:[],loans:[]});
  await write('finances/club-finance.json',finance);
  const payroll=await read('finances/system-payroll-schedule.json');
  payroll.clubs['club-two']=2000;
  await write('finances/system-payroll-schedule.json',payroll);
  const journal=await read('finances/transfer-finance-journal.json');
  journal.transfers=[
    {id:'transfer-fee-1',fromClubId:'club-one',toClubId:'club-two',fee:100,createdAt:1000,debitPosted:true,creditPosted:false},
    {id:'transfer-fee-1',fromClubId:'club-one',toClubId:'club-two',fee:100,createdAt:1000,debitPosted:true,creditPosted:false}
  ];
  await write('finances/transfer-finance-journal.json',journal);
  const result=spawnSync(process.execPath,[script,'--data-root',root,'--expected-clubs','2'],{encoding:'utf8'});
  assert.equal(result.status,1);
  const report=JSON.parse(result.stdout);
  assert.ok(report.issues.some(item=>item.code==='duplicate-transfer-checkpoint'));
});
