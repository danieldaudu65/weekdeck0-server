/**
 * The monthly deck from the accountant's report Excel (TEAM'S REPORT), laid
 * out like her September slides. For each branch:
 *
 *   Cover → Senior staff → each team (in the file's order) → Others → Branch summary → Jan–Dec
 *
 * Who is in which team, and who is senior staff, comes from her marketer list
 * (set once in the upload window, remembered after). Slide ids match the
 * workbook deck's, so her ticks, order, titles and look carry over.
 *
 *   INFLOW = LAND + HOUSE    INFRAS = INFRAS/OTHER FEES    TOTAL = both    NC = NEW CLIENTS
 */
import { MONTH_NAMES, monthName, monthTitle, nameKey } from './columns';
import { count, money, naira, TABLE_HEAD, tableSlides, type DeckItem, type HistoryRow, type Marketer } from './accDeck';

export interface SavedRow {
  name: string;
  designation: string;
  land: number;
  house: number;
  infra: number;
  nc: number;
  /** Below the "OTHERS" row in her file. */
  others: boolean;
}

export interface SavedBranch {
  branch: string;
  fileName: string;
  rows: SavedRow[];
}

export interface ReportDeckInput {
  region: string;
  month: string;
  branches: SavedBranch[];
  marketers: Marketer[];
  history: HistoryRow[];
}

const inflowOf = (r: SavedRow) => r.land + r.house;

/** A branch's figures for the month (the summary slide, the Jan–Dec slide, "Earlier months"). */
export function branchTotals(b: SavedBranch) {
  const land = b.rows.reduce((a, r) => a + inflowOf(r), 0);
  const infra = b.rows.reduce((a, r) => a + r.infra, 0);
  const nc = b.rows.reduce((a, r) => a + r.nc, 0);
  return { land: Math.round(land * 100) / 100, infra: Math.round(infra * 100) / 100, nc };
}

/** The roster entry for a name as written in the file (by name or any other spelling). */
export function rosterLookup(marketers: Marketer[]) {
  const map = new Map<string, Marketer>();
  for (const m of marketers) map.set(nameKey(m.name), m);
  for (const m of marketers) for (const a of m.aliases) if (!map.has(nameKey(a))) map.set(nameKey(a), m);
  return (name: string) => map.get(nameKey(name));
}

function table(rows: SavedRow[], nameOf: (r: SavedRow) => string) {
  let inflow = 0;
  let infra = 0;
  let nc = 0;
  const body = rows.map((r) => {
    inflow += inflowOf(r);
    infra += r.infra;
    nc += r.nc;
    return [nameOf(r), r.designation, money(inflowOf(r)), money(r.infra), money(inflowOf(r) + r.infra), count(r.nc)];
  });
  return { head: TABLE_HEAD, rows: body, total: ['TOTAL', '', money(inflow), money(infra), money(inflow + infra), count(nc)] };
}

