import { useEffect, useRef, useState } from 'react';
import { api, download } from '../api.js';
import { useStore, useAction } from '../store.jsx';
import { PageHead, Field, TextInput, NumberInput, Badge, Spinner, Modal, SampleBadge } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { formatDateTime, formatBytes } from '../format.js';

export function Settings() {
  const { catalog, reload, confirm } = useStore();
  const [run, busy] = useAction();
  const s = catalog.settings;
  const [business, setBusiness] = useState(s.business_name || '');
  const [rate, setRate] = useState(s.labor_rate);

  const saveGeneral = (patch) =>
    run(async () => {
      await api.put('/api/settings', patch);
      await reload();
    }, 'Οι ρυθμίσεις αποθηκεύτηκαν');

  const setBasis = async (b) => {
    if (b === s.vat_basis) return;
    if (!(await confirm({ title: 'Βάση κοστολόγησης', message: `Όλα τα κόστη θα υπολογίζονται ${b === 'gross' ? 'ΜΕ' : 'ΧΩΡΙΣ'} ΦΠΑ. Συνέχεια;`, confirmText: 'Αλλαγή' }))) return;
    saveGeneral({ vat_basis: b });
  };

  return (
    <div>
      <PageHead title="Ρυθμίσεις" />
      <div className="grid2">
        <div className="card">
          <h2>Γενικά</h2>
          <Field label="Όνομα επιχείρησης">
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <TextInput value={business} onChange={setBusiness} />
              <button className="btn" onClick={() => saveGeneral({ business_name: business })} disabled={busy}>
                OK
              </button>
            </div>
          </Field>
          <Field label="Βάση κοστολόγησης" hint="Ο ΦΠΑ αποθηκεύεται πάντα χωριστά· η επιλογή αφορά μόνο τον υπολογισμό και φαίνεται σε όλα τα αποτελέσματα.">
            <div className="seg">
              <button className={s.vat_basis === 'net' ? 'active' : ''} onClick={() => setBasis('net')}>
                Χωρίς ΦΠΑ (συνιστάται)
              </button>
              <button className={s.vat_basis === 'gross' ? 'active' : ''} onClick={() => setBasis('gross')}>
                Με ΦΠΑ
              </button>
            </div>
          </Field>
          <Field label="Προεπιλεγμένο ωριαίο κόστος εργασίας (€/ώρα)" hint="Χρησιμοποιείται όταν καταχωρίζετε χρόνο εργασίας χωρίς δικό του ωριαίο κόστος. Κενό = δεν υπολογίζεται.">
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <NumberInput value={rate} onChange={setRate} suffix="€/ώρα" />
              <button className="btn" onClick={() => saveGeneral({ labor_rate: rate })} disabled={busy}>
                OK
              </button>
            </div>
          </Field>
          <div className="divider" />
          <h3>Ανάγνωση παραστατικών (AI)</h3>
          {catalog.ai?.enabled ? (
            <p>
              <Badge kind="ok">Ενεργή</Badge> Μοντέλο: <code>{catalog.ai.model}</code>
            </p>
          ) : (
            <div className="alert info">Ανενεργή. Για αυτόματη ανάγνωση φωτογραφιών/PDF ορίστε τη μεταβλητή <code>ANTHROPIC_API_KEY</code> στον server (βλ. README). Η χειροκίνητη καταχώριση λειτουργεί κανονικά.</div>
          )}
          <p className="small muted">Η AI χρησιμοποιείται μόνο για ανάγνωση και προτάσεις αντιστοίχισης. Όλοι οι υπολογισμοί γίνονται με ελεγμένους κανόνες στην εφαρμογή.</p>
        </div>
        <Exports />
      </div>
      <Backups />
      <div className="grid2">
        <Users />
        <Suppliers />
      </div>
      <SampleData />
    </div>
  );
}

