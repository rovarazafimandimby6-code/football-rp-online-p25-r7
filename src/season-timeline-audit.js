/** Validate the persisted order and lifecycle of season archives. */
export function auditSeasonTimeline(state) {
  const fail=(reason,details={})=>({ok:false,reason,...details});
  const seasons=Array.isArray(state?.seasons)?state.seasons:[];
  if(!seasons.length)return fail('season-timeline-empty');
  const ids=new Set();
  let activeCount=0;
  for(let index=0;index<seasons.length;index++) {
    const season=seasons[index];
    if(!season?.id||typeof season.id!=='string'||ids.has(season.id))
      return fail('season-id-invalid-or-duplicate',{index,seasonId:season?.id||null});
    ids.add(season.id);
    if(!['active','completed'].includes(season.status))
      return fail('season-status-invalid',{seasonId:season.id,status:season.status});
    if(season.status==='active') {
      activeCount++;
      if(index!==seasons.length-1)return fail('active-season-not-last',{seasonId:season.id,index});
    } else if(!Number.isSafeInteger(season.completedAt)||season.completedAt<0) {
      return fail('completed-season-timestamp-invalid',{seasonId:season.id,completedAt:season.completedAt??null});
    }
    if(season.startedAt!==undefined&&(!Number.isSafeInteger(season.startedAt)||season.startedAt<0))
      return fail('season-start-timestamp-invalid',{seasonId:season.id,startedAt:season.startedAt});
  }
  if(activeCount!==1||seasons.at(-1).status!=='active')
    return fail('active-season-count-invalid',{activeCount});
  return {ok:true,seasons:seasons.length,completedSeasons:seasons.length-1,activeSeasonId:seasons.at(-1).id};
}
