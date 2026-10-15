'use strict';

const { Router } = require('express');
const Week = require('../models/Week');
const asyncHandler = require('../utils/asyncHandler');
const { requireTeam } = require('../middleware/auth');
const { cleanWeek, cleanWeekStart, ValidationError } = require('../utils/validate');

const router = Router();
router.use(requireTeam);

/** Weeks whose Monday falls between `from` and `to` (inclusive), e.g. a month. Max ~6 months per call. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      throw new ValidationError('Invalid date range.');
    }
    const weeks = await Week.find({ team: req.team._id, weekStart: { $gte: from, $lte: to } })
      .sort({ weekStart: 1 })
      .limit(30);
    res.json({ weeks: weeks.map((w) => w.toPublic()) });
  }),
);

/** The most recent saved week before `before` (to copy last week's activities). */
router.get(
  '/latest',
  asyncHandler(async (req, res) => {
    const before = cleanWeekStart(req.query.before);
    const week = await Week.findOne({ team: req.team._id, weekStart: { $lt: before } }).sort({ weekStart: -1 });
    res.json({ week: week ? week.toPublic() : null });
  }),
);

/**
 * The team's activity history (newest first, up to 2 years) so the website can
 * suggest what they usually do, the places they go, and plan a week.
 */
router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const weeks = await Week.find({ team: req.team._id }).select('weekStart activities').sort({ weekStart: -1 }).limit(104).lean();
    res.json({
      history: weeks.map((w) => ({
        weekStart: w.weekStart,
        activities: { mon: w.activities?.mon || '', tue: w.activities?.tue || '', wed: w.activities?.wed || '', thu: w.activities?.thu || '', fri: w.activities?.fri || '' },
      })),
    });
  }),
);

router.get(
  '/:weekStart',
  asyncHandler(async (req, res) => {
    const weekStart = cleanWeekStart(req.params.weekStart);
    const week = await Week.findOne({ team: req.team._id, weekStart });
    res.json({ week: week ? week.toPublic() : null });
  }),
);

/** Save a week (create or replace). Saving the same week again simply updates it. */
router.put(
  '/:weekStart',
  asyncHandler(async (req, res) => {
    const weekStart = cleanWeekStart(req.params.weekStart);
    const data = cleanWeek(
      req.body,
      req.team.members.map((m) => m.id),
    );
    const week = await Week.findOneAndUpdate(
      { team: req.team._id, weekStart },
      { $set: { rows: data.rows, activities: data.activities, note: data.note } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    res.json({ week: week.toPublic() });
  }),
);

router.delete(
  '/:weekStart',
  asyncHandler(async (req, res) => {
    const weekStart = cleanWeekStart(req.params.weekStart);
    await Week.deleteOne({ team: req.team._id, weekStart });
    res.status(204).end();
  }),
);

module.exports = router;
