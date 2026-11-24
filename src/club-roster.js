import { createSystemPlayerContract } from './p27-player-contracts.js';
const NATIONAL_POOLS = Object.freeze({
  MG: { names: ['Toky','Hery','Mika','Tiana','Njaka','Kanto','Mamy','Faneva','Rado','Ando','Lova','Tahina','Faly','Niry','Hasina','Miora','Soa','Voary','Nantenaina','Fitia','Tsanta','Haja'], surnames: ['Rakoto','Randria','Andrian','Raveloson','Razafindrakoto','Rasolo','Ramanantsoa','Rakotomalala','Randrianarisoa','Andriamihaja','Razanakoto','Rajaonarison','Rafalimanana','Rakotondrabe','Ratsimbazafy','Rasoanaivo','Andriatsiferana','Rakotovao'] },
  FR: { names: ['Noah','Elias','Mathis','Yanis','Enzo','Sami','Lucas','Nolan','Theo','Mael','Bastien','Adrien','Ilyes','Remy'], surnames: ['Morel','Diallo','Laurent','Bernard','Camara','Leroy','Petit','Garnier','Fontaine','Chevalier','Roux','Marchand','Giraud','Perrin','Colin','Andre'] },
  SN: { names: ['Ibrahima','Moussa','Cheikh','Amadou','Pape','Lamine','Seydou','Ousmane','Mamadou','Boubacar','Alioune','Modou'], surnames: ['Diop','Ndiaye','Fall','Sarr','Ba','Faye','Cisse','Gueye','Kane','Sow','Diallo','Seck','Sy','Thiam'] },
  BR: { names: ['Caio','Rafael','Thiago','Lucas','Joao','Davi','Mateus','Bruno','Vinicius','Gabriel','Renan','Igor','Pedro','Wesley'], surnames: ['Santos','Oliveira','Costa','Souza','Almeida','Ferreira','Pereira','Ribeiro','Carvalho','Moura','Barbosa','Araujo','Lima','Mendes'] },
  ES: { names: ['Iker','Mateo','Hugo','Adrian','Diego','Pablo','Sergio','Alvaro','Marco','Javier','Raul','Gael','Dario','Nico'], surnames: ['Navarro','Vega','Serrano','Molina','Castro','Reyes','Ortega','Moreno','Delgado','Marin','Santos','Cabrera','Fuentes','Iglesias'] },
  AR: { names: ['Mateo','Tomas','Lautaro','Nicolas','Facundo','Julian','Agustin','Franco','Tiziano','Luca','Bautista','Ramiro'], surnames: ['Valdez','Acosta','Ferreyra','Benitez','Rojas','Pereyra','Mendez','Aguero','Sosa','Ledesma','Quiroga','Correa','Farias','Varela'] },
  PT: { names: ['Tiago','Diogo','Rui','Andre','Goncalo','Afonso','Nuno','Martim','Duarte','Rodrigo','Tomas','Fabio'], surnames: ['Costa','Pereira','Carvalho','Mendes','Lopes','Rocha','Teixeira','Moreira','Fernandes','Correia','Barros','Monteiro','Pinto','Matos'] },
  JP: { names: ['Haruto','Ren','Yuto','Sota','Kaito','Daiki','Riku','Itsuki','Takumi','Hayato','Kenta','Shota'], surnames: ['Sato','Suzuki','Takahashi','Tanaka','Watanabe','Ito','Nakamura','Kobayashi','Yamamoto','Kato','Yoshida','Yamada','Matsuda','Ishikawa'] },
  NG: { names: ['Chinedu','Emeka','Tobi','Kelechi','Obinna','Samuel','David','Chukwu','Ifeanyi','Nnamdi','Olu','Uche'], surnames: ['Okafor','Eze','Adeyemi','Bello','Nwosu','Ibrahim','Ojo','Obi','Adebayo','Onyeka','Udo','Musa','Okoye','Balogun'] },
  IT: { names: ['Lorenzo','Matteo','Alessio','Riccardo','Andrea','Gabriele','Federico','Nicolo','Tommaso','Elia'], surnames: ['Romano','Conti','Gallo','Greco','Marino','Bruno','Lombardi','Rinaldi','De Luca','Costa','Moretti','Barbieri'] },
  GB: { names: ['Ethan','Oliver','Mason','Callum','Reece','Jude','Finley','Lewis','Archie','Harvey'], surnames: ['Bennett','Walker','Turner','Cooper','Hughes','Morgan','Fletcher','Ward','Brooks','Parker','Hayes','Clarke'] },
  KE: { names: ['Brian','Kevin','Victor','Daniel','Collins','Dennis','Ian','Mark','Eliud','Moses'], surnames: ['Otieno','Wanjala','Kamau','Mwangi','Omondi','Kiptoo','Barasa','Mutua','Njoroge','Kibet','Ochieng','Kariuki'] },
  MA: { names: ['Yassine','Amine','Hamza','Anas','Ilyas','Mehdi','Rayan','Sofiane'], surnames: ['El Amrani','Bennani','Alaoui','Idrissi','Boukhris','Mansouri','Ziani','Chakir'] },
  DZ: { names: ['Yacine','Amir','Karim','Nassim','Walid','Samir','Riad','Adel'], surnames: ['Bensaid','Bouzid','Mansouri','Haddad','Belkacem','Ait Ali','Mebarki','Khelifi'] },
  TN: { names: ['Aymen','Fares','Malek','Wassim','Tarek','Nizar','Sami','Zied'], surnames: ['Trabelsi','Ben Youssef','Gharbi','Jaziri','Khemiri','Saidi','Mabrouk','Ayari'] }
});

