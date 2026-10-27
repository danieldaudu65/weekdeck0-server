'use strict';

/**
 * Accountants: each one signs up with their own region and keeps that
 * region's workbook (payments, marketers, slide choices). Nobody else can read
 * or change it. Everything below `requireAccountant` is scoped to
 * req.accountant: an id from the browser is only ever used together with it.
 */
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const Accountant = require('../models/Accountant');
const Payment = require('../models/Payment');
const Marketer = require('../models/Marketer');
const Team = require('../models/Team');
const asyncHandler = require('../utils/asyncHandler');
const { signAccountantToken } = require('../utils/tokens');
const { requireAccountant } = require('../middleware/auth');
const { checkPin } = require('../utils/pinLogin');
const { ValidationError } = require('../utils/validate');
const A = require('../utils/accounts');

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'rate_limited', message: 'Too many attempts. Wait 15 minutes and try again.' } },
});

const isId = (s) => mongoose.isValidObjectId(s) && /^[a-f0-9]{24}$/.test(String(s));

/* ------------------------------------------------------------------ login */

router.post(
  '/register',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const name = A.cleanPersonName(b.name);
    const { email, key } = A.cleanEmail(b.email);
    const password = A.cleanPassword(b.password);
    const region = A.cleanPersonName(b.region, 'your region');
    if (await Accountant.exists({ emailKey: key })) {
      return res.status(409).json({ error: { code: 'taken', message: 'That email already has an account. Log in instead.' } });
    }
    const acc = await Accountant.create({ name, email, emailKey: key, passwordHash: await bcrypt.hash(password, 10), region });
    res.status(201).json({ token: signAccountantToken(acc), accountant: acc.toPublic() });
  }),
);

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    let key;
    try {
      key = A.cleanEmail(b.email).key;
    } catch {
      throw new ValidationError('Wrong email or password.');
    }
    const password = String(b.password ?? '').slice(0, 100);
    const acc = await Accountant.findOne({ emailKey: key });
    const r = await checkPin(acc, password, 'passwordHash');
    if (r.locked) return res.status(423).json({ error: { code: 'locked', message: `Too many wrong passwords. Try again in ${r.locked} minute${r.locked === 1 ? '' : 's'}.` } });
    if (!r.ok) return res.status(401).json({ error: { code: 'bad_credentials', message: 'Wrong email or password.' } });
    res.json({ token: signAccountantToken(acc), accountant: acc.toPublic() });
  }),
);

router.use(requireAccountant);

router.get('/me', (req, res) => res.json({ accountant: req.accountant.toPublic() }));

/** Name, region, tabs, slide choices, earlier months. Only what is sent changes. */
router.put(
  '/me',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const acc = req.accountant;
    if (b.name !== undefined) acc.name = A.cleanPersonName(b.name);
    if (b.region !== undefined) acc.region = A.cleanPersonName(b.region, 'your region');
    if (b.tabs !== undefined) acc.tabs = A.cleanTabs(b.tabs);
    if (b.deck !== undefined) acc.deck = A.cleanDeck(b.deck);
    if (b.history !== undefined) acc.history = A.cleanHistory(b.history);
    await acc.save();
    res.json({ accountant: acc.toPublic() });
  }),
);

router.post(
  '/password',
  asyncHandler(async (req, res) => {
    const current = String((req.body && req.body.currentPassword) ?? '');
    const next = A.cleanPassword(req.body && req.body.newPassword);
    if (!(await bcrypt.compare(current, req.accountant.passwordHash))) throw new ValidationError('Your current password is not correct.');
    req.accountant.passwordHash = await bcrypt.hash(next, 10);
    req.accountant.tokenVersion = (req.accountant.tokenVersion || 0) + 1;
    await req.accountant.save();
    res.json({ token: signAccountantToken(req.accountant) });
  }),
);

/* ------------------------------------------------------------------ payments */

