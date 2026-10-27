/**
 * A spreadsheet grid for the accountant's sheet: works like Google Sheets for
 * the everyday things.
 *
 * - click a cell to select it, type to replace it, double-click / Enter / F2 to edit it
 * - arrows, Tab, Enter move; Shift + arrows or Shift + click select a block
 * - paste a block straight from Excel or Google Sheets (rows are added as needed)
 * - Ctrl/⌘ + C copies the block, Delete clears it, Ctrl/⌘ + D fills down
 * - suggestions while typing (banks, statuses, marketers from the roster)
 * - locked columns (S/N) can't be typed over
 */
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent as RKeyboardEvent, type ReactNode } from 'react';
import { readCell, showCell, type Column, type FieldKey, type Group, type Payment } from '../../lib/accounts/columns';

export interface CellChange {
  /** Row index in `rows`; an index ≥ rows.length means "add rows up to here". */
  index: number;
  key: FieldKey;
  value: string | number | null;
}

interface Props {
  columns: Column[];
  groups: Group[];
  rows: Payment[];
  /** S/N shown for each row (its place in the tab). */
  serial: (p: Payment, index: number) => number;
  /** Rows to mark, with the reason (e.g. "Looks like row 12 again"). */
  flags: Map<Payment, string>;
  /** Suggestions per column while typing (marketer names, banks…). */
  suggestions: Partial<Record<FieldKey, string[]>>;
  onChanges: (changes: CellChange[]) => void;
  onSelectRows?: (indexes: number[]) => void;
  /** Extra empty rows drawn under the data, ready to type into. */
  spareRows?: number;
  readOnly?: boolean;
}

interface Pos {
  r: number;
  c: number;
}

const rid = (p: Payment) => p.id ?? p.tmp ?? '';

/** Excel / Sheets clipboard text → cells (tabs and new lines; quoted cells may hold either). */
export function parseClipboard(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\n$/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === '\t') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

