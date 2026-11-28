import { kickingSide } from '../src/animation-tuning.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLE_PRESENTATION, rolePresentation, shapeJoystickVector, selectRolePlayer } from '../src/role-presentation.js';

test('P18 defines distinct camera and control profiles for every playable role', () => {
  for (const role of ['GK', 'DEF', 'MID', 'FWD']) {
    const profile = rolePresentation(role);
    assert.ok(profile.label);
    assert.ok(profile.cameraHeight > 0);
    assert.ok(profile.cameraDistance > 0);
    assert.ok(profile.actions.shoot && profile.actions.pass && profile.actions.defend);
  }
  assert.equal(new Set(Object.values(ROLE_PRESENTATION).map(x => x.cameraDistance)).size, 4);
});

test('P18 joystick response is role-sensitive, bounded and has a dead zone', () => {
  assert.deepEqual(shapeJoystickVector(0.01, 0, 'MID'), { x: 0, z: 0, mag: 0 });
  const keeper = shapeJoystickVector(0.5, 0, 'GK');
  const attacker = shapeJoystickVector(0.5, 0, 'FWD');
  assert.ok(keeper.mag < attacker.mag);
  const full = shapeJoystickVector(1, 1, 'FWD');
  assert.ok(full.mag <= 1);
  assert.ok(Math.hypot(full.x, full.z) <= 1.000001);
  assert.ok(Number.isFinite(full.x) && Number.isFinite(full.z));
});

test('P18 unknown roles safely fall back to the midfielder profile', () => {
  assert.equal(rolePresentation('UNKNOWN'), ROLE_PRESENTATION.MID);
});

test('P18 selects the avatar matching the role saved in the player profile', () => {
  const roster = [
    { team: 'blue', role: 'GK', slotIndex: 0 },
    { team: 'blue', role: 'DEF', slotIndex: 1 },
    { team: 'blue', role: 'MID', slotIndex: 2 },
    { team: 'blue', role: 'FWD', slotIndex: 4 },
    { team: 'red', role: 'GK', slotIndex: 0 }
  ];
  assert.equal(selectRolePlayer(roster, 'GK'), roster[0]);
  assert.equal(selectRolePlayer(roster, 'MID'), roster[2]);
  assert.equal(selectRolePlayer(roster, 'UNKNOWN'), roster[3]);
});

test('P18 kick animation follows the dominant foot and safely defaults to right', () => {
  assert.equal(kickingSide('left'), 'left');
  assert.equal(kickingSide('right'), 'right');
  assert.equal(kickingSide('unknown'), 'right');
});
