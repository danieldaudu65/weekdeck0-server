/**
 * Activity memory: learns from every week the team has saved and suggests
 * what to write. No AI needed and works offline once loaded.
 *
 * - What they usually do on this day ("Usual Monday")
 * - Phrases matching what they're typing ("mar" → "Market storm at Ikeja")
 * - Places they've been, right after "at" / "in" / "around"
 * - Starter ideas for new teams
 */
import { DAYS, DAY_SHORT, type Activities, type DayKey } from './types';

export interface HistoryWeek {
  weekStart: string;
  activities: Activities;
}

export interface Phrase {
  text: string;
  key: string;
  count: number;
  days: Record<DayKey, number>;
  last: string; // weekStart it was last used
}

export interface Place {
  name: string;
  key: string;
  count: number;
  last: string;
  /** Which kinds of activity happened here (type key → times), e.g. market storms at Ikeja. */
  with: Record<string, number>;
}

export interface Memory {
  phrases: Phrase[];
  /** Kinds of activity regardless of place: "Market storm at", with the days they happen. */
  types: Phrase[];
  places: Place[];
  weeks: number;
}

export interface Suggestion {
  id: string;
  label: string; // what the chip shows
  note: string; // "Usual Mon", "6×", "Idea", "Place"
  kind: 'usual' | 'memory' | 'place' | 'idea';
  /** The new text of the box if this suggestion is chosen. */
  apply: string;
}

/** Common marketing activities for teams with no history yet. "…" means a place goes there. */
export const STARTER_IDEAS = [
  'Market storm at …',
  'Site inspection with prospects at …',
  'Church outreach at …',
  'Mosque outreach at …',
  'Corporate visit / B2B presentation at …',
  'Flyer distribution at …',
  'Telemarketing and follow-up calls',
  'WhatsApp broadcast to prospects',
  'Social media posts and live video',
  'Follow-up visits to hot prospects',
  'Estate tour with clients',
  'Product knowledge training',
  'Weekly review and target setting',
  'Strategy meeting at the office',
  'Open house / free site inspection day',
  'Referral calls to past clients',
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** One day's text → separate activities (lines, "; ", bullets, sentences). */
export function splitActivities(text: string): string[] {
  return text
    .split(/\n|;|•|•|\s\|\s|(?<=[a-z0-9)])\.\s+(?=[A-Z])/)
    .map((s) =>
      s
        .replace(/^\s*(?:[-*–]|\d+[.)]|[a-z][.)])\s*/i, '')
        .replace(/[.,\s]+$/, '')
        .trim(),
    )
    .filter((s) => s.length >= 4 && /\p{L}/u.test(s));
}

const PREP = /\b(?:at|in|around|to|@)\s+/i;
/** "Market storm at Ikeja" → type "Market storm", preposition "at". */
const TYPE_RE = /^(.{3,60}?)\s+(at|in|around|@)\s+\S/i;
const CAP_WORD = String.raw`[A-Z0-9][\p{L}0-9'’.-]*`;
const PLACE_RE = new RegExp(String.raw`\b(?:at|in|around|to|@)\s+((?:${CAP_WORD})(?:\s+(?:${CAP_WORD}|of|de|la))*)`, 'gu');
const AND_PLACE_RE = new RegExp(String.raw`(?:,|\band\b|&)\s+((?:${CAP_WORD})(?:\s+${CAP_WORD})*)`, 'gu');
const NOT_PLACES = new Set(['the', 'our', 'my', 'a', 'an', 'office', 'home', 'least', 'all', 'i']);

