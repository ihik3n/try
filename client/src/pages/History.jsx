// Ιστορικό μεταβολών τιμών και στιγμιότυπα κοστολογίων.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useStore, useAction } from '../store.jsx';
import { PageHead, Tabs, Spinner, Field, TextInput, Badge, SampleBadge, Link, DiffText, Empty } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { ChangesTable, ImpactsTable } from './InvoiceEdit.jsx';
import { formatDateTime, formatDate, formatMoney, formatUnitPrice, formatQty, COST_UNIT_SHORT, BASIS_LABEL } from '../format.js';
import { navigate } from '../router.js';

const REASON = {
  invoice_confirmed: 'Επιβεβαίωση παραστατικού',
  invoice_reopened: 'Επαναφορά παραστατικού σε πρόχειρο',
  invoice_deleted: 'Διαγραφή παραστατικού',
  manual_price: 'Χειροκίνητη τιμή',
  manual_price_deleted: 'Διαγραφή χειροκίνητης τιμής',
  price_selection: 'Αλλαγή επιλογής τιμής',
  material_deleted: 'Διαγραφή υλικού',
};

export function History({ tab: initialTab }) {
  const [tab, setTab] = useState(initialTab || 'events');
  return (
    <div>
      <PageHead title="Ιστορικό κοστολόγησης" />
      <Tabs
        value={tab}
        onChange={(t) => {
          setTab(t);
          navigate(`/history?tab=${t}`, { replace: true });
        }}
        tabs={[
          { value: 'events', label: 'Μεταβολές τιμών' },
          { value: 'snapshots', label: 'Στιγμιότυπα κοστολογίων' },
        ]}
      />
      {tab === 'events' ? <Events /> : <Snapshots />}
    </div>
  );
}

function Events() {
  const [events, setEvents] = useState(null);
  const [open, setOpen] = useState({});
  useEffect(() => {
    api.get('/api/price-events?limit=200').then(setEvents);
  }, []);
  if (!events) return <Spinner />;
  if (!events.length) return <Empty icon="history">Δεν έχουν καταγραφεί μεταβολές. Καταγράφονται αυτόματα όταν επιβεβαιώνετε τιμολόγια ή αλλάζετε τιμές.</Empty>;
  return events.map((e) => (
    <div key={e.id} className="card">
      <div className="card-head">
        <h3>
          {REASON[e.reason] || e.reason}
          {e.invoice_id && (
            <Link to={`/invoices/${e.invoice_id}`} className="small">
              {e.supplier_name || ''} {e.invoice_number ? `αρ. ${e.invoice_number}` : ''}
            </Link>
          )}{' '}
          <SampleBadge show={e.is_sample} />
        </h3>
        <span className="small muted">
          {formatDateTime(e.created_at)}
          {e.user_name ? ` · ${e.user_name}` : ''} · {BASIS_LABEL[e.vat_basis]}
        </span>
      </div>
      <ChangesTable changes={e.changes} />
      {e.impacts.length > 0 && (
        <>
          <button className="btn small" style={{ marginTop: '.6rem' }} onClick={() => setOpen((o) => ({ ...o, [e.id]: !o[e.id] }))}>
            {open[e.id] ? '▾' : '▸'} Επηρεάστηκαν {e.impacts.filter((i) => i.kind === 'product').length} προϊόντα και {e.impacts.filter((i) => i.kind === 'recipe').length} συνταγές
          </button>
          {open[e.id] && (
            <div style={{ marginTop: '.6rem' }}>
              <ImpactsTable impacts={e.impacts} />
            </div>
          )}
        </>
      )}
    </div>
  ));
}

