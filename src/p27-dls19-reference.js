// DLS 19 compatibility layer for verified archived card records.
// DLS 19 cards used CRO/HEA in addition to the eight later field attributes.
// Do not populate this catalog with guessed CRO/HEA or relabel v10.20 data as DLS19.
export const DLS19_ATTRIBUTE_KEYS = Object.freeze([
  'SPE','ACC','STA','STR','CON','PAS','SHO','TAC','CRO','HEA'
]);
export const DLS19_POSITION_ALIASES = Object.freeze({ WF: 'SS' });
const DLS19_VALID_POSITIONS = new Set(['GK','CB','LB','RB','LWB','RWB','DM','CM','AM','LM','RM','LW','RW','CF','SS']);

export function roleForDls19Position(position) {
  const code = typeof position === 'string' ? position.trim().toUpperCase() : '';
  const normalized = DLS19_POSITION_ALIASES[code] || code;
  if (normalized === 'GK') return 'GK';
  if (['CB','LB','RB','LWB','RWB'].includes(normalized)) return 'DEF';
  if (['DM','CM','AM','LM','RM'].includes(normalized)) return 'MID';
  if (['LW','RW','CF','SS'].includes(normalized)) return 'FWD';
  return null;
}


// DLS19 includes crossing and heading as separate fields. Keep both in the
// generated player's attribute object instead of silently dropping them from
// the six-stat legacy gameplay contract.
export function mapDls19StatsToGameplay(stats) {
  if (!stats || typeof stats !== 'object') throw new TypeError('DLS19 stats required');
  for (const key of DLS19_ATTRIBUTE_KEYS) {
    if (!Number.isInteger(stats[key]) || stats[key] < 1 || stats[key] > 100) {
      throw new RangeError(`Invalid DLS19 gameplay attribute: ${key}`);
    }
  }
  return Object.freeze({
    pace: Math.round((stats.SPE + stats.ACC) / 2),
    shooting: stats.SHO,
    passing: stats.PAS,
    defense: stats.TAC,
    stamina: stats.STA,
    control: stats.CON,
    crossing: stats.CRO,
    heading: stats.HEA
  });
}

// Empty until archived DLS 19 card records with source/version evidence are
// individually validated. The adapter is ready for accurate imports.
export const DLS19_REFERENCE_PROFILES = Object.freeze([]);

export function normalizeDls19Profile(record) {
  if (!record || typeof record !== 'object') throw new TypeError('DLS19 profile record required');
  const stats = {};
  for (const key of DLS19_ATTRIBUTE_KEYS) {
    const value = Number(record.stats?.[key]);
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      throw new RangeError(`Invalid or missing DLS19 attribute: ${key}`);
    }
    stats[key] = value;
  }
  const overall = Number(record.overall);
  const heightCm = Number(record.heightCm);
  if (!Number.isInteger(overall) || overall < 1 || overall > 100) throw new RangeError('Invalid DLS19 overall');
  if (!Number.isInteger(heightCm) || heightCm < 140 || heightCm > 220) throw new RangeError('Invalid DLS19 height');
  const rawPosition = typeof record.position === 'string' ? record.position.trim().toUpperCase() : '';
  const position = DLS19_POSITION_ALIASES[rawPosition] || rawPosition;
  if (!DLS19_VALID_POSITIONS.has(position)) throw new RangeError('Unsupported DLS19 position');
  let sourceUrl;
  try { sourceUrl = new URL(record.source); } catch { throw new TypeError('DLS19 source URL required'); }
  if (sourceUrl.protocol !== 'https:' || !sourceUrl.hostname) throw new TypeError('DLS19 source URL must be HTTPS');
  const sourceRecordId = String(record.sourceRecordId ?? '').trim();
  const version = String(record.version ?? '').trim();
  if (!sourceRecordId || !version) throw new TypeError('DLS19 record ID and version required');
  const preferredFoot = record.preferredFoot == null || record.preferredFoot === '' ? null : String(record.preferredFoot).trim().toLowerCase();
  if (preferredFoot && !['left','right','both'].includes(preferredFoot)) throw new RangeError('Unsupported preferred foot');
  return Object.freeze({
    id: `dls19-${String(record.sourceRecordId)}`,
    sourceGame: 'DLS19',
    version,
    cardType: 'normal',
    position,
    overall,
    heightCm,
    preferredFoot,
    stats: Object.freeze(stats),
    source: sourceUrl.href,
    sourceRecordId,
    verification: 'archived-card-record'
  });
}
