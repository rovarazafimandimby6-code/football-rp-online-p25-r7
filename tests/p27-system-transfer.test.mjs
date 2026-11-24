import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ClubManager } from '../src/club-manager.js';
import { P27SystemTransferService } from '../server/system-transfer-service.js';
import { JsonClubFinanceService } from '../server/club-finance-service.js';

const clubs = [
  { id:'club-a', name:'Club A', division:'D2', capacity:12, budget:100000, colors:['#111111','#222222','#333333'] },
  { id:'club-b', name:'Club B', division:'D3', capacity:12, budget:100000, colors:['#111111','#222222','#333333'] }
];
function setup() {
  const directory = mkdtempSync(path.join(os.tmpdir(),'p27-system-transfer-'));
  const storage = { value:null, getItem(){return this.value;}, setItem(key,value){this.value=value;} };
  const manager = new ClubManager(clubs,storage,'test-rosters');
  manager.addPlayer('club-a',{
    id:'system-player-1',name:'Test Player',playerType:'system',rating:65,number:8,
    contract:{status:'active',clubId:'club-a',expiresAt:new Date(Date.now()+30*86400000).toISOString()}
  });
  const journal = new Map();
  let failFinance = false;
  const financeService = {
    journalTransferFee(event) {
      if(failFinance) return {ok:false,reason:'ledger-temporary-failure'};
      const old=journal.get(event.id);
      if(old && JSON.stringify(old)!==JSON.stringify(event)) return {ok:false,reason:'transfer-journal-conflict'};
      if(!old) journal.set(event.id,{...event});
      return {ok:true,record:{...event,status:'completed'}};
    }
  };
  return {directory,manager,financeService,journal,setFailFinance(value){failFinance=value;},cleanup(){rmSync(directory,{recursive:true,force:true});}};
}

test('P27 lot 85 : transfert IA déplace le joueur et règle le club acheteur vers le vendeur une seule fois',()=>{
 const f=setup();
 try {
  const service=new P27SystemTransferService(f.directory,{clubManager:f.manager,financeService:f.financeService});
  const request={id:'ai-transfer-001',fromClubId:'club-a',toClubId:'club-b',playerId:'system-player-1',fee:2500};
  const first=service.transfer(request);
  assert.equal(first.ok,true);
  assert.equal(f.manager.getClub('club-a').roster.some(p=>p.id==='system-player-1'),false);
  assert.equal(f.manager.getClub('club-b').roster.some(p=>p.id==='system-player-1'),true);
  assert.equal(f.journal.size,1);
  assert.equal([...f.journal.values()][0].fromClubId,'club-b');
  assert.equal([...f.journal.values()][0].toClubId,'club-a');
  assert.equal(service.transfer(request).alreadyCompleted,true);
  assert.equal(f.journal.size,1);
 } finally {f.cleanup();}
});

test('P27 lot 85 : débite réellement le club acheteur et crédite le club vendeur dans le grand livre',()=>{
 const f=setup();
 try {
  const finance=new JsonClubFinanceService(f.directory,{clubs:[...f.manager.clubs.values()],now:()=>Date.now()});
  const buyerBefore=finance.store.balance('club-b');
  const sellerBefore=finance.store.balance('club-a');
  const service=new P27SystemTransferService(f.directory,{clubManager:f.manager,financeService:finance});
  const result=service.transfer({id:'ai-transfer-real-ledger',fromClubId:'club-a',toClubId:'club-b',playerId:'system-player-1',fee:3200});
  assert.equal(result.ok,true);
  assert.equal(finance.store.balance('club-b'),buyerBefore-3200);
  assert.equal(finance.store.balance('club-a'),sellerBefore+3200);
  assert.equal(finance.store.getAccount('club-b').totalExpenses,3200);
  assert.equal(finance.store.getAccount('club-a').totalIncome,3200);
 } finally {f.cleanup();}
});

