import { createSystemPlayerContract } from './p27-player-contracts.js';
import { applyPlayerReference, findPlayerReference } from './p27-dls26-reference.js';
import { mapDls19StatsToGameplay } from './p27-dls19-reference.js';
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
  TN: { names: ['Aymen','Fares','Malek','Wassim','Tarek','Nizar','Sami','Zied'], surnames: ['Trabelsi','Ben Youssef','Gharbi','Jaziri','Khemiri','Saidi','Mabrouk','Ayari'] },
  CD: { names:['Cedric','Chancel','Gael','Jonathan','Meschack','Noel','Arthur','Dieumerci'], surnames:['Mbemba','Bakambu','Bongonda','Tshibola','Mukendi','Kalulu','Kabasele','Lukebakio'] },
  CG: { names:['Thievy','Prince','Jordan','Gaius','Durel','Fabrice','Junior','Ruddy'], surnames:['Bifouma','Makouta','Ngouabi','Massengo','Nkouka','Mabiala','Mouandza','Okemba'] },
  CR: { names:['Keylor','Manfred','Joel','Brandon','Anthony','Josue','Alonso','Bryan'], surnames:['Navas','Campbell','Bennette','Ruiz','Ugalde','Matarrita','Gamboa','Moya'] },
  EC: { names:['Enner','Moisés','Piero','Kendry','Jeremy','Gonzalo','Alan','Angel'], surnames:['Valencia','Caicedo','Hincapie','Estupinan','Plata','Mena','Preciado','Angulo'] },
  PY: { names:['Miguel','Julio','Diego','Matias','Gustavo','Oscar','Alex','Cesar'], surnames:['Almiron','Enciso','Gomez','Romero','Cardozo','Villasanti','Gimenez','Rojas'] },
  VE: { names:['Salomon','Yeferson','Jefferson','Josef','Tomas','Eduard','Rafael','Samuel'], surnames:['Rondon','Soteldo','Savarino','Martinez','Rincon','Machis','Herrera','Aramburu'] },
  JM: { names:['Leon','Michail','Andre','Demarai','Shamar','Kemar','Bobby','Daniel'], surnames:['Bailey','Antonio','Gray','Nicholson','Brown','Reid','Ethan','Lowe'] },
  PA: { names:['Anibal','Ismael','Adalberto','Cecilio','Alberto','Freddy','Jose','Luis'], surnames:['Godoy','Diaz','Carrasquilla','Blackman','Barcenas','Quintero','Andrade','Rodriguez'] },
  SA: { names:['Salem','Firas','Abdullah','Sultan','Nawaf','Fahad','Rakan','Hassan'], surnames:['Al-Dawsari','Al-Shehri','Al-Buraikan','Al-Muwallad','Al-Ghannam','Al-Tambakti','Al-Hamdan','Al-Qahtani'] },
  IR: { names:['Mehdi','Sardar','Alireza','Amir','Morteza','Saman','Omid','Reza'], surnames:['Taremi','Azmoun','Jahanbakhsh','Gholizadeh','Pouraliganji','Ansarifard','Torabi','Hosseini'] },
  DK: { names:['Mikkel','Andreas','Christian','Jonas','Rasmus','Kasper','Victor','Emil'], surnames:['Nielsen','Jensen','Hansen','Andersen','Pedersen','Christensen','Larsen','Sorensen'] },
  SE: { names:['Alexander','Viktor','Emil','Hugo','Lucas','Isak','Noah','Oscar'], surnames:['Andersson','Johansson','Karlsson','Nilsson','Eriksson','Larsson','Olsson','Persson'] },
  NO: { names:['Erling','Martin','Sander','Oscar','Kristian','Andreas','Jorgen','Tobias'], surnames:['Hansen','Johansen','Olsen','Larsen','Andersen','Pedersen','Nilsen','Berg'] },
  CH: { names:['Granit','Xherdan','Breel','Denis','Noah','Fabian','Ruben','Michel'], surnames:['Xhaka','Shaqiri','Embolo','Zakaria','Okafor','Frei','Vargas','Aebischer'] },
  AT: { names:['David','Marko','Marcel','Konrad','Christoph','Florian','Stefan','Patrick'], surnames:['Alaba','Arnautovic','Sabitzer','Laimer','Baumgartner','Posch','Lienhart','Gregoritsch'] },
  UA: { names:['Oleksandr','Andriy','Mykhailo','Artem','Viktor','Ruslan','Danylo','Illia'], surnames:['Zinchenko','Yarmolenko','Mudryk','Dovbyk','Tsygankov','Malinovskyi','Sudakov','Zabarnyi'] },
  CZ: { names:['Tomas','Patrik','Adam','Lukas','Vaclav','Jakub','David','Antonin'], surnames:['Soucek','Schick','Hlozek','Krejci','Cerny','Coufal','Barak','Kral'] },
  RO: { names:['Radu','Ianis','Denis','Florin','Alexandru','Razvan','Andrei','Mihai'], surnames:['Marin','Hagi','Dragus','Coman','Man','Moldovan','Popescu','Stanciu'] },
  IE: { names:['Conor','Cian','Evan','Rory','Finn','Darragh','Sean','Callum'], surnames:['Murphy','Kelly','Byrne','Ryan','Doyle','Walsh','O’Sullivan','McCarthy'] },
  DE: { names:['Lukas','Leon','Finn','Jonas','Niklas','Felix','Noah','Elias'], surnames:['Muller','Schneider','Fischer','Weber','Wagner','Becker','Hoffmann','Schulz'] },
  NL: { names:['Daan','Sem','Milan','Luuk','Jesse','Thijs','Bram','Lars'], surnames:['de Jong','Jansen','de Vries','van den Berg','Bakker','Visser','Smit','Meijer'] },
  BE: { names:['Noah','Arthur','Lucas','Louis','Liam','Victor','Adam','Milan'], surnames:['Peeters','Janssens','Maes','Jacobs','Mertens','Willems','Claes','Goossens'] },
  HR: { names:['Luka','Ivan','Mateo','Ante','Josip','Marko','Filip','Petar'], surnames:['Kovac','Horvat','Babic','Maric','Novak','Juric','Knezevic','Vukovic'] },
  RS: { names:['Luka','Nikola','Stefan','Milos','Vuk','Lazar','Nemanja','Filip'], surnames:['Jovanovic','Petrovic','Nikolic','Markovic','Djordjevic','Stankovic','Ilic','Pavlovic'] },
  US: { names:['Jayden','Cameron','Logan','Mason','Jordan','Tyler','Aiden','Evan'], surnames:['Brooks','Reed','Bennett','Parker','Hayes','Foster','Coleman','Mitchell'] },
  CA: { names:['Liam','Owen','Ethan','Logan','Noah','Mason','Jacob','Caleb'], surnames:['Wilson','Martin','Tremblay','Roy','Gagnon','Lee','Campbell','Bouchard'] },
  CO: { names:['Santiago','Juan','Samuel','Nicolas','Mateo','Daniel','Andres','David'], surnames:['Rodriguez','Gomez','Martinez','Lopez','Hernandez','Castro','Rojas','Moreno'] },
  PE: { names:['Alonso','Diego','Luis','Joaquin','Piero','Andre','Renato','Matias'], surnames:['Quispe','Flores','Garcia','Ramos','Vargas','Mendoza','Rojas','Salazar'] },
  HT: { names:['Jean','Frantz','Wendell','Steeven','Mackenson','Dany','Ricardo','Peterson'], surnames:['Pierre','Jean-Baptiste','Joseph','Charles','Paul','Etienne','Louis','Cineas'] },
  MX: { names:['Santiago','Diego','Emiliano','Sebastian','Gael','Luis','Javier','Angel'], surnames:['Hernandez','Garcia','Martinez','Lopez','Gonzalez','Perez','Sanchez','Ramirez'] },
  UY: { names:['Facundo','Agustin','Matias','Nicolas','Bruno','Thiago','Federico','Martin'], surnames:['Rodriguez','Gonzalez','Pereira','Silva','Fernandez','Suarez','Olivera','Acosta'] },
  CL: { names:['Benjamin','Vicente','Maximiliano','Matias','Joaquin','Tomas','Lucas','Agustin'], surnames:['Rojas','Munoz','Diaz','Perez','Soto','Contreras','Silva','Morales'] },
  CI: { names:['Yaya','Kader','Serge','Franck','Jean','Ibrahim','Moussa','Oumar'], surnames:['Kone','Traore','Diallo','Kouassi','Bamba','Coulibaly','Yao','Toure'] },
  GH: { names:['Kwame','Kofi','Yaw','Kojo','Abdul','Mohammed','Daniel','Joseph'], surnames:['Mensah','Owusu','Boateng','Asare','Appiah','Osei','Agyemang','Addo'] },
  CM: { names:['Bryan','Jean','Franck','Samuel','Junior','Karl','Christian','Patrick'], surnames:['Mbeumo','Onana','Tchouameni','Ngah','Aboubakar','Ekambi','Fai','Nsame'] },
  EG: { names:['Omar','Ahmed','Mostafa','Youssef','Mahmoud','Amr','Karim','Tarek'], surnames:['Hassan','Ibrahim','Mahmoud','Ali','Mohamed','Fathy','Gaber','Said'] },
  ZA: { names:['Sipho','Thabo','Lebo','Kagiso','Lwazi','Bongani','Sibusiso','Themba'], surnames:['Nkosi','Dlamini','Mokoena','Ndlovu','Khumalo','Mthembu','Zulu','Mahlangu'] },
  KR: { names:['Min-jun','Seo-jun','Ji-ho','Do-yun','Ha-jun','Si-woo','Jun-ho','Hyun-woo'], surnames:['Kim','Lee','Park','Choi','Jung','Kang','Cho','Yoon'] },
  AU: { names:['Jack','Lachlan','Cooper','Oscar','Riley','Archie','Harrison','Flynn'], surnames:['Smith','Jones','Williams','Brown','Wilson','Taylor','Anderson','Thompson'] },
  TR: { names:['Emir','Arda','Kerem','Yusuf','Efe','Can','Mert','Deniz'], surnames:['Yilmaz','Kaya','Demir','Sahin','Celik','Yildiz','Aydin','Ozdemir'] },
  GR: { names:['Giorgos','Nikos','Dimitris','Kostas','Yannis','Alexandros','Petros','Christos'], surnames:['Papadopoulos','Pappas','Nikolaidis','Georgiou','Dimitriou','Vasilis','Ioannou','Kostas'] },
  PL: { names:['Jakub','Kacper','Mateusz','Szymon','Filip','Antoni','Wiktor','Bartosz'], surnames:['Nowak','Kowalski','Wisniewski','Wojcik','Kowalczyk','Kaminski','Lewandowski','Zielinski'] },
  IS: { names:['Aron','Einar','Hakon','Viktor','Jon','Kari','Birkir','Oskar'], surnames:['Jonsson','Sigurdsson','Gunnarsson','Bjornsson','Magnusson','Olafsson','Eiriksson','Stefansson'] },
  NZ: { names:['Liam','Oliver','Jack','Finn','Ethan','Noah','Riley','Theo'], surnames:['Wilson','Thompson','Walker','Robinson','King','Wright','Scott','Taylor'] },
  LU: { names:['Luca','Noah','Leo','Ben','Tom','Maxime','Elias','Milan'], surnames:['Schmit','Muller','Weber','Hoffmann','Wagner','Meyer','Schneider','Klein'] }
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
const RARE_NATIONALITIES = new Set(['HT','IS','NZ','LU','CG','CR','JM','PA','PY','VE']);
const NATIONALITY_WEIGHTS = Object.freeze({
  FR:9, BR:9, AR:8, ES:8, GB:8, DE:8, IT:7, PT:7, NL:6,
  SN:5, NG:5, MA:5, JP:5, US:4, CA:4, CO:4, MX:4, CI:4, GH:4,
  BE:4, HR:3, RS:3, PE:3, UY:3, CL:3, KE:3, DZ:3, TN:3, EG:3,
  AU:3, ZA:3, KR:3, TR:3, GR:2, PL:2, CD:3, CG:2, CR:2, EC:3, PY:2, VE:2, JM:2, PA:1.5, SA:2, IR:2, DK:2, SE:2, NO:2, CH:2, AT:2, UA:2, CZ:2, RO:2, IE:3, CM:3, HT:0.15, IS:0.1, NZ:0.1, LU:0.08
});
function pickWeightedNationality(codes, random, nationalityCounts = new Map()) {
  const eligible = codes.filter(code => NATIONAL_POOLS[code] &&
    (!RARE_NATIONALITIES.has(code) || (nationalityCounts.get(code) || 0) < 2));
  const weighted = eligible.map(code => [code, NATIONALITY_WEIGHTS[code] || 1]);
  const total = weighted.reduce((sum, item) => sum + item[1], 0);
  let roll = random() * total;
  for (const [code, weight] of weighted) { roll -= weight; if (roll <= 0) return code; }
  return weighted.at(-1)?.[0] || 'FR';
}
function nationalityPlan(club, count, random, nationalityCounts = new Map(), malagasyQuota = null) {
  const homeCode = /^[A-Z]{2}$/.test(club.countryCode || '') ? club.countryCode : 'MG';
  const recruitment = club.recruitmentProfile;
  // Explicit country/continent scouting profiles remain authoritative. A club
  // cannot receive players outside its declared recruitment pool.
  if (recruitment?.mode === 'country' && NATIONAL_POOLS[recruitment.countryCode]) {
    const code = recruitment.countryCode;
    if (!RARE_NATIONALITIES.has(code)) return Array(count).fill(code);
    const available = Math.max(0, 2 - (nationalityCounts.get(code) || 0));
    return [...Array(Math.min(count, available)).fill(code), ...Array(Math.max(0, count - available)).fill('FR')];
  }
  if (recruitment?.mode === 'continent' && Array.isArray(recruitment.nationalityCodes)) {
    // Re-check rarity after every selection: a static eligible list could
    // otherwise repeat a rare nationality several times in the same roster.
    const workingCounts = new Map(nationalityCounts);
    const plan = [];
    for (let index = 0; index < count; index++) {
      const code = pickWeightedNationality(recruitment.nationalityCodes, random, workingCounts);
      plan.push(code);
      workingCounts.set(code, (workingCounts.get(code) || 0) + 1);
    }
    return shuffled(plan, random);
  }

  // For mixed recruitment, maintain the world-level Malagasy target when
  // replenishing rosters, while preserving a local core in foreign clubs.
  const malagasyCount = Number.isInteger(malagasyQuota)
    ? Math.max(0, Math.min(count, malagasyQuota))
    : homeCode === 'MG' ? Math.min(count, Math.round(count * 5 / 12)) : Math.min(count, Math.round(count * 3 / 12));
  const localCount = homeCode === 'MG' ? malagasyCount : Math.min(count - malagasyCount, Math.round(count * 3 / 12));
  const plan = [];
  if (homeCode === 'MG') plan.push(...Array(malagasyCount).fill('MG'));
  else {
    plan.push(...Array(malagasyCount).fill('MG'));
    plan.push(...Array(localCount).fill(homeCode));
  }
  const excluded = new Set(['MG', homeCode]);
  const internationalCodes = Object.keys(NATIONAL_POOLS).filter(code => !excluded.has(code));
  const workingCounts = new Map(nationalityCounts);
  for (const code of plan) workingCounts.set(code, (workingCounts.get(code) || 0) + 1);
  while (plan.length < count) {
    const code = pickWeightedNationality(internationalCodes, random, workingCounts);
    plan.push(code);
    workingCounts.set(code, (workingCounts.get(code) || 0) + 1);
  }
  return shuffled(plan, random);
}
function createUniqueName(code, random, usedNames, index, clubId) {
  const pool = NATIONAL_POOLS[code] || NATIONAL_POOLS.MG;
  for (let attempt = 0; attempt < 100; attempt++) {
    const name = `${pick(pool.names, random)} ${pick(pool.surnames, random)}`;
    const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!FORBIDDEN_REAL_NAMES.has(key) && !usedNames.has(key)) { usedNames.add(key); return name; }
  }
  const base = `${pick(pool.names, random)} ${pick(pool.surnames, random)} ${String(clubId).replace(/[^a-z0-9]/gi,'').slice(-6).toUpperCase()}${index + 1}`;
  let fallback = base;
  let suffix = 1;
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  while (usedNames.has(normalize(fallback))) fallback = `${base}-${suffix++}`;
  usedNames.add(normalize(fallback));
  return fallback;
}

