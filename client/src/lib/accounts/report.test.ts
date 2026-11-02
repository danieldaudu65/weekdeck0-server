import { describe, expect, it } from 'vitest';
import { readXlsx, xlsxBytes, type OutCell } from './xlsx';
import { checkReport, monthFrom, readReport } from './reportExcel';
import { applyPlan, planBranch } from './reportPlan';
import { buildReportDeck } from './reportDeck';
import type { Marketer } from './accDeck';
import type { TeamEntry } from './slideCheck';

const c = (v: string | number | null): OutCell => ({ v });
const row = (...v: (string | number | null)[]) => v.map(c);

/** A branch file shaped like hers: cover tab, TEAM'S REPORT (team blocks, OTHERS, GRAND TOTAL), a Jan–Dec tab. */
async function sample() {
  const bytes = await xlsxBytes([
    { name: 'LEKKI INFLOW REPORT SEPT 2026', rows: [[], [], row(null, null, 'LEKKI INFLOW REPORT FOR THE MONTH OF SEPTEMBER, 2026'), [], row(null, null, "'TEAM''S REPORT'!A1")] },
    {
      name: "TEAM'S REPORT",
      rows: [
        row('S/N', 'NAME', 'DESIGNATION', 'LAND', 'HOUSE', 'INFRAS/OTHER FEES', 'TOTAL', 'NEW CLIENTS'),
        row(1, 'ADA OBI', 'DDSM', 1000000, 0, 500000, 1500000, 0),
        row(2, 'BAYO ADE', 'DCRO', 300000, 0, 0, 300000, 1),
        row(3, 'KADRI TUNDE', 'BE', 200000, 0, 0, 200000, 0),
        row(4, 'CHIDI EZE', 'RRO', 400000, 100000, 50000, 550000, 2),
        row(5, 'DAPO ALAO', 'BE', 0, 0, 0, 75000, 0), // TOTAL typed over: the parts say 0
        row(null, 'OTHERS', null, null, 0, 0, 0, 0),
        row(6, 'EFE OKON', 'INDEPENDENT', 50000, 0, 0, 50000, 0),
        [],
        row(null, 'GRAND TOTAL', null, 1950000, 100000, 550000, 2525000, 3),
      ],
    },
    { name: 'JAN-DEC LEKKI INFLOW', rows: [row('', '', 'JANUARY'), row('NAME', 'DESIGNATION', 'LAND & BUILDING', 'INFRAS & OTHER FEES', 'NC'), row('KADIRI TUNDE', 'BE'), row('ALAO DAPO', 'BE')] },
  ]);
  return readReport(await readXlsx(bytes), 'LEKKI.xlsx');
}

const mk = (name: string, over: Partial<Marketer> = {}): Marketer => ({ id: name, name, designation: 'BE', supervisor: '', accountNumber: '', spouseName: '', spouseAccount: '', branch: 'LEKKI', team: '', lead: false, teamRef: null, aliases: [], ...over });

describe('report Excel', () => {
  it('reads the branch, month, rows, OTHERS and the grand total', async () => {
    const r = await sample();
    expect(r.branch).toBe('LEKKI');
    expect(r.month).toBe('2026-09');
    expect(r.sheet).toBe("TEAM'S REPORT");
    expect(r.rows.map((x) => x.name)).toEqual(['ADA OBI', 'BAYO ADE', 'KADRI TUNDE', 'CHIDI EZE', 'DAPO ALAO', 'EFE OKON']);
    expect(r.rows.find((x) => x.name === 'EFE OKON')!.others).toBe(true);
    expect(r.rows.find((x) => x.name === 'CHIDI EZE')).toMatchObject({ land: 400000, house: 100000, infra: 50000, nc: 2 });
    expect(r.grand).toMatchObject({ land: 1950000, total: 2525000, nc: 3 });
    // Another tab spells KADRI as KADIRI (asked); ALAO DAPO is the same words in another order (not asked).
    expect(r.spellings).toEqual({ 'KADRI TUNDE': [{ spelling: 'KADIRI TUNDE', sheet: 'JAN-DEC LEKKI INFLOW' }] });
  });

  it('finds totals that don’t add up', async () => {
    const issues = checkReport(await sample());
    expect(issues).toContainEqual({ kind: 'rowTotal', name: 'DAPO ALAO', typed: 75000, parts: 0 });
    // The file's grand total leaves HOUSE out and counts DAPO's typed 75,000.
    expect(issues).toContainEqual({ kind: 'grand', what: 'total', file: 2525000, rows: 2600000 });
  });

  it('reads month words the way she writes them', () => {
    expect(monthFrom('FOR THE MONTH OF SEPTEMBER, 2026')).toBe('2026-09');
    expect(monthFrom('FAGBA SEPT 26 INFLOW REPORT')).toBe('2026-09');
    expect(monthFrom('OCT 2026')).toBe('2026-10');
    expect(monthFrom('nothing here')).toBe('');
  });
});