test('P27 lot 85 : reprend le règlement financier en attente après redémarrage sans déplacer deux fois le joueur',()=>{
 const f=setup();
 try {
  f.setFailFinance(true);
  const request={id:'ai-transfer-restart',fromClubId:'club-a',toClubId:'club-b',playerId:'system-player-1',fee:1800};
  const first=new P27SystemTransferService(f.directory,{clubManager:f.manager,financeService:f.financeService}).transfer(request);
  assert.equal(first.ok,false);
  assert.equal(first.pending,true);
  assert.equal(f.manager.getClub('club-b').roster.filter(p=>p.id==='system-player-1').length,1);
  f.setFailFinance(false);
  const restarted=new P27SystemTransferService(f.directory,{clubManager:f.manager,financeService:f.financeService});
  const replay=restarted.processPending();
  assert.equal(replay.ok,true);
  assert.equal(replay.processed,1);
  assert.equal(f.manager.getClub('club-b').roster.filter(p=>p.id==='system-player-1').length,1);
  assert.equal(f.journal.size,1);
 } finally {f.cleanup();}
});

test('P27 lot 85 : annule le déplacement si la sauvegarde du roster échoue puis reprend proprement',()=>{
 const f=setup();
 try {
  const service=new P27SystemTransferService(f.directory,{clubManager:f.manager,financeService:f.financeService});
  const persist=f.manager.storage.setItem.bind(f.manager.storage);
  f.manager.storage.setItem=()=>{throw new Error('simulated-roster-storage-failure');};
  const request={id:'ai-transfer-roster-retry',fromClubId:'club-a',toClubId:'club-b',playerId:'system-player-1',fee:700};
  const failed=service.transfer(request);
  assert.equal(failed.ok,false);
  assert.equal(failed.reason,'roster-persistence-failed');
  assert.equal(f.manager.getClub('club-a').roster.filter(p=>p.id==='system-player-1').length,1);
  assert.equal(f.manager.getClub('club-b').roster.some(p=>p.id==='system-player-1'),false);
  assert.equal(f.journal.size,0);
  f.manager.storage.setItem=persist;
  const replay=service.processPending();
  assert.equal(replay.ok,true);
  assert.equal(f.manager.getClub('club-b').roster.filter(p=>p.id==='system-player-1').length,1);
  assert.equal(f.journal.size,1);
 } finally {f.cleanup();}
});

function marketFixture(directory) {
 const player={id:'system-market-forward',name:'Forward',playerType:'system',role:'FWD',rating:70,number:9,contract:{status:'active',clubId:'market-seller',playerId:'system-market-forward',expiresAt:'2028-12-31T00:00:00.000Z'}};
 const seller={id:'market-seller',division:'D2',rating:60,capacity:12,roster:[player,{id:'s2',playerType:'system',role:'FWD',rating:55,contract:{status:'active',clubId:'market-seller',expiresAt:'2028-12-31T00:00:00.000Z'}},{id:'s3',playerType:'system',role:'FWD',rating:54,contract:{status:'active',clubId:'market-seller',expiresAt:'2028-12-31T00:00:00.000Z'}}]};
 const buyer={id:'market-buyer',division:'D2',rating:75,capacity:12,roster:[]};
 const buyer2={id:'market-buyer-2',division:'D2',rating:70,capacity:12,roster:[]};
 const buyer3={id:'market-buyer-3',division:'D3',rating:65,capacity:12,roster:[]};
 const manager={
  clubs:new Map([[seller.id,seller],[buyer.id,buyer],[buyer2.id,buyer2],[buyer3.id,buyer3]]),
  getClub(id){return this.clubs.get(id)||null;},
  listClubs(){return [...this.clubs.values()];},
  transferPlayer(fromId,toId,playerId){
   const from=this.clubs.get(fromId),to=this.clubs.get(toId),i=from.roster.findIndex(p=>p.id===playerId);
   if(i<0||to.roster.length>=to.capacity)return {ok:false,reason:'invalid'};
   const [p]=from.roster.splice(i,1);to.roster.push({...p,number:10,contract:{...p.contract,clubId:toId,previousClubId:fromId}});
   return {ok:true};
  }
 };
 const finance={store:{balance(){return 1000000;}},journalTransferFee(){return {ok:true};}};
 return new P27SystemTransferService(directory,{clubManager:manager,financeService:finance,now:()=>Date.parse('2028-01-01T00:00:00.000Z')});
}

