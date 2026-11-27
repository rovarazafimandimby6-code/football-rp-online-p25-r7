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
  assert.match(html, /menu-settings-icon/);
  assert.doesNotMatch(html, /p27-profile-shortcut|p27-top-player-avatar|p27-profile-level/);
  assert.doesNotMatch(html, /p27-top-player-name|p27-top-player-club/);
  assert.match(css, /flex:0 0 25px/);
  assert.match(css, /p27-career-progress/);
});

test('P27 DLS26: le hub utilise des panneaux de tailles hiérarchisées', () => {
  assert.match(main, /p27-dls-home/);
  assert.ok(css.includes('grid-template-columns:repeat(3,minmax(0,1fr))'));
  assert.ok(css.includes('#main-menu .p27-hub-career{grid-column:span 2;grid-row:1}'));
  assert.ok(css.includes('#main-menu .p27-hub-match{grid-column:3;grid-row:1}'));
  for (const tile of ['p27-hub-player','p27-hub-competitions','p27-hub-market','p27-hub-rankings','p27-hub-club','p27-hub-results']) assert.ok(css.includes(tile));
  assert.doesNotMatch(main, /p27-home-tiles/);
});

test('P27 DLS26: le hub carrière affiche uniquement la forme et les statistiques de saison enregistrées', () => {
  assert.ok(main.includes('const seasonSnapshot = seasonStats.snapshot();'));
  assert.ok(main.includes('seasonSnapshot.currentForm'));
  assert.ok(main.includes('p27-dls-career-form'));
  assert.ok(main.includes('seasonTotals.matches'));
  assert.ok(main.includes('seasonSnapshot.averageRating'));
  assert.ok(main.includes('data-page="results"'));
  assert.ok(css.includes('.p27-dls-career-form .p27-form-chip.win'));
});

test('P27 DLS26: les panneaux sont reliés aux vraies fonctions existantes', () => {
  for (const value of ['data-action="choose-match"','data-page="player"','data-page="players"','data-page="competitions"','data-page="mercato"','data-page="clubs"','data-page="rankings"','data-page="rp-club"','data-page="results"']) {
    assert.ok(main.includes(value), `accès manquant : ${value}`);
  }
  assert.match(main, /pendingOffers/);
  assert.match(main, /latestMatch/);
  assert.match(main, /careerClub/);
  assert.ok(main.includes('data-page=\"rp-club\"'));
  assert.match(main, /ÉQUIPE DE CHAMPIONNAT/);
});

test('P27 DLS26: l’audit distingue les fonctions présentes et celles à construire', () => {
  for (const term of ['Dream League Live','Dream Draft','Clans','Fanzone','Agents/recruteurs','Aucun faux compteur']) {
    assert.ok(audit.includes(term), `audit incomplet : ${term}`);
  }
});

test('P27 Club RP : le hub ouvre une communauté séparée des équipes de championnat', () => {
  assert.ok(main.includes('function startRpClubChatPolling(clubId)'));
  assert.ok(main.includes('setInterval(() => { if (!document.hidden) void refreshRpClubChat(clubId); }, 10000);'));
  assert.ok(main.includes('function stopRpClubChatPolling()'));
  assert.ok(main.includes('id="rp-club-chat-history"'));
  assert.ok(main.includes("event.key !== 'Enter' || event.target?.id !== 'rp-club-chat-input'"));
  assert.match(main, /async function loadRpClubPage\(selectedSeasonId = null\)/);
  assert.match(main, /function rpClubApi\(/);
  assert.match(main, /rp-club-decision/);
  assert.match(main, /rp-club-join/);
  assert.match(css, /rp-club-hero/);
  assert.match(audit, /Première brique fonctionnelle du Club RP/);
});


test('P27 interface globale : interactions tactiles, focus clavier et états désactivés sont cohérents', () => {
  assert.match(css, /global interface pass/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /:disabled/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /overscroll-behavior:contain/);
  assert.match(css, /color-scheme:dark/);
});

test('P27 interface globale : les vues compétitions et carrière restent adaptables en portrait', () => {
  assert.match(css, /@media\(orientation:portrait\)/);
  assert.match(css, /\.competition-layout,\.player-career-columns/);
  assert.match(css, /max-width:520px/);
});


test('P27 bibliothèque et mercato : cartes joueurs et raccourcis suivent la hiérarchie DLS', () => {
  assert.match(css, /DLS-style player-market polish/);
  assert.match(css, /player-library-card:hover/);
  assert.match(css, /player-card-name-line \.player-card-rating/);
  assert.match(css, /p27-market-shortcut-actions button/);
  assert.match(css, /career-summary>div:first-child/);
  assert.match(css, /@media\(max-width:760px\) and \(orientation:landscape\)/);
  assert.ok(main.includes('Bibliothèque des joueurs'));
  assert.ok(main.includes('Mercato & contrats'));
  assert.ok(main.includes('Les statuts proviennent des effectifs'));
});


test("P27 Mercato : le centre de négociation est distinct des catalogues joueurs et clubs", () => {
  assert.match(main, /Catalogues de recrutement/);
  assert.match(main, /Le Mercato gère les contrats et les offres/);
  assert.match(main, /CATALOGUE JOUEURS/);
  assert.match(main, /CATALOGUE CLUBS/);
  assert.match(main, /propositions simulées sont calculées localement/);
  assert.match(css, /p27-market-shortcuts-intro/);
  assert.match(css, /player-card-portrait::after\{content:none\}/);
});


test("P27 fiche joueur : le retour conserve le catalogue d’origine", () => {
  assert.ok(main.includes("playerProfileReturnPage = careerButton.closest('[data-profile-origin]')?.dataset.profileOrigin === 'clubs' ? 'clubs' : 'players'"));
  assert.ok(main.includes("playerProfileReturnPage = origin === 'clubs' ? 'clubs' : 'players'"));
  assert.ok(main.includes("renderPage(playerProfileReturnPage)"));
});
