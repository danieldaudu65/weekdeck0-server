import { describe, expect, it } from 'vitest';
import PptxGenJS from 'pptxgenjs';
import { readDeck, toImported, deckMonth, branchFromCover, monthInText, toDeckSlide, type ImportedSlide } from './slideImport';
import { applyFixes, checkDeck, historyFromDeck, readNumber, recalcSlide, teamsFromDeck } from './slideCheck';
import type { Marketer } from './accDeck';

const mk = (name: string, over: Partial<Marketer> = {}): Marketer => ({ id: name, name, designation: 'BE', supervisor: '', accountNumber: '', spouseName: '', spouseAccount: '', branch: 'FAGBA', team: '', lead: false, teamRef: null, aliases: [], ...over });

/** A small deck shaped like their monthly review, with their kinds of mistakes in it. */
async function sampleDeck(): Promise<Uint8Array> {
  const pres = new PptxGenJS();
  const cover = pres.addSlide();
  cover.addText('FAGBA CONTINENT PERFORMANCE REVIEW', { x: 0.5, y: 1, w: 9, h: 1 });
  cover.addText('FOR THE MONTH OF | SEPTEMBER, 2026', { x: 0.5, y: 2.5, w: 9, h: 1 });
  const head = ['MARKETERS NAME', 'DESIGNATION', 'INFLOW', 'INFRAS', 'TOTAL', 'NC'].map((text) => ({ text }));
  const senior = pres.addSlide();
  senior.addText('FAGBA SENIOR STAFF INFLOW AND NEW CLIENTS FOR SEPTEMBER, 2026', { x: 0.5, y: 0.2, w: 9, h: 0.6 });
  senior.addTable(
    [head, ['KENNETH IPOGAH', 'DDSM', '3,333,694.70', '2,195,655.00', '5,529,349.70', '-'], ['ARTHUR NYONG STIM', 'RRO', '1,560,000.00', '-', '1,560,000.00', '6.00'], ['TOTAL', '', '4,893,694.70', '2,195,655.00', '7,086,349.70', '6.00']].map((r) => r.map((c) => (typeof c === 'string' ? { text: c } : c))),
    { x: 0.5, y: 1, w: 9 },
  );
  const team = pres.addSlide();
  team.addText('CORPERATE TEAM INFLOW AND NEW CLIENTS FOR SEPTEMBER, 2026.', { x: 0.5, y: 0.2, w: 9, h: 0.6 });
  team.addTable(
    [
      ['', '', '', '', '', ''],
      ['MARKETERS NAME', 'DESIGNATION', 'INFLOW', 'INFRAS', 'TOTAL', 'NC'],
      ['ARTHUR NYONG ETIM', 'RRO', '1,560,000.00', '-', '1,560,000.00', '6.00'],
      ['ADEOLA BAKARE', 'BE', '570,000.00', '1,220,000.00', '1,790,000.00', '-'],
      ['OTHERS', '', '', '', '', ''],
      ['TOTAL', '', '2,130,000.00', '-', '2,130,00.00', '6'],
    ].map((r) => r.map((text) => ({ text }))),
    { x: 0.5, y: 1, w: 9 },
  );
  const year = pres.addSlide();
  year.addText('FAGBA REGIONAL INFLOW AND NEW CLIENTS FOR JAN-DECEMBER, 2026', { x: 0.5, y: 0.2, w: 9, h: 0.6 });
  year.addTable(
    [['MONTH', 'LAND & BUILDING', 'INFRA & OTHER FEES', 'INFLOW', 'NC'], ['JANUARY', '41,285,745.83', '10,060,000.00', '51,345,745.83', '3.00'], ['FEBRUARY', '19,394,875.65', '5,904,000.00', '25,298,875.65', '18.00'], ['MARCH', '', '', '', '']].map((r) => r.map((text) => ({ text }))),
    { x: 0.5, y: 1, w: 9 },
  );
  pres.addSlide().addText('THANK YOU', { x: 1, y: 2, w: 8, h: 1 });
  return (await pres.write({ outputType: 'uint8array' })) as Uint8Array;
}

describe('reading an uploaded deck', () => {
  it('finds covers, branch sections, tables, TOTAL rows and the month', async () => {
    const slides = toImported(await readDeck(await sampleDeck()), ['FAGBA', 'ABULE EGBA']);
    expect(slides.map((s) => s.kind)).toEqual(['cover', 'table', 'table', 'table', 'thanks']);
    expect(slides.every((s) => s.branch === 'FAGBA')).toBe(true);
    expect(deckMonth(slides)).toBe('2026-09');
    const team = slides[2];
    expect(team.head[0]).toBe('MARKETERS NAME');
    expect(team.rows.map((r) => r[0])).toEqual(['ARTHUR NYONG ETIM', 'ADEOLA BAKARE']); // empty row and "OTHERS" label row dropped
    expect(team.total[0]).toBe('TOTAL');
    expect(slides[3].rows.map((r) => r[0])).toEqual(['JANUARY', 'FEBRUARY', 'MARCH']); // empty months kept
    expect(toDeckSlide(slides[3], { region: 'Fagba Region', month: '2026-09' }).kind).toBe('table');
  });

  it('reads branch names and months from titles', () => {
    expect(branchFromCover('ABULE-EGBA TERRITORY PERFORMANCE REVIEW', ['FAGBA', 'ABULE EGBA'])).toBe('ABULE EGBA');
    expect(branchFromCover('IKEJA CONTINENT PERFORMANCE REVIEW', [])).toBe('IKEJA');
    expect(monthInText('OTHERS INFLOW AND NEW CLIENTS FOR SEPTEMBER 2026.')).toBe('2026-09');
    expect(readNumber('11,810,00.00').bad).toBe(true);
    expect(readNumber('1,245,835.0')).toMatchObject({ value: 1245835, bad: false, tidy: false });
    expect(readNumber('-')).toMatchObject({ value: 0, bad: false });
  });
});

