import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useStore, useAction } from '../store.jsx';
import { Link, PageHead, Badge, SampleBadge, Empty, Spinner, Chips } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { formatDate, formatMoney, formatBytes } from '../format.js';
import { navigate } from '../router.js';
import { matchesSearch } from '@shared/text.js';

export function statusBadge(i) {
  if (i.status === 'confirmed') return <Badge kind="ok">Επιβεβαιωμένο</Badge>;
  if (i.ai_status === 'running') return <Badge kind="info">Ανάγνωση…</Badge>;
  if (i.ai_status === 'error') return <Badge kind="danger">Σφάλμα ανάγνωσης</Badge>;
  return <Badge kind="warn">Πρόχειρο</Badge>;
}

export function Invoices() {
  const [list, setList] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const load = () => api.get('/api/invoices').then(setList);
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!list?.some((i) => i.ai_status === 'running')) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [list]);

  const shown = (list || []).filter((i) => (filter === 'all' || (filter === 'draft' ? i.status === 'draft' : i.status === 'confirmed')) && matchesSearch(`${i.supplier_name || ''} ${i.number || ''}`, q));
  return (
    <div>
      <PageHead title="Τιμολόγια αγορών">
        <button className="btn primary" onClick={() => navigate('/invoices/new?capture=1')}>
          <Icon name="camera" /> Φωτογραφία
        </button>
        <button className="btn" onClick={() => navigate('/invoices/new')}>
          <Icon name="upload" /> Αρχεία
        </button>
      </PageHead>
      <div className="searchbar">
        <input className="input" placeholder="Αναζήτηση προμηθευτή ή αριθμού…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Chips
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'Όλα' },
          { value: 'draft', label: `Πρόχειρα (${(list || []).filter((i) => i.status === 'draft').length})` },
          { value: 'confirmed', label: 'Επιβεβαιωμένα' },
        ]}
      />
      <div className="card tight">
        {!list ? (
          <Spinner />
        ) : !shown.length ? (
          <Empty icon="invoice">Δεν υπάρχουν τιμολόγια. Φωτογραφίστε ή ανεβάστε το πρώτο σας.</Empty>
        ) : (
          <div className="list">
            {shown.map((i) => (
              <Link key={i.id} to={`/invoices/${i.id}`} className="list-item">
                <div className="grow">
                  <div className="title">
                    {i.supplier_name || <span className="muted">Χωρίς προμηθευτή</span>} <SampleBadge show={i.is_sample} />
                  </div>
                  <div className="sub">
                    {i.number ? `Αρ. ${i.number}` : 'Χωρίς αριθμό'} · {formatDate(i.doc_date)} · {i.line_count} γραμμές{i.file_count ? ` · ${i.file_count} αρχεία` : ''}
                  </div>
                </div>
                <div className="value">
                  <div>{i.gross_total != null ? formatMoney(i.gross_total) : ''}</div>
                  {statusBadge(i)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Σμίκρυνση φωτογραφίας στο κινητό (μέγιστη πλευρά 2576 px, JPEG) για γρήγορη αποστολή. */
async function compressImage(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const max = 2576;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 2.5 * 1024 * 1024 && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file; // ο server θα απορρίψει μη υποστηριζόμενες μορφές με σαφές μήνυμα
  }
}

export function NewInvoice({ capture }) {
  const { catalog, reload } = useStore();
  const [run, busy] = useAction();
  const [files, setFiles] = useState([]);
  const [preparing, setPreparing] = useState(false);
  const camRef = useRef(null);
  const fileRef = useRef(null);
  const aiOn = catalog.ai?.enabled;

  useEffect(() => {
    if (capture) setTimeout(() => camRef.current?.click(), 150);
  }, [capture]);

  const add = async (list) => {
    setPreparing(true);
    const prepared = [];
    for (const f of list) {
      const c = await compressImage(f);
      prepared.push({ file: c, url: c.type.startsWith('image/') ? URL.createObjectURL(c) : null });
    }
    setFiles((x) => [...x, ...prepared]);
    setPreparing(false);
  };

  const submit = (extract) =>
    run(async () => {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f.file, f.file.name));
      const inv = await api.upload(`/api/invoices${extract ? '' : '?extract=0'}`, fd);
      await reload();
      navigate(`/invoices/${inv.id}`, { replace: true });
    });

  return (
    <div>
      <PageHead title="Νέο τιμολόγιο" back="/invoices" />
      <div className="card">
        <p>Φωτογραφίστε όλες τις σελίδες του ίδιου παραστατικού ή επιλέξτε εικόνες / PDF (και πολυσέλιδο). Θα ελέγξετε κάθε γραμμή πριν ενημερωθούν οι τιμές.</p>
        <div className="row">
          <button className="btn primary big" style={{ flex: 1 }} onClick={() => camRef.current?.click()} disabled={busy}>
            <Icon name="camera" /> {files.length ? 'Επόμενη σελίδα' : 'Φωτογραφία'}
          </button>
          <button className="btn big" style={{ flex: 1 }} onClick={() => fileRef.current?.click()} disabled={busy}>
            <Icon name="upload" /> Εικόνες / PDF
          </button>
        </div>
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (add([...e.target.files]), (e.target.value = ''))} />
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => (add([...e.target.files]), (e.target.value = ''))} />
        {preparing && (
          <p>
            <Spinner /> Προετοιμασία…
          </p>
        )}
        {files.length > 0 && (
          <>
            <div className="divider" />
            <div className="doc-thumbs">
              {files.map((f, i) => (
                <div key={i} className="doc-thumb" style={f.url ? { backgroundImage: `url(${f.url})` } : undefined} title={f.file.name}>
                  {!f.url && 'PDF'}
                  <button className="x" onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} aria-label="Αφαίρεση">
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <p className="small muted">
              {files.length} αρχεία · {formatBytes(files.reduce((s, f) => s + f.file.size, 0))}
            </p>
          </>
        )}
        <div className="divider" />
        {aiOn ? (
          <button className="btn ok block big" disabled={!files.length || busy || preparing} onClick={() => submit(true)}>
            {busy ? <Spinner /> : <Icon name="check" />} Ανάγνωση {files.length > 1 ? `(${files.length} σελίδες)` : ''}
          </button>
        ) : (
          <div className="alert info">Η αυτόματη ανάγνωση δεν είναι ενεργή (δεν έχει οριστεί κλειδί AI στον server). Το παραστατικό θα αποθηκευτεί και θα συμπληρώσετε τις γραμμές χειροκίνητα.</div>
        )}
        <div className="row" style={{ marginTop: '.6rem' }}>
          <button className="btn" style={{ flex: 1 }} disabled={busy || preparing} onClick={() => submit(false)}>
            {files.length ? 'Αποθήκευση χωρίς ανάγνωση' : 'Χειροκίνητη καταχώριση (χωρίς αρχείο)'}
          </button>
        </div>
      </div>
    </div>
  );
}
