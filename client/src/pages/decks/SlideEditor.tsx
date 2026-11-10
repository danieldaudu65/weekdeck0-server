/** Edit one slide of a restyled deck: its words, table, picture, and kind. Shows the result live. */
import { autoCells, tidyAmount, withTotals } from '../../lib/restyle/tableMath';
import { useRef, useState, type ReactNode } from 'react';
import { ImagePlus, Trash2, X } from 'lucide-react';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { SlideCanvas } from '../../components/SlideCanvas';
import type { DeckSlide } from '../../lib/deck';
import { layoutSlide } from '../../lib/looks';
import { brandLaid, type Brand } from '../../lib/brand';
import { shrinkPicture } from '../../lib/restyle/load';
import type { RestyleSlide } from '../../lib/restyle/read';

type Kind = 'cover' | 'bullets' | 'table' | 'picture' | 'thanks';
const KINDS: { id: Kind; label: string }[] = [
  { id: 'cover', label: 'Cover' },
  { id: 'bullets', label: 'Points' },
  { id: 'table', label: 'Table' },
  { id: 'picture', label: 'Picture' },
  { id: 'thanks', label: 'Big title' },
];

const titleOf = (s: DeckSlide) => ('title' in s ? s.title : '');
const imageOf = (s: DeckSlide) => ('image' in s ? s.image : '');
const subOf = (s: DeckSlide) => (s.kind === 'cover' ? s.week : s.kind === 'thanks' ? s.sub : 'subtitle' in s ? s.subtitle : '');

/** Points as lines: a sub-point starts with "- ". */
const pointsText = (s: DeckSlide) => (s.kind === 'bullets' ? s.points.map((p) => (p.level ? `- ${p.text}` : p.text)).join('\n') : '');
const readPoints = (text: string) =>
  text
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim())
    .map((l) => (/^\s*[-–•]\s+/.test(l) || /^\s{2,}/.test(l) ? { text: l.replace(/^\s*[-–•]?\s*/, ''), level: 1 } : { text: l.trim(), level: 0 }));

/** The same slide as another kind, keeping what it can. */
function asKind(s: DeckSlide, kind: Kind, ratio = 0): DeckSlide {
  const title = titleOf(s);
  const image = imageOf(s);
  const sub = subOf(s);
  const points = s.kind === 'bullets' ? s.points : s.kind === 'table' ? s.table.rows.map((r) => ({ text: r.filter(Boolean).join(' · '), level: 0 })) : [];
  switch (kind) {
    case 'cover':
      return { kind, title, week: sub, weekNo: 0, range: '', team: '', name: s.kind === 'cover' ? s.name : '', role: s.kind === 'cover' ? s.role : '', image, kicker: '', badge: '' };
    case 'thanks':
      return { kind, title, sub };
    case 'picture':
      return { kind, title, subtitle: s.kind === 'cover' ? '' : sub, image, ratio: 'ratio' in s ? s.ratio : ratio };
    case 'table':
      return s.kind === 'table' ? s : { kind, title, subtitle: sub, table: { head: ['', ''], rows: points.length ? points.map((p) => [p.text, '']) : [['', '']], total: [] } };
    default:
      return { kind: 'bullets', title, subtitle: s.kind === 'cover' ? '' : sub, points: points.length ? points : [{ text: sub || 'Your point', level: 0 }], image, ratio: 'ratio' in s ? s.ratio : ratio };
  }
}

