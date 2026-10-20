'use strict';

/**
 * Input rules shared by the routes. Pure functions (no database), unit-tested.
 * Every value from the browser goes through one of these before it is saved.
 */

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const MAX_AMOUNT = 100_000_000_000; // ₦100bn: sanity ceiling for one day's figure
const MAX_MEMBERS = 40;

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.expose = true;
  }
}

/** "  Lifter   Marine " → "Lifter Marine" (display) and "lifter marine" (unique login key). */
function cleanTeamName(raw) {
  const display = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (display.length < 2) throw new ValidationError('Enter your team name.');
  if (display.length > 60) throw new ValidationError('Keep the team name under 60 characters.');
  return { display, key: display.toLowerCase() };
}

function cleanPin(raw) {
  const pin = String(raw ?? '').trim();
  if (!/^\d{4,6}$/.test(pin)) throw new ValidationError('The PIN must be 4 to 6 digits.');
  return pin;
}

function str(raw, max) {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function multiline(raw, max) {
  return String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, max);
}

/** "2026-10-12" and it must be a Monday (weeks always start on Monday). */
function cleanWeekStart(raw) {
  const s = String(raw ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ValidationError('Invalid week.');
  const d = new Date(`${s}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new ValidationError('Invalid week.');
  if (d.getUTCDay() !== 1) throw new ValidationError('A week must start on a Monday.');
  return s;
}

function amount(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) throw new ValidationError('Amounts must be between 0 and 100,000,000,000.');
  return Math.round(n);
}

function count(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 10_000) throw new ValidationError('New clients must be a whole number.');
  return n;
}

function cleanMemberId(raw) {
  const id = String(raw ?? '');
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(id)) throw new ValidationError('Invalid team member.');
  return id;
}

function cleanMembers(raw) {
  if (!Array.isArray(raw)) throw new ValidationError('Team members are missing.');
  if (raw.length > MAX_MEMBERS) throw new ValidationError(`A team can have at most ${MAX_MEMBERS} members.`);
  const seen = new Set();
  return raw.map((m) => {
    const id = cleanMemberId(m && m.id);
    if (seen.has(id)) throw new ValidationError('Duplicate team member.');
    seen.add(id);
    const name = str(m.name, 60);
    if (!name) throw new ValidationError('Every team member needs a name.');
    return { id, name, lead: Boolean(m.lead) };
  });
}

/** Optional cover photo: a small JPEG/PNG/WebP as a data URL (resized in the browser first). */
function cleanCoverImage(raw) {
  if (raw === undefined || raw === null || raw === '') return '';
  const s = String(raw);
  if (s.length > 600_000) throw new ValidationError('The cover photo is too large. Try a smaller picture.');
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s)) throw new ValidationError('The cover photo must be a JPEG, PNG or WebP picture.');
  return s;
}

/** Team details the manager can edit (everything except the PIN). */
function cleanTeamProfile(raw) {
  const r = raw || {};
  return {
    deckTitle: str(r.deckTitle, 80) || 'Weekly Strategic Session',
    managerName: str(r.managerName, 60),
    managerTag: str(r.managerTag, 20),
    managerRole: str(r.managerRole, 40),
    teamTitle: str(r.teamTitle, 80),
    region: str(r.region, 40),
    activitiesTitle: str(r.activitiesTitle, 80),
    templateId: /^[a-z0-9_-]{2,40}$/.test(String(r.templateId || '')) ? r.templateId : 'classic',
    members: cleanMembers(r.members || []),
    coverImage: cleanCoverImage(r.coverImage),
    weekStyle: r.weekStyle === 'first' ? 'first' : 'monday',
  };
}

/** One week's sheet: amounts per member per day, new-client count, activities per day. */
function cleanWeek(raw, memberIds) {
  const r = raw || {};
  if (!Array.isArray(r.rows)) throw new ValidationError('Week figures are missing.');
  if (r.rows.length > MAX_MEMBERS) throw new ValidationError('Too many rows.');
  const allowed = new Set(memberIds);
  const seen = new Set();
  const rows = [];
  for (const row of r.rows) {
    const memberId = cleanMemberId(row && row.memberId);
    // Rows for people no longer on the team are dropped, not an error (they may have just been removed).
    if (!allowed.has(memberId) || seen.has(memberId)) continue;
    seen.add(memberId);
    const out = { memberId, nc: count(row.nc) };
    for (const d of DAYS) out[d] = amount(row[d]);
    out.weekTotal = amount(row.weekTotal);
    rows.push(out);
  }
  const activities = {};
  for (const d of DAYS) activities[d] = multiline(r.activities && r.activities[d], 600);
  return { rows, activities, note: multiline(r.note, 600), places: cleanPlaces(r.places) };
}

/** Map pins for the week: [{day, name, lat, lon}], at most 60, inside sensible coordinates. */
function cleanPlaces(raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ValidationError('Places must be a list.');
  const out = [];
  const seen = new Set();
  for (const p of raw.slice(0, 60)) {
    if (!p || !DAYS.includes(p.day)) continue;
    const name = str(p.name, 80);
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const key = `${p.day}|${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ day: p.day, name, lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 });
  }
  return out;
}

module.exports = {
  DAYS,
  ValidationError,
  cleanTeamName,
  cleanPin,
  cleanWeekStart,
  cleanTeamProfile,
  cleanMembers,
  cleanCoverImage,
  cleanWeek,
  cleanPlaces,
  amount,
  count,
};
