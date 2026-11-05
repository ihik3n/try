// Πίνακας ελέγχου παραστατικού: διόρθωση και επιβεβαίωση κάθε γραμμής πριν την ενημέρωση τιμών.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, fetchBlob } from '../api.js';
import { needsPdfRenderer, isStandalone, deliverFile } from '../platform.js';
import { PdfView } from '../components/PdfView.jsx';
import { ClaudeImport } from '../components/ClaudeImport.jsx';
import { useStore, useAction } from '../store.jsx';
import { PageHead, Field, NumberInput, TextInput, Select, Badge, SampleBadge, Spinner, Modal, DiffText, Link } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { ItemPicker } from '../components/ItemPicker.jsx';
import { MaterialForm } from '../components/MaterialForm.jsx';
import { formatMoney, formatUnitPrice, formatQty, formatDate, formatDateTime, UNIT_LABEL, BASIS_LABEL, COST_UNIT_SHORT } from '../format.js';
import { computeInvoice, QTY_UNIT_LABEL, HEADER_FIELD_LABEL } from '@shared/invoice.js';
import { normalize } from '@shared/text.js';
import { navigate, setNavigationBlocker } from '../router.js';
import { statusBadge } from './Invoices.jsx';

const HEADER_KEYS = ['supplier_id', 'supplier_name', 'supplier_vat', 'number', 'doc_date', 'doc_type', 'net_total', 'vat_total', 'gross_total', 'extra_discount', 'notes', 'dup_ack', 'flags'];
let keySeq = 1;
const withKey = (l) => ({ ...l, _key: l._key || `k${keySeq++}` });

function toDraft(inv) {
  const header = {};
  for (const k of HEADER_KEYS) header[k] = inv[k] ?? null;
  header.flags = inv.flags || [];
  header.dup_ack = !!inv.dup_ack;
  return { header, lines: inv.lines.map(withKey) };
}

const PACKAGING_RE = /ποτηρ|καπακ|κουταλ|κουτι|κουτ\b|σακουλ|βαση τουρτ|χαρτ|καλαθ|θηκ|ταψακ|κυπελλ|cup|lid|box/;
function newMaterialDefaults(line) {
  const d = (line.description || '').trim();
  const name = d ? d.charAt(0) + d.slice(1).toLocaleLowerCase('el') : '';
  const u = line.qty_unit && line.qty_unit !== 'unit' ? line.qty_unit : line.pack_unit;
  const cost_unit = u === 'kg' || u === 'g' ? 'kg' : u === 'l' || u === 'ml' ? 'l' : u === 'pc' ? 'pc' : 'kg';
  const kind = PACKAGING_RE.test(normalize(d)) ? 'packaging' : 'ingredient';
  return { name, cost_unit: kind === 'packaging' ? 'pc' : cost_unit, kind, category: kind === 'packaging' ? 'Συσκευασίες' : '' };
}

