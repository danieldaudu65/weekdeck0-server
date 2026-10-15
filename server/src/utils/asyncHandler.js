'use strict';

/** Lets async route handlers throw; errors go to the error middleware. */
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
