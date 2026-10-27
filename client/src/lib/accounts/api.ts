/** The accountant's login and calls (kept apart from a team or region login on the same device). */
import { api, ApiError } from '../api';
import type { Payment } from './columns';
import type { DeckPrefs, HistoryRow, Marketer, SummaryCell } from './accDeck';

const KEY = 'weekdeck.accountsToken';

export interface Accountant {
  id: string;
  name: string;
  email: string;
  region: string;
  tabs: { name: string; branch: string }[];
  deck: DeckPrefs;
  history: HistoryRow[];
  createdAt: string;
}

export interface WeekDeckTeam {
  id: string;
  name: string;
  title: string;
  region: string;
  manager: string;
  members: { name: string; lead: boolean }[];
}

export function getAccToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setAccToken(token: string | null) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the login lasts until the tab closes */
  }
}

/** Fired when the server no longer accepts the accountant's login. */
export const ACC_SIGNED_OUT = 'weekdeck:accounts-signed-out';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  else headers.set('X-Own-Auth', '1'); // never send (or sign out) the team's login from here
  try {
    return await api<T>(`/api/accounts${path}`, { ...init, headers });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && token && !path.startsWith('/login')) {
      setAccToken(null);
      window.dispatchEvent(new Event(ACC_SIGNED_OUT));
    }
    throw err;
  }
}

const send = <T,>(method: string, path: string, body: unknown) => call<T>(path, { method, body: JSON.stringify(body) });

export const accApi = {
  register: (b: { name: string; email: string; password: string; region: string }) => send<{ token: string; accountant: Accountant }>('POST', '/register', b),
  login: (b: { email: string; password: string }) => send<{ token: string; accountant: Accountant }>('POST', '/login', b),
  me: () => call<{ accountant: Accountant }>('/me'),
  saveMe: (b: Partial<Pick<Accountant, 'name' | 'region' | 'tabs' | 'deck' | 'history'>>) => send<{ accountant: Accountant }>('PUT', '/me', b),
  password: (currentPassword: string, newPassword: string) => send<{ token: string }>('POST', '/password', { currentPassword, newPassword }),
  payments: (month: string) => call<{ month: string; payments: Payment[] }>(`/payments?month=${month}`),
  months: () => call<{ months: { month: string; rows: number }[] }>('/months'),
  save: (month: string, upserts: Payment[], deletes: string[]) =>
    send<{ created: { tmp: string; payment: Payment }[]; updated: Payment[]; deleted: string[]; tabs: Accountant['tabs'] }>('POST', '/payments/save', { month, upserts, deletes }),
  summary: (year: string) => call<{ year: string; cells: SummaryCell[] }>(`/summary?year=${year}`),
  marketers: () => call<{ marketers: Marketer[] }>('/marketers'),
  saveMarketers: (upserts: Partial<Marketer>[], deletes: string[] = []) => send<{ marketers: Marketer[] }>('POST', '/marketers/save', { upserts, deletes }),
  merge: (from: string[], into: string) => send<{ moved: number; marketers: Marketer[] }>('POST', '/marketers/merge', { from, into }),
  teams: (q = '') => call<{ teams: WeekDeckTeam[] }>(`/teams?q=${encodeURIComponent(q)}`),
};

/** Splits a big save into pieces the server accepts (1,000 rows a call). */
export async function saveInChunks(month: string, rows: Payment[], onProgress?: (done: number) => void) {
  const out: Awaited<ReturnType<typeof accApi.save>>[] = [];
  for (let i = 0; i < rows.length; i += 400) {
    out.push(await accApi.save(month, rows.slice(i, i + 400), []));
    onProgress?.(Math.min(rows.length, i + 400));
  }
  return out;
}
