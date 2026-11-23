import test from 'node:test';
import assert from 'node:assert/strict';
import { specialtyForSlot } from '../src/player-specialties.js';

test('P9: chaque profil IA reçoit une spécialité cohérente avec son poste', () => {
  assert.equal(specialtyForSlot('GK', 0), 'reflex');
  assert.equal(specialtyForSlot('DEF', 1), 'stopper');
  assert.equal(specialtyForSlot('DEF', 2), 'cover');
  assert.equal(specialtyForSlot('MID', 3), 'playmaker');
  assert.equal(specialtyForSlot('FWD', 3), 'finisher');
  assert.equal(specialtyForSlot('FWD', 4), 'runner');
});

test('P9: les profils de spécialité sont également attribués à l’équipe adverse', () => {
  for (const role of ['GK', 'DEF', 'MID', 'FWD']) {
    assert.equal(typeof specialtyForSlot(role, 0), 'string');
    assert.ok(specialtyForSlot(role, 0).length > 0);
  }
});
