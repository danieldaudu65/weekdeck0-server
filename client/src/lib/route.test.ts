import { describe, expect, it } from 'vitest';
import { bestOrder, googleMapsUrl, km, routeKm } from './route';
import { mentionedPlaces } from './stops';
import { fitZoom } from './staticMap';
import type { Week } from './types';

const ikeja = { lat: 6.6018, lon: 3.3515 };
const ogba = { lat: 6.6295, lon: 3.3403 };
const lekki = { lat: 6.4474, lon: 3.4706 };
const yaba = { lat: 6.5095, lon: 3.3711 };

describe('route', () => {
  it('measures distance', () => {
    expect(Math.round(km(ikeja, lekki))).toBe(22);
    expect(routeKm([ikeja])).toBe(0);
  });

  it('finds a shorter order without changing the start', () => {
    const plan = [ikeja, lekki, ogba, yaba];
    const order = bestOrder(plan);
    expect(order[0]).toBe(ikeja);
    expect(order).toHaveLength(4);
    expect(routeKm(order)).toBeLessThanOrEqual(routeKm(plan));
    expect(order.map((s) => s.lat)).toEqual([ikeja.lat, ogba.lat, yaba.lat, lekki.lat]);
  });

  it('builds Google Maps links', () => {
    expect(googleMapsUrl([ikeja])).toContain('/maps/search/?api=1&query=6.601800%2C3.351500');
    const url = googleMapsUrl([ikeja, ogba, lekki]);
    expect(url).toContain('/maps/dir/?');
    expect(url).toContain('origin=6.601800%2C3.351500');
    expect(url).toContain('destination=6.447400%2C3.470600');
    expect(url).toContain('waypoints=6.629500%2C3.340300');
  });

  it('zooms in close for nearby stops and out for far ones', () => {
    expect(fitZoom([ikeja, ogba], 1200, 760)).toBeGreaterThan(fitZoom([ikeja, lekki], 1200, 760));
  });
});

describe('places written in activities', () => {
  it('lists exact pins and written places per day, without repeats', () => {
    const week: Week = {
      weekStart: '2026-10-12',
      rows: [],
      note: '',
      activities: { mon: 'Market storm at Ikeja City Mall and Ogba', tue: '', wed: 'Church outreach at RCCG Fagba', thu: '', fri: '' },
      places: [{ day: 'mon', name: 'Ikeja City Mall', lat: 6.6, lon: 3.35 }, { day: 'tue', name: 'Old place', lat: 1, lon: 1 }],
    };
    expect(mentionedPlaces(week)).toEqual([
      { day: 'mon', name: 'Ikeja City Mall' },
      { day: 'mon', name: 'Ogba' },
      { day: 'wed', name: 'RCCG Fagba' },
    ]);
  });
});
