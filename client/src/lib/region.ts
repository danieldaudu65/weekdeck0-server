/** The region head's login (kept apart from a team login on the same device). */
import { api, post } from './api';

const KEY = 'weekdeck.regionToken';

export interface Region {
  id: string;
  name: string;
  joinCode: string;
}

export interface RegionTeam {
  id: string;
  name: string;
  title: string;
  manager: string;
  members: number;
  total: number;
  nc: number;
  prevTotal: number | null;
  monthTotal: number;
  top: { name: string; total: number } | null;
  submitted: boolean;
  updatedAt: string | null;
}

export interface Dashboard {
  region: Region;
  weekStart: string;
  totals: { week: number; nc: number; month: number; prevWeek: number; teams: number; submitted: number };
  teams: RegionTeam[];
  people: { name: string; team: string; total: number; nc: number }[];
}

export function getRegionToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function setRegionToken(t: string | null) {
  try {
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export const regionLogin = (mode: 'login' | 'register', regionName: string, pin: string) =>
  post<{ token: string; region: Region }>(`/api/region/${mode}`, { regionName, pin });
export const loadDashboard = (token: string, week: string) => api<Dashboard>(`/api/region/dashboard?week=${week}`, auth(token));
export const newJoinCode = (token: string) => api<{ region: Region }>('/api/region/code', { method: 'POST', ...auth(token) });
export const removeTeam = (token: string, id: string) => api<null>(`/api/region/teams/${id}`, { method: 'DELETE', ...auth(token) });