/** Every row of one month's workbook (all three sheets, all tabs). */
router.get(
  '/payments',
  asyncHandler(async (req, res) => {
    const month = A.cleanMonth(req.query.month);
    const rows = await Payment.find({ accountant: req.accountant._id, month }).sort({ kind: 1, tab: 1, pos: 1, _id: 1 });
    res.json({ month, payments: rows.map((p) => p.toPublic()) });
  }),
);

/** Months that have rows, newest first, with how many (for the month picker). */
router.get(
  '/months',
  asyncHandler(async (req, res) => {
    const list = await Payment.aggregate([{ $match: { accountant: req.accountant._id } }, { $group: { _id: '$month', rows: { $sum: 1 } } }, { $sort: { _id: -1 } }]);
    res.json({ months: list.map((m) => ({ month: m._id, rows: m.rows })) });
  }),
);

/**
 * Save rows (typing, pasting, importing) and delete rows, in one call.
 * New rows carry a `tmp` id from the browser and get their real id back.
 */
router.post(
  '/payments/save',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const month = A.cleanMonth(b.month);
    const upserts = Array.isArray(b.upserts) ? b.upserts : [];
    const deletes = Array.isArray(b.deletes) ? b.deletes.filter(isId) : [];
    if (upserts.length + deletes.length > A.MAX_ROWS_PER_SAVE) throw new ValidationError(`Save at most ${A.MAX_ROWS_PER_SAVE} rows at a time.`);
    const me = req.accountant._id;

    const updates = [];
    const inserts = [];
    for (const raw of upserts) {
      const row = A.cleanPayment(raw);
      const rowMonth = raw && raw.month ? A.cleanMonth(raw.month) : month;
      if (raw && raw.id !== undefined && raw.id !== null && raw.id !== '') {
        if (!isId(raw.id)) throw new ValidationError('Invalid row.');
        updates.push({ id: String(raw.id), row: { ...row, month: rowMonth } });
      } else {
        inserts.push({ tmp: String((raw && raw.tmp) || '').slice(0, 40), row: { ...row, month: rowMonth, accountant: me } });
      }
    }

    if (updates.length) {
      await Payment.bulkWrite(updates.map((u) => ({ updateOne: { filter: { _id: u.id, accountant: me }, update: { $set: u.row } } })));
    }
    const created = inserts.length ? await Payment.insertMany(inserts.map((i) => i.row)) : [];
    if (deletes.length) await Payment.deleteMany({ _id: { $in: deletes }, accountant: me });

    // A row saved into a tab the workbook doesn't list yet adds that tab.
    const known = new Set(req.accountant.tabs.map((t) => t.name));
    const extra = [];
    for (const { row } of [...updates, ...inserts]) {
      if (!known.has(row.tab)) {
        known.add(row.tab);
        extra.push({ name: row.tab, branch: row.branch || '' });
      }
    }
    if (extra.length) {
      req.accountant.tabs = A.cleanTabs([...req.accountant.tabs.map((t) => ({ name: t.name, branch: t.branch })), ...extra]);
      await req.accountant.save();
    }

    const updated = updates.length ? await Payment.find({ _id: { $in: updates.map((u) => u.id) }, accountant: me }) : [];
    res.json({
      created: created.map((p, i) => ({ tmp: inserts[i].tmp, payment: p.toPublic() })),
      updated: updated.map((p) => p.toPublic()),
      deleted: deletes,
      tabs: req.accountant.tabs.map((t) => ({ name: t.name, branch: t.branch || '' })),
    });
  }),
);

/** Totals per month and branch for a year (the Jan–Dec slide and "vs last month"). */
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const year = /^\d{4}$/.test(String(req.query.year)) ? String(req.query.year) : String(new Date().getFullYear());
    // Include last December so January can be compared with the month before it.
    const months = [`${Number(year) - 1}-12`, ...Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)];
    const rows = await Payment.find({ accountant: req.accountant._id, month: { $in: months } })
      .select('month kind tab branch amount clientName confirmation')
      .lean();
    res.json({ year, cells: A.summarize(rows, req.accountant.tabs) });
  }),
);

/* ------------------------------------------------------------------ marketers */

