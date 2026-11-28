import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRotation, ROTATION_RULES_V1 } from '../src/rotation-rules.js';

const outgoing = { id:'mid-a', team:'blue', role:'MID' };
const incoming = { id:'forward-b', team:'blue', role:'FWD' };

test('P27 remplacement : autorise une rotation locale pendant la pause, sans quota ni restriction de poste', () => {
  assert.equal(ROTATION_RULES_V1.substitutionsLimit,Infinity);
  assert.equal(validateRotation({ phase:'paused', elapsedMatchSeconds:1000, outgoing, incoming }).ok,true);
});

test('P27 remplacement : refuse une rotation hors arrêt de jeu', () => {
  assert.equal(validateRotation({ phase:'playing', elapsedMatchSeconds:1000, outgoing, incoming }).code,'not-a-stoppage');
});

test('P27 remplacement : impose dix minutes de temps de match avant le retour d’un joueur sorti', () => {
  const returning = { id:'reserve-a', team:'blue', lastSubstitutedOutAt:1200 };
  assert.equal(validateRotation({ phase:'paused', elapsedMatchSeconds:1799, outgoing, incoming:returning }).code,'return-cooldown');
  assert.equal(validateRotation({ phase:'paused', elapsedMatchSeconds:1800, outgoing, incoming:returning }).ok,true);
});

test('P27 remplacement : refuse les joueurs invalides, les doublons et les équipes différentes', () => {
  assert.equal(validateRotation({ phase:'paused', elapsedMatchSeconds:1000, outgoing:null, incoming }).code,'invalid-player-pair');
  assert.equal(validateRotation({ phase:'paused', elapsedMatchSeconds:1000, outgoing, incoming:{...incoming,id:'mid-a'} }).code,'invalid-player-pair');
  assert.equal(validateRotation({ phase:'paused', elapsedMatchSeconds:1000, outgoing, incoming:{...incoming,team:'red'} }).code,'different-teams');
});
