import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { createAi } from './services/ai.js';
import { startAutoBackups } from './services/backup.js';
import { maybeSeed } from './services/sample.js';

const config = loadConfig();
const db = openDb(config.dbPath);
if (maybeSeed(db, config)) console.info('Φορτώθηκαν παραδειγματικά δεδομένα (με σήμανση «ΠΑΡΑΔΕΙΓΜΑ»).');
const ai = createAi(config);
const app = createApp({ db, config, ai });
startAutoBackups(db, config);

const server = app.listen(config.port, config.host, () => {
  console.info(`Η εφαρμογή τρέχει στο http://localhost:${config.port}  (δεδομένα: ${config.dataDir})`);
  console.info(ai.enabled ? `Αυτόματη ανάγνωση παραστατικών: ενεργή (${ai.model})` : 'Αυτόματη ανάγνωση παραστατικών: ανενεργή (ορίστε ANTHROPIC_API_KEY)');
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
