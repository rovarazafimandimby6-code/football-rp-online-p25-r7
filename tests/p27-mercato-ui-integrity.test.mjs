import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const marketStart = source.indexOf("page === 'mercato'");
const marketEnd = source.indexOf("\n  } else {", marketStart);
const market = source.slice(marketStart, marketEnd);
const signStart = source.indexOf("action === 'sign-contract'");
const offerStart = source.indexOf("action === 'generate-offers'");
const acceptStart = source.indexOf("action === 'accept-offer'");
const acceptEnd = source.indexOf("\n  } else if", acceptStart);

test('P27 Mercato : actualise chaque statut contractuel une seule fois à l’ouverture', () => {
  assert.notEqual(marketStart, -1);
  assert.equal((market.match(/career\.refreshContractStatus\(\)/g) || []).length, 1);
  assert.equal((market.match(/career\.refreshOfferStatuses\(\)/g) || []).length, 1);
});

test('P27 Mercato : garde les catalogues distincts des offres et contrats', () => {
  assert.match(market, /data-page="players"/);
  assert.match(market, /data-page="clubs"/);
  assert.match(market, /Le Mercato gère les contrats et les offres/);
  assert.match(market, /Les catalogues servent à consulter les joueurs et les clubs/);
});

test('P27 Mercato : les offres simulées ciblent uniquement les clubs admissibles avec une place', () => {
  assert.notEqual(offerStart, -1);
  const handler = source.slice(offerStart, source.indexOf("\n  } else if", offerStart));
  assert.match(handler, /club\.id !== career\.clubId/);
  assert.match(handler, /club\.humanAdmission !== 'system-only'/);
  assert.match(handler, /club\.roster\.length < club\.capacity/);
  assert.match(handler, /club\.roster\.filter\(player => player\.playerType === 'human'\)\.length < 7/);
  assert.match(handler, /!pendingOffers\.some\(offer => offer\.fromClubId === club\.id\)/);
});

test('P27 Mercato : signature et acceptation vérifient l’inscription au roster et annulent si la synchronisation échoue', () => {
  assert.notEqual(signStart, -1);
  assert.notEqual(acceptStart, -1);
  const signHandler = source.slice(signStart, offerStart);
  const acceptHandler = source.slice(acceptStart, acceptEnd);
  for (const handler of [signHandler, acceptHandler]) {
    assert.match(handler, /targetClub\.roster\.length < targetClub\.capacity/);
    assert.match(handler, /targetClub\.humanAdmission !== 'system-only'/);
    assert.match(handler, /syncCareerPlayerRoster/);
    assert.match(handler, /career\.restoreState\(before\)/);
  }
});
