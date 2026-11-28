import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const game = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');

test('P27 remplacements IA : bancs réels distincts, deux équipes et contrôle humain protégé', () => {
  assert.match(game, /benchPlayers = \{/);
  assert.match(game, /createMatchSquad\('red', formation, callbacks\.awayRoster, null, this\.benchSize\)/);
  assert.match(game, /selectAISubstitution\(/);
  assert.match(game, /processAISubstitutions\(dt\)/);
  assert.match(game, /outgoing\.isControlled/);
  assert.match(game, /this\.substitutionsUsed\[team\] \+= 1/);
  assert.match(game, /onlineBridge \|\| this\.match\.phase !== 'goal'/);
});
