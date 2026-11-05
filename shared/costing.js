// Μηχανή κοστολόγησης: συνταγές (με επιμέρους συνταγές), τελικά προϊόντα και προγραμματισμός παραγωγής.
//
// Κανόνες:
//  • Κάθε υλικό κοστίζει: ποσότητα (μετατρεπόμενη στη μονάδα κοστολόγησης) × ενεργή τιμή.
//  • Υλικό χωρίς τιμή ή αδύνατη μετατροπή → «Ελλιπές κοστολόγιο» (ΔΕΝ θεωρείται δωρεάν).
//  • Απόδοση συνταγής: είτε πραγματική τελική ποσότητα, είτε εκτιμώμενη φύρα %, είτε σύνολο υλικών.
//    Ποτέ και τα δύο μαζί, ώστε η ίδια απώλεια να μη μετριέται διπλά.
//  • Επιμέρους συνταγή: χρεώνεται το αναλογικό μερίδιο του κόστους της παρτίδας της
//    (ποσότητα που χρησιμοποιείται / απόδοση παρτίδας). Κάθε συνιστώσα (πρώτες ύλες, συσκευασίες,
//    εργασία, λειτουργικά) μεταφέρεται ως έχει, άρα δεν υπάρχει διπλομέτρηση.
//  • Εργασία κάθε επιπέδου αφορά μόνο τις δικές του εργασίες.
//  • Λειτουργικά ως ποσοστό: εφαρμόζονται μόνο σε κόστη που ΔΕΝ έχουν ήδη επιβαρυνθεί με ποσοστό
//    σε επιμέρους συνταγή.
//  • Στρογγυλοποίηση γίνεται μόνο στην εμφάνιση.

import { convert, UNITS, DIM_BASE, DIM_COST_UNIT, isPositive, isFiniteNumber, CONVERSION_REASON_TEXT } from './units.js';

export const OVERHEAD_BASES = {
  materials: ['materials'],
  materials_packaging: ['materials', 'packaging'],
  direct: ['materials', 'packaging', 'labor'],
};

export const OVERHEAD_BASE_LABEL = {
  materials: 'πρώτες ύλες',
  materials_packaging: 'πρώτες ύλες + συσκευασίες',
  direct: 'πρώτες ύλες + συσκευασίες + εργασία',
};

export const COMPONENTS = ['materials', 'packaging', 'labor', 'overhead'];
export const COMPONENT_LABEL = {
  materials: 'Πρώτες ύλες',
  packaging: 'Συσκευασίες',
  labor: 'Εργασία',
  overhead: 'Λειτουργικά έξοδα',
};

// Κύριο κόστος που εμφανίζεται: χωρίς εργασία προσωπικού (προεπιλογή) ή με εργασία.
// Η εργασία υπολογίζεται πάντα και εμφανίζεται χωριστά· αλλάζει μόνο ποιο ποσό είναι το «κύριο».
export const HEADLINE_MODES = ['without_labor', 'with_labor'];
export const HEADLINE_LABEL = { without_labor: 'χωρίς εργασία', with_labor: 'με εργασία' };
export function headlineMode(settings) {
  return settings?.cost_headline === 'with_labor' ? 'with_labor' : 'without_labor';
}
/** Κύριο ποσό από ανάλυση {materials, packaging, labor, overhead, total} ή από γραμμή με components. */
export function headline(c, mode) {
  if (!c) return null;
  const total = c.total ?? (c.cost != null ? c.cost : null);
  if (total == null) return null;
  if (mode === 'with_labor') return total;
  const labor = c.labor ?? c.components?.labor ?? 0;
  return total - labor;
}

const zero = () => ({ materials: 0, packaging: 0, labor: 0, overhead: 0 });
const zeroCovered = () => ({ materials: 0, packaging: 0, labor: 0 });
const total = (c) => c.materials + c.packaging + c.labor + c.overhead;

// Στις γραμμές συνταγής η επιμέρους συνταγή είναι το sub_recipe_id (το recipe_id είναι η γονική συνταγή).
// Στις γραμμές προϊόντος η συνταγή είναι το recipe_id.
function subRef(kind, item) {
  const v = kind === 'recipe' ? item.sub_recipe_id : item.recipe_id;
  return v ?? null;
}

