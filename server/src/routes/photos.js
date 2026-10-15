'use strict';

/**
 * Real cover photos from a free photo library: Pixabay (preferred, free key)
 * or Pexels. The key stays on the server. Search results are cached for 24
 * hours (Pixabay requires it, and it saves the free quota). Chosen photos are
 * downloaded and stored with the team, never hotlinked.
 */
const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/asyncHandler');
const { requireTeam } = require('../middleware/auth');
const { env } = require('../config/env');
const { ValidationError } = require('../utils/validate');
const { isAllowedImageUrl, searchRequest, readResults } = require('../utils/photoSources');

const router = Router();
router.use(requireTeam);

const perTeam = (limit, message) =>
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit,
    keyGenerator: (req) => String(req.team._id),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'photo_limit', message } },
  });

const cache = new Map(); // "query|page" → { at, body }
const DAY = 24 * 60 * 60 * 1000;
const provider = () => (env.pixabayKey ? 'pixabay' : env.pexelsKey ? 'pexels' : null);
const providerKey = () => env.pixabayKey || env.pexelsKey;

function off(res) {
  return res.status(503).json({ error: { code: 'photos_off', message: 'Real photos are not switched on for this website yet.' } });
}

router.get(
  '/search',
  perTeam(80, 'That’s a lot of searching for one hour. Try again a bit later.'),
  asyncHandler(async (req, res) => {
    const source = provider();
    if (!source) return off(res);
    const q = String(req.query.q || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const page = Math.min(20, Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1));
    if (q.length < 2) throw new ValidationError('Type what the picture should show.');
    const key = `${source}|${q.toLowerCase()}|${page}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < DAY) return res.json(hit.body);

    const { url, headers } = searchRequest(source, providerKey(), q, page);
    let r;
    try {
      r = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
    } catch {
      return res.status(502).json({ error: { code: 'photos_failed', message: 'Couldn’t reach the photo library. Check the internet and try again.' } });
    }
    if (r.status === 429) return res.status(429).json({ error: { code: 'photo_limit', message: 'The photo library is busy. Try again in a few minutes.' } });
    if (!r.ok) {
      console.warn(`[weekdeck] ${source} search failed`, r.status);
      return res.status(502).json({ error: { code: 'photos_failed', message: 'The photo library didn’t answer. Try again.' } });
    }
    const data = await r.json();
    const body = { ...readResults(source, data, page), source };
    if (cache.size > 2000) cache.clear();
    cache.set(key, { at: Date.now(), body });
    res.json(body);
  }),
);

/** Downloads the chosen photo for the browser (only from the photo libraries' own image servers). */
router.get(
  '/file',
  perTeam(120, 'Too many pictures in one hour. Try again a bit later.'),
  asyncHandler(async (req, res) => {
    if (!provider()) return off(res);
    const url = String(req.query.url || '');
    if (!isAllowedImageUrl(url)) throw new ValidationError('That picture can’t be used.');
    let r;
    try {
      // Follow at most two redirects, and only to the libraries' own image servers.
      let target = url;
      for (let hop = 0; ; hop++) {
        r = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(20_000) });
        const next = r.status >= 300 && r.status < 400 ? r.headers.get('location') : null;
        if (!next) break;
        target = new URL(next, target).href;
        if (hop >= 2 || !isAllowedImageUrl(target)) throw new Error('bad redirect');
      }
    } catch {
      return res.status(502).json({ error: { code: 'photos_failed', message: 'Couldn’t download that picture. Try another.' } });
    }
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !/^image\/(jpeg|png|webp)/.test(type)) {
      return res.status(502).json({ error: { code: 'photos_failed', message: 'Couldn’t download that picture. Try another.' } });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) throw new ValidationError('That picture is too big.');
    res.set({ 'Content-Type': type, 'Cache-Control': 'private, max-age=3600' });
    res.send(buf);
  }),
);

module.exports = router;
