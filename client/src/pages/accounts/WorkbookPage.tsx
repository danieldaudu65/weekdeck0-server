import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, CloudOff, FileUp, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { useAccounts } from './AccountsApp';
import { ImportDialog } from './ImportDialog';
import { Grid, type CellChange } from '../../components/accounts/Grid';
import { Button, Card, Spinner } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { BANKS, KINDS, addMonths, columnsFor, emptyPayment, groupsFor, isBlank, isConfirmed, monthName, nameKey, paymentKey, showDate, showMoney, type FieldKey, type Kind, type Payment } from '../../lib/accounts/columns';

const FROM_MARKETER: FieldKey[] = ['supervisor', 'designation', 'accountNumber', 'spouseName', 'spouseAccount'];

export function WorkbookPage() {
  const { acc, saveMe, marketers, month, setMonth, ledger } = useAccounts();
  const toast = useToast();
  const [kind, setKind] = useState<Kind>('land');
  const [tabName, setTabName] = useState<string>('');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [importing, setImporting] = useState(false);
  const [addingTab, setAddingTab] = useState(false);

  // Tabs: the workbook's list, plus any tab that has rows this month.
  const tabs = useMemo(() => {
    const list = acc.tabs.map((t) => ({ ...t }));
    for (const p of ledger.rows) if (!list.some((t) => t.name === p.tab)) list.push({ name: p.tab, branch: p.branch });
    return list;
  }, [acc.tabs, ledger.rows]);
  const tab = tabs.find((t) => t.name === tabName) ?? tabs[0];

  const inTab = useMemo(
    () => (tab ? ledger.rows.filter((p) => p.kind === kind && p.tab === tab.name).sort((a, b) => a.pos - b.pos || (a.sn ?? 0) - (b.sn ?? 0)) : []),
    [ledger.rows, kind, tab],
  );
  const serials = useMemo(() => new Map(inTab.map((p, i) => [p, i + 1])), [inTab]);
  const serial = useCallback((p: Payment, i: number) => serials.get(p) ?? i + 1, [serials]);

  const shown = useMemo(() => {
    const k = q.trim().toUpperCase();
    if (!k) return inTab;
    return inTab.filter((p) => [p.alertName, p.clientName, p.marketer, p.cabalId, p.bank, p.confirmation, showDate(p.date), String(p.amount ?? '')].some((v) => String(v).toUpperCase().includes(k)));
  }, [inTab, q]);

  // Rows that look like the same payment twice (all the key columns, CABAL ID included, match),
  // and dates far from the month (29/11/2013 in an October 2026 sheet is a typo).
  const flags = useMemo(() => {
    const first = new Map<string, number>();
    const out = new Map<Payment, string>();
    const [y, m] = month.split('-').map(Number);
    inTab.forEach((p, i) => {
      if (isBlank(p) || (!p.alertName && !p.clientName)) return;
      if (p.date) {
        const [py, pm] = p.date.split('-').map(Number);
        if (Math.abs(py * 12 + pm - (y * 12 + m)) > 3) out.set(p, `The date ${showDate(p.date)} is far from ${monthName(month)}. A typo?`);
      }
      const k = paymentKey(p);
      const at = first.get(k);
      if (at === undefined) first.set(k, i);
      else if (!out.has(p)) out.set(p, `Looks like row ${at + 1} again (same date, alert name, amount, client and CABAL ID). Delete it if it’s a mistake.`);
    });
    return out;
  }, [inTab, month]);

  const roster = useMemo(() => {
    const m = new Map<string, (typeof marketers)[number]>();
    for (const x of marketers) {
      m.set(nameKey(x.name), x);
      for (const a of x.aliases) m.set(nameKey(a), x);
    }
    return m;
  }, [marketers]);

  const suggestions = useMemo(() => {
    const uniq = (list: string[]) => [...new Set(list.filter(Boolean))].sort();
    const all = ledger.rows;
    return {
      marketer: uniq(marketers.map((m) => m.name)),
      supervisor: uniq([...marketers.map((m) => m.supervisor), ...all.map((p) => p.supervisor)]),
      bank: uniq([...BANKS, ...all.map((p) => p.bank)]),
      branch: uniq([...tabs.map((t) => t.branch), ...all.map((p) => p.branch)]),
      promo: uniq(all.map((p) => p.promo)),
      officer: uniq(all.map((p) => p.officer)),
    } as Partial<Record<FieldKey, string[]>>;
  }, [marketers, ledger.rows, tabs]);

  const onChanges = useCallback(
    (changes: CellChange[]) => {
      if (!tab) return;
      const edited = new Map<number, Payment>();
      let nextPos = inTab.reduce((a, p) => Math.max(a, p.pos + 1), 0);
      const rowAt = (index: number): Payment => {
        if (edited.has(index)) return edited.get(index)!;
        let p: Payment;
        if (index < shown.length) p = { ...shown[index] };
        else {
          p = emptyPayment(month, kind, tab.name, nextPos++, tab.branch);
        }
        edited.set(index, p);
        return p;
      };
      // New rows below the data must be added in order (row 3 typed into → rows 1–3 exist).
      const maxIndex = Math.max(...changes.map((c) => c.index));
      for (let i = shown.length; i <= maxIndex; i++) if (changes.some((c) => c.index >= i)) rowAt(i);
      for (const ch of changes) {
        const p = rowAt(ch.index) as Record<string, unknown>;
        p[ch.key] = ch.value;
        // Picking a marketer fills in their details from the roster.
        if (ch.key === 'marketer' && typeof ch.value === 'string') {
          const m = roster.get(nameKey(ch.value));
          if (m) {
            p.marketer = m.name;
            for (const f of FROM_MARKETER) if (m[f as keyof typeof m]) p[f] = m[f as keyof typeof m];
          }
        }
        if ((ch.key === 'bank' || ch.key === 'confirmation' || ch.key === 'postingStatus' || ch.key === 'designation') && typeof ch.value === 'string') p[ch.key] = ch.value.toUpperCase();
        // The confirmed amount usually equals the amount: fill it when confirming.
        if (ch.key === 'confirmation' && isConfirmed({ confirmation: String(p.confirmation) }) && (p.confirmAmount === null || p.confirmAmount === undefined)) p.confirmAmount = p.amount;
      }
      // Rows that became completely empty are removed (except the ones only just added).
      const changed = [...edited.values()];
      const emptied = changed.filter((p) => isBlank(p) && p.id);
      ledger.update(changed.filter((p) => !(isBlank(p) && !p.id) && !emptied.includes(p)));
      if (emptied.length) ledger.remove(emptied);
    },
    [tab, inTab, shown, month, kind, roster, ledger],
  );

  const deleteSelected = () => {
    const rows = selected.map((i) => shown[i]).filter(Boolean);
    if (!rows.length) return;
    if (!window.confirm(`Delete ${rows.length} row${rows.length === 1 ? '' : 's'}? This can’t be undone.`)) return;
    ledger.remove(rows);
    toast(`${rows.length} row${rows.length === 1 ? '' : 's'} deleted`);
  };

  const addTab = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get('name') || '').trim().toUpperCase();
    const branch = String(f.get('branch') || '').trim().toUpperCase();
    if (!name) return;
    if (tabs.some((t) => t.name === name)) {
      setTabName(name);
      setAddingTab(false);
      return;
    }
    try {
      await saveMe({ tabs: [...tabs, { name, branch: branch || name }] });
      setTabName(name);
      setAddingTab(false);
    } catch {
      toast('Couldn’t add the tab. Try again.', 'bad');
    }
  };

  // Totals for the tab on screen.
  const totals = useMemo(() => {
    const t = { rows: 0, amount: 0, confirmed: 0, pending: 0, pendingN: 0, clients: new Set<string>() };
    for (const p of inTab) {
      if (isBlank(p)) continue;
      t.rows++;
      t.amount += p.amount ?? 0;
      if (isConfirmed(p)) t.confirmed += p.amount ?? 0;
      else {
        t.pending += p.amount ?? 0;
        t.pendingN++;
      }
      if (nameKey(p.clientName)) t.clients.add(nameKey(p.clientName));
    }
    return t;
  }, [inTab]);
  const kindCount = (k: Kind) => ledger.rows.filter((p) => p.kind === k).length;

  return (
    <div className="min-w-0 space-y-4">
      {/* Month + save state */}
      <section className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-wider text-blue">Workbook</p>
          <div className="mt-1 flex items-center gap-2">
            <button type="button" aria-label="Month before" onClick={() => setMonth(addMonths(month, -1))} className="grid size-10 place-items-center rounded-xl bg-white shadow-sm active:scale-95">
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <h1 className="min-w-[11ch] text-center text-[26px] font-extrabold leading-tight tracking-tight md:text-3xl">{monthName(month)}</h1>
            <button type="button" aria-label="Month after" onClick={() => setMonth(addMonths(month, 1))} className="grid size-10 place-items-center rounded-xl bg-white shadow-sm active:scale-95">
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SaveBadge state={ledger.state} error={ledger.error} />
          <Button icon={<FileUp className="size-4" aria-hidden />} onClick={() => setImporting(true)}>
            Import files
          </Button>
        </div>
      </section>

      {/* Which of the three sheets */}
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0">
        <div className="inline-flex gap-1 rounded-2xl bg-white p-1 shadow-sm" role="tablist" aria-label="Sheet">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              role="tab"
              aria-selected={kind === k.id}
              onClick={() => setKind(k.id)}
              className={`flex h-10 items-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-bold transition ${kind === k.id ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
            >
              {k.label}
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${kind === k.id ? 'bg-white/15' : 'bg-paper'}`}>{kindCount(k.id)}</span>
            </button>
          ))}
        </div>
      </div>

      {ledger.loading ? (
        <Card>
          <Spinner label={`Opening ${monthName(month)}…`} />
        </Card>
      ) : !tabs.length ? (
        <Card className="p-8 text-center">
          <FileUp className="mx-auto size-10 text-blue" aria-hidden />
          <h2 className="mt-3 text-xl font-extrabold">Bring in your sheets</h2>
          <p className="mx-auto mt-1 max-w-md text-muted">
            Upload your Excel or Google Sheets files.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button size="lg" icon={<FileUp className="size-5" aria-hidden />} onClick={() => setImporting(true)}>
              Import files
            </Button>
            <Button size="lg" variant="soft" icon={<Plus className="size-5" aria-hidden />} onClick={() => setAddingTab(true)}>
              Start an empty tab
            </Button>
          </div>
          {addingTab && <AddTabForm onSubmit={addTab} onCancel={() => setAddingTab(false)} />}
        </Card>
      ) : (
        <>
          {/* Totals of the tab on screen */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Rows" value={String(totals.rows)} sub={`${tab?.name} · ${KINDS.find((k) => k.id === kind)!.short}`} />
            <Stat label="Total amount" value={`₦${showMoney(totals.amount) || '0'}`} sub={kind === 'new' ? `${totals.clients.size} new client${totals.clients.size === 1 ? '' : 's'}` : `${totals.clients.size} clients`} />
            <Stat label="Confirmed" value={`₦${showMoney(totals.confirmed) || '0'}`} tone="ok" />
            <Stat label="Not confirmed yet" value={`₦${showMoney(totals.pending) || '0'}`} sub={`${totals.pendingN} payment${totals.pendingN === 1 ? '' : 's'}`} tone={totals.pendingN ? 'warn' : undefined} />
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-0 basis-full md:max-w-sm md:flex-1 md:basis-auto">
              <span className="sr-only">Search this tab</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search client, marketer, CABAL ID…"
                className="h-10 w-full rounded-xl border border-line bg-white pl-9 pr-9 text-sm focus:border-blue focus:outline-none"
              />
              {q && (
                <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted" aria-label="Clear search">
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </label>
            {flags.size > 0 && (
              <span className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-sun-soft px-3 text-sm font-bold text-[#7a4f00]">
                <AlertTriangle className="size-4" aria-hidden /> {flags.size} row{flags.size === 1 ? '' : 's'} to check (⚠): tap the row to see why
              </span>
            )}
            <Button size="sm" variant="danger" icon={<Trash2 className="size-4" aria-hidden />} onClick={deleteSelected} disabled={!selected.some((i) => shown[i])}>
              Delete {selected.filter((i) => shown[i]).length > 1 ? `${selected.filter((i) => shown[i]).length} rows` : 'row'}
            </Button>
          </div>

          {q && <p className="text-sm font-semibold text-muted">{shown.length} of {inTab.length} rows match “{q}”</p>}

          <Grid
            key={`${kind}|${tab?.name}`}
            columns={columnsFor(kind)}
            groups={groupsFor(kind)}
            rows={shown}
            serial={serial}
            flags={flags}
            suggestions={suggestions}
            onChanges={onChanges}
            onSelectRows={setSelected}
          />

          {/* Sheet tabs, like Google Sheets */}
          <div className="sticky bottom-16 z-20 -mx-4 flex items-center gap-1 overflow-x-auto border-t border-line bg-paper/95 px-4 py-2 backdrop-blur [scrollbar-width:none] md:bottom-0" role="tablist" aria-label="Tabs">
            {tabs.map((t) => {
              const n = ledger.rows.filter((p) => p.kind === kind && p.tab === t.name).length;
              const on = t.name === tab?.name;
              return (
                <button
                  key={t.name}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTabName(t.name)}
                  className={`flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-bold transition ${on ? 'bg-white text-ink shadow-sm ring-1 ring-blue/30' : 'text-muted hover:bg-white/60'}`}
                >
                  {t.name}
                  <span className="text-[11px] font-semibold text-muted">{n}</span>
                </button>
              );
            })}
            <button type="button" onClick={() => setAddingTab(true)} className="flex h-10 shrink-0 items-center gap-1 rounded-xl px-3 text-sm font-bold text-blue hover:bg-white/60">
              <Plus className="size-4" aria-hidden /> Tab
            </button>
          </div>
          {addingTab && (
            <Card className="p-4">
              <AddTabForm onSubmit={addTab} onCancel={() => setAddingTab(false)} />
            </Card>
          )}
        </>
      )}

      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onDone={(m) => {
            setImporting(false);
            if (m !== month) setMonth(m);
            else void ledger.reload();
          }}
        />
      )}
    </div>
  );
}

