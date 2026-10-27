/**
 * Where everything sits on each slide, for every style. A style decides the
 * frame (title, decorations, footer) and which variant draws the content;
 * the palette supplies the colours. Preview, PDF and PowerPoint all draw the
 * shapes returned here, so they always match.
 *
 * Canvas: 1280 × 720. Font sizes are canvas px.
 */
import type { DeckSlide, Font, Shape } from './deck';
import { lookById, type Look, type Theme } from './templates';

type S = Shape;
type TextShape = Extract<Shape, { type: 'text' }>;
interface Ctx {
  teamName: string;
  page: number;
  total: number;
}
interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}
type Laid = { bg: string; shapes: Shape[] };
type Kind<K extends DeckSlide['kind']> = Extract<DeckSlide, { kind: K }>;

/* ------------------------------------------------------------------ colour */

const rgb = (hex: string) => [0, 8, 16].map((sh) => (parseInt(hex, 16) >> (16 - sh)) & 255);
const toHex = (c: number[]) =>
  c
    .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
/** a → b by t (0 = a, 1 = b). */
export function mix(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * t));
}
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** The accent for text on the cover, or the cover's ink if the accent wouldn't be readable there. */
const coverPop = (t: Theme) => (contrast(t.accent, t.coverBg) >= 3 ? t.accent : t.coverInk);
/** Black or white text, whichever reads better on `bg`. */
const readable = (bg: string) => (lum(bg) > 0.42 ? '141414' : 'FFFFFF');

/* ------------------------------------------------------------------ helpers */

const T = (x: number, y: number, w: number, h: number, text: string, size: number, color: string, o: Partial<TextShape> = {}): S => ({
  type: 'text',
  x,
  y,
  w,
  h,
  text,
  size,
  color,
  valign: 'middle',
  ...o,
});
const R = (x: number, y: number, w: number, h: number, fill: string | null, radius = 0, o: { stroke?: string; strokeW?: number } = {}): S => ({ type: 'rect', x, y, w, h, fill, radius, ...o });
const O = (x: number, y: number, d: number, fill: string | null, o: { stroke?: string; strokeW?: number } = {}): S => ({ type: 'ellipse', x, y, w: d, h: d, fill, ...o });

/** The biggest font size (≤ max) at which `text` fits in w × h. */
export function fit(text: string, w: number, h: number, max: number, min = 11, font: Font = 'sans'): number {
  const widthK = font === 'display' ? 0.66 : font === 'serif' ? 0.54 : 0.55;
  const caps = text === text.toUpperCase() && /[A-Z]/.test(text);
  const k = widthK * (caps ? 1.32 : 1);
  const chars = Math.max(1, text.length);
  const longest = Math.max(1, ...text.split(/\s+/).map((x) => x.length));
  const lines = text.split('\n').length;
  let s = Math.sqrt((w * h) / (k * 1.25 * chars));
  s = Math.min(s, w / (k * longest * 1.05), h / (1.2 * lines));
  return Math.max(min, Math.min(max, Math.floor(s)));
}

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
const pad2 = (n: number) => String(n).padStart(2, '0');

/** A soft glow: rings that fade from `color` into `base`. */
function glow(cx: number, cy: number, r: number, base: string, color: string, strength = 0.55): S[] {
  const out: S[] = [];
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const rr = r * (1 - i / steps);
    out.push(O(cx - rr, cy - rr, rr * 2, mix(base, color, strength * ((i + 1) / steps) ** 1.6)));
  }
  return out;
}

/** The WeekDeck motif: two offset "cards". */
function motif(x: number, y: number, scale: number, back: string, front: string): S[] {
  return [R(x, y + 14 * scale, 64 * scale, 44 * scale, back, 8 * scale), R(x + 16 * scale, y, 64 * scale, 44 * scale, front, 8 * scale)];
}

/* ------------------------------------------------------------------ content: tables */

interface TableColours {
  headFill: string;
  headInk: string;
  stripe: string;
  bg: string;
  ink: string;
  line: string;
  totalFill: string;
  totalInk: string;
  font?: Font;
}

function table(slide: Kind<'table'>, a: Area, c: TableColours): S[] {
  const { head, rows, total } = slide.table;
  const cols = head.length;
  // Wide enough for full names ("OLORUNSOGO OPEOLUWA SAMUEL" on accountants' slides), never more than a third.
  const longestName = Math.max(0, ...[...rows, total].map((r) => (r[0] ?? '').length));
  const nameW = Math.max(Math.min(240, Math.max(150, Math.round(a.w * 0.19))), Math.min(Math.round(a.w * 0.36), longestName * 12 + 36));
  const other = (a.w - nameW) / (cols - 1);
  const rowH = Math.max(26, Math.min(56, Math.floor(a.h / (rows.length + 2))));
  const longest = Math.max(4, ...[...rows, total].flatMap((r) => r.slice(1).map((x) => x.length)), ...head.slice(1).map((x) => x.length));
  const size = Math.max(11, Math.min(19, rowH * 0.38, (other - 18) / (longest * 0.6)));
  return [{ type: 'table', x: a.x, y: a.y, colW: [nameW, ...Array(cols - 1).fill(other)], rowH, size: Math.floor(size), head, rows, total, boldEdges: true, ...c }];
}

/* ------------------------------------------------------------------ content: activities */

interface ActColours {
  dayFill: string;
  dayInk: string;
  card: string;
  ink: string;
  muted: string;
  radius: number;
  font?: Font;
}
type Items = Kind<'activities'>['items'];

/** One row per day: a coloured day label and the plan beside it. */
function actRows(items: Items, a: Area, c: ActColours & { dayW?: number }): S[] {
  const gap = 12;
  const h = (a.h - gap * (items.length - 1)) / items.length;
  const dayW = c.dayW ?? 190;
  return items.flatMap((it, i) => {
    const y = a.y + i * (h + gap);
    const tw = a.w - dayW - 48;
    const text = it.text || '—';
    return [
      R(a.x, y, a.w, h, c.card, c.radius),
      R(a.x, y, dayW, h, c.dayFill, c.radius),
      T(a.x, y, dayW, h, it.day.toUpperCase(), Math.min(20, fit(it.day.toUpperCase(), dayW - 24, h, 20)), c.dayInk, { bold: true, align: 'center', font: c.font }),
      T(a.x + dayW + 24, y + 4, tw, h - 8, text, fit(text, tw, h - 8, 21, 11), it.text ? c.ink : c.muted),
    ];
  });
}

