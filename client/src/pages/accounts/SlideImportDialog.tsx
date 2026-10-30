/**
 * Upload a deck (their own PowerPoint) → WeekDeck checks every slide (sums,
 * TOTAL rows, number formats, names, titles, the workbook) → the accountant
 * keeps or unticks each fix → the slides are saved for the month, ready to edit
 * and restyle. It can also fill "Earlier months" and the teams from the deck.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, History, Info, Presentation, Users, X } from 'lucide-react';
import { useAccounts } from './AccountsApp';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../lib/api';
import { accApi } from '../../lib/accounts/api';
import { figuresByBranch, type Marketer } from '../../lib/accounts/accDeck';
import { addMonths, monthName, nameKey, type Payment } from '../../lib/accounts/columns';
import { deckMonth, SlideImportError, type ImportedSlide } from '../../lib/accounts/slideImport';
import { ACCEPT, readAnyFile } from '../../lib/accounts/anyDeck';
import { ImportError } from '../../lib/importPptx';
import { applyFixes, checkDeck, historyFromDeck, teamsFromDeck, type Fix, type FixGroup } from '../../lib/accounts/slideCheck';
import { bestMatch } from '../../lib/accounts/names';

const GROUPS: { id: FixGroup; title: string; hint: string }[] = [
  { id: 'sum', title: 'Calculations', hint: 'Row totals and TOTAL rows worked out again from the figures' },
  { id: 'name', title: 'Names', hint: 'Spellings checked against your roster and across the slides' },
  { id: 'title', title: 'Titles', hint: 'Typos and the month' },
  { id: 'format', title: 'Number formats', hint: 'Written the same way everywhere' },
  { id: 'workbook', title: 'Against your workbook', hint: 'Off unless you tick them: the slide may count differently' },
  { id: 'note', title: 'To look at', hint: 'Can’t be fixed by WeekDeck: check them yourself' },
];

export function SlideImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (month: string) => void }) {
  const { acc, saveMe, marketers, setMarketers, month: openMonth } = useAccounts();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [slides, setSlides] = useState<ImportedSlide[] | null>(null);
  const [month, setMonth] = useState(openMonth);
  const [problem, setProblem] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [existing, setExisting] = useState<{ fileName: string; slides: ImportedSlide[] } | null>(null);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [useHistory, setUseHistory] = useState(true);
  const [useTeams, setUseTeams] = useState(true);
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const branches = useMemo(() => [...new Set([...acc.tabs.map((t) => t.branch || t.name), ...marketers.map((m) => m.branch)].filter(Boolean))], [acc.tabs, marketers]);

  /** One or several files, of any kind WeekDeck reads; their slides one after the other. */
  const pick = async (files: FileList | File[] | null | undefined) => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    setProblem('');
    setReading(true);
    const all: ImportedSlide[] = [];
    const read: string[] = [];
    const said: string[] = [];
    const bad: string[] = [];
    for (const f of list) {
      try {
        const r = await readAnyFile(f, branches);
        all.push(...r.slides);
        read.push(f.name);
        for (const n of r.notes) said.push(list.length > 1 ? `${f.name}: ${n}` : n);
      } catch (err) {
        bad.push(err instanceof SlideImportError || err instanceof ImportError ? `${list.length > 1 ? `${f.name}: ` : ''}${err.message}` : `${f.name} couldn’t be read.`);
      }
    }
    setReading(false);
    setProblem(bad.join(' '));
    if (!all.length) return;
    setSlides(all);
    setNotes(said);
    setFileName(read.length === 1 ? read[0] : `${read[0]} + ${read.length - 1} more`);
    setMonth(deckMonth(all) ?? openMonth);
  };

  // The month's workbook and anything uploaded before (to check against, and to replace).
  useEffect(() => {
    if (!slides) return;
    let alive = true;
    setPayments(null);
    Promise.all([accApi.payments(month), accApi.imported(month)])
      .then(([p, imp]) => {
        if (!alive) return;
        setPayments(p.payments);
        setExisting(imp.slides.length ? { fileName: imp.fileName, slides: imp.slides } : null);
      })
      .catch(() => alive && (setPayments([]), setExisting(null)));
    return () => {
      alive = false;
    };
  }, [slides, month]);

  // Go through the deck.
  useEffect(() => {
    if (!slides || payments === null) return;
    const hasBook = payments.some((p) => (p.amount ?? 0) > 0);
    const workbook = hasBook
      ? { branches: figuresByBranch({ month, payments, marketers, tabs: acc.tabs, countAll: acc.deck.countAll }), label: acc.deck.countAll ? 'all payments' : 'confirmed payments' }
      : null;
    setFixes(checkDeck(slides, { month, roster: marketers, workbook }));
  }, [slides, payments, month, marketers, acc.tabs, acc.deck.countAll]);

  const fixed = useMemo(() => (slides ? applyFixes(slides, fixes) : []), [slides, fixes]);
  const history = useMemo(() => historyFromDeck(fixed, month.slice(0, 4)), [fixed, month]);
  const teamEntries = useMemo(() => teamsFromDeck(fixed), [fixed]);
  const teamCount = new Set(teamEntries.filter((e) => e.team).map((e) => `${e.branch}|${e.team}`)).size;
  const newPeople = teamEntries.filter((e) => !findOnRoster(e.name, marketers)).length;

  const setFix = (id: string, patch: Partial<Fix>) => setFixes((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const pickName = (f: Fix, to: string) => setFix(f.id, { name: { ...f.name!, to }, apply: nameKey(to) !== nameKey(f.name!.from) });

  const toFix = fixes.filter((f) => f.group !== 'note');
  const ticked = toFix.filter((f) => f.apply).length;
  const ready = Boolean(slides) && payments !== null;

  const run = async () => {
    if (!slides) return;
    setBusy('Saving the slides…');
    try {
      const keep = !replace && existing ? existing.slides : [];
      await accApi.saveImported(month, [...keep, ...fixed], replace || !existing ? fileName : `${existing.fileName} + ${fileName}`);
      if (useHistory && history.length) {
        setBusy('Filling earlier months…');
        const key = (h: { branch: string; month: string }) => `${h.branch}|${h.month}`;
        const from = new Set(history.map(key));
        await saveMe({ history: [...acc.history.filter((h) => !from.has(key(h))), ...history] });
      }
      if (useTeams && teamEntries.length) {
        setBusy('Updating teams…');
        const upserts: Partial<Marketer>[] = teamEntries.map((e) => {
          const m = findOnRoster(e.name, marketers);
          return m
            ? { ...m, team: e.team, lead: e.lead, branch: e.branch || m.branch, designation: m.designation || e.designation }
            : { name: e.name, designation: e.designation, branch: e.branch, team: e.team, lead: e.lead };
        });
        const r = await accApi.saveMarketers(upserts);
        setMarketers(r.marketers);
      }
      toast(`${fixed.length} slides imported${ticked ? `, ${ticked} fix${ticked === 1 ? '' : 'es'} made` : ''}`);
      onDone(month);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'The slides couldn’t be saved. Try again.', 'bad');
      setBusy(null);
    }
  };

  const kinds = slides
    ? { cover: slides.filter((s) => s.kind === 'cover').length, table: slides.filter((s) => s.kind === 'table').length, picture: slides.filter((s) => s.kind === 'picture').length, other: slides.filter((s) => s.kind === 'text' || s.kind === 'thanks').length }
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 backdrop-blur-sm md:items-center md:p-6" role="dialog" aria-modal="true" aria-label="Import slides">
      <div className="flex max-h-[94dvh] w-full max-w-3xl flex-col rounded-t-3xl bg-paper shadow-2xl md:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-xl font-extrabold">Import slides</h2>
            <p className="text-sm text-muted">Checked first, then yours to edit and restyle.</p>
          </div>
          <button type="button" onClick={onClose} disabled={Boolean(busy)} className="grid size-10 shrink-0 place-items-center rounded-xl hover:bg-ink/5" aria-label="Close">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <input ref={input} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => void pick(e.target.files).finally(() => (e.target.value = ''))} />
          {!slides ? (
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void pick(e.dataTransfer.files);
              }}
              className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-blue/40 bg-white px-4 py-8 text-center transition hover:border-blue"
            >
              <FileUp className="size-8 text-blue" aria-hidden />
              <span className="font-extrabold">{reading ? 'Reading…' : 'Choose your slides'}</span>
              <span className="text-sm text-muted">PowerPoint, PDF, Excel, Word or photos</span>
            </button>
          ) : (
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="flex min-w-0 items-center gap-2 font-extrabold">
                  <Presentation className="size-5 shrink-0 text-blue" aria-hidden />
                  <span className="truncate">{fileName}</span>
                </p>
                <button type="button" className="text-sm font-bold text-muted hover:text-ink" onClick={() => input.current?.click()} disabled={Boolean(busy) || reading}>
                  {reading ? 'Reading…' : 'Choose other files'}
                </button>
              </div>
              <p className="mt-1 text-sm text-muted">
                {slides.length} slides: {kinds!.cover} cover{kinds!.cover === 1 ? '' : 's'}, {kinds!.table} table{kinds!.table === 1 ? '' : 's'}
                {kinds!.picture ? `, ${kinds!.picture} picture${kinds!.picture === 1 ? '' : 's'}` : ''}
                {kinds!.other ? `, ${kinds!.other} other` : ''}
                {[...new Set(slides.map((s) => s.branch).filter(Boolean))].length > 0 && ` · branches ${[...new Set(slides.map((s) => s.branch).filter(Boolean))].join(', ')}`}
              </p>
              {notes.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs font-medium text-muted">
                  {notes.map((n) => (
                    <li key={n} className="flex gap-1">
                      <Info className="mt-0.5 size-3 shrink-0" aria-hidden /> {n}
                    </li>
                  ))}
                </ul>
              )}
              <label className="mt-3 block text-sm font-bold">
                Month
                <select value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-line bg-white px-2 font-semibold sm:w-64">
                  {Array.from({ length: 25 }, (_, i) => addMonths(openMonth, 12 - i)).map((m) => (
                    <option key={m} value={m}>
                      {monthName(m)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {problem && (
            <p className="flex gap-2 rounded-xl bg-bad/10 px-3 py-2 text-sm font-semibold text-bad">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {problem}
            </p>
          )}

          {slides && !ready && <p className="text-center text-sm font-semibold text-muted">Checking the slides…</p>}

          {ready && (
            <>
              <div className={`flex items-start gap-3 rounded-2xl px-4 py-3 ${toFix.length ? 'bg-sun-soft text-[#7a4f00]' : 'bg-ok/10 text-ok'}`}>
                {toFix.length ? <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />}
                <p className="text-sm font-bold">
                  {toFix.length
                    ? `${toFix.length} thing${toFix.length === 1 ? '' : 's'} to correct · ${ticked} ticked`
                    : kinds!.table
                      ? 'All totals and names check out.'
                      : 'No tables to check in these slides.'}
                  {payments!.some((p) => (p.amount ?? 0) > 0) ? '' : ` (no ${monthName(month)} rows in your workbook)`}
                </p>
              </div>

              {GROUPS.map((g) => {
                const list = fixes.filter((f) => f.group === g.id);
                if (!list.length) return null;
                return (
                  <section key={g.id} className="rounded-2xl bg-white p-4 shadow-sm">
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-extrabold">
                        {g.title} <span className="text-sm font-semibold text-muted">· {list.length}</span>
                      </h3>
                      {g.id !== 'note' && (
                        <button type="button" className="text-sm font-bold text-blue" onClick={() => setFixes((fs) => fs.map((f) => (f.group === g.id && (!f.name || f.name.to) ? { ...f, apply: !list.every((x) => x.apply) } : f)))}>
                          {list.every((x) => x.apply) ? 'Untick all' : 'Tick all'}
                        </button>
                      )}
                    </div>
                    <p className="mb-2 text-xs text-muted">{g.hint}</p>
                    <ul className="space-y-2">
                      {list.map((f) => (
                        <li key={f.id} className="flex items-start gap-2 text-sm">
                          {g.id === 'note' ? (
                            <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                          ) : (
                            <input type="checkbox" checked={f.apply} disabled={Boolean(f.name && !f.name.to)} onChange={(e) => setFix(f.id, { apply: e.target.checked })} className="mt-0.5 size-4 shrink-0 accent-[var(--color-blue)]" aria-label="Fix this" />
                          )}
                          <span className="min-w-0 flex-1">
                            {f.text}
                            {f.name && (
                              <select
                                value={f.name.to ?? ''}
                                onChange={(e) => pickName(f, e.target.value)}
                                className="ml-2 mt-1 h-8 max-w-full rounded-lg border border-line px-2 text-sm font-semibold"
                                aria-label={`Right spelling of ${f.name.from}`}
                              >
                                {!f.name.to && <option value="">Pick the right spelling…</option>}
                                {[...new Set(f.name.options)].map((o) => (
                                  <option key={o} value={o}>
                                    {nameKey(o) === nameKey(f.name!.from) ? `Keep “${o}”` : `Use “${o}”`}
                                  </option>
                                ))}
                              </select>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}

              <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
                <h3 className="font-extrabold">Also from this deck</h3>
                {history.length > 0 && (
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input type="checkbox" checked={useHistory} onChange={(e) => setUseHistory(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-blue)]" />
                    <span>
                      <b>
                        <History className="mr-1 inline size-4" aria-hidden />
                        Fill “Earlier months”
                      </b>{' '}
                      · {history.length} month{history.length === 1 ? '' : 's'}
                    </span>
                  </label>
                )}
                {teamEntries.length > 0 && (
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input type="checkbox" checked={useTeams} onChange={(e) => setUseTeams(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-blue)]" />
                    <span>
                      <b>
                        <Users className="mr-1 inline size-4" aria-hidden />
                        Set teams on your roster
                      </b>{' '}
                      · {teamCount} team{teamCount === 1 ? '' : 's'}, {teamEntries.length} marketers
                      {newPeople ? ` (${newPeople} new)` : ''}
                    </span>
                  </label>
                )}
                {existing && (
                  <div className="space-y-1 text-sm">
                    <p className="font-bold">{monthName(month)} already has {existing.slides.length} uploaded slides ({existing.fileName || 'an earlier file'}).</p>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="replace" checked={replace} onChange={() => setReplace(true)} className="size-4 accent-[var(--color-blue)]" /> Replace them with this deck
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="replace" checked={!replace} onChange={() => setReplace(false)} className="size-4 accent-[var(--color-blue)]" /> Keep them and add this deck after
                    </label>
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
          <p className="text-sm font-semibold text-muted">{busy ?? (slides ? `${slides.length} slides · ${monthName(month)}` : '')}</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={Boolean(busy)}>
              Cancel
            </Button>
            <Button onClick={run} loading={Boolean(busy)} disabled={!ready}>
              {ticked ? `Fix ${ticked} and import` : 'Import slides'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The roster entry for a name from the deck (already renamed by the name fixes). */
function findOnRoster(name: string, roster: Marketer[]): Marketer | null {
  const k = nameKey(name);
  const exact = roster.find((m) => nameKey(m.name) === k || m.aliases.some((a) => nameKey(a) === k));
  if (exact) return exact;
  const b = bestMatch(name, roster, (m) => [m.name, ...m.aliases]);
  return b && b.score >= 0.97 ? b.item : null;
}
