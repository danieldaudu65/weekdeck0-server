/**
 * Joining a new activity into what a day already says, so it reads as one
 * plan ("Market storm at Ikeja, then flyer distribution at Ketu market")
 * instead of a second line stacked underneath.
 */
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/[\s.;,]+$/, '').trim();

/** Same activity already there? (ignores case and punctuation) */
export function alreadyHas(current: string, addition: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return n(current).includes(n(addition));
}

/** A quick, offline join. The AI may polish it afterwards. */
export function quickBlend(current: string, addition: string): string {
  const a = tidy(addition);
  const lines = current.split('\n').map(tidy).filter(Boolean);
  if (!lines.length) return a;
  if (alreadyHas(current, a)) return current;
  // Join onto the last line of the day; earlier lines stay as they are.
  const last = lines.pop()!;
  const joiner = last.length + a.length > 150 ? '; ' : /,|\bthen\b/i.test(last) ? ' and ' : ', then ';
  return [...lines, `${last}${joiner}${lowerFirst(a)}`].join('\n').slice(0, 600);
}
