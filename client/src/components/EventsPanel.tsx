import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { CalendarDays, Check, ExternalLink, Loader2, MapPin, Plus, Search, ShieldCheck, Sparkles, X } from 'lucide-react';
import { post, ApiError } from '../lib/api';
import { DAYS, DAY_SHORT, type DayKey } from '../lib/types';

interface FoundEvent {
  title: string;
  place: string;
  area: string;
  dates: string;
  days: string[];
  why: string;
  url: string;
  verified: boolean;
}
interface Result {
  area: string;
  events: FoundEvent[];
  sources: { url: string; title: string }[];
  /** Plain search results, shown when no event could be confirmed (or the AI was busy). */
  leads?: { title: string; url: string; snippet: string; date: string }[];
  note?: string;
  suggestionsHtml: string;
}

/** A Google search for the same thing, for the manager to check by hand. */
const googleUrl = (area: string, focus: string) => `https://www.google.com/search?q=${encodeURIComponent(`${focus || 'events'} in ${area} Lagos this week`)}`;

const IDEAS = ['Trade fairs & exhibitions', 'Church crusades & conventions', 'Big market days', 'Concerts & festivals', 'Property expos'];

/** The activity line an event becomes. */
export const eventLine = (e: FoundEvent) => (e.place ? `Market storm at ${e.place} (${e.title})` : `Market storm at ${e.title}`);

/**
 * "Find events near us": a web search finds real events in the team's
 * area this week. Each one shows where it was found; tap a day to add it.
 */