/** Five cards side by side, one per day. */
function actColumns(items: Items, a: Area, c: ActColours & { headH?: number; dot?: string }): S[] {
  const gap = 16;
  const w = (a.w - gap * (items.length - 1)) / items.length;
  const headH = c.headH ?? 58;
  return items.flatMap((it, i) => {
    const x = a.x + i * (w + gap);
    const text = it.text || '—';
    const out: S[] = [R(x, a.y, w, a.h, c.card, c.radius), R(x, a.y, w, headH, c.dayFill, c.radius)];
    if (c.radius) out.push(R(x, a.y + headH - c.radius, w, c.radius, c.dayFill)); // square off the bottom of the header
    out.push(
      T(x + 8, a.y, w - 16, headH, it.day.toUpperCase(), fit(it.day.toUpperCase(), w - 24, headH, 19), c.dayInk, { bold: true, align: 'center', font: c.font }),
      T(x + 18, a.y + headH + 16, w - 36, a.h - headH - 32, text, fit(text, w - 36, a.h - headH - 32, 22, 11), it.text ? c.ink : c.muted, { valign: 'top' }),
    );
    return out;
  });
}

/** A vertical line with a dot per day. */
function actTimeline(items: Items, a: Area, c: { line: string; dot: string; day: string; ink: string; muted: string; font?: Font }): S[] {
  const h = a.h / items.length;
  const out: S[] = [R(a.x + 9, a.y + h / 2, 2, h * (items.length - 1), c.line)];
  items.forEach((it, i) => {
    const y = a.y + i * h;
    const text = it.text || '—';
    out.push(
      O(a.x, y + h / 2 - 10, 20, c.dot),
      T(a.x + 44, y, 200, h, it.day, 22, c.day, { bold: true, font: c.font }),
      T(a.x + 260, y + 4, a.w - 260, h - 8, text, fit(text, a.w - 260, h - 8, 21, 11), it.text ? c.ink : c.muted),
    );
  });
  return out;
}

/** Magazine style: rules between days, day name in italic serif. */
function actLedger(items: Items, a: Area, c: { rule: string; day: string; ink: string; muted: string; num: string }): S[] {
  const h = a.h / items.length;
  const out: S[] = [];
  items.forEach((it, i) => {
    const y = a.y + i * h;
    const text = it.text || '—';
    out.push(
      R(a.x, y, a.w, 1, c.rule),
      T(a.x, y, 60, h, pad2(i + 1), 26, c.num, { font: 'serif', bold: true }),
      T(a.x + 70, y, 230, h, it.day, 26, c.day, { font: 'serif', italic: true }),
      T(a.x + 310, y + 4, a.w - 310, h - 8, text, fit(text, a.w - 310, h - 8, 21, 11), it.text ? c.ink : c.muted),
    );
  });
  out.push(R(a.x, a.y + a.h, a.w, 1, c.rule));
  return out;
}

/* ------------------------------------------------------------------ content: team */

type Members = Kind<'team'>['members'];
interface TeamColours {
  circle: string;
  circleInk: string;
  lead: string;
  leadInk: string;
  ink: string;
  label: string;
  card?: string;
  radius?: number;
  font?: Font;
}

/** Avatars and names down the page (1–3 columns). */
function teamList(m: Members, a: Area, c: TeamColours): S[] {
  const cols = m.length > 14 ? 3 : m.length > 6 ? 2 : 1;
  const perCol = Math.ceil(m.length / cols);
  const colW = a.w / cols;
  const step = Math.min(84, a.h / Math.max(1, perCol));
  const d = Math.min(56, step - 14);
  return m.flatMap((p, i) => {
    const x = a.x + Math.floor(i / perCol) * colW;
    const y = a.y + (i % perCol) * step;
    const out: S[] = [
      O(x, y, d, p.lead ? c.lead : c.circle),
      T(x, y, d, d, initials(p.name), d * 0.38, p.lead ? c.leadInk : c.circleInk, { bold: true, align: 'center' }),
      T(x + d + 18, y + (p.lead ? 0 : d * 0.15), colW - d - 40, p.lead ? d * 0.6 : d * 0.7, p.name.toUpperCase(), Math.min(26, d * 0.46), c.ink, { bold: true, font: c.font }),
    ];
    if (p.lead) out.push(T(x + d + 18, y + d * 0.58, colW - d - 40, d * 0.42, 'TEAM LEAD', Math.min(15, d * 0.28), c.label, { bold: true, spacing: 1.5 }));
    return out;
  });
}

/** A card per person in a grid. */
function teamCards(m: Members, a: Area, c: TeamColours): S[] {
  const n = Math.max(1, m.length);
  const cols = n <= 3 ? n : n <= 4 ? 2 : n <= 6 ? 3 : n <= 12 ? 4 : 5;
  const rows = Math.ceil(n / cols);
  const gap = 18;
  const w = (a.w - gap * (cols - 1)) / cols;
  const h = Math.min(150, (a.h - gap * (rows - 1)) / rows);
  const d = Math.min(64, h * 0.5);
  return m.flatMap((p, i) => {
    const x = a.x + (i % cols) * (w + gap);
    const y = a.y + Math.floor(i / cols) * (h + gap);
    const nameSize = fit(p.name.toUpperCase(), w - d - 52, h * 0.5, 24, 12, c.font);
    return [
      R(x, y, w, h, c.card ?? c.circle, c.radius ?? 18),
      O(x + 20, y + (h - d) / 2, d, p.lead ? c.lead : c.circle),
      T(x + 20, y + (h - d) / 2, d, d, initials(p.name), d * 0.36, p.lead ? c.leadInk : c.circleInk, { bold: true, align: 'center' }),
      T(x + d + 36, y + (p.lead ? h * 0.18 : 0), w - d - 52, p.lead ? h * 0.42 : h, p.name.toUpperCase(), nameSize, c.ink, { bold: true, font: c.font }),
      ...(p.lead ? [T(x + d + 36, y + h * 0.58, w - d - 52, h * 0.24, 'TEAM LEAD', 13, c.label, { bold: true, spacing: 1.5, valign: 'top' })] : []),
    ];
  });
}

/** Big round avatars with names under them. */
function teamBubbles(m: Members, a: Area, c: TeamColours): S[] {
  const n = Math.max(1, m.length);
  const cols = n <= 5 ? n : n <= 8 ? 4 : n <= 10 ? 5 : 6;
  const rows = Math.ceil(n / cols);
  const cellW = a.w / cols;
  const cellH = a.h / rows;
  const d = Math.min(cellW * 0.62, cellH * 0.62, 150);
  return m.flatMap((p, i) => {
    const r = Math.floor(i / cols);
    const inRow = r === rows - 1 ? n - r * cols : cols;
    const offset = ((cols - inRow) * cellW) / 2;
    const cx = a.x + offset + (i % cols) * cellW + cellW / 2;
    const y = a.y + r * cellH + (cellH - d - 60) / 2;
    return [
      O(cx - d / 2, y, d, p.lead ? c.lead : c.circle),
      T(cx - d / 2, y, d, d, initials(p.name), d * 0.34, p.lead ? c.leadInk : c.circleInk, { bold: true, align: 'center', font: c.font }),
      T(cx - cellW / 2 + 6, y + d + 8, cellW - 12, 30, p.name, fit(p.name, cellW - 12, 30, 20, 11), c.ink, { bold: true, align: 'center' }),
      ...(p.lead ? [T(cx - cellW / 2, y + d + 38, cellW, 22, 'TEAM LEAD', 13, c.label, { bold: true, align: 'center', spacing: 1.5 })] : []),
    ];
  });
}