test('P27 lot 85 : simulation du mercato IA déterministe, fondée sur les besoins de poste et limitée',()=>{
 const a=mkdtempSync(path.join(os.tmpdir(),'p27-market-a-'));
 const b=mkdtempSync(path.join(os.tmpdir(),'p27-market-b-'));
 const c=mkdtempSync(path.join(os.tmpdir(),'p27-market-invalid-'));
 try {
  const first=marketFixture(a).simulateMarket({windowId:'winter-2028',maxTransfers:2,now:Date.parse('2028-01-01T00:00:00.000Z')});
  const second=marketFixture(b).simulateMarket({windowId:'winter-2028',maxTransfers:2,now:Date.parse('2028-01-01T00:00:00.000Z')});
  assert.equal(first.ok,true);
  assert.equal(first.processed,1);
  assert.equal(first.transfers[0].playerId,'system-market-forward');
  assert.equal(first.transfers[0].id,second.transfers[0].id);
  assert.equal(first.transfers[0].fee,second.transfers[0].fee);
  assert.equal(marketFixture(c).simulateMarket({windowId:'x',maxTransfers:0}).reason,'invalid-market-window');
 } finally {rmSync(a,{recursive:true,force:true});rmSync(b,{recursive:true,force:true});rmSync(c,{recursive:true,force:true});}
});

test('P27 lot 94 : une vague de mercato ne vide jamais le poste du vendeur sous deux joueurs IA',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'p27-market-depth-batch-'));
 try {
  const service=marketFixture(directory);
  const result=service.simulateMarket({windowId:'depth-batch-2028',maxTransfers:5,now:Date.parse('2028-01-01T00:00:00.000Z')});
  const seller=service.clubManager.getClub('market-seller');
  const remaining=seller.roster.filter(player=>player.playerType==='system' && player.role==='FWD').length;
  assert.ok(result.evaluated>1);
  assert.equal(result.processed,1);
  assert.equal(remaining,2);
 } finally {rmSync(directory,{recursive:true,force:true});}
});

test('P27 lot 85 : respecte l’horloge explicite de la fenêtre lors du contrôle du contrat',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'p27-market-clock-'));
 try {
  const service=marketFixture(directory);
  service.clubManager.getClub('market-seller').roster[0].contract.expiresAt='2027-12-31T00:00:00.000Z';
  const result=service.simulateMarket({windowId:'autumn-2027',maxTransfers:1,now:Date.parse('2027-10-01T00:00:00.000Z')});
  assert.equal(result.processed,1);
 } finally {rmSync(directory,{recursive:true,force:true});}
});

test('P27 lot 85 : ne compte pas les joueurs humains dans le seuil de réserve du vendeur IA',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'p27-market-human-count-'));
 try {
  const service=marketFixture(directory);
  const seller=service.clubManager.getClub('market-seller');
  seller.roster.pop();
  seller.roster.push({id:'human-forward',playerType:'human',role:'FWD',rating:90});
  const result=service.simulateMarket({windowId:'human-count-2028',maxTransfers:1,now:Date.parse('2028-01-01T00:00:00.000Z')});
  assert.equal(result.evaluated,0);
  assert.equal(result.processed,0);
 } finally {rmSync(directory,{recursive:true,force:true});}
});

test('P27 lot 85 : refuse les carrières humaines, les indemnités invalides et les clubs inconnus',()=>{
 const f=setup();
 try {
  f.manager.addPlayer('club-a',{id:'human-career-1',name:'Human Player',playerType:'human',rating:60,number:9,contract:{status:'active',clubId:'club-a',weeklyWage:100,salary:100}});
  const service=new P27SystemTransferService(f.directory,{clubManager:f.manager,financeService:f.financeService});
  assert.equal(service.transfer({id:'ai-transfer-human',fromClubId:'club-a',toClubId:'club-b',playerId:'human-career-1',fee:1000}).reason,'human-career-managed');
  assert.equal(service.transfer({id:'ai-transfer-bad-fee',fromClubId:'club-a',toClubId:'club-b',playerId:'system-player-1',fee:-1}).reason,'invalid-request');
  assert.equal(service.transfer({id:'ai-transfer-bad-club',fromClubId:'missing',toClubId:'club-b',playerId:'system-player-1',fee:1000}).reason,'invalid-clubs');
 } finally {f.cleanup();}
});
