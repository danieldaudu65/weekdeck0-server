/**
 * Finds the Monday–Friday plan (WPR activities) in old slides, however it was typed:
 *
 *   "Monday: Site visit"            "❖ MONDAY – Site visit"        "Mon. 20th Oct: Site visit"
 *   "MONDAY" then the plan on the next line(s)                     "Wenesday: …" (misspelt)
 *   "Monday & Tuesday: Office"      "Monday – Friday: Storming"     a table: Day | Activity
 *   a table with MON…FRI across the top and the plans under them
 *   the plan split over two slides (Mon–Wed on one, Thu–Fri on the next)
 *
 * Pure (no browser APIs) so it can be unit-tested.
 */
import { DAYS, emptyActivities, type Activities, type DayKey } from './types';
import type { SlideContent, SlideParagraph } from './importAnalyze';

const FULL: Record<DayKey, string> = { mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday', fri: 'friday' };
const OTHER_DAYS = /^(sat|sun)/i;

function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** "Mon", "MONDAY", "Tues", "Weds", "Thur", "Wenesday", "Thurday" → day key; anything else → null. */
export function dayOfWord(word: string): DayKey | null {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length < 3 || w.length > 11 || /^(sat|sun)/.test(w)) return null;
  for (const d of DAYS) {
    const full = FULL[d];
    // A short form: "mon", "tues", "weds", "thur", "thurs"
    if (w.length <= 5 && w.startsWith(d) && (full.startsWith(w) || /^(weds|thurs?)$/.test(w))) return d;
    if (w === full) return d;
  }
  // Misspellings of the full name ("wenesday", "thurday", "tusday"), never short words like "mono".
  if (w.length >= 6 && w.endsWith('day')) {
    let best: DayKey | null = null;
    let bestDist = 3;
    for (const d of DAYS) {
      const dist = editDistance(w, FULL[d]);
      if (dist < bestDist) {
        best = d;
        bestDist = dist;
      }
    }
    return best;
  }
  return null;
}

const LEAD_JUNK = /^[^\p{L}\p{N}]+/u; // bullets of any kind, including PDF symbol-font glyphs
const DATE_BITS =
  /^[\s,(]*(\d{1,2}(st|nd|rd|th)?([\s/.-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?)?([\s/.-]*\d{1,4}){0,2})[\s,)]*/i;
const SEP = /^[\s:;,.\-–—=>|)]+/;

/**
 * Does this line start with a day (or days)? Returns the days and the rest of the line.
 * "Monday – Friday: Storming" → all five days; "Mon & Tue: Office" → mon, tue.
 */
