import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useStore, useAction } from '../store.jsx';
import { PageHead, Field, TextInput, NumberInput, CostBreakdown, Issues, SampleBadge, Spinner, Badge } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { ItemsEditor, LaborOverhead, OwnCostsNote, withKey, lineCost } from '../components/Editors.jsx';
import { formatMoney, formatQty, formatUnitPrice, BASIS_LABEL } from '../format.js';
import { createEngine, COMPONENT_LABEL } from '@shared/costing.js';
import { navigate, setNavigationBlocker } from '../router.js';

const EMPTY = { name: '', category: '', notes: '', batch_size: 1, labor_minutes: null, labor_rate: null, overhead_fixed: null, overhead_pct: null, overhead_base: 'materials', archived: 0, items: [] };

export function ProductEdit({ id }) {
  const { catalog, productsById, reload, confirm, hl } = useStore();
  const [run, busy] = useAction();
  const saved = id != null ? productsById.get(id) : null;
  const [draft, setDraft] = useState(() => (saved ? { ...saved, items: saved.items.map(withKey) } : { ...EMPTY }));
  const [dirty, setDirty] = useState(false);
  useEffect(() => setNavigationBlocker(() => dirty), [dirty]);

  const selfId = id ?? -1;
  const res = useMemo(() => {
    const products = catalog.products.filter((p) => p.id !== selfId);
    products.push({ ...draft, id: selfId });
    return createEngine({ ...catalog, products }).evalProduct(selfId);
  }, [catalog, draft, selfId]);

  if (id != null && !saved) return <Spinner />;

  const set = (k, v) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };
  const body = () => ({
    ...draft,
    items: draft.items.map((it) => ({ material_id: it.material_id ?? null, recipe_id: it.recipe_id ?? null, qty: it.qty, unit: it.unit, note: it.note || null })),
  });
  const missingRef = draft.items.some((it) => it.material_id == null && it.recipe_id == null);

  const save = () =>
    run(async () => {
      const r = id == null ? await api.post('/api/products', body()) : await api.put(`/api/products/${id}`, body());
      setDirty(false);
      await reload();
      if (id == null) navigate(`/products/${r.id}`, { replace: true, force: true });
    }, 'Το προϊόν αποθηκεύτηκε');
  const duplicate = () =>
    run(async () => {
      if (dirty) await api.put(`/api/products/${id}`, body());
      setDirty(false);
      const r = await api.post(`/api/products/${id}/duplicate`);
      await reload();
      navigate(`/products/${r.id}`, { force: true });
    }, 'Δημιουργήθηκε αντίγραφο');
  const del = async () => {
    if (!(await confirm({ title: 'Διαγραφή προϊόντος', message: `Να διαγραφεί το «${saved.name}»;`, confirmText: 'Διαγραφή', danger: true }))) return;
    await run(async () => {
      await api.del(`/api/products/${id}`);
      setDirty(false);
      await reload();
      navigate('/products', { force: true });
    }, 'Διαγράφηκε');
  };

  const basis = catalog.settings.vat_basis;
  const groups = [
    { k: 'recipe', title: 'Επιμέρους συνταγές', lines: res.lines.filter((l) => l.type === 'recipe') },
    { k: 'ingredient', title: 'Πρόσθετες πρώτες ύλες & διακόσμηση', lines: res.lines.filter((l) => l.type === 'material' && l.kind !== 'packaging') },
    { k: 'packaging', title: 'Συσκευασίες', lines: res.lines.filter((l) => l.kind === 'packaging') },
  ];

  return (
    <div>
      <PageHead title={id == null ? 'Νέο προϊόν' : draft.name || 'Προϊόν'} back="/products" badges={<SampleBadge show={saved?.is_sample} />}>
        {id != null && (
          <>
            <button className="btn" onClick={() => navigate(`/production?product=${id}`)}>
              <Icon name="factory" /> Παραγωγή
            </button>
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
              <Field label="Όνομα προϊόντος *" className="w-md">
                <TextInput value={draft.name} onChange={(v) => set('name', v)} placeholder="π.χ. Ποτηράκι μους σοκολάτας" />
              </Field>
              <Field label="Κατηγορία">
                <input className="input" list="prod-cats" value={draft.category || ''} onChange={(e) => set('category', e.target.value)} />
                <datalist id="prod-cats">
                  {['Ποτηράκια', 'Πάστες', 'Τούρτες', 'Μπισκότα', 'Gelato', 'Αρτοποιία', 'Κέικ', ...(catalog.product_categories || [])].filter((v, i, a) => a.indexOf(v) === i).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <h2>Σύνθεση ανά τεμάχιο</h2>
            </div>
            <p className="small muted">Ποσότητες για 1 τεμάχιο/μερίδα: συνταγές (π.χ. 80 g μους), πρώτες ύλες/διακόσμηση και συσκευασίες (π.χ. 1 ποτηράκι, 1 καπάκι).</p>
            <ItemsEditor kind="product" items={draft.items} setItems={(items) => set('items', items)} result={res} />
          </div>
          <div className="card">
            <LaborOverhead
              value={draft}
              set={set}
              defaultRate={catalog.settings.labor_rate}
              perBatchLabel={`ανά ${draft.batch_size || 1} τεμ.`}
              batchField={
                <Field label="Παρτίδα αναφοράς για εργασία & σταθερά έξοδα (τεμάχια)" hint="π.χ. 40 λεπτά συναρμολόγησης για 60 τεμάχια → γράψτε 60">
                  <NumberInput value={draft.batch_size} onChange={(v) => set('batch_size', v)} />
                </Field>
              }
            />
          </div>
          <div className="card">
            <h2>Σημειώσεις</h2>
            <textarea className="input" rows={4} value={draft.notes || ''} onChange={(e) => set('notes', e.target.value)} />
            {id != null && (
              <label className="checkbox" style={{ marginTop: '.5rem' }}>
                <input type="checkbox" checked={!!draft.archived} onChange={(e) => set('archived', e.target.checked ? 1 : 0)} /> Αρχειοθετημένο
              </label>
            )}
          </div>
        </div>

        <div className="side">
          <CostBreakdown result={res} perLabel="ανά τεμάχιο" basis={basis} />
          <div className="card" style={{ marginTop: '1rem' }}>
            <h3>Αναλυτικά ανά τεμάχιο</h3>
            {groups.map((g) =>
              g.lines.length ? (
                <div key={g.k} style={{ marginBottom: '.5rem' }}>
                  <div className="kindtag">{g.title}</div>
                  {g.lines.map((l, i) => {
                    const lc = lineCost(l, hl);
                    return (
                      <div key={i} className="costrow">
                        <span>
                          {l.name} <span className="muted small">{formatQty(l.qty, l.unit, { keepUnit: true })}</span>
                          {lc.unitPrice != null && <div className="small muted">{formatUnitPrice(lc.unitPrice, l.costUnit)}</div>}
                        </span>
                        <span>{lc.cost != null ? formatMoney(lc.cost) : <Badge kind="danger">—</Badge>}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null,
            )}
            <div className="divider" />
            <div className="small">
              <b>Περιλαμβάνονται:</b>{' '}
              {['materials', 'packaging', 'labor', 'overhead']
                .map((k) => {
                  const inc = k === 'materials' ? true : k === 'packaging' ? res.batch.packaging > 0 : k === 'labor' ? res.laborIncluded : res.overheadIncluded;
                  return `${COMPONENT_LABEL[k]} ${inc ? '✓' : k === 'overhead' ? '— δεν έχουν καταχωριστεί' : k === 'packaging' ? '— καμία' : '— δεν έχει καταχωριστεί'}`;
                })
                .join(' · ')}
            </div>
            <OwnCostsNote result={res} />
          </div>
          <Issues issues={res.issues} />
          <button className="btn primary block big" onClick={save} disabled={busy || !draft.name?.trim() || missingRef}>
            <Icon name="check" /> Αποθήκευση {dirty ? '•' : ''}
          </button>
          {missingRef && <p className="small up">Κάποια γραμμή δεν έχει επιλογή.</p>}
          <p className="small muted" style={{ marginTop: '.5rem' }}>
            Βάση: {BASIS_LABEL[basis]}. Αλλαγές στις συνταγές ή στις τιμές ενημερώνουν αυτόματα το κόστος.
          </p>
        </div>
      </div>
      <div className="stickybar mobile-only">
        <div className="info">
          <b>{res.perUnit ? formatMoney(hl(res.perUnit)) : '—'}</b> {'ανά τεμάχιο'} {!res.complete && <Badge kind="danger">Ελλιπές</Badge>}
        </div>
        <button className="btn primary" onClick={save} disabled={busy || !draft.name?.trim() || missingRef}>
          <Icon name="check" /> Αποθήκευση {dirty ? '•' : ''}
        </button>
      </div>
    </div>
  );
}