describe('checking it', () => {
  it('fixes sums, TOTAL rows, number formats, names and title typos', async () => {
    const slides = toImported(await readDeck(await sampleDeck()), ['FAGBA']);
    const roster = [mk('ARTHUR NYONG ETIM', { designation: 'RRO' }), mk('KENNETH IPOGAH'), mk('ADEOLA BAKARE')];
    const fixes = checkDeck(slides, { month: '2026-09', roster });
    const texts = fixes.map((f) => f.text).join('\n');
    expect(texts).toMatch(/CORPERATE.*CORPORATE/);
    expect(texts).toMatch(/“ARTHUR NYONG STIM” looks like “ARTHUR NYONG ETIM”/);
    // Senior TOTAL: 4,893,694.70 + 2,195,655 = 7,089,349.70 (written 7,086,349.70).
    expect(texts).toMatch(/7,086,349\.70” → “7,089,349\.70/);
    // Team: INFRAS total "-" though a row has 1,220,000; "2,130,00.00" written wrongly.
    const fixed = applyFixes(slides, fixes);
    expect(fixed[2].title).toBe('CORPORATE TEAM INFLOW AND NEW CLIENTS FOR SEPTEMBER, 2026.');
    expect(fixed[1].rows[1][0]).toBe('ARTHUR NYONG ETIM');
    expect(fixed[1].total[4]).toBe('7,089,349.70');
    expect(fixed[2].total.slice(2, 5)).toEqual(['2,130,000.00', '1,220,000.00', '3,350,000.00']);
    // After the fixes, nothing about sums is left.
    expect(checkDeck(fixed, { month: '2026-09', roster }).filter((f) => f.group === 'sum')).toHaveLength(0);
  });

  it('spots the same person written two ways when there is no roster', () => {
    const t = (rows: string[][], title: string): ImportedSlide => ({ id: title, kind: 'table', title, subtitle: '', branch: 'ABULE EGBA', head: ['MARKETERS NAME', 'DESIGNATION', 'INFLOW', 'INFRAS', 'TOTAL', 'NC'], rows, total: [], lines: [] });
    const slides = [t([['SENAIKE MARGRETE', 'RRO', '-', '-', '-', '-']], 'A'), t([['SENAIKE MARGARET', 'RRO', '-', '-', '-', '-']], 'B'), t([['SENAIKE MARGARET', 'RRO', '-', '-', '-', '-']], 'C')];
    const names = checkDeck(slides, { month: '2026-09', roster: [] }).filter((f) => f.group === 'name');
    expect(names).toHaveLength(1);
    expect(names[0]).toMatchObject({ apply: true, name: { from: 'SENAIKE MARGRETE', to: 'SENAIKE MARGARET' } });
  });

  it('compares people with the workbook when the month is in it (off until ticked)', () => {
    const s: ImportedSlide = { id: 'x', kind: 'table', title: 'T', subtitle: '', branch: 'FAGBA', head: ['MARKETERS NAME', 'DESIGNATION', 'INFLOW', 'INFRAS', 'TOTAL', 'NC'], rows: [['KENNETH IPOGAH', 'DDSM', '300,000.00', '-', '300,000.00', '-']], total: [], lines: [] };
    const workbook = { label: 'confirmed payments', branches: new Map([['FAGBA', { people: new Map([['KENNETH IPOGAH', { inflow: 420000, infra: 0, nc: 1 }]]), total: { inflow: 420000, infra: 0, nc: 1 } }]]) };
    const wb = checkDeck([s], { month: '2026-10', roster: [], workbook }).filter((f) => f.group === 'workbook');
    expect(wb.map((f) => f.cell!.to)).toEqual(['420,000.00', '420,000.00', '1']);
    expect(wb.every((f) => !f.apply)).toBe(true);
  });

  it('recalculates one slide in the editor', () => {
    const s: ImportedSlide = { id: 'x', kind: 'table', title: 'T', subtitle: '', branch: '', head: ['MARKETERS NAME', 'DESIGNATION', 'INFLOW', 'INFRAS', 'TOTAL', 'NC'], rows: [['A', 'BE', '100', '50', '1', '2'], ['B', 'BE', '200', '-', '', '']], total: ['TOTAL', '', '', '', '', ''], lines: [] };
    const r = recalcSlide(s, '2026-10');
    expect(r.rows[0][4]).toBe('150.00');
    expect(r.total).toEqual(['TOTAL', '', '300.00', '50.00', '350.00', '2']);
  });
});

describe('what else the deck gives', () => {
  it('earlier months from the year table, and teams with senior staff', async () => {
    const slides = applyFixes(toImported(await readDeck(await sampleDeck()), ['FAGBA']), []);
    expect(historyFromDeck(slides, '2026')).toEqual([
      { branch: 'FAGBA', month: '2026-01', land: 41285745.83, infra: 10060000, nc: 3 },
      { branch: 'FAGBA', month: '2026-02', land: 19394875.65, infra: 5904000, nc: 18 },
    ]);
    const teams = teamsFromDeck(slides);
    expect(teams.find((t) => t.name === 'ADEOLA BAKARE')).toMatchObject({ team: 'Corperate Team', lead: false, branch: 'FAGBA' });
    expect(teams.find((t) => t.name === 'KENNETH IPOGAH')).toMatchObject({ team: '', lead: true });
  });
});
