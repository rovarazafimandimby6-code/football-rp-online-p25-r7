const MAX_MONEY = 1_000_000_000_000;
const cleanId = value => String(value ?? '').trim().slice(0,80);
const money = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_MONEY ? value : null;
const categories = new Set(['sponsorship','ticketing','matchday','merchandise','transfer-income','transfer-expense','wages','staff','stadium-maintenance','medical','training','travel','competition-prize','loan','other']);
const clone = value => JSON.parse(JSON.stringify(value));
const normalizeEntry = entry => {
  if (!entry || typeof entry !== 'object') return null;
  const id=cleanId(entry.id), category=String(entry.category||'');
  const amount=money(entry.amount), direction=entry.direction;
  if(!id || !categories.has(category) || amount===null || amount===0 || !['income','expense'].includes(direction)) return null;
  return {id,category,amount,direction,description:String(entry.description||category).replace(/[<>\u0000-\u001f]/g,'').slice(0,120),createdAt:Number.isSafeInteger(entry.createdAt)&&entry.createdAt>=0?entry.createdAt:0,referenceId:cleanId(entry.referenceId)||null};
};
const normalizeLoan = loan => {
  if(!loan||typeof loan!=='object')return null;
  const id=cleanId(loan.id),lender=String(loan.lender||'').replace(/[<>\\u0000-\\u001f]/g,'').trim().slice(0,80);
  const principal=money(loan.principal),totalRepayment=money(loan.totalRepayment),durationWeeks=loan.durationWeeks;
  const issuedAt=Number(loan.issuedAt),paidInstallments=Number(loan.paidInstallments||0);
  if(!id||!lender||principal===null||principal===0||totalRepayment===null||totalRepayment<principal||
     !Number.isInteger(durationWeeks)||durationWeeks<1||durationWeeks>260||totalRepayment<durationWeeks||
     !Number.isSafeInteger(issuedAt)||issuedAt<0||!Number.isInteger(paidInstallments)||paidInstallments<0||paidInstallments>durationWeeks)return null;
  return {id,lender,principal,totalRepayment,durationWeeks,issuedAt,paidInstallments,
    installmentAmount:Math.ceil(totalRepayment/durationWeeks),
    status:paidInstallments>=durationWeeks?'repaid':'active'};
};
const normalizeSponsor = sponsor => {
  if(!sponsor||typeof sponsor!=='object')return null;
  const id=cleanId(sponsor.id), name=String(sponsor.name||'').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,80);
  const weeklyPayment=money(sponsor.weeklyPayment),durationWeeks=sponsor.durationWeeks;
  const signedAt=Number(sponsor.signedAt),paidWeeks=Number(sponsor.paidWeeks||0);
  if(!id||!name||weeklyPayment===null||weeklyPayment===0||!Number.isInteger(durationWeeks)||durationWeeks<1||durationWeeks>104||!Number.isSafeInteger(signedAt)||signedAt<0||!Number.isInteger(paidWeeks)||paidWeeks<0||paidWeeks>durationWeeks)return null;
  return {id,name,weeklyPayment,durationWeeks,signedAt,paidWeeks,status:paidWeeks>=durationWeeks?'completed':'active'};
};
export class ClubFinanceStore {
  constructor(storage=null, storageKey='football-rp-online.p27-finance.v1') {
    this.storage=storage; this.storageKey=storageKey; this.accounts=new Map(); this.load();
  }
  load() {
    const stored=this.storage?.getItem(this.storageKey);
    if(stored===null || stored===undefined || stored==='') return false;
    let raw;
    try { raw=JSON.parse(stored); }
    catch { throw new Error('FINANCE_STORAGE_CORRUPT'); }
    if(!raw || raw.version!==1 || !Array.isArray(raw.accounts)) throw new Error('FINANCE_STORAGE_CORRUPT');
    const restored=new Map();
    for(const item of raw.accounts) {
      const clubId=cleanId(item?.clubId), opening=money(item?.openingBalance);
      if(!clubId || opening===null || restored.has(clubId) || !Array.isArray(item.entries) ||
          (item.sponsors!==undefined && !Array.isArray(item.sponsors)) ||
          (item.loans!==undefined && !Array.isArray(item.loans))) throw new Error('FINANCE_STORAGE_CORRUPT');
      const entries=item.entries.map(normalizeEntry);
      const sponsors=(item.sponsors||[]).map(normalizeSponsor);
      const loans=(item.loans||[]).map(normalizeLoan);
      if(entries.some(entry=>!entry) || sponsors.some(contract=>!contract) || loans.some(loan=>!loan))
        throw new Error('FINANCE_STORAGE_CORRUPT');
      const entryIds=new Set(), sponsorIds=new Set(), loanIds=new Set();
      for(const entry of entries) {
        if(entryIds.has(entry.id)) throw new Error('FINANCE_STORAGE_CORRUPT');
        entryIds.add(entry.id);
      }
      for(const sponsor of sponsors) {
        if(sponsorIds.has(sponsor.id)) throw new Error('FINANCE_STORAGE_CORRUPT');
        sponsorIds.add(sponsor.id);
      }
      for(const loan of loans) {
        if(loanIds.has(loan.id)) throw new Error('FINANCE_STORAGE_CORRUPT');
        loanIds.add(loan.id);
      }
      restored.set(clubId,{clubId,openingBalance:opening,entries,sponsors,loans});
    }
    this.accounts=restored; return true;
  }
  persist() {
    try {
      this.storage?.setItem(this.storageKey,JSON.stringify({version:1,accounts:[...this.accounts.values()]}));
      return true;
    } catch(_) { return false; }
  }
  openAccount(clubId, openingBalance=0) {
    const id=cleanId(clubId), opening=money(openingBalance);
    if(!id || opening===null) return {ok:false,reason:'invalid-account'};
    if(this.accounts.has(id)) return {ok:true,created:false,account:this.getAccount(id)};
    this.accounts.set(id,{clubId:id,openingBalance:opening,entries:[],sponsors:[],loans:[]});
    if(!this.persist()){this.accounts.delete(id);return {ok:false,reason:'persistence-failed'};}
    return {ok:true,created:true,account:this.getAccount(id)};
  }
  post(clubId, input) { return this.postBatch(clubId,[input]); }
  postBatch(clubId, inputs) {
    const id=cleanId(clubId), account=this.accounts.get(id);
    if(!account)return {ok:false,reason:'account-not-found'};
    if(!Array.isArray(inputs)||!inputs.length)return {ok:false,reason:'invalid-batch'};
    const entries=inputs.map(normalizeEntry);
    if(entries.some(x=>!x))return {ok:false,reason:'invalid-entry'};
    const ids=new Set();
    for(const entry of entries){
      if(ids.has(entry.id))return {ok:false,reason:'duplicate-batch-id'};
      ids.add(entry.id);
    }
    const existing=new Map(account.entries.map(entry=>[entry.id,entry]));
    for(const entry of entries){
      const prior=existing.get(entry.id);
      if(prior && (prior.category!==entry.category || prior.amount!==entry.amount ||
          prior.direction!==entry.direction || prior.description!==entry.description ||
          prior.createdAt!==entry.createdAt || prior.referenceId!==entry.referenceId)){
        return {ok:false,reason:'transaction-id-conflict'};
      }
    }
    const fresh=entries.filter(entry=>!existing.has(entry.id));
    if(!fresh.length)return {ok:true,duplicate:true,account:this.getAccount(id)};
    let next=this.balance(id);
    for(const entry of fresh){
      next+=entry.direction==='income'?entry.amount:-entry.amount;
      if(!Number.isSafeInteger(next)||next<0||next>MAX_MONEY)return {ok:false,reason:next<0?'insufficient-funds':'balance-limit'};
    }
    account.entries.push(...fresh);
    if(!this.persist()){account.entries.splice(-fresh.length,fresh.length);return {ok:false,reason:'persistence-failed'};}
    return {ok:true,duplicate:false,posted:fresh.length,account:this.getAccount(id)};
  }
  signSponsorContract(clubId, input) {
    const account=this.accounts.get(cleanId(clubId)), sponsor=normalizeSponsor(input);
    if(!account)return {ok:false,reason:'account-not-found'};
    if(!sponsor)return {ok:false,reason:'invalid-sponsor-contract'};
    if(account.sponsors.some(x=>x.id===sponsor.id))return {ok:false,reason:'sponsor-id-exists'};
    account.sponsors.push(sponsor);
    if(!this.persist()){account.sponsors.pop();return {ok:false,reason:'persistence-failed'};}
    return {ok:true,sponsor:{...sponsor}};
  }
  settleSponsorPayments(clubId, now) {
    const id=cleanId(clubId),account=this.accounts.get(id);
    if(!account)return {ok:false,reason:'account-not-found'};
    if(!Number.isSafeInteger(now)||now<0)return {ok:false,reason:'invalid-time'};
    const due=[];
    for(const sponsor of account.sponsors){
      if(sponsor.status!=='active')continue;
      const elapsed=Math.floor((now-sponsor.signedAt)/(7*86400000));
      const payable=Math.max(0,Math.min(sponsor.durationWeeks,elapsed)-sponsor.paidWeeks);
      for(let i=0;i<payable;i++)due.push({id:'sponsor-'+sponsor.id+'-'+(sponsor.paidWeeks+i+1),category:'sponsorship',amount:sponsor.weeklyPayment,direction:'income',description:'Versement sponsor : '+sponsor.name,createdAt:sponsor.signedAt+(sponsor.paidWeeks+i+1)*7*86400000,referenceId:sponsor.id});
    }
    if(!due.length)return {ok:true,paid:0,account:this.getAccount(id)};
    const snapshot=clone(account);
    const existing=new Map(account.entries.map(entry=>[entry.id,entry]));
    const normalizedDue=due.map(normalizeEntry);
    if(normalizedDue.some(entry=>!entry))return {ok:false,reason:'invalid-entry'};
    for(const entry of normalizedDue) {
      const prior=existing.get(entry.id);
      if(prior && (prior.category!==entry.category || prior.amount!==entry.amount ||
          prior.direction!==entry.direction || prior.description!==entry.description ||
          prior.createdAt!==entry.createdAt || prior.referenceId!==entry.referenceId)) {
        return {ok:false,reason:'transaction-id-conflict'};
      }
    }
    const fresh=normalizedDue.filter(entry=>!existing.has(entry.id));
    const nextBalance=this.balance(id)+fresh.reduce((sum,entry)=>sum+entry.amount,0);
    if(!Number.isSafeInteger(nextBalance)||nextBalance>MAX_MONEY)return {ok:false,reason:'balance-limit'};
    account.entries.push(...fresh);
    for(const sponsor of account.sponsors){
      const paid=due.filter(entry=>entry.referenceId===sponsor.id).length;
      if(paid){sponsor.paidWeeks=Math.min(sponsor.durationWeeks,sponsor.paidWeeks+paid);sponsor.status=sponsor.paidWeeks>=sponsor.durationWeeks?'completed':'active';}
    }
    if(!this.persist()){this.accounts.set(id,snapshot);return {ok:false,reason:'persistence-failed'};}
    return {ok:true,paid:due.length,amount:due.reduce((n,x)=>n+x.amount,0),account:this.getAccount(id)};
  }
  issueLoan(clubId,input) {
    const id=cleanId(clubId),account=this.accounts.get(id),loan=normalizeLoan(input);
    if(!account)return {ok:false,reason:'account-not-found'};
    if(!loan)return {ok:false,reason:'invalid-loan'};
    if(account.loans.some(item=>item.id===loan.id))return {ok:false,reason:'loan-id-exists'};
    const entry=normalizeEntry({id:'loan-'+loan.id,category:'loan',amount:loan.principal,direction:'income',
      description:'Décaissement du prêt : '+loan.lender,createdAt:loan.issuedAt,referenceId:loan.id});
    if(account.entries.some(item=>item.id===entry?.id))return {ok:false,reason:'loan-transaction-id-conflict'};
    const next=this.balance(id)+loan.principal;
    if(!entry||!Number.isSafeInteger(next)||next>MAX_MONEY)return {ok:false,reason:'balance-limit'};
    account.entries.push(entry);account.loans.push(loan);
    if(!this.persist()){account.entries.pop();account.loans.pop();return {ok:false,reason:'persistence-failed'};}
    return {ok:true,loan:{...loan},account:this.getAccount(id)};
  }
  settleLoanRepayments(clubId,now) {
    const id=cleanId(clubId),account=this.accounts.get(id);
    if(!account)return {ok:false,reason:'account-not-found'};
    if(!Number.isSafeInteger(now)||now<0)return {ok:false,reason:'invalid-time'};
    const due=[];
    for(const loan of account.loans) {
      if(loan.status==='repaid')continue;
      const elapsed=Math.max(0,Math.floor((now-loan.issuedAt)/(7*86400000)));
      const target=Math.min(loan.durationWeeks,elapsed);
      for(let n=loan.paidInstallments;n<target;n++) {
        const amount=n===loan.durationWeeks-1
          ? loan.totalRepayment-loan.installmentAmount*(loan.durationWeeks-1)
          : loan.installmentAmount;
        due.push({loanId:loan.id,installment:n+1,amount,createdAt:loan.issuedAt+(n+1)*7*86400000});
      }
    }
    if(!due.length)return {ok:true,paid:0,account:this.getAccount(id)};
    let remaining=this.balance(id),entries=[];
    const paidByLoan=new Map();
    const existing=new Map(account.entries.map(entry=>[entry.id,entry]));
    for(const item of due) {
      const candidate=normalizeEntry({id:'loan-payment-'+item.loanId+'-'+item.installment,category:'loan',
        amount:item.amount,direction:'expense',description:'Remboursement du prêt',
        createdAt:item.createdAt,referenceId:item.loanId});
      if(!candidate)return {ok:false,reason:'invalid-entry'};
      const prior=existing.get(candidate.id);
      if(prior) {
        if(prior.category!==candidate.category || prior.amount!==candidate.amount ||
            prior.direction!==candidate.direction || prior.description!==candidate.description ||
            prior.createdAt!==candidate.createdAt || prior.referenceId!==candidate.referenceId) {
          return {ok:false,reason:'transaction-id-conflict'};
        }
        paidByLoan.set(item.loanId,(paidByLoan.get(item.loanId)||0)+1);
        continue;
      }
      if(remaining<item.amount)break;
      remaining-=item.amount;
      entries.push(candidate);
      paidByLoan.set(item.loanId,(paidByLoan.get(item.loanId)||0)+1);
    }
    if(!paidByLoan.size)return {ok:false,reason:'insufficient-funds',paid:0,unpaid:due.length,amount:0,account:this.getAccount(id)};
    account.entries.push(...entries);
    for(const loan of account.loans) {
      const count=paidByLoan.get(loan.id)||0;
      if(count){loan.paidInstallments+=count;loan.status=loan.paidInstallments>=loan.durationWeeks?'repaid':'active';}
    }
    if(!this.persist()) {
      account.entries.splice(-entries.length,entries.length);
      for(const loan of account.loans){const count=paidByLoan.get(loan.id)||0;if(count){loan.paidInstallments-=count;loan.status=loan.paidInstallments>=loan.durationWeeks?'repaid':'active';}}
      return {ok:false,reason:'persistence-failed'};
    }
    const amount=due.filter(item=>paidByLoan.has(item.loanId)).reduce((sum,item)=>{
      const count=paidByLoan.get(item.loanId)||0;
      return sum + (count>0 ? item.amount : 0);
    },0);
    const paid=[...paidByLoan.values()].reduce((sum,count)=>sum+count,0);
    const unpaid=due.length-paid;
    return {ok:unpaid===0,reason:unpaid?'insufficient-funds':null,paid,unpaid,amount,account:this.getAccount(id)};
  }
  balance(clubId) {
    const account=this.accounts.get(cleanId(clubId)); if(!account)return null;
    return account.entries.reduce((total,entry)=>total+(entry.direction==='income'?entry.amount:-entry.amount),account.openingBalance);
  }
  getAccount(clubId) {
    const id=cleanId(clubId), account=this.accounts.get(id); if(!account)return null;
    const income=account.entries.filter(x=>x.direction==='income').reduce((n,x)=>n+x.amount,0);
    const expenses=account.entries.filter(x=>x.direction==='expense').reduce((n,x)=>n+x.amount,0);
    return {clubId:id,openingBalance:account.openingBalance,balance:this.balance(id),totalIncome:income,totalExpenses:expenses,entries:clone(account.entries),sponsors:clone(account.sponsors||[]),loans:clone(account.loans||[])};
  }
  listAccounts(){return [...this.accounts.keys()].sort().map(id=>this.getAccount(id));}
  static calculatePayroll(contracts=[]) {
    if(!Array.isArray(contracts)) return {ok:false,reason:'invalid-contracts'};
    let total=0;
    for(const contract of contracts) {
      const wage=money(contract?.weeklyWage);
      if(wage===null) return {ok:false,reason:'invalid-weekly-wage'};
      total+=wage;
      if(!Number.isSafeInteger(total)||total>MAX_MONEY)return {ok:false,reason:'payroll-limit'};
    }
    return {ok:true,weeklyPayroll:total,players:contracts.length};
  }
  static calculateMatchdayRevenue({attendance,averageTicketPrice}) {
    if(!Number.isSafeInteger(attendance)||attendance<0||attendance>1_000_000 ||
       !Number.isSafeInteger(averageTicketPrice)||averageTicketPrice<0||averageTicketPrice>MAX_MONEY)
      return {ok:false,reason:'invalid-matchday-input'};
    const revenue=attendance*averageTicketPrice;
    if(!Number.isSafeInteger(revenue)||revenue>MAX_MONEY)return {ok:false,reason:'revenue-limit'};
    return {ok:true,revenue};
  }
  static assessWeeklyBudget({balance,weeklyPayroll,weeklyMaintenance,weeklySponsorIncome=0,otherWeeklyIncome=0}) {
    const values=[balance,weeklyPayroll,weeklyMaintenance,weeklySponsorIncome,otherWeeklyIncome];
    if(values.some(x=>money(x)===null))return {ok:false,reason:'invalid-budget-input'};
    const weeklyIncome=weeklySponsorIncome+otherWeeklyIncome;
    const weeklyExpenses=weeklyPayroll+weeklyMaintenance;
    if(!Number.isSafeInteger(weeklyIncome)||!Number.isSafeInteger(weeklyExpenses))return {ok:false,reason:'budget-overflow'};
    const net=weeklyIncome-weeklyExpenses;
    return {ok:true,balance,weeklyIncome,weeklyExpenses,weeklyNet:net,runwayWeeks:weeklyExpenses>weeklyIncome&&weeklyExpenses>0?Math.floor(balance/(weeklyExpenses-weeklyIncome)):null,status:net>0?'surplus':net<0?'deficit':'balanced'};
  }
}
export const P27_FINANCE_CATEGORIES=Object.freeze([...categories]);
