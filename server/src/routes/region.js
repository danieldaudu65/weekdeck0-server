'use strict';

/**
 * Region head: one login for the region. Teams join with the region's code;
 * the region head sees every team's week, a leaderboard, and can present any
 * team's slides (read-only).
 */
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const Region = require('../models/Region');
const Team = require('../models/Team');
const Week = require('../models/Week');
const asyncHandler = require('../utils/asyncHandler');
const { signRegionToken } = require('../utils/tokens');
const { requireRegion } = require('../middleware/auth');
const { cleanTeamName, cleanPin, cleanWeekStart, ValidationError, DAYS } = require('../utils/validate');
const { checkPin, newJoinCode } = require('../utils/pinLogin');
const { addDays, mondaysOfMonth } = require('../utils/dates');

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Too many attempts. Wait 15 minutes and try again.' } },
});

async function uniqueJoinCode() {
  for (let i = 0; i < 8; i++) {
    const code = newJoinCode();
    if (!(await Region.exists({ joinCode: code }))) return code;
  }
  throw new Error('Could not make a join code');
}

router.post(
  '/register',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const name = cleanTeamName(req.body && req.body.regionName);
    const pin = cleanPin(req.body && req.body.pin);
    if (await Region.exists({ nameKey: name.key })) {
      return res.status(409).json({ error: { code: 'taken', message: 'That region name is already registered. Log in instead.' } });
    }
    const region = await Region.create({ name: name.display, nameKey: name.key, pinHash: await bcrypt.hash(pin, 10), joinCode: await uniqueJoinCode() });
    res.status(201).json({ token: signRegionToken(region), region: region.toPublic() });
  }),
);

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    let name;
    let pin;
    try {
      name = cleanTeamName(req.body && req.body.regionName);
      pin = cleanPin(req.body && req.body.pin);
    } catch {
      throw new ValidationError('Wrong region name or PIN.');
    }
    const region = await Region.findOne({ nameKey: name.key });
    const r = await checkPin(region, pin);
    if (r.locked) return res.status(423).json({ error: { code: 'locked', message: `Too many wrong PINs. Try again in ${r.locked} minute${r.locked === 1 ? '' : 's'}.` } });
    if (!r.ok) return res.status(401).json({ error: { code: 'bad_credentials', message: 'Wrong region name or PIN.' } });
    res.json({ token: signRegionToken(region), region: region.toPublic() });
  }),
);

router.use(requireRegion);

router.get('/me', (req, res) => res.json({ region: req.region.toPublic() }));

router.post(
  '/pin',
  asyncHandler(async (req, res) => {
    const current = cleanPin(req.body && req.body.currentPin);
    const next = cleanPin(req.body && req.body.newPin);
    if (!(await bcrypt.compare(current, req.region.pinHash))) throw new ValidationError('Your current PIN is not correct.');
    req.region.pinHash = await bcrypt.hash(next, 10);
    req.region.tokenVersion = (req.region.tokenVersion || 0) + 1;
    await req.region.save();
    res.json({ token: signRegionToken(req.region) });
  }),
);

/** A new join code (the old one stops working; teams already in stay in). */
router.post(
  '/code',
  asyncHandler(async (req, res) => {
    req.region.joinCode = await uniqueJoinCode();
    await req.region.save();
    res.json({ region: req.region.toPublic() });
  }),
);

/* ---------------------------------------------------------------- dashboard */

const sumRow = (r) => DAYS.reduce((a, d) => a + (Number(r && r[d]) || 0), 0) + (Number(r && r.weekTotal) || 0);
/** Totals for one team's week, using only current members. */
function weekStats(team, week) {
  const names = new Map(team.members.map((m) => [m.id, m.name]));
  const rows = ((week && week.rows) || []).filter((r) => names.has(r.memberId));
  const per = rows.map((r) => ({ name: names.get(r.memberId), total: sumRow(r), nc: Number(r.nc) || 0 }));
  const total = per.reduce((a, p) => a + p.total, 0);
  const nc = per.reduce((a, p) => a + p.nc, 0);
  const top = [...per].sort((a, b) => b.total - a.total)[0];
  return { total, nc, per, top: top && top.total > 0 ? top : null, filled: rows.some((r) => sumRow(r) > 0 || r.nc) };
}

