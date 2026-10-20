import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, post, put, setToken, SIGNED_OUT_EVENT } from './api';
import type { Team, TeamProfile } from './types';
import { setWeekStyle } from './weeks';

interface AuthValue {
  team: Team | null;
  loading: boolean;
  login: (teamName: string, pin: string) => Promise<void>;
  register: (teamName: string, pin: string) => Promise<void>;
  logout: () => void;
  saveTeam: (profile: TeamProfile & { name?: string }) => Promise<Team>;
  /** Replace the team after another call changed it (e.g. joining a region). */
  setTeam: (team: Team) => void;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  // Every page counts weeks the way this team does (set during render so it's ready before any page uses it).
  setWeekStyle(team?.weekStyle);

  // Restore the session on open (the token stays on the phone, so the PIN is typed rarely).
  useEffect(() => {
    if (!getToken()) return;
    api<{ team: Team }>('/api/team')
      .then((r) => setTeam(r.team))
      .catch(() => setTeam(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onOut = () => setTeam(null);
    window.addEventListener(SIGNED_OUT_EVENT, onOut);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onOut);
  }, []);

  const login = useCallback(async (teamName: string, pin: string) => {
    const r = await post<{ token: string; team: Team }>('/api/auth/login', { teamName, pin });
    setToken(r.token);
    setTeam(r.team);
  }, []);

  const register = useCallback(async (teamName: string, pin: string) => {
    const r = await post<{ token: string; team: Team }>('/api/auth/register', { teamName, pin });
    setToken(r.token);
    setTeam(r.team);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setTeam(null);
  }, []);

  const saveTeam = useCallback(async (profile: TeamProfile & { name?: string }) => {
    const r = await put<{ team: Team }>('/api/team', profile);
    setTeam(r.team);
    return r.team;
  }, []);

  const value = useMemo(() => ({ team, loading, login, register, logout, saveTeam, setTeam }), [team, loading, login, register, logout, saveTeam]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
