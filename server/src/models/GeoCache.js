'use strict';

const mongoose = require('mongoose');

/** Remembered place lookups ("ikeja city mall|lagos" → coordinates), so the free map service is asked once. */
const geoSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  found: { type: Boolean, default: true },
  name: { type: String, default: '' },
  label: { type: String, default: '' },
  lat: { type: Number, default: null },
  lon: { type: Number, default: null },
  at: { type: Date, default: Date.now },
});
geoSchema.index({ at: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 }); // forget after 60 days

module.exports = mongoose.model('GeoCache', geoSchema);
