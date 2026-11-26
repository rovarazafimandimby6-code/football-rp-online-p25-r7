// DLS 26 normal-card reference profiles (v13.430).
// The fictional roster borrows statistical shapes only; no real identity fields are copied.
export const DLS26_ATTRIBUTE_KEYS = Object.freeze([
  'SPE', 'ACC', 'STA', 'STR', 'CON', 'PAS', 'SHO', 'TAC'
]);

const PROFILE = (id, position, overall, heightCm, stats, options = {}) => Object.freeze({
  id, cardType: 'normal', version: '13.430', position, overall, heightCm,
  stats: Object.freeze(stats),
  ...(options.preferredFoot ? { preferredFoot: options.preferredFoot } : {}),
  source: options.source
});

export const DLS26_REFERENCE_PROFILES = Object.freeze([
  PROFILE('forward-pace-86', 'CF', 86, 178, { SPE:94, ACC:94, STA:83, STR:74, CON:90, PAS:83, SHO:95, TAC:27 }, {
    preferredFoot:'right', source:'https://sakibpro.com/players/normal/kylian-mbappe/'
  }),
  PROFILE('forward-creator-86', 'CF', 86, 178, { SPE:89, ACC:93, STA:75, STR:62, CON:93, PAS:91, SHO:90, TAC:45 }, {
    source:'https://sakibpro.com/players/team/paris-saint-germain/squad/'
  }),
  PROFILE('forward-wing-84', 'LW', 84, 183, { SPE:84, ACC:88, STA:79, STR:71, CON:91, PAS:84, SHO:85, TAC:52 }, {
    source:'https://sakibpro.com/players/team/paris-saint-germain/squad/'
  }),
  PROFILE('forward-finisher-82', 'CF', 82, 189, { SPE:85, ACC:78, STA:86, STR:86, CON:80, PAS:75, SHO:88, TAC:34 }, {
    source:'https://sakibpro.com/players/team/arsenal/squad/'
  }),
  PROFILE('midfielder-creator-85', 'AM', 85, 179, { SPE:76, ACC:79, STA:93, STR:69, CON:85, PAS:95, SHO:82, TAC:72 }, {
    preferredFoot:'right', source:'https://sakibpro.com/players/normal/bruno-fernandes/12434/statistics/'
  }),
  PROFILE('midfielder-controller-85', 'CM', 85, 172, { SPE:76, ACC:87, STA:87, STR:59, CON:91, PAS:93, SHO:78, TAC:80 }, {
    source:'https://sakibpro.com/players/team/paris-saint-germain/squad/'
  }),
  PROFILE('midfielder-box-to-box-84', 'CM', 84, 188, { SPE:80, ACC:70, STA:92, STR:82, CON:81, PAS:88, SHO:74, TAC:87 }, {
    source:'https://sakibpro.com/players/team/arsenal/squad/'
  }),
  PROFILE('midfielder-defensive-82', 'DM', 82, 181, { SPE:72, ACC:72, STA:83, STR:81, CON:83, PAS:84, SHO:71, TAC:83 }, {
    source:'https://sakibpro.com/players/team/arsenal/squad/'
  }),
  PROFILE('defender-fullback-85', 'RB', 85, 181, { SPE:94, ACC:87, STA:89, STR:67, CON:81, PAS:85, SHO:74, TAC:80 }, {
    preferredFoot:'right', source:'https://sakibpro.com/players/team/morocco/squad'
  }),
  PROFILE('defender-fullback-84', 'LB', 84, 180, { SPE:94, ACC:90, STA:82, STR:67, CON:82, PAS:81, SHO:64, TAC:83 }, {
    source:'https://sakibpro.com/players/team/paris-saint-germain/squad/'
  }),
  PROFILE('defender-centre-85', 'CB', 85, 190, { SPE:80, ACC:71, STA:81, STR:94, CON:78, PAS:79, SHO:61, TAC:94 }, {
    preferredFoot:'left', source:'https://sakibpro.com/players/team/arsenal/squad/'
  }),
  PROFILE('defender-centre-83', 'CB', 83, 188, { SPE:83, ACC:75, STA:80, STR:88, CON:76, PAS:79, SHO:48, TAC:91 }, {
    source:'https://sakibpro.com/players/team/paris-saint-germain/squad/'
  }),
  PROFILE('goalkeeper-reflex-85', 'GK', 85, 196, { SPE:58, ACC:55, GKR:84, STR:68, CON:61, PAS:66, GKH:80, TAC:43 }, {
    preferredFoot:'right', source:'https://sakibpro.com/players/normal/gianluigi-donnarumma/14078/'
  })

  PROFILE('forward-wing-84b', 'RW', 84, 175, { SPE:85, ACC:86, STA:82, STR:72, CON:86, PAS:88, SHO:88, TAC:39 }, {
    source:'https://sakibpro.com/players/team/africa-all-stars/squad/'
  }),
  PROFILE('forward-mobile-81', 'SS', 81, 171, { SPE:91, ACC:91, STA:82, STR:69, CON:81, PAS:80, SHO:84, TAC:35 }, {
    source:'https://sakibpro.com/players/team/africa-all-stars/squad/'
  }),
  PROFILE('forward-power-81', 'RW', 81, 185, { SPE:84, ACC:79, STA:83, STR:82, CON:83, PAS:76, SHO:83, TAC:37 }, {
    source:'https://sakibpro.com/players/team/africa-all-stars/squad/'
  }),
  PROFILE('forward-creator-80', 'SS', 80, 174, { SPE:82, ACC:87, STA:72, STR:65, CON:83, PAS:79, SHO:82, TAC:37 }, {
    source:'https://sakibpro.com/players/team/africa-all-stars/squad/'
  }),
  PROFILE('forward-pace-80', 'CF', 80, 180, { SPE:88, ACC:88, STA:72, STR:65, CON:82, PAS:81, SHO:81, TAC:30 }, {
    source:'https://sakibpro.com/players/team/africa-all-stars/squad/'
  }),
  PROFILE('midfielder-engine-80', 'CM', 80, 184, { SPE:74, ACC:68, STA:84, STR:84, CON:78, PAS:79, SHO:74, TAC:75 }, {
    source:'https://sakibpro.com/players/team/africa-all-stars/squad/'
  }),
  PROFILE('midfielder-controller-83', 'CM', 83, 174, { SPE:72, ACC:80, STA:88, STR:75, CON:85, PAS:86, SHO:75, TAC:82 }, {
    source:'https://sakibpro.com/players/team/paris-saint-germain/squad/'
  }),
  PROFILE('midfielder-organizer-82', 'CM', 82, 189, { SPE:74, ACC:73, STA:80, STR:71, CON:84, PAS:85, SHO:74, TAC:76 }, {
    source:'https://sakibpro.com/players/team/paris-saint-germain/squad/'
  }),
  PROFILE('defender-centre-84', 'CB', 84, 192, { SPE:83, ACC:75, STA:81, STR:86, CON:80, PAS:82, SHO:49, TAC:93 }, {
    source:'https://sakibpro.com/players/team/arsenal/squad/'
  }),
  PROFILE('defender-centre-78', 'CB', 78, 190, { SPE:80, ACC:68, STA:71, STR:82, CON:73, PAS:76, SHO:45, TAC:84 }, {
    source:'https://sakibpro.com/players/team/morocco/squad'
  }),
  PROFILE('goalkeeper-balanced-78', 'GK', 78, 195, { SPE:61, ACC:59, GKR:63, STR:61, CON:58, PAS:62, GKH:74, TAC:75 }, {
    source:'https://sakibpro.com/players/team/morocco/squad'
  }),
]);

