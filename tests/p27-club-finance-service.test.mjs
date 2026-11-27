import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ClubManager, DEFAULT_CLUBS } from '../src/club-manager.js';
import { JsonClubFinanceService } from '../server/club-finance-service.js';

function setup({events=[],careers=[],clubs=DEFAULT_CLUBS,now=()=>Date.UTC(2027,0,15)}={}) {
  const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-finance-service-'));
  const transferStore={state:{events,careers}};
  return {directory,transferStore,service:new JsonClubFinanceService(directory,{clubs,transferStore,now}),cleanup:()=>rmSync(directory,{recursive:true,force:true})};
}
test('P27 finances : ouvre un compte persistant pour les 156 clubs sans réinitialiser les soldes',()=>{
 const f=setup();try{
  const result=f.service.bootstrap();assert.equal(result.accounts,156);assert.equal(result.created,0);
  const club=DEFAULT_CLUBS[0],account=f.service.store.getAccount(club.id);
  assert.equal(account.balance,club.budget);
  f.service.store.post(club.id,{id:'test-income',category:'other',amount:500,direction:'income'});
  const restored=new JsonClubFinanceService(f.directory,{clubs:DEFAULT_CLUBS,transferStore:f.transferStore});
  assert.equal(restored.store.getAccount(club.id).balance,club.budget+500);
  assert.equal(restored.bootstrap().created,0);
 }finally{f.cleanup();}
});
test('P27 finances : synchronise les salaires réellement crédités une seule fois',()=>{
 const event={id:'salary-event-1',type:'salary-payment',clubId:DEFAULT_CLUBS[0].id,amount:1200,periods:1,at:1000};
 const f=setup({events:[event]});try{
  const first=f.service.syncRecordedPlayerWages();assert.equal(first.posted,1);assert.equal(first.unpaid,0);
  const after=f.service.store.balance(event.clubId);
  assert.equal(f.service.syncRecordedPlayerWages().posted,0);
  assert.equal(f.service.store.balance(event.clubId),after-0);
  assert.equal(f.service.store.getAccount(event.clubId).totalExpenses,1200);
 }finally{f.cleanup();}
});
test('P27 finances : conserve les salaires impayés lorsque la trésorerie est insuffisante',()=>{
 const club=DEFAULT_CLUBS[0];
 const f=setup({events:[{id:'salary-event-poor',type:'salary-payment',clubId:club.id,amount:club.budget+1,at:1000}]});
 try{
  const result=f.service.syncRecordedPlayerWages();assert.equal(result.posted,0);assert.equal(result.unpaid,1);
  assert.equal(f.service.store.getAccount(club.id).totalExpenses,0);
 }finally{f.cleanup();}
});
test('P27 finances : diagnostic utilise les salaires de contrats explicites et coûts fournis',()=>{
 const club=DEFAULT_CLUBS[0];
 const f=setup({careers:[{clubId:club.id,contract:{status:'active',salary:2500}}]});
 try{
  const report=f.service.getClubFinance(club.id,{weeklyMaintenance:500});
  assert.equal(report.payroll.weeklyPayroll,2500);
  assert.equal(report.budget.weeklyExpenses,3000);
 }finally{f.cleanup();}
});
test('P27 finances : versements sponsors et échéances de prêts traités par le service',()=>{
 const f=setup();try{
  const id=DEFAULT_CLUBS[0].id,start=Date.UTC(2027,0,1);
  f.service.store.signSponsorContract(id,{id:'sponsor-service',name:'Partenaire',weeklyPayment:1000,durationWeeks:3,signedAt:start});
  f.service.store.issueLoan(id,{id:'loan-service',lender:'Banque',principal:5000,totalRepayment:6000,durationWeeks:2,issuedAt:start});
  const result=f.service.settleScheduledItems();
  assert.equal(result.ok,true);
  assert.equal(result.sponsors.length,1);assert.equal(result.loans.length,1);
 }finally{f.cleanup();}
});

