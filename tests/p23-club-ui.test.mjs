import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');

test('P23 interface clubs: chaque club ouvre une fiche et un effectif complet', () => {
  assert.match(main, /data-action="view-roster"/);
  assert.match(main, /data-player-row/);
  assert.match(main, /roster\.map\(player/);
  assert.match(main, /data-action="back-clubs"/);
  assert.match(main, /action === 'view-roster'/);
});

test('P23 interface clubs: recherche et filtre de poste sont reliés aux lignes du roster', () => {
  assert.match(main, /id="roster-search"/);
  assert.match(main, /id="roster-role"/);
  assert.match(main, /row\.dataset\.name\.includes\(query\)/);
  assert.match(main, /row\.dataset\.role === role/);
  assert.match(main, /roster-empty/);
});

test('P23 interface clubs: fiche mobile affiche note, potentiel, âge et nationalité', () => {
  for (const token of ['nationalityNames[player.nationality]', 'player.age', 'player.rating', 'player.potential', 'player.archetype', 'player.attributes?.pace', 'player.attributes?.shooting', 'player.attributes?.passing', 'player.attributes?.defense', 'player.attributes?.stamina', 'player.attributes?.control']) assert.ok(main.includes(token), token);
  assert.match(css, /\.roster-table-wrap\s*\{\s*overflow-x:auto/);
  assert.match(css, /@media\(max-width:560px\).*\.roster-filters/s);
});

test('P23 interface match: la présentation avant coup d’envoi affiche les dix titulaires issus des clubs', () => {
  assert.match(main, /import \{ createTeamRoster \} from '\.\/ai\.js'/);
  assert.match(main, /homeLineup = createTeamRoster/);
  assert.match(main, /awayLineup = createTeamRoster/);
  assert.match(main, /pre-match-player-list/);
  assert.match(main, /player\.rating/);
  assert.match(main, /pre-match-lineups/);
});