/** Places named in an activity: capitalised words after "at", "in", "around", "to", and the "and X" that follow. */
export function extractPlaces(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PLACE_RE)) {
    const name = m[1].replace(/\s+(?:of|de|la)$/i, '').replace(/[.'’-]+$/, '').trim();
    if (name.length >= 3 && !NOT_PLACES.has(name.toLowerCase())) out.push(name);
    // "at Ikeja, Ogba and Allen Avenue" → Ogba, Allen Avenue too
    const rest = text.slice((m.index ?? 0) + m[0].length);
    const tail = /^[^.;\n]*/.exec(rest)?.[0] ?? '';
    for (const a of tail.matchAll(AND_PLACE_RE)) {
      if (a.index !== undefined && /\b(?:then|before|after)\b/i.test(tail.slice(0, a.index))) break;
      const extra = a[1].replace(/[.'’-]+$/, '').trim();
      if (extra.length >= 3 && !NOT_PLACES.has(extra.toLowerCase())) out.push(extra);
    }
  }
  return out;
}

const weeksBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / (7 * 86400000));
const emptyDays = (): Record<DayKey, number> => ({ mon: 0, tue: 0, wed: 0, thu: 0, fri: 0 });

/** Learns phrases and places from the history (newest or oldest first, either works). */
export function buildMemory(history: HistoryWeek[]): Memory {
  const phrases = new Map<string, Phrase>();
  const types = new Map<string, Phrase>();
  const places = new Map<string, Place>();
  for (const w of history) {
    for (const d of DAYS) {
      const text = w.activities?.[d] ?? '';
      if (!text.trim()) continue;
      for (const item of splitActivities(text)) {
        const key = norm(item);
        if (!key) continue;
        const p = phrases.get(key) ?? { text: item, key, count: 0, days: emptyDays(), last: w.weekStart };
        p.count += 1;
        p.days[d] += 1;
        if (w.weekStart >= p.last) {
          p.last = w.weekStart;
          p.text = item; // keep the most recent spelling
        }
        phrases.set(key, p);
        const tm = TYPE_RE.exec(item);
        const typeKey = tm ? norm(tm[1]) : '';
        if (tm && typeKey) {
          const t = types.get(typeKey) ?? { text: `${tm[1]} ${tm[2].toLowerCase()} `, key: typeKey, count: 0, days: emptyDays(), last: w.weekStart };
          t.count += 1;
          t.days[d] += 1;
          if (w.weekStart >= t.last) t.last = w.weekStart;
          types.set(typeKey, t);
        }
        for (const name of new Set(extractPlaces(item))) {
          const pk = norm(name);
          const pl = places.get(pk) ?? { name, key: pk, count: 0, last: w.weekStart, with: {} };
          pl.count += 1;
          if (typeKey) pl.with[typeKey] = (pl.with[typeKey] ?? 0) + 1;
          if (w.weekStart >= pl.last) {
            pl.last = w.weekStart;
            pl.name = name;
          }
          places.set(pk, pl);
        }
      }
    }
  }
  return { phrases: [...phrases.values()], types: [...types.values()].filter((t) => t.count >= 2), places: [...places.values()], weeks: history.length };
}

/** How strongly to suggest something: used often, used lately, used on this day. */
function score(p: { count: number; last: string; days?: Record<DayKey, number> }, now: string, day?: DayKey) {
  const ago = Math.max(0, weeksBetween(p.last, now));
  let s = Math.log2(1 + p.count) * 2 + 3 / (1 + ago / 3);
  if (day && p.days) s += (p.days[day] / p.count) * 3 + Math.min(2, p.days[day] * 0.5);
  return s;
}

/** Every typed word must start a word in the phrase (in any order). */
function matches(key: string, query: string): number {
  const words = key.split(' ');
  const q = query.split(' ').filter(Boolean);
  if (!q.length) return 0;
  let hits = 0;
  for (const t of q) {
    if (!words.some((w) => w.startsWith(t))) return -1;
    hits += 1;
  }
  return hits + (key.startsWith(q.join(' ')) ? 3 : 0);
}

const agoNote = (last: string, now: string) => {
  const n = weeksBetween(last, now);
  return n <= 0 ? 'this week' : n === 1 ? 'last week' : n < 9 ? `${n} wks ago` : '';
};

/**
 * Suggestions for one day's box, given what's typed so far.
 * Only the line being typed (after the last newline) is completed.
 */
export function suggest(mem: Memory, opts: { day: DayKey; text: string; weekStart: string; limit?: number }): Suggestion[] {
  const { day, text, weekStart } = opts;
  const limit = opts.limit ?? 6;
  const nl = text.lastIndexOf('\n');
  const head = nl >= 0 ? text.slice(0, nl + 1) : '';
  const line = text.slice(nl + 1);
  const q = norm(line);
  const already = new Set(splitActivities(text).map(norm));
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  const add = (s: Suggestion) => {
    const k = norm(s.apply);
    if (seen.has(k) || out.length >= limit) return;
    seen.add(k);
    out.push(s);
  };

  // 1. Places: right after "at …" (optionally partly typed: "at Ik")
  const prep = /\b(at|in|around|to|@)\s+([^,;]*)$/i.exec(line) ?? (/\b(at|in|around|to|@)$/i.test(line.trim()) ? ['', '', ''] : null);
  if (prep) {
    const partial = norm(prep[2] ?? '');
    const before = prep[2] ? line.slice(0, line.length - prep[2].length) : line.replace(/\s*$/, ' ');
    const typeKey = norm(before.replace(/\b(?:at|in|around|to|@)\s*$/i, ''));
    const placeScore = (p: Place) => score(p, weekStart) + (typeKey && p.with[typeKey] ? 4 + p.with[typeKey] : 0);
    const ranked = mem.places
      .filter((p) => !partial || (p.key.startsWith(partial) && p.key !== partial))
      .sort((a, b) => placeScore(b) - placeScore(a));
    for (const p of ranked)
      add({ id: `place:${p.key}`, label: p.name, note: p.count > 1 ? `${p.count}×` : agoNote(p.last, weekStart) || 'Place', kind: 'place', apply: `${head}${before}${p.name}` });
    if (out.length) return out;
  }

  // 2. Their own history: whole activities, and kinds of activity ("Market storm at …")
  const candidates = [
    ...mem.types.map((p) => ({ p, isType: true })),
    ...mem.phrases.map((p) => ({ p, isType: false })),
  ];
  const ranked = candidates
    .filter(({ p }) => !already.has(p.key) && p.key !== q)
    .map((c) => ({ ...c, m: q ? matches(c.p.key, q) : 0 }))
    .filter((x) => x.m >= 0)
    .map((x) => ({ ...x, s: x.m * 4 + score(x.p, weekStart, day) + (q ? 0 : x.p.days[day] > 0 ? 4 : 0) + (x.isType ? 1.5 : 0) }))
    .sort((a, b) => b.s - a.s);
  for (const { p, isType } of ranked) {
    const usual = p.days[day] >= 2 && p.days[day] / p.count >= 0.5;
    const note = usual ? `Usual ${DAY_SHORT[day]}` : p.count > 1 ? `${p.count}×` : agoNote(p.last, weekStart) || 'Before';
    const label = isType ? `${p.text.trim()} …` : p.text;
    add({ id: `${isType ? 'type' : 'mem'}:${p.key}`, label, note, kind: usual ? 'usual' : 'memory', apply: `${head}${p.text}` });
  }

  // 3. Starter ideas (always a few for new teams; only matching ones otherwise)
  if (out.length < limit) {
    const fresh = mem.phrases.length < 8;
    for (const idea of STARTER_IDEAS) {
      const k = norm(idea.replace('…', ''));
      if (already.has(k)) continue;
      if (q ? matches(k, q) < 0 : !fresh) continue;
      const apply = `${head}${idea.replace(/\s*…$/, ' ')}`;
      add({ id: `idea:${k}`, label: idea, note: 'Idea', kind: 'idea', apply: idea.endsWith('…') ? apply : apply.trimEnd() });
    }
  }
  return out;
}

/** The most typical activity for each empty day, from their own history (for "Fill from usual"). */
export function planFromUsual(mem: Memory, current: Activities, weekStart: string): Partial<Activities> {
  const plan: Partial<Activities> = {};
  const used = new Set<string>();
  for (const d of DAYS) {
    if (current[d].trim()) continue;
    const best = mem.phrases
      .filter((p) => p.days[d] > 0 && !used.has(p.key))
      .sort((a, b) => score(b, weekStart, d) + b.days[d] - (score(a, weekStart, d) + a.days[d]))[0];
    if (best) {
      plan[d] = best.text;
      used.add(best.key);
    }
  }
  return plan;
}

/** True when an activity mentions a place we know (to show a pin icon, etc). */
export const hasPlace = (text: string) => PREP.test(text) && extractPlaces(text).length > 0;