test('P27 finances : intègre la masse salariale des joueurs du système et des carrières humaines',()=>{
 const clubs=new ClubManager(DEFAULT_CLUBS).listClubs();
 const club=clubs[0];
 const human={accountId:'human-account',clubId:club.id,contract:{status:'active',salary:250}};
 const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-full-payroll-'));
 try {
  const service=new JsonClubFinanceService(directory,{clubs,transferStore:{state:{events:[],careers:[human]}}});
  const report=service.getClubFinance(club.id);
  const expectedSystem=club.roster.filter(p=>p.playerType==='system'&&p.contract?.status==='active').reduce((sum,p)=>sum+(p.contract.weeklyWage||p.contract.salary),0);
  assert.equal(report.systemPlayersUnderContract,club.roster.length);
  assert.equal(report.humanPlayersUnderContract,1);
  assert.equal(report.systemPayroll.weeklyPayroll,expectedSystem);
  assert.equal(report.humanPayroll.weeklyPayroll,250);
  assert.equal(report.payroll.weeklyPayroll,expectedSystem+250);
 } finally {rmSync(directory,{recursive:true,force:true});}
});

test('P27 paie système : prélève chaque salaire après une semaine et ne paie pas deux fois',()=>{
 const start=Date.UTC(2027,0,1);let now=start;
 const club={id:'payroll-club',budget:10000,roster:[
  {id:'player-one',name:'Joueur Un',playerType:'system',contract:{id:'contract-one',clubId:'payroll-club',playerId:'player-one',status:'active',weeklyWage:100,salary:100}},
  {id:'player-two',name:'Joueur Deux',playerType:'system',contract:{id:'contract-two',clubId:'payroll-club',playerId:'player-two',status:'active',weeklyWage:150,salary:150}}
 ]};
 const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-system-payroll-'));
 try {
  const service=new JsonClubFinanceService(directory,{clubs:[club],now:()=>now});
  assert.equal(service.settleSystemPayroll(now).posted,0);
  now=start+7*86400000;
  const first=service.settleSystemPayroll(now);
  assert.equal(first.posted,2);assert.equal(first.unpaid,0);
  assert.equal(service.store.getAccount(club.id).totalExpenses,250);
  assert.equal(service.settleSystemPayroll(now).posted,0);
  assert.equal(service.store.getAccount(club.id).totalExpenses,250);
 } finally {rmSync(directory,{recursive:true,force:true});}
});
test('P27 paie système : conserve les échéances en attente si le club ne peut pas payer',()=>{
 const start=Date.UTC(2027,0,1);let now=start;
 const club={id:'poor-payroll-club',budget:0,roster:[
  {id:'player-poor',name:'Joueur Sans Fonds',playerType:'system',contract:{id:'contract-poor',clubId:'poor-payroll-club',playerId:'player-poor',status:'active',weeklyWage:100,salary:100}}
 ]};
 const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-system-payroll-poor-'));
 try {
  const service=new JsonClubFinanceService(directory,{clubs:[club],now:()=>now});
  now=start+7*86400000;
  const result=service.settleSystemPayroll(now);
  assert.equal(result.posted,0);assert.equal(result.unpaid,1);
  assert.equal(result.clubs[0].reason,'insufficient-funds');
  assert.equal(service.store.getAccount(club.id).totalExpenses,0);
  service.store.post(club.id,{id:'rescue-funds',category:'other',amount:500,direction:'income'});
  const retry=service.settleSystemPayroll(now);
  assert.equal(retry.posted,1);assert.equal(retry.unpaid,0);
  assert.equal(service.store.getAccount(club.id).totalExpenses,100);
 } finally {rmSync(directory,{recursive:true,force:true});}
});
test('P27 paie système : le calendrier de paie survit au redémarrage',()=>{
 const start=Date.UTC(2027,0,1);let now=start;
 const club={id:'persistent-payroll-club',budget:1000,roster:[
  {id:'player-persist',name:'Joueur Persistant',playerType:'system',contract:{id:'contract-persist',clubId:'persistent-payroll-club',playerId:'player-persist',status:'active',weeklyWage:75,salary:75}}
 ]};
 const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-system-payroll-restart-'));
 try {
  const first=new JsonClubFinanceService(directory,{clubs:[club],now:()=>now});
  now=start+7*86400000;
  assert.equal(first.settleSystemPayroll(now).posted,1);
  const restarted=new JsonClubFinanceService(directory,{clubs:[club],now:()=>now});
  assert.equal(restarted.settleSystemPayroll(now).posted,0);
  assert.equal(restarted.store.getAccount(club.id).totalExpenses,75);
 } finally {rmSync(directory,{recursive:true,force:true});}
});


