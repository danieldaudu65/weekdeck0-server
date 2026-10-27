/**
 * The accountant's sheet, column by column, exactly as their Google Sheets
 * have it (A–Z, plus the week 2–4 columns of the "New client" sheet). The grid,
 * the import and the Excel export all read this list, so they always agree.
 */

export type Kind = 'land' | 'new' | 'infra';

export const KINDS: { id: Kind; label: string; short: string; file: string }[] = [
  { id: 'land', label: 'Workflow', short: 'Workflow', file: 'WORKFLOW' },
  { id: 'new', label: 'New clients', short: 'New clients', file: 'NEW CLIENT WORK FLOW' },
  { id: 'infra', label: 'Infrastructure & other fees', short: 'Infra & fees', file: 'INFRASTRUCTURE AND OTHER FEES' },
];

export type FieldKey =
  | 'sn'
  | 'branch'
  | 'date'
  | 'alertName'
  | 'bank'
  | 'amount'
  | 'promo'
  | 'clientName'
  | 'marketer'
  | 'supervisor'
  | 'designation'
  | 'accountNumber'
  | 'spouseName'
  | 'spouseAccount'
  | 'cabalId'
  | 'land'
  | 'form'
  | 'rate'
  | 'accountantComment'
  | 'postingStatus'
  | 'confirmAmount'
  | 'confirmation'
  | 'officer'
  | 'confirmationComment'
  | 'clearance'
  | 'comment'
  | 'w2Clearance'
  | 'w2Comment'
  | 'w3Clearance'
  | 'w3Comment'
  | 'w4Clearance'
  | 'w4Comment';

export type ColType = 'text' | 'number' | 'money' | 'date';

export interface Column {
  key: FieldKey;
  /** Header exactly as in their sheet (row 2). */
  header: string;
  type: ColType;
  /** Width on screen in px. */
  width: number;
  /** Choices offered while typing (they can still type anything else). */
  options?: string[];
  /** Filled in from the marketer roster when a marketer is picked. */
  fromMarketer?: boolean;
  /** Only on the New client sheet. */
  newOnly?: boolean;
  /** Worked out by WeekDeck; can't be typed over. */
  locked?: boolean;
}

export const BANKS = ['ZENITH', 'GTB', 'UBA', 'ACCESS', 'FIRST BANK', 'ZENITH-INFRAS', 'ZENITH-OTHERS'];
export const RATES = ['1', '3', '5', '7', '10'];
export const POSTING = ['POSTED'];
export const CONFIRMATION = ['CONFIRMED', 'PROVIDE EVIDENCE', 'NOT OUT YET', 'CONFIRMED EARLIER'];
export const CLEARANCE = ['CLEARED', 'NOT CLEARED'];
export const DESIGNATIONS = ['BE', 'RO', 'RRO', 'DRRO', 'CRO', 'DCRO', 'TCRO', 'DSM', 'DDSM', 'RBM', 'INDEPENDENT', 'ACCOUNTANT'];

