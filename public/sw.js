const CACHE = 'legouin-shell-v1';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

async function precache() {
  const cache = await caches.open(CACHE);
  const response = await fetch('/', { cache: 'reload' });
  await cache.put('/', response.clone());
  const html = await response.text();
  const assets = new Set(['/manifest.webmanifest', '/icons/icon-192.png', '/icons/apple-touch-icon.png', '/houseboat/bateau-maison-deluxe-25.jpg', '/pourvoirie/logo.png']);
  for (const match of html.matchAll(/["'(](\/_next\/static\/[^"'()\s\\]+)/g)) assets.add(match[1]);
  await Promise.all([...assets].map((url) => cache.add(url).catch(() => undefined)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, fallbackKey) {
  const cache = await caches.open(CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000)),
    ]);
    if (response.ok) cache.put(fallbackKey, response.clone());
    return response;
  } catch {
    return (await cache.match(fallbackKey)) || (await cache.match('/')) || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const update = fetch(request)
    .then((response) => {
      if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await update) || Response.error();
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/'));
  } else if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});
