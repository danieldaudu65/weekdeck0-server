/**
 * January – August 2026 for the Fagba region's branches, from the accountant's
 * September 2026 slides (the January – December tables; every month checked:
 * land + infra = inflow, and September matches her report Excel). Used for the
 * year slide when she has nothing of her own for a month; anything she types
 * in "Earlier months" or uploads for a month takes its place.
 */
import type { HistoryRow } from './accDeck';

const key = (branch: string, month: string) => `${branch.replace(/[^A-Z0-9]/gi, '').toUpperCase()}|${month}`;

const rows = (branch: string, list: [string, number, number, number][]): HistoryRow[] => list.map(([month, land, infra, nc]) => ({ branch, month, land, infra, nc }));

export const PAST_MONTHS: HistoryRow[] = [
  ...rows('FAGBA', [
    ['2026-01', 41285745.83, 10060000, 3],
    ['2026-02', 19394875.65, 5904000, 18],
    ['2026-03', 41893511.02, 4796000, 6],
    ['2026-04', 24159201.56, 12740000, 3],
    ['2026-05', 45152443.1, 4210018.95, 9],
    ['2026-06', 39956739.01, 1500000, 9],
    ['2026-07', 41844242.3, 3100000, 9],
    ['2026-08', 26627684.49, 1300000, 19],
  ]),
  ...rows('ABULE EGBA', [
    ['2026-01', 20113665, 8100000, 1],
    ['2026-02', 15397367, 2700000, 5],
    ['2026-03', 23073000, 5350080, 5],
    ['2026-04', 24787494, 18730000, 5],
    ['2026-05', 13002000, 6300000, 8],
    ['2026-06', 20177555, 1250000, 10],
    ['2026-07', 25094582.3, 4475000, 4],
    ['2026-08', 29812895, 15127083, 32],
  ]),
];

/** Her own months, plus the built-in ones she doesn't have. */
export function withPast(history: HistoryRow[]): HistoryRow[] {
  const has = new Set(history.map((h) => key(h.branch, h.month)));
  return [...history, ...PAST_MONTHS.filter((p) => !has.has(key(p.branch, p.month)))];
}
