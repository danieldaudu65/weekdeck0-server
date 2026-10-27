/**
 * Turns the accountant's own files (Excel, or Google Sheets downloaded as
 * .xlsx / .csv) into workbook rows, and works out what is new.
 *
 * What their real sheets look like, and what is done about it:
 * - two header rows (group row, then column names): columns are found by their
 *   header name, so a moved column still lands in the right place;
 * - formulas filled down to row ~1000 make empty rows look full: a row with no
 *   alert name, client, marketer or amount is skipped;
 * - "NILL" in RATE, "NEW & FORM" in CABAL ID, a long note typed into POSTING
 *   STATUS: cleaned and listed on the check screen.
 */
import { COLUMNS, CONFIRMATION, KINDS, MONTH_NAMES, POSTING, baseKey, cabalKey, columnsFor, emptyPayment, isBlank, nameKey, parseDate, parseMoney, paymentKey, type FieldKey, type Kind, type Payment } from './columns';
import { serialToIso, type Cell, type SheetData } from './xlsx';

export interface ImportTab {
  /** Sheet tab name as in their file: "OGBAFAGBA VIDCO". */
  name: string;
  /** Most common BRANCH value in the tab ("FAGBA"). */
  branch: string;
  rows: Payment[];
  /** Rows skipped because they were empty (formula filler). */
  emptySkipped: number;
  /** What was tidied, in plain words. */
  fixes: string[];
  /** Header row not found: columns read in the standard order. */
  guessedColumns: boolean;
}

export interface ImportFile {
  fileName: string;
  kind: Kind;
  month: string;
  tabs: ImportTab[];
}

const normHeader = (s: unknown) =>
  String(s ?? '')
    .toUpperCase()
    .replace(/[’'`]/g, '')
    .replace(/[^A-Z0-9/() ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Header text → the field(s) it fills, in order of appearance (AMOUNT appears twice, CLEARANCE four times). */
const HEADER_FIELDS: Record<string, FieldKey[]> = {
  'S/N': ['sn'],
  SN: ['sn'],
  'S N': ['sn'],
  BRANCH: ['branch'],
  DATE: ['date'],
  'NAME AS ON ALERT PRINT OUT': ['alertName'],
  'NAME AS ON ALERT': ['alertName'],
  BANK: ['bank'],
  AMOUNT: ['amount', 'confirmAmount'],
  PROMO: ['promo'],
  'ACTUAL CLIENTS NAME': ['clientName'],
  'CLIENTS NAME': ['clientName'],
  'MARKETERS FULL NAME': ['marketer'],
  'MARKETERS NAME': ['marketer'],
  SUPERVISOR: ['supervisor'],
  DESIGNATION: ['designation'],
  'ACCOUNT NUMBER': ['accountNumber'],
  'SPOUSE NAME': ['spouseName'],
  'SPOUSE ACCOUNT': ['spouseAccount'],
  'CABAL ID': ['cabalId'],
  LAND: ['land'],
  FORM: ['form'],
  RATE: ['rate'],
  'ACCOUNTANT COMMENT': ['accountantComment'],
  'POSTING STATUS': ['postingStatus'],
  CONFIRMATION: ['confirmation'],
  OFFICER: ['officer'],
  'CONFIRMATION COMMENT': ['confirmationComment'],
  CLEARANCE: ['clearance', 'w2Clearance', 'w3Clearance', 'w4Clearance'],
  COMMENT: ['comment', 'w2Comment', 'w3Comment', 'w4Comment'],
};

/** Finds the column-name row (S/N, BRANCH, DATE …) in the first rows. */
function findHeader(rows: Cell[][]): { index: number; map: Map<number, FieldKey> } | null {
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const row = rows[i] ?? [];
    const names = row.map(normHeader);
    const hits = names.filter((n) => HEADER_FIELDS[n]).length;
    if (hits < 5 || !names.includes('AMOUNT')) continue;
    const seen = new Map<string, number>();
    const map = new Map<number, FieldKey>();
    names.forEach((n, col) => {
      const fields = HEADER_FIELDS[n];
      if (!fields) return;
      const k = seen.get(n) ?? 0;
      seen.set(n, k + 1);
      if (fields[k]) map.set(col, fields[k]);
    });
    return { index: i, map };
  }
  return null;
}

const COL_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]));