test('P27 paie système : règle les échéances acquises avant le départ ou la fin du contrat',()=>{
 const start=Date.UTC(2027,0,1);let now=start;
 const club={id:'departed-payroll-club',budget:1000,roster:[],releasedPlayers:[{
  releasedAt:new Date(start+10*86400000).toISOString(),reason:'contract-expired',
  player:{id:'departed-player',name:'Joueur Parti',playerType:'system',contract:{
   id:'departed-contract',clubId:'departed-payroll-club',playerId:'departed-player',
   type:'system-roster',status:'expired',weeklyWage:100,salary:100,
   signedAt:new Date(start).toISOString(),expiresAt:new Date(start+10*86400000).toISOString()
  }}
 }]};
 const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-departed-payroll-'));
 try {
  const service=new JsonClubFinanceService(directory,{clubs:[club],now:()=>now});
  now=start+14*86400000;
  const first=service.settleSystemPayroll(now);
  assert.equal(first.posted,1);
  assert.equal(first.unpaid,0);
  assert.equal(service.store.getAccount(club.id).totalExpenses,100);
  now=start+21*86400000;
  const later=service.settleSystemPayroll(now);
  assert.equal(later.posted,0);
  assert.equal(service.store.getAccount(club.id).totalExpenses,100);
 } finally {rmSync(directory,{recursive:true,force:true});}
});

test('P27 paie système : les arriérés d’un joueur parti restent payables après redémarrage',()=>{
 const start=Date.UTC(2027,0,1);let now=start;
 const club={id:'departed-restart-club',budget:1000,roster:[],releasedPlayers:[{
  releasedAt:new Date(start+15*86400000).toISOString(),reason:'player-departed',
  player:{id:'departed-restart-player',name:'Joueur Historique',playerType:'system',contract:{
   id:'departed-restart-contract',clubId:'departed-restart-club',playerId:'departed-restart-player',
   type:'system-roster',status:'active',weeklyWage:80,salary:80,
   signedAt:new Date(start).toISOString()
  }}
 }]};
 const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-departed-payroll-restart-'));
 try {
  const first=new JsonClubFinanceService(directory,{clubs:[club],now:()=>now});
  now=start+14*86400000;
  assert.equal(first.settleSystemPayroll(now).posted,2);
  const restarted=new JsonClubFinanceService(directory,{clubs:[club],now:()=>now});
  assert.equal(restarted.settleSystemPayroll(now).posted,0);
  assert.equal(restarted.store.getAccount(club.id).totalExpenses,160);
 } finally {rmSync(directory,{recursive:true,force:true});}
});


test('P27 finances : le cycle global signale les salaires impayés au monde persistant',()=>{
 const start=Date.UTC(2027,0,1);let now=start;
 const club={id:'blocked-settlement-club',budget:0,roster:[
  {id:'blocked-player',name:'Joueur Bloqué',playerType:'system',contract:{id:'blocked-contract',clubId:'blocked-settlement-club',playerId:'blocked-player',status:'active',weeklyWage:100,salary:100}}
 ]};
 const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-settlement-failure-'));
 try {
  const transferStore={state:{events:[{id:'blocked-human-wage',type:'salary-payment',clubId:club.id,amount:50,at:start}],careers:[]}};
  const service=new JsonClubFinanceService(directory,{clubs:[club],transferStore,now:()=>now});
  now=start+7*86400000;
  const result=service.settleScheduledItems(now);
  assert.equal(result.ok,false);
  assert.equal(result.systemWages.unpaid,1);
  assert.equal(result.wages.unpaid,1);
  assert.equal(result.failures.some(item=>item.category==='system-wages'),true);
  assert.equal(result.failures.some(item=>item.category==='player-wages'),true);
  assert.equal(service.store.getAccount(club.id).totalExpenses,0);
 } finally {rmSync(directory,{recursive:true,force:true});}
});


