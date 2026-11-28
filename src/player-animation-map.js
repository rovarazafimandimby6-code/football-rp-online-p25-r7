const RULES = {
  idle: [/^Idle_Loop$/i, /^idle/i, /stand/i],
  walk: [/^Walk_Loop$/i, /^walk/i],
  jog: [/^Jog_Fwd_Loop$/i, /jog/i, /run.*loop/i, /^run/i],
  sprint: [/^Sprint_Loop$/i, /sprint/i],
  pass: [/pass/i, /kick.*short/i, /short.*kick/i],
  shoot: [/shoot/i, /shot/i, /strike/i, /volley/i, /kick/i],
  control: [/dribbl/i, /control.*ball/i],
  tackle: [/tackle/i, /slide/i],
  dive: [/dive/i, /save.*goal/i, /goal.*save/i],
  celebrate: [/celebrat/i, /victory/i, /cheer/i, /goal.*celebrat/i]
};

const LOOPING_STATES = new Set(['idle', 'walk', 'run', 'control']);

function findClip(clipNames, patterns) {
  if (!Array.isArray(clipNames) || !patterns) return null;
  for (const pattern of patterns) {
    for (const clip of clipNames) {
      const name = typeof clip === 'string' ? clip : clip?.name;
      if (typeof name === 'string' && name.length > 0 && pattern.test(name)) return name;
    }
  }
  return null;
}

/** Resolve optional animation clips without per-frame array mapping or filtering. */
export function resolvePlayerAnimationClip(clipNames, state, speed = 0) {
  if (state === 'run') {
    const primary = speed > 7.5 ? RULES.sprint : RULES.jog;
    const secondary = speed > 7.5 ? RULES.jog : RULES.sprint;
    return findClip(clipNames, primary) || findClip(clipNames, secondary);
  }
  return findClip(clipNames, RULES[state]);
}


/** Build a semantic clip lookup once when a 3D model is mounted. */
export function createPlayerAnimationClipMap(clipNames) {
  return {
    idle: resolvePlayerAnimationClip(clipNames, 'idle'),
    walk: resolvePlayerAnimationClip(clipNames, 'walk'),
    jog: resolvePlayerAnimationClip(clipNames, 'run', 0),
    sprint: resolvePlayerAnimationClip(clipNames, 'run', 8),
    pass: resolvePlayerAnimationClip(clipNames, 'pass'),
    shoot: resolvePlayerAnimationClip(clipNames, 'shoot'),
    control: resolvePlayerAnimationClip(clipNames, 'control'),
    tackle: resolvePlayerAnimationClip(clipNames, 'tackle'),
    dive: resolvePlayerAnimationClip(clipNames, 'dive'),
    celebrate: resolvePlayerAnimationClip(clipNames, 'celebrate')
  };
}

/** Select from the precomputed map without scanning GLTF names during a frame. */
export function resolveCachedPlayerAnimationClip(clipMap, state, speed = 0) {
  if (!clipMap) return null;
  if (state === 'run') {
    return speed > 7.5
      ? (clipMap.sprint || clipMap.jog || null)
      : (clipMap.jog || clipMap.sprint || null);
  }
  return clipMap[state] || null;
}

export function isLoopingPlayerAnimation(state) {
  return LOOPING_STATES.has(state);
}


/** Keep locomotion cadence proportional to movement speed without abrupt playback jumps. */
export function resolvePlayerAnimationTimeScale(state, speed = 0) {
  const value = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  if (state === 'run') return Math.max(0.82, Math.min(1.2, value / 7.5));
  if (state === 'walk') return Math.max(0.8, Math.min(1.15, value / 3.2));
  return 1;
}
