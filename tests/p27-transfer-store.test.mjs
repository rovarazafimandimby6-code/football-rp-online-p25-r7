import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {JsonTransferStore} from '../server/transfer-store.js';
function setup(start='2027-01-15T12:00:00.000Z'){const directory=mkdtempSync(path.join(os.tmpdir(),'fpro-transfers-'));let now=Date.parse(start);return{directory,get now(){return now;},setNow(value){now=Date.parse(value);},store:new JsonTransferStore(directory,{now:()=>now}),cleanup:()=>rmSync(directory,{recursive:true,force:true})};}
test('P27 mercato : contrat persistant, transfert trace et budgets clubs coherents',()=>{const f=setup();try{const signed=f.store.signContract('account-1',{clubId:'antananarivo-fc',salary:3000,durationDays:365});assert.equal(signed.ok,true);const offer=f.store.requestOffer('account-1',{toClubId:'toamasina-united'});assert.equal(offer.ok,true);const beforeTarget=f.store.club('toamasina-united').budget,beforeCurrent=f.store.club('antananarivo-fc').budget;const accepted=f.store.acceptOffer('account-1',offer.offer.id);assert.equal(accepted.ok,true);assert.equal(accepted.career.clubId,'toamasina-united');assert.equal(f.store.club('toamasina-united').budget,beforeTarget-offer.offer.fee);assert.equal(f.store.club('antananarivo-fc').budget,beforeCurrent+offer.offer.fee);const restored=new JsonTransferStore(f.directory,{now:()=>f.now});assert.equal(restored.getCareer('account-1').clubId,'toamasina-united');const events=restored.getPlayerHistory(accepted.career.playerId);assert.deepEqual(events.map(e=>e.type),['signing','transfer']);assert.equal(JSON.stringify(events).includes('accountId'),false);}finally{f.cleanup();}});
test('P27 mercato : fenetre ferme hors periode et acceptation idempotente',()=>{const f=setup('2026-11-24T12:00:00.000Z');try{f.store.signContract('account-2',{clubId:'antananarivo-fc',salary:2000});assert.equal(f.store.requestOffer('account-2',{toClubId:'toamasina-united'}).reason,'window-closed');f.setNow('2027-01-15T12:00:00.000Z');const offer=f.store.requestOffer('account-2',{toClubId:'toamasina-united'});assert.equal(offer.ok,true);assert.equal(f.store.acceptOffer('account-2',offer.offer.id).ok,true);assert.equal(f.store.acceptOffer('account-2',offer.offer.id).reason,'offer-unavailable');}finally{f.cleanup();}});
test('P27 contrats : salaires hebdomadaires payes et expiration',()=>{const f=setup('2027-01-01T00:00:00.000Z');try{f.store.signContract('account-3',{clubId:'fianarantsoa-athletic',salary:1000,durationDays:10});f.setNow('2027-01-09T00:00:00.000Z');const career=f.store.getCareer('account-3');assert.equal(career.wallet,3500);assert.equal(career.contract.status,'active');f.setNow('2027-01-12T00:00:00.000Z');const expired=f.store.getCareer('account-3');assert.equal(expired.contract.status,'expired');assert.equal(expired.clubId,null);}finally{f.cleanup();}});

