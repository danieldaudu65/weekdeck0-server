import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Brain, CalendarSearch, Check, ChevronLeft, ChevronRight, CloudOff, Crown, Loader2, Minus, Plus, Sparkles, Trophy, UserPlus, Wallet, Wand2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useWeek } from '../lib/useWeek';
import { useActivityMemory } from '../lib/useActivityMemory';
import { planFromUsual } from '../lib/suggest';
import { alreadyHas, quickBlend } from '../lib/blend';
import { post, ApiError } from '../lib/api';
import { useToast } from '../components/Toast';
import { ActivityInput } from '../components/ActivityInput';
import { DAYS, DAY_LONG, DAY_SHORT, type DayKey, type WeekRow } from '../lib/types';
import { addWeeks, mondayOf, monthLabel, monthOf, weekNumberInMonth, weekRangeLabel } from '../lib/weeks';
import { formatAmount, formatNaira, sumOrNull } from '../lib/money';
import { AmountInput } from '../components/AmountInput';
import { Area, Button, Card, SectionTitle, Spinner } from '../components/ui';
import { EventsPanel } from '../components/EventsPanel';
import { WeekMap } from '../components/WeekMap';
import { useWeekStops } from '../lib/stops';
import type { FoundPlace } from '../lib/places';

const rowTotal = (r: WeekRow) => sumOrNull(DAYS.map((d) => r[d]));

