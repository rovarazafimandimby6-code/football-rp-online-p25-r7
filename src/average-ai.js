// Deliberately ordinary football decisions for a disconnected human avatar.
// Stable per player/time bucket so the server stays deterministic across ticks.
function hashRoll(player, elapsedMs, action) {
  const id = String(player?.id ?? 'unknown');
  const bucket = Math.floor(Math.max(0, Number(elapsedMs) || 0) / 850);
  let hash = 2166136261;
  const input = `${id}:${bucket}:${action}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

export function averageAiShouldAct(player, elapsedMs, action, probability) {
  const chance = Math.max(0, Math.min(1, Number(probability) || 0));
  return hashRoll(player, elapsedMs, action) < chance;
}

export function averageAiAim(player, elapsedMs, facing, action = 'kick') {
  const roll = hashRoll(player, elapsedMs, `${action}-accuracy`);
  // Up to roughly 23 degrees of error: basic technique with visibly imperfect execution.
  return facing + (roll * 2 - 1) * 0.40;
}

export function averageAiMovement(player, elapsedMs, x, z) {
  const drift = (hashRoll(player, elapsedMs, 'movement') * 2 - 1) * 0.30;
  const scale = 0.70;
  const length = Math.hypot(x, z) || 1;
  const nx = x / length, nz = z / length;
  return {
    x: (nx - nz * drift) * scale,
    z: (nz + nx * drift) * scale,
  };
}
