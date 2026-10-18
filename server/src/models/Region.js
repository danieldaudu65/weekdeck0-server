'use strict';

const mongoose = require('mongoose');

/**
 * A region head's account (e.g. "Fagba Region"). Teams join with the region's
 * join code; the region head then sees every team's totals and slides.
 */
const regionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    nameKey: { type: String, required: true, unique: true },
    pinHash: { type: String, required: true },
    failedLogins: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 },
    joinCode: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);

regionSchema.methods.toPublic = function toPublic() {
  return { id: String(this._id), name: this.name, joinCode: this.joinCode, createdAt: this.createdAt };
};

module.exports = mongoose.model('Region', regionSchema);
