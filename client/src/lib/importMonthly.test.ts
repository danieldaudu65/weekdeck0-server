import { describe, expect, it } from 'vitest';
import { analyzeSlides, parseNumberCell, weekColumnNumber, type SlideContent } from './importAnalyze';
import { planMonthlyWeeks } from './importMonthly';

const slide = (index: number, tables: string[][][], paragraphs: string[] = []): SlideContent => ({ index, tables, paragraphs: paragraphs.map((text) => ({ text })) });

describe('number cells', () => {
  it('reads every way managers write money', () => {
    expect(parseNumberCell('500,000')).toBe(500000);
    expect(parseNumberCell('₦500,000')).toBe(500000);
    expect(parseNumberCell('N500,000')).toBe(500000);
    expect(parseNumberCell('NGN 500000')).toBe(500000);
    expect(parseNumberCell('500k')).toBe(500000);
    expect(parseNumberCell('1.2M')).toBe(1200000);
    expect(parseNumberCell('500,000.00')).toBe(500000);
    expect(parseNumberCell('500 000')).toBe(500000);
    expect(parseNumberCell('-')).toBeNull();
    expect(parseNumberCell('')).toBeNull();
    expect(parseNumberCell('Olorunsogo')).toBeNull();
  });

  it('knows the week columns', () => {
    expect(weekColumnNumber('WK 1')).toBe(1);
    expect(weekColumnNumber('WK1')).toBe(1);
    expect(weekColumnNumber('Week 2')).toBe(2);
    expect(weekColumnNumber('W3')).toBe(3);
    expect(weekColumnNumber('WEEK ONE')).toBe(1);
    expect(weekColumnNumber('1ST WEEK')).toBe(1);
    expect(weekColumnNumber('NAME')).toBeNull();
    expect(weekColumnNumber('TOTAL')).toBeNull();
  });
});

describe('monthly table', () => {
  const team = slide(2, [], ['TEAM FAGBA', 'Olorunsogo Samuel', 'Adebayo Grace', 'Okafor Chidi']);
  // An S/N column first, N-prefixed money, and a "-" for nothing.
  const weekly = slide(3, [[
    ['S/N', 'NAMES', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'NC', 'TOTAL'],
    ['1', 'OLORUNSOGO', 'N100,000', '', '-', '', '', '', 'N100,000'],
    ['2', 'ADEBAYO', '', '200k', '', '', '', '1', '200k'],
    ['3', 'OKAFOR', '', '', '', '', '', '', ''],
  ]]);
  const monthly = slide(4, [[
    ['S/N', 'NAMES', 'WK 1', 'WK 2', 'WK 3', 'WK 4', 'NC', 'TOTAL'],
    ['1', 'OLORUNSOGO', '300,000', '50,000', '100,000', '', '', '450,000'],
    ['2', 'ADEBAYO', '', '400,000', '200,000', '', '1', '600,000'],
    ['3', 'OKAFOR', '80,000', '', '', '', '', '80,000'],
    ['', 'TOTAL', '380,000', '450,000', '300,000', '', '1', '1,130,000'],
  ]]);

  const r = analyzeSlides([slide(1, [], ['Weekly report']), team, weekly, monthly]);
  const id = (name: string) => r.members.find((m) => m.name.startsWith(name))!.id;

  it('reads the weekly figures even with an S/N column and N-prefixed money', () => {
    const ola = r.figures!.find((f) => f.memberId === id('Olorunsogo'))!;
    expect(ola.mon).toBe(100000);
    expect(ola.wed).toBeNull();
    expect(r.figures!.find((f) => f.memberId === id('Adebayo'))!.tue).toBe(200000);
  });

  it('reads every member’s monthly figures', () => {
    expect(r.monthly!.weeks).toEqual(['WK 1', 'WK 2', 'WK 3', 'WK 4']);
    expect(r.monthly!.rows.find((x) => x.memberId === id('Okafor'))!.values).toEqual([80000, null, null, null]);
  });

  it('puts the earlier WK columns on the right weeks', () => {
    // WK 3 matches the weekly totals, so WK 3 = the imported week (19 Oct): WK 2 = 12 Oct, WK 1 = 5 Oct.
    const plan = planMonthlyWeeks(r.monthly, r.figures, '2026-10-19');
    expect(plan.map((p) => [p.label, p.weekStart])).toEqual([
      ['WK 1', '2026-10-05'],
      ['WK 2', '2026-10-12'],
    ]);
    expect(plan[0].rows).toEqual([
      { memberId: id('Olorunsogo'), weekTotal: 300000 },
      { memberId: id('Okafor'), weekTotal: 80000 },
    ]);
  });

  it('keeps the imported week’s own column when there are no daily figures', () => {
    const plan = planMonthlyWeeks(r.monthly, null, '2026-10-19');
    expect(plan.map((p) => p.weekStart)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19']);
  });
});
