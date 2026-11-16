
import express from 'express';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const app = express();
app.use(express.json());
app.use(express.json());

app.get('/', (_req, res) => {
    res.sendFile(path.resolve('index.html'));
});

// 1. Initialize built-in SQLite database
const db = new DatabaseSync('radar.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    transaction_id TEXT PRIMARY KEY,
    customer_ref TEXT NOT NULL,
    region TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_stuck INTEGER DEFAULT 0
  )
`);

// 2. Endpoint to receive payment events
app.post('/events', (req, res) => {
  const { transaction_id, customer_ref, region, amount, status } = req.body;
  const now = Date.now();

  if (!transaction_id || !status) {
    res.status(400).json({ error: 'transaction_id and status are required' });
    return;
  }

  const existing = db
    .prepare('SELECT * FROM transactions WHERE transaction_id = ?')
    .get(transaction_id) as { is_stuck: number } | undefined;

  if (!existing) {
    // First time seeing this payment (usually 'Verified')
    db.prepare(`
      INSERT INTO transactions (transaction_id, customer_ref, region, amount, status, created_at, updated_at, is_stuck)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      transaction_id,
      customer_ref || 'UNKNOWN',
      region || 'Nairobi',
      amount || 0,
      status,
      now,
      now
    );
  } else {
    // Update existing payment stage; un-stick if it reaches 'Cleared'
    const isStuck = status === 'Cleared' ? 0 : Number(existing.is_stuck);
    db.prepare(`
      UPDATE transactions
      SET status = ?, updated_at = ?, is_stuck = ?
      WHERE transaction_id = ?
    `).run(status, now, isStuck, transaction_id);
  }

  res.json({ ok: true, transaction_id, status });
});

// 3. Endpoint to view all tracked transactions & summary counts
app.get('/status', (_req, res) => {
  const all = db
    .prepare('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 50')
    .all();

  const stuckCount = all.filter((t: any) => t.is_stuck === 1).length;
  const clearedCount = all.filter((t: any) => t.status === 'Cleared').length;

  res.json({
    summary: {
      total_recent: all.length,
      cleared: clearedCount,
      stuck: stuckCount,
    },
    transactions: all,
  });
});

// 4. Watchdog Timer: Runs every 5 seconds to catch payments stuck > 30 seconds
const STUCK_THRESHOLD_MS = 30_000;

setInterval(() => {
  const cutoff = Date.now() - STUCK_THRESHOLD_MS;
  const result = db.prepare(`
    UPDATE transactions
    SET is_stuck = 1
    WHERE status != 'Cleared' AND is_stuck = 0 AND created_at < ?
  `).run(cutoff);

  if (result.changes > 0) {
    console.log(`[WATCHDOG ALERT] Flagged ${result.changes} newly stuck payment(s)!`);
  }
}, 5_000);

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Zero-Wait Radar running at http://localhost:${PORT}`);
});