// Quotas are intentional club identities, not random nationality roulette.
const NATIONALITY_PROFILES = Object.freeze({
  'antananarivo-fc': { MG:4, FR:2, SN:1, BR:1, PT:1, ES:1, NG:1, JP:1 },
  'manparis-sporting': { FR:2, GB:2, SN:2, NG:1, ES:1, PT:1, MA:1, IT:1 },
  'dakar-milan-union': { SN:3, IT:2, FR:2, BR:1, MG:1, TN:1, PT:1 },
  'toamasina-united': { MG:5, SN:1, FR:1, BR:1, PT:1, KE:1, JP:1, NG:1 },
  'londaka-city': { GB:2, SN:2, FR:2, NG:1, ES:1, PT:1, DZ:1, IT:1 },
  'lisboa-nova-athletic': { PT:3, BR:2, ES:2, FR:1, MG:1, NG:1, MA:1, GB:1 },
  'fianarantsoa-athletic': { MG:5, FR:1, SN:1, NG:1, JP:1, KE:1, BR:1, PT:1 },
  'osaka-antsirabe-fc': { MG:4, JP:3, BR:1, FR:1, SN:1, NG:1, PT:1 },
  'mahajanga-city': { MG:5, SN:1, FR:1, NG:1, BR:1, KE:1, PT:1, ES:1 },
  'rio-tana-creative': { MG:4, BR:3, PT:1, FR:1, SN:1, AR:1, NG:1 },
  'antsirabe-sport': { MG:5, FR:1, ES:1, PT:1, NG:1, KE:1, SN:1, JP:1 },
  'valencia-northbridge': { ES:2, AR:2, PT:1, FR:1, NG:1, MG:1, SN:1, IT:1, BR:1, GB:1 },
  'tulear-sunrise': { MG:5, FR:1, SN:1, BR:1, KE:1, PT:1, NG:1, ES:1 },
  'morondava-lagoon': { MG:5, SN:1, FR:1, PT:1, KE:1, NG:1, BR:1, IT:1 },
  'nairobi-tana-academy': { MG:3, KE:3, NG:2, SN:1, FR:1, BR:1, PT:1 },
  'antsiranana-north-fc': { MG:5, FR:1, SN:1, JP:1, NG:1, KE:1, BR:1, ES:1 }
});


const CLUB_KIT_DESIGNS = Object.freeze({
  'antananarivo-fc':'vertical', 'manparis-sporting':'sash', 'dakar-milan-union':'hoops', 'toamasina-united':'wave',
  'londaka-city':'pinstripes', 'lisboa-nova-athletic':'quartered', 'fianarantsoa-athletic':'chevron', 'osaka-antsirabe-fc':'sunburst',
  'mahajanga-city':'horizontal', 'rio-tana-creative':'diagonal', 'antsirabe-sport':'central', 'valencia-northbridge':'split',
  'tulear-sunrise':'shoulder', 'morondava-lagoon':'ripple', 'nairobi-tana-academy':'cross', 'antsiranana-north-fc':'sidepanels'
});

