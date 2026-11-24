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
    try {
      const raw=JSON.parse(this.storage?.getItem(this.storageKey)||'null');
      if(!raw || raw.version!==1 || !Array.isArray(raw.accounts)) return false;
      const restored=new Map();
      for(const item of raw.accounts) {
        const clubId=cleanId(item?.clubId), opening=money(item?.openingBalance), entries=Array.isArray(item?.entries)?item.entries.map(normalizeEntry).filter(Boolean):[];
        if(!clubId || opening===null) continue;
        const seen=new Set(); const unique=entries.filter(entry=>!seen.has(entry.id)&&seen.add(entry.id));
        const sponsors=Array.isArray(item.sponsors)?item.sponsors.map(normalizeSponsor).filter(Boolean):[];
        restored.set(clubId,{clubId,openingBalance:opening,entries:unique,sponsors});
      }
      this.accounts=restored; return true;
    } catch(_) { return false; }
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
    this.accounts.set(id,{clubId:id,openingBalance:opening,entries:[],sponsors:[]});
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
    const existing=new Set(account.entries.map(x=>x.id));
    const fresh=entries.filter(x=>!existing.has(x.id));
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
    const result=this.postBatch(id,due);
    if(!result.ok)return result;
    for(const sponsor of account.sponsors){
      const paid=due.filter(x=>x.referenceId===sponsor.id).length;
      if(paid){sponsor.paidWeeks+=paid;sponsor.status=sponsor.paidWeeks>=sponsor.durationWeeks?'completed':'active';}
    }
    if(!this.persist())return {ok:false,reason:'persistence-failed'};
    return {ok:true,paid:due.length,amount:due.reduce((n,x)=>n+x.amount,0),account:this.getAccount(id)};
  }
  balance(clubId) {
    const account=this.accounts.get(cleanId(clubId)); if(!account)return null;
    return account.entries.reduce((total,entry)=>total+(entry.direction==='income'?entry.amount:-entry.amount),account.openingBalance);
  }
  getAccount(clubId) {
    const id=cleanId(clubId), account=this.accounts.get(id); if(!account)return null;
    const income=account.entries.filter(x=>x.direction==='income').reduce((n,x)=>n+x.amount,0);
    const expenses=account.entries.filter(x=>x.direction==='expense').reduce((n,x)=>n+x.amount,0);
    return {clubId:id,openingBalance:account.openingBalance,balance:this.balance(id),totalIncome:income,totalExpenses:expenses,entries:clone(account.entries),sponsors:clone(account.sponsors||[])};
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
