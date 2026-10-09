// Network-first service worker: always fresh when online, works offline from cache.
const CACHE = 'qdiary-v6';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/util.js', 'js/icons.js', 'js/store.js', 'js/theme.js', 'js/media.js', 'js/journal.js', 'js/views.js', 'js/transfer.js', 'js/pdf.js', 'js/settings.js', 'js/app.js', 'icon.svg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || e.request.url.startsWith('blob:')) return;
  const url = new URL(e.request.url);
  if (url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com') {
    e.respondWith(caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok || r.type === 'opaque') { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
