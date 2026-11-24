const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const FIELD = Object.freeze({ halfLength: 28, halfWidth: 17, goalHalfWidth: 3.3, goalHeight: 2.4, ballRadius: 0.36, playerRadius: 0.62 });

function resetBall(room, x = 0, z = 0) {
  room.ball = { x, y: FIELD.ballRadius, z, vx: 0, vy: 0, vz: 0, ownerId: null, lastTouchTeam: null };
}

function kick(room, player, action) {
  const b = room.ball;
  const forwardX = Math.sin(player.facing);
  const forwardZ = Math.cos(player.facing);
  const speed = action === 'shoot' ? 19 : 11;
  b.ownerId = null;
  // Preserve the previous teammate touch as the potential assist while the current carrier shoots/passes.
  b.lastTouchPlayerId = player.id;
  b.lastTouchTeam = player.team;
  if (action === 'shoot') { b.lastShotPlayerId = player.id; b.lastShotTeam = player.team; b.lastShotAt = room.elapsedMs; }
  b.vx = forwardX * speed;
  b.vz = forwardZ * speed;
  b.vy = action === 'shoot' ? 2.5 : 0.45;
}

export function applyPlayerAction(room, player, action, now) {
  if (!player || !['pass', 'shoot', 'tackle'].includes(action) || !Number.isFinite(now)) return false;
  const lastActionAt = Number.isFinite(player.lastActionAt) ? player.lastActionAt : null;
  if (lastActionAt !== null && (now < lastActionAt || now - lastActionAt < 280)) return false;

  // Validate the football situation before consuming the action cooldown.
  // A failed attempt must not block the next legitimate pass, shot or tackle.
  if (action === 'tackle') {
    const owner = room.players.get(room.ball.ownerId);
    if (!owner || owner.team === player.team) return false;
    const distance = Math.hypot(owner.x - player.x, owner.z - player.z);
    if (distance > 1.75) return false;
    const fx = Math.sin(player.facing), fz = Math.cos(player.facing);
    const dx = owner.x - player.x, dz = owner.z - player.z;
    const facing = distance > 0.001 ? (fx * dx + fz * dz) / distance : 1;
    if (facing < -0.25) return false;
    player.lastActionAt = now;
    room.ball.ownerId = player.id;
    room.ball.lastTouchTeam = player.team;
    room.events.push({ type: 'tackle', team: player.team, playerId: player.id, at: room.elapsedMs });
    return true;
  }
  if (room.ball.ownerId !== player.id) return false;
  player.lastActionAt = now;
  kick(room, player, action);
  room.events.push({ type: action, team: player.team, playerId: player.id, at: room.elapsedMs });
  return true;
}

