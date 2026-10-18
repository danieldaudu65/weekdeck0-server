/**
 * The deck in one place: what each slide says (buildDeck) and exactly where
 * everything sits (layoutSlide). The on-screen preview, the PDF and the
 * PowerPoint all draw the same shapes, so they always match.
 *
 * Coordinates are on a 1280 × 720 canvas (16:9). Font sizes are canvas px.
 */
import { formatAmount, formatNaira, sumOrNull } from './money';
import { DAYS, DAY_LONG, DAY_SHORT, type Team, type Week, type WeekRow } from './types';
import { mondaysInMonth, monthLabel, monthOf, weekNumberInMonth, weekRangeLabel } from './weeks';

export const CANVAS_W = 1280;
export const CANVAS_H = 720;

/* ------------------------------------------------------------------ content */

export interface DeckTable {
  head: string[];
  rows: string[][];
  total: string[];
}

export type DeckSlide =
  | { kind: 'cover'; title: string; week: string; weekNo: number; range: string; team: string; name: string; role: string; image: string }
  | { kind: 'summary'; title: string; stats: { label: string; value: string; sub: string }[]; bars: { name: string; value: number; label: string }[]; note: string }
  | { kind: 'team'; title: string; members: { name: string; lead: boolean }[] }
  | { kind: 'table'; title: string; subtitle: string; table: DeckTable }
  | { kind: 'activities'; title: string; subtitle: string; items: { day: string; text: string }[] }
  | { kind: 'map'; title: string; subtitle: string; image: string; days: { day: string; color: string; stops: string[] }[] }
  | { kind: 'thanks'; title: string; sub: string };

export interface DeckInput {
  team: Team;
  week: Week;
  /** Every saved week of the same month (the current one included or not; it is merged in). */
  monthWeeks: Week[];
  previousWeek?: Week | null;
  includeSummary: boolean;
  /** A ready map picture of the week's stops (see staticMap.ts), for the map slide. */
  map?: { image: string; days: { day: string; color: string; stops: string[] }[] } | null;
}

const rowTotal = (r: WeekRow | undefined) => (r ? sumOrNull(DAYS.map((d) => r[d])) : null);

/** Short names for the tables, the way teams write them: "OLORUNSOGO". Longer if two would clash. */
function tableNames(team: Team): Map<string, string> {
  const first = (n: string) => n.split(' ')[0].toUpperCase();
  const counts = new Map<string, number>();
  for (const m of team.members) counts.set(first(m.name), (counts.get(first(m.name)) ?? 0) + 1);
  return new Map(team.members.map((m) => [m.id, (counts.get(first(m.name))! > 1 ? m.name : first(m.name)).toUpperCase()]));
}

