// Ανάγνωση τιμολογίου με τη συνδρομή σας στο Claude (claude.ai / εφαρμογή Claude), χωρίς κλειδί API.
import { useEffect, useState } from 'react';
import { api, fetchBlob } from '../api.js';
import { useStore, useAction } from '../store.jsx';
import { Modal, Spinner } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { deliverFile } from '../platform.js';

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* εναλλακτικός τρόπος παρακάτω */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function ClaudeImport({ invoice, hasLines, onDone, onClose }) {
  const { confirm } = useStore();
  const [run, busy] = useAction();
  const [prompt, setPrompt] = useState('');
  const [copied, setCopied] = useState(null); // 'ok' | 'manual'
  const [text, setText] = useState('');

  useEffect(() => {
    api
      .get('/api/claude-prompt')
      .then((r) => setPrompt(r.prompt))
      .catch(() => {});
  }, []);

  const copy = async () => setCopied((await copyText(prompt)) ? 'ok' : 'manual');
  const paste = async () => {
    try {
      setText(await navigator.clipboard.readText());
    } catch {
      /* ο χρήστης μπορεί να επικολλήσει με παρατεταμένο πάτημα */
    }
  };
  const doImport = async () => {
    if (hasLines && !(await confirm({ title: 'Αντικατάσταση γραμμών', message: 'Οι τρέχουσες γραμμές θα αντικατασταθούν από την απάντηση του Claude. Συνέχεια;', confirmText: 'Συμπλήρωση' }))) return;
    const res = await run(() => api.post(`/api/invoices/${invoice.id}/import`, { text, replace: true }), 'Οι γραμμές συμπληρώθηκαν. Ελέγξτε τις πριν την επιβεβαίωση.');
    if (res) onDone(res);
  };

  return (
    <Modal title="Ανάγνωση με το Claude (συνδρομή σας)" onClose={onClose} wide>
      <p className="small muted">Χωρίς κλειδί API και χωρίς επιπλέον χρέωση: χρησιμοποιείτε τη συνδρομή σας στο Claude. Τέσσερα βήματα:</p>
      <ol className="steps">
        <li>
          <button className={`btn ${copied === 'ok' ? 'ok' : 'primary'}`} onClick={copy} disabled={!prompt}>
            {!prompt ? <Spinner /> : <Icon name={copied === 'ok' ? 'check' : 'copy'} />} {copied === 'ok' ? 'Οι οδηγίες αντιγράφηκαν' : 'Αντιγραφή οδηγιών'}
          </button>
          {copied === 'manual' && (
            <>
              <p className="small up" style={{ marginTop: '.4rem' }}>
                Η αυτόματη αντιγραφή δεν επιτρέπεται εδώ. Πατήστε παρατεταμένα μέσα στο πλαίσιο → «Επιλογή όλων» → «Αντιγραφή».
              </p>
              <textarea className="input" readOnly rows={4} value={prompt} onFocus={(e) => e.target.select()} />
            </>
          )}
        </li>
        <li>
          <a className="btn" href="https://claude.ai/new" target="_blank" rel="noopener noreferrer">
            <Icon name="link" /> Άνοιγμα Claude
          </a>
          <div className="small muted" style={{ marginTop: '.3rem' }}>
            Σε νέα συνομιλία: <b>επικολλήστε τις οδηγίες</b>, πατήστε <b>+</b> για να προσθέσετε τη <b>φωτογραφία ή το PDF</b> του τιμολογίου (ή φωτογραφίστε το εκεί), και στείλτε.
          </div>
          {invoice.files?.length > 0 && (
            <div className="row" style={{ marginTop: '.4rem' }}>
              {invoice.files.map((f, i) => (
                <button key={f.id} className="btn small" onClick={() => fetchBlob(`/api/files/${f.id}`).then((b) => deliverFile(b, f.original_name || `timologio-${i + 1}`))}>
                  <Icon name="download" /> Αποστολή αρχείου {invoice.files.length > 1 ? i + 1 : ''} (π.χ. στο Claude)
                </button>
              ))}
            </div>
          )}
        </li>
        <li>
          Όταν απαντήσει, πατήστε <b>«Αντιγραφή»</b> κάτω από την απάντηση του Claude.
        </li>
        <li>
          Επικολλήστε την απάντηση εδώ:
          <textarea className="input" rows={6} placeholder="Επικόλληση της απάντησης του Claude…" value={text} onChange={(e) => setText(e.target.value)} style={{ marginTop: '.4rem', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '14px' }} />
          <div className="row" style={{ marginTop: '.4rem' }}>
            {navigator.clipboard?.readText && window.isSecureContext && (
              <button className="btn" onClick={paste}>
                Επικόλληση
              </button>
            )}
            <button className="btn ok" style={{ flex: 1 }} onClick={doImport} disabled={busy || !text.trim()}>
              {busy ? <Spinner /> : <Icon name="check" />} Συμπλήρωση γραμμών
            </button>
          </div>
        </li>
      </ol>
      <p className="small muted">
        Συμβουλή: στο Claude φτιάξτε ένα <b>Project</b> «Τιμολόγια» και βάλτε τις οδηγίες στις οδηγίες του Project. Μετά αρκεί να στέλνετε μόνο τη φωτογραφία. Οι αριθμοί δεν υπολογίζονται από το Claude: η εφαρμογή κάνει όλους τους υπολογισμούς και εσείς ελέγχετε κάθε γραμμή πριν την επιβεβαίωση.
      </p>
    </Modal>
  );
}
