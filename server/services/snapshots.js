// Στιγμιότυπα κοστολογίων: αποθηκεύουν τις τότε ποσότητες, τιμές και αποδόσεις (αμετάβλητα).

import { nowIso } from '../db.js';
import { loadCatalog } from './catalog.js';
import { createEngine, effectiveUnitPrice } from '../../shared/costing.js';

function itemData(r) {
  return {
    kind: r.kind,
    id: r.id,
    name: r.name,
    unit: r.yield.outputUnit,
    yield: { mode: r.yield.mode, base: r.yield.base, baseUnit: r.yield.baseUnit, lossPct: r.yield.lossPct },
    input_mass_g: r.input.mass_g,
    perUnit: r.perUnit,
    batch: r.batch,
    complete: r.complete,
    issues: r.issues.map((i) => i.msg),
    laborIncluded: r.laborIncluded,
    overheadIncluded: r.overheadIncluded,
    lines: r.lines.map((l) => ({ type: l.type, ref_id: l.ref_id, name: l.name, kind: l.kind, qty: l.qty, unit: l.unit, costUnit: l.costUnit, unitPrice: l.unitPrice, cost: l.cost })),
  };
}

export function buildSnapshotData(catalog) {
  const e = createEngine(catalog);
  const basis = e.basis;
  return {
    vat_basis: basis,
    materials: catalog.materials.map((m) => ({
      id: m.id,
      name: m.name,
      unit: m.cost_unit,
      kind: m.kind,
      price_net: m.price?.unit_net ?? null,
      vat_rate: m.price?.vat_rate ?? null,
      price: effectiveUnitPrice(m, basis).value,
      doc_date: m.price?.doc_date ?? null,
    })),
    items: [...catalog.recipes.map((r) => itemData(e.evalRecipe(r.id))), ...catalog.products.map((p) => itemData(e.evalProduct(p.id)))],
  };
}

export function createSnapshot(db, { name, note, userId, isSample = 0 }) {
  const catalog = loadCatalog(db);
  const data = buildSnapshotData(catalog);
  const info = db
    .prepare('INSERT INTO snapshots (name, note, created_at, user_id, vat_basis, data, is_sample) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(name, note || null, nowIso(), userId ?? null, data.vat_basis, JSON.stringify(data), isSample ? 1 : 0);
  return info.lastInsertRowid;
}

/** Σύγκριση στιγμιότυπου με το σημερινό κόστος. */
export function compareSnapshot(db, snap) {
  const data = JSON.parse(snap.data);
  const current = buildSnapshotData(loadCatalog(db));
  const curMap = new Map(current.items.map((i) => [`${i.kind}:${i.id}`, i]));
  const items = data.items.map((old) => {
    const cur = curMap.get(`${old.kind}:${old.id}`) || null;
    const o = old.perUnit?.total ?? null;
    const n = cur?.perUnit?.total ?? null;
    const curLines = new Map((cur?.lines || []).map((l) => [`${l.type}:${l.ref_id}`, l]));
    const lines = old.lines.map((l) => {
      const c = curLines.get(`${l.type}:${l.ref_id}`);
      curLines.delete(`${l.type}:${l.ref_id}`);
      return { name: l.name, type: l.type, old: l, current: c || null };
    });
    for (const c of curLines.values()) lines.push({ name: c.name, type: c.type, old: null, current: c });
    return {
      kind: old.kind,
      id: old.id,
      name: old.name,
      current_name: cur?.name ?? null,
      unit: old.unit,
      old_cost: o,
      new_cost: n,
      diff: o != null && n != null ? n - o : null,
      pct: o != null && n != null && o !== 0 ? ((n - o) / o) * 100 : null,
      old_complete: old.complete,
      new_complete: cur?.complete ?? false,
      exists: !!cur,
      old_yield: old.yield,
      new_yield: cur?.yield ?? null,
      old_perUnit: old.perUnit,
      new_perUnit: cur?.perUnit ?? null,
      lines,
    };
  });
  const curMats = new Map(current.materials.map((m) => [m.id, m]));
  const materials = data.materials
    .map((m) => {
      const c = curMats.get(m.id);
      return {
        id: m.id,
        name: m.name,
        unit: m.unit,
        old_price: m.price,
        new_price: c?.price ?? null,
        old_date: m.doc_date,
        new_date: c?.doc_date ?? null,
        diff: m.price != null && c?.price != null ? c.price - m.price : null,
        pct: m.price != null && c?.price != null && m.price !== 0 ? ((c.price - m.price) / m.price) * 100 : null,
      };
    })
    .filter((m) => m.old_price !== m.new_price);
  return { snapshot: { id: snap.id, name: snap.name, note: snap.note, created_at: snap.created_at, vat_basis: data.vat_basis }, current_basis: current.vat_basis, items, materials };
}
