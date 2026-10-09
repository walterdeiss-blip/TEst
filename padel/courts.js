/* Padel – Court-Suche: Anlagen in der Nähe über Google Places (mit API-Schlüssel)
   oder OpenStreetMap (ohne Schlüssel). Läuft im Browser (window.PadelCourts) und in Node (Tests). */
'use strict';

(function (root) {

  const OVERPASS = 'https://overpass-api.de/api/interpreter';
  const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  const PLACES = 'https://places.googleapis.com/v1/places:searchText';

  /* ---------- Rechnen ---------- */

  // Entfernung zweier Punkte in km (Haversine)
  function distanceKm(a, b) {
    const rad = x => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }

  const fmtKm = km => km < 1 ? `${Math.round(km * 1000 / 10) * 10} m` : `${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`;

  function sortCourts(list, by) {
    const cmp = {
      distance: (x, y) => x.distance - y.distance,
      rating: (x, y) => (y.rating || 0) - (x.rating || 0) || x.distance - y.distance,
      courts: (x, y) => (y.courts || 0) - (x.courts || 0) || x.distance - y.distance,
    }[by] || ((x, y) => x.distance - y.distance);
    return [...list].sort(cmp);
  }

  function filterCourts(list, { radiusKm, openNow }) {
    return list.filter(c => c.distance <= radiusKm && (!openNow || c.openNow === true));
  }

  /* ---------- OpenStreetMap ---------- */

  function overpassQuery(center, radiusKm) {
    const r = Math.round(radiusKm * 1000);
    const at = `(around:${r},${center.lat},${center.lng})`;
    return `[out:json][timeout:25];(nwr["sport"~"padel"]${at};nwr["leisure"="sports_centre"]["name"~"padel",i]${at};);out center tags;`;
  }

  // Einzelne Courts (oft ohne Namen eingetragen) werden zur Anlage in der Nähe zusammengefasst.
  function parseOverpass(json, center) {
    const items = (json.elements || []).map(el => {
      const t = el.tags || {};
      const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
      if (lat == null || lng == null) return null;
      const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
      const city = [t['addr:postcode'], t['addr:city']].filter(Boolean).join(' ');
      return {
        id: `osm-${el.type}-${el.id}`,
        name: t.name || '',
        lat, lng,
        isPitch: t.leisure === 'pitch',
        address: [street, city].filter(Boolean).join(', '),
        website: t.website || t['contact:website'] || '',
        phone: t.phone || t['contact:phone'] || '',
        indoor: t.covered === 'yes' || t.indoor === 'yes' || t.building === 'yes',
      };
    }).filter(Boolean);

    // Anlagen (Sportzentren, Clubs) übernehmen die Courts in bis zu 250 m Umkreis;
    // übrige Courts werden untereinander zu Gruppen (150 m) zusammengefasst.
    const sites = items.filter(it => !it.isPitch).map(it => ({ ...it, courts: 0 }));
    for (const pitch of items.filter(it => it.isPitch)) {
      const nearest = (list, maxKm) => list
        .map(s => ({ s, d: distanceKm(s, pitch) }))
        .filter(x => x.d <= maxKm)
        .sort((x, y) => x.d - y.d)[0]?.s;
      const site = nearest(sites.filter(s => !s.group), 0.25) || nearest(sites.filter(s => s.group), 0.15);
      if (site) {
        site.courts++;
        site.indoor = site.indoor || pitch.indoor;
        site.name = site.name || pitch.name;
        site.address = site.address || pitch.address;
      } else {
        sites.push({ ...pitch, courts: 1, group: true });
      }
    }
    return sites.map(s => ({
      id: s.id, source: 'osm', name: s.name || 'Padel-Courts', lat: s.lat, lng: s.lng,
      address: s.address, website: s.website, phone: s.phone, courts: s.courts || null, indoor: s.indoor,
      rating: null, ratings: null, openNow: null,
      distance: distanceKm(center, s),
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.name ? `${s.name} ${s.address}` : `${s.lat},${s.lng}`)}`,
    }));
  }

  async function searchOsm(center, radiusKm, fetchFn = fetch) {
    const res = await fetchFn(OVERPASS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(overpassQuery(center, radiusKm)),
    });
    if (!res.ok) throw new Error('OpenStreetMap antwortet gerade nicht (' + res.status + ')');
    return parseOverpass(await res.json(), center);
  }

  async function geocodeOsm(text, fetchFn = fetch) {
    const url = `${NOMINATIM}?format=jsonv2&limit=1&accept-language=de&q=${encodeURIComponent(text)}`;
    const res = await fetchFn(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('Ortssuche nicht erreichbar');
    const [hit] = await res.json();
    if (!hit) return null;
    return { lat: +hit.lat, lng: +hit.lon, label: hit.display_name.split(',').slice(0, 2).join(',') };
  }

  /* ---------- Google Places (API „Places API (New)“) ---------- */

  const FIELDS = ['places.id', 'places.displayName', 'places.formattedAddress', 'places.location', 'places.rating',
    'places.userRatingCount', 'places.currentOpeningHours.openNow', 'places.googleMapsUri', 'places.websiteUri',
    'places.nationalPhoneNumber'].join(',');

  function parsePlaces(json, center) {
    return (json.places || []).map(p => {
      const lat = p.location?.latitude, lng = p.location?.longitude;
      return {
        id: 'g-' + p.id, placeId: p.id, source: 'google',
        name: p.displayName?.text || 'Padel', lat, lng,
        address: p.formattedAddress || '', website: p.websiteUri || '', phone: p.nationalPhoneNumber || '',
        rating: p.rating ?? null, ratings: p.userRatingCount ?? null,
        openNow: p.currentOpeningHours?.openNow ?? null, courts: null, indoor: false,
        distance: lat == null ? Infinity : distanceKm(center, { lat, lng }),
        mapsUrl: p.googleMapsUri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.displayName?.text || 'Padel')}&query_place_id=${p.id}`,
      };
    });
  }

  async function placesRequest(key, body, fields, fetchFn) {
    const res = await fetchFn(PLACES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': fields },
      body: JSON.stringify({ languageCode: 'de', ...body }),
    });
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).error?.message || ''; } catch (e) { /* egal */ }
      throw new Error(`Google-Suche fehlgeschlagen (${res.status})${msg ? ': ' + msg : ''}`);
    }
    return res.json();
  }

  async function searchGoogle(key, center, radiusKm, fetchFn = fetch) {
    const json = await placesRequest(key, {
      textQuery: 'Padel',
      maxResultCount: 20,
      locationBias: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: Math.min(50000, radiusKm * 1000) } },
    }, FIELDS, fetchFn);
    // Google liefert auch Tennis-/Sportgeschäfte – nur Treffer mit Padel im Namen oder ohne Shop-Bezug behalten
    return parsePlaces(json, center).filter(c => !/shop|store|laden|outlet/i.test(c.name));
  }

  async function geocodeGoogle(key, text, fetchFn = fetch) {
    const json = await placesRequest(key, { textQuery: text, maxResultCount: 1 },
      'places.location,places.formattedAddress', fetchFn);
    const p = json.places?.[0];
    if (!p) return null;
    return { lat: p.location.latitude, lng: p.location.longitude, label: p.formattedAddress };
  }

  /* ---------- Links ---------- */

  const routeUrl = c => `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}` +
    (c.placeId ? `&destination_place_id=${c.placeId}` : '');
  const googleMapsSearchUrl = center => `https://www.google.com/maps/search/padel/@${center.lat},${center.lng},12z`;
  const embedUrl = (key, center, court) => court?.placeId
    ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=place_id:${court.placeId}&language=de`
    : `https://www.google.com/maps/embed/v1/search?key=${encodeURIComponent(key)}&q=padel&center=${center.lat},${center.lng}&zoom=12&language=de`;

  root.PadelCourts = {
    distanceKm, fmtKm, sortCourts, filterCourts, overpassQuery, parseOverpass, searchOsm, geocodeOsm,
    parsePlaces, searchGoogle, geocodeGoogle, routeUrl, googleMapsSearchUrl, embedUrl,
  };
  if (typeof module !== 'undefined') module.exports = root.PadelCourts;
})(typeof window !== 'undefined' ? window : globalThis);
