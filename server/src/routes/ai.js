'use strict';

/**
 * Optional AI ideas for the week's activities, using the team's own history.
 * Off unless ANTHROPIC_API_KEY is set. The key never leaves the server.
 */
const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const Week = require('../models/Week');
const asyncHandler = require('../utils/asyncHandler');
const { requireTeam } = require('../middleware/auth');
const { env } = require('../config/env');
const { cleanWeekStart, ValidationError, DAYS } = require('../utils/validate');

const router = Router();
router.use(requireTeam);

// Each team: 30 AI requests an hour is plenty and keeps the bill small.
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => String(req.team._id),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'ai_limit', message: 'That’s a lot of ideas for one hour. Try again a bit later.' } },
});

const { parseIdeas, clip, DAY_NAMES } = require('../utils/aiIdeas');

router.post(
  '/ideas',
  aiLimiter,
  asyncHandler(async (req, res) => {
    if (!env.anthropicKey) {
      return res.status(503).json({ error: { code: 'ai_off', message: 'AI ideas are not switched on for this website.' } });
    }
    const weekStart = cleanWeekStart(req.body && req.body.weekStart);
    const draft = (req.body && req.body.activities) || {};
    const team = req.team;
    const past = await Week.find({ team: team._id, weekStart: { $lt: weekStart } }).select('weekStart activities').sort({ weekStart: -1 }).limit(8).lean();

    const history = past
      .map((w) => `${w.weekStart}: ` + DAYS.map((d) => `${DAY_NAMES[d]}: ${clip(w.activities?.[d], 140) || '-'}`).join(' | '))
      .join('\n');
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

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    let reply;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': env.anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: env.aiModel, max_tokens: 900, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => '');
        console.warn('[weekdeck] AI request failed', r.status, body.slice(0, 300));
        return res.status(502).json({ error: { code: 'ai_failed', message: 'The AI didn’t answer just now. Try again in a minute.' } });
      }
      const data = await r.json();
      reply = (data.content || []).map((c) => c.text || '').join('');
    } catch (err) {
      console.warn('[weekdeck] AI request error', err.name);
      return res.status(502).json({ error: { code: 'ai_failed', message: 'The AI didn’t answer just now. Try again in a minute.' } });
    } finally {
      clearTimeout(timer);
    }
    const parsed = parseIdeas(reply);
    if (!parsed || !parsed.ideas.length) {
      return res.status(502).json({ error: { code: 'ai_failed', message: 'The AI’s ideas came back garbled. Try again.' } });
    }
    res.json(parsed);
  }),
);

module.exports = router;
