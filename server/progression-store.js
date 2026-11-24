import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const ATTRIBUTES = Object.freeze({ pace:55, shooting:50, passing:50, defense:45, stamina:55, control:50 });
const clampInt = (value, min, max, fallback=min) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Math.round(Number(value)))) : fallback;
const emptyProgression = () => ({ level:1, experience:0, coins:250, trainingPoints:0, attributes:{...ATTRIBUTES}, processedMatchIds:[] });
function normalize(value = {}) {
  const attrs = value.attributes && typeof value.attributes === 'object' ? value.attributes : {};
  const level = clampInt(value.level,1,99,1);
  return { level, experience: level >= 99 ? 0 : clampInt(value.experience,0,1_000_000_000), coins:clampInt(value.coins,0,1_000_000_000,250), trainingPoints:clampInt(value.trainingPoints,0,100_000), attributes:Object.fromEntries(Object.keys(ATTRIBUTES).map(key=>[key,clampInt(attrs[key],1,99,ATTRIBUTES[key])])), processedMatchIds:Array.isArray(value.processedMatchIds)?[...new Set(value.processedMatchIds.filter(id=>typeof id==='string'&&id.trim()).map(id=>id.slice(0,64)))].slice(-2000):[] };
}
function addExperience(state, amount) {
  state.experience = Math.min(1_000_000_000,state.experience+amount);
  while(state.level<99 && state.experience>=state.level*100){state.experience-=state.level*100;state.level++;state.trainingPoints+=2;state.coins=Math.min(1_000_000_000,state.coins+50);}
  if(state.level>=99)state.experience=0;
}
export class JsonProgressionStore {
  constructor(directory){this.directory=path.resolve(directory);this.file=path.join(this.directory,'progression.json');mkdirSync(this.directory,{recursive:true});this.state=this.read();}
  read(){try{const parsed=JSON.parse(readFileSync(this.file,'utf8'));if(!parsed||parsed.version!==1||!Array.isArray(parsed.players))throw new Error('bad schema');return {version:1,players:parsed.players.filter(row=>row&&typeof row.accountId==='string').map(row=>({accountId:row.accountId,progression:normalize(row.progression)}))};}catch(error){if(error.code==='ENOENT')return {version:1,players:[]};throw new Error('PROGRESSION_STORE_CORRUPT');}}
  persist(){const temp=`${this.file}.${process.pid}.${randomUUID()}.tmp`;try{writeFileSync(temp,JSON.stringify(this.state),{mode:0o600});renameSync(temp,this.file);}catch(error){try{unlinkSync(temp);}catch{}throw error;}}
  get(accountId){const row=this.state.players.find(item=>item.accountId===String(accountId));return structuredClone(row?.progression||emptyProgression());}
  row(accountId){const id=String(accountId||'').trim().slice(0,64);if(!id)throw new Error('INVALID_ACCOUNT_ID');let row=this.state.players.find(item=>item.accountId===id);if(!row){row={accountId:id,progression:emptyProgression()};this.state.players.push(row);}return row;}
  grantMatchReward(accountId,{matchId,result,minutesPlayedMs=0,rating=null}={}){
    const row=this.row(accountId),p=row.progression,id=String(matchId||'').trim().slice(0,64);
    if(!id||!['win','draw','loss'].includes(result))throw new Error('INVALID_MATCH_REWARD');
    if(p.processedMatchIds.includes(id))return {duplicate:true,progression:this.get(accountId),reward:{experience:0,coins:0}};
    const minutes=clampInt(minutesPlayedMs,0,600_000)/60_000;
    const score=Number.isFinite(Number(rating))?Math.max(1,Math.min(10,Number(rating))):5;
    const experience=Math.round(20+minutes*12+score*3);
    const coins=Math.round(8+(result==='win'?18:result==='draw'?10:4)+score*2);
    addExperience(p,experience);p.coins=Math.min(1_000_000_000,p.coins+coins);p.processedMatchIds.push(id);p.processedMatchIds=p.processedMatchIds.slice(-2000);
    this.persist();return {duplicate:false,progression:this.get(accountId),reward:{experience,coins}};
  }
  train(accountId,attribute,amount=1){
    if(!Object.hasOwn(ATTRIBUTES,attribute))throw new Error('INVALID_ATTRIBUTE');
    const row=this.row(accountId),p=row.progression,points=clampInt(amount,1,5,1),cost=points*40;
    if(p.attributes[attribute]+points>99)return {ok:false,reason:'ATTRIBUTE_CAP',progression:this.get(accountId)};
    if(p.trainingPoints<points||p.coins<cost)return {ok:false,reason:'INSUFFICIENT_RESOURCES',progression:this.get(accountId)};
    p.trainingPoints-=points;p.coins-=cost;p.attributes[attribute]+=points;this.persist();
    return {ok:true,attribute,value:p.attributes[attribute],spentCoins:cost,progression:this.get(accountId)};
  }
  practice(accountId,attribute,amount=1){
    if(!Object.hasOwn(ATTRIBUTES,attribute))throw new Error('INVALID_ATTRIBUTE');
    const row=this.row(accountId),p=row.progression,points=clampInt(amount,1,3,1),cost=points*80;
    if(p.attributes[attribute]+points>99)return {ok:false,reason:'ATTRIBUTE_CAP',progression:this.get(accountId)};
    if(p.coins<cost)return {ok:false,reason:'INSUFFICIENT_COINS',progression:this.get(accountId)};
    p.coins-=cost;p.attributes[attribute]+=points;addExperience(p,points*25);this.persist();
    return {ok:true,attribute,value:p.attributes[attribute],spentCoins:cost,progression:this.get(accountId)};
  }
}
