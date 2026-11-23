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

test('P12: la navigation expose les espaces joueur, clubs et paramètres', () => {
  for (const page of ['home', 'player', 'clubs', 'competitions', 'mercato', 'rankings', 'community', 'settings']) {
    assert.match(html, new RegExp(`data-page="${page}"`));
  }
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


test('P27 UI: accueil carrière présente les statistiques réelles et les accès rapides', () => {
  assert.match(main, /home-dashboard/);
  assert.match(main, /seasonStats\.snapshot\(\)\.totals/);
  assert.match(main, /data-action="choose-match"/);
  assert.match(main, /data-action="online-menu"/);
  assert.match(main, /data-page="mercato"/);
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
  assert.match(html, /data-page="players"/);
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


test('P27 mobile fullscreen: menu and match expose a touch fullscreen control', () => {
  assert.ok(html.includes('id="menu-fullscreen"'));
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
