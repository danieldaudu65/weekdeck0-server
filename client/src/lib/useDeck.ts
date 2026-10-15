import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from './api';
import { buildDeck, type DeckSlide } from './deck';
import { layoutSlide } from './looks';
import { lookById, type Look } from './templates';
import { rowsFor } from './useWeek';
import { emptyActivities, type Team, type Week } from './types';
import { addWeeks, mondaysInMonth, monthOf, weekNumberInMonth } from './weeks';

/** Loads what a deck needs (the week, the rest of its month, last week) and lays the slides out. */
export function useDeck(team: Team, weekStart: string, includeSummary: boolean, lookIdOverride?: string) {
  const [data, setData] = useState<{ weekStart: string; week: Week; monthWeeks: Week[]; previous: Week | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only a different week or a different member list needs fresh figures.
  // Saving the chosen look (or any other team detail) must NOT reload the slides.
  const memberKey = team.members.map((m) => m.id).join(',');
  const membersRef = useRef(team.members);
  membersRef.current = team.members;

  useEffect(() => {
    let alive = true;
    setError(null);
    const mondays = mondaysInMonth(monthOf(weekStart));
    Promise.all([
      api<{ week: Week | null }>(`/api/weeks/${weekStart}`),
      api<{ weeks: Week[] }>(`/api/weeks?from=${mondays[0]}&to=${mondays[mondays.length - 1]}`),
      api<{ week: Week | null }>(`/api/weeks/${addWeeks(weekStart, -1)}`),
    ])
      .then(([w, m, p]) => {
        if (!alive) return;
        const week = w.week ?? { weekStart, rows: [], activities: emptyActivities(), note: '' };
        setData({ weekStart, week: { ...week, rows: rowsFor(membersRef.current, week.rows) }, monthWeeks: m.weeks, previous: p.week });
      })
      .catch((err) => alive && setError(err instanceof ApiError ? err.message : 'Your slides didn’t load.'));
    return () => {
      alive = false;
    };
  }, [memberKey, weekStart]);
  // Show a spinner only when switching to another week, never while refreshing the same one.
  const current = data && data.weekStart === weekStart ? data : null;

  const wanted = lookIdOverride ?? team.templateId;
  const look: Look = useMemo(() => lookById(wanted), [wanted]);
  const slides: DeckSlide[] = useMemo(
    () => (current ? buildDeck({ team, week: current.week, monthWeeks: current.monthWeeks, previousWeek: current.previous, includeSummary }) : []),
    [current, team, includeSummary],
  );
  const laid = useMemo(() => slides.map((s, i) => layoutSlide(s, look, { teamName: team.name, page: i + 1, total: slides.length })), [slides, look, team.name]);
  const empty = Boolean(current && !current.week.rows.some((r) => r.mon || r.tue || r.wed || r.thu || r.fri || r.nc));

  const fileName = `${team.name} - Week ${weekNumberInMonth(weekStart)} ${weekStart}`.replace(/[^\w .-]+/g, '').trim();
  return { loading: !current && !error, error, slides, laid, look, data: current, empty, fileName, title: team.deckTitle || 'Weekly report' };
}
