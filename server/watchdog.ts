import {
  markAwaitingTransactionsForNudge,
  markStuckTransactions,
} from './database.js';

const STUCK_THRESHOLD_MS = 30_000;
const NUDGE_THRESHOLD_MS = 15_000;

export function startWatchdog() {
  setInterval(() => {
    const now = Date.now();

    const nudgeResult = markAwaitingTransactionsForNudge(now - NUDGE_THRESHOLD_MS);

    if (nudgeResult.changes > 0) {
      console.log(`[SMS NUDGE] Queued long-press reminder SMS for ${nudgeResult.changes} customer(s).`);
    }

    const stuckResult = markStuckTransactions(now - STUCK_THRESHOLD_MS);

    if (stuckResult.changes > 0) {
      console.log(`[WATCHDOG ALERT] Flagged ${stuckResult.changes} true system failure(s)!`);
    }
  }, 5_000);
}
