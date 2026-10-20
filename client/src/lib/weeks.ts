/**
 * Week maths on "YYYY-MM-DD" keys. All work is done at UTC noon, so the
 * device's time zone and daylight saving can never shift a date.
 */

const toKey = (d: Date) => d.toISOString().slice(0, 10);
const fromKey = (key: string) => new Date(`${key}T12:00:00Z`);

/** Monday of the week containing `date` (in the device's local calendar). */
export function mondayOf(date = new Date()): string {
  const local = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12));
  const dow = local.getUTCDay(); // 0 Sun … 6 Sat
  local.setUTCDate(local.getUTCDate() - ((dow + 6) % 7));
  return toKey(local);
}

/**
 * Which week do uploaded slides describe? They're made to present the week that just ENDED:
 * Monday–Friday that's last week; on Saturday/Sunday it's the week finishing now.
 * Imported figures go there, never into the new week.
 */
export function importedWeekFor(date = new Date()): string {
  const dow = date.getDay(); // 0 Sun … 6 Sat
  const thisMonday = mondayOf(date);
  return dow === 0 || dow === 6 ? thisMonday : addWeeks(thisMonday, -1);
}

export function addWeeks(key: string, n: number): string {
  const d = fromKey(key);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return toKey(d);
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key);
  d.setUTCDate(d.getUTCDate() + n);
  return toKey(d);
}

/**
 * How a team numbers its weeks. Teams do it two ways, and the slides must match theirs:
 *  - 'monday': Week 1 is the first week whose MONDAY is in the month (a week belongs to its Monday's month).
 *  - 'first':  Week 1 is the week with the 1st working day of the month (a week belongs to its Friday's month),
 *              so "29 Sep – 3 Oct" is Week 1 of October.
 */
export type WeekStyle = 'monday' | 'first';

let currentStyle: WeekStyle = 'monday';
/** Set from the logged-in team, so every page counts weeks the team's way. */
export function setWeekStyle(style: WeekStyle | undefined | null) {
  currentStyle = style === 'first' ? 'first' : 'monday';
}
export function getWeekStyle(): WeekStyle {
  return currentStyle;
}

/** The month a week belongs to ("2026-10"). */
export function monthOf(weekStart: string, style: WeekStyle = currentStyle): string {
  return (style === 'first' ? addDays(weekStart, 4) : weekStart).slice(0, 7);
}

/** Every week (its Monday) that belongs to the month ("2026-10" → 4 or 5 Mondays). */
export function mondaysInMonth(month: string, style: WeekStyle = currentStyle): string[] {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1, 12));
  d.setUTCDate(d.getUTCDate() - 7); // start a week early: with 'first', a September Monday can be in October
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const key = toKey(d);
    if (monthOf(key, style) === month) out.push(key);
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

/** 1-based position of the week in its month ("Week 2 of October"). */
export function weekNumberInMonth(weekStart: string, style: WeekStyle = currentStyle): number {
  return mondaysInMonth(monthOf(weekStart, style), style).indexOf(weekStart) + 1;
}

const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayMonthYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** "13 – 17 Oct 2026" (Monday to Friday). */
export function weekRangeLabel(weekStart: string): string {
  const mon = fromKey(weekStart);
  const fri = fromKey(addDays(weekStart, 4));
  return `${dayMonth.format(mon)} – ${dayMonthYear.format(fri)}`;
}

/** "October 2026" */
export function monthLabel(month: string): string {
  return monthYear.format(fromKey(`${month}-15`));
}