/** 01  NAME, with rules — for Minimal and Magazine. */
function teamNumbered(m: Members, a: Area, c: { rule: string; num: string; ink: string; label: string; font?: Font }): S[] {
  const cols = m.length > 7 ? 2 : 1;
  const perCol = Math.ceil(m.length / cols);
  const colW = (a.w - (cols - 1) * 60) / cols;
  const h = Math.min(70, a.h / Math.max(1, perCol));
  return m.flatMap((p, i) => {
    const x = a.x + Math.floor(i / perCol) * (colW + 60);
    const y = a.y + (i % perCol) * h;
    return [
      R(x, y + h - 1, colW, 1, c.rule),
      T(x, y, 60, h, pad2(i + 1), Math.min(24, h * 0.4), c.num, { bold: true, font: c.font }),
      T(x + 70, y, colW - 230, h, p.name, fit(p.name, colW - 230, h, 28, 12, c.font), c.ink, { font: c.font, bold: c.font !== 'serif' }),
      ...(p.lead ? [T(x + colW - 160, y, 160, h, 'TEAM LEAD', 13, c.label, { bold: true, align: 'right', spacing: 1.5 })] : []),
    ];
  });
}

/* ------------------------------------------------------------------ content: summary */

interface SumColours {
  card: string;
  label: string;
  value: string;
  sub: string;
  ink: string;
  track: string;
  bar: string;
  top: string;
  radius: number;
  font?: Font;
}

function bars(b: Kind<'summary'>['bars'], a: Area, c: SumColours): S[] {
  const max = Math.max(1, ...b.map((x) => x.value));
  const h = Math.min(50, a.h / Math.max(1, b.length));
  const nameW = Math.min(250, a.w * 0.24);
  const valW = 200;
  const trackW = a.w - nameW - valW - 30;
  return b.flatMap((x, i) => {
    const y = a.y + i * h;
    const bh = Math.min(24, h * 0.5);
    return [
      T(a.x, y, nameW - 10, h, x.name, fit(x.name, nameW - 10, h, 18, 11), c.ink, { bold: true }),
      R(a.x + nameW, y + (h - bh) / 2, trackW, bh, c.track, bh / 2),
      { ...R(a.x + nameW, y + (h - bh) / 2, x.value > 0 ? Math.max(bh, (x.value / max) * trackW) : 6, bh, i === 0 ? c.top : c.bar, bh / 2), anim: 'grow' } as S,
      T(a.x + a.w - valW, y, valW, h, x.label, 18, c.ink, { bold: true, align: 'right' }),
    ];
  });
}

/** Three stat cards on top, top-5 bars under. */
function sumCards(s: Kind<'summary'>, a: Area, c: SumColours): S[] {
  const gap = 28;
  const cw = (a.w - gap * 2) / 3;
  const ch = Math.min(220, a.h * 0.46);
  const out: S[] = [];
  s.stats.forEach((st, i) => {
    const x = a.x + i * (cw + gap);
    out.push(
      R(x, a.y, cw, ch, c.card, c.radius),
      T(x + 26, a.y + 20, cw - 52, 30, st.label.toUpperCase(), 15, c.label, { bold: true, spacing: 1.5 }),
      T(x + 26, a.y + 56, cw - 52, ch - 120, st.value, fit(st.value, cw - 52, ch - 120, 54, 18, c.font), c.value, { bold: true, font: c.font, anim: 'count' }),
      T(x + 26, a.y + ch - 58, cw - 52, 40, st.sub, fit(st.sub, cw - 52, 40, 18, 11), c.sub),
    );
  });
  return [...out, ...bars(s.bars, { x: a.x, y: a.y + ch + 30, w: a.w, h: a.h - ch - 30 }, c)];
}

/** Three huge numbers divided by rules — Minimal and Magazine. */
function sumBig(s: Kind<'summary'>, a: Area, c: SumColours & { rule: string }): S[] {
  const cw = a.w / 3;
  const ch = Math.min(200, a.h * 0.44);
  const out: S[] = [];
  s.stats.forEach((st, i) => {
    const x = a.x + i * cw;
    if (i) out.push(R(x, a.y + 10, 1, ch - 20, c.rule));
    const px = i ? x + 36 : x;
    const w = cw - (i ? 36 : 0) - 20;
    out.push(
      T(px, a.y, w, 28, st.label.toUpperCase(), 14, c.label, { bold: true, spacing: 2 }),
      T(px, a.y + 34, w, ch - 90, st.value, fit(st.value, w, ch - 90, 64, 18, c.font), c.value, { bold: c.font !== 'serif', font: c.font, anim: 'count' }),
      T(px, a.y + ch - 50, w, 36, st.sub, fit(st.sub, w, 36, 17, 11), c.sub, { italic: c.font === 'serif' }),
    );
  });
  out.push(R(a.x, a.y + ch + 14, a.w, 1, c.rule));
  return [...out, ...bars(s.bars, { x: a.x, y: a.y + ch + 34, w: a.w, h: a.h - ch - 34 }, c)];
}

/* ------------------------------------------------------------------ styles */

interface Frame {
  bg: string;
  shapes: S[];
  area: Area;
}
interface StyleImpl {
  cover(s: Kind<'cover'>, t: Theme): Laid;
  thanks(s: Kind<'thanks'>, t: Theme): Laid;
  frame(title: string, subtitle: string, t: Theme, ctx: Ctx, kind: DeckSlide['kind']): Frame;
  summary(s: Kind<'summary'>, a: Area, t: Theme): S[];
  team(s: Kind<'team'>, a: Area, t: Theme): S[];
  table(s: Kind<'table'>, a: Area, t: Theme): S[];
  activities(s: Kind<'activities'>, a: Area, t: Theme): S[];
}

