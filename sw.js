/* PokéDurak – Service Worker: macht das Spiel installierbar und offline spielbar. */
'use strict';

const VERSION = 'pokedurak-v12';
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
      .then(keys => Promise.all(keys.filter(k => k.startsWith('pokedurak-v') && k !== VERSION).map(k => caches.delete(k))))
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

  // Eigene Dateien: immer zuerst die neueste Version aus dem Netz holen
  // (damit alle Mitspieler dieselbe Version haben), ohne Internet aus dem Speicher.
  // Die Padel-App im Unterordner hat ihren eigenen Service Worker.
  if (url.origin === self.location.origin && !url.pathname.includes('/padel/')) {
    e.respondWith(caches.open(VERSION).then(async cache => {
      try {
        const res = await withTimeout(fetch(req, { cache: 'no-cache' }), 4000);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        const hit = await cache.match(req, { ignoreSearch: true });
        return hit || Response.error();
      }
    }));
  }
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}
