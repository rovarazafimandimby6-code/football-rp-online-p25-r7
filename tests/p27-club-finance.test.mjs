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
