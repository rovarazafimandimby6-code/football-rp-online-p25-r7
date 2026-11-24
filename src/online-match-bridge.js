import { SnapshotBuffer } from './network-sync.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Applies authoritative room snapshots to the local 3D match objects and forwards only this user's input. */
export class OnlineMatchBridge {
  constructor({ client, players, ball, controls, camera = null, onResolveMissingPlayer = null, onState = null, onError = null, now = () => performance.now() } = {}) {
    if (!client || !Array.isArray(players) || !ball) throw new TypeError('ONLINE_BRIDGE_DEPENDENCIES_REQUIRED');
    this.client = client;
    this.players = players;
    this.ball = ball;
    this.controls = controls || null;
    this.camera = camera || null;
    this.onResolveMissingPlayer = onResolveMissingPlayer;
    this.normalCameraMode = this.camera?.mode || 'player';
    this.localOnPitch = true;
    this.onState = onState;
    this.onError = onError;
    this.now = now;
    this.buffer = new SnapshotBuffer({ maxSnapshots: 8, interpolationDelay: 0.11 });
    this.remoteIds = new Map();
    this.localServerId = null;
    this.sequence = -1;
    this.eventCursor = 0;
    this.lastPollAt = 0;
    this.lastInputAt = 0;
    this.lastHeartbeatAt = 0;
    this.pollIntervalMs = 80;
    this.pollErrorCount = 0;
    this.nextReconnectAt = 0;
    this.reconnectInFlight = false;
    this.inputIntervalMs = 50;
    this.inFlight = false;
    this.disposed = false;
    this.lastState = null;
  }

  bindJoin(joinResult) {
    const playerId = joinResult?.playerId;
    if (typeof playerId !== 'string' || !playerId) throw new Error('INVALID_JOIN_RESULT');
    this.localServerId = playerId;
    const me = joinResult.state?.players?.find(player => player.id === playerId);
    if (me) {
      this.setLocalBenchState(me.isOnPitch === false, me.team);
      const local = this.players.find(player => player.team === me.team && player.slotIndex === me.slot);
      if (local) local.isControlled = true;
    }
    return true;
  }

  setLocalBenchState(benched, team = null) {
    this.localOnPitch = !benched;
    this.controls?.setBenchMode?.(benched);
    if (this.camera?.setMode) this.camera.setMode(benched ? 'bench' : this.normalCameraMode);
    this.localTeam = team || this.localTeam || null;
  }

  setPreferredCameraMode(mode) {
    if (!['player', 'broadcast', 'spectator', 'touchline', 'close', 'tactical'].includes(mode)) return false;
    this.normalCameraMode = mode;
    if (this.localOnPitch) this.camera?.setMode?.(mode);
    return true;
  }

  _resolvePlayer(serverPlayer) {
    const key = `${serverPlayer.team}:${serverPlayer.slot}`;
    let local = this.remoteIds.get(serverPlayer.id);
    if (local && local.team === serverPlayer.team) return local;
    local = this.players.find(player => player.team === serverPlayer.team && player.slotIndex === serverPlayer.slot);
    if (local) this.remoteIds.set(serverPlayer.id, local);
    if (!local && this.onResolveMissingPlayer) {
      local = this.onResolveMissingPlayer(serverPlayer) || null;
      if (local && !this.players.includes(local)) this.players.push(local);
    }
    if (local) this.remoteIds.set(serverPlayer.id, local);
    return local || null;
  }

  applyState(state, events = []) {
    if (!state || !Number.isSafeInteger(state.sequence) || state.sequence < this.sequence) return false;
    this.sequence = state.sequence;
    const time = this.now() / 1000;
    const activeIds = new Set();
    for (const player of this.players) player.isControlled = false;
    for (const remote of state.players || []) {
      const local = this._resolvePlayer(remote);
      if (!local || ![remote.x, remote.z, remote.vx, remote.vz, remote.facing].every(Number.isFinite)) continue;
      activeIds.add(remote.id);
      local.name = String(remote.name || local.name).slice(0, 20);
      local.isControlled = remote.id === this.localServerId;
      local.serverPlayerId = remote.id;
      local.slotIndex = remote.slot;
      local.isOnPitch = remote.isOnPitch !== false;
      if (remote.id === this.localServerId) this.setLocalBenchState(remote.isOnPitch === false, remote.team);
      local.aiControlled = remote.aiControlled === true || remote.controlMode === 'ai';
      local.controlMode = local.aiControlled ? 'ai' : (remote.controlMode || 'human');
      local.stamina = Number.isFinite(remote.stamina) ? clamp(remote.stamina, 0, 1) : local.stamina;
      this.buffer.push(remote.id, { time, x: remote.x, z: remote.z, facing: remote.facing, sequence: state.sequence });
      local._onlineVelocity = { x: remote.vx, z: remote.vz };
    }
    for (const [id, local] of this.remoteIds) {
      if (!activeIds.has(id)) { this.buffer.remove(id); this.remoteIds.delete(id); local._onlineVelocity = null; }
    }
    const serverBall = state.ball;
    if (serverBall && [serverBall.x, serverBall.y, serverBall.z, serverBall.vx, serverBall.vy, serverBall.vz].every(Number.isFinite)) {
      this.ball.pos.set(serverBall.x, serverBall.y, serverBall.z);
      this.ball.vel.set(serverBall.vx, serverBall.vy, serverBall.vz);
      const owner = serverBall.ownerId ? this.remoteIds.get(serverBall.ownerId) : null;
      this.ball.owner = owner || null;
      this.ball.lastTouchTeam = serverBall.lastTouchTeam || null;
      this.ball.syncVisual?.(0);
    }
    this.lastState = state;
    for (const event of events || []) {
      if (event?.type === 'goal') {
        for (const player of this.players) if (player.team === event.team) player.triggerAnim?.('celebrate', 1.8);
      } else if (['pass', 'shoot', 'tackle'].includes(event?.type) && event.playerId) {
        const player = this.remoteIds.get(event.playerId);
        player?.triggerAnim?.(event.type, 0.34);
      }
    }
    this.onState?.(state, events);
    return true;
  }

