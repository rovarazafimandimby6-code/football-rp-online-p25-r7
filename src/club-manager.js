import { createSystemPlayerContract, setSystemPlayerContractTerm, expireSystemPlayerContract, renewSystemPlayerContract } from './p27-player-contracts.js';
import { generateClubRoster } from './club-roster.js';
import { LEAGUE_DIVISIONS, normalizeDivision, normalizeConference } from './league-structure.js';
import { generateClubCharacteristics, generateClubRecruitmentProfile, generateClubStrategicProfile, balanceClubRosterQuality } from './club-profile.js';
import { generateClubLore } from './p27-club-lore.js';
import { P27_EXPANSION_CLUBS } from './p27-club-expansion.js';

const safeId = value => String(value ?? '').trim().slice(0, 48);
const safeCount = value => Number.isFinite(Number(value)) && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 5 ? Number(value) : null;
const cleanText = (value, fallback, max = 48) => String(value ?? fallback).replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max) || fallback;
const PLAYER_ATTRIBUTE_KEYS = ['pace','shooting','passing','defense','stamina','control'];
const normalizePlayerAttributes = (attributes, fallback = 50) => Object.fromEntries(PLAYER_ATTRIBUTE_KEYS.map(key => [key, Number.isFinite(Number(attributes?.[key])) ? Math.max(1, Math.min(99, Math.round(Number(attributes[key])))) : Math.max(1, Math.min(99, Math.round(fallback)))]));
const normalizePlayerLoyalty = loyalty => ({
  clubLoyalty: Number.isFinite(Number(loyalty?.clubLoyalty)) ? Math.max(0, Math.min(100, Math.round(Number(loyalty.clubLoyalty)))) : 50,
  transferWillingness: Number.isFinite(Number(loyalty?.transferWillingness)) ? Math.max(0, Math.min(100, Math.round(Number(loyalty.transferWillingness)))) : 50,
  departurePolicy: ['no-normal-exit','reluctant','balanced','ambitious'].includes(loyalty?.departurePolicy) ? loyalty.departurePolicy : 'balanced'
});
const assignSystemContracts = (roster, club) => roster.map(player => player.playerType === 'human' ? player : ({
  ...player,
  contract: createSystemPlayerContract({ clubId: club.id, playerId: player.id, division: club.division, rating: player.rating })
}));
const clonePlayer = player => ({ ...player, contract: player.contract ? { ...player.contract } : null, loyalty: player.loyalty ? { ...player.loyalty } : null, attributes: player.attributes ? { ...player.attributes } : null, appearance: player.appearance ? { ...player.appearance, kitColors: player.appearance.kitColors ? { ...player.appearance.kitColors } : null } : null });
const cloneClub = club => ({ ...club, releasedPlayers: (club.releasedPlayers || []).map(item => ({ ...item, player: clonePlayer(item.player) })), location: club.location ? { ...club.location } : null, colors: [...club.colors], characteristics: club.characteristics ? { ...club.characteristics } : null, strategicProfile: club.strategicProfile ? { ...club.strategicProfile, competitiveVariance: { ...club.strategicProfile.competitiveVariance } } : null, clubLore: club.clubLore ? { ...club.clubLore, rivalries: (club.clubLore.rivalries || []).map(item => ({ ...item })) } : null, recruitmentProfile: club.recruitmentProfile ? { ...club.recruitmentProfile, nationalityCodes: [...(club.recruitmentProfile.nationalityCodes || [])] } : null, roster: club.roster.map(clonePlayer) });

const normalizeRosterPlayer = (player, club, index = 0) => {
  const rating = Number(player?.rating);
  const safeRating = Number.isFinite(rating) ? Math.max(1, Math.min(99, Math.round(rating))) : 50;
  return {
    id: safeId(player?.id),
    name: cleanText(player?.name, 'Joueur', 36),
    nationality: /^[A-Z]{2}$/.test(player?.nationality || '') ? player.nationality : club.countryCode,
    age: Number.isInteger(player?.age) ? Math.max(16, Math.min(45, player.age)) : 24,
    role: ['GK','DEF','MID','FWD'].includes(player?.role) ? player.role : 'MID',
    number: Number.isInteger(player?.number) ? Math.max(1, Math.min(99, player.number)) : index + 1,
    rating: safeRating,
    attributes: normalizePlayerAttributes(player?.attributes, safeRating),
    potential: Math.max(1, Math.min(99, Number(player?.potential) || safeRating)),
    potentialBand: ['standard','good','high','exceptional'].includes(player?.potentialBand) ? player.potentialBand : 'standard',
    loyalty: normalizePlayerLoyalty(player?.loyalty),
    contract: player?.playerType !== 'human'
      ? {
          ...createSystemPlayerContract({ clubId: club.id, playerId: safeId(player?.id), division: club.division, rating: safeRating }),
          ...(player?.contract && typeof player.contract === 'object' ? Object.fromEntries(['reviewCount','reviewedAt','signedAt','durationWeeks','expiresAt','transferredAt','previousClubId','renewalCount','renewedAt','termHistory'].filter(key => player.contract[key] !== undefined).map(key => [key,player.contract[key]])) : {})
        }
      : player?.contract && typeof player.contract === 'object' && player.contract.status === 'active' &&
        Number.isSafeInteger(Number(player.contract.weeklyWage ?? player.contract.salary)) &&
        Number(player.contract.weeklyWage ?? player.contract.salary) >= 0
        ? { ...player.contract, weeklyWage: Math.max(0, Math.floor(Number(player.contract.weeklyWage ?? player.contract.salary))), salary: Math.max(0, Math.floor(Number(player.contract.salary ?? player.contract.weeklyWage))) }
        : null,
    playerType: player?.playerType === 'human' ? 'human' : 'system',
    controlStatus: player?.playerType === 'human' ? (player?.controlStatus === 'automated' ? 'automated' : 'human') : 'system',
    preferredFoot: player?.preferredFoot === 'left' ? 'left' : 'right',
    archetype: cleanText(player?.archetype, 'Joueur polyvalent', 40),
    appearance: player?.appearance && typeof player.appearance === 'object'
      ? { ...player.appearance, kitColors: player.appearance.kitColors ? { ...player.appearance.kitColors } : null }
      : null
  };
};


