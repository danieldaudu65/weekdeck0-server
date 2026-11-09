/**
 * Decks: upload anyone's slides (PowerPoint, PDF, pictures), WeekDeck rebuilds
 * them in its looks; every deck is kept here to come back to.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { FileUp, Layers, Sparkles, Trash2 } from 'lucide-react';
import { Button, Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { SlideCanvas } from '../../components/SlideCanvas';
import { ApiError } from '../../lib/api';
import { layoutSlide } from '../../lib/looks';
import { decksApi, type DeckSummary } from '../../lib/restyle/api';
import { ACCEPT_DECK, RestyleError, type RestyleSlide } from '../../lib/restyle/read';
import { loadDeckFile } from '../../lib/restyle/load';
import { deckBody } from '../../lib/restyle/body';

export const DEFAULT_LOOK = 'ribbon_lagoon';

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export function DecksPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [step, setStep] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    decksApi
      .list()
      .then((r) => setDecks(r.decks))
      .catch(() => setDecks([]));
  }, []);

  const upload = async (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []);
    if (!files.length || step) return;
    try {
      let title = '';
      const slides: RestyleSlide[] = [];
      const notes: string[] = [];
      for (const f of files) {
        const r = await loadDeckFile(f, setStep);
        title ||= r.title;
        slides.push(...r.slides);
        notes.push(...r.notes);
      }
      if (!slides.length) throw new RestyleError('No slides found in that file.');
      setStep('Saving…');
      const body = await deckBody({ title, lookId: DEFAULT_LOOK, transition: 'cube', sourceName: files.map((f) => f.name).join(', '), slides: slides.slice(0, 80) });
      const { deck } = await decksApi.create(body);
      if (notes.length) toast(notes[0]);
      navigate(`/decks/${deck.id}`);
    } catch (err) {
      toast(err instanceof RestyleError || err instanceof ApiError ? err.message : 'That file couldn’t be read. Try saving it again as .pptx or PDF.', 'bad');
      setStep(null);
    }
  };

  const remove = async (d: DeckSummary) => {
    if (!window.confirm(`Delete “${d.title}”?`)) return;
    try {
      await decksApi.remove(d.id);
      setDecks((ds) => (ds ?? []).filter((x) => x.id !== d.id));
    } catch {
      toast('Couldn’t delete it. Try again.', 'bad');
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-bold uppercase tracking-wider text-blue">Restyle a deck</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight md:text-4xl">Any slides, made beautiful</h1>
      </header>

      <input ref={input} type="file" multiple accept={ACCEPT_DECK} className="sr-only" onChange={(e) => void upload(e.target.files).finally(() => (e.target.value = ''))} />
      <motion.button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void upload(e.dataTransfer.files);
        }}
        whileHover={{ y: -2 }}
        disabled={Boolean(step)}
        className={`relative flex w-full flex-col items-center gap-3 overflow-hidden rounded-3xl px-6 py-12 text-center text-white shadow-[0_30px_60px_-30px_rgba(39,71,216,0.9)] transition ${drag ? 'ring-4 ring-sun' : ''}`}
        style={{ background: 'radial-gradient(900px 300px at 20% 0%, #4f7cff 0%, #2747d8 45%, #13216b 100%)' }}
      >
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-16 size-64 rounded-full bg-white/10 blur-2xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-20 left-10 size-56 rounded-full bg-[#ffb020]/25 blur-2xl" />
        {step ? (
          <>
            <Sparkles className="size-10 animate-pulse" aria-hidden />
            <span className="text-xl font-extrabold">{step}</span>
          </>
        ) : (
          <>
            <span className="grid size-16 place-items-center rounded-2xl bg-white/15 backdrop-blur">
              <FileUp className="size-8" aria-hidden />
            </span>
            <span className="text-2xl font-extrabold">Drop a deck here</span>
            <span className="text-sm font-semibold text-white/80">PowerPoint · PDF · Google Slides download · photos</span>
          </>
        )}
      </motion.button>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold">
          <Layers className="size-5 text-blue" aria-hidden /> My decks
          {decks && decks.length > 0 && <span className="text-sm font-semibold text-muted">· {decks.length}</span>}
        </h2>
        {decks === null ? (
          <Spinner label="Opening your decks…" />
        ) : decks.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-center text-sm font-semibold text-muted shadow-sm">Nothing here yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {decks.map((d, i) => (
              <motion.div key={d.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(0.4, i * 0.05) }} className="group relative min-w-0">
                <Link to={`/decks/${d.id}`} className="block overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-line transition group-hover:-translate-y-1 group-hover:shadow-xl">
                  <DeckThumb deck={d} />
                  <div className="px-4 py-3">
                    <p className="truncate font-extrabold">{d.title}</p>
                    <p className="text-xs font-semibold text-muted">
                      {d.count} slide{d.count === 1 ? '' : 's'} · {ago(d.updatedAt)}
                      {d.shareId ? ' · shared' : ''}
                    </p>
                  </div>
                </Link>
                <button type="button" onClick={() => void remove(d)} className="absolute right-2 top-2 grid size-9 place-items-center rounded-xl bg-white/90 text-muted opacity-0 shadow transition hover:text-bad group-hover:opacity-100 focus:opacity-100" aria-label={`Delete ${d.title}`}>
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </section>
      <div className="flex justify-center">
        <Button variant="ghost" size="sm" icon={<FileUp className="size-4" aria-hidden />} onClick={() => input.current?.click()} disabled={Boolean(step)}>
          Upload another
        </Button>
      </div>
    </div>
  );
}

function DeckThumb({ deck }: { deck: DeckSummary }) {
  if (!deck.first) return <div className="aspect-video bg-paper" />;
  const s = deck.first;
  const slide = 'image' in s ? { ...s, image: deck.thumb } : s;
  const laid = layoutSlide(slide, deck.lookId, { teamName: deck.title, page: 1, total: deck.count });
  return <SlideCanvas bg={laid.bg} shapes={laid.shapes} label={deck.title} />;
}
