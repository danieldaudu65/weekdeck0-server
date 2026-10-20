/**
 * Turns what was read from uploaded slides into the weeks WeekDeck saves, so every figure and
 * total on WeekDeck's slides matches the uploaded deck. Pure (no browser APIs), unit-tested.
 *
 *  - The figures' week: from a date on the slides if there is one, else the week that just ended.
 *  - Week numbering: the slide's own ("WK 3" for that week) decides the team's week style.
 *  - TOTAL with no (or partial) daily split: the difference is kept as a week total, never lost.
 *  - Nothing already saved is wiped: notes, map places and other people's figures stay.
 */
import { DAYS, emptyActivities, type Activities, type Week, type WeekRow } from './types';
import { addWeeks, mondayOf, mondaysInMonth, monthOf, weekNumberInMonth, type WeekStyle } from './weeks';
import { slideTotal, planMonthlyWeeks, slideWeekNumber as slideWeekNumberFromTables } from './importMonthly';
import type { ImportedFigures, ImportedMonthly, SlideWeek } from './importAnalyze';
import { sumOrNull } from './money';

/**
 * The Monday of the week the slides name, if it's believable (not in the future, at most
 * ~10 weeks back). A date without a year takes the most recent year that fits.
 */
export function slideMonday(slideWeek: SlideWeek, today: Date, style: WeekStyle = 'monday'): string | null {
  const thisMonday = mondayOf(today);
  const earliest = addWeeks(thisMonday, -10);
  const ok = (monday: string) => monday <= thisMonday && monday >= earliest;
  const { date, weekNo } = slideWeek;
  if (date) {
    const years = date.year ? [date.year] : [today.getFullYear(), today.getFullYear() - 1];
    for (const y of years) {
      const d = new Date(Date.UTC(y, date.month - 1, date.day, 12));
      if (d.getUTCMonth() !== date.month - 1) continue; // 31 Sep etc.
      const monday = mondayOf(new Date(y, date.month - 1, date.day));
      if (ok(monday)) return monday;
    }
  }
  // "WEEK 2" alone: Week 2 of this month, or of last month if this month hasn't reached it.
  if (weekNo) {
    for (const back of [0, 1]) {
      const month = monthOf(addWeeks(thisMonday, -4 * back), style);
      const monday = mondaysInMonth(month, style)[weekNo - 1];
      if (monday && ok(monday)) return monday;
    }
  }
  return null;
}

/**
 * Does the slide count weeks like WeekDeck ('monday') or from the week of the 1st ('first')?
 * `slideNo` is the number the slide gives the figures' week. When both styles agree (months
 * starting on a Monday) or the slide doesn't say, the team keeps its current style.
 */
export function chooseWeekStyle(slideNo: number | null, figuresWeek: string, current: WeekStyle): WeekStyle {
  if (!slideNo) return current;
  const byMonday = weekNumberInMonth(figuresWeek, 'monday');
  const byFirst = weekNumberInMonth(figuresWeek, 'first');
  if (byMonday === byFirst) return current;
  if (slideNo === byFirst) return 'first';
  if (slideNo === byMonday) return 'monday';
  return current;
}

/** One imported row as WeekDeck saves it: the days as written, plus any TOTAL not covered by the days. */
export function rowFromSlide(f: ImportedFigures): WeekRow {
  const days = sumOrNull(DAYS.map((d) => f[d]));
  const total = slideTotal(f);
  const extra = total != null && total > (days ?? 0) ? total - (days ?? 0) : null;
  return { memberId: f.memberId, mon: f.mon, tue: f.tue, wed: f.wed, thu: f.thu, fri: f.fri, nc: f.nc, weekTotal: extra };
}

const rowHasFigures = (r: WeekRow) => DAYS.some((d) => r[d] != null) || r.weekTotal != null || r.nc != null;

export interface ImportInput {
  figures: ImportedFigures[] | null;
  monthly: ImportedMonthly | null;
  activities: Activities;
  /** Save the figures (and the monthly table's earlier weeks)? */
  saveFigures: boolean;
  figuresWeek: string;
  memberIds: Set<string>;
  /** Weeks already saved in WeekDeck, by Monday. */
  existing: Map<string, Week>;
}

