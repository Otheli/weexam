// Service worker Weexam: cache-first agar bisa dipakai offline sepenuhnya.
const V = 'weexam-__VERSION__';
const CORE = ['./', 'index.html', 'app.js', 'app.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('weexam-') && k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/downloads/') || url.pathname.endsWith('/config.js')) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(V).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error())),
    ),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const href = (e.notification.data && e.notification.data.href) || '#/ujian';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.postMessage({ type: 'open', href });
          return c.focus();
        }
      }
      return self.clients.openWindow('./' + href);
    }),
  );
});
