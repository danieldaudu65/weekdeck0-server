/** What's sent to save a deck: the slides, plus a small picture for the "My decks" card. */
import { shrinkPicture } from './load';
import type { DeckBody, Transition } from './api';
import type { RestyleSlide } from './read';
import type { Brand } from '../brand';

const imageOf = (s: RestyleSlide) => ('image' in s.slide ? s.slide.image : '') || '';
const BUDGET = 13_000_000;

async function smaller(src: string, max: number) {
  const blob = await (await fetch(src)).blob();
  return shrinkPicture(blob, max);
}

/** Pictures too big to save together are made smaller (never the text). */
async function fitBudget(slides: RestyleSlide[]): Promise<RestyleSlide[]> {
  const size = () => slides.reduce((a, s) => a + imageOf(s).length + (s.original && s.original !== imageOf(s) ? s.original.length : 0) + (s.filePicture && s.filePicture !== imageOf(s) ? s.filePicture.length : 0), 0);
  for (const max of [1200, 900, 640]) {
    if (size() <= BUDGET) break;
    slides = await Promise.all(
      slides.map(async (s) => {
        const img = imageOf(s);
        const next: RestyleSlide = { ...s };
        if (img.length > 250_000) {
          const p = await smaller(img, max).catch(() => null);
          if (p) next.slide = { ...s.slide, image: p.image } as RestyleSlide['slide'];
          if (s.original === img && p) next.original = p.image;
        }
        if (s.filePicture === img && next.slide !== s.slide && 'image' in next.slide) next.filePicture = next.slide.image;
        else if (s.filePicture && s.filePicture !== img && s.filePicture.length > 250_000) {
          const p = await smaller(s.filePicture, max).catch(() => null);
          if (p) next.filePicture = p.image;
        }
        if (s.original && s.original !== img && s.original.length > 250_000) {
          const p = await smaller(s.original, max).catch(() => null);
          if (p) next.original = p.image;
        }
        return next;
      }),
    );
  }
  return slides;
}

let thumbFor = '';
let thumbCache = '';

export async function deckBody(d: { title: string; lookId: string; logo?: Brand; transition: Transition; sourceName: string; slides: RestyleSlide[] }): Promise<DeckBody> {
  const slides = await fitBudget(d.slides);
  const first = slides.find((s) => !s.hidden);
  const img = first ? imageOf(first) : '';
  if (img !== thumbFor) {
    thumbFor = img;
    thumbCache = img ? ((await smaller(img, 480).catch(() => null))?.image ?? '') : '';
  }
  return { title: d.title, lookId: d.lookId, logo: d.logo ?? 'adron', transition: d.transition, sourceName: d.sourceName, slides, thumb: thumbCache };
}
