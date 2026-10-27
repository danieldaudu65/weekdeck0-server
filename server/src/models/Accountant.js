'use strict';

const mongoose = require('mongoose');

/** A sheet tab, e.g. "OGBAFAGBA" in branch "FAGBA". */
const tabSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    branch: { type: String, default: '' },
  },
  { _id: false },
);

/** Figures typed in for months before the accountant started using WeekDeck (for the Jan–Dec slide). */
const historySchema = new mongoose.Schema(
  {
    branch: { type: String, required: true },
    month: { type: String, required: true }, // "2026-01"
    land: { type: Number, default: null },
    infra: { type: Number, default: null },
    nc: { type: Number, default: null },
  },
  { _id: false },
);

/** What the accountant picked on the Export page, remembered for next month. */
const deckSchema = new mongoose.Schema(
  {
    lookId: { type: String, default: 'classic_classic' },
    off: { type: [String], default: [] }, // slides switched off
    on: { type: [String], default: [] }, // extra slides switched on
    order: { type: [String], default: [] }, // slide ids in the chosen order
    titles: { type: [new mongoose.Schema({ id: String, title: String }, { _id: false })], default: [] },
    countAll: { type: Boolean, default: false }, // false = only CONFIRMED payments count on the slides
  },
  { _id: false },
);

/**
 * One accountant = one login = one region's workbook. Every accountant is
 * independent: nobody can see or change another accountant's workbook.
 */
const accountantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    emailKey: { type: String, required: true, unique: true }, // lowercase, for login
    passwordHash: { type: String, required: true },
    region: { type: String, required: true, trim: true },
    failedLogins: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 },
    tabs: { type: [tabSchema], default: [] },
    deck: { type: deckSchema, default: () => ({}) },
    history: { type: [historySchema], default: [] },
  },
  { timestamps: true },
);

accountantSchema.methods.toPublic = function toPublic() {
  const d = this.deck || {};
  return {
    id: String(this._id),
    name: this.name,
    email: this.email,
    region: this.region,
    tabs: (this.tabs || []).map((t) => ({ name: t.name, branch: t.branch || '' })),
    deck: {
      lookId: d.lookId || 'classic_classic',
      off: [...(d.off || [])],
      on: [...(d.on || [])],
      order: [...(d.order || [])],
      titles: (d.titles || []).map((t) => ({ id: t.id, title: t.title })),
      countAll: Boolean(d.countAll),
    },
    history: (this.history || []).map((h) => ({ branch: h.branch, month: h.month, land: h.land ?? null, infra: h.infra ?? null, nc: h.nc ?? null })),
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('Accountant', accountantSchema);
