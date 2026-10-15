'use strict';

const { Router } = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const Team = require('../models/Team');
const asyncHandler = require('../utils/asyncHandler');
const { signTeamToken } = require('../utils/tokens');
const { cleanTeamName, cleanPin, ValidationError } = require('../utils/validate');
const { requireTeam } = require('../middleware/auth');

const router = Router();

const MAX_FAILS = 5;
// A real hash to compare against when the team doesn't exist, so the response time doesn't reveal it.
const DUMMY_HASH = bcrypt.hashSync('000000', 10);
const LOCK_MINUTES = 15;

// Slow down PIN guessing from one network: 20 attempts per 15 minutes.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Too many attempts. Wait 15 minutes and try again.' } },
});

/** Create a team (first visit). */
router.post(
  '/register',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const name = cleanTeamName(req.body && req.body.teamName);
    const pin = cleanPin(req.body && req.body.pin);
    if (await Team.exists({ nameKey: name.key })) {
      return res.status(409).json({ error: { code: 'taken', message: 'That team name is already registered. Log in instead, or add your region, e.g. "Lifter Marine Fagba".' } });
    }
    const team = await Team.create({
      name: name.display,
      nameKey: name.key,
      pinHash: await bcrypt.hash(pin, 10),
      teamTitle: name.display,
    });
    res.status(201).json({ token: signTeamToken(team), team: team.toPublic() });
  }),
);

/** Log in with team name + PIN. 5 wrong PINs lock the team for 15 minutes. */
router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    let name;
    let pin;
    try {
      name = cleanTeamName(req.body && req.body.teamName);
      pin = cleanPin(req.body && req.body.pin);
    } catch {
      throw new ValidationError('Wrong team name or PIN.');
    }
    const team = await Team.findOne({ nameKey: name.key });
    // Same message whether the team exists or not, so names can't be discovered this way.
    const fail = () => res.status(401).json({ error: { code: 'bad_credentials', message: 'Wrong team name or PIN.' } });
    if (!team) {
      await bcrypt.compare(pin, DUMMY_HASH); // even out timing
      return fail();
    }
    if (team.lockUntil && team.lockUntil.getTime() > Date.now()) {
      const mins = Math.ceil((team.lockUntil.getTime() - Date.now()) / 60000);
      return res.status(423).json({ error: { code: 'locked', message: `Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` } });
    }
    const ok = await bcrypt.compare(pin, team.pinHash);
    if (!ok) {
      team.failedLogins = (team.failedLogins || 0) + 1;
      if (team.failedLogins >= MAX_FAILS) {
        team.failedLogins = 0;
        team.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
      }
      await team.save();
      return fail();
    }
    if (team.failedLogins || team.lockUntil) {
      team.failedLogins = 0;
      team.lockUntil = null;
      await team.save();
    }
    res.json({ token: signTeamToken(team), team: team.toPublic() });
  }),
);

/** Change PIN (needs the current one). Signs out every other device. */
router.post(
  '/pin',
  requireTeam,
  asyncHandler(async (req, res) => {
    const current = cleanPin(req.body && req.body.currentPin);
    const next = cleanPin(req.body && req.body.newPin);
    if (!(await bcrypt.compare(current, req.team.pinHash))) throw new ValidationError('Your current PIN is not correct.');
    req.team.pinHash = await bcrypt.hash(next, 10);
    req.team.tokenVersion = (req.team.tokenVersion || 0) + 1;
    await req.team.save();
    res.json({ token: signTeamToken(req.team) });
  }),
);

module.exports = router;
