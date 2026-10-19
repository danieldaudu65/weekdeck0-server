'use strict';

const mongoose = require('mongoose');

const rowSchema = new mongoose.Schema(
  {
    memberId: { type: String, required: true },
    mon: { type: Number, default: null },
    tue: { type: Number, default: null },
    wed: { type: Number, default: null },
    thu: { type: Number, default: null },
    fri: { type: Number, default: null },
    nc: { type: Number, default: null }, // number of new clients
    weekTotal: { type: Number, default: null }, // a week total with no daily breakdown (imported monthly table)
  },
  { _id: false },
);

/** One team's sheet for one week (weekStart = that Monday, "YYYY-MM-DD"). */
const weekSchema = new mongoose.Schema(
  {
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
    weekStart: { type: String, required: true },
    rows: { type: [rowSchema], default: [] },
    activities: {
      mon: { type: String, default: '' },
      tue: { type: String, default: '' },
      wed: { type: String, default: '' },
      thu: { type: String, default: '' },
      fri: { type: String, default: '' },
    },
    note: { type: String, default: '' }, // the week summary shown on the "Week at a glance" slide
    // Places picked from the map search, so the map knows exactly where they are.
    places: {
      type: [
        new mongoose.Schema(
          { day: { type: String, required: true }, name: { type: String, required: true }, lat: Number, lon: Number },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);

// One sheet per team per week: saving the same week twice updates it.
weekSchema.index({ team: 1, weekStart: 1 }, { unique: true });

weekSchema.methods.toPublic = function toPublic() {
  return {
    weekStart: this.weekStart,
    rows: this.rows.map((r) => ({ memberId: r.memberId, mon: r.mon, tue: r.tue, wed: r.wed, thu: r.thu, fri: r.fri, nc: r.nc, weekTotal: r.weekTotal ?? null })),
    activities: {
      mon: this.activities.mon,
      tue: this.activities.tue,
      wed: this.activities.wed,
      thu: this.activities.thu,
      fri: this.activities.fri,
    },
    note: this.note,
    places: (this.places || []).map((p) => ({ day: p.day, name: p.name, lat: p.lat, lon: p.lon })),
    updatedAt: this.updatedAt,
  };
};

module.exports = mongoose.model('Week', weekSchema);
