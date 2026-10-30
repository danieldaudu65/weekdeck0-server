import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { motion } from 'motion/react';
import { AlertTriangle, ArrowLeft, FileDown, Loader2, Play, Presentation, Printer, Share2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useDeck } from '../lib/useDeck';
import { mondayOf, weekNumberInMonth, weekRangeLabel } from '../lib/weeks';
import { SlideCanvas } from '../components/SlideCanvas';
import { LookPicker } from '../components/LookPicker';
import { PALETTES, STYLES } from '../lib/templates';
import { Button, Card, SectionTitle, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';

export function SlidesPage() {
  const { team, saveTeam } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(params.get('week') ?? '') ? params.get('week')! : mondayOf();
  const includeSummary = params.get('summary') !== '0';
  const includeMap = params.get('map') !== '0';
  const [lookIdNow, setLookIdNow] = useState(team!.templateId);
  const deck = useDeck({ team, weekStart, includeSummary, includeMap, lookId: lookIdNow });
  const [busy, setBusy] = useState<'pptx' | 'share' | null>(null);
  const navigate = useNavigate();

  const query = new URLSearchParams({ week: weekStart, ...(includeSummary ? {} : { summary: '0' }), ...(includeMap ? {} : { map: '0' }) }).toString();

  // Remember the choice for next week (saved a moment after the last tap).
  const saveTimer = useRef<number | undefined>(undefined);
  const pickLook = (id: string) => {
    setLookIdNow(id);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTeam({ ...team!, templateId: id }).catch(() => toast('Couldn’t remember your look', 'bad'));
    }, 800);
  };

  const toggle = (key: 'summary' | 'map', on: boolean) => {
    const next = new URLSearchParams(params);
    if (on) next.set(key, '0');
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const download = async () => {
    setBusy('pptx');
    try {
      const { downloadPptx } = await import('../lib/exportPptx');
      await downloadPptx(deck.slides, deck.look, { teamName: team!.name, title: deck.title, fileName: deck.fileName });
      toast('PowerPoint downloaded');
    } catch {
      toast('The PowerPoint couldn’t be made. Try again.', 'bad');
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    setBusy('share');
    try {
      const { pptxBlob } = await import('../lib/exportPptx');
      const blob = await pptxBlob(deck.slides, deck.look, { teamName: team!.name, title: deck.title });
      const file = new File([blob], `${deck.fileName}.pptx`, { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: deck.fileName });
      } else {
        const { downloadPptx } = await import('../lib/exportPptx');
        await downloadPptx(deck.slides, deck.look, { teamName: team!.name, title: deck.title, fileName: deck.fileName });
        toast('Sharing isn’t available here, so it was downloaded instead');
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') toast('Couldn’t share. Try Download instead.', 'bad');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-w-0 space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to={`/${weekStart === mondayOf() ? '' : `?week=${weekStart}`}`} className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden /> Edit figures
          </Link>
          <p className="text-sm font-bold uppercase tracking-wider text-blue">Week {weekNumberInMonth(weekStart)}</p>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight md:text-4xl">Your slides</h1>
          <p className="text-muted">{weekRangeLabel(weekStart)}</p>
        </div>
        <Button size="lg" icon={<Play className="size-5" aria-hidden />} onClick={() => navigate(`/present?${query}`)} disabled={deck.loading || Boolean(deck.error)}>
          Present
        </Button>
      </section>

      {/* Templates */}
      <section>
        <SectionTitle>Pick a look <span className="text-sm font-semibold text-muted">· {STYLES.length * PALETTES.length} to choose from</span></SectionTitle>
        <LookPicker look={deck.look} cover={deck.slides[0]} onChange={pickLook} />
        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <Toggle on={includeSummary} onChange={() => toggle('summary', includeSummary)} title="“Week at a glance” slide" text="Team total, change from last week, top performers, the week’s note" />
          <Toggle
            on={includeMap}
            onChange={() => toggle('map', includeMap)}
            title="Map slide"
            text={deck.hasPlaces ? 'Where the team is going this week, with each day’s route' : 'Appears once activities name places (type “at …” and pick one)'}
          />
        </div>
      </section>

      {/* Preview */}
      <section>
        <SectionTitle
          action={
            deck.mapPending ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Drawing the map…
              </span>
            ) : deck.slides.length ? (
              <span className="text-sm font-semibold text-muted">{deck.slides.length} slides</span>
            ) : undefined
          }
        >
          Preview
        </SectionTitle>
        {deck.loading ? (
          <Card>
            <Spinner label="Making your slides…" />
          </Card>
        ) : deck.error ? (
          <Card className="p-8 text-center font-bold">{deck.error}</Card>
        ) : (
          <>
            {deck.empty && (
              <p className="mb-4 flex items-center gap-2 rounded-2xl bg-sun-soft px-4 py-3 text-sm font-semibold text-[#7a4f00]">
                <AlertTriangle className="size-4 shrink-0" aria-hidden /> No figures for this week yet. The tables will show zeros.
              </p>
            )}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {deck.laid.map((s, i) => (
                <motion.div className="min-w-0" key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                  <div className="overflow-hidden rounded-xl shadow-[0_14px_34px_-20px_rgba(14,26,43,0.6)] ring-1 ring-ink/5">
                    <SlideCanvas bg={s.bg} shapes={s.shapes} label={`Slide ${i + 1}`} />
                  </div>
                  <p className="mt-2 px-1 text-xs font-bold text-muted">{i + 1}</p>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Actions */}
      {!deck.loading && !deck.error && (
        <div className="sticky bottom-20 z-20 grid grid-cols-3 gap-2 rounded-3xl bg-ink p-2 shadow-[0_18px_40px_-16px_rgba(14,26,43,0.8)] md:bottom-6">
          <Button variant="primary" size="lg" icon={<Presentation className="size-5" aria-hidden />} loading={busy === 'pptx'} onClick={download} disabled={busy !== null || deck.mapPending}>
            <span className="hidden sm:inline">PowerPoint</span>
            <span className="sm:hidden">PPTX</span>
          </Button>
          <Button
            variant="dark"
            size="lg"
            className="bg-white/10"
            icon={<Printer className="size-5" aria-hidden />}
            onClick={() => window.open(`/print?${query}`, '_blank', 'noopener')}
            disabled={busy !== null || deck.mapPending}
          >
            PDF
          </Button>
          <Button variant="dark" size="lg" className="bg-white/10" icon={<Share2 className="size-5" aria-hidden />} loading={busy === 'share'} onClick={share} disabled={busy !== null || deck.mapPending}>
            Share
          </Button>
        </div>
      )}
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted">
        <FileDown className="size-3.5" aria-hidden /> PDF opens a print page: choose “Save as PDF”.
      </p>
    </div>
  );
}

function Toggle({ on, onChange, title, text }: { on: boolean; onChange: () => void; title: string; text: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm">
      <span className="min-w-0">
        <span className="block font-bold">{title}</span>
        <span className="text-sm text-muted">{text}</span>
      </span>
      <input type="checkbox" className="peer sr-only" checked={on} onChange={onChange} />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-line transition peer-checked:bg-blue peer-focus-visible:ring-2 peer-focus-visible:ring-blue after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
    </label>
  );
}
