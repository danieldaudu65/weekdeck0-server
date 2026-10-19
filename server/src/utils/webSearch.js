'use strict';

/**
 * Web search for "Events near us" through Tavily (free: 1,000 searches a
 * month, no card). Returns plain results; an AI then picks out the events.
 */
const { env } = require('../config/env');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "20 – 26 October 2026" for a Monday "YYYY-MM-DD". */
function weekWords(weekStart) {
  const a = new Date(`${weekStart}T12:00:00Z`);
  const b = new Date(a.getTime() + 6 * 86400000);
  const m = (d) => MONTHS[d.getUTCMonth()];
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()} – ${b.getUTCDate()} ${m(b)} ${b.getUTCFullYear()}`
    : `${a.getUTCDate()} ${m(a)} – ${b.getUTCDate()} ${m(b)} ${b.getUTCFullYear()}`;
}

/** Two searches that together catch most listings for that week. */
function eventQueries(area, focus, weekStart) {
  const d = new Date(`${weekStart}T12:00:00Z`);
  const month = `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const what = focus || 'events';
  return [`${what} in ${area} Lagos ${month}`, `${focus || 'trade fair exhibition church programme crusade festival'} Lagos Nigeria ${weekWords(weekStart)}`];
}

const okUrl = (u) => typeof u === 'string' && /^https?:\/\/[^\s"<>]+$/i.test(u) && u.length < 1000;

/** Tavily results → [{title, url, content, date}] (clean, no duplicates). */
function readTavily(data) {
  const out = [];
  for (const r of (data && data.results) || []) {
    if (!r || !okUrl(r.url) || typeof r.title !== 'string') continue;
    out.push({
      title: r.title.replace(/\s+/g, ' ').trim().slice(0, 160),
      url: r.url,
      content: String(r.content || '').replace(/\s+/g, ' ').trim().slice(0, 600),
      date: typeof r.published_date === 'string' ? r.published_date.slice(0, 10) : '',
      score: Number(r.score) || 0,
    });
  }
  return out;
}

class SearchError extends Error {}

async function tavily(query) {
  let r;
  try {
    r = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${env.tavilyKey}` },
      body: JSON.stringify({ query: query.slice(0, 380), topic: 'general', search_depth: 'basic', max_results: 8 }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new SearchError('Couldn’t reach the search service. Check the internet and try again.');
  }
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) throw new SearchError('The Tavily key on the server isn’t valid. Check TAVILY_API_KEY.');
  if (r.status === 429 || r.status === 432 || r.status === 433) throw new SearchError('The free search allowance is used up for now. Try again later.');
  if (!r.ok) {
    console.warn('[weekdeck] Tavily failed', r.status, JSON.stringify(data).slice(0, 300));
    throw new SearchError('The search service didn’t answer. Try again.');
  }
  return readTavily(data);
}

/** Runs the searches and merges them, best first. */
async function searchEvents(area, focus, weekStart) {
  const settled = await Promise.allSettled(eventQueries(area, focus, weekStart).map(tavily));
  const ok = settled.filter((s) => s.status === 'fulfilled').flatMap((s) => s.value);
  if (!ok.length) {
    const failed = settled.find((s) => s.status === 'rejected');
    if (failed) throw failed.reason;
  }
  const seen = new Set();
  return ok
    .sort((a, b) => b.score - a.score)
    .filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)))
    .slice(0, 14);
}

module.exports = { searchEvents, readTavily, eventQueries, weekWords, SearchError };
