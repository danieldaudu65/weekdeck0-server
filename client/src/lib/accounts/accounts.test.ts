import { describe, expect, it } from 'vitest';
import { emptyPayment, parseDate, parseMoney, paymentKey, readCell, COLUMNS, type Payment } from './columns';
import { planImport, readFile, newMarketers, kindFromName, monthFromName, tabFromCsvName } from './importer';
import { readCsv, readXlsx, xlsxBytes, type OutCell } from './xlsx';
import { csvRows, sheetFor } from './exporter';
import { applyPrefs, buildAccountsDeck, money, type Marketer } from './accDeck';
import { nameScore, LIKELY, similarGroups } from './names';
import { parseClipboard } from '../../components/accounts/Grid';

const pay = (over: Partial<Payment> = {}): Payment => ({
  ...emptyPayment('2026-10', 'land', 'OGBAFAGBA', 0, 'FAGBA'),
  date: '2026-10-09',
  alertName: 'SHODE MARY',
  bank: 'GTB',
  amount: 100000,
  clientName: 'SHODE MARY',
  marketer: 'KENNETH IPOGAH',
  rate: 7,
  confirmation: 'CONFIRMED',
  ...over,
});

const mk = (name: string, over: Partial<Marketer> = {}): Marketer => ({
  id: name,
  name,
  designation: 'BE',
  supervisor: '',
  accountNumber: '',
  spouseName: '',
  spouseAccount: '',
  branch: 'FAGBA',
  team: '',
  lead: false,
  teamRef: null,
  aliases: [],
  ...over,
});

describe('typing into cells', () => {
  it('reads dates day first, money with commas, k and m', () => {
    expect(parseDate('09/10/2026')).toBe('2026-10-09');
    expect(parseDate('9/10/26')).toBe('2026-10-09');
    expect(parseDate('2026-10-09')).toBe('2026-10-09');
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseMoney('1,450,000')).toBe(1450000);
    expect(parseMoney('₦1.45m')).toBe(1450000);
    expect(parseMoney('500k')).toBe(500000);
    expect(parseMoney('15,498,953.25')).toBe(15498953.25);
    expect(Number.isNaN(parseMoney('abc'))).toBe(true);
    const rate = COLUMNS.find((c) => c.key === 'rate')!;
    expect(readCell(rate, 'NILL')).toEqual({ value: null });
    expect(readCell(rate, '7%')).toEqual({ value: 7 });
    expect('error' in readCell(COLUMNS.find((c) => c.key === 'amount')!, 'two')).toBe(true);
  });

  it('reads blocks pasted from Excel / Google Sheets', () => {
    expect(parseClipboard('A\tB\n1\t2\n')).toEqual([
      ['A', 'B'],
      ['1', '2'],
    ]);
    expect(parseClipboard('"line\none"\tx')).toEqual([['line\none', 'x']]);
  });
});