/** The weeks to save. Each is complete (PUT replaces a week), built on top of what's already saved. */
export function planImportWeeks(input: ImportInput): Week[] {
  const { figures, monthly, activities, saveFigures, figuresWeek, memberIds, existing } = input;
  const out: Week[] = [];
  const base = (weekStart: string): Week => {
    const old = existing.get(weekStart);
    return {
      weekStart,
      rows: (old?.rows ?? []).filter((r) => memberIds.has(r.memberId)),
      activities: old?.activities ?? emptyActivities(),
      note: old?.note ?? '',
      places: old?.places ?? [],
    };
  };

  // 1. The figures' week: imported rows replace those members' rows; everyone else's stay.
  const imported = saveFigures ? (figures ?? []).filter((f) => memberIds.has(f.memberId)).map(rowFromSlide).filter(rowHasFigures) : [];
  const hasPlan = DAYS.some((d) => activities[d]);
  if (imported.length || hasPlan) {
    const w = base(figuresWeek);
    const ids = new Set(imported.map((r) => r.memberId));
    w.rows = [...w.rows.filter((r) => !ids.has(r.memberId)), ...imported];
    if (hasPlan) {
      w.activities = activities;
      w.places = []; // pins belonged to the old plan
    }
    out.push(w);
  }

  // 2. Earlier weeks from the monthly table: only weeks that have no figures yet.
  if (saveFigures) {
    for (const p of planMonthlyWeeks(monthly, figures, figuresWeek)) {
      const w = base(p.weekStart);
      if (w.rows.some(rowHasFigures)) continue;
      const rows = p.rows.filter((r) => memberIds.has(r.memberId)).map((r) => ({ memberId: r.memberId, mon: null, tue: null, wed: null, thu: null, fri: null, nc: null, weekTotal: r.weekTotal }));
      if (!rows.length) continue;
      w.rows = rows;
      out.push(w);
    }
  }
  return out;
}

export interface ImportWeekChoice {
  figuresWeek: string;
  style: WeekStyle;
  /** Why this week was picked, for the review screen. */
  source: 'date' | 'week-number' | 'default';
  /** The number the slide gives that week, when it says. */
  slideNo: number | null;
}

/**
 * Which week the uploaded figures belong to, and how the team numbers weeks — taken from the
 * slides whenever they say so: a date first, then the week number, then "the week that just ended".
 */
export function decideImportWeek(
  read: { slideWeek: SlideWeek; monthly: ImportedMonthly | null; figures: ImportedFigures[] | null },
  today: Date,
  current: WeekStyle,
  fallbackWeek: string,
): ImportWeekChoice {
  const slideNo = slideWeekNumberOf(read);
  const byDate = read.slideWeek.date ? slideMonday({ date: read.slideWeek.date, weekNo: null }, today, current) : null;
  if (byDate) return { figuresWeek: byDate, style: chooseWeekStyle(slideNo, byDate, current), source: 'date', slideNo };

  let week = fallbackWeek;
  let style = chooseWeekStyle(slideNo, week, current);
  let source: ImportWeekChoice['source'] = 'default';
  if (slideNo) {
    // "WEEK 2": find Week 2 (the team's way) among the last few weeks.
    const named = slideMonday({ date: null, weekNo: slideNo }, today, style);
    if (named && named !== week && named >= addWeeks(fallbackWeek, -2)) {
      week = named;
      style = chooseWeekStyle(slideNo, week, style);
      source = 'week-number';
    } else if (named === week) source = 'week-number';
  }
  return { figuresWeek: week, style, source, slideNo };
}

function slideWeekNumberOf(read: { slideWeek: SlideWeek; monthly: ImportedMonthly | null; figures: ImportedFigures[] | null }): number | null {
  return slideWeekNumberFromTables(read.monthly, read.figures) ?? read.slideWeek.weekNo;
}
