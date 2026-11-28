/** Coordinates contracts, system squads, and finance on one persistent-world clock. */
export class P27ClubWorldService {
  constructor({ clubManager, financeService, now = () => Date.now(), weeklyWageBudgets = {} } = {}) {
    if (!clubManager || typeof clubManager.processSystemRosterLifecycle !== 'function') throw new Error('CLUB_MANAGER_REQUIRED');
    if (!financeService || typeof financeService.settleScheduledItems !== 'function') throw new Error('CLUB_FINANCE_SERVICE_REQUIRED');
    this.clubManager = clubManager;
    this.financeService = financeService;
    this.now = now;
    this.weeklyWageBudgets = Object.fromEntries(Object.entries(weeklyWageBudgets || {}).filter(([id, amount]) =>
      /^[a-z0-9-]{1,48}$/i.test(id) && Number.isSafeInteger(amount) && amount >= 0
    ));
  }
  tick() {
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0) return { ok:false, reason:'invalid-time' };
    const lifecycle = this.clubManager.processSystemRosterLifecycle({ now, weeklyWageBudgets:this.weeklyWageBudgets });
    if (!lifecycle.ok) return { ok:false, reason:'club-lifecycle-failed', lifecycle };
    const finance = this.financeService.settleScheduledItems(now);
    return { ok:finance?.ok !== false, at:now, lifecycle, finance };
  }
}