const asText = (v: Cell) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return String(v).replace(/\s+/g, ' ').trim();
};

function asDate(v: Cell): string | null {
  if (v === null || v === '') return '';
  if (typeof v === 'number') return v > 20000 && v < 80000 ? serialToIso(v) : null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return parseDate(s.slice(0, 10));
  // "Fri Oct 09 2026" or "October 9, 2026" (sometimes in CSV downloads)
  return parseDate(s) ?? (Number.isNaN(Date.parse(s)) ? null : new Date(Date.parse(s) + 12 * 3600e3).toISOString().slice(0, 10));
}

function asNumber(v: Cell): number | null {
  if (v === null || v === '') return null;
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  return parseMoney(String(v));
}

/** "OCTOBER WORKFLOW 2026.xlsx" → land; "NEW CLIENT" → new; "INFRASTRUCTURE" → infra. */
export function kindFromName(fileName: string, header?: Map<number, FieldKey>): Kind {
  const n = fileName.toUpperCase();
  if (/NEW\s*_*CLIENT/.test(n)) return 'new';
  if (/INFRA|OTHER\s*_*FEES/.test(n)) return 'infra';
  if (/WORK\s*_*FLOW/.test(n)) return 'land';
  if (header && [...header.values()].includes('w2Clearance')) return 'new';
  return 'land';
}

/** "OCTOBER WORKFLOW 2026" → "2026-10". */
export function monthFromName(fileName: string): string | null {
  const n = fileName.toUpperCase();
  const mi = MONTH_NAMES.findIndex((m) => n.includes(m.toUpperCase()) || new RegExp(`\\b${m.slice(0, 3).toUpperCase()}\\b`).test(n));
  const y = /\b(20\d{2})\b/.exec(n)?.[1];
  return mi >= 0 && y ? `${y}-${String(mi + 1).padStart(2, '0')}` : null;
}

/** "OCTOBER WORKFLOW 2026 - OGBAFAGBA.csv" → "OGBAFAGBA" (how Google Sheets names a downloaded tab). */
export function tabFromCsvName(fileName: string): string {
  const base = fileName.replace(/\.[a-z0-9]+$/i, '');
  const parts = base.split(' - ');
  return (parts.length > 1 ? parts[parts.length - 1] : base).trim().toUpperCase();
}

