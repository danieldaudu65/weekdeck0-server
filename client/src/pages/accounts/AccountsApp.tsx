/**
 * /accounts: the accountants' section of WeekDeck. Each accountant has their
 * own login and their own region's workbook. Separate from team and region
 * logins on the same device.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router';
import { BookOpenCheck, Presentation, Settings, Sheet, Users } from 'lucide-react';
import { ApiError } from '../../lib/api';
import { ACC_SIGNED_OUT, accApi, getAccToken, setAccToken, type Accountant } from '../../lib/accounts/api';
import { thisMonth } from '../../lib/accounts/columns';
import type { Marketer } from '../../lib/accounts/accDeck';
import { useLedger, type Ledger } from '../../lib/accounts/useLedger';
import { Button, Card, Field, Logo, Spinner } from '../../components/ui';
import { WorkbookPage } from './WorkbookPage';
import { MarketersPage } from './MarketersPage';
import { ExportPage } from './ExportPage';
import { AccountsPrintPage } from './AccountsPrintPage';
import { AccountSettingsPage } from './AccountSettingsPage';

interface AccountsValue {
  acc: Accountant;
  setAcc: (a: Accountant) => void;
  saveMe: (b: Parameters<typeof accApi.saveMe>[0]) => Promise<Accountant>;
  marketers: Marketer[];
  setMarketers: (m: Marketer[]) => void;
  month: string;
  setMonth: (m: string) => void;
  ledger: Ledger;
  signOut: () => void;
}

const Ctx = createContext<AccountsValue | null>(null);
export function useAccounts(): AccountsValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAccounts outside /accounts');
  return v;
}

const MONTH_KEY = 'weekdeck.accounts.month';
function startMonth(): string {
  try {
    const m = localStorage.getItem(MONTH_KEY);
    if (m && /^\d{4}-\d{2}$/.test(m)) return m;
  } catch {
    /* ignore */
  }
  return thisMonth();
}

export function AccountsApp() {
  const [token, setToken] = useState(getAccToken());
  useEffect(() => {
    const out = () => setToken(null);
    window.addEventListener(ACC_SIGNED_OUT, out);
    return () => window.removeEventListener(ACC_SIGNED_OUT, out);
  }, []);
  useEffect(() => {
    const old = document.title;
    document.title = 'WeekDeck Accounts';
    return () => {
      document.title = old;
    };
  }, []);
  const signIn = (t: string) => {
    setAccToken(t);
    setToken(t);
  };
  const signOut = () => {
    setAccToken(null);
    setToken(null);
  };
  return token ? <Loaded key={token} onSignOut={signOut} /> : <AccountsLogin onDone={signIn} />;
}

function Loaded({ onSignOut }: { onSignOut: () => void }) {
  const [acc, setAcc] = useState<Accountant | null>(null);
  const [marketers, setMarketers] = useState<Marketer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([accApi.me(), accApi.marketers()])
      .then(([me, m]) => {
        setAcc(me.accountant);
        setMarketers(m.marketers);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Your workbook didn’t load.'));
  }, []);
  if (error)
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <Card className="max-w-sm p-8 text-center">
          <p className="font-bold">{error}</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </Card>
      </div>
    );
  if (!acc || !marketers) return <Spinner label="Opening your workbook…" />;
  return <Provider initial={acc} initialMarketers={marketers} onSignOut={onSignOut} />;
}

