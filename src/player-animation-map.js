const RULES = {
  idle: [/^idle/i, /stand/i],
  walk: [/^walk/i],
  jog: [/jog/i, /run.*loop/i, /^run/i],
  sprint: [/sprint/i],
  pass: [/pass/i, /kick.*short/i, /short.*kick/i],
  shoot: [/shoot/i, /shot/i, /strike/i, /volley/i, /kick/i],
  control: [/dribbl/i, /control.*ball/i],
  tackle: [/tackle/i, /slide/i],
  dive: [/dive/i, /save.*goal/i, /goal.*save/i],
  celebrate: [/celebrat/i, /victory/i, /cheer/i, /goal.*celebrat/i]
};

/** Resolve optional animation clips by semantic name; keep procedural fallback when absent. */
export function resolvePlayerAnimationClip(clipNames, state, speed = 0) {
  const names = (Array.isArray(clipNames) ? clipNames : [])
    .map((clip) => typeof clip === 'string' ? clip : clip?.name)
    .filter((name) => typeof name === 'string' && name.length > 0);
  const key = state === 'run' ? (speed > 7.5 ? 'sprint' : 'jog') : state;
  const patterns = RULES[key] || [];
  for (const pattern of patterns) {
    const match = names.find((name) => pattern.test(name));
    if (match) return match;
  }
  return null;
}

export function isLoopingPlayerAnimation(state) {
  return ['idle', 'walk', 'run', 'control'].includes(state);
}
