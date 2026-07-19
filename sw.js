const CACHE = 'mdwnh-lib-v19';
const ASSETS = [
  './',
  './index.html',
  './schedule.css',
  './schedule.js',
  './library.css',
  './library.js',
  './members.json',
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
    /\.(html|js|css|json|webmanifest)$/.test(url.pathname) ||
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

/* ==========================================================================
   Web Push — payloads are sent by .github/workflows/reminders.yml
   ========================================================================== */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }

  const title = d.title || 'مكتبة المدوّنة';
  const opts = {
    body: d.body || '',
    icon: d.icon || './assets/icon-192.png',
    badge: './assets/icon-192.png',
    image: d.image || undefined,          // the member's avatar
    tag: d.tag || 'mdwnh-task',
    renotify: true,
    dir: 'rtl',
    lang: 'ar',
    data: { url: d.url || './' },
    vibrate: [90, 50, 90],
    requireInteraction: !!d.urgent
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.location.href).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
