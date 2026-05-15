const CACHE_NAME = 'bridge-app-v5';
const FILES = [
  './bridge_inspection_app.html',
  './css/style.css',
  './js/pdfjs.min.js',
  './js/jszip.min.js',
  './js/app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // キャッシュ優先：キャッシュにあれば即返す、バックグラウンドで更新
  // Wi-FiがOFFでもPWA起動できる
  e.respondWith(
    caches.match(e.request).then(cached => {
      const networkFetch = fetch(e.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      }).catch(() => cached);

      return cached || networkFetch;
    })
  );
});
