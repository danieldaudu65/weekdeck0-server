'use strict';

const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

/**
 * Login tokens. `k` says who it's for ("t" team, "r" region head) so one can
 * never be used as the other. `v` must match the account's tokenVersion
 * (bumped on PIN change, which logs out every other device).
 */
function sign(kind, doc) {
  return jwt.sign({ sub: String(doc._id), v: doc.tokenVersion || 0, k: kind }, env.jwtSecret, {
    expiresIn: `${env.tokenDays}d`,
    algorithm: 'HS256',
  });
}

const signTeamToken = (team) => sign('t', team);
const signRegionToken = (region) => sign('r', region);

function verifyToken(token) {
  const p = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  return { ...p, k: p.k || 't' }; // tokens made before regions existed are team tokens
}

/** Kept for older imports: verifies and returns the payload (team or region). */
const verifyTeamToken = verifyToken;

module.exports = { signTeamToken, signRegionToken, verifyToken, verifyTeamToken };
