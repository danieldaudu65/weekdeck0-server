'use strict';

/**
 * AI helpers (all optional, switched on by keys in server/.env):
 *   POST /ideas    activity ideas from the team's own history (Gemini or Claude)
 *   POST /summary  2–3 lines on how the week went, for the summary slide
 *   POST /events   real events near the team this week: web search (Tavily) + AI,
 *                  or Gemini searching Google itself
 * Keys never leave the server.
 */
const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const Week = require('../models/Week');
const asyncHandler = require('../utils/asyncHandler');
const { requireTeam } = require('../middleware/auth');
const { cleanWeekStart, ValidationError, DAYS } = require('../utils/validate');
const { generate, providers, AiError } = require('../utils/llm');
const { searchEvents, SearchError } = require('../utils/webSearch');
const { env } = require('../config/env');
const { parseIdeas, parseEvents, weekDates, clip, DAY_NAMES } = require('../utils/aiIdeas');

const router = Router();
router.use(requireTeam);

const perTeam = (limit, message) =>
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit,
    keyGenerator: (req) => String(req.team._id),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'ai_limit', message } },
  });

function aiFail(res, err) {
  if (err instanceof AiError) return res.status(502).json({ error: { code: 'ai_failed', message: err.message } });
  throw err;
}

const sumRow = (r) => DAYS.reduce((a, d) => a + (Number(r && r[d]) || 0), 0);
const naira = (n) => `₦${Math.round(n).toLocaleString('en-US')}`;

/* ---------------------------------------------------------------- ideas */

router.post(
  '/ideas',
  perTeam(30, 'That’s a lot of ideas for one hour. Try again a bit later.'),
  asyncHandler(async (req, res) => {
    if (!providers().text) return res.status(503).json({ error: { code: 'ai_off', message: 'AI ideas are not switched on for this website.' } });
    const weekStart = cleanWeekStart(req.body && req.body.weekStart);
    const draft = (req.body && req.body.activities) || {};
    const team = req.team;
    const past = await Week.find({ team: team._id, weekStart: { $lt: weekStart } }).select('weekStart activities').sort({ weekStart: -1 }).limit(8).lean();

    const history = past.map((w) => `${w.weekStart}: ` + DAYS.map((d) => `${DAY_NAMES[d]}: ${clip(w.activities?.[d], 140) || '-'}`).join(' | ')).join('\n');
    const thisWeek = DAYS.map((d) => `${DAY_NAMES[d]}: ${clip(draft[d], 200) || '(empty)'}`).join('\n');
    if (history.length + thisWeek.length > 12000) throw new ValidationError('Too much text to send.');

    const prompt = `You help a real-estate sales team in Nigeria plan its weekly marketing activities (Adron Homes style: market storms, site inspections, church/mosque outreach, corporate visits, telemarketing, flyers, social media, follow-ups).
Team: ${clip(team.teamTitle || team.name, 80)}. Region: ${clip(team.region, 40) || 'unknown'}.

Recent weeks (newest first):
${history || '(no history yet)'}

This week so far:
${thisWeek}

Suggest fresh, specific activity ideas for this week. Reuse places the team already works in, add a few nearby new ones, vary the tactics, and keep each idea short (under 15 words) the way a team writes it on a slide. Give 1-3 ideas per day, mostly for the empty days.
Also give one short, practical tip for the week based on their pattern.
Reply with JSON only: {"ideas":[{"day":"mon","text":"..."}],"tip":"..."} using day keys mon,tue,wed,thu,fri.`;

    let reply;
    try {
      reply = await generate(prompt, { maxTokens: 900 });
    } catch (err) {
      return aiFail(res, err);
    }
    const parsed = parseIdeas(reply.text);
    if (!parsed || !parsed.ideas.length) return res.status(502).json({ error: { code: 'ai_failed', message: 'The AI’s ideas came back garbled. Try again.' } });
    res.json(parsed);
  }),
);

/* ---------------------------------------------------------------- blend */

/**
 * Blends a new idea into what a day already says, as one natural line
 * (instead of stacking it underneath). Every place name is kept exactly.
 */
