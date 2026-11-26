import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
const css=await readFile(new URL('../style.css',import.meta.url),'utf8');

test('P27 catalogue UI : charge le catalogue de saison par pages et vérifie les 156 identifiants',()=>{
  assert.match(main,/fetch\('\/api\/clubs\?limit=100&offset='/);
  assert.match(main,/fetchPage\(0\),fetchPage\(100\)/);
  assert.match(main,/pages\[0\]\.total!==156/);
  assert.match(main,/new Set\(items\.map\(item=>item\.id\)\)\.size!==156/);
});

test('P27 catalogue UI : affiche les cinq divisions et les conférences D4/D5',()=>{
  for(const token of ['Premier League','Ligue 2','National League','Challenger League','Regional League','Conférence A · 16 clubs | Conférence B · 16 clubs','Conférences A, B, C et D · 16 clubs chacune']) assert.ok(main.includes(token),token);
  assert.match(main,/id="club-conference-filter"/);
  assert.match(main,/card\.dataset\.conference===conference/);
  assert.match(main,/data-conference=/);
});

test('P27 catalogue UI : distingue les clubs à admission ouverte des clubs réservés au système',()=>{
  assert.match(main,/humanAdmission==='system-only'/);
  assert.match(main,/ADMISSION OUVERTE/);
  assert.match(main,/RÉSERVÉ AUX JOUEURS DU SYSTÈME/);
});

test('P27 catalogue UI : conserve le catalogue local si le serveur est indisponible',()=>{
  assert.match(main,/catalogue local de secours affiché/);
  assert.match(main,/publicClubDirectoryCache\.get\(selectedClubId\)/);
});

test('P27 catalogue UI : les badges de conférence restent lisibles sur mobile',()=>{
  assert.match(css,/\.club-card-kickers/);
  assert.match(css,/\.club-conference-tag/);
  assert.match(css,/@media\(max-width:560px\)\{\.club-card-kickers/);
});

test('P27 club identity UI: uses the approved red/system and green/human management vocabulary',()=>{
  assert.match(main,/club-control-indicator/);
  assert.match(main,/CLUB DIRIGÉ PAR LE SYSTÈME/);
  assert.match(main,/CLUB DIRIGÉ PAR UN JOUEUR/);
  assert.doesNotMatch(main,/\\bIA\\b/);
  assert.doesNotMatch(main,/intelligence artificielle/);
  assert.match(css,/\.club-control-indicator\.human i/);
});


test('P27 Club RP UI : une réponse réseau ancienne ne remplace pas le dernier écran demandé',()=>{
  assert.match(main,/let rpClubPageRequestSequence = 0/);
  assert.match(main,/const requestId = \+\+rpClubPageRequestSequence/);
  assert.match(main,/requestId !== rpClubPageRequestSequence \|\| !document\.getElementById\('rp-club-root'\)/);
});
