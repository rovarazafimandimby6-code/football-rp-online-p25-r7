import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, main, css] = await Promise.all([
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  readFile(new URL('../style.css', import.meta.url), 'utf8'),
]);

test('P26 : le menu expose un espace dédié aux résultats serveur', () => {
  assert.match(html, /data-page="results"/);
  assert.match(main, /page === 'results'/);
  assert.match(main, /fetch\(`\/api\/results\?limit=10&offset=/);
});

test('P26 : la liste des résultats utilise les métadonnées de pagination du serveur', () => {
  assert.match(main, /page\.pagination|payload\.pagination/);
  assert.match(main, /page\.hasMore/);
  assert.match(main, /page\.nextOffset/);
  assert.match(main, /data-action="results-page"/);
});

test('P26 : la feuille de match affiche les statistiques collectives et individuelles', () => {
  assert.match(main, /\/api\/rooms\/\$\{encodeURIComponent\(roomId\)\}\/result/);
  for (const field of ['goals','assists','shots','passes','tackles','interceptions','saves']) assert.ok(main.includes(`stats?.${field}`) || main.includes(`row.${field}`), `champ ${field} absent`);
  assert.match(main, /result-player-table/);
  assert.match(css, /\.result-detail-card/);
});