export const COLUMNS: Column[] = [
  { key: 'sn', header: 'S/N', type: 'number', width: 56, locked: true },
  { key: 'branch', header: 'BRANCH', type: 'text', width: 110 },
  { key: 'date', header: 'DATE', type: 'date', width: 108 },
  { key: 'alertName', header: 'NAME AS ON ALERT PRINT OUT', type: 'text', width: 240 },
  { key: 'bank', header: 'BANK', type: 'text', width: 110, options: BANKS },
  { key: 'amount', header: 'AMOUNT', type: 'money', width: 128 },
  { key: 'promo', header: 'PROMO', type: 'text', width: 130 },
  { key: 'clientName', header: "ACTUAL CLIENT'S NAME", type: 'text', width: 230 },
  { key: 'marketer', header: "MARKETER's FULL NAME", type: 'text', width: 230 },
  { key: 'supervisor', header: 'SUPERVISOR', type: 'text', width: 150, fromMarketer: true },
  { key: 'designation', header: 'DESIGNATION', type: 'text', width: 110, options: DESIGNATIONS, fromMarketer: true },
  { key: 'accountNumber', header: 'ACCOUNT NUMBER', type: 'text', width: 130, fromMarketer: true },
  { key: 'spouseName', header: 'SPOUSE NAME', type: 'text', width: 200, fromMarketer: true },
  { key: 'spouseAccount', header: 'SPOUSE ACCOUNT', type: 'text', width: 130, fromMarketer: true },
  { key: 'cabalId', header: 'CABAL ID', type: 'text', width: 130 },
  { key: 'land', header: 'LAND', type: 'money', width: 120 },
  { key: 'form', header: 'FORM', type: 'text', width: 110 }, // 10000, or text like "TRANSFER FEE"
  { key: 'rate', header: 'RATE', type: 'number', width: 70, options: RATES },
  { key: 'accountantComment', header: 'ACCOUNTANT COMMENT', type: 'text', width: 190 },
  { key: 'postingStatus', header: 'POSTING STATUS', type: 'text', width: 130, options: POSTING },
  { key: 'confirmAmount', header: 'AMOUNT', type: 'money', width: 128 },
  { key: 'confirmation', header: 'CONFIRMATION', type: 'text', width: 150, options: CONFIRMATION },
  { key: 'officer', header: 'OFFICER', type: 'text', width: 170 },
  { key: 'confirmationComment', header: 'CONFIRMATION COMMENT', type: 'text', width: 230 },
  { key: 'clearance', header: 'CLEARANCE', type: 'text', width: 120, options: CLEARANCE },
  { key: 'comment', header: 'COMMENT', type: 'text', width: 180 },
  { key: 'w2Clearance', header: 'CLEARANCE', type: 'text', width: 120, options: CLEARANCE, newOnly: true },
  { key: 'w2Comment', header: 'COMMENT', type: 'text', width: 180, newOnly: true },
  { key: 'w3Clearance', header: 'CLEARANCE', type: 'text', width: 120, options: CLEARANCE, newOnly: true },
  { key: 'w3Comment', header: 'COMMENT', type: 'text', width: 180, newOnly: true },
  { key: 'w4Clearance', header: 'CLEARANCE', type: 'text', width: 120, options: CLEARANCE, newOnly: true },
  { key: 'w4Comment', header: 'COMMENT', type: 'text', width: 180, newOnly: true },
];

/** The coloured group row above the headers (row 1 of their sheet). `span` = number of columns. */
export interface Group {
  label: string;
  span: number;
}

export function columnsFor(kind: Kind): Column[] {
  return COLUMNS.filter((c) => kind === 'new' || !c.newOnly);
}

export function groupsFor(kind: Kind): Group[] {
  if (kind === 'new') {
    return [
      { label: '', span: 8 },
      { label: "MARKETER'S DETAILS", span: 4 },
      { label: 'SPOUSE DETAILS', span: 2 },
      { label: '', span: 6 },
      { label: 'CONFIRMATION', span: 4 },
      { label: 'ACCOUNTANTS (WEEK 1)', span: 2 },
      { label: 'ACCOUNTANTS (WEEK 2)', span: 2 },
      { label: 'ACCOUNTANTS (WEEK 3)', span: 2 },
      { label: 'ACCOUNTANTS WEEK 4', span: 2 },
    ];
  }
  return [
    { label: 'CLIENT DETAILS', span: 8 },
    { label: "MARKETER'S DETAILS", span: 4 },
    { label: 'SPOUSE DETAILS', span: 2 },
    { label: 'PURPOSE OF PAYMENT', span: 6 },
    { label: 'CONFIRMATION', span: 4 },
    { label: 'INTERNAL CONTROL', span: 2 },
  ];
}

export type Payment = {
  id?: string;
  /** A new row not saved yet. */
  tmp?: string;
  month: string;
  kind: Kind;
  tab: string;
  pos: number;
} & { [K in FieldKey]: K extends 'sn' | 'amount' | 'land' | 'rate' | 'confirmAmount' ? number | null : string };

export const NUMBER_KEYS = new Set<FieldKey>(COLUMNS.filter((c) => c.type === 'number' || c.type === 'money').map((c) => c.key));

let tmpCounter = 0;
export const newTmpId = () => `t${Date.now().toString(36)}${(tmpCounter++).toString(36)}`;

export function emptyPayment(month: string, kind: Kind, tab: string, pos: number, branch = ''): Payment {
  const p: Record<string, unknown> = { tmp: newTmpId(), month, kind, tab, pos };
  for (const c of COLUMNS) p[c.key] = NUMBER_KEYS.has(c.key) ? null : '';
  p.branch = branch;
  return p as Payment;
}

