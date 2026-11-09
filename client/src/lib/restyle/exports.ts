/**
 * A restyled deck out of WeekDeck:
 *   3D presentation (.html): plays full screen offline with 3D motion (export3d.ts);
 *   PowerPoint (.pptx): real, editable slides with PowerPoint's own 3D transitions;
 *   PDF: the print page (/decks/:id/print → "Save as PDF").
 */
import JSZip from 'jszip';
import type { DeckSlide } from '../deck';
import { layoutSlide } from '../looks';
import { lookById } from '../templates';
import { build3dHtml } from '../export3d';
import type { Transition } from './api';
import type { RestyleSlide } from './read';

export interface Exportable {
  title: string;
  lookId: string;
  transition: Transition;
  slides: RestyleSlide[];
}

export const shownSlides = (d: Pick<Exportable, 'slides'>): DeckSlide[] => d.slides.filter((s) => !s.hidden).map((s) => s.slide);

export function laidSlides(d: Exportable) {
  const slides = shownSlides(d);
  return slides.map((s, i) => layoutSlide(s, d.lookId, { teamName: d.title, page: i + 1, total: slides.length }));
}

export const fileBase = (title: string) => title.replace(/[^\w\s-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'deck';

export function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function html3d(d: Exportable): string {
  const look = lookById(d.lookId);
  return build3dHtml(d.title, [{ name: `${look.style.name} · ${look.palette.name}`, slides: laidSlides(d) }], { transition: d.transition });
}

export function download3d(d: Exportable) {
  save(new Blob([html3d(d)], { type: 'text/html' }), `${fileBase(d.title)}-3D.html`);
}

/** PowerPoint's own 3D transitions (PowerPoint 2010 and later; older ones fade). */
const PPT_TRANSITION: Record<Transition, string> = {
  cube: '<p14:prism/>',
  flip: '<p14:flip dir="r"/>',
  zoom: '<p14:vortex dir="r"/>',
  slide: '<p14:gallery dir="l"/>',
};

/** Put a 3D transition on every slide of a .pptx (after <p:clrMapOvr>, as the file format wants). */
export async function addTransitions(pptx: ArrayBuffer | Uint8Array, transition: Transition): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(pptx);
  const xml = `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" Requires="p14"><p:transition spd="slow" p14:dur="1400">${PPT_TRANSITION[transition]}</p:transition></mc:Choice><mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>`;
  for (const name of Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))) {
    let s = await zip.file(name)!.async('string');
    if (s.includes('<p:transition')) continue;
    if (s.includes('</p:clrMapOvr>')) s = s.replace('</p:clrMapOvr>', `</p:clrMapOvr>${xml}`);
    else s = s.replace('</p:cSld>', `</p:cSld>${xml}`);
    zip.file(name, s);
  }
  return zip.generateAsync({ type: 'uint8array', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}

export async function downloadPptx3d(d: Exportable) {
  const { buildPptx } = await import('../exportPptx');
  const pres = await buildPptx(shownSlides(d), lookById(d.lookId), { teamName: d.title, title: d.title });
  const raw = (await pres.write({ outputType: 'arraybuffer' })) as ArrayBuffer;
  const out = await addTransitions(raw, d.transition);
  save(new Blob([out as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), `${fileBase(d.title)}.pptx`);
}
