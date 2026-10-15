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
