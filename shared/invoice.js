// Υπολογισμοί γραμμών τιμολογίου: περιεχόμενο συσκευασίας → συνολική ποσότητα → κόστος ανά kg/lt/τεμ.
// Παράδειγμα: 4 συσκευασίες × 2,5 kg βούτυρο, καθαρή αξία 90 € → 10 kg → 9 €/kg.

import { convert, isPositive, isFiniteNumber, UNITS, CONVERSION_REASON_TEXT } from './units.js';
import { formatUnitPrice } from './numbers.js';

export const QTY_UNITS = ['unit', 'kg', 'g', 'l', 'ml'];
export const QTY_UNIT_LABEL = { unit: 'τεμ./συσκ.', kg: 'kg', g: 'g', l: 'lt', ml: 'ml' };
export const PACK_UNITS = ['kg', 'g', 'l', 'ml', 'pc'];

export const LINE_FIELD_LABEL = {
  supplier_code: 'Κωδικός',
  description: 'Περιγραφή',
  qty: 'Ποσότητα',
  qty_unit: 'Μονάδα',
  pack_count: 'Τεμάχια ανά συσκευασία',
  pack_size: 'Περιεχόμενο',
  pack_unit: 'Μονάδα περιεχομένου',
  unit_price: 'Τιμή μονάδας',
  discount_pct: 'Έκπτωση %',
  discount_amount: 'Έκπτωση €',
  net_amount: 'Καθαρή αξία',
  vat_rate: 'ΦΠΑ %',
  vat_amount: 'Ποσό ΦΠΑ',
};

const NET_TOLERANCE = 0.02; // € ανοχή σύγκρισης αναγραφόμενης/υπολογισμένης αξίας
export const PRICE_DEVIATION_WARN = 0.25; // 25% απόκλιση από την τρέχουσα τιμή → προειδοποίηση

function num(v) {
  return isFiniteNumber(v) ? v : null;
}

// Υπολογισμένη καθαρή αξία από ποσότητα × τιμή − εκπτώσεις (όταν υπάρχουν τα στοιχεία).
export function computeNetFromParts(line) {
  const qty = num(line.qty);
  const price = num(line.unit_price);
  if (qty == null || price == null) return null;
  let v = qty * price;
  const dp = num(line.discount_pct);
  if (dp != null) v *= 1 - dp / 100;
  const da = num(line.discount_amount);
  if (da != null) v -= da;
  return v;
}

// Περιεχόμενο ανά μονάδα τιμολογίου, π.χ. {qty: 2.5, unit: 'kg'} ή {qty: 1000, unit: 'pc'}
export function contentPerInvoiceUnit(line) {
  if (line.qty_unit && line.qty_unit !== 'unit') {
    if (!UNITS[line.qty_unit]) return null;
    return { qty: 1, unit: line.qty_unit };
  }
  if (!isPositive(line.pack_size) || !UNITS[line.pack_unit]) return null;
  const count = line.pack_count == null ? 1 : line.pack_count;
  if (!isPositive(count)) return null;
  return { qty: count * line.pack_size, unit: line.pack_unit };
}

/**
 * Υπολογίζει μία γραμμή.
 * material: { cost_unit, density, piece_weight, name } ή null
 * opts: { allocatedDiscount: €, currentUnitNet: τρέχουσα ενεργή τιμή του υλικού (καθαρή) }
 */