router.get(
  '/marketers',
  asyncHandler(async (req, res) => {
    const list = await Marketer.find({ accountant: req.accountant._id }).sort({ name: 1 });
    res.json({ marketers: list.map((m) => m.toPublic()) });
  }),
);

/** Add or change marketers (by id), delete some. A name already on the roster updates that marketer. */
router.post(
  '/marketers/save',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const upserts = Array.isArray(b.upserts) ? b.upserts.slice(0, 2000) : [];
    const deletes = Array.isArray(b.deletes) ? b.deletes.filter(isId) : [];
    const me = req.accountant._id;
    const ops = [];
    for (const raw of upserts) {
      const m = A.cleanMarketer(raw);
      const set = { ...m, teamRef: m.teamRef && isId(m.teamRef) ? m.teamRef : null };
      const filter = raw && isId(raw.id) ? { _id: raw.id, accountant: me } : { accountant: me, key: m.key };
      ops.push({ updateOne: { filter, update: { $set: set, $setOnInsert: { accountant: me } }, upsert: !(raw && isId(raw.id)) } });
    }
    if (ops.length) await Marketer.bulkWrite(ops, { ordered: false });
    if (deletes.length) await Marketer.deleteMany({ _id: { $in: deletes }, accountant: me });
    const list = await Marketer.find({ accountant: me }).sort({ name: 1 });
    res.json({ marketers: list.map((x) => x.toPublic()) });
  }),
);

/**
 * "ARTHUR NYONG STIM" and "ARTHUR NYONG ETIM" are the same person: every
 * payment of the first is moved to the second, the first is removed from the
 * roster and remembered as another spelling.
 */
router.post(
  '/marketers/merge',
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const me = req.accountant._id;
    if (!isId(b.into)) throw new ValidationError('Pick who to keep.');
    const from = (Array.isArray(b.from) ? b.from : []).filter((id) => isId(id) && String(id) !== String(b.into)).slice(0, 50);
    if (!from.length) throw new ValidationError('Pick who to merge.');
    const keep = await Marketer.findOne({ _id: b.into, accountant: me });
    if (!keep) throw new ValidationError('That marketer isn’t on your roster.');
    const gone = await Marketer.find({ _id: { $in: from }, accountant: me });
    const oldNames = gone.flatMap((g) => [g.name, ...(g.aliases || [])]);
    const keys = [...new Set(oldNames.map(A.nameKey))];
    // Payments store the name as typed; match every way it was written.
    const rows = await Payment.find({ accountant: me }).select('marketer').lean();
    const ids = rows.filter((r) => keys.includes(A.nameKey(r.marketer))).map((r) => r._id);
    if (ids.length) await Payment.updateMany({ _id: { $in: ids }, accountant: me }, { $set: { marketer: keep.name } });
    keep.aliases = [...new Set([...(keep.aliases || []), ...keys].filter((k) => k !== keep.key))].slice(0, 12);
    await keep.save();
    await Marketer.deleteMany({ _id: { $in: gone.map((g) => g._id) }, accountant: me });
    const list = await Marketer.find({ accountant: me }).sort({ name: 1 });
    res.json({ moved: ids.length, marketers: list.map((x) => x.toPublic()) });
  }),
);

/**
 * WeekDeck teams (set up by the team heads), to link marketers to their team.
 * Only names are shared: no PINs, figures or activities.
 */
router.get(
  '/teams',
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 40);
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter = q ? { $or: ['nameKey', 'teamTitle', 'region', 'regionName', 'managerName'].map((f) => ({ [f]: { $regex: esc, $options: 'i' } })) } : {};
    const teams = await Team.find(filter).select('name teamTitle region regionName managerName members').sort({ updatedAt: -1 }).limit(60).lean();
    res.json({
      teams: teams.map((t) => ({
        id: String(t._id),
        name: t.name,
        title: t.teamTitle || t.name,
        region: t.regionName || t.region || '',
        manager: t.managerName || '',
        members: (t.members || []).map((m) => ({ name: m.name, lead: Boolean(m.lead) })),
      })),
    });
  }),
);

module.exports = router;
