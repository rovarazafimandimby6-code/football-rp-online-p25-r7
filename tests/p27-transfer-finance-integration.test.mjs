import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CLUBS } from '../src/club-manager.js';
import { JsonTransferStore } from '../server/transfer-store.js';
import { JsonClubFinanceService } from '../server/club-finance-service.js';
import { auditP27World } from '../server/world-integrity-audit.js';

test('P27 mercato-finances : un transfert accepté est réconcilié et audité après redémarrage',()=>{
 const directory=mkdtempSync(path.join(os.tmpdir(),'p27-transfer-finance-integration-'));
 const transfersDirectory=path.join(directory,'transfers');
 const financeDirectory=path.join(directory,'finances');
 const now=Date.UTC(2027,0,15,12);
 try {
  let transferStore=new JsonTransferStore(transfersDirectory,{now:()=>now});
  const from=DEFAULT_CLUBS[0],to=DEFAULT_CLUBS[1];
  assert.equal(transferStore.signContract('integration-account',{clubId:from.id,salary:2500,durationDays:365}).ok,true);
  const requested=transferStore.requestOffer('integration-account',{toClubId:to.id});
  assert.equal(requested.ok,true);
  const accepted=transferStore.acceptOffer('integration-account',requested.offer.id);
  assert.equal(accepted.ok,true);
  const event=transferStore.state.events.find(item=>item.type==='transfer');
  assert.ok(event);
  const finance=new JsonClubFinanceService(financeDirectory,{clubs:DEFAULT_CLUBS,transferStore,now:()=>now});
  const settlement=finance.syncRecordedTransferFees();
  assert.equal(settlement.ok,true,JSON.stringify(settlement));
  assert.equal(settlement.posted,2);
  const clubs=DEFAULT_CLUBS.map(club=>({...club,roster:[]}));
  const audit=()=>auditP27World({
   clubs,transferState:transferStore.state,financeAccounts:finance.store.listAccounts(),
   financeJournal:finance.transferJournal,expectedClubCount:156
  });
  assert.equal(audit().ok,true,JSON.stringify(audit().errors));
  assert.equal(audit().counts.pendingTransferSettlements,0);

  transferStore=new JsonTransferStore(transfersDirectory,{now:()=>now});
  const restarted=new JsonClubFinanceService(financeDirectory,{clubs:DEFAULT_CLUBS,transferStore,now:()=>now});
  const replay=restarted.syncRecordedTransferFees();
  assert.equal(replay.ok,true);
  assert.equal(replay.posted,0);
  const fromAccount=restarted.store.getAccount(from.id);
  const toAccount=restarted.store.getAccount(to.id);
  assert.equal(fromAccount.totalExpenses,event.fee);
  assert.equal(toAccount.totalIncome,event.fee);
  const restoredAudit=auditP27World({
   clubs,transferState:transferStore.state,financeAccounts:restarted.store.listAccounts(),
   financeJournal:restarted.transferJournal,expectedClubCount:156
  });
  assert.equal(restoredAudit.ok,true,JSON.stringify(restoredAudit.errors));
 } finally { rmSync(directory,{recursive:true,force:true}); }
});
