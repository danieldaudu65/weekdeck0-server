'use strict';

const mongoose = require('mongoose');

/**
 * A team leader's own deck, restyled in WeekDeck ("Decks" tab). Slides are
 * cleaned by utils/restyle.js. shareId: the public link (/deck/<shareId>), null when not shared.
 */
const restyleDeckSchema = new mongoose.Schema(
  {
    team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
    title: { type: String, default: 'My deck' },
    lookId: { type: String, default: 'classic_classic' },
    transition: { type: String, default: 'cube' },
    sourceName: { type: String, default: '' },
    slides: { type: [mongoose.Schema.Types.Mixed], default: [] },
    /** A small picture of the first slide, for the "My decks" list. */
    thumb: { type: String, default: '' },
    first: { type: mongoose.Schema.Types.Mixed, default: null },
    shareId: { type: String, default: null, index: { unique: true, sparse: true } },
  },
  { timestamps: true, minimize: false },
);

module.exports = mongoose.model('RestyleDeck', restyleDeckSchema);
