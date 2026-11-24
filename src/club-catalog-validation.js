import { LEAGUE_DIVISIONS, TOTAL_LEAGUE_CLUBS, conferenceForClub, normalizeConference } from './league-structure.js';

const DIVISION_AVERAGES = Object.freeze({ D1:75, D2:68, D3:61.5, D4:55.5, D5:49 });
const DIVISION_RATING_RANGES = Object.freeze({ D1:[70,82], D2:[63,76], D3:[57,71], D4:[50,64], D5:[43,58] });
const KIT_DESIGNS = new Set(['vertical','sash','hoops','wave','pinstripes','quartered','chevron','sunburst','horizontal','diagonal','central','split','shoulder','ripple','cross','sidepanels']);
const addIssue = (issues, severity, code, details = {}) => issues.push({ severity, code, ...details });
const normalizeLabel = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr').replace(/[^a-z0-9]+/g,' ').trim();
const validHex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

/**
 * Strict audit of the persistent 156-club world. Source catalogue entries may
 * omit runtime-only roster and kit fields: ClubManager seeds rosters and uses
 * the documented "central" kit fallback. Invalid supplied values still fail.
 */
export function auditClubCatalog(clubs = []) {
  const list = Array.isArray(clubs) ? clubs : [];
  const issues = [];
  const ids = new Set();
  const names = new Map();
  const stadiums = new Map();
  const divisionCounts = Object.fromEntries(LEAGUE_DIVISIONS.map(item => [item.id, 0]));
  const conferenceCounts = { D4:{ Nord:0, Sud:0 }, D5:{ Nord:0, Sud:0, Est:0, Ouest:0 } };
  const systemOnlyCounts = Object.fromEntries(LEAGUE_DIVISIONS.map(item => [item.id, 0]));
  const playerIds = new Set();
  const quality = { named:0, located:0, stadiums:0, visualIdentities:0, rated:0, budgeted:0, rostered:0 };

  for (const club of list) {
    const id = String(club?.id || '').trim();
    const division = club?.division;
    if (!id) {
      addIssue(issues, 'error', 'club-id-missing');
      continue;
    }
    if (ids.has(id)) addIssue(issues, 'error', 'duplicate-club-id', { clubId:id });
    ids.add(id);

    const name = normalizeLabel(club?.name);
    if (!name) addIssue(issues, 'error', 'club-name-missing', { clubId:id });
    else {
      quality.named++;
      if (names.has(name)) addIssue(issues, 'error', 'duplicate-club-name', { clubId:id, duplicateOf:names.get(name) });
      else names.set(name,id);
    }

    const locationCity = String(club?.location?.city || club?.city || '').trim();
    const locationCountry = String(club?.location?.country || club?.country || '').trim();
    const locationCode = String(club?.location?.countryCode || '').trim();
    if (!locationCity || !locationCountry || !/^[A-Z]{2}$/.test(locationCode)) {
      addIssue(issues, 'error', 'club-location-incomplete', { clubId:id, city:locationCity || null, country:locationCountry || null, countryCode:locationCode || null });
    } else quality.located++;

    const stadium = normalizeLabel(club?.stadium);
    if (!stadium) addIssue(issues, 'error', 'club-stadium-missing', { clubId:id });
    else {
      quality.stadiums++;
      if (stadiums.has(stadium)) addIssue(issues, 'error', 'duplicate-club-stadium', { clubId:id, duplicateOf:stadiums.get(stadium) });
      else stadiums.set(stadium,id);
    }

    if (!(division in divisionCounts)) {
      addIssue(issues, 'error', 'invalid-division', { clubId:id, division });
      continue;
    }
    divisionCounts[division]++;
    const rating = Number(club.rating);
    const ratingRange = DIVISION_RATING_RANGES[division];
    if (!Number.isInteger(rating) || rating < ratingRange[0] || rating > ratingRange[1]) {
      addIssue(issues, 'error', 'club-rating-out-of-division-range', { clubId:id, division, rating:club.rating, minimum:ratingRange[0], maximum:ratingRange[1] });
    } else quality.rated++;

    const reputation = Number(club.reputation);
    if (!Number.isInteger(reputation) || reputation < 1 || reputation > 100) {
      addIssue(issues, 'error', 'invalid-club-reputation', { clubId:id, reputation:club.reputation });
    }
    if (!Number.isSafeInteger(club.budget) || club.budget < 0) {
      addIssue(issues, 'error', 'invalid-club-budget', { clubId:id, budget:club.budget });
    } else quality.budgeted++;

    const colors = Array.isArray(club.colors) ? club.colors : [];
    const effectiveKitDesign = club.kitDesign ?? 'central';
    if (colors.length !== 3 || !colors.every(validHex) || new Set(colors.map(value=>value.toLowerCase())).size !== 3) {
      addIssue(issues, 'error', 'invalid-club-color-palette', { clubId:id });
    } else if (!KIT_DESIGNS.has(effectiveKitDesign)) {
      addIssue(issues, 'error', 'invalid-club-kit-design', { clubId:id, kitDesign:effectiveKitDesign });
    } else quality.visualIdentities++;

    if (division === 'D4' || division === 'D5') {
      const rawConference = club?.conference ?? club?.region;
      if (rawConference !== undefined && rawConference !== null && rawConference !== '' && !normalizeConference(division, rawConference)) {
        addIssue(issues, 'error', 'invalid-explicit-conference', { clubId:id, division, conference:rawConference });
      }
      const conference = conferenceForClub(club);
      if (!conference) addIssue(issues, 'error', 'conference-missing', { clubId:id, division });
      else conferenceCounts[division][conference]++;
    }

    const capacity = Number(club.capacity);
    const rosterProvided = Array.isArray(club.roster);
    const roster = rosterProvided ? club.roster : [];
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 12) {
      addIssue(issues, 'error', 'invalid-roster-capacity', { clubId:id, capacity });
    }
    if (rosterProvided) {
      if (roster.length > capacity || roster.length > 12) {
        addIssue(issues, 'error', 'roster-over-capacity', { clubId:id, rosterSize:roster.length, capacity });
      }
      if (roster.length < 8) addIssue(issues, 'error', 'roster-under-minimum', { clubId:id, rosterSize:roster.length, minimum:8 });
      else quality.rostered++;
    } else {
      const targetSize = Number(club.initialRosterSize ?? capacity);
      if (!Number.isInteger(targetSize) || targetSize < 8 || targetSize > capacity) {
        addIssue(issues, 'error', 'invalid-initial-roster-target', { clubId:id, targetSize, capacity });
      } else quality.rostered++;
    }

    const humanPlayers = roster.filter(player => player?.playerType === 'human');
    if (humanPlayers.length > 7) addIssue(issues, 'error', 'human-player-limit-exceeded', { clubId:id, humanPlayers:humanPlayers.length, maximum:7 });
    const shirtNumbers = new Set();
    for (const player of roster) {
      const playerId = String(player?.id || '').trim();
      if (!playerId) addIssue(issues, 'error', 'player-id-missing', { clubId:id });
      else if (playerIds.has(playerId)) addIssue(issues, 'error', 'duplicate-player-id', { clubId:id, playerId });
      else playerIds.add(playerId);
      if (!['human','system'].includes(player?.playerType)) addIssue(issues, 'error', 'invalid-player-type', { clubId:id, playerId });
      if (player?.playerType === 'human' && club.humanAdmission === 'system-only') addIssue(issues, 'error', 'human-player-in-system-only-club', { clubId:id, playerId });
      if (player?.playerType === 'system' && player?.controlStatus !== 'system') addIssue(issues, 'error', 'system-player-control-conflict', { clubId:id, playerId });
      if (player?.playerType === 'human' && !['human','automated'].includes(player?.controlStatus)) addIssue(issues, 'error', 'human-player-control-invalid', { clubId:id, playerId });
      const number = Number(player?.number);
      if (!Number.isInteger(number) || number < 1 || number > 99) addIssue(issues, 'error', 'invalid-player-shirt-number', { clubId:id, playerId, number:player?.number ?? null });
      else if (shirtNumbers.has(number)) addIssue(issues, 'error', 'duplicate-player-shirt-number', { clubId:id, playerId, number });
      else shirtNumbers.add(number);
      if (!Number.isInteger(player?.rating) || player.rating < 1 || player.rating > 99) addIssue(issues, 'error', 'invalid-player-rating', { clubId:id, playerId, rating:player?.rating ?? null });
    }
    if (roster.length) {
      const baseline = DIVISION_AVERAGES[division];
      if (!roster.some(player => Number(player?.rating) > baseline)) {
        addIssue(issues, 'error', 'above-average-player-missing', { clubId:id, division, baseline });
      }
    }

    if (club.humanAdmission === 'system-only') {
      systemOnlyCounts[division]++;
      if (club.control === 'open' || club.managerId) {
        addIssue(issues, 'error', 'system-only-control-conflict', { clubId:id });
      }
      const profile = club.recruitmentProfile || {};
      if (profile.mode === 'country' || profile.mode === 'continent') {
        const allowed = new Set(profile.nationalityCodes || []);
        for (const player of roster) {
          if (!allowed.has(player.nationality)) {
            addIssue(issues, 'error', 'recruitment-nationality-mismatch', { clubId:id, playerId:player.id, nationality:player.nationality });
          }
        }
      }
    }
  }

  for (const division of LEAGUE_DIVISIONS) {
    const actual = divisionCounts[division.id];
    if (actual !== division.targetClubs) addIssue(issues, 'warning', 'division-count-incomplete', { division:division.id, expected:division.targetClubs, actual });
    if (systemOnlyCounts[division.id] < 1) addIssue(issues, 'warning', 'system-only-club-missing', { division:division.id });
  }

  for (const division of ['D4','D5']) {
    for (const [conference, actual] of Object.entries(conferenceCounts[division])) {
      if (actual !== 16) addIssue(issues, 'warning', 'conference-count-incomplete', { division, conference, expected:16, actual });
    }
  }

  const errors = issues.filter(item => item.severity === 'error');
  const warnings = issues.filter(item => item.severity === 'warning');
  return Object.freeze({
    complete: list.length === TOTAL_LEAGUE_CLUBS && errors.length === 0 && warnings.length === 0,
    totalClubs: list.length,
    expectedTotal: TOTAL_LEAGUE_CLUBS,
    divisionCounts: Object.freeze(divisionCounts),
    conferenceCounts: Object.freeze({ D4:Object.freeze({ ...conferenceCounts.D4 }), D5:Object.freeze({ ...conferenceCounts.D5 }) }),
    systemOnlyCounts: Object.freeze(systemOnlyCounts),
    quality:Object.freeze({ ...quality }),
    errors:Object.freeze(errors),
    warnings:Object.freeze(warnings),
    issues:Object.freeze(issues)
  });
}
