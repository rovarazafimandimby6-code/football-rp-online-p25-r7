import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineMatchSocketTransport } from '../src/online-match-socket.js';

class FakeSocket {
  static instances = [];
  constructor(url) { this.url=url; this.readyState=0; this.listeners={}; this.sent=[]; FakeSocket.instances.push(this); }
  addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
  emit(name, data={}) { for (const callback of this.listeners[name] || []) callback(data); }
  send(value) { this.sent.push(value); }
  close() { this.readyState=3; this.emit('close'); }
  open() { this.readyState=1; this.emit('open'); }
  receive(value) { this.emit('message', {data:JSON.stringify(value)}); }
}

test('P27 socket transport connects to secure room endpoint and authenticates after open', () => {
  FakeSocket.instances=[];
  const statuses=[];
  const transport=new OnlineMatchSocketTransport({baseUrl:'https://api.example.test/',roomId:'abcdef123456',token:'secret-token',playerId:'p1',WebSocketImpl:FakeSocket,onStatus:s=>statuses.push(s)});
  assert.equal(transport.connect({afterSequence:4,afterEventId:2}),true);
  const socket=FakeSocket.instances[0];
  assert.equal(socket.url,'wss://api.example.test/api/rooms/abcdef123456/socket');
  socket.open();
  const hello=JSON.parse(socket.sent[0]);
  assert.equal(hello.type,'hello');
  assert.equal(hello.token,'secret');
  assert.equal(hello.afterSequence,4);
  assert.equal(statuses.includes('authenticating'),true);
});

test('P27 socket transport sends queued input only after authenticated welcome', () => {
  FakeSocket.instances=[];
  const transport=new OnlineMatchSocketTransport({baseUrl:'http://localhost:8787',roomId:'abcdef123456',token:'secret-token',WebSocketImpl:FakeSocket});
  transport.connect();
  const socket=FakeSocket.instances[0];
  assert.equal(transport.sendInput({sequence:5,x:0.2,z:-0.2,sprint:false}),false);
  socket.open();
  socket.receive({v:1,type:'welcome',playerId:'p1',nextSequence:5});
  assert.equal(transport.connected,true);
  assert.equal(JSON.parse(socket.sent[1]).type,'input');
  assert.equal(JSON.parse(socket.sent[1]).sequence,5);
});

test('P27 socket transport delivers authoritative snapshots and event deltas', () => {
  FakeSocket.instances=[];
  const received=[];
  const transport=new OnlineMatchSocketTransport({baseUrl:'https://api.test',roomId:'abcdef123456',token:'secret-token',WebSocketImpl:FakeSocket,onMessage:m=>received.push(m)});
  transport.connect();
  const socket=FakeSocket.instances[0]; socket.open();
  socket.receive({v:1,type:'welcome',playerId:'p1',nextSequence:0});
  socket.receive({v:1,type:'snapshot',state:{sequence:7,players:[]}});
  socket.receive({v:1,type:'delta',eventCursor:3,events:[{type:'goal'}]});
  assert.equal(received[0].state.sequence,7);
  assert.equal(received[1].eventCursor,3);
  assert.equal(received[1].events[0].type,'goal');
});

test('P27 socket transport rejects a welcome for a different player and closes cleanly', () => {
  FakeSocket.instances=[];
  const errors=[];
  const transport=new OnlineMatchSocketTransport({baseUrl:'https://api.test',roomId:'abcdef123456',token:'secret-token',playerId:'expected',WebSocketImpl:FakeSocket,onError:e=>errors.push(e)});
  transport.connect();
  const socket=FakeSocket.instances[0]; socket.open();
  socket.receive({v:1,type:'welcome',playerId:'other',nextSequence:0});
  assert.equal(errors[0].message,'MATCH_SOCKET_PLAYER_MISMATCH');
  transport.close();
  assert.equal(transport.connected,false);
});
