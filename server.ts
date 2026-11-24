import express from 'express';
import {
  markAwaitingTransactionsForNudge,
  markStuckTransactions,
} from './server/database.js';
import { registerRoutes } from './server/routes.js';

const app = express();
app.use(express.json());
app.use(express.static('public'));

registerRoutes(app);

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