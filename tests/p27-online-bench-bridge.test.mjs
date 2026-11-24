import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineMatchBridge } from '../src/online-match-bridge.js';

test('P27 banc : applique une rotation uniquement pendant une fenêtre serveur autorisée',async()=>{
 let called=0;
 const client={rotate:async pair=>{called++;assert.deepEqual(pair,{outgoingId:'bot-out',incomingId:'bot-in'});return {rotated:true,state:{sequence:1,players:[],ball:null,events:[]}};}};
 const bridge=new OnlineMatchBridge({client,players:[],ball:{},now:()=>1000});
 bridge.localServerId='human-1';
 bridge.lastState={phase:'halftime',rotationAvailable:true};
 assert.equal(await bridge.rotatePlayers('bot-out','bot-in'),true);
 assert.equal(called,1);
 bridge.lastState={phase:'playing',rotationAvailable:false};
 await assert.rejects(()=>bridge.rotatePlayers('bot-out','bot-in'),/NOT_A_STOPPAGE/);
 assert.equal(called,1);
 bridge.dispose();
});

test('P27 banc : refuse une rotation sans session joueur',async()=>{
 const bridge=new OnlineMatchBridge({client:{rotate:async()=>({rotated:true})},players:[],ball:{}});
 assert.equal(await bridge.rotatePlayers('out','in'),false);
 bridge.dispose();
});
