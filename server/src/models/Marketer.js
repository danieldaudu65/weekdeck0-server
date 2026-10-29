'use strict';

const mongoose = require('mongoose');

/**
 * A marketer on the accountant's roster. Their details are typed once here
 * and filled into every payment row they make. `team` and `lead` come from the
 * WeekDeck team they belong to (or are typed by the accountant).
 */
const marketerSchema = new mongoose.Schema(
  {
    accountant: { type: mongoose.Schema.Types.ObjectId, ref: 'Accountant', required: true },
    name: { type: String, required: true },
    key: { type: String, required: true }, // upper-case, single spaces: for matching
    designation: { type: String, default: '' },
    supervisor: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    spouseName: { type: String, default: '' },
    spouseAccount: { type: String, default: '' },
    branch: { type: String, default: '' },
    team: { type: String, default: '' },
    lead: { type: Boolean, default: false },
    teamRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
    aliases: { type: [String], default: [] }, // other spellings seen in the sheets ("ARTHUR NYONG STIM")
  },
  { timestamps: true },
);
marketerSchema.index({ accountant: 1, key: 1 }, { unique: true });

marketerSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    name: this.name,
    designation: this.designation,
    supervisor: this.supervisor,
    accountNumber: this.accountNumber,
    spouseName: this.spouseName,
    spouseAccount: this.spouseAccount,
    branch: this.branch,
    team: this.team,
    lead: this.lead,
    teamRef: this.teamRef ? String(this.teamRef) : null,
    aliases: [...(this.aliases || [])],
  };
};

module.exports = mongoose.model('Marketer', marketerSchema);
