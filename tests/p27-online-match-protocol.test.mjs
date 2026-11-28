import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATCH_PROTOCOL_VERSION, createMatchMessage, encodeMatchMessage, decodeMatchMessage
} from '../src/online-match-protocol.js';

test('P27 match socket protocol creates versioned hello and input envelopes', () => {
  assert.deepEqual(createMatchMessage('hello', { roomId:'abcdef123456', token:'session-token', afterSequence:8, afterEventId:3 }), {
    v: MATCH_PROTOCOL_VERSION, type:'hello', roomId:'abcdef123456', token:'session-token', afterSequence:8, afterEventId:3
  });
  const input = JSON.parse(encodeMatchMessage('input', { sequence:9, x:0.4, z:-0.8, sprint:true, action:'pass' }));
  assert.equal(input.v, 1);
  assert.equal(input.type, 'input');
  assert.equal(input.sequence, 9);
});

test('P27 match socket protocol rejects malformed or out-of-range client inputs', () => {
  assert.throws(() => createMatchMessage('hello', { roomId:'bad', token:'x' }), /INVALID_MATCH_HELLO/);
  assert.throws(() => createMatchMessage('hello', { roomId:'abcdef123456', token:'session-token', afterSequence:-2, afterEventId:0 }), /INVALID_MATCH_HELLO/);
  assert.throws(() => createMatchMessage('hello', { roomId:'abcdef123456', token:'session-token', afterSequence:-1, afterEventId:-1 }), /INVALID_MATCH_HELLO/);
  assert.throws(() => createMatchMessage('input', { sequence:-1, x:0, z:0, sprint:false, action:null }), /INVALID_MATCH_INPUT/);
  assert.throws(() => createMatchMessage('input', { sequence:1, x:1.1, z:0, sprint:false, action:null }), /INVALID_MATCH_INPUT/);
  assert.throws(() => createMatchMessage('input', { sequence:1, x:0, z:0, sprint:false, action:'teleport' }), /INVALID_MATCH_INPUT/);
  assert.throws(() => createMatchMessage('leave', { roomId:'abcdef123456' }), /INVALID_MATCH_CLIENT_MESSAGE/);
  assert.throws(() => createMatchMessage('hello', { roomId:'abcdef123456', token:'session-token', afterSequence:-1, afterEventId:0, admin:true }), /INVALID_MATCH_CLIENT_MESSAGE/);
  assert.throws(() => createMatchMessage('input', { sequence:1, x:0, z:0, sprint:false, action:null, teleport:true }), /INVALID_MATCH_CLIENT_MESSAGE/);
});

test('P27 match socket protocol validates authoritative server messages', () => {
  assert.deepEqual(decodeMatchMessage(JSON.stringify({ v:1, type:'welcome', playerId:'player-1', nextSequence:4 })).nextSequence, 4);
  assert.equal(decodeMatchMessage({ v:1, type:'snapshot', state:{ sequence:7, players:[] } }).state.sequence, 7);
  assert.deepEqual(decodeMatchMessage({ v:1, type:'delta', eventCursor:12, events:[] }).events, []);
  assert.throws(() => decodeMatchMessage('{bad json'), /INVALID_MATCH_MESSAGE_JSON/);
  assert.throws(() => decodeMatchMessage({ v:2, type:'snapshot', state:{ sequence:1 } }), /UNSUPPORTED_MATCH_SERVER_MESSAGE/);
  assert.throws(() => decodeMatchMessage({ v:1, type:'welcome', playerId:'p1', nextSequence:1, accountId:'private' }), /UNSUPPORTED_MATCH_SERVER_MESSAGE/);
  assert.throws(() => decodeMatchMessage({ v:1, type:'snapshot', state:{} }), /INVALID_MATCH_SNAPSHOT/);
  assert.throws(() => decodeMatchMessage({ v:1, type:'delta', eventCursor:1, events:Array(101).fill({}) }), /INVALID_MATCH_DELTA/);
  assert.throws(() => decodeMatchMessage({ v:1, type:'error', code:'DENIED', fatal:'yes' }), /INVALID_MATCH_ERROR/);
});

test('P27 match socket protocol enforces the 16 KiB message ceiling', () => {
  assert.throws(() => encodeMatchMessage('hello', {
    roomId:'abcdef123456', token:'session-token', afterSequence:-1, afterEventId:0, padding:'x'.repeat(17_000)
  }), /MATCH_MESSAGE_TOO_LARGE/);
  assert.throws(() => decodeMatchMessage(' '.repeat(16_385)), /MATCH_MESSAGE_TOO_LARGE/);
});

test('P27 match socket protocol prevents payloads from overriding envelope type/version', () => {
  assert.throws(() => createMatchMessage('input', { v:2, type:'hello', sequence:1, x:0, z:0, sprint:false, action:null }), /INVALID_MATCH_MESSAGE_FIELDS/);
});
