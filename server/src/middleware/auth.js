'use strict';

const mongoose = require('mongoose');
const Team = require('../models/Team');
const Region = require('../models/Region');
const Accountant = require('../models/Accountant');
const { verifyToken } = require('../utils/tokens');

function unauthorized(res) {
  return res.status(401).json({ error: { code: 'unauthenticated', message: 'Please log in again.' } });
}

/** Reads `Authorization: Bearer <token>` and loads its account if the kind matches. */
async function load(req, kind) {
  const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
  if (!m) return null;
  let payload;
  try {
    payload = verifyToken(m[1]);
  } catch {
    return null;
  }
  if (payload.k !== kind || !mongoose.isValidObjectId(payload.sub)) return null;
  const Model = kind === 't' ? Team : kind === 'a' ? Accountant : Region;
  const doc = await Model.findById(payload.sub);
  if (!doc || (doc.tokenVersion || 0) !== payload.v) return null;
  return doc;
}

/** A logged-in team. The team id never comes from the request body. */
async function requireTeam(req, res, next) {
  try {
    const team = await load(req, 't');
    if (!team) return unauthorized(res);
    req.team = team;
    next();
  } catch (err) {
    next(err);
  }
}

/** A logged-in region head. */
async function requireRegion(req, res, next) {
  try {
    const region = await load(req, 'r');
    if (!region) return unauthorized(res);
    req.region = region;
    next();
  } catch (err) {
    next(err);
  }
}

/** A logged-in accountant (their own region's workbook only). */
async function requireAccountant(req, res, next) {
  try {
    const accountant = await load(req, 'a');
    if (!accountant) return unauthorized(res);
    req.accountant = accountant;
    next();
  } catch (err) {
    next(err);
  }
}

/** Either a team or a region head (for shared helpers like map tiles). */
async function requireAnyAccount(req, res, next) {
  try {
    const m = /^Bearer (.+)$/.exec(req.get('authorization') || '');
    let kind = 't';
    try {
      kind = m ? verifyToken(m[1]).k : 't';
    } catch {
      /* handled below */
    }
    const doc = await load(req, kind === 'r' ? 'r' : 't');
    if (!doc) return unauthorized(res);
    if (kind === 'r') req.region = doc;
    else req.team = doc;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireTeam, requireRegion, requireAccountant, requireAnyAccount };
