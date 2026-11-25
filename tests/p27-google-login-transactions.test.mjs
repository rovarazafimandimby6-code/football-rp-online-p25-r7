import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { GoogleOidcTransactionStore } from '../server/google-oidc-transactions.js';
const binding='browser-session-binding-value-0001';
test('Google login transaction is explicitly marked and has no account ID',()=>{
 const store=new GoogleOidcTransactionStore();
 const tx=store.create({sessionBinding:binding,purpose:'login'});
 const consumed=store.consume({state:tx.state,sessionBinding:binding});
 assert.equal(consumed.purpose,'login');assert.equal(consumed.accountId,undefined);
});
test('Google login transaction survives restart with purpose preserved',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'p27-login-oidc-'));
 try{
  const first=new GoogleOidcTransactionStore({directory});
  const tx=first.create({sessionBinding:binding,purpose:'login'});
  const second=new GoogleOidcTransactionStore({directory});
  assert.equal(second.consume({state:tx.state,sessionBinding:binding}).purpose,'login');
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test('Google login transaction rejects an account ID supplied by caller',()=>{
 const store=new GoogleOidcTransactionStore();
 assert.throws(()=>store.create({sessionBinding:binding,purpose:'login',accountId:'123e4567-e89b-42d3-a456-426614174000'}),/OIDC_LOGIN_MUST_NOT_SPECIFY_ACCOUNT/);
});
