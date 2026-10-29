/**
 * Slides from files that aren't PowerPoints: LibreOffice Impress (.odp),
 * Word (.docx: each table becomes a slide), Excel / CSV (each sheet becomes a
 * table slide) and PDF pages (already read into text and tables by
 * pdfLayout.ts). All turn into the same RawSlide a PowerPoint gives, so the
 * checks, editing and looks work the same. Plain string parsing: tested in Node.
 */
import JSZip from 'jszip';
import type { SlideContent } from '../importAnalyze';
import type { PdfTextPiece } from '../pdfLayout';
import { SlideImportError, type RawSlide } from './slideImport';
import { unescapeXml, type Cell, type SheetData } from './xlsx';

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------------ .odp */

/** Text inside an ODF element: spans flattened, <text:s/> and line breaks as spaces. */
function odfText(xml: string): string {
  const paras = [...xml.matchAll(/<text:(p|h)\b[^>]*>([\s\S]*?)<\/text:\1>|<text:(p|h)\b[^>]*\/>/g)].map((m) =>
    unescapeXml(
      (m[2] ?? '')
        .replace(/<text:s\b[^>]*?(?:text:c="(\d+)")?[^>]*\/>/g, (_, c) => ' '.repeat(Number(c) || 1))
        .replace(/<text:(line-break|tab)\b[^>]*\/>/g, ' ')
        .replace(/<[^>]+>/g, ''),
    ),
  );
  return squash(paras.join(' '));
}

export async function readOdp(data: ArrayBuffer | Uint8Array): Promise<RawSlide[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new SlideImportError('This file couldn’t be opened. Is it a real .odp presentation?');
  }
  const content = (await zip.file('content.xml')?.async('string')) ?? '';
  const pages = [...content.matchAll(/<draw:page\b[^>]*>([\s\S]*?)<\/draw:page>/g)];
  if (!pages.length) throw new SlideImportError('No slides found in this .odp file.');
  return pages.map((p, index) => {
    const tables: string[][][] = [];
    const rest = p[1].replace(/<table:table\b[\s\S]*?<\/table:table>/g, (tbl) => {
      const rows = [...tbl.matchAll(/<table:table-row\b[^>]*>([\s\S]*?)<\/table:table-row>/g)].map((r) =>
        // Empty cells are written <table:table-cell …/>: match those first, or a cell would swallow its neighbour.
        [...r[1].matchAll(/<table:(?:covered-)?table-cell\b([^>]*?)\/>|<table:(?:covered-)?table-cell\b([^>]*)>([\s\S]*?)<\/table:(?:covered-)?table-cell>/g)].flatMap((c) => {
          const repeat = Math.min(20, Number(/table:number-columns-repeated="(\d+)"/.exec(c[1] ?? c[2] ?? '')?.[1] ?? 1));
          return Array(repeat).fill(odfText(c[3] ?? ''));
        }),
      );
      tables.push(rows);
      return '';
    });
    let titleText = '';
    const texts: string[] = [];
    for (const f of rest.matchAll(/<draw:frame\b([^>]*)>([\s\S]*?)<\/draw:frame>/g)) {
      if (/presentation:class="notes"/.test(f[1])) continue;
      const t = odfText(f[2]);
      if (!t) continue;
      if (!titleText && /presentation:class="title"/.test(f[1])) titleText = t;
      else texts.push(t);
    }
    if (!titleText && texts.length) titleText = texts.shift()!;
    const layout = /presentation:presentation-page-layout-name="([^"]*)"/.exec(p[0])?.[1] ?? '';
    return { index, texts, titleText, tables, layout: /title/i.test(layout) && !tables.length ? 'Title Slide' : '' };
  });
}

/* ------------------------------------------------------------------ .docx */

function wordText(xml: string): string {
  let out = '';
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(tab|br)\b[^>]*\/>/g)) out += m[2] ? ' ' : unescapeXml(m[1] ?? '');
  return squash(out);
}

/** Each table becomes a slide; the paragraph just above it is its title. */
export async function readDocx(data: ArrayBuffer | Uint8Array): Promise<RawSlide[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new SlideImportError('This file couldn’t be opened. Is it a real Word (.docx) file?');
  }
  const doc = (await zip.file('word/document.xml')?.async('string')) ?? '';
  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(doc)?.[1] ?? '';
  const slides: RawSlide[] = [];
  let paras: string[] = [];
  for (const m of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p\b[\s\S]*?<\/w:p>/g)) {
    if (m[0].startsWith('<w:tbl>')) {
      const rows = [...m[0].matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)].map((r) => [...r[1].matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)].map((c) => wordText(c[1])));
      const titleText = paras.pop() ?? '';
      slides.push({ index: slides.length, texts: paras.slice(-3), titleText, tables: [rows], layout: '' });
      paras = [];
    } else {
      const t = wordText(m[0]);
      if (t) paras.push(t);
    }
  }
  if (!slides.length) {
    if (!paras.length) throw new SlideImportError('This Word file has no text to read.');
    slides.push({ index: 0, titleText: paras[0], texts: paras.slice(1, 13), tables: [], layout: '' });
  }
  return slides;
}

