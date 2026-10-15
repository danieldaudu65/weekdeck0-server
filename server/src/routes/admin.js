'use strict';

const crypto = require('node:crypto');
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const Team = require('../models/Team');
const asyncHandler = require('../utils/asyncHandler');
const { env } = require('../config/env');
const { cleanTeamName, cleanPin } = require('../utils/validate');

const router = Router();

/** Only with a correct X-Admin-Secret header (constant-time compare). Off when ADMIN_SECRET is unset. */
function requireAdmin(req, res, next) {
  if (!env.adminSecret || env.adminSecret.length < 16) return res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } });
  const given = Buffer.from(String(req.get('x-admin-secret') || ''));
  const expected = Buffer.from(env.adminSecret);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return res.status(401).json({ error: { code: 'unauthorized', message: 'Unauthorized.' } });
  }
  next();
}

router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));
router.use(requireAdmin);

/** Region head resets a manager's forgotten PIN. Signs the team out everywhere. */
router.post(
  '/reset-pin',
  asyncHandler(async (req, res) => {
    const name = cleanTeamName(req.body && req.body.teamName);
    const pin = cleanPin(req.body && req.body.newPin);
    const team = await Team.findOne({ nameKey: name.key });
    if (!team) return res.status(404).json({ error: { code: 'not_found', message: 'No team with that name.' } });
    team.pinHash = await bcrypt.hash(pin, 10);
    team.tokenVersion = (team.tokenVersion || 0) + 1;
    team.failedLogins = 0;
    team.lockUntil = null;
    await team.save();
    res.json({ ok: true, team: team.name });
  }),
);

/** List team names (for the region head). */
router.get(
  '/teams',
  asyncHandler(async (_req, res) => {
    const teams = await Team.find({}, { name: 1, managerName: 1, updatedAt: 1 }).sort({ name: 1 }).limit(500);
    res.json({ teams: teams.map((t) => ({ name: t.name, managerName: t.managerName, updatedAt: t.updatedAt })) });
  }),
);

module.exports = router;
