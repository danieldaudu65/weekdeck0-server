import { useCallback, useEffect, useRef, useState } from 'react';
import { api, put, ApiError } from './api';
import { DAYS, emptyActivities, type Activities, type Member, type Week, type WeekPlace, type WeekRow } from './types';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const emptyRow = (memberId: string): WeekRow => ({ memberId, mon: null, tue: null, wed: null, thu: null, fri: null, nc: null });

/** Rows in team order, one per current member (missing ones are empty). */
export function rowsFor(members: Member[], rows: WeekRow[]): WeekRow[] {
  const byId = new Map(rows.map((r) => [r.memberId, r]));
  return members.map((m) => byId.get(m.id) ?? emptyRow(m.id));
}

/**
 * Loads one week, keeps it in sync with the server, and autosaves edits
 * (once you stop typing for a moment). A new week starts with last week's
 * activities so only changes need typing.
 */
export function useWeek(weekStart: string, members: Member[]) {
  const [week, setWeek] = useState<Week | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copiedFrom, setCopiedFrom] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const pending = useRef<Week | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const memberKey = members.map((m) => m.id).join(',');

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const w = pending.current;
    if (!w) return;
    pending.current = null;
    setSaveState('saving');
    try {
      await put(`/api/weeks/${w.weekStart}`, { rows: w.rows, activities: w.activities, note: w.note, places: w.places ?? [] });
      setSaveState(pending.current ? 'saving' : 'saved');
    } catch (err) {
      pending.current = pending.current ?? w; // keep it for "Try again"
      setSaveState('error');
      if (!(err instanceof ApiError)) throw err;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError(null);
    setCopiedFrom(null);
    setSaveState('idle');
    (async () => {
      try {
        const r = await api<{ week: Week | null }>(`/api/weeks/${weekStart}`);
        let w: Week;
        if (r.week) {
          w = { ...r.week, places: r.week.places ?? [], rows: rowsFor(members, r.week.rows) };
        } else {
          let activities: Activities = emptyActivities();
          let places: WeekPlace[] = [];
          const prev = await api<{ week: Week | null }>(`/api/weeks/latest?before=${weekStart}`).catch(() => ({ week: null }));
          if (prev.week && DAYS.some((d) => prev.week!.activities[d])) {
            activities = { ...prev.week.activities };
            places = prev.week.places ?? []; // the copied plans keep their map pins
            if (alive) setCopiedFrom(prev.week.weekStart);
          }
          w = { weekStart, rows: rowsFor(members, []), activities, note: '', places };
        }
        if (alive) setWeek(w);
      } catch (err) {
        if (alive) setLoadError(err instanceof ApiError ? err.message : 'This week didn’t load.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      void flush(); // save anything typed before switching weeks
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, memberKey, flush]);

  const update = useCallback(
    (fn: (w: Week) => Week) => {
      setWeek((cur) => {
        if (!cur) return cur;
        const next = fn(cur);
        pending.current = next;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void flush(), 900);
        setSaveState('saving');
        return next;
      });
    },
    [flush],
  );

  // Save before the tab closes or the phone hides the app.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [flush]);

  return { week, loading, loadError, copiedFrom, saveState, update, retry: flush };
}
