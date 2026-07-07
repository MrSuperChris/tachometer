const CACHE = 'tachometer-v1';
const ASSETS = [
  '.',
  'index.html',
  'style.css',
  'icon.svg',
  'manifest.json',
  'js/app.js',
  'js/ppg.js',
  'js/gauge.js',
  'js/tasks.js',
  'js/bodyscan.js',
  'js/store.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// network-first, cache fallback — updates flow through when online, app works offline
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