const ARCHETYPES = Object.freeze({ GK: ['Gardien réflexe','Gardien relanceur'], DEF: ['Défenseur stoppeur','Défenseur relanceur','Latéral endurant','Défenseur aérien'], MID: ['Milieu récupérateur','Meneur créatif','Relayeur dynamique','Milieu organisateur'], FWD: ['Avant-centre puissant','Ailier percutant','Attaquant mobile','Finisseur de surface'] });
const ROLES = ['GK','GK','DEF','DEF','DEF','DEF','MID','MID','MID','MID','FWD','FWD'];
const AGE_PROFILE = [18,19,21,22,23,24,25,26,27,28,30,32];
const DIVISION_PLAYER_BANDS = Object.freeze({
  D1: Object.freeze({ min:65, max:84, baseline:75 }),
  D2: Object.freeze({ min:59, max:77, baseline:68 }),
  D3: Object.freeze({ min:53, max:70, baseline:61.5 }),
  D4: Object.freeze({ min:47, max:64, baseline:55.5 }),
  D5: Object.freeze({ min:40, max:58, baseline:49 })
});
function playerPotential(overall, random) {
  const roll = random();
  if (roll < 0.65) return { potential: Math.min(90, overall + Math.floor(random() * 9)), potentialBand: 'standard' };
  if (roll < 0.88) return { potential: Math.min(94, Math.max(overall, 72 + Math.floor(random() * 13))), potentialBand: 'good' };
  if (roll < 0.97) return { potential: Math.min(97, Math.max(overall, 82 + Math.floor(random() * 9))), potentialBand: 'high' };
  return { potential: Math.min(99, Math.max(overall, 90 + Math.floor(random() * 7))), potentialBand: 'exceptional' };
}
export const PLAYER_ATTRIBUTE_KEYS = Object.freeze(['pace','shooting','passing','defense','stamina','control']);
const ROLE_ATTRIBUTE_BIAS = Object.freeze({
  GK: { pace:-2, shooting:-22, passing:1, defense:14, stamina:-2, control:11 },
  DEF: { pace:0, shooting:-12, passing:1, defense:12, stamina:4, control:1 },
  MID: { pace:2, shooting:-1, passing:9, defense:0, stamina:5, control:7 },
  FWD: { pace:8, shooting:12, passing:-2, defense:-10, stamina:1, control:5 }
});
const ARCHETYPE_ATTRIBUTE_BIAS = Object.freeze({
  'Gardien réflexe': { defense:4, control:2 }, 'Gardien relanceur': { passing:5, control:3 },
  'Défenseur stoppeur': { defense:5, pace:-2 }, 'Défenseur relanceur': { passing:5, control:2 },
  'Latéral endurant': { pace:4, stamina:4, defense:-2 }, 'Défenseur aérien': { defense:4, stamina:2 },
  'Milieu récupérateur': { defense:4, stamina:4, passing:-2 }, 'Meneur créatif': { passing:5, control:4, defense:-2 },
  'Relayeur dynamique': { pace:2, stamina:4, control:1 }, 'Milieu organisateur': { passing:4, control:3 },
  'Avant-centre puissant': { shooting:5, control:2, pace:-1 }, 'Ailier percutant': { pace:5, shooting:2 },
  'Attaquant mobile': { pace:3, passing:2, control:2 }, 'Finisseur de surface': { shooting:6, pace:-1, passing:-2 }
});
function generateAttributes(overall, role, archetype, random) {
  const bias = { ...(ROLE_ATTRIBUTE_BIAS[role] || {}) };
  for (const [key, value] of Object.entries(ARCHETYPE_ATTRIBUTE_BIAS[archetype] || {})) bias[key] = (bias[key] || 0) + value;
  const meanBias = PLAYER_ATTRIBUTE_KEYS.reduce((sum,key)=>sum+(bias[key]||0),0) / PLAYER_ATTRIBUTE_KEYS.length;
  const noise = Object.fromEntries(PLAYER_ATTRIBUTE_KEYS.map(key=>[key, random()*6-3]));
  const meanNoise = PLAYER_ATTRIBUTE_KEYS.reduce((sum,key)=>sum+noise[key],0) / PLAYER_ATTRIBUTE_KEYS.length;
  return Object.fromEntries(PLAYER_ATTRIBUTE_KEYS.map(key=>[key, Math.max(25, Math.min(99, Math.round(overall + (bias[key]||0) - meanBias + noise[key] - meanNoise)))]));
}
const FORBIDDEN_REAL_NAMES = new Set(['thiago silva','lionel messi','cristiano ronaldo','neymar jr','neymar junior','kylian mbappe','lamine yamal','erling haaland','mohamed salah','kevin de bruyne','vinicius junior','jude bellingham','antoine griezmann','karim benzema','sadio mane','didier drogba','zinedine zidane','ronaldinho','pele','diego maradona']);

