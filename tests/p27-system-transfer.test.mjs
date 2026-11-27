import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
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

test('P27 transfert local : prépare une copie profonde avant de déplacer le joueur',()=>{
 const f=setup();
 try {
  f.manager.addPlayer('club-a',{
   id:'system-player-deep-kit',name:'Deep Kit Player',playerType:'system',rating:66,number:10
  });
  const source=f.manager.clubs.get('club-a').roster.find(p=>p.id==='system-player-deep-kit');
  source.appearance={kitColors:{primary:'#aa0000'},details:{accessories:['captain-band']}};
  source.attributes={pace:70,technical:{control:77}};
  source.contract.metadata={clauses:['bonus']};
  const originalAppearance=source.appearance;
  const originalAccessories=source.appearance.details.accessories;
  const originalMetadata=source.contract.metadata;
  const result=f.manager.transferPlayer('club-a','club-b','system-player-deep-kit');
  assert.equal(result.ok,true);
  const moved=f.manager.clubs.get('club-b').roster.find(p=>p.id==='system-player-deep-kit');
  assert.notEqual(moved.appearance,originalAppearance);
  assert.notEqual(moved.appearance.details,source.appearance.details);
  assert.notEqual(moved.attributes,source.attributes);
  assert.deepEqual(originalAccessories,['captain-band']);
  assert.deepEqual(originalMetadata.clauses,['bonus']);
  assert.equal(moved.contract.clubId,'club-b');
  assert.equal(moved.contract.previousClubId,'club-a');
  assert.ok(Number.isInteger(moved.number) && moved.number >= 1 && moved.number <= 99);
  assert.equal(f.manager.clubs.get('club-a').roster.some(p=>p.id==='system-player-deep-kit'),false);
 } finally {f.cleanup();}
});

test('P27 transfert local : réattribue un numéro déjà porté dans le club acheteur',()=>{
 const f=setup();
 try {
  const target=f.manager.addPlayer('club-b',{id:'destination-number-owner',playerType:'system',rating:55,number:99});
  assert.equal(target.ok,true);
  const occupiedNumber=target.number;
  const source=f.manager.addPlayer('club-a',{id:'incoming-number-collision',playerType:'system',rating:61,number:occupiedNumber});
  assert.equal(source.ok,true);
  assert.equal(source.number,occupiedNumber);
  const result=f.manager.transferPlayer('club-a','club-b','incoming-number-collision');
  assert.equal(result.ok,true);
  assert.notEqual(result.number,occupiedNumber);
  const roster=f.manager.clubs.get('club-b').roster;
  const numbers=roster.map(player=>player.number);
  assert.equal(new Set(numbers).size,numbers.length);
  assert.equal(roster.find(player=>player.id==='incoming-number-collision').number,result.number);
 } finally {f.cleanup();}
});

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

test('P27 lot 100 : bloque un second transfert tant que la saga précédente du joueur est en attente',()=>{
 const f=setup();
 try {
  f.setFailFinance(true);
  const service=new P27SystemTransferService(f.directory,{clubManager:f.manager,financeService:f.financeService});
  const firstRequest={id:'ai-transfer-pending-first',fromClubId:'club-a',toClubId:'club-b',playerId:'system-player-1',fee:1000};
  const first=service.transfer(firstRequest);
  assert.equal(first.ok,false);
  assert.equal(first.pending,true);
  const overlap=service.transfer({id:'ai-transfer-pending-second',fromClubId:'club-b',toClubId:'club-a',playerId:'system-player-1',fee:1100});
  assert.equal(overlap.ok,false);
  assert.equal(overlap.reason,'player-transfer-pending');
  assert.equal(overlap.transferId,firstRequest.id);
  f.setFailFinance(false);
  assert.equal(service.processPending().ok,true);
  const second=service.transfer({id:'ai-transfer-sequential-second',fromClubId:'club-b',toClubId:'club-a',playerId:'system-player-1',fee:1100});
  assert.equal(second.ok,true);
  assert.equal(f.manager.getClub('club-a').roster.filter(p=>p.id==='system-player-1').length,1);
  assert.equal(f.manager.getClub('club-b').roster.some(p=>p.id==='system-player-1'),false);
  assert.equal(service.transfer(firstRequest).alreadyCompleted,true);
 } finally {f.cleanup();}
});

