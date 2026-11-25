import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import path from 'node:path';
const digest = value => createHash('sha256').update(value).digest('base64url');
const cleanBinding = value => typeof value === 'string' && value.length >= 24 && value.length <= 256 ? value : null;
const validDigest = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const validUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const validPurpose = value => ['link', 'login', 'transaction'].includes(value);

/** Short-lived, persistent, browser-bound and single-use Google OIDC transactions. */
export class GoogleOidcTransactionStore {
  constructor({ now = () => Date.now(), ttlMs = 10 * 60_000, maxEntries = 5000, directory = null } = {}) {
    this.now = now; this.ttlMs = Math.max(60_000, Math.min(15 * 60_000, Number(ttlMs) || 10 * 60_000));
    this.maxEntries = Math.max(100, Math.min(20_000, Number(maxEntries) || 5000));
    this.directory = directory ? path.resolve(directory) : null;
    this.file = this.directory ? path.join(this.directory, 'google-oidc-transactions.json') : null;
    if (this.directory) mkdirSync(this.directory, { recursive: true });
    this.transactions = this.read();
  }
  read() {
    if (!this.file) return new Map();
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.transactions) || parsed.transactions.length > this.maxEntries) throw new Error('bad schema');
      const rows = new Map();
      for (const row of parsed.transactions) {
        const purpose = row?.purpose || (row?.accountId ? 'link' : 'transaction');
        if (!row || !validDigest(row.key) || typeof row.nonce !== 'string' || row.nonce.length < 40
          || typeof row.codeVerifier !== 'string' || row.codeVerifier.length < 40 || !validDigest(row.bindingHash)
          || (row.accountId !== undefined && !validUuid(row.accountId)) || !validPurpose(purpose)
          || (purpose === 'link' && !validUuid(row.accountId)) || (purpose === 'login' && row.accountId !== undefined)
          || !Number.isSafeInteger(row.expiresAt) || row.expiresAt <= 0 || rows.has(row.key)) throw new Error('bad transaction');
        rows.set(row.key, { nonce: row.nonce, codeVerifier: row.codeVerifier, bindingHash: row.bindingHash, purpose, ...(row.accountId ? { accountId: row.accountId } : {}), expiresAt: row.expiresAt });
      }
      return rows;
    } catch (error) { if (error.code === 'ENOENT') return new Map(); throw new Error('GOOGLE_OIDC_TRANSACTION_STORE_CORRUPT'); }
  }
  persist() {
    if (!this.file) return;
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    try { writeFileSync(temporary, JSON.stringify({ version: 1, transactions: [...this.transactions].map(([key,row])=>({key,...row})) }), {mode:0o600}); renameSync(temporary,this.file); }
    catch(error){try{unlinkSync(temporary);}catch{}throw error;}
  }
  prune() {
    const previous=this.transactions, next=new Map([...previous].filter(([,row])=>row.expiresAt>this.now()));
    if(next.size!==previous.size){this.transactions=next;try{this.persist();}catch(error){this.transactions=previous;throw error;}}
  }
  create({ sessionBinding, accountId, purpose = accountId ? 'link' : 'transaction' } = {}) {
    const binding=cleanBinding(sessionBinding);
    if(!binding)throw new Error('INVALID_OIDC_SESSION_BINDING');
    if(!validPurpose(purpose))throw new Error('INVALID_OIDC_PURPOSE');
    if(purpose==='link'&&!validUuid(accountId))throw new Error('INVALID_OIDC_ACCOUNT_ID');
    if(purpose==='login'&&accountId!==undefined)throw new Error('OIDC_LOGIN_MUST_NOT_SPECIFY_ACCOUNT');
    if(purpose==='transaction'&&accountId!==undefined)throw new Error('OIDC_TRANSACTION_ACCOUNT_NOT_SUPPORTED');
    this.prune(); if(this.transactions.size>=this.maxEntries)throw new Error('GOOGLE_OIDC_TRANSACTION_STORE_FULL');
    const state=randomBytes(32).toString('base64url'), nonce=randomBytes(32).toString('base64url'), codeVerifier=randomBytes(32).toString('base64url');
    const expiresAt=this.now()+this.ttlMs, key=digest(state), previous=this.transactions;
    this.transactions=new Map(previous); this.transactions.set(key,{nonce,codeVerifier,bindingHash:digest(binding),purpose,...(accountId?{accountId}:{}),expiresAt});
    try{this.persist();}catch(error){this.transactions=previous;throw error;}
    return {state,nonce,codeVerifier,codeChallenge:digest(codeVerifier),codeChallengeMethod:'S256',expiresAt:new Date(expiresAt).toISOString()};
  }
  consume({state,sessionBinding}={}) {
    if(typeof state!=='string'||state.length<32||state.length>128)return null;
    const binding=cleanBinding(sessionBinding);if(!binding)return null;
    const key=digest(state),row=this.transactions.get(key);if(!row)return null;
    const previous=this.transactions;this.transactions=new Map(previous);this.transactions.delete(key);
    try{this.persist();}catch(error){this.transactions=previous;throw error;}
    if(row.expiresAt<=this.now()||row.bindingHash!==digest(binding))return null;
    return {nonce:row.nonce,codeVerifier:row.codeVerifier,purpose:row.purpose|| (row.accountId?'link':'transaction'),...(row.accountId?{accountId:row.accountId}:{}),expiresAt:new Date(row.expiresAt).toISOString()};
  }
}
