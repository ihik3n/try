import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convert } from '../shared/units.js';
import { parseDecimal, formatMoney, formatQty } from '../shared/numbers.js';
import { normalize, matchesSearch, percentConflict, similarity } from '../shared/text.js';
import { computeLine, computeInvoice, priceRecordsFromInvoice } from '../shared/invoice.js';
import { createEngine, wouldCreateCycle, itemsCreateCycle } from '../shared/costing.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

// ---------------- Μονάδες ----------------
test('μετατροπές g↔kg, ml↔l', () => {
  close(convert(2200, 'g', 'kg').value, 2.2);
  close(convert(0.5, 'l', 'ml').value, 500);
  close(convert(3, 'kg', 'g').value, 3000);
});

test('βάρος↔όγκος μόνο με πυκνότητα', () => {
  assert.deepEqual(convert(100, 'ml', 'kg'), { ok: false, reason: 'needs_density' });
  close(convert(1000, 'ml', 'kg', { density: 1.03 }).value, 1.03);
  close(convert(1, 'kg', 'l', { density: 1.03 }).value, 1 / 1.03);
});

test('τεμάχια↔βάρος μόνο με βάρος τεμαχίου', () => {
  assert.equal(convert(2, 'pc', 'g').ok, false);
  close(convert(2, 'pc', 'g', { pieceWeight: 55 }).value, 110);
  close(convert(110, 'g', 'pc', { pieceWeight: 55 }).value, 2);
});

// ---------------- Αριθμοί / κείμενο ----------------
test('ανάγνωση δεκαδικών (ελληνική και διεθνής μορφή)', () => {
  assert.equal(parseDecimal('2,5'), 2.5);
  assert.equal(parseDecimal('2.5'), 2.5);
  assert.equal(parseDecimal('1.234,56'), 1234.56);
  assert.equal(parseDecimal('1,234.56'), 1234.56);
  assert.equal(parseDecimal('1.234.567'), 1234567);
  assert.equal(parseDecimal(''), null);
  assert.ok(Number.isNaN(parseDecimal('abc')));
  assert.equal(parseDecimal('90 €'), 90);
});

test('μορφοποίηση', () => {
  assert.equal(formatMoney(9), '9,00 €');
  assert.equal(formatMoney(0.0123), '0,0123 €');
  assert.equal(formatQty(2880, 'g'), '2,88 kg');
  assert.equal(formatQty(80, 'g'), '80 g');
});

test('αναζήτηση με/χωρίς τόνους', () => {
  assert.equal(normalize('Κρέμα Γάλακτος'), 'κρεμα γαλακτοσ');
  assert.ok(matchesSearch('Ζάχαρη άχνη', 'ζαχαρη'));
  assert.ok(matchesSearch('Ζάχαρη άχνη', 'ΑΧΝΗ ζάχ'));
  assert.ok(!matchesSearch('Ζάχαρη άχνη', 'αλευρι'));
});

test('κρέμα 35% και 48% παραμένουν διαφορετικά', () => {
  assert.ok(percentConflict('ΚΡΕΜΑ ΓΑΛΑΚΤΟΣ 35% 1LT', 'Κρέμα γάλακτος 48%'));
  assert.ok(!percentConflict('ΚΡΕΜΑ ΓΑΛΑΚΤΟΣ 35% 1LT', 'Κρέμα γάλακτος 35%'));
  assert.ok(!percentConflict('ΚΡΕΜΑ ΓΑΛΑΚΤΟΣ', 'Κρέμα γάλακτος 35%'));
  assert.ok(similarity('ΒΟΥΤΥΡΟ ΑΓΕΛΑΔΟΣ 82% 2,5KG', 'Βούτυρο αγελάδος 82%') > 0.5);
});

// ---------------- Τιμολόγια ----------------
const butter = { id: 1, name: 'Βούτυρο', cost_unit: 'kg' };
const cream = { id: 2, name: 'Κρέμα 35%', cost_unit: 'l', density: 1.0 };
const cups = { id: 3, name: 'Ποτηράκι', cost_unit: 'pc' };

