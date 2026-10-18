import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { motion } from 'motion/react';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Copy, Crown, LogOut, Medal, Play, RefreshCw, Trophy, UserPlus, Users, Wallet } from 'lucide-react';
import { ApiError } from '../lib/api';
import { getRegionToken, loadDashboard, newJoinCode, regionLogin, setRegionToken, type Dashboard } from '../lib/region';
import { formatNaira } from '../lib/money';
import { addWeeks, mondayOf, weekNumberInMonth, weekRangeLabel } from '../lib/weeks';
import { Button, Card, Field, Logo, SectionTitle, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';

/** Region head: log in, then see every team in the region for any week. */
export function RegionPage() {
  const [token, setToken] = useState(getRegionToken());
  const signIn = (t: string) => {
    setRegionToken(t);
    setToken(t);
  };
  const signOut = () => {
    setRegionToken(null);
    setToken(null);
  };
  return token ? <RegionDashboard token={token} onSignOut={signOut} /> : <RegionLogin onDone={signIn} />;
}

function RegionLogin({ onDone }: { onDone: (token: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (name.trim().length < 2) return setError('Enter the region name.');
    if (!/^\d{4,6}$/.test(pin)) return setError('The PIN is 4 to 6 numbers.');
    if (mode === 'register' && pin !== pin2) return setError('The two PINs don’t match.');
    setBusy(true);
    try {
      const r = await regionLogin(mode, name, pin);
      onDone(r.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid min-h-dvh max-w-md content-center gap-6 px-5 py-10">
      <Link to="/welcome">
        <Logo size={36} />
      </Link>
      <div>
        <p className="text-sm font-bold uppercase tracking-wider text-blue">For region heads</p>
        <h1 className="text-3xl font-extrabold tracking-tight">Every team. One dashboard.</h1>
        <p className="mt-2 text-muted">See each team’s week, a live leaderboard, and present any team’s slides.</p>
      </div>
      <Card className="p-5">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-paper p-1">
          {(['login', 'register'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m} className={`h-10 rounded-xl text-sm font-extrabold ${mode === m ? 'bg-white shadow-sm' : 'text-muted'}`}>
              {m === 'login' ? 'Log in' : 'New region'}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <Field label="Region name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fagba Region" autoComplete="username" />
          <Field label="PIN" type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          {mode === 'register' && <Field label="PIN again" type="password" inputMode="numeric" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} autoComplete="new-password" />}
          {error && <p className="rounded-xl bg-bad/10 px-3 py-2 text-sm font-semibold text-bad">{error}</p>}
          <Button type="submit" full size="lg" loading={busy}>
            {mode === 'login' ? 'Open dashboard' : 'Create region'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function RegionDashboard({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const thisMonday = mondayOf();
  const week = /^\d{4}-\d{2}-\d{2}$/.test(params.get('week') ?? '') ? params.get('week')! : thisMonday;
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    loadDashboard(token, week)
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) return onSignOut();
        setError(err instanceof ApiError ? err.message : 'The dashboard didn’t load.');
      });
  }, [token, week, onSignOut]);
  useEffect(load, [load]);

  const go = (w: string) => setParams(w === thisMonday ? {} : { week: w }, { replace: true });
  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.region.joinCode);
      toast('Code copied');
    } catch {
      toast(`The code is ${data.region.joinCode}`);
    }
  };
  const rotate = async () => {
    if (!window.confirm('Make a new code? The old code stops working. Teams already in your region stay in.')) return;
    try {
      const r = await newJoinCode(token);
      setData((d) => (d ? { ...d, region: r.region } : d));
      toast('New code ready');
    } catch {
      toast('Couldn’t make a new code', 'bad');
    }
  };

  const change = data && data.totals.prevWeek > 0 ? Math.round(((data.totals.week - data.totals.prevWeek) / data.totals.prevWeek) * 100) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 pb-16 pt-5 md:px-6">
      <header className="flex items-center justify-between gap-3">
        <Logo size={34} />
        <button type="button" onClick={onSignOut} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-bold shadow-sm">
          <LogOut className="size-4" aria-hidden /> Log out
        </button>
      </header>

      {!data && !error && <Spinner label="Loading the region…" />}
      {error && (
        <Card className="p-8 text-center">
          <p className="font-bold">{error}</p>
          <Button className="mt-4" onClick={load}>
            Try again
          </Button>
        </Card>
      )}

      {data && (
        <>
          <section className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-blue">Region dashboard</p>
              <h1 className="text-[30px] font-extrabold leading-tight tracking-tight md:text-4xl">{data.region.name}</h1>
              <p className="text-muted">
                Week {weekNumberInMonth(week)} · {weekRangeLabel(week)}
              </p>
            </div>
            <div className="flex items-center rounded-2xl bg-white p-1 shadow-sm">
              <button type="button" onClick={() => go(addWeeks(week, -1))} className="grid size-10 place-items-center rounded-xl hover:bg-paper" aria-label="Previous week">
                <ChevronLeft className="size-5" aria-hidden />
              </button>
              {week !== thisMonday && (
                <button type="button" onClick={() => go(thisMonday)} className="h-10 rounded-xl px-3 text-sm font-bold text-blue hover:bg-paper">
                  This week
                </button>
              )}
              <button type="button" onClick={() => go(addWeeks(week, 1))} className="grid size-10 place-items-center rounded-xl hover:bg-paper" aria-label="Next week">
                <ChevronRight className="size-5" aria-hidden />
              </button>
            </div>
          </section>

          {/* Totals */}
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat dark icon={<Wallet className="size-5" aria-hidden />} label="Region this week" value={formatNaira(data.totals.week)} sub={change === null ? 'No figures last week' : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}% vs last week`} />
            <Stat icon={<UserPlus className="size-5" aria-hidden />} label="New clients" value={String(data.totals.nc)} sub="this week" />
            <Stat icon={<Users className="size-5" aria-hidden />} label="Teams updated" value={`${data.totals.submitted} / ${data.totals.teams}`} sub="have this week’s figures" />
            <Stat icon={<Trophy className="size-5" aria-hidden />} label="This month" value={formatNaira(data.totals.month)} sub="all teams" />
          </section>

          {/* Join code */}
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-sm font-extrabold">Region code for teams</p>
              <p className="text-sm text-muted">Managers enter it on their Team page → “Join your region”.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="figures rounded-xl bg-paper px-4 py-2 text-xl font-extrabold tracking-[0.25em]">{data.region.joinCode}</span>
              <button type="button" onClick={copy} className="grid size-10 place-items-center rounded-xl bg-blue text-white" aria-label="Copy code">
                <Copy className="size-4" aria-hidden />
              </button>
              <button type="button" onClick={rotate} className="grid size-10 place-items-center rounded-xl bg-paper" aria-label="Make a new code">
                <RefreshCw className="size-4" aria-hidden />
              </button>
            </div>
          </Card>

          {/* Leaderboard */}
          <section>
            <SectionTitle>Team leaderboard</SectionTitle>
            {!data.teams.length ? (
              <Card className="p-8 text-center text-muted">No teams yet. Share the code above with your managers.</Card>
            ) : (
              <div className="space-y-2">
                {data.teams.map((t, i) => {
                  const diff = t.prevTotal && t.prevTotal > 0 ? Math.round(((t.total - t.prevTotal) / t.prevTotal) * 100) : null;
                  return (
                    <motion.div key={t.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                      <Card className="flex flex-wrap items-center gap-3 p-4">
                        <span className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-extrabold ${i === 0 && t.total > 0 ? 'bg-sun text-ink' : 'bg-paper'}`}>
                          {i === 0 && t.total > 0 ? <Crown className="size-5" aria-label="First" /> : i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-extrabold">{t.title}</p>
                          <p className="truncate text-xs text-muted">
                            {[t.manager, `${t.members} members`, t.top ? `Top: ${t.top.name.split(' ')[0]} ${formatNaira(t.top.total)}` : null].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="figures font-extrabold">{formatNaira(t.total)}</p>
                          <p className="flex items-center justify-end gap-1 text-xs font-bold">
                            {diff === null ? (
                              <span className="text-muted">{t.nc} new clients</span>
                            ) : (
                              <span className={diff >= 0 ? 'text-ok' : 'text-bad'}>
                                {diff >= 0 ? <ArrowUpRight className="inline size-3.5" aria-hidden /> : <ArrowDownRight className="inline size-3.5" aria-hidden />} {Math.abs(diff)}% · {t.nc} NC
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
                          {!t.submitted && <span className="rounded-full bg-sun-soft px-2.5 py-1 text-[11px] font-bold text-[#7a4f00]">No figures yet</span>}
                          <Button size="sm" variant="dark" icon={<Play className="size-4" aria-hidden />} onClick={() => navigate(`/region/present/${t.id}?week=${week}`)}>
                            Present
                          </Button>
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </section>

          {/* People */}
          {data.people.length > 0 && (
            <section>
              <SectionTitle>Top marketers this week</SectionTitle>
              <Card className="divide-y divide-line">
                {data.people.map((p, i) => (
                  <div key={`${p.team}-${p.name}`} className="flex items-center gap-3 px-4 py-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-paper text-xs font-extrabold">{i < 3 ? <Medal className={`size-4 ${['text-sun', 'text-muted', 'text-[#b26a2c]'][i]}`} aria-hidden /> : i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{p.name}</p>
                      <p className="truncate text-xs text-muted">{p.team}</p>
                    </div>
                    <p className="figures font-extrabold">{formatNaira(p.total)}</p>
                  </div>
                ))}
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ icon, label, value, sub, dark }: { icon: React.ReactNode; label: string; value: string; sub: string; dark?: boolean }) {
  return (
    <div className={`rounded-card p-4 ${dark ? 'bg-ink text-white' : 'border border-line bg-white'}`}>
      <span className={`inline-grid size-8 place-items-center rounded-xl ${dark ? 'bg-white/10 text-sun' : 'bg-blue-soft text-blue'}`}>{icon}</span>
      <p className={`mt-2 text-xs font-bold uppercase tracking-wide ${dark ? 'text-white/60' : 'text-muted'}`}>{label}</p>
      <p className="figures truncate text-xl font-extrabold md:text-2xl">{value}</p>
      <p className={`truncate text-xs ${dark ? 'text-white/60' : 'text-muted'}`}>{sub}</p>
    </div>
  );
}
