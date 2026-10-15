/**
 * Builds a real, editable PowerPoint from the same shapes as the preview.
 * Runs in the browser (pptxgenjs), loaded only when the button is tapped.
 */
import { CANVAS_W, type DeckSlide, type Font, type Shape } from './deck';
import { layoutSlide } from './looks';
import type { Look } from './templates';

const FACE: Record<Font, string> = { sans: 'Arial', serif: 'Georgia', display: 'Arial Black' };

const IN = 10 / CANVAS_W; // canvas px → inches (slide is 10" wide)
const PT = 0.5625; // canvas px → points

/** Crop a picture to the exact box shape, so PowerPoint shows it like the preview (no stretching). */
async function cropToBox(src: string, w: number, h: number): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
  const target = w / h;
  const srcRatio = img.naturalWidth / img.naturalHeight;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  if (srcRatio > target) sw = sh * target;
  else sh = sw / target;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * 1.5);
  canvas.height = Math.round(h * 1.5);
  canvas.getContext('2d')!.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export async function buildPptx(slides: DeckSlide[], look: Look, meta: { teamName: string; title: string }) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_16x9';
  pres.title = meta.title;
  pres.author = meta.teamName;
  pres.company = 'WeekDeck';

  for (const [i, slide] of slides.entries()) {
    const { bg, shapes } = layoutSlide(slide, look, { teamName: meta.teamName, page: i + 1, total: slides.length });
    const s = pres.addSlide();
    s.background = { color: bg };
    for (const sh of shapes) await addShape(pres, s, sh);
  }
  return pres;
}

type Pres = InstanceType<typeof import('pptxgenjs').default>;
type Slide = ReturnType<Pres['addSlide']>;

/** A filled shape, an outline, or both. */
function fillAndLine(sh: { fill: string | null; stroke?: string; strokeW?: number }) {
  return {
    fill: sh.fill ? { color: sh.fill } : { type: 'none' as const },
    line: sh.stroke ? { color: sh.stroke, width: (sh.strokeW ?? 2) * PT } : sh.fill ? { color: sh.fill, width: 0 } : { type: 'none' as const },
  };
}

async function addShape(pres: Pres, s: Slide, sh: Shape) {
  const pos = { x: sh.x * IN, y: sh.y * IN };
  switch (sh.type) {
    case 'rect':
      s.addShape(sh.radius ? pres.ShapeType.roundRect : pres.ShapeType.rect, {
        ...pos,
        w: sh.w * IN,
        h: sh.h * IN,
        ...fillAndLine(sh),
        ...(sh.radius ? { rectRadius: Math.min(sh.radius, sh.h / 2, sh.w / 2) * IN } : {}),
      });
      return;
    case 'ellipse':
      s.addShape(pres.ShapeType.ellipse, { ...pos, w: sh.w * IN, h: sh.h * IN, ...fillAndLine(sh) });
      return;
    case 'image': {
      const data = await cropToBox(sh.src, sh.w, sh.h).catch(() => sh.src);
      s.addImage({ data, ...pos, w: sh.w * IN, h: sh.h * IN });
      return;
    }
    case 'text':
      s.addText(sh.text, {
        ...pos,
        w: sh.w * IN,
        h: sh.h * IN,
        fontFace: FACE[sh.font ?? 'sans'],
        fontSize: Math.round(sh.size * PT * 10) / 10,
        color: sh.color,
        bold: Boolean(sh.bold) && sh.font !== 'display',
        italic: Boolean(sh.italic),
        align: sh.align ?? 'left',
        valign: sh.valign ?? 'top',
        margin: 0,
        isTextBox: true,
        ...(sh.spacing ? { charSpacing: Math.round(sh.spacing * PT * 10) / 10 } : {}),
      });
      return;
    case 'table': {
      const border = { type: 'solid' as const, pt: 0.75, color: sh.line };
      const fontSize = Math.round(sh.size * PT * 10) / 10;
      const cell = (text: string, opts: Record<string, unknown>) => ({ text, options: { fontFace: FACE[sh.font ?? 'sans'], fontSize, valign: 'middle' as const, border, ...opts } });
      const rows = [
        sh.head.map((h, i) => cell(h, { fill: { color: sh.headFill }, color: sh.headInk, bold: true, align: i === 0 ? 'left' : 'center' })),
        ...sh.rows.map((r, ri) =>
          r.map((c, ci) => cell(c, { fill: { color: ri % 2 ? sh.stripe : sh.bg }, color: sh.ink, bold: sh.boldEdges !== false && (ci === 0 || ci === r.length - 1), align: ci === 0 ? 'left' : 'center' })),
        ),
        sh.total.map((c, ci) => cell(c, { fill: { color: sh.totalFill }, color: sh.totalInk, bold: true, align: ci === 0 ? 'left' : 'center' })),
      ];
      s.addTable(rows, { ...pos, colW: sh.colW.map((w) => w * IN), rowH: sh.rowH * IN, autoPage: false });
      return;
    }
  }
}

export async function downloadPptx(slides: DeckSlide[], look: Look, meta: { teamName: string; title: string; fileName: string }) {
  const pres = await buildPptx(slides, look, meta);
  await pres.writeFile({ fileName: meta.fileName });
}

/** For "Share": the file as a Blob. */
export async function pptxBlob(slides: DeckSlide[], look: Look, meta: { teamName: string; title: string }): Promise<Blob> {
  const pres = await buildPptx(slides, look, meta);
  return (await pres.write({ outputType: 'blob' })) as Blob;
}
