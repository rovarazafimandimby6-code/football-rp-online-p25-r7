const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUBJECT_RE = /^[A-Za-z0-9_-]{8,255}$/;

function validateIdentity({ accountId, googleSubject, googleIdentityVerified }) {
  if (typeof accountId !== "string" || !UUID_RE.test(accountId)) throw new Error("INVALID_ACCOUNT_ID");
  if (typeof googleSubject !== "string" || !SUBJECT_RE.test(googleSubject)) throw new Error("INVALID_GOOGLE_SUBJECT");
  if (googleIdentityVerified !== true) throw new Error("GOOGLE_IDENTITY_NOT_VERIFIED");
}

function auditId() {
  return crypto.randomUUID();
}

/**
 * D1-backed one-to-one mapping between verified Google OIDC subjects and P27
 * player accounts. Callers must validate the ID token before setting the
 * googleIdentityVerified guard.
 */
export class D1GoogleIdentityRepository {
  constructor(db, { now = () => Date.now() } = {}) {
    if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
      throw new Error("D1_DATABASE_BINDING_REQUIRED");
    }
    this.db = db;
    this.now = now;
  }

  async getByGoogleSubject(googleSubject) {
    if (typeof googleSubject !== "string" || !SUBJECT_RE.test(googleSubject)) return null;
    const row = await this.db.prepare(
      "SELECT account_id, google_subject, linked_at FROM p27_google_identity_links WHERE google_subject = ?"
    ).bind(googleSubject).first();
    return row ? { accountId: row.account_id, linkedAt: row.linked_at } : null;
  }

  async getByAccountId(accountId) {
    if (typeof accountId !== "string" || !UUID_RE.test(accountId)) return null;
    const row = await this.db.prepare(
      "SELECT account_id, google_subject, linked_at FROM p27_google_identity_links WHERE account_id = ?"
    ).bind(accountId).first();
    return row ? { googleSubject: row.google_subject, linkedAt: row.linked_at } : null;
  }

  async linkInitial({ accountId, googleSubject, googleIdentityVerified = false } = {}) {
    validateIdentity({ accountId, googleSubject, googleIdentityVerified });
    const linkedAt = new Date(this.now()).toISOString();
    await this.db.batch([
      this.db.prepare(
        "INSERT INTO p27_google_identity_links (account_id, google_subject, linked_at) VALUES (?, ?, ?)"
      ).bind(accountId, googleSubject, linkedAt),
      this.db.prepare(
        "INSERT INTO p27_google_identity_audit (id, account_id, event_type, previous_subject, new_subject, occurred_at) VALUES (?, ?, 'google_linked', NULL, NULL, ?)"
      ).bind(auditId(), accountId, linkedAt),
    ]);
    return { accountId, linkedAt };
  }

  async linkInitialForActiveSession({
    accountId, googleSubject, googleIdentityVerified = false, sessionTokenHash,
  } = {}) {
    validateIdentity({ accountId, googleSubject, googleIdentityVerified });
    if (typeof sessionTokenHash !== "string" || !/^[a-f0-9]{64}$/i.test(sessionTokenHash)) {
      throw new Error("INVALID_SESSION_TOKEN_HASH");
    }
    const linkedAt = new Date(this.now()).toISOString();
    const results = await this.db.batch([
      this.db.prepare(
        "INSERT INTO p27_google_identity_links (account_id, google_subject, linked_at) " +
        "SELECT ?, ?, ? WHERE EXISTS (" +
        "SELECT 1 FROM p27_account_sessions WHERE token_hash = ? AND account_id = ? AND expires_at > ?)"
      ).bind(accountId, googleSubject, linkedAt, sessionTokenHash, accountId, this.now()),
      this.db.prepare(
        "INSERT INTO p27_google_identity_audit (id, account_id, event_type, previous_subject, new_subject, occurred_at) " +
        "SELECT ?, ?, 'google_linked', NULL, NULL, ? WHERE EXISTS (" +
        "SELECT 1 FROM p27_google_identity_links WHERE account_id = ? AND google_subject = ? AND linked_at = ?)"
      ).bind(auditId(), accountId, linkedAt, accountId, googleSubject, linkedAt),
    ]);
    if (Number(results?.[0]?.meta?.changes) !== 1) throw new Error("SESSION_EXPIRED");
    if (Number(results?.[1]?.meta?.changes) !== 1) throw new Error("GOOGLE_IDENTITY_LINK_AUDIT_FAILED");
    return { accountId, linkedAt };
  }

  async transfer({
    accountId, currentGoogleSubject, newGoogleSubject,
    currentIdentityVerified = false, newIdentityVerified = false, confirmed = false,
  } = {}) {
    validateIdentity({
      accountId, googleSubject: currentGoogleSubject,
      googleIdentityVerified: currentIdentityVerified,
    });
    if (typeof newGoogleSubject !== "string" || !SUBJECT_RE.test(newGoogleSubject)) {
      throw new Error("INVALID_GOOGLE_SUBJECT");
    }
    if (newIdentityVerified !== true) throw new Error("GOOGLE_IDENTITY_NOT_VERIFIED");
    if (confirmed !== true) throw new Error("GOOGLE_TRANSFER_NOT_CONFIRMED");
    if (currentGoogleSubject === newGoogleSubject) throw new Error("GOOGLE_IDENTITY_UNCHANGED");

    const current = await this.getByAccountId(accountId);
    if (!current || current.googleSubject !== currentGoogleSubject) {
      throw new Error("CURRENT_GOOGLE_MISMATCH");
    }

    const transferredAt = new Date(this.now()).toISOString();
    const results = await this.db.batch([
      this.db.prepare(
        "UPDATE p27_google_identity_links SET google_subject = ?, linked_at = ? WHERE account_id = ? AND google_subject = ?"
      ).bind(newGoogleSubject, transferredAt, accountId, currentGoogleSubject),
      this.db.prepare(
        "INSERT INTO p27_google_identity_audit (id, account_id, event_type, previous_subject, new_subject, occurred_at) " +
        "SELECT ?, ?, 'google_transferred', ?, ?, ? WHERE EXISTS (" +
        "SELECT 1 FROM p27_google_identity_links WHERE account_id = ? AND google_subject = ? AND linked_at = ?)"
      ).bind(
        auditId(), accountId, currentGoogleSubject, newGoogleSubject, transferredAt,
        accountId, newGoogleSubject, transferredAt,
      ),
    ]);
    if (Number(results?.[0]?.meta?.changes) !== 1) throw new Error("CURRENT_GOOGLE_MISMATCH");
    return { accountId, linkedAt: transferredAt };
  }
}
