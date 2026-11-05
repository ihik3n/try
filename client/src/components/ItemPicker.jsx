// Γρήγορη επιλογή υλικού / συνταγής / προϊόντος με αναζήτηση χωρίς τόνους.
import { useMemo, useRef, useState, useEffect } from 'react';
import { Modal, Badge, PriceText, SampleBadge } from '../ui.jsx';
import { useStore } from '../store.jsx';
import { matchesSearch } from '@shared/text.js';
import { wouldCreateCycle } from '@shared/costing.js';
import { formatMoney, COST_UNIT_SHORT } from '../format.js';
import { Icon } from '../icons.jsx';

/**
 * kinds: ['material','packaging','recipe','product']
 * excludeRecipeId: για αποτροπή κυκλικών συνδέσεων
 */
export function ItemPicker({ title = 'Επιλογή', kinds = ['material', 'packaging', 'recipe'], onPick, onClose, excludeRecipeId, onCreateMaterial, initialQuery = '' }) {
  const { catalog, engine } = useStore();
  const [q, setQ] = useState(initialQuery);
  const [tab, setTab] = useState('all');
  const inputRef = useRef(null);
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);
  const basis = catalog.settings.vat_basis;

  const items = useMemo(() => {
    const out = [];
    if (kinds.includes('material') || kinds.includes('packaging')) {
      for (const m of catalog.materials) {
        if (m.archived) continue;
        const k = m.kind === 'packaging' ? 'packaging' : 'material';
        if (!kinds.includes(k)) continue;
        out.push({ type: 'material', kind: k, id: m.id, name: m.name, text: [m.name, m.brand, m.attributes, m.category].join(' '), m });
      }
    }
    if (kinds.includes('recipe')) {
      for (const r of catalog.recipes) {
        if (r.archived) continue;
        const cyc = excludeRecipeId != null && wouldCreateCycle(catalog.recipes, excludeRecipeId, r.id);
        out.push({ type: 'recipe', kind: 'recipe', id: r.id, name: r.name, text: [r.name, r.category].join(' '), r, disabled: cyc, res: engine.evalRecipe(r.id) });
      }
    }
    if (kinds.includes('product')) {
      for (const p of catalog.products) {
        if (p.archived) continue;
        out.push({ type: 'product', kind: 'product', id: p.id, name: p.name, text: [p.name, p.category].join(' '), p, res: engine.evalProduct(p.id) });
      }
    }
    return out;
  }, [catalog, engine, kinds, excludeRecipeId]);

  const filtered = items.filter((i) => (tab === 'all' || i.kind === tab) && matchesSearch(i.text, q)).slice(0, 300);
  const tabs = [
    { value: 'all', label: 'Όλα' },
    kinds.includes('material') && { value: 'material', label: 'Πρώτες ύλες' },
    kinds.includes('packaging') && { value: 'packaging', label: 'Συσκευασίες' },
    kinds.includes('recipe') && { value: 'recipe', label: 'Συνταγές' },
    kinds.includes('product') && { value: 'product', label: 'Προϊόντα' },
  ].filter(Boolean);

  return (
    <Modal title={title} onClose={onClose} full>
      <input
        ref={inputRef}
        className="input"
        placeholder="Αναζήτηση (με ή χωρίς τόνους)…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && filtered.length) {
            const f = filtered.find((x) => !x.disabled);
            if (f) onPick(f);
          }
        }}
      />
      {tabs.length > 2 && (
        <div className="chips" style={{ marginTop: '.6rem' }}>
          {tabs.map((t) => (
            <button key={t.value} className={`chip ${tab === t.value ? 'active' : ''}`} onClick={() => setTab(t.value)}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      <div className="picker-list">
        {filtered.map((i) => (
          <div
            key={`${i.type}:${i.id}`}
            className={`picker-item ${i.disabled ? 'disabled' : ''}`}
            onClick={() => !i.disabled && onPick(i)}
            title={i.disabled ? 'Θα δημιουργούσε κυκλική σύνδεση' : ''}
          >
            <div className="grow">
              <div className="title">
                {i.name} {i.type === 'material' && <SampleBadge show={i.m.is_sample} />}
              </div>
              <div className="sub">
                {i.type === 'material' && [i.m.brand, i.m.attributes, i.m.category].filter(Boolean).join(' · ')}
                {i.type === 'recipe' && (i.disabled ? 'Κυκλική σύνδεση — δεν επιτρέπεται' : `Συνταγή${i.r.category ? ' · ' + i.r.category : ''}`)}
                {i.type === 'product' && `Προϊόν${i.p.category ? ' · ' + i.p.category : ''}`}
              </div>
            </div>
            <div className="right small">
              {i.type === 'material' && <PriceText material={i.m} basis={basis} />}
              {(i.type === 'recipe' || i.type === 'product') &&
                (i.res?.perUnit ? (
                  <span>
                    {formatMoney(i.res.perUnit.total)}/{COST_UNIT_SHORT[i.res.yield.outputUnit]} {!i.res.complete && <Badge kind="danger">Ελλιπές</Badge>}
                  </span>
                ) : (
                  <Badge kind="danger">Ελλιπές</Badge>
                ))}
            </div>
          </div>
        ))}
        {!filtered.length && <div className="empty">Δεν βρέθηκε. {onCreateMaterial && 'Μπορείτε να δημιουργήσετε νέο υλικό.'}</div>}
      </div>
      {onCreateMaterial && (
        <div className="modal-foot">
          <button className="btn primary" onClick={() => onCreateMaterial(q)}>
            <Icon name="plus" /> Νέο υλικό {q ? `«${q}»` : ''}
          </button>
        </div>
      )}
    </Modal>
  );
}