export function SlideEditor({ item, lookId, logo = 'adron', deckTitle, onChange, onClose }: { item: RestyleSlide; lookId: string; logo?: Brand; deckTitle: string; onChange: (s: RestyleSlide) => void; onClose: () => void }) {
  const toast = useToast();
  const pick = useRef<HTMLInputElement>(null);
  const [pointsDraft, setPointsDraft] = useState(() => pointsText(item.slide));
  const s = item.slide;
  const set = (slide: DeckSlide) => onChange({ ...item, slide });
  const setField = (patch: Record<string, unknown>) => set({ ...s, ...patch } as DeckSlide);
  const laid = brandLaid(layoutSlide(s, lookId, { teamName: deckTitle, page: 1, total: 1 }), s, logo);
  const showingOriginal = Boolean(item.original) && s.kind === 'picture' && s.image === item.original;

  const addPicture = async (file: File | undefined) => {
    if (!file) return;
    try {
      const p = await shrinkPicture(file, 1600);
      if (s.kind === 'cover') setField({ image: p.image });
      else if (s.kind === 'bullets' || s.kind === 'picture') setField({ image: p.image, ratio: p.ratio });
      else set({ ...asKind(s, 'bullets'), image: p.image, ratio: p.ratio } as DeckSlide);
    } catch {
      toast('That picture couldn’t be opened.', 'bad');
    }
  };

  const cell = (v: string, onV: (x: string) => void, bold = false, opts: { auto?: boolean; amount?: boolean } = {}) =>
    opts.auto ? (
      <div title="Worked out for you" className={`flex h-9 w-full min-w-[90px] items-center rounded-lg bg-blue/10 px-2 text-sm text-blue ${bold ? 'font-extrabold' : 'font-bold'}`}>
        {v || '—'}
      </div>
    ) : (
      <input value={v} onChange={(e) => onV(e.target.value)} onBlur={opts.amount ? (e) => tidyAmount(e.target.value) !== e.target.value && onV(tidyAmount(e.target.value)) : undefined} className={`h-9 w-full min-w-[90px] rounded-lg border border-line bg-white px-2 text-sm ${bold ? 'font-bold' : ''}`} />
    );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 backdrop-blur-sm md:items-center md:p-6" role="dialog" aria-modal="true" aria-label="Edit slide" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[94dvh] w-full max-w-5xl flex-col rounded-t-3xl bg-paper shadow-2xl md:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => (
              <button key={k.id} type="button" aria-pressed={s.kind === k.id} onClick={() => s.kind !== k.id && set(asKind(s, k.id, item.originalRatio))} className={`h-9 rounded-lg px-3 text-sm font-bold ${s.kind === k.id ? 'bg-ink text-white' : 'bg-white text-muted ring-1 ring-line hover:text-ink'}`}>
                {k.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-xl hover:bg-ink/5" aria-label="Close">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[1.15fr_1fr]">
          <div className="space-y-3 md:sticky md:top-0 md:self-start">
            <div className="overflow-hidden rounded-2xl shadow-lg ring-1 ring-line">
              <SlideCanvas bg={laid.bg} shapes={laid.shapes} label="Preview" />
            </div>
            {item.original && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 text-sm shadow-sm">
                <span className="font-bold">The page as it was</span>
                <Button size="sm" variant={showingOriginal ? 'dark' : 'soft'} onClick={() => set({ kind: 'picture', title: titleOf(s), subtitle: '', image: item.original!, ratio: item.originalRatio ?? 0 })}>
                  Show it
                </Button>
                {showingOriginal && (
                  <Button size="sm" variant="ghost" onClick={() => set(asKind({ ...s, image: '' } as DeckSlide, 'bullets'))}>
                    Use the text instead
                  </Button>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Label text="Title">
              <textarea value={titleOf(s)} onChange={(e) => setField({ title: e.target.value })} rows={2} className="w-full resize-none rounded-xl border border-line bg-white px-3 py-2 text-base font-bold" />
            </Label>

            {s.kind === 'cover' && (
              <>
                <Label text="Line under the title">
                  <input value={s.week} onChange={(e) => setField({ week: e.target.value })} className="h-11 w-full rounded-xl border border-line bg-white px-3" />
                </Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Label text="Name">
                    <input value={s.name} onChange={(e) => setField({ name: e.target.value })} className="h-11 w-full rounded-xl border border-line bg-white px-3" />
                  </Label>
                  <Label text="Role">
                    <input value={s.role} onChange={(e) => setField({ role: e.target.value })} className="h-11 w-full rounded-xl border border-line bg-white px-3" />
                  </Label>
                </div>
              </>
            )}
            {s.kind === 'thanks' && (
              <Label text="Line under it">
                <input value={s.sub} onChange={(e) => setField({ sub: e.target.value })} className="h-11 w-full rounded-xl border border-line bg-white px-3" />
              </Label>
            )}
            {(s.kind === 'bullets' || s.kind === 'table' || s.kind === 'picture') && (
              <Label text="Subtitle">
                <input value={s.subtitle} onChange={(e) => setField({ subtitle: e.target.value })} className="h-11 w-full rounded-xl border border-line bg-white px-3" />
              </Label>
            )}
            {s.kind === 'bullets' && (
              <Label text="Points" hint="One per line · start with “- ” for a sub-point">
                <textarea
                  value={pointsDraft}
                  onChange={(e) => {
                    setPointsDraft(e.target.value);
                    setField({ points: readPoints(e.target.value) });
                  }}
                  rows={Math.min(12, Math.max(4, pointsDraft.split('\n').length + 1))}
                  className="w-full rounded-xl border border-line bg-white px-3 py-2 leading-7"
                />
              </Label>
            )}
            {s.kind === 'table' && (
              <div className="space-y-2">
                <div className="-mx-1 overflow-x-auto px-1">
                  <table className="w-full border-separate border-spacing-1">
                    <tbody>
                      {[s.table.head, ...s.table.rows, ...(s.table.total.length ? [s.table.total] : [])].map((r, ri, all) => {
                        const isTotalRow = s.table.total.length > 0 && ri === all.length - 1;
                        const auto = autoCells(s.table);
                        return (
                        <tr key={ri}>
                          {r.map((c, ci) =>
                            <td key={ci}>
                              {cell(
                                c,
                                (x) => {
                                  const rows = all.map((row, i) => (i === ri ? row.map((v, j) => (j === ci ? x : v)) : row));
                                  const hasTotal = s.table.total.length > 0;
                                  setField({ table: withTotals({ head: rows[0], rows: rows.slice(1, hasTotal ? -1 : undefined), total: hasTotal ? rows[rows.length - 1] : [] }) });
                                },
                                ri === 0 || isTotalRow,
                                { auto: ri > 0 && ci > 0 && auto(isTotalRow ? -1 : ri - 1, ci), amount: ri > 0 && ci > 0 },
                              )}
                            </td>,
                          )}
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="soft" onClick={() => setField({ table: { ...s.table, rows: [...s.table.rows, s.table.head.map(() => '')] } })}>
                    + Row
                  </Button>
                  <Button size="sm" variant="soft" onClick={() => setField({ table: withTotals({ head: [...s.table.head, ''], rows: s.table.rows.map((r) => [...r, '']), total: s.table.total.length ? [...s.table.total, ''] : [] }) })}>
                    + Column
                  </Button>
                  {s.table.rows.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => setField({ table: withTotals({ ...s.table, rows: s.table.rows.slice(0, -1) }) })}>
                      − Last row
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setField({ table: withTotals({ ...s.table, total: s.table.total.length ? [] : s.table.head.map((_, i) => (i === 0 ? 'TOTAL' : '')) }) })}>
                    {s.table.total.length ? 'No total row' : '+ Total row'}
                  </Button>
                </div>
                <p className="text-xs font-semibold text-muted">
                  <span className="rounded bg-blue/10 px-1.5 py-0.5 font-bold text-blue">Blue</span> totals add up by themselves. Type amounts like 2.1m or 500k.
                </p>
              </div>
            )}
            {s.kind !== 'table' && (s.kind !== 'thanks' || item.filePicture) && (
              <div className="flex flex-wrap items-center gap-2">
                <input ref={pick} type="file" accept="image/*" className="sr-only" onChange={(e) => void addPicture(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
                <Button size="sm" variant="soft" icon={<ImagePlus className="size-4" aria-hidden />} onClick={() => pick.current?.click()}>
                  {imageOf(s) ? 'Change picture' : 'Add a picture'}
                </Button>
                {item.filePicture && imageOf(s) !== item.filePicture && (
                  <Button size="sm" variant="ghost" onClick={() => (s.kind === 'cover' ? setField({ image: item.filePicture }) : s.kind === 'bullets' || s.kind === 'picture' ? setField({ image: item.filePicture, ratio: item.filePictureRatio ?? 0 }) : set({ ...asKind(s, 'bullets'), image: item.filePicture!, ratio: item.filePictureRatio ?? 0 } as DeckSlide))}>
                    Use the file’s picture
                  </Button>
                )}
                {imageOf(s) && s.kind !== 'picture' && (
                  <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setField({ image: '' })}>
                    Remove picture
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex justify-end border-t border-line px-5 py-3">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}

function Label({ text, hint, children }: { text: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between gap-2 text-sm font-extrabold">
        {text}
        {hint && <span className="text-xs font-semibold text-muted">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
