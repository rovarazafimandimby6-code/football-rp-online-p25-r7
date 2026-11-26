// Verified DLS 26 normal-card references, game data v13.430 (16 Sep 2026).
// Only card statistics and physical measurements are used to shape fictional P27 players.
// Real player names, nationalities, clubs, photos and biographies are never copied.
export const DLS26_ATTRIBUTE_KEYS = Object.freeze([
  'SPE', 'ACC', 'STA', 'STR', 'CON', 'PAS', 'SHO', 'TAC'
]);
export const DLS26_GOALKEEPER_ATTRIBUTE_KEYS = Object.freeze([
  'SPE', 'ACC', 'STA', 'STR', 'CON', 'PAS', 'GKR', 'GKH'
]);

const PROFILE = (id, position, overall, heightCm, stats, source, preferredFoot) => Object.freeze({
  id, cardType: 'normal', version: '13.430', position, overall, heightCm,
  stats: Object.freeze(stats),
  source,
  ...(preferredFoot ? { preferredFoot } : {}),
  verification: 'individual-player-card'
});

export const DLS26_REFERENCE_PROFILES = Object.freeze([
  PROFILE('forward-pace-86','CF',86,178,{SPE:94,ACC:94,STA:83,STR:74,CON:90,PAS:83,SHO:95,TAC:27},
    'https://sakibpro.com/players/normal/kylian-mbappe/14756/statistics/','right'),
  PROFILE('forward-power-86','CF',86,195,{SPE:92,ACC:80,STA:81,STR:93,CON:82,PAS:78,SHO:95,TAC:40},
    'https://sakibpro.com/players/normal/erling-haaland/17196/changelog/','left'),
  PROFILE('forward-wing-85','LW',85,176,{SPE:93,ACC:95,STA:83,STR:62,CON:93,PAS:87,SHO:85,TAC:26},
    'https://sakibpro.com/players/normal/vinicius-junior/16320/statistics/','right'),
  PROFILE('forward-finisher-84','CF',84,181,{SPE:78,ACC:84,STA:84,STR:84,CON:85,PAS:81,SHO:92,TAC:49},
    'https://sakibpro.com/players/normal/lautaro-martinez/16329/changelog/','right'),
  PROFILE('forward-target-77','CF',77,190,{SPE:82,ACC:73,STA:71,STR:84,CON:76,PAS:72,SHO:81,TAC:25},
    'https://sakibpro.com/players/normal/dusan-vlahovic/17816/changelog/','left'),
  PROFILE('midfielder-controller-85','CM',85,174,{SPE:75,ACC:86,STA:85,STR:70,CON:90,PAS:92,SHO:73,TAC:76},
    'https://sakibpro.com/players/normal/pedro-gonzalez-lopez/17763/changelog/','right'),
  PROFILE('midfielder-creator-80','CM',80,177,{SPE:73,ACC:77,STA:79,STR:69,CON:81,PAS:83,SHO:73,TAC:71},
    'https://sakibpro.com/players/normal/henrikh-mkhitaryan/10806/changelog/','both'),
  PROFILE('midfielder-anchor-84','DM',84,190,{SPE:72,ACC:66,STA:83,STR:88,CON:86,PAS:89,SHO:72,TAC:88},
    'https://sakibpro.com/players/normal/rodri/16327/statistics/','right'),
  PROFILE('defender-wingback-85','RB',85,181,{SPE:94,ACC:87,STA:89,STR:67,CON:81,PAS:85,SHO:74,TAC:80},
    'https://sakibpro.com/players/normal/achraf-hakimi/15932/statistics/','right'),
  PROFILE('defender-leftwingback-84','LWB',84,175,{SPE:78,ACC:82,STA:87,STR:68,CON:83,PAS:92,SHO:77,TAC:79},
    'https://sakibpro.com/players/normal/federico-dimarco/18130/statistics/','left'),
  PROFILE('defender-centre-84','CB',84,195,{SPE:82,ACC:67,STA:82,STR:95,CON:79,PAS:81,SHO:60,TAC:92},
    'https://sakibpro.com/players/normal/virgil-van-dijk/7307/statistics/','right'),
  PROFILE('defender-centre-76','CB',76,195,{SPE:72,ACC:61,STA:79,STR:88,CON:71,PAS:73,SHO:49,TAC:82},
    'https://sakibpro.com/players/normal/nikola-milenkovic/15551/changelog/','right'),
  PROFILE('defender-fullback-75','RB',75,173,{SPE:82,ACC:85,STA:72,STR:58,CON:77,PAS:74,SHO:46,TAC:70},
    'https://sakibpro.com/players/normal/sergino-dest/17190/changelog/','right'),
  PROFILE('goalkeeper-reflex-85','GK',85,196,{SPE:58,ACC:55,STA:60,STR:68,CON:61,PAS:66,GKR:84,GKH:80},
    'https://sakibpro.com/players/normal/gianluigi-donnarumma/14078/','right')
]);