  renderRemotePlayers(renderTime = this.now() / 1000) {
    for (const [serverId, local] of this.remoteIds) {
      const snapshot = this.buffer.sample(serverId, renderTime);
      if (!snapshot) continue;
      local.pos.x = snapshot.x;
      local.pos.z = snapshot.z;
      local.facing = snapshot.facing;
      const velocity = local._onlineVelocity || { x: 0, z: 0 };
      local.vel.x = velocity.x;
      local.vel.z = velocity.z;
      local.updateVisual?.(1 / 30);
    }
  }

  async rotatePlayers(outgoingId, incomingId) {
    if (this.disposed || !this.localServerId || !outgoingId || !incomingId) return false;
    if (!this.lastState?.rotationAvailable) throw new Error('NOT_A_STOPPAGE');
    try {
      const result = await this.client.rotate({ outgoingId, incomingId });
      if (result?.state) this.applyState(result.state, []);
      return result?.rotated === true;
    } catch (error) {
      this.onError?.(error);
      throw error;
    }
  }

  async requestEntry() {
    if (this.disposed || !this.localServerId || this.localOnPitch) return false;
    try {
      const result = await this.client.requestEntry();
      return result?.queued === true;
    } catch (error) {
      this.onError?.(error);
      throw error;
    }
  }

  async sendControls(at = this.now()) {
    if (this.disposed || !this.localServerId || !this.controls || !this.localOnPitch || this.lastState?.phase !== 'playing' || at < this.nextReconnectAt || at - this.lastInputAt < this.inputIntervalMs) return false;
    this.lastInputAt = at;
    const move = this.controls.getMoveVector();
    let action = null;
    const pass = this.controls.consumePass?.();
    const shoot = this.controls.consumeShoot?.();
    const press = this.controls.consumePress?.();
    const lob = this.controls.consumeLob?.();
    const callForPass = this.controls.consumeCallForPass?.() === true;
    if (this.lastState?.ball?.ownerId === this.localServerId) action = shoot ? 'shoot' : (pass || lob) ? 'pass' : null;
    else action = shoot || lob ? 'tackle' : press ? 'tackle' : null;
    try {
      await this.client.sendInput({ x: move.x, z: move.z, sprint: this.controls.isSprinting?.() === true, action, ...(callForPass ? { callForPass: true } : {}) });
      return true;
    } catch (error) {
      this.pollErrorCount = Math.min(8, this.pollErrorCount + 1);
      this.nextReconnectAt = at + Math.min(15000, 500 * (2 ** (this.pollErrorCount - 1)));
      this.onError?.(error);
      return false;
    }
  }

  async poll(at = this.now()) {
    if (this.disposed || this.inFlight || at < this.nextReconnectAt || at - this.lastPollAt < this.pollIntervalMs) return false;
    this.lastPollAt = at;
    this.inFlight = true;
    try {
      const result = await this.client.pollState({ afterSequence: this.sequence, afterEventId: this.eventCursor });
      if (result?.state) this.applyState(result.state, result.events || []);
      if (Number.isSafeInteger(result?.eventCursor)) this.eventCursor = Math.max(this.eventCursor, result.eventCursor);
      this.pollErrorCount = 0;
      return Boolean(result?.state);
    } catch (error) {
      this.pollErrorCount = Math.min(8, this.pollErrorCount + 1);
      this.nextReconnectAt = Math.max(this.nextReconnectAt, at + Math.min(15000, 500 * (2 ** (this.pollErrorCount - 1))));
      this.onError?.(error); return false;
    }
    finally { this.inFlight = false; }
  }

  async update(at = this.now()) {
    if (!this.disposed && this.localServerId && at - this.lastHeartbeatAt >= 5000) {
      this.lastHeartbeatAt = at;
      this.client.heartbeat().catch(error => { this.pollErrorCount = Math.min(8, this.pollErrorCount + 1); this.nextReconnectAt = at + Math.min(15000, 500 * (2 ** (this.pollErrorCount - 1))); this.onError?.(error); });
    }
    if (!this.disposed && this.localServerId && !this.reconnectInFlight && this.pollErrorCount > 0 && at >= this.nextReconnectAt) {
      this.reconnectInFlight = true;
      this.client.reconnectSession().then(result => {
        this.pollErrorCount = 0; this.nextReconnectAt = 0;
        if (result?.state) this.applyState(result.state, []);
      }).catch(error => { this.pollErrorCount = Math.min(8, this.pollErrorCount + 1); this.nextReconnectAt = at + Math.min(30000, 750 * (2 ** (this.pollErrorCount - 1))); this.onError?.(error); }).finally(() => { this.reconnectInFlight = false; });
    }
    await this.sendControls(at);
    await this.poll(at);
    this.renderRemotePlayers(at / 1000);
  }

  dispose() {
    this.disposed = true;
    this.buffer.clear();
    this.remoteIds.clear();
    for (const player of this.players) delete player._onlineVelocity;
  }
}
