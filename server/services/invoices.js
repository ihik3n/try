// Παραστατικά αγοράς: αποθήκευση πρόχειρου, έλεγχος διπλοεγγραφών, επιβεβαίωση/επαναφορά σε πρόχειρο.

import fs from 'node:fs';
import path from 'node:path';
import { nowIso } from '../db.js';
import { computeInvoice, priceRecordsFromInvoice, contentPerInvoiceUnit, QTY_UNITS, PACK_UNITS } from '../../shared/invoice.js';
import { convert } from '../../shared/units.js';
import { normalize, normalizeDescription } from '../../shared/text.js';
import { formatNumber } from '../../shared/numbers.js';
import { loadMaterials, trackPriceChanges, cleanupPinned } from './catalog.js';

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (v == null ? null : String(v).trim() || null);
const parseJson = (s, d) => {
  try {
    return s ? JSON.parse(s) : d;
  } catch {
    return d;
  }
};

function lineFromDb(l) {
  return { ...l, flags: parseJson(l.flags, []) };
}

export function getInvoiceRaw(db, id) {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (!inv) return null;
  return {
    ...inv,
    flags: parseJson(inv.flags, []),
    ai_warnings: parseJson(inv.ai_warnings, []),
    ai_result: undefined,
    lines: db.prepare('SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY position, id').all(id).map(lineFromDb),
    files: db.prepare('SELECT id, original_name, mime, size, sha256, position, created_at FROM invoice_files WHERE invoice_id = ? ORDER BY position, id').all(id),
  };
}

export function findDuplicates(db, inv) {
  const out = [];
  const seen = new Set();
  const add = (row, reason) => {
    if (row.id === inv.id || seen.has(`${row.id}:${reason}`)) return;
    seen.add(`${row.id}:${reason}`);
    out.push({ id: row.id, number: row.number, doc_date: row.doc_date, status: row.status, supplier_name: row.supplier_name, reason });
  };
  const numNorm = inv.number ? String(inv.number).replace(/\s+/g, '').replace(/^0+/, '').toUpperCase() : '';
  if (numNorm) {
    const rows = db.prepare('SELECT id, number, doc_date, status, supplier_name, supplier_id, supplier_vat FROM invoices WHERE id != ? AND number IS NOT NULL').all(inv.id ?? -1);
    for (const r of rows) {
      const rn = String(r.number).replace(/\s+/g, '').replace(/^0+/, '').toUpperCase();
      if (rn !== numNorm) continue;
      const sameSupplier =
        (inv.supplier_id && r.supplier_id === inv.supplier_id) ||
        (inv.supplier_vat && r.supplier_vat && inv.supplier_vat === r.supplier_vat) ||
        (inv.supplier_name && r.supplier_name && normalize(inv.supplier_name) === normalize(r.supplier_name));
      if (sameSupplier) add(r, 'Ίδιος προμηθευτής και αριθμός παραστατικού');
    }
  }
  if (inv.doc_date && inv.gross_total != null) {
    const rows = db
      .prepare('SELECT id, number, doc_date, status, supplier_name, supplier_id, gross_total FROM invoices WHERE id != ? AND doc_date = ? AND gross_total IS NOT NULL AND ABS(gross_total - ?) < 0.01')
      .all(inv.id ?? -1, inv.doc_date, inv.gross_total);
    for (const r of rows) {
      if ((inv.supplier_id && r.supplier_id === inv.supplier_id) || (inv.supplier_name && normalize(inv.supplier_name) === normalize(r.supplier_name || ''))) {
        add(r, 'Ίδιος προμηθευτής, ημερομηνία και σύνολο');
      }
    }
  }
  const hashes = (inv.files || []).map((f) => f.sha256).filter(Boolean);
  if (hashes.length) {
    const rows = db
      .prepare(`SELECT DISTINCT i.id, i.number, i.doc_date, i.status, i.supplier_name FROM invoice_files f JOIN invoices i ON i.id = f.invoice_id WHERE f.sha256 IN (${hashes.map(() => '?').join(',')}) AND i.id != ?`)
      .all(...hashes, inv.id ?? -1);
    for (const r of rows) add(r, 'Το ίδιο αρχείο έχει ήδη ανέβει');
  }
  return out;
}