export function generateClubRoster(club, { size = 12, usedNames = new Set(), nationalityCounts = new Map(), malagasyQuota = null } = {}) {
  const count = Math.max(1, Math.min(30, Math.floor(Number(size) || 12)));
  const random = randomFor(hashSeed(`fpro-p23:${club.id}:roster-v2`));
  const nationalities = nationalityPlan(club, count, random, nationalityCounts, malagasyQuota);
  for (const code of nationalities) nationalityCounts.set(code, (nationalityCounts.get(code) || 0) + 1);
  const shuffledAges = shuffled(AGE_PROFILE, random);
  const ages = [18,30,19,28,21,32,...shuffledAges.filter(age => ![18,19,21,28,30,32].includes(age))];
  while (ages.length < count) ages.push(18 + Math.floor(random() * 16));
  const roster = [];
  const usedDlsProfileIds = new Set();
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
    const referenceProfile = findPlayerReference(role, archetype, random, usedDlsProfileIds);
    if (referenceProfile) usedDlsProfileIds.add(referenceProfile.id);
    const referenceData = referenceProfile
      ? applyPlayerReference(referenceProfile, { targetOverall: overall, random })
      : null;
    const dlsStats = referenceData?.stats;
    // Keep the existing six-field gameplay contract, but derive it from the DLS card.
    const attributes = dlsStats
      ? referenceProfile.sourceGame === 'DLS19'
        ? mapDls19StatsToGameplay(dlsStats)
        : {
            pace: Math.round(((dlsStats.SPE || 0) + (dlsStats.ACC || 0)) / 2),
            shooting: dlsStats.SHO ?? 25,
            passing: dlsStats.PAS ?? 25,
            defense: role === 'GK' ? (dlsStats.GKR ?? dlsStats.TAC ?? 25) : (dlsStats.TAC ?? 25),
            stamina: dlsStats.STA ?? 60,
            control: dlsStats.CON ?? 50
          }
      : generateAttributes(overall, role, archetype, random);
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
      ...(referenceData ? {
        // Generic provenance is primary; legacy dls26* aliases remain for compatibility.
        playerReferenceStats: referenceData.stats,
        playerReference: {
          ...referenceData.reference,
          inspirationStyle: archetype,
          identityPersonalized: true
        },
        dls26Stats: referenceData.stats,
        dls26Reference: referenceData.reference,
        heightCm: referenceData.heightCm,
      } : {}),
      loyalty: { clubLoyalty, transferWillingness, departurePolicy },
      preferredFoot: referenceData?.preferredFoot || (random() < 0.28 ? 'left' : 'right'),
      archetype,
      appearance: {
        skinTone, bodyBuild,
        kitColors: role === 'GK' ? { primary: club.colors?.[2] || '#eaf4ff', secondary: club.colors?.[0] || '#2676f2', accent: club.colors?.[1] || '#123269' } : { primary: club.colors?.[0] || '#2676f2', secondary: club.colors?.[1] || '#123269', accent: club.colors?.[2] || '#eaf4ff' },
        kitDesign: CLUB_KIT_DESIGNS[club.id] || club.kitDesign || 'central', kitVariant: role === 'GK' ? 'goalkeeper' : 'outfield',
        hairStyle: pick((['JP','MA','DZ','TN'].includes(code) ? ['short','short','fade','wavy','curly','shaved'] : ['short','short','curly','afro','fade','shaved','braids','twists','wavy']), random),
        hairColor: pick(['dark','dark','brown','black','brown','blond','auburn','grey'], random),
        facialHair: age >= 20 && hashSeed(`${club.id}:${index}:facial-hair`) % 100 < 28 ? 'beard' : 'none',
        faceShape: pick(['oval','round','angular','long','square'], random),
        eyeShape: pick(['almond','round','deep-set','hooded'], random)
      }
    });
  }
  return roster;
}

export function stableClubSeed(clubId) { return hashSeed(`fpro-p23:${clubId}`); }
export const RARE_NATIONALITY_CODES = Object.freeze([...RARE_NATIONALITIES]);
export const NATIONALITY_GENERATION_WEIGHTS = NATIONALITY_WEIGHTS;
export const SUPPORTED_NATIONALITIES = Object.freeze(Object.keys(NATIONAL_POOLS));
