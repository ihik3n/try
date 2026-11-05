// Υλικά (πρώτες ύλες & συσκευασίες), τιμές, επιλογή ενεργής τιμής, αντιστοιχίσεις.

import express from 'express';
import { nowIso, todayIso } from '../db.js';
import { trackPriceChanges, cleanupPinned, loadCatalog } from '../services/catalog.js';
import { directUsage, createEngine } from '../../shared/costing.js';
import { COST_UNITS } from '../../shared/units.js';
import { HttpError, num, posNum, str, idParam, required, oneOf } from './util.js';

export function materialRoutes({ db }) {
  const r = express.Router();

  const body = (b) => ({
    name: required(str(b.name), 'Συμπληρώστε όνομα υλικού.'),
    kind: oneOf(b.kind, ['ingredient', 'packaging'], 'ingredient'),
    category: str(b.category),
    brand: str(b.brand),
    attributes: str(b.attributes),
    cost_unit: (() => {
      if (!COST_UNITS.includes(b.cost_unit)) throw new HttpError(400, 'Επιλέξτε μονάδα κοστολόγησης (kg, λίτρο ή τεμάχιο).');
      return b.cost_unit;
    })(),
    density: posNum(b.density),
    piece_weight: posNum(b.piece_weight),
    notes: str(b.notes),
    archived: b.archived ? 1 : 0,
  });

  r.post('/materials', (req, res) => {
    const m = body(req.body);
    const now = nowIso();
    const info = db
      .prepare(
        `INSERT INTO materials (name, kind, category, brand, attributes, cost_unit, density, piece_weight, notes, archived, created_at, updated_at)
         VALUES (@name, @kind, @category, @brand, @attributes, @cost_unit, @density, @piece_weight, @notes, @archived, @now, @now)`,
      )
      .run({ ...m, now });
    const id = info.lastInsertRowid;
    // Προαιρετική αρχική τιμή (χειροκίνητη)
    const p = req.body.initial_price;
    if (p && num(p.unit_net) != null) {
      trackPriceChanges(db, { reason: 'manual_price', userId: req.user.id }, () => {
        db.prepare("INSERT INTO prices (material_id, doc_date, unit_net, vat_rate, source, note, created_at, created_by) VALUES (?, ?, ?, ?, 'manual', ?, ?, ?)").run(
          id,
          str(p.doc_date) || todayIso(),
          p.unit_net,
          num(p.vat_rate),
          str(p.note),
          nowIso(),
          req.user.id,
        );
      });
    }
    res.json(db.prepare('SELECT * FROM materials WHERE id = ?').get(id));
  });

  r.put('/materials/:id', (req, res) => {
    const id = idParam(req);
    const old = db.prepare('SELECT * FROM materials WHERE id = ?').get(id);
    if (!old) throw new HttpError(404, 'Το υλικό δεν βρέθηκε.');
    const m = body(req.body);
    if (m.cost_unit !== old.cost_unit && db.prepare('SELECT 1 FROM prices WHERE material_id = ? LIMIT 1').get(id)) {
      throw new HttpError(
        409,
        'Η μονάδα κοστολόγησης δεν αλλάζει όταν υπάρχουν καταχωρισμένες τιμές (οι τιμές είναι ανά μονάδα). Επαναφέρετε τα σχετικά παραστατικά σε πρόχειρο ή δημιουργήστε νέο υλικό.',
      );
    }
    db.prepare(
      `UPDATE materials SET name=@name, kind=@kind, category=@category, brand=@brand, attributes=@attributes, cost_unit=@cost_unit,
       density=@density, piece_weight=@piece_weight, notes=@notes, archived=@archived, updated_at=@now WHERE id=@id`,
    ).run({ ...m, now: nowIso(), id });
    res.json(db.prepare('SELECT * FROM materials WHERE id = ?').get(id));
  });

  r.delete('/materials/:id', (req, res) => {
    const id = idParam(req);
    const cat = loadCatalog(db);
    const used = directUsage(cat, 'material', id);
    if (used.recipes.length || used.products.length) {
      throw new HttpError(409, `Το υλικό χρησιμοποιείται σε: ${[...used.recipes, ...used.products].map((x) => x.name).join(', ')}. Αφαιρέστε το πρώτα ή αρχειοθετήστε το.`);
    }
    if (db.prepare("SELECT 1 FROM prices WHERE material_id = ? AND source = 'invoice' LIMIT 1").get(id)) {
      throw new HttpError(409, 'Το υλικό έχει τιμές από επιβεβαιωμένα παραστατικά. Αρχειοθετήστε το αντί για διαγραφή.');
    }
    trackPriceChanges(db, { reason: 'material_deleted', userId: req.user.id }, () => {
      db.prepare('UPDATE invoice_lines SET material_id = NULL WHERE material_id = ?').run(id);
      db.prepare('DELETE FROM materials WHERE id = ?').run(id);
    });
    res.json({ ok: true });
  });

  r.get('/materials/:id/detail', (req, res) => {
    const id = idParam(req);
    const m = db.prepare('SELECT * FROM materials WHERE id = ?').get(id);
    if (!m) throw new HttpError(404, 'Το υλικό δεν βρέθηκε.');
    const prices = db
      .prepare(
        `SELECT p.*, s.name AS supplier_name, i.number AS invoice_number, i.status AS invoice_status FROM prices p
         LEFT JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN invoices i ON i.id = p.invoice_id
         WHERE p.material_id = ? ORDER BY p.doc_date DESC, p.id DESC`,
      )
      .all(id);
    const aliases = db
      .prepare('SELECT a.*, s.name AS supplier_name FROM material_aliases a LEFT JOIN suppliers s ON s.id = a.supplier_id WHERE a.material_id = ? ORDER BY a.last_used_at DESC')
      .all(id);
    const cat = loadCatalog(db);
    const direct = directUsage(cat, 'material', id);
    const e = createEngine(cat);
    const indirect = { recipes: [], products: [] };
    for (const x of cat.recipes) if (e.evalRecipe(x.id)?.materialIds.has(id)) indirect.recipes.push({ id: x.id, name: x.name });
    for (const x of cat.products) if (e.evalProduct(x.id)?.materialIds.has(id)) indirect.products.push({ id: x.id, name: x.name });
    res.json({ material: m, prices, aliases, usage: { direct, all: indirect } });
  });

  // Χειροκίνητη τιμή (π.χ. από τιμοκατάλογο ή αγορά χωρίς παραστατικό)
  r.post('/materials/:id/prices', (req, res) => {
    const id = idParam(req);
    if (!db.prepare('SELECT 1 FROM materials WHERE id = ?').get(id)) throw new HttpError(404, 'Το υλικό δεν βρέθηκε.');
    const unitNet = num(req.body.unit_net);
    if (unitNet == null || unitNet < 0) throw new HttpError(400, 'Συμπληρώστε έγκυρη τιμή χωρίς ΦΠΑ.');
    const vat = num(req.body.vat_rate);
    if (vat != null && (vat < 0 || vat > 100)) throw new HttpError(400, 'Μη έγκυρος συντελεστής ΦΠΑ.');
    const date = str(req.body.doc_date) || todayIso();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'Μη έγκυρη ημερομηνία.');
    const { event } = trackPriceChanges(db, { reason: 'manual_price', userId: req.user.id }, () => {
      db.prepare("INSERT INTO prices (material_id, doc_date, unit_net, vat_rate, supplier_id, source, note, created_at, created_by) VALUES (?, ?, ?, ?, ?, 'manual', ?, ?, ?)").run(
        id,
        date,
        unitNet,
        vat,
        Number.isInteger(req.body.supplier_id) ? req.body.supplier_id : null,
        str(req.body.note),
        nowIso(),
        req.user.id,
      );
    });
    res.json({ ok: true, event });
  });

  r.delete('/prices/:id', (req, res) => {
    const id = idParam(req);
    const p = db.prepare('SELECT * FROM prices WHERE id = ?').get(id);
    if (!p) throw new HttpError(404, 'Η τιμή δεν βρέθηκε.');
    if (p.source !== 'manual') throw new HttpError(409, 'Τιμές από παραστατικά αφαιρούνται επαναφέροντας το παραστατικό σε πρόχειρο.');
    const { event } = trackPriceChanges(db, { reason: 'manual_price_deleted', userId: req.user.id }, () => {
      db.prepare('DELETE FROM prices WHERE id = ?').run(id);
      cleanupPinned(db);
    });
    res.json({ ok: true, event });
  });

  // Επιλογή ενεργής τιμής: τελευταία (βάσει ημερομηνίας παραστατικού) ή συγκεκριμένη από το ιστορικό
  r.put('/materials/:id/price-selection', (req, res) => {
    const id = idParam(req);
    const mode = oneOf(req.body.mode, ['latest', 'pinned'], null);
    if (!mode) throw new HttpError(400, 'Μη έγκυρη επιλογή.');
    let priceId = null;
    if (mode === 'pinned') {
      priceId = Number.isInteger(req.body.price_id) ? req.body.price_id : null;
      if (!priceId || !db.prepare('SELECT 1 FROM prices WHERE id = ? AND material_id = ?').get(priceId, id)) throw new HttpError(400, 'Η τιμή δεν ανήκει στο υλικό.');
    }
    const { event } = trackPriceChanges(db, { reason: 'price_selection', userId: req.user.id }, () => {
      db.prepare('UPDATE materials SET price_mode = ?, pinned_price_id = ?, updated_at = ? WHERE id = ?').run(mode, priceId, nowIso(), id);
    });
    res.json({ ok: true, event });
  });

  r.delete('/aliases/:id', (req, res) => {
    db.prepare('DELETE FROM material_aliases WHERE id = ?').run(idParam(req));
    res.json({ ok: true });
  });

  return r;
}
