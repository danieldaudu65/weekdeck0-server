import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router';
import { Download, FileUp, PencilLine, Play } from 'lucide-react';
import { getOpenMode, setOpenMode, type OpenMode } from '../lib/afterLogin';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { Button, Card, Field, Logo } from '../components/ui';

const steps = [
  { icon: FileUp, title: 'Upload once', text: 'Drop in last week’s PowerPoint or PDF. WeekDeck reads your team, titles and activities.' },
  { icon: PencilLine, title: 'Fill the week', text: 'Type each person’s figures. Totals and the monthly table add up by themselves.' },
  { icon: Download, title: 'Download', text: 'Pick a design and get your PowerPoint or PDF, ready to present.' },
];

export function WelcomePage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'new'>('login');
  const [teamName, setTeamName] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [openMode, setOpenModeState] = useState<OpenMode>(getOpenMode);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (teamName.trim().length < 2) return setError('Enter your team name.');
    if (!/^\d{4,6}$/.test(pin)) return setError('Your PIN is 4 to 6 numbers.');
    if (mode === 'new' && pin !== pin2) return setError('The two PINs don’t match.');
    setBusy(true);
    try {
      // A new team must set up first, so it always opens the editor.
      setOpenMode(mode === 'login' ? openMode : 'edit');
      if (mode === 'login') await login(teamName, pin);
      else await register(teamName, pin);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh">
      <div className="mx-auto grid max-w-5xl gap-10 px-5 pb-16 pt-8 md:grid-cols-[1.1fr_1fr] md:items-center md:pt-16">
        <div>
          <Logo size={40} />
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-8 text-[40px] font-extrabold leading-[1.05] tracking-tight md:text-[56px]">
            Your weekly slides.
            <br />
            <span className="text-blue">Done in 3 minutes.</span>
          </motion.h1>
          <p className="mt-4 max-w-md text-lg text-muted">No more retyping names, adding up totals or fighting PowerPoint every week.</p>

          {/* The motif: a little stack of slides */}
          <div className="relative mt-8 hidden h-40 md:block" aria-hidden>
            {['#2747D8', '#0E1A2B', '#FFB020'].map((c, i) => (
              <motion.div
                key={c}
                initial={{ opacity: 0, x: -20, rotate: -6 }}
                animate={{ opacity: 1, x: i * 46, rotate: -4 + i * 4, y: i * -8 }}
                transition={{ delay: 0.15 + i * 0.12, type: 'spring', stiffness: 160, damping: 18 }}
                className="absolute left-0 top-6 h-28 w-48 rounded-2xl shadow-xl"
                style={{ background: c }}
              >
                <div className="m-4 h-2 w-20 rounded bg-white/70" />
                <div className="mx-4 h-2 w-28 rounded bg-white/30" />
              </motion.div>
            ))}
          </div>

          <ol className="mt-8 grid gap-3 sm:grid-cols-3 md:mt-4">
            {steps.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="rounded-2xl bg-white p-4 shadow-sm">
                <span className="flex items-center gap-2 text-sm font-extrabold">
                  <span className="grid size-8 place-items-center rounded-xl bg-blue-soft text-blue">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  {i + 1}. {title}
                </span>
                <p className="mt-2 text-sm text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </div>

        <Card className="p-6 shadow-[0_30px_60px_-30px_rgba(14,26,43,0.35)] md:p-8">
          <div role="tablist" aria-label="Log in or create a team" className="grid grid-cols-2 gap-1 rounded-2xl bg-paper p-1">
            {(['login', 'new'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`h-11 rounded-xl text-sm font-extrabold transition ${mode === m ? 'bg-white shadow-sm' : 'text-muted'}`}
              >
                {m === 'login' ? 'Log in' : 'New team'}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <Field label="Team name" placeholder="e.g. Lifter Marine" value={teamName} onChange={(e) => setTeamName(e.target.value)} autoComplete="organization" maxLength={60} />
            <Field
              label={mode === 'new' ? 'Choose a PIN (4–6 numbers)' : 'PIN'}
              type="password"
              inputMode="numeric"
              autoComplete={mode === 'new' ? 'new-password' : 'current-password'}
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
            {mode === 'new' && (
              <Field label="Type the PIN again" type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} />
            )}
            {mode === 'login' && (
              <fieldset>
                <legend className="mb-1.5 text-sm font-bold">Open</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'edit', icon: PencilLine, title: 'Edit my week', text: 'Type figures and plans' },
                      { id: 'preview', icon: Play, title: 'Preview & present', text: 'See my slides, ready' },
                    ] as const
                  ).map(({ id, icon: Icon, title, text }) => (
                    <label
                      key={id}
                      className={`flex cursor-pointer flex-col gap-1 rounded-2xl border-2 p-3 transition focus-within:ring-2 focus-within:ring-blue/40 ${openMode === id ? 'border-blue bg-blue-soft' : 'border-line bg-white hover:border-blue/40'}`}
                    >
                      <input type="radio" name="open" value={id} checked={openMode === id} onChange={() => setOpenModeState(id)} className="sr-only" />
                      <Icon className={`size-5 ${openMode === id ? 'text-blue' : 'text-muted'}`} aria-hidden />
                      <span className="text-sm font-extrabold leading-tight">{title}</span>
                      <span className="text-xs text-muted">{text}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {error && (
              <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2.5 text-sm font-semibold text-bad">
                {error}
              </p>
            )}
            <Button type="submit" size="lg" full loading={busy}>
              {mode === 'new' ? 'Create my team' : openMode === 'preview' ? 'Open my slides' : 'Open my team'}
            </Button>
            <p className="text-center text-xs text-muted">
              {mode === 'new' ? 'Share the PIN only with whoever prepares your slides.' : 'Forgot your PIN? Ask your region head to reset it.'}
            </p>
          </form>
        </Card>
        <p className="text-center text-sm text-muted md:col-start-2">
          Region head?{' '}
          <Link to="/region" className="font-extrabold text-blue underline">
            Open the region dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
