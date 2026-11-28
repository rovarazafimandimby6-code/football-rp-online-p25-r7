import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleAuthorizationUrl, createGoogleLoginAuthorizationUrl, completeGoogleAuthorization } from '../server/google-oidc-service.js';
const accountId='123e4567-e89b-42d3-a456-426614174000';
const config={configured:true,clientId:'p27-test.apps.googleusercontent.com',clientSecret:'test-secret-never-returned',redirectUri:'https://game.example/api/auth/google/callback',authorizationEndpoint:'https://accounts.google.com/o/oauth2/v2/auth',tokenEndpoint:'https://oauth2.googleapis.com/token'};
test('Google login transaction carries no client-supplied account identifier',()=>{
 const calls=[];const transactionStore={create:args=>{calls.push(args);return{state:'s'.repeat(43),nonce:'n'.repeat(43),codeChallenge:'c'.repeat(43),expiresAt:'2026-11-25T00:00:00.000Z'};}};
 const result=createGoogleLoginAuthorizationUrl({config,transactionStore,sessionBinding:'b'.repeat(43)});
 assert.equal(calls[0].purpose,'login');assert.equal(calls[0].accountId,undefined);
 assert.equal(new URL(result.authorizationUrl).searchParams.get('state'),'s'.repeat(43));
});
test('Google login resolves only an existing verified Google subject mapping',async()=>{
 const calls=[];const transactionStore={consume:()=>({purpose:'login',nonce:'n'.repeat(43),codeVerifier:'v'.repeat(43)})};
 const identityStore={getByGoogleSubject:subject=>{calls.push(subject);return{accountId};}};
 const result=await completeGoogleAuthorization({config,transactionStore,identityStore,state:'s'.repeat(43),code:'authorization-code-123',sessionBinding:'b'.repeat(43),fetchImpl:async()=>({ok:true,json:async()=>({id_token:'signed.id-token'})}),verifyToken:async()=>({googleSubject:'google-subject-0001'})});
 assert.deepEqual(result,{linked:false,authenticated:true,accountId,purpose:'login'});
 assert.deepEqual(calls,['google-subject-0001']);
});
test('Google login refuses a Google identity that has no existing P27 link',async()=>{
 const transactionStore={consume:()=>({purpose:'login',nonce:'n'.repeat(43),codeVerifier:'v'.repeat(43)})};
 await assert.rejects(()=>completeGoogleAuthorization({config,transactionStore,identityStore:{getByGoogleSubject:()=>null},state:'s'.repeat(43),code:'authorization-code-123',sessionBinding:'b'.repeat(43),fetchImpl:async()=>({ok:true,json:async()=>({id_token:'signed.id-token'})}),verifyToken:async()=>({googleSubject:'google-subject-0001'})}),/GOOGLE_ACCOUNT_NOT_LINKED/);
});
test('Google login transaction cannot smuggle a P27 account ID',async()=>{
 const transactionStore={consume:()=>({purpose:'login',accountId,nonce:'n'.repeat(43),codeVerifier:'v'.repeat(43)})};
 await assert.rejects(()=>completeGoogleAuthorization({config,transactionStore,identityStore:{},state:'s'.repeat(43),code:'authorization-code-123',sessionBinding:'b'.repeat(43),fetchImpl:async()=>({ok:true,json:async()=>({id_token:'signed.id-token'})}),verifyToken:async()=>({googleSubject:'google-subject-0001'})}),/GOOGLE_OIDC_TRANSACTION_INVALID/);
});