test('P27 finances : le cycle global remonte un remboursement de prêt partiel',()=>{
 const start=Date.UTC(2027,0,1);let now=start;
 const club={id:'partial-loan-club',budget:0,roster:[]};
 const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-partial-loan-'));
 try {
  const service=new JsonClubFinanceService(directory,{clubs:[club],now:()=>now});
  service.store.openAccount(club.id,0);
  service.store.issueLoan(club.id,{id:'partial-loan',lender:'Caisse',principal:1000,totalRepayment:1200,durationWeeks:2,issuedAt:start});
  service.store.post(club.id,{id:'partial-loan-spend',category:'other',amount:1000,direction:'expense'});
  service.store.post(club.id,{id:'partial-loan-funds',category:'other',amount:600,direction:'income'});
  now=start+15*86400000;
  const result=service.settleScheduledItems(now);
  assert.equal(result.ok,false);
  assert.equal(result.failures.some(item=>item.category==='loan-repayment'&&item.paid===1&&item.unpaid===1),true);
  assert.equal(result.loans[0].unpaid,true);
  assert.equal(result.loans[0].paid,1);
 } finally {rmSync(directory,{recursive:true,force:true});}
});


test('P27 finances : refuse un calendrier de paie corrompu au lieu de perdre les arriérés',()=>{
 const f=setup();
 try {
  writeFileSync(path.join(f.directory,'system-payroll-schedule.json'),'{invalid-json');
  assert.throws(()=>new JsonClubFinanceService(f.directory,{clubs:DEFAULT_CLUBS,transferStore:f.transferStore}),/PAYROLL_SCHEDULE_CORRUPT/);
 } finally {f.cleanup();}
});

test('P27 finances : une panne du calendrier après écriture du salaire reste récupérable sans double débit',()=>{
 const start=Date.UTC(2027,0,1);let now=start;
 const club={id:'schedule-retry-club',budget:1000,roster:[
  {id:'schedule-player',name:'Joueur calendrier',playerType:'system',contract:{id:'schedule-contract',clubId:'schedule-retry-club',playerId:'schedule-player',status:'active',weeklyWage:80,salary:80}}
 ]};
 const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-payroll-schedule-retry-'));
 try {
  const service=new JsonClubFinanceService(directory,{clubs:[club],now:()=>now});
  now=start+7*86400000;
  const persist=service.persistPayrollSchedule.bind(service);
  service.persistPayrollSchedule=()=>false;
  const failed=service.settleSystemPayroll(now);
  assert.equal(failed.ok,false);
  assert.equal(failed.reason,'schedule-persistence-failed');
  assert.equal(service.store.getAccount(club.id).totalExpenses,80);
  assert.equal(service.payrollSchedule[club.id],start);
  service.persistPayrollSchedule=persist;
  const retry=service.settleSystemPayroll(now);
  assert.equal(retry.ok,true);
  assert.equal(retry.posted,0);
  assert.equal(service.store.getAccount(club.id).totalExpenses,80);
  assert.equal(service.payrollSchedule[club.id],now);
 } finally {rmSync(directory,{recursive:true,force:true});}
});


