import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { api } from '../api.js';
import { Link, Badge, DiffText } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { formatMoney, formatDate, formatUnitPrice, COST_UNIT_SHORT } from '../format.js';
import { navigate } from '../router.js';
import { PhoneAccess } from '../components/PhoneAccess.jsx';
import { impactCosts } from './InvoiceEdit.jsx';
import { isTouch, isIOS, isAndroid } from '../platform.js';
import { Tile } from '../components/Tile.jsx';
import { Thumb } from '../components/Thumb.jsx';

const PHONE_KEY = 'phone-card-dismissed';
function phoneCardHidden() {
  try {
    return localStorage.getItem(PHONE_KEY) === '1';
  } catch {
    return false;
  }
}

export function Home() {
  const { catalog, engine, costMode, hl } = useStore();
  const [events, setEvents] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [phoneHidden, setPhoneHidden] = useState(() => isTouch() || isIOS || isAndroid || phoneCardHidden());
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
      if (!r.complete) out.push({ kind: 'product', id: p.id, name: p.name, issues: r.issues, item: p });
    }
    for (const rc of catalog.recipes) {
      if (rc.archived) continue;
      const r = engine.evalRecipe(rc.id);
      if (!r.complete) out.push({ kind: 'recipe', id: rc.id, name: rc.name, issues: r.issues, item: rc });
    }
    return out;
  }, [catalog, engine]);
  const noPrice = catalog.materials.filter((m) => !m.archived && !m.price);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Καλημέρα' : 'Καλησπέρα';
  const firstName = (catalog.user?.display_name || '').split(' ')[0];
  const today = new Date().toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long' });
  const showcase = catalog.products.filter((p) => !p.archived).slice(0, 4);

  return (
    <div>
      <div className="hello">
        <div>
          <div className="date">{today}</div>
          <h1>
            {greeting}
            {firstName ? `, ${firstName}` : ''}
          </h1>
        </div>
      </div>
      <div className="quick">
        <button className="qa hero" onClick={() => navigate('/invoices/new?capture=1')}>
          <span className="ic">
            <Icon name="camera" />
          </span>
          Φωτογραφία τιμολογίου
          <span className="qs">Ανάγνωση και νέες τιμές</span>
        </button>
        <button className="qa" onClick={() => navigate('/invoices/new')}>
          <span className="ic tone-sky">
            <Icon name="upload" />
          </span>
          PDF ή εικόνες
          <span className="qs">Από email ή αρχείο</span>
        </button>
        <button className="qa" onClick={() => navigate('/recipes/new')}>
          <span className="ic tone-rose">
            <Icon name="book" />
          </span>
          Νέα συνταγή
          <span className="qs">Υλικά, απόδοση, κόστος</span>
        </button>
        <button className="qa" onClick={() => navigate('/products/new')}>
          <span className="ic tone-caramel">
            <Icon name="cake" />
          </span>
          Νέο προϊόν
          <span className="qs">Κόστος ανά τεμάχιο</span>
        </button>
        <button className="qa" onClick={() => navigate('/production')}>
          <span className="ic tone-mint">
            <Icon name="factory" />
          </span>
          Παραγωγή
          <span className="qs">«Θέλω 60 ποτηράκια»</span>
        </button>
      </div>

      <div className="stats">
        <Link to="/materials" className="stat">
          <span className="ic tone-caramel">
            <Icon name="box" />
          </span>
          <span>
            <div className="v">{catalog.materials.filter((m) => !m.archived).length}</div>
            <div className="l">Υλικά & συσκευασίες</div>
          </span>
        </Link>
        <Link to="/recipes" className="stat">
          <span className="ic tone-rose">
            <Icon name="book" />
          </span>
          <span>
            <div className="v">{catalog.recipes.filter((r) => !r.archived).length}</div>
            <div className="l">Συνταγές</div>
          </span>
        </Link>
        <Link to="/products" className="stat">
          <span className="ic tone-choc">
            <Icon name="cake" />
          </span>
          <span>
            <div className="v">{catalog.products.filter((p) => !p.archived).length}</div>
            <div className="l">Προϊόντα</div>
          </span>
        </Link>
        <Link to="/invoices" className="stat">
          <span className="ic tone-sky">
            <Icon name="invoice" />
          </span>
          <span>
            <div className="v">{catalog.drafts}</div>
            <div className="l">Τιμολόγια προς έλεγχο</div>
          </span>
        </Link>
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

      {showcase.length > 0 && (
        <>
          <div className="card-head" style={{ marginTop: '.4rem' }}>
            <h2>Τα προϊόντα σας</h2>
            <Link to="/products">Όλα →</Link>
          </div>
          <div className="tiles" style={{ marginBottom: '1.2rem' }}>
            {showcase.map((p) => (
              <Tile key={p.id} to={`/products/${p.id}`} item={p} kind="product" result={engine.evalProduct(p.id)} hl={hl} meta={p.category} />
            ))}
          </div>
        </>
      )}

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
                    <span className="avatar-sm tone-sky">
                      <Icon name="invoice" />
                    </span>
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
                    <Thumb photo={x.item.photo} name={x.name} category={x.item.category} kind={x.kind} style={{ width: 44, height: 44, borderRadius: 12 }} />
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
