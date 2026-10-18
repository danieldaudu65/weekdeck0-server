'use strict';

const { Router } = require('express');
const Team = require('../models/Team');
const asyncHandler = require('../utils/asyncHandler');
const { requireTeam } = require('../middleware/auth');
const Region = require('../models/Region');
const { cleanTeamProfile, cleanTeamName, ValidationError } = require('../utils/validate');
const { cleanJoinCode } = require('../utils/pinLogin');

const router = Router();
router.use(requireTeam);

router.get('/', (req, res) => {
  res.json({ team: req.team.toPublic() });
});

/** Save slide details and members (after import, or from the Team page). */
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const profile = cleanTeamProfile(req.body);
    // Renaming the team changes the login name, so it must stay unique.
    if (req.body && req.body.name !== undefined) {
      const name = cleanTeamName(req.body.name);
      if (name.key !== req.team.nameKey) {
        const taken = await Team.exists({ nameKey: name.key, _id: { $ne: req.team._id } });
        if (taken) return res.status(409).json({ error: { code: 'taken', message: 'Another team already uses that name.' } });
        req.team.nameKey = name.key;
      }
      req.team.name = name.display;
    }
    Object.assign(req.team, profile);
    await req.team.save();
    res.json({ team: req.team.toPublic() });
  }),
);

/** Join a region with the code the region head shares. */
router.post(
  '/join',
  asyncHandler(async (req, res) => {
    const code = cleanJoinCode(req.body && req.body.code);
    if (code.length !== 6) throw new ValidationError('The region code has 6 letters and numbers.');
    const region = await Region.findOne({ joinCode: code });
    if (!region) return res.status(404).json({ error: { code: 'bad_code', message: 'No region has that code. Check it with your region head.' } });
    req.team.regionRef = region._id;
    req.team.regionName = region.name;
    await req.team.save();
    res.json({ team: req.team.toPublic() });
  }),
);

router.post(
  '/leave',
  asyncHandler(async (req, res) => {
    req.team.regionRef = null;
    req.team.regionName = '';
    await req.team.save();
    res.json({ team: req.team.toPublic() });
  }),
);

module.exports = router;