test('4 συσκευασίες × 2,5 kg, 90 € → 10 kg, 9 €/kg', () => {
  const r = computeLine({ description: 'Βούτυρο', qty: 4, qty_unit: 'unit', pack_count: 1, pack_size: 2.5, pack_unit: 'kg', net_amount: 90, vat_rate: 13 }, butter);
  assert.equal(r.errors.length, 0);
  close(r.totalContent.qty, 10);
  close(r.unitCost, 9);
  close(r.unitCostGross, 10.17);
});

test('κιβώτιο με 4 τεμάχια των 2,5 kg', () => {
  const r = computeLine({ description: 'Βούτυρο', qty: 1, qty_unit: 'unit', pack_count: 4, pack_size: 2.5, pack_unit: 'kg', net_amount: 90, vat_rate: 13 }, butter);
  close(r.unitCost, 9);
});

test('τιμολόγηση απευθείας σε kg', () => {
  const r = computeLine({ description: 'Ζάχαρη', qty: 25, qty_unit: 'kg', unit_price: 1.1, net_amount: 27.5, vat_rate: 13 }, { id: 9, cost_unit: 'kg' });
  close(r.unitCost, 1.1);
});

test('συσκευασία σε g προς μονάδα kg', () => {
  const r = computeLine({ description: 'Βανίλια', qty: 2, qty_unit: 'unit', pack_size: 500, pack_unit: 'g', net_amount: 20, vat_rate: 24 }, { id: 9, cost_unit: 'kg' });
  close(r.totalContent.qty, 1);
  close(r.unitCost, 20);
});

test('κιβώτιο 20×50 ποτηράκια', () => {
  const r = computeLine({ description: 'Ποτήρι', qty: 1, qty_unit: 'unit', pack_count: 20, pack_size: 50, pack_unit: 'pc', net_amount: 60, vat_rate: 24 }, cups);
  close(r.totalContent.qty, 1000);
  close(r.unitCost, 0.06);
});

test('υπολογισμός καθαρής αξίας από τιμή και εκπτώσεις', () => {
  const r = computeLine({ description: 'Βούτυρο', qty: 4, qty_unit: 'unit', pack_size: 2.5, pack_unit: 'kg', unit_price: 25, discount_pct: 10, vat_rate: 13 }, butter);
  assert.equal(r.netSource, 'computed');
  close(r.net, 90);
  close(r.unitCost, 9);
});

test('ασυμφωνία αναγραφόμενης/υπολογισμένης αξίας → προειδοποίηση', () => {
  const r = computeLine({ description: 'Βούτυρο', qty: 4, qty_unit: 'unit', pack_size: 2.5, pack_unit: 'kg', unit_price: 25, net_amount: 90, vat_rate: 13 }, butter);
  assert.ok(r.netMismatch);
  assert.ok(r.warnings.some((w) => w.code === 'net_mismatch'));
  close(r.unitCost, 9); // χρησιμοποιείται η αναγραφόμενη αξία
});

test('ελλιπή στοιχεία → σφάλματα, χωρίς επινόηση τιμής', () => {
  const r = computeLine({ description: 'Βούτυρο', qty: 4, qty_unit: 'unit', net_amount: null, vat_rate: null }, butter);
  assert.equal(r.unitCost, null);
  const codes = r.errors.map((e) => e.code);
  assert.ok(codes.includes('missing_content'));
  assert.ok(codes.includes('missing_net'));
});

test('λίτρα προς υλικό σε kg χωρίς πυκνότητα → σφάλμα μετατροπής', () => {
  const r = computeLine({ description: 'Γάλα', qty: 10, qty_unit: 'l', net_amount: 12, vat_rate: 13 }, { id: 5, cost_unit: 'kg' });
  assert.ok(r.errors.some((e) => e.code === 'conversion'));
});

