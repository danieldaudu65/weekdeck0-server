/**
 * Reads a PDF of last week's slides in the browser (with pdf.js) and hands the
 * text and tables to analyzeSlides(), just like a PowerPoint. Nothing is uploaded.
 * The cover photo is the biggest picture on the cover page; when there isn't
 * one the cover simply uses the look's own design.
 */
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFPageProxy } from 'pdfjs-dist';
import { analyzeSlides, type ImportResult, type SlideContent } from './importAnalyze';
import { ImportError } from './importPptx';
import { pageToSlide, type PdfTextPiece } from './pdfLayout';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_PAGES = 30;

export async function readPdf(file: File): Promise<{ result: ImportResult; coverImage: string }> {
  if (file.size > 40 * 1024 * 1024) throw new ImportError('That PDF is over 40 MB. Try saving it again with smaller pictures.');

  let doc: pdfjs.PDFDocumentProxy;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch (err) {
    if ((err as { name?: string })?.name === 'PasswordException') throw new ImportError('This PDF is locked with a password. Save a copy without the password and upload that.');
    throw new ImportError("This PDF couldn't be opened. Make sure it's a real PDF file.");
  }

  try {
    const pages: PDFPageProxy[] = [];
    const slides: SlideContent[] = [];
    const count = Math.min(doc.numPages, MAX_PAGES);
    let letters = 0;
    for (let n = 1; n <= count; n++) {
      const page = await doc.getPage(n);
      pages.push(page);
      const { height } = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const pieces: PdfTextPiece[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str) continue;
        const [a, b, c, d, e, f] = item.transform as number[];
        const size = item.height || Math.hypot(c, d) || Math.hypot(a, b);
        pieces.push({ str: item.str, x: e, y: f, w: item.width, size });
        letters += item.str.trim().length;
      }
      slides.push(pageToSlide(pieces, height, n, `page:${n}`));
    }

    if (letters < 20) {
      throw new ImportError(
        'This PDF is only pictures (like a scan or screenshot), so there’s no text to read. Upload the PowerPoint instead, or start from scratch.',
      );
    }

    const result = analyzeSlides(slides);
    if (doc.numPages > MAX_PAGES) result.warnings.push(`Only the first ${MAX_PAGES} pages were read.`);

    // Cover photo: the biggest picture on the cover page, if it has one.
    let coverImage = '';
    const coverPage = Number(/^page:(\d+)$/.exec(result.coverPicture ?? '')?.[1] ?? 1);
    const page = pages[coverPage - 1];
    if (page) coverImage = await biggestPicture(page).catch(() => '');
    result.coverPicture = undefined;
    return { result, coverImage };
  } finally {
    void doc.destroy();
  }
}

type PdfImage = { width: number; height: number; kind?: number; data?: Uint8ClampedArray | Uint8Array; bitmap?: ImageBitmap };

function getObj(page: PDFPageProxy, id: string): Promise<PdfImage | null> {
  const store = id.startsWith('g_') ? page.commonObjs : page.objs;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 4000);
    try {
      store.get(id, (obj: unknown) => {
        clearTimeout(timer);
        resolve((obj as PdfImage) ?? null);
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/** Find the largest photo on a page and return it as a small JPEG data URL ('' if none). */
async function biggestPicture(page: PDFPageProxy): Promise<string> {
  const ops = await page.getOperatorList();
  let bestId = '';
  let bestArea = 0;
  ops.fnArray.forEach((fn, i) => {
    if (fn !== pdfjs.OPS.paintImageXObject && fn !== pdfjs.OPS.paintImageXObjectRepeat) return;
    const [id, w, h] = ops.argsArray[i] as [string, number, number];
    // Skip logos and icons: a cover photo is at least ~200px on each side.
    if (typeof id === 'string' && w >= 200 && h >= 200 && w * h > bestArea) {
      bestId = id;
      bestArea = w * h;
    }
  });
  if (!bestId) return '';

  const img = await getObj(page, bestId);
  if (!img || !img.width || !img.height) return '';

  const full = document.createElement('canvas');
  full.width = img.width;
  full.height = img.height;
  const ctx = full.getContext('2d')!;
  if (img.bitmap) ctx.drawImage(img.bitmap, 0, 0);
  else if (img.data) ctx.putImageData(toImageData(img), 0, 0);
  else return '';

  const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
  const out = document.createElement('canvas');
  out.width = Math.round(img.width * scale);
  out.height = Math.round(img.height * scale);
  out.getContext('2d')!.drawImage(full, 0, 0, out.width, out.height);
  return out.toDataURL('image/jpeg', 0.8);
}

/** pdf.js raw pixels → ImageData (kind 1 = black/white bits, 2 = RGB, 3 = RGBA). */
function toImageData(img: PdfImage): ImageData {
  const { width, height } = img;
  const src = img.data!;
  const out = new ImageData(width, height);
  const dst = out.data;
  if (img.kind === 3) {
    dst.set(src.subarray(0, dst.length));
  } else if (img.kind === 2) {
    for (let s = 0, d = 0; d < dst.length; s += 3, d += 4) {
      dst[d] = src[s];
      dst[d + 1] = src[s + 1];
      dst[d + 2] = src[s + 2];
      dst[d + 3] = 255;
    }
  } else {
    const rowBytes = (width + 7) >> 3;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const bit = (src[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1;
        const v = bit ? 255 : 0;
        const d = (y * width + x) * 4;
        dst[d] = dst[d + 1] = dst[d + 2] = v;
        dst[d + 3] = 255;
      }
    }
  }
  return out;
}
