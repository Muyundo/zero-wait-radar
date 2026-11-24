let latestStuck = [];

async function refreshDashboard() {
  const res = await fetch('/status');
  const data = await res.json();
  const txns = data.transactions;

  const cleared = txns.filter(t => t.status === 'Cleared');
  const stuck = txns.filter(t => t.is_stuck === 1);
  const wakeup = txns.filter(t => t.status === 'Awaiting_Meter_Wakeup');
  const active = txns.filter(t => t.status !== 'Cleared' && t.status !== 'Awaiting_Meter_Wakeup' && t.is_stuck === 0);
  latestStuck = stuck;

  const stuckKes = stuck.reduce((sum, t) => sum + t.amount, 0);
  const nudgedCount = wakeup.filter(t => t.needs_nudge === 1).length;

  document.getElementById('clearedCount').textContent = cleared.length;
  document.getElementById('activeCount').textContent = active.length;
  document.getElementById('wakeupCount').textContent = wakeup.length;
  document.getElementById('nudgeSub').textContent = `${nudgedCount} SMS reminders sent`;
  document.getElementById('stuckCount').textContent = stuck.length;
  document.getElementById('stuckValue').textContent = `KES ${stuckKes.toLocaleString()} in limbo`;

  const banner = document.getElementById('alertBanner');
  if (data.incident_alert) {
    banner.style.display = 'block';
    banner.textContent = data.incident_alert;
  } else {
    banner.style.display = 'none';
  }

  // Priority order: System Stuck -> Awaiting Long-Press -> In Flight -> Cleared
  const sorted = [...stuck, ...wakeup, ...active, ...cleared];
  const tbody = document.getElementById('txnTable');
  tbody.innerHTML = sorted.map(t => {
    const waitSec = Math.floor(((t.status === 'Cleared' ? t.updated_at : Date.now()) - t.created_at) / 1000);

    let badgeClass = 'badge-active';
    let stateLabel = t.status;
    let actionBtn = '—';

    if (t.is_stuck === 1) {
      badgeClass = 'badge-stuck';
      stateLabel = `STUCK (${t.status})`;
      actionBtn = `<button class="btn btn-retry" onclick="clearTxn('${t.transaction_id}')">Retry Sync</button>`;
    } else if (t.status === 'Awaiting_Meter_Wakeup') {
      badgeClass = 'badge-wakeup';
      stateLabel = t.needs_nudge ? 'Awaiting Press (SMS Sent)' : 'Awaiting Long-Press';
      actionBtn = `<button class="btn btn-press" onclick="simulateLongPress('${t.transaction_id}')">Simulate Long-Press</button>`;
    } else if (t.status === 'Cleared') {
      badgeClass = 'badge-cleared';
    }

    return `
      <tr>
        <td><strong>${t.transaction_id}</strong></td>
        <td>${t.customer_ref}</td>
        <td>${t.region}</td>
        <td><span class="fw-tag">${t.firmware_version}</span></td>
        <td>KES ${t.amount}</td>
        <td><span class="badge ${badgeClass}">${stateLabel}</span></td>
        <td>${waitSec}s</td>
        <td>${actionBtn}</td>
      </tr>
    `;
  }).join('');
}

async function clearTxn(transaction_id) {
  await fetch('/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction_id, status: 'Cleared' })
  });
  refreshDashboard();
}

async function simulateLongPress(transaction_id) {
  // Customer presses meter -> moves to In_Progress -> clears 1.5s later
  await fetch('/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction_id, status: 'In_Progress' })
  });
  refreshDashboard();
  setTimeout(() => clearTxn(transaction_id), 1500);
}

function exportStuckCSV() {
  if (latestStuck.length === 0) return alert('No system failures right now!');
  const rows = ['TransactionID,MeterRef,Region,Firmware,Amount,Stage', ...latestStuck.map(t => `${t.transaction_id},${t.customer_ref},${t.region},${t.firmware_version},${t.amount},${t.status}`)];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `system_failures_${Date.now()}.csv`;
  a.click();
}

refreshDashboard();
setInterval(refreshDashboard, 2500);
