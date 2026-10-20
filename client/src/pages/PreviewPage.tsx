import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { motion } from 'motion/react';
import { AlertTriangle, ChevronLeft, ChevronRight, LogOut, PencilLine, Play, Presentation, Printer } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useDeck } from '../lib/useDeck';
import { DAYS, type Week } from '../lib/types';
import { addWeeks, mondayOf, monthLabel, monthOf, weekNumberInMonth, weekRangeLabel } from '../lib/weeks';
import { SlideCanvas } from '../components/SlideCanvas';
import { Button, Logo, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';

const hasFigures = (w: Week) => w.rows.some((r) => DAYS.some((d) => r[d] != null) || r.nc != null || r.weekTotal != null);

/**
 * Preview mode: the manager's finished slides and nothing else, ready to present.
 * Opens on the most recent week that has figures (usually the week just ended).
 */
export function PreviewPage() {
  const [params] = useSearchParams();
  const asked = /^\d{4}-\d{2}-\d{2}$/.test(params.get('week') ?? '') ? params.get('week')! : null;
  const thisWeek = mondayOf();
  const [picked, setPicked] = useState<string | null>(asked);

  // No week in the link: find the latest week (up to this one) that has figures.
  useEffect(() => {
    if (asked) return setPicked(asked);
    let alive = true;
    api<{ weeks: Week[] }>(`/api/weeks?from=${addWeeks(thisWeek, -5)}&to=${thisWeek}`)
      .then(({ weeks }) => {
        const latest = weeks.filter(hasFigures).map((w) => w.weekStart).sort().pop();
        if (alive) setPicked(latest ?? addWeeks(thisWeek, -1));
      })
      .catch(() => alive && setPicked(addWeeks(thisWeek, -1)));
    return () => {
      alive = false;
    };
  }, [asked, thisWeek]);

  if (!picked) return <Spinner label="Finding your latest week…" />;
  return <Preview weekStart={picked} onWeek={setPicked} />;
}

function Preview({ weekStart, onWeek }: { weekStart: string; onWeek: (w: string) => void }) {
  const { team, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const thisWeek = mondayOf();
  const [busy, setBusy] = useState(false);
  const deck = useDeck({ team, weekStart, includeSummary: true, includeMap: true });
  const ready = !deck.loading && !deck.error;

  const go = (n: number) => {
    const next = addWeeks(weekStart, n);
    if (next > thisWeek) return;
    onWeek(next);
    setParams({ week: next }, { replace: true });
  };
  const present = (from = 0) => navigate(`/present?week=${weekStart}&back=preview${from ? `&from=${from}` : ''}`);

  const download = async () => {
    setBusy(true);
    try {
      const { downloadPptx } = await import('../lib/exportPptx');
      await downloadPptx(deck.slides, deck.look, { teamName: team!.name, title: deck.title, fileName: deck.fileName });
      toast('PowerPoint downloaded');
    } catch {
      toast('The PowerPoint couldn’t be made. Try again.', 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh">
      <header className="safe-top sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
          <Logo size={34} />
          <div className="flex items-center gap-2">
            <Button variant="soft" size="sm" icon={<PencilLine className="size-4" aria-hidden />} onClick={() => navigate(weekStart === thisWeek ? '/' : `/?week=${weekStart}`)}>
              Edit
            </Button>
            <button type="button" onClick={logout} className="grid size-10 place-items-center rounded-xl text-muted hover:bg-white hover:text-ink" aria-label="Log out">
              <LogOut className="size-5" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 pb-16 pt-6">
        <section className="rounded-[1.75rem] bg-ink p-5 text-white shadow-[0_24px_50px_-24px_rgba(14,26,43,0.8)] md:p-7">
          <p className="truncate text-sm font-bold text-white/60">{team?.name} · Preview</p>
          <div className="mt-3 flex items-center justify-between gap-3">
            <button type="button" onClick={() => go(-1)} className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 hover:bg-white/20" aria-label="Previous week">
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <div className="min-w-0 text-center">
              <p className="text-sm font-bold uppercase tracking-wider text-[#8FA6FF]">
                Week {weekNumberInMonth(weekStart)} of {monthLabel(monthOf(weekStart)).split(' ')[0]}
                {weekStart === thisWeek ? ' · this week' : weekStart === addWeeks(thisWeek, -1) ? ' · last week' : ''}
              </p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">{weekRangeLabel(weekStart)}</h1>
            </div>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={weekStart >= thisWeek}
              className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10 hover:bg-white/20 disabled:opacity-30"
              aria-label="Next week"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_1fr_1fr]">
            <Button size="lg" className="col-span-2 sm:col-span-1" icon={<Play className="size-5" aria-hidden />} onClick={() => present()} disabled={!ready || deck.mapPending}>
              Present
            </Button>
            <Button variant="dark" size="lg" className="bg-white/10" icon={<Presentation className="size-5" aria-hidden />} loading={busy} onClick={download} disabled={!ready || busy || deck.mapPending}>
              PowerPoint
            </Button>
            <Button
              variant="dark"
              size="lg"
              className="bg-white/10"
              icon={<Printer className="size-5" aria-hidden />}
              onClick={() => window.open(`/print?week=${weekStart}`, '_blank', 'noopener')}
              disabled={!ready || deck.mapPending}
            >
              PDF
            </Button>
          </div>
        </section>

        {!ready ? (
          deck.error ? (
            <p className="rounded-2xl bg-white p-8 text-center font-bold">{deck.error}</p>
          ) : (
            <Spinner label="Getting your slides ready…" />
          )
        ) : (
          <>
            {deck.empty && (
              <p className="flex items-center gap-2 rounded-2xl bg-sun-soft px-4 py-3 text-sm font-semibold text-[#7a4f00]">
                <AlertTriangle className="size-4 shrink-0" aria-hidden />
                <span>
                  No figures for this week yet.{' '}
                  <Link to={weekStart === thisWeek ? '/' : `/?week=${weekStart}`} className="underline">
                    Add them
                  </Link>{' '}
                  or pick another week.
                </span>
              </p>
            )}
            <p className="text-sm font-semibold text-muted">{deck.laid.length} slides · tap a slide to present from there</p>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {deck.laid.map((s, i) => (
                <motion.button
                  type="button"
                  key={`${weekStart}-${i}`}
                  onClick={() => present(i)}
                  className="group min-w-0 text-left"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  aria-label={`Present from slide ${i + 1}`}
                >
                  <div className="overflow-hidden rounded-xl shadow-[0_14px_34px_-20px_rgba(14,26,43,0.6)] ring-1 ring-ink/5 transition group-hover:ring-2 group-hover:ring-blue">
                    <SlideCanvas bg={s.bg} shapes={s.shapes} label={`Slide ${i + 1}`} />
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 px-1 text-xs font-bold text-muted">
                    {i + 1}
                    <Play className="size-3 opacity-0 transition group-hover:opacity-100" aria-hidden />
                  </p>
                </motion.button>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