test('αβέβαιη ανάγνωση εμποδίζει την επιβεβαίωση', () => {
  const r = computeLine({ description: 'Βούτυρο', qty: 4, qty_unit: 'unit', pack_size: 2.5, pack_unit: 'kg', net_amount: 90, vat_rate: 13, flags: ['net_amount'] }, butter);
  assert.ok(r.errors.some((e) => e.code === 'uncertain'));
});

test('μεγάλη απόκλιση από τρέχουσα τιμή → προειδοποίηση', () => {
  const r = computeLine({ description: 'Βούτυρο', qty: 4, qty_unit: 'unit', pack_size: 250, pack_unit: 'g', net_amount: 90, vat_rate: 13 }, butter, { currentUnitNet: 9 });
  assert.ok(r.warnings.some((w) => w.code === 'price_deviation'));
});

test('γενική έκπτωση κατανέμεται αναλογικά και εξαιρεμένες γραμμές αγνοούνται', () => {
  const lines = [
    { description: 'Βούτυρο', material_id: 1, qty: 4, qty_unit: 'unit', pack_size: 2.5, pack_unit: 'kg', net_amount: 90, vat_rate: 13 },
    { description: 'Κρέμα', material_id: 2, qty: 10, qty_unit: 'l', net_amount: 60, vat_rate: 13 },
    { description: 'Μεταφορικά', excluded: true, net_amount: 5, vat_rate: 24 },
  ];
  const inv = { supplier_name: 'Χ', doc_date: '2026-10-01', number: '1', extra_discount: 15, net_total: 140 };
  const c = computeInvoice(inv, lines, { 1: butter, 2: cream });
  assert.ok(c.canConfirm, JSON.stringify(c));
  close(c.lines[0].effectiveNet, 81); // 90 - 15×90/150
  close(c.lines[0].unitCost, 8.1);
  close(c.lines[1].effectiveNet, 54);
  assert.equal(c.warnings.filter((w) => w.code === 'total_mismatch').length, 0);
  const recs = priceRecordsFromInvoice(lines, c);
  assert.equal(recs.length, 2);
});

test('δύο γραμμές ίδιου υλικού → σταθμισμένη τιμή', () => {
  const lines = [
    { description: 'Βούτυρο', material_id: 1, qty: 10, qty_unit: 'kg', net_amount: 90, vat_rate: 13 },
    { description: 'Βούτυρο προσφορά', material_id: 1, qty: 10, qty_unit: 'kg', net_amount: 70, vat_rate: 13 },
  ];
  const c = computeInvoice({ supplier_name: 'Χ', doc_date: '2026-10-01', number: '1' }, lines, { 1: butter });
  const recs = priceRecordsFromInvoice(lines, c);
  assert.equal(recs.length, 1);
  close(recs[0].unit_net, 8);
  close(recs[0].vat_rate, 13);
});

test('έλεγχος συνόλου τιμολογίου', () => {
  const lines = [{ description: 'Βούτυρο', material_id: 1, qty: 10, qty_unit: 'kg', net_amount: 90, vat_rate: 13 }];
  const c = computeInvoice({ supplier_name: 'Χ', doc_date: '2026-10-01', number: '1', net_total: 120 }, lines, { 1: butter });
  assert.ok(c.warnings.some((w) => w.code === 'total_mismatch'));
});

