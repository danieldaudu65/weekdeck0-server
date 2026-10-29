/**
 * Reads an accountant's own PowerPoint (like their monthly "Performance review"
 * deck) into slides WeekDeck can check, edit and restyle: each slide's title,
 * its table, and which branch section it sits in (the section starts at each
 * cover: "FAGBA CONTINENT PERFORMANCE REVIEW", "ABULE-EGBA TERRITORY …").
 *
 * Plain string parsing of the slide XML (like xlsx.ts), so it runs in the
 * browser and in the tests alike.
 */
import JSZip from 'jszip';
import type { DeckSlide } from '../deck';
import { MONTH_NAMES, monthName } from './columns';
import { unescapeXml } from './xlsx';

/** A slide as stored with the accountant's month (see server utils/accounts.js cleanImported). */
export interface ImportedSlide {
  id: string;
  kind: 'cover' | 'table' | 'text' | 'thanks' | 'picture';
  title: string;
  subtitle: string;
  branch: string;
  head: string[];
  rows: string[][];
  /** The table's TOTAL row (empty when the table has none). */
  total: string[];
  /** Other text on the slide (text slides). */
  lines: string[];
  /** Picture slides: a JPEG data URL, and its width / height. */
  image?: string;
  ratio?: number;
}

export interface RawSlide {
  index: number;
  /** Text boxes in reading order (title placeholders first). */
  texts: string[];
  titleText: string;
  tables: string[][][];
  layout: string;
}

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? unescapeXml(m[1]) : null;
};

/** The text of a <p:txBody> / <a:tc>: paragraphs joined by spaces (their titles break lines with spaces). */
function bodyText(xml: string): string {
  const paras: string[] = [];
  for (const p of xml.matchAll(/<a:p>([\s\S]*?)<\/a:p>|<a:p\s[^>]*>([\s\S]*?)<\/a:p>/g)) {
    const inner = p[1] ?? p[2] ?? '';
    let t = '';
    for (const r of inner.matchAll(/<a:t>([\s\S]*?)<\/a:t>|<a:t\s[^>]*>([\s\S]*?)<\/a:t>|<a:br\s*\/>/g)) t += r[0].startsWith('<a:br') ? ' ' : unescapeXml(r[1] ?? r[2] ?? '');
    paras.push(t);
  }
  return paras
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolve(base: string, target: string): string {
  const parts = base.split('/');
  parts.pop();
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

async function rels(zip: JSZip, file: string): Promise<Map<string, string>> {
  const raw = (await zip.file(file.replace(/([^/]+)$/, '_rels/$1.rels'))?.async('string')) ?? '';
  const out = new Map<string, string>();
  for (const m of raw.matchAll(/<Relationship\s[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target && attr(m[0], 'TargetMode') !== 'External') out.set(id, resolve(file, target));
  }
  return out;
}

export class SlideImportError extends Error {}

/** Every slide's text boxes and tables, in the deck's order. */
export async function readDeck(data: ArrayBuffer | Uint8Array): Promise<RawSlide[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new SlideImportError('This file couldn’t be opened. Choose a PowerPoint (.pptx) file.');
  }
  const pres = (await zip.file('ppt/presentation.xml')?.async('string')) ?? '';
  if (!pres) throw new SlideImportError('This isn’t a PowerPoint (.pptx) file.');
  const presRels = await rels(zip, 'ppt/presentation.xml');
  const order = [...pres.matchAll(/<p:sldId\s[^>]*>/g)].map((m) => presRels.get(attr(m[0], 'r:id') ?? '')).filter((x): x is string => Boolean(x));

  const slides: RawSlide[] = [];
  for (const [index, path] of order.entries()) {
    const xml = (await zip.file(path)?.async('string')) ?? '';
    const slideRels = await rels(zip, path);
    const layoutPath = [...slideRels.values()].find((p) => /slideLayouts\//.test(p));
    const layoutXml = layoutPath ? ((await zip.file(layoutPath)?.async('string')) ?? '') : '';
    const layout = /<p:cSld\s[^>]*name="([^"]*)"/.exec(layoutXml)?.[1] ?? '';

    // Tables first (and taken out, so their text isn't read twice).
    const tables: string[][][] = [];
    const rest = xml.replace(/<a:tbl>[\s\S]*?<\/a:tbl>/g, (tbl) => {
      const rows: string[][] = [];
      for (const tr of tbl.matchAll(/<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/g)) {
        const cells: string[] = [];
        // Empty cells may be written <a:tc …/>: match those first, or a cell would swallow its neighbour.
        for (const tc of tr[1].matchAll(/<a:tc\b([^>]*?)\/>|<a:tc\b([^>]*)>([\s\S]*?)<\/a:tc>/g)) {
          // Cells merged into the one before them (hMerge / vMerge) carry no text of their own.
          cells.push(bodyText(tc[3] ?? ''));
        }
        rows.push(cells);
      }
      tables.push(rows);
      return '';
    });

    const texts: string[] = [];
    let titleText = '';
    for (const sp of rest.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>|<p:sp\s[^>]*>([\s\S]*?)<\/p:sp>/g)) {
      const inner = sp[1] ?? sp[2] ?? '';
      const body = /<p:txBody>([\s\S]*?)<\/p:txBody>/.exec(inner)?.[1];
      if (!body) continue;
      const t = bodyText(body);
      if (!t) continue;
      const ph = /<p:ph\b([^>]*)\/?>/.exec(inner)?.[1] ?? '';
      if (!titleText && /type="(title|ctrTitle)"/.test(ph)) titleText = t;
      else texts.push(t);
    }
    if (!titleText && texts.length) titleText = texts.shift()!;
    slides.push({ index, texts, titleText, tables, layout });
  }
  if (!slides.length) throw new SlideImportError('No slides found in this file.');
  return slides;
}

