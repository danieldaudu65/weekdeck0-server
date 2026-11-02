/**
 * Reads the accountant's monthly inflow report (one Excel file per branch),
 * the file she makes her slides from:
 *
 *   cover tab   "FAGBA INFLOW REPORT FOR THE MONTH OF SEPTEMBER, 2026"
 *   TEAM'S REPORT  S/N | NAME | DESIGNATION | LAND | HOUSE | INFRAS/OTHER FEES | TOTAL | NEW CLIENTS
 *                  … in team order (team head first), an "OTHERS" row, then GRAND TOTAL
 *
 * Only TEAM'S REPORT feeds the slides. The other tabs are read for one thing:
 * names spelled differently there (KADRI / KADIRI), so she can say which is right.
 */
import { MONTH_NAMES, nameKey } from './columns';
import { LIKELY, nameScore } from './names';
import type { Cell, SheetData } from './xlsx';

export interface ReportRow {
  name: string;
  designation: string;
  land: number;
  house: number;
  infra: number;
  nc: number;
  /** Below the "OTHERS" row of the file. */
  others: boolean;
  /** The TOTAL cell as typed in the file (null when empty). */
  typedTotal: number | null;
}

export interface ReportFile {
  fileName: string;
  /** "FAGBA", "ABULE EGBA" ('' when the file doesn't say). */
  branch: string;
  /** "2026-09" ('' when the file doesn't say). */
  month: string;
  /** The tab the rows came from. */
  sheet: string;
  rows: ReportRow[];
  /** The file's GRAND TOTAL row. */
  grand: { land: number; house: number; infra: number; total: number; nc: number } | null;
  /** Other spellings of a row's name in the file's other tabs, by row name. */
  spellings: Record<string, { spelling: string; sheet: string }[]>;
}

export class ReportError extends Error {}

const SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const str = (c: Cell | undefined) => (c === null || c === undefined ? '' : String(c)).replace(/\s+/g, ' ').trim();

/** A figure as the sheet holds it: 3333694.7, "3,333,694.70", "-", "" → number (0 when empty). */
export function figure(c: Cell | undefined): number {
  if (typeof c === 'number') return Number.isFinite(c) ? c : 0;
  const s = str(c).replace(/[₦,\s]/g, '');
  if (!s || /^-+$/.test(s)) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "SEPTEMBER, 2026" / "SEPT 2026" / "SEPT 26" → "2026-09". */
export function monthFrom(text: string): string {
  const t = text.toUpperCase();
  const m = /\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|JUN|JUL|AUG|SEPT|SEP|OCT|NOV|DEC)\b[\s,.]*'?(\d{4}|\d{2})?\b/.exec(t);
  if (!m) return '';
  const i = SHORT.indexOf(m[1].slice(0, 3));
  if (i < 0) return '';
  let year = m[2] ? Number(m[2]) : NaN;
  if (year < 100) year += 2000;
  if (!Number.isFinite(year)) {
    const y = /\b(20\d{2})\b/.exec(t);
    if (!y) return '';
    year = Number(y[1]);
  }
  return `${year}-${String(i + 1).padStart(2, '0')}`;
}

/** "FAGBA INFLOW REPORT FOR THE MONTH OF SEPTEMBER, 2026" → { branch, month }. */
function coverInfo(sheets: SheetData[]): { branch: string; month: string } {
  for (const s of sheets)
    for (const row of s.rows)
      for (const c of row) {
        const t = str(c).toUpperCase();
        const m = /^(.+?)\s+INFLOW\s+REPORT\b(.*)$/.exec(t);
        if (m && !t.includes('!')) return { branch: m[1].replace(/\s+/g, ' ').trim(), month: monthFrom(m[2]) };
      }
  // Else the tab names: "FAGBA INFLOW REPORT SEPT 2026".
  for (const s of sheets) {
    const m = /^(.+?)\s+(?:SEPT?\s*\d+\s+)?INFLOW\s+REPORT\b(.*)$/i.exec(s.name.trim());
    if (m) return { branch: m[1].toUpperCase().trim(), month: monthFrom(s.name) };
  }
  return { branch: '', month: '' };
}

interface Header {
  at: number;
  name: number;
  designation: number;
  land: number;
  house: number;
  infra: number;
  total: number;
  nc: number;
}

function findHeader(rows: Cell[][]): Header | null {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const h = (rows[r] ?? []).map((c) => str(c).toUpperCase());
    const name = h.findIndex((x) => x === 'NAME' || x === 'NAMES' || /MARKETER'?S? NAME/.test(x));
    const land = h.findIndex((x) => /^LAND\b/.test(x));
    if (name < 0 || land < 0) continue;
    return {
      at: r,
      name,
      land,
      designation: h.findIndex((x) => /^DESIG/.test(x)),
      house: h.findIndex((x) => /^HOUSE/.test(x)),
      infra: h.findIndex((x, i) => i !== land && /INFRA/.test(x)),
      total: h.findIndex((x) => /^TOTAL\b/.test(x)),
      nc: h.findIndex((x) => /NEW CLIENT|^NC$/.test(x)),
    };
  }
  return null;
}

/** Words in order-free form: "SOBANDE BABATUNDE" and "BABATUNDE SOBANDE" are the same spelling. */
const wordsKey = (s: string) => nameKey(s).split(' ').sort().join(' ');

