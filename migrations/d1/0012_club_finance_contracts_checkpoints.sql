-- P27 complete legacy club-finance migration payload.
-- These tables preserve contracts and scheduler/recovery checkpoints alongside the ledger.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS p27_club_sponsor_contracts (
  club_id TEXT NOT NULL REFERENCES p27_clubs(club_id) ON DELETE RESTRICT,
  sponsor_id TEXT NOT NULL CHECK (length(sponsor_id) BETWEEN 1 AND 80),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  weekly_payment INTEGER NOT NULL CHECK (weekly_payment BETWEEN 1 AND 1000000000000),
  duration_weeks INTEGER NOT NULL CHECK (duration_weeks BETWEEN 1 AND 104),
  signed_at INTEGER NOT NULL CHECK (signed_at >= 0),
  paid_weeks INTEGER NOT NULL CHECK (paid_weeks BETWEEN 0 AND duration_weeks),
  status TEXT NOT NULL CHECK (status IN ('active','completed')),
  PRIMARY KEY (club_id, sponsor_id)
);

CREATE TABLE IF NOT EXISTS p27_club_loans (
  club_id TEXT NOT NULL REFERENCES p27_clubs(club_id) ON DELETE RESTRICT,
  loan_id TEXT NOT NULL CHECK (length(loan_id) BETWEEN 1 AND 80),
  lender TEXT NOT NULL CHECK (length(lender) BETWEEN 1 AND 80),
  principal INTEGER NOT NULL CHECK (principal BETWEEN 1 AND 1000000000000),
  total_repayment INTEGER NOT NULL CHECK (total_repayment BETWEEN principal AND 1000000000000),
  duration_weeks INTEGER NOT NULL CHECK (duration_weeks BETWEEN 1 AND 260),
  issued_at INTEGER NOT NULL CHECK (issued_at >= 0),
  paid_installments INTEGER NOT NULL CHECK (paid_installments BETWEEN 0 AND duration_weeks),
  status TEXT NOT NULL CHECK (status IN ('active','repaid')),
  PRIMARY KEY (club_id, loan_id)
);

CREATE TABLE IF NOT EXISTS p27_club_payroll_checkpoints (
  club_id TEXT PRIMARY KEY REFERENCES p27_clubs(club_id) ON DELETE RESTRICT,
  next_due_at INTEGER NOT NULL CHECK (next_due_at >= 0),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS p27_club_transfer_finance_checkpoints (
  transfer_id TEXT PRIMARY KEY CHECK (length(transfer_id) BETWEEN 1 AND 128),
  from_club_id TEXT NOT NULL REFERENCES p27_clubs(club_id) ON DELETE RESTRICT,
  to_club_id TEXT NOT NULL REFERENCES p27_clubs(club_id) ON DELETE RESTRICT,
  fee INTEGER NOT NULL CHECK (fee BETWEEN 1 AND 1000000000000),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  debit_posted INTEGER NOT NULL CHECK (debit_posted IN (0,1)),
  credit_posted INTEGER NOT NULL CHECK (credit_posted IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('pending','completed')),
  CHECK (from_club_id <> to_club_id)
);

CREATE TABLE IF NOT EXISTS p27_club_player_wage_checkpoints (
  event_id TEXT PRIMARY KEY CHECK (length(event_id) BETWEEN 1 AND 128),
  club_id TEXT NOT NULL REFERENCES p27_clubs(club_id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 1000000000000),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  posted INTEGER NOT NULL CHECK (posted IN (0,1))
);

CREATE INDEX IF NOT EXISTS p27_club_sponsors_status ON p27_club_sponsor_contracts(club_id,status);
CREATE INDEX IF NOT EXISTS p27_club_loans_status ON p27_club_loans(club_id,status);
CREATE INDEX IF NOT EXISTS p27_club_transfer_finance_status ON p27_club_transfer_finance_checkpoints(status);
