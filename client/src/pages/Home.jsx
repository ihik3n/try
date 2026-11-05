import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { api } from '../api.js';
import { Link, Badge, DiffText } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { formatMoney, formatDate, formatUnitPrice, COST_UNIT_SHORT } from '../format.js';
import { navigate } from '../router.js';
import { PhoneAccess } from '../components/PhoneAccess.jsx';
import { impactCosts } from './InvoiceEdit.jsx';
import { isTouch } from '../platform.js';

const PHONE_KEY = 'phone-card-dismissed';
function phoneCardHidden() {
  try {
    return localStorage.getItem(PHONE_KEY) === '1';
  } catch {
    return false;
  }
}

export function Home() {
  const { catalog, engine, costMode } = useStore();
  const [events, setEvents] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [phoneHidden, setPhoneHidden] = useState(() => isTouch() || phoneCardHidden());
  useEffect(() => {
    api.get('/api/price-events?limit=5').then(setEvents).catch(() => {});
    api
      .get('/api/invoices')
      .then((l) => setDrafts(l.filter((i) => i.status === 'draft').slice(0, 5)))
      .catch(() => {});
  }, []);

  const incomplete = useMemo(() => {
    const out = [];
    for (const p of catalog.products) {
      if (p.archived) continue;
      const r = engine.evalProduct(p.id);
      if (!r.complete) out.push({ kind: 'product', id: p.id, name: p.name, issues: r.issues });
    }
    for (const rc of catalog.recipes) {
      if (rc.archived) continue;
      const r = engine.evalRecipe(rc.id);
      if (!r.complete) out.push({ kind: 'recipe', id: rc.id, name: rc.name, issues: r.issues });
    }
    return out;
  }, [catalog, engine]);
  const noPrice = catalog.materials.filter((m) => !m.archived && !m.price);

  return (
    <div>
      <div className="quick">
        <button className="btn primary" onClick={() => navigate('/invoices/new?capture=1')}>
          <Icon name="camera" /> Φωτογραφία τιμολογίου
        </button>
        <button className="btn" onClick={() => navigate('/invoices/new')}>
          <Icon name="upload" /> Ανέβασμα PDF / εικόνων
        </button>
        <button className="btn" onClick={() => navigate('/recipes/new')}>
          <Icon name="book" /> Νέα συνταγή
        </button>
        <button className="btn" onClick={() => navigate('/products/new')}>
          <Icon name="cake" /> Νέο προϊόν
        </button>
        <button className="btn" onClick={() => navigate('/production')}>
          <Icon name="factory" /> Παραγωγή
        </button>
      </div>

      {!phoneHidden && (
        <div className="card">
          <div className="card-head">
            <h2>Άνοιγμα στο iPhone</h2>
            <button
              className="btn small ghost"
              onClick={() => {
                try {
                  localStorage.setItem(PHONE_KEY, '1');
                } catch {
                  /* */
                }
                setPhoneHidden(true);
              }}
            >
              Απόκρυψη
            </button>
          </div>
          <PhoneAccess />
          <p className="small muted" style={{ marginTop: '.5rem' }}>
            Μετά, στο Safari: Κοινοποίηση → «Προσθήκη στην αρχική οθόνη». Ο κωδικός υπάρχει πάντα και στις Ρυθμίσεις.
          </p>
        </div>
      )}

      <div className="card">
        <div className="stats">
          <Link to="/materials" className="stat" style={{ textDecoration: 'none' }}>
            <span className="v">{catalog.materials.filter((m) => !m.archived).length}</span>
            <span className="l">Υλικά & συσκευασίες</span>
          </Link>
          <Link to="/recipes" className="stat" style={{ textDecoration: 'none' }}>
            <span className="v">{catalog.recipes.length}</span>
            <span className="l">Συνταγές</span>
          </Link>
          <Link to="/products" className="stat" style={{ textDecoration: 'none' }}>
            <span className="v">{catalog.products.length}</span>
            <span className="l">Προϊόντα</span>
          </Link>
          <Link to="/invoices" className="stat" style={{ textDecoration: 'none' }}>
            <span className="v">{catalog.drafts}</span>
            <span className="l">Πρόχειρα τιμολόγια</span>
          </Link>
        </div>
      </div>

      <div className="grid2">
        <div>
          {drafts.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h2>Πρόχειρα τιμολόγια</h2>
                <Link to="/invoices">Όλα →</Link>
              </div>
              <div className="list">
                {drafts.map((i) => (
                  <Link key={i.id} to={`/invoices/${i.id}`} className="list-item">
                    <div className="grow">
                      <div className="title">{i.supplier_name || 'Χωρίς προμηθευτή'}</div>
                      <div className="sub">
                        {i.number || '—'} · {formatDate(i.doc_date)}
                      </div>
                    </div>
                    {i.ai_status === 'running' ? <Badge kind="info">Ανάγνωση…</Badge> : i.ai_status === 'error' ? <Badge kind="danger">Σφάλμα ανάγνωσης</Badge> : <Badge kind="warn">Προς έλεγχο</Badge>}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-head">
              <h2>Ελλιπή κοστολόγια</h2>
              {incomplete.length > 0 && <Badge kind="danger">{incomplete.length}</Badge>}
            </div>
            {!incomplete.length ? (
              <p className="muted">Όλα τα κοστολόγια είναι πλήρη.</p>
            ) : (
              <div className="list">
                {incomplete.slice(0, 8).map((x) => (
                  <Link key={`${x.kind}${x.id}`} to={`/${x.kind === 'product' ? 'products' : 'recipes'}/${x.id}`} className="list-item">
                    <div className="grow">
                      <div className="title">{x.name}</div>
                      <div className="sub">{[...new Set(x.issues.map((i) => i.msg))].slice(0, 2).join(' · ')}</div>
                    </div>
                    <span className="kindtag">{x.kind === 'product' ? 'Προϊόν' : 'Συνταγή'}</span>
                  </Link>
                ))}
              </div>
            )}
            {noPrice.length > 0 && (
              <p style={{ marginTop: '.6rem' }}>
                <Link to="/materials?filter=noprice">{noPrice.length} υλικά χωρίς τιμή →</Link>
              </p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Πρόσφατες μεταβολές τιμών</h2>
            <Link to="/history">Ιστορικό →</Link>
          </div>
          {!events.length && <p className="muted">Δεν έχουν καταγραφεί μεταβολές ακόμη.</p>}
          {events.map((e) => (
            <div key={e.id} style={{ marginBottom: '.8rem' }}>
              <div className="small muted">
                {formatDate(e.created_at)} · {e.invoice_number ? `Τιμολόγιο ${e.invoice_number}` : 'Χειροκίνητη αλλαγή'}
              </div>
              {e.changes.slice(0, 4).map((c) => (
                <div key={c.material_id} className="costrow">
                  <span>{c.name}</span>
                  <span className="nowrap">
                    {c.old_price != null ? formatUnitPrice(c.old_price, c.unit) : 'νέα'} → {c.new_price != null ? formatUnitPrice(c.new_price, c.unit) : '—'} <DiffText diff={c.diff} pct={c.pct} money={false} />
                  </span>
                </div>
              ))}
              {e.impacts.length > 0 && (
                <div className="small muted">
                  Επηρεάστηκαν: {e.impacts.filter((i) => i.kind === 'product').length} προϊόντα, {e.impacts.filter((i) => i.kind === 'recipe').length} συνταγές
                  {e.impacts
                    .filter((i) => i.kind === 'product')
                    .slice(0, 3)
                    .map((i) => {
                      const c = impactCosts(i, costMode);
                      return (
                        <div key={i.id}>
                          • {i.name}: {formatMoney(c.o)} → {formatMoney(c.n)}/{COST_UNIT_SHORT[i.unit]} <DiffText diff={c.diff} pct={c.pct} />
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