export function computeLine(line, material, opts = {}) {
  const errors = [];
  const warnings = [];
  const res = {
    computedNet: null,
    net: null,
    netSource: null,
    netMismatch: false,
    allocatedDiscount: opts.allocatedDiscount || 0,
    effectiveNet: null,
    contentPerUnit: null,
    totalContent: null,
    costUnit: material?.cost_unit || null,
    unitCost: null,
    unitCostGross: null,
    vatRate: num(line.vat_rate),
    deviation: null,
    errors,
    warnings,
  };

  res.computedNet = computeNetFromParts(line);
  if (num(line.net_amount) != null) {
    res.net = line.net_amount;
    res.netSource = 'printed';
    if (res.computedNet != null && Math.abs(res.computedNet - res.net) > NET_TOLERANCE) {
      res.netMismatch = true;
      warnings.push({
        field: 'net_amount',
        code: 'net_mismatch',
        msg: `Η καθαρή αξία (${res.net.toFixed(2)} €) διαφέρει από ποσότητα × τιμή − έκπτωση (${res.computedNet.toFixed(2)} €). Ελέγξτε τα ποσά.`,
      });
    }
  } else if (res.computedNet != null) {
    res.net = res.computedNet;
    res.netSource = 'computed';
  }

  if (line.excluded) return res; // Εξαιρεμένη γραμμή: δεν ενημερώνει τιμές, δεν ελέγχεται.

  if (!line.description || !String(line.description).trim()) {
    warnings.push({ field: 'description', code: 'missing_description', msg: 'Λείπει η περιγραφή.' });
  }
  if (!material) errors.push({ field: 'material_id', code: 'no_material', msg: 'Επιλέξτε υλικό ή εξαιρέστε τη γραμμή.' });
  else if (line.match_source === 'fuzzy' || line.match_source === 'ai') {
    errors.push({ field: 'material_id', code: 'unconfirmed_match', msg: 'Προτεινόμενη αντιστοίχιση: ελέγξτε και πατήστε «Σωστό» ή επιλέξτε άλλο υλικό.' });
  }
  if (!isPositive(line.qty)) errors.push({ field: 'qty', code: 'missing_qty', msg: 'Λείπει ή είναι μη έγκυρη η ποσότητα.' });

  const content = contentPerInvoiceUnit(line);
  res.contentPerUnit = content;
  if (!content) {
    if (!line.qty_unit) errors.push({ field: 'qty_unit', code: 'missing_unit', msg: 'Επιλέξτε μονάδα ποσότητας.' });
    else errors.push({ field: 'pack_size', code: 'missing_content', msg: 'Συμπληρώστε το περιεχόμενο κάθε συσκευασίας (π.χ. 2,5 kg).' });
  }

  if (res.net == null) {
    errors.push({ field: 'net_amount', code: 'missing_net', msg: 'Λείπει η καθαρή αξία (ή ποσότητα και τιμή μονάδας).' });
  } else if (res.net <= 0) {
    errors.push({ field: 'net_amount', code: 'zero_net', msg: 'Μηδενική ή αρνητική αξία: διορθώστε ή εξαιρέστε τη γραμμή (π.χ. δώρο).' });
  }

  if (res.vatRate == null) {
    warnings.push({ field: 'vat_rate', code: 'missing_vat', msg: 'Λείπει ο συντελεστής ΦΠΑ (χρειάζεται για κοστολόγηση με ΦΠΑ).' });
  }

  for (const f of line.flags || []) {
    errors.push({ field: f, code: 'uncertain', msg: `Αβέβαιη ανάγνωση: ${LINE_FIELD_LABEL[f] || f}. Ελέγξτε και πατήστε «Σωστό».` });
  }

  if (res.net != null) res.effectiveNet = res.net - res.allocatedDiscount;

  if (material && content && isPositive(line.qty)) {
    const total = line.qty * content.qty;
    const c = convert(total, content.unit, material.cost_unit, {
      density: material.density,
      pieceWeight: material.piece_weight,
    });
    if (!c.ok) {
      errors.push({
        field: 'pack_unit',
        code: 'conversion',
        msg: `Δεν γίνεται μετατροπή σε ${material.cost_unit === 'pc' ? 'τεμάχια' : material.cost_unit === 'l' ? 'λίτρα' : 'κιλά'}: ${CONVERSION_REASON_TEXT[c.reason]}.`,
      });
    } else if (c.value <= 0) {
      errors.push({ field: 'pack_size', code: 'zero_content', msg: 'Μηδενική συνολική ποσότητα.' });
    } else {
      res.totalContent = { qty: c.value, unit: material.cost_unit };
      if (res.effectiveNet != null && res.effectiveNet > 0) {
        res.unitCost = res.effectiveNet / c.value;
        if (res.vatRate != null) res.unitCostGross = res.unitCost * (1 + res.vatRate / 100);
        const cur = num(opts.currentUnitNet);
        if (cur != null && cur > 0) {
          res.deviation = (res.unitCost - cur) / cur;
          if (Math.abs(res.deviation) > PRICE_DEVIATION_WARN) {
            warnings.push({
              field: 'pack_size',
              code: 'price_deviation',
              msg: `Μεγάλη απόκλιση από την τρέχουσα τιμή (${formatUnitPrice(cur, material.cost_unit)} → ${formatUnitPrice(res.unitCost, material.cost_unit)}). Ελέγξτε το περιεχόμενο συσκευασίας και την αξία.`,
            });
          }
        }
      }
    }
  }
  return res;
}