const availableShirtNumber = (club, preferred, playerId = null) => {
  const occupied = new Set(club.roster
    .filter(player => player.id !== playerId)
    .map(player => Number(player.number))
    .filter(number => Number.isInteger(number) && number >= 1 && number <= 99));
  const requested = Number(preferred);
  if (Number.isInteger(requested) && requested >= 1 && requested <= 99 && !occupied.has(requested)) return requested;
  for (let number = 1; number <= 99; number++) if (!occupied.has(number)) return number;
  return null;
};

const COMPETITION_KEY = 'football-rp-online.competition-season.v1';

const club = (id, name, city, country, countryCode, division, rating, control, colors, stadium, reputation, budget) => ({
  id, name, city, country, countryCode, division, rating, control, colors, stadium, reputation, budget, capacity: 12
});

export const DIVISIONS = LEAGUE_DIVISIONS;

const STARTER_CLUB_LOCATIONS = Object.freeze({
  'antananarivo-fc': { city:'Antananarivo', country:'Madagascar', countryCode:'MG' },
  'manparis-sporting': { city:'Manchester', country:'Royaume-Uni', countryCode:'GB' },
  'dakar-milan-union': { city:'Dakar', country:'Sénégal', countryCode:'SN' },
  'toamasina-united': { city:'Toamasina', country:'Madagascar', countryCode:'MG' },
  'londaka-city': { city:'Londres', country:'Royaume-Uni', countryCode:'GB' },
  'lisboa-nova-athletic': { city:'Lisbonne', country:'Portugal', countryCode:'PT' },
  'fianarantsoa-athletic': { city:'Fianarantsoa', country:'Madagascar', countryCode:'MG' },
  'osaka-antsirabe-fc': { city:'Osaka', country:'Japon', countryCode:'JP' },
  'mahajanga-city': { city:'Mahajanga', country:'Madagascar', countryCode:'MG' },
  'rio-tana-creative': { city:'Rio de Janeiro', country:'Brésil', countryCode:'BR' },
  'antsirabe-sport': { city:'Antsirabe', country:'Madagascar', countryCode:'MG' },
  'valencia-northbridge': { city:'Valence', country:'Espagne', countryCode:'ES' },
  'tulear-sunrise': { city:'Toliara', country:'Madagascar', countryCode:'MG' },
  'morondava-lagoon': { city:'Morondava', country:'Madagascar', countryCode:'MG' },
  'nairobi-tana-academy': { city:'Nairobi', country:'Kenya', countryCode:'KE' },
  'antsiranana-north-fc': { city:'Antsiranana', country:'Madagascar', countryCode:'MG' }
});
const normalizeClubLocation = (location, legacyCity = '') => {
  const source = location && typeof location === 'object' ? location : {};
  const city = cleanText(source.city, String(legacyCity).split('/')[0].trim(), 48);
  const country = cleanText(source.country, '', 48);
  const countryCode = /^[A-Z]{2}$/.test(source.countryCode || '') ? source.countryCode : null;
  return { city, country, countryCode };
};