test('P27 prêts : prêt accepté, contrat parent conservé et retour automatique après redémarrage',()=>{const f=setup('2027-01-15T12:00:00.000Z');try{const signed=f.store.signContract('account-loan-1',{clubId:'antananarivo-fc',salary:1200,durationDays:180});assert.equal(signed.ok,true);const offer=f.store.requestLoanOffer('account-loan-1',{toClubId:'toamasina-united',durationDays:30});assert.equal(offer.ok,true);const accepted=f.store.acceptLoanOffer('account-loan-1',offer.offer.id);assert.equal(accepted.ok,true);assert.equal(accepted.career.clubId,'toamasina-united');assert.equal(accepted.career.contract.loan.parentClubId,'antananarivo-fc');assert.equal(accepted.career.contract.loan.status,'active');const parentExpiry=accepted.career.contract.expiresAt,parentSalary=accepted.career.contract.salary,parentPlayerId=accepted.career.contract.playerId;const restored=new JsonTransferStore(f.directory,{now:()=>f.now});f.setNow('2027-02-15T12:00:00.000Z');const returned=restored.getCareer('account-loan-1');assert.equal(returned.clubId,'antananarivo-fc');assert.equal(returned.contract.loan,undefined);assert.equal(returned.contract.status,'active');assert.equal(returned.contract.clubId,'antananarivo-fc');assert.equal(returned.contract.expiresAt,parentExpiry);assert.equal(returned.contract.salary,parentSalary);assert.equal(returned.contract.playerId,parentPlayerId);assert.equal(returned.loanHistory.at(-1).type,'return');assert.ok(restored.pendingRosterSync().some(item=>item.action==='upsert'&&item.clubId==='antananarivo-fc'&&item.previousClubId==='toamasina-united'));assert.deepEqual(restored.getPlayerHistory(returned.playerId).map(item=>item.type),['signing','loan','loan-return']);}finally{f.cleanup();}});
test('P27 prêts : expiration du contrat parent avant la fin du prêt libère le joueur',()=>{const f=setup('2027-01-15T12:00:00.000Z');try{f.store.signContract('account-loan-2',{clubId:'antananarivo-fc',salary:900,durationDays:15});const offer=f.store.requestLoanOffer('account-loan-2',{toClubId:'toamasina-united',durationDays:30});assert.equal(offer.ok,true);assert.equal(f.store.acceptLoanOffer('account-loan-2',offer.offer.id).ok,true);f.setNow('2027-02-05T12:00:00.000Z');const expired=f.store.getCareer('account-loan-2');assert.equal(expired.contract.status,'expired');assert.equal(expired.clubId,null);assert.ok(f.store.pendingRosterSync().some(item=>item.action==='release'&&item.previousClubId==='toamasina-united'));}finally{f.cleanup();}});
test('P27 prêts : refuse un prêt sans contrat actif, hors fenêtre ou vers le même club',()=>{const f=setup('2026-11-24T12:00:00.000Z');try{assert.equal(f.store.requestLoanOffer('account-loan-3',{toClubId:'toamasina-united'}).reason,'invalid-club');f.store.signContract('account-loan-3',{clubId:'antananarivo-fc',salary:900,durationDays:90});assert.equal(f.store.requestLoanOffer('account-loan-3',{toClubId:'toamasina-united'}).reason,'window-closed');f.setNow('2027-01-15T12:00:00.000Z');assert.equal(f.store.requestLoanOffer('account-loan-3',{toClubId:'antananarivo-fc'}).reason,'same-club');assert.equal(f.store.requestLoanOffer('account-loan-3',{toClubId:'toamasina-united',durationDays:2}).reason,'invalid-loan-duration');}finally{f.cleanup();}});


test('P27 outbox : les échecs, tentatives et clôtures idempotentes survivent au redémarrage',()=>{
 const f=setup();
 try {
  const signed=f.store.signContract('account-outbox-retry',{clubId:'antananarivo-fc',salary:1100,durationDays:180});
  assert.equal(signed.ok,true);
  const command=f.store.pendingRosterSync()[0];
  assert.equal(f.store.failRosterSync(command.id,new Error('temporary roster write failure')).ok,true);
  let restored=new JsonTransferStore(f.directory,{now:()=>f.now});
  assert.equal(restored.pendingRosterSync()[0].attempts,1);
  assert.equal(restored.pendingRosterSync()[0].lastError,'temporary roster write failure');
  assert.equal(restored.failRosterSync(command.id,'second failure').ok,true);
  restored=new JsonTransferStore(f.directory,{now:()=>f.now});
  assert.equal(restored.pendingRosterSync()[0].attempts,2);
  assert.equal(restored.completeRosterSync(command.id).ok,true);
  restored=new JsonTransferStore(f.directory,{now:()=>f.now});
  assert.equal(restored.pendingRosterSync().length,0);
  assert.equal(restored.completeRosterSync(command.id).alreadyCompleted,true);
 } finally { f.cleanup(); }
});

