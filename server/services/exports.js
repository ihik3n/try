// Εξαγωγές σε Excel (.xlsx) και CSV (UTF-8, διαχωριστικό «;», δεκαδικά με κόμμα για ελληνικό Excel).

import ExcelJS from 'exceljs';
import { createEngine, effectiveUnitPrice } from '../../shared/costing.js';
import { unitLabel } from '../../shared/units.js';

const U = { kg: 'kg', l: 'lt', pc: 'τεμ.' };
const yes = (b) => (b ? 'Ναι' : 'Όχι');
const basisLabel = (b) => (b === 'gross' ? 'με ΦΠΑ' : 'χωρίς ΦΠΑ');

export function materialsTable(catalog) {
  const basis = catalog.settings.vat_basis;
  return {
    name: 'Υλικά',
    columns: [
      ['Υλικό', 30], ['Είδος', 12], ['Κατηγορία', 18], ['Μάρκα', 14], ['Χαρακτηριστικά', 20], ['Μονάδα', 8],
      ['Τιμή χωρίς ΦΠΑ (€)', 14, 'money4'], ['ΦΠΑ %', 8, 'num'], ['Τιμή με ΦΠΑ (€)', 14, 'money4'], [`Τιμή κοστολόγησης ${basisLabel(basis)} (€)`, 18, 'money4'],
      ['Ημ/νία τιμής', 12], ['Προέλευση', 12], ['Επιλογή τιμής', 14], ['Προμηθευτής', 20], ['Παραστατικό', 14],
      ['Πυκνότητα g/ml', 10, 'num'], ['Βάρος τεμαχίου g', 10, 'num'], ['Αρχειοθετημένο', 8], ['Παράδειγμα', 8],
    ],
    rows: catalog.materials.map((m) => {
      const p = m.price;
      return [
        m.name, m.kind === 'packaging' ? 'Συσκευασία' : 'Πρώτη ύλη', m.category || '', m.brand || '', m.attributes || '', U[m.cost_unit],
        p?.unit_net ?? null, p?.vat_rate ?? null, p && p.vat_rate != null ? p.unit_net * (1 + p.vat_rate / 100) : null, effectiveUnitPrice(m, basis).value,
        p?.doc_date || '', p ? (p.source === 'invoice' ? 'Παραστατικό' : 'Χειροκίνητη') : 'ΧΩΡΙΣ ΤΙΜΗ', m.price_mode === 'pinned' ? 'Χειροκίνητη επιλογή' : 'Τελευταία', p?.supplier_name || '', p?.invoice_number || '',
        m.density ?? null, m.piece_weight ?? null, yes(m.archived), yes(m.is_sample),
      ];
    }),
  };
}

export function pricesTable(db) {
  const rows = db
    .prepare(
      `SELECT p.*, m.name AS material_name, m.cost_unit, s.name AS supplier_name, i.number AS invoice_number
       FROM prices p JOIN materials m ON m.id = p.material_id
       LEFT JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN invoices i ON i.id = p.invoice_id
       ORDER BY m.name COLLATE NOCASE, p.doc_date DESC, p.id DESC`,
    )
    .all();
  return {
    name: 'Ιστορικό τιμών',
    columns: [
      ['Υλικό', 30], ['Μονάδα', 8], ['Ημ/νία παραστατικού', 14], ['Τιμή χωρίς ΦΠΑ (€)', 14, 'money4'], ['ΦΠΑ %', 8, 'num'], ['Τιμή με ΦΠΑ (€)', 14, 'money4'],
      ['Ποσότητα', 10, 'num'], ['Συσκευασία', 14], ['Προμηθευτής', 20], ['Παραστατικό', 14], ['Προέλευση', 12], ['Σημείωση', 20], ['Καταχώριση', 18],
    ],
    rows: rows.map((p) => [
      p.material_name, U[p.cost_unit], p.doc_date, p.unit_net, p.vat_rate, p.vat_rate != null ? p.unit_net * (1 + p.vat_rate / 100) : null,
      p.quantity, p.pack_label || '', p.supplier_name || '', p.invoice_number || '', p.source === 'invoice' ? 'Παραστατικό' : 'Χειροκίνητη', p.note || '', p.created_at,
    ]),
  };
}

