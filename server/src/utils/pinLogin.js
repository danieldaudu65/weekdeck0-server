'use strict';

const bcrypt = require('bcryptjs');

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
// A real hash to compare against when the account doesn't exist, so timing doesn't reveal it.
const DUMMY_HASH = bcrypt.hashSync('000000', 10);

/**
 * Checks a PIN (or an accountant's password, field "passwordHash") with
 * lockout: 5 wrong tries lock the account for 15 minutes. Returns { ok } or { locked: minutes } or { ok: false }.
 */
async function checkPin(doc, pin, field = 'pinHash') {
  if (!doc) {
    await bcrypt.compare(pin, DUMMY_HASH);
    return { ok: false };
  }
  if (doc.lockUntil && doc.lockUntil.getTime() > Date.now()) {
    return { ok: false, locked: Math.ceil((doc.lockUntil.getTime() - Date.now()) / 60000) };
  }
  if (!(await bcrypt.compare(pin, doc[field]))) {
    doc.failedLogins = (doc.failedLogins || 0) + 1;
    if (doc.failedLogins >= MAX_FAILS) {
      doc.failedLogins = 0;
      doc.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
    }
    await doc.save();
    return { ok: false };
  }
  if (doc.failedLogins || doc.lockUntil) {
    doc.failedLogins = 0;
    doc.lockUntil = null;
    await doc.save();
  }
  return { ok: true };
}

const JOIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I mix-ups
function newJoinCode() {
  const bytes = require('node:crypto').randomBytes(6);
  return Array.from(bytes, (b) => JOIN_ALPHABET[b % JOIN_ALPHABET.length]).join('');
}
const cleanJoinCode = (raw) => String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

module.exports = { checkPin, newJoinCode, cleanJoinCode, JOIN_ALPHABET };
