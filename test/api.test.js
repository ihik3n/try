import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, loggedIn } from './helpers.js';
import { createEngine } from '../shared/costing.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('πρόσβαση: χωρίς σύνδεση δεν δίνονται δεδομένα, ρύθμιση πρώτου χρήστη, λάθος κωδικός', async () => {
  const s = await startServer();
  try {
    const st = await s.api.get('/api/auth/status');
    assert.equal(st.needsSetup, true);
    const r = await s.api.get('/api/catalog', { raw: true });
    assert.equal(r.status, 401);
    await s.api.post('/api/auth/setup', { username: 'admin', password: 'kodikos123' });
    assert.equal((await s.api.get('/api/auth/status')).user.username, 'admin');
    const again = await s.api.post('/api/auth/setup', { username: 'x', password: 'kodikos123' }, { raw: true });
    assert.equal(again.status, 409);
    await s.api.post('/api/auth/logout');
    const bad = await s.api.post('/api/auth/login', { username: 'admin', password: 'λάθος' }, { raw: true });
    assert.equal(bad.status, 401);
    await s.api.post('/api/auth/login', { username: 'admin', password: 'kodikos123' });
    assert.ok((await s.api.get('/api/catalog')).materials);
    // CSRF: αλλαγές χωρίς το header της εφαρμογής απορρίπτονται
    const res = await fetch(`${s.base}/api/settings`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 403);
  } finally {
    await s.close();
  }
});

async function mkMaterial(api, o) {
  return api.post('/api/materials', { kind: 'ingredient', ...o });
}

async function mkInvoice(api, header, lines) {
  const inv = await api.post('/api/invoices?extract=0', new FormData());
  return api.put(`/api/invoices/${inv.id}`, { ...header, lines });
}

