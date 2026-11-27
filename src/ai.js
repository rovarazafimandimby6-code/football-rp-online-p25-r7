import { updateStamina } from './stamina.js';
import { predictGoalkeeperIntercept } from './goalkeeper.js';
const PITCH = Object.freeze({ HALF_L: 28, HALF_W: 17, GOAL_W: 6.6 });
import { specialtyForSlot } from './player-specialties.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Décalage collectif du bloc vers le couloir du ballon, sans basculer tout le bloc. */
export function getDefensiveBlockShift(ballZ) {
  return clamp((Number(ballZ) || 0) * 0.24, -3.4, 3.4);
}

/** Anticipe une course adverse vers notre but sans extrapoler les déplacements latéraux excessifs. */
export function predictDefensiveThreatPosition(opponent, attackDir = 1, horizon = 0.7) {
  const pos = opponent?.pos || { x: 0, z: 0 };
  const vx = Number(opponent?.vel?.x) || 0;
  const vz = Number(opponent?.vel?.z) || 0;
  const towardOwnGoal = -attackDir * vx;
  if (towardOwnGoal <= 0.8) return { x: pos.x, z: pos.z };
  const time = clamp(Number(horizon) || 0, 0, 1);
  // Le signe dépend du sens d'attaque : une équipe peut défendre vers +X ou -X.
  const advance = Math.min(4.5, towardOwnGoal * time);
  return {
    x: clamp(pos.x - attackDir * advance, -PITCH.HALF_L + 1.5, PITCH.HALF_L - 1.5),
    z: clamp(pos.z + clamp(vz * time, -2.2, 2.2), -PITCH.HALF_W + 1.5, PITCH.HALF_W - 1.5)
  };
}

