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

const DAY_ONLY = /^\s*(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?)\s*[:.\-–—]?\s*$/i;
const DAY_START = /^\s*(mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?)\b/i;
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
      if (last && p.x - (last.x + last.w) > Math.max(last.size, p.size) * 1.6) flush();
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

/** Turn a run of lines into a table (rows → cells). One-cell lines inside the run are wrapped names; they join the nearest row. */
function toTable(run: Line[]): string[][] {
  const multi = run.filter((l) => l.cells.length >= 2);
  const cols = findColumns(multi.flatMap((l) => l.cells));
  const rows = multi.map((l) => ({ top: l.top, cells: Array.from({ length: cols.length }, () => [] as string[]) }));
  multi.forEach((l, i) => {
    for (const c of l.cells) rows[i].cells[columnOf(cols, c)].push(c.text);
  });
  for (const l of run) {
    if (l.cells.length >= 2) continue;
    let nearest = rows[0];
    for (const r of rows) if (Math.abs(r.top - l.top) < Math.abs(nearest.top - l.top)) nearest = r;
    const col = nearest.cells[columnOf(cols, l.cells[0])];
    if (l.top < nearest.top) col.unshift(l.cells[0].text);
    else col.push(l.cells[0].text);
  }
  return rows.map((r) => r.cells.map((parts) => parts.join(' ').trim()));
}

export function pageToSlide(pieces: PdfTextPiece[], pageHeight: number, index: number, picture?: string): SlideContent {
  const lines = buildLines(pieces, pageHeight);

  // ---- Tables: runs of lines with 2+ cells, at least one with 3+. One-cell lines sandwiched
  // between table rows (a name that wrapped onto two lines) stay in the run.
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
      const closeEnough = !prev || l.top - prev.top < Math.max(prev.size, l.size) * 3;
      if (!closeEnough) break;
      if (l.cells.length >= 2) run.push(l);
      else {
        // A one-cell line right under a row, in the first column, is the rest of a wrapped name.
        const firstColX = Math.min(...run.filter((r) => r.cells.length >= 2).map((r) => r.cells[0].x0));
        const wrapped = l.top - prev.top < l.size * 2.2 && Math.abs(l.cells[0].x0 - firstColX) <= l.size;
        if (!wrapped) break;
        run.push(l);
      }
      j++;
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
    const parts = l.cells.length > 1 && DAY_ONLY.test(l.cells[0].text) ? [l.cells.map((c) => c.text).join(' ')] : l.cells.map((c) => c.text);
    for (const text of parts) {
      const prev = paragraphs[paragraphs.length - 1];
      // A day line that wrapped onto the next line: join it back.
      const continues =
        prev &&
        parts.length === 1 &&
        !ph &&
        !prev.ph &&
        DAY_START.test(prev.text) &&
        !DAY_START.test(text) &&
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
