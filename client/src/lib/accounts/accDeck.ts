/**
 * The accountant's monthly deck, built from the workbook the way their
 * September slides are laid out. For each branch:
 *
 *   Cover → Senior staff → one slide per team → Others → Branch summary → Jan–Dec
 *
 * Every table: MARKETERS NAME | DESIGNATION | INFLOW | INFRAS | TOTAL | NC
 *   INFLOW = Workflow + New client payments (land & building)
 *   INFRAS = Infrastructure & other fees payments
 *   NC     = new clients (different client names in the New client sheet)
 *
 * Extra slides (off until ticked): top marketers, pending confirmations, new
 * clients list, commission, inflow by bank, branches vs last month.
 * Every slide has a stable id, so the accountant's ticks, order and titles are
 * remembered from month to month.
 */
import type { DeckSlide, DeckTable } from '../deck';
import { addMonths, isConfirmed, MONTH_NAMES, monthName, monthTitle, nameKey, type Payment } from './columns';

export interface Marketer {
  id: string;
  name: string;
  designation: string;
  supervisor: string;
  accountNumber: string;
  spouseName: string;
  spouseAccount: string;
  branch: string;
  team: string;
  lead: boolean;
  teamRef: string | null;
  aliases: string[];
}

export interface SummaryCell {
  month: string;
  branch: string;
  all: { land: number; infra: number; nc: number };
  confirmed: { land: number; infra: number; nc: number };
}

export interface HistoryRow {
  branch: string;
  month: string;
  land: number | null;
  infra: number | null;
  nc: number | null;
}

export interface DeckPrefs {
  lookId: string;
  off: string[];
  on: string[];
  order: string[];
  titles: { id: string; title: string }[];
  countAll: boolean;
}

export interface DeckItem {
  id: string;
  /** Section on the Export page: the branch name, or "ALL BRANCHES". */
  group: string;
  /** Short name in the slide list. */
  label: string;
  /** An extra slide (off until the accountant ticks it). */
  extra: boolean;
  slide: DeckSlide;
}

export interface DeckInput {
  region: string;
  month: string;
  payments: Payment[];
  marketers: Marketer[];
  tabs: { name: string; branch: string }[];
  summary: SummaryCell[];
  history: HistoryRow[];
  /** false = only CONFIRMED payments count (default). */
  countAll: boolean;
}

/* ------------------------------------------------------------------ numbers */

