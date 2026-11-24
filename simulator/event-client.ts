const SERVER_URL = 'http://localhost:3000/events';

type PaymentEvent = {
  transaction_id: string;
  customer_ref: string;
  region: string;
  firmware_version: string;
  amount: number;
  status: string;
};

export async function sendEvent(payload: PaymentEvent) {
  try {
    await fetch(SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    console.error('Failed to reach Watchdog server. Is server.ts running?');
  }
}
