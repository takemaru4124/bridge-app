// sw.js - network-first Service Worker
const CACHE_NAME = 'bridge-app-v1';

const PRECACHE_URLS = [
  './',
  './bridge_inspection_app.html',
  './js/app.js',
  './js/pdfjs.min.js',
  './css/style.css',
  './manifest.json',
  './icon-192.png',
];

// インストール：主要ファイルを事前キャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// アクティベート：古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// フェッチ：network-first（オフライン時はキャッシュにフォールバック）
self.addEventListener('fetch', event => {
  // GET以外・chrome-extension・外部URLはスキップ
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // 正常レスポンスはキャッシュに保存してから返す
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // オフライン時はキャッシュから返す
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // キャッシュにもない場合はHTMLを返す（SPAフォールバック）
          return caches.match('./bridge_inspection_app.html');
        });
      })
  );
});