test('βασική διαδρομή: τιμολόγιο → τιμή → συνταγή → προϊόν → μεταβολή τιμής', async () => {
  const s = await loggedIn();
  const { api } = s;
  try {
    const butter = await mkMaterial(api, { name: 'Βούτυρο 82%', cost_unit: 'kg' });
    const sugar = await mkMaterial(api, { name: 'Ζάχαρη', cost_unit: 'kg' });
    const cup = await mkMaterial(api, { name: 'Ποτηράκι', cost_unit: 'pc', kind: 'packaging' });

    // Τιμολόγιο: 4 × 2,5 kg βούτυρο = 90 € → 9 €/kg
    let inv = await mkInvoice(api, { supplier_name: 'Γαλακτοκομικά Χ', number: 'Α-1', doc_date: '2026-10-01', net_total: 132.5 }, [
      { description: 'ΒΟΥΤΥΡΟ 82% 2,5KG', supplier_code: 'B1', material_id: butter.id, match_source: 'manual', qty: 4, qty_unit: 'unit', pack_count: 1, pack_size: 2.5, pack_unit: 'kg', net_amount: 90, vat_rate: 13 },
      { description: 'ΖΑΧΑΡΗ 25KG', material_id: sugar.id, match_source: 'manual', qty: 1, qty_unit: 'unit', pack_size: 25, pack_unit: 'kg', net_amount: 27.5, vat_rate: 13 },
      { description: 'ΠΟΤΗΡΙ ΚΙΒ 20Χ50', material_id: cup.id, match_source: 'manual', qty: 1, qty_unit: 'unit', pack_count: 20, pack_size: 50, pack_unit: 'pc', net_amount: 15, vat_rate: 24 },
    ]);
    assert.ok(inv.computed.canConfirm, JSON.stringify(inv.computed.lines.map((l) => l.errors)));
    close(inv.computed.lines[0].unitCost, 9);
    const conf = await api.post(`/api/invoices/${inv.id}/confirm`);
    assert.equal(conf.invoice.status, 'confirmed');
    assert.ok(conf.event.changes.some((c) => c.material_id === butter.id && c.new_net === 9));

    let cat = await api.get('/api/catalog');
    const mB = cat.materials.find((m) => m.id === butter.id);
    close(mB.price.unit_net, 9);
    assert.equal(mB.price.doc_date, '2026-10-01');
    close(cat.materials.find((m) => m.id === cup.id).price.unit_net, 0.015);
    assert.equal(cat.suppliers.length, 1);

    // Συνταγή και προϊόν
    const rec = await api.post('/api/recipes', {
      name: 'Βάση',
      yield_mode: 'actual',
      yield_qty: 2000,
      yield_unit: 'g',
      items: [
        { material_id: butter.id, qty: 1, unit: 'kg' },
        { material_id: sugar.id, qty: 1200, unit: 'g' },
      ],
    });
    const prod = await api.post('/api/products', {
      name: 'Ποτηράκι βάσης',
      items: [
        { recipe_id: rec.id, qty: 100, unit: 'g' },
        { material_id: cup.id, qty: 1, unit: 'pc' },
      ],
    });
    cat = await api.get('/api/catalog');
    const e1 = createEngine(cat);
    close(e1.evalRecipe(rec.id).perUnit.total, (9 + 1.2 * 1.1) / 2);
    const p1 = e1.evalProduct(prod.id).perUnit.total;
    close(p1, 0.1 * ((9 + 1.32) / 2) + 0.015);

    // Νεότερο τιμολόγιο: βούτυρο 10 €/kg → ενημερώνεται και το προϊόν, καταγράφεται επίδραση
    inv = await mkInvoice(api, { supplier_name: 'Γαλακτοκομικά Χ', number: 'Α-2', doc_date: '2026-10-15' }, [
      { description: 'ΒΟΥΤΥΡΟ 82% 2,5KG', supplier_code: 'B1', qty: 4, qty_unit: 'unit', pack_size: 2.5, pack_unit: 'kg', net_amount: 100, vat_rate: 13 },
    ]);
    // Η αποθηκευμένη αντιστοίχιση προτείνεται αυτόματα
    const matched = await api.post(`/api/invoices/${inv.id}/match`);
    assert.equal(matched.lines[0].material_id, butter.id);
    assert.equal(matched.lines[0].match_source, 'alias');
    const c2 = await api.post(`/api/invoices/${inv.id}/confirm`);
    const ch = c2.event.changes.find((c) => c.material_id === butter.id);
    close(ch.old_price, 9);
    close(ch.new_price, 10);
    close(ch.pct, (1 / 9) * 100);
    const imp = c2.event.impacts.find((i) => i.kind === 'product' && i.id === prod.id);
    close(imp.old_cost, p1);
    close(imp.new_cost - imp.old_cost, 0.1 * 0.5);
    assert.ok(c2.event.impacts.some((i) => i.kind === 'recipe' && i.id === rec.id));

    // Παλιότερο τιμολόγιο που ανεβαίνει αργότερα ΔΕΝ αντικαθιστά τη νεότερη τιμή
    inv = await mkInvoice(api, { supplier_name: 'Γαλακτοκομικά Χ', number: 'Α-0', doc_date: '2026-09-01' }, [
      { description: 'ΒΟΥΤΥΡΟ', material_id: butter.id, match_source: 'manual', qty: 10, qty_unit: 'kg', net_amount: 80, vat_rate: 13 },
    ]);
    const c3 = await api.post(`/api/invoices/${inv.id}/confirm`);
    assert.equal(c3.event, null);
    cat = await api.get('/api/catalog');
    close(cat.materials.find((m) => m.id === butter.id).price.unit_net, 10);
    const detail = await api.get(`/api/materials/${butter.id}/detail`);
    assert.equal(detail.prices.length, 3);

    // Χειροκίνητη επιλογή παλιότερης τιμής
    const old = detail.prices.find((p) => p.doc_date === '2026-09-01');
    const sel = await api.put(`/api/materials/${butter.id}/price-selection`, { mode: 'pinned', price_id: old.id });
    close(sel.event.changes[0].new_net, 8);
    cat = await api.get('/api/catalog');
    assert.equal(cat.materials.find((m) => m.id === butter.id).price.pinned, 1);
    await api.put(`/api/materials/${butter.id}/price-selection`, { mode: 'latest' });

    // Επαναφορά σε πρόχειρο: αφαιρούνται οι τιμές του, επιστρέφει η προηγούμενη
    const second = (await api.get('/api/invoices')).find((x) => x.number === 'Α-2');
    const re = await api.post(`/api/invoices/${second.id}/reopen`);
    assert.equal(re.invoice.status, 'draft');
    close(re.event.changes.find((c) => c.material_id === butter.id).new_net, 9);

    // Ιστορικό μεταβολών
    const events = await api.get('/api/price-events');
    assert.ok(events.length >= 3);

    // Η μονάδα κοστολόγησης δεν αλλάζει όταν υπάρχουν τιμές
    const bad = await api.put(`/api/materials/${butter.id}`, { name: 'Βούτυρο 82%', cost_unit: 'l' }, { raw: true });
    assert.equal(bad.status, 409);
    // Διαγραφή υλικού σε χρήση αποτρέπεται
    const del = await api.del(`/api/materials/${sugar.id}`, { raw: true });
    assert.equal(del.status, 409);
  } finally {
    await s.close();
  }
});

