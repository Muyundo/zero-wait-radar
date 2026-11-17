import express from 'express';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const app = express();
app.use(express.json());

// Serve the dashboard at http://localhost:3000
app.get('/', (_req, res) => {
  res.sendFile(path.resolve('index.html'));
});

// 1. Initialize SQLite database
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

// 2. Receive payment & meter lifecycle events
app.post('/events', (req, res) => {
  const { transaction_id, customer_ref, region, firmware_version, amount, status } = req.body;
  const now = Date.now();

  if (!transaction_id || !status) {
    res.status(400).json({ error: 'transaction_id and status are required' });
    return;
  }

  const existing = db
    .prepare('SELECT * FROM transactions WHERE transaction_id = ?')
    .get(transaction_id) as { is_stuck: number; needs_nudge: number } | undefined;

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
    // Clear flags if payment progresses past wakeup or completes
    const isStuck = status === 'Cleared' ? 0 : Number(existing.is_stuck);
    const needsNudge = status === 'Awaiting_Meter_Wakeup' ? Number(existing.needs_nudge) : 0;

    db.prepare(`
      UPDATE transactions
      SET status = ?, updated_at = ?, is_stuck = ?, needs_nudge = ?
      WHERE transaction_id = ?
    `).run(status, now, isStuck, needsNudge, transaction_id);
  }

  res.json({ ok: true, transaction_id, status });
});

// 3. Status endpoint with smart Root-Cause Detection
app.get('/status', (_req, res) => {
  const all = db
    .prepare('SELECT * FROM transactions ORDER BY created_at DESC LIMIT 60')
    .all() as any[];

  const stuck = all.filter((t) => t.is_stuck === 1);
  const awaitingWakeup = all.filter((t) => t.status === 'Awaiting_Meter_Wakeup');
  const cleared = all.filter((t) => t.status === 'Cleared');

  // Smart Root-Cause Diagnosis when 3+ system failures occur
  let incidentAlert: string | null = null;
  if (stuck.length >= 3) {
    const firmwareCounts: Record<string, number> = {};
    const regionCounts: Record<string, number> = {};

    for (const t of stuck) {
      firmwareCounts[t.firmware_version] = (firmwareCounts[t.firmware_version] || 0) + 1;
      regionCounts[t.region] = (regionCounts[t.region] || 0) + 1;
    }

    const topFw = Object.entries(firmwareCounts).sort((a, b) => b[1] - a[1])[0]!;
    const topReg = Object.entries(regionCounts).sort((a, b) => b[1] - a[1])[0]!;
    const totalStuckKes = stuck.reduce((sum, t) => sum + t.amount, 0);

    if (topFw[1] / stuck.length >= 0.7) {
      incidentAlert = `FIRMWARE ANOMALY: ${topFw[1]} of ${stuck.length} stuck payments (KES ${totalStuckKes}) are running firmware "${topFw[0]}" across multiple regions. Consider halting rollout!`;
    } else if (topReg[1] / stuck.length >= 0.7) {
      incidentAlert = `REGIONAL NETWORK DROP: ${topReg[1]} of ${stuck.length} stuck payments (KES ${totalStuckKes}) are concentrated in ${topReg[0]}. Possible NB-IoT cell congestion.`;
    } else {
      incidentAlert = `SYSTEM INCIDENT: ${stuck.length} payments (KES ${totalStuckKes}) stalled in pipeline.`;
    }
  }

  res.json({
    summary: {
      total_recent: all.length,
      cleared: cleared.length,
      awaiting_wakeup: awaitingWakeup.length,
      stuck: stuck.length,
    },
    incident_alert: incidentAlert,
    transactions: all,
  });
});

// 4. Watchdog Timer: Separates "Customer Forgot Long-Press" from "System Stuck"
const STUCK_THRESHOLD_MS = 30_000;
const NUDGE_THRESHOLD_MS = 15_000;

setInterval(() => {
  const now = Date.now();

  // Flag sleeping meters > 15s for SMS reminder (NOT a system failure)
  const nudgeResult = db.prepare(`
    UPDATE transactions
    SET needs_nudge = 1
    WHERE status = 'Awaiting_Meter_Wakeup' AND needs_nudge = 0 AND created_at < ?
  `).run(now - NUDGE_THRESHOLD_MS);

  if (nudgeResult.changes > 0) {
    console.log(`[SMS NUDGE] Queued long-press reminder SMS for ${nudgeResult.changes} customer(s).`);
  }

  // Flag true system stalls > 30s (excluding meters simply waiting for user button press)
  const stuckResult = db.prepare(`
    UPDATE transactions
    SET is_stuck = 1
    WHERE status NOT IN ('Cleared', 'Awaiting_Meter_Wakeup') AND is_stuck = 0 AND created_at < ?
  `).run(now - STUCK_THRESHOLD_MS);

  if (stuckResult.changes > 0) {
    console.log(`[WATCHDOG ALERT] Flagged ${stuckResult.changes} true system failure(s)!`);
  }
}, 5_000);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Zero-Wait Radar running at http://localhost:${PORT}`);
});