/** A row with nothing in it (besides S/N and branch) is not a payment. */
export function isBlank(p: Payment): boolean {
  return COLUMNS.every((c) => c.key === 'sn' || c.key === 'branch' || p[c.key] === null || p[c.key] === '');
}

/** Same rule as the server (utils/accounts.js): upper case, single spaces, no stray symbols. */
export const nameKey = (s: unknown) =>
  String(s ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9 &'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const roundKobo = (n: number | null) => (n === null || !Number.isFinite(n) ? '' : String(Math.round(n * 100) / 100));

/** A CABAL ID, or '' when there isn't one yet ("NEW & FORM", blank). */
export const cabalKey = (s: unknown) => {
  const v = nameKey(s);
  return /^NEW\s*&\s*FORM$|^NEW$|^-$|^NIL+$/.test(v) ? '' : v;
};

/** Kind, tab, date, alert name, amount and client: the payment without its CABAL ID. */
export function baseKey(p: Pick<Payment, 'kind' | 'tab' | 'date' | 'alertName' | 'amount' | 'clientName'>): string {
  return [p.kind, p.tab, p.date || '', nameKey(p.alertName), roundKobo(p.amount), nameKey(p.clientName)].join('|');
}

/**
 * Two rows are the same payment when kind, tab, date, alert name, amount,
 * client and CABAL ID match (same as the server). One client buying several
 * plots on a day with one transfer each is several payments: their CABAL IDs differ.
 */
export function paymentKey(p: Pick<Payment, 'kind' | 'tab' | 'date' | 'alertName' | 'amount' | 'clientName' | 'cabalId'>): string {
  return `${baseKey(p)}|${cabalKey(p.cabalId)}`;
}

export const isConfirmed = (p: Pick<Payment, 'confirmation'>) => /^CONFIRMED/i.test(String(p.confirmation || '').trim());

/* ------------------------------------------------------------------ months */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTH_NAMES = MONTHS;

export function thisMonth(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const i = y * 12 + (m - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
}
/** "2026-09" → "September 2026" */
export function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
/** "2026-09" → "SEPTEMBER, 2026" (how their slide titles write it) */
export function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1].toUpperCase()}, ${y}`;
}

/* ------------------------------------------------------------------ values */

const fmt2 = new Intl.NumberFormat('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
/** 15498953.25 → "15,498,953.25"; 100000 → "100,000". */
export function showMoney(n: number | null | undefined): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '' : fmt2.format(n);
}

/** "09/10/2026", "9/10/26", "2026-10-09" → "2026-10-09" (day first, as Nigeria writes dates). */
export function parseDate(input: string): string | null {
  const s = input.trim();
  if (!s) return '';
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  let y: number;
  let mo: number;
  let d: number;
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else {
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
    if (!m) return null;
    [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (y < 100) y += 2000;
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** "2026-10-09" → "09/10/2026" */
export function showDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || '';
}

/** "1,450,000", "₦1.45m", "500k" → 1450000. Kobo kept. null = empty, NaN = not a number. */
export function parseMoney(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/[₦,\s]/g, '').replace(/^ngn/, '');
  if (!s || s === '-') return null;
  const m = /^(-?\d+(?:\.\d+)?)([km])?$/.exec(s);
  if (!m) return NaN;
  const mult = m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1;
  return Math.round(parseFloat(m[1]) * mult * 100) / 100;
}

/** What a typed value becomes in a cell of this column. Returns an error message when it doesn't fit. */
export function readCell(col: Column, input: string): { value: string | number | null } | { error: string } {
  if (col.type === 'date') {
    const d = parseDate(input);
    return d === null ? { error: 'Type the date like 09/10/2026' } : { value: d };
  }
  if (col.type === 'money' || col.type === 'number') {
    const t = input.trim();
    if (col.key === 'rate' && /^(nill?|nil|none|-)$/i.test(t)) return { value: null };
    const n = parseMoney(t.replace(/%$/, ''));
    return Number.isNaN(n) ? { error: 'That isn’t a number' } : { value: n };
  }
  return { value: input.replace(/\s+/g, ' ').trim() };
}

/** How a stored value looks in its cell. */
export function showCell(col: Column, v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (col.type === 'date') return showDate(String(v));
  if (col.type === 'money') return showMoney(Number(v));
  return String(v);
}
