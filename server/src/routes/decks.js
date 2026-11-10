'use strict';

/** A team leader's restyled decks ("Decks" tab), and the public share links. */
const crypto = require('crypto');
const { Router } = require('express');
const mongoose = require('mongoose');
const RestyleDeck = require('../models/RestyleDeck');
const asyncHandler = require('../utils/asyncHandler');
const { requireTeam } = require('../middleware/auth');
const { cleanRestyle } = require('../utils/restyle');

const MAX_DECKS = 60;
const summary = (d) => ({
  id: String(d._id),
  title: d.title,
  lookId: d.lookId,
  logo: d.logo === 'none' ? 'none' : 'adron',
  count: (d.slides || []).filter((s) => !s.hidden).length,
  thumb: d.thumb || '',
  first: d.first || null,
  shareId: d.shareId || null,
  updatedAt: d.updatedAt,
});
const full = (d) => ({ ...summary(d), transition: d.transition, sourceName: d.sourceName, slides: d.slides || [] });

const router = Router();
router.use(requireTeam);

const own = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ error: { code: 'not_found', message: 'That deck isn’t here any more.' } });
    return null;
  }
  const d = await RestyleDeck.findOne({ _id: req.params.id, team: req.team._id });
  if (!d) res.status(404).json({ error: { code: 'not_found', message: 'That deck isn’t here any more.' } });
  return d;
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const docs = await RestyleDeck.find({ team: req.team._id }).select('title lookId logo thumb first shareId updatedAt slides.hidden').sort({ updatedAt: -1 }).lean();
    res.json({ decks: docs.map(summary) });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const d = await own(req, res);
    if (d) res.json({ deck: full(d) });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if ((await RestyleDeck.countDocuments({ team: req.team._id })) >= MAX_DECKS) return res.status(409).json({ error: { code: 'too_many', message: `You can keep up to ${MAX_DECKS} decks. Delete an old one first.` } });
    const d = await RestyleDeck.create({ ...cleanRestyle(req.body), team: req.team._id });
    res.status(201).json({ deck: full(d) });
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const d = await own(req, res);
    if (!d) return;
    Object.assign(d, cleanRestyle(req.body));
    d.markModified('slides');
    await d.save();
    res.json({ deck: summary(d) });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const d = await own(req, res);
    if (!d) return;
    await d.deleteOne();
    res.json({ ok: true });
  }),
);

/** Turn the share link on (a new link each time it's turned on) or off. */
router.post(
  '/:id/share',
  asyncHandler(async (req, res) => {
    const d = await own(req, res);
    if (!d) return;
    d.shareId = req.body && req.body.on === false ? null : d.shareId || crypto.randomBytes(9).toString('base64url');
    await d.save();
    res.json({ shareId: d.shareId });
  }),
);

/** Anyone with the link: the deck to watch (shown slides only). */
const shared = Router();
shared.get(
  '/:shareId',
  asyncHandler(async (req, res) => {
    const id = String(req.params.shareId || '');
    const d = /^[A-Za-z0-9_-]{8,40}$/.test(id) ? await RestyleDeck.findOne({ shareId: id }).lean() : null;
    if (!d) return res.status(404).json({ error: { code: 'not_found', message: 'This link doesn’t work any more. Ask for a new one.' } });
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ deck: { title: d.title, lookId: d.lookId, logo: d.logo === 'none' ? 'none' : 'adron', transition: d.transition, slides: (d.slides || []).filter((s) => !s.hidden) } });
  }),
);

module.exports = { decksRouter: router, sharedRouter: shared };
