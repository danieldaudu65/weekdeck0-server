import { NavLink, Outlet } from 'react-router';
import { CalendarDays, Play, Presentation, Users } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Logo } from './ui';

const tabs = [
  { to: '/', label: 'This week', icon: CalendarDays },
  { to: '/slides', label: 'Slides', icon: Presentation },
  { to: '/team', label: 'Team', icon: Users },
  { to: '/preview', label: 'Preview', icon: Play },
];

/** App frame: top bar (with tabs on desktop), bottom tabs on phones. */
export function Shell() {
  const { team } = useAuth();
  return (
    <div className="min-h-dvh">
      <header className="no-print safe-top sticky top-0 z-30 border-b border-line bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <Logo size={34} />
          <nav className="hidden items-center gap-1 rounded-2xl bg-white p-1 shadow-sm md:flex" aria-label="Main">
            {tabs.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => `flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold transition ${isActive ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
              >
                <Icon className="size-4" aria-hidden /> {label}
              </NavLink>
            ))}
          </nav>
          <span className="max-w-[45%] truncate rounded-full bg-white px-3 py-1.5 text-sm font-bold shadow-sm">{team?.name}</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-32 pt-6 md:pb-16">
        <Outlet />
      </main>
      <nav className="no-print safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur md:hidden" aria-label="Main">
        <div className="grid grid-cols-4">
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex h-16 flex-col items-center justify-center gap-1 text-xs font-bold ${isActive ? 'text-blue' : 'text-muted'}`}>
              <Icon className="size-6" aria-hidden />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