const stdTable = (t: Theme, font?: Font): TableColours => ({
  headFill: t.primary,
  headInk: t.primaryInk,
  stripe: t.surface,
  bg: t.bg,
  ink: t.ink,
  line: t.line,
  totalFill: t.accent,
  totalInk: t.accentInk,
  font,
});
const stdSum = (t: Theme, radius: number, card = t.surface, font?: Font): SumColours => ({
  card,
  label: t.muted,
  value: t.highlight,
  sub: t.muted,
  ink: t.ink,
  track: t.dark ? mix(t.bg, 'FFFFFF', 0.08) : t.surface,
  bar: t.primary,
  top: t.accent,
  radius,
  font,
});
const stdTeam = (t: Theme, extra: Partial<TeamColours> = {}): TeamColours => ({
  circle: t.primary,
  circleInk: t.primaryInk,
  lead: t.accent,
  leadInk: t.accentInk,
  ink: t.ink,
  label: t.highlight,
  card: t.surface,
  ...extra,
});

/* 1. Classic: the original look. */
const classic: StyleImpl = {
  cover(s, t) {
    const img = Boolean(s.image);
    const tx = img ? 580 : 96;
    const tw = img ? 620 : 760;
    const shapes: S[] = img ? [{ type: 'image', x: 0, y: 0, w: 520, h: 720, src: s.image }] : motif(900, 230, 3.4, t.accent, mix(t.coverBg, 'FFFFFF', 0.25));
    shapes.push(
      T(tx, 120, tw, 32, s.kicker ?? 'WEEKLY REPORT', 18, coverPop(t), { bold: true, spacing: 3 }),
      T(tx, 160, tw, 250, s.title.toUpperCase(), fit(s.title.toUpperCase(), tw, 250, img ? 52 : 60, 28), t.coverInk, { bold: true, valign: 'top' }),
      R(tx, 430, 380, 48, t.accent, 24),
      T(tx, 430, 380, 48, s.week, fit(s.week, 350, 48, 19), t.accentInk, { bold: true, align: 'center' }),
      T(tx, 512, tw, 44, s.name.toUpperCase(), 30, t.coverInk, { bold: true }),
      T(tx, 558, tw, 32, s.role.toUpperCase(), 19, t.coverMuted, { spacing: 1 }),
    );
    return { bg: t.coverBg, shapes };
  },
  thanks(s, t) {
    return {
      bg: t.coverBg,
      shapes: [
        ...motif(560, 170, 2, t.accent, mix(t.coverBg, 'FFFFFF', 0.25)),
        T(80, 330, 1120, 110, s.title.toUpperCase(), 84, t.coverInk, { bold: true, align: 'center' }),
        T(80, 450, 1120, 40, s.sub.toUpperCase(), 22, t.coverMuted, { align: 'center', spacing: 1 }),
      ],
    };
  },
  frame(title, subtitle, t, ctx, kind) {
    const up = kind === 'summary' ? title : title.toUpperCase();
    return {
      bg: t.bg,
      area: { x: 80, y: subtitle ? 160 : 150, w: 1120, h: 480 },
      shapes: [
        T(80, 48, 1000, 64, up, fit(up, 1000, 64, 40, 24), t.ink, { bold: true }),
        ...(subtitle ? [T(80, 108, 900, 30, subtitle, 18, t.muted)] : []),
        ...motif(1110, 52, 0.9, t.accent, t.primary),
        T(80, 666, 800, 28, ctx.teamName, 15, t.muted),
        T(1000, 666, 200, 28, `${ctx.page} / ${ctx.total}`, 15, t.muted, { align: 'right' }),
      ],
    };
  },
  summary: (s, a, t) => sumCards(s, a, stdSum(t, 24)),
  team: (s, a, t) => teamList(s.members, a, stdTeam(t)),
  table: (s, a, t) => table(s, a, stdTable(t)),
  activities: (s, a, t) => actRows(s.items, a, { dayFill: t.primary, dayInk: t.primaryInk, card: t.surface, ink: t.ink, muted: t.muted, radius: 18 }),
};

/* 2. Header Bar: a solid title band, formal. */
const corporate: StyleImpl = {
  cover(s, t) {
    const img = Boolean(s.image);
    const tw = img ? 660 : 1120;
    return {
      bg: t.bg,
      shapes: [
        R(0, 0, 1280, 470, t.coverBg),
        ...(img ? [{ type: 'image', x: 800, y: 0, w: 480, h: 470, src: s.image } as S] : [R(1040, 0, 240, 470, mix(t.coverBg, 'FFFFFF', 0.12))]),
        R(0, 470, 1280, 12, t.accent),
        T(80, 74, tw, 30, s.kicker ?? 'WEEKLY REPORT', 18, coverPop(t), { bold: true, spacing: 3 }),
        T(80, 116, tw, 300, s.title.toUpperCase(), fit(s.title.toUpperCase(), tw, 300, 60, 28), t.coverInk, { bold: true, valign: 'top' }),
        T(80, 520, 700, 46, s.name.toUpperCase(), fit(s.name.toUpperCase(), 700, 46, 32), t.ink, { bold: true }),
        T(80, 568, 700, 30, s.role.toUpperCase(), 18, t.muted, { spacing: 1 }),
        T(80, 610, 700, 30, s.team, 18, t.muted),
        R(820, 528, 380, 64, t.primary, 6),
        T(820, 528, 380, 64, s.week, fit(s.week, 350, 64, 20), t.primaryInk, { bold: true, align: 'center' }),
      ],
    };
  },
  thanks(s, t) {
    return {
      bg: t.bg,
      shapes: [
        R(0, 0, 1280, 470, t.coverBg),
        R(0, 470, 1280, 12, t.accent),
        T(80, 150, 1120, 200, s.title.toUpperCase(), 96, t.coverInk, { bold: true, align: 'center' }),
        T(80, 540, 1120, 50, s.sub.toUpperCase(), 22, t.ink, { bold: true, align: 'center', spacing: 1 }),
      ],
    };
  },
  frame(title, subtitle, t, ctx) {
    return {
      bg: t.bg,
      area: { x: 64, y: 168, w: 1152, h: 490 },
      shapes: [
        R(0, 0, 1280, 124, t.primary),
        R(0, 124, 1280, 6, t.accent),
        T(64, 30, 820, 64, title.toUpperCase(), fit(title.toUpperCase(), 820, 64, 38, 22), t.primaryInk, { bold: true }),
        T(860, 30, 356, 64, subtitle, fit(subtitle, 356, 64, 18, 12), mix(t.primaryInk, t.primary, 0.2), { align: 'right' }),
        R(0, 690, 1280, 30, t.surface),
        T(64, 690, 800, 30, ctx.teamName.toUpperCase(), 13, t.muted, { bold: true, spacing: 1.5 }),
        T(1016, 690, 200, 30, `${ctx.page} / ${ctx.total}`, 13, t.muted, { bold: true, align: 'right' }),
      ],
    };
  },
  summary: (s, a, t) => sumCards(s, a, stdSum(t, 6)),
  team: (s, a, t) => teamCards(s.members, a, stdTeam(t, { radius: 6 })),
  table: (s, a, t) => table(s, a, { ...stdTable(t), headFill: t.ink === 'FFFFFF' ? t.primary : mix(t.primary, '000000', 0.25) }),
  activities: (s, a, t) => actRows(s.items, a, { dayFill: t.accent, dayInk: t.accentInk, card: t.surface, ink: t.ink, muted: t.muted, radius: 4, dayW: 200 }),
};

