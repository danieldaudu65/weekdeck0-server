import { api } from '../api';
import type { RestyleSlide } from './read';

export type Transition = 'cube' | 'flip' | 'zoom' | 'slide';

export interface DeckSummary {
  id: string;
  title: string;
  lookId: string;
  count: number;
  thumb: string;
  /** The first shown slide, its pictures left out (draw it with `thumb`). */
  first: import('../deck').DeckSlide | null;
  shareId: string | null;
  updatedAt: string;
}

export interface RestyleDeck extends DeckSummary {
  transition: Transition;
  sourceName: string;
  slides: RestyleSlide[];
}

export interface DeckBody {
  title: string;
  lookId: string;
  transition: Transition;
  sourceName: string;
  slides: RestyleSlide[];
  thumb: string;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const decksApi = {
  list: () => api<{ decks: DeckSummary[] }>('/api/decks'),
  get: (id: string) => api<{ deck: RestyleDeck }>(`/api/decks/${id}`),
  create: (body: DeckBody) => api<{ deck: RestyleDeck }>('/api/decks', json('POST', body)),
  save: (id: string, body: DeckBody) => api<{ deck: DeckSummary }>(`/api/decks/${id}`, json('PUT', body)),
  remove: (id: string) => api<{ ok: true }>(`/api/decks/${id}`, { method: 'DELETE' }),
  share: (id: string, on: boolean) => api<{ shareId: string | null }>(`/api/decks/${id}/share`, json('POST', { on })),
  /** Anyone with the link; no login. */
  shared: (shareId: string) => api<{ deck: { title: string; lookId: string; transition: Transition; slides: RestyleSlide[] } }>(`/api/shared/${encodeURIComponent(shareId)}`, { headers: { 'X-Own-Auth': '1' } }),
};