/** Τιμολόγιο με υπολογισμούς, ελέγχους και πιθανά διπλά. */
export function getInvoice(db, id, materials) {
  const inv = getInvoiceRaw(db, id);
  if (!inv) return null;
  const mats = materials || loadMaterials(db);
  const byId = new Map(mats.map((m) => [m.id, m]));
  const current = new Map(mats.filter((m) => m.price && m.price.invoice_id !== inv.id).map((m) => [m.id, m.price.unit_net]));
  inv.computed = computeInvoice(inv, inv.lines, byId, current);
  inv.duplicates = findDuplicates(db, inv);
  if (inv.supplier_id) inv.supplier = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(inv.supplier_id) || null;
  return inv;
}

function cleanLine(l, i) {
  const qtyUnit = QTY_UNITS.includes(l.qty_unit) ? l.qty_unit : null;
  const packUnit = PACK_UNITS.includes(l.pack_unit) ? l.pack_unit : null;
  const flags = Array.isArray(l.flags) ? l.flags.filter((f) => typeof f === 'string') : [];
  return {
    position: i,
    supplier_code: str(l.supplier_code),
    description: str(l.description),
    qty: num(l.qty),
    qty_unit: qtyUnit,
    unit_raw: str(l.unit_raw),
    pack_count: num(l.pack_count),
    pack_size: num(l.pack_size),
    pack_unit: packUnit,
    unit_price: num(l.unit_price),
    discount_pct: num(l.discount_pct),
    discount_amount: num(l.discount_amount),
    net_amount: num(l.net_amount),
    vat_rate: num(l.vat_rate),
    vat_amount: num(l.vat_amount),
    material_id: Number.isInteger(l.material_id) ? l.material_id : null,
    match_source: str(l.match_source),
    match_confidence: num(l.match_confidence),
    match_note: str(l.match_note),
    excluded: l.excluded ? 1 : 0,
    flags: JSON.stringify(flags),
    ai_note: str(l.ai_note),
  };
}

export function replaceLines(db, invoiceId, lines) {
  db.prepare('DELETE FROM invoice_lines WHERE invoice_id = ?').run(invoiceId);
  const ins = db.prepare(`INSERT INTO invoice_lines (invoice_id, position, supplier_code, description, qty, qty_unit, unit_raw, pack_count, pack_size, pack_unit,
    unit_price, discount_pct, discount_amount, net_amount, vat_rate, vat_amount, material_id, match_source, match_confidence, match_note, excluded, flags, ai_note)
    VALUES (@invoice_id, @position, @supplier_code, @description, @qty, @qty_unit, @unit_raw, @pack_count, @pack_size, @pack_unit,
    @unit_price, @discount_pct, @discount_amount, @net_amount, @vat_rate, @vat_amount, @material_id, @match_source, @match_confidence, @match_note, @excluded, @flags, @ai_note)`);
  lines.forEach((l, i) => ins.run({ ...cleanLine(l, i), invoice_id: invoiceId }));
}

const HEADER_KEYS = ['supplier_id', 'supplier_name', 'supplier_vat', 'number', 'doc_date', 'doc_type', 'net_total', 'vat_total', 'gross_total', 'extra_discount', 'notes', 'dup_ack', 'flags'];

export function saveDraft(db, id, body) {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (!inv) throw new HttpError(404, 'Το παραστατικό δεν βρέθηκε.');
  if (inv.status !== 'draft') throw new HttpError(409, 'Το παραστατικό είναι επιβεβαιωμένο. Επαναφέρετέ το σε πρόχειρο για αλλαγές.');
  const patch = {};
  for (const k of HEADER_KEYS) {
    if (!(k in body)) continue;
    const v = body[k];
    if (['net_total', 'vat_total', 'gross_total', 'extra_discount'].includes(k)) patch[k] = num(v);
    else if (k === 'supplier_id') patch[k] = Number.isInteger(v) ? v : null;
    else if (k === 'dup_ack') patch[k] = v ? 1 : 0;
    else if (k === 'flags') patch[k] = JSON.stringify(Array.isArray(v) ? v.filter((f) => typeof f === 'string') : []);
    else if (k === 'supplier_vat') patch[k] = v ? String(v).replace(/\D/g, '') || null : null;
    else patch[k] = str(v);
  }
  db.transaction(() => {
    const keys = Object.keys(patch);
    if (keys.length) {
      db.prepare(`UPDATE invoices SET ${keys.map((k) => `${k} = @${k}`).join(', ')}, updated_at = @updated_at WHERE id = @id`).run({ ...patch, updated_at: nowIso(), id });
    } else db.prepare('UPDATE invoices SET updated_at = ? WHERE id = ?').run(nowIso(), id);
    if (Array.isArray(body.lines)) replaceLines(db, id, body.lines);
  })();
}