/* 3. Bold Block: a big colour panel holds the title. */
const bold: StyleImpl = {
  cover(s, t) {
    const img = Boolean(s.image);
    const shapes: S[] = [
      img ? ({ type: 'image', x: 820, y: 0, w: 460, h: 720, src: s.image } as S) : R(820, 0, 460, 720, t.accent),
      ...(img ? [R(820, 500, 220, 220, t.accent)] : []),
      T(img ? 836 : 860, img ? 512 : 120, img ? 190 : 380, 50, 'WEEK', img ? 28 : 46, t.accentInk, { bold: true, font: 'display' }),
      T(img ? 836 : 860, img ? 550 : 170, img ? 190 : 380, img ? 160 : 360, String(s.weekNo), img ? 140 : 300, t.accentInk, { bold: true, font: 'display' }),
      ...(img ? [] : [T(860, 560, 380, 40, s.range, 22, t.accentInk, { bold: true })]),
      R(80, 120, 90, 10, t.accent),
      T(80, 160, 680, 300, s.title.toUpperCase(), fit(s.title.toUpperCase(), 680, 300, 66, 30, 'display'), t.coverInk, { font: 'display', valign: 'top' }),
      T(80, 520, 680, 46, s.name.toUpperCase(), fit(s.name.toUpperCase(), 680, 46, 30), t.coverInk, { bold: true }),
      T(80, 566, 680, 30, s.role.toUpperCase(), 18, t.coverMuted, { spacing: 1 }),
      ...(img ? [T(80, 610, 680, 30, s.range, 18, t.coverMuted)] : []),
    ];
    return { bg: t.coverBg, shapes };
  },
  thanks(s, t) {
    return {
      bg: t.coverBg,
      shapes: [
        R(860, 0, 420, 720, t.accent),
        T(80, 150, 1100, 340, s.title.toUpperCase().replace(' ', '\n'), 130, t.coverInk, { font: 'display', valign: 'top' }),
        T(80, 560, 740, 40, s.sub.toUpperCase(), 20, t.coverMuted, { bold: true, spacing: 1 }),
      ],
    };
  },
  frame(title, subtitle, t, ctx, kind) {
    const up = title.toUpperCase();
    const pw = kind === 'table' ? 290 : 380; // tables need the width
    const iw = pw - 80;
    return {
      bg: t.bg,
      area: { x: pw + 44, y: 70, w: 1236 - pw - 44, h: 580 },
      shapes: [
        R(0, 0, pw, 720, t.primary),
        R(40, 72, 60, 8, t.accent),
        T(40, 100, iw, 300, up, fit(up, iw, 300, 46, 20, 'display'), t.primaryInk, { font: 'display', valign: 'top' }),
        T(40, 410, iw, 60, subtitle, fit(subtitle, iw, 60, 18, 12), mix(t.primaryInk, t.primary, 0.25), { valign: 'top' }),
        T(34, 520, pw - 60, 150, pad2(ctx.page), 130, mix(t.primary, t.primaryInk, 0.22), { font: 'display' }),
        T(40, 676, iw, 24, ctx.teamName.toUpperCase(), 12, mix(t.primaryInk, t.primary, 0.3), { bold: true, spacing: 1.5 }),
      ],
    };
  },
  summary: (s, a, t) => sumCards(s, a, { ...stdSum(t, 0), font: 'display' }),
  team: (s, a, t) => teamCards(s.members, a, stdTeam(t, { radius: 0, circle: t.ink, circleInk: t.bg })),
  table: (s, a, t) => table(s, a, { ...stdTable(t), headFill: t.ink, headInk: t.bg }),
  activities: (s, a, t) => actRows(s.items, a, { dayFill: t.accent, dayInk: t.accentInk, card: t.surface, ink: t.ink, muted: t.muted, radius: 0, dayW: 160, font: 'display' }),
};

/* 4. Minimal: white space and thin lines. */
const minimal: StyleImpl = {
  cover(s, t) {
    const img = Boolean(s.image);
    const tw = img ? 560 : 900;
    return {
      bg: t.bg,
      shapes: [
        ...(img ? [{ type: 'image', x: 720, y: 0, w: 560, h: 720, src: s.image } as S] : []),
        R(80, 90, 26, 26, t.accent),
        T(122, 90, 500, 26, s.kicker ?? 'WEEKLY REPORT', 15, t.muted, { bold: true, spacing: 3 }),
        T(80, 170, tw, 260, s.title, fit(s.title, tw, 260, 72, 30), t.ink, { valign: 'top' }),
        R(80, 470, 80, 4, t.highlight),
        T(80, 500, tw, 40, s.name, fit(s.name, tw, 40, 28), t.ink, { bold: true }),
        T(80, 542, tw, 28, s.role, 18, t.muted),
        T(80, 620, tw, 28, s.week, 18, t.highlight, { bold: true }),
      ],
    };
  },
  thanks(s, t) {
    return {
      bg: t.bg,
      shapes: [R(80, 250, 80, 4, t.accent), T(80, 280, 1100, 140, 'Thank you.', 110, t.ink), T(80, 440, 1100, 36, s.sub, 20, t.muted)],
    };
  },
  frame(title, subtitle, t, ctx) {
    return {
      bg: t.bg,
      area: { x: 80, y: 196, w: 1120, h: 440 },
      shapes: [
        T(80, 52, 900, 24, (subtitle || ctx.teamName).toUpperCase(), 14, t.highlight, { bold: true, spacing: 2.5 }),
        T(80, 82, 1120, 64, title, fit(title, 1120, 64, 44, 24), t.ink),
        R(80, 160, 60, 3, t.accent),
        R(80, 668, 1120, 1, t.line),
        T(80, 676, 800, 26, ctx.teamName, 14, t.muted),
        T(1000, 676, 200, 26, pad2(ctx.page), 14, t.muted, { align: 'right', bold: true }),
      ],
    };
  },
  summary: (s, a, t) => sumBig(s, a, { ...stdSum(t, 0), rule: t.line }),
  team: (s, a, t) => teamNumbered(s.members, a, { rule: t.line, num: t.highlight, ink: t.ink, label: t.muted }),
  table: (s, a, t) => table(s, a, { headFill: t.bg, headInk: t.muted, stripe: t.bg, bg: t.bg, ink: t.ink, line: t.line, totalFill: t.surface, totalInk: t.highlight }),
  activities: (s, a, t) => actTimeline(s.items, a, { line: t.line, dot: t.accent, day: t.ink, ink: t.ink, muted: t.muted }),
};

