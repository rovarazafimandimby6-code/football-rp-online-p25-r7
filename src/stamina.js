/** Stamina model shared by human and AI footballers. Values are normalized 0..1. */
export function updateStamina(player, dt, { sprinting = false, effort = 1, endurance = 50 } = {}) {
  if (!player || !Number.isFinite(dt) || dt <= 0) return player?.stamina ?? 1;
  const delta = Math.min(dt, 0.1);
  const current = Number.isFinite(player.stamina) ? Math.max(0, Math.min(1, player.stamina)) : 1;
  const load = Math.max(0.5, Math.min(1.8, Number.isFinite(effort) ? effort : 1));
  const enduranceValue = Math.max(1, Math.min(99, Number.isFinite(Number(endurance)) ? Number(endurance) : 50));
  const drainFactor = Math.max(0.7, Math.min(1.3, 1.3 - enduranceValue * 0.006));
  const recoveryFactor = Math.max(0.7, Math.min(1.3, 0.7 + enduranceValue / 166.6667));
  const next = sprinting
    ? current - delta * 0.28 * load * drainFactor
    : current + delta * (current < 0.55 ? 0.15 : 0.18) * recoveryFactor;
  player.stamina = Math.max(0, Math.min(1, next));
  return player.stamina;
}

export function staminaSpeedFactor(stamina) {
  const value = Number.isFinite(stamina) ? Math.max(0, Math.min(1, stamina)) : 1;
  return 0.72 + value * 0.28;
}
