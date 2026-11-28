import { D1PlayerProfileRepository } from "./player-profile-repository.js";
import { D1PlayerProgressionRepository } from "./player-progression-repository.js";
import { D1PlayerCareerRepository } from "./player-career-repository.js";
import { D1PlayerSeasonStatsRepository } from "./player-season-stats-repository.js";
import { D1PlayerContractRepository } from "./player-contract-repository.js";

const MAX_ITEMS = 20_000;
const PAGE_SIZE = 100;
const COUNT_FIELDS = Object.freeze([
  "matches", "minutesPlayedMs", "wins", "draws", "losses", "goals", "assists",
  "shots", "passes", "completedPasses", "tackles", "interceptions", "saves",
  "cleanSheets", "playerOfMatch",
]);
const emptyTotals = () => Object.fromEntries(COUNT_FIELDS.map(field => [field, 0]));
const isObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

async function collectPages(readPage, getCursor) {
  const items = [];
  let cursor = null;
  const seen = new Set();
  do {
    const page = await readPage(cursor);
    if (!page || !Array.isArray(page.matches ?? page.events)) throw new Error("ACCOUNT_SNAPSHOT_PAGE_INVALID");
    const rows = page.matches ?? page.events;
    if (items.length + rows.length > MAX_ITEMS) throw new Error("ACCOUNT_SNAPSHOT_LIMIT_EXCEEDED");
    items.push(...rows);
    const next = getCursor(page);
    if (next === null || next === undefined) break;
    const key = JSON.stringify(next);
    if (seen.has(key)) throw new Error("ACCOUNT_SNAPSHOT_CURSOR_STALLED");
    seen.add(key);
    cursor = next;
  } while (true);
  return items;
}

function localSeasonMatch(match) {
  const stats = isObject(match.stats) ? match.stats : {};
  return {
    matchId: match.matchId, result: match.result,
    goals: Number(stats.goals) || 0, assists: Number(stats.assists) || 0,
    shots: Number(stats.shots) || 0, passes: Number(stats.passes) || 0,
    completedPasses: Number(stats.completedPasses) || 0, tackles: Number(stats.tackles) || 0,
    interceptions: Number(stats.interceptions) || 0, saves: Number(stats.saves) || 0,
    rating: match.rating ?? null, minutesPlayedMs: Number(match.minutesPlayedMs) || 0,
    role: match.role || "MID", cleanSheet: match.cleanSheet === true,
    playerOfMatch: match.playerOfMatch === true, opponent: match.opponent || "",
    date: new Date(Number(match.finalizedAt) || 0).toISOString(),
  };
}

function addTotals(target, source) {
  if (!source) return;
  for (const field of COUNT_FIELDS) target[field] += Math.max(0, Number(source[field]) || 0);
}

async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle) throw new Error("SNAPSHOT_VERIFICATION_UNAVAILABLE");
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Builds a server-confirmed account snapshot from authoritative D1 stores.
 * Legacy CareerManager wallet/offers are deliberately marked unavailable:
 * they are not yet persisted in D1 and must never be fabricated as empty.
 */
export class D1AccountSnapshotRepository {
  constructor(db, { now = () => Date.now(), repositories = null } = {}) {
    if (!db || typeof db.prepare !== "function") throw new Error("D1_DATABASE_BINDING_REQUIRED");
    this.db = db;
    this.now = now;
    this.repositories = repositories || {
      profile: new D1PlayerProfileRepository(db),
      progression: new D1PlayerProgressionRepository(db),
      career: new D1PlayerCareerRepository(db),
      season: new D1PlayerSeasonStatsRepository(db),
      contract: new D1PlayerContractRepository(db),
    };
  }