export function buildDeck({ team, week, monthWeeks, previousWeek, includeSummary, map }: DeckInput): DeckSlide[] {
  const names = tableNames(team);
  const byId = (w: Week | undefined | null) => new Map((w?.rows ?? []).map((r) => [r.memberId, r]));
  const thisWeek = byId(week);
  const month = monthOf(week.weekStart);
  const weekNo = weekNumberInMonth(week.weekStart);
  const weekLabel = `Week ${weekNo} · ${weekRangeLabel(week.weekStart)}`;
  const slides: DeckSlide[] = [];

  const roleBits = [team.managerTag && `(${team.managerTag})`, team.managerRole].filter(Boolean).join('  ');
  slides.push({
    kind: 'cover',
    title: team.deckTitle || 'Weekly Strategic Session',
    week: weekLabel,
    weekNo,
    range: weekRangeLabel(week.weekStart),
    team: team.teamTitle || team.name,
    name: team.managerName || team.name,
    role: roleBits,
    image: team.coverImage || '',
  });

  // ---- Weekly table
  const weeklyRows = team.members.map((m) => {
    const r = thisWeek.get(m.id);
    return [names.get(m.id)!, ...DAYS.map((d) => formatAmount(r?.[d])), r?.nc ? String(r.nc) : '', formatAmount(rowTotal(r))];
  });
  const dayTotals = DAYS.map((d) => sumOrNull(team.members.map((m) => thisWeek.get(m.id)?.[d])));
  const ncTotal = sumOrNull(team.members.map((m) => thisWeek.get(m.id)?.nc));
  const weekTotal = sumOrNull(team.members.map((m) => rowTotal(thisWeek.get(m.id))));
  const weekly: DeckTable = {
    head: ['NAME', ...DAYS.map((d) => DAY_SHORT[d].toUpperCase()), 'NC', 'TOTAL'],
    rows: weeklyRows,
    total: ['TOTAL', ...dayTotals.map(formatAmount), ncTotal ? String(ncTotal) : '', formatAmount(weekTotal)],
  };

  // ---- Summary (calculated, no AI): totals, new clients, top performer, change vs last week
  if (includeSummary) {
    const perMember = team.members.map((m) => ({ name: m.name, value: rowTotal(thisWeek.get(m.id)) ?? 0 }));
    const top = [...perMember].sort((a, b) => b.value - a.value)[0];
    const prevTotal = previousWeek ? sumOrNull(team.members.map((m) => rowTotal(byId(previousWeek).get(m.id)))) : null;
    let change = 'First week recorded';
    if (prevTotal !== null && weekTotal !== null && prevTotal > 0) {
      const pct = Math.round(((weekTotal - prevTotal) / prevTotal) * 100);
      change = pct === 0 ? 'Same as last week' : `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs last week`;
    } else if (prevTotal !== null) change = `Last week ${formatNaira(prevTotal)}`;
    slides.push({
      kind: 'summary',
      title: 'Week at a glance',
      stats: [
        { label: 'Team total', value: formatNaira(weekTotal ?? 0), sub: change },
        { label: 'New clients', value: String(ncTotal ?? 0), sub: ncTotal === 1 ? 'new client this week' : 'new clients this week' },
        { label: 'Top performer', value: top && top.value > 0 ? top.name.split(' ')[0] : '—', sub: top && top.value > 0 ? formatNaira(top.value) : 'No figures yet' },
      ],
      bars: [...perMember].sort((a, b) => b.value - a.value).slice(0, 5).map((p) => ({ name: p.name, value: p.value, label: formatNaira(p.value) })),
      note: (week.note || '').trim(),
    });
  }

  slides.push({ kind: 'team', title: team.teamTitle || team.name, members: team.members.map((m) => ({ name: m.name, lead: m.lead })) });
  slides.push({ kind: 'table', title: 'Weekly Breakdown Summary', subtitle: weekLabel, table: weekly });

  // ---- Monthly table: one column per Monday of the month
  const mondays = mondaysInMonth(month);
  const weeksByStart = new Map(monthWeeks.map((w) => [w.weekStart, w]));
  weeksByStart.set(week.weekStart, week); // the week being edited always counts, saved or not
  const monthRows = team.members.map((m) => {
    const perWeek = mondays.map((mon) => rowTotal(byId(weeksByStart.get(mon)).get(m.id)));
    const nc = sumOrNull(mondays.map((mon) => byId(weeksByStart.get(mon)).get(m.id)?.nc));
    return { perWeek, nc, total: sumOrNull(perWeek) };
  });
  const monthly: DeckTable = {
    head: ['NAME', ...mondays.map((_, i) => `WK ${i + 1}`), 'NC', 'TOTAL'],
    rows: team.members.map((m, i) => [names.get(m.id)!, ...monthRows[i].perWeek.map(formatAmount), monthRows[i].nc ? String(monthRows[i].nc) : '', formatAmount(monthRows[i].total)]),
    total: [
      'TOTAL',
      ...mondays.map((_, wi) => formatAmount(sumOrNull(monthRows.map((r) => r.perWeek[wi])))),
      (() => {
        const n = sumOrNull(monthRows.map((r) => r.nc));
        return n ? String(n) : '';
      })(),
      formatAmount(sumOrNull(monthRows.map((r) => r.total))),
    ],
  };
  slides.push({ kind: 'table', title: 'Monthly Breakdown Summary', subtitle: monthLabel(month), table: monthly });

  slides.push({
    kind: 'activities',
    title: team.activitiesTitle || 'This Week’s Activities',
    subtitle: weekLabel,
    items: DAYS.map((d) => ({ day: DAY_LONG[d], text: week.activities[d] || '' })),
  });
  if (map && map.image) {
    slides.push({ kind: 'map', title: 'Where We’re Going', subtitle: weekLabel, image: map.image, days: map.days });
  }
  slides.push({ kind: 'thanks', title: 'Thank you!', sub: [team.managerName, team.teamTitle || team.name].filter(Boolean).join(' · ') });
  return slides;
}

/* ------------------------------------------------------------------ shapes */

/** Present mode only: numbers count up, bars grow from the left. Ignored by PDF and PowerPoint. */
export type Anim = 'count' | 'grow';

/** sans = Arial, serif = Georgia, display = Arial Black. All three exist on Windows, Mac and phones. */
export type Font = 'sans' | 'serif' | 'display';

export type Shape =
  | { type: 'rect'; x: number; y: number; w: number; h: number; fill: string | null; radius?: number; stroke?: string; strokeW?: number; anim?: Anim }
  | { type: 'ellipse'; x: number; y: number; w: number; h: number; fill: string | null; stroke?: string; strokeW?: number }
  | {
      type: 'text';
      x: number;
      y: number;
      w: number;
      h: number;
      text: string;
      size: number;
      color: string;
      bold?: boolean;
      align?: 'left' | 'center' | 'right';
      valign?: 'top' | 'middle' | 'bottom';
      spacing?: number; // letter spacing in px
      font?: Font;
      italic?: boolean;
      anim?: Anim;
    }
  | { type: 'image'; x: number; y: number; w: number; h: number; src: string }
  | {
      type: 'table';
      x: number;
      y: number;
      colW: number[];
      rowH: number;
      size: number;
      head: string[];
      rows: string[][];
      total: string[];
      headFill: string;
      headInk: string;
      stripe: string;
      bg: string;
      ink: string;
      line: string;
      totalFill: string;
      totalInk: string;
      font?: Font;
      /** Bold the first and last columns of body rows (names and totals). */
      boldEdges?: boolean;
    };

/** Where each shape sits is decided by the chosen look: see looks.ts. */
export { layoutSlide } from './looks';