const ARCHETYPE_PROFILE_IDS = Object.freeze({
  GK: ['goalkeeper-reflex-85','goalkeeper-balanced-78'],
  DEF: ['defender-fullback-85','defender-fullback-84','defender-centre-85','defender-centre-83','defender-centre-84','defender-centre-78'],
  MID: ['midfielder-creator-85','midfielder-controller-85','midfielder-box-to-box-84','midfielder-defensive-82','midfielder-engine-80','midfielder-controller-83','midfielder-organizer-82'],
  FWD: ['forward-pace-86','forward-creator-86','forward-wing-84','forward-finisher-82','forward-wing-84b','forward-mobile-81','forward-power-81','forward-creator-80','forward-pace-80']
});
const PROFILE_BY_ID = new Map(DLS26_REFERENCE_PROFILES.map(profile => [profile.id, profile]));

export function findDls26Reference(role, archetype, random = Math.random) {
  const ids = ARCHETYPE_PROFILE_IDS[role] || ARCHETYPE_PROFILE_IDS.FWD;
  const eligible = ids.map(id => PROFILE_BY_ID.get(id)).filter(Boolean);
  const preferred = eligible.filter(profile => {
    if (role === 'GK') return true;
    if (role === 'DEF') return archetype === 'Latéral endurant'
      ? profile.id.startsWith('defender-fullback')
      : profile.id.startsWith('defender-centre');
    if (role === 'MID') {
      if (archetype === 'Meneur créatif' || archetype === 'Milieu organisateur') return profile.id.includes('creator') || profile.id.includes('controller');
      if (archetype === 'Milieu récupérateur') return profile.id.includes('defensive') || profile.id.includes('box-to-box');
      return true;
    }
    if (archetype === 'Ailier percutant') return profile.id.includes('pace') || profile.id.includes('wing') || profile.id.includes('creator');
    if (archetype === 'Avant-centre puissant' || archetype === 'Finisseur de surface') return profile.id.includes('finisher') || profile.id.includes('pace');
    return true;
  });
  const pool = preferred.length ? preferred : eligible;
  return pool[Math.floor(random() * pool.length)] || null;
}

export function applyDls26Reference(profile, { targetOverall, random = Math.random } = {}) {
  if (!profile || !Number.isFinite(targetOverall)) return null;
  const delta = Math.round(targetOverall) - profile.overall;
  const stats = Object.fromEntries(Object.entries(profile.stats).map(([key, value]) => {
    // Keep the reference card's statistical shape while adapting its quality to P27's division.
    const smallAdjustment = Math.round(random() * 4 - 2);
    return [key, Math.max(20, Math.min(99, value + delta + smallAdjustment))];
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
      source: profile.source
    }
  };
}
