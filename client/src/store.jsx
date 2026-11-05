// Κοινή κατάσταση: κατάλογος (υλικά, συνταγές, προϊόντα, ρυθμίσεις), μηχανή κοστολόγησης, ειδοποιήσεις.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { createEngine } from '@shared/costing.js';

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const loadingRef = useRef(null);

  const reload = useCallback(async () => {
    if (loadingRef.current) return loadingRef.current;
    const p = api
      .get('/api/catalog')
      .then((c) => {
        setCatalog(c);
        setError(null);
        return c;
      })
      .catch((e) => {
        setError(e);
        throw e;
      })
      .finally(() => {
        loadingRef.current = null;
      });
    loadingRef.current = p;
    return p;
  }, []);

  useEffect(() => {
    reload().catch(() => {});
    // Ανανέωση όταν επιστρέφουμε στην εφαρμογή (κοινά δεδομένα κινητού/υπολογιστή)
    const onFocus = () => {
      if (document.visibilityState === 'visible') reload().catch(() => {});
    };
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [reload]);

  const toast = useCallback((message, type = 'info', ms = 3500) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  const confirm = useCallback(
    (opts) =>
      new Promise((resolve) => {
        setDialog({ ...opts, resolve });
      }),
    [],
  );

  const derived = useMemo(() => {
    if (!catalog) return {};
    const engine = createEngine(catalog);
    const materialsById = new Map(catalog.materials.map((m) => [m.id, m]));
    const recipesById = new Map(catalog.recipes.map((r) => [r.id, r]));
    const productsById = new Map(catalog.products.map((p) => [p.id, p]));
    const suppliersById = new Map(catalog.suppliers.map((s) => [s.id, s]));
    return { engine, materialsById, recipesById, productsById, suppliersById };
  }, [catalog]);

  const value = { catalog, error, reload, toast, confirm, ...derived };
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>
      {dialog && (
        <div className="overlay" onClick={() => (dialog.resolve(false), setDialog(null))}>
          <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-head">
              <h2>{dialog.title || 'Επιβεβαίωση'}</h2>
            </div>
            {typeof dialog.message === 'string' ? <p>{dialog.message}</p> : dialog.message}
            <div className="modal-foot">
              <button className="btn" onClick={() => (dialog.resolve(false), setDialog(null))}>
                {dialog.cancelText || 'Άκυρο'}
              </button>
              <button className={`btn ${dialog.danger ? 'danger solid' : 'primary'}`} onClick={() => (dialog.resolve(true), setDialog(null))} autoFocus>
                {dialog.confirmText || 'Εντάξει'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useStore() {
  return useContext(Ctx);
}

/** Εκτελεί ενέργεια με ένδειξη φόρτωσης και ειδοποίηση σφάλματος. */
export function useAction() {
  const { toast } = useStore();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (fn, okMessage) => {
      setBusy(true);
      try {
        const r = await fn();
        if (okMessage) toast(okMessage, 'ok');
        return r;
      } catch (e) {
        toast(e.message || 'Σφάλμα', 'error', 6000);
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return [run, busy];
}
