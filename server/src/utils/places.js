'use strict';

/**
 * Place search on OpenStreetMap data through Photon (photon.komoot.io): free,
 * no key. Results are kept near Lagos/South-West Nigeria and cached, so the
 * free service is used lightly as its fair-use policy asks.
 */

const PHOTON = 'https://photon.komoot.io/api/';
const UA = 'WeekDeck/1.0 (weekly team slides for sales managers)';
// Lagos, Ogun and nearby: keeps "Ikeja" from matching somewhere else in the world.
const BBOX = '2.5,6.1,4.9,7.7';
const LAGOS = { lat: 6.5244, lon: 3.3792 };

const near = (lat, lon) =>
  Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : LAGOS;

/** "Ikeja City Mall · Alausa, Ikeja" from Photon's properties. */
function describe(props) {
  const p = props || {};
  const name = String(p.name || p.street || '').trim();
  const parts = [p.district, p.locality, p.city, p.county, p.state].map((x) => String(x || '').trim()).filter(Boolean);
  const area = [...new Set(parts)].filter((x) => x.toLowerCase() !== name.toLowerCase()).slice(0, 2).join(', ');
  return { name, area, kind: String(p.osm_value || p.type || '').replace(/_/g, ' ') };
}

/** Photon GeoJSON → [{name, area, kind, lat, lon}], duplicates removed. */
function readPhoton(data) {
  const out = [];
  const seen = new Set();
  for (const f of (data && data.features) || []) {
    const c = f && f.geometry && f.geometry.coordinates;
    if (!Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    const d = describe(f.properties);
    if (!d.name) continue;
    const key = `${d.name}|${d.area}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: d.name.slice(0, 80), area: d.area.slice(0, 80), kind: d.kind.slice(0, 40), lat: Math.round(c[1] * 1e6) / 1e6, lon: Math.round(c[0] * 1e6) / 1e6 });
  }
  return out;
}

function photonUrl(q, at, limit) {
  const params = new URLSearchParams({ q, limit: String(limit), lang: 'en', bbox: BBOX, lat: String(at.lat), lon: String(at.lon) });
  return `${PHOTON}?${params}`;
}

async function photonSearch(q, at, limit = 6) {
  const r = await fetch(photonUrl(q, at, limit), { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`photon ${r.status}`);
  return readPhoton(await r.json());
}

/** Web map tiles (x/y/z) must be whole numbers inside the zoom's grid. */
function validTile(z, x, y) {
  if (![z, x, y].every(Number.isInteger) || z < 1 || z > 18) return false;
  const n = 2 ** z;
  return x >= 0 && y >= 0 && x < n && y < n;
}

module.exports = { photonSearch, readPhoton, photonUrl, describe, near, validTile, LAGOS, UA };
