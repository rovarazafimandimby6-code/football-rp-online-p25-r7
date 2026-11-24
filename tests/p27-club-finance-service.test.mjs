import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ClubManager, DEFAULT_CLUBS } from '../src/club-manager.js';
import { JsonClubFinanceService } from '../server/club-finance-service.js';

function setup({events=[],careers=[],now=()=>Date.UTC(2027,0,15)}={}) {
  const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-finance-service-'));
  const transferStore={state:{events,careers}};
  return {directory,transferStore,service:new JsonClubFinanceService(directory,{clubs:DEFAULT_CLUBS,transferStore,now}),cleanup:()=>rmSync(directory,{recursive:true,force:true})};
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
