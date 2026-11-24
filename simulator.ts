import { sendEvent } from './simulator/event-client.js';
import { randomItem } from './simulator/random.js';

const REGIONS = ['Embakasi', 'Kasarani', 'Kawangware', 'Zimmerman', 'Rongai'];
const AMOUNTS = [20, 30, 50, 100, 150, 250];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function simulateSinglePayment(idNum: number) {
  const txnId = `MPESA-${2000 + idNum}`;
  const meterRef = `MTR-${Math.floor(10000 + Math.random() * 90000)}`;
  const region = randomItem(REGIONS);
  const amount = randomItem(AMOUNTS);

  const roll = Math.random();
  const scenario =
    roll < 0.60 ? 'NORMAL' :
    roll < 0.80 ? 'FORGOT_PRESS' :
    'FIRMWARE_BUG';

  const firmware = scenario === 'FIRMWARE_BUG' ? 'v2.4.2-beta' : 'v2.4.1';

  console.log(`[NEW] ${txnId} | ${meterRef} | ${region} | FW:${firmware} | KES ${amount} (${scenario})`);

  // Step 1: Verified (M-Pesa received)
  await sendEvent({ transaction_id: txnId, customer_ref: meterRef, region, firmware_version: firmware, amount, status: 'Verified' });
  await sleep(1000);

  // Scenario A: Customer paid from matatu / hasn't long-pressed meter yet
  if (scenario === 'FORGOT_PRESS') {
    await sendEvent({ transaction_id: txnId, customer_ref: meterRef, region, firmware_version: firmware, amount, status: 'Awaiting_Meter_Wakeup' });
    console.log(`  ⏳ ${txnId} waiting for customer to long-press meter...`);
    return;
  }

  // Step 2: Processing
  await sendEvent({ transaction_id: txnId, customer_ref: meterRef, region, firmware_version: firmware, amount, status: 'Processing' });
  await sleep(1500);

  // Step 3: In_Progress (Meter awake & processing credit)
  await sendEvent({ transaction_id: txnId, customer_ref: meterRef, region, firmware_version: firmware, amount, status: 'In_Progress' });

  // Scenario B: Buggy beta firmware hangs during credit apply
  if (scenario === 'FIRMWARE_BUG') {
    console.log(`  🐛 ${txnId} hung on firmware ${firmware} in ${region}!`);
    return;
  }

  await sleep(1500);

  // Step 4: Cleared
  await sendEvent({ transaction_id: txnId, customer_ref: meterRef, region, firmware_version: firmware, amount, status: 'Cleared' });
  console.log(`  ✅ ${txnId} Cleared!`);
}

let counter = 1;
console.log('Starting M-Gas Simulator (with Long-Press & Firmware Rollout scenarios)...\n');

setInterval(() => {
  simulateSinglePayment(counter++);
}, 3000);