'use strict';

/** "YYYY-MM-DD" plus n days (UTC noon, so no time-zone surprises). */
const addDays = (key, n) => new Date(Date.parse(`${key}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Every Monday whose month is the month of `weekStart` (same rule as the slides' monthly table). */
function mondaysOfMonth(weekStart) {
  const month = weekStart.slice(0, 7);
  let first = `${month}-01`;
  const dow = new Date(`${first}T12:00:00Z`).getUTCDay();
  first = addDays(first, (8 - dow) % 7);
  const out = [];
  for (let d = first; d.slice(0, 7) === month; d = addDays(d, 7)) out.push(d);
  return out;
}

module.exports = { addDays, mondaysOfMonth };
