import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Loader2, MapPin, Route, Shuffle } from 'lucide-react';
import type { Map as LMap, LayerGroup } from 'leaflet';
import { DAY_COLORS, bestOrder, googleMapsUrl, roughMinutes, routeKm, type Stop } from '../lib/route';
import type { LatLon } from '../lib/places';
import { DAYS, DAY_LONG, DAY_SHORT, type DayKey } from '../lib/types';

/**
 * The week on a map: each day's stops in its colour, the route between them,
 * a shorter order when it helps, and a button that opens the day in Google
 * Maps (with live traffic) on the phone.
 */
export function WeekMap({ stops, center, loading }: { stops: Stop[]; center: LatLon; loading: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const L = useRef<typeof import('leaflet') | null>(null);
  const [ready, setReady] = useState(false);
  const daysWith = DAYS.filter((d) => stops.some((s) => s.day === d));
  const [day, setDay] = useState<DayKey | 'all'>('all');
  const [smart, setSmart] = useState(false);

  const routes = useMemo(() => {
    const out = {} as Record<DayKey, Stop[]>;
    for (const d of DAYS) {
      const list = stops.filter((s) => s.day === d);
      out[d] = smart ? bestOrder(list) : list;
    }
    return out;
  }, [stops, smart]);

  // Create the map once (Leaflet loads only when this card is shown).
  useEffect(() => {
    let alive = true;
    (async () => {
      const [leaflet] = await Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]);
      if (!alive || !el.current || map.current) return;
      L.current = leaflet;
      const m = leaflet.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([center.lat, center.lon], 12);
      leaflet
        .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' })
        .addTo(m);
      layer.current = leaflet.layerGroup().addTo(m);
      map.current = m;
      setReady(true);
    })();
    return () => {
      alive = false;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw pins and routes.
  useEffect(() => {
    const leaflet = L.current;
    const m = map.current;
    if (!ready || !leaflet || !m || !layer.current) return;
    layer.current.clearLayers();
    const shown = day === 'all' ? daysWith : [day];
    const pts: [number, number][] = [];
    for (const d of shown) {
      const list = routes[d];
      const color = `#${DAY_COLORS[d]}`;
      if (list.length > 1) leaflet.polyline(list.map((s) => [s.lat, s.lon] as [number, number]), { color, weight: 4, dashArray: '8 8', opacity: 0.9 }).addTo(layer.current);
      list.forEach((s, i) => {
        pts.push([s.lat, s.lon]);
        const icon = leaflet.divIcon({
          className: '',
          html: `<div style="width:30px;height:30px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);color:#fff;font:700 13px/24px Arial;text-align:center">${i + 1}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        leaflet
          .marker([s.lat, s.lon], { icon, title: s.name })
          .bindPopup(`<b>${DAY_LONG[d]} · ${i + 1}</b><br>${s.label.replace(/</g, '&lt;')}`)
          .addTo(layer.current!);
      });
    }
    if (pts.length === 1) m.setView(pts[0], 14);
    else if (pts.length > 1) m.fitBounds(leaflet.latLngBounds(pts), { padding: [36, 36], maxZoom: 15 });
    else m.setView([center.lat, center.lon], 12);
  }, [ready, routes, day, daysWith.join(), center.lat, center.lon]); // eslint-disable-line react-hooks/exhaustive-deps

  const shownDays = day === 'all' ? daysWith : [day];

  return (
    <div className="overflow-hidden rounded-card border border-line bg-white">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line p-3">
        <button type="button" onClick={() => setDay('all')} aria-pressed={day === 'all'} className={`h-8 rounded-full px-3 text-xs font-bold ${day === 'all' ? 'bg-ink text-white' : 'bg-paper'}`}>
          All week
        </button>
        {daysWith.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDay(d)}
            aria-pressed={day === d}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${day === d ? 'bg-ink text-white' : 'bg-paper'}`}
          >
            <span className="size-2.5 rounded-full" style={{ background: `#${DAY_COLORS[d]}` }} /> {DAY_SHORT[d]}
          </button>
        ))}
        <button type="button" onClick={() => setSmart((v) => !v)} aria-pressed={smart} className={`ml-auto inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${smart ? 'bg-blue text-white' : 'bg-blue-soft text-blue'}`}>
          <Shuffle className="size-3.5" aria-hidden /> {smart ? 'Shortest order' : 'Find shortest order'}
        </button>
      </div>

      <div className="relative">
        <div ref={el} className="h-[300px] w-full md:h-[380px]" />
        {(loading || !ready) && (
          <span className="absolute left-3 top-3 z-[500] inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold shadow">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Finding places…
          </span>
        )}
        {!loading && ready && !stops.length && (
          <div className="absolute inset-0 z-[500] grid place-items-center bg-white/70 p-6 text-center">
            <p className="max-w-xs text-sm font-semibold text-muted">
              <MapPin className="mx-auto mb-2 size-6 text-blue" aria-hidden />
              Write places in the activities, like <b>“Market storm at Ikeja City Mall”</b>. Type “at …” and pick a real place for an exact pin.
            </p>
          </div>
        )}
      </div>

      {shownDays.length > 0 && (
        <div className="divide-y divide-line">
          {shownDays.map((d) => {
            const list = routes[d];
            const distance = routeKm(list);
            return (
              <div key={d} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-extrabold">
                    <span className="size-2.5 rounded-full" style={{ background: `#${DAY_COLORS[d]}` }} /> {DAY_LONG[d]}
                    {list.length > 1 && (
                      <span className="font-semibold text-muted">
                        · ~{Math.round(distance)} km · ~{roughMinutes(distance)} min drive
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted">{list.map((s, i) => `${i + 1}. ${s.name}`).join('  →  ')}</p>
                </div>
                <a
                  href={googleMapsUrl(list)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3.5 text-xs font-extrabold text-white active:scale-95"
                >
                  <Route className="size-3.5" aria-hidden /> Open in Google Maps <ExternalLink className="size-3" aria-hidden />
                </a>
              </div>
            );
          })}
          <p className="px-4 py-2 text-[11px] text-muted">Distances are estimates. Google Maps shows live Lagos traffic when you open the route.</p>
        </div>
      )}
    </div>
  );
}