const compCols = (label) => [
  [`Πρώτες ύλες ${label} (€)`, 14, 'money4'], [`Συσκευασίες ${label} (€)`, 14, 'money4'], [`Εργασία ${label} (€)`, 12, 'money4'],
  [`Λειτουργικά ${label} (€)`, 12, 'money4'], [`Σύνολο ${label} (€)`, 14, 'money4'],
];
const comps = (c) => (c ? [c.materials, c.packaging, c.labor, c.overhead, c.total] : [null, null, null, null, null]);

export function recipeTables(catalog) {
  const e = createEngine(catalog);
  const summary = [];
  const lines = [];
  for (const r of catalog.recipes) {
    const x = e.evalRecipe(r.id);
    const yLabel = x.yield.ok ? `${(x.yield.base / (x.yield.baseUnit === 'pc' ? 1 : 1000)).toLocaleString('el-GR', { maximumFractionDigits: 3 })} ${U[x.yield.outputUnit]}` : '—';
    summary.push([
      r.name, r.category || '', { actual: 'Πραγματική', loss: `Φύρα ${r.loss_pct ?? ''}%`, none: 'Σύνολο υλικών' }[r.yield_mode], yLabel, x.input.mass_g || null,
      x.batch.total, U[x.yield.outputUnit] || '', ...comps(x.perUnit), x.complete ? 'Πλήρες' : 'ΕΛΛΙΠΕΣ', x.issues.map((i) => i.msg).join(' | '), yes(r.is_sample),
    ]);
    for (const l of x.lines) {
      lines.push([r.name, l.type === 'recipe' ? 'Συνταγή' : l.kind === 'packaging' ? 'Συσκευασία' : 'Πρώτη ύλη', l.name, l.qty, unitLabel(l.unit), l.unitPrice, l.costUnit ? `€/${U[l.costUnit]}` : '', l.cost, l.issue || '', l.note || '']);
    }
  }
  return [
    {
      name: 'Συνταγές',
      columns: [
        ['Συνταγή', 30], ['Κατηγορία', 16], ['Τρόπος απόδοσης', 16], ['Τελική απόδοση', 14], ['Σύνολο υλικών (g)', 14, 'num'], ['Κόστος παρτίδας (€)', 14, 'money4'],
        ['Μονάδα', 8], ...compCols('ανά μονάδα'), ['Κατάσταση', 10], ['Ελλείψεις', 40], ['Παράδειγμα', 8],
      ],
      rows: summary,
    },
    {
      name: 'Υλικά συνταγών',
      columns: [['Συνταγή', 30], ['Είδος', 12], ['Υλικό / επιμέρους συνταγή', 30], ['Ποσότητα', 10, 'num'], ['Μονάδα', 8], ['Τιμή μονάδας (€)', 12, 'money4'], ['Ανά', 8], ['Κόστος (€)', 12, 'money4'], ['Ένδειξη', 30], ['Σημείωση', 20]],
      rows: lines,
    },
  ];
}

export function productTables(catalog) {
  const e = createEngine(catalog);
  const summary = [];
  const lines = [];
  for (const p of catalog.products) {
    const x = e.evalProduct(p.id);
    summary.push([
      p.name, p.category || '', ...comps(x.perUnit), x.laborIncluded ? 'Ναι' : 'Δεν έχει καταχωριστεί', x.overheadIncluded ? 'Ναι' : 'Δεν έχουν καταχωριστεί',
      x.complete ? 'Πλήρες' : 'ΕΛΛΙΠΕΣ', x.issues.map((i) => i.msg).join(' | '), yes(p.is_sample),
    ]);
    for (const l of x.lines) {
      lines.push([p.name, l.type === 'recipe' ? 'Συνταγή' : l.kind === 'packaging' ? 'Συσκευασία' : 'Πρώτη ύλη', l.name, l.qty, unitLabel(l.unit), l.unitPrice, l.costUnit ? `€/${U[l.costUnit]}` : '', l.cost, l.issue || '']);
    }
  }
  return [
    {
      name: 'Κοστολόγια προϊόντων',
      columns: [['Προϊόν', 30], ['Κατηγορία', 16], ...compCols('/τεμ.'), ['Εργασία', 14], ['Λειτουργικά', 14], ['Κατάσταση', 10], ['Ελλείψεις', 40], ['Παράδειγμα', 8]],
      rows: summary,
    },
    {
      name: 'Ανάλυση προϊόντων',
      columns: [['Προϊόν', 30], ['Είδος', 12], ['Στοιχείο', 30], ['Ποσότητα', 10, 'num'], ['Μονάδα', 8], ['Τιμή μονάδας (€)', 12, 'money4'], ['Ανά', 8], ['Κόστος/τεμ. (€)', 12, 'money4'], ['Ένδειξη', 30]],
      rows: lines,
    },
  ];
}