/* ------------------------------------------------------------------ Excel / CSV */

const fmt2 = new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cellText = (c: Cell) => (c === null || c === undefined ? '' : typeof c === 'number' ? (Number.isInteger(c) && Math.abs(c) < 1000 ? String(c) : fmt2.format(c)) : squash(String(c)));

/**
 * Each sheet becomes a table slide. A first row with a single cell is the
 * title; otherwise the sheet's name is. Their payment sheets don't belong here
 * (they go into the Workbook) and are refused with a note.
 */
export function sheetsToSlides(sheets: SheetData[]): { slides: RawSlide[]; notes: string[] } {
  const slides: RawSlide[] = [];
  const notes: string[] = [];
  for (const sh of sheets) {
    let rows = sh.rows.map((r) => (r ?? []).map(cellText)).filter((r) => r.some(Boolean));
    if (!rows.length) continue;
    if (rows.slice(0, 4).some((r) => r.some((c) => /NAME AS ON ALERT/i.test(c)))) {
      notes.push(`“${sh.name}” is a payments sheet: import it in the Workbook (Import files), not as slides.`);
      continue;
    }
    // Drop columns that are empty all the way down.
    const width = Math.max(...rows.map((r) => r.length));
    const used = Array.from({ length: width }, (_, c) => rows.some((r) => r[c]));
    rows = rows.map((r) => r.filter((_, c) => used[c]));
    let titleText = sh.name;
    if (rows[0].filter(Boolean).length === 1 && rows.length > 1) titleText = rows.shift()!.find(Boolean)!;
    if (rows.length > 61) {
      notes.push(`“${sh.name}” has ${rows.length - 1} rows: only the first 60 fit on a slide.`);
      rows = rows.slice(0, 61);
    }
    slides.push({ index: slides.length, titleText, texts: [], tables: [rows], layout: '' });
  }
  return { slides, notes };
}

/* ------------------------------------------------------------------ PDF pages */

const HEADER_WORD = /\b(MARKETERS?|NAME|DESIGNATION|INFLOW|INFRAS?|TOTAL|NC|MONTH|LAND|BUILDING|FEES|AMOUNT|CLIENTS?|STATUS|COMMISSION)\b/i;
const NUMERIC = /^[-–—]$|^[₦]?-?[\d,]+(\.\d+)?%?$/;
const MONTH_WORDS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const KNOWN_HEADERS = ['MARKETERS NAME', 'DESIGNATION', 'INFLOW', 'INFRAS', 'TOTAL', 'NC', 'MONTH', 'LAND & BUILDING', 'INFRA & OTHER FEES'];

interface PdfLine {
  y: number;
  size: number;
  pieces: PdfTextPiece[];
}

/**
 * The table on an accountant's PDF page, read from the text positions.
 * A row is the line that holds its figures; a name that wraps onto two lines
 * sits just above it (cells may be top-, middle- or bottom-aligned). The
 * header is the line(s) with MARKETERS NAME / INFLOW / TOTAL / MONTH … words.
 * Returns null when the page doesn't look like that (then pdfLayout's reading is used).
 */
