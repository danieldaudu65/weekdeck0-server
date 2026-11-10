/**
 * The company logo on every slide: a small white badge in a corner that the
 * look leaves free, a bigger one on the cover and the Thank you slide.
 */
import type { DeckSlide, Shape } from './deck';
import { ADRON_BADGE, ADRON_BADGE_RATIO } from './adronLogo';
import { textHeight, textWidth } from './measure';

export type Brand = 'adron' | 'none';
type Laid = { bg: string; shapes: Shape[] };

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const W = 1280, H = 720;

/** What the badge mustn't cover: words, tables, small decorations. Big panels and photos are fine to sit on. */
function blockers(shapes: Shape[]): Box[] {
  const out: Box[] = [];
  for (const sh of shapes) {
    if (sh.type === 'image') continue;
    if (sh.type === 'text') {
      if (!sh.text.trim()) continue;
      // Where the words really are (measured), not the whole box: a short title in a wide box leaves room.
      const opts = { font: sh.font, bold: sh.bold || sh.font === 'display', spacing: sh.spacing };
      const tw = Math.min(sh.w, Math.max(...sh.text.split('\n').map((l) => textWidth(l, sh.size, opts))));
      const th = Math.min(sh.h, textHeight(sh.text, sh.size, sh.w, opts));
      const x = sh.align === 'right' ? sh.x + sh.w - tw : sh.align === 'center' ? sh.x + (sh.w - tw) / 2 : sh.x;
      const y = sh.valign === 'bottom' ? sh.y + sh.h - th : sh.valign === 'middle' ? sh.y + (sh.h - th) / 2 : sh.y;
      out.push({ x, y, w: tw, h: th });
      continue;
    }
    if (sh.type === 'table') {
      const n = sh.rows.length + 1 + (sh.total.length ? 1 : 0);
      // Each row's 1px borders add up on a long table.
      out.push({ x: sh.x, y: sh.y, w: sh.colW.reduce((a, b) => a + b, 0) + 2, h: (sh.rowH + 2) * n + 4 });
      continue;
    }
    // A frame (an outline): its four lines.
    if ((sh.type === 'rect' || sh.type === 'ellipse') && sh.stroke && !sh.fill) {
      const t = (sh.strokeW ?? 2) + 2;
      out.push({ x: sh.x, y: sh.y, w: sh.w, h: t }, { x: sh.x, y: sh.y + sh.h - t, w: sh.w, h: t }, { x: sh.x, y: sh.y, w: t, h: sh.h }, { x: sh.x + sh.w - t, y: sh.y, w: t, h: sh.h });
      continue;
    }
    if (sh.w * sh.h < 60_000) out.push({ x: sh.x, y: sh.y, w: sh.w, h: sh.h });
  }
  return out;
}

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * A free spot: the corner nearest free (top right first), else anywhere along
 * the top or bottom edge, else the spot that covers the least.
 */
function place(shapes: Shape[], w: number, h: number, m: number): Box | null {
  const bl = blockers(shapes);
  const cost = (b: Box) => bl.reduce((a, o) => a + overlap({ x: b.x - 12, y: b.y - 12, w: b.w + 24, h: b.h + 24 }, o), 0);
  const corners: Box[] = [];
  for (const k of [m, m + 28]) corners.push({ x: W - k - w, y: k, w, h }, { x: W - k - w, y: H - k - h, w, h }, { x: k, y: k, w, h }, { x: k, y: H - k - h, w, h });
  for (const c of corners) if (cost(c) === 0) return c;
  // Along the top and bottom edges, nearest the right-hand corners first.
  const edge: Box[] = [];
  for (let x = W - m - w; x >= m; x -= 16) edge.push({ x, y: m, w, h }, { x, y: H - m - h, w, h });
  for (const c of edge) if (cost(c) === 0) return c;
  return null;
}

export function brandLaid(laid: Laid, slide: DeckSlide, brand: Brand = 'adron'): Laid {
  if (brand === 'none') return laid;
  const big = slide.kind === 'cover' || slide.kind === 'thanks';
  // A smaller badge, then a smaller margin, before ever covering any words.
  for (const [h, m] of big ? [[62, 36], [50, 28], [40, 16], [32, 10]] : [[44, 20], [38, 16], [32, 10], [28, 6]]) {
    const w = Math.round(h * ADRON_BADGE_RATIO);
    const p = place(laid.shapes, w, h, m);
    if (p) return { ...laid, shapes: [...laid.shapes, { type: 'image', x: p.x, y: p.y, w, h, src: ADRON_BADGE, anim: 'pop' }] };
  }
  // Nowhere free (a slide packed edge to edge): no logo rather than one on top of the words.
  return laid;
}
