'use strict';

const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    lead: { type: Boolean, default: false },
  },
  { _id: false },
);

/**
 * One team = one login. The manager signs in with the team name + PIN.
 * The PIN is stored only as a bcrypt hash.
 */
const teamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // as typed: "Lifter Marine"
    nameKey: { type: String, required: true, unique: true }, // lowercase, for login
    pinHash: { type: String, required: true },
    failedLogins: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 }, // bumped on PIN change: signs out other devices

    // What goes on the slides
    deckTitle: { type: String, default: 'Weekly Strategic Session' },
    managerName: { type: String, default: '' },
    managerTag: { type: String, default: '' }, // e.g. "KSO"
    managerRole: { type: String, default: 'Team Lead' },
    teamTitle: { type: String, default: '' }, // e.g. "Team Social Fagba Region"
    region: { type: String, default: '' },
    activitiesTitle: { type: String, default: '' },
    templateId: { type: String, default: 'classic' },
    members: { type: [memberSchema], default: [] },
    coverImage: { type: String, default: '' }, // small data URL, e.g. the photo from their old cover slide
  },
  { timestamps: true },
);

/** The shape sent to the browser: never the PIN hash or lockout fields. */
teamSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    name: this.name,
    deckTitle: this.deckTitle,
    managerName: this.managerName,
    managerTag: this.managerTag,
    managerRole: this.managerRole,
    teamTitle: this.teamTitle,
    region: this.region,
    activitiesTitle: this.activitiesTitle,
    templateId: this.templateId,
    members: this.members.map((m) => ({ id: m.id, name: m.name, lead: m.lead })),
    coverImage: this.coverImage || '',
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('Team', teamSchema);