export function buildReportDeck(input: ReportDeckInput): DeckItem[] {
  const { month, branches, marketers, history } = input;
  const find = rosterLookup(marketers);
  const label = monthTitle(month);
  const year = month.slice(0, 4);
  const items: DeckItem[] = [];

  for (const b of branches) {
    const branch = b.branch.toUpperCase();
    // The name on the slides: the spelling on her list (she confirmed it), else the file's.
    const nameOf = (r: SavedRow) => find(r.name)?.name ?? r.name;
    const teamOf = (r: SavedRow) => find(r.name)?.team ?? '';
    const isLead = (r: SavedRow) => find(r.name)?.lead ?? false;

    items.push({
      id: `cover:${branch}`,
      group: branch,
      label: 'Cover',
      extra: false,
      slide: {
        kind: 'cover',
        title: `${branch} PERFORMANCE REVIEW`,
        kicker: 'MONTHLY REVIEW',
        badge: monthName(month),
        week: `For the month of ${monthName(month)}`,
        weekNo: Number(month.slice(5)),
        range: label,
        team: branch,
        name: input.region,
        role: 'Accounts',
        image: '',
      },
    });

    const leads = b.rows.filter(isLead);
    if (leads.length) items.push(...tableSlides(`senior:${branch}`, branch, 'Senior staff', `${branch} SENIOR STAFF INFLOW AND NEW CLIENTS FOR ${label}`, '', table(leads, nameOf)));

    // Teams in the order they come in her file; members in the file's order (team head first).
    const teams: string[] = [];
    for (const r of b.rows) {
      const t = teamOf(r);
      if (t && !teams.includes(t)) teams.push(t);
    }
    for (const t of teams) {
      const members = b.rows.filter((r) => teamOf(r) === t);
      const ordered = [...members.filter(isLead), ...members.filter((r) => !isLead(r))];
      items.push(...tableSlides(`team:${branch}:${t}`, branch, t, `${t.toUpperCase()} INFLOW AND NEW CLIENTS FOR ${label}`, '', table(ordered, nameOf)));
    }

    // Others: no team. Senior staff without a team are on the Senior staff slide only.
    const others = b.rows.filter((r) => !teamOf(r) && !isLead(r));
    if (others.length) items.push(...tableSlides(`others:${branch}`, branch, 'Others', `OTHERS INFLOW AND NEW CLIENTS FOR ${label}`, '', table(others, nameOf)));

    const tot = branchTotals(b);
    items.push({
      id: `summary:${branch}`,
      group: branch,
      label: 'Branch summary',
      extra: false,
      slide: {
        kind: 'table',
        title: `${branch} INFLOW AND NEW CLIENTS FOR ${label}`,
        subtitle: '',
        table: { head: [branch, 'LAND & BUILDING', 'INFRA & OTHER FEES', 'TOTAL', 'NC'], rows: [], total: ['TOTAL', money(tot.land), money(tot.infra), money(tot.land + tot.infra), count(tot.nc)] },
      },
    });

    // Jan–Dec: this month from the file, earlier months from "Earlier months" (filled by each upload).
    const monthRows: string[][] = [];
    const sums = { land: 0, infra: 0, nc: 0 };
    MONTH_NAMES.forEach((name, i) => {
      const m = `${year}-${String(i + 1).padStart(2, '0')}`;
      const h = history.find((x) => x.branch === branch && x.month === m);
      const v = m === month ? tot : h && (h.land !== null || h.infra !== null || h.nc !== null) ? { land: h.land ?? 0, infra: h.infra ?? 0, nc: h.nc ?? 0 } : null;
      if (v && m <= month) {
        sums.land += v.land;
        sums.infra += v.infra;
        sums.nc += v.nc;
      }
      const show = v && m <= month;
      monthRows.push([name.toUpperCase(), show ? money(v.land) : '', show ? money(v.infra) : '', show ? money(v.land + v.infra) : '', show ? count(v.nc) : '']);
    });
    items.push({
      id: `trend:${branch}`,
      group: branch,
      label: 'January – December',
      extra: false,
      slide: {
        kind: 'table',
        title: `${branch} REGIONAL INFLOW AND NEW CLIENTS FOR JAN-DECEMBER, ${year}`,
        subtitle: '',
        table: { head: ['MONTH', 'LAND & BUILDING', 'INFRA & OTHER FEES', 'INFLOW', 'NC'], rows: monthRows, total: ['TOTAL', money(sums.land), money(sums.infra), money(sums.land + sums.infra), count(sums.nc)] },
      },
    });

    // Extra (off until ticked): the top five.
    const ranked = b.rows.map((r) => ({ name: nameOf(r), total: inflowOf(r) + r.infra })).filter((r) => r.total > 0).sort((x, y) => y.total - x.total);
    items.push({
      id: `top:${branch}`,
      group: branch,
      label: 'Top marketers',
      extra: true,
      slide: {
        kind: 'summary',
        title: `${branch} TOP MARKETERS, ${label}`,
        stats: [
          { label: 'Total inflow', value: naira(tot.land + tot.infra), sub: `Land ${naira(tot.land)} · Infra ${naira(tot.infra)}` },
          { label: 'New clients', value: String(tot.nc), sub: tot.nc === 1 ? 'new client this month' : 'new clients this month' },
          { label: 'Top marketer', value: ranked[0] ? ranked[0].name.split(' ')[0] : '—', sub: ranked[0] ? naira(ranked[0].total) : 'No inflow yet' },
        ],
        bars: ranked.slice(0, 5).map((r) => ({ name: r.name, value: r.total, label: naira(r.total) })),
        note: '',
      },
    });
  }

  if (branches.length) items.push({ id: 'thanks', group: 'ALL BRANCHES', label: 'Thank you', extra: false, slide: { kind: 'thanks', title: 'Thank you', sub: [input.region, monthName(month)].filter(Boolean).join(' · ') } });
  return items;
}
