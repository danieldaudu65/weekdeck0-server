/**
 * The marketer roster: who's who, which branch and team, who heads each team.
 * Teams come from WeekDeck (set up by the team heads), matched to the roster by
 * name, with close spellings suggested for the accountant to confirm.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crown, GitMerge, Link2, Plus, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { useAccounts, Panel } from './AccountsApp';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../lib/api';
import { accApi, type WeekDeckTeam } from '../../lib/accounts/api';
import type { Marketer } from '../../lib/accounts/accDeck';
import { DESIGNATIONS, nameKey } from '../../lib/accounts/columns';
import { bestMatch, nameScore, similarGroups } from '../../lib/accounts/names';
import { newMarketers } from '../../lib/accounts/importer';

export function MarketersPage() {
  const { acc, marketers, setMarketers, ledger } = useAccounts();
  const toast = useToast();
  const [q, setQ] = useState('');
  const branches = useMemo(() => [...new Set([...acc.tabs.map((t) => t.branch || t.name), ...marketers.map((m) => m.branch)].filter(Boolean))].sort(), [acc.tabs, marketers]);
  const teams = useMemo(() => [...new Set(marketers.map((m) => m.team).filter(Boolean))].sort(), [marketers]);

  // Saving a row a moment after the last change to it.
  const timers = useRef(new Map<string, number>());
  const pending = useRef(new Map<string, Marketer>());
  const change = (m: Marketer, patch: Partial<Marketer>) => {
    const next = { ...m, ...patch };
    setMarketers(marketers.map((x) => (x.id === m.id ? next : x)));
    pending.current.set(m.id, next);
    window.clearTimeout(timers.current.get(m.id));
    timers.current.set(
      m.id,
      window.setTimeout(async () => {
        const row = pending.current.get(m.id);
        pending.current.delete(m.id);
        if (!row) return;
        try {
          await accApi.saveMarketers([row]);
        } catch (err) {
          toast(err instanceof ApiError ? err.message : 'Couldn’t save the marketer.', 'bad');
        }
      }, 600),
    );
  };
  // Save what's waiting when leaving the page.
  useEffect(
    () => () => {
      const rows = [...pending.current.values()];
      if (rows.length) void accApi.saveMarketers(rows).catch(() => undefined);
    },
    [],
  );

  const remove = async (m: Marketer) => {
    if (!window.confirm(`Remove ${m.name} from the roster? Their payments stay in the sheets.`)) return;
    try {
      const r = await accApi.saveMarketers([], [m.id]);
      setMarketers(r.marketers);
    } catch {
      toast('Couldn’t remove. Try again.', 'bad');
    }
  };

  const addOne = async () => {
    const name = window.prompt('Marketer’s full name');
    if (!name?.trim()) return;
    try {
      const r = await accApi.saveMarketers([{ name, branch: branches[0] ?? '' }]);
      setMarketers(r.marketers);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Couldn’t add. Try again.', 'bad');
    }
  };

  // In this month's sheets but not on the roster.
  const missing = useMemo(() => newMarketers(ledger.rows, marketers.flatMap((m) => [m.name, ...m.aliases])), [ledger.rows, marketers]);
  const addMissing = async () => {
    try {
      const r = await accApi.saveMarketers(missing.map((m) => ({ ...m, team: '', lead: false, aliases: [] })));
      setMarketers(r.marketers);
      toast(`${missing.length} marketer${missing.length === 1 ? '' : 's'} added`);
    } catch {
      toast('Couldn’t add them. Try again.', 'bad');
    }
  };

  // Probably the same person written two ways.
  const groups = useMemo(() => similarGroups(marketers, (m) => m.name), [marketers]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const merge = async (keep: Marketer, others: Marketer[]) => {
    try {
      const r = await accApi.merge(
        others.map((o) => o.id),
        keep.id,
      );
      setMarketers(r.marketers);
      await ledger.reload();
      toast(`Merged into ${keep.name}${r.moved ? `: ${r.moved} payment${r.moved === 1 ? '' : 's'} moved` : ''}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Couldn’t merge. Try again.', 'bad');
    }
  };

  const shown = useMemo(() => {
    const k = q.trim().toUpperCase();
    const list = k ? marketers.filter((m) => [m.name, m.team, m.branch, m.designation, m.supervisor].some((v) => v.toUpperCase().includes(k))) : marketers;
    return [...list].sort((a, b) => a.branch.localeCompare(b.branch) || (a.team || '~').localeCompare(b.team || '~') || Number(b.lead) - Number(a.lead) || a.name.localeCompare(b.name));
  }, [marketers, q]);

  return (
    <div className="min-w-0 space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-blue">Marketers</p>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight md:text-3xl">Your roster</h1>
          <p className="text-muted">Details typed once here fill every payment row. Teams decide which slide each marketer is on.</p>
        </div>
        <Button icon={<Plus className="size-4" aria-hidden />} onClick={addOne}>
          Add marketer
        </Button>
      </section>

      {missing.length > 0 && (
        <Panel
          title={
            <span className="flex items-center gap-2">
              <UserPlus className="size-5 text-blue" aria-hidden /> {missing.length} name{missing.length === 1 ? '' : 's'} in the sheets aren’t on the roster
            </span>
          }
          action={<Button size="sm" onClick={addMissing}>Add all</Button>}
        >
          <p className="text-sm text-muted">{missing.map((m) => m.name).join(' · ')}</p>
        </Panel>
      )}

      {groups.filter((g) => !dismissed.includes(g.map((m) => m.id).join())).map((g) => (
        <Panel
          key={g.map((m) => m.id).join()}
          title={
            <span className="flex items-center gap-2">
              <GitMerge className="size-5 text-[#a05a00]" aria-hidden /> Same person?
            </span>
          }
          action={
            <button type="button" className="text-sm font-bold text-muted" onClick={() => setDismissed((d) => [...d, g.map((m) => m.id).join()])}>
              No, different people
            </button>
          }
        >
          <p className="mb-3 text-sm text-muted">Pick the right spelling. The other spelling’s payments move to it, and WeekDeck remembers it for future imports.</p>
          <div className="flex flex-wrap gap-2">
            {g.map((keep) => (
              <Button
                key={keep.id}
                size="sm"
                variant="soft"
                onClick={() =>
                  merge(
                    keep,
                    g.filter((o) => o.id !== keep.id),
                  )
                }
              >
                Keep “{keep.name}”
              </Button>
            ))}
          </div>
        </Panel>
      ))}

      <TeamLinker branches={branches} />

      <Panel
        title={`${marketers.length} marketer${marketers.length === 1 ? '' : 's'}`}
        action={
          <label className="relative">
            <span className="sr-only">Search the roster</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-10 w-56 rounded-xl border border-line bg-white pl-9 pr-3 text-sm focus:border-blue focus:outline-none" />
          </label>
        }
      >
        {marketers.length === 0 ? (
          <p className="py-6 text-center text-muted">No marketers yet. Import your sheets and they’re added from the rows, or add one by hand.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <datalist id="acc-teams">
              {teams.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <datalist id="acc-branches">
              {branches.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
            <datalist id="acc-designations">
              {DESIGNATIONS.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted">
                  {['Name', 'Designation', 'Branch', 'Team', 'Team head', 'Supervisor', 'Account no.', 'Spouse', 'Spouse account', ''].map((h) => (
                    <th key={h} className="px-1 py-2 font-bold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => (
                  <tr key={m.id} className="border-t border-line">
                    <td className="px-1 py-1.5">
                      <Cell value={m.name} onChange={(v) => change(m, { name: v.toUpperCase() })} className="w-60 font-bold" />
                      {m.aliases.length > 0 && <p className="px-2 text-[11px] text-muted">also: {m.aliases.join(', ')}</p>}
                    </td>
                    <td className="px-1 py-1.5">
                      <Cell value={m.designation} list="acc-designations" onChange={(v) => change(m, { designation: v.toUpperCase() })} className="w-24" />
                    </td>
                    <td className="px-1 py-1.5">
                      <Cell value={m.branch} list="acc-branches" onChange={(v) => change(m, { branch: v.toUpperCase() })} className="w-32" />
                    </td>
                    <td className="px-1 py-1.5">
                      <Cell value={m.team} list="acc-teams" placeholder="Others" onChange={(v) => change(m, { team: v })} className="w-44" />
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => change(m, { lead: !m.lead })}
                        aria-pressed={m.lead}
                        className={`inline-flex h-9 items-center gap-1 rounded-xl px-2.5 text-xs font-extrabold ${m.lead ? 'bg-sun-soft text-[#7a4f00]' : 'text-muted hover:bg-paper'}`}
                      >
                        <Crown className="size-4" aria-hidden /> {m.lead ? 'Head' : 'No'}
                      </button>
                    </td>
                    <td className="px-1 py-1.5">
                      <Cell value={m.supervisor} onChange={(v) => change(m, { supervisor: v.toUpperCase() })} className="w-40" />
                    </td>
                    <td className="px-1 py-1.5">
                      <Cell value={m.accountNumber} inputMode="numeric" onChange={(v) => change(m, { accountNumber: v })} className="w-32" />
                    </td>
                    <td className="px-1 py-1.5">
                      <Cell value={m.spouseName} onChange={(v) => change(m, { spouseName: v.toUpperCase() })} className="w-48" />
                    </td>
                    <td className="px-1 py-1.5">
                      <Cell value={m.spouseAccount} inputMode="numeric" onChange={(v) => change(m, { spouseAccount: v })} className="w-32" />
                    </td>
                    <td className="px-1 py-1.5">
                      <button type="button" onClick={() => remove(m)} className="grid size-9 place-items-center rounded-xl text-muted hover:bg-bad/10 hover:text-bad" aria-label={`Remove ${m.name}`}>
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

/** An input that saves on blur / Enter (not on every key). */
function Cell({ value, onChange, className = '', list, placeholder, inputMode }: { value: string; onChange: (v: string) => void; className?: string; list?: string; placeholder?: string; inputMode?: 'numeric' }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const done = () => {
    const t = v.replace(/\s+/g, ' ').trim();
    if (t !== value) onChange(t);
  };
  return (
    <input
      value={v}
      list={list}
      placeholder={placeholder}
      inputMode={inputMode}
      onChange={(e) => setV(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      className={`h-9 rounded-lg border border-transparent bg-transparent px-2 hover:border-line focus:border-blue focus:bg-white focus:outline-none ${className}`}
      style={{ fontSize: 14 }}
    />
  );
}

/* ------------------------------------------------------------------ WeekDeck teams */

interface Match {
  member: { name: string; lead: boolean };
  marketer: Marketer | null;
  score: number;
  use: boolean;
}

/** Link a team set up in WeekDeck: its members get the team (and team head) on the roster. */
function TeamLinker({ branches }: { branches: string[] }) {
  const { marketers, setMarketers } = useAccounts();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [list, setList] = useState<WeekDeckTeam[] | null>(null);
  const [team, setTeam] = useState<WeekDeckTeam | null>(null);
  const [branch, setBranch] = useState(branches[0] ?? '');
  const [matches, setMatches] = useState<Match[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      accApi
        .teams(q)
        .then((r) => setList(r.teams))
        .catch(() => setList([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, open]);

  const choose = (t: WeekDeckTeam) => {
    setTeam(t);
    // Branch: where most of the matched marketers already are.
    const ms = t.members.map((member) => {
      const best = bestMatch(member.name, marketers, (m) => [m.name, ...m.aliases]);
      return { member, marketer: best?.item ?? null, score: best?.score ?? 0, use: true };
    });
    const count = new Map<string, number>();
    for (const m of ms) if (m.marketer?.branch) count.set(m.marketer.branch, (count.get(m.marketer.branch) ?? 0) + 1);
    const guess = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (guess) setBranch(guess);
    setMatches(ms);
  };

  const linked = useMemo(() => new Set(marketers.map((m) => m.teamRef).filter(Boolean)), [marketers]);

  const apply = async () => {
    if (!team) return;
    setBusy(true);
    try {
      const upserts: Partial<Marketer>[] = [];
      for (const m of matches) {
        if (!m.use) continue;
        if (m.marketer) {
          const differs = nameKey(m.member.name) !== nameKey(m.marketer.name);
          upserts.push({ ...m.marketer, team: team.title, lead: m.member.lead, branch: branch || m.marketer.branch, teamRef: team.id, aliases: differs ? [...m.marketer.aliases, m.member.name] : m.marketer.aliases });
        } else {
          upserts.push({ name: m.member.name.toUpperCase(), team: team.title, lead: m.member.lead, branch, teamRef: team.id });
        }
      }
      const r = await accApi.saveMarketers(upserts);
      setMarketers(r.marketers);
      toast(`${team.title} linked: ${upserts.length} marketer${upserts.length === 1 ? '' : 's'}`);
      setTeam(null);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Couldn’t link the team. Try again.', 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Link2 className="size-5 text-blue" aria-hidden /> Teams from WeekDeck
        </span>
      }
      action={
        !open && (
          <Button size="sm" variant="soft" onClick={() => setOpen(true)}>
            Link a team
          </Button>
        )
      }
    >
      {!open ? (
        <p className="text-sm text-muted">The team heads already set up their teams in WeekDeck. Link each one to put its members on the right team slide, with the team head on the Senior staff slide.</p>
      ) : team ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-lg font-extrabold">{team.title}</p>
              <p className="text-sm text-muted">
                {team.manager && `${team.manager} · `}
                {team.members.length} members{team.region && ` · ${team.region}`}
              </p>
            </div>
            <label className="text-sm font-bold">
              Branch
              <input value={branch} list="acc-branches-link" onChange={(e) => setBranch(e.target.value.toUpperCase())} className="ml-2 h-10 w-40 rounded-xl border border-line px-3 uppercase" />
              <datalist id="acc-branches-link">
                {branches.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </label>
          </div>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {matches.map((m, i) => (
              <li key={m.member.name + i} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <input
                  type="checkbox"
                  checked={m.use}
                  onChange={(e) => setMatches((ms) => ms.map((x, j) => (j === i ? { ...x, use: e.target.checked } : x)))}
                  className="size-4 accent-[var(--color-blue)]"
                  aria-label={`Link ${m.member.name}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-bold">{m.member.name}</span>
                  {m.member.lead && <span className="ml-2 rounded-full bg-sun-soft px-2 py-0.5 text-[11px] font-extrabold text-[#7a4f00]">TEAM HEAD</span>}
                </span>
                <span className="text-sm">
                  {m.marketer ? (
                    m.score >= 0.97 ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-ok">
                        <Check className="size-4" aria-hidden /> {m.marketer.name}
                      </span>
                    ) : (
                      <span className="font-semibold text-[#a05a00]">Same as {m.marketer.name}?</span>
                    )
                  ) : (
                    <span className="text-muted">New on the roster</span>
                  )}
                </span>
                {m.marketer && m.score < 0.97 && (
                  <select
                    value={m.marketer.id}
                    onChange={(e) => setMatches((ms) => ms.map((x, j) => (j === i ? { ...x, marketer: marketers.find((k) => k.id === e.target.value) ?? null, score: e.target.value ? 1 : 0 } : x)))}
                    className="h-9 rounded-lg border border-line px-2 text-sm"
                    aria-label="Who this is on the roster"
                  >
                    {[...marketers]
                      .sort((a, b) => nameScore(m.member.name, b.name) - nameScore(m.member.name, a.name))
                      .slice(0, 8)
                      .map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name}
                        </option>
                      ))}
                    <option value="">Someone new</option>
                  </select>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button onClick={apply} loading={busy} icon={<Users className="size-4" aria-hidden />}>
              Link {matches.filter((m) => m.use).length} to {team.title}
            </Button>
            <Button variant="ghost" onClick={() => setTeam(null)}>
              Back to teams
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="relative block max-w-md">
            <span className="sr-only">Find a team</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Team, team head or region…" className="h-11 w-full rounded-xl border border-line bg-white pl-9 pr-3 focus:border-blue focus:outline-none" autoFocus />
          </label>
          {list === null ? (
            <p className="text-sm text-muted">Loading teams…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted">No WeekDeck teams found{q && ` for “${q}”`}. Team heads create their team at WeekDeck’s home page; you can also type a team on each marketer below.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((t) => (
                <button key={t.id} type="button" onClick={() => choose(t)} className="rounded-2xl border border-line bg-white p-3 text-left transition hover:border-blue">
                  <p className="flex items-center justify-between gap-2 font-extrabold">
                    <span className="truncate">{t.title}</span>
                    {linked.has(t.id) && <span className="shrink-0 rounded-full bg-ok/10 px-2 py-0.5 text-[11px] font-extrabold text-ok">LINKED</span>}
                  </p>
                  <p className="truncate text-sm text-muted">
                    {t.manager || t.members.find((m) => m.lead)?.name || '—'} · {t.members.length} members
                  </p>
                </button>
              ))}
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        </div>
      )}
    </Panel>
  );
}
