// Σύνδεση, ρυθμίσεις, χρήστες, προμηθευτές, κατάλογος, ιστορικό τιμών, στιγμιότυπα, πλάνα παραγωγής, παραδείγματα.

import express from 'express';
import { nowIso, getSettings, setSettings } from '../db.js';
import { hashPassword, verifyPassword, createSession, setSessionCookie, clearSessionCookie, destroySession, loginAllowed, loginFailed, loginSucceeded } from '../auth.js';
import { loadCatalog } from '../services/catalog.js';
import { createSnapshot, compareSnapshot } from '../services/snapshots.js';
import { hasSampleData, seedSampleData, deleteSampleData } from '../services/sample.js';
import { HttpError, num, str, int, idParam, required } from './util.js';
import { lanUrls } from '../net.js';

export function publicRoutes({ db, config, ai }) {
  const r = express.Router();
  const userCount = () => db.prepare('SELECT COUNT(*) c FROM users').get().c;

  r.get('/auth/status', (req, res) => {
    res.json({ needsSetup: userCount() === 0, user: req.user || null, ai: { enabled: ai.enabled, model: ai.model } });
  });

  // Διευθύνσεις για άνοιγμα από iPhone/κινητό στο ίδιο δίκτυο (QR κωδικός στην εφαρμογή).
  r.get('/lan', (req, res) => {
    res.json({ port: config.port, urls: lanUrls(config.port) });
  });

  r.post('/auth/setup', (req, res) => {
    if (userCount() > 0) throw new HttpError(409, 'Έχει ήδη οριστεί χρήστης.');
    const username = required(str(req.body.username), 'Συμπληρώστε όνομα χρήστη.');
    const password = String(req.body.password || '');
    if (password.length < 8) throw new HttpError(400, 'Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.');
    const info = db.prepare('INSERT INTO users (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)').run(username, str(req.body.display_name) || username, hashPassword(password), nowIso());
    const s = createSession(db, info.lastInsertRowid);
    setSessionCookie(req, res, config, s.token, s.expires);
    res.json({ ok: true });
  });

  r.post('/auth/login', (req, res) => {
    const ip = req.ip;
    if (!loginAllowed(ip)) throw new HttpError(429, 'Πολλές αποτυχημένες προσπάθειες. Δοκιμάστε ξανά σε 15 λεπτά.');
    const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(req.body.username || '').trim());
    if (!u || !verifyPassword(String(req.body.password || ''), u.password_hash)) {
      loginFailed(ip);
      throw new HttpError(401, 'Λάθος όνομα χρήστη ή κωδικός.');
    }
    loginSucceeded(ip);
    const s = createSession(db, u.id);
    setSessionCookie(req, res, config, s.token, s.expires);
    res.json({ ok: true });
  });

  r.post('/auth/logout', (req, res) => {
    destroySession(db, req);
    clearSessionCookie(res);
    res.json({ ok: true });
  });
  return r;
}