export function readDayLine(text: string): { days: DayKey[]; rest: string } | null {
  let s = text.replace(LEAD_JUNK, '');
  const days: DayKey[] = [];
  let rangeNext = false;
  for (;;) {
    const m = /^([\p{L}]+)\.?/u.exec(s);
    if (!m) break;
    const d = dayOfWord(m[1]);
    if (!d) break;
    if (rangeNext && days.length) {
      const from = DAYS.indexOf(days[days.length - 1]);
      const to = DAYS.indexOf(d);
      for (let i = from + 1; i <= to; i++) days.push(DAYS[i]);
    } else if (!days.includes(d)) days.push(d);
    s = s.slice(m[0].length);
    const joiner = /^\s*(-|–|—|to|through|till|until|&|and|\/|,|\+)\s*/i.exec(s);
    if (!joiner) break;
    const after = s.slice(joiner[0].length);
    const next = /^([\p{L}]+)/u.exec(after);
    if (!next || !dayOfWord(next[1])) break; // "Monday - Site visit": the dash is just a separator
    rangeNext = /^(-|–|—|to|through|till|until)$/i.test(joiner[1]);
    s = after;
  }
  if (!days.length) return null;
  // The day must be a label, not the start of a sentence ("Monday's meeting was…").
  if (/^['’]s\b/i.test(s)) return null;
  s = s.replace(DATE_BITS, '').replace(SEP, '');
  return { days, rest: tidy(s) };
}

function tidy(s: string): string {
  const t = s.replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

/** A line under a day label that belongs to it (not a title, slide number or another weekday). */
const isFollowLine = (p: SlideParagraph) => p.ph !== 'title' && p.ph !== 'ctrTitle' && p.ph !== 'sldNum' && p.text.replace(LEAD_JUNK, '').trim() !== '' && !OTHER_DAYS.test(p.text.replace(LEAD_JUNK, ''));

function joinParts(parts: string[]): string {
  return tidy(parts.map((p) => p.replace(LEAD_JUNK, '').trim().replace(/[.;,]$/, '')).filter(Boolean).join('; ')).slice(0, 600);
}

/** Activities written as lines/paragraphs on one slide. */
function fromParagraphs(paragraphs: SlideParagraph[]): Partial<Record<DayKey, string>> {
  const out: Partial<Record<DayKey, string>> = {};
  const lines = paragraphs.flatMap((p) => p.text.split(/\n+/).map((text) => ({ ...p, text })));
  const dayOf = lines.map((l) => (l.ph === 'title' || l.ph === 'ctrTitle' ? null : readDayLine(l.text)));
  const lastDay = dayOf.reduce((last, d, i) => (d ? i : last), -1);
  let current: { days: DayKey[]; parts: string[]; alone: boolean } | null = null;
  const flush = () => {
    const text = current ? joinParts(current.parts) : '';
    if (current) for (const d of current.days) if (text && !out[d]) out[d] = text;
    current = null;
  };
  lines.forEach((line, i) => {
    const day = dayOf[i];
    if (day) {
      flush();
      current = { days: day.days, parts: day.rest ? [day.rest] : [], alone: !day.rest };
      return;
    }
    if (!current) return;
    if (!isFollowLine(line)) {
      if (OTHER_DAYS.test(line.text.replace(LEAD_JUNK, ''))) flush(); // Saturday ends Friday
      return;
    }
    if (i < lastDay) {
      current.parts.push(line.text); // lines between two days belong to the first
    } else {
      // After the last day: a label on its own takes the next lines (up to 3); otherwise only
      // bullet-style sub-points join, so a closing note ("Thank you") isn't swallowed into Friday.
      const subPoint = /^[^\p{L}\p{N}]/u.test(line.text.trim());
      if (current.parts.length < 3 && (current.alone || subPoint)) current.parts.push(line.text);
      else flush();
    }
  });
  flush();
  return out;
}

/** Activities written in a table: "Day | Activity" rows, or MON…FRI across the top. */
function fromTables(tables: string[][][]): Partial<Record<DayKey, string>> {
  const out: Partial<Record<DayKey, string>> = {};
  const isNumbery = (c: string) => /^[\s₦n,.\d km-]*$/i.test(c);
  for (const t of tables) {
    // Days down the first column(s): each row = a day.
    for (const row of t) {
      const dayCell = row.findIndex((c) => readDayLine(c)?.rest === '');
      if (dayCell < 0 || dayCell > 1) continue;
      if (row.filter((c) => readDayLine(c)?.rest === '').length >= 2) continue; // a MON | TUE | … header row
      const day = readDayLine(row[dayCell])!;
      const text = joinParts(row.slice(dayCell + 1).filter((c) => c.trim() && !isNumbery(c)));
      for (const d of day.days) if (text && !out[d]) out[d] = text;
    }
    // Days across the top: the rows below hold words (not sales figures).
    const hi = t.findIndex((row) => row.filter((c) => readDayLine(c)?.rest === '').length >= 3);
    if (hi >= 0) {
      const header = t[hi].map((c) => readDayLine(c));
      for (let col = 0; col < header.length; col++) {
        const h = header[col];
        if (!h || h.rest !== '') continue;
        const cells = t.slice(hi + 1).map((r) => r[col] ?? '').filter((c) => c.trim() && !isNumbery(c));
        const text = joinParts(cells);
        for (const d of h.days) if (text && !out[d]) out[d] = text;
      }
    }
  }
  return out;
}

export interface FoundActivities {
  activities: Activities;
  /** The slide most of the plan came from (for its heading). */
  slide: SlideContent | null;
}

export function findActivities(slides: SlideContent[]): FoundActivities {
  const perSlide = slides.map((s) => {
    const fromText = fromParagraphs(s.paragraphs);
    const fromTable = fromTables(s.tables);
    const merged: Partial<Record<DayKey, string>> = { ...fromTable, ...fromText };
    return { slide: s, found: merged, count: Object.keys(merged).length };
  });
  // The slide with the most days wins; other slides only fill days it doesn't have
  // (for plans split over two slides). A lone day mention elsewhere is ignored.
  const ranked = perSlide.filter((x) => x.count >= 2 || perSlide.some((y) => y !== x && y.count >= 2 && Math.abs(y.slide.index - x.slide.index) === 1)).sort((a, b) => b.count - a.count);
  const activities = emptyActivities();
  for (const r of ranked) for (const d of DAYS) if (!activities[d] && r.found[d]) activities[d] = r.found[d]!;
  const best = ranked[0];
  return { activities, slide: best && best.count >= 1 && DAYS.some((d) => activities[d]) ? best.slide : null };
}
