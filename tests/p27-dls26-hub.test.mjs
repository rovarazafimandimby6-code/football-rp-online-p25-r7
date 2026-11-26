import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../p27-game-ui.css', import.meta.url), 'utf8');
const audit = readFileSync(new URL('../docs/DLS26-P27-FUNCTIONAL-AUDIT.md', import.meta.url), 'utf8');

test('P27 DLS26: l’en-tête est compact et ne réintroduit pas les anciens libellés', () => {
  assert.match(html, /p27-game-topbar/);
  assert.match(html, /p27-career-progress-fill/);
  assert.match(html, /p27-top-player-coins/);
  assert.match(html, /p27-top-player-avatar/);
  assert.match(html, /p27-profile-level/);
  assert.doesNotMatch(html, /p27-top-player-name|p27-top-player-club/);
  assert.match(css, /flex:0 0 25px/);
  assert.match(css, /p27-career-progress/);
});

test('P27 DLS26: le hub utilise des panneaux de tailles hiérarchisées', () => {
  assert.match(main, /p27-dls-home/);
  assert.match(css, /grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/);
  assert.match(css, /\.p27-hub-career\{grid-column:span 5;grid-row:span 2/);
  assert.match(css, /\.p27-hub-match\{grid-column:span 3/);
  assert.doesNotMatch(main, /p27-home-tiles/);
});

test('P27 DLS26: les panneaux sont reliés aux vraies fonctions existantes', () => {
  for (const value of ['data-action="choose-match"','data-page="players"','data-page="competitions"','data-page="mercato"','data-page="clubs"','data-page="results"']) {
    assert.ok(main.includes(value), `accès manquant : ${value}`);
  }
  assert.match(main, /pendingOffers/);
  assert.match(main, /latestMatch/);
  assert.match(main, /careerClub\?\.rating/);
});

test('P27 DLS26: l’audit distingue les fonctions présentes et celles à construire', () => {
  for (const term of ['Dream League Live','Dream Draft','Clans','Fanzone','Agents/recruteurs','Aucun faux compteur']) {
    assert.ok(audit.includes(term), `audit incomplet : ${term}`);
  }
});
