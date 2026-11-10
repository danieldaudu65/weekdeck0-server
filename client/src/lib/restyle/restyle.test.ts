import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { looksLikeChart, point, readPptxDeck } from './read';
import { addTransitions } from './exports';

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const sp = (ph: string, paras: string) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="x"/><p:cNvSpPr/><p:nvPr>${ph ? `<p:ph type="${ph}"/>` : ''}</p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${paras}</p:txBody></p:sp>`;
const para = (t: string, lvl = 0) => `<a:p>${lvl ? `<a:pPr lvl="${lvl}"/>` : ''}<a:r><a:t>${t}</a:t></a:r></a:p>`;
const slide = (body: string) => `<?xml version="1.0"?><p:sld ${NS}><p:cSld><p:spTree>${body}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
const rels = (list: [string, string, string][]) => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`).join('')}</Relationships>`;

/** A small PowerPoint like anyone's: title slide with a photo, points with a sub-point, a table, a chart, thank you. */
async function sampleDeck() {
  const z = new JSZip();
  const slides = [
    slide(sp('ctrTitle', para('Green Valley Farms')) + sp('subTitle', para('Quarterly update') + para('Presented by Amaka')) + `<p:pic><p:blipFill><a:blip r:embed="rId9"/></p:blipFill><p:spPr><a:xfrm><a:ext cx="4000000" cy="3000000"/></a:xfrm></p:spPr></p:pic>`),
    slide(sp('title', para('What we achieved')) + sp('body', para('• Harvest up 18%') + para('Maize led', 1) + para('– Two new depots'))),
    slide(sp('title', para('Team targets')) + `<p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody>${para('Team')}</a:txBody></a:tc><a:tc><a:txBody>${para('Target')}</a:txBody></a:tc></a:tr><a:tr><a:tc><a:txBody>${para('North')}</a:txBody></a:tc><a:tc><a:txBody>${para('₦20m')}</a:txBody></a:tc></a:tr><a:tr><a:tc><a:txBody>${para('South')}</a:txBody></a:tc><a:tc/></a:tr><a:tr><a:tc><a:txBody>${para('TOTAL')}</a:txBody></a:tc><a:tc><a:txBody>${para('₦35m')}</a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>`),
    slide(sp('title', para('Sales by month')) + `<p:graphicFrame><a:graphic><a:graphicData><c:chart xmlns:c="c" r:id="rId5"/></a:graphicData></a:graphic></p:graphicFrame>`),
    slide(sp('title', para('Thank you')) + sp('body', para('Questions?'))),
  ];
  z.file('ppt/presentation.xml', `<?xml version="1.0"?><p:presentation ${NS}><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('')}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>`);
  z.file('ppt/_rels/presentation.xml.rels', rels(slides.map((_, i) => [`rId${i + 1}`, 'slide', `slides/slide${i + 1}.xml`])));
  slides.forEach((s, i) => z.file(`ppt/slides/slide${i + 1}.xml`, s));
  z.file('ppt/slides/_rels/slide1.xml.rels', rels([['rId9', 'image', '../media/image1.png']]));
  z.file('ppt/slides/_rels/slide4.xml.rels', rels([['rId5', 'chart', '../charts/chart1.xml']]));
  z.file('ppt/media/image1.png', new Uint8Array([137, 80, 78, 71]));
  const ser = (name: string, vals: number[]) => `<c:ser><c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>${name}</c:v></c:pt></c:strCache></c:strRef></c:tx><c:cat><c:strRef><c:strCache>${['July', 'August'].map((m, i) => `<c:pt idx="${i}"><c:v>${m}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:numCache>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache></c:numRef></c:val></c:ser>`;
  z.file('ppt/charts/chart1.xml', `<c:chartSpace xmlns:c="c"><c:chart><c:plotArea><c:barChart>${ser('Maize', [12.5, 14000])}${ser('Cassava', [8, 9.5])}</c:barChart></c:plotArea></c:chart></c:chartSpace>`);
  return z.generateAsync({ type: 'uint8array' });
}

describe('restyle: reading anyone’s PowerPoint', () => {
  it('turns each slide into the right kind', async () => {
    const d = await readPptxDeck(await sampleDeck(), 'Green.pptx');
    expect(d.title).toBe('Green Valley Farms');
    expect(d.slides.map((s) => s.slide.kind)).toEqual(['cover', 'bullets', 'table', 'table', 'thanks']);
    const [cover, points, table, chart, thanks] = d.slides.map((s) => s.slide as never as Record<string, unknown>);
    expect(cover).toMatchObject({ title: 'Green Valley Farms', week: 'Quarterly update', name: 'Presented by Amaka', image: 'media:ppt/media/image1.png' });
    expect(d.media.get('media:ppt/media/image1.png')?.type).toBe('image/png');
    expect(points.points).toEqual([
      { text: 'Harvest up 18%', level: 0 },
      { text: 'Maize led', level: 1 },
      { text: 'Two new depots', level: 1 },
    ]);
    expect(table.table).toEqual({ head: ['Team', 'Target'], rows: [['North', '₦20m'], ['South', '']], total: ['TOTAL', '₦35m'] });
    expect(chart.table).toEqual({ head: ['', 'Maize', 'Cassava'], rows: [['July', '12.5', '8'], ['August', '14,000', '9.5']], total: [] });
    expect(thanks).toMatchObject({ title: 'Thank you', sub: 'Questions?' });
    expect(d.notes).toEqual(['1 chart turned into table']);
  });

  it('cleans bullets people typed, and spots charts read as text', () => {
    expect(point('•  Hire drivers')).toEqual({ text: 'Hire drivers', level: 0 });
    expect(point('◦ Ikorodu')).toEqual({ text: 'Ikorodu', level: 1 });
    expect(point('-5% on last year')).toEqual({ text: '-5% on last year', level: 0 });
    expect(point('   ')).toBeNull();
    expect(looksLikeChart(['20', '15', '10', '5', 'July', 'August', 'September'])).toBe(true);
    expect(looksLikeChart(['Launch online ordering', 'Hire 5 more drivers', 'Partner with 3 supermarkets', 'Open in Epe', 'Cut costs'])).toBe(false);
  });

  it('puts PowerPoint’s 3D transition on every slide', async () => {
    const z = new JSZip();
    z.file('ppt/slides/slide1.xml', slide(''));
    z.file('ppt/slides/slide2.xml', slide(''));
    const out = await JSZip.loadAsync(await addTransitions(await z.generateAsync({ type: 'uint8array' }), 'cube'));
    for (const n of ['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml']) {
      const xml = await out.file(n)!.async('string');
      expect(xml).toContain('</p:clrMapOvr><mc:AlternateContent');
      expect(xml).toContain('<p14:prism/>');
      expect(xml).toContain('<mc:Fallback><p:transition spd="slow"><p:fade/></p:transition></mc:Fallback>');
    }
  });
});

describe('restyle: pictures from the file', async () => {
  const { setAside, withFilePictures, usesFilePictures } = await import('./load');
  const pic = 'data:image/jpeg;base64,AAAA';
  const bullets = { id: 'a', hidden: false, slide: { kind: 'bullets' as const, title: 'Santa at Jendol', subtitle: '', points: [{ text: 'Free gifts', level: 0 }], image: pic, ratio: 0.5 } };
  it('can be taken out and put back', () => {
    const out = [setAside(bullets, false), setAside({ id: 'b', hidden: false, slide: { kind: 'picture', title: '', subtitle: '', image: pic, ratio: 1 } }, false), setAside({ id: 'c', hidden: false, slide: { kind: 'picture', title: '', subtitle: '', image: pic, ratio: 1 } }, true)];
    expect(out[0].slide).toMatchObject({ kind: 'bullets', image: '' });
    expect(out[0].filePicture).toBe(pic);
    expect(out[1].hidden).toBe(true); // a slide that's only a picture, while pictures are off
    expect(out[2].slide).toEqual({ kind: 'thanks', title: 'Thank you', sub: '' }); // the last one: a "Thank you" picture
    expect(usesFilePictures(out)).toBe(false);
    const on = withFilePictures(out, true);
    expect(on[0].slide).toMatchObject({ image: pic, ratio: 0.5 });
    expect(on[1]).toMatchObject({ hidden: false, slide: { kind: 'picture', image: pic } });
    expect(on[2].slide).toMatchObject({ kind: 'picture', image: pic });
    expect(usesFilePictures(on)).toBe(true);
    expect(withFilePictures(on, false)).toEqual(out);
  });
});

describe('restyle: the photo inside a screenshot', async () => {
  const { mainArea } = await import('./trim');
  const W = 200, H = 160;
  // A noisy, colourful photo-like fill (seeded so the test never changes).
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const make = (paint: (x: number, y: number) => [number, number, number]) => {
    const d = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const [r, g, b] = paint(x, y);
      d.set([r, g, b, 255], (y * W + x) * 4);
    }
    return d;
  };
  const photo = (x: number, y: number): [number, number, number] => [60 + ((x * 3 + rnd() * 90) | 0) % 190, 90 + ((y * 2 + rnd() * 80) | 0) % 150, 40 + ((rnd() * 120) | 0)];
  it('cuts a Google-style screenshot down to its photo', () => {
    const d = make((x, y) => {
      if (y < 12) return [32, 33, 36]; // phone status bar
      if (y < 26) return x > 20 && x < 180 && y > 15 && y < 23 ? [241, 243, 244] : [255, 255, 255]; // search box
      if (y >= 40 && y < 130 && x >= 30 && x < 170) return photo(x, y); // the photo
      if (y >= 136 && y < 140 && x > 30 && x < 120 && x % 3 === 0) return [60, 64, 67]; // a caption
      return [255, 255, 255];
    });
    const a = mainArea(d, W, H)!;
    expect(a).not.toBeNull();
    expect(Math.abs(a.x * W - 30)).toBeLessThan(4);
    expect(Math.abs(a.y * H - 40)).toBeLessThan(4);
    expect(Math.abs(a.w * W - 140)).toBeLessThan(5);
    expect(Math.abs(a.h * H - 90)).toBeLessThan(5);
  });
  it('leaves a real photo alone', () => {
    expect(mainArea(make(photo), W, H)).toBeNull();
  });
  it('leaves a photo with a pale sky alone', () => {
    expect(mainArea(make((x, y) => (y < 50 ? [225 + y / 5 + rnd() * 8, 232 + rnd() * 8, 244 + rnd() * 8] : photo(x, y))), W, H)).toBeNull();
  });
  it('trims a plain white frame', () => {
    const a = mainArea(make((x, y) => (x >= 15 && x < 185 && y >= 15 && y < 145 ? photo(x, y) : [255, 255, 255])), W, H)!;
    expect(Math.abs(a.x * W - 15)).toBeLessThan(3);
    expect(Math.abs(a.w * W - 170)).toBeLessThan(4);
  });
});

describe('restyle: tables add themselves up', async () => {
  const { readAmount, tidyAmount, withTotals, autoCells } = await import('./tableMath');
  it('reads amounts the way managers type them', () => {
    expect(readAmount('2.1m')).toBe(2_100_000);
    expect(readAmount('500k')).toBe(500_000);
    expect(readAmount('₦3,436,953.25')).toBe(3436953.25);
    expect(readAmount('DDSM KENNETH')).toBeNull();
    expect(tidyAmount('2.1m')).toBe('2,100,000');
    expect(tidyAmount('1300000')).toBe('1,300,000');
    expect(tidyAmount('Oct')).toBe('Oct');
  });
  it('fills the TOTAL column and TOTAL row (the managers’ inflow slide)', () => {
    const t = withTotals({
      head: ['NAMES', 'INFLOW', 'IINFRASTRUCTURE', 'TOTAL', 'NEW CLIENTS'],
      rows: [
        ['DDSM KENNETH', '3,436,953.25', '', '', '1'],
        ['TCRO AKINLEYE', '3,100,000.00', '1,300,000.00', '', ''],
        ['DCRO ADEKUNLE TEAM TOTAL', '2.1m', '', '', '2'],
        ['RRO SAMUEL TEAM TOTAL', '', '', '', ''],
      ],
      total: ['TOTAL', '', '', '', ''],
    });
    expect(t.rows.map((r) => r[3])).toEqual(['3,436,953.25', '4,400,000.00', '2,100,000', '']);
    expect(t.total).toEqual(['TOTAL', '8,636,953.25', '1,300,000.00', '9,936,953.25', '3']);
    const auto = autoCells(t);
    expect(auto(0, 3)).toBe(true);
    expect(auto(0, 1)).toBe(false);
    expect(auto(-1, 4)).toBe(true);
  });
  it('adds the months into TOTAL', () => {
    const t = withTotals({ head: ['NAME', 'JULY', 'AUG', 'SEPT', 'OCT', 'TOTAL'], rows: [['TCRO AKINLEYE SIMEON', '5,200,000', '3,038,000', '4,426,000', '2.5m', '12,664,000']], total: [] });
    expect(t.rows[0][5]).toBe('15,164,000');
  });
  it('leaves tables without a total alone', () => {
    const t = { head: ['STAFF', 'STRENGHT'], rows: [['BE', '18']], total: [] };
    expect(withTotals(t)).toBe(t);
  });
});
