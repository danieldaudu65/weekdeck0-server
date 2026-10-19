export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';
export const DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
export const DAY_SHORT: Record<DayKey, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri' };
export const DAY_LONG: Record<DayKey, string> = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday' };

export interface Member {
  id: string;
  name: string;
  lead: boolean;
}

/** Everything that appears on the slides apart from the week's figures. */
export interface TeamProfile {
  deckTitle: string;
  managerName: string;
  managerTag: string;
  managerRole: string;
  teamTitle: string;
  region: string;
  activitiesTitle: string;
  templateId: string;
  members: Member[];
  /** Optional cover photo (small data URL), e.g. taken from their old cover slide. */
  coverImage: string;
}

export interface Team extends TeamProfile {
  id: string;
  name: string;
  /** The region this team joined with the region head's code, if any. */
  joinedRegion?: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface WeekRow {
  memberId: string;
  mon: number | null;
  tue: number | null;
  wed: number | null;
  thu: number | null;
  fri: number | null;
  /** Number of new clients that week. */
  nc: number | null;
  /** A week total with no daily breakdown (from an imported monthly table). Added to the days. */
  weekTotal?: number | null;
}

export type Activities = Record<DayKey, string>;

export interface Week {
  weekStart: string; // Monday, YYYY-MM-DD
  rows: WeekRow[];
  activities: Activities;
  /** The week summary shown on the "Week at a glance" slide. */
  note: string;
  /** Places picked from the map search (exact pins for the map). */
  places?: WeekPlace[];
  updatedAt?: string;
}

export interface WeekPlace {
  day: DayKey;
  name: string;
  lat: number;
  lon: number;
}

export const emptyActivities = (): Activities => ({ mon: '', tue: '', wed: '', thu: '', fri: '' });

export function newMemberId(): string {
  const rand = typeof crypto !== 'undefined' && 'getRandomValues' in crypto
    ? Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 36).toString(36)).join('')
    : Math.random().toString(36).slice(2, 8);
  return `m_${rand}${Date.now().toString(36).slice(-3)}`;
}
