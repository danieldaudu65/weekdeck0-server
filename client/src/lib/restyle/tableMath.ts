/**
 * Tables in a restyled deck add themselves up: a TOTAL column is the sum of
 * the money columns before it, and the TOTAL row is the sum of each column.
 * Cells take amounts the way managers write them: "2.1m", "500k", "₦1,200,000".
 */
import type { DeckTable } from '../deck';

const isTotal = (s: string) => /\btotals?\b/i.test(s.trim());
/** Columns that are counts or rates, not money, so a TOTAL column doesn't add them in. */
const notMoney = (s: string) => /client|count|^no\.?$|^s\/?n|qty|quantity|number|units?\b|%|rate|percent|ratio|target|date/i.test(s.trim());
const rateCol = (s: string) => /%|rate|percent|ratio|date/i.test(s.trim());

/** "2.1m" → 2100000, "500k" → 500000, "3,436,953.25" → 3436953.25, words → null. */
export function readAmount(raw: string): number | null {
  let s = raw.trim().toLowerCase().replace(/[₦#,\s]/g, '').replace(/^ngn|^n(?=\d)/, '');
  if (!s || s === '-') return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    neg = !neg;
    s = s.slice(1);
  }
  const m = /^(\d+(?:\.\d+)?|\.\d+)(k|m|mil|million|b|bn|billion)?$/.exec(s);
  if (!m) return null;
  const unit = m[2] ?? '';
  const mult = unit === 'k' ? 1e3 : unit.startsWith('m') ? 1e6 : unit.startsWith('b') ? 1e9 : 1;
  const n = parseFloat(m[1]) * mult;
  return neg ? -n : n;
}

const decimalsOf = (raw: string) => (/[km]|mil|bn|b$/i.test(raw.trim()) ? 0 : /\.\d/.test(raw) ? 2 : 0);

export function writeAmount(n: number, decimals = 0): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** A typed amount in the team's style: "2.1m" → "2,100,000". Anything else is left as typed. */
export function tidyAmount(raw: string): string {
  const n = readAmount(raw);
  if (n === null) return raw;
  return writeAmount(n, decimalsOf(raw) ? 2 : Math.round(n) === n ? 0 : 2);
}

interface Plan {
  /** TOTAL columns → the columns they add up. */
  sums: Map<number, number[]>;
  /** Columns the TOTAL row adds up. */
  down: number[];
}

function plan(t: DeckTable): Plan {
  const width = Math.max(t.head.length, ...t.rows.map((r) => r.length), t.total.length);
  const numeric = (c: number) => t.rows.some((r) => readAmount(r[c] ?? '') !== null);
  const sums = new Map<number, number[]>();
  let from = 1;
  for (let c = 1; c < width; c++) {
    if (!isTotal(t.head[c] ?? '')) continue;
    const parts: number[] = [];
    for (let k = from; k < c; k++) if (!sums.has(k) && !notMoney(t.head[k] ?? '') && numeric(k)) parts.push(k);
    if (parts.length) sums.set(c, parts);
    from = c + 1;
  }
  const down: number[] = [];
  if (t.total.length) for (let c = 1; c < width; c++) if (!rateCol(t.head[c] ?? '') && (sums.has(c) || numeric(c))) down.push(c);
  return { sums, down };
}

/** Which cells are worked out for you: `auto(row, col)`, row -1 is the TOTAL row. */
export function autoCells(t: DeckTable): (row: number, col: number) => boolean {
  const p = plan(t);
  return (row, col) => p.sums.has(col) || (row === -1 && p.down.includes(col));
}

/** The table with every TOTAL cell filled in. */
export function withTotals(t: DeckTable): DeckTable {
  const p = plan(t);
  if (!p.sums.size && !p.down.length) return t;
  const add = (cells: string[]) => {
    let total = 0, any = false, dec = 0;
    for (const v of cells) {
      const n = readAmount(v);
      if (n === null) continue;
      total += n;
      any = true;
      dec = Math.max(dec, decimalsOf(v));
    }
    return any ? writeAmount(total, dec || (Math.round(total * 100) % 100 ? 2 : 0)) : '';
  };
  const rows = t.rows.map((r) => {
    if (!p.sums.size) return r;
    const out = [...r];
    for (const [c, parts] of p.sums) {
      while (out.length <= c) out.push('');
      out[c] = add(parts.map((k) => r[k] ?? ''));
    }
    return out;
  });
  let total = t.total;
  if (total.length) {
    total = [...total];
    while (total.length < t.head.length) total.push('');
    for (const c of p.down) total[c] = add(rows.map((r) => r[c] ?? ''));
    for (const [c, parts] of p.sums) if (!p.down.includes(c)) total[c] = add(parts.map((k) => total[k] ?? ''));
  }
  return { head: t.head, rows, total };
}