test('P27 finances : réconcilie les indemnités de transfert dans les deux grands livres sans doublon',()=>{
 const from=DEFAULT_CLUBS[0],to=DEFAULT_CLUBS[1];
 const event={id:'transfer-ledger-event-1',type:'transfer',fromClubId:from.id,toClubId:to.id,fee:2500,at:Date.UTC(2027,0,15)};
 const f=setup({events:[event]});
 try {
  const fromBefore=f.service.store.balance(from.id),toBefore=f.service.store.balance(to.id);
  const first=f.service.syncRecordedTransferFees();
  assert.equal(first.ok,true);assert.equal(first.posted,2);assert.equal(first.unpaid,0);
  assert.equal(f.service.store.balance(from.id),fromBefore-2500);
  assert.equal(f.service.store.balance(to.id),toBefore+2500);
  const second=f.service.syncRecordedTransferFees();
  assert.equal(second.ok,true);assert.equal(second.posted,0);
  assert.equal(f.service.store.balance(from.id),fromBefore-2500);
  assert.equal(f.service.store.balance(to.id),toBefore+2500);
  assert.equal(f.service.store.getAccount(from.id).totalExpenses,2500);
  assert.equal(f.service.store.getAccount(to.id).totalIncome,2500);
 } finally {f.cleanup();}
});

test('P27 finances : conserve une indemnité de transfert à réconcilier si le débit échoue',()=>{
 const from={...DEFAULT_CLUBS[0],budget:0},to=DEFAULT_CLUBS[1];
 const event={id:'transfer-ledger-event-retry',type:'transfer',fromClubId:from.id,toClubId:to.id,fee:100,at:1000};
 const f=setup({events:[event],clubs:[from,to]});
 try {
  const first=f.service.syncRecordedTransferFees();
  assert.equal(first.ok,false);assert.equal(first.unpaid,1);
  assert.equal(f.service.store.getAccount(to.id).totalIncome,0);
  f.service.store.post(from.id,{id:'transfer-retry-funds',category:'other',amount:100,direction:'income'});
  const retry=f.service.syncRecordedTransferFees();
  assert.equal(retry.ok,true);assert.equal(retry.posted,2);
  assert.equal(f.service.store.getAccount(from.id).totalExpenses,100);
  assert.equal(f.service.store.getAccount(to.id).totalIncome,100);
 } finally {f.cleanup();}
});


test('P27 journal financier : reprend une indemnité après redémarrage sans doubler le débit',()=>{
 const from=DEFAULT_CLUBS[0],to=DEFAULT_CLUBS[1];
 const event={id:'transfer-journal-restart',type:'transfer',fromClubId:from.id,toClubId:to.id,fee:1800,at:Date.UTC(2027,1,1)};
 const f=setup({events:[event]});
 try {
  const first=f.service.syncRecordedTransferFees();
  assert.equal(first.ok,true);assert.equal(first.posted,2);
  const journal=JSON.parse(readFileSync(path.join(f.directory,'transfer-finance-journal.json'),'utf8'));
  assert.equal(journal.transfers[0].status,'completed');
  assert.equal(journal.transfers[0].debitPosted,true);
  assert.equal(journal.transfers[0].creditPosted,true);
  const restarted=new JsonClubFinanceService(f.directory,{clubs:DEFAULT_CLUBS,transferStore:f.transferStore});
  const retry=restarted.syncRecordedTransferFees();
  assert.equal(retry.ok,true);assert.equal(retry.posted,0);
  assert.equal(restarted.store.getAccount(from.id).totalExpenses,1800);
  assert.equal(restarted.store.getAccount(to.id).totalIncome,1800);
 } finally {f.cleanup();}
});

test('P27 journal financier : reprend après une panne du checkpoint du débit sans double écriture',()=>{
 const from=DEFAULT_CLUBS[0],to=DEFAULT_CLUBS[1];
 const event={id:'transfer-journal-checkpoint',type:'transfer',fromClubId:from.id,toClubId:to.id,fee:900,at:Date.UTC(2027,1,2)};
 const f=setup({events:[event]});
 try {
  const persist=f.service.persistTransferJournal.bind(f.service);
  f.service.persistTransferJournal=next=>next.transfers.some(item=>item.debitPosted&&!item.creditPosted)?false:persist(next);
  const failed=f.service.syncRecordedTransferFees();
  assert.equal(failed.ok,false);assert.equal(failed.transfers[0].stage,'debit-checkpoint');
  assert.equal(f.service.store.getAccount(from.id).totalExpenses,900);
  assert.equal(f.service.store.getAccount(to.id).totalIncome,0);
  f.service.persistTransferJournal=persist;
  const retry=f.service.syncRecordedTransferFees();
  assert.equal(retry.ok,true);assert.equal(retry.posted,1);
  assert.equal(f.service.store.getAccount(from.id).totalExpenses,900);
  assert.equal(f.service.store.getAccount(to.id).totalIncome,900);
 } finally {f.cleanup();}
});


