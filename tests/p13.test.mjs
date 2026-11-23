import test from 'node:test';
import assert from 'node:assert/strict';
import { PlayerProfileStore } from '../src/player-profile.js';
import { ClubManager } from '../src/club-manager.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('P13: identité et apparence du joueur sont modifiables et sauvegardées localement', () => {
  const storage = memoryStorage();
  const profile = new PlayerProfileStore(storage, 'p13-test');
  profile.updateIdentity({ displayName: 'Rova', number: 27, role: 'FWD', preferredFoot: 'left' });
  profile.updateAppearance({ kit: 'violet', skinTone: 'dark', hairStyle: 'curly', hairColor: 'brown' });
  const reloaded = new PlayerProfileStore(storage, 'p13-test');
  assert.equal(reloaded.profile.identity.displayName, 'Rova');
  assert.equal(reloaded.profile.identity.number, 27);
  assert.equal(reloaded.profile.identity.role, 'FWD');
  assert.equal(reloaded.profile.identity.preferredFoot, 'left');
  assert.equal(reloaded.profile.appearance.kit, 'violet');
  assert.equal(reloaded.profile.appearance.skinTone, 'dark');
  assert.equal(reloaded.profile.appearance.hairStyle, 'curly');
  assert.equal(reloaded.profile.appearance.hairColor, 'brown');
});

test('P13: une reprise de club ouvert est autorisée une seule fois par joueur', () => {
  const clubs = new ClubManager();
  const first = clubs.takeOver('mahajanga-city', 'local-player');
  assert.equal(first.ok, true);
  assert.equal(first.club.control, 'player');
  assert.equal(clubs.takeOver('fianarantsoa-athletic', 'local-player').reason, 'manager-already-has-club');
  assert.equal(clubs.takeOver('antananarivo-fc', 'another-player').reason, 'club-not-available');
});

test('P13: calendrier aller simple crée une rencontre unique par paire de clubs', () => {
  const clubs = new ClubManager();
  let count = 0;
  for (const division of clubs.listDivisions()) {
    const list = division.clubs;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const result = clubs.createFixture({ id: `p13-${division.id}-${i}-${j}`, homeClubId: list[i].id, awayClubId: list[j].id, scheduledAt: new Date(2026, 0, count + 1).toISOString() });
        assert.equal(result.ok, true);
        count++;
      }
    }
  }
  assert.equal(count, 24);
  assert.equal(clubs.fixtures.length, 24);
  const firstDivision = clubs.listDivisions()[0].clubs;
  assert.equal(clubs.createFixture({ id: 'p13-D1-0-1', homeClubId: firstDivision[0].id, awayClubId: firstDivision[1].id, scheduledAt: new Date().toISOString() }).reason, 'duplicate-fixture');
});

test('P13: le parcours de lancement impose la sélection et la présentation avant le moteur', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /data-action="choose-match"/);
  assert.match(source, /data-action="show-lineup"/);
  assert.match(source, /data-action="start-match"/);
  assert.ok(source.indexOf("action === 'show-lineup'") < source.indexOf("action === 'start-match'"));
  assert.match(source, /new Game\(container/);
});

test('P13: les écrans profil, clubs et compétitions sont intégrés au menu', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /page === 'player'/);
  assert.match(source, /id="profile-editor"/);
  assert.match(source, /page === 'clubs'/);
  assert.match(source, /page === 'competitions'/);
  assert.match(source, /data-action="create-schedule"/);
});