export function planTables(catalog, entries, title = 'Παραγωγή') {
  const plan = createEngine(catalog).plan(entries);
  const qtyU = (base, unit) => (unit === 'g' ? base / 1000 : unit === 'ml' ? base / 1000 : base);
  return {
    plan,
    tables: [
      {
        name: 'Σύνοψη',
        columns: [['Προϊόν / συνταγή', 30], ['Ποσότητα', 10, 'num'], ['Μονάδα', 8], ...compCols('σύνολο'), ['Κατάσταση', 10]],
        rows: [
          ...plan.entries.map((x) => [x.name, x.qty, unitLabel(x.unit), ...comps(x.cost), x.complete ? 'Πλήρες' : 'ΕΛΛΙΠΕΣ']),
          ['ΣΥΝΟΛΟ', null, '', ...comps(plan.totals), plan.complete ? 'Πλήρες' : 'ΕΛΛΙΠΕΣ'],
          [`Βάση κοστολόγησης: ${basisLabel(plan.basis)}`],
          [`Εργασία: ${Math.round(plan.laborMinutes)} λεπτά συνολικά`],
          ...plan.issues.map((i) => [`Ένδειξη: ${i.msg}`]),
        ],
      },
      {
        name: 'Επιμέρους συνταγές',
        columns: [['Συνταγή', 30], ['Απαιτούμενη ποσότητα', 14, 'num'], ['Μονάδα', 8], ['Παρτίδες (× συνταγή)', 12, 'num'], ['Για', 30]],
        rows: plan.recipes.map((r) => [r.name, qtyU(r.need, r.baseUnit), U[r.outputUnit], r.batches, r.usedBy.join(', ')]),
      },
      {
        name: 'Ζύγισμα ανά συνταγή',
        columns: [['Συνταγή', 30], ['Υλικό', 30], ['Ποσότητα', 12, 'num'], ['Μονάδα', 8], ['Σημείωση', 20]],
        rows: plan.recipes.flatMap((r) => r.items.map((it) => [r.name, it.name, it.qty, unitLabel(it.unit), it.note])),
      },
      {
        name: 'Πρώτες ύλες',
        columns: [['Υλικό', 30], ['Ποσότητα', 12, 'num'], ['Μονάδα', 8], ['Συσκευασίες αγοράς', 14], ['Τιμή (€)', 12, 'money4'], ['Κόστος (€)', 12, 'money4']],
        rows: plan.materials.map((m) => [m.name, m.qty, U[m.costUnit], m.packs ? `${m.packs.count} × ${m.packs.label}` : '', m.unitPrice, m.cost ?? 'ΧΩΡΙΣ ΤΙΜΗ']),
      },
      {
        name: 'Συσκευασίες',
        columns: [['Συσκευασία', 30], ['Τεμάχια', 12, 'num'], ['Μονάδα', 8], ['Συσκευασίες αγοράς', 14], ['Τιμή (€)', 12, 'money4'], ['Κόστος (€)', 12, 'money4']],
        rows: plan.packaging.map((m) => [m.name, m.costUnit === 'pc' ? Math.ceil(m.qty - 1e-9) : m.qty, U[m.costUnit], m.packs ? `${m.packs.count} × ${m.packs.label}` : '', m.unitPrice, m.cost ?? 'ΧΩΡΙΣ ΤΙΜΗ']),
      },
    ].map((t) => ({ ...t, title })),
  };
}

export async function toXlsx(tables, meta = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Κοστολόγηση ζαχαροπλαστείου';
  wb.created = new Date();
  for (const t of tables) {
    const ws = wb.addWorksheet(t.name.slice(0, 31));
    ws.columns = t.columns.map(([header, width]) => ({ header, width }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    for (const r of t.rows) ws.addRow(r);
    t.columns.forEach(([, , fmt], i) => {
      if (!fmt) return;
      ws.getColumn(i + 1).numFmt = fmt === 'money4' ? '#,##0.00##' : '#,##0.###';
    });
    if (meta.note) {
      ws.addRow([]);
      ws.addRow([meta.note]).font = { italic: true };
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function csvCell(v) {
  if (v == null) return '';
  let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  if (/[;"\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(table) {
  const lines = [table.columns.map(([h]) => csvCell(h)).join(';'), ...table.rows.map((r) => r.map(csvCell).join(';'))];
  return Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
}