test('P27 prêts : les offres en attente sont annulées si le contrat parent expire',()=>{
 const f=setup('2027-01-15T12:00:00.000Z');
 try{
  f.store.signContract('account-loan-expiry-cleanup',{clubId:'antananarivo-fc',salary:900,durationDays:10});
  const offer=f.store.requestLoanOffer('account-loan-expiry-cleanup',{toClubId:'toamasina-united',durationDays:30});
  assert.equal(offer.ok,true);
  f.setNow('2027-01-26T12:00:00.000Z');
  const career=f.store.getCareer('account-loan-expiry-cleanup');
  assert.equal(career.contract.status,'expired');
  assert.equal(career.loanOffers.find(item=>item.id===offer.offer.id).status,'cancelled');
 }finally{f.cleanup();}
});

test('P27 prêts : la résiliation du contrat annule les offres de prêt encore ouvertes',()=>{
 const f=setup('2027-01-15T12:00:00.000Z');
 try{
  f.store.signContract('account-loan-termination-cleanup',{clubId:'antananarivo-fc',salary:900,durationDays:90});
  const offer=f.store.requestLoanOffer('account-loan-termination-cleanup',{toClubId:'toamasina-united',durationDays:30});
  assert.equal(offer.ok,true);
  const ended=f.store.terminateContract('account-loan-termination-cleanup');
  assert.equal(ended.ok,true);
  assert.equal(ended.career.loanOffers.find(item=>item.id===offer.offer.id).status,'cancelled');
 }finally{f.cleanup();}
});

test('P27 carrière : les vues retournées ne permettent pas de modifier les contrats et offres internes',()=>{
 const f=setup('2027-01-15T12:00:00.000Z');
 try{
  f.store.signContract('account-view-isolation',{clubId:'antananarivo-fc',salary:1250,durationDays:180});
  const offer=f.store.requestLoanOffer('account-view-isolation',{toClubId:'toamasina-united',durationDays:30});
  assert.equal(offer.ok,true);
  const accepted=f.store.acceptLoanOffer('account-view-isolation',offer.offer.id);
  assert.equal(accepted.ok,true);
  accepted.career.contract.loan.parentContract.salary=1;
  accepted.career.contract.loan.parentContract.clubId='forged-club';
  accepted.career.loanOffers[0].status='pending';
  accepted.career.history[0].type='forged-history';
  const current=f.store.getCareer('account-view-isolation');
  assert.equal(current.contract.loan.parentContract.salary,1250);
  assert.equal(current.contract.loan.parentContract.clubId,'antananarivo-fc');
  assert.equal(current.loanOffers[0].status,'accepted');
  assert.equal(current.history[0].type,'signing');
 }finally{f.cleanup();}
});

test('P27 effectifs : le snapshot de synchronisation du prêt reste intact après le retour',()=>{
 const f=setup('2027-01-15T12:00:00.000Z');
 try{
  f.store.signContract('account-loan-outbox',{clubId:'antananarivo-fc',salary:1400,durationDays:180});
  const offer=f.store.requestLoanOffer('account-loan-outbox',{toClubId:'toamasina-united',durationDays:30});
  assert.equal(offer.ok,true);
  assert.equal(f.store.acceptLoanOffer('account-loan-outbox',offer.offer.id).ok,true);
  const loanStart=f.store.pendingRosterSync().find(item=>item.reason==='loan-start');
  assert.ok(loanStart);
  assert.equal(loanStart.contract.loan.status,'active');
  f.setNow('2027-02-15T12:00:00.000Z');
  const returned=f.store.getCareer('account-loan-outbox');
  assert.equal(returned.clubId,'antananarivo-fc');
  const loanReturn=f.store.pendingRosterSync().find(item=>item.reason==='loan-return');
  assert.ok(loanReturn);
  assert.equal(loanReturn.contract.loan,undefined);
  const originalStart=f.store.pendingRosterSync().find(item=>item.id===loanStart.id);
  assert.equal(originalStart.contract.loan.status,'active');
  assert.equal(originalStart.contract.loan.parentContract.salary,1400);
 }finally{f.cleanup();}
});

