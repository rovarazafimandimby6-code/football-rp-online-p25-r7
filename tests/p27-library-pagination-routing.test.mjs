import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');

test('player and club library pagination is not routed as a screen change', () => {
  const paginationGuard = source.indexOf(
    "const isLibraryPagination = pageButton && ['players-page', 'club-page'].includes(pageButton.dataset.action);"
  );
  const genericPageRoute = source.indexOf(
    "if (pageButton && !isLibraryPagination) { renderPage(pageButton.dataset.view || pageButton.dataset.page); return; }"
  );
  const playerPaginationHandler = source.indexOf("if (action === 'players-page')");
  const clubPaginationHandler = source.indexOf("if (action === 'club-page')");

  assert.notEqual(paginationGuard, -1, 'pagination guard must exist');
  assert.notEqual(genericPageRoute, -1, 'generic screen navigation must exclude pagination controls');
  assert.notEqual(playerPaginationHandler, -1, 'player library pagination handler must exist');
  assert.notEqual(clubPaginationHandler, -1, 'club library pagination handler must exist');
  assert.ok(paginationGuard < genericPageRoute, 'guard must be evaluated before generic navigation');
  assert.ok(genericPageRoute < clubPaginationHandler, 'pagination actions must reach their dedicated handlers');
});