function hashSeed(value) { let hash = 2166136261; for (const char of String(value)) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); } return hash >>> 0; }
function randomFor(seed) { let state = seed >>> 0; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }; }
function pick(list, random) { return list[Math.floor(random() * list.length)]; }
function shuffled(values, random) { const result = [...values]; for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; } return result; }
function nationalityPlan(club, count, random) {
  const homeCode = /^[A-Z]{2}$/.test(club.countryCode || '') ? club.countryCode : 'MG';
  const recruitment = club.recruitmentProfile;
  if (recruitment?.mode === 'country' && NATIONAL_POOLS[recruitment.countryCode]) return Array(count).fill(recruitment.countryCode);
  if (recruitment?.mode === 'continent' && Array.isArray(recruitment.nationalityCodes)) {
    const eligible = recruitment.nationalityCodes.filter(code => NATIONAL_POOLS[code]);
    if (eligible.length) return shuffled(Array.from({ length: count }, (_, index) => eligible[index % eligible.length]), random);
  }
  const internationalCodes = Object.keys(NATIONAL_POOLS).filter(code => code !== homeCode);
  const localShare = homeCode === 'MG' ? 0.67 : 0.35;
  const localCount = Math.max(1, Math.min(count - 2, Math.round(count * localShare)));
  const internationalCount = count - localCount;
  const internationalPlan = Array.from({ length: internationalCount }, (_, index) => internationalCodes[index % internationalCodes.length]);
  const plan = [...Array(localCount).fill(homeCode), ...internationalPlan];
  const fallback = Object.keys(NATIONAL_POOLS).filter(code => !plan.includes(code));
  while (plan.length < count) plan.push(pick(fallback.length ? fallback : Object.keys(NATIONAL_POOLS), random));
  return shuffled(plan.slice(0, count), random);
}
function createUniqueName(code, random, usedNames, index, clubId) {
  const pool = NATIONAL_POOLS[code] || NATIONAL_POOLS.MG;
  for (let attempt = 0; attempt < 100; attempt++) {
    const name = `${pick(pool.names, random)} ${pick(pool.surnames, random)}`;
    const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!FORBIDDEN_REAL_NAMES.has(key) && !usedNames.has(key)) { usedNames.add(key); return name; }
  }
  const fallback = `${pick(pool.names, random)} ${pick(pool.surnames, random)} ${String(clubId).replace(/[^a-z0-9]/gi,'').slice(-6).toUpperCase()}${index + 1}`;
  usedNames.add(fallback.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());
  return fallback;
}

