import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlayerGuidance } from '../src/player-guidance.js';
const roles = ['GK', 'DEF', 'MID', 'FWD'];

test('P27 aide RP : chaque poste reçoit un conseil adapté quand il a le ballon', () => {
  for (const role of roles) {
    const player = { role, team: 'blue' };
    const result = resolvePlayerGuidance(player, { owner: player });
    assert.equal(result.phase, 'possession');
    assert.match(result.text, /AVEC LE BALLON/);
    assert.ok(result.text.length > 35);
  }
});

test('P27 aide RP : un coéquipier en possession déclenche un conseil de soutien', () => {
  const player = { role: 'MID', team: 'blue' };
  const result = resolvePlayerGuidance(player, { owner: { team: 'blue' } });
  assert.equal(result.phase, 'support');
  assert.match(result.text, /ligne de passe/);
});

test('P27 aide RP : une possession adverse déclenche une responsabilité défensive propre au poste', () => {
  for (const role of roles) {
    const result = resolvePlayerGuidance({ role, team: 'blue' }, { owner: { team: 'red' } });
    assert.equal(result.phase, 'defend');
    assert.match(result.text, /PHASE DÉFENSIVE/);
  }
});

test('P27 aide RP : un ballon libre et les phases arrêtées restent lisibles', () => {
  const player = { role: 'FWD', team: 'blue' };
  assert.equal(resolvePlayerGuidance(player, { owner: null }).phase, 'loose');
  assert.equal(resolvePlayerGuidance(player, { owner: null }, 'halftime').phase, 'support');
});