function toMap(list) {
  if (list instanceof Map) return list;
  const m = new Map();
  for (const x of list || []) m.set(x.id, x);
  return m;
}

function unitWord(u) {
  return { kg: 'κιλά', l: 'λίτρα', pc: 'τεμάχια', g: 'γραμμάρια', ml: 'ml' }[u] || u;
}

/** Ενεργή τιμή υλικού στη βάση κοστολόγησης (χωρίς/με ΦΠΑ). */
export function effectiveUnitPrice(material, basis) {
  const p = material?.price;
  if (!p || !isFiniteNumber(p.unit_net)) return { value: null, reason: 'missing_price' };
  if (basis === 'gross') {
    if (!isFiniteNumber(p.vat_rate)) return { value: null, reason: 'missing_vat' };
    return { value: p.unit_net * (1 + p.vat_rate / 100) };
  }
  return { value: p.unit_net };
}

export function createEngine(catalog) {
  const basis = catalog.settings?.vat_basis === 'gross' ? 'gross' : 'net';
  const defaultLaborRate = isFiniteNumber(catalog.settings?.labor_rate) ? catalog.settings.labor_rate : null;
  const materials = toMap(catalog.materials);
  const recipes = toMap(catalog.recipes);
  const products = toMap(catalog.products);
  const memo = new Map();

  function nodeOf(kind, id) {
    return kind === 'recipe' ? recipes.get(id) : products.get(id);
  }

  function evalNode(kind, id, stack) {
    const key = `${kind}:${id}`;
    if (memo.has(key)) return memo.get(key);
    if (stack.includes(key)) return { cycle: true, kind, id, name: nodeOf(kind, id)?.name };
    const node = nodeOf(kind, id);
    if (!node) return null;
    const nextStack = [...stack, key];

    const issues = [];
    const warnings = [];
    const lines = [];
    const sums = zero();
    const covered = zeroCovered();
    const materialIds = new Set();
    const recipeIds = new Set();
    let laborIncluded = false;
    let overheadIncluded = false;
    let massG = 0;
    let volMl = 0;
    const notMass = [];
    const notVol = [];

    for (const item of node.items || []) {
      const subId = subRef(kind, item);
      const line = {
        type: item.material_id != null ? 'material' : 'recipe',
        ref_id: item.material_id ?? subId,
        name: '',
        kind: null,
        qty: item.qty,
        unit: item.unit,
        note: item.note || '',
        qtyCostUnit: null,
        costUnit: null,
        unitPrice: null,
        cost: null,
        components: zero(),
        issue: null,
      };
      lines.push(line);
      const flagQty = () => {
        if (isPositive(item.qty)) return false;
        line.issue = 'Μη έγκυρη ποσότητα';
        issues.push({ code: 'invalid_qty', msg: `Μη έγκυρη ποσότητα: ${line.name || 'γραμμή'} (${node.name})`, path: [node.name] });
        return true;
      };

      if (item.material_id != null) {
        const m = materials.get(item.material_id);
        if (!m) {
          line.name = '(διαγραμμένο υλικό)';
          line.issue = 'Το υλικό δεν υπάρχει';
          issues.push({ code: 'missing_item', msg: 'Υλικό που δεν υπάρχει πλέον', path: [node.name] });
          continue;
        }
        materialIds.add(m.id);
        line.name = m.name;
        line.kind = m.kind || 'ingredient';
        line.costUnit = m.cost_unit;
        line.priceDate = m.price?.doc_date || null;
        line.priceSource = m.price?.source || null;
        const profile = { density: m.density, pieceWeight: m.piece_weight };
        if (line.kind !== 'packaging' && isPositive(item.qty)) {
          const g = convert(item.qty, item.unit, 'g', profile);
          if (g.ok) massG += g.value;
          else notMass.push(m.name);
          const v = convert(item.qty, item.unit, 'ml', profile);
          if (v.ok) volMl += v.value;
          else notVol.push(m.name);
        }
        if (flagQty()) continue;
        const c = convert(item.qty, item.unit, m.cost_unit, profile);
        if (!c.ok) {
          line.issue = `Δεν γίνεται μετατροπή ${UNITS[item.unit]?.label || item.unit} → ${unitWord(m.cost_unit)}: ${CONVERSION_REASON_TEXT[c.reason]}`;
          issues.push({ code: c.reason, msg: `${m.name}: ${CONVERSION_REASON_TEXT[c.reason]}`, path: [node.name], material_id: m.id });
          continue;
        }
        line.qtyCostUnit = c.value;
        const p = effectiveUnitPrice(m, basis);
        if (p.value == null) {
          line.issue = p.reason === 'missing_vat' ? 'Λείπει ΦΠΑ (κοστολόγηση με ΦΠΑ)' : 'Λείπει τιμή';
          issues.push({
            code: p.reason,
            msg: p.reason === 'missing_vat' ? `Λείπει συντελεστής ΦΠΑ: ${m.name}` : `Λείπει τιμή: ${m.name}`,
            path: [node.name],
            material_id: m.id,
          });
          continue;
        }
        line.unitPrice = p.value;
        line.cost = c.value * p.value;
        const comp = line.kind === 'packaging' ? 'packaging' : 'materials';
        line.components[comp] = line.cost;
        sums[comp] += line.cost;
      } else if (subId != null) {
        const sub = evalNode('recipe', subId, nextStack);
        if (!sub) {
          line.name = '(διαγραμμένη συνταγή)';
          line.issue = 'Η συνταγή δεν υπάρχει';
          issues.push({ code: 'missing_item', msg: 'Επιμέρους συνταγή που δεν υπάρχει πλέον', path: [node.name] });
          continue;
        }
        line.name = sub.name;
        line.kind = 'recipe';
        if (sub.cycle) {
          line.issue = 'Κυκλική σύνδεση συνταγών';
          issues.push({ code: 'cycle', msg: `Κυκλική σύνδεση: ${node.name} ↔ ${sub.name}`, path: [node.name] });
          continue;
        }
        recipeIds.add(sub.id);
        sub.recipeIds.forEach((x) => recipeIds.add(x));
        sub.materialIds.forEach((x) => materialIds.add(x));
        laborIncluded ||= sub.laborIncluded;
        overheadIncluded ||= sub.overheadIncluded;
        line.costUnit = sub.yield.outputUnit;
        if (isPositive(item.qty)) {
          const g = convert(item.qty, item.unit, 'g', sub.profile);
          if (g.ok) massG += g.value;
          else notMass.push(sub.name);
          const v = convert(item.qty, item.unit, 'ml', sub.profile);
          if (v.ok) volMl += v.value;
          else notVol.push(sub.name);
        }
        for (const is of sub.issues) issues.push({ ...is, path: [node.name, ...is.path] });
        if (!sub.complete) line.issue = 'Ελλιπές κοστολόγιο επιμέρους συνταγής';
        if (flagQty()) continue;
        if (!sub.yield.ok) {
          line.issue = 'Μη έγκυρη απόδοση επιμέρους συνταγής';
          continue;
        }
        const c = convert(item.qty, item.unit, sub.yield.baseUnit, sub.profile);
        if (!c.ok) {
          line.issue = `Δεν γίνεται μετατροπή ${UNITS[item.unit]?.label || item.unit} → ${unitWord(sub.yield.outputUnit)}: ${CONVERSION_REASON_TEXT[c.reason]}`;
          issues.push({ code: c.reason, msg: `${sub.name}: ${CONVERSION_REASON_TEXT[c.reason]}`, path: [node.name] });
          continue;
        }
        const fraction = c.value / sub.yield.base;
        line.fraction = fraction;
        line.qtyCostUnit = c.value / UNITS[sub.yield.outputUnit].factor;
        for (const k of Object.keys(sums)) line.components[k] = sub.batch[k] * fraction;
        for (const k of Object.keys(covered)) covered[k] += sub.covered[k] * fraction;
        for (const k of Object.keys(sums)) sums[k] += line.components[k];
        line.cost = total(line.components);
        line.unitPrice = sub.perUnit ? sub.perUnit.total : null;
      } else {
        line.issue = 'Κενή γραμμή';
      }
    }

    // ---- Απόδοση ----
    const isProduct = kind === 'product';
    const batchSize = isProduct ? (isPositive(node.batch_size) ? node.batch_size : 1) : 1;
    const y = { mode: isProduct ? 'product' : node.yield_mode || 'none', ok: false, base: null, baseUnit: null, dim: null, outputUnit: null, lossPct: null, impliedLossPct: null };
    if (isProduct) {
      Object.assign(y, { ok: true, base: 1, baseUnit: 'pc', dim: 'count', outputUnit: 'pc' });
    } else if (y.mode === 'actual') {
      const u = UNITS[node.yield_unit];
      if (u && isPositive(node.yield_qty)) {
        Object.assign(y, { ok: true, base: node.yield_qty * u.factor, baseUnit: DIM_BASE[u.dim], dim: u.dim, outputUnit: DIM_COST_UNIT[u.dim] });
        const input = u.dim === 'mass' && !notMass.length ? massG : u.dim === 'volume' && !notVol.length ? volMl : null;
        if (input && input > 0) {
          y.impliedLossPct = ((input - y.base) / input) * 100;
          if (y.base > input * 1.02) {
            warnings.push({ code: 'yield_above_input', msg: 'Η δηλωμένη απόδοση είναι μεγαλύτερη από το σύνολο των υλικών. Ελέγξτε τη μονάδα (g/kg).' });
          }
        }
      } else {
        issues.push({ code: 'invalid_yield', msg: `Δηλώστε έγκυρη τελική απόδοση: ${node.name}`, path: [node.name] });
      }
    } else {
      const dim = node.measure === 'volume' ? 'volume' : 'mass';
      const input = dim === 'mass' ? massG : volMl;
      const missing = dim === 'mass' ? notMass : notVol;
      const loss = y.mode === 'loss' ? node.loss_pct : 0;
      if (y.mode === 'loss' && !(isFiniteNumber(loss) && loss >= 0 && loss < 100)) {
        issues.push({ code: 'invalid_loss', msg: `Μη έγκυρο ποσοστό φύρας: ${node.name}`, path: [node.name] });
      } else if (missing.length) {
        issues.push({
          code: 'yield_inputs',
          msg: `Η απόδοση της «${node.name}» δεν υπολογίζεται: ${missing.join(', ')} δεν μετατρέπονται σε ${dim === 'mass' ? 'βάρος' : 'όγκο'}. Δηλώστε πραγματική απόδοση ή πυκνότητα/βάρος τεμαχίου.`,
          path: [node.name],
        });
      } else if (!(input > 0)) {
        issues.push({ code: 'invalid_yield', msg: `Η συνταγή «${node.name}» δεν έχει υλικά για υπολογισμό απόδοσης.`, path: [node.name] });
      } else {
        Object.assign(y, { ok: true, base: input * (1 - loss / 100), baseUnit: DIM_BASE[dim], dim, outputUnit: DIM_COST_UNIT[dim], lossPct: loss });
      }
    }

    // ---- Εργασία (μόνο του συγκεκριμένου επιπέδου) ----
    const own = {
      laborMinutes: isPositive(node.labor_minutes) ? node.labor_minutes : 0,
      laborRate: isFiniteNumber(node.labor_rate) ? node.labor_rate : defaultLaborRate,
      labor: 0,
      overheadFixed: isPositive(node.overhead_fixed) ? node.overhead_fixed : 0,
      overheadFixedShare: 0,
      overheadPct: isPositive(node.overhead_pct) ? node.overhead_pct : 0,
      overheadBase: OVERHEAD_BASES[node.overhead_base] ? node.overhead_base : 'materials',
      overheadPctBaseAmount: 0,
      overheadPctAmount: 0,
      batchSize,
    };
    if (own.laborMinutes > 0) {
      laborIncluded = true;
      if (!isFiniteNumber(own.laborRate)) {
        issues.push({ code: 'missing_labor_rate', msg: `Ορίστε ωριαίο κόστος εργασίας (Ρυθμίσεις ή «${node.name}»)`, path: [node.name] });
      } else {
        own.labor = ((own.laborMinutes / 60) * own.laborRate) / batchSize;
        sums.labor += own.labor;
      }
    }
    // ---- Λειτουργικά έξοδα ----
    if (own.overheadFixed > 0) {
      overheadIncluded = true;
      own.overheadFixedShare = own.overheadFixed / batchSize;
      sums.overhead += own.overheadFixedShare;
    }
    if (own.overheadPct > 0) {
      overheadIncluded = true;
      const comps = OVERHEAD_BASES[own.overheadBase];
      let base = 0;
      for (const c of comps) base += Math.max(0, sums[c] - covered[c]);
      own.overheadPctBaseAmount = base;
      own.overheadPctAmount = (base * own.overheadPct) / 100;
      sums.overhead += own.overheadPctAmount;
      for (const c of comps) covered[c] = sums[c];
    }

    const batch = { ...sums, total: total(sums) };
    let perUnit = null;
    if (y.ok && y.base > 0) {
      const out = y.base / UNITS[y.outputUnit].factor;
      perUnit = {
        materials: sums.materials / out,
        packaging: sums.packaging / out,
        labor: sums.labor / out,
        overhead: sums.overhead / out,
        total: batch.total / out,
      };
    }

    const result = {
      kind,
      id,
      name: node.name,
      lines,
      batch,
      covered,
      own,
      input: { mass_g: massG, massComplete: notMass.length === 0, volume_ml: volMl, volumeComplete: notVol.length === 0, notMass, notVol },
      yield: y,
      profile: { density: node.density ?? null, pieceWeight: node.piece_weight ?? null },
      perUnit,
      issues,
      warnings,
      complete: issues.length === 0 && perUnit != null,
      laborIncluded,
      overheadIncluded,
      materialIds,
      recipeIds,
      basis,
    };
    memo.set(key, result);
    return result;
  }

  function evalRecipe(id) {
    return evalNode('recipe', id, []);
  }
  function evalProduct(id) {
    return evalNode('product', id, []);
  }

  /** Σύνοψη κόστους όλων των συνταγών και προϊόντων. */
  function allCosts() {
    const out = { recipes: {}, products: {} };
    for (const id of recipes.keys()) out.recipes[id] = summarize(evalRecipe(id));
    for (const id of products.keys()) out.products[id] = summarize(evalProduct(id));
    return out;
  }

  /**
   * Προγραμματισμός παραγωγής.
   * entries: [{ kind: 'product'|'recipe', id, qty, unit? }] (για προϊόν: τεμάχια)
   */
  function plan(entries) {
    const issues = [];
    const recipeNeed = new Map(); // recipe id → ποσότητα σε βασική μονάδα (g/ml/pc) έτοιμου προϊόντος
    const materialNeed = new Map(); // material id → ποσότητα σε μονάδα κοστολόγησης
    const recipeSources = new Map();
    const totals = zero();
    let laborMinutes = 0;
    const entryResults = [];

    const addMaterial = (m, item, factor, path) => {
      const c = convert(item.qty, item.unit, m.cost_unit, { density: m.density, pieceWeight: m.piece_weight });
      if (!c.ok) {
        issues.push({ code: c.reason, msg: `${m.name}: ${CONVERSION_REASON_TEXT[c.reason]}`, path });
        return;
      }
      materialNeed.set(m.id, (materialNeed.get(m.id) || 0) + c.value * factor);
    };
    const addRecipe = (subId, qty, unit, factor, path, sourceName) => {
      const sub = evalRecipe(subId);
      if (!sub || sub.cycle || !sub.yield.ok) {
        issues.push({ code: 'invalid_sub', msg: `Μη υπολογίσιμη συνταγή: ${sub?.name || subId}`, path });
        return;
      }
      const c = convert(qty, unit, sub.yield.baseUnit, sub.profile);
      if (!c.ok) {
        issues.push({ code: c.reason, msg: `${sub.name}: ${CONVERSION_REASON_TEXT[c.reason]}`, path });
        return;
      }
      recipeNeed.set(subId, (recipeNeed.get(subId) || 0) + c.value * factor);
      if (!recipeSources.has(subId)) recipeSources.set(subId, new Set());
      recipeSources.get(subId).add(sourceName);
    };

    for (const e of entries) {
      if (!isPositive(e.qty)) continue;
      if (e.kind === 'product') {
        const r = evalProduct(e.id);
        if (!r) continue;
        const node = products.get(e.id);
        entryResults.push({ ...e, name: r.name, unit: 'pc', result: r, cost: r.perUnit ? scale(r.perUnit, e.qty) : null, complete: r.complete });
        if (r.perUnit) for (const k of COMPONENTS) totals[k] += r.perUnit[k] * e.qty;
        laborMinutes += ((node.labor_minutes || 0) * e.qty) / (isPositive(node.batch_size) ? node.batch_size : 1);
        for (const item of node.items || []) {
          if (!isPositive(item.qty)) continue;
          const subId = item.recipe_id;
          if (item.material_id != null) {
            const m = materials.get(item.material_id);
            if (m) addMaterial(m, item, e.qty, [r.name]);
          } else if (subId != null) addRecipe(subId, item.qty, item.unit, e.qty, [r.name], r.name);
        }
      } else if (e.kind === 'recipe') {
        const r = evalRecipe(e.id);
        if (!r) continue;
        const unit = e.unit || (r.yield.outputUnit ?? 'kg');
        let qtyOut = null;
        if (r.yield.ok) {
          const c = convert(e.qty, unit, r.yield.outputUnit, r.profile);
          if (c.ok) qtyOut = c.value;
          else issues.push({ code: c.reason, msg: `${r.name}: ${CONVERSION_REASON_TEXT[c.reason]}`, path: [r.name] });
        }
        entryResults.push({ ...e, unit, name: r.name, result: r, cost: r.perUnit && qtyOut != null ? scale(r.perUnit, qtyOut) : null, complete: r.complete && qtyOut != null });
        if (r.perUnit && qtyOut != null) for (const k of COMPONENTS) totals[k] += r.perUnit[k] * qtyOut;
        addRecipe(e.id, e.qty, unit, 1, [r.name], 'Άμεση παραγωγή');
      }
    }

    // Τοπολογική σειρά: γονικές συνταγές πριν από τις επιμέρους, ώστε οι ανάγκες να συγκεντρωθούν πλήρως.
    const order = [];
    const seen = new Set();
    const visiting = new Set();
    const visit = (id) => {
      if (seen.has(id) || visiting.has(id)) return;
      visiting.add(id);
      const node = recipes.get(id);
      for (const it of node?.items || []) {
        const s = it.sub_recipe_id;
        if (s != null) visit(s);
      }
      visiting.delete(id);
      seen.add(id);
      order.push(id);
    };
    for (const id of recipeNeed.keys()) visit(id);
    order.reverse();

    const recipeRows = [];
    for (const id of order) {
      const need = recipeNeed.get(id) || 0;
      if (!(need > 0)) continue;
      const r = evalRecipe(id);
      const node = recipes.get(id);
      if (!r || !r.yield.ok) continue;
      const batches = need / r.yield.base;
      laborMinutes += (node.labor_minutes || 0) * batches;
      const scaledItems = [];
      for (const item of node.items || []) {
        const subId = item.sub_recipe_id;
        const name = item.material_id != null ? materials.get(item.material_id)?.name : recipes.get(subId)?.name;
        scaledItems.push({ type: item.material_id != null ? 'material' : 'recipe', ref_id: item.material_id ?? subId, name: name || '—', qty: (item.qty || 0) * batches, unit: item.unit, note: item.note || '' });
        if (!isPositive(item.qty)) continue;
        if (item.material_id != null) {
          const m = materials.get(item.material_id);
          if (m) addMaterial(m, item, batches, [r.name]);
        } else if (subId != null) addRecipe(subId, item.qty, item.unit, batches, [r.name], r.name);
      }
      recipeRows.push({
        id,
        name: r.name,
        need,
        baseUnit: r.yield.baseUnit,
        outputUnit: r.yield.outputUnit,
        batches,
        yieldBase: r.yield.base,
        items: scaledItems,
        usedBy: [...(recipeSources.get(id) || [])],
        laborMinutes: (node.labor_minutes || 0) * batches,
        complete: r.complete,
      });
    }

    const materialRows = [];
    for (const [id, qty] of materialNeed) {
      const m = materials.get(id);
      const p = effectiveUnitPrice(m, basis);
      const pack = m.last_pack && isPositive(m.last_pack.content) ? m.last_pack : null;
      materialRows.push({
        id,
        name: m.name,
        kind: m.kind || 'ingredient',
        category: m.category || '',
        costUnit: m.cost_unit,
        qty,
        unitPrice: p.value,
        cost: p.value == null ? null : qty * p.value,
        missingPrice: p.value == null,
        packs: pack ? { content: pack.content, label: pack.label || '', count: Math.ceil(qty / pack.content - 1e-9) } : null,
      });
      if (p.value == null) issues.push({ code: p.reason, msg: p.reason === 'missing_vat' ? `Λείπει ΦΠΑ: ${m.name}` : `Λείπει τιμή: ${m.name}`, path: [] });
    }
    materialRows.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'el') : a.kind === 'packaging' ? 1 : -1));

    for (const er of entryResults) for (const is of er.result.issues) issues.push(is);
    const uniq = [];
    const seenMsg = new Set();
    for (const is of issues) {
      if (seenMsg.has(is.msg)) continue;
      seenMsg.add(is.msg);
      uniq.push(is);
    }

    return {
      entries: entryResults.map(({ result, ...rest }) => ({ ...rest, perUnit: result.perUnit, outputUnit: result.yield.outputUnit })),
      recipes: recipeRows,
      materials: materialRows.filter((r) => r.kind !== 'packaging'),
      packaging: materialRows.filter((r) => r.kind === 'packaging'),
      totals: { ...totals, total: total(totals) },
      laborMinutes,
      laborIncluded: entryResults.some((e) => e.result.laborIncluded),
      overheadIncluded: entryResults.some((e) => e.result.overheadIncluded),
      issues: uniq,
      complete: uniq.length === 0 && entryResults.every((e) => e.complete),
      basis,
    };
  }

  return { evalRecipe, evalProduct, allCosts, plan, basis };
}

