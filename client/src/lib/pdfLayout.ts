/**
 * Turns the loose text pieces of a PDF page into the same shape a PowerPoint
 * slide gives us (paragraphs + tables), so analyzeSlides() works for both.
 *
 * A PDF has no "paragraphs" or "tables" — only bits of text at x/y positions.
 * We rebuild them:
 *  1. pieces on the same baseline → a line
 *  2. big horizontal gaps inside a line → separate cells
 *  3. a run of lines with several cells → a table (columns found by x position)
 *  4. everything else → paragraphs; the biggest text on the page is the title
 * Pure (no browser APIs) so it can be unit-tested.
 */
import type { SlideContent, SlideParagraph } from './importAnalyze';
import { readDayLine } from './importActivities';

const isDayLabel = (s: string) => readDayLine(s)?.rest === '';
const startsWithDay = (s: string) => readDayLine(s) !== null;

export interface PdfTextPiece {
  str: string;
  /** Left edge, in PDF units. */
  x: number;
  /** Baseline, in PDF units measured from the BOTTOM of the page (PDF style). */
  y: number;
  /** Width of the piece. */
  w: number;
  /** Font size (height). */
  size: number;
}

interface Cell {
  text: string;
  x0: number;
  x1: number;
}

interface Line {
  /** Distance from the top of the page to the baseline. */
  top: number;
  size: number;
  cells: Cell[];
}

const LIST_START = /^[\s❖•▪▫◦●○■□►▶➢➤✓✔\-–—*·]|^\s*\d+[.)]\s/u;

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Join text pieces, adding a space where the gap (or the text itself) calls for one. */
function joinPieces(pieces: PdfTextPiece[]): string {
  let out = '';
  let prevEnd = -Infinity;
  for (const p of pieces) {
    const gap = p.x - prevEnd;
    if (out && !/\s$/.test(out) && !/^\s/.test(p.str) && gap > p.size * 0.15) out += ' ';
    out += p.str;
    prevEnd = p.x + p.w;
  }
  return out.replace(/\s+/g, ' ').trim();
}

function buildLines(pieces: PdfTextPiece[], pageHeight: number): Line[] {
  const items = pieces
    .filter((p) => p.str.trim() && p.size > 0)
    .map((p) => ({ ...p, top: pageHeight - p.y }))
    .sort((a, b) => a.top - b.top || a.x - b.x);

  const groups: (typeof items)[] = [];
  for (const it of items) {
    const g = groups[groups.length - 1];
    const ref = g?.[0];
    if (ref && Math.abs(it.top - ref.top) < Math.min(it.size, ref.size) * 0.5) g.push(it);
    else groups.push([it]);
  }

  return groups.map((g) => {
    g.sort((a, b) => a.x - b.x);
    const size = Math.max(...g.map((p) => p.size));
    const cells: Cell[] = [];
    let current: PdfTextPiece[] = [];
    const flush = () => {
      if (!current.length) return;
      const text = joinPieces(current);
      if (text) cells.push({ text, x0: current[0].x, x1: Math.max(...current.map((p) => p.x + p.w)) });
      current = [];
    };
    for (const p of g) {
      const last = current[current.length - 1];
      // Words in one cell are a space apart (~0.3 × font size); table columns are further apart.
      if (last && p.x - (last.x + last.w) > Math.max(last.size, p.size) * 0.8) flush();
      current.push(p);
    }
    flush();
    return { top: median(g.map((p) => p.top)), size, cells };
  });
}

/** Group cell x-ranges that overlap into columns. */
function findColumns(cells: Cell[]): { x0: number; x1: number }[] {
  const sorted = [...cells].sort((a, b) => a.x0 - b.x0);
  const cols: { x0: number; x1: number }[] = [];
  for (const c of sorted) {
    const last = cols[cols.length - 1];
    if (last && c.x0 <= last.x1 + 2) last.x1 = Math.max(last.x1, c.x1);
    else cols.push({ x0: c.x0, x1: c.x1 });
  }
  return cols;
}

