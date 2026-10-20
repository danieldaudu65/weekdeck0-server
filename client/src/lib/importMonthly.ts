/**
 * Puts the monthly table's earlier WK columns onto real weeks, so the monthly
 * slide shows them instead of blanks.
 *
 * Teams count weeks differently (is WK 1 the week of the 1st, or the first full
 * week?), so we don't trust the calendar. We find the column that IS the
 * imported week (its numbers equal the weekly table's totals) and count back
 * from there: one column to the left = one week earlier.
 */
import { DAYS } from './types';
import { sumOrNull } from './money';
import { addWeeks } from './weeks';
import { weekColumnNumber, type ImportedFigures, type ImportedMonthly } from './importAnalyze';

export interface PlannedWeek {
  weekStart: string;
  label: string;
  rows: { memberId: string; weekTotal: number }[];
}

/** A member's week total as the slide shows it: the TOTAL cell, or the days added up (whichever is bigger). */
export function slideTotal(f: ImportedFigures): number | null {
  const days = sumOrNull(DAYS.map((d) => f[d]));
  if (f.total == null) return days;
  return days == null ? f.total : Math.max(days, f.total);
}

/** The week number the slide gives the imported week ("WK 3" column = this week → 3), or null. */
export function slideWeekNumber(monthly: ImportedMonthly | null, figures: ImportedFigures[] | null): number | null {
  if (!monthly || !figures?.length) return null;
  const c = anchorColumn(monthly, figures);
  if (c < 0) return null;
  // Only trust it when the column really matches this week's totals (not just "the last filled column").
  const totals = new Map(figures.map((f) => [f.memberId, slideTotal(f)]));
  const matched = monthly.rows.some((r) => r.values[c] != null && r.values[c]! > 0 && r.values[c] === totals.get(r.memberId));
  return matched ? weekColumnNumber(monthly.weeks[c]) : null;
}

/** Which column is "this week"? The one matching the weekly totals; else the last column with numbers. */
export function anchorColumn(monthly: ImportedMonthly, figures: ImportedFigures[] | null): number {
  const weeklyTotal = new Map((figures ?? []).map((f) => [f.memberId, slideTotal(f)]));
  let best = -1;
  let bestHits = 0;
  monthly.weeks.forEach((_, c) => {
    let hits = 0;
    for (const r of monthly.rows) {
      const want = weeklyTotal.get(r.memberId);
      if (want != null && want > 0 && r.values[c] === want) hits++;
    }
    if (hits > bestHits) {
      best = c;
      bestHits = hits;
    }
  });
  if (best >= 0) return best;
  for (let c = monthly.weeks.length - 1; c >= 0; c--) if (monthly.rows.some((r) => r.values[c] !== null)) return c;
  return -1;
}

/** The weeks before `figuresWeek` that the monthly table has numbers for. */
export function planMonthlyWeeks(monthly: ImportedMonthly | null, figures: ImportedFigures[] | null, figuresWeek: string): PlannedWeek[] {
  if (!monthly) return [];
  const anchor = anchorColumn(monthly, figures);
  // No daily figures for the imported week? Then its monthly column is the only record of it: keep it too.
  const hasDaily = (figures ?? []).some((f) => slideTotal(f) !== null);
  const last = hasDaily ? anchor - 1 : anchor;
  const out: PlannedWeek[] = [];
  for (let c = 0; c <= last; c++) {
    const rows = monthly.rows
      .map((r) => ({ memberId: r.memberId, weekTotal: r.values[c] }))
      .filter((r): r is { memberId: string; weekTotal: number } => r.weekTotal !== null && r.weekTotal > 0);
    if (rows.length) out.push({ weekStart: addWeeks(figuresWeek, c - anchor), label: monthly.weeks[c], rows });
  }
  return out;
}