export function pdfTable(all: PdfTextPiece[]): { title: string; texts: string[]; table: string[][] } | null {
  const pieces = all.filter((p) => p.str.trim());
  if (pieces.length < 6) return null;
  // Lines: pieces whose baselines are within a third of the text size.
  const lines: PdfLine[] = [];
  for (const p of [...pieces].sort((a, b) => b.y - a.y)) {
    const line = lines.find((l) => Math.abs(l.y - p.y) <= Math.max(2, 0.35 * Math.max(l.size, p.size)));
    if (line) {
      line.pieces.push(p);
      line.size = Math.max(line.size, p.size);
    } else lines.push({ y: p.y, size: p.size, pieces: [p] });
  }
  lines.sort((a, b) => b.y - a.y);
  for (const l of lines) l.pieces.sort((a, b) => a.x - b.x);

  // Title: the biggest text at the top.
  const maxSize = Math.max(...lines.map((l) => l.size));
  let i = 0;
  const titleLines: string[] = [];
  while (i < lines.length && lines[i].size >= maxSize * 0.9) titleLines.push(squash(lines[i++].pieces.map((p) => p.str).join(' ')));

  const isNum = (s: string) => NUMERIC.test(s.trim());
  const headerAt = lines.findIndex((l, k) => k >= i && l.pieces.filter((p) => HEADER_WORD.test(p.str)).length >= 3);
  if (headerAt < 0) return null;
  // Columns: the header line's words (merged when they touch), as x ranges.
  const cols: { l: number; r: number }[] = [];
  for (const p of lines[headerAt].pieces) {
    const last = cols[cols.length - 1];
    if (last && p.x - last.r < Math.max(6, p.size * 0.5)) last.r = Math.max(last.r, p.x + p.w);
    else cols.push({ l: p.x, r: p.x + p.w });
  }
  if (cols.length < 3) return null;
  const colOf = (p: PdfTextPiece) => {
    const c = p.x + p.w / 2;
    let best = 0;
    let bestD = Infinity;
    cols.forEach((col, k) => {
      const d = c < col.l ? col.l - c : c > col.r ? c - col.r : 0;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    return best;
  };
  const cellsOf = (ls: PdfLine[]) => {
    const out: string[][] = cols.map(() => []);
    for (const l of ls) for (const p of l.pieces) out[colOf(p)].push(p.str.trim());
    return out;
  };

  // Header: the header line plus header words just above it (wrapped headings like "DESIGNATI" / "ON").
  let top = headerAt;
  while (top - 1 >= i && lines[top - 1].y - lines[top].y <= 2.2 * lines[top].size && !lines[top - 1].pieces.some((p) => isNum(p.str))) top--;
  const headParts = cellsOf(lines.slice(top, headerAt + 1));
  const head = headParts.map((parts) => {
    const joined = parts.join('');
    const known = KNOWN_HEADERS.find((h) => h.replace(/\W/g, '') === joined.replace(/\W/g, '').toUpperCase());
    return known ?? squash(parts.join(' '));
  });

  // Body: a row = a line with figures in two or more columns, plus the name lines just above it.
  const rows: string[][] = [];
  let pending: PdfLine[] = [];
  for (const l of lines.slice(headerAt + 1)) {
    const filled = new Set(l.pieces.map(colOf));
    const firstText = squash(l.pieces.filter((p) => colOf(p) === 0).map((p) => p.str).join(' ')).toUpperCase();
    const monthRow = /^MONTHS?$/i.test(head[0] ?? '') && MONTH_WORDS.includes(firstText);
    const anchor = monthRow || (filled.size >= 2 && l.pieces.some((p) => colOf(p) > 0 && isNum(p.str)));
    if (!anchor) {
      pending.push(l);
      continue;
    }
    // Keep only the lines that hang together just above this one (not a stray label like "OTHERS").
    const kept: PdfLine[] = [];
    let below = l;
    for (const q of [...pending].reverse()) {
      if (q.y - below.y > 1.6 * Math.max(q.size, below.size)) break;
      kept.unshift(q);
      below = q;
    }
    rows.push(cellsOf([...kept, l]).map((parts) => squash(parts.join(' '))));
    pending = [];
  }
  if (rows.length < 1) return null;
  const texts = lines.slice(i, top).map((l) => squash(l.pieces.map((p) => p.str).join(' ')));
  return { title: squash(titleLines.join(' ')), texts, table: [head, ...rows] };
}

/** A PDF page as a RawSlide: the accountant-table reading when it fits, else pdfLayout's paragraphs and tables. */
export function pdfPageToRaw(page: SlideContent, index: number, pieces: PdfTextPiece[] = []): RawSlide {
  const t = pdfTable(pieces);
  if (t && t.title) return { index, titleText: t.title, texts: t.texts, tables: [t.table], layout: '' };
  const paras = page.paragraphs.map((p) => ({ ...p, text: squash(p.text) })).filter((p) => p.text);
  // A title over two lines ("FAGBA CONTINENT" / "PERFORMANCE REVIEW") is one title.
  let title = paras.find((p) => p.ph === 'title' || p.ph === 'ctrTitle') ?? paras[0];
  let rest = paras.filter((p) => p !== title);
  if (title) {
    let text = title.text;
    while (rest.length && !/\b(19|20)\d{2}\b/.test(text) && !/^FOR\b/i.test(rest[0].text) && rest[0].text === rest[0].text.toUpperCase() && rest[0].text.length < 70 && !/\d/.test(rest[0].text.replace(/(19|20)\d{2}/, ''))) {
      text = `${text} ${rest[0].text}`;
      rest = rest.slice(1);
    }
    title = { ...title, text };
  }
  return { index, titleText: title?.text ?? '', texts: rest.map((p) => p.text), tables: page.tables, layout: '' };
}
