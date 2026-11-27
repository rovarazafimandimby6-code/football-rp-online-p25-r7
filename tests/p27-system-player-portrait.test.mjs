import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSystemPlayerPortrait, systemPlayerPortraitDataUri } from '../src/p27-system-player-portrait.js';

const player = {
  id: 'club-a-ai-01', name: 'Mika Rakoto', role: 'FWD', position: 'AC', number: 9,
  appearance: {
    skinTone: 'brown', bodyBuild: 'athletic', hairStyle: 'curly', hairColor: 'black',
    faceShape: 'angular', eyeShape: 'almond',
    kitColors: { primary: '#1459a6', secondary: '#f4f4f4' }
  }
};

test('system portrait is an offline SVG data URI and stable for the same player', () => {
  const first = systemPlayerPortraitDataUri(player);
  const second = systemPlayerPortraitDataUri({ ...player, appearance: { ...player.appearance } });
  assert.match(first, /^data:image\/svg\+xml;charset=UTF-8,/);
  assert.equal(first, second);
  const svg = decodeURIComponent(first.split(',')[1]);
  assert.match(svg, /Mika Rakoto|viewBox="0 0 224 250"/);
  assert.match(svg, /#1459a6/);
});

test('library and profile variants render portrait images with role labels', () => {
  const card = renderSystemPlayerPortrait(player, 'card');
  const detail = renderSystemPlayerPortrait(player, 'detail');
  assert.match(card, /player-card-portrait-system/);
  assert.match(detail, /player-career-avatar-portrait/);
  assert.match(card, /<img loading="lazy"/);
  assert.match(card, /<small>AC<\/small>/);
  assert.match(detail, /alt="Portrait du joueur Mika Rakoto"/);
});

test('portrait generation safely falls back when appearance and kit colors are absent', () => {
  const fallback = systemPlayerPortraitDataUri({ id: 'free-agent-01', name: 'A. Joueur' });
  const svg = decodeURIComponent(fallback.split(',')[1]);
  assert.match(svg, /#d99d70/);
  assert.match(svg, /#2865a8/);
});

test('system portraits upgrade to the existing 3D humanoid model lazily', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const renderer = await readFile(resolve(root, 'src/p27-system-player-portrait-3d.js'), 'utf8');
  const integration = await readFile(resolve(root, 'src/p27-system-player-portrait.js'), 'utf8');
  const main = await readFile(resolve(root, 'src/main.js'), 'utf8');
  assert.match(renderer, /Superhero_Male_FullBody\.gltf/);
  assert.match(renderer, /Hair_SimpleParted|Hair_Buzzed/);
  assert.match(renderer, /powerPreference: 'low-power'/);
  assert.match(renderer, /MAX_CACHE = 180/);
  assert.match(renderer, /p27PortraitOwnedGeometry/);
  assert.match(renderer, /if \(node\.userData\?\.p27PortraitOwnedGeometry\) node\.geometry/);
  assert.match(integration, /IntersectionObserver/);
  assert.match(integration, /systemPlayerPortraitDataUri\(p\)/);
  assert.match(integration, /module\.renderSystemPlayerPortrait3D\(player\)/);
  assert.match(main, /hasPortrait\\?renderSystemPlayerPortrait\\(player,'roster'\\):''/);

  assert.match(main, /has-system-portrait/);
  assert.match(main, /player\.isHuman!==true&&player\.ownerType!=='human'/);
});