test('P27 lot 97 : reprend les trois checkpoints financiers d’un transfert IA sans double écriture',()=>{
 for (const failureCall of [1,2,3]) {
  const f=setup();
  try {
   const finance=new JsonClubFinanceService(f.directory,{clubs:[...f.manager.clubs.values()]});
   const buyerBefore=finance.store.balance('club-b');
   const sellerBefore=finance.store.balance('club-a');
   const persist=finance.persistTransferJournal.bind(finance);
   let calls=0, injected=false;
   finance.persistTransferJournal=next=>{
    calls++;
    if(calls===failureCall&&!injected){injected=true;return false;}
    return persist(next);
   };
   const service=new P27SystemTransferService(f.directory,{clubManager:f.manager,financeService:finance});
   const request={id:`ai-finance-checkpoint-${failureCall}`,fromClubId:'club-a',toClubId:'club-b',playerId:'system-player-1',fee:2100};
   const first=service.transfer(request);
   assert.equal(first.ok,false);
   assert.equal(first.pending,true);
   assert.equal(injected,true);
   finance.persistTransferJournal=persist;
   const replay=service.processPending();
   assert.equal(replay.ok,true);
   assert.equal(replay.processed,1);
   assert.equal(finance.store.balance('club-b'),buyerBefore-2100);
   assert.equal(finance.store.balance('club-a'),sellerBefore+2100);
   assert.equal(finance.store.getAccount('club-b').entries.filter(e=>e.id===`transfer-fee-out-${request.id}`).length,1);
   assert.equal(finance.store.getAccount('club-a').entries.filter(e=>e.id===`transfer-fee-in-${request.id}`).length,1);
   const record=finance.transferJournal.transfers.find(item=>item.id===request.id);
   assert.equal(record.status,'completed');
   assert.equal(record.debitPosted,true);
   assert.equal(record.creditPosted,true);
  } finally {f.cleanup();}
 }
});

