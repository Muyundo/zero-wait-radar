import express from 'express';
import { clearTransactions } from './server/database.js';
import { registerRoutes } from './server/routes.js';
import { startWatchdog } from './server/watchdog.js';

clearTransactions();

const app = express();
app.use(express.json());
app.use(express.static('public'));

registerRoutes(app);
startWatchdog();

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Zero-Wait Radar running at http://localhost:${PORT}`);
});