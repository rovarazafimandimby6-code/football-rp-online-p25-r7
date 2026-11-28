import test from 'node:test';
import assert from 'node:assert/strict';
import { generateClubRoster, SUPPORTED_NATIONALITIES } from '../src/club-roster.js';
import { DEFAULT_CLUBS } from '../src/club-manager.js';

test('P23 supports varied nationalities including Maghreb', () => {
  for (const code of ['MG','SN','NG','KE','BR','FR','GB','IT','ES','PT','AR','JP','MA','DZ','TN']) assert.ok(SUPPORTED_NATIONALITIES.includes(code), code);
});

test('P23 appearance generation is deterministic and varied by nationality', () => {
  for (const club of DEFAULT_CLUBS) {
    const a = generateClubRoster(club);
    const b = generateClubRoster(club);
    assert.deepEqual(a.map(p => p.appearance), b.map(p => p.appearance));
    assert.equal(a.length, 12);
    for (const p of a) {
      assert.ok(['light','olive','tan','medium','brown','dark','deep'].includes(p.appearance.skinTone));
      assert.ok(['oval','round','angular','long','square'].includes(p.appearance.faceShape));
      assert.ok(['almond','round','deep-set','hooded'].includes(p.appearance.eyeShape));
    }
  }
});

test('Brazilian and Malagasy profiles include broad complexion ranges', () => {
  const br = generateClubRoster({id:'rio-tana-creative', countryCode:'BR', rating:60, colors:['#123456','#654321','#abcdef']});
  const mg = generateClubRoster({id:'antananarivo-fc', countryCode:'MG', rating:70, colors:['#123456','#654321','#abcdef']});
  assert.ok(br.some(p => ['light','tan'].includes(p.appearance.skinTone)));
  assert.ok(br.some(p => ['brown','dark'].includes(p.appearance.skinTone)));
  assert.ok(mg.some(p => ['light','tan'].includes(p.appearance.skinTone)));
  assert.ok(mg.some(p => ['brown','dark'].includes(p.appearance.skinTone)));
});
