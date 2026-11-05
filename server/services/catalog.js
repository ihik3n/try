// Φόρτωση καταλόγου (υλικά με ενεργές τιμές, συνταγές, προϊόντα) και καταγραφή μεταβολών τιμών.

import { getSettings, nowIso } from '../db.js';
import { createEngine, effectiveUnitPrice } from '../../shared/costing.js';

const PRICE_SELECT = `
  SELECT p.*, s.name AS supplier_name, i.number AS invoice_number
  FROM prices p
  LEFT JOIN suppliers s ON s.id = p.supplier_id
  LEFT JOIN invoices i ON i.id = p.invoice_id`;

/** Τελευταία τιμή ανά υλικό βάσει ημερομηνίας παραστατικού (όχι ημερομηνίας καταχώρισης). */
export function latestPrices(db) {
  const rows = db
    .prepare(
      `${PRICE_SELECT}
       WHERE p.id IN (
         SELECT id FROM (
           SELECT id, ROW_NUMBER() OVER (PARTITION BY material_id ORDER BY doc_date DESC, id DESC) AS rn FROM prices
         ) WHERE rn = 1
       )`,
    )
    .all();
  return new Map(rows.map((r) => [r.material_id, r]));
}

export function activePriceMap(db) {
  const latest = latestPrices(db);
  const pinned = db
    .prepare(`${PRICE_SELECT} JOIN materials m ON m.pinned_price_id = p.id AND m.id = p.material_id WHERE m.price_mode = 'pinned'`)
    .all();
  const out = new Map(latest);
  for (const p of pinned) out.set(p.material_id, { ...p, pinned: 1 });
  return out;
}

function lastPacks(db) {
  const rows = db
    .prepare(
      `SELECT material_id, pack_content, pack_label FROM (
         SELECT material_id, pack_content, pack_label,
           ROW_NUMBER() OVER (PARTITION BY material_id ORDER BY doc_date DESC, id DESC) AS rn
         FROM prices WHERE pack_content IS NOT NULL AND pack_content > 0
       ) WHERE rn = 1`,
    )
    .all();
  return new Map(rows.map((r) => [r.material_id, { content: r.pack_content, label: r.pack_label }]));
}

export function priceView(p) {
  if (!p) return null;
  return {
    id: p.id,
    unit_net: p.unit_net,
    vat_rate: p.vat_rate,
    doc_date: p.doc_date,
    source: p.source,
    supplier_id: p.supplier_id,
    supplier_name: p.supplier_name || null,
    invoice_id: p.invoice_id,
    invoice_number: p.invoice_number || null,
    pinned: p.pinned ? 1 : 0,
  };
}

export function loadMaterials(db) {
  const prices = activePriceMap(db);
  const packs = lastPacks(db);
  const counts = new Map(db.prepare('SELECT material_id, COUNT(*) c FROM prices GROUP BY material_id').all().map((r) => [r.material_id, r.c]));
  return db
    .prepare('SELECT * FROM materials ORDER BY name COLLATE NOCASE')
    .all()
    .map((m) => ({
      ...m,
      price: priceView(prices.get(m.id)),
      last_pack: packs.get(m.id) || null,
      price_count: counts.get(m.id) || 0,
    }));
}

export function loadRecipes(db) {
  const items = db.prepare('SELECT * FROM recipe_items ORDER BY recipe_id, position, id').all();
  const byRecipe = new Map();
  for (const it of items) {
    if (!byRecipe.has(it.recipe_id)) byRecipe.set(it.recipe_id, []);
    byRecipe.get(it.recipe_id).push(it);
  }
  return db
    .prepare('SELECT * FROM recipes ORDER BY name COLLATE NOCASE')
    .all()
    .map((r) => ({ ...r, items: byRecipe.get(r.id) || [] }));
}

export function loadProducts(db) {
  const items = db.prepare('SELECT * FROM product_items ORDER BY product_id, position, id').all();
  const byProduct = new Map();
  for (const it of items) {
    if (!byProduct.has(it.product_id)) byProduct.set(it.product_id, []);
    byProduct.get(it.product_id).push(it);
  }
  return db
    .prepare('SELECT * FROM products ORDER BY name COLLATE NOCASE')
    .all()
    .map((p) => ({ ...p, items: byProduct.get(p.id) || [] }));
}

export function loadCatalog(db) {
  return {
    settings: getSettings(db),
    materials: loadMaterials(db),
    recipes: loadRecipes(db),
    products: loadProducts(db),
    suppliers: db.prepare('SELECT * FROM suppliers ORDER BY name COLLATE NOCASE').all(),
  };
}

export function engineFor(db, catalog) {
  return createEngine(catalog || loadCatalog(db));
}

const EPS = 1e-9;

