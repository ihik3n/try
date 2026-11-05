import { loadConfig } from './config.js';
import { openDb, getSecret, setSecret } from './db.js';
import { createApp } from './app.js';
import { createAiManager, AI_KEY_SECRET } from './services/ai.js';
import { startAutoBackups } from './services/backup.js';
import { maybeSeed } from './services/sample.js';
import { lanUrls } from './net.js';

const config = loadConfig();
const db = openDb(config.dbPath);
if (maybeSeed(db, config)) console.info('Φορτώθηκαν παραδειγματικά δεδομένα (με σήμανση «ΠΑΡΑΔΕΙΓΜΑ»).');
const ai = createAiManager(config, { getKey: () => getSecret(db, AI_KEY_SECRET), setKey: (k) => setSecret(db, AI_KEY_SECRET, k) });
const app = createApp({ db, config, ai });
startAutoBackups(db, config);

const server = app.listen(config.port, config.host, () => {
  console.info(`Η εφαρμογή τρέχει στο http://localhost:${config.port}  (δεδομένα: ${config.dataDir})`);
  const lan = lanUrls(config.port);
  if (lan.length) console.info(`Από iPhone/κινητό στο ίδιο Wi‑Fi: ${lan.map((l) => l.url).join('  ή  ')}`);
  console.info(ai.enabled ? `Αυτόματη ανάγνωση παραστατικών: ενεργή (${ai.model})` : 'Αυτόματη ανάγνωση παραστατικών: ανενεργή (Ρυθμίσεις → Αυτόματη ανάγνωση)');
});
server.requestTimeout = 10 * 60 * 1000;

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
