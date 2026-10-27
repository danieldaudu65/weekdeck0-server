/**
 * Excel and CSV out of the workbook, in the exact layout of the accountants'
 * own files: one file per sheet type (Workflow / New client / Infrastructure),
 * one tab per chosen sheet tab, the group row, the header row, then the rows.
 */
import JSZip from 'jszip';
import { KINDS, MONTH_NAMES, columnsFor, groupsFor, type Column, type Kind, type Payment } from './columns';
import { colLetter, writeCsv, writeXlsx, xlsxBytes, type OutCell, type OutSheet } from './xlsx';

export interface ExportChoice {
  month: string;
  kinds: Kind[];
  tabs: string[];
}

/** "2026-10", land → "OCTOBER WORKFLOW 2026" (like their file names). */
export function fileBase(month: string, kind: Kind): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTH_NAMES[m - 1].toUpperCase()} ${KINDS.find((k) => k.id === kind)!.file} ${y}`;
}

/** Account numbers and IDs go out as numbers (like their sheet) unless a leading 0 would be lost. */
const numberLike = (s: string) => /^[1-9]\d{0,14}$/.test(s);

function cellFor(col: Column, p: Payment, index: number): OutCell {
  if (col.key === 'sn') return { v: index + 1 };
  const v = p[col.key];
  if (v === null || v === '') return { v: null };
  if (col.type === 'date') return { v: String(v), date: true };
  if (typeof v === 'number') return { v };
  if (['accountNumber', 'spouseAccount', 'cabalId', 'form'].includes(col.key) && numberLike(String(v))) return { v: Number(v) };
  return { v: String(v) };
}

export function rowsOf(payments: Payment[], kind: Kind, tab: string, month: string): Payment[] {
  return payments.filter((p) => p.month === month && p.kind === kind && p.tab === tab).sort((a, b) => a.pos - b.pos);
}

export function sheetFor(payments: Payment[], kind: Kind, tab: string, month: string): OutSheet {
  const cols = columnsFor(kind);
  const groups = groupsFor(kind);
  const groupRow: OutCell[] = [];
  const merges: string[] = [];
  let c = 0;
  for (const g of groups) {
    for (let i = 0; i < g.span; i++) groupRow.push(i === 0 && g.label ? { v: g.label, style: 'group' } : { v: null, style: g.label ? 'group' : undefined });
    if (g.label && g.span > 1) merges.push(`${colLetter(c)}1:${colLetter(c + g.span - 1)}1`);
    c += g.span;
  }
  const headRow: OutCell[] = cols.map((col) => ({ v: col.header, style: 'head' }));
  const data = rowsOf(payments, kind, tab, month).map((p, i) => cols.map((col) => cellFor(col, p, i)));
  return { name: tab, rows: [groupRow, headRow, ...data], widths: cols.map((col) => Math.round(col.width / 7)), merges, freezeRows: 2 };
}

export interface OutFile {
  name: string;
  blob: Blob;
}

/** One .xlsx per sheet type; several files come as one .zip. */
export async function exportExcel(payments: Payment[], choice: ExportChoice): Promise<OutFile> {
  const files: { name: string; sheets: OutSheet[] }[] = choice.kinds.map((kind) => ({
    name: `${fileBase(choice.month, kind)}.xlsx`,
    sheets: choice.tabs.map((tab) => sheetFor(payments, kind, tab, choice.month)),
  }));
  if (files.length === 1) return { name: files[0].name, blob: await writeXlsx(files[0].sheets) };
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, await xlsxBytes(f.sheets));
  const [y, m] = choice.month.split('-').map(Number);
  return { name: `${MONTH_NAMES[m - 1].toUpperCase()} ${y} SHEETS.zip`, blob: await zip.generateAsync({ type: 'blob' }) };
}

/**
 * Rows only (no headers), in the sheet's column order, for Google Sheets'
 * "Append rows to current sheet". Dates as 2026-10-09, which every Sheets
 * language setting reads as a date.
 */
export function csvRows(payments: Payment[], kind: Kind, tab: string, month: string, startSn = 1, withHeader = false): string {
  const cols = columnsFor(kind);
  const rows = rowsOf(payments, kind, tab, month).map((p, i) =>
    cols.map((col) => {
      if (col.key === 'sn') return startSn + i;
      const v = p[col.key];
      return v === null || v === undefined ? null : (v as string | number);
    }),
  );
  return writeCsv(withHeader ? [cols.map((c) => c.header), ...rows] : rows);
}

export async function exportCsv(payments: Payment[], choice: ExportChoice, withHeader = false): Promise<OutFile> {
  const parts: { name: string; text: string }[] = [];
  for (const kind of choice.kinds) for (const tab of choice.tabs) parts.push({ name: `${fileBase(choice.month, kind)} - ${tab}.csv`, text: csvRows(payments, kind, tab, choice.month, 1, withHeader) });
  if (parts.length === 1) return { name: parts[0].name, blob: new Blob(['﻿' + parts[0].text], { type: 'text/csv;charset=utf-8' }) };
  const zip = new JSZip();
  for (const p of parts) zip.file(p.name, '﻿' + p.text);
  const [y, m] = choice.month.split('-').map(Number);
  return { name: `${MONTH_NAMES[m - 1].toUpperCase()} ${y} CSV.zip`, blob: await zip.generateAsync({ type: 'blob' }) };
}
