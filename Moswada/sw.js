// مدير التصوير — Service Worker
const CACHE        = 'musawwir-v14';
const STATIC_CACHE = 'musawwir-static-v14';

// Static assets that rarely change — cache-first
const STATIC_ASSETS = [
  '/fonts/Salma-Light.otf',
  '/fonts/Salma-Regular.otf',
  '/fonts/Salma-Medium.otf',
  '/fonts/Salma-Bold.otf',
  '/icon-192.png',
  '/icon-512.png',
];

// ── Install: cache static assets only ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: remove old caches ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== 'musawwir-v14' && k !== 'musawwir-static-v14')
            .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch ──
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  if (e.request.method !== 'GET') return;

  // Skip Firebase / Google requests entirely
  if (url.hostname.includes('googleapis.com') ||
      url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('identitytoolkit.googleapis.com') ||
      url.hostname.includes('gstatic.com') ||
      url.hostname.includes('google.com') ||
      url.hostname.includes('sheetjs.com')) {
    return;
  }

  // Skip Firebase auth handler — must never be cached (OAuth state is in URL fragment)
  if (url.pathname.startsWith('/__/auth/')) return;

  // ── Static assets (fonts, icons) → cache-first ──
  if (STATIC_ASSETS.some(a => url.pathname === a)) {
    e.respondWith(
      caches.open(STATIC_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(res => {
            if (res && res.status === 200) cache.put(e.request, res.clone());
            return res;
          });
        })
      )
    );
    return;
  }

  // ── HTML / JS / everything else → network-first ──
  // Always fetch fresh from network; fall back to cache only when offline
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200 && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(cached => cached ||
        (e.request.mode === 'navigate' ? caches.match('/index.html') : undefined)
      ))
  );
});
