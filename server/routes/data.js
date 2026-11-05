// Εξαγωγές Excel/CSV και αντίγραφα ασφαλείας.

import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import { loadCatalog } from '../services/catalog.js';
import { materialsTable, pricesTable, recipeTables, productTables, planTables, toXlsx, toCsv } from '../services/exports.js';
import { buildBackup, backupFileName, listBackups, writeBackup, safeBackupPath, restoreBackup } from '../services/backup.js';
import { HttpError } from './util.js';

function send(res, buf, filename, type) {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buf);
}

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const stamp = () => new Date().toISOString().slice(0, 10);

export function dataRoutes({ db, config }) {
  const r = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2048 * 1024 * 1024, files: 1 } });

  const datasets = (name) => {
    const c = loadCatalog(db);
    const [recipes, recipeItems] = recipeTables(c);
    const [products, productItems] = productTables(c);
    const map = {
      materials: [materialsTable(c)],
      prices: [pricesTable(db)],
      recipes: [recipes, recipeItems],
      'recipe-items': [recipeItems],
      products: [products, productItems],
      'product-items': [productItems],
      all: [materialsTable(c), pricesTable(db), recipes, recipeItems, products, productItems],
    };
    if (!map[name]) throw new HttpError(404, 'Άγνωστο σύνολο δεδομένων.');
    return { tables: map[name], basis: c.settings.vat_basis };
  };

  const FILE_LABEL = { materials: 'ylika', prices: 'istoriko-timon', recipes: 'syntages', 'recipe-items': 'ylika-syntagon', products: 'kostologia-proionton', 'product-items': 'analysi-proionton', all: 'kostologisi-ola' };

  r.get('/export/:name.:fmt', async (req, res) => {
    const { name, fmt } = req.params;
    const { tables, basis } = datasets(name);
    const note = `Βάση κοστολόγησης: ${basis === 'gross' ? 'με ΦΠΑ' : 'χωρίς ΦΠΑ'} · Εξαγωγή ${new Date().toLocaleString('el-GR')}`;
    const base = `${FILE_LABEL[name]}-${stamp()}`;
    if (fmt === 'xlsx') return send(res, await toXlsx(tables, { note }), `${base}.xlsx`, XLSX);
    if (fmt === 'csv') return send(res, toCsv(tables[0]), `${base}.csv`, 'text/csv; charset=utf-8');
    throw new HttpError(400, 'Μη υποστηριζόμενη μορφή.');
  });

  r.post('/export/plan.:fmt', async (req, res) => {
    const entries = Array.isArray(req.body.entries) ? req.body.entries : [];
    const title = String(req.body.name || 'Παραγωγή');
    const { tables, plan } = planTables(loadCatalog(db), entries, title);
    const base = `paragogi-${stamp()}`;
    const note = `${title} · Βάση κοστολόγησης: ${plan.basis === 'gross' ? 'με ΦΠΑ' : 'χωρίς ΦΠΑ'}`;
    if (req.params.fmt === 'xlsx') return send(res, await toXlsx(tables, { note }), `${base}.xlsx`, XLSX);
    if (req.params.fmt === 'csv') {
      const sheet = tables.find((t) => t.name === (req.query.sheet || 'Πρώτες ύλες')) || tables[3];
      return send(res, toCsv(sheet), `${base}.csv`, 'text/csv; charset=utf-8');
    }
    throw new HttpError(400, 'Μη υποστηριζόμενη μορφή.');
  });

  // ---- Αντίγραφα ασφαλείας ----
  r.get('/backup/download', (req, res) => {
    send(res, buildBackup(db, config), backupFileName('pliris-antigrafo'), 'application/zip');
  });

  r.get('/backups', (req, res) => {
    res.json({ backups: listBackups(config), keep: config.backupKeep, intervalHours: config.backupIntervalHours });
  });

  r.post('/backups', (req, res) => {
    res.json(writeBackup(db, config, 'manual'));
  });

  r.get('/backups/:name', (req, res) => {
    const p = safeBackupPath(config, req.params.name);
    if (!p) throw new HttpError(404, 'Το αντίγραφο δεν βρέθηκε.');
    send(res, fs.readFileSync(p), req.params.name, 'application/zip');
  });

  r.post('/backups/:name/restore', (req, res) => {
    const p = safeBackupPath(config, req.params.name);
    if (!p) throw new HttpError(404, 'Το αντίγραφο δεν βρέθηκε.');
    res.json(restoreBackup(db, config, fs.readFileSync(p)));
  });

  r.post('/backup/restore', upload.single('file'), (req, res) => {
    if (!req.file) throw new HttpError(400, 'Επιλέξτε αρχείο αντιγράφου (.zip).');
    try {
      res.json(restoreBackup(db, config, req.file.buffer));
    } catch (err) {
      throw new HttpError(400, err.message);
    }
  });

  return r;
}
