import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useStore, useAction } from '../store.jsx';
import { Link, PageHead, SampleBadge, Badge, Spinner, Field, NumberInput, TextInput, DiffText } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { MaterialForm } from '../components/MaterialForm.jsx';
import { formatDate, formatUnitPrice, formatNumber, formatQty, todayIso, COST_UNIT_LABEL, BASIS_LABEL } from '../format.js';
import { effectiveUnitPrice } from '@shared/costing.js';
import { navigate } from '../router.js';

export function MaterialDetail({ id }) {
  const { catalog, materialsById, reload, confirm } = useStore();
  const [run, busy] = useAction();
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(false);
  const [np, setNp] = useState({ unit_net: null, vat_rate: null, doc_date: todayIso(), note: '' });
  const m = materialsById.get(id);
  const basis = catalog.settings.vat_basis;

  const load = useCallback(() => api.get(`/api/materials/${id}/detail`).then(setDetail), [id]);
  useEffect(() => {
    load();
  }, [load, catalog]);

  if (!m) return <Spinner />;
  const u = { kg: 'kg', l: 'lt', pc: 'τεμ.' }[m.cost_unit];
  const eff = effectiveUnitPrice(m, basis);

  const refresh = async () => {
    await reload();
    await load();
  };
  const pin = (priceId) => run(async () => (await api.put(`/api/materials/${id}/price-selection`, { mode: 'pinned', price_id: priceId }), refresh()), 'Η τιμή επιλέχθηκε χειροκίνητα');
  const unpin = () => run(async () => (await api.put(`/api/materials/${id}/price-selection`, { mode: 'latest' }), refresh()), 'Χρήση της τελευταίας τιμής');
  const addPrice = () =>
    run(async () => {
      await api.post(`/api/materials/${id}/prices`, np);
      setNp({ unit_net: null, vat_rate: np.vat_rate, doc_date: todayIso(), note: '' });
      await refresh();
    }, 'Η τιμή καταχωρίστηκε');
  const delPrice = async (p) => {
    if (!(await confirm({ title: 'Διαγραφή τιμής', message: `Να διαγραφεί η χειροκίνητη τιμή της ${formatDate(p.doc_date)};`, confirmText: 'Διαγραφή', danger: true }))) return;
    await run(async () => (await api.del(`/api/prices/${p.id}`), refresh()));
  };
  const delAlias = (a) => run(async () => (await api.del(`/api/aliases/${a.id}`), load()), 'Η αντιστοίχιση αφαιρέθηκε');
  const del = async () => {
    if (!(await confirm({ title: 'Διαγραφή υλικού', message: `Να διαγραφεί οριστικά το «${m.name}»;`, confirmText: 'Διαγραφή', danger: true }))) return;
    await run(async () => {
      await api.del(`/api/materials/${id}`);
      await reload();
      navigate('/materials');
    }, 'Διαγράφηκε');
  };

  return (
    <div>
      <PageHead title={m.name} back="/materials" badges={<><SampleBadge show={m.is_sample} /> {m.archived ? <Badge>Αρχειοθετημένο</Badge> : null}</>}>
        <button className="btn" onClick={() => setEditing(true)}>
          <Icon name="edit" /> Διόρθωση
        </button>
      </PageHead>

      <div className="grid2">
        <div className="card">
          <h3>Ενεργή τιμή κοστολόγησης</h3>
          {m.price ? (
            <>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--primary)' }}>{eff.value != null ? formatUnitPrice(eff.value, m.cost_unit) : '—'}</div>
              <div className="small muted" style={{ marginBottom: '.5rem' }}>
                Βάση: {BASIS_LABEL[basis]}
                {eff.reason === 'missing_vat' && <Badge kind="warn">Λείπει ΦΠΑ</Badge>}
              </div>
              <dl className="kv">
                <dt>Χωρίς ΦΠΑ</dt>
                <dd>{formatUnitPrice(m.price.unit_net, m.cost_unit)}</dd>
                <dt>ΦΠΑ</dt>
                <dd>{m.price.vat_rate != null ? `${formatNumber(m.price.vat_rate, 2)}%` : '—'}</dd>
                <dt>Ημερομηνία</dt>
                <dd>{formatDate(m.price.doc_date)}</dd>
                <dt>Προέλευση</dt>
                <dd>
                  {m.price.source === 'invoice' ? (
                    <Link to={`/invoices/${m.price.invoice_id}`}>
                      Παραστατικό {m.price.invoice_number || ''} {m.price.supplier_name ? `· ${m.price.supplier_name}` : ''}
                    </Link>
                  ) : (
                    'Χειροκίνητη καταχώριση'
                  )}
                </dd>
                <dt>Επιλογή</dt>
                <dd>{m.price.pinned ? '📌 Χειροκίνητη επιλογή από το ιστορικό' : 'Τελευταία βάσει ημερομηνίας παραστατικού'}</dd>
              </dl>
              {m.price.pinned ? (
                <button className="btn small" style={{ marginTop: '.6rem' }} onClick={unpin} disabled={busy}>
                  Χρήση της τελευταίας τιμής
                </button>
              ) : null}
            </>
          ) : (
            <div className="alert danger">Δεν υπάρχει τιμή. Όπου χρησιμοποιείται, το κοστολόγιο εμφανίζεται «Ελλιπές».</div>
          )}
        </div>

        <div className="card">
          <h3>Στοιχεία</h3>
          <dl className="kv">
            <dt>Είδος</dt>
            <dd>{m.kind === 'packaging' ? 'Συσκευασία' : 'Πρώτη ύλη'}</dd>
            <dt>Μονάδα κοστολόγησης</dt>
            <dd>{COST_UNIT_LABEL[m.cost_unit]}</dd>
            <dt>Κατηγορία</dt>
            <dd>{m.category || '—'}</dd>
            <dt>Μάρκα</dt>
            <dd>{m.brand || '—'}</dd>
            <dt>Χαρακτηριστικά</dt>
            <dd>{m.attributes || '—'}</dd>
            <dt>Πυκνότητα</dt>
            <dd>{m.density ? `${formatNumber(m.density, 4)} g/ml` : '— (χωρίς μετατροπή βάρους↔όγκου)'}</dd>
            <dt>Βάρος τεμαχίου</dt>
            <dd>{m.piece_weight ? `${formatNumber(m.piece_weight, 2)} g` : '—'}</dd>
            {m.last_pack && (
              <>
                <dt>Συσκευασία αγοράς</dt>
                <dd>
                  {m.last_pack.label} ({formatQty(m.last_pack.content, m.cost_unit, { keepUnit: true })})
                </dd>
              </>
            )}
            {m.notes && (
              <>
                <dt>Σημειώσεις</dt>
                <dd>{m.notes}</dd>
              </>
            )}
          </dl>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Ιστορικό τιμών</h3>
        </div>
        {!detail ? (
          <Spinner />
        ) : !detail.prices.length ? (
          <p className="muted">Καμία τιμή ακόμη.</p>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Ημ/νία</th>
                  <th className="num">Χωρίς ΦΠΑ</th>
                  <th className="num">ΦΠΑ</th>
                  <th className="num">Μεταβολή</th>
                  <th>Προέλευση</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {detail.prices.map((p, i) => {
                  const prev = detail.prices[i + 1];
                  const active = m.price?.id === p.id;
                  return (
                    <tr key={p.id} style={active ? { background: 'var(--ok-soft)' } : undefined}>
                      <td className="nowrap">
                        {formatDate(p.doc_date)} {active && <Badge kind="ok">ενεργή</Badge>}
                      </td>
                      <td className="num">{formatUnitPrice(p.unit_net, m.cost_unit)}</td>
                      <td className="num">{p.vat_rate != null ? `${formatNumber(p.vat_rate, 2)}%` : '—'}</td>
                      <td className="num">{prev ? <DiffText diff={p.unit_net - prev.unit_net} pct={prev.unit_net ? ((p.unit_net - prev.unit_net) / prev.unit_net) * 100 : null} money={false} /> : ''}</td>
                      <td>
                        {p.source === 'invoice' ? (
                          <Link to={`/invoices/${p.invoice_id}`}>
                            {p.supplier_name || 'Παραστατικό'} {p.invoice_number ? `· ${p.invoice_number}` : ''}
                          </Link>
                        ) : (
                          <span>Χειροκίνητη{p.note ? ` · ${p.note}` : ''}</span>
                        )}
                        {p.quantity != null && (
                          <div className="small muted">
                            {formatQty(p.quantity, m.cost_unit, { keepUnit: true })}
                            {p.pack_label ? ` · συσκ. ${p.pack_label}` : ''}
                          </div>
                        )}
                      </td>
                      <td className="nowrap right">
                        {!active && (
                          <button className="btn small" onClick={() => pin(p.id)} disabled={busy} title="Χρήση αυτής της τιμής στην κοστολόγηση">
                            📌 Χρήση
                          </button>
                        )}
                        {p.source === 'manual' && (
                          <button className="iconbtn" onClick={() => delPrice(p)} aria-label="Διαγραφή">
                            <Icon name="trash" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <details className="more">
          <summary>Χειροκίνητη καταχώριση τιμής</summary>
          <p className="small muted">Για αγορές χωρίς παραστατικό ή τιμοκατάλογο. Η τιμή είναι ανά {u} χωρίς ΦΠΑ. Ενεργή γίνεται αν είναι η πιο πρόσφατη.</p>
          <div className="row">
            <Field label={`Τιμή χωρίς ΦΠΑ (€/${u})`}>
              <NumberInput value={np.unit_net} onChange={(v) => setNp((x) => ({ ...x, unit_net: v }))} />
            </Field>
            <Field label="ΦΠΑ %" className="w-sm">
              <NumberInput value={np.vat_rate} onChange={(v) => setNp((x) => ({ ...x, vat_rate: v }))} />
            </Field>
            <Field label="Ημερομηνία">
              <input type="date" className="input" value={np.doc_date} onChange={(e) => setNp((x) => ({ ...x, doc_date: e.target.value }))} />
            </Field>
          </div>
          <Field label="Σημείωση">
            <TextInput value={np.note} onChange={(v) => setNp((x) => ({ ...x, note: v }))} />
          </Field>
          <button className="btn primary" onClick={addPrice} disabled={busy || np.unit_net == null}>
            Καταχώριση τιμής
          </button>
        </details>
      </div>

      <div className="grid2">
        <div className="card">
          <h3>Αντιστοιχίσεις τιμολογίων</h3>
          <p className="small muted">Περιγραφές προμηθευτών που αναγνωρίζονται αυτόματα ως αυτό το υλικό.</p>
          {!detail?.aliases.length ? (
            <p className="muted">Καμία ακόμη — δημιουργούνται όταν επιβεβαιώνετε τιμολόγια.</p>
          ) : (
            <div className="list">
              {detail.aliases.map((a) => (
                <div key={a.id} className="list-item">
                  <div className="grow">
                    <div className="title">{a.description}</div>
                    <div className="sub">
                      {a.supplier_name || '—'}
                      {a.supplier_code ? ` · κωδ. ${a.supplier_code}` : ''}
                      {a.pack_size ? ` · ${a.pack_count && a.pack_count !== 1 ? `${formatNumber(a.pack_count)} × ` : ''}${formatNumber(a.pack_size, 3)} ${{ kg: 'kg', g: 'g', l: 'lt', ml: 'ml', pc: 'τεμ.' }[a.pack_unit] || ''}` : ''} · {a.times_used}×
                    </div>
                  </div>
                  <button className="iconbtn" onClick={() => delAlias(a)} aria-label="Αφαίρεση">
                    <Icon name="trash" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h3>Χρησιμοποιείται σε</h3>
          {!detail ? (
            <Spinner />
          ) : !detail.usage.all.recipes.length && !detail.usage.all.products.length ? (
            <p className="muted">Δεν χρησιμοποιείται σε συνταγές ή προϊόντα.</p>
          ) : (
            <div className="pill-list">
              {detail.usage.all.recipes.map((r) => (
                <Link key={`r${r.id}`} to={`/recipes/${r.id}`} className="chip">
                  📖 {r.name}
                </Link>
              ))}
              {detail.usage.all.products.map((p) => (
                <Link key={`p${p.id}`} to={`/products/${p.id}`} className="chip">
                  🍰 {p.name}
                </Link>
              ))}
            </div>
          )}
          <div className="divider" />
          <button className="btn danger small" onClick={del} disabled={busy}>
            <Icon name="trash" /> Διαγραφή υλικού
          </button>
          <p className="small muted" style={{ marginTop: '.4rem' }}>
            Υλικά σε χρήση ή με τιμές από παραστατικά δεν διαγράφονται· αρχειοθετήστε τα από τη «Διόρθωση».
          </p>
        </div>
      </div>
      {editing && <MaterialForm material={m} onClose={() => setEditing(false)} onSaved={() => load()} />}
    </div>
  );
}
