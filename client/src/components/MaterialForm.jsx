// Δημιουργία / διόρθωση υλικού.
import { useState } from 'react';
import { Modal, Field, TextInput, NumberInput, Select } from '../ui.jsx';
import { api } from '../api.js';
import { useStore, useAction } from '../store.jsx';
import { todayIso } from '../format.js';

const DEFAULT_CATEGORIES = [
  'Γαλακτοκομικά',
  'Ζάχαρη & γλυκαντικά',
  'Άλευρα & άμυλα',
  'Σοκολάτες & κακάο',
  'Πραλίνες & πάστες',
  'Ξηροί καρποί',
  'Αυγά',
  'Φρούτα & πουρέδες',
  'Gelato – βάσεις & σταθεροποιητές',
  'Αρώματα & εκχυλίσματα',
  'Αρτοποιία',
  'Διακόσμηση',
  'Συσκευασίες',
];

export function MaterialForm({ material, initial = {}, onClose, onSaved }) {
  const { catalog, reload } = useStore();
  const [run, busy] = useAction();
  const isNew = !material;
  const [m, setM] = useState(() => ({
    name: '',
    kind: 'ingredient',
    category: '',
    brand: '',
    attributes: '',
    cost_unit: 'kg',
    density: null,
    piece_weight: null,
    notes: '',
    archived: 0,
    ...initial,
    ...(material || {}),
  }));
  const [price, setPrice] = useState({ unit_net: null, vat_rate: 13, doc_date: todayIso() });
  const set = (k) => (v) => setM((x) => ({ ...x, [k]: v }));
  const cats = [...new Set([...DEFAULT_CATEGORIES, ...(catalog.material_categories || [])])].sort((a, b) => a.localeCompare(b, 'el'));
  const hasPrices = material && material.price_count > 0;

  const save = () =>
    run(async () => {
      const body = { ...m, initial_price: isNew && price.unit_net != null ? price : undefined };
      const saved = isNew ? await api.post('/api/materials', body) : await api.put(`/api/materials/${material.id}`, body);
      await reload();
      onSaved?.(saved);
      onClose();
    }, isNew ? 'Το υλικό δημιουργήθηκε' : 'Οι αλλαγές αποθηκεύτηκαν');

  return (
    <Modal
      title={isNew ? 'Νέο υλικό' : 'Διόρθωση υλικού'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Άκυρο
          </button>
          <button className="btn primary" disabled={busy || !m.name?.trim()} onClick={save}>
            Αποθήκευση
          </button>
        </>
      }
    >
      <Field label="Όνομα *" hint="Γράψτε τα χαρακτηριστικά που το ξεχωρίζουν, π.χ. «Κρέμα γάλακτος 35%».">
        <TextInput value={m.name} onChange={set('name')} autoFocus />
      </Field>
      <div className="row">
        <Field label="Είδος">
          <Select
            value={m.kind}
            onChange={(v) => setM((x) => ({ ...x, kind: v, cost_unit: v === 'packaging' ? 'pc' : x.cost_unit, category: v === 'packaging' && !x.category ? 'Συσκευασίες' : x.category }))}
            options={[
              { value: 'ingredient', label: 'Πρώτη ύλη' },
              { value: 'packaging', label: 'Συσκευασία' },
            ]}
          />
        </Field>
        <Field label="Μονάδα κοστολόγησης *" hint={hasPrices ? 'Δεν αλλάζει όσο υπάρχουν τιμές.' : undefined}>
          <Select
            value={m.cost_unit}
            onChange={set('cost_unit')}
            disabled={hasPrices}
            options={[
              { value: 'kg', label: 'ανά κιλό (kg)' },
              { value: 'l', label: 'ανά λίτρο (lt)' },
              { value: 'pc', label: 'ανά τεμάχιο' },
            ]}
          />
        </Field>
      </div>
      <div className="row">
        <Field label="Κατηγορία">
          <input className="input" list="mat-cats" value={m.category || ''} onChange={(e) => set('category')(e.target.value)} />
          <datalist id="mat-cats">
            {cats.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Μάρκα">
          <TextInput value={m.brand} onChange={set('brand')} />
        </Field>
      </div>
      <Field label="Χαρακτηριστικά" hint="π.χ. 35% λιπαρά, 70% κακάο, άχνη, χωρίς γλουτένη">
        <TextInput value={m.attributes} onChange={set('attributes')} />
      </Field>
      <div className="row">
        <Field label="Πυκνότητα (g/ml)" hint="Μόνο αν θέλετε μετατροπή βάρους ↔ όγκου (π.χ. γάλα 1,03).">
          <NumberInput value={m.density} onChange={set('density')} placeholder="—" />
        </Field>
        <Field label="Βάρος τεμαχίου (g)" hint="Μόνο για μετατροπή τεμαχίων ↔ βάρους (π.χ. αυγό 55 g).">
          <NumberInput value={m.piece_weight} onChange={set('piece_weight')} placeholder="—" />
        </Field>
      </div>
      {isNew && (
        <details className="more">
          <summary>Αρχική τιμή (προαιρετικά, αν δεν προέρχεται από τιμολόγιο)</summary>
          <div className="row">
            <Field label={`Τιμή χωρίς ΦΠΑ (€/${m.cost_unit === 'pc' ? 'τεμ.' : m.cost_unit === 'l' ? 'lt' : 'kg'})`}>
              <NumberInput value={price.unit_net} onChange={(v) => setPrice((p) => ({ ...p, unit_net: v }))} />
            </Field>
            <Field label="ΦΠΑ %" className="w-sm">
              <NumberInput value={price.vat_rate} onChange={(v) => setPrice((p) => ({ ...p, vat_rate: v }))} />
            </Field>
            <Field label="Ημερομηνία">
              <input type="date" className="input" value={price.doc_date} onChange={(e) => setPrice((p) => ({ ...p, doc_date: e.target.value }))} />
            </Field>
          </div>
        </details>
      )}
      <Field label="Σημειώσεις">
        <textarea className="input" value={m.notes || ''} onChange={(e) => set('notes')(e.target.value)} rows={2} />
      </Field>
      {!isNew && (
        <label className="checkbox">
          <input type="checkbox" checked={!!m.archived} onChange={(e) => set('archived')(e.target.checked ? 1 : 0)} /> Αρχειοθετημένο (δεν εμφανίζεται στις επιλογές)
        </label>
      )}
    </Modal>
  );
}