export function coreRoutes({ db, ai }) {
  const r = express.Router();

  r.get('/catalog', (req, res) => {
    const c = loadCatalog(db);
    const cats = new Set();
    for (const m of c.materials) if (m.category) cats.add(m.category);
    res.json({
      ...c,
      material_categories: [...cats].sort((a, b) => a.localeCompare(b, 'el')),
      recipe_categories: [...new Set(c.recipes.map((x) => x.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'el')),
      product_categories: [...new Set(c.products.map((x) => x.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'el')),
      has_sample: hasSampleData(db),
      ai: { enabled: ai.enabled, model: ai.model },
      user: req.user,
      drafts: db.prepare("SELECT COUNT(*) c FROM invoices WHERE status = 'draft'").get().c,
    });
  });

  // ---- Ρυθμίσεις ----
  r.put('/settings', (req, res) => {
    const patch = {};
    if ('business_name' in req.body) patch.business_name = str(req.body.business_name) || '';
    if ('vat_basis' in req.body) {
      if (!['net', 'gross'].includes(req.body.vat_basis)) throw new HttpError(400, 'Μη έγκυρη βάση ΦΠΑ.');
      patch.vat_basis = req.body.vat_basis;
    }
    if ('labor_rate' in req.body) {
      const v = num(req.body.labor_rate);
      if (v != null && v < 0) throw new HttpError(400, 'Μη έγκυρο ωριαίο κόστος.');
      patch.labor_rate = v;
    }
    setSettings(db, patch);
    res.json(getSettings(db));
  });

  // ---- Χρήστες ----
  r.get('/users', (req, res) => {
    res.json(db.prepare('SELECT id, username, display_name, created_at FROM users ORDER BY id').all());
  });
  r.post('/users', (req, res) => {
    const username = required(str(req.body.username), 'Συμπληρώστε όνομα χρήστη.');
    const password = String(req.body.password || '');
    if (password.length < 8) throw new HttpError(400, 'Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.');
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new HttpError(409, 'Υπάρχει ήδη χρήστης με αυτό το όνομα.');
    db.prepare('INSERT INTO users (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)').run(username, str(req.body.display_name) || username, hashPassword(password), nowIso());
    res.json({ ok: true });
  });
  r.put('/users/:id/password', (req, res) => {
    const id = idParam(req);
    const password = String(req.body.password || '');
    if (password.length < 8) throw new HttpError(400, 'Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.');
    const info = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
    if (!info.changes) throw new HttpError(404, 'Ο χρήστης δεν βρέθηκε.');
    if (id !== req.user.id) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    res.json({ ok: true });
  });
  r.delete('/users/:id', (req, res) => {
    const id = idParam(req);
    if (id === req.user.id) throw new HttpError(400, 'Δεν μπορείτε να διαγράψετε τον εαυτό σας.');
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  // ---- Προμηθευτές ----
  const supplierBody = (b) => ({ name: required(str(b.name), 'Συμπληρώστε όνομα προμηθευτή.'), vat_number: b.vat_number ? String(b.vat_number).replace(/\D/g, '') || null : null, phone: str(b.phone), notes: str(b.notes) });
  r.post('/suppliers', (req, res) => {
    const b = supplierBody(req.body);
    const now = nowIso();
    const info = db.prepare('INSERT INTO suppliers (name, vat_number, phone, notes, created_at, updated_at) VALUES (@name, @vat_number, @phone, @notes, @now, @now)').run({ ...b, now });
    res.json(db.prepare('SELECT * FROM suppliers WHERE id = ?').get(info.lastInsertRowid));
  });
  r.put('/suppliers/:id', (req, res) => {
    const id = idParam(req);
    const b = supplierBody(req.body);
    db.prepare('UPDATE suppliers SET name = @name, vat_number = @vat_number, phone = @phone, notes = @notes, updated_at = @now WHERE id = @id').run({ ...b, now: nowIso(), id });
    res.json(db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id));
  });
  r.delete('/suppliers/:id', (req, res) => {
    const id = idParam(req);
    if (db.prepare("SELECT 1 FROM invoices WHERE supplier_id = ? AND status = 'confirmed' LIMIT 1").get(id)) {
      throw new HttpError(409, 'Ο προμηθευτής έχει επιβεβαιωμένα παραστατικά και δεν μπορεί να διαγραφεί.');
    }
    db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  // ---- Ιστορικό μεταβολών τιμών ----
  r.get('/price-events', (req, res) => {
    const limit = Math.min(500, int(req.query.limit) || 100);
    const rows = db
      .prepare(
        `SELECT e.*, i.number AS invoice_number, i.supplier_name, u.display_name AS user_name FROM price_events e
         LEFT JOIN invoices i ON i.id = e.invoice_id LEFT JOIN users u ON u.id = e.user_id ORDER BY e.id DESC LIMIT ?`,
      )
      .all(limit);
    res.json(rows.map((e) => ({ ...e, changes: JSON.parse(e.changes), impacts: JSON.parse(e.impacts) })));
  });

  // ---- Στιγμιότυπα ----
  r.get('/snapshots', (req, res) => {
    res.json(db.prepare('SELECT id, name, note, created_at, vat_basis, is_sample FROM snapshots ORDER BY id DESC').all());
  });
  r.post('/snapshots', (req, res) => {
    const name = str(req.body.name) || `Κοστολόγιο ${new Date().toLocaleDateString('el-GR')}`;
    const id = createSnapshot(db, { name, note: str(req.body.note), userId: req.user.id });
    res.json({ id });
  });
  r.get('/snapshots/:id', (req, res) => {
    const snap = db.prepare('SELECT * FROM snapshots WHERE id = ?').get(idParam(req));
    if (!snap) throw new HttpError(404, 'Το στιγμιότυπο δεν βρέθηκε.');
    res.json(compareSnapshot(db, snap));
  });
  r.delete('/snapshots/:id', (req, res) => {
    db.prepare('DELETE FROM snapshots WHERE id = ?').run(idParam(req));
    res.json({ ok: true });
  });

  // ---- Πλάνα παραγωγής ----
  const cleanEntries = (list) =>
    (Array.isArray(list) ? list : [])
      .map((e) => ({ kind: e.kind === 'recipe' ? 'recipe' : 'product', id: int(e.id), qty: num(e.qty), unit: e.kind === 'recipe' ? str(e.unit) : 'pc' }))
      .filter((e) => e.id != null);
  r.get('/plans', (req, res) => {
    res.json(db.prepare('SELECT * FROM production_plans ORDER BY COALESCE(plan_date, created_at) DESC, id DESC').all().map((p) => ({ ...p, entries: JSON.parse(p.entries) })));
  });
  r.post('/plans', (req, res) => {
    const now = nowIso();
    const info = db
      .prepare('INSERT INTO production_plans (name, plan_date, notes, entries, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(str(req.body.name) || 'Παραγωγή', str(req.body.plan_date), str(req.body.notes), JSON.stringify(cleanEntries(req.body.entries)), now, now);
    res.json({ id: info.lastInsertRowid });
  });
  r.put('/plans/:id', (req, res) => {
    const id = idParam(req);
    db.prepare('UPDATE production_plans SET name = ?, plan_date = ?, notes = ?, entries = ?, updated_at = ? WHERE id = ?').run(
      str(req.body.name) || 'Παραγωγή',
      str(req.body.plan_date),
      str(req.body.notes),
      JSON.stringify(cleanEntries(req.body.entries)),
      nowIso(),
      id,
    );
    res.json({ id });
  });
  r.delete('/plans/:id', (req, res) => {
    db.prepare('DELETE FROM production_plans WHERE id = ?').run(idParam(req));
    res.json({ ok: true });
  });

  // ---- Παραδειγματικά δεδομένα ----
  r.post('/sample-data/delete', (req, res) => {
    res.json(deleteSampleData(db));
  });
  r.post('/sample-data/load', (req, res) => {
    if (hasSampleData(db)) throw new HttpError(409, 'Τα παραδειγματικά δεδομένα υπάρχουν ήδη.');
    seedSampleData(db);
    res.json({ ok: true });
  });
  return r;
}
