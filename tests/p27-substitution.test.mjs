import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSubstitution } from '../src/substitution-manager.js';

const outgoing = { id: 'mid-a', team: 'blue', role: 'MID' };
const incoming = { id: 'mid-b', role: 'MID' };
const active = { id: 'career-player', team: 'blue', isControlled: true };

test('P27 remplacement : accepte un changement local de même poste pendant la pause', () => {
  assert.equal(validateSubstitution({ phase: 'paused', outgoing, incoming, activePlayer: active }).ok, true);
});

test('P27 remplacement : refuse un changement pendant le jeu', () => {
  assert.equal(validateSubstitution({ phase: 'playing', outgoing, incoming, activePlayer: active }).code, 'match-not-paused');
});

test('P27 remplacement : protège le footballeur personnel contrôlé', () => {
  assert.equal(validateSubstitution({ phase: 'paused', outgoing: active, incoming, activePlayer: active }).code, 'controlled-player-protected');
});

test('P27 remplacement : refuse les postes incompatibles', () => {
  assert.equal(validateSubstitution({ phase: 'paused', outgoing, incoming: { ...incoming, role: 'DEF' }, activePlayer: active }).code, 'role-mismatch');
});

test('P27 remplacement : applique la limite de trois changements', () => {
  assert.equal(validateSubstitution({ phase: 'paused', outgoing, incoming, activePlayer: active, used: 3, limit: 3 }).code, 'substitution-limit');
});

test('P27 remplacement : refuse les joueurs invalides et les changements en ligne', () => {
  assert.equal(validateSubstitution({ phase: 'paused', outgoing: null, incoming, activePlayer: active }).code, 'invalid-outgoing');
  assert.equal(validateSubstitution({ phase: 'paused', outgoing, incoming, activePlayer: active, online: true }).code, 'online-not-supported');
});
