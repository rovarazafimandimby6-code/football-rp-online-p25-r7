import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { DEFAULT_CLUBS } from '../src/club-manager.js';

const clean=(v,n=64)=>String(v??'').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,n);
const amount=(v,d=0)=>Number.isFinite(Number(v))?Math.max(0,Math.min(1_000_000_000,Math.floor(Number(v)))):d;
const dateMs=v=>{const n=new Date(v).getTime();return Number.isFinite(n)?n:null;};
const playerKey=id=>'human-'+createHash('sha256').update(String(id)).digest('hex').slice(0,32);
const active=(c,now)=>Boolean(c&&c.status==='active'&&dateMs(c.expiresAt)>now);

export class JsonTransferStore {
 constructor(directory,{clubs=DEFAULT_CLUBS,now=()=>Date.now(),initialWallet=2500}={}) {
  this.directory=path.resolve(directory);this.file=path.join(this.directory,'transfers.json');this.now=now;this.initialWallet=amount(initialWallet);this.clubs=new Map(clubs.map(c=>[c.id,{id:c.id,name:c.name,budget:amount(c.budget),capacity:amount(c.capacity,15)}]));
  mkdirSync(this.directory,{recursive:true});this.state=this.read()||{version:1,careers:[],events:[],clubs:[...this.clubs.values()],rosterSync:[]};
  if(!Array.isArray(this.state.rosterSync))this.state.rosterSync=[];
  for(const club of this.state.clubs){const source=this.clubs.get(club.id);if(source){club.name=source.name;club.budget=amount(club.budget,source.budget);}}
  for(const club of this.clubs.values())if(!this.state.clubs.some(x=>x.id===club.id))this.state.clubs.push({...club});
  if(!this.read())this.persist();
 }
 read(){try{const v=JSON.parse(readFileSync(this.file,'utf8'));if(v?.version!==1||!Array.isArray(v.careers)||!Array.isArray(v.events)||!Array.isArray(v.clubs))throw Error('schema');return v;}catch(e){if(e.code==='ENOENT')return null;throw Error('TRANSFER_STORE_CORRUPT');}}
 persist(){const tmp=`${this.file}.${process.pid}.${randomUUID()}.tmp`;try{writeFileSync(tmp,JSON.stringify(this.state),{mode:0o600});renameSync(tmp,this.file);}catch(e){try{unlinkSync(tmp);}catch{}throw e;}}
 transaction(mutator){
  const previous=this.state;this.state=structuredClone(previous);
  try{const outcome=mutator();if(outcome?.skipPersist){this.state=previous;return outcome.value;}this.persist();return outcome.value;}
  catch(error){this.state=previous;throw error;}
 }
 isWindowOpen(at=this.now()){const d=new Date(at);if(!Number.isFinite(d.getTime()))return false;return (d.getUTCMonth()===0&&d.getUTCDate()<=31)||(d.getUTCMonth()===6&&d.getUTCDate()<=31);}
 career(id){id=clean(id,64);if(!id)return null;let row=this.state.careers.find(x=>x.accountId===id);if(!row){row={accountId:id,playerId:playerKey(id),wallet:this.initialWallet,clubId:null,contract:null,offers:[],history:[]};this.state.careers.push(row);}return row;}
 club(id){return this.state.clubs.find(x=>x.id===clean(id,48))||null;}
 addEvent(row,event){const e={id:randomUUID(),playerId:row.playerId,type:event.type,at:this.now(),...event};delete e.accountId;row.history.push(e);row.history=row.history.slice(-200);this.state.events.push(e);this.state.events=this.state.events.slice(-10000);return e;}
 queueRosterSync(row,{action,clubId=null,previousClubId=null,reason='contract-change'}={}){
  const eventTypes={'contract-signing':'signing','contract-transfer':'transfer','contract-renewal':'renewal','contract-termination':'contract-termination','contract-expired':'contract-expired'};
  const eventType=eventTypes[reason]||'signing';
  const event=this.addEvent(row,{
   type:eventType,clubId:clubId||previousClubId||null,fromClubId:previousClubId||null,toClubId:clubId||null,
   salary:row.contract?.salary??null,expiresAt:row.contract?.expiresAt??null,reason
  });
  this.state.rosterSync.push({id:'roster-'+event.id,playerId:row.playerId,action,clubId,previousClubId,contract:row.contract?{...row.contract}:null,playerName:'Joueur humain',reason,status:'pending',attempts:0,createdAt:new Date(this.now()).toISOString(),lastError:null});
  this.state.rosterSync=this.state.rosterSync.slice(-10000);
 }
 pendingRosterSync(){return this.state.rosterSync.filter(item=>item.status==='pending').map(item=>structuredClone(item));}
 completeRosterSync(id){return this.transaction(()=>{const item=this.state.rosterSync.find(entry=>entry.id===clean(id,128));if(!item)return{skipPersist:true,value:{ok:false,reason:'sync-not-found'}};if(item.status==='completed')return{skipPersist:true,value:{ok:true,alreadyCompleted:true}};item.status='completed';item.completedAt=new Date(this.now()).toISOString();item.lastError=null;return{value:{ok:true,item:structuredClone(item)}};});}
 failRosterSync(id,error){return this.transaction(()=>{const item=this.state.rosterSync.find(entry=>entry.id===clean(id,128));if(!item)return{skipPersist:true,value:{ok:false,reason:'sync-not-found'}};item.attempts=Math.min(1000000,(Number(item.attempts)||0)+1);item.lastError=clean(error?.message||error||'ROSTER_SYNC_FAILED',160);item.lastAttemptAt=new Date(this.now()).toISOString();return{value:{ok:true,item:structuredClone(item)}};});}
 processSalary(row,now=this.now()){
  const c=row.contract;if(!c||c.status!=='active')return 0;const signed=dateMs(c.signedAt),expiry=dateMs(c.expiresAt),last=dateMs(c.lastSalaryPaidAt)??signed;if(signed===null||expiry===null||last===null)return 0;
  const periods=Math.max(0,Math.floor((Math.min(now,expiry)-last)/(7*86400000)));if(!periods)return 0;
  const paid=Math.min(1_000_000_000-row.wallet,amount(c.salary)*periods);row.wallet+=paid;c.lastSalaryPaidAt=new Date(last+periods*7*86400000).toISOString();if(paid)this.addEvent(row,{type:'salary-payment',clubId:c.clubId,amount:paid,periods});return paid;
 }
 refresh(row,now=this.now()){
  if(row.contract?.status==='active'&&!row.contract.playerId)row.contract.playerId=row.playerId;
  this.processSalary(row,now);if(row.contract?.status==='active'&&dateMs(row.contract.expiresAt)<=now){const previous=row.contract.clubId;row.contract={...row.contract,status:'expired',expiredAt:new Date(now).toISOString()};row.clubId=null;for(const o of row.offers)if(o.status==='pending')o.status='cancelled';this.queueRosterSync(row,{action:'release',clubId:null,previousClubId:previous,reason:'contract-expired'});}
  for(const o of row.offers)if(o.status==='pending'&&o.expiresAt&&dateMs(o.expiresAt)<=now)o.status='expired';
 }
 view(row){return{playerId:row.playerId,wallet:row.wallet,clubId:row.clubId,contract:row.contract?{...row.contract}:null,offers:row.offers.map(x=>({...x})),history:row.history.map(x=>({...x})),transferWindowOpen:this.isWindowOpen()};}
 getCareer(id){return this.transaction(()=>{const row=this.career(id);if(!row)return{skipPersist:true,value:null};this.refresh(row);return{value:this.view(row)};});}
 signContract(id,{clubId,salary=0,durationDays=30}={}){return this.transaction(()=>{const row=this.career(id);if(!row)return{skipPersist:true,value:{ok:false,reason:'invalid-account'}};const now=this.now();this.refresh(row,now);const club=this.club(clubId),wage=amount(salary),days=Math.max(1,Math.min(3650,amount(durationDays,30)||30));if(!club)return{value:{ok:false,reason:'invalid-club'}};if(active(row.contract,now))return{value:{ok:false,reason:'active-contract'}};if(wage>club.budget)return{value:{ok:false,reason:'salary-out-of-budget'}};const signedAt=new Date(now).toISOString();row.clubId=club.id;row.contract={clubId:club.id,playerId:row.playerId,salary:wage,signedAt,lastSalaryPaidAt:signedAt,expiresAt:new Date(now+days*86400000).toISOString(),status:'active'};this.queueRosterSync(row,{action:'upsert',clubId:club.id,reason:'contract-signing'});return{value:{ok:true,career:this.view(row)}};});}
 requestOffer(id,{toClubId}={}){return this.transaction(()=>{const row=this.career(id);if(!row)return{skipPersist:true,value:{ok:false,reason:'invalid-account'}};const now=this.now();this.refresh(row,now);const target=this.club(toClubId);if(!target)return{value:{ok:false,reason:'invalid-club'}};if(!this.isWindowOpen(now))return{value:{ok:false,reason:'window-closed'}};if(row.clubId===target.id)return{value:{ok:false,reason:'same-club'}};const current=active(row.contract,now)?row.contract:null;const previous=this.club(current?.clubId);const fee=current?Math.min(target.budget,Math.max(1000,Math.round((previous?.budget||100000)*.04))):0;const salary=Math.max(100,Math.round(target.budget/1200+target.budget/1_000_000));if(target.budget<fee)return{value:{ok:false,reason:'insufficient-club-budget'}};const offer={id:'offer-'+randomUUID(),fromClubId:target.id,fromClubName:target.name,salary,fee,durationDays:180,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+5*86400000).toISOString(),status:'pending'};row.offers.push(offer);row.offers=row.offers.slice(-50);return{value:{ok:true,offer:{...offer}}};});}
 acceptOffer(id,offerId){return this.transaction(()=>{const row=this.career(id);if(!row)return{skipPersist:true,value:{ok:false,reason:'invalid-account'}};const now=this.now();this.refresh(row,now);const offer=row.offers.find(x=>x.id===clean(offerId,96));if(!offer||offer.status!=='pending')return{value:{ok:false,reason:'offer-unavailable'}};if(!this.isWindowOpen(now))return{value:{ok:false,reason:'window-closed'}};if(dateMs(offer.expiresAt)<=now){offer.status='expired';return{value:{ok:false,reason:'offer-expired'}};}const target=this.club(offer.fromClubId);if(!target)return{value:{ok:false,reason:'invalid-club'}};const current=active(row.contract,now)?row.contract:null;if(row.clubId===target.id)return{value:{ok:false,reason:'same-club'}};if(target.budget<offer.fee)return{value:{ok:false,reason:'insufficient-club-budget'}};const previous=current?this.club(current.clubId):null;if(previous)previous.budget=Math.min(1_000_000_000,previous.budget+offer.fee);target.budget-=offer.fee;const signedAt=new Date(now).toISOString();row.clubId=target.id;row.contract={clubId:target.id,playerId:row.playerId,salary:offer.salary,signedAt,lastSalaryPaidAt:signedAt,expiresAt:new Date(now+offer.durationDays*86400000).toISOString(),status:'active'};offer.status='accepted';for(const o of row.offers)if(o!==offer&&o.status==='pending')o.status='cancelled';this.queueRosterSync(row,{action:'upsert',clubId:target.id,previousClubId:previous?.id||null,reason:current?'contract-transfer':'contract-signing'});return{value:{ok:true,career:this.view(row)}};});}
 rejectOffer(id,offerId){return this.transaction(()=>{const row=this.career(id),offer=row?.offers.find(x=>x.id===clean(offerId,96));if(!offer||offer.status!=='pending')return{skipPersist:true,value:{ok:false,reason:'offer-unavailable'}};offer.status='rejected';return{value:{ok:true,offer:{...offer}}};});}
 renewContract(id,{salary,durationDays=180}={}){return this.transaction(()=>{const row=this.career(id);if(!row)return{skipPersist:true,value:{ok:false,reason:'invalid-account'}};const now=this.now();this.refresh(row,now);if(!active(row.contract,now))return{value:{ok:false,reason:'no-active-contract'}};const wage=salary===undefined?row.contract.salary:amount(salary),days=Math.max(1,Math.min(3650,amount(durationDays,180)||180)),club=this.club(row.clubId);if(!club||wage>club.budget)return{value:{ok:false,reason:'salary-out-of-budget'}};const previousExpiry=row.contract.expiresAt;row.contract={...row.contract,salary:wage,renewedAt:new Date(now).toISOString(),lastSalaryPaidAt:new Date(now).toISOString(),expiresAt:new Date(now+days*86400000).toISOString(),status:'active'};this.queueRosterSync(row,{action:'upsert',clubId:row.clubId,reason:'contract-renewal'});return{value:{ok:true,career:this.view(row)}};});}
 terminateContract(id){return this.transaction(()=>{const row=this.career(id);if(!row)return{skipPersist:true,value:{ok:false,reason:'invalid-account'}};const now=this.now();this.refresh(row,now);if(!active(row.contract,now))return{value:{ok:false,reason:'no-active-contract'}};this.processSalary(row,now);const clubId=row.clubId;row.contract={...row.contract,status:'terminated',terminatedAt:new Date(now).toISOString()};row.clubId=null;for(const o of row.offers)if(o.status==='pending')o.status='cancelled';this.queueRosterSync(row,{action:'release',clubId:null,previousClubId:clubId,reason:'contract-termination'});return{value:{ok:true,career:this.view(row)}};});}
 getPlayerHistory(playerId){const id=clean(playerId,64);return this.state.events.filter(e=>e.playerId===id&&['signing','transfer','renewal','contract-expired','contract-termination'].includes(e.type)).map(({playerId,...e})=>({...e}));}
}
