import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CLUBS } from '../src/club-manager.js';
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
