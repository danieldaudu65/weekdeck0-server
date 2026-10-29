/**
 * Goes through an uploaded deck before it is used:
 *
 * - every row: INFLOW + INFRAS = TOTAL (LAND & BUILDING + INFRA & OTHER FEES = INFLOW in the year table)
 * - every TOTAL row: each column = the sum of the rows above it
 * - numbers written wrongly ("11,810,00.00") or untidily ("1,245,835.0")
 * - names: against the roster (and its other spellings), and the same person
 *   written two ways on different slides ("SENAIKE MARGRETE" / "SENAIKE MARGARET")
 * - title typos ("CORPERATE") and slides that name another month
 * - when the month is in the workbook: each person's figures against it
 *
 * Each finding is a Fix the accountant can keep or untick; applyFixes() makes
 * the corrected slides. Pure functions, unit-tested.
 */
import { MONTH_NAMES, monthName, nameKey } from './columns';
import type { HistoryRow, Marketer } from './accDeck';
import { LIKELY, nameScore } from './names';
import { monthInText, type ImportedSlide } from './slideImport';

export type FixGroup = 'sum' | 'format' | 'name' | 'title' | 'workbook' | 'note';

export interface Fix {
  id: string;
  group: FixGroup;
  /** Plain words: what is wrong and what it becomes. */
  text: string;
  /** Slide it is on (names: every slide the name is on). */
  slides: string[];
  apply: boolean;
  /** Cell change. row = index in rows, or "total" for the TOTAL row. */
  cell?: { slide: string; row: number | 'total'; col: number; to: string };
  /** Rename a person on every slide. `to` null = the accountant must pick from options. */
  name?: { from: string; to: string | null; options: string[] };
  title?: { slide: string; to: string };
  /** Add a TOTAL row to a table that has none (the year table). */
  addTotal?: { slide: string; to: string[] };
}

export interface WorkbookFigures {
  /** Per branch: each person (by nameKey of their roster name) and the branch total. */
  branches: Map<string, { people: Map<string, { inflow: number; infra: number; nc: number }>; total: { inflow: number; infra: number; nc: number } }>;
  label: string;
}

export interface CheckContext {
  month: string;
  roster: Marketer[];
  workbook?: WorkbookFigures | null;
}

/* ------------------------------------------------------------------ numbers */

const fmt2 = new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n: number) => (Math.abs(n) < 0.005 ? '-' : fmt2.format(Math.round(n * 100) / 100));
const plain = (n: number | null) => (n ? money(n) : '0');
const countText = (n: number) => (n ? String(Math.round(n)) : '-');

/** A cell as a number: '' → null, '-' → 0, "1,245,835.0" → 1245835. `bad` = commas in the wrong places. */
export function readNumber(cell: string): { value: number | null; bad: boolean; tidy: boolean } {
  const s = (cell ?? '').replace(/[₦\s]/g, '');
  if (!s) return { value: null, bad: false, tidy: true };
  if (/^[-–—]$/.test(s) || /^nil+$/i.test(s)) return { value: 0, bad: false, tidy: true };
  if (!/^-?[\d,]*\.?\d*$/.test(s) || !/\d/.test(s)) return { value: null, bad: true, tidy: false };
  const value = Number(s.replace(/,/g, ''));
  const grouped = /^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(s) || /^-?\d+(\.\d+)?$/.test(s);
  return { value: Number.isFinite(value) ? value : null, bad: !grouped, tidy: grouped && /\.\d{2}$/.test(s) && s.includes(',') === value >= 1000 };
}

