// Service worker: γρήγορο άνοιγμα της εφαρμογής από την αρχική οθόνη και φιλικό μήνυμα όταν δεν
// υπάρχει σύνδεση. ΠΟΤΕ δεν αποθηκεύει δεδομένα (/api): οι τιμές και τα κοστολόγια έρχονται πάντα από τον server.
const SHELL = 'shell-v1';
const ASSETS = 'assets-v1';
const MAX_ASSETS = 60;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon.svg', '/apple-touch-icon.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Σελίδα της εφαρμογής: πρώτα από το δίκτυο (πάντα η νεότερη έκδοση), αλλιώς από την αποθήκη.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/')),
    );
    return;
  }

  // Αρχεία με hash στο όνομα (δεν αλλάζουν ποτέ): πρώτα από την αποθήκη.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches
                .open(ASSETS)
                .then((c) => c.put(req, copy))
                .then(() => trim(ASSETS, MAX_ASSETS));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Υπόλοιπα στατικά (εικονίδια κ.λπ.): άμεσα από την αποθήκη και ανανέωση στο παρασκήνιο.
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    }),
  );
});
