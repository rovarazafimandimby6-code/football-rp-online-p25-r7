import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('P15 : le moteur protège le callback de fin contre les doubles déclenchements', async () => {
  const game = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
  assert.match(game, /reportMatchEnd\(\)/);
  assert.match(game, /if \(this\.matchResultReported \|\| this\.match\.phase !== 'fulltime'\) return false/);
  assert.match(game, /this\.matchResultReported = true/);
  assert.match(game, /this\.matchResultReported = false/);
  assert.equal((game.match(/this\.reportMatchEnd\(\);/g) || []).length, 3);
  assert.match(game, /if \(this\.onlineBridge\)/);
});

test('P15 : la fin du match relie le résultat aux deux systèmes de carrière', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /onMatchEnd:/);
  assert.match(main, /career\.recordMatch\(/);
  assert.match(main, /applyCareerMatchReward\(\{ careerReward:reward, profileStore, matchId \}\)/);
});