test('P27 journal financier : reprend les salaires humains après redémarrage sans double écriture',()=>{
 const event={id:'salary-journal-restart',type:'salary-payment',clubId:DEFAULT_CLUBS[0].id,amount:700,at:Date.UTC(2027,0,1)};
 const f=setup({events:[event]});
 try {
  const first=f.service.syncRecordedPlayerWages();
  assert.equal(first.ok,true);assert.equal(first.posted,1);
  const journal=JSON.parse(readFileSync(path.join(f.directory,'transfer-finance-journal.json'),'utf8'));
  assert.equal(journal.playerWages[0].posted,true);
  const restarted=new JsonClubFinanceService(f.directory,{clubs:DEFAULT_CLUBS,transferStore:f.transferStore});
  assert.equal(restarted.syncRecordedPlayerWages().posted,0);
  assert.equal(restarted.store.getAccount(event.clubId).totalExpenses,700);
 } finally {f.cleanup();}
});

test('P27 journal financier : reprend un salaire humain après panne du checkpoint sans doubler la dépense',()=>{
 const event={id:'salary-journal-checkpoint',type:'salary-payment',clubId:DEFAULT_CLUBS[0].id,amount:450,at:Date.UTC(2027,0,2)};
 const f=setup({events:[event]});
 try {
  const persist=f.service.persistTransferJournal.bind(f.service);
  let journalWrites=0;
  f.service.persistTransferJournal=next=>next.playerWages?.some(item=>item.posted===true)?false:persist(next);
  const failed=f.service.syncRecordedPlayerWages();
  assert.equal(failed.ok,false);assert.equal(failed.clubs[0].stage,'checkpoint');
  assert.equal(f.service.store.getAccount(event.clubId).totalExpenses,450);
  f.service.persistTransferJournal=persist;
  const retry=f.service.syncRecordedPlayerWages();
  assert.equal(retry.ok,true);assert.equal(retry.posted,0);
  assert.equal(f.service.store.getAccount(event.clubId).totalExpenses,450);
 } finally {f.cleanup();}
});


test('P27 réconciliation : audite les comptes, contrats et journaux sans modifier les soldes',()=>{
 const f=setup();
 try {
  const audit=f.service.auditReconciliation();
  assert.equal(audit.ok,true);
  assert.equal(audit.issueCount,0);
  assert.equal(audit.clubs,DEFAULT_CLUBS.length);
  assert.equal(audit.accounts,DEFAULT_CLUBS.length);
  assert.equal(audit.totalBalance,audit.openingBalance+audit.totalIncome-audit.totalExpenses);
  assert.equal(f.service.auditReconciliation().ok,true);
 } finally {f.cleanup();}
});

test('P27 réconciliation : détecte un compte manquant et un compte orphelin',()=>{
 const f=setup();
 try {
  const known=DEFAULT_CLUBS[0].id;
  f.service.store.accounts.delete(known);
  f.service.store.openAccount('orphan-finance-account',0);
  const audit=f.service.auditReconciliation();
  assert.equal(audit.ok,false);
  assert.deepEqual(audit.missingAccounts,[known]);
  assert.deepEqual(audit.orphanAccounts,['orphan-finance-account']);
  assert.equal(audit.issues.some(issue=>issue.type==='missing-account'),true);
  assert.equal(audit.issues.some(issue=>issue.type==='orphan-account'),true);
 } finally {f.cleanup();}
});