router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const weekStart = cleanWeekStart(req.query.week);
    const prevStart = addDays(weekStart, -7);
    const mondays = mondaysOfMonth(weekStart);
    const teams = await Team.find({ regionRef: req.region._id }).select('name teamTitle managerName region members templateId updatedAt').lean();
    const ids = teams.map((t) => t._id);
    const weeks = ids.length
      ? await Week.find({ team: { $in: ids }, weekStart: { $in: [...new Set([prevStart, ...mondays, weekStart])] } }).select('team weekStart rows updatedAt').lean()
      : [];
    const byTeam = new Map();
    for (const w of weeks) {
      const k = String(w.team);
      if (!byTeam.has(k)) byTeam.set(k, new Map());
      byTeam.get(k).set(w.weekStart, w);
    }
    const people = [];
    const list = teams.map((t) => {
      const mine = byTeam.get(String(t._id)) || new Map();
      const now = weekStats(t, mine.get(weekStart));
      const prev = weekStats(t, mine.get(prevStart));
      const month = mondays.reduce((a, m) => a + weekStats(t, mine.get(m)).total, 0);
      for (const p of now.per) if (p.total > 0 || p.nc) people.push({ name: p.name, team: t.teamTitle || t.name, total: p.total, nc: p.nc });
      const w = mine.get(weekStart);
      return {
        id: String(t._id),
        name: t.name,
        title: t.teamTitle || t.name,
        manager: t.managerName || '',
        members: t.members.length,
        total: now.total,
        nc: now.nc,
        prevTotal: mine.get(prevStart) ? prev.total : null,
        monthTotal: month,
        top: now.top ? { name: now.top.name, total: now.top.total } : null,
        submitted: now.filled,
        updatedAt: w ? w.updatedAt : null,
      };
    });
    list.sort((a, b) => b.total - a.total || b.monthTotal - a.monthTotal);
    people.sort((a, b) => b.total - a.total);
    res.json({
      region: req.region.toPublic(),
      weekStart,
      totals: {
        week: list.reduce((a, t) => a + t.total, 0),
        nc: list.reduce((a, t) => a + t.nc, 0),
        month: list.reduce((a, t) => a + t.monthTotal, 0),
        prevWeek: list.reduce((a, t) => a + (t.prevTotal || 0), 0),
        teams: list.length,
        submitted: list.filter((t) => t.submitted).length,
      },
      teams: list,
      people: people.slice(0, 10),
    });
  }),
);

async function regionTeam(req) {
  if (!mongoose.isValidObjectId(req.params.id)) return null;
  return Team.findOne({ _id: req.params.id, regionRef: req.region._id });
}

/** Everything needed to show one team's slides (read-only). */
router.get(
  '/teams/:id/deck',
  asyncHandler(async (req, res) => {
    const team = await regionTeam(req);
    if (!team) return res.status(404).json({ error: { code: 'not_found', message: 'That team isn’t in your region.' } });
    const weekStart = cleanWeekStart(req.query.week);
    const mondays = mondaysOfMonth(weekStart);
    const [week, monthWeeks, previous] = await Promise.all([
      Week.findOne({ team: team._id, weekStart }),
      Week.find({ team: team._id, weekStart: { $in: mondays } }).sort({ weekStart: 1 }),
      Week.findOne({ team: team._id, weekStart: addDays(weekStart, -7) }),
    ]);
    res.json({ team: team.toPublic(), week: week ? week.toPublic() : null, monthWeeks: monthWeeks.map((w) => w.toPublic()), previous: previous ? previous.toPublic() : null });
  }),
);

/** Remove a team from the region (it keeps all its data). */
router.delete(
  '/teams/:id',
  asyncHandler(async (req, res) => {
    const team = await regionTeam(req);
    if (!team) return res.status(404).json({ error: { code: 'not_found', message: 'That team isn’t in your region.' } });
    team.regionRef = null;
    team.regionName = '';
    await team.save();
    res.status(204).end();
  }),
);

module.exports = router;
