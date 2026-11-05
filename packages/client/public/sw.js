// Service worker mínimo: acelera la carga de recursos estáticos. NO cachea /api ni /ws (el juego siempre necesita servidor).
const CACHE = 'pg-static-v1';
const SHELL = ['/', '/styles.css', '/js/main.js', '/favicon.svg', '/assets/cards/reverso.svg', '/assets/cards/joker.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api') || u.pathname === '/ws') return;
  const isAsset = u.pathname.startsWith('/assets/');
  e.respondWith(isAsset
    ? caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }))
    : fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request)));
});
