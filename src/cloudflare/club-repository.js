const MAX_MONEY = 1_000_000_000_000;
const CLUB_ID_RE = /^[a-z0-9][a-z0-9-]{0,47}$/i;
const ACCOUNT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeMoney = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_MONEY;

function validateClubId(value) {
  if (typeof value !== "string" || !CLUB_ID_RE.test(value)) throw new Error("INVALID_CLUB_ID");
  return value;
}
function validateAccountId(value, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !ACCOUNT_ID_RE.test(value)) throw new Error("INVALID_ACCOUNT_ID");
  return value;
}

/** D1 foundation for canonical club ownership and the collective treasury. */
export class D1ClubRepository {
  constructor(db, { now = () => Date.now() } = {}) {
    if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
      throw new Error("D1_DATABASE_BINDING_REQUIRED");
    }
    this.db = db;
    this.now = now;
  }

  async getClub(clubId) {
    validateClubId(clubId);
    const row = await this.db.prepare(
      "SELECT c.club_id AS clubId, c.owner_account_id AS ownerAccountId, " +
      "c.ownership_revision AS ownershipRevision, f.opening_balance AS openingBalance, " +
      "f.balance, f.revision AS financeRevision " +
      "FROM p27_clubs c LEFT JOIN p27_club_finance_accounts f ON f.club_id=c.club_id " +
      "WHERE c.club_id=?"
    ).bind(clubId).first();
    return row || null;
  }

  async listOwnedClubs(accountId) {
    validateAccountId(accountId);
    const result = await this.db.prepare(
      "SELECT c.club_id AS clubId, c.ownership_revision AS ownershipRevision, " +
      "f.balance, f.revision AS financeRevision " +
      "FROM p27_clubs c JOIN p27_club_finance_accounts f ON f.club_id=c.club_id " +
      "WHERE c.owner_account_id=? ORDER BY c.club_id"
    ).bind(accountId).all();
    return result?.results || [];
  }

  async importClub({ clubId, ownerAccountId = null, openingBalance, now = this.now() } = {}) {
    validateClubId(clubId);
    validateAccountId(ownerAccountId, { nullable:true });
    if (!safeMoney(openingBalance) || !Number.isSafeInteger(now) || now < 0) {
      return { ok:false, reason:"invalid-import" };
    }
    const at = new Date(now).toISOString();
    const existing = await this.getClub(clubId);
    if (existing) {
      if (existing.ownerAccountId !== ownerAccountId ||
          existing.openingBalance !== openingBalance || existing.balance !== openingBalance) {
        return { ok:false, reason:"import-conflict", current:existing };
      }
      return { ok:true, duplicate:true, club:existing };
    }
    try {
      await this.db.batch([
        this.db.prepare(
          "INSERT INTO p27_clubs (club_id,owner_account_id,ownership_revision,created_at,updated_at) VALUES (?,?,0,?,?)"
        ).bind(clubId,ownerAccountId,at,at),
        this.db.prepare(
          "INSERT INTO p27_club_finance_accounts (club_id,opening_balance,balance,revision,created_at,updated_at) VALUES (?,?,?,0,?,?)"
        ).bind(clubId,openingBalance,openingBalance,at,at),
      ]);
    } catch (error) {
      const message = String(error?.message || "");
      if (message.includes("p27_one_club_per_owner") || message.includes("UNIQUE constraint failed: p27_clubs.owner_account_id")) {
        return { ok:false, reason:"owner-already-has-club" };
      }
      throw error;
    }
    const current = await this.getClub(clubId);
    if (!current || current.ownerAccountId !== ownerAccountId ||
        current.openingBalance !== openingBalance || current.balance !== openingBalance) {
      return { ok:false, reason:"import-conflict", current };
    }
    return { ok:true, duplicate:false, club:current };
  }

  async transferOwnership(clubId, {
    previousOwnerAccountId, newOwnerAccountId, expectedRevision, eventId, now = this.now()
  } = {}) {
    validateClubId(clubId);
    validateAccountId(previousOwnerAccountId, { nullable:true });
    validateAccountId(newOwnerAccountId, { nullable:true });
    if (previousOwnerAccountId === newOwnerAccountId) return { ok:false, reason:"owner-unchanged" };
    if (newOwnerAccountId === null && previousOwnerAccountId === null) return { ok:false, reason:"owner-unchanged" };
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 ||
        typeof eventId !== "string" || !/^[a-zA-Z0-9_-]{1,96}$/.test(eventId) ||
        !Number.isSafeInteger(now) || now < 0) return { ok:false, reason:"invalid-transfer" };
    const type = newOwnerAccountId === null ? "released" : previousOwnerAccountId === null ? "imported" : "transferred";
    if (type === "imported") return { ok:false, reason:"use-import-for-initial-owner" };
    const at = new Date(now).toISOString();
    try {
      const result = await this.db.batch([
        this.db.prepare(
          "UPDATE p27_clubs SET owner_account_id=?, ownership_revision=ownership_revision+1, updated_at=? " +
          "WHERE club_id=? AND owner_account_id IS ? AND ownership_revision=?"
        ).bind(newOwnerAccountId,at,clubId,previousOwnerAccountId,expectedRevision),
        this.db.prepare(
          "INSERT INTO p27_club_ownership_events " +
          "(club_id,event_id,event_type,previous_owner_account_id,new_owner_account_id,ownership_revision,created_at) " +
          "SELECT ?,?,?,?,?,?,? WHERE changes()=1"
        ).bind(clubId,eventId,type,previousOwnerAccountId,newOwnerAccountId,expectedRevision+1,at),
      ]);
      if (Number(result?.[0]?.meta?.changes) !== 1) {
        const replay = await this.db.prepare(
          "SELECT previous_owner_account_id,new_owner_account_id FROM p27_club_ownership_events WHERE club_id=? AND event_id=?"
        ).bind(clubId,eventId).first();
        if (replay && replay.previous_owner_account_id === previousOwnerAccountId &&
            replay.new_owner_account_id === newOwnerAccountId) return { ok:true, duplicate:true, club:await this.getClub(clubId) };
        const current = await this.getClub(clubId);
        return { ok:false, reason:current ? "ownership-conflict" : "club-not-found", current };
      }
      return { ok:true, duplicate:false, club:await this.getClub(clubId) };
    } catch (error) {
      if (String(error?.message || "").includes("p27_one_club_per_owner")) {
        return { ok:false, reason:"owner-already-has-club" };
      }
      throw error;
    }
  }

  async postFinanceEntry(clubId, entry = {}) {
    validateClubId(clubId);
    const { id, category, amount, direction, description, referenceId = null, createdAt = this.now() } = entry;
    const allowed = new Set(["sponsorship","ticketing","matchday","merchandise","transfer-income","transfer-expense","wages","staff","stadium-maintenance","medical","training","travel","competition-prize","loan","other","shop-purchase","shop-resale"]);
    if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(id) || !allowed.has(category) ||
        !Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_MONEY ||
        !["income","expense"].includes(direction) || typeof description !== "string" ||
        description.length > 120 || (referenceId !== null && (typeof referenceId !== "string" || referenceId.length > 80)) ||
        !Number.isSafeInteger(createdAt) || createdAt < 0) return { ok:false, reason:"invalid-entry" };
    const delta = direction === "income" ? amount : -amount;
    const at = new Date(createdAt).toISOString();
    const statements = [
      this.db.prepare(
        "UPDATE p27_club_finance_accounts SET balance=balance+?, revision=revision+1, updated_at=? " +
        "WHERE club_id=? AND balance+? BETWEEN 0 AND ? " +
        "AND NOT EXISTS (SELECT 1 FROM p27_club_finance_entries WHERE club_id=? AND entry_id=?)"
      ).bind(delta,at,clubId,delta,MAX_MONEY,clubId,id),
      this.db.prepare(
        "INSERT INTO p27_club_finance_entries " +
        "(club_id,entry_id,category,amount,direction,description,reference_id,balance_after,created_at) " +
        "SELECT ?,?,?,?,?,?,?,balance,? FROM p27_club_finance_accounts WHERE club_id=? AND changes()=1"
      ).bind(clubId,id,category,amount,direction,description,referenceId,createdAt,clubId),
    ];
    const result = await this.db.batch(statements);
    if (Number(result?.[0]?.meta?.changes) !== 1) {
      const existing = await this.db.prepare(
        "SELECT category,amount,direction,description,reference_id AS referenceId FROM p27_club_finance_entries WHERE club_id=? AND entry_id=?"
      ).bind(clubId,id).first();
      if (existing) {
        const same = existing.category===category && existing.amount===amount &&
          existing.direction===direction && existing.description===description &&
          existing.referenceId===referenceId;
        return same ? { ok:true, duplicate:true, balance:(await this.getClub(clubId))?.balance } : { ok:false, reason:"entry-id-conflict" };
      }
      const account = await this.getClub(clubId);
      if (!account) return { ok:false, reason:"club-not-found" };
      return { ok:false, reason:direction==="expense" && account.balance < amount ? "insufficient-funds" : "balance-limit" };
    }
    const current = await this.getClub(clubId);
    return { ok:true, duplicate:false, balance:current.balance, revision:current.financeRevision };
  }

  async listFinanceEntries(clubId, { limit = 100, before = null } = {}) {
    validateClubId(clubId);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500 ||
        (before !== null && (!Number.isSafeInteger(before) || before < 0))) throw new Error("INVALID_PAGINATION");
    const rows = before === null
      ? await this.db.prepare(
        "SELECT entry_id AS id,category,amount,direction,description,reference_id AS referenceId,balance_after AS balanceAfter,created_at AS createdAt " +
        "FROM p27_club_finance_entries WHERE club_id=? ORDER BY created_at DESC,entry_id DESC LIMIT ?"
      ).bind(clubId,limit).all()
      : await this.db.prepare(
        "SELECT entry_id AS id,category,amount,direction,description,reference_id AS referenceId,balance_after AS balanceAfter,created_at AS createdAt " +
        "FROM p27_club_finance_entries WHERE club_id=? AND created_at<? ORDER BY created_at DESC,entry_id DESC LIMIT ?"
      ).bind(clubId,before,limit).all();
    return rows?.results || [];
  }
}
