/**
 * Reads and writes Excel (.xlsx) and CSV files in the browser, with JSZip
 * (already used for PowerPoint import). Covers what accountants' sheets use:
 * text, numbers, dates, formulas (their saved result is read), merged group
 * headers, column widths and a frozen header.
 */
import JSZip from 'jszip';

/** A cell's value. Dates are read as "YYYY-MM-DD" text. */
export type Cell = string | number | boolean | null;

export interface SheetData {
  name: string;
  rows: Cell[][];
}

/* ------------------------------------------------------------------ reading */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? _;
  });
}

const attr = (tag: string, name: string) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? unescapeXml(m[1]) : null;
};

/** All the <t> text inside a shared string or inline string (rich text has several). */
function textOf(xml: string): string {
  let out = '';
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out += m[1] ? unescapeXml(m[1]) : '';
  return out;
}

/** "AB12" → 27 (0-based column). */
export function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** 27 → "AB" */
export function colLetter(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

/** Which cell styles are dates (so serial numbers like 46304 become 2026-10-09). */
function dateStyles(stylesXml: string): Set<number> {
  const custom = new Map<number, string>();
  for (const m of stylesXml.matchAll(/<numFmt\s[^>]*>/g)) {
    const id = Number(attr(m[0], 'numFmtId'));
    custom.set(id, attr(m[0], 'formatCode') ?? '');
  }
  const isDateFormat = (id: number) => {
    if (BUILTIN_DATE_FORMATS.has(id)) return true;
    const code = custom.get(id);
    if (!code) return false;
    // Strip quoted text, colours and escapes, then look for day/month/year codes.
    const bare = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
    return /[dy]/i.test(bare) || /m{3,}/i.test(bare);
  };
  const out = new Set<number>();
  const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? '';
  let i = 0;
  for (const m of xfs.matchAll(/<xf\s[^>]*?\/?>/g)) {
    if (isDateFormat(Number(attr(m[0], 'numFmtId') ?? 0))) out.add(i);
    i++;
  }
  return out;
}

/** Excel day number → "YYYY-MM-DD" (1900 or 1904 date system). */
export function serialToIso(serial: number, date1904 = false): string {
  const days = Math.floor(serial) + (date1904 ? 1462 : 0);
  const ms = Date.UTC(1899, 11, 30) + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

export async function readXlsx(data: ArrayBuffer | Uint8Array): Promise<SheetData[]> {
  const zip = await JSZip.loadAsync(data);
  const read = async (path: string) => (await zip.file(path)?.async('string')) ?? '';
  const workbook = await read('xl/workbook.xml');
  if (!workbook) throw new Error('This isn’t an Excel file.');
  const date1904 = /date1904="(1|true)"/.test(workbook);
  const rels = await read('xl/_rels/workbook.xml.rels');
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\s[^>]*>/g)) {
    const id = attr(m[0], 'Id');
    const target = attr(m[0], 'Target');
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`);
  }
  const shared: string[] = [];
  for (const m of (await read('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>|<si\s*\/>/g)) shared.push(m[1] ? textOf(m[1]) : '');
  const dates = dateStyles(await read('xl/styles.xml'));

  const sheets: SheetData[] = [];
  for (const m of workbook.matchAll(/<sheet\s[^>]*>/g)) {
    const name = attr(m[0], 'name') ?? `Sheet${sheets.length + 1}`;
    const rid = attr(m[0], 'r:id');
    const path = rid ? targets.get(rid) : undefined;
    const xml = path ? await read(path) : '';
    sheets.push({ name, rows: readSheet(xml, shared, dates, date1904) });
  }
  return sheets;
}

function readSheet(xml: string, shared: string[], dates: Set<number>, date1904: boolean): Cell[][] {
  const rows: Cell[][] = [];
  const data = /<sheetData[^>]*>([\s\S]*)<\/sheetData>/.exec(xml)?.[1] ?? '';
  for (const rm of data.matchAll(/<row\s([^>]*)>([\s\S]*?)<\/row>|<row\s([^>]*)\/>/g)) {
    const rowAttrs = rm[1] ?? rm[3] ?? '';
    const r = Number(/\br="(\d+)"/.exec(rowAttrs)?.[1] ?? rows.length + 1) - 1;
    const cells: Cell[] = [];
    let nextCol = 0;
    for (const cm of (rm[2] ?? '').matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = ` ${cm[1]}`;
      const ref = attr(tag, 'r');
      const col = ref ? colIndex(ref) : nextCol;
      nextCol = col + 1;
      const t = attr(tag, 't');
      const s = Number(attr(tag, 's') ?? 0);
      const inner = cm[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value: Cell = null;
      if (t === 's') value = v !== undefined ? (shared[Number(v)] ?? '') : '';
      else if (t === 'inlineStr') value = textOf(inner);
      else if (t === 'str') value = v !== undefined ? unescapeXml(v) : '';
      else if (t === 'b') value = v === '1';
      else if (t === 'e') value = null;
      else if (v !== undefined && v !== '') {
        const n = Number(v);
        value = Number.isFinite(n) ? (dates.has(s) ? serialToIso(n, date1904) : n) : unescapeXml(v);
      }
      cells[col] = value;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = null;
    rows[r] = cells;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

/** CSV with quotes, commas and line breaks inside quotes. Numbers stay text (the importer reads them). */
export function readCsv(text: string): Cell[][] {
  const s = text.replace(/^﻿/, '');
  const delim = (s.split('\n')[0].match(/;/g)?.length ?? 0) > (s.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => (c === '' ? null : c)));
}

/* ------------------------------------------------------------------ writing */

export interface OutCell {
  v: string | number | null;
  /** Show as a date (v is "YYYY-MM-DD"). */
  date?: boolean;
  /** 1 = header, 2 = group header. */
  style?: 'head' | 'group';
}

export interface OutSheet {
  name: string;
  rows: OutCell[][];
  widths?: number[]; // in characters
  merges?: string[]; // "A1:H1"
  /** Rows kept on screen while scrolling (their sheets: the two header rows). */
  freezeRows?: number;
}

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Characters XML doesn't allow at all.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** Excel sheet names: at most 31 characters, none of []:*?/\ , unique. */
export function safeSheetName(name: string, used: Set<string>): string {
  const base = (name.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Sheet').slice(0, 31);
  let n = base;
  for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  used.add(n.toLowerCase());
  return n;
}

function isoToSerial(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return Math.round((Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - Date.UTC(1899, 11, 30)) / 86400000);
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFE699"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function sheetXml(sh: OutSheet): string {
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  out.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">');
  if (sh.freezeRows) {
    out.push(`<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sh.freezeRows}" topLeftCell="A${sh.freezeRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`);
  }
  if (sh.widths?.length) {
    out.push(`<cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`);
  }
  out.push('<sheetData>');
  sh.rows.forEach((row, ri) => {
    const cells: string[] = [];
    row.forEach((c, ci) => {
      if (!c || c.v === null || c.v === '') {
        if (c?.style) cells.push(`<c r="${colLetter(ci)}${ri + 1}" s="${c.style === 'head' ? 1 : 2}"/>`);
        return;
      }
      const ref = `${colLetter(ci)}${ri + 1}`;
      const s = c.style === 'head' ? 1 : c.style === 'group' ? 2 : c.date ? 3 : 0;
      const sAttr = s ? ` s="${s}"` : '';
      const serial = c.date && typeof c.v === 'string' ? isoToSerial(c.v) : null;
      if (serial !== null) cells.push(`<c r="${ref}"${sAttr}><v>${serial}</v></c>`);
      else if (typeof c.v === 'number' && Number.isFinite(c.v)) cells.push(`<c r="${ref}"${sAttr}><v>${c.v}</v></c>`);
      else cells.push(`<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(String(c.v))}</t></is></c>`);
    });
    out.push(`<row r="${ri + 1}">${cells.join('')}</row>`);
  });
  out.push('</sheetData>');
  if (sh.merges?.length) out.push(`<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`);
  out.push('</worksheet>');
  return out.join('');
}

/** A real .xlsx that Excel and Google Sheets open as it is. */
export async function writeXlsx(sheets: OutSheet[]): Promise<Blob> {
  const bytes = await xlsxBytes(sheets);
  return new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** The .xlsx file's bytes (also used by the tests). */
export async function xlsxBytes(sheets: OutSheet[]): Promise<Uint8Array> {
  const zip = new JSZip();
  const used = new Set<string>();
  const named = sheets.map((s) => ({ ...s, name: safeSheetName(s.name, used) }));
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${named
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join('')}</Types>`,
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${named
      .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join('')}</sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join('')}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  zip.file('xl/styles.xml', STYLES);
  named.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)));
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/** Rows as CSV text (quotes added where needed). */
export function writeCsv(rows: (string | number | null)[][]): string {
  const q = (v: string | number | null) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n';
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