describe('importing their sheets', () => {
  const head = ['S/N', 'BRANCH', 'DATE', 'NAME AS ON ALERT PRINT OUT', 'BANK', 'AMOUNT', 'PROMO', "ACTUAL CLIENT'S NAME", "MARKETER's FULL NAME", 'SUPERVISOR', 'DESIGNATION', 'ACCOUNT NUMBER', 'SPOUSE NAME', 'SPOUSE ACCOUNT', 'CABAL ID', 'LAND', 'FORM', 'RATE', 'ACCOUNTANT COMMENT', 'POSTING STATUS', 'AMOUNT', 'CONFIRMATION', 'OFFICER', 'CONFIRMATION COMMENT', 'CLEARANCE', 'COMMENT'];
  const c = (v: string | number | null, date = false): OutCell => ({ v, date });
  const row = (sn: number, alert: string, amount: number, extra: Record<number, string | number> = {}) => {
    const cells = [sn, 'FAGBA', '2026-10-09', alert, 'ZENITH', amount, '', alert, 'KENNETH IPOGAH', 'DSM', 'DDSM', 2086969424, 'SOPHIA IPOGAH', 2409077757, 3000076199 + sn, amount, '', 7, '', 'POSTED', amount, 'CONFIRMED', 'OMOSEKEJI ADENIYI', '', '', ''].map((v, i) => c(i in extra ? extra[i] : v, i === 2));
    return cells;
  };

  it('finds the columns by header, skips formula-only rows and tidies messy values', async () => {
    const bytes = await xlsxBytes([
      {
        name: 'OGBAFAGBA',
        rows: [
          [c('CLIENT DETAILS'), ...Array(7).fill(c(null)), c("MARKETER'S DETAILS")],
          head.map((h) => c(h)),
          row(1, 'SHODE MARY', 100000),
          row(2, 'NOSAZENA ELLORA', 67000, { 17: 'NILL', 19: 'INFLOW DECLARED IN SEPTEMBER BUT COMMISSION RATE WAS 7% INSTEAD OF 10%', 16: 'TRANSFER FEE' }),
          [c(3), ...Array(23).fill(c(null)), c('NOT CLEARED'), c(30000103168)], // copied-down formulas only
        ],
      },
    ]);
    const file = readFile('OCTOBER WORKFLOW 2026.xlsx', await readXlsx(bytes), '2026-01');
    expect(file.kind).toBe('land');
    expect(file.month).toBe('2026-10');
    const tab = file.tabs[0];
    expect(tab.name).toBe('OGBAFAGBA');
    expect(tab.branch).toBe('FAGBA');
    expect(tab.rows).toHaveLength(2);
    expect(tab.emptySkipped).toBe(1);
    const [a, b] = tab.rows;
    expect(a.date).toBe('2026-10-09');
    expect(a.accountNumber).toBe('2086969424');
    expect(a.confirmAmount).toBe(100000);
    expect(b.rate).toBeNull();
    expect(b.form).toBe('TRANSFER FEE');
    expect(b.postingStatus).toBe('');
    expect(b.accountantComment).toMatch(/^INFLOW DECLARED/);
    expect(tab.fixes.join(' ')).toMatch(/NILL/);
  });

  it('guesses the sheet and month from file names', () => {
    expect(kindFromName('OCTOBER NEW CLIENT  WORK FLOW 2026 (2).xlsx')).toBe('new');
    expect(kindFromName('INFRASTRUCTURE AND OTHER FEES OCTOBER 2026.xlsx')).toBe('infra');
    expect(kindFromName('OCTOBER WORKFLOW 2026.xlsx')).toBe('land');
    expect(monthFromName('OCTOBER WORKFLOW 2026')).toBe('2026-10');
    expect(monthFromName('Sept slides')).toBeNull();
    expect(tabFromCsvName('OCTOBER WORKFLOW 2026 - ABULE EGBA.csv')).toBe('ABULE EGBA');
  });

  it('reads CSV downloads', () => {
    expect(readCsv('﻿S/N,NAME\r\n1,"ADE, JOHN"\r\n')).toEqual([
      ['S/N', 'NAME'],
      ['1', 'ADE, JOHN'],
    ]);
  });

  it('adds only what is new; several plots on one day stay separate', () => {
    const existing = [pay({ id: 'x1', pos: 0, cabalId: '30000102362' })];
    const sameAgain = pay({ cabalId: '30000102362' });
    const secondPlot = pay({ cabalId: '30000102390' });
    const plan = planImport(existing, [sameAgain, secondPlot], '2026-10', false);
    expect(plan.same).toBe(1);
    expect(plan.add).toHaveLength(1);
    expect(plan.add[0].pos).toBe(1);
    expect(plan.add[0].cabalId).toBe('30000102390');
  });

  it('a row that got its CABAL ID since the last import is the same row (updated when asked)', () => {
    const existing = [pay({ id: 'x1', cabalId: 'NEW & FORM', confirmation: '' })];
    const now = pay({ cabalId: '30000104027', confirmation: 'CONFIRMED' });
    expect(planImport(existing, [now], '2026-10', false)).toMatchObject({ same: 1, add: [] });
    const up = planImport(existing, [now], '2026-10', true);
    expect(up.update).toHaveLength(1);
    expect(up.update[0]).toMatchObject({ id: 'x1', cabalId: '30000104027', confirmation: 'CONFIRMED' });
  });

  it('builds the roster from the rows, with details from the latest row', () => {
    const rows = [pay({ marketer: 'Alex  Adewole', supervisor: 'RRO', date: '2026-10-01' }), pay({ marketer: 'ALEX ADEWOLE', supervisor: 'DCRO AYANYEMI', date: '2026-10-13' })];
    const r = newMarketers(rows, []);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ name: 'ALEX ADEWOLE', supervisor: 'DCRO AYANYEMI', branch: 'FAGBA' });
    expect(newMarketers(rows, ['alex adewole'])).toHaveLength(0);
  });
});

