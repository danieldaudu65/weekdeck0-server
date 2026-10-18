const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const TOKEN_KEY = 'weekdeck.token';

/** Full address of an API path (for downloads that aren't JSON). */
export const apiUrl = (path: string) => `${BASE}${path}`;

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: the session lasts until the tab closes */
  }
}

/** Fired when the server says the login is no longer valid (PIN changed, token expired). */
export const SIGNED_OUT_EVENT = 'weekdeck:signed-out';

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  // A caller may bring its own login (the region head's); otherwise the team's is used.
  const ownAuth = headers.has('Authorization');
  const token = ownAuth ? null : getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Can't reach WeekDeck. Check your internet connection.");
  }
  if (res.status === 204) return null as T;
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
    }
    const message = (data && typeof data.error?.message === 'string' && data.error.message) || (isJson ? 'Something went wrong.' : "WeekDeck's server isn't reachable right now.");
    throw new ApiError(res.status, message);
  }
  if (!isJson) throw new ApiError(res.status, "WeekDeck's server isn't reachable right now.");
  return data as T;
}

export const put = <T,>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const post = <T,>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });
