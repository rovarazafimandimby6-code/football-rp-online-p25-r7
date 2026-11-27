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


test("P27 effectif de club : clic et clavier ouvrent la fiche joueur", () => {
  assert.ok(main.includes("playerCard.matches('tr[data-player-row]')"));
  assert.ok(main.includes("playerProfileReturnPage = playerCard.dataset.profileOrigin === 'clubs' ? 'clubs' : 'players'"));
  assert.ok(main.includes("rosterRow && (event.key === 'Enter' || event.key === ' ')"));
  assert.ok(main.includes("renderPage('player-detail')"));
});


test("P27 fiche joueur : le libellé de retour correspond à la page d’origine", () => {
  assert.ok(main.includes("playerProfileReturnPage === 'clubs' ? 'RETOUR À L’EFFECTIF' : 'RETOUR À LA BIBLIOTHÈQUE'"));
  assert.ok(main.includes("renderPage(playerProfileReturnPage)"));
});


test('P27 catalogue clubs : une recherche sans résultat affiche un état vide explicite', () => {
  assert.ok(main.includes('id="club-empty-state"'));
  assert.ok(main.includes("if(emptyState) emptyState.hidden=matchedTotal>0"));
  assert.ok(main.includes('Aucun club ne correspond à ces critères.'));
});


test('P27 bibliothèque joueurs : une recherche sans résultat affiche un état vide explicite', () => {
  assert.ok(main.includes('id="library-empty-state"'));
  assert.ok(main.includes('if(emptyState) emptyState.hidden=matchedCards.length>0'));
  assert.ok(main.includes('Aucun joueur ne correspond à ces critères.'));
});


test('P27 catalogues : les tris numériques placent les valeurs absentes à la fin et départagent par nom', () => {
  assert.equal((main.match(/const aValid=Number\.isFinite\(av\),bValid=Number\.isFinite\(bv\);/g)||[]).length, 2);
  assert.equal((main.match(/return a\.dataset\.name\.localeCompare\(b\.dataset\.name,'fr'\);/g)||[]).length >= 4, true);
});


test('P27 archives résultats : pagination et entrées serveur sont normalisées', () => {
  assert.ok(main.includes("payload.results.filter(result => result && typeof result === 'object')"));
  assert.ok(main.includes("rawPage.hasMore === true && nextOffset !== null && nextOffset > pageOffset"));
  assert.ok(main.includes("const roomId = typeof result.roomId === 'string' ? result.roomId.trim() : ''"));
  assert.ok(main.includes("Feuille de match indisponible"));
  assert.ok(main.includes("date.toLocaleString('fr-FR'"));
});

 
test('P27 effectif de club : le compteur suit la recherche et le filtre par poste', () => {
  assert.ok(main.includes('id="roster-filter-count"'));
  assert.ok(main.includes('role="status" aria-live="polite"'));
  assert.ok(main.includes("count.textContent = visible + ' / ' + rows.length + ' joueurs affichés'"));
  assert.ok(main.includes("document.getElementById('roster-empty')?.classList.toggle('hidden', visible > 0)"));
});


test('P27 Mercato : les dates de contrat et d’historique restent lisibles si une donnée est invalide', () => {
  assert.ok(main.includes("Number.isNaN(date.getTime()) ? 'Date inconnue' : date.toLocaleDateString('fr-FR')"));
});


test('P27 carrière : signature, résiliation et transfert synchronisent immédiatement le joueur dans les effectifs', () => {
  assert.ok(main.includes('career.refreshContractStatus();\n    syncCareerPlayerRoster({ clubs, career, profile: profileStore.profile });'));
  assert.ok(main.includes("const before = career.captureState();\n    let result = canRegister"));
  assert.ok(main.includes("const synced = syncCareerPlayerRoster({ clubs, career, profile: profileStore.profile });\n      if (!synced.ok)"));
  assert.ok(main.includes("} else if (action === 'terminate-contract') {\n    const before = career.captureState();\n    let result = career.terminateContract();"));
  assert.ok(main.includes("career.restoreState(before);\n        career.saveState();"));
  assert.ok(main.includes("} else if (action === 'accept-offer') {"));
});


test('P27 Mercato : la génération locale reste limitée à cinq offres en attente et privilégie les niveaux proches', () => {
  assert.ok(main.includes("const availableSlots = Math.max(0, 5 - pendingOffers.length)"));
  assert.ok(main.includes(".slice(0, availableSlots)"));
  assert.ok(main.includes("Math.abs(Number(a.rating || 0) - Number(clubs.getClub(career.clubId)?.rating || 0))"));
  assert.ok(main.includes("String(a.name).localeCompare(String(b.name), 'fr')"));
});
