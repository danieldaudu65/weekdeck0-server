/**
 * In the browser: any uploaded deck file(s) → restyle slides, pictures shrunk
 * (so a saved deck stays small and loads fast on a phone).
 */
import type { DeckSlide } from '../deck';
import { mainArea } from './trim';
import { withTotals } from './tableMath';
import { OLD_FORMATS, RestyleError, fromPdfPage, looksLikeChart, readPptxDeck, slideId, type RestyleSlide } from './read';

const ext = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();
const blobOf = (bytes: Uint8Array, type: string) => new Blob([bytes as BlobPart], { type });

/**
 * A picture, at most `max` px across: JPEG, or PNG when it has see-through parts (logos).
 * `crop` is a PowerPoint crop (left, top, right, bottom fractions); `trim` cuts a
 * screenshot down to the photo in it.
 */
export async function shrinkPicture(blob: Blob, max = 1600, opts: { crop?: number[]; trim?: boolean } = {}): Promise<{ image: string; ratio: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new RestyleError('A picture couldn’t be opened.'));
      i.src = url;
    });
    const [l, t, r, b] = opts.crop ?? [0, 0, 0, 0];
    let sx = img.naturalWidth * l, sy = img.naturalHeight * t;
    let sw = Math.max(1, img.naturalWidth * (1 - l - r)), sh = Math.max(1, img.naturalHeight * (1 - t - b));
    if (opts.trim && blob.type !== 'image/gif') {
      const q = Math.min(1, 220 / Math.max(sw, sh));
      const small = document.createElement('canvas');
      small.width = Math.max(1, Math.round(sw * q));
      small.height = Math.max(1, Math.round(sh * q));
      const sc = small.getContext('2d', { willReadFrequently: true })!;
      sc.drawImage(img, sx, sy, sw, sh, 0, 0, small.width, small.height);
      const px = sc.getImageData(0, 0, small.width, small.height).data;
      let clear = false;
      for (let i = 3; i < px.length; i += 4 * 7) if (px[i] < 250) {
        clear = true; // a logo with see-through parts: leave it whole
        break;
      }
      const area = clear ? null : mainArea(px, small.width, small.height);
      if (area) {
        sx += sw * area.x;
        sy += sh * area.y;
        sw *= area.w;
        sh *= area.h;
      }
    }
    const k = Math.min(1, max / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw * k));
    canvas.height = Math.max(1, Math.round(sh * k));
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
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

/**
 * Remembers the uploaded slide's picture (RestyleSlide.filePicture) and gives the
 * slide its no-picture form, used when "Pictures from the file" is turned off.
 * A picture-only slide becomes a Thank you slide when it is the last one;
 * otherwise an empty one (hidden while pictures are off).
 */
export function setAside(s: RestyleSlide, last: boolean): RestyleSlide {
  const sl = s.slide;
  if (sl.kind === 'picture') {
    if (sl.title) return { ...s, slide: { kind: 'thanks', title: sl.title, sub: '' }, filePicture: sl.image, filePictureRatio: sl.ratio };
    if (last) return { ...s, slide: { kind: 'thanks', title: 'Thank you', sub: '' }, filePicture: sl.image, filePictureRatio: sl.ratio };
    return { ...s, hidden: true, slide: { kind: 'thanks', title: '', sub: '' }, filePicture: sl.image, filePictureRatio: sl.ratio };
  }
  if ((sl.kind === 'bullets' || sl.kind === 'cover') && sl.image) {
    const ratio = sl.kind === 'bullets' ? sl.ratio : 0;
    return { ...s, slide: (sl.kind === 'bullets' ? { ...sl, image: '', ratio: 0 } : { ...sl, image: '' }) as DeckSlide, filePicture: sl.image, filePictureRatio: ratio };
  }
  return s;
}

