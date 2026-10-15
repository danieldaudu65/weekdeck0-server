'use strict';

const { Router } = require('express');
const Team = require('../models/Team');
const asyncHandler = require('../utils/asyncHandler');
const { requireTeam } = require('../middleware/auth');
const { cleanTeamProfile, cleanTeamName } = require('../utils/validate');

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

module.exports = router;
