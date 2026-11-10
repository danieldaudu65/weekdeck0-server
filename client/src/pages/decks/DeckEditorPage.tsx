/**
 * One restyled deck: pick a look and a 3D transition, show / hide / reorder /
 * edit slides, then present in 3D, download (3D .html, PowerPoint, PDF) or share
 * a link. Every change saves by itself.
 */
import { ADRON_LOGO } from '../../lib/adronLogo';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDown, ArrowLeft, ArrowUp, Box, Check, ChevronDown, CloudOff, Copy, Download, Eye, EyeOff, FileText, Link2, Loader2, Play, Plus, Presentation, SquarePen, Trash2, X } from 'lucide-react';
import { Button, Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { SlideCanvas } from '../../components/SlideCanvas';
import { LookPicker } from '../../components/LookPicker';
import { ApiError } from '../../lib/api';
import type { DeckSlide } from '../../lib/deck';
import { lookById } from '../../lib/templates';
import { decksApi, type RestyleDeck, type Transition } from '../../lib/restyle/api';
import { deckBody } from '../../lib/restyle/body';
import { download3d, downloadPptx3d, html3d, laySlide } from '../../lib/restyle/exports';
import { slideId, type RestyleSlide } from '../../lib/restyle/read';
import { usesFilePictures, withFilePictures } from '../../lib/restyle/load';
import { withTotals } from '../../lib/restyle/tableMath';
import { SlideEditor } from './SlideEditor';

const TRANSITIONS: { id: Transition; label: string }[] = [
  { id: 'cube', label: 'Cube' },
  { id: 'flip', label: 'Flip' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'slide', label: 'Slide' },
];

const KIND_LABEL: Record<DeckSlide['kind'], string> = { cover: 'Cover', bullets: 'Points', table: 'Table', picture: 'Picture', thanks: 'Title', summary: 'Summary', team: 'Team', activities: 'Activities', map: 'Map' };

export const shareUrl = (shareId: string) => `${window.location.origin}/deck/${shareId}`;

export function DeckEditorPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const [deck, setDeck] = useState<RestyleDeck | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [editing, setEditing] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [menu, setMenu] = useState<'download' | 'share' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<RestyleDeck | null>(null);

  useEffect(() => {
    decksApi
      .get(id)
      .then((r) => {
        // Decks saved before tables added themselves up get their totals now.
        const deck = { ...r.deck, slides: r.deck.slides.map((x) => (x.slide.kind === 'table' ? { ...x, slide: { ...x.slide, table: withTotals(x.slide.table) } } : x)) };
        setDeck(deck);
        latest.current = deck;
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'This deck couldn’t be opened.'));
  }, [id]);

  const flush = useCallback(async () => {
    const d = latest.current;
    if (!d) return;
    setSaving('saving');
    try {
      await decksApi.save(d.id, await deckBody(d));
      setSaving('saved');
    } catch (err) {
      setSaving('failed');
      if (err instanceof ApiError && err.status !== 0) toast(err.message, 'bad');
    }
  }, [toast]);

  /** Change the deck; it saves itself a moment later. */
  const change = useCallback(
    (fn: (d: RestyleDeck) => RestyleDeck) => {
      setDeck((d) => {
        if (!d) return d;
        const next = fn(d);
        latest.current = next;
        return next;
      });
      setSaving('saving');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), 1200);
    },
    [flush],
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saving === 'saving') e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saving]);

  const shown = useMemo(() => (deck ? deck.slides.filter((s) => !s.hidden) : []), [deck]);
  const look = lookById(deck?.lookId);
  const coverForPicker = useMemo<DeckSlide | undefined>(() => {
    const c = deck?.slides.find((s) => s.slide.kind === 'cover')?.slide;
    return c ?? (deck ? { kind: 'cover', title: deck.title, week: '', weekNo: 0, range: '', team: '', name: '', role: '', image: '', kicker: '', badge: '' } : undefined);
  }, [deck]);

  if (error) return <p className="rounded-2xl bg-white p-8 text-center font-bold shadow-sm">{error}</p>;
  if (!deck) return <Spinner label="Opening your deck…" />;

  const setSlides = (fn: (s: RestyleSlide[]) => RestyleSlide[]) => change((d) => ({ ...d, slides: fn(d.slides) }));
  const move = (i: number, by: number) =>
    setSlides((s) => {
      const j = i + by;
      if (j < 0 || j >= s.length) return s;
      const next = [...s];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const pageOf = (s: RestyleSlide) => shown.indexOf(s) + 1;

  const run = async (label: string, fn: () => Promise<void> | void) => {
    setMenu(null);
    setBusy(label);
    try {
      await fn();
    } catch {
      toast('Couldn’t make that file. Try again.', 'bad');
    } finally {
      setBusy(null);
    }
  };

  const share = async (on: boolean) => {
    try {
      window.clearTimeout(timer.current);
      await flush();
      const r = await decksApi.share(deck.id, on);
      change((d) => ({ ...d, shareId: r.shareId }));
      if (r.shareId) {
        await navigator.clipboard?.writeText(shareUrl(r.shareId)).catch(() => undefined);
        toast('Link copied');
      }
    } catch {
      toast('Couldn’t make the link. Try again.', 'bad');
    }
  };

  const editingSlide = deck.slides.find((s) => s.id === editing) ?? null;

  return (
    <div className="space-y-6">
      {/* Title + save state */}
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/decks" className="grid size-10 place-items-center rounded-xl bg-white shadow-sm hover:bg-ink/5" aria-label="All decks">
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <input
          value={deck.title}
          onChange={(e) => change((d) => ({ ...d, title: e.target.value }))}
          aria-label="Deck name"
          className="min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-2 py-1 text-2xl font-extrabold tracking-tight hover:border-line focus:border-blue focus:bg-white md:text-3xl"
        />
        <span className="flex items-center gap-1.5 text-xs font-bold text-muted" aria-live="polite">
          {saving === 'saving' ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving
            </>
          ) : saving === 'failed' ? (
            <button type="button" onClick={() => void flush()} className="flex items-center gap-1 text-bad">
              <CloudOff className="size-3.5" aria-hidden /> Not saved · retry
            </button>
          ) : saving === 'saved' ? (
            <>
              <Check className="size-3.5 text-ok" aria-hidden /> Saved
            </>
          ) : null}
        </span>
      </div>

      {/* Actions */}
      <div className="sticky top-[72px] z-20 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl bg-paper/90 p-1 backdrop-blur">
        <Button icon={<Play className="size-4" aria-hidden />} onClick={() => setPresenting(true)} disabled={!shown.length}>
          Present in 3D
        </Button>
        <div className="relative">
          <Button variant="dark" icon={busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />} onClick={() => setMenu((m) => (m === 'download' ? null : 'download'))} disabled={!shown.length || Boolean(busy)} aria-expanded={menu === 'download'}>
            {busy ?? 'Download'} <ChevronDown className="size-4" aria-hidden />
          </Button>
          {menu === 'download' && (
            <Menu onClose={() => setMenu(null)}>
              <MenuItem icon={<Box className="size-5 text-blue" aria-hidden />} title="3D presentation" sub=".html · plays offline, full 3D" onClick={() => void run('Making 3D file…', () => download3d(deck))} />
              <MenuItem icon={<Presentation className="size-5 text-[#c43e1c]" aria-hidden />} title="PowerPoint" sub=".pptx · editable, 3D transitions" onClick={() => void run('Making PowerPoint…', () => downloadPptx3d(deck))} />
              <MenuItem
                icon={<FileText className="size-5 text-bad" aria-hidden />}
                title="PDF"
                sub="to print or send"
                onClick={() => {
                  setMenu(null);
                  window.clearTimeout(timer.current);
                  void flush().then(() => navigate(`/decks/${deck.id}/print`));
                }}
              />
            </Menu>
          )}
        </div>
        <div className="relative">
          <Button variant="soft" icon={<Link2 className="size-4" aria-hidden />} onClick={() => setMenu((m) => (m === 'share' ? null : 'share'))} aria-expanded={menu === 'share'}>
            Share
          </Button>
          {menu === 'share' && (
            <Menu onClose={() => setMenu(null)} wide>
              {deck.shareId ? (
                <div className="space-y-3 p-3">
                  <p className="text-sm font-extrabold">Anyone with the link can watch it in 3D</p>
                  <div className="flex items-center gap-2 rounded-xl bg-paper p-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{shareUrl(deck.shareId)}</span>
                    <Button size="sm" icon={<Copy className="size-4" aria-hidden />} onClick={() => void navigator.clipboard?.writeText(shareUrl(deck.shareId!)).then(() => toast('Link copied'))}>
                      Copy
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a className="inline-flex h-10 items-center rounded-xl bg-[#25d366] px-3.5 text-sm font-bold text-white" href={`https://wa.me/?text=${encodeURIComponent(`${deck.title}: ${shareUrl(deck.shareId)}`)}`} target="_blank" rel="noreferrer">
                      WhatsApp
                    </a>
                    <Button size="sm" variant="danger" onClick={() => void share(false)}>
                      Stop sharing
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 p-3">
                  <p className="text-sm font-extrabold">Share a link to watch it in 3D</p>
                  <p className="text-xs font-semibold text-muted">Works on any phone or laptop. Changes show on the same link.</p>
                  <Button size="sm" icon={<Link2 className="size-4" aria-hidden />} onClick={() => void share(true)}>
                    Make a link
                  </Button>
                </div>
              )}
            </Menu>
          )}
        </div>
      </div>

      {/* Look + transition */}
      <section className="space-y-4 rounded-3xl bg-white p-4 shadow-sm md:p-5">
        <LookPicker look={look} cover={coverForPicker} onChange={(lookId) => change((d) => ({ ...d, lookId }))} />
        {deck.slides.some((x) => x.filePicture) && (
          <label className="flex w-fit cursor-pointer items-center gap-3 rounded-2xl bg-paper px-4 py-2.5">
            <input type="checkbox" className="peer sr-only" checked={usesFilePictures(deck.slides)} onChange={(e) => setSlides((all) => withFilePictures(all, e.target.checked))} />
            <span aria-hidden className="relative h-6 w-11 rounded-full bg-ink/20 transition after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-blue peer-checked:after:translate-x-5" />
            <span className="text-sm font-extrabold">Pictures from the file</span>
            <span className="text-xs font-semibold text-muted">{deck.slides.filter((x) => x.filePicture).length} slides</span>
          </label>
        )}
        <label className="flex w-fit cursor-pointer items-center gap-3 rounded-2xl bg-paper px-4 py-2.5">
          <input type="checkbox" className="peer sr-only" checked={(deck.logo ?? 'adron') === 'adron'} onChange={(e) => change((d) => ({ ...d, logo: e.target.checked ? 'adron' : 'none' }))} />
          <span aria-hidden className="relative h-6 w-11 rounded-full bg-ink/20 transition after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-blue peer-checked:after:translate-x-5" />
          <img src={ADRON_LOGO} alt="" className="h-6 rounded" />
          <span className="text-sm font-extrabold">Adron logo on every slide</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-extrabold">3D motion</span>
          {TRANSITIONS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={deck.transition === t.id}
              onClick={() => change((d) => ({ ...d, transition: t.id }))}
              className={`h-10 rounded-xl px-4 text-sm font-bold transition ${deck.transition === t.id ? 'bg-ink text-white shadow' : 'bg-paper text-muted hover:text-ink'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {/* Slides */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold">
            Slides <span className="text-sm font-semibold text-muted">· {shown.length} shown</span>
          </h2>
          <Button
            size="sm"
            variant="soft"
            icon={<Plus className="size-4" aria-hidden />}
            onClick={() => {
              const s: RestyleSlide = { id: slideId(), hidden: false, slide: { kind: 'bullets', title: 'New slide', subtitle: '', points: [{ text: 'Your point', level: 0 }], image: '', ratio: 0 } };
              setSlides((all) => [...all, s]);
              setEditing(s.id);
            }}
          >
            Add slide
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence initial={false}>
            {deck.slides.map((s, i) => {
              const laid = laySlide(s.slide, deck, Math.max(1, pageOf(s)), shown.length);
              return (
                <motion.div key={s.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className={`min-w-0 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-line ${s.hidden ? 'opacity-50' : ''}`}>
                  <button type="button" className="block w-full text-left" onClick={() => setEditing(s.id)} aria-label={`Edit slide ${i + 1}`}>
                    <SlideCanvas bg={laid.bg} shapes={laid.shapes} label={s.slide.kind === 'cover' || 'title' in s.slide ? (s.slide as { title: string }).title : ''} />
                  </button>
                  <div className="flex items-center gap-1 px-2 py-1.5">
                    <span className="mr-auto truncate pl-1 text-xs font-bold text-muted">
                      {s.hidden ? 'Hidden' : pageOf(s)} · {KIND_LABEL[s.slide.kind]}
                    </span>
                    <IconBtn label={s.hidden ? 'Show' : 'Hide'} onClick={() => setSlides((all) => all.map((x) => (x.id === s.id ? { ...x, hidden: !x.hidden } : x)))}>
                      {s.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </IconBtn>
                    <IconBtn label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                      <ArrowUp className="size-4" />
                    </IconBtn>
                    <IconBtn label="Move down" onClick={() => move(i, 1)} disabled={i === deck.slides.length - 1}>
                      <ArrowDown className="size-4" />
                    </IconBtn>
                    <IconBtn label="Edit" onClick={() => setEditing(s.id)}>
                      <SquarePen className="size-4" />
                    </IconBtn>
                    <IconBtn
                      label="Delete"
                      onClick={() => {
                        if (window.confirm('Delete this slide?')) setSlides((all) => all.filter((x) => x.id !== s.id));
                      }}
                      danger
                    >
                      <Trash2 className="size-4" />
                    </IconBtn>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </section>

      {editingSlide && (
        <SlideEditor
          item={editingSlide}
          lookId={deck.lookId}
          logo={deck.logo ?? 'adron'}
          deckTitle={deck.title}
          onChange={(next) => setSlides((all) => all.map((x) => (x.id === next.id ? next : x)))}
          onClose={() => setEditing(null)}
        />
      )}
      {presenting && <Present3D html={html3d(deck)} title={deck.title} onClose={() => setPresenting(false)} />}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className={`grid size-9 place-items-center rounded-lg text-muted transition hover:bg-ink/5 disabled:opacity-30 ${danger ? 'hover:text-bad' : 'hover:text-ink'}`}>
      {children}
    </button>
  );
}

function Menu({ children, onClose, wide }: { children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={onClose} />
      <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={`absolute left-0 z-40 mt-2 overflow-hidden rounded-2xl bg-white p-1 shadow-2xl ring-1 ring-line ${wide ? 'w-[min(92vw,380px)]' : 'w-72'}`} role="menu">
        {children}
      </motion.div>
    </>
  );
}

function MenuItem({ icon, title, sub, onClick }: { icon: ReactNode; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-paper">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper">{icon}</span>
      <span>
        <span className="block text-sm font-extrabold">{title}</span>
        <span className="block text-xs font-semibold text-muted">{sub}</span>
      </span>
    </button>
  );
}

/** The 3D player (the same one the .html download carries), full screen over the app. */
export function Present3D({ html, title, onClose }: { html: string; title: string; onClose?: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · 3D`;
    const t = window.setTimeout(() => frame.current?.contentWindow?.focus(), 200);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    // Esc pressed inside the player.
    const onMsg = (e: MessageEvent) => e.data === 'weekdeck-3d-close' && e.source === frame.current?.contentWindow && onClose?.();
    window.addEventListener('keydown', onKey);
    window.addEventListener('message', onMsg);
    return () => {
      document.title = prev;
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('message', onMsg);
    };
  }, [title, onClose]);
  return (
    <div className="fixed inset-0 z-[60] bg-[#05070d]" role="dialog" aria-modal="true" aria-label={`${title} in 3D`}>
      <iframe ref={frame} title={title} srcDoc={html} sandbox="allow-scripts allow-same-origin" allow="fullscreen" className="size-full border-0" />
      {onClose && (
        <button type="button" onClick={onClose} className="absolute right-4 top-4 grid size-11 place-items-center rounded-xl bg-white/10 text-white backdrop-blur hover:bg-white/20" aria-label="Close">
          <X className="size-5" aria-hidden />
        </button>
      )}
    </div>
  );
}