export function WeekPage() {
  const { team } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const thisMonday = mondayOf();
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(params.get('week') ?? '') ? params.get('week')! : thisMonday;
  const go = (w: string) => setParams(w === thisMonday ? {} : { week: w }, { replace: true });
  const members = team!.members;
  const { week, loading, loadError, copiedFrom, saveState, update, retry } = useWeek(weekStart, members);

  const stats = useMemo(() => {
    if (!week) return null;
    const totals = week.rows.map((r) => ({ id: r.memberId, total: rowTotal(r) ?? 0 }));
    const top = [...totals].sort((a, b) => b.total - a.total)[0];
    return {
      total: totals.reduce((a, b) => a + b.total, 0),
      nc: week.rows.reduce((a, r) => a + (r.nc ?? 0), 0),
      top: top && top.total > 0 ? members.find((m) => m.id === top.id)?.name.split(' ')[0] : null,
    };
  }, [week, members]);

  const { memory, aiOn, eventsOn } = useActivityMemory(weekStart);
  const { stops, center, loading: stopsLoading } = useWeekStops(week, team!.region);
  const [showEvents, setShowEvents] = useState(false);
  const [writing, setWriting] = useState(false);

  /** A day's text changed: keep only the map pins whose place is still written there. */
  const setDayText = (d: DayKey, v: string) =>
    update((w) => ({
      ...w,
      activities: { ...w.activities, [d]: v },
      places: (w.places ?? []).filter((p) => p.day !== d || v.toLowerCase().includes(p.name.toLowerCase())),
    }));
  const addPin = (d: DayKey, p: FoundPlace) =>
    update((w) => ({
      ...w,
      places: [...(w.places ?? []).filter((x) => !(x.day === d && x.name.toLowerCase() === p.name.toLowerCase())), { day: d, name: p.name, lat: p.lat, lon: p.lon }].slice(-60),
    }));

  const writeSummary = async () => {
    setWriting(true);
    try {
      await retry(); // the AI reads the saved figures, so save first
      const r = await post<{ summary: string }>('/api/ai/summary', { weekStart });
      update((w) => ({ ...w, note: r.summary.slice(0, 600) }));
      toast('Summary written. Edit it if you like.');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'No summary just now. Try again.', 'bad');
    } finally {
      setWriting(false);
    }
  };
  const usualPlan = useMemo(() => {
    if (!week) return null;
    const plan = planFromUsual(memory, week.activities, weekStart);
    return Object.keys(plan).length ? plan : null;
  }, [memory, week, weekStart]);
  const fillUsual = () => {
    if (!usualPlan) return;
    update((w) => ({ ...w, activities: { ...w.activities, ...usualPlan } }));
    toast(`Filled ${Object.keys(usualPlan).length} day${Object.keys(usualPlan).length === 1 ? '' : 's'} from your usual week`);
  };
  /**
   * Add an idea or event to a day so it blends with what's there: joined into
   * one line right away, then (if AI is on) smoothed into a natural sentence.
   */
  const [added, setAdded] = useState<Set<string>>(() => new Set());
  const wasAdded = (d: DayKey, text: string) => added.has(`${weekStart}|${d}|${text}`) || (week ? alreadyHas(week.activities[d], text) : false);
  const addLine = (d: DayKey, text: string) => {
    if (!week) return;
    setAdded((s) => new Set(s).add(`${weekStart}|${d}|${text}`));
    const before = week.activities[d];
    if (alreadyHas(before, text)) return toast(`${DAY_LONG[d]} already has that`);
    const joined = quickBlend(before, text);
    update((w) => ({ ...w, activities: { ...w.activities, [d]: joined } }));
    if (!aiOn || !before.trim()) return;
    post<{ text: string }>('/api/ai/blend', { current: before, addition: text })
      .then((r) =>
        update((w) =>
          // Only replace if nobody has typed in that day since.
          w.activities[d] === joined ? { ...w, activities: { ...w.activities, [d]: r.text.slice(0, 600) } } : w,
        ),
      )
      .catch(() => undefined); // the quick join is already there
  };

  const [ai, setAi] = useState<{ state: 'idle' | 'loading' } | { state: 'done'; ideas: { day: DayKey; text: string }[]; tip: string }>({ state: 'idle' });
  const askAi = async () => {
    if (!week) return;
    setAi({ state: 'loading' });
    try {
      const r = await post<{ ideas: { day: DayKey; text: string }[]; tip: string }>('/api/ai/ideas', { weekStart, activities: week.activities });
      setAi({ state: 'done', ideas: r.ideas, tip: r.tip });
    } catch (err) {
      setAi({ state: 'idle' });
      toast(err instanceof ApiError ? err.message : 'No ideas just now. Try again.', 'bad');
    }
  };

  const setCell = (memberId: string, key: DayKey | 'nc', value: number | null) =>
    update((w) => ({ ...w, rows: w.rows.map((r) => (r.memberId === memberId ? { ...r, [key]: value } : r)) }));

  return (
    <div className="space-y-8">
      {/* Week switcher */}
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-blue">
            Week {weekNumberInMonth(weekStart)} of {monthLabel(monthOf(weekStart)).split(' ')[0]}
          </p>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight md:text-4xl">{weekRangeLabel(weekStart)}</h1>
        </div>
        <div className="flex items-center gap-2">
          <SaveChip state={saveState} onRetry={() => void retry()} />
          <div className="flex items-center rounded-2xl bg-white p-1 shadow-sm">
            <button type="button" onClick={() => go(addWeeks(weekStart, -1))} className="grid size-10 place-items-center rounded-xl hover:bg-paper" aria-label="Previous week">
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            {weekStart !== thisMonday && (
              <button type="button" onClick={() => go(thisMonday)} className="h-10 rounded-xl px-3 text-sm font-bold text-blue hover:bg-paper">
                This week
              </button>
            )}
            <button type="button" onClick={() => go(addWeeks(weekStart, 1))} className="grid size-10 place-items-center rounded-xl hover:bg-paper" aria-label="Next week">
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <Card>
          <Spinner label="Loading the week…" />
        </Card>
      ) : loadError || !week ? (
        <Card className="p-8 text-center">
          <CloudOff className="mx-auto size-8 text-muted" aria-hidden />
          <p className="mt-3 font-bold">{loadError ?? 'This week didn’t load.'}</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </Card>
      ) : (
        <>
          {/* At a glance */}
          {stats && (
            <section className="grid grid-cols-3 gap-2 md:gap-4">
              <Stat icon={<Wallet className="size-5" aria-hidden />} label="Team total" value={formatNaira(stats.total)} tone="dark" />
              <Stat icon={<UserPlus className="size-5" aria-hidden />} label="New clients" value={String(stats.nc)} />
              <Stat icon={<Trophy className="size-5" aria-hidden />} label="Top" value={stats.top ?? '—'} />
            </section>
          )}

          {/* Figures */}
          <section>
            <SectionTitle action={<span className="text-xs font-semibold text-muted">Type 500k or 1.2m, it works</span>}>Figures</SectionTitle>
            <div className="grid gap-3 md:grid-cols-2">
              {week.rows.map((r, i) => {
                const m = members.find((x) => x.id === r.memberId)!;
                const total = rowTotal(r);
                return (
                  <motion.div key={r.memberId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                    <Card className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="flex min-w-0 items-center gap-2 font-extrabold">
                          {m.lead && <Crown className="size-4 shrink-0 text-sun" aria-label="Team lead" />}
                          <span className="truncate">{m.name}</span>
                        </p>
                        <p className="figures shrink-0 rounded-xl bg-sun-soft px-2.5 py-1 text-sm font-extrabold text-[#7a4f00]">{total !== null ? `₦${formatAmount(total)}` : '₦0'}</p>
                      </div>
                      <div className="mt-3 grid grid-cols-5 gap-1.5">
                        {DAYS.map((d) => (
                          <div key={d} className="min-w-0">
                            <p className="mb-1 text-center text-[11px] font-bold uppercase text-muted">{DAY_SHORT[d]}</p>
                            <AmountInput label={`${m.name}, ${DAY_LONG[d]}`} value={r[d]} onChange={(v) => setCell(r.memberId, d, v)} />
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center justify-between rounded-xl bg-paper px-3 py-2">
                        <span className="text-sm font-bold">New clients</span>
                        <div className="flex items-center gap-2">
                          <button type="button" className="grid size-9 place-items-center rounded-lg bg-white shadow-sm disabled:opacity-40" disabled={!r.nc} onClick={() => setCell(r.memberId, 'nc', Math.max(0, (r.nc ?? 0) - 1) || null)} aria-label={`One fewer new client for ${m.name}`}>
                            <Minus className="size-4" aria-hidden />
                          </button>
                          <span className="figures w-6 text-center text-lg font-extrabold" aria-live="polite">
                            {r.nc ?? 0}
                          </span>
                          <button type="button" className="grid size-9 place-items-center rounded-lg bg-white shadow-sm" onClick={() => setCell(r.memberId, 'nc', (r.nc ?? 0) + 1)} aria-label={`One more new client for ${m.name}`}>
                            <Plus className="size-4" aria-hidden />
                          </button>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </section>

          {/* Activities */}
          <section>
            <SectionTitle
              action={
                <div className="flex gap-2">
                  {usualPlan && (
                    <button type="button" onClick={fillUsual} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-extrabold text-ink shadow-sm active:scale-95">
                      <Wand2 className="size-3.5 text-blue" aria-hidden /> Fill usual
                    </button>
                  )}
                  {eventsOn && (
                    <button type="button" onClick={() => setShowEvents((v) => !v)} aria-pressed={showEvents} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-blue px-3 text-xs font-extrabold text-white shadow-sm active:scale-95">
                      <CalendarSearch className="size-3.5" aria-hidden /> Events near us
                    </button>
                  )}
                  {aiOn && (
                    <button type="button" onClick={askAi} disabled={ai.state === 'loading'} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-3 text-xs font-extrabold text-white shadow-sm active:scale-95 disabled:opacity-60">
                      {ai.state === 'loading' ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5 text-sun" aria-hidden />} AI ideas
                    </button>
                  )}
                </div>
              }
            >
              Activities this week
            </SectionTitle>
            {copiedFrom && (
              <p className="mb-3 flex items-center gap-2 rounded-2xl bg-blue-soft px-4 py-3 text-sm font-semibold text-blue">
                <Sparkles className="size-4 shrink-0" aria-hidden /> Copied from {weekRangeLabel(copiedFrom)}. Change only what’s different.
              </p>
            )}
            {memory.phrases.length > 0 && !copiedFrom && (
              <p className="mb-3 flex items-center gap-2 px-1 text-xs font-semibold text-muted">
                <Brain className="size-4 shrink-0 text-blue" aria-hidden /> Remembers {memory.phrases.length} activities and {memory.places.length} places from {memory.weeks} week{memory.weeks === 1 ? '' : 's'}. Tap a day to see suggestions.
              </p>
            )}
            <AnimatePresence>
              {ai.state === 'done' && (
                <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mb-4 rounded-card bg-ink p-5 text-white">
                  <div className="flex items-start justify-between gap-3">
                    <p className="flex items-center gap-2 font-extrabold">
                      <Sparkles className="size-4 text-sun" aria-hidden /> Ideas for this week
                    </p>
                    <button type="button" onClick={() => setAi({ state: 'idle' })} className="text-xs font-bold text-white/60 hover:text-white">
                      Close
                    </button>
                  </div>
                  {ai.tip && <p className="mt-2 text-sm text-white/80">{ai.tip}</p>}
                  <div className="mt-3 space-y-2">
                    {DAYS.filter((d) => ai.ideas.some((i) => i.day === d)).map((d) => (
                      <div key={d} className="flex flex-wrap items-center gap-2">
                        <span className="w-10 text-xs font-extrabold uppercase text-sun">{DAY_SHORT[d]}</span>
                        {ai.ideas
                          .filter((i) => i.day === d)
                          .map((i) => {
                            const done = wasAdded(i.day, i.text);
                            return (
                              <button
                                key={i.text}
                                type="button"
                                disabled={done}
                                onClick={() => addLine(d, i.text)}
                                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-left text-[13px] font-semibold hover:bg-white/20 disabled:opacity-50"
                              >
                                {done ? <Check className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />} {i.text}
                              </button>
                            );
                          })}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {showEvents && (
              <EventsPanel
                weekStart={weekStart}
                region={team!.region}
                added={wasAdded}
                onAdd={(d, line) => {
                  addLine(d, line);
                  toast(`Added to ${DAY_LONG[d]}`);
                }}
                onClose={() => setShowEvents(false)}
              />
            )}
            <Card className="grid min-w-0 gap-5 p-4 sm:p-5 md:grid-cols-2">
              {DAYS.map((d) => (
                <ActivityInput
                  key={d}
                  day={d}
                  label={DAY_LONG[d]}
                  value={week.activities[d]}
                  memory={memory}
                  weekStart={weekStart}
                  near={center}
                  onPlace={(p) => addPin(d, p)}
                  onChange={(v) => setDayText(d, v)}
                />
              ))}
            </Card>
          </section>

          {/* Map */}
          <section>
            <SectionTitle action={<span className="text-xs font-semibold text-muted">{stops.length ? `${stops.length} place${stops.length === 1 ? '' : 's'}` : ''}</span>}>This week on the map</SectionTitle>
            <WeekMap stops={stops} center={center} loading={stopsLoading} />
          </section>

          {/* Week summary */}
          <section>
            <SectionTitle
              action={
                aiOn ? (
                  <button type="button" onClick={writeSummary} disabled={writing} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-3 text-xs font-extrabold text-white shadow-sm active:scale-95 disabled:opacity-60">
                    {writing ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Sparkles className="size-3.5 text-sun" aria-hidden />} {week.note ? 'Rewrite with AI' : 'Write with AI'}
                  </button>
                ) : undefined
              }
            >
              Week summary
            </SectionTitle>
            <Card className="p-4 sm:p-5">
              <Area
                label="Shown on the “Week at a glance” slide"
                value={week.note}
                maxLength={400}
                onChange={(e) => update((w) => ({ ...w, note: e.target.value }))}
                placeholder="e.g. A strong week: ₦2.1m in sales, led by Daniel. Next week we focus on site inspections in Ibeju-Lekki."
              />
              <p className="mt-2 text-xs text-muted">{aiOn ? 'Tap “Write with AI” after entering the figures, then edit as you like.' : 'Two or three lines on how the week went and what’s next.'}</p>
            </Card>
          </section>

          <div className="sticky bottom-20 z-20 md:bottom-6">
            <Link
              to={`/slides${weekStart === thisMonday ? '' : `?week=${weekStart}`}`}
              onClick={() => void retry()}
              className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-ink text-base font-extrabold text-white shadow-[0_18px_40px_-16px_rgba(14,26,43,0.7)] transition active:scale-[0.99]"
            >
              Make my slides <ArrowRight className="size-5" aria-hidden />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: 'dark' }) {
  const dark = tone === 'dark';
  return (
    <div className={`rounded-card p-3 md:p-5 ${dark ? 'bg-ink text-white' : 'border border-line bg-white'}`}>
      <span className={`inline-grid size-8 place-items-center rounded-xl ${dark ? 'bg-white/10 text-sun' : 'bg-blue-soft text-blue'}`}>{icon}</span>
      <p className={`mt-2 text-xs font-bold uppercase tracking-wide ${dark ? 'text-white/60' : 'text-muted'}`}>{label}</p>
      <p className="figures truncate text-lg font-extrabold md:text-2xl">{value}</p>
    </div>
  );
}

function SaveChip({ state, onRetry }: { state: string; onRetry: () => void }) {
  if (state === 'idle') return null;
  if (state === 'error')
    return (
      <button type="button" onClick={onRetry} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-bad/10 px-3 text-xs font-bold text-bad">
        <CloudOff className="size-4" aria-hidden /> Not saved · retry
      </button>
    );
  return (
    <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-bold text-muted shadow-sm" aria-live="polite">
      {state === 'saving' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4 text-ok" aria-hidden />}
      {state === 'saving' ? 'Saving…' : 'Saved'}
    </span>
  );
}