/** Tirage déterministe par joueur et action : le même état produit la même décision. */
export function aiDecisionRoll(player, action = 'decision') {
  const sequence = Math.max(0, Math.floor(Number(player?.aiDecisionSequence) || 0));
  if (player) player.aiDecisionSequence = sequence + 1;
  const input = `${String(player?.id ?? "system-player")}:${sequence}:${action}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}
const ratingOf = (player, key, fallback = 50) => clamp(Number(player?.attributes?.[key] ?? fallback) || fallback, 1, 99);

/** Qualité d'exécution pondérée par les attributs, sans rendre l'action infaillible. */
export function decisionAttributeFactor(player, primary, secondary = null) {
  const main = ratingOf(player, primary);
  const support = secondary ? ratingOf(player, secondary) : main;
  const quality = main * 0.72 + support * 0.28;
  return clamp(0.72 + quality / 100 * 0.56, 0.78, 1.28);
}

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
  const execution = (decisionAttributeFactor(passer, 'passing', 'vision') - 1) * 1.45;
  const reception = (ratingOf(mate, 'control') - 50) * 0.006;
  return forward * 2.1 + space + roleBonus + execution + reception - distance * 0.045 - laneRisk * 1.7;
}

/**
 * Replace un défenseur dans un bloc compact : il protège d'abord l'axe entre
 * le porteur adverse et son propre but, tout en conservant une partie de son couloir.
 */
export function getDefensiveShapeTarget(player, ball, opponents, attackDir = 1, mentality = 'balanced') {
  const ownGoalX = -attackDir * PITCH.HALF_L;
  const threats = (opponents || []).filter((opponent) => opponent && opponent.pos && opponent.role !== 'GK');
  let threat = null;
  let threatPosition = null;
  let threatScore = Infinity;
  for (const opponent of threats) {
    const predicted = predictDefensiveThreatPosition(opponent, attackDir);
    const distanceToPlayer = Math.hypot(predicted.x - player.pos.x, predicted.z - player.pos.z);
    const distanceToBall = Math.hypot(predicted.x - ball.pos.x, predicted.z - ball.pos.z);
    // Un défenseur ne traverse pas tout le bloc pour suivre une menace éloignée
    // de son couloir : la priorité reste la menace proche ET dans sa zone.
    const laneDrift = Math.abs(predicted.z - (player.homePos?.z ?? player.pos.z));
    const runThreatBonus = Math.max(0, -attackDir * (Number(opponent.vel?.x) || 0)) * 0.12;
    const score = distanceToPlayer + distanceToBall * 0.24 + laneDrift * 0.42 - runThreatBonus;
    if (score < threatScore) { threat = opponent; threatPosition = predicted; threatScore = score; }
  }
  const tacticalPush = mentality === 'defensive' ? -2.4 : mentality === 'attacking' ? 1.8 : 0;
  const homeZ = player.homePos?.z ?? player.pos.z;
  const ballShiftX = (ball.pos.x - player.homePos.x) * 0.12;
  // Tout le bloc coulisse vers le nouveau couloir, avec un ajustement local plus faible.
  // La limite relative au poste garde un joueur en couverture côté faible.
  const ballShiftZ = getDefensiveBlockShift(ball.pos.z) + (ball.pos.z - homeZ) * 0.14;
  // Quand le ballon entre dans notre moitié, toute la ligne recule progressivement.
  // Le repli est collectif et plafonné pour éviter que le bloc ne s'écrase sur le gardien.
  const ownHalfDanger = clamp((-ball.pos.x * attackDir - 2) / 18, 0, 1);
  const collectiveRetreat = ownHalfDanger * (mentality === 'defensive' ? 4.1 : mentality === 'attacking' ? 2.2 : 3.2);
  let targetX = player.homePos.x + ballShiftX + attackDir * (tacticalPush - collectiveRetreat);
  let targetZ = homeZ + ballShiftZ;
  if (threat && threatPosition) {
    // Se placer côté but de la position anticipée pour fermer la course en profondeur.
    const goalSideX = threatPosition.x + (ownGoalX - threatPosition.x) * 0.16;
    const goalSideZ = threatPosition.z + (player.homePos.z - threatPosition.z) * 0.28;
    targetX = targetX * 0.58 + goalSideX * 0.42;
    targetZ = targetZ * 0.62 + goalSideZ * 0.38;
  }
  targetZ = clamp(targetZ, homeZ - 5.5, homeZ + 5.5);
  return {
    x: clamp(targetX, -PITCH.HALF_L + 1.5, PITCH.HALF_L - 1.5),
    z: clamp(targetZ, -PITCH.HALF_W + 1.5, PITCH.HALF_W - 1.5)
  };
}

/**
 * Place le défenseur de couverture sur la ligne de passe vers le receveur
 * adverse le plus dangereux. En l'absence de solution, il protège l'axe du ballon.
 */
export function getDefensiveCoverTarget(player, ball, opponents, attackDir = 1) {
  const carrier = ball?.owner?.pos || ball?.pos || { x: 0, z: 0 };
  let receiver = null;
  let bestScore = Infinity;
  for (const opponent of opponents || []) {
    if (!opponent?.pos || opponent === ball?.owner || opponent.role === 'GK') continue;
    const predicted = predictDefensiveThreatPosition(opponent, attackDir, 0.8);
    const dx = predicted.x - carrier.x;
    const dz = predicted.z - carrier.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 2 || distance > 24) continue;
    const forwardThreat = Math.max(0, -attackDir * dx);
    const runBonus = Math.max(0, -attackDir * (Number(opponent.vel?.x) || 0)) * 0.1;
    const score = distance - forwardThreat * 0.18 - runBonus;
    if (score < bestScore) {
      bestScore = score;
      receiver = { ...opponent, pos: predicted };
    }
  }

  const homeZ = player.homePos?.z ?? player.pos?.z ?? 0;
  const blockShiftZ = getDefensiveBlockShift(carrier.z) * 0.25;
  if (!receiver) {
    const fallbackZ = clamp(carrier.z * 0.55 + homeZ * 0.45 + blockShiftZ, homeZ - 5.5, homeZ + 5.5);
    return {
      x: clamp(carrier.x - attackDir * (player.specialty === 'cover' ? 3.2 : 4.5), -PITCH.HALF_L + 2, PITCH.HALF_L - 2),
      z: clamp(fallbackZ, -PITCH.HALF_W + 2, PITCH.HALF_W - 2)
    };
  }

  const targetX = carrier.x + (receiver.pos.x - carrier.x) * 0.55 - attackDir * 1.2;
  const targetZ = carrier.z + (receiver.pos.z - carrier.z) * 0.55;
  const coveredLaneZ = clamp(targetZ * 0.78 + homeZ * 0.22 + blockShiftZ, homeZ - 5.5, homeZ + 5.5);
  return {
    x: clamp(targetX, -PITCH.HALF_L + 2, PITCH.HALF_L - 2),
    z: clamp(coveredLaneZ, -PITCH.HALF_W + 2, PITCH.HALF_W - 2)
  };
}

/**
 * Choisit une zone de soutien qui conserve le rôle du joueur tout en évitant
 * les couloirs déjà occupés par les défenseurs adverses.
 */
export function getSupportTarget(player, owner, players, attackDir = 1, opponentPlayers = null, transition = false) {
  const ball = owner?.pos || { x: 0, z: 0 };
  const opponents = opponentPlayers || players.filter((other) => other.team !== player.team && other.role !== 'GK');
  const baseForwardOffset = player.specialty === 'runner' ? 8.2
    : player.specialty === 'finisher' ? 5.6
      : player.specialty === 'playmaker' ? -3.2 : 0;
  // Après récupération, les profils offensifs attaquent plus vite la profondeur.
  const transitionBoost = !transition || player.specialty === 'cover' ? 0
    : player.specialty === 'runner' ? 3.2
      : player.specialty === 'finisher' ? 2.4
        : player.specialty === 'playmaker' ? 3.8 : 1.8;
  const forwardOffset = baseForwardOffset + transitionBoost;
  const targetX = clamp(ball.x + attackDir * forwardOffset, -PITCH.HALF_L + 2, PITCH.HALF_L - 2);
  if (player.specialty === 'cover') {
    return {
      x: clamp(player.homePos.x + attackDir * 1.5, -PITCH.HALF_L + 2, PITCH.HALF_L - 2),
      z: clamp(player.homePos.z + (ball.z - player.homePos.z) * 0.16, -PITCH.HALF_W + 2, PITCH.HALF_W - 2)
    };
  }

  const preferredLane = player.homePos.z >= 0 ? 1 : -1;
  const laneCandidates = player.specialty === 'playmaker'
    ? [0, -3.5, 3.5]
    : [preferredLane * 4.5, preferredLane * 8.5, -preferredLane * 4.5, -preferredLane * 8.5];
  let best = null;
  for (const lane of laneCandidates) {
    const targetZ = clamp(ball.z * 0.28 + lane * 0.72, -PITCH.HALF_W + 2, PITCH.HALF_W - 2);
    let nearest = 14;
    for (const opponent of opponents) {
      nearest = Math.min(nearest, Math.hypot(opponent.pos.x - targetX, opponent.pos.z - targetZ));
    }
    const continuityPenalty = Math.abs(targetZ - player.homePos.z) * 0.13;
    const ballSeparation = Math.hypot(targetX - ball.x, targetZ - ball.z);
    const score = Math.min(nearest, 12) * 0.7 - continuityPenalty
      - Math.max(0, 3.2 - ballSeparation) * 0.8;
    if (!best || score > best.score) best = { x: targetX, z: targetZ, score };
  }
  return { x: best.x, z: best.z };
}


/** Écarte légèrement une cible de soutien des coéquipiers déjà proches. */
export function getSpacedSupportTarget(player, target, teammates, minDistance = 4.2) {
  let x = target.x;
  let z = target.z;
  for (const mate of teammates || []) {
    if (!mate || mate === player || mate.team !== player.team || !mate.pos) continue;
    let dx = x - mate.pos.x;
    let dz = z - mate.pos.z;
    let distance = Math.hypot(dx, dz);
    const overlap = minDistance - distance;
    if (overlap <= 0) continue;
    if (distance < 0.001) {
      dx = (player.homePos?.x ?? player.pos?.x ?? 0) - (mate.homePos?.x ?? mate.pos.x);
      dz = (player.homePos?.z ?? player.pos?.z ?? 0) - (mate.homePos?.z ?? mate.pos.z);
      distance = Math.hypot(dx, dz);
      if (distance < 0.001) {
        const side = (Number(player.slotIndex) || 0) % 2 === 0 ? 1 : -1;
        dx = 0;
        dz = side;
        distance = 1;
      }
    }
    const strength = overlap * 0.42;
    x += dx / distance * strength;
    z += dz / distance * strength;
  }
  return {
    x: clamp(x, -PITCH.HALF_L + 2, PITCH.HALF_L - 2),
    z: clamp(z, -PITCH.HALF_W + 2, PITCH.HALF_W - 2)
  };
}


/** Maintient des intervalles défensifs pour éviter que plusieurs joueurs occupent le même couloir. */
export function getSpacedDefensiveTarget(player, target, teammates, minDistance = 4.8) {
  let x = target.x;
  let z = target.z;
  for (const mate of teammates || []) {
    if (!mate || mate === player || mate.team !== player.team || mate.role === 'GK' || !mate.pos) continue;
    let dx = x - mate.pos.x;
    let dz = z - mate.pos.z;
    let distance = Math.hypot(dx, dz);
    if (distance >= minDistance) continue;
    if (distance < 0.001) {
      dx = (player.homePos?.x ?? player.pos?.x ?? 0) - (mate.homePos?.x ?? mate.pos.x);
      dz = (player.homePos?.z ?? player.pos?.z ?? 0) - (mate.homePos?.z ?? mate.pos.z);
      distance = Math.hypot(dx, dz);
      if (distance < 0.001) {
        const side = (Number(player.slotIndex) || 0) % 2 === 0 ? 1 : -1;
        dx = 0;
        dz = side;
        distance = 1;
      }
    }
    const strength = (minDistance - distance) * 0.32;
    x += dx / distance * strength;
    z += dz / distance * strength;
  }
  return {
    x: clamp(x, -PITCH.HALF_L + 2, PITCH.HALF_L - 2),
    z: clamp(z, -PITCH.HALF_W + 2, PITCH.HALF_W - 2)
  };
}

/** Une demande humaine ne valorise que les lignes déjà jugées acceptables. */
export function scorePassOptionWithRequest(passer, mate, opponents, attackDir = 1, requestedReceiver = null) {
  const baseScore = scorePassOption(passer, mate, opponents, attackDir);
  if (!Number.isFinite(baseScore)) return baseScore;
  return baseScore + (mate === requestedReceiver && baseScore > -0.25 ? 1.65 : 0);
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

export function createTeamRoster(team, formationName = '2-2', clubRoster = null, priorityPlayerId = null, preferredStarterIds = null) {
  const layout = FORMATIONS[formationName] || FORMATIONS['2-2'];
  const sign = team === 'blue' ? 1 : -1;
  const blueNames = ['Lucas', 'Théo', 'Nathan', 'Maxime', 'Kylian'];
  const redNames = ['Mateo', 'Léo', 'Sofiane', 'Hugo', 'Enzo'];
  const numbers = [1, 4, 5, 8, 10];

  const available = Array.isArray(clubRoster) ? clubRoster : [];
  const ranked = available.filter(Boolean).slice().sort((a,b) => (Number(b.rating)||0)-(Number(a.rating)||0) || (Number(b.potential)||0)-(Number(a.potential)||0) || String(a.id).localeCompare(String(b.id)));
  const used = new Set();
  const preferred = Array.isArray(preferredStarterIds)
    ? preferredStarterIds.slice(0, 5).map(id => ranked.find(player => player.id === id)).filter(Boolean)
    : [];
  const priorityPlayer = team === 'blue' && priorityPlayerId ? ranked.find(player => player.id === priorityPlayerId) : null;
  const prioritySlotIndex = priorityPlayer
    ? Math.max(0, layout.findIndex(slot => slot.role === priorityPlayer.role) < 0 ? layout.length - 1 : layout.findIndex(slot => slot.role === priorityPlayer.role))
    : -1;
  return layout.map((slot, i) => {
    let source = i === prioritySlotIndex && priorityPlayer && !used.has(priorityPlayer.id)
      ? priorityPlayer
      : preferred.find(player => player.role === slot.role && !used.has(player.id));
    if (!source) source = preferred.find(player => !used.has(player.id));
    if (!source) source = ranked.find(player => player.role === slot.role && !used.has(player.id));
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

/** Prépare une seule fois les groupes tactiques partagés pour ce tick. */
export function buildTeamContexts(players) {
  const blue = players.filter(player => player.team === 'blue');
  const red = players.filter(player => player.team === 'red');
  const blueOutfield = blue.filter(player => player.role !== 'GK');
  const redOutfield = red.filter(player => player.role !== 'GK');
  return {
    blue: { players: blue, teammates: blueOutfield, opponents: redOutfield },
    red: { players: red, teammates: redOutfield, opponents: blueOutfield }
  };
}

export class TeamAI {
  constructor() {
    this.formation = '2-2';
    this.mentality = 'balanced';
    this.pressStyle = 'normal';
    this.lastPossessionTeam = null;
    this.transitionTeam = null;
    this.transitionTimer = 0;
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
    const possessionTeam = ball.owner?.team || null;
    if (possessionTeam && possessionTeam !== this.lastPossessionTeam) {
      this.transitionTeam = possessionTeam;
      this.transitionTimer = 2.4;
      this.lastPossessionTeam = possessionTeam;
    }
    this.transitionTimer = Math.max(0, this.transitionTimer - dt);
    const contexts = buildTeamContexts(players);
    // Trouver le joueur de champ le plus proche du ballon pour chaque équipe
    const closestByTeam = { blue: null, red: null };
    const coverByTeam = { blue: null, red: null };
    for (const team of ['blue', 'red']) {
      let bestDist = Infinity;
      let secondDist = Infinity;
      for (const p of players) {
        if (p.team !== team || p.role === 'GK' || p.isControlled) continue;
        const d = Math.hypot(p.pos.x - ball.pos.x, p.pos.z - ball.pos.z);
        const stableKey = (candidate) => `${String(candidate.slotIndex ?? 99).padStart(3, '0')}:${String(candidate.id ?? '')}`;
        const closer = d < bestDist - 0.0001
          || (Math.abs(d - bestDist) <= 0.0001 && closestByTeam[team] && stableKey(p) < stableKey(closestByTeam[team]));
        const secondCloser = d < secondDist - 0.0001
          || (Math.abs(d - secondDist) <= 0.0001 && coverByTeam[team] && stableKey(p) < stableKey(coverByTeam[team]));
        if (closer) {
          secondDist = bestDist;
          coverByTeam[team] = closestByTeam[team];
          bestDist = d;
          closestByTeam[team] = p;
        } else if (secondCloser) {
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
        this.updateOutfield(p, players, ball, closestByTeam[p.team] === p, coverByTeam[p.team] === p, dt, actions, contexts[p.team], this.transitionTeam === p.team && this.transitionTimer > 0);
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

  updateOutfield(p, players, ball, isChaser, isCover, dt, actions, context = null, inTransition = false) {
    const attackDir = this.attackDirection[p.team] || (p.team === 'blue' ? 1 : -1);
    const staminaFactor = 0.76 + p.stamina * 0.24;
    const paceFactor = 0.82 + clamp(Number(p.attributes?.pace ?? 50), 1, 99) / 100 * 0.36;
    const oppGoalX = attackDir * PITCH.HALF_L;

    // Si ce joueur IA a le ballon : choisir selon pression, espace et options.
    if (ball.owner === p) {
      const opponents = context?.opponents || players.filter((other) => other.team !== p.team && other.role !== 'GK');
      const teammates = context?.teammates || players.filter((other) => other.team === p.team && other !== p);
      const requestedReceiver = actions.requestedReceiver?.team === p.team ? actions.requestedReceiver : null;
      const passOptions = teammates
        .map((mate) => ({ mate, score: scorePassOptionWithRequest(p, mate, opponents, attackDir, requestedReceiver) }))
        .filter((option) => Number.isFinite(option.score))
        .sort((a, b) => b.score - a.score);
      const bestPass = passOptions[0];
      const distToGoal = Math.hypot(oppGoalX - p.pos.x, -p.pos.z);
      const shootBias = (p.specialty === 'finisher' ? 3.0 : p.specialty === 'playmaker' ? 1.35 : 2.0)
        * decisionAttributeFactor(p, 'shooting', 'composure');
      if (distToGoal < (p.specialty === 'finisher' ? 19 : 16.5) && p.decisionTimer <= 0 && aiDecisionRoll(p, 'shoot-trigger') < 1 - Math.exp(-dt * shootBias)) {
        p.decisionTimer = 0.55 + aiDecisionRoll(p, 'shoot-delay') * 0.35;
        actions.aiShoot(p);
        return;
      }
      // Passer si pressé par un adversaire (même contexte d'équipe que le choix de passe).
      const pressed = opponents.some(
        (other) => Math.hypot(other.pos.x - p.pos.x, other.pos.z - p.pos.z) < 3.4
      );
      const passBias = p.specialty === 'playmaker' ? 1.05 : p.specialty === 'runner' ? 0.32 : 0.55;
      const usefulPass = bestPass && bestPass.score > -0.25;
      const passChance = ((p.specialty === 'playmaker' ? 3.8 : passBias * 3.0)
        + (bestPass?.mate === requestedReceiver ? 0.85 : 0))
        * decisionAttributeFactor(p, 'passing', 'vision');
      if (p.decisionTimer <= 0 && usefulPass && ((pressed && aiDecisionRoll(p, 'pressed-pass') < 1 - Math.exp(-dt * passChance)) || aiDecisionRoll(p, 'open-pass') < 1 - Math.exp(-dt * passBias))) {
        p.decisionTimer = 0.5 + aiDecisionRoll(p, 'pass-delay') * 0.35;
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

    const pressRange = this.pressStyle === 'high' ? 16
      : this.pressStyle === 'low' ? 7 : 11;
    const distBall = Math.hypot(ball.pos.x - p.pos.x, ball.pos.z - p.pos.z);

    if (!teamHasBall && isChaser) {
      this.steerPlayer(p, ball.pos.x, ball.pos.z, (p.specialty === 'stopper' ? 8.35 : 7.9) * staminaFactor * paceFactor, dt);
      // Seul le premier défenseur déclenche le duel ; les partenaires gardent leur structure.
      if (ball.owner && ball.owner.team !== p.team && distBall < 1.55 && p.actionCooldown <= 0 && aiDecisionRoll(p, 'tackle-trigger') < 1 - Math.exp(-dt * 2.1)) {
        actions.tryTackle(p);
      }
    } else if (!teamHasBall && isCover && distBall < pressRange * 0.9) {
      // Le deuxième défenseur ferme la ligne de passe au lieu de poursuivre le porteur.
      const coverTarget = getDefensiveCoverTarget(p, ball, context?.opponents || [], attackDir);
      const spacedCover = getSpacedDefensiveTarget(p, coverTarget, context?.teammates);
      this.steerPlayer(p, spacedCover.x, spacedCover.z, 6.6 * staminaFactor * paceFactor, dt);
    } else if (teamHasBall) {
      // Soutien sans ballon, y compris lorsque le porteur est un joueur humain.
      const owner = ball.owner;
      const support = getSupportTarget(p, owner, players, attackDir, context?.opponents, inTransition);
      const spaced = getSpacedSupportTarget(p, support, context?.teammates);
      const ownerDir = owner ? Math.sign((owner.pos.x - p.pos.x) * attackDir) : 0;
      const tx = clamp(spaced.x + ownerDir * attackDir * 0.45, -PITCH.HALF_L + 2, PITCH.HALF_L - 2);
      const tz = spaced.z;
      this.steerPlayer(p, tx, tz, 6.9 * staminaFactor * paceFactor, dt);
    } else {
      // Les joueurs éloignés du ballon protègent l'axe et les menaces proches,
      // au lieu de simplement glisser tous vers la position du ballon.
      const opponents = context?.opponents || players.filter((other) => other.team !== p.team && other.role !== 'GK');
      const shape = getDefensiveShapeTarget(p, ball, opponents, attackDir, this.mentality);
      const spacedShape = getSpacedDefensiveTarget(p, shape, context?.teammates);
      this.steerPlayer(p, spacedShape.x, spacedShape.z, 6.7 * staminaFactor * paceFactor, dt);
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