export const DEFAULT_CLUBS = Object.freeze([
  club('antananarivo-fc','Antananarivo Crown FC','Antananarivo / Madrid','Madagascar · Espagne','MG','D1',76,'ai',['#1769aa','#092e55','#f3d36a'],'Stade des Hautes-Terres',82,4200000),
  club('manparis-sporting','Manparis Sporting','Manchester / Paris','International','FR','D1',78,'ai',['#493b91','#211b4e','#e7d8ff'],'Arena des Deux Capitales',86,5100000),
  club('dakar-milan-union','Dakar-Milan Union','Dakar / Milan','Sénégal · Italie','SN','D1',74,'ai',['#c33c45','#641d2a','#f4e7d0'],'Stade de la Renaissance',80,3900000),
  club('toamasina-united','Toamasina Coast FC','Toamasina','Madagascar','MG','D1',72,'ai',['#168b83','#064c4b','#e6d78b'],'Stade du Port',77,3400000),

  club('londaka-city','Londaka City','Londres / Dakar','International','SN','D2',68,'ai',['#d8aa45','#76501a','#fff0b8'],'Londaka Park',70,2300000),
  club('lisboa-nova-athletic','Lisboa Nova Athletic','Lisbonne','Portugal','PT','D2',67,'ai',['#32945b','#145332','#d6f4df'],'Nova Arena',69,2200000),
  club('fianarantsoa-athletic','Fianarantsoa Highland','Fianarantsoa','Madagascar','MG','D2',66,'open',['#7856b8','#34215e','#e6d8ff'],'Stade des Hauts Plateaux',68,2100000),
  club('osaka-antsirabe-fc','Osaka-Antsira FC','Osaka / Antsirabe','Japon · Madagascar','MG','D2',65,'ai',['#d94a4a','#7c202b','#f5e7d6'],'Stade du Soleil Levant',67,2000000),

  club('mahajanga-city','Mahajanga Gulf United','Mahajanga','Madagascar','MG','D3',61,'open',['#d8aa45','#76501a','#fff0b8'],'Stade du Canal',61,1250000),
  club('rio-tana-creative','Rio-Tana Creative','Rio / Antananarivo','Brésil · Madagascar','MG','D3',60,'ai',['#26945b','#105a36','#f2d34f'],'Arena Créative',60,1200000),
  club('antsirabe-sport','Antsirabe Sporting','Antsirabe','Madagascar','MG','D3',59,'ai',['#32945b','#145332','#d6f4df'],'Stade Thermal',59,1150000),
  club('valencia-northbridge','Valencia Northbridge','Valence / Northbridge','Espagne · International','ES','D3',60,'ai',['#e06b32','#7e2d20','#f5d9a1'],'Northbridge Ground',60,1180000),

  club('tulear-sunrise','Tuléar Sunrise FC','Toliara','Madagascar','MG','AMATEUR',53,'open',['#e09b35','#7b431b','#ffe5a5'],'Terrain du Sud',48,420000),
  club('morondava-lagoon','Morondava Lagoon','Morondava','Madagascar','MG','AMATEUR',51,'open',['#278c9b','#14515d','#d8f0e8'],'Stade du Baobab',45,360000),
  club('nairobi-tana-academy','Nairobi-Tana Academy','Nairobi / Antananarivo','Kenya · Madagascar','MG','AMATEUR',52,'open',['#526f3e','#273c24','#e3d7a4'],'Academy Field',47,390000),
  club('antsiranana-north-fc','Antsiranana North FC','Antsiranana','Madagascar','MG','AMATEUR',50,'open',['#3976a8','#1e3f68','#f0d477'],'Stade du Nord',44,340000)
].map(item => ({ ...item, location: STARTER_CLUB_LOCATIONS[item.id], ...(item.division === 'AMATEUR' ? { division: 'D5', conference: ({ 'tulear-sunrise': 'Sud', 'morondava-lagoon': 'Ouest', 'nairobi-tana-academy': 'Est', 'antsiranana-north-fc': 'Nord' })[item.id] } : {}) })).concat(P27_EXPANSION_CLUBS));

