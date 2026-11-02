/**
 * The upload window's work for one branch file, without the screen:
 *
 * - each marketer's spelling: her list, last month's slides and the file's
 *   other tabs may spell a name another way (KENNRTH / KENNETH); she picks;
 * - each marketer's team and whether they're senior staff: from her list,
 *   else from last month's slides, else a guess from the file's order (the
 *   rows of a team come together, team head first);
 * - what gets saved: the report rows, her list, the month's totals.
 */
import { nameKey } from './columns';
import { LIKELY, nameScore } from './names';
import { branchTotals, type SavedBranch, type SavedRow } from './reportDeck';
import { rowTotal, type ReportFile } from './reportExcel';
import type { HistoryRow, Marketer } from './accDeck';
import type { TeamEntry } from './slideCheck';

export type Source = 'list' | 'slides' | 'order' | 'none';

export interface PlanRow {
  /** The name as the file writes it. */
  file: string;
  designation: string;
  /** Spellings to choose from (the file's first), when there's more than one. */
  choices: string[];
  /** The spelling she picked (default: her list's, else the file's). */
  name: string;
  team: string;
  lead: boolean;
  /** Where team / senior came from ('order' and 'none' are worth a look). */
  source: Source;
  /** Her list's entry for this person, if any. */
  marketerId: string | null;
}

const words = (s: string) => new Set(nameKey(s).split(' ').filter(Boolean));
/** "AROYEHUN MATTHEW" inside "AROYEHUN OLUWASEUN MATTHEW": a short form, not another spelling. */
const shortForm = (a: string, b: string) => {
  const x = words(a);
  const y = words(b);
  return [...x].every((w) => y.has(w)) || [...y].every((w) => x.has(w));
};
const sameBranch = (a: string, b: string) => a.replace(/[^A-Z]/gi, '').toUpperCase() === b.replace(/[^A-Z]/gi, '').toUpperCase();

export function planBranch(file: ReportFile, branch: string, marketers: Marketer[], entries: TeamEntry[] = []): PlanRow[] {
  const mine = marketers.filter((m) => !m.branch || sameBranch(m.branch, branch));
  const fromSlides = entries.filter((e) => sameBranch(e.branch, branch));
  const out: PlanRow[] = [];
  for (const r of file.rows) {
    const k = nameKey(r.name);
    // 1. Her list: the same name or a spelling she confirmed before …
    let m = mine.find((x) => nameKey(x.name) === k || x.aliases.some((a) => nameKey(a) === k)) ?? null;
    // … or probably the same person.
    if (!m) {
      let best = 0;
      for (const x of mine) {
        const s = Math.max(nameScore(r.name, x.name), ...x.aliases.map((a) => nameScore(r.name, a)));
        if (s >= LIKELY && s > best) {
          best = s;
          m = x;
        }
      }
    }
    const choices: string[] = [r.name];
    // A spelling she already decided on (kept as another spelling on her list) isn't asked again.
    const decided = (n: string) => Boolean(m && (nameKey(m.name) === nameKey(n) || m.aliases.some((a) => nameKey(a) === nameKey(n))) && (nameKey(m.name) === k || m.aliases.some((a) => nameKey(a) === k)));
    const offer = (n: string) => {
      if (!choices.some((c) => nameKey(c) === nameKey(n)) && !shortForm(n, r.name) && !decided(n)) choices.push(n);
    };
    if (m && nameKey(m.name) !== k && !m.aliases.some((a) => nameKey(a) === k)) offer(m.name);

    // 2. Last month's slides: every likely match counts (the senior slide may spell them differently).
    const hits = fromSlides.filter((e) => nameScore(r.name, e.name) >= LIKELY);
    if (!m) for (const h of hits) if (nameKey(h.name) !== k) offer(h.name);
    for (const s of file.spellings[r.name] ?? []) offer(s.spelling);

    let team = '';
    let lead = false;
    let source: Source = 'none';
    if (m) {
      team = m.team;
      lead = m.lead;
      source = 'list';
    } else if (hits.length) {
      team = hits.find((h) => h.team)?.team ?? '';
      lead = hits.some((h) => h.lead);
      source = 'slides';
    } else if (!r.others) {
      // 3. The file's order: same team as the row above.
      const above = out[out.length - 1];
      if (above?.team) {
        team = above.team;
        source = 'order';
      }
    }
    out.push({ file: r.name, designation: r.designation, choices, name: m ? m.name : r.name, team, lead, source, marketerId: m?.id ?? null });
  }
  return out;
}

/** Teams to offer in the team picker for a branch: from her list, the slides and the plan, in first-seen order. */
export function teamOptions(plan: PlanRow[], branch: string, marketers: Marketer[], entries: TeamEntry[] = []): string[] {
  const out: string[] = [];
  const add = (t: string) => t && !out.some((x) => x.toUpperCase() === t.toUpperCase()) && out.push(t);
  plan.forEach((p) => add(p.team));
  marketers.filter((m) => sameBranch(m.branch, branch)).forEach((m) => add(m.team));
  entries.filter((e) => sameBranch(e.branch, branch)).forEach((e) => add(e.team));
  return out;
}

export interface RowFix {
  /** For a row whose typed TOTAL differs from LAND + HOUSE + INFRAS: keep the parts, or put the typed total in a column. */
  use: 'parts' | 'land' | 'infra';
}

/** What to save for a branch: the report rows (with her spellings and fixes), her list's changes, the month's totals. */
export function applyPlan(file: ReportFile, branch: string, month: string, plan: PlanRow[], fixes: Record<string, RowFix>, marketers: Marketer[], history: HistoryRow[]) {
  const rows: SavedRow[] = file.rows.map((r, i) => {
    const p = plan[i];
    const fix = fixes[r.name]?.use ?? 'parts';
    let { land, infra } = r;
    if (r.typedTotal !== null && Math.abs(r.typedTotal - rowTotal(r)) > 0.01 && fix !== 'parts') {
      const extra = Math.round((r.typedTotal - rowTotal(r)) * 100) / 100;
      if (fix === 'land') land += extra;
      else infra += extra;
    }
    return { name: p.name, designation: r.designation, land, house: r.house, infra, nc: r.nc, others: r.others };
  });
  const saved: SavedBranch = { branch, fileName: file.fileName, rows };

  const byId = new Map(marketers.map((m) => [m.id, m]));
  const upserts: Partial<Marketer>[] = plan.map((p) => {
    const old = p.marketerId ? byId.get(p.marketerId) : undefined;
    const spellings = new Set([...(old?.aliases ?? []), ...(old ? [old.name] : []), ...p.choices].map(nameKey).filter((a) => a && a !== nameKey(p.name)));
    const base: Partial<Marketer> = old ? { ...old } : { name: p.name, supervisor: '', accountNumber: '', spouseName: '', spouseAccount: '', teamRef: null };
    return { ...base, name: p.name, designation: p.designation || old?.designation || '', branch, team: p.team, lead: p.lead, aliases: [...spellings].slice(0, 12) };
  });

  const t = branchTotals(saved);
  const nextHistory = [...history.filter((h) => !(h.branch === branch && h.month === month)), { branch, month, land: t.land, infra: t.infra, nc: t.nc }];
  return { saved, upserts, history: nextHistory };
}
