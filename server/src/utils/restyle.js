'use strict';

/**
 * "Restyle a deck": a team leader's own slides (read from any PowerPoint / PDF
 * in the browser), saved so they can come back, restyle and share them.
 */
const { ValidationError } = require('./validate');

const KINDS = new Set(['cover', 'bullets', 'table', 'picture', 'thanks']);
const TRANSITIONS = new Set(['cube', 'flip', 'zoom', 'slide']);
const MAX_SLIDES = 80;
const MAX_PICTURE = 2_200_000; // one data URL
const MAX_PICTURES = 14_000_000; // all of a deck's pictures
const MAX_THUMB = 200_000;
const IMAGE = /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/;

const line = (raw, max = 300) => (raw === null || raw === undefined ? '' : String(raw).replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, max));
const ratioOf = (raw) => {
  const r = Number(raw);
  return Number.isFinite(r) && r > 0.1 && r < 10 ? Math.round(r * 1000) / 1000 : 0;
};

function picture(raw, budget) {
  const s = String(raw || '');
  if (!s) return '';
  if (!IMAGE.test(s)) throw new ValidationError('One of the pictures isn’t a picture.');
  if (s.length > MAX_PICTURE) throw new ValidationError('One of the pictures is too large.');
  budget.used += s.length;
  if (budget.used > MAX_PICTURES) throw new ValidationError('This deck’s pictures are too large to save. Remove a few pictures and try again.');
  return s;
}

function cells(raw, n = 12) {
  return (Array.isArray(raw) ? raw : []).slice(0, n).map((c) => line(c, 160));
}

function cleanSlide(raw, budget) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const kind = KINDS.has(s.kind) ? s.kind : 'bullets';
  const title = line(s.title, 240);
  switch (kind) {
    case 'cover':
      return { kind, title, week: line(s.week, 160), weekNo: 0, range: line(s.range, 80), team: line(s.team, 120), name: line(s.name, 160), role: line(s.role, 160), image: picture(s.image, budget), kicker: line(s.kicker, 60), badge: line(s.badge, 40) };
    case 'thanks':
      return { kind, title, sub: line(s.sub, 240) };
    case 'picture':
      return { kind, title, subtitle: line(s.subtitle, 240), image: picture(s.image, budget), ratio: ratioOf(s.ratio) };
    case 'table': {
      const t = s.table && typeof s.table === 'object' ? s.table : {};
      return { kind, title, subtitle: line(s.subtitle, 240), table: { head: cells(t.head), rows: (Array.isArray(t.rows) ? t.rows : []).slice(0, 40).map((r) => cells(r)), total: cells(t.total) } };
    }
    default:
      return {
        kind: 'bullets',
        title,
        subtitle: line(s.subtitle, 240),
        points: (Array.isArray(s.points) ? s.points : [])
          .slice(0, 20)
          .map((p) => ({ text: line(p && p.text, 600), level: p && Number(p.level) > 0 ? 1 : 0 }))
          .filter((p) => p.text),
        image: picture(s.image, budget),
        ratio: ratioOf(s.ratio),
      };
  }
}

/** A deck as the editor sends it. */
function cleanRestyle(raw) {
  const b = raw && typeof raw === 'object' ? raw : {};
  const list = Array.isArray(b.slides) ? b.slides : [];
  if (list.length > MAX_SLIDES) throw new ValidationError(`At most ${MAX_SLIDES} slides in a deck.`);
  const budget = { used: 0 };
  const seen = new Set();
  const slides = list.map((x, i) => {
    const s = x && typeof x === 'object' ? x : {};
    let id = /^[A-Za-z0-9_-]{1,40}$/.test(String(s.id || '')) ? String(s.id) : `s${i}`;
    if (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);
    const out = { id, hidden: Boolean(s.hidden), slide: cleanSlide(s.slide, budget) };
    // The page as it was: another copy of the picture unless it's the same one.
    if (s.original) {
      out.original = s.slide && s.original === s.slide.image ? out.slide.image : picture(s.original, budget);
      out.originalRatio = ratioOf(s.originalRatio);
    }
    // The uploaded slide's picture, kept aside (shown only when turned on).
    if (s.filePicture) {
      const shown = 'image' in out.slide && s.filePicture === (s.slide && s.slide.image);
      out.filePicture = shown ? out.slide.image : picture(s.filePicture, budget);
      out.filePictureRatio = ratioOf(s.filePictureRatio);
    }
    return out;
  });
  const thumb = String(b.thumb || '');
  if (thumb && (!IMAGE.test(thumb) || thumb.length > MAX_THUMB)) throw new ValidationError('The deck’s preview picture is too large.');
  // The first shown slide without its pictures, for the "My decks" list (drawn with `thumb`).
  const shown = slides.find((x) => !x.hidden);
  const first = shown ? { ...shown.slide, ...('image' in shown.slide ? { image: '' } : {}) } : null;
  return {
    first,
    title: line(b.title, 120) || 'My deck',
    lookId: /^[a-z]+_[a-z]+$/.test(String(b.lookId || '')) ? String(b.lookId) : 'classic_classic',
    transition: TRANSITIONS.has(b.transition) ? b.transition : 'cube',
    logo: b.logo === 'none' ? 'none' : 'adron',
    sourceName: line(b.sourceName, 160),
    slides,
    thumb,
  };
}

module.exports = { cleanRestyle, MAX_SLIDES };
