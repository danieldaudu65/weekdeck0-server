/**
 * One month's workbook in the browser: every row of the three sheets, edits
 * saved by themselves a moment after typing stops (like Google Sheets), and
 * new rows given their real id when the server has them.
 *
 * Each row keeps a local key (`tmp`) for its whole life on this page, so a row
 * typed into while it is being saved for the first time isn't lost.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api';
import { accApi, type Accountant } from './api';
import { newTmpId, type Payment } from './columns';

export type SaveState = 'saved' | 'pending' | 'saving' | 'error';

const localKey = (p: Payment) => p.tmp ?? p.id ?? '';

export function useLedger(month: string, onTabs: (tabs: Accountant['tabs']) => void) {
  const [rows, setRows] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<SaveState>('saved');
  const rowsRef = useRef<Payment[]>([]);
  const dirty = useRef(new Set<string>());
  const deletes = useRef(new Set<string>());
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef<Promise<void> | null>(null);
  const monthRef = useRef(month);
  const onTabsRef = useRef(onTabs);
  onTabsRef.current = onTabs;

  const put = (next: Payment[]) => {
    rowsRef.current = next;
    setRows(next);
  };

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    if (!dirty.current.size && !deletes.current.size) return;
    const forMonth = monthRef.current;
    const keys = [...dirty.current];
    const dels = [...deletes.current];
    dirty.current.clear();
    deletes.current.clear();
    const byKey = new Map(rowsRef.current.map((p) => [localKey(p), p]));
    const upserts = keys.map((k) => byKey.get(k)).filter((p): p is Payment => Boolean(p));
    setState('saving');
    const run = (async () => {
      try {
        for (let i = 0; i < Math.max(upserts.length, dels.length); i += 400) {
          const part = upserts.slice(i, i + 400);
          const r = await accApi.save(forMonth, part, dels.slice(i, i + 400));
          if (monthRef.current !== forMonth) continue;
          // Give new rows their real id (keeping anything typed into them meanwhile).
          const ids = new Map(r.created.map((c) => [c.tmp, c.payment.id]));
          if (ids.size) put(rowsRef.current.map((p) => (p.tmp && ids.has(p.tmp) && !p.id ? { ...p, id: ids.get(p.tmp) } : p)));
          onTabsRef.current(r.tabs);
        }
        setState(dirty.current.size ? 'pending' : 'saved');
        setError(null);
      } catch (err) {
        // Put them back so the next save tries again.
        keys.forEach((k) => dirty.current.add(k));
        dels.forEach((d) => deletes.current.add(d));
        setState('error');
        setError(err instanceof ApiError ? err.message : 'Couldn’t save. Check your connection.');
      }
    })();
    inFlight.current = run;
    await run;
    inFlight.current = null;
  }, []);

  const schedule = useCallback(() => {
    setState('pending');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 700);
  }, [flush]);

  // Load the month (after saving anything left from the month before).
  useEffect(() => {
    let alive = true;
    (async () => {
      await flush();
      monthRef.current = month;
      setLoading(true);
      setError(null);
      try {
        const r = await accApi.payments(month);
        if (!alive) return;
        put(r.payments.map((p) => ({ ...p, tmp: p.id ?? newTmpId() })));
      } catch (err) {
        if (alive) setError(err instanceof ApiError ? err.message : 'The workbook didn’t load.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [month, flush]);

  // Don't lose edits when the page closes.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current.size || deletes.current.size || inFlight.current) {
        void flush();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [flush]);

  /** Change rows (by local key) and/or add new ones; everything changed is saved shortly. */
  const update = useCallback(
    (changed: Payment[]) => {
      if (!changed.length) return;
      const map = new Map(rowsRef.current.map((p) => [localKey(p), p]));
      for (const p of changed) {
        const withKey = p.tmp ? p : { ...p, tmp: p.id ?? newTmpId() };
        map.set(localKey(withKey), withKey);
        dirty.current.add(localKey(withKey));
      }
      put([...map.values()]);
      schedule();
    },
    [schedule],
  );

  const remove = useCallback(
    (gone: Payment[]) => {
      if (!gone.length) return;
      const keys = new Set(gone.map(localKey));
      for (const p of gone) {
        dirty.current.delete(localKey(p));
        if (p.id) deletes.current.add(p.id);
      }
      put(rowsRef.current.filter((p) => !keys.has(localKey(p))));
      schedule();
    },
    [schedule],
  );

  /** Reload from the server (after an import saved rows directly). */
  const reload = useCallback(async () => {
    await flush();
    const r = await accApi.payments(monthRef.current);
    put(r.payments.map((p) => ({ ...p, tmp: p.id ?? newTmpId() })));
  }, [flush]);

  return { rows, loading, error, state, update, remove, flush, reload };
}

export type Ledger = ReturnType<typeof useLedger>;