/** Turn the file's pictures on or off for the whole deck. */
export function withFilePictures(slides: RestyleSlide[], on: boolean): RestyleSlide[] {
  return slides.map((s, i) => {
    if (!s.filePicture) return s;
    const sl = s.slide;
    if (sl.kind === 'cover') return { ...s, slide: { ...sl, image: on ? s.filePicture : sl.image === s.filePicture ? '' : sl.image } };
    if (sl.kind === 'bullets') return { ...s, slide: on ? { ...sl, image: s.filePicture, ratio: s.filePictureRatio ?? 0 } : sl.image === s.filePicture ? { ...sl, image: '', ratio: 0 } : sl };
    if (sl.kind === 'thanks' && on) return { ...s, ...(sl.title ? {} : { hidden: false }), slide: { kind: 'picture', title: sl.title === 'Thank you' ? '' : sl.title, subtitle: '', image: s.filePicture, ratio: s.filePictureRatio ?? 0 } };
    if (sl.kind === 'picture' && !on && sl.image === s.filePicture) {
      const last = i === slides.length - 1;
      return { ...s, ...(sl.title || last ? {} : { hidden: true }), slide: { kind: 'thanks', title: sl.title || (last ? 'Thank you' : ''), sub: '' } };
    }
    return s;
  });
}

export const usesFilePictures = (slides: RestyleSlide[]) => slides.some((s) => s.filePicture && 'image' in s.slide && s.slide.image === s.filePicture);

/** Tables come in with their TOTAL cells worked out. */
const addedUp = (s: RestyleSlide): RestyleSlide => (s.slide.kind === 'table' ? { ...s, slide: { ...s.slide, table: withTotals(s.slide.table) } } : s);

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
    for (const [key, m] of deck.media) {
      const crop = /#crop=([\d.,]+)$/.exec(key)?.[1].split(',').map(Number);
      pics.set(key, await shrinkPicture(blobOf(m.bytes, m.type), 1600, { crop, trim: true }).catch(() => ({ image: '', ratio: 0 })));
    }
    const slides = deck.slides.map((s) => {
      const key = s.slide.kind === 'cover' || s.slide.kind === 'bullets' || s.slide.kind === 'picture' ? s.slide.image : '';
      const pic = key ? pics.get(key) : undefined;
      if (!key) return s;
      return { ...s, slide: pic?.image ? withPicture(s.slide, pic) : withPicture(s.slide, { image: '', ratio: 0 }) };
    });
    const kept = slides.filter((s) => !(s.slide.kind === 'picture' && !s.slide.image));
    // The deck's own pictures go into the new design; the switch in the editor takes them out.
    const out = withFilePictures(kept.map((s, i) => setAside(s, i === kept.length - 1)), true);
    return { title: deck.title, slides: out.map(addedUp), notes: deck.notes };
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
        // A scan, or a page that's mostly a picture or chart: the page itself, under its title.
        // Pictures are left out unless the page has nothing else (a scan, a chart): the text is redesigned.
        const fewWords = !built || (built.kind === 'bullets' && built.points.length === 0 && !built.subtitle);
        const title = (built && 'title' in built ? built.title : '') || (raw.titleText.length <= 90 ? raw.titleText : '');
        if (page && fewWords) {
          kept++;
          slides.push({ id: slideId(), hidden: false, slide: { kind: 'picture', title, subtitle: '', image: page.image, ratio: page.ratio }, original: page.image, originalRatio: page.ratio });
        } else if (built) {
          slides.push({ id: slideId(), hidden: false, slide: built, ...(page ? { original: page.image, originalRatio: page.ratio } : {}) });
        }
      }
      if (kept) notes.push(`${kept} page${kept === 1 ? '' : 's'} kept as ${kept === 1 ? 'a picture' : 'pictures'}`);
      if (!slides.length) throw new RestyleError('Nothing could be read from this PDF.');
      const first = slides[0].slide;
      return { title: (first.kind === 'cover' && first.title) || file.name.replace(/\.[a-z0-9]+$/i, ''), slides: slides.map(addedUp), notes };
    } finally {
      pdf.close();
    }
  }

  if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(e)) {
    const pic = await shrinkPicture(file, 1800, { trim: true });
    return { title: file.name.replace(/\.[a-z0-9]+$/i, ''), slides: [{ id: slideId(), hidden: false, slide: { kind: 'picture', title: '', subtitle: '', image: pic.image, ratio: pic.ratio }, original: pic.image, originalRatio: pic.ratio }], notes: [] };
  }
  throw new RestyleError(`“${file.name}” isn’t a file WeekDeck can read. Use PowerPoint (.pptx), PDF or a picture.`);
}

/** Rough size of a deck's pictures, for the save limit. */
export const deckBytes = (slides: RestyleSlide[]) =>
  slides.reduce((a, s) => a + (s.original?.length ?? 0) + ('image' in s.slide && s.slide.image !== s.original ? (s.slide.image?.length ?? 0) : 0), 0);
