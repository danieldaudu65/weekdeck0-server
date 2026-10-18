/**
 * Where the team goes each day: exact pins picked from the place search,
 * plus place names written in the activities ("at Ikeja City Mall"), looked
 * up on the map. Shared by the map, the map slide and Present mode.
 */
import { useEffect, useState } from 'react';
import { extractPlaces, splitActivities } from './suggest';
import { geocode, regionCenter, LAGOS, type LatLon } from './places';
import type { Stop } from './route';
import { DAYS, type Week } from './types';

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Place names mentioned for each day, in the order written. */
export function mentionedPlaces(week: Week): { day: (typeof DAYS)[number]; name: string }[] {
  const out: { day: (typeof DAYS)[number]; name: string }[] = [];
  for (const d of DAYS) {
    const text = week.activities[d] || '';
    const seen = new Set<string>();
    // Exact pins first, in the order they appear in the text.
    const pins = (week.places ?? []).filter((p) => p.day === d && norm(text).includes(norm(p.name)));
    const mentioned = splitActivities(text).flatMap((line) => extractPlaces(line));
    const all = [...pins.map((p) => ({ name: p.name, at: norm(text).indexOf(norm(p.name)) })), ...mentioned.map((n) => ({ name: n, at: norm(text).indexOf(norm(n)) }))].sort((a, b) => a.at - b.at);
    for (const p of all) {
      const k = norm(p.name);
      // Skip a name that's part of an exact pin already listed ("Ikeja" inside "Ikeja City Mall").
      if (seen.has(k) || [...seen].some((s) => s.includes(k) || k.includes(s))) continue;
      seen.add(k);
      out.push({ day: d, name: p.name });
    }
  }
  return out;
}

/** The week's stops with coordinates (looked up once and remembered). */
export function useWeekStops(week: Week | null, region: string, auth?: string) {
  const [stops, setStops] = useState<Stop[]>([]);
  const [center, setCenter] = useState<LatLon>(LAGOS);
  const [doneKey, setDoneKey] = useState<string | null>(null);
  const key = week ? JSON.stringify([DAYS.map((d) => week.activities[d]), week.places ?? []]) : '';

  useEffect(() => {
    if (!week) return;
    let alive = true;
    const run = async () => {
      const c = await regionCenter(region, auth).catch(() => LAGOS);
      if (alive) setCenter(c);
      const wanted = mentionedPlaces(week);
      const exact = new Map((week.places ?? []).map((p) => [`${p.day}|${norm(p.name)}`, p]));
      const lookup = wanted.filter((w) => !exact.has(`${w.day}|${norm(w.name)}`)).map((w) => w.name);
      const found = lookup.length ? await geocode(lookup, c, region, auth).catch(() => ({}) as Record<string, null>) : {};
      const out: Stop[] = [];
      for (const w of wanted) {
        const pin = exact.get(`${w.day}|${norm(w.name)}`);
        if (pin) out.push({ day: w.day, name: pin.name, label: pin.name, lat: pin.lat, lon: pin.lon });
        else {
          const g = found[w.name];
          if (g) out.push({ day: w.day, name: w.name, label: g.label, lat: g.lat, lon: g.lon });
        }
      }
      if (alive) setStops(out);
    };
    // Wait until typing pauses, so half-typed names aren't looked up.
    const timer = window.setTimeout(() => {
      run()
        .catch(() => undefined)
        .finally(() => alive && setDoneKey(key));
    }, 900);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, region, auth]);

  // Still working until the current text has been looked up (true from the very first render).
  const loading = Boolean(week) && doneKey !== key;
  return { stops, center, loading };
}
