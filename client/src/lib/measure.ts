/**
 * How wide text really is, so layouts can size words to fit their boxes.
 * Arial's letter widths (per 1000 px; Liberation Sans and Helvetica match them).
 * Georgia and Arial Black are a little / a lot wider: scaled from Arial.
 */
import type { Font } from './deck';

const CHARS = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u2019\u2018\u201c\u201d\u2013\u2014\u20a6\u2022\u00b7\u2026\u00d7\u00e9";
const REGULAR = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 222, 222, 333, 333, 556, 1000, 722, 350, 333, 1000, 584, 556];
const BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 278, 278, 500, 500, 556, 1000, 722, 350, 333, 1000, 584, 556];
const W_REG = new Map<string, number>();
const W_BOLD = new Map<string, number>();
for (let i = 0; i < CHARS.length; i++) {
  W_REG.set(CHARS[i], REGULAR[i]);
  W_BOLD.set(CHARS[i], BOLD[i]);
}
/** Letters not in the table (other alphabets): as wide as a capital. */
const OTHER = 722;
const SCALE: Record<Font, number> = { sans: 1, serif: 1.1, display: 1.24 };

/** Width in px of one line of text. */
export function textWidth(text: string, size: number, opts: { font?: Font; bold?: boolean; spacing?: number } = {}): number {
  const font = opts.font ?? 'sans';
  const table = opts.bold || font === 'display' ? W_BOLD : W_REG;
  let w = 0;
  for (const ch of text) w += table.get(ch) ?? OTHER;
  return (w / 1000) * size * SCALE[font] + (opts.spacing ?? 0) * [...text].length;
}

/**
 * How many lines the text takes in a box `width` wide (the way the browser wraps:
 * at spaces, and inside a word only when the word alone is too long).
 */
export function lineCount(text: string, size: number, width: number, opts: { font?: Font; bold?: boolean; spacing?: number } = {}): number {
  const space = textWidth(' ', size, opts);
  let lines = 0;
  for (const para of text.split('\n')) {
    let used = 0;
    lines++;
    for (const word of para.split(/ +/)) {
      if (!word) continue;
      let w = textWidth(word, size, opts);
      if (used > 0 && used + space + w <= width) {
        used += space + w;
        continue;
      }
      if (used > 0) lines++;
      // A word longer than the line breaks across lines.
      while (w > width) {
        lines++;
        w -= width;
      }
      used = w;
    }
  }
  return lines;
}

/** Line height the slides use (SlideCanvas, the 3D player). */
export const LINE = 1.18;

/** Height in px the text takes in a box `width` wide. */
export const textHeight = (text: string, size: number, width: number, opts: { font?: Font; bold?: boolean; spacing?: number } = {}) =>
  lineCount(text, size, width, opts) * size * LINE;