/** Διαφορές τιμών και επηρεαζόμενα κοστολόγια μεταξύ δύο καταλόγων. */
export function diffCatalogs(before, after) {
  const basis = after.settings.vat_basis === 'gross' ? 'gross' : 'net';
  const bMap = new Map(before.materials.map((m) => [m.id, m]));
  const changes = [];
  for (const m of after.materials) {
    const b = bMap.get(m.id);
    const oldP = b?.price || null;
    const newP = m.price || null;
    const oldNet = oldP?.unit_net ?? null;
    const newNet = newP?.unit_net ?? null;
    const sameNet = oldNet == null ? newNet == null : newNet != null && Math.abs(oldNet - newNet) < EPS;
    const sameVat = (oldP?.vat_rate ?? null) === (newP?.vat_rate ?? null);
    if (sameNet && sameVat) continue;
    const oldEff = b ? effectiveUnitPrice(b, basis).value : null;
    const newEff = effectiveUnitPrice(m, basis).value;
    changes.push({
      material_id: m.id,
      name: m.name,
      unit: m.cost_unit,
      old_net: oldNet,
      new_net: newNet,
      old_vat: oldP?.vat_rate ?? null,
      new_vat: newP?.vat_rate ?? null,
      old_date: oldP?.doc_date ?? null,
      new_date: newP?.doc_date ?? null,
      old_price: oldEff,
      new_price: newEff,
      diff: oldEff != null && newEff != null ? newEff - oldEff : null,
      pct: oldEff != null && newEff != null && oldEff !== 0 ? ((newEff - oldEff) / oldEff) * 100 : null,
    });
  }
  if (!changes.length) return { changes, impacts: [] };
  const changed = new Set(changes.map((c) => c.material_id));
  const eb = createEngine(before);
  const ea = createEngine(after);
  const impacts = [];
  const consider = (kind, list) => {
    for (const node of list) {
      const ra = kind === 'recipe' ? ea.evalRecipe(node.id) : ea.evalProduct(node.id);
      const rb = kind === 'recipe' ? eb.evalRecipe(node.id) : eb.evalProduct(node.id);
      if (!ra || ra.cycle) continue;
      const used = [...ra.materialIds].filter((id) => changed.has(id));
      if (!used.length) continue;
      const oldCost = rb?.perUnit?.total ?? null;
      const newCost = ra.perUnit?.total ?? null;
      const oldEx = rb?.perUnit ? rb.perUnit.total - rb.perUnit.labor : null;
      const newEx = ra.perUnit ? ra.perUnit.total - ra.perUnit.labor : null;
      impacts.push({
        kind,
        id: node.id,
        name: node.name,
        unit: ra.yield.outputUnit,
        old_cost: oldCost,
        new_cost: newCost,
        old_complete: !!rb?.complete,
        new_complete: ra.complete,
        diff: oldCost != null && newCost != null ? newCost - oldCost : null,
        pct: oldCost != null && newCost != null && oldCost !== 0 ? ((newCost - oldCost) / oldCost) * 100 : null,
        // Χωρίς εργασία προσωπικού
        old_cost_ex_labor: oldEx,
        new_cost_ex_labor: newEx,
        pct_ex_labor: oldEx != null && newEx != null && oldEx !== 0 ? ((newEx - oldEx) / oldEx) * 100 : null,
        materials: used,
      });
    }
  };
  consider('recipe', after.recipes);
  consider('product', after.products);
  return { changes, impacts };
}

/**
 * Εκτελεί fn μέσα σε συναλλαγή και καταγράφει τυχόν μεταβολές ενεργών τιμών (με επηρεαζόμενα κοστολόγια).
 */
export function trackPriceChanges(db, meta, fn) {
  let event = null;
  const result = db.transaction(() => {
    const before = loadCatalog(db);
    const r = fn();
    const after = loadCatalog(db);
    const diff = diffCatalogs(before, after);
    if (diff.changes.length) {
      const info = db
        .prepare('INSERT INTO price_events (created_at, reason, invoice_id, user_id, vat_basis, changes, impacts) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(nowIso(), meta.reason, meta.invoiceId ?? null, meta.userId ?? null, after.settings.vat_basis, JSON.stringify(diff.changes), JSON.stringify(diff.impacts));
      event = { id: info.lastInsertRowid, ...diff };
    }
    return r;
  })();
  return { result, event };
}

/** Αφαιρεί καρφιτσωμένες τιμές που δεν υπάρχουν πλέον (επιστροφή στην τελευταία τιμή). */
export function cleanupPinned(db) {
  db.prepare(
    `UPDATE materials SET price_mode = 'latest', pinned_price_id = NULL
     WHERE price_mode = 'pinned' AND (pinned_price_id IS NULL OR pinned_price_id NOT IN (SELECT id FROM prices WHERE material_id = materials.id))`,
  ).run();
}
