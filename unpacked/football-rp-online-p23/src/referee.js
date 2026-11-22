/** Conservative foul classifier; avoids penalising ordinary shoulder-to-shoulder play. */
export function classifyTackle({ tackler, victim, distance, closingSpeed = 0 }) {
  if (!tackler || !victim || tackler.team === victim.team || distance > 1.35) return { foul: false, reason: 'no-contact' };
  const dx = tackler.pos.x - victim.pos.x;
  const dz = tackler.pos.z - victim.pos.z;
  const len = Math.hypot(dx, dz) || 1;
  const behind = (dx * Math.sin(victim.facing) + dz * Math.cos(victim.facing)) / len;
  if (behind < -0.2 && closingSpeed > 2.2) return { foul: true, reason: 'rear-challenge' };
  if (closingSpeed > 9.5) return { foul: true, reason: 'excessive-force' };
  return { foul: false, reason: 'fair-challenge' };
}
