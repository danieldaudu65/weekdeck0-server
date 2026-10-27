import { useState, type FormEvent } from 'react';
import { KeyRound, LogOut, Save, Trash2 } from 'lucide-react';
import { useAccounts, Panel } from './AccountsApp';
import { Button, Field } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { ApiError } from '../../lib/api';
import { accApi, setAccToken } from '../../lib/accounts/api';

/** Name, region, tabs and their branches, password, log out. */
export function AccountSettingsPage() {
  const { acc, saveMe, ledger, signOut } = useAccounts();
  const toast = useToast();
  const [name, setName] = useState(acc.name);
  const [region, setRegion] = useState(acc.region);
  const [tabs, setTabs] = useState(acc.tabs);
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await saveMe({ name, region, tabs: tabs.map((t) => ({ name: t.name, branch: t.branch.trim().toUpperCase() || t.name })) });
      toast('Saved');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Couldn’t save. Try again.', 'bad');
    } finally {
      setBusy(false);
    }
  };

  const used = (tab: string) => ledger.rows.some((p) => p.tab === tab);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section>
        <p className="text-sm font-bold uppercase tracking-wider text-blue">Account</p>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">Your workbook</h1>
        <p className="text-muted">{acc.email}</p>
      </section>

      <form onSubmit={save} className="space-y-5">
        <Panel title="You and your region">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name" value={name} onChange={(e) => setName(e.target.value)} />
            <Field label="Region" hint="Shown on your slides" value={region} onChange={(e) => setRegion(e.target.value)} />
          </div>
        </Panel>

        <Panel title="Tabs and branches">
          <p className="mb-3 text-sm text-muted">Each tab belongs to a branch. The slides make one section per branch, e.g. OGBAFAGBA and OGBAFAGBA VIDCO both in FAGBA.</p>
          {tabs.length === 0 ? (
            <p className="text-sm text-muted">No tabs yet. Import your sheets or add a tab in the Workbook.</p>
          ) : (
            <ul className="divide-y divide-line">
              {tabs.map((t, i) => (
                <li key={t.name} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 font-bold">{t.name}</span>
                  <label className="flex items-center gap-2 text-sm font-semibold text-muted">
                    Branch
                    <input
                      value={t.branch}
                      onChange={(e) => setTabs(tabs.map((x, j) => (j === i ? { ...x, branch: e.target.value.toUpperCase() } : x)))}
                      className="h-10 w-40 rounded-xl border border-line px-3 font-bold uppercase text-ink"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={used(t.name)}
                    title={used(t.name) ? 'This tab has rows this month' : 'Remove the tab'}
                    onClick={() => setTabs(tabs.filter((_, j) => j !== i))}
                    className="grid size-10 place-items-center rounded-xl text-muted hover:bg-bad/10 hover:text-bad disabled:opacity-30"
                    aria-label={`Remove ${t.name}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Button type="submit" loading={busy} icon={<Save className="size-4" aria-hidden />}>
          Save
        </Button>
      </form>

      <PasswordPanel />

      <Panel>
        <Button variant="danger" icon={<LogOut className="size-4" aria-hidden />} onClick={signOut}>
          Log out
        </Button>
      </Panel>
    </div>
  );
}

function PasswordPanel() {
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return toast('The new password must be at least 8 characters.', 'bad');
    setBusy(true);
    try {
      const r = await accApi.password(cur, next);
      setAccToken(r.token);
      setCur('');
      setNext('');
      toast('Password changed. Other devices are logged out.');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Couldn’t change it. Try again.', 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit}>
      <Panel title="Change password">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Current password" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
          <Field label="New password" type="password" autoComplete="new-password" hint="At least 8 characters" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <Button className="mt-4" type="submit" variant="soft" loading={busy} icon={<KeyRound className="size-4" aria-hidden />}>
          Change password
        </Button>
      </Panel>
    </form>
  );
}
