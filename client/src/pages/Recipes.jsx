import { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { PageHead, Empty, SearchInput, Chips } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { Tile } from '../components/Tile.jsx';
import { baseQtyLabel } from '../format.js';
import { matchesSearch } from '@shared/text.js';
import { navigate } from '../router.js';

export function Recipes() {
  const { catalog, engine, hl } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [archived, setArchived] = useState(false);
  const cats = catalog.recipe_categories || [];
  const list = useMemo(
    () =>
      catalog.recipes
        .filter((r) => !!r.archived === archived && (!cat || r.category === cat) && matchesSearch(`${r.name} ${r.category || ''}`, q))
        .map((r) => ({ r, res: engine.evalRecipe(r.id) })),
    [catalog, engine, q, cat, archived],
  );
  return (
    <div>
      <PageHead title="Συνταγολόγιο" subtitle={`${catalog.recipes.filter((r) => !r.archived).length} συνταγές · κόστος ανά κιλό, λίτρο ή τεμάχιο`}>
        <button className="btn primary" onClick={() => navigate('/recipes/new')}>
          <Icon name="plus" /> Νέα συνταγή
        </button>
      </PageHead>
      <div className="searchbar">
        <SearchInput value={q} onChange={setQ} placeholder="Αναζήτηση συνταγής…" />
        <label className="checkbox small">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Αρχειοθετημένες
        </label>
      </div>
      {cats.length > 1 && <Chips value={cat} onChange={setCat} options={[{ value: '', label: 'Όλες' }, ...cats.map((c) => ({ value: c, label: c }))]} />}
      {!list.length ? (
        <div className="card">
          <Empty icon="book">Δεν βρέθηκαν συνταγές.</Empty>
        </div>
      ) : (
        <div className="tiles">
          {list.map(({ r, res }) => (
            <Tile
              key={r.id}
              to={`/recipes/${r.id}`}
              item={r}
              kind="recipe"
              result={res}
              hl={hl}
              meta={[r.category, res.yield.ok ? `απόδοση ${baseQtyLabel(res.yield.base, res.yield.baseUnit)}` : null].filter(Boolean).join(' · ')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
