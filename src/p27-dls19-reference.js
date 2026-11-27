// DLS 19 compatibility layer for verified archived card records.
// DLS 19 cards used CRO/HEA in addition to the eight later field attributes.
// Do not populate this catalog with guessed CRO/HEA or relabel v10.20 data as DLS19.
export const DLS19_ATTRIBUTE_KEYS = Object.freeze([
  'SPE','ACC','STA','STR','CON','PAS','SHO','TAC','CRO','HEA'
]);
export const DLS19_POSITION_ALIASES = Object.freeze({ WF: 'SS' });

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
  if (!record.source || !/^https:\/\//.test(record.source)) throw new TypeError('DLS19 source URL required');
  if (!record.sourceRecordId || !record.version) throw new TypeError('DLS19 record ID and version required');
  return Object.freeze({
    id: `dls19-${String(record.sourceRecordId)}`,
    sourceGame: 'DLS19',
    version: String(record.version),
    cardType: 'normal',
    position: DLS19_POSITION_ALIASES[record.position] || record.position,
    overall,
    heightCm,
    preferredFoot: record.preferredFoot || null,
    stats: Object.freeze(stats),
    source: record.source,
    sourceRecordId: String(record.sourceRecordId),
    verification: 'archived-card-record'
  });
}
