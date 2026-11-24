import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const css=await readFile(new URL('../style.css',import.meta.url),'utf8');

test('P27 compétitions UI : charge les neuf classements depuis le snapshot serveur',()=>{
  assert.match(main,/fetch\('\/api\/competitions'/);
  assert.match(main,/leagues\.length!==9/);
  assert.match(main,/snapshot\.scheduleAudit\?\.ok/);
  assert.match(main,/snapshot\.scheduleAudit\.fixtureCount!==1892/);
  assert.match(main,/Classements officiels/);
});

test('P27 compétitions UI : sépare les conférences D4 et D5 et affiche les rencontres',()=>{
  assert.match(main,/CONFÉRENCE '\+competition\.conference/);
  assert.match(main,/competition\.fixtures\.length/);
  assert.match(main,/status==='completed'/);
  assert.match(main,/status==='scheduled'/);
});

test('P27 compétitions UI : le barème des mouvements reste explicitement non approuvé',()=>{
  assert.match(main,/APERÇU NON APPROUVÉ/);
  assert.match(main,/barème doit encore être validé/);
  assert.match(main,/barème reste soumis à validation/);
});

test('P27 compétitions UI : le tableau de la Coupe des Clubs conserve ses 156 participants',()=>{
  assert.match(main,/Coupe des Clubs/);
  assert.match(main,/cup\?\.members\?\.length/);
  assert.match(main,/cup\?\.fixtures\?\.length/);
});

test('P27 compétitions UI : les tableaux et aperçus restent adaptables aux petits écrans',()=>{
  assert.match(css,/\.server-season-overview/);
  assert.match(css,/\.server-fixture-preview/);
  assert.match(css,/@media\(max-width:560px\)\{\.server-season-overview/);
});

test('P27 compétitions UI : indique les formats distincts selon la division',()=>{
 assert.match(main,/ALLER-RETOUR/);
 assert.match(main,/ALLER SIMPLE/);
 assert.match(main,/competition\.matchFormat/);
});

test('P27 compétitions UI : affiche le résultat du contrôle structurel de la Coupe',()=>{
 assert.match(main,/snapshot\.cupAudit/);
 assert.match(main,/TABLEAU CONTRÔLÉ/);
 assert.match(main,/ANOMALIE DU TABLEAU/);
 assert.match(main,/completedFixtures/);
 assert.match(main,/Vainqueur :/);
});