test('επιβεβαίωση αποτρέπεται με ελλιπή στοιχεία, προτάσεις χωρίς έλεγχο και πιθανά διπλά', async () => {
  const s = await loggedIn();
  const { api } = s;
  try {
    const butter = await mkMaterial(api, { name: 'Βούτυρο', cost_unit: 'kg' });
    let inv = await mkInvoice(api, { supplier_name: 'Χ', number: '55', doc_date: '2026-10-01' }, [
      { description: 'ΒΟΥΤΥΡΟ', material_id: butter.id, match_source: 'manual', qty: 4, qty_unit: 'unit', net_amount: null },
    ]);
    const r1 = await api.post(`/api/invoices/${inv.id}/confirm`, {}, { raw: true });
    assert.equal(r1.status, 422);
    // Πρόταση χωρίς επιβεβαίωση
    inv = await api.put(`/api/invoices/${inv.id}`, { lines: [{ description: 'ΒΟΥΤΥΡΟ', material_id: butter.id, match_source: 'ai', qty: 10, qty_unit: 'kg', net_amount: 90, vat_rate: 13 }] });
    assert.ok(inv.computed.lines[0].errors.some((e) => e.code === 'unconfirmed_match'));
    inv = await api.put(`/api/invoices/${inv.id}`, { lines: [{ description: 'ΒΟΥΤΥΡΟ', material_id: butter.id, match_source: 'manual', qty: 10, qty_unit: 'kg', net_amount: 90, vat_rate: 13 }] });
    await api.post(`/api/invoices/${inv.id}/confirm`);

    // Ίδιος προμηθευτής + αριθμός → προειδοποίηση διπλού
    const dup = await mkInvoice(api, { supplier_name: 'χ', number: ' 055', doc_date: '2026-10-02' }, [
      { description: 'ΒΟΥΤΥΡΟ', material_id: butter.id, match_source: 'manual', qty: 10, qty_unit: 'kg', net_amount: 90, vat_rate: 13 },
    ]);
    assert.equal(dup.duplicates.length, 1);
    const r2 = await api.post(`/api/invoices/${dup.id}/confirm`, {}, { raw: true });
    assert.equal(r2.status, 409);
    assert.ok(r2.data.duplicates);
    await api.post(`/api/invoices/${dup.id}/confirm`, { dup_ack: true });
  } finally {
    await s.close();
  }
});

test('κυκλικές συνδέσεις συνταγών απορρίπτονται', async () => {
  const s = await loggedIn();
  const { api } = s;
  try {
    const m = await mkMaterial(api, { name: 'Ζάχαρη', cost_unit: 'kg' });
    const a = await api.post('/api/recipes', { name: 'Α', items: [{ material_id: m.id, qty: 100, unit: 'g' }] });
    const b = await api.post('/api/recipes', { name: 'Β', items: [{ sub_recipe_id: a.id, qty: 100, unit: 'g' }] });
    const r = await api.put(`/api/recipes/${a.id}`, { name: 'Α', items: [{ sub_recipe_id: b.id, qty: 10, unit: 'g' }] }, { raw: true });
    assert.equal(r.status, 400);
    const self = await api.put(`/api/recipes/${a.id}`, { name: 'Α', items: [{ sub_recipe_id: a.id, qty: 10, unit: 'g' }] }, { raw: true });
    assert.equal(self.status, 400);
    const d = await api.del(`/api/recipes/${a.id}`, { raw: true });
    assert.equal(d.status, 409);
    const dup = await api.post(`/api/recipes/${b.id}/duplicate`);
    const cat = await api.get('/api/catalog');
    const copy = cat.recipes.find((x) => x.id === dup.id);
    assert.equal(copy.name, 'Β (αντίγραφο)');
    assert.equal(copy.items[0].sub_recipe_id, a.id);
  } finally {
    await s.close();
  }
});

