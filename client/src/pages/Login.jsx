import { useState } from 'react';
import { api } from '../api.js';
import { Field } from '../ui.jsx';

export function Login({ needsSetup, onDone }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    if (needsSetup && password !== password2) return setErr('Οι κωδικοί δεν ταιριάζουν.');
    setBusy(true);
    try {
      if (needsSetup) await api.post('/api/auth/setup', { username, password, display_name: displayName });
      else await api.post('/api/auth/login', { username, password });
      onDone();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-page">
      <form className="card login-card" onSubmit={submit}>
        <img src="/icon.svg" className="logo" alt="" />
        <h1 style={{ textAlign: 'center' }}>{needsSetup ? 'Πρώτη ρύθμιση' : 'Σύνδεση'}</h1>
        <p className="muted" style={{ textAlign: 'center' }}>
          {needsSetup ? 'Δημιουργήστε τον λογαριασμό πρόσβασης. Τον ίδιο θα χρησιμοποιείτε από κινητό και υπολογιστή.' : 'Κοστολόγηση ζαχαροπλαστείου · αρτοποιίας · gelato'}
        </p>
        {needsSetup && (
          <Field label="Όνομα (εμφάνιση)">
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="π.χ. Μαρία" />
          </Field>
        )}
        <Field label="Όνομα χρήστη">
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required />
        </Field>
        <Field label="Κωδικός" hint={needsSetup ? 'Τουλάχιστον 8 χαρακτήρες.' : undefined}>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={needsSetup ? 'new-password' : 'current-password'} required />
        </Field>
        {needsSetup && (
          <Field label="Επανάληψη κωδικού">
            <input className="input" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" required />
          </Field>
        )}
        {err && <div className="alert danger">{err}</div>}
        <button className="btn primary block big" disabled={busy}>
          {needsSetup ? 'Δημιουργία & είσοδος' : 'Είσοδος'}
        </button>
      </form>
    </div>
  );
}
