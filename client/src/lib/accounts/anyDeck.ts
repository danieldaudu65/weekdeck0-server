/**
 * "Import slides" takes whatever the accountant has:
 *
 * - PowerPoint (.pptx, .ppsx, .potx, .pptm), PDF (incl. Google Slides downloads),
 *   LibreOffice (.odp), Word (.docx: its tables), Excel / CSV (its sheets):
 *   read into titles and tables, then checked;
 * - pictures (JPG, PNG, WebP…) and scanned PDFs: brought in as picture slides
 *   (nothing to check: there's no text in them);
 * - old binary files (.ppt, .doc, .xls) and Keynote: a clear message on how to
 *   save them in a readable format.
 *
 * Browser only (pictures are drawn on a canvas; PDFs use pdf.js).
 */
import { readDeck, SlideImportError, newId, toImported, type ImportedSlide, type RawSlide } from './slideImport';
import { pdfPageToRaw, readDocx, readOdp, sheetsToSlides } from './otherFormats';
import { readCsv, readXlsx } from './xlsx';

export const ACCEPT = [
  '.pptx', '.ppsx', '.potx', '.pptm', '.ppsm', '.potm', '.pdf', '.odp', '.docx', '.xlsx', '.xlsm', '.csv',
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp',
  '.ppt', '.pps', '.pot', '.key', '.doc', '.xls', '.heic', '.heif',
  'image/*', 'application/pdf',
].join(',');

const ext = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();

const OLD: Record<string, string> = {
  ppt: 'This is an old PowerPoint (.ppt). Open it in PowerPoint and choose File → Save As → PowerPoint Presentation (.pptx), or Save As PDF, then upload that.',
  pps: 'This is an old PowerPoint show (.pps). Open it in PowerPoint and Save As .pptx or PDF, then upload that.',
  pot: 'This is an old PowerPoint template (.pot). Open it in PowerPoint and Save As .pptx or PDF, then upload that.',
  key: 'Keynote files can’t be read here. In Keynote choose File → Export To → PowerPoint (or PDF), then upload that.',
  doc: 'This is an old Word file (.doc). Open it in Word and Save As .docx or PDF, then upload that.',
  xls: 'This is an old Excel file (.xls). Open it in Excel and Save As .xlsx, then upload that.',
  heic: 'This is an iPhone photo (HEIC). Share it as a JPG (or take a screenshot of it) and upload that.',
  heif: 'This is an iPhone photo (HEIF). Share it as a JPG (or take a screenshot of it) and upload that.',
};

export interface FileSlides {
  fileName: string;
  slides: ImportedSlide[];
  /** What happened, in plain words ("Scanned PDF: 5 pages brought in as pictures"). */
  notes: string[];
}

/** A picture file as a slide: shrunk to at most 1600 px wide, as JPEG. */
async function pictureSlide(blob: Blob, title: string): Promise<ImportedSlide> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new SlideImportError('This picture couldn’t be opened.'));
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return picture(canvas.toDataURL('image/jpeg', 0.78), canvas.width / canvas.height, title);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const picture = (image: string, ratio: number, title: string): ImportedSlide => ({ id: newId(), kind: 'picture', title, subtitle: '', branch: '', head: [], rows: [], total: [], lines: [], image, ratio });

const niceName = (fileName: string) => fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').trim();

/** Any accepted file → slides (+ notes). Throws SlideImportError with a plain message for files it can't read. */
export async function readAnyFile(file: File, knownBranches: string[]): Promise<FileSlides> {
  const e = ext(file.name);
  if (OLD[e]) throw new SlideImportError(OLD[e]);
  const notes: string[] = [];
  const fromRaw = (raw: RawSlide[]) => toImported(raw, knownBranches);

  if (['pptx', 'ppsx', 'potx', 'pptm', 'ppsm', 'potm'].includes(e)) return { fileName: file.name, slides: fromRaw(await readDeck(await file.arrayBuffer())), notes };
  if (e === 'odp') return { fileName: file.name, slides: fromRaw(await readOdp(await file.arrayBuffer())), notes };
  if (e === 'docx') {
    const raw = await readDocx(await file.arrayBuffer());
    notes.push(`${raw.length} table${raw.length === 1 ? '' : 's'} from the Word file, one slide each`);
    return { fileName: file.name, slides: fromRaw(raw), notes };
  }
  if (['xlsx', 'xlsm', 'csv'].includes(e)) {
    const sheets = e === 'csv' ? [{ name: niceName(file.name), rows: readCsv(await file.text()) }] : await readXlsx(await file.arrayBuffer());
    const r = sheetsToSlides(sheets);
    if (!r.slides.length) throw new SlideImportError(r.notes[0] ?? 'This sheet has nothing to put on a slide.');
    return { fileName: file.name, slides: fromRaw(r.slides), notes: [`${r.slides.length} sheet${r.slides.length === 1 ? '' : 's'}, one slide each`, ...r.notes] };
  }
  if (e === 'pdf' || file.type === 'application/pdf') {
    const { readPdfPages } = await import('../importPdf');
    const pdf = await readPdfPages(file);
    try {
      if (pdf.total > pdf.pages.length) notes.push(`Only the first ${pdf.pages.length} of ${pdf.total} pages were read.`);
      // A scan or a PDF of photos: no text to read, so each page comes in as a picture.
      if (pdf.letters < 20) {
        const slides: ImportedSlide[] = [];
        for (let n = 1; n <= Math.min(pdf.pages.length, 30); n++) {
          const p = await pdf.picture(n);
          slides.push(picture(p.image, p.ratio, ''));
        }
        notes.push(`This PDF is scanned (pictures only): ${slides.length} page${slides.length === 1 ? '' : 's'} brought in as pictures. Pictures can’t be checked; add titles and restyle them as you like.`);
        return { fileName: file.name, slides, notes };
      }
      return { fileName: file.name, slides: fromRaw(pdf.pages.map((p, i) => pdfPageToRaw(p, i, pdf.pieces[i]))), notes };
    } finally {
      pdf.close();
    }
  }
  if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(e)) {
    notes.push('A picture: it comes in as a picture slide (it can’t be checked: there’s no text to read).');
    return { fileName: file.name, slides: [await pictureSlide(file, '')], notes };
  }
  throw new SlideImportError(`“${file.name}” isn’t a file WeekDeck can read. Use PowerPoint (.pptx), PDF, Excel, Word or a picture.`);
}
