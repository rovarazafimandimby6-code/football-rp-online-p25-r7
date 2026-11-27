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

/** Resolve optional animation clips by semantic name; keep procedural fallback when absent. */
export function resolvePlayerAnimationClip(clipNames, state, speed = 0) {
  const names = (Array.isArray(clipNames) ? clipNames : [])
    .map((clip) => typeof clip === 'string' ? clip : clip?.name)
    .filter((name) => typeof name === 'string' && name.length > 0);
  const keys = state === 'run'
    ? (speed > 7.5 ? ['sprint', 'jog'] : ['jog', 'sprint'])
    : [state];
  for (const key of keys) {
    for (const pattern of RULES[key] || []) {
      const match = names.find((name) => pattern.test(name));
      if (match) return match;
    }
  }
  return null;
}

export function isLoopingPlayerAnimation(state) {
  return ['idle', 'walk', 'run', 'control'].includes(state);
}