export function EventsPanel({ weekStart, region, added, onAdd, onClose }: { weekStart: string; region: string; added: (day: DayKey, line: string) => boolean; onAdd: (day: DayKey, line: string) => void; onClose: () => void }) {
  const [area, setArea] = useState(region || 'Lagos');
  const [focus, setFocus] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');

  const run = async (query = focus) => {
    setState('loading');
    setError('');
    try {
      const r = await post<Result>('/api/ai/events', { weekStart, area, query });
      setResult(r);
      setState('done');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The search didn’t work. Try again.');
      setState('error');
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run();
  };

  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="mb-4 overflow-hidden rounded-card border border-line bg-white">
      <div className="flex items-start justify-between gap-3 bg-ink p-4 text-white">
        <div>
          <p className="flex items-center gap-2 font-extrabold">
            <Sparkles className="size-4 text-sun" aria-hidden /> Find events near us
          </p>
          <p className="mt-0.5 text-xs text-white/70">Searches the web for real events this week. Every result shows where it was found.</p>
        </div>
        <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-full bg-white/10 hover:bg-white/20" aria-label="Close">
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <form onSubmit={submit} className="grid gap-2 p-4 sm:grid-cols-[1fr_1.4fr_auto]">
        <label className="relative">
          <span className="sr-only">Area</span>
          <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={area} onChange={(e) => setArea(e.target.value)} maxLength={60} placeholder="Area, e.g. Ikeja" className="h-11 w-full rounded-full border border-line pl-9 pr-3 text-sm outline-none focus:border-blue" />
        </label>
        <label className="relative">
          <span className="sr-only">What kind of events</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={focus} onChange={(e) => setFocus(e.target.value)} maxLength={120} placeholder="Any kind (or e.g. church programmes)" className="h-11 w-full rounded-full border border-line pl-9 pr-3 text-sm outline-none focus:border-blue" />
        </label>
        <button type="submit" disabled={state === 'loading' || area.trim().length < 2} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-blue px-5 text-sm font-extrabold text-white disabled:opacity-60">
          {state === 'loading' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Search className="size-4" aria-hidden />} Search
        </button>
      </form>
      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        {IDEAS.map((i) => (
          <button
            key={i}
            type="button"
            disabled={state === 'loading'}
            onClick={() => {
              setFocus(i);
              void run(i);
            }}
            className="h-8 rounded-full bg-paper px-3 text-xs font-bold hover:bg-line disabled:opacity-50"
          >
            {i}
          </button>
        ))}
      </div>

      <div className="border-t border-line p-4">
        {state === 'idle' && <p className="text-sm text-muted">Pick a kind of event or tap Search. It takes about 10–20 seconds.</p>}
        {state === 'loading' && (
          <div className="space-y-2" aria-live="polite">
            <p className="flex items-center gap-2 text-sm font-semibold text-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Searching the web for events around {area}…
            </p>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-paper" />
            ))}
          </div>
        )}
        {state === 'error' && (
          <div className="space-y-2">
            <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm font-semibold text-bad">{error}</p>
            <GoogleButton area={area} focus={focus} />
          </div>
        )}
        {state === 'done' && result && (
          <>
            {result.note && <p className="mb-3 rounded-xl bg-sun-soft px-3 py-2 text-sm font-semibold text-[#7a4f00]">{result.note}</p>}
            {!result.events.length ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  {result.leads?.length ? 'No event could be confirmed for this exact week. These search results may still help:' : `No events could be confirmed online for ${result.area} this week. Try a nearby area or another kind of event.`}
                </p>
                {result.leads && result.leads.length > 0 && (
                  <ul className="space-y-2">
                    {result.leads.slice(0, 8).map((l) => (
                      <li key={l.url} className="rounded-2xl bg-paper p-3">
                        <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-extrabold text-blue underline">
                          {l.title} <ExternalLink className="size-3" aria-hidden />
                        </a>
                        {l.snippet && <p className="mt-1 line-clamp-2 text-xs text-muted">{l.snippet}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <ul className="space-y-3">
                {result.events.map((e) => (
                  <li key={e.title + e.dates} className="rounded-2xl bg-paper p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-extrabold">{e.title}</p>
                      {e.verified ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#ecfdf3] px-2 py-0.5 text-[11px] font-bold text-[#05603a]">
                          <ShieldCheck className="size-3.5" aria-hidden /> Found online
                        </span>
                      ) : (
                        <span className="rounded-full bg-sun-soft px-2 py-0.5 text-[11px] font-bold text-[#7a4f00]">Check the link</span>
                      )}
                    </div>
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                      {(e.place || e.area) && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5" aria-hidden /> {[e.place, e.area].filter(Boolean).join(', ')}
                        </span>
                      )}
                      {e.dates && (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="size-3.5" aria-hidden /> {e.dates}
                        </span>
                      )}
                    </p>
                    {e.why && <p className="mt-1 text-sm">{e.why}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-xs font-bold text-muted">Add to:</span>
                      {DAYS.map((d) => {
                        const line = eventLine(e);
                        const done = added(d, line);
                        const suggested = e.days.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            disabled={done}
                            onClick={() => onAdd(d, line)}
                            className={`inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-extrabold transition active:scale-95 disabled:opacity-60 ${suggested ? 'bg-blue text-white' : 'bg-white ring-1 ring-line'}`}
                          >
                            {done ? <Check className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />} {DAY_SHORT[d]}
                          </button>
                        );
                      })}
                      {e.url && (
                        <a href={e.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-blue underline">
                          Source <ExternalLink className="size-3" aria-hidden />
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {result.sources.length > 0 && (
              <details className="mt-3 text-xs text-muted">
                <summary className="cursor-pointer font-bold">Pages the AI used ({result.sources.length})</summary>
                <ul className="mt-1 space-y-1">
                  {result.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                        {s.title || s.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div className="mt-3">
              <GoogleButton area={area} focus={focus} />
            </div>
            {/* Google asks apps that show search-grounded answers to show these search suggestions. */}
            {result.suggestionsHtml && (
              <iframe title="Google search suggestions" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={result.suggestionsHtml} className="mt-3 h-16 w-full rounded-xl border-0" />
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

function GoogleButton({ area, focus }: { area: string; focus: string }) {
  return (
    <a href={googleUrl(area, focus)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3.5 text-xs font-extrabold ring-1 ring-line hover:ring-ink/30">
      <Search className="size-3.5" aria-hidden /> Search on Google yourself <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}
