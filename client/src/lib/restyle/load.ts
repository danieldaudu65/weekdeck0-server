/**
 * In the browser: any uploaded deck file(s) → restyle slides, pictures shrunk
 * (so a saved deck stays small and loads fast on a phone).
 */
import type { DeckSlide } from '../deck';
import { OLD_FORMATS, RestyleError, fromPdfPage, looksLikeChart, readPptxDeck, slideId, type RestyleSlide } from './read';

const ext = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();
const blobOf = (bytes: Uint8Array, type: string) => new Blob([bytes as BlobPart], { type });

/** A picture, at most `max` px across: JPEG, or PNG when it has see-through parts (logos). */
export async function shrinkPicture(blob: Blob, max = 1600): Promise<{ image: string; ratio: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new RestyleError('A picture couldn’t be opened.'));
      i.src = url;
    });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let alpha = false;
    if (blob.type === 'image/png' || blob.type === 'image/gif' || blob.type === 'image/webp') {
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < d.length; i += 4 * 97) if (d[i] < 250) {
        alpha = true;
        break;
      }
    }
    if (!alpha) {
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    return { image: alpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.82), ratio: canvas.width / canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function withPicture(s: DeckSlide, pic: { image: string; ratio: number }): DeckSlide {
  if (s.kind === 'cover') return { ...s, image: pic.image };
  if (s.kind === 'bullets' || s.kind === 'picture') return { ...s, image: pic.image, ratio: pic.ratio };
  return s;
}

export interface Loaded {
  title: string;
  slides: RestyleSlide[];
  notes: string[];
}

/** One file → slides. Throws RestyleError with a plain message for files it can't read. */
export async function loadDeckFile(file: File, onStep: (text: string) => void = () => undefined): Promise<Loaded> {
  const e = ext(file.name);
  if (OLD_FORMATS[e] || (e === 'pps' && OLD_FORMATS.pps)) throw new RestyleError(OLD_FORMATS[e]);
  if (file.size > 80 * 1024 * 1024) throw new RestyleError('That file is over 80 MB. Save it again with smaller pictures (or as PDF) and try again.');

  if (['pptx', 'ppsx', 'potx', 'pptm'].includes(e)) {
    onStep('Reading the slides…');
    const deck = await readPptxDeck(await file.arrayBuffer(), file.name);
    onStep('Getting the pictures ready…');
    const pics = new Map<string, { image: string; ratio: number }>();
    for (const [key, m] of deck.media) pics.set(key, await shrinkPicture(blobOf(m.bytes, m.type), 1600).catch(() => ({ image: '', ratio: 0 })));
    const slides = deck.slides.map((s) => {
      const key = s.slide.kind === 'cover' || s.slide.kind === 'bullets' || s.slide.kind === 'picture' ? s.slide.image : '';
      const pic = key ? pics.get(key) : undefined;
      if (!key) return s;
      return { ...s, slide: pic?.image ? withPicture(s.slide, pic) : withPicture(s.slide, { image: '', ratio: 0 }) };
    });
    return { title: deck.title, slides: slides.filter((s) => !(s.slide.kind === 'picture' && !s.slide.image)), notes: deck.notes };
  }

  if (e === 'pdf' || file.type === 'application/pdf') {
    onStep('Reading the pages…');
    const [{ readPdfPages }, { pdfPageToRaw }] = await Promise.all([import('../importPdf'), import('../accounts/otherFormats')]);
    const pdf = await readPdfPages(file, 60);
    try {
      const notes: string[] = [];
      if (pdf.total > pdf.pages.length) notes.push(`Only the first ${pdf.pages.length} of ${pdf.total} pages were read.`);
      const slides: RestyleSlide[] = [];
      let kept = 0;
      for (let i = 0; i < pdf.pages.length; i++) {
        onStep(`Page ${i + 1} of ${pdf.pages.length}…`);
        const letters = pdf.pieces[i].reduce((a, p) => a + p.str.trim().length, 0);
        const raw = pdfPageToRaw(pdf.pages[i], i, pdf.pieces[i]);
        // A chart drawn in the PDF reads as its axis labels: show the page instead.
        const chart = !raw.tables.length && looksLikeChart(raw.texts);
        const built = letters >= 25 && !chart ? fromPdfPage({ title: raw.titleText, texts: raw.texts, tables: raw.tables }, i, pdf.pages.length) : null;
        const picture = letters < 25 || chart || (await pdf.hasImage(i + 1).catch(() => false));
        const page = picture ? await pdf.picture(i + 1) : null;
        // A blank page (a white picture compresses to almost nothing).
        if (!built && page && page.image.length < 30_000) continue;
        if (page) kept++;
        // A scan, or a page that's mostly a picture or chart: the page itself, under its title.
        const fewWords = !built || (built.kind === 'bullets' && built.points.length <= 3 && !built.image);
        const title = (built && 'title' in built ? built.title : '') || (raw.titleText.length <= 90 ? raw.titleText : '');
        if (page && fewWords) {
          slides.push({ id: slideId(), hidden: false, slide: { kind: 'picture', title, subtitle: '', image: page.image, ratio: page.ratio }, original: page.image, originalRatio: page.ratio });
        } else if (built) {
          slides.push({ id: slideId(), hidden: false, slide: built, ...(page ? { original: page.image, originalRatio: page.ratio } : {}) });
        }
      }
      if (kept) notes.push(`${kept} page${kept === 1 ? '' : 's'} kept as ${kept === 1 ? 'a picture' : 'pictures'}`);
      if (!slides.length) throw new RestyleError('Nothing could be read from this PDF.');
      const first = slides[0].slide;
      return { title: (first.kind === 'cover' && first.title) || file.name.replace(/\.[a-z0-9]+$/i, ''), slides, notes };
    } finally {
      pdf.close();
    }
  }

  if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(e)) {
    const pic = await shrinkPicture(file, 1800);
    return { title: file.name.replace(/\.[a-z0-9]+$/i, ''), slides: [{ id: slideId(), hidden: false, slide: { kind: 'picture', title: '', subtitle: '', image: pic.image, ratio: pic.ratio }, original: pic.image, originalRatio: pic.ratio }], notes: [] };
  }
  throw new RestyleError(`“${file.name}” isn’t a file WeekDeck can read. Use PowerPoint (.pptx), PDF or a picture.`);
}

/** Rough size of a deck's pictures, for the save limit. */
export const deckBytes = (slides: RestyleSlide[]) =>
  slides.reduce((a, s) => a + (s.original?.length ?? 0) + ('image' in s.slide && s.slide.image !== s.original ? (s.slide.image?.length ?? 0) : 0), 0);
