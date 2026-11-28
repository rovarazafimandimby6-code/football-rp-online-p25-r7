import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { CareerSyncService } from '../server/career-sync-service.js';

const accountId='123e4567-e89b-42d3-a456-426614174000';
const event={
  accountId,playerId:'FRP-123456',matchId:'match-001',
  payload:{matchId:'match-001',result:'win',finalizedAt:1_700_000_000_000}
};
function queueStub(){
  return {
    items:[structuredClone(event)],attempts:[],acks:[],
    listDue(){return this.items.map(item=>structuredClone(item));},
    acknowledge(accountId,matchId){this.acks.push({accountId,matchId});this.items=this.items.filter(x=>x.accountId!==accountId||x.matchId!==matchId);},
    markAttempt(accountId,matchId){this.attempts.push({accountId,matchId});},
    get pendingCount(){return this.items.length;}
  };
}

test('career sync sends an HMAC-authenticated event and acknowledges only accepted events',async()=>{
  const queue=queueStub(),secret='test-secret-with-at-least-thirty-two-characters';
  let request;
  const service=new CareerSyncService(queue,{
    url:'https://example.workers.dev/internal/matches/career',secret,now:()=>1_700_000_000_000,
    fetchImpl:async(url,options)=>{request={url,options};return {ok:true,json:async()=>({accepted:true})};}
  });
  const result=await service.flush();
  assert.deepEqual(result,{sent:1,failed:0,remaining:0});
  assert.equal(queue.acks.length,1);
  assert.equal(queue.attempts.length,0);
  const timestamp='1700000000';
  const expected=createHmac('sha256',secret).update(timestamp+'.'+request.options.body).digest('hex');
  assert.equal(request.options.headers['x-p27-signature'],`t=${timestamp},v1=${expected}`);
  assert.equal(JSON.parse(request.options.body).match.matchId,'match-001');
});

test('career sync keeps rejected events pending and schedules a retry attempt',async()=>{
  const queue=queueStub();
  const service=new CareerSyncService(queue,{
    url:'https://example.workers.dev/internal/matches/career',
    secret:'test-secret-with-at-least-thirty-two-characters',
    fetchImpl:async()=>({ok:false,json:async()=>({accepted:false})})
  });
  const result=await service.flush();
  assert.deepEqual(result,{sent:0,failed:1,remaining:1});
  assert.equal(queue.attempts.length,1);
  assert.equal(queue.acks.length,0);
});

test('career sync remains disabled without secure endpoint configuration',async()=>{
  const queue=queueStub();
  let calls=0;
  const service=new CareerSyncService(queue,{url:'http://remote.example/ingest',secret:'short',fetchImpl:async()=>{calls++;}});
  const result=await service.flush();
  assert.deepEqual(result,{disabled:true,sent:0,failed:0});
  assert.equal(calls,0);
  assert.equal(queue.acks.length,0);
});
