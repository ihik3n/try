// Παραδειγματικά δεδομένα με σαφή σήμανση (is_sample = 1). Διαγράφονται με ένα κουμπί από τις Ρυθμίσεις.

import { nowIso, getSettings, setSettings } from '../db.js';
import { replaceLines, confirmInvoice } from './invoices.js';
import { createSnapshot } from './snapshots.js';

const SAMPLE_TAG = 'ΠΑΡΑΔΕΙΓΜΑ';

export function hasSampleData(db) {
  const q = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t} WHERE is_sample = 1`).get().c;
  return q('materials') + q('recipes') + q('products') + q('invoices') > 0;
}

export function isEmpty(db) {
  const q = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  return q('materials') + q('recipes') + q('products') + q('invoices') === 0;
}

export function seedSampleData(db) {
  const now = nowIso();
  const ids = {};
  db.transaction(() => {
    const sup = db.prepare('INSERT INTO suppliers (name, vat_number, notes, is_sample, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)');
    ids.supDairy = sup.run(`${SAMPLE_TAG} Γαλακτοκομικά Α.Ε.`, '999999991', 'Παραδειγματικός προμηθευτής', now, now).lastInsertRowid;
    ids.supRaw = sup.run(`${SAMPLE_TAG} Πρώτες Ύλες Ζαχαροπλαστικής Ο.Ε.`, '999999992', 'Παραδειγματικός προμηθευτής', now, now).lastInsertRowid;
    ids.supPack = sup.run(`${SAMPLE_TAG} Συσκευασίες Ε.Π.Ε.`, '999999993', 'Παραδειγματικός προμηθευτής', now, now).lastInsertRowid;

    const mat = db.prepare(
      `INSERT INTO materials (name, kind, category, brand, attributes, cost_unit, density, piece_weight, notes, is_sample, created_at, updated_at)
       VALUES (@name, @kind, @category, @brand, @attributes, @cost_unit, @density, @piece_weight, @notes, 1, @now, @now)`,
    );
    const M = (key, o) => {
      ids[key] = mat.run({ kind: 'ingredient', brand: null, attributes: null, density: null, piece_weight: null, notes: null, now, ...o }).lastInsertRowid;
    };
    M('butter', { name: 'Βούτυρο αγελάδος 82%', category: 'Γαλακτοκομικά', attributes: '82% λιπαρά', cost_unit: 'kg' });
    M('cream35', { name: 'Κρέμα γάλακτος 35%', category: 'Γαλακτοκομικά', attributes: '35% λιπαρά', cost_unit: 'l', density: 0.99 });
    M('cream48', { name: 'Κρέμα γάλακτος 48%', category: 'Γαλακτοκομικά', attributes: '48% λιπαρά', cost_unit: 'l', density: 0.98, notes: 'Χωρίς τιμή — δείχνει την ένδειξη «Ελλιπές κοστολόγιο»' });
    M('milk', { name: 'Γάλα πλήρες 3,5%', category: 'Γαλακτοκομικά', attributes: '3,5% λιπαρά', cost_unit: 'l', density: 1.03 });
    M('sugar', { name: 'Ζάχαρη κρυσταλλική', category: 'Ζάχαρη & γλυκαντικά', cost_unit: 'kg' });
    M('icing', { name: 'Ζάχαρη άχνη', category: 'Ζάχαρη & γλυκαντικά', cost_unit: 'kg' });
    M('dextrose', { name: 'Δεξτρόζη', category: 'Gelato – βάσεις & σταθεροποιητές', cost_unit: 'kg' });
    M('flour', { name: 'Αλεύρι για όλες τις χρήσεις', category: 'Άλευρα & άμυλα', cost_unit: 'kg' });
    M('flourBread', { name: 'Αλεύρι σκληρό αρτοποιίας', category: 'Αρτοποιία', cost_unit: 'kg' });
    M('yeast', { name: 'Μαγιά νωπή', category: 'Αρτοποιία', cost_unit: 'kg' });
    M('salt', { name: 'Αλάτι', category: 'Αρτοποιία', cost_unit: 'kg' });
    M('water', { name: 'Νερό', category: 'Βασικά', cost_unit: 'l', density: 1, notes: 'Μηδενικό κόστος (ρητή επιλογή, όχι ελλιπής τιμή)' });
    M('eggs', { name: 'Αυγά μεσαία', category: 'Αυγά', attributes: 'Μ 53–63 g', cost_unit: 'pc', piece_weight: 55 });
    M('couv', { name: 'Κουβερτούρα υγείας 70%', category: 'Σοκολάτες & κακάο', attributes: '70% κακάο', cost_unit: 'kg' });
    M('cocoa', { name: 'Κακάο σκόνη 22–24%', category: 'Σοκολάτες & κακάο', cost_unit: 'kg' });
    M('praline', { name: 'Πραλίνα φουντουκιού 50%', category: 'Πραλίνες & πάστες', cost_unit: 'kg' });
    M('almond', { name: 'Αλεύρι αμυγδάλου', category: 'Ξηροί καρποί', cost_unit: 'kg' });
    M('gelatoBase', { name: 'Βάση gelato γάλακτος (σταθεροποιητής)', category: 'Gelato – βάσεις & σταθεροποιητές', cost_unit: 'kg' });
    M('milkPowder', { name: 'Γάλα σκόνη άπαχο', category: 'Gelato – βάσεις & σταθεροποιητές', cost_unit: 'kg' });
    const P = (key, o) => M(key, { kind: 'packaging', category: 'Συσκευασίες', cost_unit: 'pc', ...o });
    P('cup', { name: 'Ποτηράκι PET 150 ml' });
    P('lid', { name: 'Καπάκι για ποτηράκι 150 ml' });
    P('spoon', { name: 'Κουταλάκι μίας χρήσης' });
    P('gelatoCup', { name: 'Κύπελλο gelato χάρτινο 120 ml' });
    P('cakeBox', { name: 'Κουτί τούρτας 26 cm' });
    P('cakeBoard', { name: 'Βάση τούρτας χρυσή 26 cm' });

    // Χειροκίνητες τιμές για υλικά χωρίς παραστατικό
    const mp = db.prepare("INSERT INTO prices (material_id, doc_date, unit_net, vat_rate, source, note, is_sample, created_at) VALUES (?, ?, ?, ?, 'manual', ?, 1, ?)");
    mp.run(ids.eggs, '2026-09-10', 0.22, 13, 'Παράδειγμα', now);
    mp.run(ids.salt, '2026-09-10', 0.45, 13, 'Παράδειγμα', now);
    mp.run(ids.yeast, '2026-09-10', 3.2, 13, 'Παράδειγμα', now);
    mp.run(ids.flourBread, '2026-09-10', 0.9, 13, 'Παράδειγμα', now);
    mp.run(ids.almond, '2026-09-10', 12.5, 13, 'Παράδειγμα', now);
    mp.run(ids.milkPowder, '2026-09-10', 6.4, 13, 'Παράδειγμα', now);
    mp.run(ids.water, '2026-09-10', 0, 0, 'Μηδενικό κόστος', now);
  })();

  // Παραστατικά (περνούν από την κανονική διαδικασία επιβεβαίωσης)
  const createInvoice = (h, lines) => {
    const info = db
      .prepare(
        `INSERT INTO invoices (status, supplier_id, supplier_name, supplier_vat, number, doc_date, doc_type, net_total, vat_total, gross_total, notes, is_sample, created_at, updated_at)
         VALUES ('draft', @supplier_id, @supplier_name, @supplier_vat, @number, @doc_date, 'Τιμολόγιο', @net_total, @vat_total, @gross_total, 'Παραδειγματικό παραστατικό (χωρίς αρχείο)', 1, @now, @now)`,
      )
      .run({ ...h, now });
    const id = info.lastInsertRowid;
    replaceLines(db, id, lines.map((l) => ({ match_source: 'manual', ...l })));
    confirmInvoice(db, id, null);
    return id;
  };
  const sumNet = (ls) => ls.reduce((s, l) => s + l.net_amount, 0);
  const sumVat = (ls) => ls.reduce((s, l) => s + (l.net_amount * l.vat_rate) / 100, 0);
  const inv = (supplier, name, vat, number, date, lines) => {
    const n = Math.round(sumNet(lines) * 100) / 100;
    const v = Math.round(sumVat(lines) * 100) / 100;
    return createInvoice({ supplier_id: supplier, supplier_name: name, supplier_vat: vat, number, doc_date: date, net_total: n, vat_total: v, gross_total: Math.round((n + v) * 100) / 100 }, lines);
  };
  const dairy = `${SAMPLE_TAG} Γαλακτοκομικά Α.Ε.`;
  const raw = `${SAMPLE_TAG} Πρώτες Ύλες Ζαχαροπλαστικής Ο.Ε.`;
  const pack = `${SAMPLE_TAG} Συσκευασίες Ε.Π.Ε.`;
  const L = (o) => ({ qty_unit: 'unit', pack_count: 1, vat_rate: 13, ...o });

  ids.inv1 = inv(ids.supDairy, dairy, '999999991', 'Α-1021', '2026-09-15', [
    L({ supplier_code: 'BT250', description: 'ΒΟΥΤΥΡΟ ΑΓΕΛΑΔΟΣ 82% 2,5KG', material_id: ids.butter, qty: 4, unit_raw: 'ΤΕΜ', pack_size: 2.5, pack_unit: 'kg', unit_price: 22.5, net_amount: 90 }),
    L({ supplier_code: 'KR35', description: 'ΚΡΕΜΑ ΓΑΛΑΚΤΟΣ 35% 1LT', material_id: ids.cream35, qty: 12, unit_raw: 'ΤΕΜ', pack_size: 1, pack_unit: 'l', unit_price: 4.6, net_amount: 55.2 }),
    L({ supplier_code: 'GL1', description: 'ΓΑΛΑ ΠΛΗΡΕΣ 3,5% 1LT', material_id: ids.milk, qty: 12, unit_raw: 'ΤΕΜ', pack_size: 1, pack_unit: 'l', unit_price: 1.1, net_amount: 13.2 }),
  ]);
  ids.inv2 = inv(ids.supRaw, raw, '999999992', 'ΤΔΑ 3307', '2026-09-20', [
    L({ supplier_code: 'Z25', description: 'ΖΑΧΑΡΗ ΚΡΥΣΤΑΛΛΙΚΗ ΣΑΚΙ 25KG', material_id: ids.sugar, qty: 1, unit_raw: 'ΣΑΚ', pack_size: 25, pack_unit: 'kg', unit_price: 27.5, net_amount: 27.5 }),
    L({ supplier_code: 'ZA1', description: 'ΖΑΧΑΡΗ ΑΧΝΗ 1KG', material_id: ids.icing, qty: 10, unit_raw: 'ΤΕΜ', pack_size: 1, pack_unit: 'kg', unit_price: 1.5, net_amount: 15 }),
    L({ supplier_code: 'AL25', description: 'ΑΛΕΥΡΙ ΓΙΑ ΟΛΕΣ ΤΙΣ ΧΡΗΣΕΙΣ 25KG', material_id: ids.flour, qty: 1, unit_raw: 'ΣΑΚ', pack_size: 25, pack_unit: 'kg', unit_price: 21.25, net_amount: 21.25 }),
    L({ supplier_code: 'CV70', description: 'ΚΟΥΒΕΡΤΟΥΡΑ ΥΓΕΙΑΣ 70% 5KG', material_id: ids.couv, qty: 2, unit_raw: 'ΤΕΜ', pack_size: 5, pack_unit: 'kg', unit_price: 80, discount_pct: 6.25, net_amount: 150 }),
    L({ supplier_code: 'KK1', description: 'ΚΑΚΑΟ ΣΚΟΝΗ 22/24 1KG', material_id: ids.cocoa, qty: 1, unit_raw: 'ΤΕΜ', pack_size: 1, pack_unit: 'kg', unit_price: 9.8, net_amount: 9.8 }),
    L({ supplier_code: 'PR5', description: 'ΠΡΑΛΙΝΑ ΦΟΥΝΤΟΥΚΙΟΥ 50% 5KG', material_id: ids.praline, qty: 1, unit_raw: 'ΤΕΜ', pack_size: 5, pack_unit: 'kg', unit_price: 92.5, net_amount: 92.5 }),
    L({ supplier_code: 'DX5', description: 'ΔΕΞΤΡΟΖΗ 5KG', material_id: ids.dextrose, qty: 1, unit_raw: 'ΤΕΜ', pack_size: 5, pack_unit: 'kg', unit_price: 11, net_amount: 11 }),
    L({ supplier_code: 'GB2', description: 'ΒΑΣΗ GELATO ΓΑΛΑΚΤΟΣ 2KG', material_id: ids.gelatoBase, qty: 1, unit_raw: 'ΤΕΜ', pack_size: 2, pack_unit: 'kg', unit_price: 36, net_amount: 36 }),
    L({ description: 'ΜΕΤΑΦΟΡΙΚΑ', excluded: 1, qty: 1, unit_price: 5, net_amount: 5, vat_rate: 24 }),
  ]);
  ids.inv3 = inv(ids.supPack, pack, '999999993', '0458', '2026-09-25', [
    L({ supplier_code: 'PET150', description: 'ΠΟΤΗΡΙ PET 150ML ΚΙΒ 20Χ50', material_id: ids.cup, qty: 1, unit_raw: 'ΚΙΒ', pack_count: 20, pack_size: 50, pack_unit: 'pc', unit_price: 85, net_amount: 85, vat_rate: 24 }),
    L({ supplier_code: 'LID150', description: 'ΚΑΠΑΚΙ ΠΟΤΗΡΙΟΥ 150ML ΚΙΒ 1000', material_id: ids.lid, qty: 1, unit_raw: 'ΚΙΒ', pack_size: 1000, pack_unit: 'pc', unit_price: 32, net_amount: 32, vat_rate: 24 }),
    L({ supplier_code: 'SP01', description: 'ΚΟΥΤΑΛΑΚΙ ΔΙΑΦΑΝΕΣ ΚΙΒ 1000', material_id: ids.spoon, qty: 1, unit_raw: 'ΚΙΒ', pack_size: 1000, pack_unit: 'pc', unit_price: 18, net_amount: 18, vat_rate: 24 }),
    L({ supplier_code: 'GC120', description: 'ΚΥΠΕΛΛΟ GELATO 120ML ΚΙΒ 1000', material_id: ids.gelatoCup, qty: 1, unit_raw: 'ΚΙΒ', pack_size: 1000, pack_unit: 'pc', unit_price: 45, net_amount: 45, vat_rate: 24 }),
    L({ supplier_code: 'BX26', description: 'ΚΟΥΤΙ ΤΟΥΡΤΑΣ 26CM 50ΤΕΜ', material_id: ids.cakeBox, qty: 1, unit_raw: 'ΠΑΚ', pack_size: 50, pack_unit: 'pc', unit_price: 40, net_amount: 40, vat_rate: 24 }),
    L({ supplier_code: 'BS26', description: 'ΒΑΣΗ ΤΟΥΡΤΑΣ ΧΡΥΣΗ 26CM 100ΤΕΜ', material_id: ids.cakeBoard, qty: 1, unit_raw: 'ΠΑΚ', pack_size: 100, pack_unit: 'pc', unit_price: 30, net_amount: 30, vat_rate: 24 }),
  ]);

  // Συνταγές
  db.transaction(() => {
    const rec = db.prepare(
      `INSERT INTO recipes (name, category, notes, yield_mode, yield_qty, yield_unit, loss_pct, measure, density, piece_weight, labor_minutes, labor_rate, overhead_fixed, overhead_pct, overhead_base, is_sample, created_at, updated_at)
       VALUES (@name, @category, @notes, @yield_mode, @yield_qty, @yield_unit, @loss_pct, @measure, @density, @piece_weight, @labor_minutes, @labor_rate, @overhead_fixed, @overhead_pct, @overhead_base, 1, @now, @now)`,
    );
    const item = db.prepare('INSERT INTO recipe_items (recipe_id, position, material_id, sub_recipe_id, qty, unit, note) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const R = (key, o, items) => {
      ids[key] = rec.run({ category: null, notes: null, yield_qty: null, yield_unit: null, loss_pct: null, measure: 'mass', density: null, piece_weight: null, labor_minutes: null, labor_rate: null, overhead_fixed: null, overhead_pct: null, overhead_base: 'materials', now, ...o }).lastInsertRowid;
      items.forEach(([mKey, qty, unit, note, isRecipe], i) => item.run(ids[key], i, isRecipe ? null : ids[mKey], isRecipe ? ids[mKey] : null, qty, unit, note || null));
    };
    R(
      'rMousse',
      {
        name: 'Μους σοκολάτας',
        category: 'Κρέμες & μους',
        yield_mode: 'actual',
        yield_qty: 2000,
        yield_unit: 'g',
        labor_minutes: 25,
        labor_rate: 10,
        notes: '1. Λιώνουμε την κουβερτούρα στους 45 °C.\n2. Χτυπάμε τα αυγά με τη ζάχαρη σε αφράτο μείγμα.\n3. Χτυπάμε την κρέμα σε μαλακή σαντιγί.\n4. Ενώνουμε σταδιακά. Τα υλικά ζυγίζουν 2.200 g, το έτοιμο 2.000 g (απώλειες σκεύους/αέρα).',
      },
      [
        ['cream35', 1000, 'ml'],
        ['couv', 800, 'g'],
        ['sugar', 190, 'g'],
        ['eggs', 4, 'pc'],
      ],
    );
    R('rCrumble', { name: 'Crumble βουτύρου', category: 'Βάσεις', yield_mode: 'loss', loss_pct: 8, labor_minutes: 15, labor_rate: 10, notes: 'Ψήσιμο 160 °C για 15΄. Εκτιμώμενη φύρα ψησίματος 8%.' }, [
      ['butter', 250, 'g'],
      ['sugar', 250, 'g'],
      ['flour', 300, 'g'],
      ['almond', 200, 'g'],
    ]);
    R('rSponge', { name: 'Παντεσπάνι βανίλιας', category: 'Βάσεις', yield_mode: 'actual', yield_qty: 780, yield_unit: 'g', labor_minutes: 20, labor_rate: 10, notes: 'Ψήσιμο 170 °C, 30΄. Βάρος μετά το ψήσιμο 780 g.' }, [
      ['eggs', 10, 'pc'],
      ['sugar', 300, 'g'],
      ['flour', 300, 'g'],
    ]);
    R('rPastry', { name: 'Κρέμα ζαχαροπλαστικής', category: 'Κρέμες & μους', yield_mode: 'actual', yield_qty: 1.5, yield_unit: 'kg', labor_minutes: 20, labor_rate: 10, notes: 'Βράσιμο μέχρι να πήξει. Βάρος μετά το βράσιμο 1,5 kg.' }, [
      ['milk', 1, 'l'],
      ['sugar', 250, 'g'],
      ['eggs', 6, 'pc'],
      ['butter', 50, 'g'],
    ]);
    R('rGelatoBase', { name: 'Βάση gelato fior di latte', category: 'Gelato', yield_mode: 'none', measure: 'mass', labor_minutes: 30, labor_rate: 10, notes: 'Παστερίωση 85 °C, ωρίμανση 4–12 ώρες στους 4 °C.' }, [
      ['milk', 3, 'l'],
      ['cream35', 500, 'ml'],
      ['sugar', 550, 'g'],
      ['dextrose', 150, 'g'],
      ['milkPowder', 150, 'g'],
      ['gelatoBase', 50, 'g'],
    ]);
    R('rGelatoChoc', { name: 'Gelato σοκολάτα', category: 'Gelato', yield_mode: 'loss', loss_pct: 3, measure: 'mass', labor_minutes: 20, labor_rate: 10, notes: 'Χρήση της βάσης fior di latte (επιμέρους συνταγή). Φύρα παγωτομηχανής ~3%.' }, [
      ['rGelatoBase', 4000, 'g', null, true],
      ['cocoa', 200, 'g'],
      ['couv', 300, 'g'],
    ]);
    R('rBread', { name: 'Ψωμί χωριάτικο (ζύμη & ψήσιμο)', category: 'Αρτοποιία', yield_mode: 'actual', yield_qty: 2, yield_unit: 'pc', piece_weight: 750, labor_minutes: 30, labor_rate: 10, notes: 'Ζύμωμα, ωρίμανση 2 ώρες, ψήσιμο 220 °C. Βγάζει 2 καρβέλια των ~750 g.' }, [
      ['flourBread', 1000, 'g'],
      ['water', 680, 'ml'],
      ['yeast', 20, 'g'],
      ['salt', 20, 'g'],
    ]);
    R('rChantilly', { name: 'Σαντιγί', category: 'Κρέμες & μους', yield_mode: 'none', measure: 'mass', notes: 'Παράδειγμα ελλιπούς κοστολογίου: η κρέμα 48% δεν έχει τιμή.' }, [
      ['cream48', 1000, 'ml'],
      ['icing', 80, 'g'],
    ]);

    const prod = db.prepare(
      `INSERT INTO products (name, category, notes, batch_size, labor_minutes, labor_rate, overhead_fixed, overhead_pct, overhead_base, is_sample, created_at, updated_at)
       VALUES (@name, @category, @notes, @batch_size, @labor_minutes, @labor_rate, @overhead_fixed, @overhead_pct, @overhead_base, 1, @now, @now)`,
    );
    const pitem = db.prepare('INSERT INTO product_items (product_id, position, material_id, recipe_id, qty, unit, note) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const PR = (key, o, items) => {
      ids[key] = prod.run({ category: null, notes: null, batch_size: 1, labor_minutes: null, labor_rate: null, overhead_fixed: null, overhead_pct: null, overhead_base: 'materials', now, ...o }).lastInsertRowid;
      items.forEach(([k, qty, unit, isRecipe, note], i) => pitem.run(ids[key], i, isRecipe ? null : ids[k], isRecipe ? ids[k] : null, qty, unit, note || null));
    };
    PR('pCup', { name: 'Ποτηράκι μους σοκολάτας', category: 'Ποτηράκια', batch_size: 60, labor_minutes: 40, labor_rate: 10, notes: 'Συναρμολόγηση: 40 λεπτά για 60 τεμάχια.' }, [
      ['rMousse', 80, 'g', true],
      ['rCrumble', 25, 'g', true],
      ['praline', 15, 'g', false, 'Διακόσμηση'],
      ['cup', 1, 'pc'],
      ['lid', 1, 'pc'],
      ['spoon', 1, 'pc'],
    ]);
    PR('pGelato', { name: 'Μερίδα gelato σοκολάτα 120 g', category: 'Gelato', notes: 'Μερίδα σε κύπελλο.' }, [
      ['rGelatoChoc', 120, 'g', true],
      ['gelatoCup', 1, 'pc'],
      ['spoon', 1, 'pc'],
    ]);
    PR('pCake', { name: 'Τούρτα σοκολάτα 26 cm', category: 'Τούρτες', batch_size: 1, labor_minutes: 45, labor_rate: 10, overhead_pct: 10, overhead_base: 'materials', notes: 'Λειτουργικά 10% επί των πρώτων υλών που δεν έχουν ήδη επιβαρυνθεί.' }, [
      ['rSponge', 780, 'g', true],
      ['rMousse', 1200, 'g', true],
      ['rPastry', 300, 'g', true],
      ['couv', 100, 'g', false, 'Γλάσο / διακόσμηση'],
      ['cakeBox', 1, 'pc'],
      ['cakeBoard', 1, 'pc'],
    ]);
    PR('pBread', { name: 'Ψωμί χωριάτικο 750 g', category: 'Αρτοποιία' }, [['rBread', 1, 'pc', true]]);
    PR('pPasta', { name: 'Πάστα σαντιγί', category: 'Πάστες', notes: 'Παράδειγμα: ελλιπές κοστολόγιο λόγω υλικού χωρίς τιμή.' }, [
      ['rSponge', 40, 'g', true],
      ['rChantilly', 50, 'g', true],
    ]);
  })();

  // Στιγμιότυπο πριν από νέα τιμή βουτύρου, ώστε να φαίνεται η σύγκριση.
  createSnapshot(db, { name: `${SAMPLE_TAG} — Κοστολόγιο Σεπτεμβρίου`, note: 'Δημιουργήθηκε αυτόματα με τα παραδειγματικά δεδομένα', isSample: 1 });

  // Νεότερο τιμολόγιο με αύξηση τιμής βουτύρου → καταγράφεται μεταβολή με επηρεαζόμενα προϊόντα.
  ids.inv4 = inv(ids.supDairy, dairy, '999999991', 'Α-1107', '2026-10-20', [
    L({ supplier_code: 'BT250', description: 'ΒΟΥΤΥΡΟ ΑΓΕΛΑΔΟΣ 82% 2,5KG', material_id: ids.butter, qty: 4, unit_raw: 'ΤΕΜ', pack_size: 2.5, pack_unit: 'kg', unit_price: 23.75, net_amount: 95 }),
    L({ supplier_code: 'KR35', description: 'ΚΡΕΜΑ ΓΑΛΑΚΤΟΣ 35% 1LT', material_id: ids.cream35, qty: 12, unit_raw: 'ΤΕΜ', pack_size: 1, pack_unit: 'l', unit_price: 4.6, net_amount: 55.2 }),
  ]);

  // Οι μεταβολές από την αρχική φόρτωση (χωρίς τιμή → τιμή) δεν έχουν αξία ιστορικού· κρατάμε μόνο την τελευταία.
  const sampleInv = [ids.inv1, ids.inv2, ids.inv3];
  db.prepare(`DELETE FROM price_events WHERE invoice_id IN (${sampleInv.map(() => '?').join(',')})`).run(...sampleInv);
  db.prepare('UPDATE price_events SET is_sample = 1 WHERE invoice_id = ?').run(ids.inv4);
  db.prepare('UPDATE prices SET is_sample = 1 WHERE invoice_id IN (SELECT id FROM invoices WHERE is_sample = 1)').run();

  db.prepare("INSERT INTO production_plans (name, plan_date, notes, entries, is_sample, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)").run(
    `${SAMPLE_TAG} — Παραγωγή Σαββάτου`,
    '2026-11-07',
    'Παράδειγμα προγραμματισμού',
    JSON.stringify([
      { kind: 'product', id: ids.pCup, qty: 60 },
      { kind: 'product', id: ids.pCake, qty: 2 },
      { kind: 'product', id: ids.pGelato, qty: 40 },
    ]),
    now,
    now,
  );
  setSettings(db, { sample_seeded: true });
  return ids;
}

/** Διαγραφή παραδειγματικών δεδομένων. Ό,τι χρησιμοποιείται από δικά σας δεδομένα διατηρείται (χωρίς σήμανση). */
export function deleteSampleData(db) {
  const kept = [];
  db.transaction(() => {
    db.prepare('DELETE FROM snapshots WHERE is_sample = 1').run();
    db.prepare('DELETE FROM production_plans WHERE is_sample = 1').run();
    db.prepare('DELETE FROM price_events WHERE is_sample = 1').run();
    db.prepare('DELETE FROM products WHERE is_sample = 1').run();

    // Συνταγές: κράτα όσες χρησιμοποιούνται από μη παραδειγματικές συνταγές/προϊόντα (και αναδρομικά τις επιμέρους τους).
    const keepRecipes = new Set();
    const usedBy = db
      .prepare(
        `SELECT sub_recipe_id AS id FROM recipe_items ri JOIN recipes r ON r.id = ri.recipe_id WHERE r.is_sample = 0 AND ri.sub_recipe_id IS NOT NULL
         UNION SELECT recipe_id AS id FROM product_items WHERE recipe_id IS NOT NULL`,
      )
      .all()
      .map((r) => r.id);
    const stack = [...usedBy];
    while (stack.length) {
      const id = stack.pop();
      if (keepRecipes.has(id)) continue;
      keepRecipes.add(id);
      for (const r of db.prepare('SELECT sub_recipe_id FROM recipe_items WHERE recipe_id = ? AND sub_recipe_id IS NOT NULL').all(id)) stack.push(r.sub_recipe_id);
    }
    for (const r of db.prepare('SELECT id, name FROM recipes WHERE is_sample = 1').all()) {
      if (keepRecipes.has(r.id)) {
        db.prepare('UPDATE recipes SET is_sample = 0 WHERE id = ?').run(r.id);
        kept.push(`Συνταγή: ${r.name}`);
      }
    }
    db.prepare('DELETE FROM recipe_items WHERE recipe_id IN (SELECT id FROM recipes WHERE is_sample = 1)').run();
    db.prepare('DELETE FROM recipes WHERE is_sample = 1').run();

    db.prepare('DELETE FROM invoices WHERE is_sample = 1').run();
    db.prepare('DELETE FROM prices WHERE is_sample = 1').run();

    for (const m of db.prepare('SELECT id, name FROM materials WHERE is_sample = 1').all()) {
      const used =
        db.prepare('SELECT 1 FROM recipe_items WHERE material_id = ? LIMIT 1').get(m.id) ||
        db.prepare('SELECT 1 FROM product_items WHERE material_id = ? LIMIT 1').get(m.id) ||
        db.prepare('SELECT 1 FROM prices WHERE material_id = ? LIMIT 1').get(m.id);
      if (used) {
        db.prepare('UPDATE materials SET is_sample = 0 WHERE id = ?').run(m.id);
        kept.push(`Υλικό: ${m.name}`);
      } else db.prepare('DELETE FROM materials WHERE id = ?').run(m.id);
    }
    for (const s of db.prepare('SELECT id, name FROM suppliers WHERE is_sample = 1').all()) {
      const used = db.prepare('SELECT 1 FROM invoices WHERE supplier_id = ? LIMIT 1').get(s.id) || db.prepare('SELECT 1 FROM prices WHERE supplier_id = ? LIMIT 1').get(s.id);
      if (used) {
        db.prepare('UPDATE suppliers SET is_sample = 0 WHERE id = ?').run(s.id);
        kept.push(`Προμηθευτής: ${s.name}`);
      } else db.prepare('DELETE FROM suppliers WHERE id = ?').run(s.id);
    }
    db.prepare("UPDATE materials SET price_mode = 'latest', pinned_price_id = NULL WHERE price_mode = 'pinned' AND pinned_price_id NOT IN (SELECT id FROM prices)").run();
  })();
  return { kept };
}

export function maybeSeed(db, config) {
  if (!config.seedSample) return false;
  if (getSettings(db).sample_seeded) return false;
  if (!isEmpty(db)) return false;
  seedSampleData(db);
  return true;
}