/* 5. Magazine: serif headlines, rules, big numbers. */
const editorial: StyleImpl = {
  cover(s, t) {
    const img = Boolean(s.image);
    const tw = img ? 620 : 1120;
    return {
      bg: t.coverBg,
      shapes: [
        R(80, 60, 1120, 3, t.coverInk),
        R(80, 68, 1120, 1, t.coverInk),
        T(80, 76, 600, 30, s.kicker ? `THE ${s.kicker}` : 'THE WEEKLY REPORT', 14, t.coverMuted, { bold: true, spacing: 3 }),
        T(680, 76, 520, 30, s.range, 15, t.coverMuted, { align: 'right', italic: true, font: 'serif' }),
        ...(img ? [R(744, 140, 456, 496, t.accent), { type: 'image', x: 760, y: 156, w: 424, h: 464, src: s.image } as S] : []),
        T(80, 150, tw, 320, s.title, fit(s.title, tw, 320, 84, 32, 'serif'), t.coverInk, { font: 'serif', bold: true, valign: 'top' }),
        T(80, 490, tw, 40, s.badge ?? `Week ${s.weekNo}`, 28, coverPop(t), { font: 'serif', italic: true }),
        R(80, 552, 120, 2, coverPop(t)),
        T(80, 570, tw, 40, s.name, fit(s.name, tw, 40, 26), t.coverInk, { bold: true }),
        T(80, 610, tw, 30, s.role, 17, t.coverMuted, { italic: true, font: 'serif' }),
      ],
    };
  },
  thanks(s, t) {
    return {
      bg: t.coverBg,
      shapes: [
        R(80, 230, 1120, 1, t.coverMuted),
        T(80, 250, 1120, 170, 'Thank you', 120, t.coverInk, { font: 'serif', italic: true, align: 'center' }),
        R(80, 440, 1120, 1, t.coverMuted),
        T(80, 460, 1120, 36, s.sub, 18, t.coverMuted, { align: 'center', spacing: 1 }),
      ],
    };
  },
  frame(title, subtitle, t, ctx) {
    return {
      bg: t.bg,
      area: { x: 80, y: 206, w: 1120, h: 440 },
      shapes: [
        R(80, 36, 1120, 3, t.ink),
        R(80, 43, 1120, 1, t.ink),
        T(80, 50, 700, 26, ctx.teamName.toUpperCase(), 13, t.muted, { bold: true, spacing: 2.5 }),
        T(880, 50, 320, 26, `No. ${pad2(ctx.page)}`, 15, t.muted, { align: 'right', italic: true, font: 'serif' }),
        T(80, 88, 1120, 70, title, fit(title, 1120, 70, 50, 26, 'serif'), t.ink, { font: 'serif', bold: true }),
        ...(subtitle ? [T(80, 156, 1120, 32, subtitle, 20, t.highlight, { font: 'serif', italic: true })] : []),
        R(80, 668, 1120, 1, t.line),
      ],
    };
  },
  summary: (s, a, t) => sumBig(s, a, { ...stdSum(t, 0, t.surface, 'serif'), rule: t.line }),
  team: (s, a, t) => teamNumbered(s.members, a, { rule: t.line, num: t.highlight, ink: t.ink, label: t.highlight, font: 'serif' }),
  table: (s, a, t) => table(s, a, { headFill: t.ink, headInk: t.bg, stripe: t.surface, bg: t.bg, ink: t.ink, line: t.line, totalFill: t.primary, totalInk: t.primaryInk }),
  activities: (s, a, t) => actLedger(s.items, a, { rule: t.line, day: t.ink, ink: t.ink, muted: t.muted, num: t.highlight }),
};

/* 6. Night Glow: always dark, with soft lights. Colours come from the palette. */
function glowColours(t: Theme) {
  const pick = lum(t.primary) > 0.05 ? t.primary : t.accent;
  const second = pick === t.primary ? t.accent : t.primary;
  // The glow colour must shine on near-black: lift dark colours towards white.
  let light = pick;
  for (let i = 0; i < 8 && lum(light) < 0.22; i++) light = mix(light, 'FFFFFF', 0.18);
  const base = mix(light, '05060A', 0.9);
  return {
    base,
    light,
    lightInk: readable(light),
    second: lum(second) > 0.05 ? second : mix(light, 'FFFFFF', 0.4),
    card: mix(base, 'FFFFFF', 0.07),
    line: mix(base, 'FFFFFF', 0.14),
    ink: 'F5F7FA',
    muted: mix('F5F7FA', base, 0.42),
  };
}
function glowCover(s: Kind<'cover'>, t: Theme): Laid {
  const g = glowColours(t);
  const img = Boolean(s.image);
  const tw = img ? 600 : 900;
  return {
    bg: g.base,
    shapes: [
      ...glow(1100, 160, 420, g.base, g.light, 0.6),
      ...glow(180, 760, 300, g.base, g.second, 0.4),
      ...(img ? [{ type: 'image', x: 760, y: 120, w: 440, h: 480, src: s.image } as S] : []),
      R(80, 120, 220, 40, g.card, 20),
      T(80, 120, 220, 40, s.kicker ?? 'WEEKLY REPORT', 14, g.light, { bold: true, align: 'center', spacing: 2 }),
      T(80, 190, tw, 260, s.title.toUpperCase(), fit(s.title.toUpperCase(), tw, 260, 62, 28), g.ink, { bold: true, valign: 'top' }),
      T(80, 470, tw, 40, s.week, 22, g.light, { bold: true }),
      T(80, 540, tw, 44, s.name.toUpperCase(), 28, g.ink, { bold: true }),
      T(80, 584, tw, 30, s.role.toUpperCase(), 17, g.muted, { spacing: 1 }),
    ],
  };
}
function glowThanks(s: Kind<'thanks'>, t: Theme): Laid {
  const g = glowColours(t);
  return {
    bg: g.base,
    shapes: [
      ...glow(640, 360, 380, g.base, g.light, 0.55),
      T(80, 290, 1120, 120, s.title.toUpperCase(), 92, g.ink, { bold: true, align: 'center' }),
      T(80, 430, 1120, 40, s.sub.toUpperCase(), 20, g.muted, { align: 'center', spacing: 1 }),
    ],
  };
}
const glowStyle: StyleImpl = {
  cover: glowCover,
  thanks: glowThanks,
  frame(title, subtitle, t, ctx) {
    const g = glowColours(t);
    return {
      bg: g.base,
      area: { x: 80, y: 168, w: 1120, h: 470 },
      shapes: [
        ...glow(1220, 40, 300, g.base, g.light, 0.5),
        ...glow(60, 720, 220, g.base, g.second, 0.35),
        R(80, 50, 10, 56, g.light, 5),
        T(108, 46, 980, 64, title.toUpperCase(), fit(title.toUpperCase(), 980, 64, 38, 22), g.ink, { bold: true }),
        ...(subtitle ? [T(108, 108, 900, 30, subtitle, 18, g.muted)] : []),
        T(80, 666, 800, 28, ctx.teamName, 14, g.muted),
        T(1000, 666, 200, 28, `${ctx.page} / ${ctx.total}`, 14, g.muted, { align: 'right' }),
      ],
    };
  },
  summary(s, a, t) {
    const g = glowColours(t);
    return sumCards(s, a, { card: g.card, label: g.muted, value: g.light, sub: g.muted, ink: g.ink, track: g.card, bar: g.second, top: g.light, radius: 22 });
  },
  team(s, a, t) {
    const g = glowColours(t);
    return teamBubbles(s.members, a, { circle: g.card, circleInk: g.ink, lead: g.light, leadInk: g.lightInk, ink: g.ink, label: g.light });
  },
  table(s, a, t) {
    const g = glowColours(t);
    return table(s, a, { headFill: g.light, headInk: g.lightInk, stripe: g.card, bg: g.base, ink: g.ink, line: g.line, totalFill: mix(g.base, g.light, 0.35), totalInk: g.ink });
  },
  activities(s, a, t) {
    const g = glowColours(t);
    return actRows(s.items, a, { dayFill: g.light, dayInk: g.lightInk, card: g.card, ink: g.ink, muted: g.muted, radius: 40, dayW: 180 });
  },
};

