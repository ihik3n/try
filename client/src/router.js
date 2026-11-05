// Απλός router με hash (#/υλικά κ.λπ.), με προστασία για μη αποθηκευμένες αλλαγές.
import { useEffect, useState } from 'react';

let blocker = null;
let lastHash = window.location.hash;

export function setNavigationBlocker(fn) {
  blocker = fn;
  return () => {
    if (blocker === fn) blocker = null;
  };
}

const UNSAVED = 'Υπάρχουν μη αποθηκευμένες αλλαγές. Θέλετε να φύγετε χωρίς αποθήκευση;';

export function navigate(to, { replace = false, force = false } = {}) {
  if (!force && blocker && blocker() && !window.confirm(UNSAVED)) return false;
  if (!force) blocker = null;
  const hash = to.startsWith('#') ? to : `#${to}`;
  if (replace) {
    window.history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else window.location.hash = hash;
  return true;
}

function currentPath() {
  const h = window.location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = h.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(query)) };
}

export function useRoute() {
  const [loc, setLoc] = useState(currentPath);
  useEffect(() => {
    const onChange = () => {
      if (blocker && blocker() && window.location.hash !== lastHash) {
        if (!window.confirm(UNSAVED)) {
          window.history.pushState(null, '', lastHash || '#/');
          return;
        }
        blocker = null;
      }
      lastHash = window.location.hash;
      setLoc(currentPath());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    const onBeforeUnload = (e) => {
      if (blocker && blocker()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('hashchange', onChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);
  return loc;
}

/** Ταίριασμα διαδρομής, π.χ. match('/recipes/:id', '/recipes/5') → { id: '5' } */
export function match(pattern, path) {
  const p = pattern.split('/');
  const a = path.split('/');
  if (p.length !== a.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(a[i]);
    else if (p[i] !== a[i]) return null;
  }
  return params;
}
