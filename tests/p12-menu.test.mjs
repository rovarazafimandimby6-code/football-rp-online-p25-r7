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
