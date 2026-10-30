/** Download the month's sheets as Excel or as CSV rows to append in Google Sheets. */
import { useMemo, useState, type ReactNode } from 'react';
import { FileSpreadsheet, Sheet, X } from 'lucide-react';
import { useAccounts } from './AccountsApp';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { KINDS, monthName, type Kind } from '../../lib/accounts/columns';
import { exportCsv, exportExcel } from '../../lib/accounts/exporter';
import { downloadBlob } from '../../lib/accounts/xlsx';

export function SheetsDownload({ onClose }: { onClose: () => void }) {
  const { acc, month, ledger } = useAccounts();
  const toast = useToast();
  const tabs = useMemo(() => [...new Set([...acc.tabs.map((t) => t.name), ...ledger.rows.map((p) => p.tab)])], [acc.tabs, ledger.rows]);
  const [kinds, setKinds] = useState<Kind[]>(['land', 'new', 'infra']);
  const [picked, setPicked] = useState<string[] | null>(null);
  const chosenTabs = picked ?? tabs;
  const count = (k: Kind, t: string) => ledger.rows.filter((p) => p.kind === k && p.tab === t).length;
  const rows = kinds.reduce((a, k) => a + chosenTabs.reduce((b, t) => b + count(k, t), 0), 0);

  const flip = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const run = async (what: 'xlsx' | 'csv') => {
    try {
      await ledger.flush();
      const choice = { month, kinds, tabs: chosenTabs };
      const f = what === 'xlsx' ? await exportExcel(ledger.rows, choice) : await exportCsv(ledger.rows, choice);
      downloadBlob(f.blob, f.name);
      toast(`${f.name} downloaded`);
    } catch {
      toast('Couldn’t make the file. Try again.', 'bad');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 backdrop-blur-sm md:items-center md:p-6" role="dialog" aria-modal="true" aria-label="Download the sheets" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[94dvh] w-full max-w-2xl flex-col rounded-t-3xl bg-paper shadow-2xl md:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="flex items-center gap-2 text-xl font-extrabold">
            <Sheet className="size-5 text-ok" aria-hidden /> Download {monthName(month)}
          </h2>
          <button type="button" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-xl hover:bg-ink/5" aria-label="Close">
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <div className="grid gap-4 md:grid-cols-2">
        <fieldset>
          <legend className="mb-2 text-sm font-extrabold">Sheets</legend>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <Chip key={k.id} on={kinds.includes(k.id)} onClick={() => setKinds(flip(kinds, k.id))}>
                {k.label}
              </Chip>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-extrabold">Tabs</legend>
          <div className="flex flex-wrap gap-2">
            {tabs.map((t) => (
              <Chip key={t} on={chosenTabs.includes(t)} onClick={() => setPicked(flip(chosenTabs, t))}>
                {t}
              </Chip>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button icon={<FileSpreadsheet className="size-4" aria-hidden />} onClick={() => run('xlsx')} disabled={!kinds.length || !chosenTabs.length}>
          Excel (.xlsx)
        </Button>
        <Button variant="soft" icon={<Sheet className="size-4" aria-hidden />} onClick={() => run('csv')} disabled={!kinds.length || !chosenTabs.length}>
          Rows to add to Google Sheets (.csv)
        </Button>
        <span className="text-sm font-semibold text-muted">
          {rows} row{rows === 1 ? '' : 's'}
          {kinds.length > 1 || (kinds.length && chosenTabs.length > 1) ? ' · several files come in one .zip' : ''}
        </span>
      </div>
      <details className="mt-4 rounded-2xl bg-paper px-4 py-3 text-sm">
        <summary className="cursor-pointer font-bold">How to put these into Google Sheets</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
          <li>
            <b>Excel (.xlsx)</b>: File → Import → Upload → “Insert new sheet(s)”.
          </li>
          <li>
            <b>Rows to add (.csv)</b>: open the tab, File → Import → Upload → “Append rows to current sheet”.
          </li>
                  </ul>
      </details>
        </div>
      </div>
    </div>
  );
}


function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`h-10 rounded-xl px-3.5 text-sm font-bold transition ${on ? 'bg-ink text-white' : 'bg-white text-muted shadow-sm hover:text-ink'}`}>
      {children}
    </button>
  );
}