/* ------------------------------------------------------------------ into slides */

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const isTotalRow = (r: string[]) => /^\s*(GRAND\s+)?TOTALS?\s*$/i.test(r[0] ?? '');
const emptyRow = (r: string[]) => r.every((c) => !clean(c));
/** "OTHERS" written alone in a row, as a sub-heading. */
const labelRow = (r: string[]) => clean(r[0] ?? '') !== '' && r.slice(1).every((c) => !clean(c));

/**
 * "FAGBA CONTINENT PERFORMANCE REVIEW" → "FAGBA", "ABULE-EGBA TERRITORY …" →
 * "ABULE EGBA". Known branch names (from the workbook) win when they fit.
 */
export function branchFromCover(title: string, known: string[]): string {
  const squash = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '');
  const t = squash(title);
  const hit = [...known].sort((a, b) => b.length - a.length).find((b) => squash(b) && t.includes(squash(b)));
  if (hit) return hit.toUpperCase();
  return clean(
    title
      .toUpperCase()
      .replace(/-/g, ' ')
      .replace(/\b(CONTINENT|TERRITORY|REGION|BRANCH|PERFORMANCE|REVIEW|MONTHLY|REPORT|FOR|THE|OF)\b.*$/, ''),
  );
}

/** "… FOR SEPTEMBER, 2026." → "2026-09" */
export function monthInText(text: string): string | null {
  const up = text.toUpperCase();
  for (let i = 0; i < 12; i++) {
    const name = MONTH_NAMES[i].toUpperCase();
    const m = new RegExp(`\\b${name}\\b[ ,.]*((?:19|20)\\d{2})?`).exec(up);
    if (m) {
      const y = m[1] ?? /\b(20\d{2})\b/.exec(up)?.[1];
      if (y) return `${y}-${String(i + 1).padStart(2, '0')}`;
    }
  }
  return null;
}

let n = 0;
export const newId = () => `s${Date.now().toString(36)}${(n++).toString(36)}`;

