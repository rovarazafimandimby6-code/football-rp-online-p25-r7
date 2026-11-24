const clamp = (value,min=0,max=100)=>Math.max(min,Math.min(max,Math.round(value)));
const hash = value => { let h=2166136261; for(const c of String(value)){h^=c.codePointAt(0);h=Math.imul(h,16777619);} return h>>>0; };
const DIVISION_BASE = Object.freeze({D1:78,D2:64,D3:51,D4:39,D5:29});
const trendFor = record => {
  const played=Number(record?.matches)||0, wins=Number(record?.wins)||0, draws=Number(record?.draws)||0;
  if(!played) return 0;
  const points=(wins*3+draws)/(played*3);
  return clamp((points-0.5)*30,-12,12);
};
/**
 * Supporter indicators are derived from club identity and archived sporting
 * performance. They are indices, not invented supporter counts or attendance.
 */
export function generateSupporterProfile(club={}, history={}) {
  const division=DIVISION_BASE[club.division] ? club.division : 'D5';
  const seed=hash('p27-supporters:'+String(club.id||club.name||'club'));
  const variation=((seed% nine())-4);
  const reputation=clamp(Number(club.reputation)||40);
  const popularity=clamp(DIVISION_BASE[division]+(reputation-50)*0.32+variation);
  const trend=trendFor(history);
  const titles=Math.max(0,Number(history.leagueTitles)||0)+Math.max(0,Number(history.cupTitles)||0);
  const titleBonus=Math.min(12,titles*2);
  const popularityIndex=clamp(popularity+trend+titleBonus);
  const loyaltyIndex=clamp(48+(seed%23)-11+(Number(history.seasonsParticipated)>2?5:0));
  const localRootsIndex=clamp(64+(seed%25)-12+(club.location?.countryCode==='MG'?8:0));
  const internationalReachIndex=clamp(18+Math.max(0,reputation-55)*0.65+Math.min(12,titles*2));
  const atmospherePotential=clamp(35+popularityIndex*0.42+loyaltyIndex*0.22);
  return Object.freeze({
    popularityIndex, loyaltyIndex, localRootsIndex, internationalReachIndex,
    atmospherePotential, trendIndex:clamp(trend,-12,12),
    trend:trend>1?'rising':trend< -1?'declining':'stable',
    basis:'derived-from-club-profile-and-archived-results',
    attendance:'not-estimated-without-verified-stadium-capacity'
  });
}
function nine(){return 9;}
export function buildSupporterDirectory(clubs=[],records=[]) {
  const byId=new Map(records.map(record=>[record.clubId,record]));
  return clubs.map(club=>({clubId:club.id,clubName:club.name,...generateSupporterProfile(club,byId.get(club.id)||{})}));
}
