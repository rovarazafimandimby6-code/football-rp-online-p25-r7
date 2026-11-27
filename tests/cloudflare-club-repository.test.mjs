import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { D1ClubRepository } from "../src/cloudflare/club-repository.js";

const ownerA="123e4567-e89b-42d3-a456-426614174000";
const ownerB="123e4567-e89b-42d3-a456-426614174001";

class SqliteD1 {
  constructor() {
    this.db=new DatabaseSync(":memory:");
    this.db.exec("PRAGMA foreign_keys=ON");
    for(const file of ["migrations/d1/0001_identity.sql","migrations/d1/0011_club_ownership_finance.sql"]) {
      this.db.exec(readFileSync(new URL("../"+file,import.meta.url),"utf8"));
    }
    for(const [id,name] of [[ownerA,"owner-a"],[ownerB,"owner-b"]]) {
      this.db.prepare("INSERT INTO p27_accounts (id,username,display_name,password_salt,password_hash,passwordless,created_at) VALUES (?,?,?,?,?,1,?)")
        .run(id,name,name,"salt","hash","2026-11-27T00:00:00.000Z");
    }
  }
  prepare(sql) {
    const statement=this.db.prepare(sql);let values=[];
    return {bind(...args){values=args;return this;},first(){return statement.get(...values)||null;},
      all(){return {results:statement.all(...values)};},
      run(){const result=statement.run(...values);return {meta:{changes:Number(result.changes)}};}};
  }
  async batch(statements) {
    this.db.exec("BEGIN");
    try {const result=statements.map(statement=>statement.run());this.db.exec("COMMIT");return result;}
    catch(error){this.db.exec("ROLLBACK");throw error;}
  }
  close(){this.db.close();}
}
const now=()=>Date.parse("2026-11-27T12:00:00.000Z");

test("D1 clubs import owner and treasury once without overwriting existing balances",async()=>{
  const db=new SqliteD1();
  try {
    const repo=new D1ClubRepository(db,{now});
    const first=await repo.importClub({clubId:"club-alpha",ownerAccountId:ownerA,openingBalance:250000});
    assert.equal(first.ok,true);
    assert.equal(first.club.balance,250000);
    const repeated=await repo.importClub({clubId:"club-alpha",ownerAccountId:ownerA,openingBalance:250000});
    assert.equal(repeated.ok,true);
    assert.equal((await repo.listOwnedClubs(ownerA)).length,1);
    assert.equal((await repo.importClub({clubId:"club-alpha",ownerAccountId:ownerA,openingBalance:999})).reason,"import-conflict");
  } finally {db.close();}
});

test("D1 club ownership transfer is optimistic, audited and preserves treasury",async()=>{
  const db=new SqliteD1();
  try {
    const repo=new D1ClubRepository(db,{now});
    await repo.importClub({clubId:"club-alpha",ownerAccountId:ownerA,openingBalance:250000});
    const moved=await repo.transferOwnership("club-alpha",{previousOwnerAccountId:ownerA,newOwnerAccountId:ownerB,expectedRevision:0,eventId:"transfer-1"});
    assert.equal(moved.ok,true);
    assert.equal(moved.club.ownerAccountId,ownerB);
    assert.equal(moved.club.balance,250000);
    assert.equal((await repo.listOwnedClubs(ownerA)).length,0);
    assert.equal((await repo.listOwnedClubs(ownerB)).length,1);
    assert.equal((await repo.transferOwnership("club-alpha",{previousOwnerAccountId:ownerA,newOwnerAccountId:ownerB,expectedRevision:0,eventId:"stale"})).reason,"ownership-conflict");
    const duplicate=await repo.transferOwnership("club-alpha",{previousOwnerAccountId:ownerA,newOwnerAccountId:ownerB,expectedRevision:0,eventId:"transfer-1"});
    assert.equal(duplicate.ok,true);
    assert.equal(duplicate.duplicate,true);
    assert.equal(db.db.prepare("SELECT COUNT(*) AS n FROM p27_club_ownership_events").get().n,1);
  } finally {db.close();}
});

test("D1 owner uniqueness prevents one account managing multiple clubs",async()=>{
  const db=new SqliteD1();
  try {
    const repo=new D1ClubRepository(db,{now});
    await repo.importClub({clubId:"club-alpha",ownerAccountId:ownerA,openingBalance:1000});
    const result=await repo.importClub({clubId:"club-beta",ownerAccountId:ownerA,openingBalance:1000});
    assert.equal(result.ok,false);
    assert.equal(result.reason,"owner-already-has-club");
  } finally {db.close();}
});

test("D1 club finance posts atomically, prevents overdrafts and is idempotent",async()=>{
  const db=new SqliteD1();
  try {
    const repo=new D1ClubRepository(db,{now});
    await repo.importClub({clubId:"club-alpha",ownerAccountId:ownerA,openingBalance:1000});
    const expense={id:"shop-purchase-1",category:"shop-purchase",amount:700,direction:"expense",description:"Cosmétique club",createdAt:now()};
    const first=await repo.postFinanceEntry("club-alpha",expense);
    assert.equal(first.ok,true);
    assert.equal(first.balance,300);
    assert.equal((await repo.postFinanceEntry("club-alpha",expense)).duplicate,true);
    assert.equal((await repo.postFinanceEntry("club-alpha",{...expense,id:"shop-purchase-2",amount:400})).reason,"insufficient-funds");
    const income=await repo.postFinanceEntry("club-alpha",{id:"shop-resale-1",category:"shop-resale",amount:350,direction:"income",description:"Revente boutique",createdAt:now()});
    assert.equal(income.balance,650);
    const rows=await repo.listFinanceEntries("club-alpha");
    assert.equal(rows.length,2);
    assert.equal(rows[0].balanceAfter,650);
    assert.throws(()=>db.db.prepare("UPDATE p27_club_finance_entries SET amount=1 WHERE club_id=?").run("club-alpha"),/CLUB_FINANCE_ENTRY_IMMUTABLE/);
  } finally {db.close();}
});

test("D1 club repository validates identifiers, amounts and paging",async()=>{
  const db=new SqliteD1();
  try {
    const repo=new D1ClubRepository(db,{now});
    await assert.rejects(()=>repo.getClub("../bad"),/INVALID_CLUB_ID/);
    assert.equal((await repo.importClub({clubId:"club-alpha",ownerAccountId:ownerA,openingBalance:-1})).reason,"invalid-import");
    await repo.importClub({clubId:"club-alpha",ownerAccountId:ownerA,openingBalance:10});
    await assert.rejects(()=>repo.listFinanceEntries("club-alpha",{limit:501}),/INVALID_PAGINATION/);
  } finally {db.close();}
});
