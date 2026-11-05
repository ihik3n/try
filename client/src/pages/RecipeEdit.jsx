import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useStore, useAction } from '../store.jsx';
import { PageHead, Field, TextInput, NumberInput, Select, CostBreakdown, Issues, SampleBadge, Spinner, printSection, Badge } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { ItemsEditor, LaborOverhead, OwnCostsNote, UsageList, withKey } from '../components/Editors.jsx';
import { formatMoney, formatQty, formatNumber, formatPercent, UNIT_LABEL, baseQtyLabel, BASIS_LABEL } from '../format.js';
import { createEngine } from '@shared/costing.js';
import { convert, UNITS } from '@shared/units.js';
import { navigate, setNavigationBlocker } from '../router.js';

const EMPTY = {
  name: '',
  category: '',
  notes: '',
  yield_mode: 'actual',
  yield_qty: null,
  yield_unit: 'g',
  loss_pct: null,
  measure: 'mass',
  density: null,
  piece_weight: null,
  labor_minutes: null,
  labor_rate: null,
  overhead_fixed: null,
  overhead_pct: null,
  overhead_base: 'materials',
  archived: 0,
  items: [],
};

const PER = { kg: 'ανά κιλό', l: 'ανά λίτρο', pc: 'ανά τεμάχιο' };

