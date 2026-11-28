// Curated anonymous statistical templates from a community DLS 23 dataset.
// No real-player names, clubs, nationalities, photos or biographies are embedded.
// Dataset version reported by the source: v10.20. Use as a fallback behind DLS 26 cards.
const SOURCE = 'https://github.com/CodeModeYT/DLS-Player-search/blob/main/Data/json/players_23.json';
const LEGACY_PROFILE = (id, position, overall, heightCm, stats, preferredFoot, archetype) => Object.freeze({
  id: `dls23-${id}`,
  cardType: 'normal',
  sourceGame: 'DLS23',
  version: '10.20',
  position,
  overall,
  heightCm,
  stats: Object.freeze(stats),
  source: SOURCE,
  sourceRecordId: String(id),
  archetype,
  ...(preferredFoot ? { preferredFoot } : {}),
  verification: 'community-dataset-record'
});

export const DLS23_REFERENCE_PROFILES = Object.freeze([
  // Forwards: pace, power, finishing, wide play and complete striker profiles.
  LEGACY_PROFILE('19392','LW',79,170,{SPE:90,ACC:91,STA:80,STR:53,CON:84,PAS:79,SHO:78,TAC:31},'left','Ailier percutant'),
  LEGACY_PROFILE('17319','CF',82,186,{SPE:88,ACC:83,STA:77,STR:85,CON:78,PAS:72,SHO:89,TAC:36},'right','Avant-centre puissant'),
  LEGACY_PROFILE('382','CF',83,187,{SPE:83,ACC:79,STA:74,STR:82,CON:82,PAS:79,SHO:91,TAC:42},'both','Finisseur de surface'),
  LEGACY_PROFILE('15403','RW',80,178,{SPE:91,ACC:91,STA:65,STR:55,CON:87,PAS:82,SHO:75,TAC:39},'both','Ailier percutant'),
  LEGACY_PROFILE('5403','CF',77,193,{SPE:66,ACC:62,STA:78,STR:88,CON:81,PAS:74,SHO:85,TAC:43},'left','Avant-centre puissant'),

  // Midfielders: controller, anchor, box-to-box and creative distributions.
  LEGACY_PROFILE('1498','CM',84,172,{SPE:71,ACC:77,STA:84,STR:68,CON:91,PAS:93,SHO:78,TAC:70},'both','Milieu organisateur'),
  LEGACY_PROFILE('10297','DM',83,185,{SPE:69,ACC:66,STA:86,STR:88,CON:79,PAS:82,SHO:71,TAC:89},'right','Milieu récupérateur'),
  LEGACY_PROFILE('12427','AM',83,173,{SPE:79,ACC:82,STA:91,STR:63,CON:89,PAS:85,SHO:77,TAC:68},'left','Relayeur dynamique'),
  LEGACY_PROFILE('4739','CM',83,183,{SPE:67,ACC:68,STA:83,STR:75,CON:87,PAS:93,SHO:80,TAC:75},'both','Meneur créatif'),
  LEGACY_PROFILE('12434','AM',83,179,{SPE:73,ACC:75,STA:90,STR:68,CON:84,PAS:88,SHO:83,TAC:73},'right','Meneur créatif'),

  // Defenders: central, stopper, aerial and fullback profiles.
  LEGACY_PROFILE('16288','CB',82,187,{SPE:72,ACC:69,STA:77,STR:90,CON:78,PAS:80,SHO:58,TAC:92},'right','Défenseur stoppeur'),
  LEGACY_PROFILE('7821','RB',80,183,{SPE:89,ACC:86,STA:77,STR:76,CON:73,PAS:74,SHO:48,TAC:81},'right','Latéral endurant'),
  LEGACY_PROFILE('2517','CB',81,181,{SPE:69,ACC:63,STA:79,STR:89,CON:74,PAS:80,SHO:66,TAC:92},'right','Défenseur aérien'),
  LEGACY_PROFILE('12375','CB',82,186,{SPE:81,ACC:73,STA:75,STR:93,CON:74,PAS:77,SHO:57,TAC:87},'right','Défenseur stoppeur'),
  LEGACY_PROFILE('11063','CB',80,189,{SPE:70,ACC:68,STA:74,STR:86,CON:78,PAS:81,SHO:59,TAC:86},'left','Défenseur relanceur')
]);
