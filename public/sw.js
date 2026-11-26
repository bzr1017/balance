/*
 * Balance service worker – offline működés.
 * - Oldalbetöltés: hálózat először (így mindig a legfrissebb verzió jön, ha van net),
 *   offline esetén a gyorsítótárazott index.html.
 * - Egyéb saját fájlok (JS, CSS, ikonok): gyorsítótárból, ha megvan; különben letölti és elmenti.
 *   A Vite build fájlnevei tartalmazzák a hash-t, így egy új verzió új fájlneveket kap.
 * Az adatokat (mérések, dokumentumok) ez nem érinti – azok a böngésző tárhelyén vannak.
 */
const CACHE = 'balance-v1';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }),
    ),
  );
});
