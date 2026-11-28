const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLAYER_ID_RE = /^FRP-[0-9]{6}$/;
const EVENT_TYPES = new Set(["signing", "transfer", "renewal", "termination", "expiry", "loan", "loan-return"]);
const STATUSES = new Set(["active", "terminated", "expired", "free-agent"]);
const EVENT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const CLUB_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

function validateIdentity(accountId, playerId) {
  if (typeof accountId !== "string" || !UUID_RE.test(accountId)) throw new Error("INVALID_ACCOUNT_ID");
  if (typeof playerId !== "string" || !PLAYER_ID_RE.test(playerId)) throw new Error("INVALID_PLAYER_ID");
}
function normalizeContract(input, playerId) {
  if (input === null || input === undefined) return { status: "free-agent", clubId: null, json: null };
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_PLAYER_CONTRACT");
  const contract = structuredClone(input);
  const status = contract.status;
  if (typeof status !== "string" || !STATUSES.has(status) || status === "free-agent") throw new Error("INVALID_PLAYER_CONTRACT");
  const rawClubId = contract.clubId;
  if (rawClubId !== null && rawClubId !== undefined &&
      (typeof rawClubId !== "string" || !CLUB_ID_RE.test(rawClubId))) throw new Error("INVALID_PLAYER_CONTRACT");
  const clubId = rawClubId ?? null;
  if (status === "active" && !clubId) throw new Error("INVALID_PLAYER_CONTRACT");
  if (contract.playerId !== undefined && contract.playerId !== playerId) throw new Error("PLAYER_IDENTITY_MISMATCH");
  contract.playerId = playerId;
  const json = JSON.stringify(contract);
  if (json.length > 8_192) throw new Error("PLAYER_CONTRACT_TOO_LARGE");
  return { status, clubId, json };
}
function mapCurrent(row) {
  if (!row) return null;
  let contract = null;
  try { contract = row.contract_json ? JSON.parse(row.contract_json) : null; } catch { throw new Error("PLAYER_CONTRACT_CORRUPT"); }
  return {
    playerId: row.player_id, revision: Number(row.revision), status: row.contract_status,
    clubId: row.club_id || null, contract, updatedAt: Number(row.updated_at),
  };
}
function mapEvent(row) {
  let contract = null;
  try { contract = row.contract_json ? JSON.parse(row.contract_json) : null; } catch { throw new Error("PLAYER_CONTRACT_CORRUPT"); }
  return {
    eventId: row.event_id, eventType: row.event_type, revision: Number(row.revision),
    status: row.contract_status, clubId: row.club_id || null,
    occurredAt: Number(row.occurred_at), contract,
  };
}

/** Internal D1 repository. Call only after authenticating the trusted transfer authority. */
export class D1PlayerContractRepository {
  constructor(db) {
    if (!db || typeof db.prepare !== "function") throw new Error("D1_DATABASE_BINDING_REQUIRED");
    this.db = db;
  }

  async applyEvent(accountId, playerId, {
    eventId, eventType, expectedRevision, occurredAt, contract = null,
  } = {}) {
    validateIdentity(accountId, playerId);
    const id = eventId;
    if (typeof id !== "string" || !EVENT_ID_RE.test(id) || !EVENT_TYPES.has(eventType) ||
        !Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
        !Number.isSafeInteger(occurredAt) || occurredAt < 0) throw new Error("INVALID_CONTRACT_EVENT");
    const normalized = normalizeContract(contract, playerId);
    const existingEvent = await this.db.prepare(
      "SELECT * FROM p27_player_contract_events WHERE account_id = ? AND event_id = ?"
    ).bind(accountId, id).first();
    if (existingEvent) {
      const sameCommand = existingEvent.player_id === playerId &&
        existingEvent.event_type === eventType &&
        Number(existingEvent.expected_revision) === expectedRevision &&
        Number(existingEvent.occurred_at) === occurredAt &&
        existingEvent.contract_status === normalized.status &&
        (existingEvent.club_id || null) === normalized.clubId &&
        (existingEvent.contract_json || null) === normalized.json;
      if (!sameCommand) throw new Error("CONTRACT_EVENT_ID_CONFLICT");
      return { ok: true, duplicate: true, current: await this.getCurrent(accountId) };
    }
    try {
      const inserted = await this.db.prepare(`
        INSERT INTO p27_player_contract_events (
          account_id, player_id, event_id, event_type, expected_revision, revision,
          contract_status, club_id, contract_json, occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        accountId, playerId, id, eventType, expectedRevision, expectedRevision + 1,
        normalized.status, normalized.clubId, normalized.json, occurredAt,
      ).run();
      const current = await this.getCurrent(accountId);
      return { ok: true, duplicate: false, changes: Number(inserted?.meta?.changes || 0), current };
    } catch (error) {
      const message = String(error?.message || "");
      if (message.includes("CONTRACT_REVISION_CONFLICT")) {
        const prior = await this.db.prepare(
          "SELECT * FROM p27_player_contract_events WHERE account_id = ? AND event_id = ?"
        ).bind(accountId, id).first();
        const sameCommand = prior && prior.player_id === playerId &&
          prior.event_type === eventType &&
          Number(prior.expected_revision) === expectedRevision &&
          Number(prior.occurred_at) === occurredAt &&
          prior.contract_status === normalized.status &&
          (prior.club_id || null) === normalized.clubId &&
          (prior.contract_json || null) === normalized.json;
        if (sameCommand) return { ok: true, duplicate: true, current: await this.getCurrent(accountId) };
        throw new Error("CONTRACT_REVISION_CONFLICT");
      }
      if (message.includes("PLAYER_IDENTITY_MISMATCH") || message.includes("FOREIGN KEY")) throw new Error("PLAYER_IDENTITY_MISMATCH");
      if (message.includes("UNIQUE constraint failed") && message.includes("event_id")) throw new Error("CONTRACT_EVENT_ID_CONFLICT");
      throw error;
    }
  }

  async getCurrent(accountId) {
    if (typeof accountId !== "string" || !UUID_RE.test(accountId)) throw new Error("INVALID_ACCOUNT_ID");
    const row = await this.db.prepare(
      "SELECT * FROM p27_player_contracts WHERE account_id = ?"
    ).bind(accountId).first();
    return mapCurrent(row);
  }

  async getHistory(accountId, { limit = 50, beforeRevision = null } = {}) {
    if (typeof accountId !== "string" || !UUID_RE.test(accountId)) throw new Error("INVALID_ACCOUNT_ID");
    const pageSize = Number.isSafeInteger(limit) ? Math.max(1, Math.min(100, limit)) : 50;
    if (beforeRevision !== null && (!Number.isSafeInteger(beforeRevision) || beforeRevision < 1))
      throw new Error("INVALID_CONTRACT_CURSOR");
    const rows = beforeRevision === null
      ? await this.db.prepare(`SELECT * FROM p27_player_contract_events
          WHERE account_id = ? ORDER BY revision DESC LIMIT ?`).bind(accountId, pageSize + 1).all()
      : await this.db.prepare(`SELECT * FROM p27_player_contract_events
          WHERE account_id = ? AND revision < ? ORDER BY revision DESC LIMIT ?`)
        .bind(accountId, beforeRevision, pageSize + 1).all();
    const events = (rows.results || []).slice(0, pageSize).map(mapEvent);
    const hasMore = (rows.results || []).length > pageSize;
    return { events, nextCursor: hasMore ? events.at(-1)?.revision ?? null : null };
  }
}
