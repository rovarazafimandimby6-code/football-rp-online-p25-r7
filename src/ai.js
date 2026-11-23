import { updateStamina } from './stamina.js';
import { predictGoalkeeperIntercept } from './goalkeeper.js';
const PITCH = Object.freeze({ HALF_L: 28, HALF_W: 17, GOAL_W: 6.6 });
import { specialtyForSlot } from './player-specialties.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Score une option de passe selon progression, espace disponible et ligne de passe. */
export function scorePassOption(passer, mate, opponents, attackDir = 1) {
  if (!passer || !mate || passer === mate || passer.team !== mate.team) return -Infinity;
  const dx = mate.pos.x - passer.pos.x;
  const dz = mate.pos.z - passer.pos.z;
  const distance = Math.hypot(dx, dz);
  if (distance < 2 || distance > 30) return -Infinity;
  const forward = (dx * attackDir) / distance;
  let laneRisk = 0;
  for (const opponent of opponents) {
    const ox = opponent.pos.x - passer.pos.x;
    const oz = opponent.pos.z - passer.pos.z;
    const t = clamp((ox * dx + oz * dz) / (distance * distance), 0, 1);
    const nearest = Math.hypot(ox - t * dx, oz - t * dz);
    if (t > 0.08 && t < 0.94 && nearest < 2.2) laneRisk += (2.2 - nearest) * (1 - Math.abs(0.5 - t));
  }
  let nearestOpponent = 12;
  for (const opponent of opponents) nearestOpponent = Math.min(nearestOpponent, Math.hypot(opponent.pos.x - mate.pos.x, opponent.pos.z - mate.pos.z));
  const space = Math.min(2.5, Math.max(0, nearestOpponent - 1.5)) * 0.22;
  const roleBonus = mate.specialty === 'playmaker' ? 0.45
    : mate.specialty === 'runner' && forward > 0.35 ? 0.65
      : mate.specialty === 'finisher' && forward > 0.15 ? 0.35 : 0;
  return forward * 2.1 + space + roleBonus - distance * 0.045 - laneRisk * 1.7;
}

const FORMATIONS = {
  '2-2': [
    { role: 'GK', x: -25.2, z: 0 },
    { role: 'DEF', x: -13, z: -6.5 },
    { role: 'DEF', x: -13, z: 6.5 },
    { role: 'FWD', x: -3.5, z: -5.5 },
    { role: 'FWD', x: -3.5, z: 5.5 }
  ],
  '1-2-1': [
    { role: 'GK', x: -25.2, z: 0 },
    { role: 'DEF', x: -15, z: 0 },
    { role: 'MID', x: -7, z: -8.5 },
    { role: 'MID', x: -7, z: 8.5 },
    { role: 'FWD', x: -2, z: 0 }
  ],
  '2-1-1': [
    { role: 'GK', x: -25.2, z: 0 },
    { role: 'DEF', x: -14, z: -6.2 },
    { role: 'DEF', x: -14, z: 6.2 },
    { role: 'MID', x: -6.5, z: 0 },
    { role: 'FWD', x: -1.5, z: 0 }
  ]
};

