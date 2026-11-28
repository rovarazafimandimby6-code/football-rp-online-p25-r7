import test from 'node:test';
import assert from 'node:assert/strict';
import { auditP27World } from '../server/world-integrity-audit.js';

const validAccount = {
  id:'account-valid', username:'player_valid',
  passwordHash:'a'.repeat(128), passwordSalt:'b'.repeat(32)
};
const validProfile = {
  accountId:'account-valid',
  profile:{
    schemaVersion:1,
    identity:{displayName:'Player',role:'MID',number:10},
    appearance:{kit:'emerald'}
  }
};
const validProgression = {
  accountId:'account-valid',
  progression:{
    level:1,experience:0,coins:250,trainingPoints:0,
    attributes:{pace:55,shooting:50,passing:50,defense:45,stamina:55,control:50},
    processedMatchIds:[]
  }
};

test('P27 audit transversal : accepte les liens compte, profil, progression et session cohérents',()=>{
  const audit=auditP27World({
    expectedClubCount:0,
    accountState:{version:1,accounts:[validAccount],sessions:[{tokenHash:'c'.repeat(64),accountId:'account-valid',expiresAt:Date.now()+60000}]},
    profileState:{version:1,profiles:[validProfile]},
    progressionState:{version:1,players:[validProgression]}
  });
  assert.equal(audit.ok,true,JSON.stringify(audit.errors));
  assert.equal(audit.counts.accounts,1);
  assert.equal(audit.counts.playerProfiles,1);
  assert.equal(audit.counts.progressionPlayers,1);
});

test('P27 audit transversal : détecte les profils orphelins, les sessions invalides et les progressions corrompues',()=>{
  const audit=auditP27World({
    expectedClubCount:0,
    accountState:{version:1,accounts:[validAccount],sessions:[{tokenHash:'bad-hash',accountId:'unknown-account',expiresAt:0}]},
    profileState:{version:1,profiles:[{...validProfile,accountId:'unknown-account'}]},
    progressionState:{version:1,players:[{
      accountId:'account-valid',
      progression:{...validProgression.progression,level:100,processedMatchIds:['same','same']}
    }]}
  });
  const codes=new Set(audit.errors.map(item=>item.code));
  assert.ok(codes.has('ACCOUNT_SESSION_INVALID_OR_ORPHANED'));
  assert.ok(codes.has('PLAYER_PROFILE_ACCOUNT_UNKNOWN'));
  assert.ok(codes.has('PLAYER_PROGRESSION_STATE_INVALID'));
});