function resolveSupplier(db, inv) {
  if (inv.supplier_id) {
    const s = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(inv.supplier_id);
    if (s) return s;
  }
  if (inv.supplier_vat) {
    const s = db.prepare('SELECT * FROM suppliers WHERE vat_number = ?').get(inv.supplier_vat);
    if (s) return s;
  }
  const name = (inv.supplier_name || '').trim();
  const all = db.prepare('SELECT * FROM suppliers').all();
  const s = all.find((x) => normalize(x.name) === normalize(name));
  if (s) return s;
  const now = nowIso();
  const info = db.prepare('INSERT INTO suppliers (name, vat_number, created_at, updated_at) VALUES (?, ?, ?, ?)').run(name, inv.supplier_vat || null, now, now);
  return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(info.lastInsertRowid);
}

function packLabel(line) {
  if (line.qty_unit !== 'unit' || line.pack_size == null) return null;
  const u = { kg: 'kg', g: 'g', l: 'lt', ml: 'ml', pc: 'τεμ.' }[line.pack_unit] || '';
  const size = `${formatNumber(line.pack_size, 3)} ${u}`;
  return line.pack_count && line.pack_count !== 1 ? `${formatNumber(line.pack_count, 2)} × ${size}` : size;
}

function upsertAlias(db, supplierId, line) {
  const code = line.supplier_code ? String(line.supplier_code).trim() : null;
  const desc = normalizeDescription(line.description);
  const now = nowIso();
  let existing = null;
  if (code) existing = db.prepare('SELECT * FROM material_aliases WHERE supplier_id IS ? AND supplier_code = ?').get(supplierId, code);
  if (!existing && desc) existing = db.prepare('SELECT * FROM material_aliases WHERE supplier_id IS ? AND description_norm = ? AND (supplier_code IS NULL OR supplier_code = ?)').get(supplierId, desc, code ?? '');
  const pack = { qty_unit: line.qty_unit, pack_count: line.pack_count, pack_size: line.pack_size, pack_unit: line.pack_unit };
  if (existing) {
    db.prepare(
      `UPDATE material_aliases SET material_id = ?, description = ?, description_norm = ?, supplier_code = ?, qty_unit = ?, pack_count = ?, pack_size = ?, pack_unit = ?,
       times_used = times_used + 1, last_used_at = ? WHERE id = ?`,
    ).run(line.material_id, line.description, desc, code, pack.qty_unit, pack.pack_count, pack.pack_size, pack.pack_unit, now, existing.id);
  } else {
    db.prepare(
      `INSERT INTO material_aliases (material_id, supplier_id, supplier_code, description, description_norm, qty_unit, pack_count, pack_size, pack_unit, times_used, last_used_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(line.material_id, supplierId, code, line.description, desc, pack.qty_unit, pack.pack_count, pack.pack_size, pack.pack_unit, now, now);
  }
}

/** Επιβεβαίωση: δημιουργεί εγγραφές τιμών, θυμάται αντιστοιχίσεις, καταγράφει μεταβολές. */
export function confirmInvoice(db, id, userId) {
  const mats = loadMaterials(db);
  const inv = getInvoice(db, id, mats);
  if (!inv) throw new HttpError(404, 'Το παραστατικό δεν βρέθηκε.');
  if (inv.status !== 'draft') throw new HttpError(409, 'Το παραστατικό είναι ήδη επιβεβαιωμένο.');
  if (inv.ai_status === 'running') throw new HttpError(409, 'Η ανάγνωση βρίσκεται σε εξέλιξη.');
  if (!inv.computed.canConfirm) {
    throw new HttpError(422, 'Υπάρχουν στοιχεία προς διόρθωση πριν την επιβεβαίωση.', { computed: inv.computed });
  }
  if (inv.duplicates.length && !inv.dup_ack) {
    throw new HttpError(409, 'Πιθανό διπλό παραστατικό. Επιβεβαιώστε ότι πρόκειται για διαφορετικό παραστατικό.', { duplicates: inv.duplicates });
  }
  const byId = new Map(mats.map((m) => [m.id, m]));
  const { event } = trackPriceChanges(db, { reason: 'invoice_confirmed', invoiceId: id, userId }, () => {
    const supplier = resolveSupplier(db, inv);
    const recs = priceRecordsFromInvoice(inv.lines, inv.computed);
    const now = nowIso();
    const insPrice = db.prepare(
      `INSERT INTO prices (material_id, doc_date, unit_net, vat_rate, quantity, pack_content, pack_label, supplier_id, invoice_id, source, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'invoice', ?, ?)`,
    );
    for (const r of recs) {
      const m = byId.get(r.material_id);
      // Περιεχόμενο συσκευασίας αγοράς (από την πρώτη σχετική γραμμή με συσκευασία)
      let packContent = null;
      let label = null;
      const l = inv.lines.find((x) => x.material_id === r.material_id && !x.excluded && x.qty_unit === 'unit');
      if (l) {
        const c = contentPerInvoiceUnit(l);
        const conv = c && convert(c.qty, c.unit, m.cost_unit, { density: m.density, pieceWeight: m.piece_weight });
        if (conv?.ok) {
          packContent = conv.value;
          label = packLabel(l);
        }
      }
      insPrice.run(r.material_id, inv.doc_date, r.unit_net, r.vat_rate, r.quantity, packContent, label, supplier.id, id, now, userId ?? null);
    }
    for (const l of inv.lines) {
      if (l.excluded || l.material_id == null) continue;
      upsertAlias(db, supplier.id, l);
    }
    db.prepare(
      `UPDATE invoices SET status = 'confirmed', supplier_id = ?, supplier_name = ?, confirmed_at = ?, confirmed_by = ?, updated_at = ? WHERE id = ?`,
    ).run(supplier.id, supplier.name, now, userId ?? null, now, id);
    db.prepare("UPDATE invoice_lines SET match_source = CASE WHEN match_source IN ('fuzzy','ai') THEN 'manual' ELSE match_source END WHERE invoice_id = ?").run(id);
    return recs.length;
  });
  return { event };
}

/** Επαναφορά σε πρόχειρο: αφαιρεί τις τιμές που δημιούργησε το παραστατικό. */
export function reopenInvoice(db, id, userId) {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (!inv) throw new HttpError(404, 'Το παραστατικό δεν βρέθηκε.');
  if (inv.status !== 'confirmed') throw new HttpError(409, 'Το παραστατικό είναι ήδη πρόχειρο.');
  const { event } = trackPriceChanges(db, { reason: 'invoice_reopened', invoiceId: id, userId }, () => {
    db.prepare('DELETE FROM prices WHERE invoice_id = ?').run(id);
    cleanupPinned(db);
    db.prepare("UPDATE invoices SET status = 'draft', confirmed_at = NULL, confirmed_by = NULL, updated_at = ? WHERE id = ?").run(nowIso(), id);
  });
  return { event };
}

export function deleteInvoice(db, config, id, userId) {
  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (!inv) throw new HttpError(404, 'Το παραστατικό δεν βρέθηκε.');
  const files = db.prepare('SELECT stored_name FROM invoice_files WHERE invoice_id = ?').all(id);
  const { event } = trackPriceChanges(db, { reason: 'invoice_deleted', invoiceId: id, userId }, () => {
    db.prepare('DELETE FROM prices WHERE invoice_id = ?').run(id);
    cleanupPinned(db);
    db.prepare('DELETE FROM invoices WHERE id = ?').run(id);
  });
  for (const f of files) {
    try {
      fs.unlinkSync(path.join(config.uploadsDir, f.stored_name));
    } catch {
      /* ήδη διαγραμμένο */
    }
  }
  return { event };
}
