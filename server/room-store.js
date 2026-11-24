import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

/** Atomic private checkpoints for live rooms. Player reconnect tokens stay outside public result archives. */
export class JsonRoomStore {
  constructor(directory, { maxRooms = 100 } = {}) {
    this.directory = path.resolve(directory);
    this.file = path.join(this.directory, 'active-rooms.json');
    this.maxRooms = Math.max(1, Math.min(500, Math.floor(maxRooms) || 100));
    mkdirSync(this.directory, { recursive: true });
  }

  readAll() {
    let parsed;
    try { parsed = JSON.parse(readFileSync(this.file, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') return [];
      throw new Error('ROOM_STORE_CORRUPT');
    }
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.rooms)) throw new Error('ROOM_STORE_CORRUPT');
    const ids = new Set();
    for (const room of parsed.rooms) {
      if (!room || typeof room.id !== 'string' || !room.id || ids.has(room.id) ||
          !['lobby', 'playing', 'halftime'].includes(room.phase) ||
          !Array.isArray(room.players) || !room.score ||
          !Number.isSafeInteger(room.score.blue) || room.score.blue < 0 ||
          !Number.isSafeInteger(room.score.red) || room.score.red < 0 ||
          !Number.isFinite(room.elapsedMs) || room.elapsedMs < 0) throw new Error('ROOM_STORE_CORRUPT');
      ids.add(room.id);
    }
    return parsed.rooms;
  }

  save(snapshot) {
    this.saveMany([snapshot]);
    return snapshot;
  }

  saveMany(snapshots) {
    if (!Array.isArray(snapshots) || snapshots.length === 0) return 0;
    const incoming = new Map();
    for (const snapshot of snapshots) {
      if (!snapshot || typeof snapshot.id !== 'string' || !snapshot.id ||
          !['lobby', 'playing', 'halftime'].includes(snapshot.phase) ||
          !Array.isArray(snapshot.players) || !snapshot.score ||
          !Number.isSafeInteger(snapshot.score.blue) || snapshot.score.blue < 0 ||
          !Number.isSafeInteger(snapshot.score.red) || snapshot.score.red < 0 ||
          !Number.isFinite(snapshot.elapsedMs) || snapshot.elapsedMs < 0 ||
          incoming.has(snapshot.id)) throw new Error('INVALID_ROOM_CHECKPOINT');
      incoming.set(snapshot.id, JSON.parse(JSON.stringify(snapshot)));
    }
    const existing = this.readAll();
    const existingIds = new Set(existing.map(room => room.id));
    const newIds = [...incoming.keys()].filter(id => !existingIds.has(id));
    if (existing.length + newIds.length > this.maxRooms) throw new Error('ROOM_STORE_CAPACITY_EXCEEDED');
    const rooms = existing.filter(room => !incoming.has(room.id));
    rooms.push(...incoming.values());
    rooms.sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));
    const temporary = this.file + '.' + process.pid + '.' + randomUUID() + '.tmp';
    try {
      writeFileSync(temporary, JSON.stringify({ version: 1, rooms }), { mode: 0o600 });
      renameSync(temporary, this.file);
    } catch (error) {
      try { unlinkSync(temporary); } catch {}
      throw error;
    }
    return incoming.size;
  }

  delete(roomId) {
    const rooms = this.readAll().filter(room => room.id !== roomId);
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify({ version: 1, rooms }), { mode: 0o600 });
      renameSync(temporary, this.file);
    } catch (error) {
      try { unlinkSync(temporary); } catch {}
      throw error;
    }
    return rooms.length;
  }
}
