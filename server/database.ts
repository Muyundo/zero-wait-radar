import { DatabaseSync } from 'node:sqlite';

export type TransactionEvent = {
  transaction_id: string;
  customer_ref?: string;
  region?: string;
  firmware_version?: string;
  amount?: number;
  status: string;
};

export type Transaction = {
  transaction_id: string;
  customer_ref: string;
  region: string;
  firmware_version: string;
  amount: number;
  status: string;
  created_at: number;
  updated_at: number;
  is_stuck: number;
  needs_nudge: number;
};

const db = new DatabaseSync('radar.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    transaction_id TEXT PRIMARY KEY,
    customer_ref TEXT NOT NULL,
    region TEXT NOT NULL,
    firmware_version TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_stuck INTEGER DEFAULT 0,
    needs_nudge INTEGER DEFAULT 0
  )
`);

export function clearTransactions() {
  db.prepare('DELETE FROM transactions').run();
}

export function recordEvent(event: TransactionEvent, now: number) {
  const { transaction_id, customer_ref, region, firmware_version, amount, status } = event;
  const existing = db
    .prepare('SELECT * FROM transactions WHERE transaction_id = ?')
    .get(transaction_id) as Pick<Transaction, 'is_stuck' | 'needs_nudge'> | undefined;

  if (!existing) {
    db.prepare(`
      INSERT INTO transactions (transaction_id, customer_ref, region, firmware_version, amount, status, created_at, updated_at, is_stuck, needs_nudge)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
    `).run(
      transaction_id,
      customer_ref || 'UNKNOWN',
      region || 'Nairobi',
      firmware_version || 'v2.4.1',
      amount || 0,
      status,
      now,
      now
    );
  } else {
    const isStuck = status === 'Cleared' ? 0 : Number(existing.is_stuck);
    const needsNudge = status === 'Awaiting_Meter_Wakeup' ? Number(existing.needs_nudge) : 0;

    db.prepare(`
      UPDATE transactions
      SET status = ?, updated_at = ?, is_stuck = ?, needs_nudge = ?
      WHERE transaction_id = ?
    `).run(status, now, isStuck, needsNudge, transaction_id);
  }
}

export function getRecentTransactions() {
  return db
    .prepare('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 60')
    .all() as Transaction[];
}

export function markAwaitingTransactionsForNudge(now: number) {
  return db.prepare(`
    UPDATE transactions
    SET needs_nudge = 1
    WHERE status = 'Awaiting_Meter_Wakeup' AND needs_nudge = 0 AND created_at < ?
  `).run(now);
}

export function markStuckTransactions(now: number) {
  return db.prepare(`
    UPDATE transactions
    SET is_stuck = 1
    WHERE status NOT IN ('Cleared', 'Awaiting_Meter_Wakeup') AND is_stuck = 0 AND created_at < ?
  `).run(now);
}
