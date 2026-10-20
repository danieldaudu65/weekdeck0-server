/**
 * Upload → save → WeekDeck's slides: every total, week number and monthly figure on WeekDeck's
 * slides must be the same as on the uploaded deck.
 */
import { describe, expect, it } from 'vitest';
import { analyzeSlides, type SlideContent } from './importAnalyze';
import { decideImportWeek, planImportWeeks } from './importSave';
import { buildDeck, type DeckSlide } from './deck';
import { importedWeekFor, setWeekStyle } from './weeks';
import type { Team, Week } from './types';

const TODAY = new Date('2026-10-20T10:00:00'); // a Tuesday: Week 2 (12–16 Oct) just ended
const slide = (index: number, paragraphs: string[], tables: string[][][] = []): SlideContent => ({ index, paragraphs: paragraphs.map((text) => ({ text })), tables });
const num = (s: string) => (s ? Number(s.replace(/[^\d]/g, '')) : 0);

/** Upload a deck the way the setup page does, then build WeekDeck's slides for the imported week. */
function importAndBuild(slides: SlideContent[], existing: Week[] = [], opts: { saveFigures?: boolean; style?: 'monday' | 'first' } = {}) {
  const r = analyzeSlides(slides);
  const choice = decideImportWeek(r, TODAY, opts.style ?? 'monday', importedWeekFor(TODAY));
  const saved = new Map(existing.map((w) => [w.weekStart, w]));
  const toSave = planImportWeeks({
    figures: r.figures,
    monthly: r.monthly,
    activities: r.activities,
    saveFigures: opts.saveFigures ?? true,
    figuresWeek: choice.figuresWeek,
    memberIds: new Set(r.members.map((m) => m.id)),
    existing: saved,
  });
  for (const w of toSave) saved.set(w.weekStart, w);
  const team: Team = {
    id: 't', name: 'Team', deckTitle: r.deckTitle, managerName: r.managerName, managerTag: '', managerRole: '', teamTitle: r.teamTitle, region: '',
    activitiesTitle: '', templateId: 'classic', members: r.members, coverImage: '', weekStyle: choice.style, createdAt: '', updatedAt: '',
  };
  setWeekStyle(choice.style);
  const week = saved.get(choice.figuresWeek) ?? { weekStart: choice.figuresWeek, rows: [], activities: r.activities, note: '', places: [] };
  const deck = buildDeck({ team, week, monthWeeks: [...saved.values()], previousWeek: null, includeSummary: false, map: null });
  const table = (title: string) => (deck.find((s) => s.kind === 'table' && s.title === title) as Extract<DeckSlide, { kind: 'table' }>).table;
  const cover = deck[0] as Extract<DeckSlide, { kind: 'cover' }>;
  const rowOf = (t: ReturnType<typeof table>, name: string) => t.rows.find((x) => x[0].toLowerCase().startsWith(name.toLowerCase()))!;
  return { r, choice, saved, team, weekly: table('Weekly Breakdown Summary'), monthly: table('Monthly Breakdown Summary'), cover, rowOf };
}

const team = slide(2, ['TEAM MEMBERS', 'SENAIKE MARGARET', 'OKEKE NNAMDI', 'ETIM REGINA']);