  async get(account) {
    if (!account || typeof account.id !== "string" || !/^FRP-[0-9]{6}$/.test(account.playerId || "")) {
      throw new Error("ACCOUNT_SNAPSHOT_IDENTITY_INVALID");
    }
    const { profile, progression, career, season, contract } = this.repositories;
    const [profileState, progressionState, careerMatches, playerCareerMatches] = await Promise.all([
      profile.get(account.id),
      progression.get(account.id),
      collectPages(cursor => career.get(account.id, { limit: PAGE_SIZE, ...(cursor ? { before: cursor } : {}) }), page => page.nextCursor),
      collectPages(cursor => career.getPlayerCareer(account.playerId, { limit: PAGE_SIZE, ...(cursor ? { before: cursor } : {}) }), page => page.nextCursor),
    ]);

    const careerFirst = await career.get(account.id, { limit: PAGE_SIZE });
    const playerCareerFirst = await career.getPlayerCareer(account.playerId, { limit: PAGE_SIZE });
    const seasonIds = await season.listSeasonIds(account.id);
    const seasonMatches = [];
    const seasonTotals = emptyTotals();
    for (const seasonId of seasonIds) {
      const matches = await collectPages(
        cursor => season.get(account.id, seasonId, { limit: PAGE_SIZE, ...(cursor ? { before: cursor } : {}) }),
        page => page.nextCursor,
      );
      const first = await season.get(account.id, seasonId, { limit: PAGE_SIZE });
      addTotals(seasonTotals, first.totals);
      seasonMatches.push(...matches.map(localSeasonMatch));
      if (seasonMatches.length > MAX_ITEMS) throw new Error("ACCOUNT_SNAPSHOT_LIMIT_EXCEEDED");
    }

    const contractCurrent = await contract.getCurrent(account.id);
    const contractEvents = await collectPages(
      cursor => contract.getHistory(account.id, { limit: PAGE_SIZE, ...(cursor ? { beforeRevision: cursor } : {}) }),
      page => page.nextCursor,
    );
    const contractHistory = contractEvents.map(event => ({
      type: event.eventType, eventId: event.eventId, revision: event.revision,
      clubId: event.clubId, contract: event.contract,
      date: new Date(event.occurredAt).toISOString(),
    }));
    const loanHistory = contractHistory.filter(event => event.type === "loan" || event.type === "loan-return");

    const chronological = (left, right) =>
      (Number(left.finalizedAt) || 0) - (Number(right.finalizedAt) || 0)
      || String(left.matchId).localeCompare(String(right.matchId));
    careerMatches.sort(chronological);
    playerCareerMatches.sort(chronological);
    seasonMatches.sort(chronological);

    const snapshot = {
      schemaVersion: 1,
      player: { playerId: account.playerId },
      profile: profileState.profile ? {
        identity: profileState.profile.identity, appearance: profileState.profile.appearance,
      } : null,
      progression: progressionState.progression,
      career: { ...careerFirst, matches: careerMatches, currentForm: careerFirst.currentForm },
      playerCareer: { ...playerCareerFirst, matches: playerCareerMatches },
      seasonStats: {
        totals: seasonTotals, matches: seasonMatches,
        processedMatchIds: [...new Set(seasonMatches.map(match => match.matchId))].slice(-MAX_ITEMS),
      },
      contract: {
        wallet: null,
        clubId: contractCurrent?.clubId ?? null,
        contract: contractCurrent?.contract ?? null,
        offers: null,
        history: contractHistory,
        loanOffers: null,
        loanHistory,
        revision: contractCurrent?.revision ?? 0,
      },
    };
    const missingSections = [];
    if (!isObject(snapshot.profile) || !isObject(snapshot.profile.identity) || !isObject(snapshot.profile.appearance)) {
      missingSections.push("profile");
    }
    if (!isObject(snapshot.progression) || !isObject(snapshot.progression.attributes)
      || !Array.isArray(snapshot.progression.processedMatchIds)) missingSections.push("progression");
    if (!isObject(snapshot.career) || !isObject(snapshot.career.totals) || !Array.isArray(snapshot.career.matches)) {
      missingSections.push("career");
    }
    if (!isObject(snapshot.playerCareer) || !isObject(snapshot.playerCareer.totals)
      || !Array.isArray(snapshot.playerCareer.matches)) missingSections.push("playerCareer");
    if (!isObject(snapshot.seasonStats) || !isObject(snapshot.seasonStats.totals)
      || !Array.isArray(snapshot.seasonStats.matches) || !Array.isArray(snapshot.seasonStats.processedMatchIds)) {
      missingSections.push("seasonStats");
    }
    if (snapshot.contract.wallet === null || snapshot.contract.offers === null || snapshot.contract.loanOffers === null) {
      missingSections.push("contract");
    }
    const revision = await sha256Hex(snapshot);
    return {
      snapshot, revision, authority: "server-confirmed",
      complete: missingSections.length === 0, missingSections,
      generatedAt: new Date(this.now()).toISOString(),
    };
  }
}