router.post(
  '/blend',
  perTeam(120, 'Too many changes this hour. Try again a bit later.'),
  asyncHandler(async (req, res) => {
    if (!providers().text) return res.status(503).json({ error: { code: 'ai_off', message: 'AI is not switched on for this website.' } });
    const current = clip(req.body && req.body.current, 600);
    const addition = clip(req.body && req.body.addition, 200);
    if (!current || !addition) throw new ValidationError('Nothing to blend.');
    const prompt = `A real-estate sales team in Lagos writes its daily marketing activities on a weekly slide.
Today's plan already says: "${current}"
Add this new activity to it: "${addition}"

Rewrite them as ONE short, natural plan for the day (like a team writes on a slide, under 170 characters if possible).
Rules: keep every activity and keep every place name exactly as written; don't add new facts; no quotation marks; no full stop at the end.
Reply with the rewritten plan only.`;
    let reply;
    try {
      reply = await generate(prompt, { maxTokens: 200 });
    } catch (err) {
      return aiFail(res, err);
    }
    const text = clip(reply.text.replace(/^["'\s]+|["'.\s]+$/g, ''), 600);
    // Guard: the blended line must still contain the places (capitalised words after "at") from both parts.
    const places = (t) => [...t.matchAll(/\b(?:at|in|around)\s+([A-Z][\w'’-]*(?:\s+[A-Z][\w'’-]*)*)/g)].map((m) => m[1].toLowerCase());
    const lost = [...places(current), ...places(addition)].filter((p) => !text.toLowerCase().includes(p));
    if (text.length < 8 || lost.length) return res.status(422).json({ error: { code: 'blend_unsafe', message: 'Couldn’t blend without losing a place.' } });
    res.json({ text });
  }),
);

/* ---------------------------------------------------------------- summary */

router.post(
  '/summary',
  perTeam(30, 'Too many summaries this hour. Try again a bit later.'),
  asyncHandler(async (req, res) => {
    if (!providers().text) return res.status(503).json({ error: { code: 'ai_off', message: 'AI is not switched on for this website.' } });
    const weekStart = cleanWeekStart(req.body && req.body.weekStart);
    const team = req.team;
    const [week, prev] = await Promise.all([
      Week.findOne({ team: team._id, weekStart }).lean(),
      Week.findOne({ team: team._id, weekStart: { $lt: weekStart } }).sort({ weekStart: -1 }).lean(),
    ]);
    const names = new Map(team.members.map((m) => [m.id, m.name]));
    const rows = ((week && week.rows) || []).filter((r) => names.has(r.memberId));
    const per = rows.map((r) => ({ name: names.get(r.memberId), total: sumRow(r), nc: Number(r.nc) || 0 })).sort((a, b) => b.total - a.total);
    const total = per.reduce((a, p) => a + p.total, 0);
    const nc = per.reduce((a, p) => a + p.nc, 0);
    const prevTotal = prev ? (prev.rows || []).reduce((a, r) => a + sumRow(r), 0) : null;
    if (!total && !nc) return res.status(400).json({ error: { code: 'no_figures', message: 'Add this week’s figures first, then ask for a summary.' } });

    const prompt = `Write the "week at a glance" note for a Nigerian real-estate sales team's weekly slide.
Facts (use only these, don't invent numbers):
- Team: ${clip(team.teamTitle || team.name, 80)}${team.region ? `, ${clip(team.region, 40)} region` : ''}
- This week's total sales: ${naira(total)}; new clients: ${nc}
- Last week's total: ${prevTotal === null ? 'not recorded' : naira(prevTotal)}
- Per member: ${per.map((p) => `${p.name} ${naira(p.total)}${p.nc ? ` (${p.nc} new clients)` : ''}`).join('; ')}
- Activities: ${DAYS.map((d) => `${DAY_NAMES[d]}: ${clip(week?.activities?.[d], 100) || '-'}`).join(' | ')}

Write 2 or 3 short sentences, at most 280 characters in total: how the week went (celebrate the top performer by first name), the change from last week if known, and one clear focus for next week. Warm, confident, professional. No hashtags, no emojis, no quotation marks. Reply with the note only.`;

    let reply;
    try {
      reply = await generate(prompt, { maxTokens: 300 });
    } catch (err) {
      return aiFail(res, err);
    }
    const summary = clip(reply.text.replace(/^["'\s]+|["'\s]+$/g, ''), 400);
    if (summary.length < 20) return res.status(502).json({ error: { code: 'ai_failed', message: 'The AI’s summary came back empty. Try again.' } });
    res.json({ summary });
  }),
);

/* ---------------------------------------------------------------- events */

const eventCache = new Map(); // "team|week|query" → { at, body }

router.post(
  '/events',
  perTeam(20, 'That’s a lot of event searches this hour. Try again later.'),
  asyncHandler(async (req, res) => {
    const useWeb = Boolean(env.tavilyKey);
    if (!useWeb && !providers().search) return res.status(503).json({ error: { code: 'events_off', message: 'Event search needs a free Tavily (or Gemini) key on the server.' } });
    const weekStart = cleanWeekStart(req.body && req.body.weekStart);
    const team = req.team;
    const area = clip(req.body && req.body.area, 60) || clip(team.region, 40) || 'Lagos';
    const focus = clip(req.body && req.body.query, 120);
    const key = `${team._id}|${weekStart}|${area.toLowerCase()}|${focus.toLowerCase()}`;
    const hit = eventCache.get(key);
    if (hit && Date.now() - hit.at < 6 * 60 * 60 * 1000) return res.json(hit.body);

    const dates = weekDates(weekStart);
    const rules = `They are for a real-estate sales team that goes where crowds are to meet potential land and home buyers.
Rules:
- Never invent events, places, dates or links.
- The event must happen (at least partly) between ${dates[0].slice(4)} and ${dates[6].slice(4)}. Skip anything you can't confirm for those dates.
- Up to 8 events, nearest to ${area} first.
Day keys for that week: ${dates.join(', ')}.
Reply with JSON only:
{"events":[{"title":"...","place":"venue name","area":"neighbourhood, city","dates":"e.g. Thu 23 – Sun 26 Oct","days":["thu","fri"],"why":"one short line on why it's good for meeting buyers","url":"https://..."}]}
If nothing reliable is found, reply {"events":[]}.`;

    let body;
    if (useWeb) {
      // 1. Search the web (Tavily), 2. let an AI pick out real events from those results only.
      let results;
      try {
        results = await searchEvents(area, focus, weekStart);
      } catch (err) {
        if (err instanceof SearchError) return res.status(502).json({ error: { code: 'search_failed', message: err.message } });
        throw err;
      }
      const leads = results.map((r) => ({ title: r.title, url: r.url, snippet: r.content.slice(0, 220), date: r.date }));
      const sources = results.map((r) => ({ url: r.url, title: r.title }));
      let events = [];
      let note = '';
      if (results.length && providers().text) {
        const listing = results.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}${r.date ? `\nPublished: ${r.date}` : ''}\n${r.content}`).join('\n\n');
        const prompt = `Below are web search results. Find real public events and big gatherings happening in or near ${area}, Lagos State, Nigeria.
${focus ? `Focus on: ${focus}.` : ''}
Use ONLY the information in these results. Each event's "url" must be the URL of the result it came from.
${rules}

SEARCH RESULTS:
${listing}`;
        try {
          const reply = await generate(prompt, { maxTokens: 1800 });
          events = parseEvents(reply.text, sources) || [];
          events = events.filter((e) => e.verified); // keep only events tied to a real search result
        } catch (err) {
          if (!(err instanceof AiError)) throw err;
          note = 'The AI couldn’t sort the results just now, so here are the search results to check yourself.';
        }
      }
      body = { area, events, sources, leads, note, suggestionsHtml: '' };
    } else {
      const prompt = `Search Google for real public events and big gatherings happening in or near ${area}, Lagos State, Nigeria (including nearby areas) between ${dates[0].slice(4)} and ${dates[6].slice(4)}.
${focus ? `Focus on: ${focus}.` : 'Look for: trade fairs and exhibitions, church crusades/conventions/programmes, mosque programmes, big market days, festivals, concerts, conferences, career/property expos, sports events, community events.'}
Only include events you found in search results, with a link to the page you found them on.
${rules}`;
      let reply;
      try {
        reply = await generate(prompt, { search: true, maxTokens: 1800 });
      } catch (err) {
        return aiFail(res, err);
      }
      if (!reply.sources.length && !reply.suggestionsHtml) {
        return res.status(502).json({ error: { code: 'no_search', message: 'The AI couldn’t search Google just now, so no events are shown. Try again.' } });
      }
      const events = parseEvents(reply.text, reply.sources);
      if (!events) return res.status(502).json({ error: { code: 'ai_failed', message: 'The event list came back garbled. Try again.' } });
      body = { area, events, sources: reply.sources, leads: [], note: '', suggestionsHtml: String(reply.suggestionsHtml || '').slice(0, 20000) };
    }
    if (eventCache.size > 1000) eventCache.clear();
    eventCache.set(key, { at: Date.now(), body });
    res.json(body);
  }),
);

module.exports = router;
