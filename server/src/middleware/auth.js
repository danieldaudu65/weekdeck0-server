'use strict';

const mongoose = require('mongoose');
const Team = require('../models/Team');
const { verifyTeamToken } = require('../utils/tokens');

function unauthorized(res) {
  return res.status(401).json({ error: { code: 'unauthenticated', message: 'Please log in again.' } });
}

/** Checks `Authorization: Bearer <token>` and loads the team. The team id never comes from the request body. */
async function requireTeam(req, res, next) {
  try {
    const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
    if (!m) return unauthorized(res);
    let payload;
    try {
      payload = verifyTeamToken(m[1]);
    } catch {
      return unauthorized(res);
    }
    if (!mongoose.isValidObjectId(payload.sub)) return unauthorized(res);
    const team = await Team.findById(payload.sub);
    if (!team || (team.tokenVersion || 0) !== payload.v) return unauthorized(res);
    req.team = team;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireTeam };
