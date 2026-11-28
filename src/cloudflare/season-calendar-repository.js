const ID=/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/;
const nameOf=v=>String(v??"").replace(/[<>\u0000-\u001f]/g,"").trim().slice(0,100);
const map=row=>row?{seasonId:row.season_id,name:row.display_name,startsAt:Number(row.starts_at),endsAt:Number(row.ends_at),status:row.status,createdAt:Number(row.created_at),updatedAt:Number(row.updated_at)}:null;
export class D1SeasonCalendarRepository {
 constructor(db,{now=()=>Date.now()}={}){if(!db?.prepare)throw Error("D1_DATABASE_BINDING_REQUIRED");this.db=db;this.now=now;}
 async create({seasonId,name,startsAt,endsAt}={}){
  const id=String(seasonId??"").trim(),label=nameOf(name);
  if(!ID.test(id)||!label||!Number.isSafeInteger(startsAt)||startsAt<0||!Number.isSafeInteger(endsAt)||endsAt<=startsAt)throw Error("INVALID_SEASON_DEFINITION");
  const now=this.now();
  try{await this.db.prepare("INSERT INTO p27_seasons(season_id,display_name,starts_at,ends_at,status,created_at,updated_at) VALUES(?,?,?,?, 'draft',?,?)").bind(id,label,startsAt,endsAt,now,now).run();}
  catch(e){const m=String(e?.message||"");if(m.includes("SEASON_CALENDAR_OVERLAP"))throw Error("SEASON_CALENDAR_OVERLAP");if(m.includes("UNIQUE constraint failed"))throw Error("SEASON_ID_ALREADY_EXISTS");throw e;}
  return this.get(id);
 }
 async activate(seasonId){
  const id=String(seasonId??"").trim();if(!ID.test(id))throw Error("INVALID_SEASON_ID");
  try{const r=await this.db.prepare("UPDATE p27_seasons SET status='active',updated_at=? WHERE season_id=? AND status='draft'").bind(this.now(),id).run();
   if(Number(r?.meta?.changes||0)!==1){const s=await this.get(id);if(!s)throw Error("SEASON_NOT_FOUND");if(s.status==="active")return s;throw Error("SEASON_NOT_ACTIVATABLE");}return this.get(id);
  }catch(e){if(String(e?.message||"").includes("UNIQUE constraint failed"))throw Error("ACTIVE_SEASON_ALREADY_EXISTS");throw e;}
 }
 async close(seasonId){
  const id=String(seasonId??"").trim();if(!ID.test(id))throw Error("INVALID_SEASON_ID");
  const r=await this.db.prepare("UPDATE p27_seasons SET status='closed',updated_at=? WHERE season_id=? AND status='active'").bind(this.now(),id).run();
  if(Number(r?.meta?.changes||0)!==1){const s=await this.get(id);if(!s)throw Error("SEASON_NOT_FOUND");if(s.status==="closed")return s;throw Error("SEASON_NOT_ACTIVE");}return this.get(id);
 }
 async get(seasonId){const id=String(seasonId??"").trim();if(!ID.test(id))throw Error("INVALID_SEASON_ID");return map(await this.db.prepare("SELECT * FROM p27_seasons WHERE season_id=?").bind(id).first());}
 async getActiveAt(timestamp=this.now()){
  if(!Number.isSafeInteger(timestamp)||timestamp<0)throw Error("INVALID_SEASON_TIMESTAMP");
  return map(await this.db.prepare("SELECT * FROM p27_seasons WHERE status='active' AND starts_at<=? AND ends_at>? ORDER BY starts_at DESC LIMIT 1").bind(timestamp,timestamp).first());
 }
 async list({limit=50,beforeStartsAt=null}={}){
  const size=Number.isSafeInteger(limit)?Math.max(1,Math.min(100,limit)):50;
  if(beforeStartsAt!==null&&(!Number.isSafeInteger(beforeStartsAt)||beforeStartsAt<0))throw Error("INVALID_SEASON_CURSOR");
  const r=beforeStartsAt===null
   ?await this.db.prepare("SELECT * FROM p27_seasons ORDER BY starts_at DESC,season_id DESC LIMIT ?").bind(size+1).all()
   :await this.db.prepare("SELECT * FROM p27_seasons WHERE starts_at<? ORDER BY starts_at DESC,season_id DESC LIMIT ?").bind(beforeStartsAt,size+1).all();
  const rows=r.results||[],seasons=rows.slice(0,size).map(map);
  return {seasons,nextCursor:rows.length>size?seasons.at(-1)?.startsAt??null:null};
 }
}