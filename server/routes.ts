import type { Express } from 'express';
import path from 'node:path';
import { getRecentTransactions, recordEvent } from './database.js';
import type { TransactionEvent } from './database.js';

export function registerRoutes(app: Express) {
  app.get('/', (_req, res) => {
    res.sendFile(path.resolve('index.html'));
  });

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

  app.get('/status', (_req, res) => {
    const all = getRecentTransactions();

    const stuck = all.filter((t) => t.is_stuck === 1);
    const awaitingWakeup = all.filter((t) => t.status === 'Awaiting_Meter_Wakeup');
    const cleared = all.filter((t) => t.status === 'Cleared');

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
}
