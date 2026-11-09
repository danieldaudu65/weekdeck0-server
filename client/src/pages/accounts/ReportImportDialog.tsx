/**
 * Upload the month's report Excel (one file per branch, TEAM'S REPORT tab) →
 * WeekDeck reads it and checks it → she confirms spellings and teams (once;
 * remembered after) → the month's slides are made from it.
 */
import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileUp, Presentation, SpellCheck, Users, X } from 'lucide-react';
import { useAccounts } from './AccountsApp';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../lib/api';
import { accApi } from '../../lib/accounts/api';
import { addMonths, monthName, showMoney } from '../../lib/accounts/columns';
import { readXlsx } from '../../lib/accounts/xlsx';
import { checkReport, readReport, ReportError, type ReportFile } from '../../lib/accounts/reportExcel';
import { applyPlan, planBranch, teamOptions, type PlanRow, type RowFix } from '../../lib/accounts/reportPlan';
import { branchTotals, type SavedBranch } from '../../lib/accounts/reportDeck';
import { ACCEPT, readAnyFile } from '../../lib/accounts/anyDeck';
import { historyFromDeck, teamsFromDeck, type TeamEntry } from '../../lib/accounts/slideCheck';
import type { HistoryRow } from '../../lib/accounts/accDeck';

interface Loaded {
  key: string;
  file: ReportFile;
  branch: string;
}

const WHAT = { land: 'Land & building', infra: 'Infra & other fees', total: 'Total', nc: 'New clients' } as const;

