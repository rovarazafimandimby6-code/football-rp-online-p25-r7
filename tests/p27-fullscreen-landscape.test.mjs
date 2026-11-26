import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('P27 fullscreen: le manifeste PWA demande plein écran et paysage', async () => {
  const manifest = JSON.parse(await read('../manifest.webmanifest'));
  assert.equal(manifest.orientation, 'landscape');
  assert.equal(manifest.display, 'fullscreen');
  assert.ok(manifest.display_override.includes('fullscreen'));
});

test('P27 fullscreen: la page déclare viewport bord à bord et le manifeste installable', async () => {
  const html = await read('../index.html');
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /rel="manifest" href="manifest\.webmanifest"/);
  assert.match(html, /mobile-web-app-capable/);
  const copy = await read('../scripts/copy-static-assets.mjs');
  assert.match(copy, /manifestDestination/);
  assert.match(copy, /cp\(manifest, manifestDestination/);
});

test('P27 Android: le workflow verrouille le paysage et masque les barres système en mode immersif', async () => {
  const workflow = await read('../.github/workflows/p27-android-apk.yml');
  assert.match(workflow, /p27-dls19-ui-rebuild/);
  assert.match(workflow, /android:screenOrientation="landscape"/);
  assert.match(workflow, /applyP27ImmersiveFullscreen/);
  assert.match(workflow, /WindowInsets\.Type\.statusBars\(\)/);
  assert.match(workflow, /WindowInsets\.Type\.navigationBars\(\)/);
  assert.match(workflow, /BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE/);
  assert.match(workflow, /LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES/);
  assert.match(workflow, /WindowCompat\.setDecorFitsSystemWindows\(getWindow\(\), false\)/);
});

test('P27 fullscreen: accueil et match occupent tout le viewport sans conteneur 16:9 letterbox', async () => {
  const css = await read('../style.css');
  assert.match(css, /#main-menu\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;[\s\S]*?width:\s*100vw;[\s\S]*?height:\s*100dvh/);
  assert.match(css, /#game-shell\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;[\s\S]*?width:\s*100vw;[\s\S]*?height:\s*100dvh/);
  assert.match(css, /#webgl-container,\s*#webgl-container canvas\s*\{[\s\S]*?inset:\s*0;[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%/);
  assert.doesNotMatch(css, /#game-shell\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/);
});

test('P27 fullscreen: le rendu 3D suit la vraie taille du viewport et les changements d’orientation', async () => {
  const scene = await read('../src/scene.js');
  assert.match(scene, /window\.addEventListener\('resize'/);
  assert.match(scene, /window\.addEventListener\('orientationchange'/);
  assert.match(scene, /this\._visualViewport\?\.addEventListener\('resize'/);
  assert.match(scene, /this\._resizeObserver\?\.observe\(this\.container\)/);
  assert.match(scene, /this\.camera\.aspect\s*=\s*w\s*\/\s*h/);
  assert.match(scene, /this\.renderer\.setSize\(w, h, false\)/);
});

test('P27: aucun bouton ni script de bascule manuelle plein écran ne subsiste', async () => {
  const html = await read('../index.html');
  const main = await read('../src/main.js');
  const css = await read('../style.css');
  assert.doesNotMatch(html, /match-fullscreen|fullscreen-toggle|⛶/);
  assert.doesNotMatch(main, /toggleMobileFullscreen|fullscreenButtons|requestFullscreen|exitFullscreen/);
  assert.doesNotMatch(css, /\.fullscreen-toggle|#match-fullscreen/);
  assert.match(html, /id="pause"/);
});


test('P27 startup: le splash de présentation est dans le body, pas dans le head', async () => {
  const html = await read('../index.html');
  const head = html.slice(0, html.indexOf('</head>'));
  const body = html.slice(html.indexOf('<body>'));
  assert.doesNotMatch(head, /id="p27-startup-splash"/);
  assert.match(body, /<div id="p27-startup-splash"/);
  assert.ok(body.indexOf('id="p27-startup-splash"') < body.indexOf('id="main-menu"'));
  assert.match(body, /art\.addEventListener\('error',dismiss/);
});