describe('uploaded figures and WeekDeck’s slides agree', () => {
  it('Margaret’s deck: weekly and monthly totals match, Victor’s row is kept', () => {
    const x = importAndBuild([
      slide(1, ['WEEKLY PERFORMANCE REPORT.', 'LEAD BY MARGARET']),
      team,
      slide(3, ['INFLOW FOR THE WEEK'], [[
        ['NAME', 'MON', 'TUES', 'WED', 'THURS', 'FRI', 'N/C', 'TOTAL'],
        ['MARGARET', '', '', '1,000,000', '', '', '', '1,000,000'],
        ['NNAMDI', '200,000', '', '', '', '', '', '200,000'],
        ['VICTOR', '', '', '', '', '', '', ''],
        ['REGINA', '', '', '', '', '', '', ''],
        ['TOTAL', '200,000', '', '1,000,000', '', '', '', '1,200,000'],
      ]]),
      slide(4, ['INFLOW FOR THE MONTH'], [[
        ['NAME', 'WK 1', 'WK2', 'WK3', 'WK 4', 'WK 5', 'N/C', 'TOTAL'],
        ['MARGARET', '1,300,000', '1,000,000', '', '', '', '', '2,300,000'],
        ['NNAMDI', '', '200,000', '', '', '', '', '200,000'],
        ['TOTAL', '1,300,000', '1,200,000', '', '', '', '', '2,500,000'],
      ]]),
    ]);
    expect(x.choice).toMatchObject({ figuresWeek: '2026-10-12', style: 'monday', slideNo: 2 });
    expect(x.cover.weekNo).toBe(2);
    expect(num(x.weekly.total.at(-1)!)).toBe(1_200_000);
    expect(num(x.rowOf(x.weekly, 'senaike').at(-1)!)).toBe(1_000_000);
    expect(x.r.members.map((m) => m.name)).toContain('Victor');
    expect(x.monthly.head.slice(1, 3)).toEqual(['WK 1', 'WK 2']);
    expect(x.monthly.total.slice(1, 3).map(num)).toEqual([1_300_000, 1_200_000]);
    expect(num(x.monthly.total.at(-1)!)).toBe(2_500_000);
  });

  it('a team whose Week 1 is the week of the 1st: same week numbers and month total as the slide', () => {
    const x = importAndBuild([
      slide(1, ['WEEKLY STRATEGIC SESSION', 'SENAIKE MARGARET', 'WEEK 3']),
      team,
      slide(3, [], [[
        ['NAME', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'NC', 'TOTAL'],
        ['MARGARET', '100,000', '', '', '', '', '', '100,000'],
        ['NNAMDI', '', '', '250,000', '', '', '1', '250,000'],
      ]]),
      slide(4, [], [[
        ['NAME', 'WK 1', 'WK 2', 'WK 3', 'WK 4', 'TOTAL'],
        ['MARGARET', '500,000', '', '100,000', '', '600,000'],
        ['NNAMDI', '', '300,000', '250,000', '', '550,000'],
      ]]),
    ]);
    // 12–16 Oct is Week 3 for this team (28 Sep – 2 Oct is their Week 1).
    expect(x.choice).toMatchObject({ figuresWeek: '2026-10-12', style: 'first', slideNo: 3 });
    expect(x.cover.weekNo).toBe(3);
    expect(x.saved.has('2026-09-28')).toBe(true); // WK 1 saved on 28 Sep, and counted in October
    expect(x.monthly.total.slice(1, 4).map(num)).toEqual([500_000, 300_000, 350_000]);
    expect(num(x.monthly.total.at(-1)!)).toBe(1_150_000);
  });

  it('TOTAL without a daily split is kept, so every TOTAL matches the slide', () => {
    const x = importAndBuild([
      slide(1, ['WEEKLY REPORT', 'SENAIKE MARGARET']),
      team,
      slide(3, [], [[
        ['NAME', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'NC', 'TOTAL'],
        ['MARGARET', '', '', '', '', '', '2 clients', '600,000'],
        ['NNAMDI', 'N100,000', '', '', '', '', '', 'N300,000'],
        ['REGINA', '50k', '50k', '', '', '', '1', '100k'],
        ['VICTOR', '', '', '', '400,000', '', '', '400,000'],
      ]]),
    ]);
    expect(num(x.rowOf(x.weekly, 'senaike').at(-1)!)).toBe(600_000);
    expect(num(x.rowOf(x.weekly, 'okeke').at(-1)!)).toBe(300_000);
    expect(num(x.rowOf(x.weekly, 'etim').at(-1)!)).toBe(100_000);
    expect(num(x.rowOf(x.weekly, 'victor').at(-1)!)).toBe(400_000);
    expect(num(x.weekly.total.at(-1)!)).toBe(1_400_000);
    expect(x.weekly.total.at(-2)).toBe('3'); // new clients: "2 clients" + 1
  });

  it('a date on the cover decides the week', () => {
    const x = importAndBuild([
      slide(1, ['WEEKLY REPORT', 'SENAIKE MARGARET', '5th – 9th October, 2026']),
      team,
      slide(3, [], [[['NAME', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'TOTAL'], ['MARGARET', '100,000', '', '', '', '', '100,000']]]),
    ]);
    expect(x.choice).toMatchObject({ figuresWeek: '2026-10-05', source: 'date' });
    expect(x.cover.weekNo).toBe(1);
  });

  it('nothing already saved is wiped by an upload', () => {
    const existing: Week[] = [];
    const first = importAndBuild([slide(1, ['WEEKLY REPORT', 'SENAIKE MARGARET']), team, slide(3, [], [[['NAME', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'TOTAL'], ['MARGARET', '100,000', '', '', '', '', '100,000']]])]);
    const ids = first.r.members;
    const nnamdi = ids.find((m) => m.name.startsWith('Okeke'))!.id;
    existing.push({
      weekStart: '2026-10-12', note: 'Great week', places: [{ day: 'mon', name: 'Ikeja', lat: 6.6, lon: 3.3 }],
      rows: [{ memberId: nnamdi, mon: 70_000, tue: null, wed: null, thu: null, fri: null, nc: null }],
      activities: { mon: 'Visit', tue: '', wed: '', thu: '', fri: '' },
    });
    // Same team (same member ids), new upload with figures for Margaret only and figures unticked.
    const slides = [slide(1, ['WEEKLY REPORT', 'SENAIKE MARGARET']), team, slide(3, [], [[['NAME', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'TOTAL'], ['MARGARET', '100,000', '', '', '', '', '100,000']]])];
    const r = analyzeSlides(slides);
    r.members.forEach((m, i) => (m.id = ids[i].id));
    r.figures!.forEach((f) => (f.memberId = ids.find((m) => m.name.startsWith('Senaike'))!.id));
    const plan = planImportWeeks({ figures: r.figures, monthly: null, activities: r.activities, saveFigures: false, figuresWeek: '2026-10-12', memberIds: new Set(ids.map((m) => m.id)), existing: new Map(existing.map((w) => [w.weekStart, w])) });
    expect(plan).toEqual([]); // no figures to save and no plan: nothing touched
    const plan2 = planImportWeeks({ figures: r.figures, monthly: null, activities: r.activities, saveFigures: true, figuresWeek: '2026-10-12', memberIds: new Set(ids.map((m) => m.id)), existing: new Map(existing.map((w) => [w.weekStart, w])) });
    expect(plan2[0].note).toBe('Great week');
    expect(plan2[0].rows.find((x) => x.memberId === nnamdi)?.mon).toBe(70_000); // Nnamdi's typed figure stays
    expect(plan2[0].activities.mon).toBe('Visit');
  });
});