export function createTeamRoster(team, formationName = '2-2', clubRoster = null) {
  const layout = FORMATIONS[formationName] || FORMATIONS['2-2'];
  const sign = team === 'blue' ? 1 : -1;
  const blueNames = ['Lucas', 'Théo', 'Nathan', 'Maxime', 'Kylian'];
  const redNames = ['Mateo', 'Léo', 'Sofiane', 'Hugo', 'Enzo'];
  const numbers = [1, 4, 5, 8, 10];

  const available = Array.isArray(clubRoster) ? clubRoster : [];
  const ranked = available.filter(Boolean).slice().sort((a,b) => (Number(b.rating)||0)-(Number(a.rating)||0) || (Number(b.potential)||0)-(Number(a.potential)||0) || String(a.id).localeCompare(String(b.id)));
  const used = new Set();
  return layout.map((slot, i) => {
    let source = ranked.find(player => player.role === slot.role && !used.has(player.id));
    if (!source) source = ranked.find(player => !used.has(player.id));
    if (source) used.add(source.id);
    const rating = Number(source?.rating) || 55;
    const specialtyByArchetype = {
      'Gardien réflexe':'reflex','Gardien relanceur':'reflex',
      'Défenseur stoppeur':'stopper','Défenseur aérien':'stopper','Défenseur relanceur':'cover','Latéral endurant':'runner',
      'Milieu récupérateur':'stopper','Meneur créatif':'playmaker','Relayeur dynamique':'runner','Milieu organisateur':'playmaker',
      'Avant-centre puissant':'finisher','Finisseur de surface':'finisher','Ailier percutant':'runner','Attaquant mobile':'runner'
    };
    return {
      id: source?.id || `${team}_${i}`,
      team,
      number: Number.isInteger(source?.number) ? source.number : numbers[i],
      name: source?.name || (team === 'blue' ? blueNames[i] : redNames[i]),
      role: slot.role,
      rating, potential: Number(source?.potential) || rating, archetype: source?.archetype || '',
      specialty: specialtyByArchetype[source?.archetype] || specialtyForSlot(slot.role, i),
      slotIndex: i,
      appearance: source?.appearance ? { ...source.appearance } : null,
      preferredFoot: source?.preferredFoot || null,
      attributes: source?.attributes ? { ...source.attributes } : source ? { pace: rating, shooting: rating, passing: rating, defense: rating, stamina: rating, control: rating } : null,
      homePos: { x: slot.x * sign, z: slot.z * sign }
    };
  });
}

export class TeamAI {
  constructor() {
    this.formation = '2-2';
    this.mentality = 'balanced';
    this.pressStyle = 'normal';
    // BLEU attaque vers +X en première période ; ROUGE vers -X.
    this.attackDirection = { blue: 1, red: -1 };
  }

  applyFormation(players, team, formationName) {
    const layout = FORMATIONS[formationName] || FORMATIONS['2-2'];
    const sign = this.attackDirection[team] || (team === 'blue' ? 1 : -1);
    for (const p of players) {
      if (p.team !== team) continue;
      const slot = layout[p.slotIndex];
      p.role = slot.role;
      p.homePos.x = slot.x * sign;
      p.homePos.z = slot.z * sign;
    }
  }

  update(players, ball, dt, actions) {
    // Trouver le joueur de champ le plus proche du ballon pour chaque équipe
    const closestByTeam = { blue: null, red: null };
    const coverByTeam = { blue: null, red: null };
    for (const team of ['blue', 'red']) {
      let bestDist = Infinity;
      let secondDist = Infinity;
      for (const p of players) {
        if (p.team !== team || p.role === 'GK' || p.isControlled) continue;
        const d = Math.hypot(p.pos.x - ball.pos.x, p.pos.z - ball.pos.z);
        if (d < bestDist) {
          secondDist = bestDist;
          coverByTeam[team] = closestByTeam[team];
          bestDist = d;
          closestByTeam[team] = p;
        } else if (d < secondDist) {
          secondDist = d;
          coverByTeam[team] = p;
        }
      }
    }

    for (const p of players) {
      if (p.actionCooldown > 0) p.actionCooldown = Math.max(0, p.actionCooldown - dt);
      if (p.tackleTimer > 0) p.tackleTimer = Math.max(0, p.tackleTimer - dt);
      p.decisionTimer = Math.max(0, (p.decisionTimer || 0) - dt);
      if (p.isControlled) continue;
      const movement = Math.hypot(p.vel.x, p.vel.z);
      updateStamina(p, dt, { sprinting: movement > 5.5, effort: p.role === 'GK' ? 0.82 : 1, endurance: p.attributes?.stamina ?? 50 });

      if (p.role === 'GK') {
        this.updateGoalkeeper(p, ball, dt, actions);
      } else {
        this.updateOutfield(p, players, ball, closestByTeam[p.team] === p, coverByTeam[p.team] === p, dt, actions);
      }
    }
  }

