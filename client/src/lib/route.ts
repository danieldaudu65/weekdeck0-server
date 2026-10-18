/**
 * Route helpers for the week's stops: distances, a sensible visiting order,
 * and a Google Maps directions link (opens the phone's Maps app, with live
 * traffic, for free).
 */
import type { DayKey } from './types';

export interface Stop {
  day: DayKey;
  name: string;
  label: string;
  lat: number;
  lon: number;
}

/** One colour per day, used on the map, the legend and the map slide. */
export const DAY_COLORS: Record<DayKey, string> = { mon: '2563EB', tue: '16A34A', wed: 'EA580C', thu: '9333EA', fri: 'DC2626' };

/** Straight-line distance in km. */
export function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Road distance is usually ~1.35× the straight line in Lagos. */
export const ROAD_FACTOR = 1.35;

export function routeKm(stops: { lat: number; lon: number }[]): number {
  let total = 0;
  for (let i = 1; i < stops.length; i++) total += km(stops[i - 1], stops[i]);
  return total * ROAD_FACTOR;
}

/**
 * A short visiting order: start where the plan starts, go to the nearest
 * next stop, then untangle crossings (2-opt). Good for the few stops a day has.
 */
export function bestOrder<T extends { lat: number; lon: number }>(stops: T[]): T[] {
  if (stops.length < 3) return stops.slice();
  const left = stops.slice(1);
  const order = [stops[0]];
  while (left.length) {
    const last = order[order.length - 1];
    let bi = 0;
    for (let i = 1; i < left.length; i++) if (km(last, left[i]) < km(last, left[bi])) bi = i;
    order.push(left.splice(bi, 1)[0]);
  }
  let improved = true;
  for (let pass = 0; improved && pass < 20; pass++) {
    improved = false;
    for (let i = 1; i < order.length - 2; i++)
      for (let j = i + 1; j < order.length - 1; j++) {
        const before = km(order[i - 1], order[i]) + km(order[j], order[j + 1]);
        const after = km(order[i - 1], order[j]) + km(order[i], order[j + 1]);
        if (after + 1e-9 < before) {
          order.splice(i, j - i + 1, ...order.slice(i, j + 1).reverse());
          improved = true;
        }
      }
  }
  return order;
}

/** Google Maps directions through the stops, in order (driving). Works on phones and computers. */
export function googleMapsUrl(stops: { lat: number; lon: number }[]): string {
  if (!stops.length) return 'https://www.google.com/maps';
  const p = (s: { lat: number; lon: number }) => `${s.lat.toFixed(6)},${s.lon.toFixed(6)}`;
  if (stops.length === 1) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p(stops[0]))}`;
  const params = new URLSearchParams({ api: '1', origin: p(stops[0]), destination: p(stops[stops.length - 1]), travelmode: 'driving' });
  const mid = stops.slice(1, -1).slice(0, 9); // Google allows up to 9 stops in between on links
  if (mid.length) params.set('waypoints', mid.map(p).join('|'));
  return `https://www.google.com/maps/dir/?${params}`;
}

/** Rough driving time in Lagos (≈18 km/h average with traffic), for planning only. */
export const roughMinutes = (kmRoad: number) => Math.round((kmRoad / 18) * 60);
