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
  b.lastTouchTeam = player.team;
  b.vx = forwardX * speed;
  b.vz = forwardZ * speed;
  b.vy = action === 'shoot' ? 2.5 : 0.45;
}

export function applyPlayerAction(room, player, action, now) {
  if (!['pass', 'shoot', 'tackle'].includes(action)) return false;
  if (now - (player.lastActionAt || 0) < 280) return false;
  player.lastActionAt = now;
  if (action === 'tackle') {
    const owner = room.players.get(room.ball.ownerId);
    if (!owner || owner.team === player.team) return false;
    const distance = Math.hypot(owner.x - player.x, owner.z - player.z);
    if (distance > 1.75) return false;
    const fx = Math.sin(player.facing), fz = Math.cos(player.facing);
    const dx = owner.x - player.x, dz = owner.z - player.z;
    const facing = distance > 0.001 ? (fx * dx + fz * dz) / distance : 1;
    if (facing < -0.25) return false;
    room.ball.ownerId = player.id;
    room.ball.lastTouchTeam = player.team;
    room.events.push({ type: 'tackle', team: player.team, playerId: player.id, at: room.elapsedMs });
    return true;
  }
  if (room.ball.ownerId !== player.id) return false;
  kick(room, player, action);
  room.events.push({ type: action, team: player.team, playerId: player.id, at: room.elapsedMs });
  return true;
}

export function stepRoomSimulation(room, dt) {
  const safeDt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.05);
  const players = [...room.players.values()].filter(p => p.connected);
  for (const p of players) {
    const speed = p.input.sprint ? 7.2 : 5.2;
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
    }
  }

  const ball = room.ball;
  const owner = ball.ownerId ? room.players.get(ball.ownerId) : null;
  if (owner?.connected) {
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
      room.events.push({ type: 'goal', team: scorer, score: { ...room.score }, at: room.elapsedMs });
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
        ball.ownerId = nearest.id;
        ball.lastTouchTeam = nearest.team;
        ball.vx *= 0.2; ball.vy = 0; ball.vz *= 0.2;
        room.events.push({ type: 'possession', team: nearest.team, playerId: nearest.id, at: room.elapsedMs });
      }
    }
  }
  if (room.events.length > 40) room.events.splice(0, room.events.length - 40);
}

export function resetRoomBall(room) { resetBall(room); }
