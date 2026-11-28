import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

/** Small atomic JSON store for completed match reports (never stores player tokens). */
export class JsonResultStore {
  constructor(directory, { maxResults = 500 } = {}) {
    this.directory = path.resolve(directory);
    this.file = path.join(this.directory, 'completed-results.json');
    this.maxResults = Math.max(1, Math.min(5000, Math.floor(maxResults) || 500));
    mkdirSync(this.directory, { recursive: true });
  }

  readAll() {
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      return Array.isArray(parsed) ? parsed.filter(row => row && typeof row.roomId === 'string' && row.phase === 'fulltime') : [];
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw new Error('RESULT_STORE_CORRUPT');
    }
  }

  save(result) {
    if (!result || typeof result.roomId !== 'string' || !result.roomId.trim() || result.roomId.length > 128 || result.phase !== 'fulltime' ||
        !result.score || !Number.isSafeInteger(result.score.blue) || result.score.blue < 0 ||
        !Number.isSafeInteger(result.score.red) || result.score.red < 0 ||
        !Number.isFinite(result.finalizedAt)) throw new Error('INVALID_RESULT');
    const rows = this.readAll().filter(row => row.roomId !== result.roomId);
    rows.push(JSON.parse(JSON.stringify(result)));
    rows.sort((a, b) => Number(b.finalizedAt) - Number(a.finalizedAt));
    // A unique sibling temp file prevents two writes in one process from sharing a temp path.
    const temporary = `${this.file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(rows.slice(0, this.maxResults)), { mode: 0o600 });
      renameSync(temporary, this.file);
    } catch (error) {
      try { unlinkSync(temporary); } catch {}
      throw error;
    }
    return result;
  }

  get(roomId) { return this.readAll().find(row => row.roomId === roomId) ?? null; }
  list({ limit = 20, offset = 0 } = {}) {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 20)));
    const safeOffset = Math.max(0, Math.min(5000, Math.floor(Number(offset) || 0)));
    return this.readAll().slice(safeOffset, safeOffset + safeLimit);
  }

  page({ limit = 20, offset = 0 } = {}) {
    const rows = this.readAll();
    const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 20)));
    const safeOffset = Math.max(0, Math.min(5000, Math.floor(Number(offset) || 0)));
    const results = rows.slice(safeOffset, safeOffset + safeLimit);
    return { results, pagination: { limit: safeLimit, offset: safeOffset, total: rows.length, hasMore: safeOffset + results.length < rows.length, nextOffset: safeOffset + results.length < rows.length ? safeOffset + results.length : null } };
  }
}