const mostCommon = (values: string[]) => {
  const c = new Map<string, number>();
  for (const v of values) if (v) c.set(v, (c.get(v) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
};

export function readTab(sheet: SheetData, kind: Kind): ImportTab {
  const header = findHeader(sheet.rows);
  const fixes: string[] = [];
  let map: Map<number, FieldKey>;
  let start: number;
  if (header) {
    map = header.map;
    start = header.index + 1;
  } else {
    // No header: the standard order, data from the first row that has an amount.
    map = new Map(columnsFor(kind).map((c, i) => [i, c.key]));
    start = 0;
  }

  const rows: Payment[] = [];
  let emptySkipped = 0;
  let nill = 0;
  let noId = 0;
  let movedNotes = 0;
  let badDates = 0;
  let badNumbers = 0;
  let numericComments = 0;
  for (let r = start; r < sheet.rows.length; r++) {
    const cells = sheet.rows[r] ?? [];
    const p = emptyPayment('', kind, sheet.name.trim().toUpperCase(), rows.length);
    delete p.tmp;
    const notes: string[] = [];
    for (const [col, key] of map) {
      const v = cells[col] ?? null;
      const c = COL_BY_KEY.get(key)!;
      if (c.type === 'date') {
        const d = asDate(v);
        if (d === null) {
          badDates++;
          (p as Record<string, unknown>)[key] = '';
        } else (p as Record<string, unknown>)[key] = d;
      } else if (c.type === 'money' || c.type === 'number') {
        if (key === 'rate' && typeof v === 'string' && /^(nill?|nil|none|-)$/i.test(v.trim())) {
          nill++;
          p.rate = null;
          continue;
        }
        const n = asNumber(v);
        if (Number.isNaN(n)) {
          // Text in a number column: keep it, in the comment, so nothing is lost.
          badNumbers++;
          (p as Record<string, unknown>)[key] = null;
          notes.push(`${c.header}: ${asText(v)}`);
        } else (p as Record<string, unknown>)[key] = n;
      } else (p as Record<string, unknown>)[key] = asText(v);
    }
    // Skip rows that are only formulas copied down (S/N, clearance, a copied CABAL ID…).
    if (!p.alertName && !p.clientName && !p.marketer && (p.amount === null || p.amount === 0)) {
      if (!isBlank(p)) emptySkipped++;
      continue;
    }
    if (notes.length) p.accountantComment = [p.accountantComment, ...notes].filter(Boolean).join(' · ');
    if (/^NEW\s*&\s*FORM$/i.test(p.cabalId)) noId++;
    if (p.postingStatus && !POSTING.includes(p.postingStatus.toUpperCase()) && p.postingStatus.length > 25) {
      p.accountantComment = [p.accountantComment, p.postingStatus].filter(Boolean).join(' · ');
      p.postingStatus = '';
      movedNotes++;
    }
    if (p.accountantComment && /^-?\d+(\.\d+)?$/.test(p.accountantComment)) numericComments++;
    for (const k of ['bank', 'confirmation', 'postingStatus', 'designation', 'clearance'] as const) p[k] = p[k].toUpperCase();
    if (p.confirmation && !CONFIRMATION.includes(p.confirmation) && /^CONFIRM/i.test(p.confirmation)) p.confirmation = 'CONFIRMED';
    p.sn = rows.length + 1;
    p.pos = rows.length;
    rows.push(p);
  }

  if (emptySkipped) fixes.push(`${emptySkipped} empty row${emptySkipped === 1 ? '' : 's'} (only formulas) skipped`);
  if (nill) fixes.push(`RATE "NILL" left empty in ${nill} row${nill === 1 ? '' : 's'}`);
  if (noId) fixes.push(`${noId} row${noId === 1 ? ' has' : 's have'} no CABAL ID yet ("NEW & FORM")`);
  if (movedNotes) fixes.push(`${movedNotes} long note${movedNotes === 1 ? '' : 's'} moved from POSTING STATUS to ACCOUNTANT COMMENT`);
  if (numericComments) fixes.push(`ACCOUNTANT COMMENT holds numbers in ${numericComments} row${numericComments === 1 ? '' : 's'} (e.g. 0.5): kept as they are, not used in totals`);
  if (badDates) fixes.push(`${badDates} date${badDates === 1 ? '' : 's'} couldn’t be read and were left empty`);
  if (badNumbers) fixes.push(`${badNumbers} number cell${badNumbers === 1 ? ' had' : 's had'} text in it: moved to ACCOUNTANT COMMENT`);
  return { name: sheet.name.trim().toUpperCase(), branch: mostCommon(rows.map((r) => r.branch.toUpperCase())), rows, emptySkipped, fixes, guessedColumns: !header };
}

/** One uploaded file → its tabs. `fallbackMonth` when neither the name nor the dates say. */
export function readFile(fileName: string, sheets: SheetData[], fallbackMonth: string): ImportFile {
  const firstHeader = sheets.map((s) => findHeader(s.rows)).find(Boolean)?.map;
  const kind = kindFromName(fileName, firstHeader);
  const isCsv = /\.csv$/i.test(fileName);
  const tabs = sheets.map((s) => readTab(isCsv ? { ...s, name: tabFromCsvName(fileName) } : s, kind)).filter((t) => t.rows.length || t.emptySkipped);
  const dates = tabs.flatMap((t) => t.rows.map((r) => r.date.slice(0, 7))).filter(Boolean);
  const month = monthFromName(fileName) ?? (mostCommon(dates) || fallbackMonth);
  // Dates far from the month are usually typos (29/11/2013 in October 2026).
  const [y, m] = month.split('-').map(Number);
  for (const t of tabs) {
    const odd = t.rows.filter((r) => r.date && Math.abs(Number(r.date.slice(0, 4)) * 12 + Number(r.date.slice(5, 7)) - (y * 12 + m)) > 3);
    if (odd.length) t.fixes.push(`Check the date in row${odd.length === 1 ? '' : 's'} ${odd.map((r) => `${r.sn} (${r.date.split('-').reverse().join('/')})`).join(', ')}: far from the month`);
  }
  return { fileName, kind, month, tabs };
}

/* ------------------------------------------------------------------ planning */

export interface Plan {
  add: Payment[];
  update: Payment[];
  /** Already in the workbook exactly as in the file. */
  same: number;
  /** Rows that appear twice in the file itself, CABAL ID included (both imported, marked on the check screen). */
  twiceInFile: number;
}

const FIELDS = COLUMNS.map((c) => c.key).filter((k) => k !== 'sn');

/**
 * What importing these rows into a month's workbook would do. Rows already
 * there (same payment key) are left alone, or brought up to date from the
 * file when `update` is on.
 */
export function planImport(existing: Payment[], incoming: Payment[], month: string, update: boolean): Plan {
  // Rows already in the month, findable by full key, and (when they have no CABAL ID yet) by the rest of the key.
  const byKey = new Map<string, Payment[]>();
  const noIdByBase = new Map<string, Payment[]>();
  const nextPos = new Map<string, number>();
  for (const p of existing) {
    if (p.month !== month) continue;
    const k = paymentKey(p);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(p);
    if (!cabalKey(p.cabalId)) {
      const b = baseKey(p);
      if (!noIdByBase.has(b)) noIdByBase.set(b, []);
      noIdByBase.get(b)!.push(p);
    }
    const tk = `${p.kind}|${p.tab}`;
    nextPos.set(tk, Math.max(nextPos.get(tk) ?? 0, (p.pos ?? 0) + 1));
  }
  const used = new Set<Payment>();
  const take = (list: Payment[] | undefined) => list?.find((p) => !used.has(p));

  const seenInFile = new Map<string, number>();
  const plan: Plan = { add: [], update: [], same: 0, twiceInFile: 0 };
  for (const row of incoming) {
    const key = paymentKey(row);
    const n = seenInFile.get(key) ?? 0;
    if (n) plan.twiceInFile++;
    seenInFile.set(key, n + 1);
    // Same payment already there; or there without its CABAL ID yet (the file now has it).
    const there = take(byKey.get(key)) ?? (cabalKey(row.cabalId) ? take(noIdByBase.get(baseKey(row))) : undefined);
    if (there) {
      used.add(there);
      const changed = FIELDS.filter((f) => row[f] !== null && row[f] !== '' && row[f] !== there[f]);
      if (update && changed.length) {
        const next = { ...there };
        for (const f of changed) (next as Record<string, unknown>)[f] = row[f];
        plan.update.push(next);
      } else plan.same++;
      continue;
    }
    const tabKey = `${row.kind}|${row.tab}`;
    const pos = nextPos.get(tabKey) ?? 0;
    nextPos.set(tabKey, pos + 1);
    plan.add.push({ ...row, month, pos, sn: pos + 1, tmp: `imp${plan.add.length}` });
  }
  return plan;
}

/* ------------------------------------------------------------------ roster */

export interface RosterEntry {
  name: string;
  designation: string;
  supervisor: string;
  accountNumber: string;
  spouseName: string;
  spouseAccount: string;
  branch: string;
}

/**
 * Marketers found in imported rows who aren't on the roster yet, with their
 * details from their latest row. `known` = names and other spellings already on it.
 */
export function newMarketers(rows: Payment[], known: string[]): RosterEntry[] {
  const have = new Set(known.map(nameKey));
  const latest = new Map<string, Payment[]>();
  for (const r of rows) {
    const k = nameKey(r.marketer);
    if (!k || have.has(k)) continue;
    if (!latest.has(k)) latest.set(k, []);
    latest.get(k)!.push(r);
  }
  return [...latest.values()].map((list) => {
    const sorted = [...list].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const pick = (f: 'designation' | 'supervisor' | 'accountNumber' | 'spouseName' | 'spouseAccount') => sorted.find((r) => r[f])?.[f] ?? '';
    return {
      name: nameKey(sorted[0].marketer),
      designation: pick('designation').toUpperCase(),
      supervisor: pick('supervisor').toUpperCase(),
      accountNumber: pick('accountNumber'),
      spouseName: pick('spouseName').toUpperCase(),
      spouseAccount: pick('spouseAccount'),
      branch: mostCommon(list.map((r) => r.branch.toUpperCase())),
    };
  });
}

export const kindLabel = (k: Kind) => KINDS.find((x) => x.id === k)!.label;
