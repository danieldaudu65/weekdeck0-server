'use strict';

const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

/** A login token for one team. `v` must match the team's tokenVersion (bumped on PIN change). */
function signTeamToken(team) {
  return jwt.sign({ sub: String(team._id), v: team.tokenVersion || 0 }, env.jwtSecret, {
    expiresIn: `${env.tokenDays}d`,
    algorithm: 'HS256',
  });
}

function verifyTeamToken(token) {
  return jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
}

module.exports = { signTeamToken, verifyTeamToken };