export class ClubManager {
  constructor(clubs = DEFAULT_CLUBS, storage, storageKey = COMPETITION_KEY) {
    if (storage === undefined) { try { storage = globalThis.localStorage; } catch (_) { storage = null; } }
    this.storage = storage;
    this.storageKey = storageKey;
    this.clubs = new Map();
    const seedDefaultRosters = clubs === DEFAULT_CLUBS;
    const globallyUsedNames = new Set();
    for (const input of Array.isArray(clubs) ? clubs : []) {
      const id = safeId(input?.id);
      if (!id || this.clubs.has(id)) continue;
      const capacity = Number(input.capacity);
      const normalized = {
        id,
        name: cleanText(input.name, 'Club', 48),
        city: cleanText(input.city, '', 48),
        location: normalizeClubLocation(input.location, input.city),
        country: cleanText(input.country, 'Madagascar', 48),
        countryCode: /^[A-Z]{2}$/.test(input.countryCode || '') ? input.countryCode : 'MG',
        division: normalizeDivision(input.division),
        conference: normalizeConference(normalizeDivision(input.division), input.conference),
        stadium: cleanText(input.stadium, 'Stade municipal', 56),
        control: input.control === 'open' ? 'open' : 'ai',
        rating: Number.isFinite(Number(input.rating)) ? Math.max(1, Math.min(99, Math.round(Number(input.rating)))) : 50,
        reputation: Number.isFinite(Number(input.reputation)) ? Math.max(1, Math.min(100, Math.round(Number(input.reputation)))) : 40,
        budget: Number.isFinite(Number(input.budget)) ? Math.max(0, Math.min(1_000_000_000, Math.floor(Number(input.budget)))) : 250000,
        colors: Array.isArray(input.colors) && input.colors.length >= 3 ? input.colors.slice(0,3).map(c => /^#[0-9a-f]{6}$/i.test(c) ? c : '#245b48') : ['#1769aa','#092e55','#f3d36a'],
        kitDesign: ['vertical','sash','hoops','wave','pinstripes','quartered','chevron','sunburst','horizontal','diagonal','central','split','shoulder','ripple','cross','sidepanels'].includes(input.kitDesign) ? input.kitDesign : 'central',
        capacity: Number.isFinite(capacity) ? Math.max(1, Math.min(12, Math.floor(capacity))) : 12,
        initialRosterSize: Number.isFinite(Number(input.initialRosterSize)) ? Math.max(1, Math.min(12, Math.floor(Number(input.initialRosterSize)))) : (Number.isFinite(capacity) ? Math.max(1, Math.min(12, Math.floor(capacity))) : 12),
        characteristics: input.characteristics && typeof input.characteristics === 'object'
          ? Object.fromEntries(['popularity','attractiveness','infrastructure','management'].map(key => [key, Math.max(1, Math.min(100, Math.round(Number(input.characteristics[key]) || 50)))]))
          : generateClubCharacteristics({ ...input, division: normalizeDivision(input.division) }),
        humanAdmission: ['open','system-only'].includes(input.humanAdmission) ? input.humanAdmission : null,
        recruitmentProfile: null,
        roster: [], releasedPlayers: [], managerId: null, points: 0, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0
      };
      normalized.recruitmentProfile = generateClubRecruitmentProfile({ ...input, id, division: normalized.division, countryCode: normalized.countryCode, humanAdmission: normalized.humanAdmission });
      normalized.humanAdmission = normalized.recruitmentProfile.humanAdmission;
      normalized.strategicProfile = generateClubStrategicProfile({ ...normalized, ...input });
      normalized.clubLore = input.clubLore && typeof input.clubLore === 'object' ? { ...generateClubLore({ ...normalized, ...input }), ...input.clubLore, rivalries: Array.isArray(input.clubLore.rivalries) ? input.clubLore.rivalries.filter(item => item && typeof item.clubId === 'string').map(item => ({ clubId:item.clubId, type:String(item.type || 'sporting'), status:item.status === 'active' ? 'active' : 'proposed' })) : [] } : generateClubLore({ ...normalized, ...input });
      if (normalized.humanAdmission === 'system-only') normalized.control = 'ai';
      normalized.roster = seedDefaultRosters ? assignSystemContracts(balanceClubRosterQuality(
        generateClubRoster({ ...normalized, recruitmentProfile: normalized.recruitmentProfile }, { size: Math.min(normalized.initialRosterSize, normalized.capacity), usedNames: globallyUsedNames }),
        normalized
      ), normalized) : [];
      this.clubs.set(id, normalized);
    }
    // D4 is absent from the starter 16-club catalogue. Reserve one as soon as
    // that division is populated, unless an authored D4 reserve already exists.
    const d4Clubs = [...this.clubs.values()].filter(item => item.division === 'D4').sort((a,b) => a.id.localeCompare(b.id));
    if (d4Clubs.length && !d4Clubs.some(item => item.humanAdmission === 'system-only')) {
      const reserved = d4Clubs[0];
      reserved.humanAdmission = 'system-only';
      reserved.control = 'ai';
      reserved.recruitmentProfile = generateClubRecruitmentProfile({
        id: reserved.id, division: reserved.division, countryCode: reserved.countryCode,
        humanAdmission: 'system-only', recruitmentProfile: { mode:'continent', continent:'Africa' }
      });
      if (seedDefaultRosters) reserved.roster = assignSystemContracts(balanceClubRosterQuality(
        generateClubRoster({ ...reserved, recruitmentProfile: reserved.recruitmentProfile }, { size: Math.min(reserved.initialRosterSize, reserved.capacity), usedNames: globallyUsedNames }),
        reserved
      ), reserved);
    }
    this.fixtures = [];
    this.loadSeason();
  }

  loadSeason() {
    try {
      const data = JSON.parse(this.storage?.getItem(this.storageKey) || 'null');
      if (!data || typeof data !== 'object') return false;
      const rosterNeedsMigration = Number(data.version || 1) < 6;
      for (const saved of Array.isArray(data.clubs) ? data.clubs : []) {
        const club = this.clubs.get(safeId(saved?.id));
        if (!club) continue;
        if (saved.clubLore && typeof saved.clubLore === 'object') {
          const lore = saved.clubLore;
          const validOrigins = ['community-founded','academy-founded','regional-project','fictional-merger'];
          const validArchetypes = ['community','academy','technical','intense','ambitious','heritage'];
          const rivalries = Array.isArray(lore.rivalries) ? lore.rivalries.filter(item =>
            item && typeof item.clubId === 'string' && safeId(item.clubId) !== club.id &&
            this.clubs.has(safeId(item.clubId))
          ).slice(0,5).map(item => ({
            clubId:safeId(item.clubId),
            type:['geographic','historical','sporting','regional','promotion'].includes(item.type) ? item.type : 'sporting',
            status:item.status === 'active' ? 'active' : 'proposed'
          })) : club.clubLore.rivalries;
          club.clubLore = {
            ...club.clubLore,
            contentStatus:lore.contentStatus === 'approved' ? 'approved' : 'generated-draft',
            originType:validOrigins.includes(lore.originType) ? lore.originType : club.clubLore.originType,
            foundedYear:Number.isInteger(lore.foundedYear) ? Math.max(1850,Math.min(2026,lore.foundedYear)) : club.clubLore.foundedYear,
            originSummary:cleanText(lore.originSummary,club.clubLore.originSummary,240),
            identityArchetype:validArchetypes.includes(lore.identityArchetype) ? lore.identityArchetype : club.clubLore.identityArchetype,
            identityLabel:cleanText(lore.identityLabel,club.clubLore.identityLabel,64),
            sportingPhilosophy:cleanText(lore.sportingPhilosophy,club.clubLore.sportingPhilosophy,180),
            supporterCulture:cleanText(lore.supporterCulture,club.clubLore.supporterCulture,120),
            rivalryStatus:rivalries.length ? 'assigned' : 'unassigned',
            rivalries
          };
        }
        for (const field of ['points','played','wins','draws','losses','goalsFor','goalsAgainst']) {
          const value = Number(saved[field]);
          club[field] = Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 1000000) : 0;
        }
        if (Array.isArray(saved.roster) && saved.roster.length) {
          const seen = new Set();
          const restoredRoster = saved.roster.slice(0, club.capacity).filter(p => p && safeId(p.id) && !seen.has(safeId(p.id)) && seen.add(safeId(p.id))).map(p => ({
            id: safeId(p.id), name: cleanText(p.name, 'Joueur', 36), nationality: /^[A-Z]{2}$/.test(p.nationality || '') ? p.nationality : club.countryCode,
            age: Number.isInteger(p.age) ? Math.max(16, Math.min(45, p.age)) : 24,
            role: ['GK','DEF','MID','FWD'].includes(p.role) ? p.role : 'MID', number: Number.isInteger(p.number) ? Math.max(1, Math.min(99,p.number)) : 1,
            playerType: ['human','system'].includes(p.playerType) ? p.playerType : (club.roster.some(seed => seed.id === safeId(p.id)) ? 'system' : 'human'), contract: p.playerType === 'human' ? (p.contract && p.contract.status === 'active' && Number.isSafeInteger(Number(p.contract.weeklyWage ?? p.contract.salary)) ? { ...p.contract, weeklyWage: Math.max(0, Math.floor(Number(p.contract.weeklyWage ?? p.contract.salary))), salary: Math.max(0, Math.floor(Number(p.contract.salary ?? p.contract.weeklyWage))) } : null) : { ...createSystemPlayerContract({ clubId: club.id, playerId: safeId(p.id), division: club.division, rating: Math.max(1, Math.min(99, Number(p.rating) || 50)) }), ...(p.contract && typeof p.contract === 'object' ? Object.fromEntries(['reviewCount','reviewedAt','signedAt','durationWeeks','expiresAt','transferredAt','previousClubId'].filter(key => p.contract[key] !== undefined).map(key => [key,p.contract[key]])) : {}) }, controlStatus: p.playerType === 'human' && p.controlStatus === 'automated' ? 'automated' : (p.playerType === 'human' ? 'human' : 'system'),
            rating: Math.max(1, Math.min(99, Number(p.rating) || 50)), potential: Math.max(1, Math.min(99, Number(p.potential) || Number(p.rating) || 50)), potentialBand: ['standard','good','high','exceptional'].includes(p.potentialBand) ? p.potentialBand : 'standard', attributes: normalizePlayerAttributes(p.attributes, Number(p.rating) || 50), loyalty: normalizePlayerLoyalty(p.loyalty),
            preferredFoot: p.preferredFoot === 'left' ? 'left' : 'right', archetype: cleanText(p.archetype, 'Joueur polyvalent', 40),
            appearance: p.appearance && typeof p.appearance === 'object' ? { skinTone: ['light','olive','tan','medium','brown','dark','deep'].includes(p.appearance.skinTone) ? p.appearance.skinTone : 'medium', bodyBuild: ['lean','athletic','strong'].includes(p.appearance.bodyBuild) ? p.appearance.bodyBuild : 'athletic', hairStyle: ['short','curly','afro','fade','shaved','braids','twists','wavy'].includes(p.appearance.hairStyle) ? p.appearance.hairStyle : 'short', hairColor: ['dark','brown','blond','black'].includes(p.appearance.hairColor) ? p.appearance.hairColor : 'dark', kitColors: p.appearance.kitColors && ['primary','secondary','accent'].every(key => /^#[0-9a-f]{6}$/i.test(p.appearance.kitColors[key] || '')) ? { ...p.appearance.kitColors } : null, kitDesign: ['vertical','sash','hoops','wave','pinstripes','quartered','chevron','sunburst','horizontal','diagonal','central','split','shoulder','ripple','cross','sidepanels'].includes(p.appearance.kitDesign) ? p.appearance.kitDesign : 'central', kitVariant: p.appearance.kitVariant === 'goalkeeper' ? 'goalkeeper' : 'outfield', faceShape: ['oval','round','angular','long','square'].includes(p.appearance.faceShape) ? p.appearance.faceShape : 'oval', eyeShape: ['almond','round','deep-set','hooded'].includes(p.appearance.eyeShape) ? p.appearance.eyeShape : 'almond' } : null
          }));
          const seededById = new Map(club.roster.map(player => [player.id, player]));
          const migratedRoster = restoredRoster.map(player => {
            const seeded = seededById.get(player.id);
            if (!rosterNeedsMigration || !seeded) return player;
            // Refresh only generated identity fields; retain the saved sporting progression.
            return { ...player, name: seeded.name, nationality: seeded.nationality, appearance: seeded.appearance, attributes: seeded.attributes ? { ...seeded.attributes } : normalizePlayerAttributes(null, seeded.rating) };
          });
          const releasedIds = new Set((Array.isArray(saved.releasedPlayers) ? saved.releasedPlayers : []).map(item => safeId(item?.player?.id)).filter(Boolean));
          const mergedRoster = new Map(club.roster.filter(player => !releasedIds.has(player.id)).map(player => [player.id, player]));
          for (const player of migratedRoster) mergedRoster.set(player.id, player);
          club.roster = [...mergedRoster.values()].slice(0, club.capacity);
        }
        club.releasedPlayers = Array.isArray(saved.releasedPlayers) ? saved.releasedPlayers.filter(item => item && item.player && typeof item.player === 'object').slice(-100).map(item => ({ player:{ ...item.player, contract:item.player.contract ? { ...item.player.contract } : null }, releasedAt:typeof item.releasedAt === 'string' ? item.releasedAt : null, reason:item.reason === 'contract-expired' ? item.reason : 'released' })) : [];
        club.managerId = saved.managerId ? safeId(saved.managerId) : null;
        club.control = club.managerId ? 'player' : (club.humanAdmission === 'system-only' ? 'ai' : (club.control === 'open' ? 'open' : 'ai'));
      }
      this.fixtures = (Array.isArray(data.fixtures) ? data.fixtures : []).filter(f => f && this.clubs.has(safeId(f.homeClubId)) && this.clubs.has(safeId(f.awayClubId)) && f.homeClubId !== f.awayClubId && ['scheduled','ready','completed'].includes(f.status) && Number.isFinite(Date.parse(f.scheduledAt))).slice(0, 500).map(f => ({ id: safeId(f.id), homeClubId: safeId(f.homeClubId), awayClubId: safeId(f.awayClubId), scheduledAt: new Date(f.scheduledAt).toISOString(), status: f.status, result: f.result && typeof f.result === 'object' ? { ...f.result } : null }));
      return true;
    } catch (_) { return false; }
  }

  saveSeason() {
    try { this.storage?.setItem(this.storageKey, JSON.stringify({ version: 8, clubs: this.listClubs(), fixtures: this.fixtures })); return true; } catch (_) { return false; }
  }

  listClubs() { return [...this.clubs.values()].map(cloneClub); }
  getClub(id) { const item = this.clubs.get(safeId(id)); return item ? cloneClub(item) : null; }
  listDivisions() { return DIVISIONS.map(item => ({ ...item, clubs: this.clubsByDivision(item.id) })); }
  clubsByDivision(division) { return this.listClubs().filter(item => item.division === division).sort((a,b) => b.rating - a.rating || a.name.localeCompare(b.name)); }

  takeOver(clubId, userId) {
    const club = this.clubs.get(safeId(clubId)); const manager = safeId(userId);
    if (!club || !manager) return { ok: false, reason: 'invalid-request' };
    if (club.control !== 'open' || club.humanAdmission === 'system-only' || club.managerId) return { ok: false, reason: 'club-not-available' };
    if ([...this.clubs.values()].some(other => other.managerId === manager)) return { ok: false, reason: 'manager-already-has-club' };
    club.control = 'player'; club.managerId = manager; this.saveSeason();
    return { ok: true, club: this.getClub(club.id) };
  }

  addPlayer(clubId, player) {
    const club = this.clubs.get(safeId(clubId)); const id = safeId(player?.id);
    if (!club || !id) return { ok: false, reason: 'invalid-player' };
    if ([...this.clubs.values()].some(item => item.roster.some(existing => existing.id === id))) return { ok: false, reason: 'already-registered' };
    if (club.roster.length >= club.capacity) return { ok: false, reason: 'roster-full' };
    const playerType = player?.playerType === 'system' ? 'system' : 'human';
    if (playerType === 'human' && club.humanAdmission === 'system-only') return { ok: false, reason: 'human-admission-closed' };
    if (playerType === 'human' && club.roster.filter(item => item.playerType === 'human').length >= 7) return { ok: false, reason: 'human-player-limit' };
    const normalized = normalizeRosterPlayer({ ...player, playerType, id }, club, club.roster.length);
    normalized.number = availableShirtNumber(club, normalized.number);
    if (!normalized.number) return { ok: false, reason: 'shirt-numbers-full' };
    club.roster.push(normalized);
    this.saveSeason(); return { ok: true, rosterSize: club.roster.length, number: normalized.number };
  }

  updatePlayer(clubId, player) {
    const club = this.clubs.get(safeId(clubId)); const id = safeId(player?.id);
    if (!club || !id) return { ok: false, reason: 'invalid-player' };
    const index = club.roster.findIndex(existing => existing.id === id);
    if (index < 0) return { ok: false, reason: 'player-not-found' };
    if ([...this.clubs.values()].some(other => other.id !== club.id && other.roster.some(existing => existing.id === id))) return { ok: false, reason: 'duplicate-player' };
    const updated = normalizeRosterPlayer({ ...club.roster[index], ...player, playerType: club.roster[index].playerType, id }, club, index);
    const requestedNumber = Number(updated.number);
    if (club.roster.some(existing => existing.id !== id && existing.number === requestedNumber)) return { ok: false, reason: 'shirt-number-taken' };
    if (JSON.stringify(club.roster[index]) !== JSON.stringify(updated)) {
      club.roster[index] = updated;
      this.saveSeason();
    }
    return { ok: true, player: clonePlayer(updated) };
  }

  transferPlayer(fromClubId, toClubId, playerId) {
    const from = this.clubs.get(safeId(fromClubId));
    const to = this.clubs.get(safeId(toClubId));
    const id = safeId(playerId);
    if (!from || !to || !id || from === to) return { ok: false, reason: 'invalid-transfer' };
    const sourceIndex = from.roster.findIndex(player => player.id === id);
    if (sourceIndex < 0) return { ok: false, reason: 'player-not-found' };
    if ([...this.clubs.values()].some(other => other.id !== from.id && other.roster.some(player => player.id === id))) return { ok: false, reason: 'duplicate-player' };
    if (to.roster.some(player => player.id === id)) return { ok: false, reason: 'already-registered' };
    if (to.roster.length >= to.capacity) return { ok: false, reason: 'roster-full' };
    const player = from.roster[sourceIndex];
    if (player.playerType === 'human' && to.humanAdmission === 'system-only') return { ok: false, reason: 'human-admission-closed' };
    if (player.playerType === 'human' && to.roster.filter(item => item.playerType === 'human').length >= 7) return { ok: false, reason: 'human-player-limit' };
    const assignedNumber = availableShirtNumber(to, player.number);
    if (!assignedNumber) return { ok: false, reason: 'shirt-numbers-full' };
    from.roster.splice(sourceIndex, 1);
    const transferred = {
      ...player,
      number: assignedNumber,
      appearance: player.appearance ? { ...player.appearance, kitColors: player.appearance.kitColors ? { ...player.appearance.kitColors } : null } : null
    };
    if (transferred.playerType === 'system') {
      transferred.contract = {
        ...createSystemPlayerContract({
          clubId: to.id, playerId: transferred.id, division: to.division, rating: transferred.rating
        }),
        ...(Number.isSafeInteger(player.contract?.reviewCount) ? { reviewCount: Math.max(0, player.contract.reviewCount) } : {}),
        ...(typeof player.contract?.reviewedAt === 'string' ? { reviewedAt: player.contract.reviewedAt } : {}),
        ...(typeof player.contract?.signedAt === 'string' ? { signedAt: player.contract.signedAt } : {}),
        ...(Number.isInteger(player.contract?.durationWeeks) ? { durationWeeks: player.contract.durationWeeks } : {}),
        ...(typeof player.contract?.expiresAt === 'string' ? { expiresAt: player.contract.expiresAt } : {}),
        transferredAt: new Date().toISOString(),
        previousClubId: from.id
      };
    } else if (transferred.contract?.status === 'active') {
      transferred.contract = {
        ...transferred.contract,
        clubId: to.id,
        transferredAt: new Date().toISOString(),
        previousClubId: from.id
      };
    }
    to.roster.push(transferred);
    this.saveSeason();
    return { ok: true, fromRosterSize: from.roster.length, toRosterSize: to.roster.length, number: assignedNumber };
  }



  setSystemPlayerContractTerm(clubId, playerId, { signedAt = Date.now(), durationWeeks } = {}) {
    const club = this.clubs.get(safeId(clubId));
    const player = club?.roster.find(item => item.id === safeId(playerId));
    if (!club || !player) return { ok:false, reason:'player-not-found' };
    if (player.playerType !== 'system') return { ok:false, reason:'not-system-player' };
    const result = setSystemPlayerContractTerm(player.contract, { signedAt, durationWeeks });
    if (!result.ok) return result;
    player.contract = result.contract;
    this.saveSeason();
    return { ok:true, contract:{ ...player.contract } };
  }

  renewSystemPlayerContract(clubId, playerId, { now = Date.now(), durationWeeks, weeklyWage } = {}) {
    const club = this.clubs.get(safeId(clubId));
    const player = club?.roster.find(item => item.id === safeId(playerId));
    if (!club || !player) return { ok:false, reason:'player-not-found' };
    if (player.playerType !== 'system') return { ok:false, reason:'not-system-player' };
    const result = renewSystemPlayerContract(player.contract, { now, durationWeeks, weeklyWage });
    if (!result.ok) return result;
    player.contract = result.contract;
    this.saveSeason();
    return { ok:true, contract:{ ...player.contract, termHistory:player.contract.termHistory.map(entry => ({ ...entry })) } };
  }

  expireSystemPlayerContracts({ now = Date.now() } = {}) {
    if (!Number.isSafeInteger(now) || now < 0) return { ok:false, reason:'invalid-time', expired:[] };
    const expired = [];
    for (const club of this.clubs.values()) {
      const remaining = [];
      for (const player of club.roster) {
        if (player.playerType !== 'system') { remaining.push(player); continue; }
        const result = expireSystemPlayerContract(player.contract, { now });
        if (!result.ok) { remaining.push(player); continue; }
        const released = { ...player, contract:result.contract };
        club.releasedPlayers.push({ player:released, releasedAt:new Date(now).toISOString(), reason:'contract-expired' });
        expired.push({ clubId:club.id, playerId:player.id, contract:{ ...result.contract } });
      }
      if (remaining.length !== club.roster.length) {
        club.roster = remaining;
        club.releasedPlayers = club.releasedPlayers.slice(-100);
      }
    }
    if (expired.length) this.saveSeason();
    return { ok:true, expired };
  }

  reviewSystemPlayerContract(clubId, playerId, { now = Date.now() } = {}) {
    const club = this.clubs.get(safeId(clubId));
    const player = club?.roster.find(item => item.id === safeId(playerId));
    if (!club || !player) return { ok: false, reason: 'player-not-found' };
    if (player.playerType !== 'system') return { ok: false, reason: 'not-system-player' };
    if (player.contract?.status !== 'active') return { ok: false, reason: 'contract-not-active' };
    if (!Number.isSafeInteger(now) || now < 0) return { ok: false, reason: 'invalid-time' };
    const weeklyWage = createSystemPlayerContract({
      clubId: club.id, playerId: player.id, division: club.division, rating: player.rating
    })?.weeklyWage;
    if (!Number.isSafeInteger(weeklyWage) || weeklyWage <= 0) return { ok: false, reason: 'invalid-wage' };
    const previousWage = player.contract.weeklyWage ?? player.contract.salary;
    player.contract = {
      ...player.contract,
      weeklyWage,
      salary: weeklyWage,
      reviewedAt: new Date(now).toISOString(),
      reviewCount: Math.max(0, Number(player.contract.reviewCount) || 0) + 1
    };
    this.saveSeason();
    return { ok: true, previousWage, weeklyWage, contract: { ...player.contract } };
  }

  setPlayerControlStatus(clubId, playerId, status) {
    const club = this.clubs.get(safeId(clubId));
    const player = club?.roster.find(item => item.id === safeId(playerId));
    if (!player || !['human','automated'].includes(status)) return { ok:false, reason:'invalid-control-status' };
    if (player.playerType !== 'human' && status !== 'automated') return { ok:false, reason:'system-player-control-fixed' };
    const next = player.playerType === 'human' ? status : 'system';
    if (player.controlStatus !== next) { player.controlStatus = next; this.saveSeason(); }
    return { ok:true, player:clonePlayer(player) };
  }

  removePlayer(clubId, playerId) {
    const club = this.clubs.get(safeId(clubId)); if (!club) return false;
    const index = club.roster.findIndex(player => player.id === safeId(playerId)); if (index < 0) return false;
    club.roster.splice(index, 1); this.saveSeason(); return true;
  }

  createFixture({ id, homeClubId, awayClubId, scheduledAt } = {}) {
    const fixtureId = safeId(id); const home = this.clubs.get(safeId(homeClubId)); const away = this.clubs.get(safeId(awayClubId)); const date = new Date(scheduledAt);
    if (!fixtureId || !home || !away || home === away || !Number.isFinite(date.getTime())) return { ok: false, reason: 'invalid-fixture' };
    if (this.fixtures.some(item => item.id === fixtureId)) return { ok: false, reason: 'duplicate-fixture' };
    const fixture = { id: fixtureId, homeClubId: home.id, awayClubId: away.id, scheduledAt: date.toISOString(), status: 'scheduled', result: null };
    this.fixtures.push(fixture); this.saveSeason(); return { ok: true, fixture: { ...fixture } };
  }

  resolveAttendance(fixtureId, homePresent, awayPresent) {
    const fixture = this.fixtures.find(item => item.id === safeId(fixtureId));
    if (!fixture || fixture.status !== 'scheduled') return { ok: false, reason: 'fixture-unavailable' };
    const homeCount = safeCount(homePresent); const awayCount = safeCount(awayPresent);
    if (homeCount === null || awayCount === null) return { ok: false, reason: 'invalid-attendance' };
    if (homeCount < 3 && awayCount < 3) fixture.result = { home: 0, away: 0, outcome: 'double-forfeit', format: null };
    else if (homeCount < 3) fixture.result = { home: 0, away: 3, outcome: 'away-forfeit', format: null };
    else if (awayCount < 3) fixture.result = { home: 3, away: 0, outcome: 'home-forfeit', format: null };
    else fixture.result = { home: null, away: null, outcome: 'ready', format: `${Math.min(homeCount, awayCount)}v${Math.min(homeCount, awayCount)}` };
    if (fixture.result.outcome !== 'ready') { fixture.status = 'completed'; this.applyTableResult(fixture); } else fixture.status = 'ready';
    this.saveSeason(); return { ok: true, result: { ...fixture.result } };
  }

  recordResult(fixtureId, homeGoals, awayGoals) {
    const fixture = this.fixtures.find(item => item.id === safeId(fixtureId));
    if (!fixture || fixture.status !== 'ready') return { ok: false, reason: 'fixture-not-ready' };
    const home = Number(homeGoals); const away = Number(awayGoals);
    if (![home, away].every(value => Number.isFinite(value) && Number.isInteger(value) && value >= 0 && value <= 99)) return { ok: false, reason: 'invalid-score' };
    fixture.result = { home, away, outcome: home === away ? 'draw' : home > away ? 'home-win' : 'away-win', format: fixture.result.format };
    fixture.status = 'completed'; this.applyTableResult(fixture); this.saveSeason(); return { ok: true, result: { ...fixture.result } };
  }

  applyTableResult(fixture) {
    const home = this.clubs.get(fixture.homeClubId); const away = this.clubs.get(fixture.awayClubId); const result = fixture.result;
    home.played++; away.played++; home.goalsFor += result.home; home.goalsAgainst += result.away; away.goalsFor += result.away; away.goalsAgainst += result.home;
    if (result.outcome === 'double-forfeit') { home.losses++; away.losses++; }
    else if (result.home > result.away) { home.wins++; home.points += 3; away.losses++; }
    else if (result.away > result.home) { away.wins++; away.points += 3; home.losses++; }
    else { home.draws++; away.draws++; home.points++; away.points++; }
  }

  standings(division = null) {
    return this.listClubs().filter(item => !division || item.division === division).sort((a,b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor || b.rating - a.rating);
  }
}
