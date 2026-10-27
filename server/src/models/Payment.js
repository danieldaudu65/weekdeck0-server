'use strict';

const mongoose = require('mongoose');
const { FIELDS, KINDS } = require('../utils/accounts');

const columns = {};
for (const f of FIELDS) columns[f.key] = f.type === 'number' ? { type: Number, default: null } : { type: String, default: '' };

/** One row of an accountant's sheet (see utils/accounts.js for the columns). */
const paymentSchema = new mongoose.Schema(
  {
    accountant: { type: mongoose.Schema.Types.ObjectId, ref: 'Accountant', required: true },
    month: { type: String, required: true }, // the month's workbook this row is in: "2026-10"
    kind: { type: String, enum: KINDS, required: true },
    tab: { type: String, required: true },
    pos: { type: Number, default: 0 }, // row order inside the tab
    ...columns,
  },
  { timestamps: true },
);
paymentSchema.index({ accountant: 1, month: 1, kind: 1, tab: 1, pos: 1 });

paymentSchema.methods.toPublic = function toPublic() {
  const out = { id: String(this._id), month: this.month, kind: this.kind, tab: this.tab, pos: this.pos, updatedAt: this.updatedAt };
  for (const f of FIELDS) out[f.key] = this[f.key] ?? (f.type === 'number' ? null : '');
  return out;
};

module.exports = mongoose.model('Payment', paymentSchema);