// ---------------- Κοστολόγηση ----------------
function sampleCatalog(overrides = {}) {
  return {
    settings: { vat_basis: 'net', labor_rate: 12 },
    materials: [
      { id: 1, name: 'Βούτυρο', kind: 'ingredient', cost_unit: 'kg', price: { unit_net: 9, vat_rate: 13 } },
      { id: 2, name: 'Ζάχαρη', kind: 'ingredient', cost_unit: 'kg', price: { unit_net: 1.2, vat_rate: 13 } },
      { id: 3, name: 'Αλεύρι', kind: 'ingredient', cost_unit: 'kg', price: { unit_net: 0.8, vat_rate: 13 } },
      { id: 4, name: 'Κρέμα 35%', kind: 'ingredient', cost_unit: 'l', density: 1.0, price: { unit_net: 5, vat_rate: 13 } },
      { id: 5, name: 'Κουβερτούρα', kind: 'ingredient', cost_unit: 'kg', price: { unit_net: 14, vat_rate: 13 } },
      { id: 6, name: 'Πραλίνα', kind: 'ingredient', cost_unit: 'kg', price: { unit_net: 18, vat_rate: 13 } },
      { id: 7, name: 'Αυγά', kind: 'ingredient', cost_unit: 'pc', piece_weight: 55, price: { unit_net: 0.2, vat_rate: 13 } },
      { id: 20, name: 'Ποτηράκι', kind: 'packaging', cost_unit: 'pc', price: { unit_net: 0.1, vat_rate: 24 } },
      { id: 21, name: 'Καπάκι', kind: 'packaging', cost_unit: 'pc', price: { unit_net: 0.05, vat_rate: 24 } },
      { id: 22, name: 'Κουταλάκι', kind: 'packaging', cost_unit: 'pc', price: { unit_net: 0.02, vat_rate: 24 } },
      ...(overrides.materials || []),
    ],
    recipes: [
      {
        id: 100,
        name: 'Μους σοκολάτας',
        yield_mode: 'actual',
        yield_qty: 2000,
        yield_unit: 'g',
        items: [
          { material_id: 4, qty: 1000, unit: 'ml' },
          { material_id: 5, qty: 800, unit: 'g' },
          { material_id: 2, qty: 400, unit: 'g' },
        ],
      },
      {
        id: 101,
        name: 'Crumble',
        yield_mode: 'loss',
        loss_pct: 10,
        measure: 'mass',
        items: [
          { material_id: 1, qty: 500, unit: 'g' },
          { material_id: 2, qty: 500, unit: 'g' },
          { material_id: 3, qty: 1, unit: 'kg' },
        ],
      },
      ...(overrides.recipes || []),
    ],
    products: [
      {
        id: 200,
        name: 'Ποτηράκι μους',
        batch_size: 1,
        items: [
          { recipe_id: 100, qty: 80, unit: 'g' },
          { recipe_id: 101, qty: 25, unit: 'g' },
          { material_id: 6, qty: 15, unit: 'g' },
          { material_id: 20, qty: 1, unit: 'pc' },
          { material_id: 21, qty: 1, unit: 'pc' },
          { material_id: 22, qty: 1, unit: 'pc' },
        ],
      },
      ...(overrides.products || []),
    ],
  };
}

test('συνταγή με πραγματική απόδοση: κόστος ανά kg στα 2.000 g', () => {
  const e = createEngine(sampleCatalog());
  const r = e.evalRecipe(100);
  // 1 lt κρέμα × 5 + 0,8 kg × 14 + 0,4 kg × 1,2 = 5 + 11,2 + 0,48 = 16,68 €
  close(r.batch.total, 16.68);
  close(r.input.mass_g, 2200);
  close(r.yield.base, 2000);
  close(r.perUnit.total, 8.34); // 16,68 / 2 kg
  close(r.yield.impliedLossPct, (200 / 2200) * 100);
  assert.ok(r.complete);
});

test('συνταγή με φύρα %: απόδοση = σύνολο × (1 − φύρα)', () => {
  const e = createEngine(sampleCatalog());
  const r = e.evalRecipe(101);
  // 0,5×9 + 0,5×1,2 + 1×0,8 = 4,5 + 0,6 + 0,8 = 5,9 € για 2 kg υλικών, απόδοση 1,8 kg
  close(r.batch.total, 5.9);
  close(r.yield.base, 1800);
  close(r.perUnit.total, 5.9 / 1.8);
});

