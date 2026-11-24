import test from 'node:test';
import assert from 'node:assert/strict';
import { server } from '../server/index.js';

test('P27 API HTTP : catalogue consultable, filtrable et protégé contre les filtres invalides', async () => {
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const address=server.address();
  const base='http://127.0.0.1:'+address.port;
  try {
    const allResponse=await fetch(base+'/api/clubs?limit=100');
    assert.equal(allResponse.status,200);
    const all=await allResponse.json();
    assert.equal(all.total,156);
    assert.equal(all.clubs.length,100);
    assert.ok(all.clubs.every(club=>!Object.hasOwn(club,'roster')));

    const conferenceResponse=await fetch(base+'/api/clubs?division=D4&conference=Nord');
    assert.equal(conferenceResponse.status,200);
    const conference=await conferenceResponse.json();
    assert.equal(conference.total,16);
    assert.ok(conference.clubs.every(club=>club.division==='D4'&&club.conference==='Nord'));

    const detailResponse=await fetch(base+'/api/clubs/antsiranana-north-fc');
    assert.equal(detailResponse.status,200);
    const detail=await detailResponse.json();
    assert.equal(detail.club.name,'Antsiranana North FC');
    assert.equal(detail.club.conference,'Nord');
    assert.equal(Object.hasOwn(detail.club,'roster'),false);

    const invalidResponse=await fetch(base+'/api/clubs?division=D6');
    assert.equal(invalidResponse.status,400);
    assert.equal((await invalidResponse.json()).error,'INVALID_DIVISION');
  } finally {
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});
