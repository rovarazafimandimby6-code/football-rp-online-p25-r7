/**
 * Versioned wire contract shared by the Durable Object match socket
 * and the Android client. HTTP remains the fallback transport.
 */
export const MATCH_PROTOCOL_VERSION = 1;

const CLIENT_TYPES = new Set(['hello', 'input', 'heartbeat', 'leave']);
const SERVER_TYPES = new Set(['welcome', 'snapshot', 'delta', 'ack', 'error']);
const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_TOKEN_LENGTH = 256;
const MAX_DELTA_EVENTS = 100;

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isId = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
const isSequence = value => Number.isSafeInteger(value) && value >= 0;
const isResumeSequence = value => Number.isSafeInteger(value) && value >= -1;
const CLIENT_FIELDS = {
  hello: new Set(['roomId', 'token', 'afterSequence', 'afterEventId']),
  input: new Set(['sequence', 'x', 'z', 'sprint', 'action', 'callForPass']),
  heartbeat: new Set(['lastSequence']),
  leave: new Set(),
};
const SERVER_FIELDS = {
  welcome: new Set(['playerId', 'nextSequence']),
  snapshot: new Set(['state']),
  delta: new Set(['eventCursor', 'events', 'state']),
  ack: new Set(['sequence']),
  error: new Set(['code', 'fatal']),
};
const hasOnlyFields = (value, allowed) => Object.keys(value).every(key => allowed.has(key));

export function createMatchMessage(type, payload = {}) {
  if (!CLIENT_TYPES.has(type) || !isRecord(payload)) throw new TypeError('INVALID_MATCH_CLIENT_MESSAGE');
  if (Object.hasOwn(payload, 'v') || Object.hasOwn(payload, 'type')) throw new TypeError('INVALID_MATCH_MESSAGE_FIELDS');
  if (!hasOnlyFields(payload, CLIENT_FIELDS[type])) throw new TypeError('INVALID_MATCH_CLIENT_MESSAGE');
  const message = { v: MATCH_PROTOCOL_VERSION, type, ...payload };
  if (message.v !== MATCH_PROTOCOL_VERSION || message.type !== type) throw new TypeError('INVALID_MATCH_MESSAGE_FIELDS');
  if (type === 'hello') {
    if (!/^[a-f0-9]{12}$/.test(message.roomId) ||
        typeof message.token !== 'string' || message.token.length < 8 ||
        message.token.length > MAX_TOKEN_LENGTH ||
        !isResumeSequence(message.afterSequence) ||
        !isSequence(message.afterEventId)) {
      throw new TypeError('INVALID_MATCH_HELLO');
    }
  }
  if (type === 'input') {
    if (!isSequence(message.sequence) || ![message.x, message.z].every(Number.isFinite) ||
        Math.abs(message.x) > 1 || Math.abs(message.z) > 1 ||
        typeof message.sprint !== 'boolean' ||
        (message.action !== null && !['shoot', 'pass', 'tackle'].includes(message.action)) ||
        (message.callForPass !== undefined && typeof message.callForPass !== 'boolean')) {
      throw new TypeError('INVALID_MATCH_INPUT');
    }
  }
  if (type === 'heartbeat' && !isSequence(message.lastSequence)) {
    throw new TypeError('INVALID_MATCH_HEARTBEAT');
  }
  if (type === 'leave' && Object.keys(payload).length !== 0) {
    throw new TypeError('INVALID_MATCH_LEAVE');
  }
  return message;
}

export function encodeMatchMessage(type, payload = {}) {
  if (isRecord(payload)) {
    const candidate = JSON.stringify({ v: MATCH_PROTOCOL_VERSION, type, ...payload });
    if (new TextEncoder().encode(candidate).byteLength > MAX_MESSAGE_BYTES) {
      throw new TypeError('MATCH_MESSAGE_TOO_LARGE');
    }
  }
  const encoded = JSON.stringify(createMatchMessage(type, payload));
  if (new TextEncoder().encode(encoded).byteLength > MAX_MESSAGE_BYTES) {
    throw new TypeError('MATCH_MESSAGE_TOO_LARGE');
  }
  return encoded;
}

export function decodeMatchMessage(raw) {
  if (typeof raw === 'string' && new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) {
    throw new TypeError('MATCH_MESSAGE_TOO_LARGE');
  }
  let message;
  try { message = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { throw new TypeError('INVALID_MATCH_MESSAGE_JSON'); }
  if (!isRecord(message) || message.v !== MATCH_PROTOCOL_VERSION || !SERVER_TYPES.has(message.type) || !hasOnlyFields(message, new Set(['v', 'type', ...SERVER_FIELDS[message.type]]))) {
    throw new TypeError('UNSUPPORTED_MATCH_SERVER_MESSAGE');
  }
  if (message.type === 'welcome' && (!isId(message.playerId) || !isSequence(message.nextSequence))) {
    throw new TypeError('INVALID_MATCH_WELCOME');
  }
  if (message.type === 'snapshot' && (!isRecord(message.state) || !isSequence(message.state.sequence))) {
    throw new TypeError('INVALID_MATCH_SNAPSHOT');
  }
  if (message.type === 'delta' && (!isSequence(message.eventCursor) ||
      !Array.isArray(message.events) || message.events.length > MAX_DELTA_EVENTS)) {
    throw new TypeError('INVALID_MATCH_DELTA');
  }
  if (message.type === 'ack' && !isSequence(message.sequence)) throw new TypeError('INVALID_MATCH_ACK');
  if (message.type === 'error' && (typeof message.code !== 'string' || message.code.length > 80 ||
      (message.fatal !== undefined && typeof message.fatal !== 'boolean'))) {
    throw new TypeError('INVALID_MATCH_ERROR');
  }
  return message;
}
