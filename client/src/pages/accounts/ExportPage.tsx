/**
 * Export: the month's slides (pick which, put them in order, rename, pick a
 * look → PowerPoint / PDF / present) and the sheets (pick tabs → Excel, or
 * rows for Google Sheets).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Eye, EyeOff, FileUp, History, Pencil, Play, Presentation, Printer, RotateCcw, SquarePen } from 'lucide-react';
import { useAccounts, Panel } from './AccountsApp';
import { Button, Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { SlideCanvas } from '../../components/SlideCanvas';
import { LookPicker } from '../../components/LookPicker';
import { Presenter } from '../../components/Presenter';
import { layoutSlide } from '../../lib/looks';
import { lookById, PALETTES, STYLES } from '../../lib/templates';
import { accApi } from '../../lib/accounts/api';
import { applyPrefs, buildAccountsDeck, type DeckItem, type DeckPrefs, type HistoryRow, type SummaryCell } from '../../lib/accounts/accDeck';
import { toDeckSlide, type ImportedSlide } from '../../lib/accounts/slideImport';
import { SlideImportDialog } from './SlideImportDialog';
import { SlideEditor } from './SlideEditor';
import { MONTH_NAMES, addMonths, monthName, parseMoney, showMoney } from '../../lib/accounts/columns';
import { setPrintJob } from '../../lib/accounts/printJob';

export function ExportPage() {
  const { acc, saveMe, marketers, month, setMonth, ledger } = useAccounts();
  const toast = useToast();
  const navigate = useNavigate();
  const year = month.slice(0, 4);
  const [summary, setSummary] = useState<SummaryCell[] | null>(null);
  const [prefs, setPrefs] = useState<DeckPrefs>(acc.deck);
  const [presenting, setPresenting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  // Slides uploaded for this month (the accountant's own PowerPoint, checked on import).
  const [uploaded, setUploaded] = useState<{ fileName: string; slides: ImportedSlide[] } | null>(null);
  const [importingSlides, setImportingSlides] = useState(false);
  const [editSlide, setEditSlide] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUploaded(null);
    accApi
      .imported(month)
      .then((r) => alive && setUploaded({ fileName: r.fileName, slides: r.slides }))
      .catch(() => alive && setUploaded({ fileName: '', slides: [] }));
    return () => {
      alive = false;
    };
  }, [month]);
  const saveUploaded = async (slides: ImportedSlide[]) => {
    const prev = uploaded;
    setUploaded({ fileName: uploaded?.fileName ?? '', slides });
    try {
      const r = await accApi.saveImported(month, slides, uploaded?.fileName ?? '');
      setUploaded({ fileName: r.fileName, slides: r.slides });
    } catch {
      setUploaded(prev);
      toast('Couldn’t save the slide. Try again.', 'bad');
    }
  };

  // Save whatever is waiting first, so the totals include the latest typing.
  useEffect(() => {
    let alive = true;
    setSummary(null);
    ledger
      .flush()
      .then(() => accApi.summary(year))
      .then((r) => alive && setSummary(r.cells))
      .catch(() => alive && setSummary([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  // Remember the choices (a moment after the last change).
  const saveTimer = useRef<number | undefined>(undefined);
  const choose = (next: DeckPrefs) => {
    setPrefs(next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveMe({ deck: next }).catch(() => toast('Couldn’t remember your slide choices', 'bad'));
    }, 700);
  };

  const generated = useMemo(
    () =>
      !ledger.rows.length
        ? [] // no workbook rows this month: only uploaded slides (if any)
        : buildAccountsDeck({
        region: acc.region,
        month,
        payments: ledger.rows,
        marketers,
        tabs: acc.tabs,
        summary: summary ?? [],
        history: acc.history,
        countAll: prefs.countAll,
      }),
    [acc.region, acc.tabs, acc.history, month, ledger.rows, marketers, summary, prefs.countAll],
  );
  const uploadedGroup = `UPLOADED${uploaded?.fileName ? ` · ${uploaded.fileName.replace(/\.pptx$/i, '')}` : ''}`;
  const items = useMemo(() => {
    const mine: DeckItem[] = (uploaded?.slides ?? []).map((s) => ({
      id: `imp:${s.id}`,
      group: uploadedGroup,
      label: s.kind === 'cover' ? `Cover · ${s.branch || s.title}` : s.kind === 'thanks' ? 'Thank you' : s.title.replace(/\s+(INFLOW|FOR)\b.*$/i, '') || (s.kind === 'picture' ? 'Picture' : 'Slide'),
      extra: false,
      slide: toDeckSlide(s, { region: acc.region, month }),
    }));
    // Uploaded slides go before WeekDeck's closing "Thank you".
    const at = generated.findIndex((g) => g.id === 'thanks');
    return at >= 0 ? [...generated.slice(0, at), ...mine, ...generated.slice(at)] : [...generated, ...mine];
  }, [generated, uploaded, uploadedGroup, acc.region, month]);
  const list = useMemo(() => applyPrefs(items, prefs), [items, prefs]);
  const look = useMemo(() => lookById(prefs.lookId), [prefs.lookId]);
  const chosen = list.filter((x) => x.on).map((x) => x.item.slide);
  const laidAll = useMemo(() => list.map((x, i) => layoutSlide(x.item.slide, look, { teamName: acc.region, page: i + 1, total: list.length })), [list, look, acc.region]);
  const laidChosen = useMemo(() => chosen.map((s, i) => layoutSlide(s, look, { teamName: acc.region, page: i + 1, total: chosen.length })), [chosen, look, acc.region]);

  const baseId = (id: string) => id.replace(/#\d+$/, '');
  const toggle = (id: string, extra: boolean, on: boolean) => {
    const b = baseId(id);
    if (extra) choose({ ...prefs, on: on ? prefs.on.filter((x) => x !== b) : [...prefs.on, b] });
    else choose({ ...prefs, off: on ? [...prefs.off, b] : prefs.off.filter((x) => x !== b) });
  };
  const move = (index: number, dir: -1 | 1) => {
    const ids = list.map((x) => x.item.id);
    const to = index + dir;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    choose({ ...prefs, order: ids });
  };
  const rename = (id: string, title: string) => {
    const others = prefs.titles.filter((t) => t.id !== id);
    choose({ ...prefs, titles: title.trim() ? [...others, { id, title: title.trim() }] : others });
    setEditing(null);
  };

  const fileName = `${acc.region} ${monthName(month)}`.replace(/[^\w .-]+/g, '').trim();
  const deckTitle = `${acc.region}: ${monthName(month)} performance review`;

  const downloadPptx = async () => {
    setBusy('pptx');
    try {
      const { downloadPptx: dl } = await import('../../lib/exportPptx');
      await dl(chosen, look, { teamName: acc.region, title: deckTitle, fileName });
      toast('PowerPoint downloaded');
    } catch {
      toast('The PowerPoint couldn’t be made. Try again.', 'bad');
    } finally {
      setBusy(null);
    }
  };
  const printPdf = () => {
    setPrintJob({ slides: chosen, lookId: look.id, title: fileName, teamName: acc.region });
    navigate('/accounts/print');
  };

  const loading = ledger.loading || summary === null || uploaded === null;
  /** Tick or untick every slide of a section. */
  const setGroup = (group: string, on: boolean) => {
    const its = list.filter((x) => x.item.group === group).map((x) => x.item);
    const ids = new Set(its.map((it) => baseId(it.id)));
    const extras = new Set(its.filter((it) => it.extra).map((it) => baseId(it.id)));
    const plain = [...ids].filter((id) => !extras.has(id));
    choose({
      ...prefs,
      on: on ? [...new Set([...prefs.on, ...extras])] : prefs.on.filter((x) => !extras.has(x)),
      off: on ? prefs.off.filter((x) => !plain.includes(x)) : [...new Set([...prefs.off, ...plain])],
    });
  };
  const editing1 = editSlide ? uploaded?.slides.find((s) => s.id === editSlide) : null;
  let lastGroup = '';

  return (
    <div className="min-w-0 space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-blue">Export</p>
          <div className="mt-1 flex items-center gap-2">
            <button type="button" aria-label="Month before" onClick={() => setMonth(addMonths(month, -1))} className="grid size-10 place-items-center rounded-xl bg-white shadow-sm active:scale-95">
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <h1 className="min-w-[11ch] text-center text-[26px] font-extrabold leading-tight tracking-tight md:text-3xl">{monthName(month)}</h1>
            <button type="button" aria-label="Month after" onClick={() => setMonth(addMonths(month, 1))} className="grid size-10 place-items-center rounded-xl bg-white shadow-sm active:scale-95">
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
        </div>
        <Button size="lg" icon={<Play className="size-5" aria-hidden />} onClick={() => setPresenting(true)} disabled={loading || !chosen.length}>
          Present
        </Button>
      </section>

      {/* What counts on the slides */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-1 rounded-2xl bg-white p-1 shadow-sm" role="radiogroup" aria-label="What counts">
          {[
            { all: false, label: 'Confirmed only' },
            { all: true, label: 'All payments' },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={prefs.countAll === o.all}
              onClick={() => choose({ ...prefs, countAll: o.all })}
              className={`h-10 rounded-xl px-4 text-sm font-bold transition ${prefs.countAll === o.all ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Look */}
      <section>
        <h2 className="mb-3 text-xl font-extrabold">
          Pick a look <span className="text-sm font-semibold text-muted">· {STYLES.length * PALETTES.length} to choose from</span>
        </h2>
        <LookPicker look={look} cover={list.find((x) => x.item.slide.kind === 'cover')?.item.slide} onChange={(id) => choose({ ...prefs, lookId: id })} />
      </section>

      {/* Slides */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold">
            Slides <span className="text-sm font-semibold text-muted">· {chosen.length} of {list.length} ticked</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {(prefs.order.length > 0 || prefs.titles.length > 0) && (
              <Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => choose({ ...prefs, order: [], titles: [] })}>
                Standard order and titles
              </Button>
            )}
            <Button size="sm" variant="soft" icon={<FileUp className="size-4" aria-hidden />} onClick={() => setImportingSlides(true)}>
              Import slides
            </Button>
          </div>
        </div>
        {loading ? (
          <Spinner label="Working out the figures…" />
        ) : !list.length ? (
          <Panel>
            <p className="py-6 text-center text-muted">
              No rows in {monthName(month)} yet. Import or type them in the Workbook, or{' '}
              <button type="button" className="font-bold text-blue" onClick={() => setImportingSlides(true)}>
                import a deck you already have
              </button>
              .
            </p>
          </Panel>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map(({ item, on }, i) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              const isEditing = editing === item.id;
              return (
                <div key={item.id} className="contents">
                  {header && (
                    <div className="col-span-full mt-2 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted">{header}</h3>
                      <span className="flex gap-3 text-sm font-bold">
                        <button type="button" className="text-blue" onClick={() => setGroup(item.group, true)}>
                          Tick all
                        </button>
                        <button type="button" className="text-muted hover:text-ink" onClick={() => setGroup(item.group, false)}>
                          Untick all
                        </button>
                        {item.id.startsWith('imp:') && (
                          <button
                            type="button"
                            className="text-muted hover:text-bad"
                            onClick={() => {
                              if (window.confirm(`Remove the ${uploaded?.slides.length ?? 0} uploaded slides from ${monthName(month)}?`)) void saveUploaded([]);
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </span>
                    </div>
                  )}
                  <div className={`min-w-0 rounded-2xl bg-white p-2 shadow-sm ring-2 transition ${on ? 'ring-blue/70' : 'opacity-55 ring-transparent'}`}>
                    <button type="button" onClick={() => toggle(item.id, item.extra, on)} className="block w-full overflow-hidden rounded-xl ring-1 ring-ink/5" aria-pressed={on} aria-label={`${on ? 'Leave out' : 'Include'} ${item.label}`}>
                      <SlideCanvas bg={laidAll[i].bg} shapes={laidAll[i].shapes} label={item.label} />
                    </button>
                    <div className="flex items-center gap-1 px-1 pt-2">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                        <input type="checkbox" checked={on} onChange={() => toggle(item.id, item.extra, on)} className="size-4 shrink-0 accent-[var(--color-blue)]" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-extrabold">{item.label}</span>
                          {item.extra && <span className="text-[11px] font-bold uppercase text-blue">Extra</span>}
                        </span>
                      </label>
                      {item.id.startsWith('imp:') ? (
                        <IconBtn label="Edit slide" onClick={() => setEditSlide(item.id.slice(4))}>
                          <SquarePen className="size-4" aria-hidden />
                        </IconBtn>
                      ) : (
                        <IconBtn label="Rename" onClick={() => setEditing(isEditing ? null : item.id)}>
                          <Pencil className="size-4" aria-hidden />
                        </IconBtn>
                      )}
                      <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                        <ArrowUp className="size-4" aria-hidden />
                      </IconBtn>
                      <IconBtn label="Move down" onClick={() => move(i, 1)} disabled={i === list.length - 1}>
                        <ArrowDown className="size-4" aria-hidden />
                      </IconBtn>
                    </div>
                    {isEditing && (
                      <form
                        className="flex gap-2 px-1 pt-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          rename(item.id, String(new FormData(e.currentTarget).get('t') || ''));
                        }}
                      >
                        <input name="t" autoFocus defaultValue={item.slide.title} className="h-10 min-w-0 flex-1 rounded-xl border border-line px-3 text-sm" aria-label="Slide title" />
                        <Button size="sm" type="submit">
                          Save
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Slide actions */}
      {!loading && chosen.length > 0 && (
        <div className="sticky bottom-20 z-20 grid grid-cols-3 gap-2 rounded-3xl bg-ink p-2 shadow-[0_18px_40px_-16px_rgba(14,26,43,0.8)] md:bottom-6">
          <Button size="lg" icon={<Presentation className="size-5" aria-hidden />} loading={busy === 'pptx'} onClick={downloadPptx} disabled={busy !== null}>
            <span className="hidden sm:inline">PowerPoint</span>
            <span className="sm:hidden">PPTX</span>
          </Button>
          <Button variant="dark" size="lg" className="bg-white/10" icon={<Printer className="size-5" aria-hidden />} onClick={printPdf} disabled={busy !== null}>
            PDF
          </Button>
          <Button variant="dark" size="lg" className="bg-white/10" icon={<Play className="size-5" aria-hidden />} onClick={() => setPresenting(true)} disabled={busy !== null}>
            Present
          </Button>
        </div>
      )}

      <EarlierMonths summary={summary ?? []} />

      {presenting && <Presenter slides={laidChosen} title={deckTitle} onExit={() => setPresenting(false)} />}
      {importingSlides && (
        <SlideImportDialog
          onClose={() => setImportingSlides(false)}
          onDone={(m) => {
            setImportingSlides(false);
            if (m !== month) setMonth(m);
            else
              void accApi
                .imported(month)
                .then((r) => setUploaded({ fileName: r.fileName, slides: r.slides }))
                .catch(() => undefined);
          }}
        />
      )}
      {editing1 && (
        <SlideEditor
          slide={editing1}
          month={month}
          region={acc.region}
          look={look}
          onClose={() => setEditSlide(null)}
          onSave={(next) => {
            setEditSlide(null);
            void saveUploaded(uploaded!.slides.map((s) => (s.id === next.id ? next : s)));
          }}
          onDelete={() => {
            setEditSlide(null);
            void saveUploaded(uploaded!.slides.filter((s) => s.id !== editing1.id));
          }}
        />
      )}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className="grid size-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-paper hover:text-ink disabled:opacity-30">
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ earlier months */

/** Figures for months before WeekDeck (from last year's slides), for the January – December slide. */
function EarlierMonths({ summary }: { summary: SummaryCell[] }) {
  const { acc, saveMe, month } = useAccounts();
  const toast = useToast();
  const year = month.slice(0, 4);
  const branches = useMemo(() => [...new Set([...acc.tabs.map((t) => (t.branch || t.name).toUpperCase()), ...acc.history.map((h) => h.branch)])].filter(Boolean), [acc.tabs, acc.history]);
  const [rows, setRows] = useState<HistoryRow[]>(acc.history);
  useEffect(() => setRows(acc.history), [acc.history]);
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

  const get = (branch: string, m: string) => rows.find((h) => h.branch === branch && h.month === m);
  const set = (branch: string, m: string, field: 'land' | 'infra' | 'nc', raw: string) => {
    const n = raw.trim() === '' ? null : parseMoney(raw);
    if (Number.isNaN(n)) return toast('Type a number, e.g. 41,285,745.83', 'bad');
    const cur = get(branch, m) ?? { branch, month: m, land: null, infra: null, nc: null };
    const next = rows.filter((h) => !(h.branch === branch && h.month === m));
    const row = { ...cur, [field]: field === 'nc' && n !== null ? Math.round(n) : n };
    const all = row.land === null && row.infra === null && row.nc === null ? next : [...next, row];
    setRows(all);
    saveMe({ history: all }).catch(() => toast('Couldn’t save. Try again.', 'bad'));
  };

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <History className="size-5 text-blue" aria-hidden /> Earlier months
        </span>
      }
    >
      <details>
        <summary className="cursor-pointer text-sm font-semibold text-muted">
          Earlier months (for the year slide)
        </summary>
        <div className="mt-4 space-y-6">
          {branches.map((b) => (
            <div key={b} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
              <p className="mb-2 font-extrabold">{b}</p>
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted">
                    <th className="py-1 font-bold">Month</th>
                    <th className="py-1 font-bold">Land &amp; building</th>
                    <th className="py-1 font-bold">Infra &amp; other fees</th>
                    <th className="py-1 font-bold">NC</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m, i) => {
                    const fromBook = summary.find((c) => c.month === m && c.branch === b);
                    const h = get(b, m);
                    return (
                      <tr key={m} className="border-t border-line">
                        <td className="py-1.5 font-bold">{MONTH_NAMES[i]}</td>
                        {fromBook && (fromBook.all.land || fromBook.all.infra) ? (
                          <td colSpan={3} className="py-1.5 text-muted">
                            <Eye className="mr-1 inline size-4" aria-hidden /> From the workbook: ₦{showMoney(fromBook.confirmed.land + fromBook.confirmed.infra)} confirmed
                          </td>
                        ) : m >= month ? (
                          <td colSpan={3} className="py-1.5 text-muted/70">
                            <EyeOff className="mr-1 inline size-4" aria-hidden /> Not yet
                          </td>
                        ) : (
                          (['land', 'infra', 'nc'] as const).map((f) => (
                            <td key={f} className="py-1 pr-2">
                              <input
                                defaultValue={h?.[f] === null || h?.[f] === undefined ? '' : f === 'nc' ? String(h[f]) : showMoney(h[f])}
                                onBlur={(e) => {
                                  const old = h?.[f] ?? null;
                                  const now = e.target.value.trim() === '' ? null : parseMoney(e.target.value);
                                  if (now !== old) set(b, m, f, e.target.value);
                                }}
                                inputMode="decimal"
                                placeholder="—"
                                className="figures h-9 w-full rounded-lg border border-line px-2 text-right"
                                aria-label={`${b} ${MONTH_NAMES[i]} ${f}`}
                              />
                            </td>
                          ))
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </details>
    </Panel>
  );
}
