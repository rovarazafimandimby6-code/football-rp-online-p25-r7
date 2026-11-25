import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {JsonPlayerIdentityStore} from '../server/player-identity-store.js';
const a='123e4567-e89b-42d3-a456-426614174000',b='123e4567-e89b-42d3-a456-426614174001';
const temp=()=>{const directory=mkdtempSync(path.join(tmpdir(),'p27-player-identities-'));return{directory,cleanup:()=>rmSync(directory,{recursive:true,force:true})};};
test('FRP registry idempotently reserves a number for one local profile',()=>{const t=temp();try{let n=0;const s=new JsonPlayerIdentityStore(t.directory,{idFactory:()=>['675757','123456'][n++]||'123456'});const secret='a'.repeat(64);const x=s.reserve({localProfileKey:a,localProofSecret:secret}),y=s.reserve({localProfileKey:a,localProofSecret:secret});assert.equal(x.playerId,'FRP-675757');assert.equal(x.alreadyReserved,false);assert.equal(y.playerId,x.playerId);assert.equal(y.accountId,x.accountId);assert.equal(y.alreadyReserved,true);assert.equal(s.state.identities.length,1);assert.equal(s.verifyLocalProof({localProfileKey:a,localProofSecret:secret}).accountId,x.accountId);assert.equal(s.verifyLocalProof({localProfileKey:a,localProofSecret:'b'.repeat(64)}),null);assert.throws(()=>s.reserve({localProfileKey:a,localProofSecret:'b'.repeat(64)}),/LOCAL_PROFILE_PROOF_INVALID/);assert.equal(JSON.stringify(s.state).includes(secret),false);}finally{t.cleanup();}});
test('FRP registry retries collisions and survives restart',()=>{const t=temp();try{const v=['675757','675757','123456'];const s=new JsonPlayerIdentityStore(t.directory,{idFactory:()=>v.shift()});assert.equal(s.reserve({localProfileKey:a,localProofSecret:'a'.repeat(64)}).playerId,'FRP-675757');assert.equal(s.reserve({localProfileKey:b,localProofSecret:'b'.repeat(64)}).playerId,'FRP-123456');const disk=JSON.parse(readFileSync(path.join(t.directory,'player-identities.json'),'utf8'));assert.equal(new Set(disk.identities.map(x=>x.playerId)).size,2);assert.equal(new JsonPlayerIdentityStore(t.directory).getByLocalProfileKey(b).playerId,'FRP-123456');assert.ok(new JsonPlayerIdentityStore(t.directory).getByLocalProfileKey(b).accountId);}finally{t.cleanup();}});
test('FRP registry rejects invalid keys and rolls back invalid generators',()=>{const t=temp();try{const s=new JsonPlayerIdentityStore(t.directory,{idFactory:()=> 'bad'});assert.throws(()=>s.reserve({localProfileKey:'invalid',localProofSecret:'a'.repeat(64)}),/INVALID_LOCAL_PROFILE_KEY/);assert.throws(()=>s.reserve({localProfileKey:a,localProofSecret:'a'.repeat(64)}),/INVALID_PLAYER_ID_GENERATOR/);assert.equal(s.state.identities.length,0);}finally{t.cleanup();}});
test('FRP registry resolves the reserved player identity by its internal account ID',()=>{const t=temp();try{const s=new JsonPlayerIdentityStore(t.directory,{idFactory:()=> '675757'});const reserved=s.reserve({localProfileKey:a,localProofSecret:'a'.repeat(64)});assert.deepEqual(s.getByAccountId(reserved.accountId),{accountId:reserved.accountId,playerId:'FRP-675757',createdAt:reserved.createdAt});assert.equal(s.getByAccountId('invalid'),null);}finally{t.cleanup();}});
test('FRP registry permits a second trusted local replica without changing the player identity',()=>{const t=temp();try{const s=new JsonPlayerIdentityStore(t.directory,{idFactory:()=> '675757'});const first=s.reserve({localProfileKey:a,localProofSecret:'a'.repeat(64)});const replica=s.createReplica(first.accountId);assert.equal(replica.playerId,first.playerId);assert.equal(replica.accountId,first.accountId);assert.deepEqual(s.verifyLocalProof({localProfileKey:replica.localProfileKey,localProofSecret:replica.localProofSecret}),{accountId:first.accountId,playerId:first.playerId,createdAt:replica.createdAt});assert.deepEqual(new JsonPlayerIdentityStore(t.directory).getByLocalProfileKey(replica.localProfileKey),{accountId:first.accountId,playerId:first.playerId,createdAt:replica.createdAt});assert.equal(readFileSync(path.join(t.directory,'player-identities.json'),'utf8').includes(replica.localProofSecret),false);assert.throws(()=>s.reserve({localProfileKey:replica.localProfileKey,localProofSecret:'f'.repeat(64)}),/LOCAL_PROFILE_PROOF_INVALID/);}finally{t.cleanup();}});

test('FRP registry upgrades a legacy identity row without a stored proof hash', () => {
  const t = temp();
  try {
    const directory = t.directory;
    const legacy = {
      version: 1,
      identities: [{
        localProfileKey: a, accountId: '123e4567-e89b-42d3-a456-426614174002',
        playerId: 'FRP-123456', createdAt: '2026-11-25T00:00:00.000Z'
      }]
    };
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path.join(directory, 'player-identities.json'), JSON.stringify(legacy));
    const store = new JsonPlayerIdentityStore(directory);
    assert.equal(store.verifyLocalProof({ localProfileKey: a, localProofSecret: 'c'.repeat(64) }), null);
    assert.equal(store.reserve({ localProfileKey: a, localProofSecret: 'c'.repeat(64) }).playerId, 'FRP-123456');
    assert.equal(store.verifyLocalProof({ localProfileKey: a, localProofSecret: 'c'.repeat(64) }).playerId, 'FRP-123456');
  } finally { t.cleanup(); }
});
