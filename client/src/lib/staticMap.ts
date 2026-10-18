/**
 * Draws a map picture of the week's stops (for the map slide and PowerPoint):
 * OpenStreetMap tiles through our server, each day's route in its colour, and
 * numbered pins. Runs in the browser; returns a JPEG data URL.
 */
import { apiUrl, getToken } from './api';
import { DAY_COLORS, type Stop } from './route';
import { DAYS } from './types';

const TILE = 256;

function project(lat: number, lon: number, z: number) {
  const scale = TILE * 2 ** z;
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * scale, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale };
}

/** The closest zoom that fits every stop with some room around it. */
export function fitZoom(stops: { lat: number; lon: number }[], w: number, h: number, pad = 90): number {
  for (let z = 16; z >= 6; z--) {
    const pts = stops.map((s) => project(s.lat, s.lon, z));
    const spanX = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
    const spanY = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
    if (spanX <= w - pad * 2 && spanY <= h - pad * 2) return Math.min(z, 15);
  }
  return 6;
}

async function loadTile(z: number, x: number, y: number, auth: string): Promise<ImageBitmap | null> {
  try {
    const r = await fetch(apiUrl(`/api/places/tile/${z}/${x}/${y}`), { headers: { Authorization: `Bearer ${auth}` } });
    if (!r.ok) return null;
    return await createImageBitmap(await r.blob());
  } catch {
    return null;
  }
}

/** `auth`: a region head's token; empty = the team's own login. */
export async function renderStaticMap(stops: Stop[], opts: { w?: number; h?: number; auth?: string } = {}): Promise<string | null> {
  if (!stops.length) return null;
  const w = opts.w ?? 1200;
  const h = opts.h ?? 760;
  const auth = opts.auth || getToken() || '';
  const z = fitZoom(stops, w, h);
  const pts = stops.map((s) => ({ ...s, ...project(s.lat, s.lon, z) }));
  const cx = (Math.min(...pts.map((p) => p.x)) + Math.max(...pts.map((p) => p.x))) / 2;
  const cy = (Math.min(...pts.map((p) => p.y)) + Math.max(...pts.map((p) => p.y))) / 2;
  const left = cx - w / 2;
  const top = cy - h / 2;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#e8e4da';
  g.fillRect(0, 0, w, h);

  // Tiles
  const n = 2 ** z;
  const jobs: Promise<void>[] = [];
  for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + w) / TILE); tx++)
    for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + h) / TILE); ty++) {
      if (ty < 0 || ty >= n) continue;
      const wrapped = ((tx % n) + n) % n;
      jobs.push(
        loadTile(z, wrapped, ty, auth).then((img) => {
          if (img) g.drawImage(img, tx * TILE - left, ty * TILE - top);
        }),
      );
    }
  await Promise.all(jobs);
  // Soften the map so the routes stand out.
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(0, 0, w, h);

  // Routes per day, in the order written
  for (const d of DAYS) {
    const day = pts.filter((p) => p.day === d);
    if (day.length < 2) continue;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    for (const [width, color] of [
      [11, '#ffffff'],
      [6, `#${DAY_COLORS[d]}`],
    ] as const) {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.setLineDash(width === 6 ? [14, 10] : []);
      g.beginPath();
      day.forEach((p, i) => (i ? g.lineTo(p.x - left, p.y - top) : g.moveTo(p.x - left, p.y - top)));
      g.stroke();
    }
  }
  g.setLineDash([]);

  // Pins, numbered within each day
  for (const d of DAYS) {
    pts
      .filter((p) => p.day === d)
      .forEach((p, i) => {
        const x = p.x - left;
        const y = p.y - top;
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.beginPath();
        g.arc(x + 2, y + 3, 21, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(x, y, 21, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = `#${DAY_COLORS[d]}`;
        g.beginPath();
        g.arc(x, y, 17, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ffffff';
        g.font = 'bold 18px Arial, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(i + 1), x, y + 1);
      });
  }

  // Required credit for the map data
  const credit = '© OpenStreetMap contributors';
  g.font = '15px Arial, sans-serif';
  const cw = g.measureText(credit).width + 16;
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillRect(w - cw, h - 24, cw, 24);
  g.fillStyle = '#333';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(credit, w - cw + 8, h - 12);

  return canvas.toDataURL('image/jpeg', 0.86);
}