describe('teams, spellings and the deck', () => {
  const slides: TeamEntry[] = [
    { name: 'ADA OBI', designation: 'DDSM', branch: 'LEKKI', team: '', lead: true },
    { name: 'BAYO ADE', designation: 'DCRO', branch: 'LEKKI', team: 'Social Team', lead: false },
    { name: 'BAYO ADEE', designation: 'DCRO', branch: 'LEKKI', team: '', lead: true }, // the senior slide spells him another way
    { name: 'CHIDI EZE', designation: 'RRO', branch: 'LEKKI', team: 'Corporate Team', lead: true },
  ];

  it('takes teams and senior staff from last month’s slides, and guesses the rest from the order', async () => {
    const r = await sample();
    const plan = planBranch(r, 'LEKKI', [], slides);
    const by = (n: string) => plan.find((p) => p.file === n)!;
    expect(by('ADA OBI')).toMatchObject({ team: '', lead: true, source: 'slides' });
    expect(by('BAYO ADE')).toMatchObject({ team: 'Social Team', lead: true, source: 'slides' });
    expect(by('BAYO ADE').choices).toEqual(['BAYO ADE', 'BAYO ADEE']);
    expect(by('KADRI TUNDE')).toMatchObject({ team: 'Social Team', source: 'order' }); // the row above's team
    expect(by('KADRI TUNDE').choices).toEqual(['KADRI TUNDE', 'KADIRI TUNDE']);
    expect(by('EFE OKON')).toMatchObject({ team: '', source: 'none' }); // below OTHERS
  });

  it('builds her deck: senior staff, teams in the file’s order, others, summary, Jan–Dec', async () => {
    const r = await sample();
    const plan = planBranch(r, 'LEKKI', [], slides);
    const a = applyPlan(r, 'LEKKI', '2026-09', plan, { 'DAPO ALAO': { use: 'infra' } }, [], [{ branch: 'LEKKI', month: '2026-08', land: 1000, infra: 0, nc: 1 }]);
    const marketers = a.upserts.map((u, i) => ({ ...mk(u.name!), ...u, id: String(i) }) as Marketer);
    const deck = buildReportDeck({ region: 'Lagos', month: '2026-09', branches: [a.saved], marketers, history: a.history });
    const ids = deck.filter((d) => !d.extra).map((d) => d.id);
    expect(ids).toEqual(['cover:LEKKI', 'senior:LEKKI', 'team:LEKKI:Social Team', 'team:LEKKI:Corporate Team', 'others:LEKKI', 'summary:LEKKI', 'trend:LEKKI', 'thanks']);
    const table = (id: string) => (deck.find((d) => d.id === id)!.slide as Extract<(typeof deck)[number]['slide'], { kind: 'table' }>).table;
    expect(table('senior:LEKKI').rows.map((x) => x[0])).toEqual(['ADA OBI', 'BAYO ADE', 'CHIDI EZE']);
    expect(table('senior:LEKKI').total).toEqual(['TOTAL', '', '1,800,000.00', '550,000.00', '2,350,000.00', '3']);
    // DAPO ALAO's typed 75,000 went to Infra (her choice); he follows CHIDI's team in the file's order.
    expect(table('team:LEKKI:Corporate Team').rows).toEqual([
      ['CHIDI EZE', 'RRO', '500,000.00', '50,000.00', '550,000.00', '2'],
      ['DAPO ALAO', 'BE', '-', '75,000.00', '75,000.00', '-'],
    ]);
    expect(table('others:LEKKI').rows.map((x) => x[0])).toEqual(['EFE OKON']);
    expect(table('summary:LEKKI').total).toEqual(['TOTAL', '2,050,000.00', '625,000.00', '2,675,000.00', '3']);
    const trend = table('trend:LEKKI');
    expect(trend.rows[7]).toEqual(['AUGUST', '1,000.00', '-', '1,000.00', '1']);
    expect(trend.rows[8]).toEqual(['SEPTEMBER', '2,050,000.00', '625,000.00', '2,675,000.00', '3']);
    expect(trend.rows[9]).toEqual(['OCTOBER', '', '', '', '']);
    // The month is remembered for next month's year slide.
    expect(a.history).toContainEqual({ branch: 'LEKKI', month: '2026-09', land: 2050000, infra: 625000, nc: 3 });
  });

  it('asks nothing the second month: teams and spellings come from her list', async () => {
    const r = await sample();
    const first = planBranch(r, 'LEKKI', [], slides);
    const a = applyPlan(r, 'LEKKI', '2026-09', first, {}, [], []);
    const list = a.upserts.map((u, i) => ({ ...mk(u.name!), ...u, id: String(i) }) as Marketer);
    const again = planBranch(r, 'LEKKI', list, []);
    expect(again.every((p) => p.source === 'list')).toBe(true);
    expect(again.filter((p) => p.choices.length > 1)).toEqual([]);
    // She picked the slide's spelling once: next time the file's spelling still lands on her list's name.
    const picked = first.map((p) => (p.file === 'BAYO ADE' ? { ...p, name: 'BAYO ADEE' } : p));
    const b = applyPlan(r, 'LEKKI', '2026-09', picked, {}, [], []);
    const list2 = b.upserts.map((u, i) => ({ ...mk(u.name!), ...u, id: String(i) }) as Marketer);
    const deck = buildReportDeck({ region: 'Lagos', month: '2026-09', branches: [b.saved], marketers: list2, history: [] });
    expect(JSON.stringify(deck)).toContain('BAYO ADEE');
    expect(planBranch(r, 'LEKKI', list2, []).find((p) => p.file === 'BAYO ADE')).toMatchObject({ name: 'BAYO ADEE', source: 'list' });
  });
});