/* 7. Bubbles: round, friendly shapes. */
const playful: StyleImpl = {
  cover(s, t) {
    const img = Boolean(s.image);
    const soft = mix(t.coverBg, 'FFFFFF', 0.14);
    return {
      bg: t.coverBg,
      shapes: [
        O(860, -160, 560, soft),
        O(-120, 520, 320, soft),
        ...(img ? [{ type: 'image', x: 800, y: 150, w: 400, h: 400, src: s.image } as S, O(1110, 470, 130, t.accent)] : [O(980, 260, 200, t.accent)]),
        O(img ? 760 : 920, 120, 56, t.accent),
        R(80, 120, 250, 50, t.accent, 25),
        T(80, 120, 250, 50, s.badge?.toUpperCase() ?? `WEEK ${s.weekNo}`, 22, t.accentInk, { bold: true, align: 'center' }),
        T(80, 200, img ? 660 : 820, 260, s.title, fit(s.title, img ? 660 : 820, 260, 64, 28), t.coverInk, { bold: true, valign: 'top' }),
        T(80, 490, 660, 44, s.name, 30, t.coverInk, { bold: true }),
        T(80, 534, 660, 30, s.role, 19, t.coverMuted),
        T(80, 590, 660, 30, s.range, 18, t.coverMuted),
      ],
    };
  },
  thanks(s, t) {
    const soft = mix(t.coverBg, 'FFFFFF', 0.14);
    return {
      bg: t.coverBg,
      shapes: [
        O(-100, -100, 360, soft),
        O(1000, 460, 400, soft),
        O(1040, 110, 90, t.accent),
        O(170, 520, 60, t.accent),
        T(80, 270, 1120, 130, s.title, 100, t.coverInk, { bold: true, align: 'center' }),
        T(80, 420, 1120, 40, s.sub, 22, t.coverMuted, { align: 'center' }),
      ],
    };
  },
  frame(title, subtitle, t, ctx) {
    return {
      bg: t.bg,
      area: { x: 80, y: 170, w: 1120, h: 470 },
      shapes: [
        O(1060, -150, 340, t.surface),
        O(1170, 110, 54, t.accent),
        O(-90, 620, 200, t.surface),
        O(80, 66, 26, t.accent),
        T(122, 44, 900, 70, title, fit(title, 900, 70, 42, 24), t.ink, { bold: true }),
        ...(subtitle ? [R(122, 116, Math.min(560, 40 + subtitle.length * 10), 34, t.surface, 17), T(140, 116, 540, 34, subtitle, 16, t.highlight, { bold: true })] : []),
        T(1000, 670, 200, 28, `${ctx.page} / ${ctx.total}`, 15, t.muted, { align: 'right', bold: true }),
      ],
    };
  },
  summary: (s, a, t) => sumCards(s, a, stdSum(t, 36)),
  team: (s, a, t) => teamBubbles(s.members, a, stdTeam(t)),
  table: (s, a, t) => table(s, a, stdTable(t)),
  activities: (s, a, t) => actColumns(s.items, a, { dayFill: t.primary, dayInk: t.primaryInk, card: t.surface, ink: t.ink, muted: t.muted, radius: 28, headH: 64 }),
};