test('παραδειγματικά δεδομένα: φόρτωση, κοστολόγηση, διαγραφή', async () => {
  const s = await loggedIn({ seed: true });
  const { api } = s;
  try {
    const cat = await api.get('/api/catalog');
    assert.ok(cat.has_sample);
    const e = createEngine(cat);
    const cup = cat.products.find((p) => p.name === 'Ποτηράκι μους σοκολάτας');
    const r = e.evalProduct(cup.id);
    assert.ok(r.complete, JSON.stringify(r.issues));
    const butter = cat.materials.find((m) => m.name.startsWith('Βούτυρο'));
    close(butter.price.unit_net, 9.5); // νεότερο τιμολόγιο 20/10
    const mousse = e.evalRecipe(cat.recipes.find((x) => x.name === 'Μους σοκολάτας').id);
    close(mousse.input.mass_g, 2200);
    close(mousse.yield.base, 2000);
    const pasta = cat.products.find((p) => p.name === 'Πάστα σαντιγί');
    assert.equal(e.evalProduct(pasta.id).complete, false);
    for (const p of cat.products.filter((p) => p.name !== 'Πάστα σαντιγί')) assert.ok(e.evalProduct(p.id).complete, p.name);

    const events = await api.get('/api/price-events');
    assert.equal(events.length, 1);
    assert.ok(events[0].impacts.some((i) => i.name === 'Ποτηράκι μους σοκολάτας'));
    const snaps = await api.get('/api/snapshots');
    const cmp = await api.get(`/api/snapshots/${snaps[0].id}`);
    const cmpCup = cmp.items.find((i) => i.kind === 'product' && i.id === cup.id);
    assert.ok(cmpCup.new_cost > cmpCup.old_cost);
    assert.ok(cmp.materials.some((m) => m.id === butter.id && Math.abs(m.old_price - 9) < 1e-9));

    // Δικό μου προϊόν που χρησιμοποιεί παραδειγματική συνταγή → διατηρείται
    const mousseId = cat.recipes.find((x) => x.name === 'Μους σοκολάτας').id;
    await api.post('/api/products', { name: 'Δικό μου', items: [{ recipe_id: mousseId, qty: 50, unit: 'g' }] });
    const res = await api.post('/api/sample-data/delete');
    assert.ok(res.kept.some((k) => k.includes('Μους σοκολάτας')));
    const after = await api.get('/api/catalog');
    assert.equal(after.has_sample, false);
    assert.ok(after.recipes.some((x) => x.id === mousseId));
    assert.equal(after.products.length, 1);
    // Οι παραδειγματικές τιμές διαγράφονται: το δικό μου προϊόν γίνεται «Ελλιπές» (όχι δωρεάν) μέχρι να μπουν πραγματικές τιμές.
    const mine = createEngine(after).evalProduct(after.products[0].id);
    assert.equal(mine.complete, false);
    assert.ok(mine.issues.every((i) => i.code === 'missing_price'));
    assert.equal((await api.get('/api/invoices')).length, 0);
  } finally {
    await s.close();
  }
});

