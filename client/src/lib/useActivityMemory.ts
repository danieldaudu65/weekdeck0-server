import { useEffect, useState } from 'react';
import { api } from './api';
import { buildMemory, type HistoryWeek, type Memory } from './suggest';

const EMPTY: Memory = { phrases: [], types: [], places: [], weeks: 0 };

/** The team's activity memory (everything but the week being edited). Reloaded when the week changes. */
export function useActivityMemory(weekStart: string) {
  const [memory, setMemory] = useState<Memory>(EMPTY);
  const [aiOn, setAiOn] = useState(false);
  const [eventsOn, setEventsOn] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ history: HistoryWeek[] }>('/api/weeks/history')
      .then((r) => alive && setMemory(buildMemory(r.history.filter((w) => w.weekStart !== weekStart))))
      .catch(() => undefined); // suggestions are a bonus; the page works without them
    return () => {
      alive = false;
    };
  }, [weekStart]);

  useEffect(() => {
    api<{ ai?: boolean; events?: boolean }>('/api/health')
      .then((r) => {
        setAiOn(Boolean(r.ai));
        setEventsOn(Boolean(r.events));
      })
      .catch(() => undefined);
  }, []);

  return { memory, aiOn, eventsOn };
}