test('P27 lot 101 : conserve l’historique et reprend un joueur après deux transferts successifs et redémarrage',()=>{
 const f=setup();
 try {
  const finance=new JsonClubFinanceService(f.directory,{clubs:[...f.manager.clubs.values()]});
  const service=new P27SystemTransferService(f.directory,{clubManager:f.manager,financeService:finance});
  const firstRequest={id:'ai-chain-restart-first',fromClubId:'club-a',toClubId:'club-b',playerId:'system-player-1',fee:1000};
  const first=service.transfer(firstRequest);
  assert.equal(first.ok,true);
  const secondRequest={id:'ai-chain-restart-second',fromClubId:'club-b',toClubId:'club-a',playerId:'system-player-1',fee:1500};
  const second=service.transfer(secondRequest);
  assert.equal(second.ok,true);
  const restarted=new P27SystemTransferService(f.directory,{clubManager:f.manager,financeService:finance});
  assert.equal(restarted.state.transfers.length,2);
  assert.equal(restarted.state.transfers[0].status,'completed');
  assert.equal(restarted.state.transfers[1].status,'completed');
  assert.equal(restarted.transfer(firstRequest).alreadyCompleted,true);
  assert.equal(restarted.transfer(secondRequest).alreadyCompleted,true);
  assert.equal(f.manager.getClub('club-a').roster.filter(p=>p.id==='system-player-1').length,1);
  assert.equal(f.manager.getClub('club-b').roster.some(p=>p.id==='system-player-1'),false);
  assert.equal(finance.transferJournal.transfers.length,2);
  assert.equal(finance.store.getAccount('club-b').entries.filter(e=>e.id==='transfer-fee-out-ai-chain-restart-first').length,1);
  assert.equal(finance.store.getAccount('club-a').entries.filter(e=>e.id==='transfer-fee-in-ai-chain-restart-first').length,1);
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

test('P27 lot 98 : le simulateur traite 156 clubs sans géographie et respecte les divisions adjacentes',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'p27-market-156-'));
 try {
  const clubs=[];
  for(let i=0;i<156;i++){
   const division=['D1','D2','D3','D4','D5'][Math.floor(i/32)];
   clubs.push({id:`club-${String(i).padStart(3,'0')}`,division,rating:55+(i%30),capacity:12,roster:[]});
  }
  const seller=clubs[64];
  seller.division='D3';
  for(let i=0;i<3;i++) seller.roster.push({
   id:`market-156-player-${i}`,playerType:'system',role:'FWD',rating:60+i,
   contract:{status:'active',clubId:seller.id,playerId:`market-156-player-${i}`,expiresAt:'2028-12-31T00:00:00.000Z'}
  });
  const manager={
   clubs:new Map(clubs.map(club=>[club.id,club])),
   listClubs(){return [...this.clubs.values()];},
   getClub(id){return this.clubs.get(id)||null;},
   transferPlayer(fromId,toId,playerId){
    const from=this.getClub(fromId),to=this.getClub(toId),index=from.roster.findIndex(p=>p.id===playerId);
    if(index<0||to.roster.length>=to.capacity)return {ok:false,reason:'invalid'};
    const [player]=from.roster.splice(index,1);
    to.roster.push({...player,number:9,contract:{...player.contract,clubId:to.id,previousClubId:from.id,transferredAt:'2028-01-01T00:00:00.000Z'}});
    return {ok:true};
   }
  };
  const finance={store:{balance:()=>1_000_000},journalTransferFee:()=>({ok:true})};
  const service=new P27SystemTransferService(directory,{clubManager:manager,financeService:finance,now:()=>Date.parse('2028-01-01T00:00:00.000Z')});
  const result=service.simulateMarket({windowId:'full-world-2028',maxTransfers:30,now:Date.parse('2028-01-01T00:00:00.000Z')});
  assert.equal(clubs.length,156);
  assert.equal(result.evaluated,285);
  assert.equal(result.processed,1);
  assert.ok(['D2','D3','D4'].includes(manager.getClub(result.transfers[0].toClubId).division));
  assert.equal(seller.roster.filter(p=>p.playerType==='system'&&p.role==='FWD').length,2);
  assert.equal(result.transfers[0].id.startsWith('ai-market-full-world-2028-'),true);
 } finally {rmSync(directory,{recursive:true,force:true});}
});

test('P27 lot 96 : les joueurs humains ne masquent pas le besoin de joueurs IA au même poste',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'p27-market-human-demand-'));
 try {
  const service=marketFixture(directory);
  for (const id of ['market-buyer','market-buyer-2','market-buyer-3']) {
   const buyer=service.clubManager.getClub(id);
   buyer.roster.push(
    {id:`human-${id}-1`,playerType:'human',role:'FWD',rating:85},
    {id:`human-${id}-2`,playerType:'human',role:'FWD',rating:80}
   );
  }
  const result=service.simulateMarket({windowId:'human-demand-2028',maxTransfers:1,now:Date.parse('2028-01-01T00:00:00.000Z')});
  assert.equal(result.evaluated,9);
  assert.equal(result.processed,1);
  assert.equal(service.clubManager.getClub('market-seller').roster.filter(p=>p.playerType==='system'&&p.role==='FWD').length,2);
 } finally {rmSync(directory,{recursive:true,force:true});}
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


test('P27 lot 103 : signale explicitement l’échec du checkpoint de reprise sans prétendre avoir persisté la tentative',()=>{
 const f=setup();
 try {
  const service=new P27SystemTransferService(f.directory,{clubManager:f.manager,financeService:f.financeService});
  f.setFailFinance(true);
  const persist=service.persist.bind(service);
  let writes=0;
  service.persist=next=>{writes++;return writes===1?persist(next):false;};
  const result=service.transfer({id:'ai-fail-checkpoint-103',fromClubId:'club-a',toClubId:'club-b',playerId:'system-player-1',fee:1200});
  assert.equal(result.ok,false);
  assert.equal(result.reason,'outbox-persistence-failed');
  assert.equal(result.pending,true);
  assert.equal(writes,2);
  assert.equal(service.state.transfers[0].attempts,0);
  service.persist=persist;
  f.setFailFinance(false);
  const replay=service.processPending();
  assert.equal(replay.ok,true);
  assert.equal(replay.processed,1);
 } finally {f.cleanup();}
});

