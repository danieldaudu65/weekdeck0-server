'use strict';

function notFound(_req, res) {
  res.status(404).json({ error: { code: 'not_found', message: 'Not found.' } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'bad_json', message: 'Invalid request.' } });
  }
  if (err && err.code === 11000) {
    const key = Object.keys((err && err.keyPattern) || {}).join(',');
    const message = /^key$|accountant,key/.test(key) ? 'Two marketers can’t have the same name. Merge them instead.' : /emailKey/.test(key) ? 'That email already has an account.' : 'That team name is already taken.';
    return res.status(409).json({ error: { code: 'conflict', message } });
  }
  const status = err && err.expose && err.status ? err.status : 500;
  if (status >= 500) console.error('[weekdeck] error', req.method, req.path, err && err.message);
  res.status(status).json({
    error: {
      code: status >= 500 ? 'server_error' : 'bad_request',
      // Only our own validation messages reach the user; internals never do.
      message: status >= 500 ? 'Something went wrong. Please try again.' : err.message,
    },
  });
}

module.exports = { notFound, errorHandler };
