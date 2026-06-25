const CACHE = 'aura-v1';
const STATIC = ['/'];

// Install: pre-cache shell
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for API/Firebase, cache-first for images and static assets
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Skip non-GET, chrome-extension, and Firebase/Firestore traffic
  if (e.request.method !== 'GET') return;
  if (url.hostname.includes('firestore.googleapis.com') || url.hostname.includes('identitytoolkit')) return;
  if (url.protocol === 'chrome-extension:') return;

  // Images: cache-first with network fallback
  if (e.request.destination === 'image') {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        try {
          const res = await fetch(e.request);
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        } catch { return cached || new Response('', { status: 503 }); }
      })
    );
    return;
  }

  // App shell (same-origin): stale-while-revalidate
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        const fresh = fetch(e.request).then(res => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => null);
        return cached || fresh;
      })
    );
  }
});