test('προϊόν: ποτηράκι 80 g μους + 25 g crumble + 15 g πραλίνα + συσκευασίες', () => {
  const e = createEngine(sampleCatalog());
  const r = e.evalProduct(200);
  const mousse = 0.08 * 8.34;
  const crumble = 0.025 * (5.9 / 1.8);
  const praline = 0.015 * 18;
  const pack = 0.1 + 0.05 + 0.02;
  close(r.perUnit.materials, mousse + crumble + praline);
  close(r.perUnit.packaging, pack);
  close(r.perUnit.total, mousse + crumble + praline + pack);
  assert.equal(r.lines.length, 6);
  close(r.lines[0].cost, mousse);
  assert.ok(r.complete);
  assert.ok(!r.laborIncluded);
  assert.ok(!r.overheadIncluded);
});

test('αλλαγή τιμής βασικής συνταγής ενημερώνει το προϊόν', () => {
  const cat = sampleCatalog();
  const before = createEngine(cat).evalProduct(200).perUnit.total;
  cat.materials.find((m) => m.id === 5).price.unit_net = 20; // κουβερτούρα 14 → 20
  const after = createEngine(cat).evalProduct(200).perUnit.total;
  close(after - before, (0.08 * (0.8 * 6)) / 2); // 80 g από 2 kg παρτίδα, +4,8 € στην παρτίδα
});

test('υλικό χωρίς τιμή → ελλιπές κοστολόγιο (όχι δωρεάν)', () => {
  const cat = sampleCatalog();
  cat.materials.find((m) => m.id === 6).price = null;
  const r = createEngine(cat).evalProduct(200);
  assert.equal(r.complete, false);
  assert.ok(r.issues.some((i) => i.code === 'missing_price' && i.msg.includes('Πραλίνα')));
  assert.equal(r.lines[2].cost, null);
});

test('ελλιπής επιμέρους συνταγή κάνει ελλιπές και το προϊόν', () => {
  const cat = sampleCatalog();
  cat.materials.find((m) => m.id === 3).price = null; // αλεύρι στο crumble
  const r = createEngine(cat).evalProduct(200);
  assert.equal(r.complete, false);
  assert.ok(r.issues.some((i) => i.msg.includes('Αλεύρι')));
});

test('κοστολόγηση με ΦΠΑ', () => {
  const cat = sampleCatalog();
  cat.settings.vat_basis = 'gross';
  const r = createEngine(cat).evalRecipe(100);
  close(r.batch.total, 16.68 * 1.13);
  assert.equal(r.basis, 'gross');
  cat.materials.find((m) => m.id === 2).price.vat_rate = null;
  const r2 = createEngine(cat).evalRecipe(100);
  assert.equal(r2.complete, false);
  assert.ok(r2.issues.some((i) => i.code === 'missing_vat'));
});

test('μετατροπή ml σε υλικό kg απαιτεί πυκνότητα', () => {
  const cat = sampleCatalog({
    recipes: [{ id: 102, name: 'Δοκιμή', yield_mode: 'none', measure: 'mass', items: [{ material_id: 1, qty: 100, unit: 'ml' }] }],
  });
  const r = createEngine(cat).evalRecipe(102);
  assert.equal(r.complete, false);
  assert.ok(r.issues.some((i) => i.code === 'needs_density'));
});

test('αυγά σε τεμάχια: συμμετέχουν στο βάρος μόνο με βάρος τεμαχίου', () => {
  const cat = sampleCatalog({
    recipes: [{ id: 103, name: 'Παντεσπάνι', yield_mode: 'none', measure: 'mass', items: [{ material_id: 7, qty: 10, unit: 'pc' }, { material_id: 3, qty: 300, unit: 'g' }] }],
  });
  const r = createEngine(cat).evalRecipe(103);
  close(r.input.mass_g, 850);
  close(r.batch.total, 2 + 0.24);
  cat.materials.find((m) => m.id === 7).piece_weight = null;
  const r2 = createEngine(cat).evalRecipe(103);
  assert.equal(r2.complete, false);
  assert.ok(r2.issues.some((i) => i.code === 'yield_inputs'));
});

