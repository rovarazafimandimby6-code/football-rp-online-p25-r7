import { skillAccuracy, dominantFootFactor, strikeFoot, shotSpin, tackleControlScore, goalkeeperSaveReach } from './gameplay-tuning.js';
import { classifyTackle } from './referee.js';
import { updateStamina, staminaSpeedFactor } from './stamina.js';
import { SceneManager } from './scene.js';
import { FieldBuilder } from './field.js';
import { PITCH } from './pitch.js';
import { WeatherManager } from './weather.js';
import { Player } from './player.js';
import { Ball } from './ball.js';
import { PhysicsEngine } from './physics.js';
import { BroadcastCamera } from './camera.js';
import { TeamAI, createTeamRoster } from './ai.js';
import { createMatchSquad } from './match-squad.js';
import { validateSubstitution } from './substitution-manager.js';
import { selectAISubstitution } from './ai-substitution-manager.js';
import { ControlsManager } from './controls.js';
import { MatchState } from './match.js';
import { UIManager } from './ui.js';
import { selectRolePlayer } from './role-presentation.js';
import { OnlineMatchBridge } from './online-match-bridge.js';

export class Game {
  constructor(container, callbacks = {}) {
    this.sceneMgr = new SceneManager(container);
    this.field = new FieldBuilder(this.sceneMgr.scene);
    this.weather = new WeatherManager(this.sceneMgr);
    this.ball = new Ball(this.sceneMgr.scene);
    this.physics = new PhysicsEngine();
    this.cam = new BroadcastCamera(this.sceneMgr.camera, callbacks.cameraMode || 'player');
    this.cam.setZoom(callbacks.cameraZoom ?? 55);
    this.ai = new TeamAI();
    this.controls = new ControlsManager();
    this.match = new MatchState();
    this.matchResultReported = false;
    this.onlineHalftimeShown = false;
    this.playerMatchStats = this.createPlayerMatchStats();
    this.pendingControlledPass = null;
    this.callForPassCooldown = 0;
    this.onMatchEnd = callbacks.onMatchEnd || null;
    this.onExitMatch = callbacks.onExitMatch || null;

    const rosterConfigs = [
      ...createTeamRoster('blue', '2-2', callbacks.homeRoster, callbacks.careerPlayerId),
      ...createTeamRoster('red', '2-2', callbacks.awayRoster)
    ];
    const requestedRole = ['GK', 'DEF', 'MID', 'FWD'].includes(callbacks.playerRole) ? callbacks.playerRole : 'FWD';
    const controlledConfig = rosterConfigs.find((cfg) => cfg.team === 'blue' && cfg.id === callbacks.careerPlayerId)
      || rosterConfigs.find((cfg) => cfg.team === 'blue' && cfg.role === requestedRole)
      || rosterConfigs.find((cfg) => cfg.team === 'blue' && cfg.slotIndex === 4)
      || rosterConfigs.find((cfg) => cfg.team === 'blue');
    this.players = rosterConfigs.map((cfg) => {
      const kitColors = cfg.team === 'blue' ? callbacks.homeKitColors : callbacks.awayKitColors;
      const kitAppearance = cfg.team === 'blue'
        ? (cfg.role === 'GK' ? (callbacks.homeGoalkeeperKitAppearance || callbacks.homeKitAppearance) : callbacks.homeKitAppearance)
        : (cfg.role === 'GK' ? (callbacks.awayGoalkeeperKitAppearance || callbacks.awayKitAppearance) : callbacks.awayKitAppearance);
      const appearance = {
        ...(cfg === controlledConfig ? (callbacks.playerAppearance || {}) : {}),
        ...(kitAppearance && typeof kitAppearance === 'object' ? kitAppearance : {}),
        ...(kitColors ? { kitColors } : {}),
        ...(cfg === controlledConfig ? { shopCosmeticsEnabled:true } : {})
      };
      return new Player({
        ...cfg,
        appearance,
        ...(cfg === controlledConfig ? {
          attributes: callbacks.playerAttributes,
          preferredFoot: callbacks.preferredFoot
        } : {})
      });
    });
    const startingIds = new Set(this.players.filter(player => player.team === 'blue').map(player => player.id));
    this.benchPlayers = {
      blue: createMatchSquad('blue', '2-2', callbacks.homeRoster, callbacks.careerPlayerId).substitutes
        .filter(player => player.id !== null && player.id !== undefined && !startingIds.has(player.id)),
      red: createMatchSquad('red', '2-2', callbacks.awayRoster).substitutes
        .filter(player => player.id !== null && player.id !== undefined && !this.players.some(starter => starter.team === 'red' && starter.id === player.id))
    };
    this.substitutionsUsed = { blue: 0, red: 0 };
    this.substitutionLimit = 3;
    this.aiSubstitutionCheckTimer = 0;

    for (const p of this.players) {
      this.sceneMgr.scene.add(p.visual.root);
    }

    this.activePlayer = this.players.find(player => player.team === 'blue' && player.id === callbacks.careerPlayerId)
      || selectRolePlayer(this.players, callbacks.playerRole);
    if (callbacks.playerName) this.activePlayer.name = String(callbacks.playerName).slice(0, 20);
    if (Number.isInteger(callbacks.playerNumber) && callbacks.playerNumber >= 1 && callbacks.playerNumber <= 99) this.activePlayer.setNumber(callbacks.playerNumber);
    this.activePlayer.isControlled = true;
    this.onlineBridge = null;
    if (callbacks.onlineClient && callbacks.onlineJoinResult) {
      this.onlineBridge = new OnlineMatchBridge({ client: callbacks.onlineClient, players: this.players, ball: this.ball, controls: this.controls, camera: this.cam,
        onResolveMissingPlayer: (remote) => {
          const reserve = new Player({
            id: remote.id, team: remote.team, slotIndex: remote.slot,
            role: ['GK','DEF','MID','FWD'].includes(remote.role) ? remote.role : 'MID',
            name: String(remote.name || 'Réserviste').slice(0, 20),
            number: Number.isInteger(remote.slot) ? remote.slot + 1 : 12,
            appearance: remote.team === 'blue'
              ? { ...(remote.role === 'GK' ? (callbacks.homeGoalkeeperKitAppearance || callbacks.homeKitAppearance || {}) : (callbacks.homeKitAppearance || {})), ...(callbacks.homeKitColors ? { kitColors:callbacks.homeKitColors } : {}) }
              : { ...(remote.role === 'GK' ? (callbacks.awayGoalkeeperKitAppearance || callbacks.awayKitAppearance || {}) : (callbacks.awayKitAppearance || {})), ...(callbacks.awayKitColors ? { kitColors:callbacks.awayKitColors } : {}) }
          });
          reserve.serverPlayerId = remote.id;
          reserve.isOnPitch = remote.isOnPitch !== false;
          this.sceneMgr.scene.add(reserve.visual.root);
          return reserve;
        },
        onError: (error) => this.ui?.setStatus?.(`RÉSEAU : ${String(error?.message || 'connexion interrompue').slice(0, 48)}`),
        onState: (state) => {
          this.match.blueScore = state.score?.blue ?? this.match.blueScore;
          this.match.redScore = state.score?.red ?? this.match.redScore;
          this.match.period = state.period || 1;
          this.match.elapsedMatchTime = Math.max(0, (state.elapsedMs || 0) / 1000);
          this.match.timeLeft = Math.max(0, ((state.durationMs || 300000) - (state.elapsedMs || 0)) / 1000);
          const controlled = this.players.find(player => player.isControlled);
          if (controlled) this.activePlayer = controlled;
          this.ui?.setBenchStatus?.(state.players || [], callbacks.onlineJoinResult.playerId, state.phase, state.rotationRequests || [], state.rotationAvailable === true);
          if (state.phase === 'fulltime') {
            this.match.phase = 'fulltime';
            if (state.result && !this.onlineMatchReportShown) {
              this.onlineMatchReportShown = true;
              this.ui?.showMatchReport?.(state.result);
            }
          }
          else if (state.phase === 'halftime') this.match.phase = 'halftime';
          else if (state.phase === 'playing') this.match.phase = 'playing';
        }
      });
      this.onlineBridge.bindJoin(callbacks.onlineJoinResult);
      if (callbacks.onlineJoinResult.state) this.onlineBridge.applyState(callbacks.onlineJoinResult.state);
      const joined = this.players.find(player => player.team === callbacks.onlineJoinResult.team && player.slotIndex === callbacks.onlineJoinResult.slot);
      if (joined) { for (const player of this.players) player.isControlled = false; joined.isControlled = true; this.activePlayer = joined; }
    }
    const pauseButton = document.getElementById('pause'); if (pauseButton) pauseButton.hidden = Boolean(this.onlineBridge);

    this.ui = new UIManager(this.players, {
      isOnline: Boolean(this.onlineBridge),
      onToggleCamera: () => {
        const modes = ['player', 'broadcast', 'spectator'];
        const current = this.onlineBridge?.normalCameraMode || this.cam.mode;
        const next = modes[(Math.max(0, modes.indexOf(current)) + 1) % modes.length];
        if (this.onlineBridge) this.onlineBridge.setPreferredCameraMode(next);
        else this.cam.setMode(next);
        this.ui?.setCameraModeLabel?.(next);
        this.ui?.setStatus?.('CAMÉRA : ' + ({ player: 'JOUEUR', broadcast: 'DIFFUSION TV', spectator: 'SPECTATEUR' }[next]));
      },
      onTogglePause: () => this.togglePause(),
      onRotate: async (outgoingId, incomingId) => {
        try {
          const rotated = await this.onlineBridge?.rotatePlayers(outgoingId, incomingId);
          if (rotated) this.ui?.setStatus?.('REMPLACEMENT VALIDÉ PAR LE SERVEUR');
          return rotated;
        } catch (error) {
          this.ui?.setStatus?.(`REMPLACEMENT : ${String(error?.message || 'refusé').slice(0, 42)}`);
          throw error;
        }
      },
      onRequestEntry: async () => {
        try {
          const result = await this.onlineBridge?.requestEntry();
          if (result?.queued) this.ui?.setStatus?.('DEMANDE D’ENTRÉE ENREGISTRÉE');
        } catch (error) {
          this.ui?.setStatus?.(`ENTRÉE : ${String(error?.message || 'demande impossible').slice(0, 42)}`);
        }
      },
      onOpenStats: () => this.ui.renderStats(this.match),
      onDuration: (minutes) => {
        const changed = this.match.setDurationMinutes(minutes);
        this.ui.setStatus(changed === 'current-match' ? `DURÉE DU MATCH : ${minutes} MIN` : changed === 'next-match' ? `PROCHAIN MATCH : ${minutes} MIN` : 'DURÉE NON VALIDE');
      },
      onFormation: (f) => {
        this.ai.formation = f;
        this.ai.applyFormation(this.players, 'blue', f);
        this.ui.setStatus(`FORMATION ${f}`);
      },
      onMentality: (m) => {
        this.ai.mentality = m;
        this.ui.setStatus(`STYLE ${m.toUpperCase()}`);
      },
      onPressStyle: (ps) => {
        this.ai.pressStyle = ps;
        this.ui.setStatus(`BLOC ${ps.toUpperCase()}`);
      },
      onWeather: (w) => this.weather.setWeather(w),
      onQuality: (q) => this.sceneMgr.setQuality(q),
      onCameraMode: (mode) => { if (this.cam.setMode(mode)) { callbacks.onCameraMode?.(mode); this.ui.setStatus(`CAMÉRA : ${{player:'IMMERSION JOUEUR',touchline:'LIGNE DE TOUCHE',broadcast:'DIFFUSION TV',close:'RAPPROCHÉE',tactical:'TACTIQUE',spectator:'VUE SPECTATEUR'}[mode]}`); } },
      onCameraZoom: (value) => { const zoom = this.cam.setZoom(value); callbacks.onCameraZoom?.(zoom); this.ui.setStatus(`ZOOM CAMÉRA : ${zoom}%`); },
      getCameraMode: () => this.cam.mode,
      getCameraZoom: () => this.cam.zoom,
      onOverlayAction: () => this.handleOverlayAction(),
      getSubstitutionOptions: () => this.getSubstitutionOptions(),
      onSubstitute: (outgoingId, incomingId) => this.applySubstitution(outgoingId, incomingId),
      onExitMatch: () => callbacks.onExitMatch?.()
    });

    this.lastTime = 0;
    this.lastFrameAt = 0;
    this.fpsAccum = 0;
    this.fpsFrames = 0;
    this.currentFps = 60;
    this.audioCtx = null;
    this.running = false;
    this.rafId = 0;
    this._onVisibilityChange = () => {
      this.lastTime = performance.now();
      this.lastFrameAt = this.lastTime;
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    this.resetPositions();
  }

  playTone(freq, duration = 0.08, gainVal = 0.05) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!this.audioCtx) this.audioCtx = new AC();
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.value = gainVal;
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (_) {
      // Audio optionnel sur mobile
    }
  }

  resetPositions() {
    this.ball.reset(0, 0);
    for (const p of this.players) {
      p.pos.x = p.homePos.x;
      p.pos.z = p.homePos.z;
      p.vel.x = 0;
      p.vel.z = 0;
      p.facing = (this.ai.attackDirection[p.team] || (p.team === 'blue' ? 1 : -1)) > 0 ? Math.PI / 2 : -Math.PI / 2;
      p.animState = 'idle';
      p.animTimer = 0;
      p.tackleTimer = 0;
      p.callTimer = 0;
    }
    this.callForPassCooldown = 0;
    this.setControlledPlayer(this.activePlayer || this.players.find((p) => p.team === 'blue' && p.slotIndex === 4));
  }

  createPlayerMatchStats() { return { goals: 0, assists: 0, shots: 0, passes: 0, completedPasses: 0, tackles: 0, interceptions: 0 }; }

  setControlledPlayer(player) {
    if (!player || player.team !== 'blue') return;
    for (const p of this.players) p.isControlled = false;
    player.isControlled = true;
    this.activePlayer = player;
  }

  getSubstitutionOptions() {
    if (this.onlineBridge || this.match.phase !== 'paused' || this.substitutionsUsed.blue >= this.substitutionLimit) {
      return { pairs: [], used: this.substitutionsUsed.blue, limit: this.substitutionLimit };
    }
    const outgoing = this.players.filter(player => player.team === 'blue' && !player.isControlled);
    const pairs = outgoing.flatMap(player => this.benchPlayers.blue
      .filter(candidate => candidate.role === player.role)
      .map(candidate => ({ outgoing: player, incoming: candidate })));
    return { pairs, used: this.substitutionsUsed.blue, limit: this.substitutionLimit };
  }

  applySubstitution(outgoingId, incomingId) {
    const outgoing = this.players.find(player => player.id === outgoingId);
    const incomingIndex = this.benchPlayers.blue.findIndex(player => player.id === incomingId);
    const incoming = incomingIndex >= 0 ? this.benchPlayers.blue[incomingIndex] : null;
    const validation = validateSubstitution({
      phase: this.match.phase,
      online: Boolean(this.onlineBridge),
      outgoing,
      incoming,
      activePlayer: this.activePlayer,
      used: this.substitutionsUsed.blue,
      limit: this.substitutionLimit
    });
    if (!validation.ok) return validation;

    const replacement = new Player({
      id: incoming.id,
      team: 'blue',
      number: incoming.number,
      name: incoming.name,
      role: outgoing.role,
      specialty: incoming.specialty || incoming.archetype || 'balanced',
      slotIndex: outgoing.slotIndex,
      homePos: { ...outgoing.homePos },
      attributes: incoming.attributes || {
        pace: incoming.rating ?? 50, shooting: incoming.rating ?? 50,
        passing: incoming.rating ?? 50, defense: incoming.rating ?? 50,
        stamina: incoming.rating ?? 50, control: incoming.rating ?? 50
      },
      preferredFoot: incoming.preferredFoot || null,
      appearance: { ...(incoming.appearance || {}), ...(incoming.role === 'GK' ? (callbacks.homeGoalkeeperKitAppearance || callbacks.homeKitAppearance || {}) : (callbacks.homeKitAppearance || {})), ...(incoming.id === callbacks.careerPlayerId ? { shopCosmeticsEnabled:true } : {}) }
    });
    replacement.pos = { ...outgoing.pos };
    replacement.vel = { x: 0, z: 0 };
    replacement.facing = outgoing.facing;

    const playerIndex = this.players.indexOf(outgoing);
    if (playerIndex < 0) {
      replacement.visual.dispose();
      return { ok: false, code: 'outgoing-not-on-pitch', message: 'Joueur sortant introuvable.' };
    }
    this.sceneMgr.scene.remove(outgoing.visual.root);
    outgoing.visual.dispose();
    this.sceneMgr.scene.add(replacement.visual.root);
    this.players[playerIndex] = replacement;
    this.ui.replacePlayer(outgoing, replacement);

    if (this.ball.owner === outgoing) this.ball.owner = replacement;
    if (this.ball.lastTouchPlayer === outgoing) this.ball.lastTouchPlayer = replacement;

    this.benchPlayers.blue.splice(incomingIndex, 1);
    const attributes = { ...outgoing.attributes };
    const averageRating = Math.round(Object.values(attributes).reduce((sum, value) => sum + value, 0) / Math.max(1, Object.keys(attributes).length));
    this.benchPlayers.blue.push({
      id: outgoing.id, name: outgoing.name, role: outgoing.role, number: outgoing.number,
      attributes, rating: averageRating, specialty: outgoing.specialty,
      preferredFoot: outgoing.preferredFoot
    });
    this.substitutionsUsed.blue += 1;
    this.match.recordEvent('substitution', 'blue', `${outgoing.name} → ${replacement.name}`);
    return { ok: true, code: 'substitution-complete', message: `Remplacement : ${outgoing.name} sort, ${replacement.name} entre.` };
  }


  applyAISubstitution(team, pair) {
    if (!pair || pair.team !== team || !['blue', 'red'].includes(team)) return false;
    const { outgoing, incoming } = pair;
    const bench = this.benchPlayers[team];
    const incomingIndex = bench.findIndex(player => player.id === incoming.id);
    const playerIndex = this.players.indexOf(outgoing);
    if (incomingIndex < 0 || playerIndex < 0 || outgoing.isControlled || outgoing.team !== team || incoming.role !== outgoing.role) return false;
    const replacement = new Player({
      id: incoming.id, team, number: incoming.number, name: incoming.name, role: outgoing.role,
      specialty: incoming.specialty || incoming.archetype || 'balanced', slotIndex: outgoing.slotIndex,
      homePos: { ...outgoing.homePos },
      attributes: incoming.attributes || { pace: incoming.rating ?? 50, shooting: incoming.rating ?? 50, passing: incoming.rating ?? 50, defense: incoming.rating ?? 50, stamina: incoming.rating ?? 50, control: incoming.rating ?? 50 },
      preferredFoot: incoming.preferredFoot || null, appearance: { ...(incoming.appearance || {}), ...(team === 'blue'
        ? (incoming.role === 'GK' ? (callbacks.homeGoalkeeperKitAppearance || callbacks.homeKitAppearance || {}) : (callbacks.homeKitAppearance || {}))
        : (incoming.role === 'GK' ? (callbacks.awayGoalkeeperKitAppearance || callbacks.awayKitAppearance || {}) : (callbacks.awayKitAppearance || {}))), ...(incoming.id === callbacks.careerPlayerId ? { shopCosmeticsEnabled:true } : {}) }
    });
    replacement.pos = { ...outgoing.pos };
    replacement.vel = { x: 0, z: 0 };
    replacement.facing = outgoing.facing;
    this.sceneMgr.scene.remove(outgoing.visual.root);
    outgoing.visual.dispose();
    this.sceneMgr.scene.add(replacement.visual.root);
    this.players[playerIndex] = replacement;
    this.ui.replacePlayer(outgoing, replacement);
    if (this.ball.owner === outgoing) this.ball.owner = replacement;
    if (this.ball.lastTouchPlayer === outgoing) this.ball.lastTouchPlayer = replacement;
    bench.splice(incomingIndex, 1);
    const attributes = { ...outgoing.attributes };
    const values = Object.values(attributes);
    const averageRating = Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length));
    bench.push({ id: outgoing.id, name: outgoing.name, role: outgoing.role, number: outgoing.number, attributes, rating: averageRating, specialty: outgoing.specialty, preferredFoot: outgoing.preferredFoot });
    this.substitutionsUsed[team] += 1;
    this.match.recordEvent('substitution', team, `${outgoing.name} → ${replacement.name} (IA)`);
    return true;
  }

  processAISubstitutions(dt) {
    if (this.onlineBridge || this.match.phase !== 'playing') return;
    this.aiSubstitutionCheckTimer -= Math.max(0, dt);
    if (this.aiSubstitutionCheckTimer > 0) return;
    this.aiSubstitutionCheckTimer = 2.5;
    const totalDuration = Math.max(1, this.match.halfDuration * 2);
    const elapsedRatio = this.match.elapsedMatchTime / totalDuration;
    for (const team of ['blue', 'red']) {
      const pair = selectAISubstitution({
        team, players: this.players, bench: this.benchPlayers[team],
        used: this.substitutionsUsed[team], limit: this.substitutionLimit,
        elapsedRatio
      });
      if (pair && this.applyAISubstitution(team, pair)) {
        this.ui.setStatus(`REMPLACEMENT IA · ${team === 'blue' ? 'BLEUS' : 'ROUGES'} : ${pair.outgoing.name} → ${pair.incoming.name}`);
      }
    }
  }

  togglePause() {
    if (this.match.phase === 'playing') {
      this.match.phase = 'paused';
      this.ui.showPauseMenu(this.match, this.activePlayer);
    } else if (this.match.phase === 'paused') {
      this.match.phase = 'playing';
      this.ui.hideOverlay();
    }
  }

  swapEnds() {
    // Changement de côté réglementaire à la mi-temps, sans changer les équipes.
    this.ai.attackDirection.blue *= -1;
    this.ai.attackDirection.red *= -1;
    for (const p of this.players) p.homePos.x *= -1;
    this.ui.setStatus('CHANGEMENT DE CÔTÉ');
  }

  reportMatchEnd() {
    if (this.matchResultReported || this.match.phase !== 'fulltime') return false;
    const result = this.match.getResult();
    if (!result) return false;
    this.matchResultReported = true;
    this.onMatchEnd?.({ ...result, stats: structuredClone(this.match.stats), playerStats: { ...this.playerMatchStats, cleanSheet: result.redScore === 0, minutesPlayedMs: Math.round(Math.max(0, this.match.elapsedMatchTime) * 1000) } });
    return true;
  }

  handleOverlayAction() {
    if (this.onlineBridge && this.match.phase === 'fulltime') { this.onExitMatch?.(); return; }
    if (this.onlineBridge && this.match.phase === 'halftime') { this.ui.hideOverlay(); return; }
    if (this.match.phase === 'paused') {
      this.match.phase = 'playing';
      this.ui.hideOverlay();
    } else if (this.match.phase === 'halftime') {
      this.match.startSecondHalf();
      this.swapEnds();
      this.resetPositions();
      this.ui.hideOverlay();
      this.ui.setStatus('2E PÉRIODE — COUP D\'ENVOI');
      this.playTone(760, 0.22);
    } else if (this.match.phase === 'fulltime') {
      this.match.reset();
      this.playerMatchStats = this.createPlayerMatchStats();
      this.pendingControlledPass = null;
      this.matchResultReported = false;
      this.resetPositions();
      this.ui.hideOverlay();
      this.ui.setStatus('NOUVEAU MATCH');
      this.playTone(760, 0.22);
    }
  }

  findPassTarget(passer) {
    const fx = Math.sin(passer.facing);
    const fz = Math.cos(passer.facing);
    let best = null;
    let bestScore = -Infinity;

    for (const mate of this.players) {
      if (mate.team !== passer.team || mate === passer) continue;
      const dx = mate.pos.x - passer.pos.x;
      const dz = mate.pos.z - passer.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.5 || dist > 38) continue;

      const dot = (dx / dist) * fx + (dz / dist) * fz;
      const attackDir = this.ai.attackDirection[passer.team] || (passer.team === 'blue' ? 1 : -1);
      const forwardBonus = dx * attackDir * 0.04;
      const score = dot * 2.2 - dist * 0.03 + forwardBonus;
      if (score > bestScore) {
        bestScore = score;
        best = mate;
      }
    }
    return best;
  }

  nearestOpponentPressure(player) {
    let nearest = 20;
    for (const other of this.players) {
      if (other.team === player.team) continue;
      nearest = Math.min(nearest, Math.hypot(other.pos.x - player.pos.x, other.pos.z - player.pos.z));
    }
    return Math.max(0, Math.min(1, (5 - nearest) / 5));
  }

  executePass(passer, lofted = false, preferredTarget = null) {
    if (this.ball.owner !== passer) return false;
    const target = preferredTarget && preferredTarget.team === passer.team && preferredTarget !== passer
      ? preferredTarget : this.findPassTarget(passer);
    let vx, vz;
    if (target) {
      const leadX = target.pos.x + target.vel.x * 0.25;
      const leadZ = target.pos.z + target.vel.z * 0.25;
      const dx = leadX - this.ball.pos.x;
      const dz = leadZ - this.ball.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const speed = Math.min(24, Math.max(12.5, d * 1.15));
      const foot = strikeFoot(passer, this.ball);
      const accuracy = skillAccuracy(passer, 'passing', this.nearestOpponentPressure(passer), foot) * dominantFootFactor(passer, foot);
      const sideError = (1 - accuracy) * (passer.number % 2 ? 1 : -1) * 0.9;
      vx = (dx / d) * speed + (-dz / d) * sideError;
      vz = (dz / d) * speed + (dx / d) * sideError;
      passer.facing = Math.atan2(dx, dz);
    } else {
      const speed = 15.5;
      vx = Math.sin(passer.facing) * speed;
      vz = Math.cos(passer.facing) * speed;
    }

    const vy = lofted ? 8.2 : 0.8;
    this.ball.kick(vx, vy, vz, passer);
    passer.actionCooldown = 0.28;
    passer.triggerAnim('pass', 0.28);
    this.match.stats[passer.team].passes++;
    if (passer.isControlled) {
      this.playerMatchStats.passes++;
      this.pendingControlledPass = target ? { passer, target, remaining: 4.5 } : null;
    }
    this.match.recordEvent('pass', passer.team, passer.name);
    this.playTone(230, 0.07);

    // Changement automatique vers le coéquipier receveur
    // Football RP : une passe ne transfère jamais le contrôle humain au receveur.
    return true;
  }

  executeShoot(shooter, power = 0.9) {
    if (this.ball.owner !== shooter) return false;
    const attackDir = this.ai.attackDirection[shooter.team] || (shooter.team === 'blue' ? 1 : -1);
    const targetX = attackDir * PITCH.HALF_L;
    let aimZ;
    if (shooter.isControlled) {
      const input = this.controls.getMoveVector();
      const aim = input.mag > 0.18 ? input : { x: Math.sin(shooter.facing), z: Math.cos(shooter.facing) };
      const forwardX = attackDir > 0 ? Math.max(0.2, aim.x) : Math.min(-0.2, aim.x);
      const projected = shooter.pos.z + (aim.z / Math.abs(forwardX)) * Math.abs(targetX - shooter.pos.x);
      aimZ = Math.max(-PITCH.GOAL_W * 0.42, Math.min(PITCH.GOAL_W * 0.42, projected * 0.28 + shooter.pos.z * 0.72));
    } else {
      aimZ = Math.max(-PITCH.GOAL_W * 0.36, Math.min(PITCH.GOAL_W * 0.36, shooter.pos.z * 0.25 + (Math.random() - 0.5) * 2.2));
    }

    const dx = targetX - this.ball.pos.x;
    const dz = aimZ - this.ball.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const foot = strikeFoot(shooter, this.ball);
    const shootingAccuracy = skillAccuracy(shooter, 'shooting', this.nearestOpponentPressure(shooter), foot) * dominantFootFactor(shooter, foot);
    const aimError = (1 - shootingAccuracy) * (shooter.number % 2 ? 1 : -1) * 2.4;
    aimZ = Math.max(-PITCH.GOAL_W * 0.6, Math.min(PITCH.GOAL_W * 0.6, aimZ + aimError));
    const spd = 22 + power * 10;
    const vy = 3.2 + power * 3.8;

    const curveSide = shooter.isControlled ? Math.max(-1, Math.min(1, this.controls.getMoveVector().x * attackDir)) : (shooter.number % 2 ? 0.35 : -0.35);
    const spin = shotSpin(shooter, foot, power, curveSide);
    this.ball.kick((dx / d) * spd, vy, (dz / d) * spd, shooter, spin);
    shooter.facing = Math.atan2(dx, dz);
    shooter.actionCooldown = 0.34;
    shooter.triggerAnim('shoot', 0.34);

    this.match.stats[shooter.team].shots++;
    if (shooter.isControlled) this.playerMatchStats.shots++;
    this.match.recordEvent('shot', shooter.team, shooter.name);
    if (Math.abs(aimZ) <= PITCH.GOAL_W * 0.48) {
      this.match.stats[shooter.team].onTarget++;
    }
    this.playTone(170, 0.11, 0.08);
    return true;
  }

  pressBallCarrier(player) {
    if (!player || this.ball.owner?.team === player.team) return false;
    const carrier = this.ball.owner;
    const target = carrier && carrier.team !== player.team
      ? carrier
      : this.players.filter((p) => p.team !== player.team && p.role !== 'GK')
          .sort((a, b) => Math.hypot(a.pos.x - this.ball.pos.x, a.pos.z - this.ball.pos.z) - Math.hypot(b.pos.x - this.ball.pos.x, b.pos.z - this.ball.pos.z))[0];
    if (!target) return false;
    const dx = target.pos.x - player.pos.x;
    const dz = target.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    player.facing = Math.atan2(dx, dz);
    // Pression courte et contrôlée : rapproche l'avatar sans voler le contrôle.
    if (d > 1.45) {
      player.vel.x = (dx / d) * 7.2;
      player.vel.z = (dz / d) * 7.2;
      player.actionCooldown = 0.24;
      player.triggerAnim('run', 0.28);
    } else {
      this.tryTackle(player);
    }
    return true;
  }

  tryGoalkeeperDive(player) {
    if (!player || player.role !== 'GK' || player.actionCooldown > 0) return false;
    const dx = this.ball.pos.x - player.pos.x;
    const dz = this.ball.pos.z - player.pos.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 9 || this.ball.owner?.team === player.team) return false;
    player.facing = Math.atan2(dx, dz);
    player.diveDir = Math.sign(dz) || 1;
    player.triggerAnim('dive', 0.58, player.diveDir);
    player.actionCooldown = 0.62;
    const reach = Math.min(1, 7 / Math.max(1, distance));
    player.vel.x = (dx / Math.max(1, distance)) * 8.5 * reach;
    player.vel.z = (dz / Math.max(1, distance)) * 8.5 * reach;
    const ballSpeed = Math.hypot(this.ball.vel.x, this.ball.vel.y, this.ball.vel.z);
    const saveReach = goalkeeperSaveReach(distance, player, ballSpeed);
    const approaching = (this.ball.vel.x * dx + this.ball.vel.z * dz) < 0;
    if (distance < saveReach && this.ball.vel.y < 5.5 && (approaching || ballSpeed < 2.2)) {
      this.ball.owner = player;
      this.ball.lastTouchTeam = player.team;
      this.ball.lastTouchPlayer = player;
      this.ball.vel.x = 0; this.ball.vel.y = 0; this.ball.vel.z = 0;
      this.ui.setStatus('ARRÊT DU GARDIEN');
      this.playTone(420, 0.09);
    }
    return true;
  }

  tryTackle(player) {
    if (player.tackleTimer > 0 || player.actionCooldown > 0) return;
    // Ne jamais arracher le ballon à un partenaire : le tacle vise un adversaire ou un ballon libre.
    if (this.ball.owner?.team === player.team) return;

    // Détection simple d'une faute : contact de tacle par derrière sur un porteur.
    const victim = this.players.find((other) => {
      if (other.team === player.team || this.ball.owner !== other) return false;
      const dist = Math.hypot(player.pos.x - other.pos.x, player.pos.z - other.pos.z);
      const closingSpeed = Math.hypot(player.vel.x - other.vel.x, player.vel.z - other.vel.z);
      return classifyTackle({ tackler: player, victim: other, distance: dist, closingSpeed }).foul;
    });
    if (victim) {
      player.actionCooldown = 0.8;
      player.triggerAnim('tackle', 0.36);
      this.match.stats[player.team].fouls++;
      this.match.recordEvent('foul', player.team, player.name);
      this.ui.setStatus(`FAUTE — COUP FRANC ${victim.team === 'blue' ? 'BLEU' : 'ROUGE'}`);
      this.playTone(540, 0.16);
      this.handleBallEvent({ type: 'freekick', team: victim.team, foulingTeam: player.team, x: victim.pos.x, z: victim.pos.z });
      return;
    }

    player.tackleTimer = 0.32;
    player.actionCooldown = 0.55;
    player.triggerAnim('tackle', 0.36);

    const fx = Math.sin(player.facing);
    const fz = Math.cos(player.facing);
    player.vel.x = fx * 11.5;
    player.vel.z = fz * 11.5;

    const distBall = Math.hypot(this.ball.pos.x - player.pos.x, this.ball.pos.z - player.pos.z);
    const opponentCarrier = this.ball.owner && this.ball.owner.team !== player.team ? this.ball.owner : null;
    const closingSpeed = opponentCarrier ? Math.hypot(player.vel.x - opponentCarrier.vel.x, player.vel.z - opponentCarrier.vel.z) : 0;
    const duelScore = opponentCarrier ? tackleControlScore(player, opponentCarrier, distBall, closingSpeed) : 0.62;
    const recoveryReach = 1.28 + duelScore * 0.72;
    if (distBall < recoveryReach && (!opponentCarrier || duelScore >= 0.48)) {
      this.ball.owner = player;
      this.ball.lastTouchTeam = player.team;
      this.ball.lastTouchPlayer = player;
      this.ball.vel.set(player.vel.x * 0.22, 0, player.vel.z * 0.22);
      this.match.stats[player.team].tackles++;
      if (player.isControlled) this.playerMatchStats.tackles++;
      this.match.recordEvent('tackle', player.team, player.name);
      this.ui.setStatus(`TACLE RÉUSSI (${player.name})`);
      this.playTone(300, 0.07);
    } else if (opponentCarrier && distBall < 2.15) {
      // Un tacle manqué peut dévier le ballon, sans attribuer automatiquement la possession.
      const dx = this.ball.pos.x - player.pos.x;
      const dz = this.ball.pos.z - player.pos.z;
      const length = Math.hypot(dx, dz) || 1;
      this.ball.owner = null;
      this.ball.vel.x += (dx / length) * (1.8 + duelScore * 2.2);
      this.ball.vel.z += (dz / length) * (1.8 + duelScore * 2.2);
      this.ball.vel.y = Math.max(this.ball.vel.y, 0.45);
    }
  }

  updateControlledPlayer(dt) {
    // Football RP : l'utilisateur conserve toujours le contrôle de son propre avatar.
    const p = this.activePlayer;
    if (!p) return;

    if (p.actionCooldown > 0) p.actionCooldown = Math.max(0, p.actionCooldown - dt);
    this.callForPassCooldown = Math.max(0, this.callForPassCooldown - dt);
    p.callTimer = Math.max(0, (p.callTimer || 0) - dt);
    if (p.tackleTimer > 0) {
      p.tackleTimer = Math.max(0, p.tackleTimer - dt);
      p.pos.x += p.vel.x * dt;
      p.pos.z += p.vel.z * dt;
      p.vel.x *= Math.pow(0.15, dt);
      p.vel.z *= Math.pow(0.15, dt);
      return;
    }

    this.controls.setRole(p.role);
    const mv = this.controls.getMoveVector();
    const sprinting = this.controls.isSprinting() && p.stamina > 0.08 && mv.mag > 0.15;

    updateStamina(p, dt, { sprinting, effort: this.ball.owner === p ? 1.08 : 1, endurance: p.attributes?.stamina ?? 50 });
    const staminaFactor = staminaSpeedFactor(p.stamina);
    const paceValue = Math.max(1, Math.min(99, Number(p.attributes?.pace) || 50));
    const paceFactor = 0.82 + paceValue / 100 * 0.36;
    const baseSpeed = (this.ball.owner === p ? 8.1 : 8.8) * staminaFactor * paceFactor;
    const maxSpeed = sprinting ? baseSpeed * 1.32 : baseSpeed;

    if (mv.mag > 0.08) {
      const tx = mv.x * maxSpeed;
      const tz = mv.z * maxSpeed;
      p.vel.x += (tx - p.vel.x) * Math.min(1, dt * 12);
      p.vel.z += (tz - p.vel.z) * Math.min(1, dt * 12);
      p.facing = Math.atan2(mv.x, mv.z);
    } else {
      p.vel.x *= Math.pow(0.02, dt);
      p.vel.z *= Math.pow(0.02, dt);
    }

    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;

    // Actions tactiles / clavier
    const passReq = this.controls.consumePass();
    const pressReq = this.controls.consumePress();
    const shootReq = this.controls.consumeShoot();
    const lobReq = this.controls.consumeLob();
    const callReq = this.controls.consumeCallForPass();
    if (callReq && this.callForPassCooldown <= 0 && this.ball.owner !== p) {
      p.callTimer = 3.2;
      this.callForPassCooldown = 4.5;
      this.ui.setStatus('APPEL DE BALLE — DEMANDE TRANSMISE');
    }

    if (this.ball.owner === p) {
      if (shootReq) this.executeShoot(p, shootReq.power);
      else if (lobReq) this.executePass(p, true);
      else if (passReq) this.executePass(p, false);
    } else {
      // B déclenche une pression vers le porteur adverse ; A reste le tacle.
      if (pressReq) this.pressBallCarrier(p);
      if (shootReq) { if (p.role === 'GK') this.tryGoalkeeperDive(p); else this.tryTackle(p); }
      if (lobReq && p.role === 'GK') this.tryGoalkeeperDive(p);
    }
  }

  handleBallEvent(ev) {
    if (!ev) return;

    if (ev.type === 'goal') {
      this.field.triggerGoal();
      this.match.recordGoal(ev.scoringTeam);
      if (ev.scoringTeam === 'blue' && this.ball.lastTouchPlayer === this.activePlayer) this.playerMatchStats.goals++;
      const label = ev.scoringTeam === 'blue' ? 'BUT POUR LES BLEUS !' : 'BUT POUR LES ROUGES !';
      this.ui.setStatus(label);
      this.playTone(880, 0.28, 0.08);
      for (const p of this.players) {
        if (p.team === ev.scoringTeam) p.triggerAnim('celebrate', 2.0);
      }
      return;
    }

    if (ev.type === 'throwin' || ev.type === 'corner' || ev.type === 'goalkick' || ev.type === 'freekick') {
      if (ev.type === 'throwin') this.match.stats[ev.team].throwIns++;
      if (ev.type === 'corner') this.match.stats[ev.team].corners++;
      if (ev.type === 'goalkick') this.match.stats[ev.team].goalKicks++;
      this.match.recordEvent(ev.type, ev.team, ev.foulingTeam || '');
      const labelMap = { throwin: 'TOUCHE', corner: 'CORNER', goalkick: 'SIX MÈTRES', freekick: 'COUP FRANC' };
      this.ui.setStatus(`${labelMap[ev.type]} — ${ev.team === 'blue' ? 'BLEU' : 'ROUGE'}`);
      this.ball.reset(ev.x, ev.z);

      // Sélection du bot qui exécute la reprise ; le contrôle humain reste attaché à son avatar.
      let taker = null;
      let bestDist = Infinity;
      for (const p of this.players) {
        if (p.team !== ev.team) continue;
        if (ev.type === 'goalkick' && p.role === 'GK') { taker = p; break; }
        if (ev.type !== 'goalkick' && p.role === 'GK') continue;
        const d = Math.hypot(p.pos.x - ev.x, p.pos.z - ev.z);
        if (d < bestDist) { bestDist = d; taker = p; }
      }
      if (taker) {
        taker.pos.x = ev.x;
        taker.pos.z = ev.z;
        this.ball.owner = taker;
        this.ball.lastTouchTeam = taker.team;
      }
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.lastFrameAt = this.lastTime;
    this.ui.setStatus('COUP D\'ENVOI — BON MATCH !');
    const tick = (now) => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(tick);
      const targetFps = this.sceneMgr.targetFps || 30;
      const frameInterval = 1000 / targetFps;
      if (now - this.lastFrameAt < frameInterval - 0.5) return;
      this.lastFrameAt = now;
      const rawDt = (now - this.lastTime) / 1000;
      // Temps réel pour le règlement du match : le plafond de physique ne doit
      // jamais rallonger artificiellement un match lorsque le GPU ralentit.
      const clockDt = Math.max(0, Number.isFinite(rawDt) ? rawDt : 0);
      // Delta physique plafonné pour éviter les téléportations après une frame lente.
      const dt = Math.min(1 / 30, clockDt);
      this.lastTime = now;

      this.fpsAccum += dt;
      this.fpsFrames++;
      if (this.fpsAccum >= 0.5) {
        this.currentFps = Math.round(this.fpsFrames / this.fpsAccum);
        this.fpsAccum = 0;
        this.fpsFrames = 0;
      }

      if (this.onlineBridge) {
        this.onlineBridge.update(now).catch(() => {});
        for (const p of this.players) p.updateVisual(dt);
        if (this.match.phase === 'halftime' && !this.onlineHalftimeShown) {
          this.onlineHalftimeShown = true;
          this.ui.showOverlay('Mi-temps', `Score : BLEU ${this.match.blueScore} – ${this.match.redScore} ROUGE\nReprise automatique dans quelques secondes.`, 'CONTINUER');
        } else if (this.match.phase === 'playing' && this.onlineHalftimeShown) {
          this.onlineHalftimeShown = false;
          this.ui.hideOverlay();
          this.ui.setStatus('2E PÉRIODE — COUP D’ENVOI');
        }
        if (this.match.phase === 'fulltime' && !this.matchResultReported) {
          this.reportMatchEnd();
          this.ui.showOverlay('Fin du match', `Score final : ${this.match.blueScore} – ${this.match.redScore}`, 'RETOUR');
        }
      } else if (this.match.phase === 'goal') {
        this.match.phaseTimer -= dt;
        for (const p of this.players) p.updateVisual(dt);
        const goalPeriodEnd = this.match.stepClock(clockDt, this.ball.owner?.team || this.ball.lastTouchTeam);
        if (goalPeriodEnd === 'halftime') {
          this.playTone(700, 0.25);
          this.ui.showOverlay(
            'Mi-temps',
            `Score actuel : BLEU ${this.match.blueScore} – ${this.match.redScore} ROUGE`,
            '2E PÉRIODE'
          );
        } else if (goalPeriodEnd === 'fulltime') {
          this.reportMatchEnd();
          this.playTone(620, 0.35);
          const pos = this.match.getPossessionPercent();
          const verdict = this.match.blueScore > this.match.redScore
            ? "Victoire de l'équipe Bleue !"
            : this.match.blueScore < this.match.redScore
              ? "Victoire de l'équipe Rouge !"
              : 'Match nul !';
          this.ui.showOverlay(
            'Fin du match',
            `${verdict}\nScore final : ${this.match.blueScore} – ${this.match.redScore}\nPossession : ${pos.blue}% – ${pos.red}%`,
            'REJOUER'
          );
        } else if (this.match.phase === 'goal' && this.match.phaseTimer <= 0) {
          this.match.phase = 'playing';
          this.resetPositions();
          this.ui.setStatus('REPRISE DU JEU');
        }
      } else if (this.match.phase === 'playing') {
        this.updateControlledPlayer(dt);
        this.ai.update(this.players, this.ball, dt, {
          aiPass: (p, target) => this.executePass(p, false, target),
          aiShoot: (p) => this.executeShoot(p, 0.82),
          tryTackle: (p) => this.tryTackle(p),
          requestedReceiver: this.activePlayer?.callTimer > 0 ? this.activePlayer : null
        });
        this.processAISubstitutions(dt);

        this.physics.resolvePlayerCollisions(this.players);

        const ballEvent = this.physics.stepBall(
          this.ball,
          this.players,
          dt,
          this.weather.rainFrictionFactor,
          {
            attackDirection: this.ai.attackDirection,
            onBounce: () => this.playTone(120, 0.04, 0.025),
            onPostHit: () => { this.ui.setStatus('POTEAU !'); this.playTone(520, 0.14); },
            onSave: (gk) => { this.match.stats[gk.team].saves++; this.ui.setStatus(`ARRÊT DE ${gk.name} !`); },
            onInterception: (p) => {
              this.match.stats[p.team].interceptions++;
              if (p.isControlled) this.playerMatchStats.interceptions++;
              this.match.recordEvent('interception', p.team, p.name);
            }
          }
        );

        // Une passe contrôlée n'est validée que si le coéquipier ciblé reçoit réellement le ballon.
        if (this.pendingControlledPass) {
          this.pendingControlledPass.remaining -= dt;
          if (this.ball.owner === this.pendingControlledPass.target) {
            this.playerMatchStats.completedPasses++;
            this.pendingControlledPass = null;
          } else if (this.ball.owner && this.ball.owner.team !== this.pendingControlledPass.passer.team || this.pendingControlledPass.remaining <= 0) {
            this.pendingControlledPass = null;
          }
        }

        // La possession d'un coéquipier IA ne change jamais l'avatar contrôlé par l'humain.
        this.handleBallEvent(ballEvent);

        for (const p of this.players) p.updateVisual(dt);

        const posTeam = this.ball.owner ? this.ball.owner.team : this.ball.lastTouchTeam;
        const endEvt = this.match.stepClock(clockDt, posTeam);
        if (endEvt === 'halftime') {
          this.playTone(700, 0.25);
          this.ui.showOverlay(
            'Mi-temps',
            `Score actuel : BLEU ${this.match.blueScore} – ${this.match.redScore} ROUGE`,
            '2E PÉRIODE'
          );
        } else if (endEvt === 'fulltime') {
          this.reportMatchEnd();
          this.playTone(620, 0.35);
          const pos = this.match.getPossessionPercent();
          const verdict = this.match.blueScore > this.match.redScore
            ? 'Victoire de l\'équipe Bleue !'
            : this.match.blueScore < this.match.redScore
              ? 'Victoire de l\'équipe Rouge !'
              : 'Match nul !';
          this.ui.showOverlay(
            'Fin du match',
            `${verdict}\nScore final : ${this.match.blueScore} – ${this.match.redScore}\nPossession : ${pos.blue}% – ${pos.red}%`,
            'REJOUER'
          );
        }
      }

      this.field.update(dt);
      this.weather.update(dt, this.ball.pos.x);
      this.controls.setRole(this.activePlayer?.role);
      this.cam.update(this.ball, this.activePlayer, dt);
      this.sceneMgr.render();
      this.ui.updateHUD(this.match, this.activePlayer, this.currentFps, this.ball);
      if (!this.ui.statsPanel.classList.contains('hidden')) this.ui.renderStats(this.match);
      if ((this.fpsFrames % 2) === 0) this.ui.updateMinimapAndLabels(this.players, this.ball, this.sceneMgr.camera);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  dispose() {
    this.running = false;
    this.onlineBridge?.dispose();
    if (this.rafId) cancelAnimationFrame(this.rafId);
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
    this.controls?.dispose?.();
    this.ui?.dispose?.();
    this.weather?.dispose?.();
    this.sceneMgr?.dispose?.();
    if (this.audioCtx && this.audioCtx.state !== 'closed') this.audioCtx.close().catch(() => {});
  }
}