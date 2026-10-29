/**
 * Edit one uploaded slide: its title, and every cell of its table (add or
 * remove rows), with a Recalculate button that works the totals out again.
 * The preview on the right uses the chosen look.
 */
import { useEffect, useMemo, useState } from 'react';
import { Calculator, Plus, Trash2, X } from 'lucide-react';
import { Button } from '../../components/ui';
import { SlideCanvas } from '../../components/SlideCanvas';
import { layoutSlide } from '../../lib/looks';
import type { Look } from '../../lib/templates';
import { toDeckSlide, type ImportedSlide } from '../../lib/accounts/slideImport';
import { checkDeck, recalcSlide, roles } from '../../lib/accounts/slideCheck';

export function SlideEditor({ slide, month, region, look, onSave, onDelete, onClose }: { slide: ImportedSlide; month: string; region: string; look: Look; onSave: (s: ImportedSlide) => void; onDelete: () => void; onClose: () => void }) {
  const [s, setS] = useState<ImportedSlide>(slide);
  const [note, setNote] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const laid = useMemo(() => layoutSlide(toDeckSlide(s, { region, month }), look, { teamName: region, page: 1, total: 1 }), [s, look, region, month]);
  const off = useMemo(() => checkDeck([s], { month, roster: [] }).filter((f) => f.group === 'sum').length, [s, month]);
  const width = Math.max(s.head.length, ...s.rows.map((r) => r.length), s.total.length);
  // Figures right-aligned, words (names, designations, months) left.
  const r = roles(s.head);
  const isNum = (c: number) => [r.inflow, r.infra, r.total, r.nc].includes(c) && c > 0;
  const w = (c: number) => (c === 0 ? 'w-72' : isNum(c) ? 'w-36 text-right tabular-nums' : 'w-32');

  const setCell = (row: number | 'head' | 'total', col: number, v: string) =>
    setS((x) => {
      const next = { ...x, head: [...x.head], rows: x.rows.map((r) => [...r]), total: [...x.total] };
      if (row === 'head') next.head[col] = v;
      else if (row === 'total') {
        if (!next.total.length) next.total = next.head.map(() => '');
        next.total[col] = v;
      } else next.rows[row][col] = v;
      return next;
    });

  const recalc = () => {
    const before = JSON.stringify(s);
    const next = recalcSlide(s, month);
    setS(next);
    setNote(JSON.stringify(next) === before ? 'Everything already adds up.' : 'Totals worked out again from the rows.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 backdrop-blur-sm md:items-center md:p-6" role="dialog" aria-modal="true" aria-label="Edit slide">
      <div className="flex max-h-[96dvh] w-full max-w-6xl flex-col rounded-t-3xl bg-paper shadow-2xl md:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-xl font-extrabold">Edit slide</h2>
          <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-xl hover:bg-ink/5" aria-label="Close">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
          <div className="mx-auto w-full max-w-xl">
            <p className="mb-2 text-sm font-bold text-muted">Preview</p>
            <div className="overflow-hidden rounded-xl shadow-lg ring-1 ring-ink/5">
              <SlideCanvas bg={laid.bg} shapes={laid.shapes} label="Preview" />
            </div>
          </div>
          <div className="min-w-0 space-y-4">
            <label className="block text-sm font-bold">
              Title
              <input value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-line bg-white px-3 font-semibold" />
            </label>
            {s.kind !== 'table' ? (
              <label className="block text-sm font-bold">
                {s.kind === 'text' ? 'Lines (one per line)' : s.kind === 'picture' ? 'Caption under the title' : 'Subtitle'}
                <textarea
                  value={s.kind === 'text' ? s.lines.join('\n') : s.subtitle}
                  onChange={(e) => setS(s.kind === 'text' ? { ...s, lines: e.target.value.split('\n') } : { ...s, subtitle: e.target.value })}
                  rows={s.kind === 'text' ? 6 : 2}
                  className="mt-1 w-full rounded-xl border border-line bg-white p-3"
                />
              </label>
            ) : (
              <>
                <div className="-mx-5 overflow-x-auto px-5">
                  <table className="w-max text-sm">
                    <thead>
                      <tr>
                        {Array.from({ length: width }, (_, c) => (
                          <th key={c} className="p-0.5">
                            <input value={s.head[c] ?? ''} onChange={(e) => setCell('head', c, e.target.value)} className={`h-9 rounded-lg border border-line bg-[#eef1fa] px-2 text-xs font-extrabold ${w(c)}`} aria-label={`Heading ${c + 1}`} />
                          </th>
                        ))}
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {s.rows.map((r, ri) => (
                        <tr key={ri}>
                          {Array.from({ length: width }, (_, c) => (
                            <td key={c} className="p-0.5">
                              <input value={r[c] ?? ''} onChange={(e) => setCell(ri, c, e.target.value)} className={`h-9 rounded-lg border border-line bg-white px-2 ${w(c)} ${c === 0 ? 'font-bold' : ''}`} aria-label={`Row ${ri + 1}, ${s.head[c] || `column ${c + 1}`}`} />
                            </td>
                          ))}
                          <td className="p-0.5">
                            <button type="button" onClick={() => setS({ ...s, rows: s.rows.filter((_, i) => i !== ri) })} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-bad/10 hover:text-bad" aria-label={`Remove row ${ri + 1}`}>
                              <Trash2 className="size-4" aria-hidden />
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr>
                        {Array.from({ length: width }, (_, c) => (
                          <td key={c} className="p-0.5 pt-2">
                            <input value={s.total[c] ?? ''} placeholder={c === 0 ? 'TOTAL' : ''} onChange={(e) => setCell('total', c, e.target.value)} className={`h-9 rounded-lg border border-line bg-sun-soft px-2 font-extrabold ${w(c)}`} aria-label={`TOTAL, ${s.head[c] || `column ${c + 1}`}`} />
                          </td>
                        ))}
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="soft" icon={<Plus className="size-4" aria-hidden />} onClick={() => setS({ ...s, rows: [...s.rows, Array(width).fill('')] })}>
                    Add row
                  </Button>
                  <Button size="sm" icon={<Calculator className="size-4" aria-hidden />} onClick={recalc}>
                    Recalculate totals
                  </Button>
                  <span className={`text-sm font-semibold ${off ? 'text-[#a05a00]' : 'text-muted'}`}>{note || (off ? `${off} total${off === 1 ? ' doesn’t' : 's don’t'} add up: tap Recalculate` : 'All totals add up')}</span>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
          <Button
            variant="danger"
            icon={<Trash2 className="size-4" aria-hidden />}
            onClick={() => {
              if (window.confirm('Remove this uploaded slide?')) onDelete();
            }}
          >
            Remove slide
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => onSave(s)}>Save slide</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
