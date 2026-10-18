'use strict';

/**
 * AI helpers (all optional, switched on by keys in server/.env):
 *   POST /ideas    activity ideas from the team's own history (Gemini or Claude)
 *   POST /summary  2–3 lines on how the week went, for the summary slide
 *   POST /events   real events near the team this week, found with Google Search (Gemini)
 * Keys never leave the server.
 */
const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const Week = require('../models/Week');
const asyncHandler = require('../utils/asyncHandler');
const { requireTeam } = require('../middleware/auth');
const { cleanWeekStart, ValidationError, DAYS } = require('../utils/validate');
const { generate, providers, AiError } = require('../utils/llm');
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
    if (!providers().search) return res.status(503).json({ error: { code: 'events_off', message: 'Event search needs a free Gemini key on the server.' } });
    const weekStart = cleanWeekStart(req.body && req.body.weekStart);
    const team = req.team;
    const area = clip(req.body && req.body.area, 60) || clip(team.region, 40) || 'Lagos';
    const focus = clip(req.body && req.body.query, 120);
    const key = `${team._id}|${weekStart}|${area.toLowerCase()}|${focus.toLowerCase()}`;
    const hit = eventCache.get(key);
    if (hit && Date.now() - hit.at < 6 * 60 * 60 * 1000) return res.json(hit.body);

    const dates = weekDates(weekStart);
    const prompt = `Search Google for real public events and big gatherings happening in or near ${area}, Lagos State, Nigeria (including nearby areas) between ${dates[0].slice(4)} and ${dates[6].slice(4)}.
${focus ? `Focus on: ${focus}.` : 'Look for: trade fairs and exhibitions, church crusades/conventions/programmes, mosque programmes, big market days, festivals, concerts, conferences, career/property expos, sports events, community events.'}
They are for a real-estate sales team that goes where crowds are to meet potential land and home buyers.

Rules:
- Only include events you found in search results, with a link to the page you found them on. Never invent events, places, dates or links.
- The event must happen (at least partly) in that week. Skip anything you can't confirm.
- Up to 8 events, nearest to ${area} first.
Day keys for that week: ${dates.join(', ')}.

Reply with JSON only:
{"events":[{"title":"...","place":"venue name","area":"neighbourhood, city","dates":"e.g. Thu 23 – Sun 26 Oct","days":["thu","fri"],"why":"one short line on why it's good for meeting buyers","url":"https://..."}]}
If you find nothing reliable, reply {"events":[]}.`;

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
    const body = { area, events, sources: reply.sources, suggestionsHtml: String(reply.suggestionsHtml || '').slice(0, 20000) };
    if (eventCache.size > 1000) eventCache.clear();
    eventCache.set(key, { at: Date.now(), body });
    res.json(body);
  }),
);

module.exports = router;