test('κυκλικές συνδέσεις εντοπίζονται', () => {
  const recipes = [
    { id: 1, name: 'Α', items: [{ recipe_id: 1, sub_recipe_id: 2, qty: 10, unit: 'g' }] },
    { id: 2, name: 'Β', items: [{ recipe_id: 2, sub_recipe_id: 3, qty: 10, unit: 'g' }] },
    { id: 3, name: 'Γ', items: [{ recipe_id: 3, material_id: 1, qty: 10, unit: 'g' }] },
  ];
  assert.ok(wouldCreateCycle(recipes, 3, 1));
  assert.ok(wouldCreateCycle(recipes, 1, 1));
  assert.ok(!wouldCreateCycle(recipes, 1, 3));
  assert.ok(itemsCreateCycle(recipes, 3, [{ sub_recipe_id: 1, qty: 1, unit: 'g' }]));
  const cyc = createEngine({ settings: {}, materials: [{ id: 1, name: 'x', cost_unit: 'kg', price: { unit_net: 1 } }], recipes: [...recipes.slice(0, 2), { id: 3, name: 'Γ', items: [{ sub_recipe_id: 1, qty: 10, unit: 'g' }] }], products: [] });
  const r = cyc.evalRecipe(1);
  assert.equal(r.complete, false);
  assert.ok(JSON.stringify(r.issues).includes('Κυκλική'));
});

test('εργασία και λειτουργικά: χωρίς διπλή χρέωση στις επιμέρους συνταγές', () => {
  const cat = sampleCatalog();
  const mousse = cat.recipes.find((r) => r.id === 100);
  Object.assign(mousse, { labor_minutes: 30, overhead_fixed: 2, overhead_pct: 10, overhead_base: 'materials' });
  const prod = cat.products[0];
  Object.assign(prod, { batch_size: 60, labor_minutes: 60, overhead_pct: 10, overhead_base: 'materials' });
  const e = createEngine(cat);
  const m = e.evalRecipe(100);
  close(m.batch.labor, 6); // 30 λεπτά × 12 €/ώρα
  close(m.batch.overhead, 2 + 1.668);
  const p = e.evalProduct(200);
  const frac = 80 / 2000;
  const crumbleMat = 0.025 * (5.9 / 1.8);
  const praline = 0.015 * 18;
  // Εργασία: μερίδιο μους + δική του εργασία ανά τεμάχιο (60 λεπτά / 60 τεμ.)
  close(p.perUnit.labor, 6 * frac + 12 / 60);
  // Λειτουργικά: μερίδιο μους + 10% μόνο στις πρώτες ύλες που ΔΕΝ έχουν ήδη επιβαρυνθεί (crumble + πραλίνα)
  close(p.perUnit.overhead, (2 + 1.668) * frac + 0.1 * (crumbleMat + praline));
  assert.ok(p.laborIncluded && p.overheadIncluded);
  close(p.perUnit.total, p.perUnit.materials + p.perUnit.packaging + p.perUnit.labor + p.perUnit.overhead);
});

test('λειτουργικά % με βάση εργασία+υλικά', () => {
  const cat = sampleCatalog();
  Object.assign(cat.recipes[0], { labor_minutes: 60, overhead_pct: 20, overhead_base: 'direct' });
  const r = createEngine(cat).evalRecipe(100);
  close(r.batch.overhead, 0.2 * (16.68 + 12));
});

test('λείπει ωριαίο κόστος → ελλιπές', () => {
  const cat = sampleCatalog();
  cat.settings.labor_rate = null;
  cat.recipes[0].labor_minutes = 20;
  const r = createEngine(cat).evalRecipe(100);
  assert.ok(r.issues.some((i) => i.code === 'missing_labor_rate'));
});

