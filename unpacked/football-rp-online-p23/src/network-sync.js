/** Lightweight client-side snapshot buffer. It smooths remote avatars; it is not a server. */
export class SnapshotBuffer {
  constructor({ maxSnapshots = 8, interpolationDelay = 0.1 } = {}) {
    this.maxSnapshots = Math.max(2, Math.floor(maxSnapshots));
    this.interpolationDelay = Math.max(0, interpolationDelay);
    this.snapshots = new Map();
    this.lastSequence = new Map();
  }

  push(entityId, snapshot) {
    if (entityId == null || !snapshot || !Number.isFinite(snapshot.time) ||
        !Number.isFinite(snapshot.x) || !Number.isFinite(snapshot.z)) return false;
    const seq = Number.isFinite(snapshot.sequence) ? snapshot.sequence : null;
    const previous = this.lastSequence.get(entityId);
    if (seq !== null && previous !== undefined && seq <= previous) return false;
    const list = this.snapshots.get(entityId) || [];
    if (list.length && snapshot.time < list[list.length - 1].time) return false;
    list.push({ time: snapshot.time, x: snapshot.x, z: snapshot.z, facing: Number.isFinite(snapshot.facing) ? snapshot.facing : 0, sequence: seq });
    while (list.length > this.maxSnapshots) list.shift();
    this.snapshots.set(entityId, list);
    if (seq !== null) this.lastSequence.set(entityId, seq);
    return true;
  }

  sample(entityId, renderTime) {
    const list = this.snapshots.get(entityId);
    if (!list?.length || !Number.isFinite(renderTime)) return null;
    const target = renderTime - this.interpolationDelay;
    if (target <= list[0].time) return { ...list[0] };
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1], b = list[i];
      if (target <= b.time) {
        const t = b.time === a.time ? 1 : (target - a.time) / (b.time - a.time);
        let delta = Math.atan2(Math.sin(b.facing - a.facing), Math.cos(b.facing - a.facing));
        return { time: target, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, facing: a.facing + delta * t };
      }
    }
    return { ...list[list.length - 1] };
  }

  remove(entityId) { this.snapshots.delete(entityId); this.lastSequence.delete(entityId); }
  clear() { this.snapshots.clear(); this.lastSequence.clear(); }
}
