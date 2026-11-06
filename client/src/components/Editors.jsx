// Κοινά στοιχεία επεξεργασίας συνταγών και προϊόντων.
import { useState } from 'react';
import { useStore } from '../store.jsx';
import { NumberInput, Field, Select, Badge, Link, DiffText } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { ItemPicker } from './ItemPicker.jsx';
import { formatMoney, formatUnitPrice, UNIT_LABEL, unitsFor, defaultUnitFor, COST_UNIT_SHORT } from '../format.js';
import { OVERHEAD_BASE_LABEL } from '@shared/costing.js';

let seq = 1;
export const withKey = (it) => ({ ...it, _key: it._key || `i${seq++}` });

/** Επιτρεπόμενες μονάδες για γραμμή. */
function unitOptions(item, kind, materialsById, engine) {
  const refRecipe = kind === 'recipe' ? item.sub_recipe_id : item.recipe_id;
  if (item.material_id != null) {
    const m = materialsById.get(item.material_id);
    if (!m) return ['g', 'kg', 'ml', 'l', 'pc'];
    return unitsFor(m.cost_unit, { density: m.density, pieceWeight: m.piece_weight });
  }
  if (refRecipe != null) {
    const r = engine.evalRecipe(refRecipe);
    if (!r?.yield?.outputUnit) return ['g', 'kg', 'ml', 'l', 'pc'];
    return unitsFor(r.yield.outputUnit, r.profile);
  }
  return ['g', 'kg', 'ml', 'l', 'pc'];
}

/** Κόστος γραμμής και τιμή μονάδας στο «κύριο» κόστος (π.χ. χωρίς εργασία προσωπικού επιμέρους συνταγών). */
export function lineCost(line, hl) {
  if (!line || line.cost == null) return { cost: null, unitPrice: line?.unitPrice ?? null };
  const cost = hl(line);
  const unitPrice = line.type === 'recipe' && line.qtyCostUnit > 0 ? cost / line.qtyCostUnit : line.unitPrice;
  return { cost, unitPrice };
}