test('P27 prêts : un prêt actif bloque les transferts définitifs et invalide les anciennes offres',()=>{
 const f=setup('2027-01-15T12:00:00.000Z');
 try{
  f.store.signContract('account-loan-transfer-lock',{clubId:'antananarivo-fc',salary:1300,durationDays:180});
  const permanent=f.store.requestOffer('account-loan-transfer-lock',{toClubId:'fianarantsoa-athletic'});
  assert.equal(permanent.ok,true);
  const loan=f.store.requestLoanOffer('account-loan-transfer-lock',{toClubId:'toamasina-united',durationDays:7});
  assert.equal(loan.ok,true);
  const accepted=f.store.acceptLoanOffer('account-loan-transfer-lock',loan.offer.id);
  assert.equal(accepted.ok,true);
  assert.equal(accepted.career.offers.find(item=>item.id===permanent.offer.id).status,'cancelled');
  assert.equal(f.store.requestOffer('account-loan-transfer-lock',{toClubId:'fianarantsoa-athletic'}).reason,'player-on-loan');
  const row=f.store.state.careers.find(item=>item.accountId==='account-loan-transfer-lock');
  row.offers.find(item=>item.id===permanent.offer.id).status='pending';
  assert.equal(f.store.acceptOffer('account-loan-transfer-lock',permanent.offer.id).reason,'player-on-loan');
  assert.equal(f.store.getCareer('account-loan-transfer-lock').clubId,'toamasina-united');
 }finally{f.cleanup();}
});


test('P27 mercato : les identifiants de compte trop longs ne sont jamais tronqués vers une carrière existante',()=>{
 const f=setup();
 try{
  const valid='a'.repeat(64),aliased=valid+'x';
  assert.equal(f.store.signContract(valid,{clubId:'antananarivo-fc',salary:1000}).ok,true);
  assert.equal(f.store.getCareer(aliased),null);
  assert.equal(f.store.signContract(aliased,{clubId:'toamasina-united',salary:1000}).reason,'invalid-account');
  assert.equal(f.store.getCareer(valid).clubId,'antananarivo-fc');
 }finally{f.cleanup();}
});

test('P27 mercato : un identifiant de club suffixé ne peut pas désigner le club existant',()=>{
 const f=setup();
 try{
  assert.equal(f.store.signContract('strict-club-id',{clubId:'antananarivo-fc-extra',salary:1000}).reason,'invalid-club');
  assert.equal(f.store.getCareer('strict-club-id').clubId,null);
 }finally{f.cleanup();}
});

test('P27 mercato : les identifiants d’offre suffixés ne peuvent pas accepter une offre valide',()=>{
 const f=setup();
 try{
  f.store.signContract('strict-offer-id',{clubId:'antananarivo-fc',salary:1000,durationDays:180});
  const offer=f.store.requestOffer('strict-offer-id',{toClubId:'toamasina-united'});
  assert.equal(offer.ok,true);
  assert.equal(f.store.acceptOffer('strict-offer-id',offer.offer.id+'x').reason,'offer-unavailable');
  assert.equal(f.store.getCareer('strict-offer-id').clubId,'antananarivo-fc');
  assert.equal(f.store.acceptOffer('strict-offer-id',offer.offer.id).ok,true);
 }finally{f.cleanup();}
});

test('P27 outbox : un identifiant de commande suffixé ne clôture pas une entrée valide',()=>{
 const f=setup();
 try{
  f.store.signContract('strict-outbox-id',{clubId:'antananarivo-fc',salary:1000,durationDays:180});
  const command=f.store.pendingRosterSync()[0];
  assert.equal(f.store.completeRosterSync(command.id+'x').reason,'sync-not-found');
  assert.equal(f.store.failRosterSync(command.id+'x','forged failure').reason,'sync-not-found');
  assert.equal(f.store.pendingRosterSync()[0].attempts,0);
  assert.equal(f.store.pendingRosterSync().length,1);
  assert.equal(f.store.completeRosterSync(command.id).ok,true);
  assert.equal(f.store.pendingRosterSync().length,0);
 }finally{f.cleanup();}
});

test('P27 historique : un identifiant joueur invalide ne se rabat pas sur un identifiant tronqué',()=>{
 const f=setup();
 try{
  const playerId='p'.repeat(64);
  f.store.signContract('strict-history-id',{clubId:'antananarivo-fc',salary:1000,durationDays:180});
  const row=f.store.state.careers.find(item=>item.accountId==='strict-history-id');
  row.playerId=playerId;
  f.store.state.events.push({id:'event-history',playerId,type:'signing',at:f.now});
  assert.equal(f.store.getPlayerHistory(playerId).length,1);
  assert.deepEqual(f.store.getPlayerHistory(playerId+'x'),[]);
 }finally{f.cleanup();}
});