function Exports() {
  const [run, busy] = useAction();
  const dl = (name, fmt) => run(() => download(`/api/export/${name}.${fmt}`)).catch(() => {});
  const rows = [
    ['materials', 'Υλικά & ενεργές τιμές'],
    ['prices', 'Ιστορικό τιμών'],
    ['recipes', 'Συνταγές'],
    ['products', 'Κοστολόγια προϊόντων'],
  ];
  return (
    <div className="card">
      <h2>Εξαγωγές</h2>
      <div className="list">
        {rows.map(([n, label]) => (
          <div key={n} className="list-item">
            <span className="grow title">{label}</span>
            <button className="btn small" onClick={() => dl(n, 'xlsx')} disabled={busy}>
              Excel
            </button>
            <button className="btn small" onClick={() => dl(n, 'csv')} disabled={busy}>
              CSV
            </button>
          </div>
        ))}
        <div className="list-item">
          <span className="grow title">Όλα σε ένα αρχείο Excel</span>
          <button className="btn small primary" onClick={() => dl('all', 'xlsx')} disabled={busy}>
            <Icon name="download" /> Excel
          </button>
        </div>
      </div>
      <p className="small muted">Το CSV είναι σε μορφή για ελληνικό Excel (διαχωριστικό «;», δεκαδικά με κόμμα). Η λίστα παραγωγής εξάγεται από τη σελίδα Παραγωγή.</p>
    </div>
  );
}