test('επιμέρους συνταγή σε δύο επίπεδα (συνταγή μέσα σε συνταγή μέσα σε προϊόν)', () => {
  const cat = sampleCatalog({
    // Όπως έρχονται από τη βάση: recipe_id = γονική συνταγή, sub_recipe_id = επιμέρους
    recipes: [{ id: 110, name: 'Βάση τάρτας', yield_mode: 'actual', yield_qty: 1, yield_unit: 'kg', items: [{ recipe_id: 110, sub_recipe_id: 101, qty: 900, unit: 'g' }, { recipe_id: 110, material_id: 1, qty: 100, unit: 'g' }] }],
    products: [{ id: 210, name: 'Ταρτάκι', items: [{ recipe_id: 110, qty: 50, unit: 'g' }] }],
  });
  const e = createEngine(cat);
  const base = e.evalRecipe(110);
  close(base.batch.total, 0.9 * (5.9 / 1.8) + 0.9);
  const p = e.evalProduct(210);
  close(p.perUnit.total, 0.05 * base.perUnit.total);
});

// ---------------- Παραγωγή ----------------
test('60 ποτηράκια: ποσότητες συνταγών, πρώτες ύλες, συσκευασίες, κόστος', () => {
  const cat = sampleCatalog();
  const e = createEngine(cat);
  const plan = e.plan([{ kind: 'product', id: 200, qty: 60 }]);
  const mousse = plan.recipes.find((r) => r.id === 100);
  close(mousse.need, 4800); // 60 × 80 g
  close(mousse.batches, 2.4);
  const crumble = plan.recipes.find((r) => r.id === 101);
  close(crumble.need, 1500);
  close(crumble.batches, 1500 / 1800);
  // Ζάχαρη από μους (0,4 kg × 2,4) + crumble (0,5 kg × 0,8333) → μία γραμμή
  const sugar = plan.materials.find((m) => m.id === 2);
  close(sugar.qty, 0.4 * 2.4 + 0.5 * (1500 / 1800));
  const praline = plan.materials.find((m) => m.id === 6);
  close(praline.qty, 0.9);
  assert.equal(plan.packaging.find((m) => m.id === 20).qty, 60);
  const unit = e.evalProduct(200).perUnit.total;
  close(plan.totals.total, unit * 60, 1e-9);
  // Το άθροισμα κόστους πρώτων υλών + συσκευασιών ταιριάζει με τα συγκεντρωτικά
  const listCost = [...plan.materials, ...plan.packaging].reduce((s, m) => s + m.cost, 0);
  close(listCost, plan.totals.materials + plan.totals.packaging, 1e-9);
  assert.ok(plan.complete);
});

test('παραγωγή πολλών προϊόντων με κοινή επιμέρους συνταγή συγκεντρώνεται', () => {
  const cat = sampleCatalog({ products: [{ id: 201, name: 'Μους σε κουτί', items: [{ recipe_id: 100, qty: 200, unit: 'g' }] }] });
  const e = createEngine(cat);
  const plan = e.plan([
    { kind: 'product', id: 200, qty: 60 },
    { kind: 'product', id: 201, qty: 10 },
    { kind: 'recipe', id: 100, qty: 1, unit: 'kg' },
  ]);
  const mousse = plan.recipes.find((r) => r.id === 100);
  close(mousse.need, 4800 + 2000 + 1000);
  close(mousse.batches, 7800 / 2000);
  const cream = plan.materials.find((m) => m.id === 4);
  close(cream.qty, 1 * 3.9);
});

test('συσκευασίες αγοράς στη λίστα παραγωγής', () => {
  const cat = sampleCatalog();
  cat.materials.find((m) => m.id === 6).last_pack = { content: 5, label: '5 kg' };
  const plan = createEngine(cat).plan([{ kind: 'product', id: 200, qty: 400 }]);
  const praline = plan.materials.find((m) => m.id === 6);
  close(praline.qty, 6);
  assert.equal(praline.packs.count, 2);
});

