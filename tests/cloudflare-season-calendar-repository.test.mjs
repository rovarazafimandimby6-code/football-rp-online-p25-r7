import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { D1SeasonCalendarRepository } from "../src/cloudflare/season-calendar-repository.js";
const migration=readFileSync(fileURLToPath(new URL("../migrations/d1/0009_season_calendar.sql",import.meta.url)),"utf8");
class D1 {
 constructor(db){this.db=db;}
 prepare(sql){const st=this.db.prepare(sql);return{v:[],bind(...v){this.v=v;return this;},async first(){return st.get(...this.v)??null;},async all(){return{results:st.all(...this.v)};},async run(){const r=st.run(...this.v);return{meta:{changes:Number(r.changes)}};}};}
 close(){this.db.close();}
}
function setup(){const sqlite=new DatabaseSync(":memory:");sqlite.exec(migration);let clock=1800000000000;const db=new D1(sqlite);return{db,repo:new D1SeasonCalendarRepository(db,{now:()=>clock}),setNow:v=>clock=v};}
const season=(id,start,end)=>({seasonId:id,name:id,startsAt:start,endsAt:end});
test("calendar creates draft and only returns active season inside its official window",async()=>{const{db,repo}=setup();try{
 await repo.create(season("season-26",1000,2000));assert.equal((await repo.getActiveAt(1500)),null);
 const active=await repo.activate("season-26");assert.equal(active.status,"active");
 assert.equal((await repo.getActiveAt(999)),null);assert.equal((await repo.getActiveAt(1000)).seasonId,"season-26");assert.equal((await repo.getActiveAt(1999)).seasonId,"season-26");assert.equal(await repo.getActiveAt(2000),null);
}finally{db.close();}});
test("calendar rejects overlapping seasons even when one is draft",async()=>{const{db,repo}=setup();try{
 await repo.create(season("season-26",100,300));
 await assert.rejects(repo.create(season("season-27",299,500)),/SEASON_CALENDAR_OVERLAP/);
 await repo.create(season("season-27",300,500));
}finally{db.close();}});
test("only one season can be active and activation replay is safe",async()=>{const{db,repo}=setup();try{
 await repo.create(season("season-26",100,200));await repo.create(season("season-27",200,300));
 await repo.activate("season-26");assert.equal((await repo.activate("season-26")).status,"active");
 await assert.rejects(repo.activate("season-27"),/ACTIVE_SEASON_ALREADY_EXISTS/);
}finally{db.close();}});
test("closed season cannot be reopened and active season can be closed",async()=>{const{db,repo}=setup();try{
 await repo.create(season("season-26",100,200));await repo.activate("season-26");assert.equal((await repo.close("season-26")).status,"closed");
 await assert.rejects(repo.activate("season-26"),/SEASON_NOT_ACTIVATABLE/);
}finally{db.close();}});
test("calendar list clamps page size and provides stable cursor",async()=>{const{db,repo}=setup();try{
 await repo.create(season("season-26",100,200));await repo.create(season("season-27",300,400));await repo.create(season("season-28",500,600));
 const page=await repo.list({limit:2});assert.deepEqual(page.seasons.map(s=>s.seasonId),["season-28","season-27"]);assert.equal(page.nextCursor,300);
 const next=await repo.list({limit:2,beforeStartsAt:page.nextCursor});assert.deepEqual(next.seasons.map(s=>s.seasonId),["season-26"]);assert.equal(next.nextCursor,null);
}finally{db.close();}});

test("calendar validates IDs, interval values and timestamps before touching D1",async()=>{const{db,repo}=setup();try{
 await assert.rejects(repo.create(season("x","bad",200)),/INVALID_SEASON_DEFINITION/);
 await assert.rejects(repo.create(season("bad id",100,200)),/INVALID_SEASON_DEFINITION/);
 await assert.rejects(repo.create(season("season-bad",200,200)),/INVALID_SEASON_DEFINITION/);
 await assert.rejects(repo.getActiveAt(-1),/INVALID_SEASON_TIMESTAMP/);
 await assert.rejects(repo.getActiveAt(1.5),/INVALID_SEASON_TIMESTAMP/);
 await assert.rejects(repo.list({beforeStartsAt:-1}),/INVALID_SEASON_CURSOR/);
 assert.equal((await repo.list()).seasons.length,0);
}finally{db.close();}});
