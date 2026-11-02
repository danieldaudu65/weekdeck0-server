'use strict';

const mongoose = require('mongoose');

/**
 * A month's report Excel for an accountant (her TEAM'S REPORT of each branch,
 * read in the browser and checked): what the monthly slides are made from.
 * One per accountant per month; `branches` cleaned by utils/accounts.js cleanReport.
 */

const monthReportSchema = new mongoose.Schema(
  {
    accountant: { type: mongoose.Schema.Types.ObjectId, ref: 'Accountant', required: true },
    month: { type: String, required: true },
    branches: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true },
);
monthReportSchema.index({ accountant: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('MonthReport', monthReportSchema);
