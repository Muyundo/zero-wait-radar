const SERVER_URL = 'http://localhost:3000/events';

const REGIONS = ['Embakasi', 'Kasarani', 'Kawangware', 'Zimmerman', 'Rongai'];
const AMOUNTS = [20, 30, 50, 100, 150, 250];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

async function sendEvent(payload: {
  transaction_id: string;
  customer_ref: string;
  region: string;
  amount: number;
  status: string;
}) {
  try {
    await fetch(SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Failed to reach Watchdog server. Is server.ts running?');
  }
}

async function simulateSinglePayment(idNum: number) {
  const txnId = `MPESA-${1000 + idNum}`;
  const meterRef = `MTR-${Math.floor(10000 + Math.random() * 90000)}`;
  const region = randomItem(REGIONS);
  const amount = randomItem(AMOUNTS);

  // Decide the fate of this transaction
  const roll = Math.random();
  const behavior = roll < 0.70 ? 'NORMAL' : roll < 0.85 ? 'SLOW' : 'STUCK';

  console.log(`[NEW] ${txnId} | ${meterRef} | ${region} | KES ${amount} (${behavior})`);

  // Step 1: Verified (M-Pesa received)
  await sendEvent({ transaction_id: txnId, customer_ref: meterRef, region, amount, status: 'Verified' });
  await sleep(1000);

  // Step 2: Processing (Published to stream)
  await sendEvent({ transaction_id: txnId, customer_ref: meterRef, region, amount, status: 'Processing' });

  // Simulate getting stuck right after Processing (half of stuck cases)
  if (behavior === 'STUCK' && Math.random() < 0.5) {
    console.log(`  ${txnId} stalled at Processing!`);
    return;
  }

  await sleep(1500);

  // Step 3: In_Progress (Command sent to meter)
  await sendEvent({ transaction_id: txnId, customer_ref: meterRef, region, amount, status: 'In_Progress' });

  // Simulate getting stuck waiting for meter acknowledgment
  if (behavior === 'STUCK') {
    console.log(`   ${txnId} stalled at In_Progress (meter not responding)!`);
    return;
  }

  // Slow vs Normal completion delay
  const finalDelay = behavior === 'SLOW' ? 18000 : 1500;
  await sleep(finalDelay);

  // Step 4: Cleared (Valve unlocked)
  await sendEvent({ transaction_id: txnId, customer_ref: meterRef, region, amount, status: 'Cleared' });
  console.log(`  ${txnId} Cleared!`);
}

// Fire a new payment every 3 seconds
let counter = 1;
console.log('Starting M-Gas Dinner Rush Simulator... (Press Ctrl+C to stop)\n');

setInterval(() => {
  simulateSinglePayment(counter++);
}, 3000);