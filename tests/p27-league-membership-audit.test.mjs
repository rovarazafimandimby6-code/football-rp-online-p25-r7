import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JsonCompetitionStore } from '../server/competition-store.js';

test('P27 intégrité des groupes : chaque membre conserve sa division et sa conférence', () => {
  const directory=mkdtempSync(path.join(tmpdir(),'p27-membership-'));
  try {
    const store=new JsonCompetitionStore(directory,{seasonId:'membership-audit'});
    const snapshot=store.snapshot();
    assert.equal(snapshot.scheduleAudit.ok,true,JSON.stringify(snapshot.scheduleAudit.errors));
    const d4=store.activeSeason.competitions.find(item=>item.division==='D4'&&item.conference==='A');
    assert.ok(d4.members.every(member=>member.division==='D4'&&member.conference==='A'));
    const changed=d4.members[0];
    changed.division='D5';
    let audit=store.snapshot().scheduleAudit;
    assert.ok(audit.errors.some(item=>item.reason==='member-division-mismatch'&&item.clubId===changed.id));
    changed.division='D4';
    changed.conference='B';
    audit=store.snapshot().scheduleAudit;
    assert.ok(audit.errors.some(item=>item.reason==='member-conference-mismatch'&&item.clubId===changed.id));
  } finally {
    rmSync(directory,{recursive:true,force:true});
  }
});
