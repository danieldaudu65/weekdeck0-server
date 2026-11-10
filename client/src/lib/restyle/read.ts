/**
 * "Restyle a deck": reads anyone's slides (PowerPoint, PDF, pictures), not just
 * WeekDeck's, into slides any look can draw:
 *
 *   first slide            → cover (title, subtitle, its picture)
 *   "Thank you" / a title  → big-title slide
 *   a table / a chart      → table (a chart's figures become its rows)
 *   text                   → bullet points (sub-points kept), with the slide's main picture
 *   a picture only         → picture slide
 *   PDF pages that are scans, photos or charts → the page itself as a picture
 *
 * PowerPoint is read as plain XML (runs in the browser and in the tests). Pictures
 * come back as bytes; the browser shrinks them (see images.ts).
 */
import JSZip from 'jszip';
import type { DeckSlide } from '../deck';

export interface RestyleSlide {
  id: string;
  hidden: boolean;
  slide: DeckSlide;
  /** The page as it was (PDF pages with pictures or charts), to show instead. */
  original?: string;
  originalRatio?: number;
  /**
   * The picture the uploaded slide had, placed into the new design. Kept here so
   * "Pictures from the file" can take it out and put it back.
   */
  filePicture?: string;
  filePictureRatio?: number;
}

export interface ReadDeck {
  title: string;
  slides: RestyleSlide[];
  /** Pictures by key ("media:ppt/media/image3.png"), still to be shrunk into the slides. */
  media: Map<string, { bytes: Uint8Array; type: string }>;
  notes: string[];
}

export class RestyleError extends Error {}

let n = 0;
export const slideId = () => `d${Date.now().toString(36)}${(n++).toString(36)}`;

