/**
 * Reads a .pptx in the browser (a .pptx is a zip of XML files) and hands the
 * text and tables to analyzeSlides(). Nothing is uploaded anywhere.
 */
import { analyzeSlides, type ImportResult, type SlideContent, type SlideParagraph } from './importAnalyze';

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

export class ImportError extends Error {}

const xml = (s: string) => new DOMParser().parseFromString(s, 'application/xml');

function paragraphText(p: Element): string {
  return Array.from(p.getElementsByTagNameNS(NS_A, 't'))
    .map((t) => t.textContent ?? '')
    .join('');
}

function isInsideTable(el: Element): boolean {
  for (let n = el.parentElement; n; n = n.parentElement) if (n.localName === 'tbl') return true;
  return false;
}

/** Resolve "../media/image1.jpeg" relative to "ppt/slides/". */
function resolvePath(base: string, target: string): string {
  const parts = base.split('/');
  parts.pop();
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

async function readRels(zip: import('jszip'), file: string): Promise<Map<string, string>> {
  const relsPath = file.replace(/([^/]+)$/, '_rels/$1.rels');
  const raw = await zip.file(relsPath)?.async('string');
  const map = new Map<string, string>();
  if (!raw) return map;
  for (const r of Array.from(xml(raw).getElementsByTagNameNS(NS_PKG_REL, 'Relationship'))) {
    const id = r.getAttribute('Id');
    const target = r.getAttribute('Target');
    if (id && target && r.getAttribute('TargetMode') !== 'External') map.set(id, resolvePath(file, target));
  }
  return map;
}

export async function readPptx(file: File): Promise<{ result: ImportResult; coverImage: string }> {
  if (!/\.pptx$/i.test(file.name)) {
    // PDFs are read by pdf.js, loaded only when someone actually uploads one.
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') return (await import('./importPdf')).readPdf(file);
    if (/\.ppt$/i.test(file.name)) throw new ImportError('This is an old .ppt file. Open it in PowerPoint and "Save as" .pptx (or PDF), then upload that.');
    throw new ImportError('Please choose a PowerPoint (.pptx) or PDF file.');
  }
  if (file.size > 40 * 1024 * 1024) throw new ImportError('That file is over 40 MB. Remove big pictures or videos and try again.');

  const { default: JSZip } = await import('jszip');
  let zip: import('jszip');
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new ImportError("This file couldn't be opened. Make sure it's a real PowerPoint (.pptx) file.");
  }
  const presXml = await zip.file('ppt/presentation.xml')?.async('string');
  if (!presXml) throw new ImportError("This doesn't look like a PowerPoint presentation.");

  // Slide order comes from presentation.xml (file names aren't always in order).
  const presRels = await readRels(zip, 'ppt/presentation.xml');
  const slideFiles = Array.from(xml(presXml).getElementsByTagNameNS(NS_P, 'sldId'))
    .map((el) => presRels.get(el.getAttributeNS(NS_R, 'id') ?? el.getAttribute('r:id') ?? ''))
    .filter((p): p is string => Boolean(p && zip.file(p)));

  const slides: SlideContent[] = [];
  for (const [i, path] of slideFiles.entries()) {
    const doc = xml((await zip.file(path)!.async('string')) ?? '');
    const paragraphs: SlideParagraph[] = [];
    for (const sp of Array.from(doc.getElementsByTagNameNS(NS_P, 'sp'))) {
      const ph = sp.getElementsByTagNameNS(NS_P, 'ph')[0]?.getAttribute('type') ?? undefined;
      for (const p of Array.from(sp.getElementsByTagNameNS(NS_A, 'p'))) {
        if (isInsideTable(p)) continue;
        const text = paragraphText(p);
        if (text.trim()) paragraphs.push({ text, ph: ph ?? undefined });
      }
    }
    const tables: string[][][] = Array.from(doc.getElementsByTagNameNS(NS_A, 'tbl')).map((tbl) =>
      Array.from(tbl.getElementsByTagNameNS(NS_A, 'tr')).map((tr) =>
        Array.from(tr.getElementsByTagNameNS(NS_A, 'tc')).map((tc) =>
          Array.from(tc.getElementsByTagNameNS(NS_A, 'p'))
            .map(paragraphText)
            .join(' ')
            .trim(),
        ),
      ),
    );
    let picture: string | undefined;
    const blip = doc.getElementsByTagNameNS(NS_A, 'blip')[0];
    const embed = blip?.getAttributeNS(NS_R, 'embed') ?? blip?.getAttribute('r:embed');
    if (embed) picture = (await readRels(zip, path)).get(embed);
    slides.push({ index: i + 1, paragraphs, tables, picture });
  }
  if (!slides.length) throw new ImportError('No slides were found in this file.');

  const result = analyzeSlides(slides);
  let coverImage = '';
  if (result.coverPicture && /\.(jpe?g|png|webp)$/i.test(result.coverPicture)) {
    const blob = await zip.file(result.coverPicture)?.async('blob');
    if (blob) coverImage = await shrinkImage(blob).catch(() => '');
  }
  return { result, coverImage };
}

/** Resize a picture to at most 1000px and re-encode as JPEG, so it stays small (~100 KB). */
export async function shrinkImage(blob: Blob, max = 1000): Promise<string> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}