const norm = (s: string) =>
  (s ?? '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Which columns hold what. */
export function roles(head: string[]) {
  const h = head.map(norm);
  const find = (...names: string[]) => h.findIndex((x, i) => i > 0 && names.includes(x));
  let inflow = find('LAND AND BUILDING', 'LAND AND BUILDINGS');
  const infra = find('INFRAS', 'INFRA', 'INFRA AND OTHER FEES', 'INFRASTRUCTURE', 'INFRASTRUCTURE AND OTHER FEES');
  let total = find('TOTAL');
  if (inflow >= 0) {
    // Year table: LAND & BUILDING | INFRA & OTHER FEES | INFLOW (their total).
    if (total < 0) total = h.findIndex((x, i) => i > Math.max(inflow, infra) && x === 'INFLOW');
  } else inflow = find('INFLOW');
  const nc = find('NC', 'NEW CLIENTS', 'NEW CLIENT');
  return { inflow, infra, total, nc, isPeople: /MARKETER|NAME/.test(h[0] ?? ''), isMonths: /^MONTHS?$/.test(h[0] ?? '') };
}

/* ------------------------------------------------------------------ check */

let fixN = 0;
const fid = () => `f${(fixN++).toString(36)}`;

const TITLE_TYPOS: [RegExp, string][] = [
  [/\bCORPERATE\b/gi, 'CORPORATE'],
  [/\bCOPERATIVE\b/gi, 'COOPERATIVE'],
  [/\bCO-?OPRATIVE\b/gi, 'COOPERATIVE'],
  [/\bTERRITORRY\b/gi, 'TERRITORY'],
  [/\bINFLOWS?\s+AND\s+NEW\s+CLIENT\b/gi, 'INFLOW AND NEW CLIENTS'],
  [/\bPERFOMANCE\b/gi, 'PERFORMANCE'],
];

/** Everything to look at in the deck, in slide order. */
export function checkDeck(slides: ImportedSlide[], ctx: CheckContext): Fix[] {
  const fixes: Fix[] = [];
  const at = (s: ImportedSlide) => `Slide ${slides.indexOf(s) + 1}`;

  /* ---- titles: typos and other months ---- */
  for (const s of slides) {
    let to = s.title;
    for (const [re, word] of TITLE_TYPOS) to = to.replace(re, word);
    const m = /JAN(UARY)?\s*-\s*DEC/i.test(to) ? null : monthInText(to);
    let why = '';
    if (m && m !== ctx.month) {
      const [y, mo] = m.split('-').map(Number);
      const [ty, tmo] = ctx.month.split('-').map(Number);
      to = to.replace(new RegExp(`\\b${MONTH_NAMES[mo - 1]}\\b`, 'i'), MONTH_NAMES[tmo - 1].toUpperCase()).replace(new RegExp(`\\b${y}\\b`), String(ty));
      why = ` (it said ${monthName(m)} in a ${monthName(ctx.month)} deck)`;
    }
    if (to !== s.title) fixes.push({ id: fid(), group: 'title', text: `${at(s)} title: “${s.title}” → “${to}”${why}`, slides: [s.id], apply: true, title: { slide: s.id, to } });
  }

  /* ---- names ---- */
  const people = new Map<string, { name: string; slides: Set<string>; count: number; designations: Set<string> }>();
  for (const s of slides) {
    if (s.kind !== 'table' || !roles(s.head).isPeople) continue;
    for (const r of s.rows) {
      const k = nameKey(r[0]);
      if (!k) continue;
      if (!people.has(k)) people.set(k, { name: r[0].trim(), slides: new Set(), count: 0, designations: new Set() });
      const p = people.get(k)!;
      p.slides.add(s.id);
      p.count++;
      if (r[1]?.trim()) p.designations.add(r[1].trim().toUpperCase());
    }
  }
  const rosterBy = new Map<string, Marketer>();
  for (const m of ctx.roster) {
    rosterBy.set(nameKey(m.name), m);
    for (const a of m.aliases) if (!rosterBy.has(nameKey(a))) rosterBy.set(nameKey(a), m);
  }
  const settled = new Set<string>();
  for (const [k, p] of people) {
    const exact = rosterBy.get(k);
    if (exact) {
      settled.add(k);
      if (nameKey(exact.name) !== k) {
        fixes.push({ id: fid(), group: 'name', text: `“${p.name}” is written “${exact.name}” on your roster`, slides: [...p.slides], apply: true, name: { from: p.name, to: exact.name, options: [exact.name, p.name] } });
      }
      continue;
    }
    let best: { m: Marketer; score: number } | null = null;
    for (const m of ctx.roster) for (const n of [m.name, ...m.aliases]) {
      const score = nameScore(p.name, n);
      if (score >= LIKELY && (!best || score > best.score)) best = { m, score };
    }
    if (best) {
      settled.add(k);
      fixes.push({
        id: fid(),
        group: 'name',
        text: `“${p.name}” looks like “${best.m.name}” on your roster`,
        slides: [...p.slides],
        // Sure enough when very close, or when the roster's spelling is on another slide of this deck.
        apply: best.score >= 0.9 || people.has(nameKey(best.m.name)),
        name: { from: p.name, to: best.m.name, options: [best.m.name, p.name] },
      });
    }
  }
  // The same person written two ways inside the deck (and not settled by the roster).
  const open = [...people.entries()].filter(([k]) => !settled.has(k));
  const used = new Set<string>();
  for (let i = 0; i < open.length; i++) {
    const [ka, a] = open[i];
    if (used.has(ka)) continue;
    const group = [a];
    for (let j = i + 1; j < open.length; j++) {
      const [kb, b] = open[j];
      if (!used.has(kb) && nameScore(a.name, b.name) >= LIKELY) {
        group.push(b);
        used.add(kb);
      }
    }
    if (group.length < 2) continue;
    used.add(ka);
    const sorted = [...group].sort((x, y) => y.count - x.count);
    const clear = sorted[0].count > sorted[1].count;
    for (const g of sorted.slice(clear ? 1 : 0)) {
      if (clear || g === sorted[0]) {
        const others = group.filter((x) => x !== g).map((x) => x.name);
        fixes.push({
          id: fid(),
          group: 'name',
          text: clear ? `“${g.name}” and “${sorted[0].name}” look like the same person (“${sorted[0].name}” is used more)` : `Same person written two ways: ${group.map((x) => `“${x.name}”`).join(' and ')}. Pick the right one.`,
          slides: [...new Set(group.flatMap((x) => [...x.slides]))],
          apply: clear,
          name: { from: g.name, to: clear ? sorted[0].name : null, options: [...others, g.name] },
        });
      }
      if (!clear) break;
    }
  }
  for (const p of people.values()) {
    if (p.designations.size > 1) fixes.push({ id: fid(), group: 'note', text: `${p.name} has different designations on different slides: ${[...p.designations].join(', ')}`, slides: [...p.slides], apply: false });
  }

  /* ---- sums and number formats ---- */
  for (const s of slides) {
    if (s.kind !== 'table') continue;
    const r = roles(s.head);
    const numeric = new Set([r.inflow, r.infra, r.total, r.nc].filter((c) => c > 0));
    const rows = s.rows.map((row) => [...row]);
    const total = s.total.length ? [...s.total] : null;
    const isMoney = (c: number) => c !== r.nc;
    const show = (c: number, v: number) => (isMoney(c) ? money(v) : countText(v));
    const cellFix = (row: number | 'total', col: number, to: string, text: string, group: FixGroup = 'sum') => {
      const from = row === 'total' ? total![col] : rows[row][col];
      if (from === to) return;
      fixes.push({ id: fid(), group, text, slides: [s.id], apply: group !== 'workbook', cell: { slide: s.id, row, col, to } });
      if (row === 'total') total![col] = to;
      else rows[row][col] = to;
    };
    const where = (row: number | 'total') => (row === 'total' ? 'TOTAL row' : `${rows[row][0] || `row ${row + 1}`}`);

    // Untidy and wrongly written numbers.
    const allRows: [number | 'total', string[]][] = [...rows.map((x, i) => [i, x] as [number, string[]]), ...(total ? [['total', total] as ['total', string[]]] : [])];
    for (const [ri, row] of allRows) {
      for (const c of numeric) {
        const n = readNumber(row[c]);
        if (n.bad && c !== r.total && ri !== 'total') {
          fixes.push({ id: fid(), group: 'note', text: `${at(s)}, ${where(ri)}: “${row[c]}” in ${s.head[c]} isn’t a proper number. Check it.`, slides: [s.id], apply: false });
        } else if (!n.bad && n.value !== null && n.value !== 0 && isMoney(c) && !n.tidy) {
          cellFix(ri, c, money(n.value), `${at(s)}, ${where(ri)}: ${s.head[c]} written “${row[c]}” → “${money(n.value)}”`, 'format');
        }
      }
    }
    // Each row: INFLOW + INFRAS = TOTAL.
    if (r.inflow > 0 && r.infra > 0 && r.total > 0) {
      for (const [ri, row] of allRows) {
        const a = readNumber(row[r.inflow]);
        const b = readNumber(row[r.infra]);
        const t = readNumber(row[r.total]);
        if (a.bad || b.bad || (a.value === null && b.value === null)) continue;
        const want = (a.value ?? 0) + (b.value ?? 0);
        if (t.bad || t.value === null || Math.abs(want - t.value) > 0.005) {
          cellFix(ri, r.total, money(want), `${at(s)}, ${where(ri)}: ${s.head[r.total]} “${row[r.total] || 'empty'}” → “${money(want)}” (${plain(a.value)} + ${plain(b.value)})`);
        }
      }
    }
    // TOTAL row: each column = the rows above it.
    const sumCol = (c: number) => {
      let sum = 0;
      for (const row of rows) {
        const n = readNumber(row[c]);
        if (n.bad) return null;
        sum += n.value ?? 0;
      }
      return sum;
    };
    if (total && rows.length) {
      for (const c of numeric) {
        const want = sumCol(c);
        if (want === null) continue;
        const t = readNumber(total[c]);
        if (t.bad || t.value === null ? want !== 0 || t.bad : Math.abs(want - t.value) > 0.005) {
          cellFix('total', c, show(c, want), `${at(s)}, TOTAL ${s.head[c]}: “${total[c] || 'empty'}” → “${show(c, want)}” (the ${rows.length} rows above add up to that)`);
        }
      }
    } else if (r.isMonths && numeric.size) {
      const to = s.head.map((_, c) => (c === 0 ? 'TOTAL' : numeric.has(c) ? show(c, sumCol(c) ?? 0) : ''));
      fixes.push({ id: fid(), group: 'format', text: `${at(s)}: add a TOTAL row for the year so far (${to.filter(Boolean).slice(1).join(' · ')})`, slides: [s.id], apply: false, addTotal: { slide: s.id, to } });
    }

    // Against the workbook, when this month is in it.
    const wb = ctx.workbook?.branches.get(s.branch);
    if (wb && r.isPeople && r.inflow > 0) {
      rows.forEach((row, ri) => {
        const k = nameKey(rosterBy.get(nameKey(row[0]))?.name ?? row[0]);
        const p = wb.people.get(k) ?? { inflow: 0, infra: 0, nc: 0 };
        const pairs: [number, number][] = [
          [r.inflow, p.inflow],
          [r.infra, p.infra],
          [r.total, p.inflow + p.infra],
          [r.nc, p.nc],
        ];
        for (const [c, want] of pairs) {
          if (c <= 0) continue;
          const n = readNumber(row[c]);
          if (n.bad || Math.abs((n.value ?? 0) - want) <= 0.005) continue;
          cellFix(ri, c, show(c, want), `${at(s)}, ${row[0]}: ${s.head[c]} “${row[c] || 'empty'}”, the workbook (${ctx.workbook!.label}) says “${show(c, want)}”`, 'workbook');
        }
      });
    }
  }
  return fixes;
}

/* ------------------------------------------------------------------ apply */

/** The slides with the ticked fixes made. Names change everywhere they appear. */
export function applyFixes(slides: ImportedSlide[], fixes: Fix[]): ImportedSlide[] {
  const on = fixes.filter((f) => f.apply);
  const renames = new Map<string, string>();
  for (const f of on) if (f.name?.to && nameKey(f.name.to) !== nameKey(f.name.from)) renames.set(nameKey(f.name.from), f.name.to);
  return slides.map((s) => {
    const out: ImportedSlide = { ...s, head: [...s.head], rows: s.rows.map((r) => [...r]), total: [...s.total], lines: [...s.lines] };
    const t = on.find((f) => f.title?.slide === s.id);
    if (t) out.title = t.title!.to;
    if (out.kind === 'table' && roles(out.head).isPeople) for (const r of out.rows) if (renames.has(nameKey(r[0]))) r[0] = renames.get(nameKey(r[0]))!;
    for (const f of on) {
      if (f.cell?.slide === s.id) {
        const { row, col, to } = f.cell;
        if (row === 'total') out.total[col] = to;
        else if (out.rows[row]) out.rows[row][col] = to;
      }
      if (f.addTotal?.slide === s.id) out.total = [...f.addTotal.to];
    }
    return out;
  });
}

/** Recalculate one table (the "Recalculate" button in the slide editor): row sums and the TOTAL row. */
export function recalcSlide(s: ImportedSlide, month: string): ImportedSlide {
  const sums = checkDeck([s], { month, roster: [] }).filter((f) => f.group === 'sum' || f.group === 'format');
  return applyFixes([s], sums.map((f) => ({ ...f, apply: !f.addTotal })))[0];
}

/* ------------------------------------------------------------------ extras */

/** The Jan–Dec table → "Earlier months" (for the January – December slide of later months). */
export function historyFromDeck(slides: ImportedSlide[], year: string): HistoryRow[] {
  const out: HistoryRow[] = [];
  for (const s of slides) {
    if (s.kind !== 'table' || !s.branch) continue;
    const r = roles(s.head);
    if (!r.isMonths || r.inflow < 0) continue;
    const y = /\b(20\d{2})\b/.exec(s.title)?.[1] ?? year;
    for (const row of s.rows) {
      const mi = MONTH_NAMES.findIndex((m) => norm(m) === norm(row[0]) || norm(m).slice(0, 3) === norm(row[0]));
      if (mi < 0) continue;
      const land = readNumber(row[r.inflow]);
      const infra = r.infra > 0 ? readNumber(row[r.infra]) : { value: null, bad: false };
      const nc = r.nc > 0 ? readNumber(row[r.nc]) : { value: null, bad: false };
      if (land.value === null && infra.value === null && nc.value === null) continue;
      if (land.bad || infra.bad || nc.bad) continue;
      out.push({ branch: s.branch, month: `${y}-${String(mi + 1).padStart(2, '0')}`, land: land.value, infra: infra.value, nc: nc.value === null ? null : Math.round(nc.value) });
    }
  }
  return out;
}

export interface TeamEntry {
  name: string;
  designation: string;
  branch: string;
  /** '' = Others. */
  team: string;
  /** On the Senior staff slide. */
  lead: boolean;
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\bAnd\b/g, '&');

/**
 * Who is in which team, from the team slides ("SOCIAL TEAM INFLOW AND NEW
 * CLIENTS FOR …" lists its members), and who is senior staff.
 */
export function teamsFromDeck(slides: ImportedSlide[]): TeamEntry[] {
  const out = new Map<string, TeamEntry>();
  const seniors = new Set<string>();
  for (const s of slides) if (s.kind === 'table' && /\bSENIOR\b/i.test(s.title) && roles(s.head).isPeople) for (const r of s.rows) seniors.add(`${s.branch}|${nameKey(r[0])}`);
  for (const s of slides) {
    if (s.kind !== 'table' || !roles(s.head).isPeople || /\bSENIOR\b/i.test(s.title)) continue;
    const isOthers = /^\s*OTHERS?\b/i.test(s.title);
    const teamName = isOthers ? '' : titleCase((/^(.*?)\s+(INFLOW|FOR|PERFORMANCE)\b/i.exec(s.title)?.[1] ?? s.title).trim());
    for (const r of s.rows) {
      const k = nameKey(r[0]);
      if (!k) continue;
      const prev = out.get(`${s.branch}|${k}`);
      if (prev && prev.team && isOthers) continue; // a team slide wins over Others
      out.set(`${s.branch}|${k}`, { name: r[0].trim().toUpperCase(), designation: (r[1] ?? '').trim().toUpperCase(), branch: s.branch, team: teamName, lead: seniors.has(`${s.branch}|${k}`) });
    }
  }
  // Senior staff who aren't on any team slide.
  for (const s of slides) {
    if (s.kind !== 'table' || !/\bSENIOR\b/i.test(s.title)) continue;
    for (const r of s.rows) {
      const k = nameKey(r[0]);
      if (k && !out.has(`${s.branch}|${k}`)) out.set(`${s.branch}|${k}`, { name: r[0].trim().toUpperCase(), designation: (r[1] ?? '').trim().toUpperCase(), branch: s.branch, team: '', lead: true });
    }
  }
  return [...out.values()];
}