function Snapshots() {
  const [run, busy] = useAction();
  const [list, setList] = useState(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const load = () => api.get('/api/snapshots').then(setList);
  useEffect(() => {
    load();
  }, []);
  const create = () =>
    run(async () => {
      await api.post('/api/snapshots', { name: name || `Κοστολόγιο ${new Date().toLocaleDateString('el-GR')}`, note });
      setName('');
      setNote('');
      await load();
    }, 'Το στιγμιότυπο αποθηκεύτηκε');
  return (
    <>
      <div className="card">
        <h3>Νέο στιγμιότυπο</h3>
        <p className="small muted">Αποθηκεύει με ημερομηνία τις τρέχουσες ποσότητες, τιμές, αποδόσεις και κόστη όλων των συνταγών και προϊόντων. Δεν αλλάζει ποτέ, ώστε να συγκρίνετε το παλιό κόστος με το σημερινό.</p>
        <div className="row">
          <Field label="Όνομα" className="w-md">
            <TextInput value={name} onChange={setName} placeholder={`Κοστολόγιο ${new Date().toLocaleDateString('el-GR')}`} />
          </Field>
          <Field label="Σημείωση">
            <TextInput value={note} onChange={setNote} />
          </Field>
        </div>
        <button className="btn primary" onClick={create} disabled={busy}>
          <Icon name="snapshot" /> Αποθήκευση στιγμιότυπου
        </button>
      </div>
      <div className="card tight">
        {!list ? (
          <Spinner />
        ) : !list.length ? (
          <Empty icon="snapshot">Δεν υπάρχουν στιγμιότυπα.</Empty>
        ) : (
          <div className="list">
            {list.map((s) => (
              <Link key={s.id} to={`/history/snapshots/${s.id}`} className="list-item">
                <div className="grow">
                  <div className="title">
                    {s.name} <SampleBadge show={s.is_sample} />
                  </div>
                  <div className="sub">
                    {formatDateTime(s.created_at)} · {BASIS_LABEL[s.vat_basis]}
                    {s.note ? ` · ${s.note}` : ''}
                  </div>
                </div>
                <span className="small">Σύγκριση →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function SnapshotCompare({ id }) {
  const { confirm } = useStore();
  const [run] = useAction();
  const [data, setData] = useState(null);
  const [kind, setKind] = useState('product');
  const [open, setOpen] = useState({});
  useEffect(() => {
    api.get(`/api/snapshots/${id}`).then(setData);
  }, [id]);
  if (!data) return <Spinner />;
  const del = async () => {
    if (!(await confirm({ title: 'Διαγραφή στιγμιότυπου', message: `Να διαγραφεί το «${data.snapshot.name}»;`, confirmText: 'Διαγραφή', danger: true }))) return;
    await run(async () => {
      await api.del(`/api/snapshots/${id}`);
      navigate('/history?tab=snapshots');
    });
  };
  const items = data.items.filter((i) => i.kind === kind);
  return (
    <div>
      <PageHead title={data.snapshot.name} back="/history?tab=snapshots">
        <button className="btn danger" onClick={del}>
          <Icon name="trash" />
        </button>
      </PageHead>
      <p className="muted">
        Στιγμιότυπο {formatDateTime(data.snapshot.created_at)} ({BASIS_LABEL[data.snapshot.vat_basis]}) σε σύγκριση με σήμερα ({BASIS_LABEL[data.current_basis]}).
        {data.snapshot.vat_basis !== data.current_basis && <Badge kind="warn">Διαφορετική βάση ΦΠΑ</Badge>}
      </p>
      <Tabs
        value={kind}
        onChange={setKind}
        tabs={[
          { value: 'product', label: 'Προϊόντα' },
          { value: 'recipe', label: 'Συνταγές' },
          { value: 'materials', label: `Τιμές υλικών (${data.materials.length})` },
        ]}
      />
      {kind === 'materials' ? (
        <div className="card">
          {!data.materials.length ? (
            <p className="muted">Καμία αλλαγή τιμής.</p>
          ) : (
            <div className="table-wrap">
              <table className="t">
                <thead>
                  <tr>
                    <th>Υλικό</th>
                    <th className="num">Τότε</th>
                    <th className="num">Σήμερα</th>
                    <th className="num">Μεταβολή</th>
                  </tr>
                </thead>
                <tbody>
                  {data.materials.map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td className="num">
                        {m.old_price != null ? formatUnitPrice(m.old_price, m.unit) : '—'}
                        <div className="small muted">{formatDate(m.old_date)}</div>
                      </td>
                      <td className="num">
                        {m.new_price != null ? formatUnitPrice(m.new_price, m.unit) : '—'}
                        <div className="small muted">{formatDate(m.new_date)}</div>
                      </td>
                      <td className="num">
                        <DiffText diff={m.diff} pct={m.pct} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>{kind === 'product' ? 'Προϊόν' : 'Συνταγή'}</th>
                  <th className="num">Τότε</th>
                  <th className="num">Σήμερα</th>
                  <th className="num">Μεταβολή</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <SnapRow key={i.id} i={i} open={!!open[i.id]} toggle={() => setOpen((o) => ({ ...o, [i.id]: !o[i.id] }))} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SnapRow({ i, open, toggle }) {
  const u = COST_UNIT_SHORT[i.unit] || '';
  return (
    <>
      <tr onClick={toggle} style={{ cursor: 'pointer' }}>
        <td>
          {open ? '▾' : '▸'} {i.name} {!i.exists && <Badge kind="neutral">διαγράφηκε</Badge>} {i.exists && !i.new_complete && <Badge kind="danger">Ελλιπές σήμερα</Badge>}
          {!i.old_complete && <Badge kind="warn">Ελλιπές τότε</Badge>}
        </td>
        <td className="num">
          {formatMoney(i.old_cost)}/{u}
        </td>
        <td className="num">{i.exists ? `${formatMoney(i.new_cost)}/${u}` : '—'}</td>
        <td className="num">
          <DiffText diff={i.diff} pct={i.pct} />
        </td>
      </tr>
      {open &&
        i.lines.map((l, j) => (
          <tr key={j} className="small">
            <td style={{ paddingLeft: '1.6rem' }}>
              {l.name}
              <div className="muted">
                {l.old ? formatQty(l.old.qty, l.old.unit, { keepUnit: true }) : 'νέα γραμμή'} {l.current && l.old && (l.current.qty !== l.old.qty || l.current.unit !== l.old.unit) ? `→ ${formatQty(l.current.qty, l.current.unit, { keepUnit: true })}` : ''}
                {!l.current && ' · αφαιρέθηκε'}
              </div>
            </td>
            <td className="num">{l.old ? formatMoney(l.old.cost) : '—'}</td>
            <td className="num">{l.current ? formatMoney(l.current.cost) : '—'}</td>
            <td className="num">
              <DiffText diff={l.old?.cost != null && l.current?.cost != null ? l.current.cost - l.old.cost : null} />
            </td>
          </tr>
        ))}
      {open && i.old_yield && (
        <tr className="small muted">
          <td colSpan={4} style={{ paddingLeft: '1.6rem' }}>
            Απόδοση τότε: {i.old_yield.base != null ? formatQty(i.old_yield.base, i.old_yield.baseUnit) : '—'}
            {i.new_yield ? ` · σήμερα: ${i.new_yield.base != null ? formatQty(i.new_yield.base, i.new_yield.baseUnit) : '—'}` : ''}
          </td>
        </tr>
      )}
    </>
  );
}