/** Raw slides → editable slides, with branch sections from the covers. */
export function toImported(raw: RawSlide[], knownBranches: string[]): ImportedSlide[] {
  let branch = '';
  const out: ImportedSlide[] = [];
  for (const s of raw) {
    const title = clean(s.titleText);
    const base = { id: newId(), title, subtitle: '', branch, head: [] as string[], rows: [] as string[][], total: [] as string[], lines: [] as string[] };
    const table = s.tables.sort((a, b) => b.length - a.length)[0];
    if (!table && /^THANK/i.test(title)) {
      out.push({ ...base, kind: 'thanks', subtitle: s.texts.join(' · ') });
      continue;
    }
    if (!table && (/title slide/i.test(s.layout) || /PERFORMANCE|REVIEW|REPORT/i.test(title))) {
      branch = branchFromCover(title, knownBranches) || branch;
      out.push({ ...base, kind: 'cover', branch, subtitle: clean(s.texts.join(' ').replace(/\s*\|\s*/g, ' ')) });
      continue;
    }
    if (!table) {
      out.push({ ...base, kind: 'text', lines: s.texts.map(clean).filter(Boolean) });
      continue;
    }
    // No cover slides (Word, Excel, some PDFs): a title that starts with a branch starts its section.
    const squashed = title.toUpperCase().replace(/[^A-Z]/g, '');
    const named = [...knownBranches].sort((a, b) => b.length - a.length).find((b) => b && squashed.startsWith(b.toUpperCase().replace(/[^A-Z]/g, '')));
    if (named) {
      branch = named.toUpperCase();
      base.branch = branch;
    }
    const rows = table.map((r) => r.map(clean)).filter((r) => !emptyRow(r));
    const head = rows.shift() ?? [];
    const width = Math.max(head.length, ...rows.map((r) => r.length));
    const pad = (r: string[]) => [...r, ...Array(Math.max(0, width - r.length)).fill('')];
    const totalAt = rows.findIndex(isTotalRow);
    const total = totalAt >= 0 ? pad(rows[totalAt]) : [];
    // A month table keeps its empty months (OCTOBER, NOVEMBER … still to come).
    const keepLabels = /^MONTHS?$/i.test(head[0] ?? '');
    const body = rows.filter((r, i) => i !== totalAt && (keepLabels || !labelRow(r))).map(pad);
    out.push({ ...base, kind: 'table', head: pad(head), rows: body, total, subtitle: s.texts.filter((t) => t !== title).join(' · ') });
  }
  return out;
}

/** The month most slide titles talk about. */
export function deckMonth(slides: ImportedSlide[]): string | null {
  const count = new Map<string, number>();
  for (const s of slides) {
    if (/JAN(UARY)?\s*-\s*DEC/i.test(s.title)) continue; // the year table names no single month
    const m = monthInText(`${s.title} ${s.subtitle}`);
    if (m) count.set(m, (count.get(m) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** An imported slide as a deck slide (so the 96 looks, PowerPoint, PDF and Present all work on it). */
export function toDeckSlide(s: ImportedSlide, ctx: { region: string; month: string }): DeckSlide {
  if (s.kind === 'cover') {
    return { kind: 'cover', title: s.title, kicker: 'MONTHLY REVIEW', badge: monthName(ctx.month), week: s.subtitle || `For the month of ${monthName(ctx.month)}`, weekNo: Number(ctx.month.slice(5)), range: monthName(ctx.month), team: s.branch, name: ctx.region, role: 'Accounts', image: '' };
  }
  if (s.kind === 'thanks') return { kind: 'thanks', title: s.title || 'Thank you', sub: s.subtitle || ctx.region };
  if (s.kind === 'picture') return { kind: 'picture', title: s.title, subtitle: s.subtitle, image: s.image ?? '', ratio: s.ratio ?? 16 / 9 };
  if (s.kind === 'text') return { kind: 'activities', title: s.title, subtitle: s.subtitle, items: s.lines.slice(0, 6).map((text) => ({ day: '', text })) };
  // Tables always get a bottom row: their TOTAL, or (a one-row summary table) that row in bold.
  const oneRow = !s.total.length && s.rows.length === 1;
  return {
    kind: 'table',
    title: s.title,
    subtitle: s.subtitle,
    table: { head: s.head, rows: oneRow ? [] : s.rows, total: s.total.length ? s.total : oneRow ? s.rows[0] : s.head.map(() => '') },
  };
}
