import { describe, expect, it } from 'vitest';
import { buildDeck, CANVAS_H, CANVAS_W } from './deck';
import { layoutSlide } from './looks';
import { PALETTES, STYLES, lookById, lookId } from './templates';
import type { Team, Week } from './types';

const rgb = (h: string) => [0, 8, 16].map((s) => (parseInt(h, 16) >> (16 - s)) & 255);
const lum = (h: string) => {
  const [r, g, b] = rgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const team: Team = {
  id: 't', name: 'Lifter Marine', createdAt: '', updatedAt: '',
  deckTitle: 'Weekly Knowledge Strategic Session', managerName: 'Olorunsogo Samuel', managerTag: 'KSO', managerRole: 'Team Lead',
  teamTitle: 'Team Social, Fagba Region', region: 'Fagba', activitiesTitle: 'Fagba Social Team WPR Activities', templateId: 'classic', coverImage: '',
  members: Array.from({ length: 9 }, (_, i) => ({ id: `mem${i}x`, name: `Member Number${i}`, lead: i === 0 })),
};
const week: Week = {
  weekStart: '2026-10-12', note: '',
  activities: { mon: 'Market storm at Ikeja '.repeat(20), tue: 'Site inspection', wed: '', thu: 'Calls', fri: 'Review' },
  rows: team.members.map((m, i) => ({ memberId: m.id, mon: i * 1_000_000, tue: null, wed: 25_000, thu: null, fri: 9_999_999, nc: i })),
};

describe('looks', () => {
  it('has 8 styles and 20 palettes', () => {
    expect(STYLES).toHaveLength(8);
    expect(PALETTES).toHaveLength(20);
  });

  it('reads old and new saved ids', () => {
    expect(lookById('coral').id).toBe('classic_coral');
    expect(lookById('bold_wine').id).toBe('bold_wine');
    expect(lookById('nonsense').id).toBe('classic_classic');
    expect(lookById(undefined).id).toBe('classic_classic');
  });

  it('every palette is readable', () => {
    for (const p of PALETTES) {
      expect(contrast(p.ink, p.bg), p.id).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.ink, p.surface), p.id).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.primaryInk, p.primary), p.id).toBeGreaterThanOrEqual(3);
      expect(contrast(p.accentInk, p.accent), p.id).toBeGreaterThanOrEqual(3);
      expect(contrast(p.coverInk, p.coverBg), p.id).toBeGreaterThanOrEqual(3);
      expect(contrast(p.coverMuted, p.coverBg), p.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('every slide of every look stays on the slide', () => {
    for (const withPhoto of [false, true]) {
      const slides = buildDeck({ team: { ...team, coverImage: withPhoto ? 'data:image/jpeg;base64,xx' : '' }, week, monthWeeks: [], previousWeek: null, includeSummary: true });
      for (const st of STYLES)
        for (const p of PALETTES) {
          slides.forEach((s, i) => {
            const { bg, shapes } = layoutSlide(s, lookById(lookId(st.id, p.id)), { teamName: team.name, page: i + 1, total: slides.length });
            expect(bg).toMatch(/^[0-9A-F]{6}$/);
            for (const sh of shapes) {
              if (sh.type === 'text') {
                expect(sh.size, `${st.id} ${s.kind}`).toBeGreaterThanOrEqual(10);
                expect(sh.x + sh.w, `${st.id} ${s.kind} "${sh.text}"`).toBeLessThanOrEqual(CANVAS_W + 1);
                expect(sh.y + sh.h, `${st.id} ${s.kind} "${sh.text}"`).toBeLessThanOrEqual(CANVAS_H + 1);
              }
              if (sh.type === 'table') {
                expect(sh.x + sh.colW.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(CANVAS_W);
                expect(sh.y + sh.rowH * (sh.rows.length + 2)).toBeLessThanOrEqual(CANVAS_H);
              }
            }
          });
        }
    }
  });
});
