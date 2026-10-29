'use strict';

const mongoose = require('mongoose');

/**
 * Slides an accountant uploaded (their own PowerPoint) for a month, after
 * WeekDeck checked them. Edited and restyled on the Export page next to the
 * slides WeekDeck makes from the workbook. One per accountant per month.
 */
const importedDeckSchema = new mongoose.Schema(
  {
    accountant: { type: mongoose.Schema.Types.ObjectId, ref: 'Accountant', required: true },
    month: { type: String, required: true },
    fileName: { type: String, default: '' },
    slides: { type: [mongoose.Schema.Types.Mixed], default: [] }, // cleaned by utils/accounts.js cleanImported
  },
  { timestamps: true },
);
importedDeckSchema.index({ accountant: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('ImportedDeck', importedDeckSchema);
