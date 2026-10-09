/* Padel – Service Worker: macht die App installierbar und offline nutzbar. */
'use strict';

const VERSION = 'padel-v1';
const CORE = [
  './',
  'index.html',
  'style.css',
  'logic.js',
  'app.js',
  'manifest.webmanifest',
  'icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
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

  // Sofort aus dem Speicher, im Hintergrund aktualisieren
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(req, { ignoreSearch: true });
    const update = fetch(req).then(res => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || update;
  }));
});
