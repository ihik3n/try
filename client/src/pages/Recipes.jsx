import { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { Link, PageHead, SampleBadge, Badge, Empty, Select } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { formatMoney, COST_UNIT_SHORT, baseQtyLabel } from '../format.js';
import { matchesSearch } from '@shared/text.js';
import { navigate } from '../router.js';

export function Recipes() {
  const { catalog, engine, hl } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState(null);
  const [archived, setArchived] = useState(false);
  const list = useMemo(
    () =>
      catalog.recipes
        .filter((r) => !!r.archived === archived && (!cat || r.category === cat) && matchesSearch(`${r.name} ${r.category || ''}`, q))
        .map((r) => ({ r, res: engine.evalRecipe(r.id) })),
    [catalog, engine, q, cat, archived],
  );
  return (
    <div>
      <PageHead title="Συνταγολόγιο">
        <button className="btn primary" onClick={() => navigate('/recipes/new')}>
          <Icon name="plus" /> Νέα συνταγή
        </button>
      </PageHead>
      <div className="searchbar">
        <input className="input" placeholder="Αναζήτηση συνταγής…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={cat} onChange={setCat} placeholder="Όλες οι κατηγορίες" options={(catalog.recipe_categories || []).map((c) => ({ value: c, label: c }))} style={{ flex: '0 1 220px' }} />
        <label className="checkbox small">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Αρχειοθετημένες
        </label>
      </div>
      <div className="card tight">
        {!list.length ? (
          <Empty icon="book">Δεν υπάρχουν συνταγές.</Empty>
        ) : (
          <div className="list">
            {list.map(({ r, res }) => (
              <Link key={r.id} to={`/recipes/${r.id}`} className="list-item">
                <div className="grow">
                  <div className="title">
                    {r.name} <SampleBadge show={r.is_sample} />
                  </div>
                  <div className="sub">
                    {r.category ? `${r.category} · ` : ''}
                    {res.yield.ok ? `Απόδοση ${baseQtyLabel(res.yield.base, res.yield.baseUnit)}` : 'Χωρίς έγκυρη απόδοση'} · {r.items.length} υλικά
                  </div>
                </div>
                <div className="value">
                  {res.perUnit ? (
                    <div className="strong">
                      {formatMoney(hl(res.perUnit))}/{COST_UNIT_SHORT[res.yield.outputUnit]}
                    </div>
                  ) : (
                    '—'
                  )}
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