export function InvoiceEdit({ id }) {
  const { catalog, materialsById, reload, toast, confirm } = useStore();
  const [run, busy] = useAction();
  const [inv, setInv] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState(null); // line key
  const [newMat, setNewMat] = useState(null); // { key, initial }
  const [result, setResult] = useState(null);
  const [claude, setClaude] = useState(false);
  const [docIdx, setDocIdx] = useState(0);
  const seq = useRef(0);
  const camRef = useRef(null);
  const fileRef = useRef(null);
  const readonly = inv?.status === 'confirmed' || inv?.ai_status === 'running';

  const load = useCallback(async () => {
    const x = await api.get(`/api/invoices/${id}`);
    setInv(x);
    setDraft(toDraft(x));
    setDirty(false);
    return x;
  }, [id]);

  useEffect(() => {
    load().catch((e) => toast(e.message, 'error'));
  }, [load, toast]);

  // Παρακολούθηση ανάγνωσης AI
  useEffect(() => {
    if (inv?.ai_status !== 'running') return;
    const t = setInterval(async () => {
      const st = await api.get(`/api/invoices/${id}/status`).catch(() => null);
      if (st && st.ai_status !== 'running') {
        clearInterval(t);
        await load();
        await reload();
        toast(st.ai_status === 'done' ? 'Η ανάγνωση ολοκληρώθηκε. Ελέγξτε τις γραμμές.' : 'Η ανάγνωση απέτυχε.', st.ai_status === 'done' ? 'ok' : 'error');
      }
    }, 2500);
    return () => clearInterval(t);
  }, [inv?.ai_status, id, load, reload, toast]);

  const save = useCallback(
    async (d = draft) => {
      if (!d || readonly) return;
      const my = ++seq.current;
      setSaving(true);
      try {
        const res = await api.put(`/api/invoices/${id}`, { ...d.header, lines: d.lines });
        setInv((old) => ({ ...res, lines: old?.lines ?? res.lines }));
        if (my === seq.current) setDirty(false);
        return res;
      } finally {
        setSaving(false);
      }
    },
    [draft, id, readonly],
  );

  // Αυτόματη αποθήκευση προχείρου
  useEffect(() => {
    if (!dirty || readonly || busy) return;
    const t = setTimeout(() => save().catch((e) => toast(e.message, 'error')), 1500);
    return () => clearTimeout(t);
  }, [dirty, draft, readonly, busy, save, toast]);

  useEffect(() => setNavigationBlocker(() => dirty), [dirty]);

  const current = useMemo(() => {
    const m = new Map();
    for (const mat of catalog.materials) if (mat.price && mat.price.invoice_id !== id) m.set(mat.id, mat.price.unit_net);
    return m;
  }, [catalog, id]);

  const computed = useMemo(() => (draft ? computeInvoice(draft.header, draft.lines, materialsById, current) : null), [draft, materialsById, current]);

  if (!inv || !draft) return <Spinner />;

  const setHeader = (k, v) => {
    setDraft((d) => {
      const flags = (d.header.flags || []).filter((f) => f !== k && !(k === 'supplier_id' && f === 'supplier_name'));
      return { ...d, header: { ...d.header, [k]: v, flags } };
    });
    setDirty(true);
  };
  const clearHeaderFlag = (f) => {
    setDraft((d) => ({ ...d, header: { ...d.header, flags: d.header.flags.filter((x) => x !== f) } }));
    setDirty(true);
  };
  const setLine = (key, patch) => {
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => {
        if (l._key !== key) return l;
        const flags = (l.flags || []).filter((f) => !(f in patch));
        return { ...l, ...patch, flags };
      }),
    }));
    setDirty(true);
  };
  const clearLineFlag = (key, f) => {
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l._key === key ? { ...l, flags: (l.flags || []).filter((x) => x !== f) } : l)) }));
    setDirty(true);
  };
  const addLine = () => {
    setDraft((d) => ({ ...d, lines: [...d.lines, withKey({ description: '', qty: null, qty_unit: 'unit', pack_count: 1, flags: [], excluded: 0 })] }));
    setDirty(true);
  };
  const removeLine = async (key) => {
    if (!(await confirm({ title: 'Διαγραφή γραμμής', message: 'Να διαγραφεί η γραμμή από το πρόχειρο;', confirmText: 'Διαγραφή', danger: true }))) return;
    setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l._key !== key) }));
    setDirty(true);
  };

  const supplierName = draft.header.supplier_id ? catalog.suppliers.find((s) => s.id === draft.header.supplier_id)?.name ?? draft.header.supplier_name : draft.header.supplier_name;
  const onSupplierText = (text) => {
    const found = catalog.suppliers.find((s) => normalize(s.name) === normalize(text));
    setDraft((d) => ({
      ...d,
      header: { ...d.header, supplier_name: text, supplier_id: found ? found.id : null, supplier_vat: found?.vat_number || d.header.supplier_vat, flags: d.header.flags.filter((f) => f !== 'supplier_name') },
    }));
    setDirty(true);
  };

  const doConfirm = () =>
    run(async () => {
      try {
        const res = await api.post(`/api/invoices/${id}/confirm`, { ...draft.header, lines: draft.lines });
        setDirty(false);
        setInv(res.invoice);
        setDraft(toDraft(res.invoice));
        await reload();
        setResult(res.event || { changes: [], impacts: [] });
      } catch (e) {
        if (e.status === 409 && e.data?.duplicates) {
          await load();
          throw new Error('Πιθανό διπλό παραστατικό: ελέγξτε την προειδοποίηση και επιβεβαιώστε ότι είναι διαφορετικό.');
        }
        throw e;
      }
    });

  const doReopen = async () => {
    if (!(await confirm({ title: 'Επαναφορά σε πρόχειρο', message: 'Οι τιμές που καταχωρίστηκαν από αυτό το παραστατικό θα αφαιρεθούν μέχρι να το επιβεβαιώσετε ξανά. Συνέχεια;', confirmText: 'Επαναφορά' }))) return;
    await run(async () => {
      const res = await api.post(`/api/invoices/${id}/reopen`);
      setInv(res.invoice);
      setDraft(toDraft(res.invoice));
      await reload();
    }, 'Το παραστατικό είναι ξανά πρόχειρο');
  };

  const doDelete = async () => {
    const msg = inv.status === 'confirmed' ? 'Θα αφαιρεθούν και οι τιμές που προήλθαν από αυτό. Η ενέργεια δεν αναιρείται.' : 'Η ενέργεια δεν αναιρείται.';
    if (!(await confirm({ title: 'Διαγραφή παραστατικού', message: msg, confirmText: 'Διαγραφή', danger: true }))) return;
    await run(async () => {
      await api.del(`/api/invoices/${id}`);
      setDirty(false);
      await reload();
      navigate('/invoices', { force: true });
    }, 'Διαγράφηκε');
  };

  const doExtract = async () => {
    if (draft.lines.length && !(await confirm({ title: 'Νέα ανάγνωση', message: 'Οι τρέχουσες γραμμές θα αντικατασταθούν από τη νέα ανάγνωση. Συνέχεια;', confirmText: 'Ανάγνωση' }))) return;
    await run(async () => {
      if (dirty) await save();
      const res = await api.post(`/api/invoices/${id}/extract`, { replace: true });
      setInv(res);
      setDraft(toDraft(res));
    });
  };

  const doMatch = () =>
    run(async () => {
      const saved = dirty ? await save() : null;
      const res = await api.post(`/api/invoices/${id}/match`);
      setInv(res);
      setDraft(toDraft(res));
      void saved;
    }, 'Οι προτάσεις ενημερώθηκαν');

  const addFiles = (list) =>
    run(async () => {
      const fd = new FormData();
      for (const f of list) fd.append('files', f, f.name);
      const res = await api.upload(`/api/invoices/${id}/files`, fd);
      setInv((old) => ({ ...old, files: res.files, duplicates: res.duplicates }));
    }, 'Το αρχείο προστέθηκε');

  const removeFile = async (f) => {
    if (!(await confirm({ title: 'Αφαίρεση αρχείου', message: `Να αφαιρεθεί το «${f.original_name}»;`, confirmText: 'Αφαίρεση', danger: true }))) return;
    await run(async () => {
      const res = await api.del(`/api/invoices/${id}/files/${f.id}`);
      setInv((old) => ({ ...old, files: res.files }));
      setDocIdx(0);
    });
  };

  const hf = draft.header.flags || [];
  const flagged = (k) => hf.includes(k);
  const flagBtn = (k) =>
    flagged(k) && !readonly ? (
      <button className="flagbtn" onClick={() => clearHeaderFlag(k)}>
        Σωστό ✓
      </button>
    ) : null;
  const errCount = computed.errors.length + computed.lineErrorCount;
  const basis = catalog.settings.vat_basis;

  return (
    <div>
      <PageHead title={supplierName || 'Νέο παραστατικό'} back="/invoices" badges={<>{statusBadge(inv)} <SampleBadge show={inv.is_sample} /></>}>
        {!readonly && <span className="small muted">{saving ? 'Αποθήκευση…' : dirty ? 'Μη αποθηκευμένο' : 'Αποθηκεύτηκε'}</span>}
      </PageHead>

      {inv.ai_status === 'running' && (
        <div className="alert info">
          <Spinner /> <b>Ανάγνωση παραστατικού…</b> Μπορεί να διαρκέσει 1–2 λεπτά. Μπορείτε να φύγετε από τη σελίδα· το πρόχειρο θα είναι έτοιμο στη λίστα.
        </div>
      )}
      {inv.ai_status === 'error' && (
        <div className="alert danger">
          <b>Η ανάγνωση απέτυχε:</b> {inv.ai_error}{' '}
          {catalog.ai?.enabled && inv.files.length > 0 && (
            <button className="btn small" onClick={doExtract}>
              Δοκιμή ξανά
            </button>
          )}
        </div>
      )}
      {inv.ai_status === 'done' && inv.status === 'draft' && (
        <div className="alert warn">
          <b>Η AI διάβασε το παραστατικό — ελέγξτε κάθε γραμμή.</b> Οι κίτρινες τιμές είναι αβέβαιες και τα κενά πεδία δεν αναγράφονταν ή δεν διαβάζονταν. Τίποτα δεν ενημερώνεται πριν την επιβεβαίωση.
          {inv.ai_warnings?.length > 0 && (
            <ul>
              {inv.ai_warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {inv.duplicates?.length > 0 && inv.status === 'draft' && (
        <div className="alert danger">
          <b>Πιθανό διπλό παραστατικό</b>
          <ul>
            {inv.duplicates.map((d) => (
              <li key={`${d.id}${d.reason}`}>
                <Link to={`/invoices/${d.id}`}>
                  {d.supplier_name || '—'} αρ. {d.number || '—'} ({formatDate(d.doc_date)}, {d.status === 'confirmed' ? 'επιβεβαιωμένο' : 'πρόχειρο'})
                </Link>{' '}
                — {d.reason}
              </li>
            ))}
          </ul>
          <label className="checkbox">
            <input type="checkbox" checked={!!draft.header.dup_ack} onChange={(e) => setHeader('dup_ack', e.target.checked)} /> Έλεγξα: είναι διαφορετικό παραστατικό
          </label>
        </div>
      )}

      <div className="split-doc">
        <div className="docpane">
          <div className="card">
            <div className="card-head">
              <h3>Παραστατικό ({inv.files.length})</h3>
              {inv.status === 'draft' && (
                <>
                  <button className="btn small" onClick={() => camRef.current?.click()}>
                    <Icon name="camera" /> Σελίδα
                  </button>
                  <button className="btn small" onClick={() => fileRef.current?.click()}>
                    <Icon name="upload" /> Αρχείο
                  </button>
                </>
              )}
            </div>
            <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (addFiles([...e.target.files]), (e.target.value = ''))} />
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => (addFiles([...e.target.files]), (e.target.value = ''))} />
            {!inv.files.length ? (
              <p className="muted small">Δεν υπάρχει συνδεδεμένο αρχείο. {inv.is_sample ? 'Παραδειγματικό παραστατικό.' : 'Μπορείτε να προσθέσετε φωτογραφία ή PDF.'}</p>
            ) : (
              <DocViewer files={inv.files} idx={docIdx} setIdx={setDocIdx} onRemove={inv.status === 'draft' ? removeFile : null} />
            )}
            <div className="row">
              {inv.status === 'draft' && catalog.ai?.enabled && inv.files.length > 0 && inv.ai_status !== 'running' && (
                <button className="btn small" onClick={doExtract} disabled={busy}>
                  <Icon name="refresh" /> {inv.ai_status ? 'Νέα ανάγνωση' : 'Ανάγνωση με AI'}
                </button>
              )}
              {inv.status === 'draft' && inv.ai_status !== 'running' && (
                <button className="btn small" onClick={async () => (dirty && (await save()), setClaude(true))} disabled={busy}>
                  <Icon name="copy" /> Ανάγνωση με Claude (συνδρομή)
                </button>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <h3>Στοιχεία παραστατικού</h3>
            <div className="row">
              <Field label={<>Προμηθευτής * {flagBtn('supplier_name')}</>} className="w-md" hint={!draft.header.supplier_id && draft.header.supplier_name ? 'Νέος προμηθευτής — θα δημιουργηθεί κατά την επιβεβαίωση.' : undefined}>
                <input className={`input ${flagged('supplier_name') ? 'flagged' : ''}`} list="suppliers-dl" value={supplierName || ''} onChange={(e) => onSupplierText(e.target.value)} disabled={readonly} />
                <datalist id="suppliers-dl">
                  {catalog.suppliers.map((s) => (
                    <option key={s.id} value={s.name} />
                  ))}
                </datalist>
              </Field>
              <Field label={<>ΑΦΜ {flagBtn('supplier_vat')}</>} className="w-sm">
                <TextInput value={draft.header.supplier_vat} onChange={(v) => setHeader('supplier_vat', v)} inputMode="numeric" flagged={flagged('supplier_vat')} disabled={readonly} />
              </Field>
            </div>
            <div className="row">
              <Field label={<>Αριθμός {flagBtn('number')}</>}>
                <TextInput value={draft.header.number} onChange={(v) => setHeader('number', v)} flagged={flagged('number')} disabled={readonly} />
              </Field>
              <Field label={<>Ημερομηνία * {flagBtn('doc_date')}</>}>
                <input type="date" className={`input ${flagged('doc_date') ? 'flagged' : ''}`} value={draft.header.doc_date || ''} onChange={(e) => setHeader('doc_date', e.target.value || null)} disabled={readonly} />
              </Field>
            </div>
            <div className="row">
              <Field label={<>Καθαρή αξία {flagBtn('net_total')}</>} className="w-sm">
                <NumberInput value={draft.header.net_total} onChange={(v) => setHeader('net_total', v)} flagged={flagged('net_total')} disabled={readonly} suffix="€" />
              </Field>
              <Field label={<>ΦΠΑ {flagBtn('vat_total')}</>} className="w-sm">
                <NumberInput value={draft.header.vat_total} onChange={(v) => setHeader('vat_total', v)} flagged={flagged('vat_total')} disabled={readonly} suffix="€" />
              </Field>
              <Field label={<>Σύνολο {flagBtn('gross_total')}</>} className="w-sm">
                <NumberInput value={draft.header.gross_total} onChange={(v) => setHeader('gross_total', v)} flagged={flagged('gross_total')} disabled={readonly} suffix="€" />
              </Field>
              <Field label="Γενική έκπτωση" className="w-sm" hint="Κατανέμεται αναλογικά στις γραμμές">
                <NumberInput value={draft.header.extra_discount} onChange={(v) => setHeader('extra_discount', v)} disabled={readonly} suffix="€" />
              </Field>
            </div>
            <Field label="Σημειώσεις">
              <TextInput value={draft.header.notes} onChange={(v) => setHeader('notes', v)} disabled={readonly} />
            </Field>
            <Messages errors={computed.errors} warnings={computed.warnings} />
          </div>

          <div className="card-head">
            <h2>Γραμμές ({draft.lines.length})</h2>
            {inv.status === 'draft' && !readonly && (
              <button className="btn small" onClick={doMatch} disabled={busy}>
                <Icon name="link" /> Προτάσεις αντιστοίχισης
              </button>
            )}
          </div>
          {inv.status === 'draft' && !readonly && draft.lines.length === 0 && (
            <div className="alert info">
              <b>Αυτόματη συμπλήρωση γραμμών με τη συνδρομή σας στο Claude</b>, χωρίς κλειδί API και χωρίς επιπλέον χρέωση: αντιγράφετε τις οδηγίες, τις στέλνετε στο Claude μαζί με τη φωτογραφία και επικολλάτε εδώ την απάντηση.
              <div style={{ marginTop: '.5rem' }}>
                <button className="btn primary" onClick={async () => (dirty && (await save()), setClaude(true))}>
                  <Icon name="copy" /> Ανάγνωση με Claude
                </button>
              </div>
            </div>
          )}
          {draft.lines.map((l, i) => (
            <LineCard
              key={l._key}
              n={i + 1}
              line={l}
              res={computed.lines[i]}
              material={l.material_id != null ? materialsById.get(l.material_id) : null}
              readonly={readonly}
              basis={basis}
              onChange={(patch) => setLine(l._key, patch)}
              onClearFlag={(f) => clearLineFlag(l._key, f)}
              onPick={() => setPicker(l._key)}
              onNewMaterial={() => setNewMat({ key: l._key, initial: newMaterialDefaults(l) })}
              onRemove={() => removeLine(l._key)}
            />
          ))}
          {!readonly && (
            <button className="btn block" onClick={addLine}>
              <Icon name="plus" /> Προσθήκη γραμμής
            </button>
          )}

          <div className="card" style={{ marginTop: '1rem' }}>
            <h3>Σύνολα</h3>
            <dl className="kv">
              <dt>Άθροισμα γραμμών (καθαρό)</dt>
              <dd>{formatMoney(computed.sums.net)}</dd>
              {draft.header.extra_discount > 0 && (
                <>
                  <dt>Μετά τη γενική έκπτωση</dt>
                  <dd>{formatMoney(computed.sums.netAfterDiscount)}</dd>
                </>
              )}
              <dt>Καθαρή αξία παραστατικού</dt>
              <dd>{formatMoney(draft.header.net_total)}</dd>
              <dt>ΦΠΑ (γραμμών)</dt>
              <dd>{formatMoney(computed.sums.vat)}</dd>
            </dl>
            <p className="small muted" style={{ marginTop: '.5rem' }}>
              Οι τιμές αποθηκεύονται χωρίς ΦΠΑ και ο ΦΠΑ χωριστά. Τρέχουσα βάση κοστολόγησης: <b>{BASIS_LABEL[basis]}</b>.
            </p>
          </div>

          {inv.status === 'confirmed' && (
            <p className="small muted">
              Επιβεβαιώθηκε {formatDateTime(inv.confirmed_at)}. Για διόρθωση: «Επαναφορά σε πρόχειρο», διόρθωση και νέα επιβεβαίωση.
            </p>
          )}
        </div>
      </div>

      <div className="stickybar">
        {inv.status === 'draft' ? (
          <>
            <div className="info">
              {errCount ? (
                <span className="up">
                  <b>{errCount}</b> στοιχεία προς διόρθωση
                </span>
              ) : (
                <span className="down">Έτοιμο για επιβεβαίωση</span>
              )}
            </div>
            <button className="btn danger" onClick={doDelete} disabled={busy}>
              <Icon name="trash" />
            </button>
            <button className="btn" onClick={() => save().then(() => toast('Αποθηκεύτηκε ως πρόχειρο', 'ok'))} disabled={busy || readonly}>
              Πρόχειρο
            </button>
            <button className="btn ok" onClick={doConfirm} disabled={busy || readonly || errCount > 0 || (inv.duplicates?.length > 0 && !draft.header.dup_ack)}>
              <Icon name="check" /> Επιβεβαίωση τιμών
            </button>
          </>
        ) : (
          <>
            <div className="info">Επιβεβαιωμένο · οι τιμές του χρησιμοποιούνται στην κοστολόγηση</div>
            <button className="btn danger" onClick={doDelete} disabled={busy}>
              <Icon name="trash" />
            </button>
            <button className="btn" onClick={doReopen} disabled={busy}>
              <Icon name="edit" /> Επαναφορά σε πρόχειρο
            </button>
          </>
        )}
      </div>

      {picker && (
        <ItemPicker
          title="Αντιστοίχιση με υλικό"
          kinds={['material', 'packaging']}
          initialQuery=""
          onClose={() => setPicker(null)}
          onPick={(it) => {
            setLine(picker, { material_id: it.id, match_source: 'manual', match_confidence: null, match_note: null });
            setPicker(null);
          }}
          onCreateMaterial={(q) => {
            const l = draft.lines.find((x) => x._key === picker);
            const initial = newMaterialDefaults(l);
            if (q) initial.name = q;
            setNewMat({ key: picker, initial });
            setPicker(null);
          }}
        />
      )}
      {newMat && (
        <MaterialForm
          initial={newMat.initial}
          onClose={() => setNewMat(null)}
          onSaved={(m) => setLine(newMat.key, { material_id: m.id, match_source: 'manual', match_confidence: null, match_note: null })}
        />
      )}
      {result && <ConfirmResult event={result} onClose={() => setResult(null)} />}
      {claude && (
        <ClaudeImport
          invoice={inv}
          hasLines={draft.lines.length > 0}
          onClose={() => setClaude(false)}
          onDone={(res) => {
            setInv(res);
            setDraft(toDraft(res));
            setDirty(false);
            setClaude(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function DocViewer({ files, idx, setIdx, onRemove }) {
  const [zoom, setZoom] = useState(false);
  const f = files[Math.min(idx, files.length - 1)];
  const url = `/api/files/${f.id}`;
  return (
    <div className="doc-view">
      {files.length > 1 && (
        <div className="doc-thumbs">
          {files.map((x, i) => (
            <div key={x.id} className={`doc-thumb ${i === idx ? 'active' : ''}`} style={x.mime.startsWith('image/') ? { backgroundImage: `url(/api/files/${x.id})` } : undefined} onClick={() => setIdx(i)}>
              {!x.mime.startsWith('image/') && 'PDF'}
            </div>
          ))}
        </div>
      )}
      {f.mime.startsWith('image/') ? (
        <div className="zoomwrap">
          <img src={url} alt={f.original_name} className={zoom ? 'zoomed' : ''} onClick={() => setZoom((z) => !z)} />
        </div>
      ) : needsPdfRenderer ? (
        <PdfView key={f.id} url={url} />
      ) : (
        <iframe src={url} title={f.original_name} />
      )}
      <div className="row" style={{ marginTop: '.4rem', alignItems: 'center' }}>
        {isStandalone() || needsPdfRenderer ? (
          // Στην εγκατεστημένη εφαρμογή του iPhone μια νέα καρτέλα ανοίγει στο Safari χωρίς σύνδεση· γι' αυτό «Κοινοποίηση».
          <button className="btn small" onClick={() => fetchBlob(url).then((b) => deliverFile(b, f.original_name || `parastatiko-${f.id}`))}>
            <Icon name="download" /> Αποθήκευση / Κοινοποίηση
          </button>
        ) : (
          <a className="btn small" href={url} target="_blank" rel="noreferrer">
            Άνοιγμα σε νέα καρτέλα
          </a>
        )}
        <span className="small muted" style={{ flex: 1 }}>
          {f.original_name}
        </span>
        {onRemove && (
          <button className="btn small danger" onClick={() => onRemove(f)}>
            <Icon name="trash" />
          </button>
        )}
      </div>
    </div>
  );
}

function Messages({ errors, warnings }) {
  if (!errors.length && !warnings.length) return null;
  return (
    <div className="msgs">
      {errors.map((e, i) => (
        <div key={`e${i}`} className="e">
          ⛔ {e.msg}
        </div>
      ))}
      {warnings.map((w, i) => (
        <div key={`w${i}`} className="w">
          ⚠ {w.msg}
        </div>
      ))}
    </div>
  );
}

const MATCH_LABEL = { alias: ['ok', 'Αποθηκευμένη αντιστοίχιση'], manual: ['ok', 'Επιλογή χρήστη'], ai: ['warn', 'Πρόταση AI'], fuzzy: ['warn', 'Πρόταση'] };

function LineCard({ n, line, res, material, readonly, basis, onChange, onClearFlag, onPick, onNewMaterial, onRemove }) {
  const flags = line.flags || [];
  const fl = (k) => flags.includes(k);
  const lab = (text, k) => (
    <>
      {text}
      {fl(k) && !readonly && (
        <button className="flagbtn" onClick={() => onClearFlag(k)}>
          Σωστό ✓
        </button>
      )}
    </>
  );
  const num = (k, label, suffix) => (
    <Field label={lab(label, k)}>
      <NumberInput value={line[k]} onChange={(v) => onChange({ [k]: v })} flagged={fl(k)} disabled={readonly} suffix={suffix} className="compact" />
    </Field>
  );
  const hasErr = res.errors.length > 0;
  const suggested = line.match_source === 'ai' || line.match_source === 'fuzzy';
  const [mk, ml] = MATCH_LABEL[line.match_source] || [];

  if (line.excluded) {
    return (
      <div className="inv-line excluded">
        <div className="lhead">
          <span className="lno">{n}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="strong">{line.description || '—'}</div>
            <div className="small muted">Εξαιρείται — δεν ενημερώνει τιμή υλικού · {formatMoney(res.net)}</div>
          </div>
          {!readonly && (
            <>
              <button className="btn small" onClick={() => onChange({ excluded: 0 })}>
                Συμπερίληψη
              </button>
              <button className="iconbtn" onClick={onRemove} aria-label="Διαγραφή">
                <Icon name="trash" />
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`inv-line ${hasErr ? 'err' : 'okline'}`}>
      <div className="lhead">
        <span className="lno">{n}</span>
        <TextInput value={line.description} onChange={(v) => onChange({ description: v })} flagged={fl('description')} disabled={readonly} placeholder="Περιγραφή όπως στο παραστατικό" />
        {!readonly && (
          <>
            <button className="btn small" onClick={() => onChange({ excluded: 1 })} title="Δεν αφορά υλικό (π.χ. μεταφορικά)">
              Εξαίρεση
            </button>
            <button className="iconbtn" onClick={onRemove} aria-label="Διαγραφή γραμμής">
              <Icon name="trash" />
            </button>
          </>
        )}
      </div>
      <div className="match">
        <button className={`btn small ${material ? '' : 'primary'}`} onClick={onPick} disabled={readonly} style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {material ? `→ ${material.name}` : 'Επιλογή υλικού…'}
        </button>
        {ml && material && (
          <Badge kind={mk} title={line.match_note || ''}>
            {ml}
            {line.match_confidence != null && suggested ? ` ${Math.round(line.match_confidence * 100)}%` : ''}
          </Badge>
        )}
        {suggested && material && !readonly && (
          <button className="btn small ok" onClick={() => onChange({ match_source: 'manual' })}>
            <Icon name="check" /> Σωστό
          </button>
        )}
        {!readonly && (
          <button className="btn small ghost" onClick={onNewMaterial}>
            <Icon name="plus" /> Νέο υλικό
          </button>
        )}
      </div>
      {line.match_note && suggested && <div className="small muted" style={{ marginTop: '-.3rem', marginBottom: '.4rem' }}>{line.match_note}</div>}
      <div className="grid">
        {num('qty', 'Ποσότητα')}
        <Field label={lab(`Μονάδα${line.unit_raw ? ` (παρ.: ${line.unit_raw})` : ''}`, 'qty_unit')}>
          <Select value={line.qty_unit} onChange={(v) => onChange({ qty_unit: v })} options={Object.entries(QTY_UNIT_LABEL).map(([value, label]) => ({ value, label }))} placeholder="—" flagged={fl('qty_unit')} disabled={readonly} className="compact" />
        </Field>
        {line.qty_unit === 'unit' && (
          <>
            <Field label={lab('Τεμ. ανά συσκ.', 'pack_count')}>
              <NumberInput value={line.pack_count} onChange={(v) => onChange({ pack_count: v })} flagged={fl('pack_count')} disabled={readonly} placeholder="1" className="compact" />
            </Field>
            <Field label={lab('Περιεχόμενο τεμ.', 'pack_size')}>
              <div className="row" style={{ gap: '.3rem', flexWrap: 'nowrap' }}>
                <NumberInput value={line.pack_size} onChange={(v) => onChange({ pack_size: v })} flagged={fl('pack_size')} disabled={readonly} className="compact" />
                <Select value={line.pack_unit} onChange={(v) => onChange({ pack_unit: v })} options={['kg', 'g', 'l', 'ml', 'pc'].map((u) => ({ value: u, label: UNIT_LABEL[u] }))} placeholder="—" flagged={fl('pack_unit')} disabled={readonly} className="compact" style={{ width: 80 }} />
              </div>
            </Field>
          </>
        )}
      </div>
      <div className="grid g6" style={{ marginTop: '.5rem' }}>
        {num('unit_price', 'Τιμή μονάδας', '€')}
        {num('discount_pct', 'Έκπτωση', '%')}
        {num('discount_amount', 'Έκπτωση', '€')}
        {num('net_amount', 'Καθαρή αξία', '€')}
        {num('vat_rate', 'ΦΠΑ', '%')}
        {num('vat_amount', 'Ποσό ΦΠΑ', '€')}
      </div>
      <details className="more" style={{ marginTop: '.4rem' }}>
        <summary className="small">Κωδικός προϊόντος{line.supplier_code ? `: ${line.supplier_code}` : ''}</summary>
        <Field label={lab('Κωδικός προμηθευτή', 'supplier_code')}>
          <TextInput value={line.supplier_code} onChange={(v) => onChange({ supplier_code: v })} flagged={fl('supplier_code')} disabled={readonly} className="compact" />
        </Field>
      </details>
      {(res.totalContent || res.unitCost != null) && (
        <div className="result">
          {res.totalContent && (
            <span>
              {line.qty_unit === 'unit' && res.contentPerUnit ? `${line.qty} × ${formatQty(res.contentPerUnit.qty, res.contentPerUnit.unit)} = ` : ''}
              <b>{formatQty(res.totalContent.qty, res.totalContent.unit, { keepUnit: true })}</b>
            </span>
          )}
          {res.unitCost != null && (
            <>
              {' · '}
              <span className="big">{formatUnitPrice(res.unitCost, res.costUnit)}</span> <span className="muted">χωρίς ΦΠΑ</span>
              {res.unitCostGross != null && <span className="muted"> · {formatUnitPrice(res.unitCostGross, res.costUnit)} με ΦΠΑ</span>}
              {res.allocatedDiscount > 0 && <span className="muted"> · περιλαμβάνει γενική έκπτωση {formatMoney(res.allocatedDiscount)}</span>}
              {res.deviation != null && (
                <span className="small">
                  {' '}
                  · σε σχέση με την τρέχουσα: <DiffText diff={res.deviation} pct={res.deviation * 100} money={false} />
                </span>
              )}
            </>
          )}
          {res.netSource === 'computed' && <div className="small muted">Η καθαρή αξία υπολογίστηκε από ποσότητα × τιμή − εκπτώσεις.</div>}
        </div>
      )}
      {line.ai_note && <div className="small muted" style={{ marginTop: '.3rem' }}>AI: {line.ai_note}</div>}
      <Messages errors={res.errors} warnings={res.warnings} />
      {basis === 'gross' && res.vatRate == null && <div className="small up">Χωρίς ΦΠΑ η τιμή δεν θα μπορεί να χρησιμοποιηθεί στην κοστολόγηση με ΦΠΑ.</div>}
    </div>
  );
}

function ConfirmResult({ event, onClose }) {
  return (
    <Modal
      title="Οι τιμές ενημερώθηκαν"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={() => (onClose(), navigate('/history'))}>
            Ιστορικό μεταβολών
          </button>
          <button className="btn primary" onClick={onClose}>
            Κλείσιμο
          </button>
        </>
      }
    >
      {!event.changes.length ? (
        <p>Δεν άλλαξε καμία ενεργή τιμή. (Π.χ. το παραστατικό είναι παλαιότερο από τις τρέχουσες τιμές, οπότε προστέθηκε μόνο στο ιστορικό.)</p>
      ) : (
        <>
          <h3>Μεταβολές τιμών</h3>
          <ChangesTable changes={event.changes} />
          <h3 style={{ marginTop: '1rem' }}>Επηρεαζόμενα κοστολόγια ({event.impacts.length})</h3>
          <ImpactsTable impacts={event.impacts} />
        </>
      )}
    </Modal>
  );
}

export function ChangesTable({ changes }) {
  return (
    <div className="table-wrap">
      <table className="t">
        <thead>
          <tr>
            <th>Υλικό</th>
            <th className="num">Παλιά</th>
            <th className="num">Νέα</th>
            <th className="num">Μεταβολή</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr key={c.material_id}>
              <td>
                <Link to={`/materials/${c.material_id}`}>{c.name}</Link>
                <div className="small muted">
                  {c.old_date ? formatDate(c.old_date) : '—'} → {c.new_date ? formatDate(c.new_date) : '—'}
                </div>
              </td>
              <td className="num">{c.old_price != null ? formatUnitPrice(c.old_price, c.unit) : <span className="muted">χωρίς τιμή</span>}</td>
              <td className="num">{c.new_price != null ? formatUnitPrice(c.new_price, c.unit) : <span className="muted">χωρίς τιμή</span>}</td>
              <td className="num">
                <DiffText diff={c.diff} pct={c.pct} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Παλιό/νέο κόστος επηρεαζόμενου στοιχείου στο «κύριο» κόστος (χωρίς ή με εργασία). */
export function impactCosts(i, costMode) {
  if (costMode !== 'with_labor' && i.old_cost_ex_labor !== undefined) {
    const o = i.old_cost_ex_labor;
    const n = i.new_cost_ex_labor;
    return { o, n, diff: o != null && n != null ? n - o : null, pct: i.pct_ex_labor };
  }
  return { o: i.old_cost, n: i.new_cost, diff: i.diff, pct: i.pct };
}

export function ImpactsTable({ impacts }) {
  const { costMode, costModeLabel } = useStore();
  if (!impacts.length) return <p className="muted">Κανένα.</p>;
  const sorted = [...impacts].sort((a, b) => (a.kind === b.kind ? Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0) : a.kind === 'product' ? -1 : 1));
  return (
    <div className="table-wrap">
      <table className="t">
        <thead>
          <tr>
            <th>Προϊόν / συνταγή</th>
            <th className="num">Παλιό κόστος ({costModeLabel})</th>
            <th className="num">Νέο κόστος</th>
            <th className="num">Μεταβολή</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((i) => {
            const c = impactCosts(i, costMode);
            return (
            <tr key={`${i.kind}${i.id}`}>
              <td>
                <Link to={`/${i.kind === 'product' ? 'products' : 'recipes'}/${i.id}`}>{i.name}</Link> <span className="kindtag">{i.kind === 'product' ? 'Προϊόν' : 'Συνταγή'}</span>
                {!i.new_complete && <Badge kind="danger">Ελλιπές</Badge>}
              </td>
              <td className="num">
                {formatMoney(c.o)}/{COST_UNIT_SHORT[i.unit]}
              </td>
              <td className="num">
                {formatMoney(c.n)}/{COST_UNIT_SHORT[i.unit]}
              </td>
              <td className="num">
                <DiffText diff={c.diff} pct={c.pct} />
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export { HEADER_FIELD_LABEL };
