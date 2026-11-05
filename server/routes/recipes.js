// Συνταγές και τελικά προϊόντα.

import express from 'express';
import { nowIso } from '../db.js';
import { loadRecipes, loadCatalog } from '../services/catalog.js';
import { itemsCreateCycle, directUsage, OVERHEAD_BASES } from '../../shared/costing.js';
import { UNITS } from '../../shared/units.js';
import { HttpError, num, posNum, str, idParam, required, oneOf } from './util.js';

function cleanItems(items, kind) {
  if (!Array.isArray(items)) return [];
  return items
    .map((it, i) => {
      const material_id = Number.isInteger(it.material_id) ? it.material_id : null;
      const rid = kind === 'recipe' ? it.sub_recipe_id : it.recipe_id;
      const ref = Number.isInteger(rid) ? rid : null;
      if ((material_id == null) === (ref == null)) throw new HttpError(400, `Γραμμή ${i + 1}: επιλέξτε υλικό ή συνταγή.`);
      const unit = it.unit;
      if (!UNITS[unit]) throw new HttpError(400, `Γραμμή ${i + 1}: μη έγκυρη μονάδα.`);
      return { position: i, material_id, ref, qty: num(it.qty), unit, note: str(it.note) };
    });
}

function checkRefs(db, items) {
  for (const it of items) {
    if (it.material_id != null && !db.prepare('SELECT 1 FROM materials WHERE id = ?').get(it.material_id)) throw new HttpError(400, 'Υλικό που δεν υπάρχει.');
    if (it.ref != null && !db.prepare('SELECT 1 FROM recipes WHERE id = ?').get(it.ref)) throw new HttpError(400, 'Συνταγή που δεν υπάρχει.');
  }
}

