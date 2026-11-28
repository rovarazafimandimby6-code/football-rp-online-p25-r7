import { createPublicKey, timingSafeEqual, verify as verifySignature } from 'node:crypto';
const ISSUERS = new Set(['https://accounts.google.com']);
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const decodePart = value => { try { return JSON.parse(Buffer.from(value,'base64url').toString('utf8')); } catch { throw Error('GOOGLE_ID_TOKEN_MALFORMED'); } };
const safeEqual = (a,b) => { if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y); };
export class GoogleJwksCache {
 constructor({fetchImpl=globalThis.fetch,now=()=>Date.now(),ttlMs=3600000}={}){this.fetchImpl=fetchImpl;this.now=now;this.ttlMs=Math.max(60000,Math.min(21600000,Number(ttlMs)||3600000));this.keys=null;this.expiresAt=0;this.pending=null;}
 async getKeys({forceRefresh=false}={}){if(!forceRefresh&&this.keys&&this.expiresAt>this.now())return this.keys;if(this.pending)return this.pending;if(typeof this.fetchImpl!=='function')throw Error('GOOGLE_JWKS_FETCH_UNAVAILABLE');this.pending=(async()=>{const r=await this.fetchImpl(JWKS_URL,{headers:{accept:'application/json'},signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('GOOGLE_JWKS_FETCH_FAILED');const data=await r.json();if(!data||!Array.isArray(data.keys)||data.keys.length<1||data.keys.length>20)throw Error('GOOGLE_JWKS_INVALID');const keys=data.keys.filter(k=>k&&k.kty==='RSA'&&k.use==='sig'&&k.alg==='RS256'&&typeof k.kid==='string'&&k.kid.length<=256&&typeof k.n==='string'&&typeof k.e==='string');if(!keys.length)throw Error('GOOGLE_JWKS_INVALID');this.keys=keys;this.expiresAt=this.now()+this.ttlMs;return keys;})();try{return await this.pending;}finally{this.pending=null;}}
}
export async function verifyGoogleIdToken(idToken,{clientId,expectedNonce,jwksCache,now=()=>Date.now(),clockSkewSeconds=120}={}){
 if(typeof idToken!=='string'||idToken.length>16384)throw Error('GOOGLE_ID_TOKEN_MALFORMED');const p=idToken.split('.');if(p.length!==3||p.some(x=>!x))throw Error('GOOGLE_ID_TOKEN_MALFORMED');
 if(typeof clientId!=='string'||!clientId.trim()||typeof expectedNonce!=='string'||expectedNonce.length<16)throw Error('GOOGLE_ID_TOKEN_EXPECTED_CONTEXT_REQUIRED');
 const h=decodePart(p[0]),c=decodePart(p[1]);if(h.alg!=='RS256'||typeof h.kid!=='string'||!h.kid)throw Error('GOOGLE_ID_TOKEN_ALGORITHM_REJECTED');
 const cache=jwksCache||new GoogleJwksCache();let keys=await cache.getKeys();let key=keys.find(k=>k.kid===h.kid);if(!key){keys=await cache.getKeys({forceRefresh:true});key=keys.find(k=>k.kid===h.kid);}if(!key)throw Error('GOOGLE_ID_TOKEN_SIGNING_KEY_UNKNOWN');
 let publicKey;try{publicKey=createPublicKey({key,format:'jwk'});}catch{throw Error('GOOGLE_ID_TOKEN_SIGNING_KEY_INVALID');}
 if(!verifySignature('RSA-SHA256',Buffer.from(p[0]+'.'+p[1]),publicKey,Buffer.from(p[2],'base64url')))throw Error('GOOGLE_ID_TOKEN_SIGNATURE_INVALID');
 if(!ISSUERS.has(c.iss))throw Error('GOOGLE_ID_TOKEN_ISSUER_INVALID');const audiences=Array.isArray(c.aud)?c.aud:[c.aud];if(!audiences.includes(clientId)||(audiences.length>1&&c.azp!==clientId)||(c.azp&&c.azp!==clientId))throw Error('GOOGLE_ID_TOKEN_AUDIENCE_INVALID');
 const seconds=Math.floor(now()/1000),skew=Math.max(0,Math.min(300,Number(clockSkewSeconds)||0));if(!Number.isFinite(c.exp)||c.exp<=seconds-skew)throw Error('GOOGLE_ID_TOKEN_EXPIRED');if(!Number.isFinite(c.iat)||c.iat>seconds+skew)throw Error('GOOGLE_ID_TOKEN_ISSUED_AT_INVALID');if(!safeEqual(c.nonce,expectedNonce))throw Error('GOOGLE_ID_TOKEN_NONCE_INVALID');if(typeof c.sub!=='string'||!/^[A-Za-z0-9_-]{8,255}$/.test(c.sub))throw Error('GOOGLE_ID_TOKEN_SUBJECT_INVALID');
 return{googleSubject:c.sub,issuer:c.iss,audience:clientId,issuedAt:c.iat,expiresAt:c.exp};
}