const unescape = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? unescape(m[1]) : null;
};
/** A chart's labels read as text (axis numbers, month names): not points worth showing. */
export const looksLikeChart = (texts: string[]) => texts.length >= 5 && texts.filter((t) => /^[\d.,%₦$€£\s()-]+$/.test(t.trim()) || t.trim().length <= 3).length >= texts.length * 0.5;
const squash = (s: string) => s.replace(/[ \t ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

function resolve(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
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

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff' };

/* ------------------------------------------------------------------ PowerPoint */

interface Para {
  text: string;
  level: number;
}
interface Box {
  ph: string;
  paras: Para[];
  /** Largest font size in the box (points), 0 when the slide doesn't say. */
  size: number;
}
interface Pic {
  key: string;
  area: number;
}
interface RawPptSlide {
  boxes: Box[];
  tables: string[][][];
  pics: Pic[];
  layout: string;
}

/** A point as typed: a bullet character someone typed in ("• ", "– ") is taken off; a dash or hollow bullet makes it a sub-point. */
export function point(raw: string, level = 0): Para | null {
  let text = squash(raw);
  const m = /^([•▪●○■◦\*✓✔►▶➢➤→·–—-])\s+/.exec(text);
  if (m) {
    text = text.slice(m[0].length).trim();
    if (/[○◦–—-]/.test(m[1])) level = 1;
  }
  return text ? { text, level } : null;
}

function paragraphs(body: string): Para[] {
  const out: Para[] = [];
  for (const p of body.matchAll(/<a:p>([\s\S]*?)<\/a:p>|<a:p\s[^>]*>([\s\S]*?)<\/a:p>/g)) {
    const inner = p[1] ?? p[2] ?? '';
    let t = '';
    for (const r of inner.matchAll(/<a:t>([\s\S]*?)<\/a:t>|<a:t\s[^>]*>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/>/g)) t += r[0].startsWith('<a:br') ? '\n' : unescape(r[1] ?? r[2] ?? '');
    const lvl = Number(/<a:pPr\b[^>]*\slvl="(\d)"/.exec(inner)?.[1] ?? 0);
    const pt = point(t, lvl > 0 ? 1 : 0);
    if (pt) out.push(pt);
  }
  return out;
}

function tableRows(tbl: string): string[][] {
  const rows: string[][] = [];
  for (const tr of tbl.matchAll(/<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/g)) {
    const cells: string[] = [];
    for (const tc of tr[1].matchAll(/<a:tc\b([^>]*?)\/>|<a:tc\b([^>]*)>([\s\S]*?)<\/a:tc>/g))
      cells.push(
        paragraphs(tc[3] ?? '')
          .map((p) => p.text)
          .join(' '),
      );
    if (cells.some((c) => c.trim())) rows.push(cells);
  }
  return rows;
}

/** A chart's figures as a table: categories down, one column per series. */
function chartTable(xml: string): string[][] | null {
  const series = [...xml.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)].map((m) => m[1]);
  if (!series.length) return null;
  const pts = (block: string | undefined) => {
    const out: string[] = [];
    for (const p of (block ?? '').matchAll(/<c:pt\s[^>]*idx="(\d+)"[^>]*>\s*<c:v>([\s\S]*?)<\/c:v>/g)) out[Number(p[1])] = unescape(p[2]);
    return out;
  };
  const cats = pts(/<c:cat>([\s\S]*?)<\/c:cat>/.exec(series[0])?.[1]);
  const names = series.map((s, i) => unescape(/<c:tx>[\s\S]*?<c:v>([\s\S]*?)<\/c:v>/.exec(s)?.[1] ?? `Series ${i + 1}`));
  const vals = series.map((s) => pts(/<c:val>([\s\S]*?)<\/c:val>/.exec(s)?.[1]));
  const len = Math.max(cats.length, ...vals.map((v) => v.length));
  if (!len) return null;
  const fmt = (v: string | undefined) => {
    if (v === undefined || v === '') return '-';
    const x = Number(v);
    return Number.isFinite(x) ? x.toLocaleString('en-US', { maximumFractionDigits: 2 }) : v;
  };
  const rows = Array.from({ length: len }, (_, i) => [cats[i] ?? String(i + 1), ...vals.map((v) => fmt(v[i]))]);
  return [['', ...names], ...rows];
}

export async function readPptxDeck(data: ArrayBuffer | Uint8Array, fileName: string): Promise<ReadDeck> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new RestyleError('This file couldn’t be opened. Choose a PowerPoint (.pptx) or PDF file.');
  }
  const pres = (await zip.file('ppt/presentation.xml')?.async('string')) ?? '';
  if (!pres) throw new RestyleError('This isn’t a PowerPoint (.pptx) file.');
  const size = /<p:sldSz\s[^>]*>/.exec(pres)?.[0] ?? '';
  const slideArea = Number(attr(size, 'cx') ?? 12192000) * Number(attr(size, 'cy') ?? 6858000);
  const presRels = await rels(zip, 'ppt/presentation.xml');
  const order = [...pres.matchAll(/<p:sldId\s[^>]*>/g)].map((m) => presRels.get(attr(m[0], 'r:id') ?? '')).filter((x): x is string => Boolean(x));
  const media: ReadDeck['media'] = new Map();
  const notes: string[] = [];
  let charts = 0;

  const raws: RawPptSlide[] = [];
  for (const path of order.slice(0, 80)) {
    const xml = (await zip.file(path)?.async('string')) ?? '';
    // Hidden slides stay hidden.
    if (/<p:sld\b[^>]*\sshow="0"/.test(xml)) continue;
    const r = await rels(zip, path);
    const layoutPath = [...r.values()].find((p) => /slideLayouts\//.test(p));
    const layoutXml = layoutPath ? ((await zip.file(layoutPath)?.async('string')) ?? '') : '';
    const layout = /<p:cSld\s[^>]*name="([^"]*)"/.exec(layoutXml)?.[1] ?? '';

    const tables: string[][][] = [];
    const pics: Pic[] = [];
    const boxes: Box[] = [];
    const addPic = (embed: string | null, block: string) => {
      const target = embed ? r.get(embed) : undefined;
      const ext = target?.split('.').pop()?.toLowerCase() ?? '';
      if (!target || !MIME[ext]) return;
      const e = /<a:ext\s[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(block);
      const area = e ? (Number(e[1]) * Number(e[2])) / slideArea : 0.2;
      // A crop made in PowerPoint (a:srcRect, in 1/1000 of a percent from each side).
      const sr = /<a:srcRect\b([^>]*)\/?>/.exec(block)?.[1] ?? '';
      const side = (k: string) => Math.max(0, Math.min(90_000, Number(new RegExp(`\\s${k}="(-?\\d+)"`).exec(sr)?.[1] ?? 0))) / 100_000;
      const crop = [side('l'), side('t'), side('r'), side('b')];
      const cut = crop.some((c) => c > 0) && crop[0] + crop[2] < 0.95 && crop[1] + crop[3] < 0.95;
      pics.push({ key: `media:${target}${cut ? `#crop=${crop.map((c) => c.toFixed(4)).join(',')}` : ''}`, area });
    };
    let rest = xml;
    // Tables, charts and SmartArt (graphic frames) first, then taken out.
    rest = rest.replace(/<p:graphicFrame\b[\s\S]*?<\/p:graphicFrame>/g, (gf) => {
      const tbl = /<a:tbl>[\s\S]*?<\/a:tbl>/.exec(gf)?.[0];
      if (tbl) {
        const rows = tableRows(tbl);
        if (rows.length) tables.push(rows);
        return '';
      }
      const chartId = /<c:chart\b[^>]*\sr:id="([^"]+)"/.exec(gf)?.[1];
      if (chartId) {
        tables.push([['__chart__', chartId]]);
        return '';
      }
      const dm = /<dgm:relIds\b[^>]*\sr:dm="([^"]+)"/.exec(gf)?.[1];
      if (dm) boxes.push({ ph: '__smartart__', paras: [{ text: dm, level: 0 }], size: 0 });
      return '';
    });
    for (const pic of rest.matchAll(/<p:pic>([\s\S]*?)<\/p:pic>|<p:pic\s[^>]*>([\s\S]*?)<\/p:pic>/g)) {
      const inner = pic[1] ?? pic[2] ?? '';
      addPic(/<a:blip\b[^>]*\sr:embed="([^"]+)"/.exec(inner)?.[1] ?? null, inner);
    }
    rest = rest.replace(/<p:pic\b[\s\S]*?<\/p:pic>/g, '');
    for (const sp of rest.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>|<p:sp\s[^>]*>([\s\S]*?)<\/p:sp>/g)) {
      const inner = sp[1] ?? sp[2] ?? '';
      // A shape filled with a picture (picture placeholders).
      const blip = /<a:blipFill\b[\s\S]*?<a:blip\b[^>]*\sr:embed="([^"]+)"/.exec(inner)?.[1];
      if (blip) addPic(blip, inner);
      const body = /<p:txBody>([\s\S]*?)<\/p:txBody>/.exec(inner)?.[1];
      if (!body) continue;
      const ph = attr(/<p:ph\b[^>]*\/?>/.exec(inner)?.[0] ?? '', 'type') ?? (/<p:ph\b/.test(inner) ? 'body' : '');
      if (/^(sldNum|ftr|dt|hdr)$/.test(ph)) continue;
      const paras = paragraphs(body);
      if (!paras.length) continue;
      const sizes = [...body.matchAll(/<a:(?:rPr|defRPr|endParaRPr)\b[^>]*\ssz="(\d+)"/g)].map((m) => Number(m[1]) / 100);
      boxes.push({ ph, paras, size: sizes.length ? Math.max(...sizes) : 0 });
    }
    // Charts → tables; SmartArt → its text.
    for (const [i, t] of tables.entries()) {
      if (t[0]?.[0] !== '__chart__') continue;
      const target = r.get(t[0][1]);
      const cx = target ? ((await zip.file(target)?.async('string')) ?? '') : '';
      const ct = cx ? chartTable(cx) : null;
      if (ct) charts++;
      tables[i] = ct ?? [];
    }
    for (const b of boxes) {
      if (b.ph !== '__smartart__') continue;
      const target = r.get(b.paras[0].text);
      const dx = target ? ((await zip.file(target)?.async('string')) ?? '') : '';
      b.ph = 'body';
      b.paras = [...dx.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => ({ text: squash(unescape(m[1])), level: 0 })).filter((p) => p.text);
    }
    raws.push({ boxes: boxes.filter((b) => b.paras.length), tables: tables.filter((t) => t.length), pics, layout });
  }
  if (!raws.length) throw new RestyleError('No slides found in this file.');
  if (charts) notes.push(`${charts} chart${charts === 1 ? '' : 's'} turned into table${charts === 1 ? '' : 's'}`);

  // The pictures the slides use (one per slide: its biggest that isn't a small logo).
  const slides: RestyleSlide[] = [];
  for (const [i, raw] of raws.entries()) {
    const pic = raw.pics.filter((p) => p.area >= 0.04).sort((a, b) => b.area - a.area)[0];
    if (pic && !media.has(pic.key)) {
      const path = pic.key.slice(6).split('#')[0];
      const bytes = await zip.file(path)?.async('uint8array');
      if (bytes) media.set(pic.key, { bytes, type: MIME[path.split('.').pop()!.toLowerCase()] });
    }
    const s = fromPptSlide(raw, i, raws.length, pic && media.has(pic.key) ? pic.key : '');
    if (s) slides.push({ id: slideId(), hidden: false, slide: s });
  }
  const title = (slides[0]?.slide.kind === 'cover' ? slides[0].slide.title : '') || fileName.replace(/\.[a-z0-9]+$/i, '');
  return { title, slides, media, notes };
}

