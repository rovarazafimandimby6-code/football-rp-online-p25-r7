import { encodeMatchMessage, decodeMatchMessage } from './online-match-protocol.js';

const toSocketBase = value => String(value || '').replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:').replace(/\/$/, '');

export class OnlineMatchSocketTransport {
  constructor({ baseUrl, roomId, token, playerId, WebSocketImpl = globalThis.WebSocket, onMessage = null, onStatus = null, onError = null, now = () => Date.now() } = {}) {
    if (!/^[a-f0-9]{12}$/.test(String(roomId || '')) || typeof token !== 'string' || !token) throw new TypeError('INVALID_MATCH_SOCKET_SESSION');
    if (typeof WebSocketImpl !== 'function') throw new Error('WEBSOCKET_UNAVAILABLE');
    this.url = `${toSocketBase(baseUrl)}/api/rooms/${encodeURIComponent(roomId)}/socket`;
    this.roomId = roomId;
    this.token = token;
    this.playerId = playerId || null;
    this.WebSocketImpl = WebSocketImpl;
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.onError = onError;
    this.now = now;
    this.socket = null;
    this.connected = false;
    this.closedByUser = false;
    this.lastSequence = -1;
    this.lastEventId = 0;
    this.pending = [];
  }

  connect({ afterSequence = -1, afterEventId = 0 } = {}) {
    if (this.socket && [0, 1].includes(this.socket.readyState)) return false;
    this.closedByUser = false;
    this.lastSequence = Number.isSafeInteger(afterSequence) ? afterSequence : -1;
    this.lastEventId = Number.isSafeInteger(afterEventId) && afterEventId >= 0 ? afterEventId : 0;
    const socket = new this.WebSocketImpl(this.url);
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.socket !== socket || this.closedByUser) return;
      try {
        socket.send(encodeMatchMessage('hello', {
          roomId: this.roomId, token: this.token,
          afterSequence: this.lastSequence, afterEventId: this.lastEventId,
        }));
        this.onStatus?.('authenticating');
      } catch (error) { this._fail(error); }
    });
    socket.addEventListener('message', event => {
      if (this.socket !== socket) return;
      try {
        const message = decodeMatchMessage(event.data);
        if (message.type === 'welcome') {
          if (this.playerId && message.playerId !== this.playerId) throw new Error('MATCH_SOCKET_PLAYER_MISMATCH');
          this.connected = true;
          this.onStatus?.('connected');
          const queued = this.pending.splice(0);
          for (const item of queued) this._send(item);
        } else if (message.type === 'snapshot') {
          this.lastSequence = Math.max(this.lastSequence, message.state.sequence);
          this.onMessage?.({ state: message.state, events: [], eventCursor: this.lastEventId });
        } else if (message.type === 'delta') {
          this.lastEventId = Math.max(this.lastEventId, message.eventCursor);
          this.onMessage?.({ state: message.state || null, events: message.events, eventCursor: this.lastEventId });
        } else if (message.type === 'ack') {
          this.lastSequence = Math.max(this.lastSequence, message.sequence);
        } else if (message.type === 'error') {
          const error = new Error(message.code);
          this.onError?.(error);
          if (message.fatal === true) this.close();
        }
      } catch (error) { this._fail(error); }
    });
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return;
      this.connected = false;
      this.socket = null;
      this.onStatus?.(this.closedByUser ? 'closed' : 'disconnected');
    });
    socket.addEventListener('error', () => this._fail(new Error('MATCH_SOCKET_NETWORK_ERROR')));
    this.onStatus?.('connecting');
    return true;
  }

  sendInput({ x = 0, z = 0, sprint = false, action = null, callForPass = false, sequence } = {}) {
    const message = {
      sequence: Number.isSafeInteger(sequence) ? sequence : this.lastSequence + 1,
      x, z, sprint, action, ...(callForPass === true ? { callForPass: true } : {}),
    };
    const encoded = encodeMatchMessage('input', message);
    if (this.connected && this.socket?.readyState === 1) return this.socket.send(encoded), true;
    if (this.pending.length >= 4) this.pending.shift();
    this.pending.push(message);
    return false;
  }

  heartbeat() {
    if (!this.connected || this.socket?.readyState !== 1) return false;
    this.socket.send(encodeMatchMessage('heartbeat', { lastSequence: Math.max(0, this.lastSequence) }));
    return true;
  }

  _send(message) {
    if (!this.connected || this.socket?.readyState !== 1) return false;
    this.socket.send(encodeMatchMessage('input', message));
    return true;
  }

  _fail(error) {
    this.connected = false;
    this.onStatus?.('disconnected');
    this.onError?.(error);
    try { this.socket?.close(1011, 'transport error'); } catch {}
  }

  close() {
    this.closedByUser = true;
    this.connected = false;
    this.pending.length = 0;
    const socket = this.socket;
    this.socket = null;
    try { socket?.close(1000, 'client closed'); } catch {}
    this.onStatus?.('closed');
  }
}
