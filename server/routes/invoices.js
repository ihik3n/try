// Παραστατικά: ανέβασμα φωτογραφιών/PDF, ανάγνωση με AI, έλεγχος, επιβεβαίωση.

import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { nowIso } from '../db.js';
import { getInvoice, getInvoiceRaw, saveDraft, confirmInvoice, reopenInvoice, deleteInvoice, replaceLines } from '../services/invoices.js';
import { loadMaterials } from '../services/catalog.js';
import { extractionToDraft } from '../services/ai.js';
import { applyLocalMatches, applyAiMatches } from '../services/matching.js';
import { normalize, similarity } from '../../shared/text.js';
import { HttpError, idParam, int } from './util.js';

const ALLOWED = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' };

function guessSupplier(db, header) {
  if (header.supplier_vat) {
    const s = db.prepare('SELECT id FROM suppliers WHERE vat_number = ?').get(header.supplier_vat);
    if (s) return s.id;
  }
  if (header.supplier_name) {
    let best = null;
    for (const s of db.prepare('SELECT id, name FROM suppliers').all()) {
      const sc = normalize(s.name) === normalize(header.supplier_name) ? 1 : similarity(s.name, header.supplier_name);
      if (sc >= 0.8 && (!best || sc > best.sc)) best = { id: s.id, sc };
    }
    if (best) return best.id;
  }
  return null;
}