function scale(c, f) {
  return { materials: c.materials * f, packaging: c.packaging * f, labor: c.labor * f, overhead: c.overhead * f, total: c.total * f };
}

export function summarize(r) {
  if (!r) return null;
  return {
    name: r.name,
    perUnit: r.perUnit,
    batch: r.batch,
    unit: r.yield.outputUnit,
    yieldBase: r.yield.base,
    complete: r.complete,
    issues: r.issues.map((i) => i.msg),
    materialIds: [...r.materialIds],
    recipeIds: [...r.recipeIds],
    laborIncluded: r.laborIncluded,
    overheadIncluded: r.overheadIncluded,
  };
}

/** Επιστρέφει true αν η προσθήκη της candidate ως επιμέρους της recipeId δημιουργεί κύκλο. */
export function wouldCreateCycle(recipesList, recipeId, candidateId) {
  if (candidateId == null) return false;
  if (recipeId != null && candidateId === recipeId) return true;
  if (recipeId == null) return false;
  const recipes = toMap(recipesList);
  const stack = [candidateId];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (id === recipeId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const it of recipes.get(id)?.items || []) {
      const s = it.sub_recipe_id;
      if (s != null) stack.push(s);
    }
  }
  return false;
}

/** Ελέγχει αν η συνταγή recipeId με τα δοσμένα items θα δημιουργούσε κύκλο. */
export function itemsCreateCycle(recipesList, recipeId, items) {
  const recipes = new Map(toMap(recipesList));
  if (recipeId != null) recipes.set(recipeId, { ...(recipes.get(recipeId) || {}), id: recipeId, items });
  for (const it of items || []) {
    const s = it.sub_recipe_id;
    if (s == null) continue;
    if (recipeId != null && wouldCreateCycle(recipes, recipeId, s)) return true;
  }
  return false;
}

/** Πού χρησιμοποιείται ένα υλικό ή μια συνταγή (άμεσα). */
export function directUsage(catalog, kind, id) {
  const out = { recipes: [], products: [] };
  for (const r of catalog.recipes || []) {
    if ((r.items || []).some((it) => (kind === 'material' ? it.material_id === id : it.sub_recipe_id === id))) out.recipes.push({ id: r.id, name: r.name });
  }
  for (const p of catalog.products || []) {
    if ((p.items || []).some((it) => (kind === 'material' ? it.material_id === id : it.recipe_id === id))) out.products.push({ id: p.id, name: p.name });
  }
  return out;
}
