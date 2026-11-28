import test from 'node:test';
import assert from 'node:assert/strict';
import { registerClubRivalry, auditClubRivalries } from '../src/p27-rivalries.js';
import { DEFAULT_CLUBS } from '../src/club-manager.js';

test('P27 rivalités : aucune rivalité active n’est fabriquée pour les 156 clubs',()=>{
  const audit=auditClubRivalries(DEFAULT_CLUBS,[]);
  assert.equal(audit.totalActive,0);
  assert.equal(audit.complete,false);
  assert.ok(audit.issues.every(issue=>issue.severity==='warning'));
});

test('P27 rivalités : une relation doit être explicite, connue et sans doublon',()=>{
  const clubs=DEFAULT_CLUBS;
  const first=registerClubRivalry(clubs,[],{clubAId:'antananarivo-fc',clubBId:'toamasina-united',division:'D1',type:'historical',reason:'Rivalité à valider',status:'proposed'});
  assert.equal(first.ok,true);
  assert.equal(first.rivalry.status,'proposed');
  assert.equal(registerClubRivalry(clubs,first.rivalries,{clubAId:'toamasina-united',clubBId:'antananarivo-fc',division:'D1'}).reason,'duplicate-rivalry');
  assert.equal(registerClubRivalry(clubs,[],{clubAId:'antananarivo-fc',clubBId:'antananarivo-fc',division:'D1'}).reason,'invalid-club-pair');
  assert.equal(registerClubRivalry(clubs,[],{clubAId:'antananarivo-fc',clubBId:'not-a-club',division:'D1'}).reason,'unknown-club');
});

test('P27 rivalités : la limite de cinq relations actives par division est contrôlée',()=>{
  let rivalries=[];
  const pairs=[['antananarivo-fc','toamasina-united'],['dakar-milan-union','manparis-sporting'],['londaka-city','lisboa-nova-athletic'],['fianarantsoa-athletic','osaka-antsirabe-fc'],['mahajanga-city','rio-tana-creative'],['antsirabe-sport','valencia-northbridge']];
  for(const [clubAId,clubBId] of pairs.slice(0,5)){
    const result=registerClubRivalry(DEFAULT_CLUBS,rivalries,{clubAId,clubBId,division:'D1',status:'active'});
    assert.equal(result.ok,true);rivalries=result.rivalries;
  }
  assert.equal(registerClubRivalry(DEFAULT_CLUBS,rivalries,{clubAId:pairs[5][0],clubBId:pairs[5][1],division:'D1',status:'active'}).reason,'division-rivalry-limit');
  assert.equal(auditClubRivalries(DEFAULT_CLUBS,rivalries).counts.D1,5);
});

