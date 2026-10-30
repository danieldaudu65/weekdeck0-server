/**
 * Import: pick their files → check what was found → save. Nothing is saved
 * until the accountant taps Import on the check screen.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileUp, Info, Users, X } from 'lucide-react';
import { useAccounts } from './AccountsApp';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../lib/api';
import { accApi, saveInChunks } from '../../lib/accounts/api';
import { KINDS, addMonths, monthName, showMoney, type Kind, type Payment } from '../../lib/accounts/columns';
import { newMarketers, planImport, readFile, type ImportFile, type Plan } from '../../lib/accounts/importer';
import { readCsv, readXlsx } from '../../lib/accounts/xlsx';

interface Loaded extends ImportFile {
  key: string;
}

export function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: (month: string) => void }) {
  const { acc, saveMe, marketers, setMarketers, month: openMonth, ledger } = useAccounts();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Loaded[]>([]);
  const [reading, setReading] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [existing, setExisting] = useState<Record<string, Payment[]>>({});
  const [update, setUpdate] = useState(false);
  const [addRoster, setAddRoster] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    setReading(true);
    const bad: string[] = [];
    const read: Loaded[] = [];
    for (const f of Array.from(list)) {
      try {
        const sheets = /\.csv$/i.test(f.name) ? [{ name: f.name, rows: readCsv(await f.text()) }] : await readXlsx(await f.arrayBuffer());
        const r = readFile(f.name, sheets, openMonth);
        if (!r.tabs.some((t) => t.rows.length)) bad.push(`${f.name}: no payment rows found. Is it one of the payment sheets?`);
        else read.push({ ...r, key: `${f.name}|${f.size}|${f.lastModified}` });
      } catch {
        bad.push(`${f.name}: couldn’t be read. Use .xlsx (Excel / Google Sheets → Download → Microsoft Excel) or .csv.`);
      }
    }
    setFiles((old) => [...old.filter((o) => !read.some((r) => r.key === o.key)), ...read]);
    setProblems(bad);
    setReading(false);
  };

  // What's already in each month the files go into (so only new rows are added).
  const months = useMemo(() => [...new Set(files.map((f) => f.month))].sort(), [files]);
  useEffect(() => {
    let alive = true;
    (async () => {
      await ledger.flush();
      for (const m of months) {
        if (existing[m]) continue;
        try {
          const r = await accApi.payments(m);
          if (alive) setExisting((e) => ({ ...e, [m]: r.payments }));
        } catch {
          if (alive) setProblems((p) => [...p, `Couldn’t check what’s already in ${monthName(m)}.`]);
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months.join(',')]);

  const plans = useMemo(() => {
    const out: Record<string, Plan> = {};
    for (const m of months) {
      if (!existing[m]) continue;
      const incoming = files.filter((f) => f.month === m).flatMap((f) => f.tabs.flatMap((t) => t.rows.map((r) => ({ ...r, kind: f.kind }))));
      out[m] = planImport(existing[m], incoming, m, update);
    }
    return out;
  }, [files, existing, months, update]);
  const ready = months.length > 0 && months.every((m) => plans[m]);
  const toAdd = Object.values(plans).reduce((a, p) => a + p.add.length, 0);
  const toUpdate = Object.values(plans).reduce((a, p) => a + p.update.length, 0);
  const same = Object.values(plans).reduce((a, p) => a + p.same, 0);
  const twice = Object.values(plans).reduce((a, p) => a + p.twiceInFile, 0);

  const known = useMemo(() => marketers.flatMap((m) => [m.name, ...m.aliases]), [marketers]);
  const fresh = useMemo(() => newMarketers(files.flatMap((f) => f.tabs.flatMap((t) => t.rows)), known), [files, known]);

  const setFile = (key: string, patch: Partial<Loaded>) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const run = async () => {
    setBusy('Saving rows…');
    try {
      // New tabs (with their branch) first, so the workbook lists them.
      const tabs = [...acc.tabs];
      for (const f of files) for (const t of f.tabs) if (!tabs.some((x) => x.name === t.name)) tabs.push({ name: t.name, branch: t.branch || t.name });
      if (tabs.length !== acc.tabs.length) await saveMe({ tabs });
      for (const m of months) {
        const plan = plans[m];
        const rows = [...plan.update, ...plan.add];
        if (rows.length) await saveInChunks(m, rows, (n) => setBusy(`Saving rows… ${n} of ${rows.length}`));
      }
      if (addRoster && fresh.length) {
        setBusy('Adding marketers…');
        const r = await accApi.saveMarketers(fresh.map((m) => ({ ...m, team: '', lead: false, aliases: [] })));
        setMarketers(r.marketers);
      }
      toast(`${toAdd} row${toAdd === 1 ? '' : 's'} imported${toUpdate ? `, ${toUpdate} updated` : ''}`);
      // Open the month that got the most rows.
      const best = [...months].sort((a, b) => plans[b].add.length - plans[a].add.length)[0] ?? openMonth;
      onDone(best);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'The import stopped. Rows already saved stay; import again to add the rest.', 'bad');
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm md:items-center md:p-6" role="dialog" aria-modal="true" aria-label="Import files">
      <div className="flex max-h-[94dvh] w-full max-w-3xl flex-col rounded-t-3xl bg-paper shadow-2xl md:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-xl font-extrabold">Import your sheets</h2>
            <p className="text-sm text-muted">Excel, .xlsx or .csv</p>
          </div>
          <button type="button" onClick={onClose} disabled={Boolean(busy)} className="grid size-10 shrink-0 place-items-center rounded-xl hover:bg-ink/5" aria-label="Close">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <input ref={input} type="file" multiple accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" className="sr-only" onChange={(e) => void pick(e.target.files).finally(() => (e.target.value = ''))} />
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void pick(e.dataTransfer.files);
            }}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-blue/40 bg-white px-4 py-6 text-center transition hover:border-blue"
          >
            <FileUp className="size-8 text-blue" aria-hidden />
            <span className="font-extrabold">{files.length ? 'Add more files' : 'Choose files'}</span>
            <span className="text-sm text-muted">Several at once is fine</span>
          </button>
          {reading && <p className="text-center text-sm font-semibold text-muted">Reading…</p>}
          {problems.map((p) => (
            <p key={p} className="flex gap-2 rounded-xl bg-bad/10 px-3 py-2 text-sm font-semibold text-bad">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {p}
            </p>
          ))}

          {files.map((f) => {
            const plan = plans[f.month];
            return (
              <div key={f.key} className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-2 font-extrabold">
                    <FileSpreadsheet className="size-5 shrink-0 text-ok" aria-hidden />
                    <span className="truncate">{f.fileName}</span>
                  </p>
                  <button type="button" className="text-sm font-bold text-muted hover:text-bad" onClick={() => setFiles((fs) => fs.filter((x) => x.key !== f.key))}>
                    Remove
                  </button>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="text-sm font-bold">
                    Sheet
                    <select value={f.kind} onChange={(e) => setFile(f.key, { kind: e.target.value as Kind })} className="mt-1 h-10 w-full rounded-xl border border-line bg-white px-2 font-semibold">
                      {KINDS.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-bold">
                    Month’s workbook
                    <select value={f.month} onChange={(e) => setFile(f.key, { month: e.target.value })} className="mt-1 h-10 w-full rounded-xl border border-line bg-white px-2 font-semibold">
                      {Array.from({ length: 25 }, (_, i) => addMonths(openMonth, 12 - i)).map((m) => (
                        <option key={m} value={m}>
                          {monthName(m)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-muted">
                      <th className="py-1 font-bold">Tab</th>
                      <th className="py-1 font-bold">Branch</th>
                      <th className="py-1 text-right font-bold">Rows</th>
                      <th className="py-1 text-right font-bold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.tabs.map((t) => (
                      <tr key={t.name} className="border-t border-line align-top">
                        <td className="py-2 font-bold">
                          {t.name}
                          {t.fixes.length > 0 && (
                            <ul className="mt-1 space-y-0.5 text-xs font-medium text-muted">
                              {t.fixes.map((x) => (
                                <li key={x} className="flex gap-1">
                                  <Info className="mt-0.5 size-3 shrink-0" aria-hidden /> {x}
                                </li>
                              ))}
                            </ul>
                          )}
                          {t.guessedColumns && <p className="mt-1 text-xs font-semibold text-[#a05a00]">No header row found: columns read in the standard order. Check a few rows after importing.</p>}
                        </td>
                        <td className="py-2">{t.branch || '—'}</td>
                        <td className="figures py-2 text-right font-bold">{t.rows.length}</td>
                        <td className="figures py-2 text-right font-bold">₦{showMoney(t.rows.reduce((a, r) => a + (r.amount ?? 0), 0)) || '0'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!plan && <p className="mt-2 text-xs font-semibold text-muted">Checking what’s already in {monthName(f.month)}…</p>}
              </div>
            );
          })}

          {ready && (
            <div className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
              <p className="flex items-center gap-2 font-extrabold">
                <CheckCircle2 className="size-5 text-ok" aria-hidden /> {toAdd} new row{toAdd === 1 ? '' : 's'} to add
                {months.length > 1 ? ` across ${months.length} months` : ` to ${monthName(months[0])}`}
              </p>
              {same > 0 && <p className="text-sm text-muted">{same} already in WeekDeck, left as they are.</p>}
              {toUpdate > 0 && <p className="text-sm text-muted">{toUpdate} will be updated from the file.</p>}
              {twice > 0 && (
                <p className="flex gap-2 text-sm font-semibold text-[#a05a00]">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {twice} row{twice === 1 ? '' : 's'} appear twice. Both come in marked ⚠.
                </p>
              )}
              <label className="flex cursor-pointer items-start gap-2 pt-1 text-sm">
                <input type="checkbox" checked={update} onChange={(e) => setUpdate(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-blue)]" />
                <span>
                  <b>Update rows already in WeekDeck</b> from the file
                </span>
              </label>
              {fresh.length > 0 && (
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input type="checkbox" checked={addRoster} onChange={(e) => setAddRoster(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-blue)]" />
                  <span>
                    <b>
                      <Users className="mr-1 inline size-4" aria-hidden />
                      Add {fresh.length} marketer{fresh.length === 1 ? '' : 's'} to your roster
                    </b>
                  </span>
                </label>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-4">
          <p className="text-sm font-semibold text-muted">{busy ?? (files.length ? `${files.length} file${files.length === 1 ? '' : 's'}` : '')}</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={Boolean(busy)}>
              Cancel
            </Button>
            <Button onClick={run} loading={Boolean(busy)} disabled={!ready || (!toAdd && !toUpdate && !(addRoster && fresh.length))}>
              Import {toAdd + toUpdate || ''} row{toAdd + toUpdate === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
