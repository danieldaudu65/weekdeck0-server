import { api, apiUrl, getToken, ApiError } from './api';
import { shrinkImage } from './importPptx';

export interface Photo {
  id: number;
  thumb: string;
  full: string;
  alt: string;
  color: string;
  photographer: string;
  photographerUrl: string;
  pageUrl: string;
}

/** Ready-made searches for real-estate covers. */
export const PHOTO_TOPICS: { label: string; query: string }[] = [
  { label: 'Land', query: 'empty land plot' },
  { label: 'Estates', query: 'housing estate aerial' },
  { label: 'Luxury homes', query: 'luxury modern house exterior' },
  { label: 'Lagos', query: 'Lagos Nigeria city' },
  { label: 'City skyline', query: 'city skyline sunset' },
  { label: 'Construction', query: 'building construction site' },
  { label: 'Keys & deals', query: 'house keys handshake real estate' },
  { label: 'Green fields', query: 'green field farmland aerial' },
];

export const searchPhotos = (q: string, page = 1) => api<{ photos: Photo[]; hasMore: boolean; source: 'pixabay' | 'pexels' }>(`/api/photos/search?q=${encodeURIComponent(q)}&page=${page}`);

/** Downloads the chosen photo through our server and shrinks it for the cover (≤1000px JPEG). */
export async function photoAsCover(p: Photo): Promise<string> {
  let res: Response;
  try {
    res = await fetch(apiUrl(`/api/photos/file?url=${encodeURIComponent(p.full)}`), { headers: { Authorization: `Bearer ${getToken() ?? ''}` } });
  } catch {
    throw new ApiError(0, "Can't reach WeekDeck. Check your internet connection.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error?.message ?? 'Couldn’t download that picture. Try another.');
  }
  return shrinkImage(await res.blob(), 1000);
}
