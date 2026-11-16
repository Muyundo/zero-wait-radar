# Zero-Wait Payment Radar

A small payment and meter-sync watchdog demo. The Express server records payment events in SQLite, flags transactions that remain uncleared for more than 30 seconds, and serves a dashboard for monitoring recent activity.

## Features

- Live dashboard at `http://localhost:3000` with cleared, active, and stuck transaction counts.
- Incident banner when three or more transactions are stuck.
- CSV export for currently stuck transactions.
- SQLite persistence in `radar.db`.
- Optional simulator that sends sample payment events and creates normal, slow, and stuck transactions.

## Requirements

- Node.js 22.13 or later (uses the built-in `node:sqlite` module).
- npm.

## Run locally

Install dependencies:

```sh
npm install
```

Start the server:

```sh
npx tsx server.ts
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The server listens on port `3000`.

To generate sample activity, open a second terminal in the project directory and run:

```sh
npx tsx simulator.ts
```

Stop either process with `Ctrl+C`. The simulator sends a new sample transaction every three seconds.

## API

### `POST /events`

Create a transaction or update its status. `transaction_id` and `status` are required; the other fields are optional.

```sh
curl -X POST http://localhost:3000/events \
  -H 'Content-Type: application/json' \
  -d '{
    "transaction_id": "MPESA-1001",
    "customer_ref": "MTR-12345",
    "region": "Embakasi",
    "amount": 100,
    "status": "Verified"
  }'
```

Subsequent events with the same `transaction_id` update its status. Marking a transaction `Cleared` removes its stuck flag.

### `GET /status`

Returns summary counts and up to 50 recent transactions:

```sh
curl http://localhost:3000/status
```

Transactions that have not reached `Cleared` are marked stuck after 30 seconds. The watchdog checks every five seconds.

## Notes

- This is a local demo: the simulator generates synthetic data and does not connect to a real payment provider or meter.
- The dashboard's **Retry Sync** action marks a stuck transaction as `Cleared`; it does not perform a real retry.
- The database file is created in the working directory and is excluded from Git.
- No test command is configured in `package.json` yet.