export function ItemsEditor({ kind, items, setItems, result, selfId }) {
  const { materialsById, engine, hl } = useStore();
  const [picker, setPicker] = useState(null); // { key | 'new' }
  const [notes, setNotes] = useState({});
  const refKey = kind === 'recipe' ? 'sub_recipe_id' : 'recipe_id';

  const update = (key, patch) => setItems(items.map((it) => (it._key === key ? { ...it, ...patch } : it)));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const a = [...items];
    [a[i], a[j]] = [a[j], a[i]];
    setItems(a);
  };
  const remove = (key) => setItems(items.filter((it) => it._key !== key));

  const onPick = (picked) => {
    const patch =
      picked.type === 'material'
        ? { material_id: picked.id, [refKey]: null, unit: defaultUnitFor(picked.m.cost_unit) }
        : { material_id: null, [refKey]: picked.id, unit: defaultUnitFor(engine.evalRecipe(picked.id)?.yield?.outputUnit || 'kg') };
    if (picker === 'new') setItems([...items, withKey({ qty: null, note: '', ...patch })]);
    else {
      const cur = items.find((x) => x._key === picker);
      const opts = unitOptions({ ...cur, ...patch }, kind, materialsById, engine);
      if (opts.includes(cur.unit)) delete patch.unit;
      update(picker, patch);
    }
    setPicker(null);
  };

  return (
    <div>
      <div className="items">
        {items.map((it, i) => {
          const line = result?.lines?.[i];
          const lc = lineCost(line, hl);
          const name = line?.name || (it.material_id != null ? materialsById.get(it.material_id)?.name : null);
          const opts = unitOptions(it, kind, materialsById, engine);
          const isRecipe = it[refKey] != null;
          const kindLabel = isRecipe ? 'Συνταγή' : line?.kind === 'packaging' ? 'Συσκευασία' : 'Πρώτη ύλη';
          return (
            <div key={it._key} className={`item-row ${line?.issue ? 'has-issue' : ''}`}>
              <div className="top">
                <button className={`name-btn ${name ? '' : 'empty'}`} onClick={() => setPicker(it._key)}>
                  <span className="kindtag">{kindLabel}</span> {name || 'Επιλογή…'}
                </button>
                <button className="iconbtn move" onClick={() => move(i, -1)} aria-label="Πάνω" disabled={i === 0}>
                  <Icon name="up" />
                </button>
                <button className="iconbtn move" onClick={() => move(i, 1)} aria-label="Κάτω" disabled={i === items.length - 1}>
                  <Icon name="down" />
                </button>
                <button className="iconbtn" onClick={() => remove(it._key)} aria-label="Αφαίρεση">
                  <Icon name="trash" />
                </button>
              </div>
              <div className="qty">
                <NumberInput value={it.qty} onChange={(v) => update(it._key, { qty: v })} placeholder="Ποσότητα" aria-label="Ποσότητα" />
                <select className="input" value={it.unit || ''} onChange={(e) => update(it._key, { unit: e.target.value })} aria-label="Μονάδα">
                  {!opts.includes(it.unit) && it.unit && <option value={it.unit}>{UNIT_LABEL[it.unit]} (μη έγκυρη)</option>}
                  {opts.map((u) => (
                    <option key={u} value={u}>
                      {UNIT_LABEL[u]}
                    </option>
                  ))}
                </select>
                <button className="btn small ghost" onClick={() => setNotes((n) => ({ ...n, [it._key]: !n[it._key] }))}>
                  Σημ.
                </button>
                <div className="cost">
                  <div className="strong">{lc.cost != null ? formatMoney(lc.cost) : '—'}</div>
                  {lc.unitPrice != null && line?.costUnit && <div className="sub">{formatUnitPrice(lc.unitPrice, line.costUnit)}</div>}
                </div>
              </div>
              {(notes[it._key] || it.note) && (
                <input className="input compact" style={{ marginTop: '.4rem' }} placeholder="Σημείωση (π.χ. διακόσμηση)" value={it.note || ''} onChange={(e) => update(it._key, { note: e.target.value })} />
              )}
              {line?.issue && <div className="issue">⚠ {line.issue}</div>}
            </div>
          );
        })}
      </div>
      <div className="row" style={{ marginTop: '.6rem' }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => setPicker('new')}>
          <Icon name="plus" /> Προσθήκη υλικού ή συνταγής
        </button>
      </div>
      {picker && (
        <ItemPicker
          title={kind === 'recipe' ? 'Υλικό ή επιμέρους συνταγή' : 'Συνταγή, υλικό ή συσκευασία'}
          kinds={['material', 'packaging', 'recipe']}
          excludeRecipeId={kind === 'recipe' ? selfId ?? -1 : undefined}
          onClose={() => setPicker(null)}
          onPick={onPick}
        />
      )}
    </div>
  );
}

