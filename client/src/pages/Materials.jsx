import { useMemo, useState } from 'react';
import { useStore } from '../store.jsx';
import { Link, PageHead, PriceText, SampleBadge, Badge, Empty, Chips, Select, SearchInput } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { MaterialForm } from '../components/MaterialForm.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { formatDate } from '../format.js';
import { matchesSearch } from '@shared/text.js';
import { navigate } from '../router.js';

export function Materials({ initialFilter }) {
  const { catalog } = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState(initialFilter || 'all');
  const [cat, setCat] = useState(null);
  const [creating, setCreating] = useState(false);
  const basis = catalog.settings.vat_basis;

  const list = useMemo(
    () =>
      catalog.materials.filter((m) => {
        if (filter === 'archived' ? !m.archived : m.archived) return false;
        if (filter === 'ingredient' && m.kind !== 'ingredient') return false;
        if (filter === 'packaging' && m.kind !== 'packaging') return false;
        if (filter === 'noprice' && m.price) return false;
        if (cat && m.category !== cat) return false;
        return matchesSearch([m.name, m.brand, m.attributes, m.category].join(' '), q);
      }),
    [catalog, q, filter, cat],
  );

  return (
    <div>
      <PageHead title="Υλικά & συσκευασίες" subtitle="Τιμές από τα τιμολόγια ή χειροκίνητα · αναζήτηση με ή χωρίς τόνους">
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Icon name="plus" /> Νέο υλικό
        </button>
      </PageHead>
      <div className="searchbar">
        <SearchInput value={q} onChange={setQ} placeholder="Αναζήτηση (π.χ. «κρεμα 35»)…" />
        <Select value={cat} onChange={setCat} placeholder="Όλες οι κατηγορίες" options={(catalog.material_categories || []).map((c) => ({ value: c, label: c }))} style={{ flex: '0 1 220px' }} />
      </div>
      <Chips
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'Όλα' },
          { value: 'ingredient', label: 'Πρώτες ύλες' },
          { value: 'packaging', label: 'Συσκευασίες' },
          { value: 'noprice', label: `Χωρίς τιμή (${catalog.materials.filter((m) => !m.price && !m.archived).length})` },
          { value: 'archived', label: 'Αρχειοθετημένα' },
        ]}
      />
      <div className="card tight">
        {!list.length ? (
          <Empty icon="box">Δεν βρέθηκαν υλικά.</Empty>
        ) : (
          <div className="list">
            {list.map((m) => (
              <Link key={m.id} to={`/materials/${m.id}`} className="list-item">
                <Avatar text={m.kind === 'packaging' ? '' : m.category || m.name} icon={m.kind === 'packaging' ? 'box' : null} tone={m.kind === 'packaging' ? 'tone-sky' : undefined} />
                <div className="grow">
                  <div className="title">
                    {m.name} <SampleBadge show={m.is_sample} /> {m.kind === 'packaging' && <Badge kind="neutral">Συσκευασία</Badge>}
                  </div>
                  <div className="sub">{[m.brand, m.attributes, m.category].filter(Boolean).join(' · ') || '—'}</div>
                </div>
                <div className="value">
                  <div>
                    <PriceText material={m} basis={basis} />
                  </div>
                  {m.price && (
                    <div className="sub">
                      {m.price.pinned ? '📌 ' : ''}
                      {formatDate(m.price.doc_date)}
                      {m.price.source === 'manual' ? ' · χειρ.' : ''}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      {creating && <MaterialForm onClose={() => setCreating(false)} onSaved={(m) => navigate(`/materials/${m.id}`)} />}
    </div>
  );
}
