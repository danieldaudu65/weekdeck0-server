/**
 * Real places (OpenStreetMap, via our server): search while typing, and
 * coordinates for place names written in activities. Free, no key.
 */
import { api } from './api';

export interface FoundPlace {
  name: string;
  area: string;
  kind: string;
  lat: number;
  lon: number;
}
export interface LatLon {
  lat: number;
  lon: number;
}

export const LAGOS: LatLon = { lat: 6.5244, lon: 3.3792 };

/** `auth` = a region head's token; leave empty for the team's own login. */
const headers = (auth?: string): HeadersInit | undefined => (auth ? { Authorization: `Bearer ${auth}` } : undefined);

export async function searchPlaces(q: string, near: LatLon, signal?: AbortSignal): Promise<FoundPlace[]> {
  const r = await api<{ places: FoundPlace[] }>(`/api/places/search?q=${encodeURIComponent(q)}&lat=${near.lat}&lon=${near.lon}`, { signal });
  return r.places;
}

const geoMemo = new Map<string, { label: string; lat: number; lon: number } | null>();

/** Coordinates for names like "Ikeja City Mall" (null when not found). Remembered for the session. */
export async function geocode(names: string[], near: LatLon, context: string, auth?: string) {
  const out: Record<string, { label: string; lat: number; lon: number } | null> = {};
  const ask = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 3))].filter((n) => {
    const k = `${n}|${context}`.toLowerCase();
    if (geoMemo.has(k)) {
      out[n] = geoMemo.get(k)!;
      return false;
    }
    return true;
  });
  for (let i = 0; i < ask.length; i += 25) {
    const batch = ask.slice(i, i + 25);
    const r = await api<{ places: Record<string, { label: string; lat: number; lon: number }> }>('/api/places/geocode', {
      method: 'POST',
      headers: headers(auth),
      body: JSON.stringify({ names: batch, lat: near.lat, lon: near.lon, context }),
    });
    for (const n of batch) {
      const hit = r.places[n] ?? null;
      geoMemo.set(`${n}|${context}`.toLowerCase(), hit);
      out[n] = hit;
    }
  }
  return out;
}

const centerMemo = new Map<string, LatLon>();

/** The middle of the team's region (e.g. "Fagba"), to show nearby places first. Lagos if unknown. */
export async function regionCenter(region: string, auth?: string): Promise<LatLon> {
  const key = region.trim().toLowerCase();
  if (!key) return LAGOS;
  if (centerMemo.has(key)) return centerMemo.get(key)!;
  try {
    const stored = localStorage.getItem(`weekdeck.center.${key}`);
    if (stored) {
      const c = JSON.parse(stored) as LatLon;
      centerMemo.set(key, c);
      return c;
    }
  } catch {
    /* ignore */
  }
  const r = await geocode([`${region} Lagos`], LAGOS, '', auth).catch(() => ({}) as Record<string, null>);
  const hit = Object.values(r)[0];
  const c = hit ? { lat: hit.lat, lon: hit.lon } : LAGOS;
  centerMemo.set(key, c);
  try {
    if (hit) localStorage.setItem(`weekdeck.center.${key}`, JSON.stringify(c));
  } catch {
    /* ignore */
  }
  return c;
}