test('P27 lot 104 : refuse un outbox corrompu sans écraser ni réinitialiser son contenu',()=>{
 const f=setup();
 try {
  const file=path.join(f.directory,'system-transfer-outbox.json');
  const corrupt='{"version":1,"transfers":[broken';
  writeFileSync(file,corrupt,'utf8');
  assert.throws(()=>new P27SystemTransferService(f.directory,{clubManager:f.manager,financeService:f.financeService}),/SYSTEM_TRANSFER_OUTBOX_CORRUPT/);
  assert.equal(readFileSync(file,'utf8'),corrupt);
 } finally {f.cleanup();}
});

test('P27 lot 105 : réconcilie les soldes nets après deux transferts successifs dans le grand livre réel',()=>{
 const f=setup();
 try {
  const finance=new JsonClubFinanceService(f.directory,{clubs:[...f.manager.clubs.values()]});
  const a0=finance.store.balance('club-a'),b0=finance.store.balance('club-b');
  const service=new P27SystemTransferService(f.directory,{clubManager:f.manager,financeService:finance});
  assert.equal(service.transfer({id:'net-ledger-105-a',fromClubId:'club-a',toClubId:'club-b',playerId:'system-player-1',fee:1000}).ok,true);
  assert.equal(service.transfer({id:'net-ledger-105-b',fromClubId:'club-b',toClubId:'club-a',playerId:'system-player-1',fee:1500}).ok,true);
  assert.equal(finance.store.balance('club-a'),a0-500);
  assert.equal(finance.store.balance('club-b'),b0+500);
  assert.equal(finance.store.getAccount('club-a').entries.filter(e=>e.id==='transfer-fee-in-net-ledger-105-a').length,1);
  assert.equal(finance.store.getAccount('club-b').entries.filter(e=>e.id==='transfer-fee-out-net-ledger-105-a').length,1);
  assert.equal(finance.store.getAccount('club-b').entries.filter(e=>e.id==='transfer-fee-in-net-ledger-105-b').length,1);
  assert.equal(finance.store.getAccount('club-a').entries.filter(e=>e.id==='transfer-fee-out-net-ledger-105-b').length,1);
 } finally {f.cleanup();}
});

test('P27 effectifs : ajout et modification sont annulés si la sauvegarde échoue',()=>{
 let failWrites=false;
 const storage={value:null,getItem(){return this.value;},setItem(key,value){if(failWrites)throw new Error('DISK_FULL');this.value=value;}};
 const manager=new ClubManager(clubs,storage,'atomic-add-update');
 assert.equal(manager.addPlayer('club-a',{id:'atomic-roster-player',playerType:'system',rating:60,number:9}).ok,true);
 const saved=storage.value;
 failWrites=true;
 const add=manager.addPlayer('club-b',{id:'atomic-new-player',playerType:'system',rating:61,number:10});
 assert.deepEqual(add,{ok:false,reason:'roster-persistence-failed'});
 assert.equal(manager.getClub('club-b').roster.some(player=>player.id==='atomic-new-player'),false);
 assert.equal(storage.value,saved);
 const before=manager.getClub('club-a').roster.find(player=>player.id==='atomic-roster-player');
 const edit=manager.updatePlayer('club-a',{...before,name:'Edited Name',rating:99});
 assert.deepEqual(edit,{ok:false,reason:'roster-persistence-failed'});
 const after=manager.getClub('club-a').roster.find(player=>player.id==='atomic-roster-player');
 assert.equal(after.name,before.name);
 assert.equal(after.rating,before.rating);
 assert.equal(storage.value,saved);
});