/**
 * Υπολογίζει ολόκληρο τιμολόγιο.
 * invoice: { supplier_name, supplier_id, number, doc_date, net_total, vat_total, gross_total, extra_discount }
 * materialsById: Map ή object id → material
 * currentPrices: Map/object material_id → τρέχουσα καθαρή τιμή (για προειδοποιήσεις απόκλισης)
 */
export function computeInvoice(invoice, lines, materialsById, currentPrices = {}) {
  const getM = (id) => (id == null ? null : materialsById instanceof Map ? materialsById.get(id) : materialsById[id]) || null;
  const getP = (id) => (id == null ? null : currentPrices instanceof Map ? currentPrices.get(id) : currentPrices[id]) ?? null;
  const errors = [];
  const warnings = [];

  // Κατανομή γενικής έκπτωσης τιμολογίου αναλογικά στις καθαρές αξίες των γραμμών που κοστολογούνται.
  const extra = num(invoice.extra_discount) || 0;
  const pre = lines.map((l) => ({ line: l, net: l.net_amount ?? computeNetFromParts(l) }));
  const eligible = pre.filter((p) => !p.line.excluded && p.net != null && p.net > 0);
  const sumEligible = eligible.reduce((s, p) => s + p.net, 0);
  if (extra > 0 && sumEligible <= 0) {
    errors.push({ code: 'discount_unallocated', msg: 'Η γενική έκπτωση δεν μπορεί να κατανεμηθεί (δεν υπάρχουν γραμμές με αξία).' });
  }

  const results = lines.map((l) => {
    const p = pre.find((x) => x.line === l);
    const alloc = extra > 0 && sumEligible > 0 && eligible.includes(p) ? (extra * p.net) / sumEligible : 0;
    return computeLine(l, getM(l.material_id), { allocatedDiscount: alloc, currentUnitNet: getP(l.material_id) });
  });

  if (!invoice.supplier_name || !String(invoice.supplier_name).trim()) {
    if (!invoice.supplier_id) errors.push({ field: 'supplier_name', code: 'missing_supplier', msg: 'Λείπει ο προμηθευτής.' });
  }
  if (!invoice.doc_date || !/^\d{4}-\d{2}-\d{2}$/.test(invoice.doc_date) || Number.isNaN(Date.parse(invoice.doc_date))) {
    errors.push({ field: 'doc_date', code: 'missing_date', msg: 'Λείπει ή δεν είναι έγκυρη η ημερομηνία παραστατικού.' });
  }
  if (!invoice.number || !String(invoice.number).trim()) {
    warnings.push({ field: 'number', code: 'missing_number', msg: 'Λείπει ο αριθμός παραστατικού (χρειάζεται για έλεγχο διπλοεγγραφών).' });
  }
  for (const f of invoice.flags || []) {
    errors.push({ field: f, code: 'uncertain', msg: `Αβέβαιη ανάγνωση στο πεδίο «${HEADER_FIELD_LABEL[f] || f}». Ελέγξτε και πατήστε «Σωστό».` });
  }
  if (!lines.some((l) => !l.excluded)) {
    errors.push({ code: 'no_lines', msg: 'Δεν υπάρχει καμία γραμμή για ενημέρωση τιμών.' });
  }

  const sumNetAll = pre.reduce((s, p) => s + (p.net ?? 0), 0);
  const anyNetMissing = pre.some((p) => p.net == null);
  const sumVat = lines.reduce((s, l) => s + (num(l.vat_amount) ?? (l.vat_rate != null && (l.net_amount ?? computeNetFromParts(l)) != null ? ((l.net_amount ?? computeNetFromParts(l)) * l.vat_rate) / 100 : 0)), 0);
  const expectedNet = sumNetAll - extra;
  if (num(invoice.net_total) != null && !anyNetMissing && Math.abs(expectedNet - invoice.net_total) > Math.max(0.05, lines.length * 0.01)) {
    warnings.push({
      field: 'net_total',
      code: 'total_mismatch',
      msg: `Το άθροισμα των γραμμών (${expectedNet.toFixed(2)} €) διαφέρει από το καθαρό σύνολο του παραστατικού (${invoice.net_total.toFixed(2)} €). Ίσως λείπει γραμμή ή υπάρχει λάθος ανάγνωση.`,
    });
  }
  if (num(invoice.net_total) != null && num(invoice.vat_total) != null && num(invoice.gross_total) != null) {
    if (Math.abs(invoice.net_total + invoice.vat_total - invoice.gross_total) > 0.05) {
      warnings.push({ field: 'gross_total', code: 'gross_mismatch', msg: 'Καθαρό + ΦΠΑ δεν ισούται με το τελικό σύνολο του παραστατικού.' });
    }
  }

  const lineErrors = results.reduce((n, r) => n + r.errors.length, 0);
  return {
    lines: results,
    errors,
    warnings,
    sums: { net: sumNetAll, netAfterDiscount: expectedNet, vat: sumVat },
    canConfirm: errors.length === 0 && lineErrors === 0,
    lineErrorCount: lineErrors,
  };
}