function columnOf(cols: { x0: number; x1: number }[], c: Cell): number {
  const mid = (c.x0 + c.x1) / 2;
  let best = 0;
  let bestDist = Infinity;
  cols.forEach((col, i) => {
    const d = mid < col.x0 ? col.x0 - mid : mid > col.x1 ? mid - col.x1 : 0;
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}

/**
 * Turn a run of lines into a table (rows → cells).
 * Lines much closer together than the table's usual row spacing are one row whose text
 * wrapped (a long name or plan on two lines); everything else is its own row, even a row
 * with only a name in it (a member with no sales that week).
 */
function toTable(run: Line[]): string[][] {
  const cols = findColumns(run.filter((l) => l.cells.length >= 2).flatMap((l) => l.cells));
  const gaps = run.slice(1).map((l, k) => l.top - run[k].top);
  const wrapGap = Math.min(Math.max(...run.map((l) => l.size)) * 1.45, median(gaps) * 0.75);
  const rows: { cells: string[][] }[] = [];
  run.forEach((l, k) => {
    if (k === 0 || gaps[k - 1] >= wrapGap) rows.push({ cells: Array.from({ length: cols.length }, () => [] as string[]) });
    const row = rows[rows.length - 1];
    for (const c of l.cells) row.cells[columnOf(cols, c)].push(c.text);
  });
  return rows.map((r) => r.cells.map(joinWrapped));
}

/**
 * Join the lines of one wrapped cell. A narrow column can break a word or number mid-way
 * ("1,300,0" + "00", "MARGARE" + "T"): those pieces join with no space.
 */
function joinWrapped(parts: string[]): string {
  let out = '';
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    const brokenNumber = /[\d,.]$/.test(out) && /^[\d,.]/.test(part);
    const brokenWord = /\p{L}$/u.test(out) && /^\p{L}{1,2}$/u.test(part);
    out += out && !brokenNumber && !brokenWord ? ` ${part}` : part;
  }
  return out;
}

export function pageToSlide(pieces: PdfTextPiece[], pageHeight: number, index: number, picture?: string): SlideContent {
  const lines = buildLines(pieces, pageHeight);

  // ---- Tables: a run of lines starting with a multi-cell line. One-cell lines stay in the run
  // when they sit inside the table's left/right edges at a normal row distance: a row with
  // only a name (no figures), a TOTAL row with no totals, or the second line of a wrapped cell.
  const inTable = new Set<Line>();
  const tables: string[][][] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].cells.length < 2) {
      i++;
      continue;
    }
    let j = i;
    const run: Line[] = [];
    while (j < lines.length) {
      const l = lines[j];
      const prev = run[run.length - 1];
      if (prev) {
        const multi = run.filter((r) => r.cells.length >= 2);
        // Row spacing = distance between the first lines of rows. A line right under another
        // (closer than 1.45 × font size) is the wrapped rest of a cell, not a new row.
        const rowStarts = run.filter((r, k) => k === 0 || r.top - run[k - 1].top >= r.size * 1.45);
        const steps = rowStarts.slice(1).map((r, k) => r.top - rowStarts[k].top);
        const pitch = steps.length ? median(steps) : Math.max(prev.size * 2.6, l.top - prev.top);
        const gap = l.top - prev.top;
        if (gap > Math.max(prev.size * 3, pitch * 1.6)) break;
        if (l.size > Math.max(...multi.map((r) => r.size)) * 1.3) break; // a heading below the table
        if (l.cells.length < 2) {
          const left = Math.min(...multi.map((r) => r.cells[0].x0));
          const right = Math.max(...multi.map((r) => r.cells[r.cells.length - 1].x1));
          const inside = l.cells[0].x0 >= left - l.size && l.cells[0].x1 <= right + l.size;
          if (!inside || gap > pitch * 1.35) break;
        }
      }
      run.push(l);
      j++;
    }
    // Trailing one-cell lines after the last real row are only kept when they look like rows (e.g. "TOTAL").
    while (run.length > 1 && run[run.length - 1].cells.length < 2 && !/^\s*total/i.test(run[run.length - 1].cells[0].text)) {
      const last = run[run.length - 1];
      const prevMulti = [...run].reverse().find((r) => r.cells.length >= 2)!;
      const sameCol = Math.abs(last.cells[0].x0 - prevMulti.cells[0].x0) <= last.size;
      if (sameCol) break;
      run.pop();
      j--;
    }
    if (run.some((l) => l.cells.length >= 3) && run.filter((l) => l.cells.length >= 2).length >= 2) {
      tables.push(toTable(run));
      run.forEach((l) => inTable.add(l));
      i = j;
    } else i++;
  }

  // ---- Paragraphs from the remaining lines.
  const rest = lines.filter((l) => !inTable.has(l));
  const sizes = rest.map((l) => l.size);
  const maxSize = Math.max(0, ...sizes);
  const titleSize = maxSize >= median(sizes) * 1.25 ? maxSize * 0.9 : Infinity;

  const paragraphs: (SlideParagraph & { top: number; size: number })[] = [];
  for (const l of rest) {
    const ph = l.size >= titleSize ? 'title' : undefined;
    // "Monday:   Site visit…" keeps its day label; otherwise each cell is its own paragraph (names in columns).
    const parts = l.cells.length > 1 && isDayLabel(l.cells[0].text) ? [l.cells.map((c) => c.text).join(' ')] : l.cells.map((c) => c.text);
    for (const text of parts) {
      const prev = paragraphs[paragraphs.length - 1];
      // A day line that wrapped onto the next line: join it back.
      const continues =
        prev &&
        parts.length === 1 &&
        !ph &&
        !prev.ph &&
        startsWithDay(prev.text) &&
        !startsWithDay(text) &&
        !LIST_START.test(text) &&
        Math.abs(prev.size - l.size) <= l.size * 0.15 &&
        l.top - prev.top < l.size * 1.9;
      if (continues) {
        prev.text = `${prev.text} ${text}`;
        prev.top = l.top;
      } else if (/^\d{1,3}$/.test(text) && l.top > pageHeight * 0.85) {
        paragraphs.push({ text, ph: 'sldNum', top: l.top, size: l.size });
      } else {
        paragraphs.push({ text, ph, top: l.top, size: l.size });
      }
    }
  }

  return {
    index,
    paragraphs: paragraphs.map(({ text, ph }) => (ph ? { text, ph } : { text })),
    tables,
    picture,
  };
}