describe('exporting', () => {
  it('writes their layout: group row, header row, rows; CSV is rows only in column order', async () => {
    const rows = [pay({ pos: 0 }), pay({ pos: 1, alertName: 'B', amount: 5 })];
    const sheet = sheetFor(rows, 'land', 'OGBAFAGBA', '2026-10');
    expect(sheet.merges).toContain('A1:H1');
    expect(sheet.rows[1][3].v).toBe('NAME AS ON ALERT PRINT OUT');
    expect(sheet.rows).toHaveLength(4);
    const csv = csvRows(rows, 'land', 'OGBAFAGBA', '2026-10').trim().split('\r\n');
    expect(csv).toHaveLength(2);
    expect(csv[0].split(',').slice(0, 6)).toEqual(['1', 'FAGBA', '2026-10-09', 'SHODE MARY', 'GTB', '100000']);
    const back = readFile('OCTOBER WORKFLOW 2026.xlsx', await readXlsx(await xlsxBytes([sheet])), '2026-01');
    expect(back.tabs[0].rows.map((r) => r.amount)).toEqual([100000, 5]);
    expect(paymentKey(back.tabs[0].rows[0])).toBe(paymentKey(rows[0]));
  });
});

describe('the monthly deck', () => {
  const marketers = [
    mk('KENNETH IPOGAH', { team: 'Vidco Team', lead: true, designation: 'DDSM' }),
    mk('ANJORIN AYOBAMI', { team: 'Vidco Team' }),
    mk('ESTHER GABRIEL', { designation: 'INDEPENDENT' }),
    mk('ARTHUR NYONG ETIM', { branch: 'ABULE EGBA', aliases: ['ARTHUR NYONG STIM'], designation: 'RRO' }),
  ];
  const payments = [
    pay({ amount: 300000 }),
    pay({ kind: 'infra', amount: 50000 }),
    pay({ kind: 'new', amount: 60000, clientName: 'AKINDUTIRE PELUMI' }),
    pay({ kind: 'new', amount: 60000, clientName: 'akindutire pelumi', alertName: 'other alert' }),
    pay({ marketer: 'ANJORIN AYOBAMI', amount: 20000, confirmation: 'PROVIDE EVIDENCE' }),
    pay({ marketer: 'ESTHER GABRIEL', amount: 133000 }),
    pay({ tab: 'ABULE EGBA', branch: 'ABULE EGBA', marketer: 'ARTHUR NYONG STIM', amount: 1560000 }),
  ];
  const input = { region: 'Fagba Region', month: '2026-10', payments, marketers, tabs: [{ name: 'OGBAFAGBA', branch: 'FAGBA' }, { name: 'ABULE EGBA', branch: 'ABULE EGBA' }], summary: [], history: [], countAll: false };
  const table = (items: ReturnType<typeof buildAccountsDeck>, id: string) => {
    const s = items.find((i) => i.id === id)!.slide;
    if (s.kind !== 'table') throw new Error(id);
    return s.table;
  };

  it('has their slides per branch, with confirmed payments only by default', () => {
    const items = buildAccountsDeck(input);
    expect(items.filter((i) => !i.extra).map((i) => i.id)).toEqual([
      'cover:FAGBA',
      'senior:FAGBA',
      'team:FAGBA:Vidco Team',
      'others:FAGBA',
      'summary:FAGBA',
      'trend:FAGBA',
      'cover:ABULE EGBA',
      'others:ABULE EGBA',
      'summary:ABULE EGBA',
      'trend:ABULE EGBA',
      'thanks',
    ]);
    const team = table(items, 'team:FAGBA:Vidco Team');
    expect(team.head).toEqual(['MARKETERS NAME', 'DESIGNATION', 'INFLOW', 'INFRAS', 'TOTAL', 'NC']);
    // Kenneth: 300,000 + two new-client payments (one client) = 420,000 inflow, 50,000 infra, 1 NC.
    expect(team.rows[0]).toEqual(['KENNETH IPOGAH', 'DDSM', money(420000), money(50000), money(470000), '1']);
    // Anjorin's payment isn't confirmed yet: not counted.
    expect(team.rows[1]).toEqual(['ANJORIN AYOBAMI', 'BE', '-', '-', '-', '-']);
    expect(table(items, 'summary:FAGBA').total).toEqual(['TOTAL', money(553000), money(50000), money(603000), '1']);
    // Another spelling still counts for the right person.
    expect(table(items, 'others:ABULE EGBA').rows[0].slice(0, 3)).toEqual(['ARTHUR NYONG ETIM', 'RRO', money(1560000)]);
    const trend = table(items, 'trend:FAGBA');
    expect(trend.rows[9][0]).toBe('OCTOBER');
    expect(trend.rows[9][3]).toBe(money(603000));
  });

  it('can count every payment instead', () => {
    const items = buildAccountsDeck({ ...input, countAll: true });
    expect(table(items, 'team:FAGBA:Vidco Team').rows[1][2]).toBe(money(20000));
  });

  it('keeps the accountant’s ticks, order and titles; new slides land in place', () => {
    const items = buildAccountsDeck(input);
    // The accountant put the summary first last month (the order is saved in full) …
    const saved = items.map((i) => i.id).filter((id) => id !== 'team:FAGBA:Vidco Team');
    saved.splice(saved.indexOf('summary:FAGBA'), 1);
    saved.unshift('summary:FAGBA');
    const out = applyPrefs(items, { off: ['others:FAGBA'], on: ['top:FAGBA'], order: saved, titles: [{ id: 'cover:FAGBA', title: 'FAGBA CONTINENT PERFORMANCE REVIEW' }] });
    expect(out.map((x) => x.item.id).slice(0, 4)).toEqual(['summary:FAGBA', 'cover:FAGBA', 'senior:FAGBA', 'team:FAGBA:Vidco Team']);
    // … and a team that's new this month appears after the slide before it (senior staff).
    expect(out[1].item.slide.title).toBe('FAGBA CONTINENT PERFORMANCE REVIEW');
    expect(out.find((x) => x.item.id === 'others:FAGBA')!.on).toBe(false);
    expect(out.find((x) => x.item.id === 'top:FAGBA')!.on).toBe(true);
    expect(out.find((x) => x.item.id === 'pending:FAGBA')!.on).toBe(false);
    expect(out).toHaveLength(items.length);
  });
});

describe('same person, different spelling', () => {
  it('spots typos and swapped names, not different people', () => {
    expect(nameScore('ARTHUR NYONG STIM', 'ARTHUR NYONG ETIM')).toBeGreaterThanOrEqual(LIKELY);
    expect(nameScore('SENAIKE MARGRETE', 'SENAIKE MARGARET')).toBeGreaterThanOrEqual(LIKELY);
    expect(nameScore('Kenneth Ipogah', 'IPOGAH KENNETH')).toBeGreaterThanOrEqual(LIKELY);
    expect(nameScore('KENNETH IPOGAH', 'SOPHIA IPOGAH')).toBeLessThan(LIKELY);
    expect(nameScore('AYANYEMI ADEKUNLE', 'ADEOLA BAKARE')).toBeLessThan(LIKELY);
    const groups = similarGroups(['OLOGBENLA KENNRTH', 'OLOGBENLA KENNETH', 'ADEOLA BAKARE'], (s) => s);
    expect(groups).toEqual([['OLOGBENLA KENNRTH', 'OLOGBENLA KENNETH']]);
  });
});