export function RecipeEdit({ id }) {
  const { catalog, engine, recipesById, reload, confirm } = useStore();
  const [run, busy] = useAction();
  const saved = id != null ? recipesById.get(id) : null;
  const [draft, setDraft] = useState(() => (saved ? { ...saved, items: saved.items.map(withKey) } : { ...EMPTY }));
  const [dirty, setDirty] = useState(false);
  useEffect(() => setNavigationBlocker(() => dirty), [dirty]);

  const selfId = id ?? -1;
  const draftEngine = useMemo(() => {
    const recipes = catalog.recipes.filter((r) => r.id !== selfId);
    recipes.push({ ...draft, id: selfId });
    return createEngine({ ...catalog, recipes });
  }, [catalog, draft, selfId]);
  const res = draftEngine.evalRecipe(selfId);

  const usage = useMemo(() => {
    if (id == null) return [];
    const out = [];
    for (const r of catalog.recipes) if (r.id !== id && engine.evalRecipe(r.id)?.recipeIds.has(id)) out.push({ kind: 'recipe', id: r.id, name: r.name });
    for (const p of catalog.products) if (engine.evalProduct(p.id)?.recipeIds.has(id)) out.push({ kind: 'product', id: p.id, name: p.name });
    return out;
  }, [catalog, engine, id]);

  if (id != null && !saved) return <Spinner />;

  const set = (k, v) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };
  const setItems = (items) => set('items', items);

  const body = () => ({
    ...draft,
    items: draft.items.map(({ _key, id: _i, recipe_id, ...it }) => ({ material_id: it.material_id ?? null, sub_recipe_id: it.sub_recipe_id ?? null, qty: it.qty, unit: it.unit, note: it.note || null })),
  });
  const missingRef = draft.items.some((it) => it.material_id == null && it.sub_recipe_id == null);

  const save = () =>
    run(async () => {
      const r = id == null ? await api.post('/api/recipes', body()) : await api.put(`/api/recipes/${id}`, body());
      setDirty(false);
      await reload();
      if (id == null) navigate(`/recipes/${r.id}`, { replace: true, force: true });
    }, 'Η συνταγή αποθηκεύτηκε');

  const duplicate = () =>
    run(async () => {
      if (dirty) await api.put(`/api/recipes/${id}`, body());
      setDirty(false);
      const r = await api.post(`/api/recipes/${id}/duplicate`);
      await reload();
      navigate(`/recipes/${r.id}`, { force: true });
    }, 'Δημιουργήθηκε αντίγραφο');

  const del = async () => {
    if (!(await confirm({ title: 'Διαγραφή συνταγής', message: `Να διαγραφεί η «${saved.name}»;`, confirmText: 'Διαγραφή', danger: true }))) return;
    await run(async () => {
      await api.del(`/api/recipes/${id}`);
      setDirty(false);
      await reload();
      navigate('/recipes', { force: true });
    }, 'Διαγράφηκε');
  };

  const out = res.yield.outputUnit;
  const yieldLabel = res.yield.ok ? baseQtyLabel(res.yield.base, res.yield.baseUnit) : '—';
  const basis = catalog.settings.vat_basis;

  return (
    <div>
      <PageHead title={id == null ? 'Νέα συνταγή' : draft.name || 'Συνταγή'} back="/recipes" badges={<SampleBadge show={saved?.is_sample} />}>
        {id != null && (
          <>
            <button className="btn" onClick={duplicate} disabled={busy}>
              <Icon name="copy" /> Αντιγραφή
            </button>
            <button className="btn danger" onClick={del} disabled={busy}>
              <Icon name="trash" />
            </button>
          </>
        )}
      </PageHead>

      <div className="grid-main-side">
        <div>
          <div className="card">
            <div className="row">
              <Field label="Όνομα συνταγής *" className="w-md">
                <TextInput value={draft.name} onChange={(v) => set('name', v)} placeholder="π.χ. Μους σοκολάτας" />
              </Field>
              <Field label="Κατηγορία">
                <input className="input" list="rec-cats" value={draft.category || ''} onChange={(e) => set('category', e.target.value)} />
                <datalist id="rec-cats">
                  {['Βάσεις', 'Κρέμες & μους', 'Ζύμες', 'Γλάσα & σάλτσες', 'Gelato', 'Αρτοποιία', 'Μπισκότα', ...(catalog.recipe_categories || [])].filter((v, i, a) => a.indexOf(v) === i).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Υλικά</h2>
              <span className="small muted">Ποσότητες σε g, kg, ml, lt ή τεμ.</span>
            </div>
            <ItemsEditor kind="recipe" items={draft.items} setItems={setItems} result={res} selfId={selfId} />
          </div>

          <div className="card">
            <h2>Απόδοση</h2>
            <div className="radio-cards">
              <label className={`radio-card ${draft.yield_mode === 'actual' ? 'active' : ''}`}>
                <input type="radio" checked={draft.yield_mode === 'actual'} onChange={() => set('yield_mode', 'actual')} />
                <div>
                  <div className="t">Πραγματική τελική απόδοση</div>
                  <div className="d">Ζύγιση του έτοιμου προϊόντος μετά από ψήσιμο, βράσιμο κ.λπ. (π.χ. υλικά 2.200 g → έτοιμο 2.000 g).</div>
                  {draft.yield_mode === 'actual' && (
                    <div className="row" style={{ marginTop: '.5rem' }}>
                      <Field label="Ποσότητα" className="w-sm">
                        <NumberInput value={draft.yield_qty} onChange={(v) => set('yield_qty', v)} />
                      </Field>
                      <Field label="Μονάδα" className="w-sm">
                        <Select value={draft.yield_unit} onChange={(v) => set('yield_unit', v)} options={['g', 'kg', 'ml', 'l', 'pc'].map((u) => ({ value: u, label: UNIT_LABEL[u] }))} />
                      </Field>
                    </div>
                  )}
                </div>
              </label>
              <label className={`radio-card ${draft.yield_mode === 'loss' ? 'active' : ''}`}>
                <input type="radio" checked={draft.yield_mode === 'loss'} onChange={() => set('yield_mode', 'loss')} />
                <div>
                  <div className="t">Εκτιμώμενη φύρα %</div>
                  <div className="d">Όταν δεν γνωρίζετε την πραγματική απόδοση. Απόδοση = σύνολο υλικών × (1 − φύρα).</div>
                  {draft.yield_mode === 'loss' && (
                    <div className="row" style={{ marginTop: '.5rem' }}>
                      <Field label="Φύρα" className="w-sm">
                        <NumberInput value={draft.loss_pct} onChange={(v) => set('loss_pct', v)} suffix="%" />
                      </Field>
                      <Field label="Μέτρηση" className="w-sm">
                        <Select value={draft.measure} onChange={(v) => set('measure', v)} options={[{ value: 'mass', label: 'βάρος' }, { value: 'volume', label: 'όγκος' }]} />
                      </Field>
                    </div>
                  )}
                </div>
              </label>
              <label className={`radio-card ${draft.yield_mode === 'none' ? 'active' : ''}`}>
                <input type="radio" checked={draft.yield_mode === 'none'} onChange={() => set('yield_mode', 'none')} />
                <div>
                  <div className="t">Χωρίς απώλεια (απόδοση = σύνολο υλικών)</div>
                  <div className="d">π.χ. μείγματα που δεν ψήνονται.</div>
                  {draft.yield_mode === 'none' && (
                    <div className="row" style={{ marginTop: '.5rem' }}>
                      <Field label="Μέτρηση" className="w-sm">
                        <Select value={draft.measure} onChange={(v) => set('measure', v)} options={[{ value: 'mass', label: 'βάρος' }, { value: 'volume', label: 'όγκος' }]} />
                      </Field>
                    </div>
                  )}
                </div>
              </label>
            </div>
            <p className="small muted" style={{ marginTop: '.5rem' }}>Χρησιμοποιείται μόνο μία επιλογή, ώστε η ίδια απώλεια να μη μετριέται διπλά.</p>
            <details className="more">
              <summary>Μετατροπές για χρήση σε άλλες συνταγές (προαιρετικά)</summary>
              <div className="row">
                <Field label="Πυκνότητα έτοιμου (g/ml)" hint="Για χρήση σε ml όταν η απόδοση είναι σε βάρος (ή αντίστροφα).">
                  <NumberInput value={draft.density} onChange={(v) => set('density', v)} placeholder="—" />
                </Field>
                <Field label="Βάρος τεμαχίου (g)" hint="Για απόδοση σε τεμάχια που χρησιμοποιούνται σε γραμμάρια.">
                  <NumberInput value={draft.piece_weight} onChange={(v) => set('piece_weight', v)} placeholder="—" />
                </Field>
              </div>
            </details>
          </div>

          <div className="card">
            <LaborOverhead value={draft} set={set} defaultRate={catalog.settings.labor_rate} perBatchLabel="ανά παρτίδα" />
          </div>

          <div className="card">
            <h2>Σημειώσεις παρασκευής</h2>
            <textarea className="input" rows={6} value={draft.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder="Βήματα, θερμοκρασίες, χρόνοι…" />
            {id != null && (
              <label className="checkbox" style={{ marginTop: '.5rem' }}>
                <input type="checkbox" checked={!!draft.archived} onChange={(e) => set('archived', e.target.checked ? 1 : 0)} /> Αρχειοθετημένη
              </label>
            )}
          </div>

          {id != null && <ScalePanel recipe={draft} res={res} />}

          {id != null && (
            <div className="card">
              <h2>Χρησιμοποιείται σε</h2>
              <UsageList
                usage={usage}
                dirty={dirty}
                before={(u) => (u.kind === 'product' ? engine.evalProduct(u.id) : engine.evalRecipe(u.id))}
                after={(u) => (u.kind === 'product' ? draftEngine.evalProduct(u.id) : draftEngine.evalRecipe(u.id))}
              />
            </div>
          )}
        </div>

        <div className="side">
          <CostBreakdown result={res} perLabel={out ? PER[out] : ''} basis={basis} />
          <div className="card" style={{ marginTop: '1rem' }}>
            <dl className="kv">
              <dt>Σύνολο υλικών</dt>
              <dd>
                {res.input.massComplete ? formatQty(res.input.mass_g, 'g') : res.input.mass_g > 0 ? `≥ ${formatQty(res.input.mass_g, 'g')}` : '—'}
                {!res.input.massComplete && res.input.notMass.length > 0 && <div className="small muted">χωρίς: {res.input.notMass.join(', ')}</div>}
              </dd>
              <dt>Τελική απόδοση</dt>
              <dd>
                {yieldLabel}
                {res.yield.mode === 'loss' && res.yield.ok && <div className="small muted">εκτίμηση με φύρα {formatNumber(res.yield.lossPct, 2)}%</div>}
                {res.yield.mode === 'actual' && res.yield.impliedLossPct != null && <div className="small muted">απώλεια {formatNumber(res.yield.impliedLossPct, 1)}%</div>}
              </dd>
              <dt>Κόστος παρτίδας</dt>
              <dd>{formatMoney(res.batch.total)}</dd>
              {res.perUnit && out !== 'pc' && (
                <>
                  <dt>Ανά 100 {out === 'l' ? 'ml' : 'g'}</dt>
                  <dd>{formatMoney(res.perUnit.total / 10)}</dd>
                </>
              )}
            </dl>
            <OwnCostsNote result={res} />
          </div>
          <Issues issues={res.issues} />
          {res.warnings.map((w) => (
            <div key={w.code} className="alert warn">
              {w.msg}
            </div>
          ))}
          <button className="btn primary block big" onClick={save} disabled={busy || !draft.name?.trim() || missingRef}>
            <Icon name="check" /> Αποθήκευση {dirty ? '•' : ''}
          </button>
          {missingRef && <p className="small up">Κάποια γραμμή δεν έχει επιλεγμένο υλικό.</p>}
          <p className="small muted" style={{ marginTop: '.5rem' }}>
            Βάση: {BASIS_LABEL[basis]}. Το κόστος ενημερώνεται αυτόματα όταν αλλάζουν οι τιμές των υλικών.
          </p>
        </div>
      </div>
      <div className="stickybar mobile-only">
        <div className="info">
          <b>{res.perUnit ? formatMoney(res.perUnit.total) : '—'}</b> {out ? PER[out] : ''} {!res.complete && <Badge kind="danger">Ελλιπές</Badge>}
        </div>
        <button className="btn primary" onClick={save} disabled={busy || !draft.name?.trim() || missingRef}>
          <Icon name="check" /> Αποθήκευση {dirty ? '•' : ''}
        </button>
      </div>
    </div>
  );
}

/** Αναλογική αλλαγή ποσότητας παραγωγής (προβολή & εκτύπωση). */
function ScalePanel({ recipe, res }) {
  const { materialsById, recipesById } = useStore();
  const [mode, setMode] = useState('factor');
  const [factor, setFactor] = useState(2);
  const [target, setTarget] = useState(null);
  const [targetUnit, setTargetUnit] = useState(res.yield.outputUnit === 'pc' ? 'pc' : res.yield.outputUnit === 'l' ? 'l' : 'kg');
  let f = mode === 'factor' ? factor : null;
  if (mode === 'target' && target != null && res.yield.ok) {
    const c = convert(target, targetUnit, res.yield.baseUnit, res.profile);
    f = c.ok ? c.value / res.yield.base : null;
  }
  const valid = f != null && f > 0;
  return (
    <div className="card print-area">
      <div className="card-head no-print">
        <h2>
          <Icon name="scale" /> Κλιμάκωση ποσότητας
        </h2>
        <button className="btn small" onClick={printSection} disabled={!valid}>
          <Icon name="print" /> Εκτύπωση
        </button>
      </div>
      <h2 className="print-only">{recipe.name}</h2>
      <div className="row no-print">
        <div className="seg" style={{ marginBottom: '.6rem' }}>
          <button className={mode === 'factor' ? 'active' : ''} onClick={() => setMode('factor')}>
            Πολλαπλασιαστής
          </button>
          <button className={mode === 'target' ? 'active' : ''} onClick={() => setMode('target')} disabled={!res.yield.ok}>
            Επιθυμητή απόδοση
          </button>
        </div>
      </div>
      <div className="row no-print">
        {mode === 'factor' ? (
          <Field label="× συνταγή" className="w-sm">
            <NumberInput value={factor} onChange={setFactor} />
          </Field>
        ) : (
          <>
            <Field label="Θέλω" className="w-sm">
              <NumberInput value={target} onChange={setTarget} />
            </Field>
            <Field label="Μονάδα" className="w-sm">
              <Select value={targetUnit} onChange={setTargetUnit} options={Object.keys(UNITS).filter((u) => UNITS[u].dim === UNITS[res.yield.baseUnit]?.dim || (res.profile.density && UNITS[u].dim !== 'count')).map((u) => ({ value: u, label: UNIT_LABEL[u] }))} />
            </Field>
          </>
        )}
      </div>
      {valid && (
        <>
          <p>
            <b>× {formatNumber(f, 3)}</b> · απόδοση {res.yield.ok ? baseQtyLabel(res.yield.base * f, res.yield.baseUnit) : '—'} · κόστος {formatMoney(res.batch.total * f)} {!res.complete && <Badge kind="danger">Ελλιπές</Badge>}
          </p>
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Υλικό</th>
                  <th className="num">Βασική</th>
                  <th className="num">Νέα ποσότητα</th>
                </tr>
              </thead>
              <tbody>
                {recipe.items.map((it, i) => (
                  <tr key={it._key || i}>
                    <td>
                      {it.material_id != null ? materialsById.get(it.material_id)?.name : recipesById.get(it.sub_recipe_id)?.name}
                      {it.note ? <div className="small muted">{it.note}</div> : null}
                    </td>
                    <td className="num">{formatQty(it.qty, it.unit, { keepUnit: true })}</td>
                    <td className="num strong">{formatQty((it.qty || 0) * f, it.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {recipe.notes && (
            <div className="print-only" style={{ whiteSpace: 'pre-wrap', marginTop: '1rem' }}>
              {recipe.notes}
            </div>
          )}
        </>
      )}
      {mode === 'factor' && factor != null && factor <= 0 && <p className="up">Δώστε θετικό αριθμό.</p>}
      <p className="small muted no-print">{formatPercent((f || 1) * 100 - 100)} σε σχέση με τη βασική συνταγή. Η κλιμάκωση δεν αλλάζει την αποθηκευμένη συνταγή.</p>
    </div>
  );
}
