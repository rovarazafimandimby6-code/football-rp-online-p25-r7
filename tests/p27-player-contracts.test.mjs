import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSystemWeeklyWage, createSystemPlayerContract } from '../src/p27-player-contracts.js';

test('P27 contrats joueurs : barème salarial déterministe et progressif par division',()=>{
  assert.equal(calculateSystemWeeklyWage({division:'D1',rating:75}),1200);
  assert.equal(calculateSystemWeeklyWage({division:'D2',rating:68}),800);
  assert.ok(calculateSystemWeeklyWage({division:'D1',rating:85})>calculateSystemWeeklyWage({division:'D1',rating:65}));
  assert.ok(calculateSystemWeeklyWage({division:'D1',rating:75})>calculateSystemWeeklyWage({division:'D5',rating:49}));
  assert.equal(calculateSystemWeeklyWage({division:'D6',rating:50}),null);
});
test('P27 contrats joueurs : contrat système stable, rattaché au club et au joueur',()=>{
  const input={clubId:'club-a',playerId:'player-a',division:'D3',rating:62};
  const contract=createSystemPlayerContract(input);
  assert.deepEqual(contract,createSystemPlayerContract(input));
  assert.equal(contract.clubId,'club-a');
  assert.equal(contract.playerId,'player-a');
  assert.equal(contract.status,'active');
  assert.equal(contract.salary,contract.weeklyWage);
});