export function ReportImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (month: string) => void }) {
  const { acc, saveMe, marketers, setMarketers, month: openMonth } = useAccounts();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const deckInput = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Loaded[]>([]);
  const [month, setMonth] = useState(openMonth);
  const [plans, setPlans] = useState<Record<string, PlanRow[]>>({});
  const [fixes, setFixes] = useState<Record<string, RowFix>>({});
  const [entries, setEntries] = useState<TeamEntry[]>([]);
  const [deckHistory, setDeckHistory] = useState<HistoryRow[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [detail, setDetail] = useState(false);

  const plan = (f: Loaded, ents: TeamEntry[]) => planBranch(f.file, f.branch, marketers, ents);

  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    setReading(true);
    const bad: string[] = [];
    const added: Loaded[] = [];
    for (const file of Array.from(list)) {
      try {
        if (!/\.(xlsx|xlsm)$/i.test(file.name)) throw new ReportError(`“${file.name}” isn’t an Excel file (.xlsx).`);
        const r = readReport(await readXlsx(await file.arrayBuffer()), file.name);
        added.push({ key: `${file.name}|${file.size}|${Date.now()}`, file: r, branch: r.branch || file.name.replace(/\.[a-z]+$/i, '').toUpperCase() });
      } catch (err) {
        bad.push(err instanceof ReportError ? err.message : `“${file.name}” couldn’t be read.`);
      }
    }
    setProblems(bad);
    if (added.length) {
      const next = [...files.filter((f) => !added.some((a) => a.branch === f.branch)), ...added];
      setFiles(next);
      setPlans((p) => ({ ...p, ...Object.fromEntries(added.map((a) => [a.key, plan(a, entries)])) }));
      const m = added.find((a) => a.file.month)?.file.month;
      if (m && !files.length) setMonth(m);
    }
    setReading(false);
  };

  /** Last month's slides: who is in which team, who is senior staff, and the months before. */
  const learn = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    setReading(true);
    try {
      const r = await readAnyFile(file, files.map((f) => f.branch));
      const ents = teamsFromDeck(r.slides);
      if (!ents.length) throw new Error('No team slides found in that file.');
      setEntries(ents);
      setDeckHistory(historyFromDeck(r.slides, month.slice(0, 4)).filter((h) => h.month < month));
      setPlans(Object.fromEntries(files.map((f) => [f.key, plan(f, ents)])));
      toast(`${ents.length} people found on ${file.name}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'That file couldn’t be read.', 'bad');
    } finally {
      setReading(false);
    }
  };

  const setRow = (key: string, i: number, change: Partial<PlanRow>) => setPlans((p) => ({ ...p, [key]: p[key].map((r, j) => (j === i ? { ...r, ...change } : r)) }));

  const issues = useMemo(() => files.map((f) => ({ f, list: checkReport(f.file) })), [files]);
  const spellings = files.flatMap((f) => (plans[f.key] ?? []).map((r, i) => ({ f, r, i })).filter((x) => x.r.choices.length > 1));
  const autoNamed = files.some((f) => (plans[f.key] ?? []).some((r) => r.autoTeam));

  const run = async () => {
    setBusy('Saving…');
    try {
      let history = acc.history;
      // Months before this one from last month's slides, where she has nothing yet.
      for (const h of deckHistory) if (!history.some((x) => x.branch === h.branch && x.month === h.month)) history = [...history, h];
      const saved: SavedBranch[] = [];
      const upserts: Parameters<typeof accApi.saveMarketers>[0] = [];
      for (const f of files) {
        const fx = Object.fromEntries(Object.entries(fixes).filter(([k]) => k.startsWith(`${f.key}|`)).map(([k, v]) => [k.slice(f.key.length + 1), v]));
        const r = applyPlan(f.file, f.branch, month, plans[f.key], fx, marketers, history);
        saved.push(r.saved);
        upserts.push(...r.upserts);
        history = r.history;
      }
      setBusy('Saving your marketer list…');
      const m = await accApi.saveMarketers(upserts);
      setMarketers(m.marketers);
      setBusy('Saving the report…');
      await accApi.saveReport(month, saved);
      await saveMe({ history });
      toast(`${monthName(month)} slides made from ${files.length} file${files.length === 1 ? '' : 's'}`);
      onDone(month);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Couldn’t save. Try again.', 'bad');
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 backdrop-blur-sm md:items-center md:p-6" role="dialog" aria-modal="true" aria-label="Upload report Excel">
      <div className="flex max-h-[94dvh] w-full max-w-3xl flex-col rounded-t-3xl bg-paper shadow-2xl md:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-xl font-extrabold">Excel → slides</h2>
            <p className="text-sm text-muted">Your monthly inflow report, one file per branch</p>
          </div>
          <button type="button" onClick={onClose} disabled={Boolean(busy)} className="grid size-10 shrink-0 place-items-center rounded-xl hover:bg-ink/5" aria-label="Close">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <input ref={input} type="file" multiple accept=".xlsx,.xlsm" className="sr-only" onChange={(e) => void pick(e.target.files).finally(() => (e.target.value = ''))} />
          <input ref={deckInput} type="file" accept={ACCEPT} className="sr-only" onChange={(e) => void learn(e.target.files).finally(() => (e.target.value = ''))} />

          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void pick(e.dataTransfer.files);
            }}
            className={`flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-blue/40 bg-white px-4 text-center transition hover:border-blue ${files.length ? 'py-4' : 'py-8'}`}
          >
            <FileUp className="size-8 text-blue" aria-hidden />
            <span className="font-extrabold">{reading ? 'Reading…' : files.length ? 'Add another branch' : 'Choose your report Excel'}</span>
            {!files.length && <span className="text-sm text-muted">e.g. FAGBA and ABULE EGBA inflow reports · several at once</span>}
          </button>
          {problems.map((p) => (
            <p key={p} className="flex gap-2 rounded-xl bg-bad/10 px-3 py-2 text-sm font-semibold text-bad">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {p}
            </p>
          ))}

          {files.length > 0 && (
            <>
              <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-sm">
                <label className="text-sm font-bold">
                  Month
                  <select value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1 block h-10 rounded-xl border border-line bg-white px-2 font-semibold">
                    {Array.from({ length: 25 }, (_, i) => addMonths(openMonth, 12 - i)).map((m) => (
                      <option key={m} value={m}>
                        {monthName(m)}
                      </option>
                    ))}
                  </select>
                </label>
                {files.map((f) => {
                  const t = branchTotals({ branch: f.branch, fileName: '', rows: f.file.rows });
                  return (
                    <div key={f.key} className="min-w-[14rem] flex-1 rounded-xl bg-paper px-3 py-2">
                      <p className="flex items-center gap-1.5 truncate text-xs font-bold text-muted">
                        <FileSpreadsheet className="size-4 shrink-0 text-ok" aria-hidden /> <span className="truncate">{f.file.fileName}</span>
                        <button type="button" className="ml-auto shrink-0 hover:text-bad" onClick={() => setFiles((fs) => fs.filter((x) => x.key !== f.key))}>
                          Remove
                        </button>
                      </p>
                      <input
                        value={f.branch}
                        onChange={(e) => setFiles((fs) => fs.map((x) => (x.key === f.key ? { ...x, branch: e.target.value.toUpperCase() } : x)))}
                        onBlur={() => setPlans((p) => ({ ...p, [f.key]: plan(f, entries) }))}
                        aria-label="Branch"
                        className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2 font-extrabold uppercase"
                      />
                      <p className="mt-1 text-xs font-semibold text-muted">
                        {f.file.rows.length} marketers · ₦{showMoney(t.land + t.infra)} · {t.nc} NC
                      </p>
                    </div>
                  );
                })}
              </div>
              {files.some((f) => f.file.month && f.file.month !== month) && (
                <p className="flex gap-2 rounded-xl bg-sun-soft px-3 py-2 text-sm font-semibold text-[#7a4f00]">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> A file says {monthName(files.find((f) => f.file.month && f.file.month !== month)!.file.month)}.
                </p>
              )}

              {/* What doesn't add up */}
              {issues.some((x) => x.list.length) ? (
                <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
                  <h3 className="flex items-center gap-2 font-extrabold">
                    <AlertTriangle className="size-5 text-[#a05a00]" aria-hidden /> To fix
                  </h3>
                  {issues.map(({ f, list }) =>
                    list.map((x) =>
                      x.kind === 'rowTotal' ? (
                        <div key={`${f.key}${x.name}`} className="rounded-xl bg-paper p-3 text-sm">
                          <p className="font-bold">
                            {x.name} <span className="font-semibold text-muted">· {f.branch}</span>
                          </p>
                          <p className="text-muted">
                            TOTAL says ₦{showMoney(x.typed)}, but Land + House + Infra = ₦{showMoney(x.parts) || '0'}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(
                              [
                                ['parts', `Use ₦${showMoney(x.parts) || '0'}`],
                                ['land', `Add ₦${showMoney(x.typed - x.parts)} to Land`],
                                ['infra', `Add ₦${showMoney(x.typed - x.parts)} to Infra`],
                              ] as const
                            ).map(([use, label]) => {
                              const k = `${f.key}|${x.name}`;
                              const on = (fixes[k]?.use ?? 'parts') === use;
                              return (
                                <button key={use} type="button" aria-pressed={on} onClick={() => setFixes((s) => ({ ...s, [k]: { use } }))} className={`h-9 rounded-lg px-3 text-sm font-bold ${on ? 'bg-ink text-white' : 'bg-white text-muted ring-1 ring-line'}`}>
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <p key={`${f.key}${x.what}`} className="text-sm text-muted">
                          <b className="text-ink">{f.branch} grand total, {WHAT[x.what]}:</b> the file says {x.what === 'nc' ? x.file : `₦${showMoney(x.file)}`}, the rows add up to {x.what === 'nc' ? x.rows : `₦${showMoney(x.rows)}`}. The slides use the rows.
                        </p>
                      ),
                    ),
                  )}
                </section>
              ) : (
                <p className="flex items-center gap-2 rounded-2xl bg-ok/10 px-4 py-3 text-sm font-bold text-ok">
                  <CheckCircle2 className="size-5" aria-hidden /> Every total adds up
                </p>
              )}

              {/* Spellings */}
              {spellings.length > 0 && (
                <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
                  <h3 className="flex items-center gap-2 font-extrabold">
                    <SpellCheck className="size-5 text-blue" aria-hidden /> Which spelling is right? <span className="text-sm font-semibold text-muted">· {spellings.length}</span>
                  </h3>
                  {spellings.map(({ f, r, i }) => (
                    <div key={`${f.key}${i}`} className="flex flex-wrap items-center gap-2 border-t border-line pt-2 first:border-0 first:pt-0">
                      {r.choices.map((c, ci) => (
                        <button
                          key={c}
                          type="button"
                          aria-pressed={r.name === c}
                          onClick={() => setRow(f.key, i, { name: c })}
                          className={`min-h-9 rounded-lg px-3 py-1 text-left text-sm font-bold ${r.name === c ? 'bg-blue text-white' : 'bg-paper text-ink ring-1 ring-line hover:ring-blue/50'}`}
                        >
                          {c}
                          {ci === 0 && <span className={`ml-1.5 text-[11px] font-semibold ${r.name === c ? 'text-white/80' : 'text-muted'}`}>in the file</span>}
                        </button>
                      ))}
                    </div>
                  ))}
                </section>
              )}

              {/* Teams: read from the file's order; she only names them (once) */}
              <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 font-extrabold">
                    <Users className="size-5 text-blue" aria-hidden /> Teams
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {autoNamed && (
                      <Button size="sm" variant="soft" icon={<Presentation className="size-4" aria-hidden />} onClick={() => deckInput.current?.click()} loading={reading}>
                        Names from last month’s slides
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => setDetail((d) => !d)}>
                      {detail ? 'Done' : 'Change'}
                    </Button>
                  </div>
                </div>
                {files.map((f) => {
                  const rows = plans[f.key] ?? [];
                  const teams = [...new Set(rows.map((r) => r.team).filter(Boolean))];
                  const opts = teamOptions(rows, f.branch, marketers, entries);
                  const others = rows.filter((r) => !r.team && !r.lead);
                  const short = (n: string) => n.split(' ').slice(0, 2).join(' ');
                  return (
                    <div key={f.key} className="space-y-2">
                      <p className="text-sm font-extrabold uppercase tracking-wider text-muted">{f.branch}</p>
                      {!detail ? (
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="rounded-xl bg-blue-soft/60 p-3">
                            <p className="text-xs font-extrabold uppercase tracking-wider text-blue">Senior staff · {rows.filter((r) => r.lead).length}</p>
                            <p className="mt-1 text-sm font-semibold">{rows.filter((r) => r.lead).map((r) => short(r.name)).join(', ') || '—'}</p>
                          </div>
                          {teams.map((t) => {
                            const members = rows.filter((r) => r.team === t);
                            const auto = members.some((r) => r.autoTeam);
                            return (
                              <div key={t} className={`rounded-xl p-3 ${auto ? 'bg-sun-soft/60' : 'bg-paper'}`}>
                                <input
                                  defaultValue={t}
                                  onBlur={(e) => {
                                    const next = e.target.value.trim();
                                    if (next && next !== t) setPlans((p) => ({ ...p, [f.key]: p[f.key].map((r) => (r.team === t ? { ...r, team: next, autoTeam: false } : r)) }));
                                  }}
                                  aria-label={`Name of ${t}`}
                                  className="h-8 w-full rounded-lg border border-transparent bg-transparent px-1 text-sm font-extrabold hover:border-line focus:border-blue focus:bg-white"
                                />
                                <p className="mt-1 px-1 text-xs font-semibold text-muted">
                                  <b className="text-ink">{short(members[0]?.name ?? '')}</b>
                                  {members.length > 1 ? `, ${members.slice(1).map((r) => short(r.name)).join(', ')}` : ''}
                                </p>
                              </div>
                            );
                          })}
                          <div className="rounded-xl bg-paper p-3">
                            <p className="text-xs font-extrabold uppercase tracking-wider text-muted">Others · {others.length}</p>
                            <p className="mt-1 text-xs font-semibold text-muted">{others.map((r) => short(r.name)).join(', ') || '—'}</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <datalist id={`teams-${f.key}`}>
                            {opts.map((o) => (
                              <option key={o} value={o} />
                            ))}
                          </datalist>
                          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
                            <table className="w-full min-w-[520px] text-sm">
                              <thead>
                                <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                                  <th className="py-1 font-bold">Name</th>
                                  <th className="py-1 font-bold">Team</th>
                                  <th className="w-24 py-1 text-center font-bold">Senior staff</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((r, i) => (
                                  <tr key={i} className="border-t border-line">
                                    <td className="py-1 pr-2">
                                      <span className="font-bold">{r.name}</span> <span className="text-xs text-muted">{r.designation}</span>
                                    </td>
                                    <td className="py-1 pr-2">
                                      <input
                                        list={`teams-${f.key}`}
                                        value={r.team}
                                        placeholder="Others"
                                        onChange={(e) => setRow(f.key, i, { team: e.target.value, autoTeam: false })}
                                        aria-label={`${r.name} team`}
                                        className="h-9 w-full rounded-lg border border-line bg-white px-2 font-semibold"
                                      />
                                    </td>
                                    <td className="py-1 text-center">
                                      <input type="checkbox" checked={r.lead} onChange={(e) => setRow(f.key, i, { lead: e.target.checked })} aria-label={`${r.name} senior staff`} className="size-4 accent-[var(--color-blue)]" />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </section>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
          <p className="text-sm font-semibold text-muted">{busy ?? (files.length ? `${files.map((f) => f.branch).join(' · ')} · ${monthName(month)}` : '')}</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={Boolean(busy)}>
              Cancel
            </Button>
            <Button onClick={run} loading={Boolean(busy)} disabled={!files.length || reading}>
              Make slides
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