function fromPptSlide(raw: RawPptSlide, index: number, count: number, image: string): DeckSlide | null {
  const boxes = [...raw.boxes];
  // The title: the title placeholder, else the biggest short text.
  let titleBox = boxes.find((b) => b.ph === 'title' || b.ph === 'ctrTitle');
  if (!titleBox) {
    const short = boxes.filter((b) => b.paras.map((p) => p.text).join(' ').length <= 140);
    titleBox = [...short].sort((a, b) => b.size - a.size)[0] ?? undefined;
    if (titleBox && short.length > 1 && titleBox.size && titleBox.size === short.find((b) => b !== titleBox)?.size) titleBox = short[0];
  }
  let title = titleBox ? titleBox.paras.map((p) => p.text).join(' ') : '';
  let others = boxes.filter((b) => b !== titleBox);
  // "Presented by FAGBA REGION" is who's presenting, not the title: the longest other text is.
  if (/^presented\s+by\b/i.test(title) && others.length) {
    const real = [...others].sort((a, b) => b.paras.map((p) => p.text).join(' ').length - a.paras.map((p) => p.text).join(' ').length)[0];
    const presenter = { ph: 'body', paras: [{ text: title.replace(/\s+/g, ' '), level: 0 }], size: 0 };
    title = real.paras.map((p) => p.text).join(' ');
    others = [...others.filter((b) => b !== real), presenter];
  }
  const subBox = others.find((b) => b.ph === 'subTitle');
  // One or two stray letters (bits of a picture caption) aren't points.
  const points = others.filter((b) => b !== subBox).flatMap((b) => b.paras).filter((p) => p.text.length > 2 || /\d/.test(p.text));
  const subtitle = subBox ? subBox.paras.map((p) => p.text).join(' ') : '';
  const table = raw.tables[0];

  const isCoverLayout = /title slide|section header|^title$/i.test(raw.layout) || Boolean(boxes.find((b) => b.ph === 'ctrTitle'));
  // The first slide, and section covers later on (a title-slide layout with little text).
  if (!table && points.length <= 3 && (index === 0 || isCoverLayout) && !/^(thank|thanks)\b/i.test(title)) {
    const parts = [...(subBox?.paras.map((p) => p.text) ?? []), ...points.map((p) => p.text)].flatMap((l) => l.split('\n')).map((l) => l.trim()).filter(Boolean);
    // "FOR THE MONTH OF" / "SEPTEMBER, 2026" is one line that wrapped.
    const lines: string[] = [];
    for (const l of parts) {
      if (lines.length && /(\b(of|for|the|and|to|in|on|at|by|&)|[,:\-–])$/i.test(lines[lines.length - 1])) lines[lines.length - 1] += ` ${l}`;
      else lines.push(l);
    }
    // A title-slide layout later on with sentences under the title is really a slide of points.
    if (index > 0 && lines.slice(1).some((l) => l.length > 60)) return { kind: 'bullets', title, subtitle: lines[0] ?? '', points: lines.slice(1).map((text) => ({ text, level: 0 })), image, ratio: 0 };
    return { kind: 'cover', title: title || 'Presentation', week: lines[0] ?? '', weekNo: 0, range: '', team: '', name: lines[1] ?? '', role: lines[2] ?? '', image, kicker: '', badge: '' };
  }
  if (/^(thank|thanks|questions|q\s*&\s*a|the end)\b/i.test(title) && !table && points.length <= 3 && index >= count - 3) {
    return { kind: 'thanks', title, sub: [subtitle, ...points.map((p) => p.text)].filter(Boolean).join(' · ') };
  }
  if (table) {
    const rows = table.map((r) => r.map((c) => c.replace(/\s+/g, ' ').trim()));
    const width = Math.max(...rows.map((r) => r.length));
    const pad = rows.map((r) => [...r, ...Array(width - r.length).fill('')]);
    const last = pad[pad.length - 1];
    const hasTotal = pad.length > 2 && /^\s*(grand\s+)?totals?\b/i.test(last[0]);
    return {
      kind: 'table',
      title: title || 'Table',
      subtitle: subtitle || (points[0]?.text ?? ''),
      table: { head: pad[0], rows: pad.slice(1, hasTotal ? -1 : undefined), total: hasTotal ? last : [] },
    };
  }
  if (points.length || subtitle) return { kind: 'bullets', title, subtitle, points, image, ratio: 0 };
  if (image) return { kind: 'picture', title, subtitle: '', image, ratio: 0 };
  if (title) return { kind: 'thanks', title, sub: '' };
  return null;
}

