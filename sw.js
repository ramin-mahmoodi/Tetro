/* ==========================================================================
   TETRO SERVICE WORKER
   Caches static assets for offline capability and instant loading
   ========================================================================== */

const CACHE_NAME = 'tetro-pwa-v20';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/tokens.css?v=5',
  './css/themes.css?v=5',
  './css/layout.css?v=5',
  './css/components.css?v=5',
  './css/chart.css?v=5',
  './css/phosphor.css',
  './assets/fonts/Phosphor.woff2',
  './js/theme-engine.js',
  './js/data-adapter.js?v=10',
  './js/chart-engine.js?v=6',
  './js/ui-renderer.js?v=9',
  './js/app.js?v=9',
  './assets/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-192.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching static assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Clearing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Network-First for HTML navigation, market.json, and manifest.json
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('market.json') || url.pathname.endsWith('manifest.json')) {
    // Normalize cache key without query parameters (prevents unbounded memory leak on ?v=timestamp)
    const cleanUrl = url.origin + url.pathname;
    const cleanRequest = new Request(cleanUrl);

    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(cleanRequest, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(cleanRequest).then((cached) => {
            return cached || caches.match(event.request).then((fallback) => {
              return fallback || new Response('Offline', { status: 503, statusText: 'Offline' });
            });
          });
        })
    );
    return;
  }

  // Stale-While-Revalidate for other static assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch((err) => {
        console.log('[SW] Network fetch failed, serving cached if available');
        return null;
      });

      return cachedResponse || fetchPromise.then(res => res || new Response('Offline', { status: 503, statusText: 'Offline' }));
    })
  );
});
