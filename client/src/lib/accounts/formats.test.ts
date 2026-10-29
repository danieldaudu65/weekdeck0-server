import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { pdfPageToRaw, pdfTable, readDocx, readOdp, sheetsToSlides } from './otherFormats';
import { toImported } from './slideImport';
import type { PdfTextPiece } from '../pdfLayout';

const odpCell = (t: string) => (t ? `<table:table-cell><text:p>${t}</text:p></table:table-cell>` : '<table:table-cell table:style-name="ce1"/>');

describe('other slide formats', () => {
  it('reads LibreOffice slides (.odp), empty cells included', async () => {
    const zip = new JSZip();
    const row = (cells: string[]) => `<table:table-row>${cells.map(odpCell).join('')}</table:table-row>`;
    zip.file(
      'content.xml',
      `<office:document-content><office:body><office:presentation>
        <draw:page draw:name="p1" presentation:presentation-page-layout-name="AL1T0"><draw:frame presentation:class="title"><draw:text-box><text:p>FAGBA CONTINENT PERFORMANCE REVIEW</text:p></draw:text-box></draw:frame></draw:page>
        <draw:page draw:name="p2"><draw:frame presentation:class="title"><draw:text-box><text:p>SOCIAL TEAM INFLOW AND NEW CLIENTS FOR SEPTEMBER, 2026</text:p></draw:text-box></draw:frame>
          <draw:frame><table:table>${row(['MARKETERS NAME', 'DESIGNATION', 'INFLOW', 'INFRAS', 'TOTAL', 'NC'])}${row(['SOBANDE BABATUNDE', 'BE', '20,000.00', '-', '20,000.00', '-'])}${row(['TOTAL', '', '20,000.00', '-', '20,000.00', '-'])}</table:table></draw:frame></draw:page>
      </office:presentation></office:body></office:document-content>`,
    );
    const slides = toImported(await readOdp(await zip.generateAsync({ type: 'uint8array' })), ['FAGBA']);
    expect(slides.map((s) => s.kind)).toEqual(['cover', 'table']);
    expect(slides[1].branch).toBe('FAGBA');
    expect(slides[1].total).toEqual(['TOTAL', '', '20,000.00', '-', '20,000.00', '-']);
  });

  it('reads the tables of a Word file, each under its heading', async () => {
    const zip = new JSZip();
    const p = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
    const tr = (cells: string[]) => `<w:tr>${cells.map((c) => `<w:tc>${p(c)}</w:tc>`).join('')}</w:tr>`;
    zip.file('word/document.xml', `<w:document><w:body>${p('ABULE EGBA SENIOR STAFF INFLOW FOR SEPTEMBER 2026')}<w:tbl>${tr(['MARKETERS NAME', 'INFLOW', 'INFRAS', 'TOTAL'])}${tr(['OYERINDE OLUSOLA', '8,750,000.00', '-', '8,750,000.00'])}</w:tbl></w:body></w:document>`);
    const slides = toImported(await readDocx(await zip.generateAsync({ type: 'uint8array' })), ['FAGBA', 'ABULE EGBA']);
    expect(slides).toHaveLength(1);
    expect(slides[0]).toMatchObject({ kind: 'table', branch: 'ABULE EGBA', title: 'ABULE EGBA SENIOR STAFF INFLOW FOR SEPTEMBER 2026' });
    expect(slides[0].rows[0][0]).toBe('OYERINDE OLUSOLA');
  });

  it('makes a slide of each sheet, and sends payment sheets to the Workbook', () => {
    const r = sheetsToSlides([
      { name: 'S2', rows: [['FAGBA SENIOR STAFF FOR SEPTEMBER, 2026'], ['MARKETERS NAME', null, 'INFLOW'], ['KENNETH IPOGAH', null, 3333694.7]] },
      { name: 'OGBAFAGBA', rows: [['CLIENT DETAILS'], ['S/N', 'BRANCH', 'DATE', 'NAME AS ON ALERT PRINT OUT']] },
    ]);
    expect(r.slides).toHaveLength(1);
    expect(r.slides[0].titleText).toBe('FAGBA SENIOR STAFF FOR SEPTEMBER, 2026');
    expect(r.slides[0].tables[0]).toEqual([
      ['MARKETERS NAME', 'INFLOW'],
      ['KENNETH IPOGAH', '3,333,694.70'],
    ]);
    expect(r.notes[0]).toMatch(/payments sheet/);
  });

  it('reads a PDF table whose names wrap and whose cells sit at different heights', () => {
    const at = (str: string, x: number, y: number, size = 14, w = str.length * 7): PdfTextPiece => ({ str, x, y, w, size });
    const pieces = [
      at('SOCIAL TEAM INFLOW AND NEW CLIENTS FOR SEPTEMBER,', 100, 438, 17),
      at('2026.', 330, 421, 17),
      at('DESIGNATI', 200, 370),
      at('MARKETERS NAME', 60, 353),
      at('ON', 220, 353),
      at('INFLOW', 300, 353),
      at('INFRAS', 400, 353),
      at('TOTAL', 500, 353),
      at('NC', 610, 353),
      // a name over two lines, figures on the second
      at('MOSAKU OLUKUNLE', 60, 266),
      at('OLUWASEUN', 80, 248),
      at('BE', 222, 248),
      at('-', 320, 248),
      at('-', 420, 248),
      at('-', 520, 248),
      at('-', 615, 248),
      // cells middle-aligned at different heights
      at('KOMOLAFE OLAMIDE', 60, 215),
      at('RRO', 220, 207),
      at('12,143,000.00', 290, 199),
      at('3,200,000.00', 390, 199),
      at('15,343,000.00', 490, 199),
      at('5.00', 612, 199),
      at('TOTAL', 100, 85),
      at('12,143,000.00', 290, 85),
      at('3,200,000.00', 390, 89),
      at('15,343,000.00', 490, 89),
      at('5.00', 612, 85),
    ];
    const t = pdfTable(pieces)!;
    expect(t.title).toBe('SOCIAL TEAM INFLOW AND NEW CLIENTS FOR SEPTEMBER, 2026.');
    expect(t.table[0]).toEqual(['MARKETERS NAME', 'DESIGNATION', 'INFLOW', 'INFRAS', 'TOTAL', 'NC']);
    expect(t.table[1]).toEqual(['MOSAKU OLUKUNLE OLUWASEUN', 'BE', '-', '-', '-', '-']);
    expect(t.table[2]).toEqual(['KOMOLAFE OLAMIDE', 'RRO', '12,143,000.00', '3,200,000.00', '15,343,000.00', '5.00']);
    expect(t.table[3][0]).toBe('TOTAL');
  });

  it('joins a PDF cover title written over two lines', () => {
    const raw = pdfPageToRaw({ index: 1, paragraphs: [{ text: 'FAGBA CONTINENT', ph: 'title' }, { text: 'PERFORMANCE REVIEW' }, { text: 'FOR THE MONTH OF' }, { text: 'SEPTEMBER, 2026' }], tables: [] }, 0, []);
    expect(raw.titleText).toBe('FAGBA CONTINENT PERFORMANCE REVIEW');
    expect(toImported([raw], ['FAGBA'])[0]).toMatchObject({ kind: 'cover', branch: 'FAGBA' });
  });
});
