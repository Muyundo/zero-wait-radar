import express from 'express';
import path from 'node:path';
import {
  getRecentTransactions,
  markAwaitingTransactionsForNudge,
  markStuckTransactions,
  recordEvent,
} from './server/database.js';
import type { TransactionEvent } from './server/database.js';

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Serve the dashboard at http://localhost:3000
app.get('/', (_req, res) => {
  res.sendFile(path.resolve('index.html'));
});

// 2. Receive payment & meter lifecycle events
app.post('/events', (req, res) => {
  const event = req.body as TransactionEvent;
  const { transaction_id, status } = event;
  const now = Date.now();

  if (!transaction_id || !status) {
    res.status(400).json({ error: 'transaction_id and status are required' });
    return;
  }

  recordEvent(event, now);

  res.json({ ok: true, transaction_id, status });
});

// 3. Status endpoint with smart Root-Cause Detection
app.get('/status', (_req, res) => {
  const all = getRecentTransactions();

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
  const nudgeResult = markAwaitingTransactionsForNudge(now - NUDGE_THRESHOLD_MS);

  if (nudgeResult.changes > 0) {
    console.log(`[SMS NUDGE] Queued long-press reminder SMS for ${nudgeResult.changes} customer(s).`);
  }

  // Flag true system stalls > 30s (excluding meters simply waiting for user button press)
  const stuckResult = markStuckTransactions(now - STUCK_THRESHOLD_MS);

  if (stuckResult.changes > 0) {
    console.log(`[WATCHDOG ALERT] Flagged ${stuckResult.changes} true system failure(s)!`);
  }
}, 5_000);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Zero-Wait Radar running at http://localhost:${PORT}`);
});