import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script=path.resolve('scripts/build-club-d1-import-sql.mjs');
const owner='123e4567-e89b-42d3-a456-426614174000';
function makeBundle(count=156){
  return {format:'p27-club-d1-migration',version:1,
    clubs:Array.from({length:count},(_,i)=>({clubId:`club-${String(i+1).padStart(3,'0')}`,ownerAccountId:i===0?owner:null,
      finance:{clubId:`club-${String(i+1).padStart(3,'0')}`,openingBalance:1000,balance:900,
        entries:[{id:'wage-1',category:'wages',amount:100,direction:'expense',description:"Salaire d'O'Brien",referenceId:null,createdAt:1000}],
        sponsors:[{id:'sponsor-1',name:'Sponsor',weeklyPayment:50,durationWeeks:10,signedAt:1000,paidWeeks:2,status:'active'}],
        loans:[{id:'loan-1',lender:'Bank',principal:200,totalRepayment:220,durationWeeks:10,issuedAt:1000,paidInstallments:1,status:'active'}]}})),
    payroll:Array.from({length:count},(_,i)=>({clubId:`club-${String(i+1).padStart(3,'0')}`,nextDueAt:2000})),
    transferCheckpoints:[],playerWageCheckpoints:[],sourceTransferEvents:[]
  };
}
test('SQL builder emits a complete insert-only package for all 156 clubs',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'p27-d1-sql-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const bundle=path.join(dir,'bundle.json'),output=path.join(dir,'import.sql');
  await writeFile(bundle,JSON.stringify(makeBundle()));
  const result=spawnSync(process.execPath,[script,'--bundle',bundle,'--output',output],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout);
  assert.equal(report.clubs,156);
  const sql=await readFile(output,'utf8');
  assert.match(sql,/BEGIN TRANSACTION;/);
  assert.match(sql,/INSERT OR IGNORE INTO p27_clubs/);
  assert.match(sql,/INSERT OR IGNORE INTO p27_club_finance_entries/);
  assert.match(sql,/INSERT OR IGNORE INTO p27_club_sponsor_contracts/);
  assert.match(sql,/INSERT OR IGNORE INTO p27_club_loans/);
  assert.match(sql,/Salaire d''O''Brien/);
  assert.match(sql,/COMMIT;/);
});
test('SQL builder refuses incomplete bundles and inconsistent ledgers',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'p27-d1-sql-invalid-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const bundle=path.join(dir,'bundle.json'),output=path.join(dir,'import.sql');
  await writeFile(bundle,JSON.stringify(makeBundle(155)));
  let result=spawnSync(process.execPath,[script,'--bundle',bundle,'--output',output],{encoding:'utf8'});
  assert.equal(result.status,1);
  const bad=makeBundle();bad.clubs[0].finance.balance=999;
  await writeFile(bundle,JSON.stringify(bad));
  result=spawnSync(process.execPath,[script,'--bundle',bundle,'--output',output],{encoding:'utf8'});
  assert.equal(result.status,1);
});

test('SQL builder refuses duplicate contract and checkpoint identities before emitting SQL',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'p27-d1-sql-duplicates-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const bundle=path.join(dir,'bundle.json'),output=path.join(dir,'import.sql');
  const cases=[
    value=>{value.clubs[0].finance.sponsors.push({...value.clubs[0].finance.sponsors[0]});},
    value=>{value.clubs[0].finance.loans.push({...value.clubs[0].finance.loans[0]});},
    value=>{value.payroll.push({...value.payroll[0]});},
    value=>{value.transferCheckpoints=[{id:'transfer-1',fromClubId:'club-001',toClubId:'club-002',fee:10,createdAt:1000,debitPosted:true,creditPosted:false},{id:'transfer-1',fromClubId:'club-001',toClubId:'club-002',fee:10,createdAt:1000,debitPosted:true,creditPosted:false}];},
    value=>{value.playerWageCheckpoints=[{id:'wage-1',clubId:'club-001',amount:10,createdAt:1000,posted:true},{id:'wage-1',clubId:'club-001',amount:10,createdAt:1000,posted:true}];}
  ];
  for(const mutate of cases){
    const value=makeBundle();mutate(value);await writeFile(bundle,JSON.stringify(value));
    const result=spawnSync(process.execPath,[script,'--bundle',bundle,'--output',output],{encoding:'utf8'});
    assert.equal(result.status,1,result.stdout);
  }
});


test('SQL builder rejects unsupported ledger categories and inconsistent completed transfers',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'p27-d1-sql-contracts-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const bundle=path.join(dir,'bundle.json'),output=path.join(dir,'import.sql');
  const badCategory=makeBundle();badCategory.clubs[0].finance.entries[0].category='unapproved-category';
  await writeFile(bundle,JSON.stringify(badCategory));
  let result=spawnSync(process.execPath,[script,'--bundle',bundle,'--output',output],{encoding:'utf8'});
  assert.equal(result.status,1);
  const badTransfer=makeBundle();badTransfer.transferCheckpoints=[{
    id:'transfer-1',fromClubId:'club-001',toClubId:'club-002',fee:10,createdAt:1000,
    debitPosted:true,creditPosted:false,status:'completed'
  }];
  await writeFile(bundle,JSON.stringify(badTransfer));
  result=spawnSync(process.execPath,[script,'--bundle',bundle,'--output',output],{encoding:'utf8'});
  assert.equal(result.status,1);
});