function AddTabForm({ onSubmit, onCancel }: { onSubmit: (e: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  return (
    <form onSubmit={onSubmit} className="mx-auto mt-4 flex max-w-xl flex-wrap items-end gap-2 text-left">
      <label className="min-w-0 flex-1">
        <span className="mb-1 block text-sm font-bold">Tab name</span>
        <input name="name" required autoFocus placeholder="OGBAFAGBA VIDCO" className="h-11 w-full rounded-xl border border-line bg-white px-3 uppercase focus:border-blue focus:outline-none" />
      </label>
      <label className="min-w-0 flex-1">
        <span className="mb-1 block text-sm font-bold">Branch</span>
        <input name="branch" placeholder="FAGBA" className="h-11 w-full rounded-xl border border-line bg-white px-3 uppercase focus:border-blue focus:outline-none" />
      </label>
      <Button type="submit">Add tab</Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-muted">{label}</p>
      <p className={`figures truncate text-base font-extrabold sm:text-lg md:text-xl ${tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-[#a05a00]' : ''}`}>{value}</p>
      <p className="truncate text-xs text-muted">{sub}</p>
    </div>
  );
}

function SaveBadge({ state, error }: { state: string; error: string | null }) {
  if (state === 'error')
    return (
      <span className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-bad/10 px-3 text-sm font-bold text-bad" title={error ?? ''}>
        <CloudOff className="size-4" aria-hidden /> Not saved, retrying when you edit
      </span>
    );
  if (state === 'saving' || state === 'pending')
    return (
      <span className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-bold text-muted shadow-sm">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Saving…
      </span>
    );
  return (
    <span className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-bold text-ok shadow-sm">
      <CheckCircle2 className="size-4" aria-hidden /> All changes saved
    </span>
  );
}