export function readReport(sheets: SheetData[], fileName: string): ReportFile {
  // The team report: the tab called TEAM'S REPORT, else the first tab with NAME and LAND columns.
  const withHead = sheets.map((s) => ({ s, h: findHeader(s.rows) })).filter((x) => x.h);
  const pick = withHead.find((x) => /TEAM/i.test(x.s.name)) ?? withHead[0];
  if (!pick) throw new ReportError('No team report in this file. It needs a tab with NAME, DESIGNATION, LAND, INFRAS, TOTAL and NEW CLIENTS columns (like “TEAM’S REPORT”).');
  const { s: sheet, h } = pick as { s: SheetData; h: Header };

  const rows: ReportRow[] = [];
  let others = false;
  let grand: ReportFile['grand'] = null;
  const at = (row: Cell[], i: number) => (i >= 0 ? row[i] : null);
  for (let r = h.at + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r] ?? [];
    const name = str(at(row, h.name)).toUpperCase();
    const land = figure(at(row, h.land));
    const house = figure(at(row, h.house));
    const infra = figure(at(row, h.infra));
    const nc = figure(at(row, h.nc));
    const totalCell = at(row, h.total);
    if (/^(GRAND\s+)?TOTALS?$/.test(name)) {
      grand = { land, house, infra, total: figure(totalCell), nc };
      break;
    }
    if (!name) continue;
    if (/^OTHERS?$/.test(name)) {
      others = true;
      continue;
    }
    rows.push({
      name,
      designation: str(at(row, h.designation)).toUpperCase(),
      land: round2(land),
      house: round2(house),
      infra: round2(infra),
      nc: Math.round(nc),
      others,
      typedTotal: str(totalCell) === '' ? null : round2(figure(totalCell)),
    });
  }
  if (!rows.length) throw new ReportError(`“${sheet.name}” has no marketers under its headings.`);

  // The same people in the other tabs, spelled another way.
  const elsewhere: { spelling: string; sheet: string }[] = [];
  for (const x of withHead) {
    if (x.s === sheet) continue;
    for (let r = x.h!.at + 1; r < x.s.rows.length; r++) {
      const n = str(x.s.rows[r]?.[x.h!.name]).toUpperCase();
      if (n && !/^(GRAND\s+)?TOTALS?$|^OTHERS?$|^OPERATIONS?$|^ADRON$/.test(n)) elsewhere.push({ spelling: n, sheet: x.s.name.trim() });
    }
  }
  const spellings: ReportFile['spellings'] = {};
  for (const row of rows) {
    const seen = new Set<string>();
    for (const e of elsewhere) {
      if (wordsKey(e.spelling) === wordsKey(row.name) || seen.has(wordsKey(e.spelling))) continue;
      // A name with a word more or less ("AROYEHUN MATTHEW") is a short form, not a misspelling.
      const a = new Set(nameKey(row.name).split(' '));
      const b = new Set(nameKey(e.spelling).split(' '));
      if ([...a].every((w) => b.has(w)) || [...b].every((w) => a.has(w))) continue;
      // Someone else entirely in this file? Then it isn't another spelling.
      if (rows.some((o) => o !== row && wordsKey(o.name) === wordsKey(e.spelling))) continue;
      if (nameScore(row.name, e.spelling) >= LIKELY) {
        seen.add(wordsKey(e.spelling));
        (spellings[row.name] ??= []).push(e);
      }
    }
  }

  const info = coverInfo(sheets);
  return { fileName, branch: info.branch, month: info.month, sheet: sheet.name.trim(), rows, grand, spellings };
}

/* ------------------------------------------------------------------ checks */

export interface RowTotalIssue {
  kind: 'rowTotal';
  name: string;
  typed: number;
  parts: number;
}
export interface GrandIssue {
  kind: 'grand';
  what: 'land' | 'infra' | 'total' | 'nc';
  file: number;
  rows: number;
}
export type ReportIssue = RowTotalIssue | GrandIssue;

export const rowTotal = (r: Pick<ReportRow, 'land' | 'house' | 'infra'>) => round2(r.land + r.house + r.infra);

/** What doesn't add up in the file. */
export function checkReport(f: ReportFile): ReportIssue[] {
  const out: ReportIssue[] = [];
  for (const r of f.rows) if (r.typedTotal !== null && Math.abs(r.typedTotal - rowTotal(r)) > 0.01) out.push({ kind: 'rowTotal', name: r.name, typed: r.typedTotal, parts: rowTotal(r) });
  if (f.grand) {
    const sum = (k: 'land' | 'house' | 'infra' | 'nc') => round2(f.rows.reduce((a, r) => a + r[k], 0));
    const rows = { land: sum('land') + sum('house'), infra: sum('infra'), total: round2(sum('land') + sum('house') + sum('infra')), nc: sum('nc') };
    const file = { land: round2(f.grand.land + f.grand.house), infra: f.grand.infra, total: f.grand.total, nc: f.grand.nc };
    for (const what of ['land', 'infra', 'total', 'nc'] as const) if (Math.abs(file[what] - rows[what]) > 0.01) out.push({ kind: 'grand', what, file: file[what], rows: rows[what] });
  }
  return out;
}

export const monthLabel = (m: string) => (m ? `${MONTH_NAMES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}` : '');
