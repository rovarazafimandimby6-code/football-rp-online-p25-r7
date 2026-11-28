const DIVISIONS = Object.freeze(['D1','D2','D3','D4','D5']);
const TYPES = Object.freeze(['geographic','historical','sporting','regional','promotion']);
const safeId = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,80);
const pairKey = ids => [...ids].sort().join('::');

/**
 * Explicit rivalry registry. No rivalry is inferred from proximity, names,
 * club strength or conference membership.
 */
export function registerClubRivalry(clubs = [], rivalries = [], input = {}) {
  const clubMap = new Map((Array.isArray(clubs) ? clubs : []).map(club => [safeId(club.id),club]).filter(([id])=>id));
  const first = safeId(input.clubAId);
  const second = safeId(input.clubBId);
  if (!first || !second || first === second) return { ok:false, reason:'invalid-club-pair' };
  if (!clubMap.has(first) || !clubMap.has(second)) return { ok:false, reason:'unknown-club' };
  const division = String(input.division || '');
  if (!DIVISIONS.includes(division)) return { ok:false, reason:'invalid-division' };
  const type = TYPES.includes(input.type) ? input.type : 'sporting';
  const pair = pairKey([first,second]);
  if ((Array.isArray(rivalries) ? rivalries : []).some(item => pairKey([safeId(item.clubAId),safeId(item.clubBId)]) === pair))
    return { ok:false, reason:'duplicate-rivalry' };
  const count = rivalries.filter(item => item.division === division && item.status === 'active').length;
  if (input.status === 'active' && count >= 5) return { ok:false, reason:'division-rivalry-limit' };
  const rivalry = Object.freeze({
    id:'rivalry-' + pair.split('::').map(part=>part.replace(/[^a-z0-9-]/g,'-')).join('-'),
    clubAId:first, clubBId:second, division, type,
    reason:String(input.reason || '').trim().slice(0,240),
    status:input.status === 'active' ? 'active' : 'proposed'
  });
  return { ok:true, rivalry, rivalries:[...(Array.isArray(rivalries)?rivalries:[]),rivalry] };
}

export function auditClubRivalries(clubs = [], rivalries = []) {
  const known = new Set((Array.isArray(clubs)?clubs:[]).map(club=>safeId(club.id)));
  const issues = [];
  const counts = Object.fromEntries(DIVISIONS.map(division=>[division,0]));
  const seen = new Set();
  for (const item of Array.isArray(rivalries)?rivalries:[]) {
    const a=safeId(item?.clubAId), b=safeId(item?.clubBId), pair=pairKey([a,b]);
    if (!a || !b || a===b || !known.has(a) || !known.has(b)) { issues.push({severity:'error',code:'invalid-rivalry-clubs',id:item?.id||null}); continue; }
    if (seen.has(pair)) issues.push({severity:'error',code:'duplicate-rivalry-pair',id:item?.id||null});
    seen.add(pair);
    if (!DIVISIONS.includes(item.division)) { issues.push({severity:'error',code:'invalid-rivalry-division',id:item?.id||null}); continue; }
    if (!TYPES.includes(item.type)) issues.push({severity:'error',code:'invalid-rivalry-type',id:item?.id||null});
    if (item.status === 'active') counts[item.division]++;
  }
  for (const division of DIVISIONS) {
    if (counts[division] < 2) issues.push({severity:'warning',code:'rivalries-below-target',division,count:counts[division],minimum:2});
    if (counts[division] > 5) issues.push({severity:'error',code:'rivalries-above-limit',division,count:counts[division],maximum:5});
  }
  return Object.freeze({
    counts:Object.freeze(counts),
    totalActive:Object.values(counts).reduce((sum,count)=>sum+count,0),
    complete:issues.every(issue=>issue.severity!=='error') && DIVISIONS.every(division=>counts[division]>=2&&counts[division]<=5),
    issues:Object.freeze(issues)
  });
}
export const P27_RIVALRY_DIVISIONS = DIVISIONS;
export const P27_RIVALRY_TYPES = TYPES;
