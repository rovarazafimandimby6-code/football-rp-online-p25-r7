import { firstTouchRetention, dribbleLead, dribbleTouchOffset, spinAcceleration } from './gameplay-tuning.js';
import { PITCH } from './pitch.js';

export class PhysicsEngine {
  constructor() {
    this.gravity = 24;
  }

  stepBall(ball, players, dt, frictionFactor = 1.0, callbacks = {}) {
    // Suivi du dribble si un joueur contrôle le ballon
    if (ball.owner) {
      const p = ball.owner;
      const fx = Math.sin(p.facing);
      const fz = Math.cos(p.facing);
      // Touches de conduite alternées : le ballon reste légèrement devant le pied
      // sans être rigidement collé au joueur.
      p.dribblePhase = (p.dribblePhase || 0) + dt * Math.max(3, Math.hypot(p.vel.x, p.vel.z) * 0.9);
      const speed = Math.hypot(p.vel.x, p.vel.z);
      const touchOffset = dribbleTouchOffset(p, p.dribblePhase, speed);
      const lead = dribbleLead(p, speed) + touchOffset.forward;
      const targetX = p.pos.x + fx * lead + Math.cos(p.facing) * touchOffset.lateral;
      const targetZ = p.pos.z + fz * lead - Math.sin(p.facing) * touchOffset.lateral;
      const touch = Math.min(1, dt * (p.role === 'GK' ? 15 : 13));
      ball.pos.x += (targetX - ball.pos.x) * touch;
      ball.pos.z += (targetZ - ball.pos.z) * touch;
      ball.pos.y = PITCH.BALL_R;
      ball.vel.set(p.vel.x, 0, p.vel.z);
      ball.syncVisual(dt);
      return null;
    }

    // Intégration 3D du ballon libre. L'effet latéral est plafonné et décroît
    // avec la vitesse, puis le spin s'atténue progressivement.
    if (Math.abs(ball.spin || 0) > 0.005) {
      const curve = spinAcceleration(ball.vel, ball.spin);
      ball.vel.x += curve.x * dt;
      ball.vel.z += curve.z * dt;
      ball.spin *= Math.pow(0.32, dt);
    }
    ball.vel.y -= this.gravity * dt;
    ball.pos.x += ball.vel.x * dt;
    ball.pos.y += ball.vel.y * dt;
    ball.pos.z += ball.vel.z * dt;

    // Rebond au sol et friction pelouse
    if (ball.pos.y <= PITCH.BALL_R) {
      ball.pos.y = PITCH.BALL_R;
      if (ball.vel.y < -2.2) {
        ball.vel.y = -ball.vel.y * 0.54;
        callbacks.onBounce?.();
      } else {
        ball.vel.y = 0;
      }
      const groundDrag = Math.pow(0.24 * frictionFactor, dt);
      ball.vel.x *= groundDrag;
      ball.vel.z *= groundDrag;
    } else {
      const airDrag = Math.pow(0.82, dt);
      ball.vel.x *= airDrag;
      ball.vel.z *= airDrag;
    }

    // Collision avec les poteaux et transversales des deux cages
    const halfGoal = PITCH.GOAL_W / 2;
    for (const side of [-1, 1]) {
      const gx = side * PITCH.HALF_L;
      // Poteaux verticaux
      for (const gz of [-halfGoal, halfGoal]) {
        const dx = ball.pos.x - gx;
        const dz = ball.pos.z - gz;
        const dist = Math.hypot(dx, dz);
        const minD = PITCH.BALL_R + 0.1;
        if (dist < minD && ball.pos.y < PITCH.GOAL_H + 0.15) {
          const nx = dx / (dist || 1);
          const nz = dz / (dist || 1);
          ball.pos.x = gx + nx * minD;
          ball.pos.z = gz + nz * minD;
          const dot = ball.vel.x * nx + ball.vel.z * nz;
          if (dot < 0) {
            ball.vel.x = (ball.vel.x - 2 * dot * nx) * 0.72;
            ball.vel.z = (ball.vel.z - 2 * dot * nz) * 0.72;
            callbacks.onPostHit?.();
          }
        }
      }
      // Transversale
      if (Math.abs(ball.pos.z) <= halfGoal) {
        const dx = ball.pos.x - gx;
        const dy = ball.pos.y - PITCH.GOAL_H;
        const dist = Math.hypot(dx, dy);
        const minD = PITCH.BALL_R + 0.1;
        if (dist < minD) {
          const nx = dx / (dist || 1);
          const ny = dy / (dist || 1);
          ball.pos.x = gx + nx * minD;
          ball.pos.y = PITCH.GOAL_H + ny * minD;
          const dot = ball.vel.x * nx + ball.vel.y * ny;
          if (dot < 0) {
            ball.vel.x = (ball.vel.x - 2 * dot * nx) * 0.72;
            ball.vel.y = (ball.vel.y - 2 * dot * ny) * 0.72;
            callbacks.onPostHit?.();
          }
        }
      }
    }

    // Détection de but
    if (Math.abs(ball.pos.z) < halfGoal - 0.15 && ball.pos.y < PITCH.GOAL_H) {
      if (ball.pos.x > PITCH.HALF_L + PITCH.BALL_R * 0.5) {
        ball.vel.multiplyScalar(0.35);
        ball.syncVisual(dt);
        const dirs = callbacks.attackDirection || { blue: 1, red: -1 };
        const scoringTeam = Object.keys(dirs).find((team) => dirs[team] === 1) || 'blue';
        return { type: 'goal', scoringTeam };
      }
      if (ball.pos.x < -PITCH.HALF_L - PITCH.BALL_R * 0.5) {
        ball.vel.multiplyScalar(0.35);
        ball.syncVisual(dt);
        const dirs = callbacks.attackDirection || { blue: 1, red: -1 };
        const scoringTeam = Object.keys(dirs).find((team) => dirs[team] === -1) || 'red';
        return { type: 'goal', scoringTeam };
      }
    }

    // Collisions / interceptions / contrôles avec les joueurs
    if (ball.pos.y < 1.55) {
      for (const p of players) {
        if (p.actionCooldown > 0) continue;
        const dx = ball.pos.x - p.pos.x;
        const dz = ball.pos.z - p.pos.z;
        const dist = Math.hypot(dx, dz);
        const reach = p.role === 'GK' ? 1.28 : 0.98;
        if (dist < reach) {
          const speed = Math.hypot(ball.vel.x, ball.vel.z);
          const facingX = Math.sin(p.facing);
          const facingZ = Math.cos(p.facing);
          const approach = dist > 0.001 ? (facingX * dx + facingZ * dz) / dist : 1;
          // Un joueur de champ contrôle plus facilement un ballon qui arrive face à lui.
          if (p.role !== 'GK' && speed > 13 && approach < -0.45) continue;
          if (p.role === 'GK' && speed > 10 && p.team !== ball.lastTouchTeam) {
            // Arrêt du gardien avec rebond maîtrisé
            const dir = p.team === 'blue' ? 1 : -1;
            ball.vel.set(dir * 5.5, 2.2, (Math.random() - 0.5) * 7);
            p.triggerAnim('dive', 0.45, Math.sign(dz) || 1);
            p.actionCooldown = 0.4;
            ball.lastTouchTeam = p.team;
            ball.lastTouchPlayer = p;
            callbacks.onSave?.(p);
          } else {
            // Contrôle du ballon
            const prevTeam = ball.lastTouchTeam;
            ball.owner = p;
            // Amortir le ballon à la réception plutôt que conserver toute sa vitesse.
            ball.vel.multiplyScalar(firstTouchRetention(p, speed, approach));
            ball.lastTouchTeam = p.team;
            ball.lastTouchPlayer = p;
            p.triggerAnim('control', 0.2);
            if (prevTeam && prevTeam !== p.team && speed > 4) {
              callbacks.onInterception?.(p);
            }
          }
          break;
        }
      }
    }

    // Sorties de terrain (touche, corner, six mètres)
    if (Math.abs(ball.pos.z) > PITCH.HALF_W + PITCH.BALL_R) {
      const zSide = Math.sign(ball.pos.z);
      const xClamp = Math.max(-PITCH.HALF_L + 1.5, Math.min(PITCH.HALF_L - 1.5, ball.pos.x));
      ball.syncVisual(dt);
      return {
        type: 'throwin',
        team: ball.lastTouchTeam === 'blue' ? 'red' : 'blue',
        x: xClamp,
        z: zSide * (PITCH.HALF_W - 0.6)
      };
    }

    if (Math.abs(ball.pos.x) > PITCH.HALF_L + PITCH.BALL_R) {
      const endSide = Math.sign(ball.pos.x); // -1 côté bleu, +1 côté rouge
      const dirs = callbacks.attackDirection || { blue: 1, red: -1 };
      const defendingTeam = Object.keys(dirs).find((team) => dirs[team] === -endSide) || (endSide < 0 ? 'blue' : 'red');
      const attackingTeam = defendingTeam === 'blue' ? 'red' : 'blue';
      ball.syncVisual(dt);
      if (ball.lastTouchTeam === defendingTeam) {
        return {
          type: 'corner',
          team: attackingTeam,
          x: endSide * (PITCH.HALF_L - 1.0),
          z: (ball.pos.z >= 0 ? 1 : -1) * (PITCH.HALF_W - 1.0)
        };
      }
      return {
        type: 'goalkick',
        team: defendingTeam,
        x: endSide * (PITCH.HALF_L - 4.2),
        z: 0
      };
    }

    ball.syncVisual(dt);
    return null;
  }

  resolvePlayerCollisions(players) {
    const minD = PITCH.PLAYER_R * 2;
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const a = players[i];
        const b = players[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.001 && d < minD) {
          const push = (minD - d) * 0.52;
          const nx = dx / d;
          const nz = dz / d;
          a.pos.x -= nx * push;
          a.pos.z -= nz * push;
          b.pos.x += nx * push;
          b.pos.z += nz * push;
          const relative = (a.vel.x - b.vel.x) * nx + (a.vel.z - b.vel.z) * nz;
          if (relative > 0) {
            const impulse = relative * 0.12;
            a.vel.x -= nx * impulse; a.vel.z -= nz * impulse;
            b.vel.x += nx * impulse; b.vel.z += nz * impulse;
          }
        }
      }
      // Garder tous les joueurs dans l'aire de jeu
      const p = players[i];
      p.pos.x = Math.max(-PITCH.HALF_L - 0.5, Math.min(PITCH.HALF_L + 0.5, p.pos.x));
      p.pos.z = Math.max(-PITCH.HALF_W - 0.5, Math.min(PITCH.HALF_W + 0.5, p.pos.z));
    }
  }
}