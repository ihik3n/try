import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sessionMiddleware } from './auth.js';
import { publicRoutes, coreRoutes } from './routes/core.js';
import { materialRoutes } from './routes/materials.js';
import { invoiceRoutes } from './routes/invoices.js';
import { recipeRoutes } from './routes/recipes.js';
import { dataRoutes } from './routes/data.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp({ db, config, ai, log = console }) {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  const api = express.Router();
  api.use(express.json({ limit: '5mb' }));
  api.use(sessionMiddleware(db));
  // Προστασία από CSRF: κάθε αλλαγή πρέπει να έρχεται από την εφαρμογή (custom header).
  api.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.get('x-requested-with') !== 'app') {
      return res.status(403).json({ error: 'Μη επιτρεπτό αίτημα.' });
    }
    next();
  });
  const deps = { db, config, ai, log };
  api.use(publicRoutes(deps));
  api.use((req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Απαιτείται σύνδεση.' });
    next();
  });
  api.use(coreRoutes(deps));
  api.use(materialRoutes(deps));
  api.use(invoiceRoutes(deps));
  api.use(recipeRoutes(deps));
  api.use(dataRoutes(deps));
  api.use((req, res) => res.status(404).json({ error: 'Δεν βρέθηκε.' }));
  // eslint-disable-next-line no-unused-vars
  api.use((err, req, res, next) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `Το αρχείο ξεπερνά το όριο των ${config.maxUploadMb} MB.` });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Μη έγκυρα δεδομένα.' });
    const status = err.status || 500;
    if (status >= 500) log.error?.(err);
    res.status(status).json({ error: status >= 500 ? 'Σφάλμα διακομιστή. Δοκιμάστε ξανά.' : err.message, ...(err.extra || {}) });
  });
  app.use('/api', api);

  // Στατικά αρχεία της εφαρμογής (μετά το build)
  const dist = path.resolve(here, '../dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h', setHeaders: (res, p) => p.endsWith('index.html') && res.setHeader('Cache-Control', 'no-cache') }));
    app.get(/^(?!\/api\/).*/, (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(dist, 'index.html'));
    });
  } else {
    app.get('/', (req, res) => res.type('text').send('Η εφαρμογή δεν έχει γίνει build. Εκτελέστε: npm run build'));
  }
  return app;
}
