const CACHE = 'mdwnh-lib-v18';
const ASSETS = [
  './',
  './index.html',
  './schedule.css',
  './schedule.js',
  './Paper_Task_Complete.mp3',
  './manifest.webmanifest',
  './assets/brand-logo.svg',
  './assets/badr-bg.png',
  './assets/badr-logo.png',
  './assets/paper.png',
  './assets/favicon.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable.png',
  './assets/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Network-first for pages/code so new deploys show up without a hard refresh;
// fall back to cache only when offline. Assets (images/fonts/audio) stay
// cache-first for speed.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  const isPage = e.request.mode === 'navigate' ||
    /\.(html|js|css|webmanifest)$/.test(url.pathname) ||
    url.pathname === '/' || url.pathname.endsWith('/');

  if (isPage) {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
      if (res && res.status === 200) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
      }
      return res;
    }).catch(() => cached))
  );
});