/* ------------------------------------------------------------------ PDF, pictures */

/** A PDF page (already read by importPdf) into a slide. */
export function fromPdfPage(p: { title: string; texts: string[]; tables: string[][][] }, index: number, count: number): DeckSlide | null {
  const points = p.texts.flatMap((t) => point(t) ?? []);
  return fromPptSlide(
    {
      boxes: [...(p.title ? [{ ph: 'title', paras: [{ text: p.title, level: 0 }], size: 0 }] : []), ...(points.length ? [{ ph: 'body', paras: points, size: 0 }] : [])],
      tables: p.tables,
      pics: [],
      layout: '',
    },
    index,
    count,
    '',
  );
}

export const OLD_FORMATS: Record<string, string> = {
  ppt: 'This is an old PowerPoint (.ppt). Open it in PowerPoint and choose File → Save As → PowerPoint Presentation (.pptx), or save it as PDF, then upload that.',
  pps: 'This is an old PowerPoint show (.pps). Open it in PowerPoint and save it as .pptx or PDF, then upload that.',
  key: 'Keynote files can’t be read here. In Keynote choose File → Export To → PowerPoint (or PDF), then upload that.',
  odp: 'Save this LibreOffice file as PowerPoint (.pptx) or PDF, then upload that.',
  heic: 'This is an iPhone photo (HEIC). Share it as a JPG (or take a screenshot) and upload that.',
};

export const ACCEPT_DECK = '.pptx,.ppsx,.potx,.pptm,.pdf,.jpg,.jpeg,.png,.webp,.ppt,.pps,.key,.odp,.heic,application/pdf,image/*';
