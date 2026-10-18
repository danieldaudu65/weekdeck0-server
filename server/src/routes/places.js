'use strict';

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/asyncHandler');
const GeoCache = require('../models/GeoCache');
const { requireAnyAccount } = require('../middleware/auth');
const { ValidationError } = require('../utils/validate');
const { photonSearch, near, validTile, UA } = require('../utils/places');

const router = Router();
router.use(requireAnyAccount);

const who = (req) => String((req.team || req.region)._id);
const limiter = (limit, windowMs = 60 * 1000) =>
  rateLimit({ windowMs, limit, keyGenerator: who, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: { code: 'slow_down', message: 'Too many map requests. Wait a moment.' } } });

const clean = (s, max) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
const memory = new Map(); // short-lived search cache: "q|lat|lon" → { at, places }

/** Places matching what's typed, closest to the team first. */
router.get(
  '/search',
  limiter(60),
  asyncHandler(async (req, res) => {
    const q = clean(req.query.q, 80);
    if (q.length < 2) return res.json({ places: [] });
    const at = near(Number(req.query.lat), Number(req.query.lon));
    const key = `${q.toLowerCase()}|${at.lat.toFixed(2)}|${at.lon.toFixed(2)}`;
    const hit = memory.get(key);
    if (hit && Date.now() - hit.at < 6 * 60 * 60 * 1000) return res.json({ places: hit.places });
    let places;
    try {
      places = await photonSearch(q, at, 6);
    } catch {
      return res.json({ places: [], offline: true }); // suggestions are a bonus; never break typing
    }
    if (memory.size > 3000) memory.clear();
    memory.set(key, { at: Date.now(), places });
    res.json({ places });
  }),
);

/** Coordinates for place names written in the activities (for the map). Cached in the database. */
router.post(
  '/geocode',
  limiter(30),
  asyncHandler(async (req, res) => {
    const names = Array.isArray(req.body && req.body.names) ? req.body.names : [];
    if (names.length > 25) throw new ValidationError('Too many places at once.');
    const at = near(Number(req.body.lat), Number(req.body.lon));
    const context = clean(req.body.context, 40); // e.g. the team's region, to pick the right "Ogba"
    const out = {};
    for (const raw of names) {
      const name = clean(raw, 80);
      if (name.length < 3) continue;
      const key = `${name}|${context}`.toLowerCase();
      let doc = await GeoCache.findOne({ key }).lean();
      if (!doc) {
        let best = null;
        try {
          best = (await photonSearch(context ? `${name} ${context}` : name, at, 1))[0] || (context ? (await photonSearch(name, at, 1))[0] : null) || null;
        } catch {
          continue; // try again next time instead of caching a failure
        }
        doc = best
          ? { key, found: true, name: best.name, label: [best.name, best.area].filter(Boolean).join(', '), lat: best.lat, lon: best.lon }
          : { key, found: false };
        await GeoCache.updateOne({ key }, { $set: { ...doc, at: new Date() } }, { upsert: true }).catch(() => undefined);
      }
      if (doc.found) out[name] = { label: doc.label, lat: doc.lat, lon: doc.lon };
    }
    res.json({ places: out });
  }),
);

/**
 * Map tiles for the map slide. The browser needs them through our server to
 * draw them into the slide picture. Cached in memory; OpenStreetMap asks for a
 * clear User-Agent and light use, which caching gives.
 */
const tiles = new Map(); // "z/x/y" → { at, buf }
router.get(
  '/tile/:z/:x/:y',
  limiter(400),
  asyncHandler(async (req, res) => {
    const [z, x, y] = [req.params.z, req.params.x, req.params.y].map((v) => Number(v));
    if (!validTile(z, x, y)) throw new ValidationError('Bad tile.');
    const key = `${z}/${x}/${y}`;
    let hit = tiles.get(key);
    if (!hit || Date.now() - hit.at > 7 * 24 * 60 * 60 * 1000) {
      let r;
      try {
        r = await fetch(`https://tile.openstreetmap.org/${key}.png`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) });
      } catch {
        return res.status(502).end();
      }
      if (!r.ok) return res.status(502).end();
      hit = { at: Date.now(), buf: Buffer.from(await r.arrayBuffer()) };
      if (tiles.size > 1500) tiles.delete(tiles.keys().next().value);
      tiles.set(key, hit);
    }
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'private, max-age=604800' });
    res.send(hit.buf);
  }),
);

module.exports = router;