export function recipeRoutes({ db }) {
  const r = express.Router();

  const recipeBody = (b) => {
    const mode = oneOf(b.yield_mode, ['actual', 'loss', 'none'], 'none');
    const out = {
      name: required(str(b.name), 'Συμπληρώστε όνομα συνταγής.'),
      category: str(b.category),
      notes: str(b.notes),
      yield_mode: mode,
      yield_qty: mode === 'actual' ? posNum(b.yield_qty) : null,
      yield_unit: mode === 'actual' ? (UNITS[b.yield_unit] ? b.yield_unit : null) : null,
      loss_pct: mode === 'loss' ? num(b.loss_pct) : null,
      measure: oneOf(b.measure, ['mass', 'volume'], 'mass'),
      density: posNum(b.density),
      piece_weight: posNum(b.piece_weight),
      labor_minutes: posNum(b.labor_minutes),
      labor_rate: num(b.labor_rate),
      overhead_fixed: posNum(b.overhead_fixed),
      overhead_pct: posNum(b.overhead_pct),
      overhead_base: OVERHEAD_BASES[b.overhead_base] ? b.overhead_base : 'materials',
      archived: b.archived ? 1 : 0,
    };
    if (mode === 'actual' && (!out.yield_qty || !out.yield_unit)) throw new HttpError(400, 'Δηλώστε τελική απόδοση (ποσότητα και μονάδα).');
    if (mode === 'loss' && !(out.loss_pct >= 0 && out.loss_pct < 100)) throw new HttpError(400, 'Η φύρα πρέπει να είναι από 0 έως κάτω από 100%.');
    return out;
  };

  const saveRecipeItems = (id, items) => {
    db.prepare('DELETE FROM recipe_items WHERE recipe_id = ?').run(id);
    const ins = db.prepare('INSERT INTO recipe_items (recipe_id, position, material_id, sub_recipe_id, qty, unit, note) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const it of items) ins.run(id, it.position, it.material_id, it.ref, it.qty, it.unit, it.note);
  };

  const assertNoCycle = (id, items) => {
    const recipes = loadRecipes(db);
    const asSub = items.map((it) => ({ sub_recipe_id: it.ref, material_id: it.material_id }));
    if (items.some((it) => it.ref != null && it.ref === id) || itemsCreateCycle(recipes, id, asSub)) {
      throw new HttpError(400, 'Η επιμέρους συνταγή δημιουργεί κυκλική σύνδεση (η συνταγή θα περιείχε τον εαυτό της).');
    }
  };

  r.post('/recipes', (req, res) => {
    const b = recipeBody(req.body);
    const items = cleanItems(req.body.items, 'recipe');
    checkRefs(db, items);
    const now = nowIso();
    const id = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO recipes (name, category, notes, yield_mode, yield_qty, yield_unit, loss_pct, measure, density, piece_weight, labor_minutes, labor_rate, overhead_fixed, overhead_pct, overhead_base, archived, created_at, updated_at)
           VALUES (@name, @category, @notes, @yield_mode, @yield_qty, @yield_unit, @loss_pct, @measure, @density, @piece_weight, @labor_minutes, @labor_rate, @overhead_fixed, @overhead_pct, @overhead_base, @archived, @now, @now)`,
        )
        .run({ ...b, now });
      saveRecipeItems(info.lastInsertRowid, items);
      return info.lastInsertRowid;
    })();
    res.json({ id });
  });

  r.put('/recipes/:id', (req, res) => {
    const id = idParam(req);
    if (!db.prepare('SELECT 1 FROM recipes WHERE id = ?').get(id)) throw new HttpError(404, 'Η συνταγή δεν βρέθηκε.');
    const b = recipeBody(req.body);
    const items = cleanItems(req.body.items, 'recipe');
    checkRefs(db, items);
    assertNoCycle(id, items);
    db.transaction(() => {
      db.prepare(
        `UPDATE recipes SET name=@name, category=@category, notes=@notes, yield_mode=@yield_mode, yield_qty=@yield_qty, yield_unit=@yield_unit, loss_pct=@loss_pct,
         measure=@measure, density=@density, piece_weight=@piece_weight, labor_minutes=@labor_minutes, labor_rate=@labor_rate, overhead_fixed=@overhead_fixed,
         overhead_pct=@overhead_pct, overhead_base=@overhead_base, archived=@archived, updated_at=@now WHERE id=@id`,
      ).run({ ...b, now: nowIso(), id });
      saveRecipeItems(id, items);
    })();
    res.json({ id });
  });

  r.delete('/recipes/:id', (req, res) => {
    const id = idParam(req);
    const used = directUsage(loadCatalog(db), 'recipe', id);
    if (used.recipes.length || used.products.length) {
      throw new HttpError(409, `Η συνταγή χρησιμοποιείται σε: ${[...used.recipes, ...used.products].map((x) => x.name).join(', ')}.`);
    }
    db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  r.post('/recipes/:id/duplicate', (req, res) => {
    const id = idParam(req);
    const src = db.prepare('SELECT * FROM recipes WHERE id = ?').get(id);
    if (!src) throw new HttpError(404, 'Η συνταγή δεν βρέθηκε.');
    const now = nowIso();
    const newId = db.transaction(() => {
      const { id: _id, created_at, updated_at, is_sample, ...rest } = src;
      const cols = Object.keys(rest);
      const info = db
        .prepare(`INSERT INTO recipes (${cols.join(',')}, created_at, updated_at) VALUES (${cols.map((c) => '@' + c).join(',')}, @now, @now)`)
        .run({ ...rest, name: `${src.name} (αντίγραφο)`, now });
      db.prepare('INSERT INTO recipe_items (recipe_id, position, material_id, sub_recipe_id, qty, unit, note) SELECT ?, position, material_id, sub_recipe_id, qty, unit, note FROM recipe_items WHERE recipe_id = ?').run(info.lastInsertRowid, id);
      return info.lastInsertRowid;
    })();
    res.json({ id: newId });
  });

  // ---------------- Προϊόντα ----------------
  const productBody = (b) => ({
    name: required(str(b.name), 'Συμπληρώστε όνομα προϊόντος.'),
    category: str(b.category),
    notes: str(b.notes),
    batch_size: posNum(b.batch_size) || 1,
    labor_minutes: posNum(b.labor_minutes),
    labor_rate: num(b.labor_rate),
    overhead_fixed: posNum(b.overhead_fixed),
    overhead_pct: posNum(b.overhead_pct),
    overhead_base: OVERHEAD_BASES[b.overhead_base] ? b.overhead_base : 'materials',
    archived: b.archived ? 1 : 0,
  });
  const saveProductItems = (id, items) => {
    db.prepare('DELETE FROM product_items WHERE product_id = ?').run(id);
    const ins = db.prepare('INSERT INTO product_items (product_id, position, material_id, recipe_id, qty, unit, note) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const it of items) ins.run(id, it.position, it.material_id, it.ref, it.qty, it.unit, it.note);
  };

  r.post('/products', (req, res) => {
    const b = productBody(req.body);
    const items = cleanItems(req.body.items, 'product');
    checkRefs(db, items);
    const now = nowIso();
    const id = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO products (name, category, notes, batch_size, labor_minutes, labor_rate, overhead_fixed, overhead_pct, overhead_base, archived, created_at, updated_at)
           VALUES (@name, @category, @notes, @batch_size, @labor_minutes, @labor_rate, @overhead_fixed, @overhead_pct, @overhead_base, @archived, @now, @now)`,
        )
        .run({ ...b, now });
      saveProductItems(info.lastInsertRowid, items);
      return info.lastInsertRowid;
    })();
    res.json({ id });
  });

  r.put('/products/:id', (req, res) => {
    const id = idParam(req);
    if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(id)) throw new HttpError(404, 'Το προϊόν δεν βρέθηκε.');
    const b = productBody(req.body);
    const items = cleanItems(req.body.items, 'product');
    checkRefs(db, items);
    db.transaction(() => {
      db.prepare(
        `UPDATE products SET name=@name, category=@category, notes=@notes, batch_size=@batch_size, labor_minutes=@labor_minutes, labor_rate=@labor_rate,
         overhead_fixed=@overhead_fixed, overhead_pct=@overhead_pct, overhead_base=@overhead_base, archived=@archived, updated_at=@now WHERE id=@id`,
      ).run({ ...b, now: nowIso(), id });
      saveProductItems(id, items);
    })();
    res.json({ id });
  });

  r.delete('/products/:id', (req, res) => {
    db.prepare('DELETE FROM products WHERE id = ?').run(idParam(req));
    res.json({ ok: true });
  });

  r.post('/products/:id/duplicate', (req, res) => {
    const id = idParam(req);
    const src = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!src) throw new HttpError(404, 'Το προϊόν δεν βρέθηκε.');
    const now = nowIso();
    const newId = db.transaction(() => {
      const { id: _id, created_at, updated_at, is_sample, ...rest } = src;
      const cols = Object.keys(rest);
      const info = db
        .prepare(`INSERT INTO products (${cols.join(',')}, created_at, updated_at) VALUES (${cols.map((c) => '@' + c).join(',')}, @now, @now)`)
        .run({ ...rest, name: `${src.name} (αντίγραφο)`, now });
      db.prepare('INSERT INTO product_items (product_id, position, material_id, recipe_id, qty, unit, note) SELECT ?, position, material_id, recipe_id, qty, unit, note FROM product_items WHERE product_id = ?').run(info.lastInsertRowid, id);
      return info.lastInsertRowid;
    })();
    res.json({ id: newId });
  });

  return r;
}