const ROLE_PROFILE_IDS = Object.freeze({
  GK: ['goalkeeper-reflex-85'],
  DEF: ['defender-wingback-85','defender-leftwingback-84','defender-centre-84','defender-centre-76','defender-fullback-75'],
  MID: ['midfielder-controller-85','midfielder-creator-80','midfielder-anchor-84'],
  FWD: ['forward-pace-86','forward-power-86','forward-wing-85','forward-finisher-84','forward-target-77']
});
const PROFILE_BY_ID = new Map(DLS26_REFERENCE_PROFILES.map(profile => [profile.id, profile]));

export function findDls26Reference(role, archetype, random = Math.random) {
  const ids = ROLE_PROFILE_IDS[role] || ROLE_PROFILE_IDS.FWD;
  const eligible = ids.map(id => PROFILE_BY_ID.get(id)).filter(Boolean);
  const preferred = eligible.filter(profile => {
    if (role === 'GK') return true;
    if (role === 'DEF') {
      const isFullback = profile.position === 'RB' || profile.position === 'LWB';
      return archetype === 'Latéral endurant' ? isFullback : !isFullback;
    }
    if (role === 'MID') {
      if (archetype === 'Milieu récupérateur') return profile.id.includes('anchor') || profile.id.includes('creator');
      if (archetype === 'Meneur créatif' || archetype === 'Milieu organisateur') return profile.id.includes('controller') || profile.id.includes('creator');
      return true;
    }
    if (archetype === 'Ailier percutant') return profile.id.includes('pace') || profile.id.includes('wing');
    if (archetype === 'Avant-centre puissant') return profile.id.includes('power') || profile.id.includes('target');
    if (archetype === 'Finisseur de surface') return profile.id.includes('finisher') || profile.id.includes('target');
    return true;
  });
  const pool = preferred.length ? preferred : eligible;
  return pool[Math.floor(random() * pool.length)] || null;
}

export function applyDls26Reference(profile, { targetOverall, random = Math.random } = {}) {
  if (!profile || !Number.isFinite(targetOverall)) return null;
  const delta = Math.round(targetOverall) - profile.overall;
  // Division scaling is deliberately softer than a one-for-one OVR shift:
  // it retains the reference player's strengths/weaknesses at lower tiers.
  const qualityAdjustment = Math.round(delta * 0.72);
  const stats = Object.fromEntries(Object.entries(profile.stats).map(([key, value]) => {
    const individualAdjustment = Math.round(random() * 4 - 2);
    return [key, Math.max(15, Math.min(99, value + qualityAdjustment + individualAdjustment))];
  }));
  const heightAdjustment = Math.round(random() * 4 - 2);
  return {
    stats,
    heightCm: profile.heightCm + heightAdjustment,
    ...(profile.preferredFoot ? { preferredFoot: profile.preferredFoot } : {}),
    reference: {
      profileId: profile.id,
      cardType: profile.cardType,
      version: profile.version,
      baseOverall: profile.overall,
      baseHeightCm: profile.heightCm,
      source: profile.source,
      verification: profile.verification
    }
  };
}