test('μικρές ποσότητες: ακρίβεια χωρίς πρόωρη στρογγυλοποίηση', () => {
  const cat = sampleCatalog({
    materials: [{ id: 30, name: 'Αλάτι', kind: 'ingredient', cost_unit: 'kg', price: { unit_net: 0.45 } }],
    products: [{ id: 220, name: 'Μπισκότο', items: [{ material_id: 30, qty: 0.3, unit: 'g' }] }],
  });
  const p = createEngine(cat).evalProduct(220);
  close(p.perUnit.total, 0.000135, 1e-15);
  const plan = createEngine(cat).plan([{ kind: 'product', id: 220, qty: 10000 }]);
  close(plan.totals.total, 1.35, 1e-12);
});

// ---------------- Κανονικοποίηση ανάγνωσης AI ----------------
import { extractionToDraft } from '../server/services/ai.js';

test('ανάγνωση AI: απρόβλεπτες μονάδες κανονικοποιούνται ή σημειώνονται, χωρίς να χαλάει η ανάγνωση', () => {
  const base = { supplier_code: null, description: 'Χ', qty: 1, unit_text: null, pack_count: null, pack_size: 1, pack_from_description: false, unit_price: null, discount_pct: null, discount_amount: null, net_amount: 10, vat_rate: 13, vat_amount: null, is_material: true, note: null };
  const d = extractionToDraft({
    readable: true, document_type: null, supplier_name: 'Χ', supplier_vat: 'EL 123-456-789', number: '1', date: '01/10/2026',
    net_total: null, vat_total: null, gross_total: null, invoice_discount: null, header_uncertain_fields: ['quantity', 'number', 'άγνωστο'],
    lines: [
      { ...base, qty_unit: 'ΚΙΒ', pack_unit: 'ΛΙΤ', uncertain_fields: ['quantity'] },
      { ...base, qty_unit: 'kg', pack_unit: 'τεμ.', uncertain_fields: [] },
      { ...base, qty_unit: 'παλέτα', pack_unit: 'xyz', uncertain_fields: [], is_material: false },
    ],
    warnings: [],
  });
  assert.equal(d.header.supplier_vat, '123456789');
  assert.equal(d.header.doc_date, null); // μη έγκυρη μορφή → κενό + σήμανση
  assert.ok(d.header.flags.includes('doc_date'));
  assert.deepEqual(d.header.flags.filter((f) => f !== 'doc_date'), ['number']);
  assert.equal(d.lines[0].qty_unit, 'unit');
  assert.equal(d.lines[0].pack_unit, 'l');
  assert.deepEqual(d.lines[0].flags, ['qty']);
  assert.equal(d.lines[1].pack_unit, 'pc');
  assert.equal(d.lines[2].qty_unit, null);
  assert.ok(d.lines[2].flags.includes('qty_unit') && d.lines[2].flags.includes('pack_unit'));
  assert.equal(d.lines[2].excluded, 1);
});

// ---------- Κύριο κόστος χωρίς εργασία προσωπικού ----------
import { headline, headlineMode } from '../shared/costing.js';

test('κύριο κόστος: χωρίς εργασία (προεπιλογή) ή με εργασία, και για γραμμές επιμέρους συνταγών', () => {
  const cat = sampleCatalog();
  Object.assign(cat.recipes[1], { labor_minutes: 15, labor_rate: 10 }); // crumble: 2,50 € εργασία ανά παρτίδα
  const e = createEngine(cat);
  const r = e.evalRecipe(101);
  assert.equal(headlineMode({}), 'without_labor');
  assert.equal(headlineMode({ cost_headline: 'with_labor' }), 'with_labor');
  close(headline(r.perUnit, 'without_labor'), 5.9 / 1.8);
  close(headline(r.perUnit, 'with_labor'), (5.9 + 2.5) / 1.8);
  close(headline(r.batch, 'without_labor'), 5.9);
  const p = e.evalProduct(200);
  const crumbleLine = p.lines[1];
  close(headline(crumbleLine, 'without_labor'), 0.025 * (5.9 / 1.8));
  close(headline(crumbleLine, 'with_labor'), 0.025 * ((5.9 + 2.5) / 1.8));
  close(headline(p.perUnit, 'with_labor') - headline(p.perUnit, 'without_labor'), p.perUnit.labor);
});