function Provider({ initial, initialMarketers, onSignOut }: { initial: Accountant; initialMarketers: Marketer[]; onSignOut: () => void }) {
  const [acc, setAcc] = useState(initial);
  const [marketers, setMarketers] = useState(initialMarketers);
  const [month, setMonthState] = useState(startMonth);
  const setMonth = useCallback((m: string) => {
    setMonthState(m);
    try {
      localStorage.setItem(MONTH_KEY, m);
    } catch {
      /* ignore */
    }
  }, []);
  // A save that added a tab updates the tab list.
  const onTabs = useCallback((tabs: Accountant['tabs']) => setAcc((a) => (JSON.stringify(a.tabs) === JSON.stringify(tabs) ? a : { ...a, tabs })), []);
  const ledger = useLedger(month, onTabs);
  const saveMe = useCallback(async (b: Parameters<typeof accApi.saveMe>[0]) => {
    const r = await accApi.saveMe(b);
    setAcc(r.accountant);
    return r.accountant;
  }, []);
  const signOut = useCallback(() => {
    void ledger.flush().finally(onSignOut);
  }, [ledger, onSignOut]);

  const value = useMemo(() => ({ acc, setAcc, saveMe, marketers, setMarketers, month, setMonth, ledger, signOut }), [acc, saveMe, marketers, month, setMonth, ledger, signOut]);
  return (
    <Ctx.Provider value={value}>
      <Routes>
        <Route path="print" element={<AccountsPrintPage />} />
        <Route element={<AccountsShell />}>
          <Route index element={<WorkbookPage />} />
          <Route path="marketers" element={<MarketersPage />} />
          <Route path="export" element={<ExportPage />} />
          <Route path="settings" element={<AccountSettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/accounts" replace />} />
      </Routes>
    </Ctx.Provider>
  );
}

const tabs = [
  { to: '/accounts', label: 'Workbook', icon: Sheet },
  { to: '/accounts/marketers', label: 'Marketers', icon: Users },
  { to: '/accounts/export', label: 'Export', icon: Presentation },
  { to: '/accounts/settings', label: 'Account', icon: Settings },
];

/** Frame: top bar with tabs on desktop, bottom tabs on phones. Wider than the team app: it holds a sheet. */
function AccountsShell() {
  const { acc } = useAccounts();
  return (
    <div className="min-h-dvh">
      <header className="no-print safe-top sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Logo size={34} withText={false} />
            <div className="min-w-0 leading-tight">
              <p className="text-[15px] font-extrabold">WeekDeck Accounts</p>
              <p className="truncate text-xs font-semibold text-muted">{acc.region}</p>
            </div>
          </div>
          <nav className="hidden items-center gap-1 rounded-2xl bg-white p-1 shadow-sm md:flex" aria-label="Accounts">
            {tabs.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/accounts'}
                className={({ isActive }) => `flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold transition ${isActive ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </NavLink>
            ))}
          </nav>
          <span className="max-w-[40%] truncate rounded-full bg-white px-3 py-1.5 text-sm font-bold shadow-sm">{acc.name}</span>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 pb-32 pt-6 md:pb-16">
        <Outlet />
      </main>
      <nav className="no-print safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur md:hidden" aria-label="Accounts">
        <div className="grid grid-cols-4">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/accounts'} className={({ isActive }) => `flex h-16 flex-col items-center justify-center gap-1 text-xs font-bold ${isActive ? 'text-blue' : 'text-muted'}`}>
              <Icon className="size-6" aria-hidden />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

/* ------------------------------------------------------------------ login */

function AccountsLogin({ onDone }: { onDone: (token: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'register') {
      if (name.trim().length < 2) return setError('Enter your name.');
      if (region.trim().length < 2) return setError('Enter your region, e.g. Fagba Region.');
      if (password.length < 8) return setError('The password must be at least 8 characters.');
    }
    setBusy(true);
    try {
      const r = mode === 'login' ? await accApi.login({ email, password }) : await accApi.register({ name, region, email, password });
      onDone(r.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo size={44} withText={false} />
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-blue">WeekDeck Accounts</p>
            <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">{mode === 'login' ? 'Welcome back' : 'Set up your workbook'}</h1>
            <p className="mt-1 text-muted">Payments, marketers and slides.</p>
          </div>
        </div>
        <Card className="p-6">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-paper p-1">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError('');
                }}
                className={`h-10 rounded-xl text-sm font-bold transition ${mode === m ? 'bg-white shadow-sm' : 'text-muted'}`}
              >
                {m === 'login' ? 'Log in' : 'New accountant'}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-4" noValidate>
            {mode === 'register' && (
              <>
                <Field label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Oyeyemi Ibukun" />
                <Field label="Your region" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Fagba Region" />
              </>
            )}
            <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" placeholder="you@example.com" />
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              hint={mode === 'register' ? 'At least 8 characters' : undefined}
            />
            {error && (
              <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm font-semibold text-bad" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" full loading={busy} icon={<BookOpenCheck className="size-5" aria-hidden />}>
              {mode === 'login' ? 'Open my workbook' : 'Create my workbook'}
            </Button>
          </form>
        </Card>
        <p className="mt-6 text-center text-sm text-muted">
          Team manager? <a href="/welcome" className="font-bold text-blue">Go to WeekDeck</a>
        </p>
      </div>
    </div>
  );
}

/** A labelled block used on the accounts pages. */
export function Panel({ title, action, children, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[var(--radius-card)] bg-white p-4 shadow-sm md:p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-lg font-extrabold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