/* 8. Dashboard: content in tidy panels on a tinted page. */
function dash(t: Theme) {
  return { page: t.dark ? t.bg : mix(t.surface, 'F4F5F7', 0.55), card: t.dark ? t.surface : 'FFFFFF', line: t.dark ? t.line : mix(t.line, 'FFFFFF', 0.3) };
}
const dashboard: StyleImpl = {
  cover(s, t) {
    const d = dash(t);
    const img = Boolean(s.image);
    return {
      bg: d.page,
      shapes: [
        R(56, 56, 1168, 608, d.card, 28),
        R(56, 56, 20, 608, t.primary, 0),
        ...(img ? [{ type: 'image', x: 800, y: 96, w: 384, h: 528, src: s.image } as S] : [R(800, 96, 384, 528, t.primary, 22), ...motif(880, 290, 2.8, t.accent, mix(t.primary, 'FFFFFF', 0.25))]),
        R(120, 110, 200, 40, t.surface, 20),
        T(120, 110, 200, 40, s.kicker ?? 'WEEKLY REPORT', 13, t.highlight, { bold: true, align: 'center', spacing: 1.5 }),
        T(120, 180, 640, 240, s.title, fit(s.title, 640, 240, 56, 26), t.ink, { bold: true, valign: 'top' }),
        R(120, 452, 300, 86, t.surface, 18),
        T(140, 460, 260, 26, s.badge ? 'MONTH' : 'WEEK', 13, t.muted, { bold: true, spacing: 1.5 }),
        T(140, 486, 260, 40, s.badge ?? String(s.weekNo), s.badge ? fit(s.badge, 260, 40, 32) : 32, t.highlight, { bold: true }),
        R(440, 452, 320, 86, t.surface, 18),
        T(460, 460, 280, 26, 'DATES', 13, t.muted, { bold: true, spacing: 1.5 }),
        T(460, 486, 280, 40, s.range, fit(s.range, 280, 40, 22), t.ink, { bold: true }),
        T(120, 560, 640, 40, s.name, 26, t.ink, { bold: true }),
        T(120, 598, 640, 28, s.role, 17, t.muted),
      ],
    };
  },
  thanks(s, t) {
    const d = dash(t);
    return {
      bg: d.page,
      shapes: [
        R(240, 170, 800, 380, d.card, 28),
        ...motif(570, 220, 1.6, t.accent, t.primary),
        T(240, 330, 800, 100, s.title, 76, t.ink, { bold: true, align: 'center' }),
        T(240, 440, 800, 40, s.sub, 20, t.muted, { align: 'center' }),
      ],
    };
  },
  frame(title, subtitle, t, ctx) {
    const d = dash(t);
    return {
      bg: d.page,
      area: { x: 56, y: 150, w: 1168, h: 520 },
      shapes: [
        T(56, 40, 820, 30, ctx.teamName.toUpperCase(), 13, t.muted, { bold: true, spacing: 2 }),
        T(56, 70, 820, 56, title, fit(title, 820, 56, 36, 22), t.ink, { bold: true }),
        ...(subtitle ? [R(884, 62, 340, 52, d.card, 26), T(884, 62, 340, 52, subtitle, fit(subtitle, 300, 52, 17), t.highlight, { bold: true, align: 'center' })] : []),
        T(1024, 684, 200, 24, `${ctx.page} / ${ctx.total}`, 13, t.muted, { align: 'right', bold: true }),
      ],
    };
  },
  summary(s, a, t) {
    const d = dash(t);
    return sumCards(s, a, { ...stdSum(t, 22, d.card), track: t.surface });
  },
  team(s, a, t) {
    const d = dash(t);
    return teamCards(s.members, a, stdTeam(t, { card: d.card, radius: 22 }));
  },
  table(s, a, t) {
    const d = dash(t);
    return [R(a.x, a.y, a.w, a.h, d.card, 22), ...table(s, { x: a.x + 24, y: a.y + 24, w: a.w - 48, h: a.h - 48 }, { ...stdTable(t), bg: d.card, line: d.line })];
  },
  activities(s, a, t) {
    const d = dash(t);
    return actColumns(s.items, a, { dayFill: t.primary, dayInk: t.primaryInk, card: d.card, ink: t.ink, muted: t.muted, radius: 22 });
  },
};

const STYLE_IMPL: Record<string, StyleImpl> = { classic, corporate, bold, minimal, editorial, glow: glowStyle, playful, dashboard };

/* ------------------------------------------------------------------ shared: map slide, notes */

/** Text and card colours that suit a style's content slides (Night Glow is always dark). */
function inkFor(styleId: string, t: Theme) {
  if (styleId === 'glow') {
    const g = glowColours(t);
    return { ink: g.ink, muted: g.muted, card: g.card, accent: g.light };
  }
  if (styleId === 'dashboard') return { ink: t.ink, muted: t.muted, card: dash(t).card, accent: t.accent };
  return { ink: t.ink, muted: t.muted, card: t.surface, accent: t.accent };
}

/** The map picture on the left, each day's stops listed on the right in the map's colours. */
function mapContent(slide: Kind<'map'>, a: Area, c: ReturnType<typeof inkFor>, styleId: string): S[] {
  const legendW = Math.min(360, a.w * 0.32);
  const mw = a.w - legendW - 28;
  const mh = Math.min(a.h, mw * (760 / 1200));
  const out: S[] = [{ type: 'image', x: a.x, y: a.y, w: mw, h: mh, src: slide.image }];
  if (styleId !== 'minimal' && styleId !== 'editorial') out.unshift(R(a.x - 6, a.y - 6, mw + 12, mh + 12, c.card, styleId === 'bold' ? 0 : 14));
  const days = slide.days.filter((d) => d.stops.length);
  const lx = a.x + mw + 28;
  const rowH = Math.min(120, a.h / Math.max(1, days.length));
  days.forEach((d, i) => {
    const y = a.y + i * rowH;
    const list = d.stops.map((s, n) => `${n + 1}. ${s}`).join('\n');
    out.push(
      O(lx, y + 4, 22, d.color),
      T(lx + 32, y, legendW - 32, 30, d.day, 19, c.ink, { bold: true }),
      T(lx + 32, y + 30, legendW - 32, rowH - 36, list, fit(list, legendW - 32, rowH - 36, 16, 10), c.muted, { valign: 'top' }),
    );
  });
  return out;
}

/* ------------------------------------------------------------------ entry */

/** Lay out one slide in a look (a Look, a saved id like "bold_coral", or an older palette-only id). */
export function layoutSlide(slide: DeckSlide, lookOrId: Look | string | Theme, ctx: Ctx): Laid {
  const look: Look = typeof lookOrId === 'string' ? lookById(lookOrId) : 'style' in lookOrId ? lookOrId : lookById(`classic_${lookOrId.id}`);
  const st = STYLE_IMPL[look.style.id] ?? classic;
  const t = look.palette;
  if (slide.kind === 'cover') return st.cover(slide, t);
  if (slide.kind === 'thanks') return st.thanks(slide, t);
  const subtitle = slide.kind === 'table' || slide.kind === 'activities' || slide.kind === 'map' ? slide.subtitle : '';
  const f = st.frame(slide.title, subtitle, t, ctx, slide.kind === 'map' ? 'activities' : slide.kind);
  const ink = inkFor(look.style.id, t);
  let content: S[];
  switch (slide.kind) {
    case 'summary': {
      if (!slide.note) {
        content = st.summary(slide, f.area, t);
        break;
      }
      // Room at the bottom for the week's note (written by the manager or the AI).
      const noteH = 78;
      const a = { ...f.area, h: f.area.h - noteH - 18 };
      const y = a.y + a.h + 18;
      content = [
        ...st.summary(slide, a, t),
        R(f.area.x, y, f.area.w, noteH, ink.card, look.style.id === 'bold' || look.style.id === 'minimal' ? 0 : 16),
        R(f.area.x, y, 8, noteH, ink.accent, 0),
        T(f.area.x + 30, y + 6, f.area.w - 50, noteH - 12, slide.note, fit(slide.note, f.area.w - 50, noteH - 12, 21, 12), ink.ink, { italic: look.style.id === 'editorial', font: look.style.id === 'editorial' ? 'serif' : undefined }),
      ];
      break;
    }
    case 'map':
      content = mapContent(slide, f.area, ink, look.style.id);
      break;
    case 'team':
      content = st.team(slide, f.area, t);
      break;
    case 'table':
      content = st.table(slide, f.area, t);
      break;
    case 'activities':
      content = st.activities(slide, f.area, t);
      break;
  }
  return { bg: f.bg, shapes: [...f.shapes, ...content] };
}
