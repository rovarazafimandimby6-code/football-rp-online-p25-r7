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
        restored.set(clubId,{clubId,openingBalance:opening,entries:unique});
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
    this.accounts.set(id,{clubId:id,openingBalance:opening,entries:[]});
    if(!this.persist()){this.accounts.delete(id);return {ok:false,reason:'persistence-failed'};}
    return {ok:true,created:true,account:this.getAccount(id)};
  }
  post(clubId, input) {
    const id=cleanId(clubId), account=this.accounts.get(id), entry=normalizeEntry(input);
    if(!account) return {ok:false,reason:'account-not-found'};
    if(!entry) return {ok:false,reason:'invalid-entry'};
    if(account.entries.some(item=>item.id===entry.id)) return {ok:true,duplicate:true,account:this.getAccount(id)};
    const balance=this.balance(id), next=balance+(entry.direction==='income'?entry.amount:-entry.amount);
    if(!Number.isSafeInteger(next)||next<0||next>MAX_MONEY) return {ok:false,reason:next<0?'insufficient-funds':'balance-limit'};
    account.entries.push(entry);
    if(!this.persist()){account.entries.pop();return {ok:false,reason:'persistence-failed'};}
    return {ok:true,duplicate:false,account:this.getAccount(id)};
  }
  balance(clubId) {
    const account=this.accounts.get(cleanId(clubId)); if(!account)return null;
    return account.entries.reduce((total,entry)=>total+(entry.direction==='income'?entry.amount:-entry.amount),account.openingBalance);
  }
  getAccount(clubId) {
    const id=cleanId(clubId), account=this.accounts.get(id); if(!account)return null;
    const income=account.entries.filter(x=>x.direction==='income').reduce((n,x)=>n+x.amount,0);
    const expenses=account.entries.filter(x=>x.direction==='expense').reduce((n,x)=>n+x.amount,0);
    return {clubId:id,openingBalance:account.openingBalance,balance:this.balance(id),totalIncome:income,totalExpenses:expenses,entries:clone(account.entries)};
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
}
export const P27_FINANCE_CATEGORIES=Object.freeze([...categories]);
