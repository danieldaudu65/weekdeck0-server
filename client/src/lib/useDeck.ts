import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { buildDeck, type DeckSlide } from './deck';
import { layoutSlide } from './looks';
import { lookById, type Look } from './templates';
import { rowsFor } from './useWeek';
import { useWeekStops } from './stops';
import { renderStaticMap } from './staticMap';
import { DAY_COLORS } from './route';
import { DAYS, DAY_LONG, emptyActivities, type Team, type Week } from './types';
import { addWeeks, mondaysInMonth, monthOf, weekNumberInMonth } from './weeks';

export interface DeckOptions {
  weekStart: string;
  includeSummary: boolean;
  /** Add the "Where we're going" map slide when the week has places. */
  includeMap?: boolean;
  /** Preview another look without saving it. */
  lookId?: string;
  /** The team's own deck (logged-in team) ... */
  team?: Team | null;
  /** ... or, for a region head, any team in the region (read-only). */
  remote?: { teamId: string; token: string } | null;
}

interface Loaded {
  key: string;
  team: Team;
  week: Week;
  monthWeeks: Week[];
  previous: Week | null;
}

/** Loads what a deck needs (the week, the rest of its month, last week, the map) and lays the slides out. */
export function useDeck(opts: DeckOptions) {
  const { weekStart, includeSummary, includeMap = true, remote } = opts;
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only a different week or member list needs fresh figures. Saving the chosen
  // look (or any other team detail) must NOT reload the slides.
  const localTeam = opts.team ?? null;
  const memberKey = localTeam ? localTeam.members.map((m) => m.id).join(',') : '';
  const teamRef = useRef(localTeam);
  teamRef.current = localTeam;
  const sourceKey = remote ? `r:${remote.teamId}` : `t:${memberKey}:${localTeam?.weekStyle ?? 'monday'}`;

  useEffect(() => {
    let alive = true;
    setError(null);
    const key = `${sourceKey}|${weekStart}`;
    const done = (team: Team, w: Week | null, monthWeeks: Week[], previous: Week | null) => {
      if (!alive) return;
      const week = w ?? { weekStart, rows: [], activities: emptyActivities(), note: '', places: [] };
      setData({ key, team, week: { ...week, rows: rowsFor(team.members, week.rows) }, monthWeeks, previous });
    };
    const fail = (err: unknown) => alive && setError(err instanceof ApiError ? err.message : 'The slides didn’t load.');
    if (remote) {
      api<{ team: Team; week: Week | null; monthWeeks: Week[]; previous: Week | null }>(`/api/region/teams/${remote.teamId}/deck?week=${weekStart}`, {
        headers: { Authorization: `Bearer ${remote.token}` },
      })
        .then((r) => done(r.team, r.week, r.monthWeeks, r.previous))
        .catch(fail);
    } else if (teamRef.current) {
      const style = teamRef.current.weekStyle ?? 'monday';
      const mondays = mondaysInMonth(monthOf(weekStart, style), style);
      Promise.all([
        api<{ week: Week | null }>(`/api/weeks/${weekStart}`),
        api<{ weeks: Week[] }>(`/api/weeks?from=${mondays[0]}&to=${mondays[mondays.length - 1]}`),
        api<{ week: Week | null }>(`/api/weeks/${addWeeks(weekStart, -1)}`),
      ])
        .then(([w, m, p]) => done(teamRef.current!, w.week, m.weeks, p.week))
        .catch(fail);
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, weekStart]);

  // Show a spinner only when switching to another week, never while refreshing the same one.
  const current = data && data.key === `${sourceKey}|${weekStart}` ? data : null;
  // The logged-in team's latest details (title, look, photo) win over what was loaded.
  const team: Team | null = remote ? (current?.team ?? null) : localTeam;

  // Map slide: the week's stops drawn as a picture.
  const { stops, loading: stopsLoading } = useWeekStops(includeMap && current ? current.week : null, team?.region ?? '', remote?.token);
  const [mapImage, setMapImage] = useState<{ key: string; image: string | null } | null>(null);
  const stopsKey = JSON.stringify(stops.map((s) => [s.day, s.lat, s.lon]));
  useEffect(() => {
    if (!includeMap || !stops.length) return;
    let alive = true;
    renderStaticMap(stops, { auth: remote?.token })
      .then((image) => alive && setMapImage({ key: stopsKey, image }))
      .catch(() => alive && setMapImage({ key: stopsKey, image: null }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopsKey, includeMap]);
  const map = useMemo(() => {
    if (!includeMap || !stops.length || !mapImage?.image || mapImage.key !== stopsKey) return null;
    return {
      image: mapImage.image,
      days: DAYS.map((d) => ({ day: DAY_LONG[d], color: DAY_COLORS[d], stops: stops.filter((s) => s.day === d).map((s) => s.name) })),
    };
  }, [includeMap, stops, mapImage, stopsKey]);
  const mapPending = includeMap && Boolean(current) && (stopsLoading || (stops.length > 0 && mapImage?.key !== stopsKey));

  const wanted = opts.lookId ?? team?.templateId;
  const look: Look = useMemo(() => lookById(wanted), [wanted]);
  const slides: DeckSlide[] = useMemo(
    () => (current && team ? buildDeck({ team, week: current.week, monthWeeks: current.monthWeeks, previousWeek: current.previous, includeSummary, map }) : []),
    [current, team, includeSummary, map],
  );
  const teamName = team?.name ?? '';
  const laid = useMemo(() => slides.map((s, i) => layoutSlide(s, look, { teamName, page: i + 1, total: slides.length })), [slides, look, teamName]);
  const empty = Boolean(current && !current.week.rows.some((r) => r.mon || r.tue || r.wed || r.thu || r.fri || r.nc || r.weekTotal));

  const fileName = `${teamName} - Week ${weekNumberInMonth(weekStart, team?.weekStyle ?? 'monday')} ${weekStart}`.replace(/[^\w .-]+/g, '').trim();
  return {
    loading: !current && !error,
    error,
    team,
    slides,
    laid,
    look,
    data: current,
    empty,
    fileName,
    title: team?.deckTitle || 'Weekly report',
    hasPlaces: stops.length > 0,
    mapPending,
  };
}