function Backups() {
  const { reload, confirm, toast } = useStore();
  const [run, busy] = useAction();
  const [data, setData] = useState(null);
  const fileRef = useRef(null);
  const load = () => api.get('/api/backups').then(setData);
  useEffect(() => {
    load();
  }, []);
  const restoreDone = async (r) => {
    await reload();
    await load();
    toast(`Η επαναφορά ολοκληρώθηκε. Η προηγούμενη κατάσταση φυλάχτηκε ως ${r.preRestoreBackup}.`, 'ok', 8000);
  };
  const restoreNamed = async (b) => {
    if (!(await confirm({ title: 'Επαναφορά αντιγράφου', message: `ΟΛΑ τα τρέχοντα δεδομένα θα αντικατασταθούν από το αντίγραφο της ${formatDateTime(b.created_at)}. Πριν την επαναφορά κρατείται αυτόματα αντίγραφο της τρέχουσας κατάστασης. Συνέχεια;`, confirmText: 'Επαναφορά', danger: true }))) return;
    await run(async () => restoreDone(await api.post(`/api/backups/${encodeURIComponent(b.name)}/restore`)));
  };
  const restoreFile = async (file) => {
    if (!file) return;
    if (!(await confirm({ title: 'Επαναφορά από αρχείο', message: `ΟΛΑ τα τρέχοντα δεδομένα θα αντικατασταθούν από το «${file.name}». Πριν την επαναφορά κρατείται αυτόματα αντίγραφο. Συνέχεια;`, confirmText: 'Επαναφορά', danger: true }))) return;
    const fd = new FormData();
    fd.append('file', file, file.name);
    await run(async () => restoreDone(await api.upload('/api/backup/restore', fd)));
  };
  const KIND = { auto: 'Αυτόματο', manual: 'Χειροκίνητο', 'pre-restore': 'Πριν από επαναφορά' };
  return (
    <div className="card">
      <div className="card-head">
        <h2>Αντίγραφα ασφαλείας</h2>
      </div>
      <p className="small muted">
        Το πλήρες αντίγραφο (.zip) περιέχει όλα τα δεδομένα, τις συνδέσεις και τα αρχικά παραστατικά. Αυτόματα αντίγραφα δημιουργούνται κάθε {data?.intervalHours ?? 24} ώρες (κρατούνται τα τελευταία {data?.keep ?? 14}). Κατεβάζετε τακτικά ένα αντίγραφο και σε άλλη συσκευή.
      </p>
      <div className="row">
        <button className="btn primary" onClick={() => run(() => download('/api/backup/download')).catch(() => {})} disabled={busy}>
          <Icon name="download" /> Λήψη πλήρους αντιγράφου
        </button>
        <button className="btn" onClick={() => run(async () => (await api.post('/api/backups'), load()), 'Δημιουργήθηκε αντίγραφο στον server')} disabled={busy}>
          Αντίγραφο στον server τώρα
        </button>
        <button className="btn danger" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Icon name="upload" /> Επαναφορά από αρχείο
        </button>
        <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={(e) => (restoreFile(e.target.files[0]), (e.target.value = ''))} />
      </div>
      {!data ? (
        <Spinner />
      ) : (
        <div className="table-wrap" style={{ marginTop: '.75rem' }}>
          <table className="t">
            <thead>
              <tr>
                <th>Ημερομηνία</th>
                <th>Είδος</th>
                <th className="num">Μέγεθος</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.backups.map((b) => (
                <tr key={b.name}>
                  <td>{formatDateTime(b.created_at)}</td>
                  <td>{KIND[b.kind]}</td>
                  <td className="num">{formatBytes(b.size)}</td>
                  <td className="right nowrap">
                    <button className="btn small" onClick={() => run(() => download(`/api/backups/${encodeURIComponent(b.name)}`)).catch(() => {})}>
                      Λήψη
                    </button>{' '}
                    <button className="btn small danger" onClick={() => restoreNamed(b)} disabled={busy}>
                      Επαναφορά
                    </button>
                  </td>
                </tr>
              ))}
              {!data.backups.length && (
                <tr>
                  <td colSpan={4} className="muted">
                    Κανένα ακόμη.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Users() {
  const { catalog, confirm } = useStore();
  const [run, busy] = useAction();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(null);
  const load = () => api.get('/api/users').then(setUsers);
  useEffect(() => {
    load();
  }, []);
  const save = () =>
    run(async () => {
      if (form.id) await api.put(`/api/users/${form.id}/password`, { password: form.password });
      else await api.post('/api/users', form);
      setForm(null);
      await load();
    }, 'Αποθηκεύτηκε');
  const del = async (u) => {
    if (!(await confirm({ title: 'Διαγραφή χρήστη', message: `Να διαγραφεί ο χρήστης «${u.username}»;`, confirmText: 'Διαγραφή', danger: true }))) return;
    await run(async () => (await api.del(`/api/users/${u.id}`), load()));
  };
  return (
    <div className="card">
      <div className="card-head">
        <h2>Χρήστες</h2>
        <button className="btn small" onClick={() => setForm({ username: '', display_name: '', password: '' })}>
          <Icon name="plus" /> Νέος
        </button>
      </div>
      <div className="list">
        {users.map((u) => (
          <div key={u.id} className="list-item">
            <Icon name="user" size={20} />
            <div className="grow">
              <div className="title">
                {u.display_name || u.username} {u.id === catalog.user?.id && <Badge kind="info">εσείς</Badge>}
              </div>
              <div className="sub">{u.username}</div>
            </div>
            <button className="btn small" onClick={() => setForm({ id: u.id, username: u.username, password: '' })}>
              Κωδικός
            </button>
            {u.id !== catalog.user?.id && (
              <button className="iconbtn" onClick={() => del(u)} aria-label="Διαγραφή">
                <Icon name="trash" />
              </button>
            )}
          </div>
        ))}
      </div>
      {form && (
        <Modal
          title={form.id ? `Νέος κωδικός: ${form.username}` : 'Νέος χρήστης'}
          onClose={() => setForm(null)}
          footer={
            <button className="btn primary" onClick={save} disabled={busy || (form.password || '').length < 8}>
              Αποθήκευση
            </button>
          }
        >
          {!form.id && (
            <>
              <Field label="Όνομα χρήστη">
                <TextInput value={form.username} onChange={(v) => setForm((f) => ({ ...f, username: v }))} autoCapitalize="none" />
              </Field>
              <Field label="Όνομα εμφάνισης">
                <TextInput value={form.display_name} onChange={(v) => setForm((f) => ({ ...f, display_name: v }))} />
              </Field>
            </>
          )}
          <Field label="Κωδικός (τουλάχιστον 8 χαρακτήρες)">
            <input className="input" type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} autoComplete="new-password" />
          </Field>
        </Modal>
      )}
    </div>
  );
}

function Suppliers() {
  const { catalog, reload, confirm } = useStore();
  const [run, busy] = useAction();
  const [form, setForm] = useState(null);
  const save = () =>
    run(async () => {
      if (form.id) await api.put(`/api/suppliers/${form.id}`, form);
      else await api.post('/api/suppliers', form);
      setForm(null);
      await reload();
    }, 'Αποθηκεύτηκε');
  const del = async (s) => {
    if (!(await confirm({ title: 'Διαγραφή προμηθευτή', message: `Να διαγραφεί ο «${s.name}»; Οι αποθηκευμένες αντιστοιχίσεις του θα χαθούν.`, confirmText: 'Διαγραφή', danger: true }))) return;
    await run(async () => (await api.del(`/api/suppliers/${s.id}`), reload()));
  };
  return (
    <div className="card">
      <div className="card-head">
        <h2>Προμηθευτές</h2>
        <button className="btn small" onClick={() => setForm({ name: '', vat_number: '', phone: '', notes: '' })}>
          <Icon name="plus" /> Νέος
        </button>
      </div>
      {!catalog.suppliers.length && <p className="muted small">Δημιουργούνται αυτόματα από τα παραστατικά.</p>}
      <div className="list">
        {catalog.suppliers.map((s) => (
          <div key={s.id} className="list-item">
            <div className="grow">
              <div className="title">
                {s.name} <SampleBadge show={s.is_sample} />
              </div>
              <div className="sub">{[s.vat_number && `ΑΦΜ ${s.vat_number}`, s.phone].filter(Boolean).join(' · ') || '—'}</div>
            </div>
            <button className="iconbtn" onClick={() => setForm({ ...s })} aria-label="Διόρθωση">
              <Icon name="edit" />
            </button>
            <button className="iconbtn" onClick={() => del(s)} aria-label="Διαγραφή">
              <Icon name="trash" />
            </button>
          </div>
        ))}
      </div>
      {form && (
        <Modal
          title={form.id ? 'Διόρθωση προμηθευτή' : 'Νέος προμηθευτής'}
          onClose={() => setForm(null)}
          footer={
            <button className="btn primary" onClick={save} disabled={busy || !form.name?.trim()}>
              Αποθήκευση
            </button>
          }
        >
          <Field label="Επωνυμία">
            <TextInput value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
          </Field>
          <div className="row">
            <Field label="ΑΦΜ">
              <TextInput value={form.vat_number} onChange={(v) => setForm((f) => ({ ...f, vat_number: v }))} inputMode="numeric" />
            </Field>
            <Field label="Τηλέφωνο">
              <TextInput value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} inputMode="tel" />
            </Field>
          </div>
          <Field label="Σημειώσεις">
            <TextInput value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} />
          </Field>
        </Modal>
      )}
    </div>
  );
}

function SampleData() {
  const { catalog, reload, confirm, toast } = useStore();
  const [run, busy] = useAction();
  const del = async () => {
    if (!(await confirm({ title: 'Διαγραφή παραδειγματικών δεδομένων', message: 'Θα διαγραφούν τα υλικά, οι τιμές, τα τιμολόγια, οι συνταγές και τα προϊόντα με σήμανση «ΠΑΡΑΔΕΙΓΜΑ». Ό,τι χρησιμοποιείται από δικά σας δεδομένα θα διατηρηθεί (χωρίς τις παραδειγματικές τιμές).', confirmText: 'Διαγραφή', danger: true }))) return;
    await run(async () => {
      const r = await api.post('/api/sample-data/delete');
      await reload();
      toast(r.kept.length ? `Διαγράφηκαν. Διατηρήθηκαν επειδή τα χρησιμοποιείτε: ${r.kept.join(', ')}` : 'Τα παραδειγματικά δεδομένα διαγράφηκαν.', 'ok', 9000);
    });
  };
  const load = () => run(async () => (await api.post('/api/sample-data/load'), reload()), 'Φορτώθηκαν παραδειγματικά δεδομένα');
  return (
    <div className="card">
      <h2>Παραδειγματικά δεδομένα</h2>
      {catalog.has_sample ? (
        <>
          <p>
            Υπάρχουν δεδομένα με σήμανση <SampleBadge show />. Οι τιμές τους είναι πλασματικές και χρησιμεύουν μόνο για να δείτε πώς δουλεύει η εφαρμογή.
          </p>
          <button className="btn danger" onClick={del} disabled={busy}>
            <Icon name="trash" /> Διαγραφή παραδειγματικών δεδομένων
          </button>
        </>
      ) : (
        <>
          <p className="muted">Δεν υπάρχουν παραδειγματικά δεδομένα.</p>
          <button className="btn" onClick={load} disabled={busy}>
            Φόρτωση παραδειγμάτων
          </button>
        </>
      )}
    </div>
  );
}
