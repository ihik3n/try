import { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { PageHead, Empty, SearchInput, Chips } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { Tile } from '../components/Tile.jsx';
import { formatMoney } from '../format.js';
import { matchesSearch } from '@shared/text.js';
import { navigate } from '../router.js';

export function Products() {
  const { catalog, engine, hl, costMode } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [archived, setArchived] = useState(false);
  const cats = catalog.product_categories || [];
  const list = useMemo(
    () =>
      catalog.products
        .filter((p) => !!p.archived === archived && (!cat || p.category === cat) && matchesSearch(`${p.name} ${p.category || ''}`, q))
        .map((p) => ({ p, res: engine.evalProduct(p.id) })),
    [catalog, engine, q, cat, archived],
  );
  return (
    <div>
      <PageHead title="Τελικά προϊόντα" subtitle={`${catalog.products.filter((p) => !p.archived).length} προϊόντα · κόστος ανά τεμάχιο ${costMode === 'with_labor' ? 'με εργασία' : 'χωρίς εργασία'}`}>
        <button className="btn primary" onClick={() => navigate('/products/new')}>
          <Icon name="plus" /> Νέο προϊόν
        </button>
      </PageHead>
      <div className="searchbar">
        <SearchInput value={q} onChange={setQ} placeholder="Αναζήτηση προϊόντος…" />
        <label className="checkbox small">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Αρχειοθετημένα
        </label>
      </div>
      {cats.length > 1 && <Chips value={cat} onChange={setCat} options={[{ value: '', label: 'Όλα' }, ...cats.map((c) => ({ value: c, label: c }))]} />}
      {!list.length ? (
        <div className="card">
          <Empty icon="cake">Δεν βρέθηκαν προϊόντα.</Empty>
        </div>
      ) : (
        <div className="tiles">
          {list.map(({ p, res }) => (
            <Tile
              key={p.id}
              to={`/products/${p.id}`}
              item={p}
              kind="product"
              result={res}
              hl={hl}
              meta={[p.category, res.laborIncluded && res.perUnit && costMode !== 'with_labor' ? `+ εργασία ${formatMoney(res.perUnit.labor)}` : null].filter(Boolean).join(' · ')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
