import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('P27 caméra en ligne : le mode spectateur préféré survit au passage sur le banc',()=>{
 const modes=[];
 const camera={mode:'player',setMode(mode){this.mode=mode;modes.push(mode);return true;}};
 const bridge=new OnlineMatchBridge({client:{},players:[],ball:{},camera});
 bridge.localServerId='human-1';
 assert.equal(bridge.setPreferredCameraMode('spectator'),true);
 assert.equal(camera.mode,'spectator');
 bridge.setLocalBenchState(true,'blue');
 assert.equal(camera.mode,'bench');
 assert.equal(bridge.setPreferredCameraMode('broadcast'),true);
 assert.equal(camera.mode,'bench');
 bridge.setLocalBenchState(false,'blue');
 assert.equal(camera.mode,'broadcast');
 assert.equal(bridge.setPreferredCameraMode('invalid'),false);
 bridge.dispose();
});


test('P27 banc en ligne : un joueur peut demander à sortir lui-même, sans pouvoir remplacer un autre humain', async()=>{
 const ui=await readFile(new URL('../src/ui.js',import.meta.url),'utf8');
 const server=await readFile(new URL('../server/room-manager.js',import.meta.url),'utf8');
 assert.match(ui,/starters\.filter\(player => player\.isBot === true \|\| player\.id === localPlayerId\)/);
 assert.match(server,/if \(!outgoing\.isBot && outgoing\.id !== requester\.id\) throw new Error\('OUTGOING_PLAYER_CONSENT_REQUIRED'\)/);
 assert.match(ui,/requestButton\.textContent = 'DEMANDER À ENTRER'/);
});
