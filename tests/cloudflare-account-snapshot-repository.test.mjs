import test from "node:test";
import assert from "node:assert/strict";
import { D1AccountSnapshotRepository } from "../src/cloudflare/account-snapshot-repository.js";

const identity = { id: "11111111-1111-4111-8111-111111111111", playerId: "FRP-123456" };
const rows = (count, prefix) => Array.from({ length: count }, (_, index) => ({
  matchId: `${prefix}-${String(index + 1).padStart(4, "0")}`,
  finalizedAt: 1_700_000_000_000 + index,
  result: index % 3 === 0 ? "win" : index % 3 === 1 ? "draw" : "loss",
  stats: { goals: index % 2, assists: 0, shots: 2, passes: 3, completedPasses: 2, tackles: 1, interceptions: 0, saves: 0 },
  minutesPlayedMs: 180_000, rating: 7, role: "MID", cleanSheet: false, playerOfMatch: false, opponent: "Club B",
}));
function pageMatches(all, before, limit) {
  const sorted = [...all].sort((a, b) => b.finalizedAt - a.finalizedAt || b.matchId.localeCompare(a.matchId));
  const filtered = before ? sorted.filter(row =>
    row.finalizedAt < before.finalizedAt || (row.finalizedAt === before.finalizedAt && row.matchId < before.matchId)) : sorted;
  const selected = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  const oldest = selected.at(-1);
  return { matches: selected.reverse(), nextCursor: hasMore ? { finalizedAt: oldest.finalizedAt, matchId: oldest.matchId } : null };
}

test("D1 account snapshot aggregates authoritative stores and paginates every career history", async () => {
  const careerRows = rows(125, "career");
  const playerRows = rows(123, "player");
  const seasonRows = rows(115, "season");
  const contractEvents = Array.from({ length: 105 }, (_, index) => ({
    eventId: `event-${index + 1}`, eventType: index % 10 === 0 ? "loan" : "renewal",
    revision: index + 1, status: "active", clubId: "club-1",
    occurredAt: 1_700_000_000_000 + index, contract: { status: "active", clubId: "club-1" },
  }));
  const repositories = {
    profile: { get: async () => ({ profile: { identity: { displayName: "Rova" }, appearance: { kit: "emerald" } }, revision: 3 }) },
    progression: { get: async () => ({ progression: {
      level: 4, experience: 20, coins: 900, trainingPoints: 2,
      attributes: { pace: 70, shooting: 50, passing: 50, defense: 45, stamina: 55, control: 50 },
      processedMatchIds: ["match-progress-1"],
    }, revision: 8 }) },
    career: {
      get: async (_accountId, options = {}) => ({
        totals: { matches: careerRows.length, wins: 42 },
        ...pageMatches(careerRows, options.before, options.limit),
        currentForm: [],
      }),
      getPlayerCareer: async (_playerId, options = {}) => ({
        player: { name: "Rova", role: "MID", clubName: "Club A" },
        totals: { matches: playerRows.length, wins: 41 },
        ...pageMatches(playerRows, options.before, options.limit),
        clubHistory: [],
      }),
    },
    season: {
      listSeasonIds: async () => ["season-1"],
      get: async (_accountId, _seasonId, options = {}) => ({
        totals: { matches: seasonRows.length, goals: 55, wins: 50 },
        ...pageMatches(seasonRows, options.before, options.limit),
      }),
    },
    contract: {
      getCurrent: async () => ({ revision: 9, clubId: "club-1", contract: { status: "active", clubId: "club-1" } }),
      getHistory: async (_accountId, options = {}) => {
        const filtered = options.beforeRevision === undefined || options.beforeRevision === null
          ? contractEvents : contractEvents.filter(event => event.revision < options.beforeRevision);
        const selected = [...filtered].sort((a, b) => b.revision - a.revision).slice(0, options.limit);
        const hasMore = filtered.length > options.limit;
        return { events: selected, nextCursor: hasMore ? selected.at(-1).revision : null };
      },
    },
  };
  const repository = new D1AccountSnapshotRepository({ prepare() {} }, {
    now: () => 1_800_000_000_000, repositories,
  });
  const result = await repository.get(identity);

  assert.equal(result.authority, "server-confirmed");
  assert.equal(result.complete, false);
  assert.deepEqual(result.missingSections, ["contract"]);
  assert.equal(result.snapshot.career.matches.length, 125);
  assert.equal(result.snapshot.playerCareer.matches.length, 123);
  assert.equal(result.snapshot.seasonStats.matches.length, 115);
  assert.equal(result.snapshot.contract.history.length, 105);
  assert.equal(result.snapshot.contract.loanHistory.length, 11);
  assert.equal(result.snapshot.seasonStats.matches[0].matchId, "season-0001");
  assert.equal(result.snapshot.seasonStats.matches.at(-1).matchId, "season-0115");
  assert.equal(result.revision.length, 64);
  assert.match(result.revision, /^[a-f0-9]{64}$/);
});

test("D1 account snapshot refuses a mismatched account/player identity", async () => {
  const repository = new D1AccountSnapshotRepository({ prepare() {} }, { repositories: {} });
  await assert.rejects(() => repository.get({ id: identity.id, playerId: "not-a-player-id" }), {
    message: "ACCOUNT_SNAPSHOT_IDENTITY_INVALID",
  });
});

test("D1 account snapshot does not fabricate legacy contract wallet or offers", async () => {
  const repositories = {
    profile: { get: async () => ({ profile: null }) },
    progression: { get: async () => ({ progression: null }) },
    career: {
      get: async () => ({ totals: { matches: 0 }, matches: [], currentForm: [], nextCursor: null }),
      getPlayerCareer: async () => ({ player: null, totals: { matches: 0 }, matches: [], nextCursor: null }),
    },
    season: { listSeasonIds: async () => [] },
    contract: { getCurrent: async () => null, getHistory: async () => ({ events: [], nextCursor: null }) },
  };
  const repository = new D1AccountSnapshotRepository({ prepare() {} }, { repositories });
  const result = await repository.get(identity);
  assert.equal(result.snapshot.profile, null);
  assert.equal(result.snapshot.contract.wallet, null);
  assert.equal(result.snapshot.contract.offers, null);
  assert.equal(result.snapshot.contract.loanOffers, null);
  assert.deepEqual(result.missingSections, ["profile", "progression", "contract"]);
});
