import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
const validUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const validNumber = value => typeof value === 'string' && /^FRP-\d{6}$/.test(value);
const validProofSecret = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const proofDigest = value => createHash('sha256').update(value).digest('hex');
const sameDigest = (a,b) => { if(typeof a!=='string'||typeof b!=='string')return false;const left=Buffer.from(a,'hex'),right=Buffer.from(b,'hex');return left.length===32&&right.length===32&&timingSafeEqual(left,right); };
function credentials(row){return [{localProfileKey:row.localProfileKey,proofHash:row.proofHash,createdAt:row.createdAt},...(Array.isArray(row.localProfiles)?row.localProfiles:[])];}
export class JsonPlayerIdentityStore {
 constructor(directory,options={}){this.directory=path.resolve(directory);this.file=path.join(this.directory,'player-identities.json');this.now=options.now||(()=>Date.now());this.idFactory=options.idFactory||(()=>String(randomInt(100000,1000000)));this.maxAttempts=Math.max(1,Math.min(10000,Number(options.maxAttempts)||1000));this.maxLocalProfiles=Math.max(1,Math.min(20,Number(options.maxLocalProfiles)||8));mkdirSync(this.directory,{recursive:true});this.state=this.read();}
 read(){
  try{
   const parsed=JSON.parse(readFileSync(this.file,'utf8'));if(!parsed||parsed.version!==1||!Array.isArray(parsed.identities))throw Error('schema');
   const rows=parsed.identities.filter(row=>row&&validUuid(row.localProfileKey)&&validUuid(row.accountId)&&validNumber(row.playerId)&&typeof row.createdAt==='string'&&(row.proofHash===undefined||/^[a-f0-9]{64}$/i.test(row.proofHash))&&(row.localProfiles===undefined||(Array.isArray(row.localProfiles)&&row.localProfiles.every(item=>item&&validUuid(item.localProfileKey)&&/^[a-f0-9]{64}$/i.test(item.proofHash)&&typeof item.createdAt==='string'))));
   const allKeys=rows.flatMap(credentials).map(item=>item.localProfileKey);
   if(rows.length!==parsed.identities.length||new Set(rows.map(row=>row.accountId)).size!==rows.length||new Set(rows.map(row=>row.playerId)).size!==rows.length||new Set(allKeys).size!==allKeys.length)throw Error('duplicates');
   return{version:1,identities:rows};
  }catch(error){if(error.code==='ENOENT')return{version:1,identities:[]};throw new Error('PLAYER_IDENTITY_STORE_CORRUPT');}
 }
 persist(){const temporary=this.file+'.'+process.pid+'.'+randomUUID()+'.tmp';try{writeFileSync(temporary,JSON.stringify(this.state),{mode:0o600});renameSync(temporary,this.file);}catch(error){try{unlinkSync(temporary);}catch{}throw error;}}
 reserve({localProfileKey,localProofSecret}={}){
  if(!validUuid(localProfileKey))throw new Error('INVALID_LOCAL_PROFILE_KEY');if(!validProofSecret(localProofSecret))throw new Error('INVALID_LOCAL_PROFILE_PROOF');
  for(const row of this.state.identities){const credential=credentials(row).find(item=>item.localProfileKey===localProfileKey);if(!credential)continue;
   const supplied=proofDigest(localProofSecret);if(credential.proofHash&&!sameDigest(credential.proofHash,supplied))throw new Error('LOCAL_PROFILE_PROOF_INVALID');
   if(!credential.proofHash){const previous=this.state;this.state=structuredClone(previous);try{const target=this.state.identities.find(item=>item.accountId===row.accountId);if(target.localProfileKey===localProfileKey)target.proofHash=supplied;else{const item=(target.localProfiles||[]).find(x=>x.localProfileKey===localProfileKey);if(!item)throw new Error('LOCAL_PROFILE_NOT_FOUND');item.proofHash=supplied;}this.persist();}catch(error){this.state=previous;throw error;}}
   return{accountId:row.accountId,playerId:row.playerId,createdAt:credential.createdAt,alreadyReserved:true};
  }
  const previous=this.state;this.state=structuredClone(previous);
  try{let playerId=null;for(let attempt=0;attempt<this.maxAttempts;attempt++){const number=String(this.idFactory());if(!/^\d{6}$/.test(number))throw new Error('INVALID_PLAYER_ID_GENERATOR');const candidate='FRP-'+number;if(!this.state.identities.some(row=>row.playerId===candidate)){playerId=candidate;break;}}
   if(!playerId)throw new Error('PLAYER_ID_SPACE_EXHAUSTED');const accountId=randomUUID(),createdAt=new Date(this.now()).toISOString();this.state.identities.push({localProfileKey,accountId,playerId,createdAt,proofHash:proofDigest(localProofSecret)});this.persist();return{accountId,playerId,createdAt,alreadyReserved:false};
  }catch(error){this.state=previous;throw error;}
 }
 createReplica(accountId){
  if(!validUuid(accountId))throw new Error('INVALID_ACCOUNT_ID');const row=this.state.identities.find(item=>item.accountId===accountId);if(!row)throw new Error('PLAYER_IDENTITY_NOT_FOUND');
  const replicas=Array.isArray(row.localProfiles)?row.localProfiles:[];if(replicas.length>=this.maxLocalProfiles)throw new Error('LOCAL_PROFILE_REPLICA_LIMIT');
  const previous=this.state;this.state=structuredClone(previous);
  try{const target=this.state.identities.find(item=>item.accountId===accountId);const localProfileKey=randomUUID(),localProofSecret=randomBytes(32).toString('hex'),createdAt=new Date(this.now()).toISOString();target.localProfiles=[...(target.localProfiles||[]),{localProfileKey,proofHash:proofDigest(localProofSecret),createdAt}];this.persist();return{accountId,playerId:target.playerId,localProfileKey,localProofSecret,createdAt};}
  catch(error){this.state=previous;throw error;}
 }
 verifyLocalProof({localProfileKey,localProofSecret}={}){if(!validUuid(localProfileKey)||!validProofSecret(localProofSecret))return null;for(const row of this.state.identities){const item=credentials(row).find(x=>x.localProfileKey===localProfileKey);if(item?.proofHash&&sameDigest(item.proofHash,proofDigest(localProofSecret)))return{accountId:row.accountId,playerId:row.playerId,createdAt:item.createdAt};}return null;}
 getByLocalProfileKey(localProfileKey){if(!validUuid(localProfileKey))return null;for(const row of this.state.identities){const item=credentials(row).find(x=>x.localProfileKey===localProfileKey);if(item)return{accountId:row.accountId,playerId:row.playerId,createdAt:item.createdAt};}return null;}
 getByAccountId(accountId){if(!validUuid(accountId))return null;const row=this.state.identities.find(item=>item.accountId===accountId);return row?{accountId:row.accountId,playerId:row.playerId,createdAt:row.createdAt}:null;}
}