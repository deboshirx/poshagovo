// Service worker для офлайн-режима.
// Статику отдаём из кэша, API — сначала сеть, при её отсутствии последний сохранённый ответ.
// Так открытая хотя бы раз инструкция проходится и без интернета (например, в подвале у деканата).

const CACHE = 'poshagovo-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(fallbackUrl || request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(fallbackUrl || request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'Нет соединения с интернетом' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    // личные данные не кэшируем
    if (url.pathname.startsWith('/api/auth') || url.pathname.includes('/stats')) return;
    event.respondWith(networkFirst(request));
  } else if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/'));
  } else {
    event.respondWith(cacheFirst(request));
  }
});