const fmt2 = new Intl.NumberFormat('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** 3333694.7 → "3,333,694.70"; 0 → "-" (the way their tables show it). */
export const money = (n: number) => (Math.abs(n) < 0.005 ? '-' : fmt2.format(n));
const count = (n: number) => (n ? String(n) : '-');
const naira = (n: number) => `₦${new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(Math.round(n))}`;

interface Stat {
  inflow: number;
  infra: number;
  nc: Set<string>;
}
const newStat = (): Stat => ({ inflow: 0, infra: 0, nc: new Set() });
const add = (s: Stat, p: Payment) => {
  const amt = p.amount ?? 0;
  if (p.kind === 'infra') s.infra += amt;
  else s.inflow += amt;
  if (p.kind === 'new' && nameKey(p.clientName)) s.nc.add(nameKey(p.clientName));
};

const TABLE_HEAD = ['MARKETERS NAME', 'DESIGNATION', 'INFLOW', 'INFRAS', 'TOTAL', 'NC'];
const ROWS_PER_SLIDE = 13;

interface Person {
  key: string;
  name: string;
  designation: string;
}

function personTable(people: Person[], stats: Map<string, Stat>): { rows: string[][]; total: string[] } {
  const totals = newStat();
  let nc = 0;
  const rows = people.map((p) => {
    const s = stats.get(p.key) ?? newStat();
    totals.inflow += s.inflow;
    totals.infra += s.infra;
    nc += s.nc.size;
    return [p.name, p.designation || '', money(s.inflow), money(s.infra), money(s.inflow + s.infra), count(s.nc.size)];
  });
  return { rows, total: ['TOTAL', '', money(totals.inflow), money(totals.infra), money(totals.inflow + totals.infra), count(nc)] };
}

/** A long table becomes several slides ("(1/2)", "(2/2)"); the total is on the last. */
function tableSlides(id: string, group: string, label: string, title: string, subtitle: string, table: DeckTable, extra = false): DeckItem[] {
  if (table.rows.length <= ROWS_PER_SLIDE) return [{ id, group, label, extra, slide: { kind: 'table', title, subtitle, table } }];
  const parts = Math.ceil(table.rows.length / ROWS_PER_SLIDE);
  return Array.from({ length: parts }, (_, i) => ({
    id: i ? `${id}#${i + 1}` : id,
    group,
    label: `${label} (${i + 1}/${parts})`,
    extra,
    slide: {
      kind: 'table' as const,
      title: `${title} (${i + 1}/${parts})`,
      subtitle,
      table: { head: table.head, rows: table.rows.slice(i * ROWS_PER_SLIDE, (i + 1) * ROWS_PER_SLIDE), total: i === parts - 1 ? table.total : table.head.map(() => '') },
    },
  }));
}

/* ------------------------------------------------------------------ build */

export function buildAccountsDeck(input: DeckInput): DeckItem[] {
  const { month, payments, marketers, tabs, countAll } = input;
  const tabBranch = new Map(tabs.map((t) => [t.name, t.branch]));
  const branchOf = (p: Payment) => (p.branch || tabBranch.get(p.tab) || p.tab || '').toUpperCase().trim();
  const counted = payments.filter((p) => p.month === month && (countAll || isConfirmed(p)) && (p.amount ?? 0) !== 0);
  const monthPays = payments.filter((p) => p.month === month);

  // Roster lookup by every spelling.
  const roster = new Map<string, Marketer>();
  for (const m of marketers) {
    roster.set(nameKey(m.name), m);
    for (const a of m.aliases) if (!roster.has(nameKey(a))) roster.set(nameKey(a), m);
  }
  const personKey = (raw: string) => {
    const m = roster.get(nameKey(raw));
    return m ? nameKey(m.name) : nameKey(raw);
  };

  // Branches in the order of the tabs, then any others.
  const branches: string[] = [];
  const addBranch = (b: string) => b && !branches.includes(b) && branches.push(b);
  for (const t of tabs) if (monthPays.some((p) => p.tab === t.name)) addBranch((t.branch || t.name).toUpperCase());
  for (const p of monthPays) addBranch(branchOf(p));
  for (const m of marketers) if (m.branch && monthPays.length === 0) addBranch(m.branch);

  const label = monthTitle(month);
  const items: DeckItem[] = [];
  const [year] = month.split('-');

  for (const branch of branches) {
    const pays = counted.filter((p) => branchOf(p) === branch);
    const stats = new Map<string, Stat>();
    for (const p of pays) {
      const k = personKey(p.marketer);
      if (!k) continue;
      if (!stats.has(k)) stats.set(k, newStat());
      add(stats.get(k)!, p);
    }
    const branchTotal = newStat();
    for (const p of pays) add(branchTotal, p);

    const inBranch = marketers.filter((m) => m.branch.toUpperCase() === branch);
    const person = (m: Marketer): Person => ({ key: nameKey(m.name), name: m.name, designation: m.designation });
    const teams = new Map<string, Marketer[]>();
    for (const m of inBranch) {
      if (!m.team) continue;
      if (!teams.has(m.team)) teams.set(m.team, []);
      teams.get(m.team)!.push(m);
    }
    const onTeams = new Set([...teams.values()].flat().map((m) => nameKey(m.name)));

    // Cover
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

    // Senior staff: the team heads.
    const leads = inBranch.filter((m) => m.lead).map(person);
    if (leads.length) {
      const t = personTable(leads, stats);
      items.push(...tableSlides(`senior:${branch}`, branch, 'Senior staff', `${branch} SENIOR STAFF INFLOW AND NEW CLIENTS FOR ${label}`, '', { head: TABLE_HEAD, ...t }));
    }

    // One slide per team: team head first.
    for (const [team, members] of [...teams.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const ordered = [...members].sort((a, b) => Number(b.lead) - Number(a.lead) || a.name.localeCompare(b.name)).map(person);
      const t = personTable(ordered, stats);
      items.push(...tableSlides(`team:${branch}:${team}`, branch, team, `${team.toUpperCase()} INFLOW AND NEW CLIENTS FOR ${label}`, '', { head: TABLE_HEAD, ...t }));
    }

    // Others: not on a team, plus anyone with payments here who isn't on one of this branch's teams.
    const others = new Map<string, Person>();
    for (const m of inBranch) if (!m.team) others.set(nameKey(m.name), person(m));
    for (const p of pays) {
      const k = personKey(p.marketer);
      if (!k || onTeams.has(k) || others.has(k)) continue;
      const m = roster.get(k);
      others.set(k, m ? person(m) : { key: k, name: k, designation: (p.designation || '').toUpperCase() });
    }
    if (others.size) {
      const list = [...others.values()].sort((a, b) => a.name.localeCompare(b.name));
      const t = personTable(list, stats);
      items.push(...tableSlides(`others:${branch}`, branch, 'Others', `OTHERS INFLOW AND NEW CLIENTS FOR ${label}`, '', { head: TABLE_HEAD, ...t }));
    }

    // Branch summary
    items.push({
      id: `summary:${branch}`,
      group: branch,
      label: 'Branch summary',
      extra: false,
      slide: {
        kind: 'table',
        title: `${branch} INFLOW AND NEW CLIENTS FOR ${label}`,
        subtitle: '',
        table: {
          head: [branch, 'LAND & BUILDING', 'INFRA & OTHER FEES', 'TOTAL', 'NC'],
          rows: [],
          total: ['TOTAL', money(branchTotal.inflow), money(branchTotal.infra), money(branchTotal.inflow + branchTotal.infra), count(branchTotal.nc.size)],
        },
      },
    });

    // Jan–Dec: from the workbook where there are rows, else from "Earlier months".
    const thisCell = { land: branchTotal.inflow, infra: branchTotal.infra, nc: branchTotal.nc.size };
    const monthRows: string[][] = [];
    const sums = { land: 0, infra: 0, nc: 0 };
    MONTH_NAMES.forEach((name, i) => {
      const m = `${year}-${String(i + 1).padStart(2, '0')}`;
      const v = monthFigures(input, branch, m, m === month ? thisCell : null);
      if (v) {
        sums.land += v.land;
        sums.infra += v.infra;
        sums.nc += v.nc;
      }
      monthRows.push([name.toUpperCase(), v ? money(v.land) : '', v ? money(v.infra) : '', v ? money(v.land + v.infra) : '', v ? count(v.nc) : '']);
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

    /* ---- extras for this branch ---- */
    const ranked = [...stats.entries()].map(([k, s]) => ({ name: roster.get(k)?.name ?? k, total: s.inflow + s.infra, nc: s.nc.size })).sort((a, b) => b.total - a.total);
    const top = ranked[0];
    items.push({
      id: `top:${branch}`,
      group: branch,
      label: 'Top marketers',
      extra: true,
      slide: {
        kind: 'summary',
        title: `${branch} TOP MARKETERS, ${label}`,
        stats: [
          { label: 'Total inflow', value: naira(branchTotal.inflow + branchTotal.infra), sub: `Land ${naira(branchTotal.inflow)} · Infra ${naira(branchTotal.infra)}` },
          { label: 'New clients', value: String(branchTotal.nc.size), sub: branchTotal.nc.size === 1 ? 'new client this month' : 'new clients this month' },
          { label: 'Top marketer', value: top && top.total > 0 ? top.name.split(' ')[0] : '—', sub: top && top.total > 0 ? naira(top.total) : 'No payments yet' },
        ],
        bars: ranked.slice(0, 5).map((r) => ({ name: r.name, value: r.total, label: naira(r.total) })),
        note: '',
      },
    });

    const branchRows = monthPays.filter((p) => branchOf(p) === branch);
    const pending = branchRows.filter((p) => !isConfirmed(p) && (p.amount ?? 0) > 0);
    items.push(
      ...tableSlides(
        `pending:${branch}`,
        branch,
        'Pending confirmations',
        `${branch} PAYMENTS AWAITING CONFIRMATION, ${label}`,
        `${pending.length} payment${pending.length === 1 ? '' : 's'} not confirmed yet`,
        {
          head: ['CLIENT', 'MARKETER', 'AMOUNT', 'STATUS'],
          rows: pending.map((p) => [p.clientName || p.alertName, p.marketer, money(p.amount ?? 0), p.confirmation || 'NOT CHECKED']),
          total: ['TOTAL', '', money(pending.reduce((a, p) => a + (p.amount ?? 0), 0)), String(pending.length)],
        },
        true,
      ),
    );

    const fresh = pays.filter((p) => p.kind === 'new');
    items.push(
      ...tableSlides(
        `newclients:${branch}`,
        branch,
        'New clients list',
        `${branch} NEW CLIENTS, ${label}`,
        '',
        {
          head: ['CLIENT', 'MARKETER', 'LAND', 'FORM', 'AMOUNT'],
          rows: fresh.map((p) => [p.clientName, p.marketer, money(p.land ?? 0), /^\d+(\.\d+)?$/.test(p.form) ? money(Number(p.form)) : p.form || '-', money(p.amount ?? 0)]),
          total: ['TOTAL', `${branchTotal.nc.size} client${branchTotal.nc.size === 1 ? '' : 's'}`, money(fresh.reduce((a, p) => a + (p.land ?? 0), 0)), '', money(fresh.reduce((a, p) => a + (p.amount ?? 0), 0))],
        },
        true,
      ),
    );

    // Commission: amount × RATE% of each counted payment.
    const comm = new Map<string, { name: string; designation: string; inflow: number; commission: number }>();
    for (const p of pays) {
      const k = personKey(p.marketer);
      if (!k) continue;
      const m = roster.get(k);
      if (!comm.has(k)) comm.set(k, { name: m?.name ?? k, designation: m?.designation ?? p.designation, inflow: 0, commission: 0 });
      const c = comm.get(k)!;
      c.inflow += p.amount ?? 0;
      c.commission += ((p.amount ?? 0) * (p.rate ?? 0)) / 100;
    }
    const commRows = [...comm.values()].sort((a, b) => b.commission - a.commission);
    items.push(
      ...tableSlides(
        `commission:${branch}`,
        branch,
        'Commission',
        `${branch} COMMISSION, ${label}`,
        'Amount × rate of each payment',
        {
          head: ['MARKETER', 'DESIGNATION', 'PAYMENTS', 'COMMISSION'],
          rows: commRows.map((c) => [c.name, c.designation, money(c.inflow), money(c.commission)]),
          total: ['TOTAL', '', money(commRows.reduce((a, c) => a + c.inflow, 0)), money(commRows.reduce((a, c) => a + c.commission, 0))],
        },
        true,
      ),
    );

    const banks = new Map<string, number>();
    for (const p of pays) banks.set(p.bank || 'OTHER', (banks.get(p.bank || 'OTHER') ?? 0) + (p.amount ?? 0));
    const bankList = [...banks.entries()].sort((a, b) => b[1] - a[1]);
    items.push({
      id: `banks:${branch}`,
      group: branch,
      label: 'Inflow by bank',
      extra: true,
      slide: {
        kind: 'summary',
        title: `${branch} INFLOW BY BANK, ${label}`,
        stats: bankList.slice(0, 3).map(([b, v]) => ({ label: b, value: naira(v), sub: `${pays.filter((p) => (p.bank || 'OTHER') === b).length} payments` })),
        bars: bankList.slice(0, 5).map(([b, v]) => ({ name: b, value: v, label: naira(v) })),
        note: '',
      },
    });
  }

  // All branches: this month vs last month.
  if (branches.length) {
    const prev = addMonths(month, -1);
    const pick = (c: SummaryCell | undefined) => (c ? (countAll ? c.all : c.confirmed) : null);
    const rowsNow = branches.map((b) => {
      const now = counted.filter((p) => branchOf(p) === b).reduce((a, p) => a + (p.amount ?? 0), 0);
      const before = pick(input.summary.find((c) => c.month === prev && c.branch === b));
      const hist = input.history.find((h) => h.month === prev && h.branch === b);
      const last = before ? before.land + before.infra : hist ? (hist.land ?? 0) + (hist.infra ?? 0) : null;
      return { b, now, last };
    });
    const totalNow = rowsNow.reduce((a, r) => a + r.now, 0);
    const known = rowsNow.filter((r) => r.last !== null);
    const totalLast = known.reduce((a, r) => a + (r.last ?? 0), 0);
    const change = (now: number, last: number | null) => {
      if (last === null) return 'no figures for last month';
      if (!last) return 'nothing last month';
      const pct = Math.round(((now - last) / last) * 100);
      return pct === 0 ? 'same as last month' : `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs last month`;
    };
    items.push({
      id: 'compare',
      group: 'ALL BRANCHES',
      label: 'Branches vs last month',
      extra: true,
      slide: {
        kind: 'summary',
        title: `${input.region.toUpperCase()}: ${label} VS ${monthTitle(prev)}`,
        stats: [
          { label: `${MONTH_NAMES[Number(month.slice(5)) - 1]} total`, value: naira(totalNow), sub: known.length === rowsNow.length ? change(totalNow, totalLast) : `${MONTH_NAMES[Number(prev.slice(5)) - 1]} not complete` },
          ...rowsNow.slice(0, 2).map((r) => ({ label: r.b, value: naira(r.now), sub: change(r.now, r.last) })),
        ],
        bars: [...rowsNow].sort((a, b) => b.now - a.now).slice(0, 5).map((r) => ({ name: r.b, value: r.now, label: naira(r.now) })),
        note: '',
      },
    });
  }

  items.push({ id: 'thanks', group: 'ALL BRANCHES', label: 'Thank you', extra: false, slide: { kind: 'thanks', title: 'Thank you', sub: [input.region, monthName(month)].filter(Boolean).join(' · ') } });
  return items;
}

/** A month's land / infra / NC for the Jan–Dec slide: this month as worked out, the workbook's summary, or typed-in history. */
function monthFigures(input: DeckInput, branch: string, m: string, current: { land: number; infra: number; nc: number } | null) {
  if (current && (current.land || current.infra || current.nc)) return current;
  const cell = input.summary.find((c) => c.month === m && c.branch === branch);
  if (cell) {
    const v = input.countAll ? cell.all : cell.confirmed;
    if (v.land || v.infra || v.nc) return v;
  }
  const h = input.history.find((x) => x.month === m && x.branch === branch);
  if (h && (h.land !== null || h.infra !== null || h.nc !== null)) return { land: h.land ?? 0, infra: h.infra ?? 0, nc: h.nc ?? 0 };
  return current;
}

/* ------------------------------------------------------------------ choices */

/**
 * The slides the accountant chose, in their order, with their titles.
 * New slides (a new team, a new branch) appear where they belong: right after
 * the slide before them in the default order.
 */
export function applyPrefs(items: DeckItem[], prefs: Pick<DeckPrefs, 'off' | 'on' | 'order' | 'titles'>): { item: DeckItem; on: boolean }[] {
  const off = new Set(prefs.off);
  const on = new Set(prefs.on);
  const titles = new Map(prefs.titles.map((t) => [t.id, t.title]));
  const baseId = (id: string) => id.replace(/#\d+$/, '');
  const isOn = (it: DeckItem) => (it.extra ? on.has(baseId(it.id)) : !off.has(baseId(it.id)));

  const ordered: DeckItem[] = [];
  const placed = new Set<string>();
  // Items the accountant ordered, in that order …
  for (const id of prefs.order) {
    const it = items.find((x) => x.id === id);
    if (it && !placed.has(it.id)) {
      ordered.push(it);
      placed.add(it.id);
    }
  }
  // … and every other item after its default predecessor.
  items.forEach((it, i) => {
    if (placed.has(it.id)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const k = ordered.findIndex((x) => x.id === items[j].id);
      if (k >= 0) {
        at = k + 1;
        break;
      }
    }
    ordered.splice(at, 0, it);
    placed.add(it.id);
  });

  return ordered.map((it) => {
    const title = titles.get(it.id);
    const slide = title ? ({ ...it.slide, title } as DeckSlide) : it.slide;
    return { item: { ...it, slide }, on: isOn(it) };
  });
}