export function invoiceRoutes({ db, config, ai, log = console }) {
  const r = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 30 } });
  const running = new Set();

  function storeFiles(invoiceId, files) {
    const existing = db.prepare('SELECT COALESCE(MAX(position), -1) m FROM invoice_files WHERE invoice_id = ?').get(invoiceId).m;
    const ins = db.prepare('INSERT INTO invoice_files (invoice_id, original_name, stored_name, mime, size, sha256, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    files.forEach((f, i) => {
      const ext = ALLOWED[f.mimetype];
      const stored = `inv${invoiceId}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
      fs.writeFileSync(path.join(config.uploadsDir, stored), f.buffer);
      const sha = crypto.createHash('sha256').update(f.buffer).digest('hex');
      ins.run(invoiceId, Buffer.from(f.originalname || '', 'latin1').toString('utf8') || stored, stored, f.mimetype, f.size, sha, existing + 1 + i, nowIso());
    });
  }

  function checkFiles(files) {
    for (const f of files) {
      if (!ALLOWED[f.mimetype]) {
        throw new HttpError(415, `Μη υποστηριζόμενο αρχείο (${f.originalname}). Δεκτά: φωτογραφίες JPG/PNG/WEBP και PDF.`);
      }
    }
  }

  async function runExtraction(id, { replace }) {
    if (running.has(id)) return;
    running.add(id);
    try {
      const files = db.prepare('SELECT * FROM invoice_files WHERE invoice_id = ? ORDER BY position, id').all(id);
      const payload = files.map((f) => ({ mime: f.mime, name: f.original_name, buffer: fs.readFileSync(path.join(config.uploadsDir, f.stored_name)) }));
      const total = payload.reduce((s, f) => s + f.buffer.length, 0);
      if (total > 23 * 1024 * 1024) throw new Error('Τα αρχεία είναι πολύ μεγάλα για μία ανάγνωση (όριο ~23 MB). Χωρίστε το παραστατικό σε μικρότερα αρχεία.');
      const { output, model } = await ai.extractInvoice(payload);
      const draft = extractionToDraft(output);
      const warnings = [...draft.warnings];
      if (!draft.readable) warnings.unshift('Το έγγραφο δεν αναγνωρίστηκε ως παραστατικό ή δεν διαβάζεται. Συμπληρώστε τα στοιχεία χειροκίνητα.');
      const supplierId = guessSupplier(db, draft.header);
      const materials = loadMaterials(db).filter((m) => !m.archived);
      let { lines, pending } = applyLocalMatches(db, supplierId, draft.lines, materials);
      if (pending.length && materials.length) {
        try {
          const m = await ai.suggestMatches(
            pending.map((i) => ({ index: i, ...lines[i] })),
            materials,
          );
          lines = applyAiMatches(lines, m.output.matches, materials);
        } catch (err) {
          warnings.push('Δεν ήταν δυνατές οι προτάσεις αντιστοίχισης από AI· επιλέξτε τα υλικά χειροκίνητα.');
          log.error?.('AI match error', err.message);
        }
      }
      db.transaction(() => {
        const cur = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
        if (!cur || cur.status !== 'draft') return;
        const h = draft.header;
        const set = {};
        for (const k of ['supplier_name', 'supplier_vat', 'number', 'doc_date', 'doc_type', 'net_total', 'vat_total', 'gross_total', 'extra_discount']) {
          if (replace || cur[k] == null || cur[k] === '') set[k] = h[k] ?? null;
        }
        if ((replace || !cur.supplier_id) && supplierId) set.supplier_id = supplierId;
        set.flags = JSON.stringify(h.flags);
        set.ai_status = 'done';
        set.ai_model = model;
        set.ai_result = JSON.stringify(output);
        set.ai_warnings = JSON.stringify(warnings);
        set.ai_error = null;
        set.updated_at = nowIso();
        db.prepare(`UPDATE invoices SET ${Object.keys(set).map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...set, id });
        const hasLines = db.prepare('SELECT COUNT(*) c FROM invoice_lines WHERE invoice_id = ?').get(id).c > 0;
        if (replace || !hasLines) replaceLines(db, id, lines);
      })();
    } catch (err) {
      log.error?.('AI extraction error', err.message);
      db.prepare("UPDATE invoices SET ai_status = 'error', ai_error = ?, updated_at = ? WHERE id = ?").run(err.message || 'Άγνωστο σφάλμα', nowIso(), id);
    } finally {
      running.delete(id);
    }
  }

  function startExtraction(id, replace) {
    if (!ai.enabled) throw new HttpError(400, 'Η αυτόματη ανάγνωση δεν είναι ενεργή. Ενεργοποιήστε την από Ρυθμίσεις → Αυτόματη ανάγνωση τιμολογίων, ή συμπληρώστε τα στοιχεία χειροκίνητα.');
    const files = db.prepare('SELECT COUNT(*) c FROM invoice_files WHERE invoice_id = ?').get(id).c;
    if (!files) throw new HttpError(400, 'Δεν υπάρχει αρχείο για ανάγνωση.');
    db.prepare("UPDATE invoices SET ai_status = 'running', ai_started_at = ?, ai_error = NULL WHERE id = ?").run(nowIso(), id);
    runExtraction(id, { replace }).catch(() => {});
  }

  // Ό,τι έμεινε «σε εξέλιξη» από προηγούμενη εκτέλεση του server δεν θα ολοκληρωθεί.
  db.prepare("UPDATE invoices SET ai_status = 'error', ai_error = 'Η ανάγνωση διακόπηκε (επανεκκίνηση server). Δοκιμάστε ξανά.' WHERE ai_status = 'running'").run();

  r.get('/invoices', (req, res) => {
    const rows = db
      .prepare(
        `SELECT i.id, i.status, i.supplier_id, COALESCE(s.name, i.supplier_name) AS supplier_name, i.number, i.doc_date, i.net_total, i.vat_total, i.gross_total,
           i.ai_status, i.ai_error, i.is_sample, i.created_at, i.confirmed_at,
           (SELECT COUNT(*) FROM invoice_files f WHERE f.invoice_id = i.id) AS file_count,
           (SELECT COUNT(*) FROM invoice_lines l WHERE l.invoice_id = i.id) AS line_count
         FROM invoices i LEFT JOIN suppliers s ON s.id = i.supplier_id
         ORDER BY CASE i.status WHEN 'draft' THEN 0 ELSE 1 END, COALESCE(i.doc_date, substr(i.created_at,1,10)) DESC, i.id DESC`,
      )
      .all();
    res.json(rows);
  });

  r.post('/invoices', upload.array('files'), (req, res) => {
    const files = req.files || [];
    checkFiles(files);
    const now = nowIso();
    const id = db.transaction(() => {
      const info = db.prepare("INSERT INTO invoices (status, created_at, updated_at, created_by) VALUES ('draft', ?, ?, ?)").run(now, now, req.user.id);
      storeFiles(info.lastInsertRowid, files);
      return info.lastInsertRowid;
    })();
    if (files.length && ai.enabled && req.query.extract !== '0') startExtraction(id, true);
    res.json(getInvoice(db, id));
  });

  r.get('/invoices/:id', (req, res) => {
    const inv = getInvoice(db, idParam(req));
    if (!inv) throw new HttpError(404, 'Το παραστατικό δεν βρέθηκε.');
    res.json(inv);
  });

  r.get('/invoices/:id/status', (req, res) => {
    const row = db.prepare('SELECT ai_status, ai_error, updated_at FROM invoices WHERE id = ?').get(idParam(req));
    if (!row) throw new HttpError(404, 'Το παραστατικό δεν βρέθηκε.');
    res.json(row);
  });

  r.put('/invoices/:id', (req, res) => {
    const id = idParam(req);
    saveDraft(db, id, req.body || {});
    res.json(getInvoice(db, id));
  });

  r.post('/invoices/:id/files', upload.array('files'), (req, res) => {
    const id = idParam(req);
    const inv = getInvoiceRaw(db, id);
    if (!inv) throw new HttpError(404, 'Το παραστατικό δεν βρέθηκε.');
    if (inv.status !== 'draft') throw new HttpError(409, 'Το παραστατικό είναι επιβεβαιωμένο.');
    const files = req.files || [];
    checkFiles(files);
    storeFiles(id, files);
    res.json(getInvoice(db, id));
  });

  r.delete('/invoices/:id/files/:fileId', (req, res) => {
    const id = idParam(req);
    const inv = getInvoiceRaw(db, id);
    if (!inv) throw new HttpError(404, 'Το παραστατικό δεν βρέθηκε.');
    if (inv.status !== 'draft') throw new HttpError(409, 'Το παραστατικό είναι επιβεβαιωμένο.');
    const f = db.prepare('SELECT * FROM invoice_files WHERE id = ? AND invoice_id = ?').get(int(req.params.fileId), id);
    if (!f) throw new HttpError(404, 'Το αρχείο δεν βρέθηκε.');
    db.prepare('DELETE FROM invoice_files WHERE id = ?').run(f.id);
    try {
      fs.unlinkSync(path.join(config.uploadsDir, f.stored_name));
    } catch {
      /* */
    }
    res.json(getInvoice(db, id));
  });

  r.get('/files/:fileId', (req, res) => {
    const f = db.prepare('SELECT * FROM invoice_files WHERE id = ?').get(int(req.params.fileId));
    if (!f) throw new HttpError(404, 'Το αρχείο δεν βρέθηκε.');
    const p = path.join(config.uploadsDir, f.stored_name);
    if (!fs.existsSync(p)) throw new HttpError(404, 'Το αρχείο λείπει από τον δίσκο.');
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.original_name || f.stored_name)}`);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(p).pipe(res);
  });

  r.post('/invoices/:id/extract', (req, res) => {
    const id = idParam(req);
    const inv = getInvoiceRaw(db, id);
    if (!inv) throw new HttpError(404, 'Το παραστατικό δεν βρέθηκε.');
    if (inv.status !== 'draft') throw new HttpError(409, 'Το παραστατικό είναι επιβεβαιωμένο.');
    if (running.has(id)) throw new HttpError(409, 'Η ανάγνωση βρίσκεται ήδη σε εξέλιξη.');
    startExtraction(id, req.body?.replace !== false);
    res.json(getInvoice(db, id));
  });

  // Νέες προτάσεις αντιστοίχισης για γραμμές χωρίς υλικό
  r.post('/invoices/:id/match', async (req, res) => {
    const id = idParam(req);
    const inv = getInvoiceRaw(db, id);
    if (!inv) throw new HttpError(404, 'Το παραστατικό δεν βρέθηκε.');
    if (inv.status !== 'draft') throw new HttpError(409, 'Το παραστατικό είναι επιβεβαιωμένο.');
    const materials = loadMaterials(db).filter((m) => !m.archived);
    const supplierId = inv.supplier_id ?? guessSupplier(db, inv);
    let { lines, pending } = applyLocalMatches(db, supplierId, inv.lines, materials);
    let aiUsed = false;
    if (ai.enabled && pending.length && materials.length) {
      const m = await ai.suggestMatches(
        pending.map((i) => ({ index: i, ...lines[i] })),
        materials,
      );
      lines = applyAiMatches(lines, m.output.matches, materials);
      aiUsed = true;
    }
    replaceLines(db, id, lines);
    res.json({ ...getInvoice(db, id), ai_used: aiUsed });
  });

  r.post('/invoices/:id/confirm', (req, res) => {
    const id = idParam(req);
    if (req.body && Object.keys(req.body).length) saveDraft(db, id, req.body);
    const { event } = confirmInvoice(db, id, req.user.id);
    res.json({ invoice: getInvoice(db, id), event });
  });

  r.post('/invoices/:id/reopen', (req, res) => {
    const id = idParam(req);
    const { event } = reopenInvoice(db, id, req.user.id);
    res.json({ invoice: getInvoice(db, id), event });
  });

  r.delete('/invoices/:id', (req, res) => {
    const { event } = deleteInvoice(db, config, idParam(req), req.user.id);
    res.json({ ok: true, event });
  });

  return r;
}
