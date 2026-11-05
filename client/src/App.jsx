import { useEffect, useState } from 'react';
import { api, setUnauthorizedHandler } from './api.js';
import { StoreProvider, useStore } from './store.jsx';
import { useRoute, match, navigate } from './router.js';
import { Link, Spinner, Modal } from './ui.jsx';
import { Icon } from './icons.jsx';
import { BASIS_LABEL } from './format.js';
import { Login } from './pages/Login.jsx';
import { Home } from './pages/Home.jsx';
import { Invoices, NewInvoice } from './pages/Invoices.jsx';
import { InvoiceEdit } from './pages/InvoiceEdit.jsx';
import { Materials } from './pages/Materials.jsx';
import { MaterialDetail } from './pages/MaterialDetail.jsx';
import { Recipes } from './pages/Recipes.jsx';
import { RecipeEdit } from './pages/RecipeEdit.jsx';
import { Products } from './pages/Products.jsx';
import { ProductEdit } from './pages/ProductEdit.jsx';
import { Production } from './pages/Production.jsx';
import { History, SnapshotCompare } from './pages/History.jsx';
import { Settings } from './pages/Settings.jsx';

export function App() {
  const [auth, setAuth] = useState(null);
  const check = () =>
    api
      .get('/api/auth/status')
      .then(setAuth)
      .catch((e) => setAuth({ error: e.message }));
  useEffect(() => {
    check();
    setUnauthorizedHandler(() => setAuth((a) => ({ ...a, user: null })));
  }, []);
  if (!auth) {
    return (
      <div className="center-page">
        <Spinner />
      </div>
    );
  }
  if (auth.error) {
    return (
      <div className="center-page">
        <div className="card login-card">
          <p>{auth.error}</p>
          <button className="btn primary" onClick={check}>
            Δοκιμή ξανά
          </button>
        </div>
      </div>
    );
  }
  if (!auth.user) return <Login needsSetup={auth.needsSetup} onDone={check} />;
  return (
    <StoreProvider>
      <Shell onLogout={check} />
    </StoreProvider>
  );
}

const NAV = [
  { to: '/', label: 'Αρχική', icon: 'home', exact: true },
  { to: '/invoices', label: 'Τιμολόγια', icon: 'invoice' },
  { to: '/materials', label: 'Υλικά', icon: 'box' },
  { to: '/recipes', label: 'Συνταγές', icon: 'book' },
  { to: '/products', label: 'Προϊόντα', icon: 'cake' },
  { to: '/production', label: 'Παραγωγή', icon: 'factory' },
  { to: '/history', label: 'Ιστορικό', icon: 'history' },
  { to: '/settings', label: 'Ρυθμίσεις', icon: 'settings' },
];
const MOBILE_NAV = ['/invoices', '/materials', '/recipes', '/products', '/production'];

function isActive(item, path) {
  return item.exact ? path === item.to : path === item.to || path.startsWith(item.to + '/');
}

function Shell({ onLogout }) {
  const { catalog, error, reload } = useStore();
  const { path, query } = useRoute();
  const [menu, setMenu] = useState(false);

  if (!catalog) {
    return (
      <div className="center-page">
        {error ? (
          <div className="card login-card">
            <p>{error.message}</p>
            <button className="btn primary" onClick={() => reload()}>
              Δοκιμή ξανά
            </button>
          </div>
        ) : (
          <Spinner />
        )}
      </div>
    );
  }
  const logout = async () => {
    await api.post('/api/auth/logout');
    onLogout();
  };
  const badge = (to) => (to === '/invoices' && catalog.drafts ? <span className="navbadge">{catalog.drafts}</span> : null);

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="/icon.svg" alt="" width="26" height="26" />
          <span>{catalog.settings.business_name || 'Κοστολόγηση'}</span>
        </Link>
        <div className="spacer" />
        <span className="basis" title="Βάση κοστολόγησης (Ρυθμίσεις)">
          {BASIS_LABEL[catalog.settings.vat_basis]}
        </span>
        <button onClick={logout} title="Αποσύνδεση" aria-label="Αποσύνδεση">
          <Icon name="logout" />
        </button>
      </header>
      {catalog.has_sample && (
        <div className="sample-banner no-print">
          <span>
            Περιέχονται <b>παραδειγματικά δεδομένα</b> (σήμανση «ΠΑΡΑΔΕΙΓΜΑ»). Οι τιμές τους δεν είναι πραγματικές.
          </span>
          <Link to="/settings">Διαγραφή όταν είστε έτοιμοι →</Link>
        </div>
      )}
      <div className="layout">
        <nav className="sidebar">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className={isActive(n, path) ? 'active' : ''}>
              <Icon name={n.icon} /> {n.label} {badge(n.to)}
            </Link>
          ))}
        </nav>
        <main className="main">
          <Routes path={path} query={query} />
        </main>
      </div>
      <nav className="bottomnav">
        {NAV.filter((n) => MOBILE_NAV.includes(n.to)).map((n) => (
          <Link key={n.to} to={n.to} className={isActive(n, path) ? 'active' : ''}>
            <Icon name={n.icon} />
            {n.label}
            {badge(n.to)}
          </Link>
        ))}
        <button onClick={() => setMenu(true)}>
          <Icon name="menu" />
          Μενού
        </button>
      </nav>
      {menu && (
        <Modal title="Μενού" onClose={() => setMenu(false)}>
          <div className="list">
            {NAV.filter((n) => !MOBILE_NAV.includes(n.to)).map((n) => (
              <a
                key={n.to}
                href={`#${n.to}`}
                className="list-item"
                onClick={(e) => {
                  e.preventDefault();
                  setMenu(false);
                  navigate(n.to);
                }}
              >
                <Icon name={n.icon} size={22} /> <span className="grow title">{n.label}</span>
              </a>
            ))}
            <a
              href="#/"
              className="list-item"
              onClick={(e) => {
                e.preventDefault();
                logout();
              }}
            >
              <Icon name="logout" size={22} /> <span className="grow title">Αποσύνδεση ({catalog.user?.display_name || catalog.user?.username})</span>
            </a>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Routes({ path, query }) {
  let p;
  if (path === '/' || path === '') return <Home />;
  if (path === '/invoices') return <Invoices />;
  if (path === '/invoices/new') return <NewInvoice capture={query.capture === '1'} />;
  if ((p = match('/invoices/:id', path))) return <InvoiceEdit key={p.id} id={Number(p.id)} />;
  if (path === '/materials') return <Materials initialFilter={query.filter} />;
  if ((p = match('/materials/:id', path))) return <MaterialDetail key={p.id} id={Number(p.id)} />;
  if (path === '/recipes') return <Recipes />;
  if (path === '/recipes/new') return <RecipeEdit key="new" id={null} />;
  if ((p = match('/recipes/:id', path))) return <RecipeEdit key={p.id} id={Number(p.id)} />;
  if (path === '/products') return <Products />;
  if (path === '/products/new') return <ProductEdit key="new" id={null} />;
  if ((p = match('/products/:id', path))) return <ProductEdit key={p.id} id={Number(p.id)} />;
  if (path === '/production') return <Production query={query} />;
  if (path === '/history') return <History tab={query.tab} />;
  if ((p = match('/history/snapshots/:id', path))) return <SnapshotCompare key={p.id} id={Number(p.id)} />;
  if (path === '/settings') return <Settings />;
  return (
    <div className="card">
      <p>Η σελίδα δεν βρέθηκε.</p>
      <Link to="/">Αρχική</Link>
    </div>
  );
}
