var CACHE = 'sport-timer-v20';
var SHELL = [
  '/Claude-TestApp/',
  '/Claude-TestApp/index.html',
  '/Claude-TestApp/style.css?v=20',
  '/Claude-TestApp/app.js?v=20',
  '/Claude-TestApp/manifest.json',
  '/Claude-TestApp/icons/icon-192.png',
  '/Claude-TestApp/icons/icon-512.png'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) { return c.addAll(SHELL); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).then(function(res) {
        if (res.ok && e.request.method === 'GET') {
          var clone = res.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
        }
        return res;
      });
    })
  );
});
