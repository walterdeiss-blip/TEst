/* PokéDurak – Service Worker: macht das Spiel installierbar und offline spielbar. */
'use strict';

const VERSION = 'pokedurak-v9';
const CORE = [
  './',
  'index.html',
  'style.css',
  'game.js',
  'music.js',
  'manifest.webmanifest',
  'icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'vendor/peerjs.min.js',
];
const IMG_CACHE = 'pokedurak-bilder';
const IMG_HOST = 'raw.githubusercontent.com';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== IMG_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pokémon-Bilder: einmal laden, danach aus dem Speicher
  if (url.hostname === IMG_HOST) {
    e.respondWith(caches.open(IMG_CACHE).then(async cache => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    }));
    return;
  }

  // Eigene Dateien: sofort aus dem Speicher, im Hintergrund aktualisieren
  if (url.origin === self.location.origin) {
    e.respondWith(caches.open(VERSION).then(async cache => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const update = fetch(req).then(res => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => hit);
      return hit || update;
    }));
  }
});