export const HEADER_FIELD_LABEL = {
  supplier_name: 'Προμηθευτής',
  supplier_vat: 'ΑΦΜ',
  number: 'Αριθμός',
  doc_date: 'Ημερομηνία',
  net_total: 'Καθαρή αξία',
  vat_total: 'ΦΠΑ',
  gross_total: 'Σύνολο',
};

/**
 * Ομαδοποιεί τις έγκυρες γραμμές ανά υλικό για δημιουργία εγγραφών τιμής (σταθμισμένος μέσος όρος).
 * Επιστρέφει [{ material_id, unit_net, vat_rate, quantity, net }]
 */
export function priceRecordsFromInvoice(lines, computed) {
  const groups = new Map();
  lines.forEach((l, i) => {
    const r = computed.lines[i];
    if (l.excluded || l.material_id == null || r.unitCost == null || !r.totalContent) return;
    const g = groups.get(l.material_id) || { material_id: l.material_id, net: 0, qty: 0, vatWeighted: 0, vatNet: 0, vatMissing: false };
    g.net += r.effectiveNet;
    g.qty += r.totalContent.qty;
    if (r.vatRate == null) g.vatMissing = true;
    else {
      g.vatWeighted += r.vatRate * r.effectiveNet;
      g.vatNet += r.effectiveNet;
    }
    groups.set(l.material_id, g);
  });
  return [...groups.values()].map((g) => ({
    material_id: g.material_id,
    unit_net: g.net / g.qty,
    vat_rate: g.vatMissing || g.vatNet <= 0 ? null : g.vatWeighted / g.vatNet,
    quantity: g.qty,
    net: g.net,
  }));
}
