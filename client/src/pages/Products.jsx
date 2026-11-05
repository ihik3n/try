import { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { Link, PageHead, SampleBadge, Badge, Empty, Select } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { formatMoney } from '../format.js';
import { matchesSearch } from '@shared/text.js';
import { navigate } from '../router.js';

export function Products() {
  const { catalog, engine } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(null);
  const [archived, setArchived] = useState(false);
  const list = useMemo(
    () =>
      catalog.products
        .filter((p) => !!p.archived === archived && (!cat || p.category === cat) && matchesSearch(`${p.name} ${p.category || ''}`, q))
        .map((p) => ({ p, res: engine.evalProduct(p.id) })),
    [catalog, engine, q, cat, archived],
  );
  return (
    <div>
      <PageHead title="Τελικά προϊόντα">
        <button className="btn primary" onClick={() => navigate('/products/new')}>
          <Icon name="plus" /> Νέο προϊόν
        </button>
      </PageHead>
      <div className="searchbar">
        <input className="input" placeholder="Αναζήτηση προϊόντος…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={cat} onChange={setCat} placeholder="Όλες οι κατηγορίες" options={(catalog.product_categories || []).map((c) => ({ value: c, label: c }))} style={{ flex: '0 1 220px' }} />
        <label className="checkbox small">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Αρχειοθετημένα
        </label>
      </div>
      <div className="card tight">
        {!list.length ? (
          <Empty icon="cake">Δεν υπάρχουν προϊόντα.</Empty>
        ) : (
          <div className="list">
            {list.map(({ p, res }) => (
              <Link key={p.id} to={`/products/${p.id}`} className="list-item">
                <div className="grow">
                  <div className="title">
                    {p.name} <SampleBadge show={p.is_sample} />
                  </div>
                  <div className="sub">
                    {p.category ? `${p.category} · ` : ''}
                    {res.perUnit ? `υλικά ${formatMoney(res.perUnit.materials)} · συσκ. ${formatMoney(res.perUnit.packaging)}` : ''}
                    {res.laborIncluded ? ' · με εργασία' : ''}
                  </div>
                </div>
                <div className="value">
                  <div className="strong">{res.perUnit ? `${formatMoney(res.perUnit.total)}/τεμ.` : '—'}</div>
                  {!res.complete && <Badge kind="danger">Ελλιπές</Badge>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