  updateGoalkeeper(p, ball, dt, actions) {
    const attackDir = this.attackDirection[p.team] || (p.team === 'blue' ? 1 : -1);
    const goalX = attackDir > 0 ? -PITCH.HALF_L + 1.6 : PITCH.HALF_L - 1.6;
    const prediction = predictGoalkeeperIntercept(ball, p, attackDir);
    const targetX = prediction.danger ? prediction.x : goalX;
    const targetZ = prediction.danger ? prediction.z : Math.max(-PITCH.GOAL_W * 0.42, Math.min(PITCH.GOAL_W * 0.42, ball.pos.z * 0.42));
    const paceFactor = 0.82 + clamp(Number(p.attributes?.pace ?? 50), 1, 99) / 100 * 0.36;
    this.steerPlayer(p, targetX, targetZ, 5.4 * (0.8 + p.stamina * 0.2) * paceFactor, dt);

    // Si le gardien a le ballon, il relance rapidement vers un coéquipier démarqué
    if (ball.owner === p) {
      const targetDir = this.attackDirection[p.team] || (p.team === 'blue' ? 1 : -1);
      p.facing = targetDir > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (p.actionCooldown <= 0) {
        actions.aiPass(p);
      }
    }
  }

  updateOutfield(p, players, ball, isChaser, isCover, dt, actions) {
    const attackDir = this.attackDirection[p.team] || (p.team === 'blue' ? 1 : -1);
    const staminaFactor = 0.76 + p.stamina * 0.24;
    const paceFactor = 0.82 + clamp(Number(p.attributes?.pace ?? 50), 1, 99) / 100 * 0.36;
    const oppGoalX = attackDir * PITCH.HALF_L;

    // Si ce joueur IA a le ballon : choisir selon pression, espace et options.
    if (ball.owner === p) {
      const opponents = players.filter((other) => other.team !== p.team && other.role !== 'GK');
      const teammates = players.filter((other) => other.team === p.team && other !== p);
      const passOptions = teammates
        .map((mate) => ({ mate, score: scorePassOption(p, mate, opponents, attackDir) }))
        .filter((option) => Number.isFinite(option.score))
        .sort((a, b) => b.score - a.score);
      const bestPass = passOptions[0];
      const distToGoal = Math.hypot(oppGoalX - p.pos.x, -p.pos.z);
      const shootBias = p.specialty === 'finisher' ? 3.0 : p.specialty === 'playmaker' ? 1.35 : 2.0;
      if (distToGoal < (p.specialty === 'finisher' ? 19 : 16.5) && p.decisionTimer <= 0 && Math.random() < dt * shootBias) {
        p.decisionTimer = 0.55 + Math.random() * 0.35;
        actions.aiShoot(p);
        return;
      }
      // Passer si pressé par un adversaire
      const pressed = players.some(
        (other) => other.team !== p.team && Math.hypot(other.pos.x - p.pos.x, other.pos.z - p.pos.z) < 3.4
      );
      const passBias = p.specialty === 'playmaker' ? 1.05 : p.specialty === 'runner' ? 0.32 : 0.55;
      const usefulPass = bestPass && bestPass.score > -0.25;
      const passChance = p.specialty === 'playmaker' ? 3.8 : passBias * 3.0;
      if (p.decisionTimer <= 0 && usefulPass && ((pressed && Math.random() < dt * passChance) || Math.random() < dt * passBias)) {
        p.decisionTimer = 0.5 + Math.random() * 0.35;
        actions.aiPass(p, bestPass.mate);
        return;
      }

      const carryLane = p.specialty === 'runner' ? p.homePos.z * 0.8 : p.homePos.z * 0.45;
      const carrySpeed = p.specialty === 'runner' ? 8.25 : 7.6;
      this.steerPlayer(p, oppGoalX - attackDir * 5, carryLane, carrySpeed * staminaFactor * paceFactor, dt);
      return;
    }

    // Sans ballon : placement tactique + pressing
    const teamHasBall = ball.owner && ball.owner.team === p.team;
    // Le même modèle tactique s'applique aux deux équipes ; seule la direction
    // d'attaque change. Cela évite une IA rouge structurellement moins tactique.
    const tacticalPush = this.mentality === 'attacking' ? 5.5
      : this.mentality === 'defensive' ? -5.5 : 0;
    const shiftX = attackDir * tacticalPush + ball.pos.x * 0.12;

    const pressRange = this.pressStyle === 'high' ? 16
      : this.pressStyle === 'low' ? 7 : 11;
    const distBall = Math.hypot(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z);

    if (!teamHasBall && isChaser) {
      this.steerPlayer(p, ball.pos.x, ball.pos.z, (p.specialty === 'stopper' ? 8.35 : 7.9) * staminaFactor * paceFactor, dt);
      // Seul le premier défenseur déclenche le duel ; les partenaires gardent leur structure.
      if (ball.owner && ball.owner.team !== p.team && distBall < 1.55 && p.actionCooldown <= 0 && Math.random() < dt * 2.1) {
        actions.tryTackle(p);
      }
    } else if (!teamHasBall && isCover && distBall < pressRange * 0.9) {
      // Le deuxième défenseur ferme la ligne de passe au lieu de poursuivre le porteur.
      const coverX = ball.pos.x - attackDir * (p.specialty === 'cover' ? 3.2 : 4.5);
      const coverZ = ball.pos.z * 0.55 + p.homePos.z * 0.45;
      this.steerPlayer(p, clamp(coverX, -PITCH.HALF_L + 2, PITCH.HALF_L - 2),
        clamp(coverZ, -PITCH.HALF_W + 2, PITCH.HALF_W - 2), 6.6 * staminaFactor * paceFactor, dt);
    } else if (teamHasBall) {
      // Soutien sans ballon, y compris lorsque le porteur est un joueur humain.
      const owner = ball.owner;
      const ownerDir = owner ? Math.sign((owner.pos.x - p.pos.x) * attackDir) : 0;
      let tx = p.homePos.x + shiftX + ball.pos.x * 0.22;
      let tz = p.homePos.z + (ball.pos.z - p.homePos.z) * 0.22;
      if (p.specialty === 'runner' || p.specialty === 'finisher') {
        tx = ball.pos.x + attackDir * (p.specialty === 'runner' ? 7.5 : 5.0);
        tz = ball.pos.z + (p.homePos.z >= 0 ? 3.8 : -3.8);
      } else if (p.specialty === 'playmaker') {
        tx = ball.pos.x - attackDir * 3.0;
        tz = ball.pos.z + (p.homePos.z >= 0 ? 5.0 : -5.0);
      } else if (p.specialty === 'cover') {
        tx = p.homePos.x + attackDir * 1.5;
        tz = p.homePos.z + (ball.pos.z - p.homePos.z) * 0.16;
      }
      tx += ownerDir * attackDir * 0.8;
      this.steerPlayer(p, clamp(tx, -PITCH.HALF_L + 2, PITCH.HALF_L - 2), clamp(tz, -PITCH.HALF_W + 2, PITCH.HALF_W - 2), 6.9 * staminaFactor * paceFactor, dt);
    } else {
      const tx = p.homePos.x + shiftX + ball.pos.x * 0.35;
      const tz = p.homePos.z + (ball.pos.z - p.homePos.z) * 0.28;
      this.steerPlayer(p, tx, tz, 6.7 * staminaFactor * paceFactor, dt);
    }
  }

  steerPlayer(p, tx, tz, maxSpeed, dt) {
    if (p.tackleTimer > 0) return;
    const dx = tx - p.pos.x;
    const dz = tz - p.pos.z;
    const dist = Math.hypot(dx, dz);

    if (dist > 0.35) {
      const spd = Math.min(maxSpeed, dist * 3.2);
      const vx = (dx / dist) * spd;
      const vz = (dz / dist) * spd;
      p.vel.x += (vx - p.vel.x) * Math.min(1, dt * 8);
      p.vel.z += (vz - p.vel.z) * Math.min(1, dt * 8);
      p.facing = Math.atan2(p.vel.x, p.vel.z);
    } else {
      p.vel.x *= Math.pow(0.05, dt);
      p.vel.z *= Math.pow(0.05, dt);
    }

    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
  }
}