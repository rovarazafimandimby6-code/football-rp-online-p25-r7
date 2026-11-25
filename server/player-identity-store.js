import { randomInt, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
const validLocalKey = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const validAccountId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const validNumber = value => typeof value === 'string' && /^FRP-\d{6}$/.test(value);
export class JsonPlayerIdentityStore {
 constructor(directory, options = {}) {
  this.directory=path.resolve(directory);this.file=path.join(this.directory,'player-identities.json');this.now=options.now||(()=>Date.now());
  this.idFactory=options.idFactory||(()=>String(randomInt(100000,1000000)));this.maxAttempts=Math.max(1,Math.min(10000,Number(options.maxAttempts)||1000));
  mkdirSync(this.directory,{recursive:true});this.state=this.read();
 }
 read(){try{const p=JSON.parse(readFileSync(this.file,'utf8'));if(!p||p.version!==1||!Array.isArray(p.identities))throw Error('schema');const rows=p.identities.filter(r=>r&&validLocalKey(r.localProfileKey)&&validNumber(r.playerId)&&typeof r.createdAt==='string');if(rows.length!==p.identities.length||new Set(rows.map(x=>x.localProfileKey)).size!==rows.length||new Set(rows.map(x=>x.playerId)).size!==rows.length)throw Error('duplicates');return{version:1,identities:rows};}catch(e){if(e.code==='ENOENT')return{version:1,identities:[]};throw Error('PLAYER_IDENTITY_STORE_CORRUPT');}}
 persist(){const temp=this.file+'.'+process.pid+'.'+randomUUID()+'.tmp';try{writeFileSync(temp,JSON.stringify(this.state),{mode:0o600});renameSync(temp,this.file);}catch(e){try{unlinkSync(temp);}catch{}throw e;}}
 reserve({localProfileKey}={}){if(!validLocalKey(localProfileKey))throw Error('INVALID_LOCAL_PROFILE_KEY');const old=this.state.identities.find(r=>r.localProfileKey===localProfileKey);if(old)return{playerId:old.playerId,createdAt:old.createdAt,alreadyReserved:true};const previous=this.state;this.state=structuredClone(previous);try{let id=null;for(let i=0;i<this.maxAttempts;i++){const n=String(this.idFactory());if(!/^\d{6}$/.test(n))throw Error('INVALID_PLAYER_ID_GENERATOR');const candidate='FRP-'+n;if(!this.state.identities.some(r=>r.playerId===candidate)){id=candidate;break;}}if(!id)throw Error('PLAYER_ID_SPACE_EXHAUSTED');const createdAt=new Date(this.now()).toISOString();this.state.identities.push({localProfileKey,playerId:id,createdAt});this.persist();return{playerId:id,createdAt,alreadyReserved:false};}catch(e){this.state=previous;throw e;}}
 getByLocalProfileKey(key){if(!validLocalKey(key))return null;const row=this.state.identities.find(r=>r.localProfileKey===key);return row?{accountId:row.accountId,playerId:row.playerId,createdAt:row.createdAt}:null;}
}