import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { Check, ImageIcon, Loader2, Palette, RefreshCw, Search } from 'lucide-react';
import { SCENES, drawCover, generateCover, randomSeed, type Scene } from '../lib/coverArt';
import { PHOTO_TOPICS, photoAsCover, searchPhotos, type Photo } from '../lib/photos';
import { api, ApiError } from '../lib/api';
import type { Theme } from '../lib/templates';

/**
 * Pick a cover picture: real photos (Pixabay or Pexels, free) or simple drawings in the
 * team's colours (works without any key).
 */
export function CoverGenerator({ theme, onPick }: { theme: Theme; onPick: (dataUrl: string) => void }) {
  const [tab, setTab] = useState<'photos' | 'drawings'>('photos');
  return (
    <div className="mt-4 rounded-2xl bg-paper p-3 sm:p-4">
      <div className="flex gap-1 rounded-full bg-white p-1 ring-1 ring-line">
        {(
          [
            ['photos', 'Real photos', ImageIcon],
            ['drawings', 'Drawings', Palette],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full text-[13px] font-extrabold transition ${tab === id ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
          >
            <Icon className="size-4" aria-hidden /> {label}
          </button>
        ))}
      </div>
      {tab === 'photos' ? <Photos onPick={onPick} /> : <Drawings theme={theme} onPick={onPick} />}
    </div>
  );
}

/* ------------------------------------------------------------- real photos */

function Photos({ onPick }: { onPick: (dataUrl: string) => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [query, setQuery] = useState(PHOTO_TOPICS[0].query);
  const [typed, setTyped] = useState('');
  const [page, setPage] = useState(1);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [source, setSource] = useState<'pixabay' | 'pexels'>('pixabay');

  useEffect(() => {
    api<{ photos?: boolean }>('/api/health')
      .then((h) => setEnabled(Boolean(h.photos)))
      .catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setState('loading');
    searchPhotos(query, page)
      .then((r) => {
        if (!alive) return;
        setPhotos((cur) => (page === 1 ? r.photos : [...cur, ...r.photos.filter((p) => !cur.some((c) => c.id === p.id))]));
        setHasMore(r.hasMore);
        setSource(r.source);
        setState('ready');
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : 'Photos didn’t load.');
        setState('error');
      });
    return () => {
      alive = false;
    };
  }, [enabled, query, page]);

  const run = (q: string) => {
    setQuery(q);
    setPage(1);
    setPhotos([]);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (typed.trim().length >= 2) run(typed.trim());
  };
  const use = async (p: Photo) => {
    setBusyId(p.id);
    try {
      onPick(await photoAsCover(p));
      setChosen(p.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Couldn’t use that picture. Try another.');
      setState('error');
    } finally {
      setBusyId(null);
    }
  };

  if (enabled === null) return <p className="py-8 text-center text-sm font-semibold text-muted">Loading…</p>;
  if (!enabled)
    return (
      <div className="mt-3 rounded-xl bg-white p-4 text-sm">
        <p className="font-extrabold">Real photos need a free Pixabay key</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>
            Sign up free at{' '}
            <a className="font-bold text-blue underline" href="https://pixabay.com/accounts/register/" target="_blank" rel="noreferrer">
              pixabay.com
            </a>
            , then open{' '}
            <a className="font-bold text-blue underline" href="https://pixabay.com/api/docs/" target="_blank" rel="noreferrer">
              pixabay.com/api/docs
            </a>{' '}
            and copy your key.
          </li>
          <li>
            Add <code className="rounded bg-paper px-1">PIXABAY_API_KEY=your-key</code> to <code className="rounded bg-paper px-1">server/.env</code>.
          </li>
          <li>Restart the server and open this again.</li>
        </ol>
        <p className="mt-2 text-muted">Until then, use Drawings or upload your own photo.</p>
      </div>
    );

  return (
    <div className="mt-3">
      <form onSubmit={submit} className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search photos</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Search: land, duplex, Lekki, estate…"
            className="h-10 w-full rounded-full border border-line bg-white pl-9 pr-3 text-sm outline-none focus:border-blue"
          />
        </label>
        <button type="submit" className="h-10 shrink-0 rounded-full bg-ink px-4 text-sm font-extrabold text-white active:scale-95">
          Search
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {PHOTO_TOPICS.map((t) => (
          <button
            key={t.query}
            type="button"
            onClick={() => {
              setTyped('');
              run(t.query);
            }}
            aria-pressed={query === t.query}
            className={`h-8 rounded-full px-3 text-xs font-bold transition ${query === t.query ? 'bg-blue text-white' : 'bg-white text-ink ring-1 ring-line'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {state === 'error' && <p className="mt-3 rounded-xl bg-bad/10 px-3 py-2 text-sm font-semibold text-bad">{error}</p>}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {photos.map((p) => (
          <motion.button
            key={p.id}
            type="button"
            onClick={() => void use(p)}
            disabled={busyId !== null}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`group relative aspect-[4/3] overflow-hidden rounded-xl text-left ring-offset-2 transition active:scale-95 ${chosen === p.id ? 'ring-[3px] ring-blue' : 'ring-1 ring-line hover:ring-2 hover:ring-blue'}`}
            style={{ background: p.color }}
            aria-label={p.alt ? `Use photo: ${p.alt}` : 'Use this photo'}
          >
            <img src={p.thumb} alt="" loading="lazy" className="size-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 pb-1 pt-4 text-[10px] font-semibold text-white">{p.photographer}</span>
            {(busyId === p.id || chosen === p.id) && (
              <span className="absolute inset-0 grid place-items-center bg-black/35">
                {busyId === p.id ? <Loader2 className="size-6 animate-spin text-white" aria-hidden /> : <Check className="size-7 text-white" aria-hidden />}
              </span>
            )}
          </motion.button>
        ))}
        {state === 'loading' &&
          Array.from({ length: photos.length ? 4 : 8 }, (_, i) => <div key={`s${i}`} className="aspect-[4/3] animate-pulse rounded-xl bg-line/60" />)}
      </div>
      {state === 'ready' && !photos.length && <p className="py-6 text-center text-sm font-semibold text-muted">No photos for that. Try other words.</p>}

      <div className="mt-3 flex items-center justify-between gap-3">
        <a href={source === 'pexels' ? 'https://www.pexels.com' : 'https://pixabay.com'} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-muted underline">
          Photos from {source === 'pexels' ? 'Pexels' : 'Pixabay'}
        </a>
        {hasMore && state === 'ready' && (
          <button type="button" onClick={() => setPage((n) => n + 1)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-extrabold ring-1 ring-line active:scale-95">
            <RefreshCw className="size-3.5" aria-hidden /> More photos
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- drawings */

function DrawingOption({ scene, seed, theme, onPick }: { scene: Scene; seed: number; theme: Theme; onPick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawCover(ref.current, scene, theme, seed);
  }, [scene, seed, theme]);
  return (
    <button type="button" onClick={onPick} className="overflow-hidden rounded-xl ring-1 ring-line transition hover:ring-2 hover:ring-blue active:scale-95" aria-label="Use this drawing">
      <canvas ref={ref} className="block aspect-square w-full" />
    </button>
  );
}

function Drawings({ theme, onPick }: { theme: Theme; onPick: (dataUrl: string) => void }) {
  const [scene, setScene] = useState<Scene>('estate');
  const [seeds, setSeeds] = useState(() => [randomSeed(), randomSeed(), randomSeed(), randomSeed()]);
  const more = () => setSeeds([randomSeed(), randomSeed(), randomSeed(), randomSeed()]);
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-1.5">
        {SCENES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setScene(s.id);
              more();
            }}
            aria-pressed={scene === s.id}
            className={`h-8 rounded-full px-3 text-xs font-bold transition ${scene === s.id ? 'bg-blue text-white' : 'bg-white text-ink ring-1 ring-line'}`}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {seeds.map((seed) => (
          <DrawingOption key={`${scene}-${seed}`} scene={scene} seed={seed} theme={theme} onPick={() => onPick(generateCover(scene, theme, seed))} />
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={more} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-extrabold ring-1 ring-line active:scale-95">
          <RefreshCw className="size-3.5" aria-hidden /> More versions
        </button>
      </div>
    </div>
  );
}
