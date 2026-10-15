import { describe, expect, it } from 'vitest';
import { parseAmount, sumOrNull } from './money';
import { addWeeks, mondayOf, mondaysInMonth, weekNumberInMonth } from './weeks';
import { buildDeck, layoutSlide } from './deck';
import { THEMES } from './templates';
import type { Team, Week } from './types';

describe('money', () => {
  it('reads the ways people type amounts', () => {
    expect(parseAmount('500k')).toBe(500000);
    expect(parseAmount('1.2m')).toBe(1200000);
    expect(parseAmount('500,000')).toBe(500000);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNaN();
    expect(sumOrNull([null, null])).toBeNull();
    expect(sumOrNull([1, null, 2])).toBe(3);
  });
});

describe('weeks', () => {
  it('finds Mondays and week numbers', () => {
    expect(mondayOf(new Date('2026-10-14T10:00:00Z'))).toBe('2026-10-12');
    expect(mondayOf(new Date('2026-10-18T10:00:00Z'))).toBe('2026-10-12');
    expect(addWeeks('2026-12-28', 1)).toBe('2027-01-04');
    expect(mondaysInMonth('2026-10')).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    expect(weekNumberInMonth('2026-10-12')).toBe(2);
  });
});

describe('deck', () => {
  const team: Team = {
    id: 't', name: 'Lifter Marine', createdAt: '', updatedAt: '',
    deckTitle: 'Weekly Strategic Session', managerName: 'Olorunsogo Samuel', managerTag: 'KSO', managerRole: 'Team Lead',
    teamTitle: 'Team Social, Fagba', region: 'Fagba', activitiesTitle: 'Activities', templateId: 'classic', coverImage: '',
    members: [
      { id: 'aaaa1', name: 'Olorunsogo Samuel', lead: true },
      { id: 'bbbb2', name: 'Daniel Derik', lead: false },
    ],
  };
  const activities = { mon: 'Market', tue: '', wed: 'Outreach', thu: '', fri: 'Review' };
  const week: Week = {
    weekStart: '2026-10-12', note: '', activities,
    rows: [
      { memberId: 'aaaa1', mon: 100000, tue: null, wed: null, thu: 500000, fri: null, nc: 2 },
      { memberId: 'bbbb2', mon: null, tue: 250000, wed: null, thu: null, fri: null, nc: 1 },
    ],
  };
  const prev: Week = { ...week, weekStart: '2026-10-05', rows: [{ memberId: 'aaaa1', mon: 300000, tue: null, wed: null, thu: null, fri: null, nc: null }] };

  it('builds weekly and monthly tables; new clients are a count, not money', () => {
    const slides = buildDeck({ team, week, monthWeeks: [prev], previousWeek: prev, includeSummary: true });
    expect(slides.map((s) => s.kind)).toEqual(['cover', 'summary', 'team', 'table', 'table', 'activities', 'thanks']);
    const [weekly, monthly] = slides.filter((s) => s.kind === 'table');
    if (weekly.kind !== 'table' || monthly.kind !== 'table') throw new Error('table expected');
    expect(weekly.table.rows[0]).toEqual(['OLORUNSOGO', '100,000', '', '', '500,000', '', '2', '600,000']);
    expect(weekly.table.total.at(-1)).toBe('850,000');
    expect(monthly.table.total.at(-1)).toBe('1,150,000');
  });

  it('lays out every slide in every template', () => {
    const slides = buildDeck({ team, week, monthWeeks: [], previousWeek: null, includeSummary: false });
    expect(slides.some((s) => s.kind === 'summary')).toBe(false);
    for (const t of THEMES) slides.forEach((s, i) => expect(layoutSlide(s, t, { teamName: team.name, page: i + 1, total: slides.length }).shapes.length).toBeGreaterThan(0));
  });
});