/** Εργασία και λειτουργικά έξοδα (προαιρετικά). */
export function LaborOverhead({ value, set, defaultRate, perBatchLabel, batchField }) {
  return (
    <details className="more" open={!!(value.labor_minutes || value.overhead_fixed || value.overhead_pct)}>
      <summary>Εργασία & λειτουργικά έξοδα (προαιρετικά)</summary>
      <p className="small muted">
        Καταχωρίστε μόνο την εργασία αυτού του σταδίου. Εργασία και έξοδα των επιμέρους συνταγών μεταφέρονται αναλογικά, χωρίς διπλή χρέωση.
      </p>
      {batchField}
      <div className="row">
        <Field label={`Χρόνος εργασίας (λεπτά ${perBatchLabel})`}>
          <NumberInput value={value.labor_minutes} onChange={(v) => set('labor_minutes', v)} placeholder="—" />
        </Field>
        <Field label="Ωριαίο κόστος (€/ώρα)" hint={defaultRate != null ? `Κενό = προεπιλογή ${formatMoney(defaultRate)}/ώρα` : 'Ορίστε προεπιλογή στις Ρυθμίσεις'}>
          <NumberInput value={value.labor_rate} onChange={(v) => set('labor_rate', v)} placeholder={defaultRate != null ? String(defaultRate).replace('.', ',') : '—'} />
        </Field>
      </div>
      <div className="row">
        <Field label={`Σταθερά έξοδα (€ ${perBatchLabel})`} hint="π.χ. ενέργεια φούρνου, καθαριότητα">
          <NumberInput value={value.overhead_fixed} onChange={(v) => set('overhead_fixed', v)} placeholder="—" suffix="€" />
        </Field>
        <Field label="Λειτουργικά ως ποσοστό" className="w-sm">
          <NumberInput value={value.overhead_pct} onChange={(v) => set('overhead_pct', v)} placeholder="—" suffix="%" />
        </Field>
        <Field label="Βάση ποσοστού">
          <Select value={value.overhead_base || 'materials'} onChange={(v) => set('overhead_base', v)} options={Object.entries(OVERHEAD_BASE_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
        </Field>
      </div>
      <p className="small muted">Το ποσοστό εφαρμόζεται μόνο σε κόστη που δεν έχουν ήδη επιβαρυνθεί με ποσοστό σε επιμέρους συνταγή.</p>
    </details>
  );
}

/** Ανάλυση εργασίας/εξόδων του τρέχοντος επιπέδου. */
export function OwnCostsNote({ result }) {
  if (!result) return null;
  const o = result.own;
  const parts = [];
  if (o.laborMinutes > 0) parts.push(`Εργασία: ${o.laborMinutes} λεπτά × ${formatMoney(o.laborRate)}/ώρα${o.batchSize > 1 ? ` ÷ ${o.batchSize} τεμ.` : ''} = ${formatMoney(o.labor)}`);
  if (o.overheadFixed > 0) parts.push(`Σταθερά έξοδα: ${formatMoney(o.overheadFixed)}${o.batchSize > 1 ? ` ÷ ${o.batchSize} τεμ.` : ''}`);
  if (o.overheadPct > 0) parts.push(`Λειτουργικά ${o.overheadPct}% × ${formatMoney(o.overheadPctBaseAmount)} (${OVERHEAD_BASE_LABEL[o.overheadBase]}, χωρίς ήδη επιβαρυμένα) = ${formatMoney(o.overheadPctAmount)}`);
  if (!parts.length) return null;
  return (
    <div className="small muted" style={{ marginTop: '.5rem' }}>
      {parts.map((p) => (
        <div key={p}>• {p}</div>
      ))}
    </div>
  );
}

/** Πού χρησιμοποιείται (με νέο κόστος αν υπάρχουν αλλαγές). */
export function UsageList({ usage, before, after, dirty }) {
  const { hl } = useStore();
  if (!usage.length) return <p className="muted small">Δεν χρησιμοποιείται σε άλλες συνταγές ή προϊόντα.</p>;
  return (
    <div className="list">
      {usage.map((u) => {
        const b = before(u);
        const a = after(u);
        const bv = hl(b?.perUnit);
        const av = hl(a?.perUnit);
        return (
          <Link key={`${u.kind}${u.id}`} to={`/${u.kind === 'product' ? 'products' : 'recipes'}/${u.id}`} className="list-item">
            <div className="grow">
              <div className="title">{u.name}</div>
              <div className="sub">{u.kind === 'product' ? 'Προϊόν' : 'Συνταγή'}</div>
            </div>
            <div className="value">
              <div>
                {formatMoney(dirty ? av : bv)}/{COST_UNIT_SHORT[(a || b)?.yield?.outputUnit] || ''}
              </div>
              {dirty && bv != null && av != null && Math.abs(av - bv) > 1e-9 && (
                <div className="sub">
                  από {formatMoney(bv)} <DiffText diff={av - bv} money={false} pct={bv ? ((av - bv) / bv) * 100 : null} />
                </div>
              )}
              {(a || b) && !(a || b).complete && <Badge kind="danger">Ελλιπές</Badge>}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
