import test from 'node:test';
import assert from 'node:assert/strict';
import { ClubFinanceStore } from '../src/p27-club-finance.js';
test('P27 finance : ouverture, journal comptable et solde exact',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v))};
 const finance=new ClubFinanceStore(storage,'finance-a');
 assert.equal(finance.openAccount('club-a',100000).ok,true);
 assert.equal(finance.post('club-a',{id:'sponsor-1',category:'sponsorship',amount:25000,direction:'income',createdAt:10}).account.balance,125000);
 assert.equal(finance.post('club-a',{id:'wage-1',category:'wages',amount:15000,direction:'expense',createdAt:20}).account.balance,110000);
 assert.equal(finance.getAccount('club-a').totalIncome,25000);
 assert.equal(finance.getAccount('club-a').totalExpenses,15000);
 const restored=new ClubFinanceStore(storage,'finance-a');
 assert.equal(restored.balance('club-a'),110000);
});
test('P27 finance : idempotence, solde négatif interdit et validation',()=>{
 const f=new ClubFinanceStore(null,'finance-b');f.openAccount('club-b',500);
 const entry={id:'ticket-1',category:'ticketing',amount:100,direction:'income'};
 assert.equal(f.post('club-b',entry).duplicate,false);
 assert.equal(f.post('club-b',entry).duplicate,true);
 assert.equal(f.balance('club-b'),600);
 assert.equal(f.post('club-b',{id:'cost',category:'wages',amount:601,direction:'expense'}).reason,'insufficient-funds');
 assert.equal(f.post('club-b',{id:'bad',category:'unknown',amount:1,direction:'income'}).reason,'invalid-entry');
 assert.equal(f.balance('club-b'),600);
});
test('P27 finance : calcul de la masse salariale sans inventer les contrats',()=>{
 assert.deepEqual(ClubFinanceStore.calculatePayroll([{weeklyWage:1200},{weeklyWage:800}]),{ok:true,weeklyPayroll:2000,players:2});
 assert.equal(ClubFinanceStore.calculatePayroll([{weeklyWage:-1}]).ok,false);
});
test('P27 finance : recettes de match calculées uniquement depuis affluence et prix fournis',()=>{
 assert.deepEqual(ClubFinanceStore.calculateMatchdayRevenue({attendance:350,averageTicketPrice:20}),{ok:true,revenue:7000});
 assert.equal(ClubFinanceStore.calculateMatchdayRevenue({attendance:-1,averageTicketPrice:20}).ok,false);
});
test('P27 finance : contrats sponsors versent les échéances dues une seule fois',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,String(v))};
 const f=new ClubFinanceStore(storage,'sponsor-payments');f.openAccount('club',0);
 const start=Date.UTC(2026,0,1);
 assert.equal(f.signSponsorContract('club',{id:'main',name:'Partenaire principal',weeklyPayment:5000,durationWeeks:4,signedAt:start}).ok,true);
 const first=f.settleSponsorPayments('club',start+15*86400000);
 assert.equal(first.paid,2);assert.equal(first.amount,10000);assert.equal(first.account.balance,10000);
 assert.equal(f.settleSponsorPayments('club',start+15*86400000).paid,0);
 const restored=new ClubFinanceStore(storage,'sponsor-payments');
 const final=restored.settleSponsorPayments('club',start+40*86400000);
 assert.equal(final.paid,2);assert.equal(final.account.balance,20000);
 assert.equal(final.account.sponsors[0].status,'completed');
});
test('P27 finance : une paie hebdomadaire est débitée en lot ou pas du tout',()=>{
 const f=new ClubFinanceStore(null,'payroll-batch');f.openAccount('club',1500);
 const result=f.postBatch('club',[{id:'week-1-p1',category:'wages',amount:800,direction:'expense'},{id:'week-1-p2',category:'wages',amount:800,direction:'expense'}]);
 assert.equal(result.reason,'insufficient-funds');assert.equal(f.balance('club'),1500);
 const paid=f.postBatch('club',[{id:'week-1-p1',category:'wages',amount:800,direction:'expense'},{id:'week-1-p2',category:'wages',amount:600,direction:'expense'}]);
 assert.equal(paid.ok,true);assert.equal(paid.account.balance,100);
});
test('P27 finance : diagnostic budgétaire hebdomadaire et autonomie de trésorerie',()=>{
 const result=ClubFinanceStore.assessWeeklyBudget({balance:10000,weeklyPayroll:3000,weeklyMaintenance:1000,weeklySponsorIncome:2500});
 assert.equal(result.status,'deficit');assert.equal(result.weeklyNet,-1500);assert.equal(result.runwayWeeks,6);
 assert.equal(ClubFinanceStore.assessWeeklyBudget({balance:-1,weeklyPayroll:0,weeklyMaintenance:0}).ok,false);
});