export function generateClubRoster(club, { size = 12, usedNames = new Set() } = {}) {
  const count = Math.max(1, Math.min(30, Math.floor(Number(size) || 12)));
  const random = randomFor(hashSeed(`fpro-p23:${club.id}:roster-v2`));
  const nationalities = nationalityPlan(club, count, random);
  const shuffledAges = shuffled(AGE_PROFILE, random);
  const ages = [18,30,19,28,21,32,...shuffledAges.filter(age => ![18,19,21,28,30,32].includes(age))];
  while (ages.length < count) ages.push(18 + Math.floor(random() * 16));
  const roster = [];
  for (let index = 0; index < count; index++) {
    const code = nationalities[index];
    const name = createUniqueName(code, random, usedNames, index, club.id);
    const role = ROLES[index] || pick(['DEF','MID','FWD'], random);
    const band = DIVISION_PLAYER_BANDS[club.division] || DIVISION_PLAYER_BANDS.D5;
    const clubStrength = Math.max(-4, Math.min(4, ((Number(club.rating) || band.baseline) - band.baseline) * 0.55));
    const roleAdjustment = role === 'FWD' ? 0.6 : role === 'MID' ? 0.3 : role === 'GK' ? -0.3 : 0;
    const variation = ((random() + random()) - 1) * 5.5;
    const overall = Math.max(band.min, Math.min(band.max, Math.round((band.min + band.max) / 2 + clubStrength + variation + roleAdjustment)));
    const age = ages[index];
    const talent = playerPotential(overall, random);
    const bodyBuild = pick(['lean','athletic','strong'], random);
    const archetype = pick(ARCHETYPES[role], random);
    const attributes = generateAttributes(overall, role, archetype, random);
    const skinTone = pick((({
      MG: ['light','tan','tan','medium','brown','dark','medium','brown'],
      SN: ['brown','dark','dark','deep','medium','brown'], NG: ['brown','dark','dark','deep','medium','brown'], KE: ['light','tan','medium','brown','dark','medium'],
      BR: ['light','light','tan','tan','medium','brown','dark','medium'],
      FR: ['light','light','light','tan','medium','brown'], GB: ['light','light','tan','medium','brown'], IT: ['light','light','tan','medium','brown'], ES: ['light','light','tan','medium','brown'], PT: ['light','light','tan','medium','brown'], AR: ['light','light','tan','medium','brown'],
      JP: ['light','light','light','tan','medium'], MA: ['light','olive','olive','tan','medium'], DZ: ['light','olive','olive','tan','medium'], TN: ['light','olive','olive','tan','medium']
    })[code] || ['light','tan','medium','brown']), random);
    const loyaltyRoll = random();
    const clubLoyalty = Math.max(5, Math.min(100, Math.round(35 + random() * 60 + (club.strategicProfile?.loyaltyCulture === 'strong' ? 8 : 0))));
    const departurePolicy = loyaltyRoll < 0.025 ? 'no-normal-exit'
      : loyaltyRoll < 0.18 ? 'reluctant'
      : loyaltyRoll < 0.82 ? 'balanced' : 'ambitious';
    const transferWillingness = departurePolicy === 'no-normal-exit' ? Math.min(8, 100 - clubLoyalty)
      : departurePolicy === 'reluctant' ? Math.min(28, 100 - clubLoyalty)
      : departurePolicy === 'ambitious' ? Math.max(55, 100 - clubLoyalty)
      : Math.max(15, Math.min(70, Math.round((100 - clubLoyalty) * 0.72 + random() * 18)));
    roster.push({
      id: `${club.id}-ai-${String(index + 1).padStart(2,'0')}`,
      playerType: 'system', controlStatus: 'system',
      contract: createSystemPlayerContract({ clubId: club.id, playerId: `${club.id}-ai-${String(index + 1).padStart(2,'0')}`, division: club.division, rating: overall }),
      name, nationality: code, age, role, number: index + 1,
      rating: overall, potential: talent.potential, potentialBand: talent.potentialBand, attributes,
      loyalty: { clubLoyalty, transferWillingness, departurePolicy },
      preferredFoot: random() < 0.28 ? 'left' : 'right',
      archetype,
      appearance: {
        skinTone, bodyBuild,
        kitColors: role === 'GK' ? { primary: club.colors?.[2] || '#eaf4ff', secondary: club.colors?.[0] || '#2676f2', accent: club.colors?.[1] || '#123269' } : { primary: club.colors?.[0] || '#2676f2', secondary: club.colors?.[1] || '#123269', accent: club.colors?.[2] || '#eaf4ff' },
        kitDesign: CLUB_KIT_DESIGNS[club.id] || club.kitDesign || 'central', kitVariant: role === 'GK' ? 'goalkeeper' : 'outfield',
        hairStyle: pick((['JP','MA','DZ','TN'].includes(code) ? ['short','short','fade','wavy','curly','shaved'] : ['short','short','curly','afro','fade','shaved','braids','twists','wavy']), random),
        hairColor: pick(['dark','dark','brown','black','brown','blond'], random),
        faceShape: pick(['oval','round','angular','long','square'], random),
        eyeShape: pick(['almond','round','deep-set','hooded'], random)
      }
    });
  }
  return roster;
}

export function stableClubSeed(clubId) { return hashSeed(`fpro-p23:${clubId}`); }
export const SUPPORTED_NATIONALITIES = Object.freeze(Object.keys(NATIONAL_POOLS));
