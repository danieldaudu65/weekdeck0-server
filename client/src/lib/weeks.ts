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

/** The month a week belongs to = the month of its Monday. */
export function monthOf(weekStart: string): string {
  return weekStart.slice(0, 7);
}

/** Every Monday that falls in the month ("2026-10" → 5 Mondays in Oct 2026). */
export function mondaysInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1, 12));
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  const out: string[] = [];
  while (d.getUTCMonth() === m - 1) {
    out.push(toKey(d));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

/** 1-based position of the week in its month ("Week 2 of October"). */
export function weekNumberInMonth(weekStart: string): number {
  return mondaysInMonth(monthOf(weekStart)).indexOf(weekStart) + 1;
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
