/* Padel – Service Worker: macht die App installierbar und offline nutzbar. */
'use strict';

const VERSION = 'padel-v6';
const CORE = [
  './',
  'index.html',
  'style.css',
  'config.js',
  'logic.js',
  'courts.js',
  'app.js',
  'manifest.webmanifest',
  'icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'img/court.svg',
  'img/hero-score.svg',
  'img/hero-rank.svg',
  'img/hero-tour.svg',
  'img/hero-events.svg',
  'img/hero-courts.svg',
];

self.addEventListener('install', e => {
  // cache: 'reload' umgeht den Browser-Cache (GitHub Pages: 10 Minuten), sonst landen alte Dateien im neuen Speicher
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  // Nur eigene alte Versionen löschen – PokéDurak liegt auf derselben Seite
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('padel-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Mit Internet immer die neueste Version vom Server, ohne Netz (oder nach 4 s) aus dem Speicher
  e.respondWith(caches.open(VERSION).then(cache => {
    const network = fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    });
    network.catch(() => {});
    const fallback = () => cache.match(req, { ignoreSearch: true });
    const timeout = new Promise(res => setTimeout(res, 4000)).then(fallback);
    return Promise.race([network, timeout])
      .then(res => res || network)
      .catch(() => fallback().then(hit => hit || Response.error()));
  }));
});
