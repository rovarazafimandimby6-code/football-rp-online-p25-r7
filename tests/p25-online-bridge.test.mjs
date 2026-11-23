import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineMatchBridge } from '../src/online-match-bridge.js';

function fixture() {
  const players = ['blue','red'].flatMap(team => [0,1].map(slotIndex => ({ team, slotIndex, pos:{x:0,z:0}, vel:{x:0,z:0}, facing:0, isControlled:false, updateVisual(){} })));
  const ball = { pos:{set(x,y,z){this.x=x;this.y=y;this.z=z;}}, vel:{set(x,y,z){this.x=x;this.y=y;this.z=z;}}, syncVisual(){} };
  const sent = [];
  const client = { sendInput: async input => { sent.push(input); }, pollState: async () => ({ state:null, events:[], eventCursor:0 }) };
  const controls = { getMoveVector:()=>({x:0.6,z:-0.8}), isSprinting:()=>true, consumePass:()=>null, consumeShoot:()=>null, consumePress:()=>false, consumeLob:()=>false };
  return { players, ball, sent, client, controls };
}

test('online bridge binds the human to exactly their team/slot avatar', () => {
  const f = fixture();
  const bridge = new OnlineMatchBridge({ ...f, now:()=>1000 });
  bridge.bindJoin({ playerId:'human-1', state:{ players:[{id:'human-1',team:'red',slot:1}] } });
  assert.equal(f.players.find(p=>p.team==='red'&&p.slotIndex===1).isControlled,true);
  assert.equal(f.players.filter(p=>p.isControlled).length,1);
});

test('online bridge applies authoritative players and ball without local simulation', () => {
  const f = fixture();
  const bridge = new OnlineMatchBridge({ ...f, now:()=>2000 });
  bridge.bindJoin({ playerId:'human-1' });
  const state = { sequence:4, players:[
    {id:'human-1',team:'blue',slot:0,name:'Rova',x:4,z:2,vx:1,vz:0,facing:1},
    {id:'bot-1',team:'red',slot:1,name:'Bot',x:-3,z:1,vx:0,vz:2,facing:0.5}
  ], ball:{x:1,y:0.5,z:2,vx:3,vy:0,vz:1,ownerId:'human-1',lastTouchTeam:'blue'} };
  assert.equal(bridge.applyState(state),true);
  assert.equal(bridge.applyState({...state,sequence:3}),false);
  assert.equal(f.ball.pos.x,1);
  assert.equal(f.ball.owner,f.players.find(p=>p.team==='blue'&&p.slotIndex===0));
  bridge.renderRemotePlayers(2.2);
  assert.equal(f.players.find(p=>p.team==='red'&&p.slotIndex===1).pos.x,-3);
});

test('online bridge forwards normalized movement and sprint at a bounded input cadence', async () => {
  const f = fixture();
  const bridge = new OnlineMatchBridge({ ...f, now:()=>1000 });
  bridge.bindJoin({ playerId:'human-1' });
  bridge.applyState({ sequence:0, phase:'playing', players:[], ball:null });
  assert.equal(await bridge.sendControls(1000),true);
  assert.deepEqual(f.sent[0],{x:0.6,z:-0.8,sprint:true,action:null});
  assert.equal(await bridge.sendControls(1020),false);
  assert.equal(await bridge.sendControls(1060),true);
});

test('disposed bridge rejects future state application and clears interpolation buffers', () => {
  const f = fixture();
  const bridge = new OnlineMatchBridge({ ...f, now:()=>1000 });
  bridge.applyState({sequence:1,players:[{id:'bot',team:'red',slot:0,x:1,z:1,vx:0,vz:0,facing:0}],ball:null});
  bridge.dispose();
  assert.equal(bridge.buffer.snapshots.size,0);
  assert.equal(bridge.disposed,true);
});


test('P25 R12 : le moteur online injecte le pont et isole la simulation locale', async () => {
  const { readFile } = await import('node:fs/promises');
  const game = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(game, /new OnlineMatchBridge/);
  assert.match(game, /if \(this\.onlineBridge\)/);
  assert.match(game, /this\.onlineBridge\.update\(now\)/);
  assert.match(main, /onlineClient: online\?\.client/);
  assert.match(main, /data-action="create-online"/);
  assert.match(main, /data-action="join-online"/);
});

test('P25 R13 : le pont suspend les inputs pendant le backoff après une panne réseau', async () => {
  const f = fixture();
  let attempts = 0;
  f.client.sendInput = async () => { attempts++; throw new Error('NETWORK_OFFLINE'); };
  const errors = [];
  const bridge = new OnlineMatchBridge({ ...f, now: () => 1000, onError: error => errors.push(error) });
  bridge.bindJoin({ playerId: 'human-1' });
  bridge.lastState = { phase: 'playing', ball: { ownerId: null } };
  assert.equal(await bridge.sendControls(1000), false);
  assert.equal(attempts, 1);
  assert.equal(bridge.nextReconnectAt, 1500);
  assert.equal(await bridge.sendControls(1100), false);
  assert.equal(attempts, 1);
  assert.equal(errors.length, 1);
});
