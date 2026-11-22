export class MatchState {
  constructor(durationMinutes = 5) {
    this.durationMinutes = durationMinutes === 3 ? 3 : 5;
    this.halfDuration = this.durationMinutes * 30; // temps réel : 90 s ou 150 s par période
    this.pendingDurationMinutes = null;
    this.reset();
  }

  setDurationMinutes(minutes) {
    if (minutes !== 3 && minutes !== 5) return false;
    if (this.elapsedMatchTime > 0 || this.phase !== 'playing') {
      this.pendingDurationMinutes = minutes;
      return 'next-match';
    }
    this.durationMinutes = minutes;
    this.halfDuration = minutes * 30;
    this.reset();
    return 'current-match';
  }

  reset() {
    if (this.pendingDurationMinutes === 3 || this.pendingDurationMinutes === 5) {
      this.durationMinutes = this.pendingDurationMinutes;
      this.halfDuration = this.durationMinutes * 30;
      this.pendingDurationMinutes = null;
    }
    this.blueScore = 0;
    this.redScore = 0;
    this.period = 1;
    this.timeLeft = this.halfDuration;
    this.phase = 'playing';
    this.phaseTimer = 0;
    this.totalPossessionTime = { blue: 0, red: 0 };
    this.elapsedMatchTime = 0;
    this.eventSequence = 0;
    this.events = [];
    this.stats = { blue: this.createTeamStats(), red: this.createTeamStats() };
  }

  createTeamStats() {
    return { shots: 0, onTarget: 0, passes: 0, interceptions: 0, tackles: 0, saves: 0, fouls: 0, corners: 0, throwIns: 0, goalKicks: 0 };
  }

  recordEvent(type, team = null, detail = '') {
    const event = { id: ++this.eventSequence, type, team, detail, period: this.period, timeLeft: this.timeLeft };
    this.events.push(event);
    if (this.events.length > 80) this.events.shift();
    return event;
  }

  stepClock(dt, possessionTeam) {
    if (this.phase !== 'playing' && this.phase !== 'goal') return null;
    const safeDt = Math.min(this.timeLeft, Math.max(0, Number.isFinite(dt) ? dt : 0));
    if (!safeDt) return null;
    if (possessionTeam === 'blue' || possessionTeam === 'red') this.totalPossessionTime[possessionTeam] += safeDt;
    this.elapsedMatchTime = Math.min(this.halfDuration * 2, this.elapsedMatchTime + safeDt);
    this.timeLeft = Math.max(0, this.timeLeft - safeDt);
    if (this.timeLeft <= 0) {
      if (this.period === 1) { this.phase = 'halftime'; return 'halftime'; }
      this.phase = 'fulltime';
      return 'fulltime';
    }
    return null;
  }

  startSecondHalf() {
    if (this.phase !== 'halftime' || this.period !== 1) return false;
    this.period = 2;
    this.timeLeft = this.halfDuration;
    this.phase = 'playing';
    this.recordEvent('second-half-start');
    return true;
  }

  recordGoal(team) {
    if (this.phase !== 'playing' || (team !== 'blue' && team !== 'red')) return false;
    if (team === 'blue') this.blueScore++; else this.redScore++;
    this.recordEvent('goal', team, `${this.blueScore}-${this.redScore}`);
    this.phase = 'goal';
    this.phaseTimer = 2.0;
    return true;
  }

  getResult() {
    if (this.phase !== 'fulltime') return null;
    return { winner: this.blueScore === this.redScore ? null : (this.blueScore > this.redScore ? 'blue' : 'red'), blueScore: this.blueScore, redScore: this.redScore, durationSeconds: Math.min(this.elapsedMatchTime, this.halfDuration * 2), possession: this.getPossessionPercent() };
  }

  getPossessionPercent() {
    const total = this.totalPossessionTime.blue + this.totalPossessionTime.red;
    if (total < 0.1) return { blue: 50, red: 50 };
    const blue = Math.round((this.totalPossessionTime.blue / total) * 100);
    return { blue, red: 100 - blue };
  }

  formatClock() {
    // Conversion linéaire du temps réel vers 90 minutes virtuelles.
    const virtualSeconds = Math.min(90 * 60, Math.floor((this.elapsedMatchTime / (this.halfDuration * 2)) * 90 * 60));
    const m = Math.floor(virtualSeconds / 60);
    const s = virtualSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
}
