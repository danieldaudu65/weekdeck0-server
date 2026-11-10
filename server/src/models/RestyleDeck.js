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
    /** The company logo on every slide: 'adron' (the default) or 'none'. */
    logo: { type: String, default: 'adron' },
    sourceName: { type: String, default: '' },
    slides: { type: [mongoose.Schema.Types.Mixed], default: [] },
    /** A small picture of the first slide, for the "My decks" list. */
    thumb: { type: String, default: '' },
    first: { type: mongoose.Schema.Types.Mixed, default: null },
    // Left out (not null) when the deck isn't shared: only real links must be unique.
    shareId: { type: String },
  },
  { timestamps: true, minimize: false },
);
restyleDeckSchema.index({ shareId: 1 }, { unique: true, partialFilterExpression: { shareId: { $type: 'string' } } });

/**
 * Older decks were saved with shareId: null, and the old index allowed only one
 * of those, so a second unshared deck couldn't be saved. Run once at start-up.
 */
restyleDeckSchema.statics.fixShareIndex = async function fixShareIndex() {
  const indexes = await this.collection.indexes().catch(() => []);
  const old = indexes.find((i) => i.key && i.key.shareId === 1 && !i.partialFilterExpression);
  if (old) await this.collection.dropIndex(old.name).catch(() => undefined);
  await this.updateMany({ shareId: null }, { $unset: { shareId: 1 } });
  await this.syncIndexes();
};

module.exports = mongoose.model('RestyleDeck', restyleDeckSchema);