test('P27 réconciliation : détecte un checkpoint de transfert sans écriture correspondante',()=>{
 const from=DEFAULT_CLUBS[0],to=DEFAULT_CLUBS[1];
 const event={id:'audit-transfer-checkpoint',type:'transfer',fromClubId:from.id,toClubId:to.id,fee:500,at:Date.UTC(2027,0,1)};
 const f=setup({events:[event]});
 try {
  assert.equal(f.service.syncRecordedTransferFees().ok,true);
  const account=f.service.store.accounts.get(from.id);
  account.entries=account.entries.filter(entry=>entry.id!=='transfer-fee-out-audit-transfer-checkpoint');
  const audit=f.service.auditReconciliation();
  assert.equal(audit.ok,false);
  assert.equal(audit.issues.some(issue=>issue.type==='transfer-debit-checkpoint-without-entry'),true);
 } finally {f.cleanup();}
});


test('P27 réconciliation : détecte les doublons et états incohérents des journaux financiers',()=>{
 const f=setup();
 try {
  const from=DEFAULT_CLUBS[0],to=DEFAULT_CLUBS[1];
  f.service.transferJournal.transfers.push({
   id:'duplicate-transfer',fromClubId:from.id,toClubId:to.id,fee:100,
   debitPosted:true,creditPosted:true,status:'pending'
  });
  f.service.transferJournal.transfers.push({
   id:'duplicate-transfer',fromClubId:'unknown-club',toClubId:to.id,fee:0,
   debitPosted:false,creditPosted:false,status:'unknown'
  });
  f.service.transferJournal.playerWages.push(
   {id:'duplicate-wage',clubId:from.id,amount:50,posted:false},
   {id:'duplicate-wage',clubId:'missing-club',amount:-1,posted:'yes'}
  );
  const audit=f.service.auditReconciliation();
  assert.equal(audit.ok,false);
  assert.equal(audit.issues.some(issue=>issue.type==='transfer-journal-duplicate-or-missing-id'),true);
  assert.equal(audit.issues.some(issue=>issue.type==='transfer-journal-invalid-club-reference'),true);
  assert.equal(audit.issues.some(issue=>issue.type==='transfer-journal-invalid-state'),true);
  assert.equal(audit.issues.some(issue=>issue.type==='transfer-journal-status-checkpoint-mismatch'),true);
  assert.equal(audit.issues.some(issue=>issue.type==='player-wage-journal-duplicate-or-missing-id'),true);
  assert.equal(audit.issues.some(issue=>issue.type==='player-wage-journal-invalid-state'),true);
 } finally {f.cleanup();}
});


test('P27 réconciliation : signale les événements financiers source ignorés ou invalides',()=>{
 const club=DEFAULT_CLUBS[0];
 const events=[
  {id:'valid-transfer',type:'transfer',fromClubId:club.id,toClubId:club.id,fee:500},
  {id:'bad-wage',type:'salary-payment',clubId:'missing-club',amount:0},
  {id:'bad-wage',type:'salary-payment',clubId:club.id,amount:100}
 ];
 const f=setup({events});
 try {
  const audit=f.service.auditReconciliation();
  assert.equal(audit.ok,false);
  assert.equal(audit.issues.some(issue=>issue.type==='source-transfer-event-invalid'),true);
  assert.equal(audit.issues.some(issue=>issue.type==='source-player-wage-event-invalid'),true);
  assert.equal(audit.issues.some(issue=>issue.type==='source-finance-event-duplicate-or-missing-id'),true);
 } finally {f.cleanup();}
});


test('P27 finance : refuse un checkpoint de paie invalide pour un club existant',()=>{
 const f=setup();
 try {
  writeFileSync(path.join(f.directory,'system-payroll-schedule.json'),JSON.stringify({
   version:1,clubs:{[DEFAULT_CLUBS[0].id]:'not-a-timestamp'}
  }));
  assert.throws(()=>new JsonClubFinanceService(f.directory,{
   clubs:DEFAULT_CLUBS,transferStore:f.transferStore
  }),/PAYROLL_SCHEDULE_CORRUPT/);
 } finally { rmSync(f.directory,{recursive:true,force:true}); }
});
