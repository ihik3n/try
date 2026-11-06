// Μικρογραφία συνταγής/προϊόντος: η φωτογραφία, ή όμορφη εικόνα ανά κατηγορία όταν δεν υπάρχει.
import { useRef, useState } from 'react';
import { Icon } from '../icons.jsx';
import { normalize } from '@shared/text.js';
import { api } from '../api.js';
import { compressImage } from '../image.js';
import { useAction } from '../store.jsx';

const KINDS = [
  { re: /gelato|παγωτ|σορμπε|sorbet/, icon: 'icecream', tone: ['#e6f4ec', '#cfe8db', '#2d7452'] },
  { re: /ψωμ|αρτοπ|ζυμ|μπαγκετ|κουλουρ|φρατζολ|bread/, icon: 'bread', tone: ['#f9ecdc', '#efd9bd', '#a96f36'] },
  { re: /μπισκοτ|cookie|κουλουρακ|μελομακαρ|κουραμπ/, icon: 'cookie', tone: ['#fbf4da', '#f2e5b2', '#866608'] },
  { re: /ποτηρ|cup|βαζακ|verrine/, icon: 'cup', tone: ['#f3e9df', '#e5d3c3', '#5b3524'] },
  { re: /τουρτ|cake|κεικ|παστ|ταρτ|πολιτικ|εκλερ|σου |παντεσπαν|μπισκουι|βουτημ/, icon: 'cake', tone: ['#fbe9ec', '#f2d2d9', '#a8495a'] },
  { re: /κρεμ|μους|σαντιγ|γλασ|σαλτσ|γεμισ|ganache|γκανας|βαση/, icon: 'bowl', tone: ['#ebf1fa', '#d5e1f3', '#2c5a9f'] },
];

function pick(text, fallback) {
  const t = normalize(text);
  return KINDS.find((k) => k.re.test(t)) || fallback;
}

function initials(name = '') {
  return name
    .split(/\s+/)
    .filter((w) => /[\p{L}]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export function photoUrl(photo) {
  return photo ? `/api/photos/${photo}` : null;
}

export function Thumb({ photo, name, category, kind = 'recipe', className = '', style }) {
  if (photo) {
    return (
      <span className={`thumb ${className}`} style={style}>
        <img src={photoUrl(photo)} alt={name || ''} loading="lazy" decoding="async" />
      </span>
    );
  }
  const k = pick(`${category || ''} ${name || ''}`, kind === 'product' ? KINDS[4] : KINDS[5]);
  const [a, b, fg] = k.tone;
  return (
    <span className={`thumb ph ${className}`} style={{ background: `linear-gradient(140deg, ${a}, ${b})`, color: fg, ...style }} aria-hidden="true">
      <Icon name={k.icon} />
      <span className="initials">{initials(name)}</span>
    </span>
  );
}

/** Πεδίο φωτογραφίας στη σελίδα συνταγής/προϊόντος (λήψη ή επιλογή από τη συλλογή). */
export function PhotoField({ kind, id, photo, name, category, onChange }) {
  const [run, busy] = useAction();
  const ref = useRef(null);
  const [preview, setPreview] = useState(null);
  const endpoint = `/api/${kind === 'product' ? 'products' : 'recipes'}/${id}/photo`;

  const pickFile = async (file) => {
    if (!file) return;
    const small = await compressImage(file, { maxEdge: 1600, quality: 0.84, keepSmall: false });
    setPreview(URL.createObjectURL(small));
    const res = await run(async () => {
      const fd = new FormData();
      fd.append('photo', small, small.name || 'photo.jpg');
      return api.upload(endpoint, fd);
    }, 'Η φωτογραφία αποθηκεύτηκε');
    setPreview(null);
    if (res) onChange(res.photo);
  };
  const remove = async () => {
    const res = await run(() => api.del(endpoint), 'Η φωτογραφία αφαιρέθηκε');
    if (res) onChange(null);
  };

  if (id == null) {
    return (
      <div className="photo-field">
        <Thumb name={name} category={category} kind={kind} />
        <span className="small muted">Φωτογραφία μετά την πρώτη αποθήκευση</span>
      </div>
    );
  }
  return (
    <div className="photo-field">
      {preview ? (
        <span className="thumb">
          <img src={preview} alt="" />
        </span>
      ) : photo ? (
        <button type="button" className="thumb" style={{ border: 0, padding: 0, cursor: 'pointer' }} onClick={() => ref.current?.click()} aria-label="Αλλαγή φωτογραφίας" title="Αλλαγή φωτογραφίας">
          <img src={photoUrl(photo)} alt={name || ''} />
        </button>
      ) : (
        <button type="button" className="photo-drop" onClick={() => ref.current?.click()} disabled={busy}>
          <Icon name="camera" />
          Προσθήκη φωτογραφίας
        </button>
      )}
      {photo && (
        <div className="actions">
          <button type="button" className="btn small" onClick={() => ref.current?.click()} disabled={busy}>
            <Icon name="photo" /> Αλλαγή
          </button>
          <button type="button" className="iconbtn" onClick={remove} disabled={busy} aria-label="Αφαίρεση φωτογραφίας" title="Αφαίρεση φωτογραφίας">
            <Icon name="trash" />
          </button>
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" hidden onChange={(e) => (pickFile(e.target.files[0]), (e.target.value = ''))} />
    </div>
  );
}