export function Grid({ columns, groups, rows, serial, flags, suggestions, onChanges, onSelectRows, spareRows = 20, readOnly = false }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<Pos>({ r: 0, c: 1 });
  const [focus, setFocus] = useState<Pos>({ r: 0, c: 1 });
  const [editing, setEditing] = useState<{ r: number; c: number; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();
  const total = rows.length + spareRows;
  const lastCol = columns.length - 1;

  const range = useMemo(
    () => ({ r1: Math.min(anchor.r, focus.r), r2: Math.max(anchor.r, focus.r), c1: Math.min(anchor.c, focus.c), c2: Math.max(anchor.c, focus.c) }),
    [anchor, focus],
  );

  useEffect(() => {
    onSelectRows?.(Array.from({ length: range.r2 - range.r1 + 1 }, (_, i) => range.r1 + i).filter((i) => i < rows.length));
  }, [range.r1, range.r2, rows.length, onSelectRows]);

  // Keep the focused cell in view.
  useEffect(() => {
    const el = wrap.current?.querySelector<HTMLElement>(`[data-cell="${focus.r}:${focus.c}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [focus]);

  const clamp = (p: Pos): Pos => ({ r: Math.max(0, Math.min(total - 1, p.r)), c: Math.max(0, Math.min(lastCol, p.c)) });

  const moveTo = (p: Pos, extend = false) => {
    const n = clamp(p);
    setFocus(n);
    if (!extend) setAnchor(n);
  };

  const valueAt = (r: number, c: number) => (r < rows.length ? rows[r][columns[c].key] : null);

  const startEdit = (r: number, c: number, initial?: string) => {
    if (readOnly || columns[c].locked) return;
    setError(null);
    setEditing({ r, c, value: initial ?? showCell(columns[c], valueAt(r, c)).replace(/,/g, columns[c].type === 'money' ? '' : ',') });
  };

  const commit = (move: Pos | null) => {
    if (!editing) return;
    const col = columns[editing.c];
    const res = readCell(col, editing.value);
    if ('error' in res) {
      setError(res.error);
      return;
    }
    const before = valueAt(editing.r, editing.c);
    if (res.value !== before && !(res.value === '' && before === null) && !(res.value === null && before === '')) {
      onChanges([{ index: editing.r, key: col.key, value: res.value }]);
    }
    setEditing(null);
    setError(null);
    if (move) moveTo(move);
    wrap.current?.focus({ preventScroll: true });
  };

  const clearRange = () => {
    if (readOnly) return;
    const changes: CellChange[] = [];
    for (let r = range.r1; r <= Math.min(range.r2, rows.length - 1); r++)
      for (let c = range.c1; c <= range.c2; c++) {
        const col = columns[c];
        if (col.locked) continue;
        const v = rows[r][col.key];
        if (v !== null && v !== '') changes.push({ index: r, key: col.key, value: col.type === 'text' ? '' : null });
      }
    if (changes.length) onChanges(changes);
  };

  const fillDown = () => {
    if (readOnly || range.r2 <= range.r1 || range.r1 >= rows.length) return;
    const changes: CellChange[] = [];
    for (let c = range.c1; c <= range.c2; c++) {
      const col = columns[c];
      if (col.locked) continue;
      const v = rows[range.r1][col.key];
      for (let r = range.r1 + 1; r <= range.r2; r++) changes.push({ index: r, key: col.key, value: v as string | number | null });
    }
    onChanges(changes);
  };

  const onKeyDown = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (editing) return; // the input handles its own keys
    const mod = e.ctrlKey || e.metaKey;
    const { r, c } = focus;
    const go = (p: Pos) => {
      e.preventDefault();
      moveTo(p, e.shiftKey);
    };
    switch (e.key) {
      case 'ArrowDown':
        return go({ r: mod ? Math.max(rows.length - 1, 0) : r + 1, c });
      case 'ArrowUp':
        return go({ r: mod ? 0 : r - 1, c });
      case 'ArrowRight':
        return go({ r, c: mod ? lastCol : c + 1 });
      case 'ArrowLeft':
        return go({ r, c: mod ? 0 : c - 1 });
      case 'Home':
        return go({ r: mod ? 0 : r, c: 0 });
      case 'End':
        return go({ r: mod ? Math.max(rows.length - 1, 0) : r, c: lastCol });
      case 'PageDown':
        return go({ r: r + 15, c });
      case 'PageUp':
        return go({ r: r - 15, c });
      case 'Tab':
        e.preventDefault();
        return moveTo({ r, c: e.shiftKey ? c - 1 : c + 1 });
      case 'Enter':
      case 'F2':
        e.preventDefault();
        return startEdit(r, c);
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        return clearRange();
      case 'Escape':
        return setAnchor(focus);
    }
    if (mod && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      return fillDown();
    }
    if (mod && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      setAnchor({ r: 0, c: 0 });
      setFocus({ r: Math.max(rows.length - 1, 0), c: lastCol });
      return;
    }
    // Typing a character starts editing with it, like a spreadsheet.
    if (!mod && !e.altKey && e.key.length === 1) {
      e.preventDefault();
      startEdit(r, c, e.key);
    }
  };

  const onCopy = (e: ClipboardEvent) => {
    if (editing) return;
    const lines: string[] = [];
    for (let r = range.r1; r <= range.r2; r++) {
      const cells: string[] = [];
      for (let c = range.c1; c <= range.c2; c++) {
        const col = columns[c];
        const v = r < rows.length ? (col.key === 'sn' ? serial(rows[r], r) : rows[r][col.key]) : '';
        const text = col.type === 'date' ? showCell(col, v) : v === null || v === undefined ? '' : String(v);
        cells.push(/[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
      }
      lines.push(cells.join('\t'));
    }
    e.clipboardData.setData('text/plain', lines.join('\n'));
    e.preventDefault();
  };

  const onPaste = (e: ClipboardEvent) => {
    if (editing || readOnly) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    const block = parseClipboard(text);
    const changes: CellChange[] = [];
    let bad = 0;
    // One copied cell pasted on a selected block fills the whole block.
    const single = block.length === 1 && block[0].length === 1;
    const rowsN = single ? range.r2 - range.r1 + 1 : block.length;
    const colsN = single ? range.c2 - range.c1 + 1 : Math.max(...block.map((b) => b.length));
    for (let i = 0; i < rowsN; i++) {
      for (let j = 0; j < colsN; j++) {
        const c = range.c1 + j;
        if (c > lastCol) continue;
        const col = columns[c];
        if (col.locked) continue;
        const raw = single ? block[0][0] : (block[i]?.[j] ?? '');
        const res = readCell(col, raw);
        if ('error' in res) {
          bad++;
          continue;
        }
        changes.push({ index: range.r1 + i, key: col.key, value: res.value });
      }
    }
    if (changes.length) onChanges(changes);
    setFocus({ r: range.r1 + rowsN - 1, c: Math.min(lastCol, range.c1 + colsN - 1) });
    setAnchor({ r: range.r1, c: range.c1 });
    setError(bad ? `${bad} pasted cell${bad === 1 ? ' didn’t fit its column (e.g. text in AMOUNT) and was' : 's didn’t fit their columns (e.g. text in AMOUNT) and were'} skipped.` : null);
  };

  const cellDown = (r: number, c: number, shift: boolean) => {
    if (editing) commit(null);
    if (!shift && r === focus.r && c === focus.c && r === anchor.r && c === anchor.c) {
      // A second tap on the selected cell edits it (handy on phones).
      startEdit(r, c);
      return;
    }
    moveTo({ r, c }, shift);
    wrap.current?.focus({ preventScroll: true });
  };
  // Stable callbacks for the rows (so only rows that change redraw), always calling the latest code.
  const latest = useRef({ cellDown, startEdit });
  latest.current = { cellDown, startEdit };
  const onCellDown = useCallback((r: number, c: number, shift: boolean) => latest.current.cellDown(r, c, shift), []);
  const onDouble = useCallback((r: number, c: number) => latest.current.startEdit(r, c), []);

  const editCol = editing ? columns[editing.c] : null;
  // Why the row in focus is marked ⚠ (shown under the grid: phones can't hover).
  const focusFlag = focus.r < rows.length ? (flags.get(rows[focus.r]) ?? null) : null;
  const options = editCol ? (suggestions[editCol.key] ?? editCol.options ?? []) : [];
  const widths = columns.map((c) => c.width);

  return (
    <div className="min-w-0">
      <div
        ref={wrap}
        tabIndex={0}
        role="grid"
        aria-label="Sheet"
        aria-rowcount={total}
        aria-colcount={columns.length}
        onKeyDown={onKeyDown}
        onCopy={onCopy}
        onPaste={onPaste}
        className="relative max-h-[68vh] overflow-auto rounded-2xl border border-line bg-white outline-none focus-visible:ring-4 focus-visible:ring-blue/15"
      >
        <table className="table-fixed border-separate border-spacing-0 text-[13px]" style={{ width: widths.reduce((a, b) => a + b, 0) }}>
          <colgroup>
            {widths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr>
              {groups.map((g, i) => (
                <th key={i} colSpan={g.span} className={`h-7 border-b border-r border-line px-2 text-left text-[11px] font-extrabold tracking-wide ${g.label ? 'bg-sun-soft text-[#7a4f00]' : 'bg-paper'}`}>
                  {g.label}
                </th>
              ))}
            </tr>
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  title={c.locked ? `${c.header} (filled in by WeekDeck)` : c.fromMarketer ? `${c.header} (filled in from the marketer’s details)` : c.header}
                  className={`h-9 border-b border-r border-line bg-[#eef1fa] px-2 text-left align-middle text-[11px] font-extrabold leading-tight ${i === 0 ? 'sticky left-0 z-10' : ''}`}
                >
                  <span className="line-clamp-2">{c.header}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: total }, (_, r) => {
              const p = rows[r];
              const inRows = r >= range.r1 && r <= range.r2;
              return (
                <GridRow
                  key={p ? rid(p) : `spare${r}`}
                  r={r}
                  p={p}
                  sn={p ? serial(p, r) : null}
                  columns={columns}
                  flag={p ? (flags.get(p) ?? null) : null}
                  selC1={inRows ? range.c1 : -1}
                  selC2={inRows ? range.c2 : -1}
                  focusC={focus.r === r ? focus.c : -1}
                  editingC={editing && editing.r === r ? editing.c : -1}
                  onCellDown={onCellDown}
                  onDouble={onDouble}
                  editor={
                    editing && editing.r === r ? (
                      <input
                        autoFocus
                        list={options.length ? listId : undefined}
                        value={editing.value}
                        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                        onBlur={() => commit(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commit({ r: editing.r + (e.shiftKey ? -1 : 1), c: editing.c });
                          } else if (e.key === 'Tab') {
                            e.preventDefault();
                            commit({ r: editing.r, c: editing.c + (e.shiftKey ? -1 : 1) });
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setEditing(null);
                            setError(null);
                            wrap.current?.focus({ preventScroll: true });
                          }
                        }}
                        className={`absolute inset-0 z-10 w-full min-w-full border-2 bg-white px-1.5 text-[13px] outline-none ${error ? 'border-bad' : 'border-blue'}`}
                        style={{ fontSize: 13 }}
                        inputMode={editCol && (editCol.type === 'money' || editCol.type === 'number') ? 'decimal' : undefined}
                        aria-label={editCol?.header}
                      />
                    ) : null
                  }
                />
              );
            })}
          </tbody>
        </table>
        {options.length > 0 && (
          <datalist id={listId}>
            {options.slice(0, 400).map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        )}
      </div>
      <p className={`mt-2 min-h-5 px-1 text-xs font-semibold ${error ? 'text-bad' : focusFlag ? 'text-[#a05a00]' : 'text-muted'}`} aria-live="polite">
        {error ?? (focusFlag ? `⚠ Row ${serial(rows[focus.r], focus.r)}: ${focusFlag}` : 'Type to fill a cell · paste straight from Excel or Google Sheets · Ctrl/⌘+D fills down · Delete clears')}
      </p>
    </div>
  );
}

interface RowProps {
  r: number;
  p: Payment | undefined;
  sn: number | null;
  columns: Column[];
  flag: string | null;
  selC1: number;
  selC2: number;
  focusC: number;
  editingC: number;
  onCellDown: (r: number, c: number, shift: boolean) => void;
  onDouble: (r: number, c: number) => void;
  editor: ReactNode;
}

const GridRow = memo(function GridRow({ r, p, sn, columns, flag, selC1, selC2, focusC, editingC, onCellDown, onDouble, editor }: RowProps) {
  return (
    <tr className={p ? '' : 'opacity-70'}>
      {columns.map((col, c) => {
        const selected = c >= selC1 && c <= selC2;
        const isFocus = c === focusC;
        const text = !p ? '' : col.key === 'sn' ? String(sn ?? '') : showCell(col, p[col.key]);
        const right = col.type === 'money' || col.type === 'number';
        return (
          <td
            key={col.key}
            data-cell={`${r}:${c}`}
            role="gridcell"
            aria-selected={selected}
            title={c === 0 && flag ? flag : text.length > 28 ? text : undefined}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              onCellDown(r, c, e.shiftKey);
            }}
            onDoubleClick={() => onDouble(r, c)}
            className={`relative h-8 max-w-0 cursor-cell truncate border-b border-r border-line px-1.5 ${right ? 'text-right tabular-nums' : ''} ${
              c === 0 ? `sticky left-0 z-[5] text-center font-bold ${flag ? 'bg-sun-soft text-[#7a4f00]' : 'bg-paper text-muted'}` : col.locked ? 'bg-paper' : selected ? 'bg-blue-soft' : 'bg-white'
            } ${isFocus ? 'outline-2 -outline-offset-2 outline-blue' : ''}`}
          >
            {c === 0 && flag ? '⚠ ' : ''}
            {text}
            {c === editingC ? editor : null}
          </td>
        );
      })}
    </tr>
  );
});
