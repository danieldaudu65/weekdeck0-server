/**
 * Amounts are whole naira. Managers can type "500000", "500,000", "500k" or "1.2m".
 */
export function parseAmount(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/[₦,\s]/g, '').replace(/^ngn/, '');
  if (!s) return null;
  const m = /^(\d+(?:\.\d+)?)([km])?$/.exec(s);
  if (!m) return NaN;
  const mult = m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1;
  return Math.round(parseFloat(m[1]) * mult);
}

const fmt = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

/** 600000 → "600,000" (the way the team's tables show it). */
export function formatAmount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  return fmt.format(Math.round(n));
}

/** 600000 → "₦600,000" */
export function formatNaira(n: number | null | undefined): string {
  return `₦${formatAmount(n ?? 0) || '0'}`;
}

/** Sum that stays null when every value is empty (so empty cells stay empty on the slide). */
export function sumOrNull(values: (number | null | undefined)[]): number | null {
  let total = 0;
  let any = false;
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      total += v;
      any = true;
    }
  }
  return any ? total : null;
}
