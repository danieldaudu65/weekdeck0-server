'use strict';

/** "YYYY-MM-DD" plus n days (UTC noon, so no time-zone surprises). */
const addDays = (key, n) => new Date(Date.parse(`${key}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/**
 * The month a week belongs to, the team's way (same rules as the website's weeks.ts):
 * 'monday' = its Monday's month; 'first' = its Friday's month (Week 1 holds the 1st working day).
 */
const monthOfWeek = (weekStart, style) => (style === 'first' ? addDays(weekStart, 4) : weekStart).slice(0, 7);

/** Every week (its Monday) in the month of `weekStart` (same rule as the slides' monthly table). */
function mondaysOfMonth(weekStart, style = 'monday') {
  const month = monthOfWeek(weekStart, style);
  let d = addDays(`${month}-01`, -7);
  while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1);
  const out = [];
  for (let i = 0; i < 7; i++, d = addDays(d, 7)) if (monthOfWeek(d, style) === month) out.push(d);
  return out;
}

module.exports = { addDays, mondaysOfMonth, monthOfWeek };
