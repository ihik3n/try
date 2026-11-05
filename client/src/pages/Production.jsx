// Προγραμματισμός ποσότητας παραγωγής: «Θέλω 60 ποτηράκια».
import { useEffect, useMemo, useState } from 'react';
import { api, download } from '../api.js';
import { useStore, useAction } from '../store.jsx';
import { PageHead, Field, NumberInput, Select, Badge, Issues, printSection, TextInput, SampleBadge, Link } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { ItemPicker } from '../components/ItemPicker.jsx';
import { formatMoney, formatQty, formatNumber, formatDate, UNIT_LABEL, COST_UNIT_SHORT, BASIS_LABEL, todayIso, unitsFor } from '../format.js';
import { COMPONENT_LABEL } from '@shared/costing.js';

let seq = 1;
const k = (e) => ({ ...e, _key: e._key || `p${seq++}` });

export function Production({ query }) {
  const { catalog, engine, productsById, recipesById, confirm } = useStore();
  const [run, busy] = useAction();
  const [entries, setEntries] = useState(() => (query.product ? [k({ kind: 'product', id: Number(query.product), qty: null, unit: 'pc' })] : []));
  const [picker, setPicker] = useState(false);
  const [plans, setPlans] = useState([]);
  const [planId, setPlanId] = useState(null);
  const [name, setName] = useState('Παραγωγή');
  const [date, setDate] = useState(todayIso());
  const [open, setOpen] = useState({});

  const loadPlans = () => api.get('/api/plans').then(setPlans);
  useEffect(() => {
    loadPlans();
  }, []);

  const valid = useMemo(() => entries.filter((e) => e.qty > 0 && (e.kind === 'product' ? productsById.has(e.id) : recipesById.has(e.id))), [entries, productsById, recipesById]);
  const plan = useMemo(() => engine.plan(valid), [engine, valid]);
  const basis = catalog.settings.vat_basis;
  const apiEntries = valid.map(({ kind, id, qty, unit }) => ({ kind, id, qty, unit }));

  const update = (key, patch) => setEntries((es) => es.map((e) => (e._key === key ? { ...e, ...patch } : e)));
  const loadPlan = (p) => {
    setPlanId(p.id);
    setName(p.name);
    setDate(p.plan_date || todayIso());
    setEntries(p.entries.map(k));
  };
  const savePlan = () =>
    run(async () => {
      const body = { name, plan_date: date, entries: apiEntries };
      if (planId) await api.put(`/api/plans/${planId}`, body);
      else setPlanId((await api.post('/api/plans', body)).id);
      await loadPlans();
    }, 'Το πλάνο αποθηκεύτηκε');
  const deletePlan = async () => {
    if (!(await confirm({ title: 'Διαγραφή πλάνου', message: `Να διαγραφεί το «${name}»;`, confirmText: 'Διαγραφή', danger: true }))) return;
    await run(async () => {
      await api.del(`/api/plans/${planId}`);
      setPlanId(null);
      await loadPlans();
    });
  };
  const exportFile = (fmt) =>
    run(() => download(`/api/export/plan.${fmt}`, { method: 'POST', body: { entries: apiEntries, name: `${name} ${formatDate(date)}` } })).catch(() => {});

  const t = plan.totals;
  return (
    <div>
      <PageHead title="Προγραμματισμός παραγωγής">
        <button className="btn" onClick={printSection} disabled={!valid.length}>
          <Icon name="print" /> Εκτύπωση
        </button>
        <button className="btn" onClick={() => exportFile('xlsx')} disabled={!valid.length || busy}>
          <Icon name="download" /> Excel
        </button>
        <button className="btn" onClick={() => exportFile('csv')} disabled={!valid.length || busy}>
          CSV
        </button>
      </PageHead>

      <div className="card no-print">
        <div className="row">
          <Field label="Όνομα πλάνου" className="w-md">
            <TextInput value={name} onChange={setName} />
          </Field>
          <Field label="Ημερομηνία">
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Αποθηκευμένα πλάνα">
            <Select
              value={planId}
              onChange={(v) => {
                const p = plans.find((x) => String(x.id) === String(v));
                if (p) loadPlan(p);
                else {
                  setPlanId(null);
                  setEntries([]);
                  setName('Παραγωγή');
                }
              }}
              placeholder="— Νέο πλάνο —"
              options={plans.map((p) => ({ value: p.id, label: `${p.name}${p.plan_date ? ` (${formatDate(p.plan_date)})` : ''}` }))}
            />
          </Field>
        </div>
        <h3>Τι θέλω να παράγω</h3>
        {entries.map((e) => {
          const node = e.kind === 'product' ? productsById.get(e.id) : recipesById.get(e.id);
          const res = e.kind === 'recipe' ? engine.evalRecipe(e.id) : null;
          const units = res ? unitsFor(res.yield.outputUnit || 'kg', res.profile) : ['pc'];
          return (
            <div key={e._key} className="item-row" style={{ marginBottom: '.5rem' }}>
              <div className="qty" style={{ marginTop: 0 }}>
                <span className="strong">Θέλω</span>
                <NumberInput value={e.qty} onChange={(v) => update(e._key, { qty: v })} placeholder="π.χ. 60" />
                {e.kind === 'product' ? (
                  <span className="muted">τεμ.</span>
                ) : (
                  <select className="input" value={e.unit || units[0]} onChange={(ev) => update(e._key, { unit: ev.target.value })}>
                    {units.map((u) => (
                      <option key={u} value={u}>
                        {UNIT_LABEL[u]}
                      </option>
                    ))}
                  </select>
                )}
                <span className="grow strong" style={{ flex: 1, minWidth: 140 }}>
                  {node?.name || '(δεν υπάρχει)'} <span className="kindtag">{e.kind === 'product' ? 'Προϊόν' : 'Συνταγή'}</span>
                </span>
                <button className="iconbtn" onClick={() => setEntries((es) => es.filter((x) => x._key !== e._key))} aria-label="Αφαίρεση">
                  <Icon name="trash" />
                </button>
              </div>
            </div>
          );
        })}
        <div className="row">
          <button className="btn primary" style={{ flex: 1 }} onClick={() => setPicker(true)}>
            <Icon name="plus" /> Προσθήκη προϊόντος ή συνταγής
          </button>
          <button className="btn" onClick={savePlan} disabled={busy || !valid.length}>
            Αποθήκευση πλάνου
          </button>
          {planId && (
            <button className="btn danger" onClick={deletePlan} disabled={busy}>
              <Icon name="trash" />
            </button>
          )}
        </div>
      </div>

      {valid.length > 0 && (
        <div className="print-area">
          <div className="print-only">
            <h1>
              {name} · {formatDate(date)}
            </h1>
            <p>Βάση κοστολόγησης: {BASIS_LABEL[basis]}</p>
          </div>
          <Issues issues={plan.issues} />
          <div className="grid2">
            <div className="card">
              <h2>Σύνοψη</h2>
              <div className="table-wrap">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Παραγωγή</th>
                      <th className="num">Ποσότητα</th>
                      <th className="num">Κόστος/μον.</th>
                      <th className="num">Σύνολο</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.entries.map((e, i) => (
                      <tr key={i}>
                        <td>
                          {e.name} {!e.complete && <Badge kind="danger">Ελλιπές</Badge>}
                        </td>
                        <td className="num">{formatQty(e.qty, e.unit, { keepUnit: true })}</td>
                        <td className="num">
                          {e.perUnit ? `${formatMoney(e.perUnit.total)}/${COST_UNIT_SHORT[e.outputUnit]}` : '—'}
                        </td>
                        <td className="num strong">{e.cost ? formatMoney(e.cost.total) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className={`costbox ${plan.complete ? '' : 'incomplete'}`} style={{ marginBottom: '1rem' }}>
              <div className="head">
                <span className="big">{formatMoney(t.total)}</span>
                <span className="muted">συνολικό κόστος παραγωγής</span>
                {!plan.complete && <Badge kind="danger">Ελλιπές κοστολόγιο</Badge>}
              </div>
              <div className="body">
                {['materials', 'packaging', 'labor', 'overhead'].map((c) => {
                  const na = (c === 'labor' && !plan.laborIncluded) || (c === 'overhead' && !plan.overheadIncluded) || (c === 'packaging' && !plan.packaging.length && !t.packaging);
                  return (
                    <div key={c} className="costrow">
                      <span>
                        {COMPONENT_LABEL[c]}
                        {c === 'labor' && plan.laborMinutes > 0 && <span className="muted small"> · {formatNumber(plan.laborMinutes, 0)} λεπτά</span>}
                      </span>
                      {na ? <span className="na">{c === 'overhead' ? 'δεν έχουν καταχωριστεί' : c === 'packaging' ? 'καμία' : 'δεν έχει καταχωριστεί'}</span> : <span>{formatMoney(t[c])}</span>}
                    </div>
                  );
                })}
                <div className="costrow total">
                  <span>Σύνολο</span>
                  <span>{formatMoney(t.total)}</span>
                </div>
                <div className="muted small" style={{ marginTop: '.4rem' }}>
                  Βάση: <b>{BASIS_LABEL[basis]}</b>

                </div>
              </div>
            </div>
          </div>

          {plan.recipes.length > 0 && (
            <div className="card">
              <h2>Επιμέρους συνταγές</h2>
              <div className="table-wrap">
                <table className="t">
                  <thead>
                    <tr>
                      <th>Συνταγή</th>
                      <th className="num">Απαιτούμενη ποσότητα</th>
                      <th className="num">Παρτίδες</th>
                      <th>Για</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.recipes.map((r) => (
                      <RecipeRow key={r.id} r={r} open={!!open[r.id]} toggle={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))} />
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small muted no-print">Πατήστε μια συνταγή για τις ποσότητες ζυγίσματος. Η ποσότητα αφορά το έτοιμο προϊόν (μετά την απόδοση).</p>
            </div>
          )}

          <div className="card">
            <h2>Πρώτες ύλες (συγκεντρωτικά)</h2>
            <MaterialsTable rows={plan.materials} />
          </div>
          {plan.packaging.length > 0 && (
            <div className="card">
              <h2>Συσκευασίες</h2>
              <MaterialsTable rows={plan.packaging} packaging />
            </div>
          )}
        </div>
      )}

      {!valid.length && (
        <div className="card">
          <p className="muted">Προσθέστε προϊόντα ή συνταγές και ποσότητες για να υπολογιστούν οι ανάγκες σε συνταγές, πρώτες ύλες, συσκευασίες και κόστος.</p>
          {plans.some((p) => p.is_sample) && (
            <p>
              Δείτε το παράδειγμα: επιλέξτε <b>«{plans.find((p) => p.is_sample).name}»</b> στα αποθηκευμένα πλάνα. <SampleBadge show />
            </p>
          )}
        </div>
      )}

      {picker && (
        <ItemPicker
          title="Τι θέλετε να παράγετε;"
          kinds={['product', 'recipe']}
          onClose={() => setPicker(false)}
          onPick={(it) => {
            const res = it.type === 'recipe' ? engine.evalRecipe(it.id) : null;
            const unit = it.type === 'recipe' ? (res?.yield.outputUnit === 'pc' ? 'pc' : res?.yield.outputUnit === 'l' ? 'l' : 'kg') : 'pc';
            setEntries((es) => [...es, k({ kind: it.type, id: it.id, qty: null, unit })]);
            setPicker(false);
          }}
        />
      )}
    </div>
  );
}

function RecipeRow({ r, open, toggle }) {
  return (
    <>
      <tr onClick={toggle} style={{ cursor: 'pointer' }}>
        <td className="strong">
          {open ? '▾' : '▸'} <Link to={`/recipes/${r.id}`} onClick={(e) => e.stopPropagation()}>{r.name}</Link> {!r.complete && <Badge kind="danger">Ελλιπές</Badge>}
        </td>
        <td className="num strong">{formatQty(r.need, r.baseUnit)}</td>
        <td className="num">× {formatNumber(r.batches, 3)}</td>
        <td className="small">{r.usedBy.join(', ')}</td>
      </tr>
      {open &&
        r.items.map((it, i) => (
          <tr key={i} className="small">
            <td style={{ paddingLeft: '1.6rem' }}>
              {it.name}
              {it.note ? <span className="muted"> · {it.note}</span> : null}
            </td>
            <td className="num">{formatQty(it.qty, it.unit)}</td>
            <td colSpan={2} className="muted">
              {it.type === 'recipe' ? 'επιμέρους συνταγή' : ''}
            </td>
          </tr>
        ))}
    </>
  );
}

function MaterialsTable({ rows, packaging }) {
  const total = rows.reduce((s, r) => s + (r.cost ?? 0), 0);
  return (
    <div className="table-wrap">
      <table className="t">
        <thead>
          <tr>
            <th>{packaging ? 'Συσκευασία' : 'Υλικό'}</th>
            <th className="num">Ποσότητα</th>
            <th className="num">Κόστος</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td>
                <Link to={`/materials/${m.id}`}>{m.name}</Link>
                {m.packs && <div className="small muted">≈ {m.packs.count} συσκ. × {m.packs.label || formatQty(m.packs.content, m.costUnit)}</div>}
              </td>
              <td className="num strong">{packaging && m.costUnit === 'pc' ? `${formatNumber(Math.ceil(m.qty - 1e-9), 0)} τεμ.` : formatQty(m.qty, m.costUnit)}</td>
              <td className="num">{m.cost != null ? formatMoney(m.cost) : <Badge kind="danger">Χωρίς τιμή</Badge>}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Σύνολο</td>
            <td className="num">{formatMoney(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
