const CACHE_NAME = 'lingua-static-v14';
const APP_FILES = ['./', './index.html', './app.js', './manifest.webmanifest', './icon.svg', './icon-180.png', './icon-192.png', './icon-512.png'];
const APP_URLS = APP_FILES.map(file => new URL(file, self.registration.scope).href);
const APP_PATHS = new Set(APP_URLS.map(url => new URL(url).pathname));
const INDEX_URL = new URL('./index.html', self.registration.scope).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('lingua-static-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin || !APP_PATHS.has(requestUrl.pathname)) return;

  const cacheKey = new URL(requestUrl.pathname, self.registration.scope).href;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, response.clone())).catch(() => {});
        }
        return response;
      }).catch(() => caches.match(INDEX_URL))
    );
    return;
  }

  event.respondWith(
    caches.match(cacheKey).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, response.clone())).catch(() => {});
        }
        return response;
      });
    })
  );
});