export function stepRoomSimulation(room, dt) {
  const safeDt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.05);
  // Après un but, conserver un court arrêt de jeu : les joueurs et le ballon
  // restent figés pendant la célébration avant la reprise automatique.
  if (room.goalPauseMs > 0) {
    const wasPaused = room.goalPauseMs > 0;
    room.goalPauseMs = Math.max(0, room.goalPauseMs - safeDt * 1000);
    for (const player of room.players.values()) {
      player.input = { x: 0, z: 0, sprint: false };
      player.vx = 0; player.vz = 0;
    }
    room.ball.vx = 0; room.ball.vy = 0; room.ball.vz = 0;
    if (wasPaused && room.goalPauseMs === 0) {
      // Replacer les deux équipes pour une reprise lisible au rond central.
      for (const player of room.players.values()) {
        const sign = player.team === 'blue' ? -1 : 1;
        const lane = (Number.isInteger(player.slot) ? player.slot : 2) - 2;
        player.x = sign * (14 + Math.max(0, 2 - Math.abs(lane)) * 1.2);
        player.z = lane * 4.2;
        player.facing = player.team === 'blue' ? Math.PI / 2 : -Math.PI / 2;
      }
      resetBall(room);
    }
    return;
  }
  const players = [...room.players.values()].filter(p => p.isOnPitch !== false && (p.connected || p.aiControlled));
  for (const p of players) {
    const speed = p.aiControlled ? 4.6 : (p.input.sprint ? 7.2 : 5.2);
    p.vx = p.input.x * speed;
    p.vz = p.input.z * speed;
    p.x = clamp(p.x + p.vx * safeDt, -27.2, 27.2);
    p.z = clamp(p.z + p.vz * safeDt, -16.2, 16.2);
    if (Math.hypot(p.vx, p.vz) > 0.05) p.facing = Math.atan2(p.vx, p.vz);
  }
  for (let i = 0; i < players.length; i++) for (let j = i + 1; j < players.length; j++) {
    const a = players[i], b = players[j];
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    const min = FIELD.playerRadius * 2;
    if (d > 0.001 && d < min) {
      const push = (min - d) * 0.5 / d;
      a.x -= dx * push; a.z -= dz * push;
      b.x += dx * push; b.z += dz * push;
      // Separation must not push either avatar beyond the playable surface.
      a.x = clamp(a.x, -27.2, 27.2); a.z = clamp(a.z, -16.2, 16.2);
      b.x = clamp(b.x, -27.2, 27.2); b.z = clamp(b.z, -16.2, 16.2);
    }
  }

  const ball = room.ball;
  const owner = ball.ownerId ? room.players.get(ball.ownerId) : null;
  if (owner && owner.isOnPitch !== false && (owner.connected || owner.aiControlled)) {
    const lead = 0.92;
    ball.x = owner.x + Math.sin(owner.facing) * lead;
    ball.z = owner.z + Math.cos(owner.facing) * lead;
    ball.y = FIELD.ballRadius;
    ball.vx = owner.vx; ball.vy = 0; ball.vz = owner.vz;
  } else {
    ball.ownerId = null;
    ball.vy -= 24 * safeDt;
    ball.x += ball.vx * safeDt;
    ball.y += ball.vy * safeDt;
    ball.z += ball.vz * safeDt;
    if (ball.y <= FIELD.ballRadius) {
      ball.y = FIELD.ballRadius;
      if (ball.vy < -2) ball.vy = -ball.vy * 0.48; else ball.vy = 0;
      const drag = Math.pow(0.22, safeDt);
      ball.vx *= drag; ball.vz *= drag;
    } else {
      const drag = Math.pow(0.84, safeDt);
      ball.vx *= drag; ball.vz *= drag;
    }
    if (Math.abs(ball.x) > FIELD.halfLength && Math.abs(ball.z) < FIELD.goalHalfWidth && ball.y < FIELD.goalHeight) {
      const scorer = ball.x > 0 ? (room.attackDirection?.blue === 1 ? 'blue' : 'red') : (room.attackDirection?.red === -1 ? 'red' : 'blue');
      room.score[scorer]++;
      const scorerPlayer = room.players.get(ball.lastTouchPlayerId);
      if (scorerPlayer && scorerPlayer.team === scorer) { scorerPlayer.stats ||= {}; scorerPlayer.stats.goals = (scorerPlayer.stats.goals || 0) + 1; }
      const assistPlayer = room.players.get(ball.previousTouchPlayerId);
      const assistAge = room.elapsedMs - (Number.isFinite(ball.previousTouchAt) ? ball.previousTouchAt : -Infinity);
      if (assistPlayer && assistPlayer.team === scorer && assistPlayer.id !== ball.lastTouchPlayerId && assistAge >= 0 && assistAge <= 12_000) { assistPlayer.stats ||= {}; assistPlayer.stats.assists = (assistPlayer.stats.assists || 0) + 1; }
      const creditedAssist = assistPlayer && assistPlayer.team === scorer && assistPlayer.id !== ball.lastTouchPlayerId && assistAge >= 0 && assistAge <= 12_000 ? assistPlayer : null;
      room.events.push({ type: 'goal', team: scorer, playerId: scorerPlayer?.id || null, assistPlayerId: creditedAssist?.id || null, score: { ...room.score }, at: room.elapsedMs });
      resetBall(room);
      room.goalPauseMs = 1800;
    } else if (Math.abs(ball.x) > FIELD.halfLength + 1 || Math.abs(ball.z) > FIELD.halfWidth + 1) {
      resetBall(room);
    } else if (ball.y < 1.5) {
      let nearest = null, nearestDistance = Infinity;
      for (const p of players) {
        const d = Math.hypot(ball.x - p.x, ball.z - p.z);
        const reach = p.role === 'GK' ? 1.25 : 0.95;
        if (d < reach && d < nearestDistance && Math.hypot(ball.vx, ball.vz) < (p.role === 'GK' ? 14 : 11)) { nearest = p; nearestDistance = d; }
      }
      if (nearest) {
        const opposingShot = ball.lastShotTeam && ball.lastShotTeam !== nearest.team && room.elapsedMs - (ball.lastShotAt || 0) <= 8_000;
        const opponentLastTouch = ball.lastTouchTeam && ball.lastTouchTeam !== nearest.team;
        if (opponentLastTouch && nearest.role !== 'GK') {
          nearest.stats ||= {}; nearest.stats.interceptions = (nearest.stats.interceptions || 0) + 1;
          room.events.push({ type: 'interception', team: nearest.team, playerId: nearest.id, at: room.elapsedMs });
        }
        if (opposingShot && nearest.role === 'GK') {
          nearest.stats ||= {}; nearest.stats.saves = (nearest.stats.saves || 0) + 1;
          room.events.push({ type: 'save', team: nearest.team, playerId: nearest.id, shooterId: ball.lastShotPlayerId || null, at: room.elapsedMs });
          ball.lastShotPlayerId = null; ball.lastShotTeam = null; ball.lastShotAt = null;
        }
        ball.ownerId = nearest.id;
        ball.previousTouchPlayerId = ball.lastTouchPlayerId || null;
        ball.previousTouchTeam = ball.lastTouchTeam || null;
        ball.previousTouchAt = room.elapsedMs;
        ball.lastTouchPlayerId = nearest.id;
        ball.lastTouchTeam = nearest.team;
        ball.vx *= 0.2; ball.vy = 0; ball.vz *= 0.2;
        room.events.push({ type: 'possession', team: nearest.team, playerId: nearest.id, at: room.elapsedMs });
      }
    }
  }
  if (room.events.length > 40) room.events.splice(0, room.events.length - 40);
}

export function resetRoomBall(room) { resetBall(room); }
