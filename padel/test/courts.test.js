// Tests für padel/courts.js – ausführen mit: node --test padel/test/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../courts.js');

const berlin = { lat: 52.5200, lng: 13.4050 };

test('Entfernung und Anzeige', () => {
  const hamburg = { lat: 53.5511, lng: 9.9937 };
  const d = C.distanceKm(berlin, hamburg);
  assert.ok(d > 250 && d < 260, String(d));
  assert.equal(C.fmtKm(0.234), '230 m');
  assert.equal(C.fmtKm(3.26), '3,3 km');
  assert.equal(C.fmtKm(25.4), '25 km');
});

test('OpenStreetMap: Courts werden zur Anlage zusammengefasst', () => {
  const json = {
    elements: [
      { type: 'way', id: 1, center: { lat: 52.5300, lon: 13.4100 }, tags: { leisure: 'sports_centre', sport: 'padel', name: 'Padel Club Mitte', 'addr:street': 'Hauptstr.', 'addr:housenumber': '5', 'addr:postcode': '10115', 'addr:city': 'Berlin', website: 'https://example.org' } },
      { type: 'way', id: 2, center: { lat: 52.5301, lon: 13.4101 }, tags: { leisure: 'pitch', sport: 'padel', covered: 'yes' } },
      { type: 'way', id: 3, center: { lat: 52.5302, lon: 13.4102 }, tags: { leisure: 'pitch', sport: 'padel' } },
      // zwei unbenannte Courts weit weg → eigene Gruppe
      { type: 'way', id: 4, center: { lat: 52.4000, lon: 13.3000 }, tags: { leisure: 'pitch', sport: 'padel' } },
      { type: 'way', id: 5, center: { lat: 52.4003, lon: 13.3002 }, tags: { leisure: 'pitch', sport: 'padel;tennis', name: 'Padel am See' } },
      { type: 'node', id: 6, tags: { sport: 'padel' } }, // ohne Koordinaten
    ],
  };
  const res = C.parseOverpass(json, berlin);
  assert.equal(res.length, 2);
  const club = res.find(r => r.name === 'Padel Club Mitte');
  assert.equal(club.courts, 2);
  assert.equal(club.indoor, true);
  assert.equal(club.address, 'Hauptstr. 5, 10115 Berlin');
  assert.equal(club.website, 'https://example.org');
  const lake = res.find(r => r.name === 'Padel am See');
  assert.equal(lake.courts, 2);
  assert.ok(lake.distance > 10);
});

test('Overpass-Abfrage enthält Radius und Mittelpunkt', () => {
  const q = C.overpassQuery(berlin, 7.5);
  assert.match(q, /around:7500,52\.52,13\.405/);
  assert.match(q, /"sport"~"padel"/);
});

test('Google Places: Antwort umwandeln, Shops aussortieren', async () => {
  let sent;
  const fakeFetch = async (url, opts) => {
    sent = { url, opts };
    return {
      ok: true,
      json: async () => ({
        places: [
          { id: 'abc', displayName: { text: 'Padel Arena' }, formattedAddress: 'Weg 1, Berlin', location: { latitude: 52.53, longitude: 13.41 }, rating: 4.6, userRatingCount: 120, currentOpeningHours: { openNow: true }, googleMapsUri: 'https://maps.google.com/?cid=1' },
          { id: 'def', displayName: { text: 'Padel Shop Berlin' }, location: { latitude: 52.52, longitude: 13.40 } },
        ],
      }),
    };
  };
  const res = await C.searchGoogle('KEY', berlin, 10, fakeFetch);
  assert.equal(sent.opts.headers['X-Goog-Api-Key'], 'KEY');
  assert.equal(JSON.parse(sent.opts.body).locationBias.circle.radius, 10000);
  assert.equal(res.length, 1);
  assert.deepEqual([res[0].name, res[0].rating, res[0].ratings, res[0].openNow], ['Padel Arena', 4.6, 120, true]);
  assert.match(C.routeUrl(res[0]), /destination_place_id=abc/);
});

test('Google-Fehler wird verständlich gemeldet', async () => {
  const fakeFetch = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'API key not valid' } }) });
  await assert.rejects(C.searchGoogle('X', berlin, 5, fakeFetch), /403.*API key not valid/);
});

test('Filtern und Sortieren', () => {
  const list = [
    { name: 'A', distance: 8, rating: 4.9, openNow: false, courts: 2 },
    { name: 'B', distance: 2, rating: 4.1, openNow: true, courts: 6 },
    { name: 'C', distance: 30, rating: 5, openNow: true, courts: 1 },
  ];
  assert.deepEqual(C.filterCourts(list, { radiusKm: 10, openNow: false }).map(c => c.name), ['A', 'B']);
  assert.deepEqual(C.filterCourts(list, { radiusKm: 50, openNow: true }).map(c => c.name), ['B', 'C']);
  assert.deepEqual(C.sortCourts(list, 'rating').map(c => c.name), ['C', 'A', 'B']);
  assert.deepEqual(C.sortCourts(list, 'courts').map(c => c.name), ['B', 'A', 'C']);
  assert.deepEqual(C.sortCourts(list, 'distance').map(c => c.name), ['B', 'A', 'C']);
});