test('αντίγραφο ασφαλείας και επαναφορά (με παραστατικά)', async () => {
  const s = await loggedIn({ seed: true });
  const { api } = s;
  try {
    const fd = new FormData();
    fd.append('files', new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' }), 'τιμολόγιο.pdf');
    const inv = await api.post('/api/invoices?extract=0', fd);
    assert.equal(inv.files.length, 1);
    assert.equal(inv.files[0].original_name, 'τιμολόγιο.pdf');
    const file = await api.get(`/api/files/${inv.files[0].id}`);
    assert.equal(file.toString(), '%PDF-1.4 test');

    const zip = await api.get('/api/backup/download');
    assert.ok(zip.length > 100);
    const before = await api.get('/api/catalog');
    // Αλλαγές μετά το αντίγραφο
    await api.post('/api/sample-data/delete');
    await api.del(`/api/invoices/${inv.id}`);
    assert.equal((await api.get('/api/catalog')).materials.length, 0);
    // Επαναφορά
    const fd2 = new FormData();
    fd2.append('file', new Blob([zip], { type: 'application/zip' }), 'backup.zip');
    const r = await api.post('/api/backup/restore', fd2);
    assert.ok(r.preRestoreBackup);
    const after = await api.get('/api/catalog');
    assert.equal(after.materials.length, before.materials.length);
    assert.equal(after.recipes.length, before.recipes.length);
    const invs = await api.get('/api/invoices');
    const restored = invs.find((x) => x.id === inv.id);
    assert.ok(restored);
    const full = await api.get(`/api/invoices/${inv.id}`);
    const file2 = await api.get(`/api/files/${full.files[0].id}`);
    assert.equal(file2.toString(), '%PDF-1.4 test');
    const list = await api.get('/api/backups');
    assert.ok(list.backups.some((b) => b.kind === 'pre-restore'));
    // Λάθος αρχείο
    const fd3 = new FormData();
    fd3.append('file', new Blob([Buffer.from('not a zip')]), 'x.zip');
    const bad = await api.post('/api/backup/restore', fd3, { raw: true });
    assert.equal(bad.status, 400);
  } finally {
    await s.close();
  }
});

test('εξαγωγές Excel/CSV', async () => {
  const s = await loggedIn({ seed: true });
  const { api } = s;
  try {
    for (const name of ['materials', 'prices', 'recipes', 'products', 'all']) {
      const x = await api.get(`/api/export/${name}.xlsx`);
      assert.equal(x.subarray(0, 2).toString(), 'PK');
    }
    const csv = (await api.get('/api/export/materials.csv')).toString('utf8');
    assert.ok(csv.startsWith('﻿Υλικό;'));
    assert.ok(csv.includes('Βούτυρο αγελάδος 82%'));
    assert.ok(csv.includes('9,5'));
    const cat = await api.get('/api/catalog');
    const cup = cat.products.find((p) => p.name === 'Ποτηράκι μους σοκολάτας');
    const plan = await api.post('/api/export/plan.xlsx', { name: 'Δοκιμή', entries: [{ kind: 'product', id: cup.id, qty: 60 }] });
    assert.equal(plan.subarray(0, 2).toString(), 'PK');
    const planCsv = (await api.post('/api/export/plan.csv', { entries: [{ kind: 'product', id: cup.id, qty: 60 }] })).toString('utf8');
    assert.ok(planCsv.includes('Κουβερτούρα'));
  } finally {
    await s.close();
  }
});

test('ανάγνωση με AI (εικονική υπηρεσία): πρόχειρο με αβέβαιες τιμές και προτάσεις', async () => {
  const fakeAi = {
    enabled: true,
    model: 'test',
    async extractInvoice() {
      return {
        model: 'test',
        output: {
          readable: true,
          document_type: 'Τιμολόγιο',
          supplier_name: 'ΓΑΛΑΚΤΟΚΟΜΙΚΑ Χ',
          supplier_vat: '123456789',
          number: 'Β-77',
          date: '2026-11-01',
          net_total: 150,
          vat_total: 19.5,
          gross_total: 169.5,
          invoice_discount: null,
          header_uncertain_fields: [],
          lines: [
            { supplier_code: 'K35', description: 'ΚΡΕΜΑ ΓΑΛΑΚΤΟΣ 35% 1LT', qty: 12, unit_text: 'ΤΕΜ', qty_unit: 'unit', pack_count: null, pack_size: 1, pack_unit: 'l', pack_from_description: true, unit_price: 5, discount_pct: null, discount_amount: null, net_amount: 60, vat_rate: 13, vat_amount: 7.8, is_material: true, uncertain_fields: [], note: null },
            { supplier_code: 'K48', description: 'ΚΡΕΜΑ ΓΑΛΑΚΤΟΣ 48% 1LT', qty: 12, unit_text: 'ΤΕΜ', qty_unit: 'unit', pack_count: null, pack_size: 1, pack_unit: 'l', pack_from_description: true, unit_price: 7.5, discount_pct: null, discount_amount: null, net_amount: 90, vat_rate: 13, vat_amount: null, is_material: true, uncertain_fields: ['net_amount'], note: 'Θολό ποσό' },
          ],
          warnings: [],
        },
      };
    },
    async suggestMatches(lines) {
      // Η «AI» προτείνει λανθασμένα την 35% και για τη 48% → πρέπει να απορριφθεί από τον έλεγχο ποσοστών
      return { model: 'test', output: { matches: lines.map((l) => ({ line_index: l.index, material_id: 1, confidence: 0.9, reason: 'κρέμα' })) } };
    },
  };
  const s = await loggedIn({ ai: fakeAi });
  const { api } = s;
  try {
    const c35 = await mkMaterial(api, { name: 'Κρέμα γάλακτος 35%', cost_unit: 'l', density: 0.99 });
    assert.equal(c35.id, 1);
    await mkMaterial(api, { name: 'Κρέμα γάλακτος 48%', cost_unit: 'l' });
    const fd = new FormData();
    fd.append('files', new Blob([Buffer.from([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), 'photo.jpg');
    let inv = await api.post('/api/invoices', fd);
    for (let i = 0; i < 50 && inv.ai_status === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 20));
      inv = await api.get(`/api/invoices/${inv.id}`);
    }
    assert.equal(inv.ai_status, 'done');
    assert.equal(inv.number, 'Β-77');
    assert.equal(inv.doc_date, '2026-11-01');
    assert.equal(inv.lines.length, 2);
    // 35% → ομοιότητα κειμένου (πρόταση προς έλεγχο)
    assert.equal(inv.lines[0].material_id, c35.id);
    assert.ok(['fuzzy', 'ai'].includes(inv.lines[0].match_source));
    // 48% → ΟΧΙ η κρέμα 35%
    assert.notEqual(inv.lines[1].material_id, c35.id);
    assert.deepEqual(inv.lines[1].flags, ['net_amount']);
    assert.equal(inv.computed.canConfirm, false);
    close(inv.computed.lines[0].unitCost, 5);
  } finally {
    await s.close();
  }
});
