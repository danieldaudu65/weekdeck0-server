/**
 * Telling when two spellings are the same person: "ARTHUR NYONG STIM" vs
 * "ARTHUR NYONG ETIM", "SENAIKE MARGRETE" vs "SENAIKE MARGARET",
 * "Kenneth Ipogah" vs "IPOGAH KENNETH".
 */
import { nameKey } from './columns';

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

const tokens = (s: string) => nameKey(s).split(' ').filter((t) => t.length > 1);

const wordSim = (a: string, b: string) => 1 - levenshtein(a, b) / Math.max(a.length, b.length);

/**
 * 1 = same person for sure, 0 = nothing alike. Word by word, in any order:
 * each word of the shorter name is paired with its closest word in the other
 * (typos allowed), weighted by word length.
 */
export function nameScore(a: string, b: string): number {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const free = [...big];
  let sum = 0;
  let weight = 0;
  for (const t of [...small].sort((x, y) => y.length - x.length)) {
    let best = 0;
    let at = -1;
    free.forEach((u, i) => {
      const s = wordSim(t, u);
      if (s > best) {
        best = s;
        at = i;
      }
    });
    if (at >= 0) free.splice(at, 1);
    sum += best * t.length;
    weight += t.length;
  }
  const paired = sum / weight;
  if (small.length === big.length) return paired === 1 ? 0.97 : paired;
  // One name inside the other ("KOMOLAFE OLAMIDE" / "KOMOLAFE OLAMIDE GRACE"): likely, not certain.
  return small.length >= 2 ? Math.min(0.9, paired) : paired * 0.7;
}

export const LIKELY = 0.84;

/** Best match for a name in a list, if it is likely the same person. */
export function bestMatch<T>(name: string, list: T[], nameOf: (x: T) => string[]): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null;
  for (const item of list) {
    for (const n of nameOf(item)) {
      const score = nameScore(name, n);
      if (!best || score > best.score) best = { item, score };
    }
  }
  return best && best.score >= LIKELY ? best : null;
}

/** Groups of roster names that are probably the same person (for "merge these?"). */
export function similarGroups<T>(list: T[], nameOf: (x: T) => string): T[][] {
  const used = new Set<number>();
  const groups: T[][] = [];
  for (let i = 0; i < list.length; i++) {
    if (used.has(i)) continue;
    const g = [list[i]];
    for (let j = i + 1; j < list.length; j++) {
      if (used.has(j)) continue;
      if (nameScore(nameOf(list[i]), nameOf(list[j])) >= LIKELY) {
        g.push(list[j]);
        used.add(j);
      }
    }
    if (g.length > 1) {
      used.add(i);
      groups.push(g);
    }
  }
  return groups;
}
