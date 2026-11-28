import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineMatchClient } from '../src/online-client.js';

class FakeSocket {
  static instances=[];
  constructor(url){this.url=url;this.readyState=0;this.listeners={};FakeSocket.instances.push(this);}
  addEventListener(name,fn){(this.listeners[name] ||= []).push(fn);}
  emit(name,data={}){for(const fn of this.listeners[name]||[])fn(data);}
  send(){}
  close(){this.readyState=3;this.emit('close');}
}

test('P27 HTTP match client keeps realtime disabled unless explicitly enabled', () => {
  const client=new OnlineMatchClient({baseUrl:'https://api.test',fetchImpl:async()=>({ok:true,json:async()=>({})})});
  assert.equal(client.connectRealtime(),false);
  assert.equal(client.realtimeTransport,null);
});

test('P27 HTTP match client creates opt-in realtime transport only for an authenticated room session', () => {
  FakeSocket.instances=[];
  const client=new OnlineMatchClient({baseUrl:'https://api.test',WebSocketImpl:FakeSocket});
  client.roomId='abcdef123456'; client.token='session-secret'; client.playerId='player-1';
  assert.equal(client.connectRealtime({enabled:true,WebSocketImpl:FakeSocket}),true);
  assert.equal(FakeSocket.instances.length,1);
  assert.equal(FakeSocket.instances[0].url,'wss://api.test/api/rooms/abcdef123456/socket');
  client.disconnectRealtime();
  assert.equal(client.realtimeTransport,null);
});
