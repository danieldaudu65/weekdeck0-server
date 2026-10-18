'use strict';

const { DAYS } = require('./validate');

const DAY_NAMES = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday' };
const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Turns the model's reply into {ideas: [{day, text}], tip}, ignoring anything malformed. */
function parseIdeas(text) {
  const m = /\{[\s\S]*\}/.exec(text || '');
  if (!m) return null;
  let data;
  try {
    data = JSON.parse(m[0]);
  } catch {
    return null;
  }
  const ideas = Array.isArray(data.ideas)
    ? data.ideas
        .filter((i) => i && DAYS.includes(i.day) && typeof i.text === 'string' && i.text.trim())
        .slice(0, 15)
        .map((i) => ({ day: i.day, text: clip(i.text, 160) }))
    : [];
  return { ideas, tip: clip(data.tip, 240) };
}

module.exports = { parseIdeas, clip, DAY_NAMES };

const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const httpUrl = (u) => (typeof u === 'string' && /^https?:\/\/[^\s"<>]+$/i.test(u) && u.length < 1000 ? u : '');

/**
 * Events found by the AI → a clean list. `sources` are the links Google search
 * actually returned; an event is marked verified when its link is one of them.
 */
function parseEvents(text, sources) {
  const { jsonFrom } = require('./llm');
  const data = jsonFrom(text);
  if (!data || !Array.isArray(data.events)) return null;
  const cited = new Set((sources || []).map((s) => s.url));
  const out = [];
  for (const e of data.events.slice(0, 12)) {
    if (!e || typeof e.title !== 'string' || !e.title.trim()) continue;
    const url = httpUrl(e.url);
    out.push({
      title: clip(e.title, 100),
      place: clip(e.place, 100),
      area: clip(e.area, 60),
      dates: clip(e.dates, 60),
      days: Array.isArray(e.days) ? [...new Set(e.days.map((d) => String(d).toLowerCase().slice(0, 3)).filter((d) => ALL_DAYS.includes(d)))] : [],
      why: clip(e.why, 160),
      url,
      verified: Boolean(url && cited.has(url)),
    });
  }
  return out;
}

/** "YYYY-MM-DD" Monday → Monday..Sunday as readable dates for the prompt. */
function weekDates(weekStart) {
  const base = Date.parse(`${weekStart}T12:00:00Z`);
  return ALL_DAYS.map((d, i) => {
    const dt = new Date(base + i * 86400000);
    return `${d}=${dt.toISOString().slice(0, 10)}`;
  });
}

module.exports.parseEvents = parseEvents;
module.exports.weekDates = weekDates;
module.exports.ALL_DAYS = ALL_DAYS;
