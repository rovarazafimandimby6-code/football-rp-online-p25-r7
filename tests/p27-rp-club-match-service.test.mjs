import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JsonRpClubChallengeStore } from '../server/rp-club-challenge-store.js';
import { RpClubMatchService } from '../server/rp-club-match-service.js';

test('Club RP challenge rooms: only scheduled participants enter their assigned side', () => {
  const now = Date.now();
  const challenge = {
    id:'challenge-1', status:'accepted', scheduledAt:new Date(now).toISOString(),
    challengerClubId:'club-a', challengerName:'Alpha', challengerTag:'ALP',
    targetClubId:'club-b', targetName:'Bravo', targetTag:'BRV',
    challengerMemberAccountIds:['account-a1','account-a2'],
    targetMemberAccountIds:['account-b1','account-b2'],
    roomId:null
  };
  const challengeStore = {
    state:{ challenges:[challenge] },
    transact(mutator) {
      const result = mutator();
      return result;
    }
  };
  const roomManager = {
    rooms:new Map(), roomStore:{ delete() {} },
    create() {
      const room = { id:'abcdef123456', phase:'lobby', players:new Map() };
      this.rooms.set(room.id, room);
      return { id:room.id };
    },
    publicState(room) { return { id:room.id, phase:room.phase }; },
    persistRoom() {}
  };
  const clubStore = {
    getForAccount(accountId) {
      if (accountId === 'account-a1' || accountId === 'account-a2')
        return { club:{ id:'club-a' }, membership:{ role:accountId === 'account-a1' ? 'founder' : 'member' } };
      if (accountId === 'account-b1' || accountId === 'account-b2')
        return { club:{ id:'club-b' }, membership:{ role:'member' } };
      return null;
    }
  };
  const service = new RpClubMatchService({ clubStore, challengeStore, roomManager, now:() => now });
  const denied = service.createRoom(challenge.id, 'outsider');
  assert.deepEqual(denied, { ok:false, reason:'RP_CLUB_PERMISSION_DENIED' });
  const created = service.createRoom(challenge.id, 'account-a1');
  assert.equal(created.ok, true);
  assert.equal(challenge.roomId, 'abcdef123456');
  assert.equal(roomManager.rooms.get('abcdef123456').rpClubChallenge.challengeId, challenge.id);
  assert.equal(service.resolveJoin('abcdef123456', 'account-a2').team, 'blue');
  assert.equal(service.resolveJoin('abcdef123456', 'account-b1').team, 'red');
  assert.deepEqual(service.resolveJoin('abcdef123456', 'outsider'), {
    ok:false, reason:'RP_CLUB_CHALLENGE_MEMBERSHIP_REQUIRED'
  });
  assert.equal(service.createRoom(challenge.id, 'account-a1').reused, true);
});

test('Club RP challenge rooms: cannot start before the scheduled window', () => {
  const now = Date.now();
  const challengeStore = {
    state:{ challenges:[{
      id:'challenge-2', status:'accepted', scheduledAt:new Date(now + 60*60_000).toISOString(),
      challengerMemberAccountIds:['account-a1'], targetMemberAccountIds:['account-b1'],
      challengerTag:'ALP', targetTag:'BRV', roomId:null
    }] },
    transact(mutator) { return mutator(); }
  };
  const roomManager = { rooms:new Map(), create() { throw new Error('must-not-create'); } };
  const clubStore = { getForAccount:() => ({ club:{ id:'club-a' }, membership:{ role:'founder' } }) };
  const service = new RpClubMatchService({ clubStore, challengeStore, roomManager, now:() => now });
  assert.deepEqual(service.createRoom('challenge-2','account-a1'), {
    ok:false, reason:'RP_CLUB_CHALLENGE_NOT_IN_TIME_WINDOW'
  });
});

test('Club RP standings use only finalized scores and count a result once', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'p27-rp-club-results-'));
  try {
    const store = new JsonRpClubChallengeStore(directory);
    store.state.challenges.push({
      id:'challenge-result-1', challengerClubId:'club-a', challengerName:'Alpha', challengerTag:'ALP',
      targetClubId:'club-b', targetName:'Bravo', targetTag:'BRV', createdByAccountId:'a',
      challengerMemberAccountIds:['a'], targetMemberAccountIds:['b'], status:'accepted',
      createdAt:new Date().toISOString(), scheduledAt:new Date().toISOString(), roomId:'room-real-1'
    });
    const result = { challengeId:'challenge-result-1', roomId:'room-real-1', score:{ blue:3, red:1 }, finalizedAt:Date.now() };
    const completed = store.completeFromMatch(result);
    assert.equal(completed.ok, true);
    assert.equal(completed.challenge.status, 'completed');
    assert.equal(store.completeFromMatch(result).duplicate, true);
    const standings = store.leaderboard();
    assert.equal(standings.length, 2);
    assert.equal(standings[0].clubId, 'club-a');
    assert.equal(standings[0].played, 1);
    assert.equal(standings[0].wins, 1);
    assert.equal(standings[0].points, 3);
    assert.equal(standings[0].goalsFor, 3);
    assert.equal(standings[1].losses, 1);
    assert.deepEqual(store.completeFromMatch({ ...result, roomId:'another-room' }), {
      ok:false, reason:'RP_CLUB_CHALLENGE_RESULT_CONFLICT'
    });
  } finally {
    rmSync(directory, { recursive:true, force:true });
  }
});

test('finalized Club RP challenge results also enter the active season exactly once', () => {
  const challenge = {
    id:'challenge-season-1', status:'accepted', roomId:'room-season-1',
    challengerClubId:'club-a', challengerName:'Alpha', challengerTag:'ALP',
    targetClubId:'club-b', targetName:'Bravo', targetTag:'BRV'
  };
  const challengeStore = {
    state:{ challenges:[challenge] },
    completeFromMatch({ challengeId, roomId, score, finalizedAt }) {
      challenge.status = 'completed';
      challenge.result = { roomId, ...score, finalizedAt };
      return { ok:true, challenge, duplicate:false };
    },
    leaderboard() { return []; }
  };
  const calls = [];
  const seasonStore = {
    current() { return { id:'season-2026' }; },
    recordResult(input) { calls.push(input); return { ok:true, duplicate:calls.length > 1 }; },
    leaderboard() { return []; }
  };
  const service = new RpClubMatchService({
    clubStore:{}, challengeStore, seasonStore, roomManager:{}
  });
  const result = {
    phase:'fulltime', roomId:'room-season-1', finalizedAt:Date.parse('2026-11-26T12:00:00Z'),
    score:{ blue:2, red:0 }, rpClubChallenge:{ challengeId:'challenge-season-1' }
  };
  assert.equal(service.recordFinalizedResult(result, null).seasonResult.ok, true);
  assert.equal(service.recordFinalizedResult(result, null).seasonResult.duplicate, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].seasonId, 'season-2026');
  assert.deepEqual(calls[0].challenger, { id:'club-a', name:'Alpha', tag:'ALP' });
});
