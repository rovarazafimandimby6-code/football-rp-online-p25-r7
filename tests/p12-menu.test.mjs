import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');

test('P12: le menu principal est affiché avant le conteneur de match', () => {
  assert.match(html, /<section id="main-menu"/);
  assert.match(html, /<main id="game-shell" class="hidden"/);
});

test('P12: le shell ne contient plus de navigation permanente ni de routes fantômes', () => {
  assert.match(html, /p27-game-topbar/);
  assert.match(html, /p27-back-home/);
  assert.doesNotMatch(html, /menu-sidebar|menu-secondary-nav/);
  for (const page of ['rankings', 'community']) assert.doesNotMatch(html, new RegExp(`data-page="${page}"`));
  for (const page of ['career-hub','player','players','clubs','competitions','results','mercato','account']) {
    assert.match(main, new RegExp(`data-page="${page}"`));
  }
  assert.match(html, /data-page="settings"/);
});

test('P12: le moteur de match est chargé seulement après la demande de lancement', () => {
  assert.doesNotMatch(main, /^import\s+\{\s*Game\s*\}/m);
  assert.match(main, /await import\(['"]\.\/game\.js['"]\)/);
});

test('P12: le menu Pause expose les sections et les écussons des deux clubs', () => {
  for (const action of ['resume', 'stats', 'player', 'events', 'settings', 'quit', 'confirm-quit']) {
    assert.ok(ui.includes(`'${action}'`), `action manquante: ${action}`);
  }
  assert.match(ui, /renderClubCrest/);
  assert.match(ui, /homeName/);
  assert.match(ui, /awayName/);
});

import { clubInitials, clubPalette, renderClubCrest } from '../src/club-identity.js';

test('P12.1: chaque club possède une palette d’identité stable', () => {
  assert.deepEqual(clubPalette('antananarivo-fc'), ['#1769aa', '#092e55', '#f3d36a']);
  assert.notDeepEqual(clubPalette('antananarivo-fc'), clubPalette('toamasina-united'));
});

test('P12.1: les écussons affichent des initiales et un nom accessibles', () => {
  assert.equal(clubInitials('Antananarivo FC'), 'AF');
  const crest = renderClubCrest({ id: 'mahajanga-city', name: 'Mahajanga City' });
  assert.match(crest, /aria-label="Écusson Mahajanga City"/);
  assert.match(crest, />MC</);
  assert.match(crest, /crest-accent/);
});

test('P12.1: la liste des clubs et la pause utilisent le composant d’écusson partagé', () => {
  assert.match(main, /renderClubCrest/);
  assert.match(ui, /renderClubCrest/);
  assert.doesNotMatch(ui, /pause-crest blue/);
});


test('P27 UI: accueil en hub de huit tuiles et accès aux pages existantes', () => {
  assert.match(main, /p27-home-tiles/);
  for (const label of ['CARRIÈRE','MATCH AMICAL','MON JOUEUR','COMPÉTITIONS','MERCATO','CLASSEMENTS','CLUBS','RÉSULTATS']) assert.ok(main.includes(label), `tuile manquante: ${label}`);
  assert.match(main, /data-action="choose-match"/);
  for (const page of ['career-hub','player','players','clubs','competitions','results','mercato']) assert.match(main,new RegExp(`data-page="${page}"`));
  assert.match(main, /const topName = document\.getElementById\('p27-top-player-name'\)/);
  assert.match(main, /const topClub = document\.getElementById\('p27-top-player-club'\)/);
  assert.match(main, /const seasonSnapshot = seasonStats\.snapshot\(\)/);
});

test('P27 UI: shell principal verrouillé en paysage sans défilement vertical', () => {
  assert.match(html, /id="menu-orientation"/);
  assert.match(cssText(), /#main-menu[\s\S]*?overflow:\s*hidden/);
  assert.match(cssText(), /grid-template-rows:\s*48px minmax\(0, 1fr\)/);
  assert.match(cssText(), /@media \(orientation: portrait\)[\s\S]*?#menu-orientation \{ display: flex/);
});

function cssText() {
  return readFileSync(new URL('../style.css', import.meta.url), 'utf8');
}


test('P27 UI match: le HUD expose des commandes tactiles nommées et une identité P27', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = cssText();
  const ui = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.match(html, /id="board" aria-label="Score et temps du match"/);
  for (const id of ['sprint','defend','pass','shoot']) assert.match(html, new RegExp('id="' + id + '"[^>]*aria-label='));
  assert.match(html, /FOOTBALL RP ONLINE — P27/);
  assert.match(css, /#board \{[\s\S]*?border-top: 2px solid/);
  assert.match(css, /#stamina \{[\s\S]*?left: 50%/);
  assert.match(ui, /Diffusion TV · P27/);
});

test('P27 UI match: panneaux de pause et statistiques sont bornés au viewport paysage', () => {
  const css = cssText();
  assert.match(css, /#stats-panel \{[\s\S]*?max-height: calc\(100dvh - 24px\)/);
  assert.match(css, /\.overlay-card \{[\s\S]*?max-height: calc\(100dvh - 24px\)/);
  assert.match(css, /@media \(orientation: portrait\)[\s\S]*?#board, #pause, #minimap/);
});


test('P27 UI: découverte des clubs propose recherche, filtres et tris réels', () => {
  assert.match(main, /id="club-search"/);
  assert.match(main, /id="club-division-filter"/);
  assert.match(main, /id="club-country-filter"/);
  assert.match(main, /id="club-sort"/);
  assert.match(main, /data-club-card/);
  assert.match(main, /filterClubDiscovery/);
  assert.match(main, /appendChild\(card\)/);
});

test('P27 UI: les pages secondaires disposent d’un panneau interne navigable et cohérent', () => {
  const css = cssText();
  assert.match(css, /#menu-content \{[\s\S]*?overflow-y: auto/);
  assert.match(css, /\.club-card \{[\s\S]*?grid-template-columns/);
  assert.match(css, /\.club-discovery-toolbar \{[\s\S]*?grid-template-columns/);
  assert.match(css, /\.roster-table thead \{[\s\S]*?position:sticky/);
});


test('P27 UI: le centre avant-match compare les clubs et leurs meilleurs joueurs', () => {
  const css = cssText();
  assert.match(main, /match-centre/);
  assert.match(main, /home-match-rating/);
  assert.match(main, /away-match-rating/);
  assert.match(main, /match-preview-stars/);
  assert.match(main, /renderSide\('home'/);
  assert.match(main, /renderSide\('away'/);
  assert.match(css, /\.match-pitch-preview \{/);
  assert.match(css, /\.match-preview-card \{/);
});


test('P27 UI: bibliothèque joueurs centralise les effectifs avec recherche, filtres, tri et chargement progressif', () => {
  const css = cssText();
  assert.match(main, /page === 'players'/);
  assert.match(main, /data-library-card/);
  assert.match(main, /id="library-search"/);
  assert.match(main, /id="library-club"/);
  assert.match(main, /id="library-role"/);
  assert.match(main, /id="library-sort"/);
  assert.match(main, /id="library-min-rating"/);
  assert.match(main, /players-load-more/);
  assert.match(css, /\.player-library-grid \{/);
  assert.match(css, /\.player-card-attributes \{/);
});


test('P27 mobile fullscreen: seul le match expose un contrôle plein écran', () => {
  assert.ok(!html.includes('id="menu-fullscreen"'));
  assert.ok(html.includes('id="match-fullscreen"'));
  assert.ok(main.includes("requestFullscreen({ navigationUI: 'hide' })"));
  assert.ok(main.includes("screen.orientation.lock('landscape')"));
  assert.ok(main.includes("addEventListener('fullscreenchange'"));
});

test('P27 mobile fullscreen: game and menu fill the dynamic viewport', () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  assert.ok(css.includes('height: 100dvh'));
  assert.ok(css.includes('#main-menu:fullscreen, #game-shell:fullscreen'));
  assert.ok(css.includes('overscroll-behavior: none'));
});


test('P27 viewport: le canvas suit les dimensions réelles du conteneur et du viewport mobile', () => {
  const scene = readFileSync(new URL('../src/scene.js', import.meta.url), 'utf8');
  const css = cssText();
  assert.match(scene, /new ResizeObserver\(this\._onResize\)/);
  assert.match(scene, /observe\(this\.container\)/);
  assert.match(scene, /visualViewport\?\.addEventListener\('resize'/);
  assert.match(scene, /orientationchange/);
  assert.match(scene, /getBoundingClientRect\?\.\(\)/);
  assert.match(scene, /setSize\(w, h, false\)/);
  assert.match(scene, /_resizeObserver\?\.disconnect\(\)/);
  assert.match(css, /#webgl-container canvas \{[\s\S]*?position: absolute;[\s\S]*?inset: 0/);
});

test('P27 viewport: HUD et commandes restent compacts sur les petits écrans paysage', () => {
  const css = cssText();
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 420px\)/);
  assert.match(css, /#action-buttons \{[\s\S]*?height: min\(188px, calc\(100dvh/);
  assert.match(css, /#stick-base \{[\s\S]*?top: 62%/);
  assert.match(css, /#player-guidance \{[\s\S]*?max-width: 30vw/);
});

test('P27 game UI: aucune ancienne navigation latérale ou secondaire ne subsiste', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const legacyCss = readFileSync(new URL('../style.css', import.meta.url), 'utf8') + readFileSync(new URL('../p27-rebirth.css', import.meta.url), 'utf8');
  const gameCss = readFileSync(new URL('../p27-game-ui.css', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /menu-sidebar|menu-secondary-nav|menu-heading/);
  assert.doesNotMatch(legacyCss, /menu-sidebar|menu-secondary-nav/);
  assert.match(html, /p27-top-section/);
  assert.match(html, /p27-top-player-coins/);
  assert.match(gameCss, /p27-dls-career-grid/);
  assert.match(main, /p27-dls-mode p27-dls-next/);
});

test('P27 game header: affiche les crédits réels du profil sans valeur fictive', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="p27-top-player-coins"/);
  assert.match(main, /Number\(profileStore\.profile\.progression\.coins \|\| 0\)\.toLocaleString\('fr-FR'\)/);
  assert.doesNotMatch(main, /\\\\n  const topCoins/);
});


test('P27 quality: tous les écrans secondaires ont des états clavier et indisponibles lisibles', () => {
  const css = readFileSync(new URL('../p27-game-ui.css', import.meta.url), 'utf8');
  assert.match(css, /#menu-content :focus-visible/);
  assert.match(css, /button:disabled/);
  assert.match(css, /outline:2px solid/);
});

test('P27 quality: tableaux et formulaires restent utilisables sur petit écran', () => {
  const css = readFileSync(new URL('../p27-game-ui.css', import.meta.url), 'utf8');
  assert.match(css, /\.roster-table-wrap[\s\S]*?overflow:auto/);
  assert.match(css, /\.table-scroll table,[\s\S]*?min-width:560px/);
  assert.match(css, /input,[\s\S]*?width:100%/);
  assert.match(css, /max-width:420px/);
});

test('P27 quality: feuille de style sans séquence \u005c\u005cn littérale hors commentaire', () => {
  const css = readFileSync(new URL('../p27-rebirth.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\\\\n\\\\n/);
});


test('P27 catalogue joueur : cartes, filtres et pagination ont une présentation dédiée', () => {
  const css = readFileSync(new URL('../p27-game-ui.css', import.meta.url), 'utf8');
  for (const selector of ['.player-library-toolbar','.player-library-card','.player-card-rating','.player-card-attributes','.player-library-footer']) {
    assert.ok(css.includes(selector), `missing P27 style: ${selector}`);
  }
});

test('P27 clubs, résultats et mercato : composants réels couverts par le thème de jeu', () => {
  const css = readFileSync(new URL('../p27-game-ui.css', import.meta.url), 'utf8');
  for (const selector of ['.club-division-heading','.club-detail-hero','.results-panel','.result-card','.market-panel','.offer-card','.results-pagination']) {
    assert.ok(css.includes(selector), `missing P27 style: ${selector}`);
  }
});


test('P27 profil joueur : personnalisation, progression et statistiques disposent de composants dédiés', () => {
  const css = readFileSync(new URL('../p27-game-ui.css', import.meta.url), 'utf8');
  for (const selector of ['.avatar-preview-stage','.profile-meta','.attribute-list','.editor-grid','.training-controls','.player-stats-panel .quick-grid','.form-chip','.history-list']) {
    assert.ok(css.includes(selector), `missing player profile style: ${selector}`);
  }
});

test('P27 fiches joueur : identité, attributs, parcours et palmarès sont harmonisés', () => {
  const css = readFileSync(new URL('../p27-game-ui.css', import.meta.url), 'utf8');
  for (const selector of ['.player-career-hero','.player-career-avatar','.player-career-tags','.player-career-attributes','.player-career-timeline','.player-career-empty']) {
    assert.ok(css.includes(selector), `missing player career style: ${selector}`);
  }
});


test('P27 paramètres et compte : panneaux de configuration et sauvegarde ont une présentation dédiée', () => {
  const css = readFileSync(new URL('../p27-game-ui.css', import.meta.url), 'utf8');
  for (const selector of ['.settings-card label','.settings-card input[type="range"]','.p27-cloud-only','.local-tag']) {
    assert.ok(css.includes(selector), `missing settings/account style: ${selector}`);
  }
});

test('P27 mercato : contrat, négociations et historique sont lisibles sur mobile', () => {
  const css = readFileSync(new URL('../p27-game-ui.css', import.meta.url), 'utf8');
  for (const selector of ['.career-summary','.contract-details','.contract-actions','.sign-contract-row','.offer-terms','.market-history']) {
    assert.ok(css.includes(selector), `missing mercato style: ${selector}`);
  }
});
