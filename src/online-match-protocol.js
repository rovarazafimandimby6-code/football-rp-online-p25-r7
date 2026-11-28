/**
 * Versioned wire contract shared by the future Durable Object match socket
 * and the Android client. This module is deliberately transport-agnostic:
 * HTTP remains the active transport until the server socket endpoint exists.
 */
export const MATCH_PROTOCOL_VERSION = 1;

const CLIENT_TYPES = new Set(['hello', 'input', 'heartbeat', 'leave']);
const SERVER_TYPES = new Set(['welcome', 'snapshot', 'delta', 'ack', 'error']);

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isId = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
const isSequence = value => Number.isSafeInteger(value) && value >= 0;

export function createMatchMessage(type, payload = {}) {
  if (!CLIENT_TYPES.has(type) || !isRecord(payload)) throw new TypeError('INVALID_MATCH_CLIENT_MESSAGE');
  const message = { v: MATCH_PROTOCOL_VERSION, type, ...payload };
  if (message.v !== MATCH_PROTOCOL_VERSION || message.type !== type) throw new TypeError('INVALID_MATCH_MESSAGE_FIELDS');
  if (type === 'hello' && (!/^[a-f0-9]{12}$/.test(message.roomId) || !isId(message.token))) throw new TypeError('INVALID_MATCH_HELLO');
  if (type === 'input') {
    if (!isSequence(message.sequence) || ![message.x, message.z].every(Number.isFinite) ||
        Math.abs(message.x) > 1 || Math.abs(message.z) > 1 ||
        typeof message.sprint !== 'boolean' ||
        (message.action !== null && !['shoot', 'pass', 'tackle'].includes(message.action)) ||
        (message.callForPass !== undefined && typeof message.callForPass !== 'boolean')) {
      throw new TypeError('INVALID_MATCH_INPUT');
    }
  }
  if (type === 'heartbeat' && !isSequence(message.lastSequence)) throw new TypeError('INVALID_MATCH_HEARTBEAT');
  return message;
}

export function encodeMatchMessage(type, payload = {}) {
  return JSON.stringify(createMatchMessage(type, payload));
}

export function decodeMatchMessage(raw) {
  let message;
  try { message = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { throw new TypeError('INVALID_MATCH_MESSAGE_JSON'); }
  if (!isRecord(message) || message.v !== MATCH_PROTOCOL_VERSION || !SERVER_TYPES.has(message.type)) {
    throw new TypeError('UNSUPPORTED_MATCH_SERVER_MESSAGE');
  }
  if (message.type === 'welcome' && (!isId(message.playerId) || !isSequence(message.nextSequence))) {
    throw new TypeError('INVALID_MATCH_WELCOME');
  }
  if (message.type === 'snapshot' && (!isRecord(message.state) || !isSequence(message.state.sequence))) {
    throw new TypeError('INVALID_MATCH_SNAPSHOT');
  }
  if (message.type === 'delta' && (!isSequence(message.eventCursor) || !Array.isArray(message.events))) {
    throw new TypeError('INVALID_MATCH_DELTA');
  }
  if (message.type === 'ack' && !isSequence(message.sequence)) throw new TypeError('INVALID_MATCH_ACK');
  if (message.type === 'error' && (typeof message.code !== 'string' || message.code.length > 80)) {
    throw new TypeError('INVALID_MATCH_ERROR');
  }
  return message;
}
